import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

const DURACION_PARTIDO_MS = 90 * 60 * 1000

// Venezuela es UTC-4 fijo (sin horario de verano) — usamos esto en vez de
// new Date().toISOString() directo para que "hoy" no se adelante un día
// pasadas las 8:00pm hora local (cuando en UTC ya es el día siguiente).
function fechaVenezuela(ms: number = Date.now()): string {
  return new Date(ms - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { retoId, nuevaFechaHora, cancha, nombreCanchaForanea } = await request.json()
    if (!retoId || !nuevaFechaHora || !cancha) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: fm } = await db.from('fuerza_mayor').select('activo, fecha').eq('id', 1).maybeSingle()
    const hoy = fechaVenezuela()
    if (!fm?.activo || fm?.fecha !== hoy) {
      return NextResponse.json({ error: 'El reagendamiento por fuerza mayor no está activo en este momento.' }, { status: 400 })
    }

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retador_id, retado_id, estado, temporada_id, fecha_propuesta, cancha')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })
    if (reto.retador_id !== session.id && reto.retado_id !== session.id) {
      return NextResponse.json({ error: 'Este reto no te pertenece' }, { status: 403 })
    }
    if (!['pendiente', 'aceptado'].includes(reto.estado)) {
      return NextResponse.json({ error: 'Este reto ya no se puede reagendar' }, { status: 400 })
    }
    if (fechaVenezuela(new Date(reto.fecha_propuesta).getTime()) !== hoy) {
      return NextResponse.json({ error: 'Este partido no está programado para hoy.' }, { status: 400 })
    }

    if (cancha === 'FORANEA' && !String(nombreCanchaForanea || '').trim()) {
      return NextResponse.json({ error: 'Falta el nombre de la cancha foránea' }, { status: 400 })
    }

    const nuevaHoraMs = new Date(nuevaFechaHora).getTime()
    if (isNaN(nuevaHoraMs)) {
      return NextResponse.json({ error: 'Fecha/hora inválida' }, { status: 400 })
    }

    if (cancha !== 'FORANEA') {
      const inicioDia = new Date(nuevaHoraMs); inicioDia.setHours(0, 0, 0, 0)
      const finDia = new Date(nuevaHoraMs); finDia.setHours(23, 59, 59, 999)

      const { data: partidosCancha } = await db
        .from('retos')
        .select('id, fecha_propuesta')
        .eq('temporada_id', reto.temporada_id)
        .eq('cancha', cancha)
        .in('estado', ['pendiente', 'aceptado'])
        .neq('id', retoId)
        .gte('fecha_propuesta', inicioDia.toISOString())
        .lte('fecha_propuesta', finDia.toISOString())

      const conflicto = (partidosCancha || []).find((r: any) =>
        Math.abs(new Date(r.fecha_propuesta).getTime() - nuevaHoraMs) < DURACION_PARTIDO_MS
      )
      if (conflicto) {
        return NextResponse.json({ error: 'Esa cancha ya tiene otro partido cerca de esa hora. Elige otro horario.' }, { status: 400 })
      }

      const { data: reservasCancha } = await db
        .from('reservas_cancha')
        .select('id, fecha_hora, duracion_min')
        .eq('cancha', cancha)
        .eq('estado', 'activa')
        .gte('fecha_hora', inicioDia.toISOString())
        .lte('fecha_hora', finDia.toISOString())

      const finNuevo = nuevaHoraMs + DURACION_PARTIDO_MS
      const conflictoReserva = (reservasCancha || []).find((r: any) => {
        const inicioReserva = new Date(r.fecha_hora).getTime()
        const finReserva = inicioReserva + (r.duracion_min || 60) * 60 * 1000
        return nuevaHoraMs < finReserva && inicioReserva < finNuevo
      })
      if (conflictoReserva) {
        return NextResponse.json({ error: 'Esa cancha ya tiene una reserva casual cerca de esa hora. Elige otro horario.' }, { status: 400 })
      }
    }

    const { error: errUpdate } = await db
      .from('retos')
      .update({
        fecha_propuesta: new Date(nuevaHoraMs).toISOString(),
        cancha,
        nombre_cancha_foranea: cancha === 'FORANEA' ? String(nombreCanchaForanea).trim() : null,
      })
      .eq('id', retoId)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al reagendar' }, { status: 500 })
  }
}
