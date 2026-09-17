import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { inicioDelDiaEnCaracas, finDelDiaEnCaracas } from '@/lib/tiempo'

// Misma ventana de solapamiento que app/api/jugador/crear-reto,
// app/api/jugador/reagendar-reto y app/api/jugador/responder-reto.
const DURACION_PARTIDO_MS = 90 * 60 * 1000

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { retoId, nuevaFechaPropuesta, nuevaCancha, nuevoNombreCanchaForanea } = await request.json()
    if (!retoId || !nuevaFechaPropuesta) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retador_id, retado_id, estado, temporada_id, fecha_propuesta, cancha, nombre_cancha_foranea, escalera_express')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })
    if (!['pendiente', 'aceptado'].includes(reto.estado)) {
      return NextResponse.json({ error: 'Este reto no está activo, no se puede reagendar.' }, { status: 400 })
    }
    // Los retos de Escalera Express usan horario y cancha fijos del evento
    // (12 cupos horario×cancha, ver lib/escaleraExpress.ts) — moverlos de ese
    // slot rompería el conteo de cupos, que asume esos instantes exactos.
    if (reto.escalera_express) {
      return NextResponse.json({
        error: 'Este reto es de Escalera Express — tiene horario y cancha fijos del evento y no se puede reagendar desde aquí.',
      }, { status: 400 })
    }

    const canchaFinal = nuevaCancha || reto.cancha
    if (!['HGV1', 'HGV2', 'FORANEA'].includes(canchaFinal)) {
      return NextResponse.json({ error: 'Cancha inválida' }, { status: 400 })
    }
    const nombreCanchaForaneaFinal = canchaFinal === 'FORANEA'
      ? String(nuevaCancha ? (nuevoNombreCanchaForanea || '') : (reto.nombre_cancha_foranea || '')).trim()
      : null
    if (canchaFinal === 'FORANEA' && !nombreCanchaForaneaFinal) {
      return NextResponse.json({ error: 'Falta el nombre de la cancha foránea' }, { status: 400 })
    }

    const nuevaHoraMs = new Date(nuevaFechaPropuesta).getTime()
    if (isNaN(nuevaHoraMs)) {
      return NextResponse.json({ error: 'Fecha/hora inválida' }, { status: 400 })
    }

    // FORANEA no es cancha del club, no hay nada contra qué chocar.
    if (canchaFinal !== 'FORANEA') {
      const inicioDia = inicioDelDiaEnCaracas(new Date(nuevaHoraMs))
      const finDia = finDelDiaEnCaracas(new Date(nuevaHoraMs))

      const { data: partidosCancha } = await db
        .from('retos')
        .select('id, fecha_propuesta, retador:retador_id(nombre), retado:retado_id(nombre)')
        .eq('temporada_id', reto.temporada_id)
        .eq('cancha', canchaFinal)
        .in('estado', ['pendiente', 'aceptado'])
        .neq('id', retoId)
        .gte('fecha_propuesta', inicioDia.toISOString())
        .lte('fecha_propuesta', finDia.toISOString())

      const conflictoReto = (partidosCancha || []).find((r: any) =>
        Math.abs(new Date(r.fecha_propuesta).getTime() - nuevaHoraMs) < DURACION_PARTIDO_MS
      ) as any
      if (conflictoReto) {
        const vs = `${conflictoReto.retador?.nombre || '?'} vs ${conflictoReto.retado?.nombre || '?'}`
        return NextResponse.json({
          error: `Esa cancha ya tiene otro partido cerca de esa hora (${vs}). Elige otro horario.`,
        }, { status: 409 })
      }

      const { data: reservasCancha } = await db
        .from('reservas_cancha')
        .select('id, fecha_hora, duracion_min, jugador:jugador_id(nombre)')
        .eq('cancha', canchaFinal)
        .in('estado', ['activa', 'usada'])
        .gte('fecha_hora', inicioDia.toISOString())
        .lte('fecha_hora', finDia.toISOString())

      const finNuevo = nuevaHoraMs + DURACION_PARTIDO_MS
      const conflictoReserva = (reservasCancha || []).find((r: any) => {
        const inicioReserva = new Date(r.fecha_hora).getTime()
        const finReserva = inicioReserva + (r.duracion_min || 60) * 60 * 1000
        return nuevaHoraMs < finReserva && inicioReserva < finNuevo
      }) as any
      if (conflictoReserva) {
        return NextResponse.json({
          error: `Esa cancha ya tiene una reserva casual cerca de esa hora (${conflictoReserva.jugador?.nombre || '?'}). Elige otro horario.`,
        }, { status: 409 })
      }
    }

    const fechaAnterior = reto.fecha_propuesta
    const canchaAnterior = reto.cancha

    const { error: errUpdate } = await db
      .from('retos')
      .update({
        fecha_propuesta: new Date(nuevaHoraMs).toISOString(),
        cancha: canchaFinal,
        nombre_cancha_foranea: nombreCanchaForaneaFinal,
      })
      .eq('id', retoId)
    if (errUpdate) throw errUpdate

    // No dejamos que un fallo al guardar el historial o notificar tumbe el
    // reagendamiento, que ya quedó guardado.
    const { error: errHistorial } = await db.from('retos_historial_reagendado').insert([{
      reto_id: retoId,
      fecha_anterior: fechaAnterior,
      fecha_nueva: new Date(nuevaHoraMs).toISOString(),
      cancha_anterior: canchaAnterior,
      cancha_nueva: canchaFinal,
      admin_id: session.id,
    }])
    if (errHistorial) console.error('[reagendar-reto] Error al guardar historial:', errHistorial)

    const { error: errNotif } = await db.from('notificaciones').insert([
      {
        jugador_id: reto.retador_id,
        tipo: 'reto_reagendado_admin',
        reto_id: retoId,
        mensaje: 'Un administrador reagendó tu partido. Revisa la nueva fecha y hora.',
      },
      {
        jugador_id: reto.retado_id,
        tipo: 'reto_reagendado_admin',
        reto_id: retoId,
        mensaje: 'Un administrador reagendó tu partido. Revisa la nueva fecha y hora.',
      },
    ])
    if (errNotif) console.error('[reagendar-reto] Error al crear notificaciones:', errNotif)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al reagendar' }, { status: 500 })
  }
}
