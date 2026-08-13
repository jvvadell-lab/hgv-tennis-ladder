import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

const DURACION_PARTIDO_MS = 90 * 60 * 1000
const AJUSTES_PERMITIDOS = [-1, 2] // solo "un día antes" o "dos días después"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { retoId, nuevoEstado, ajusteDias } = await request.json()
    if (!retoId || !['aceptado', 'rechazado'].includes(nuevoEstado)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    if (ajusteDias !== undefined && ajusteDias !== null && !AJUSTES_PERMITIDOS.includes(Number(ajusteDias))) {
      return NextResponse.json({ error: 'Solo puedes adelantar 1 día o atrasar 2 días la fecha propuesta.' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retador_id, retado_id, estado, temporada_id, fecha_propuesta, cancha, retador:retador_id(nombre, email), retado:retado_id(nombre)')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })

    // Solo el jugador retado puede aceptar o rechazar, y solo si sigue pendiente
    if (reto.retado_id !== session.id) {
      return NextResponse.json({ error: 'Este reto no te pertenece' }, { status: 403 })
    }
    if (reto.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Este reto ya no está pendiente' }, { status: 400 })
    }

    // Un jugador solo puede rechazar UN reto por temporada — la escalera se hizo
    // para jugarla; si la fecha no le sirve, tiene la opción de ajustarla en vez
    // de rechazar directamente.
    if (nuevoEstado === 'rechazado') {
      const { count } = await db
        .from('retos')
        .select('id', { count: 'exact', head: true })
        .eq('retado_id', session.id)
        .eq('temporada_id', reto.temporada_id)
        .eq('estado', 'rechazado')
      if ((count || 0) >= 1) {
        return NextResponse.json({
          error: 'Ya usaste tu única oportunidad de rechazar un reto esta temporada. Si la fecha no te sirve, puedes aceptar con un día antes o dos días después en su lugar.',
        }, { status: 400 })
      }
    }

    const updateData: any = { estado: nuevoEstado }

    // Si acepta con un ajuste de fecha, validamos que el nuevo horario no choque
    // con otro partido o reserva en esa misma cancha antes de guardarlo.
    if (nuevoEstado === 'aceptado' && ajusteDias !== undefined && ajusteDias !== null && reto.cancha && reto.cancha !== 'FORANEA') {
      const nuevaFecha = new Date(reto.fecha_propuesta)
      nuevaFecha.setDate(nuevaFecha.getDate() + Number(ajusteDias))
      const nuevaHoraMs = nuevaFecha.getTime()

      const inicioDia = new Date(nuevaHoraMs); inicioDia.setHours(0, 0, 0, 0)
      const finDia = new Date(nuevaHoraMs); finDia.setHours(23, 59, 59, 999)

      const { data: partidosCancha } = await db
        .from('retos')
        .select('id, fecha_propuesta')
        .eq('temporada_id', reto.temporada_id)
        .eq('cancha', reto.cancha)
        .in('estado', ['pendiente', 'aceptado'])
        .neq('id', retoId)
        .gte('fecha_propuesta', inicioDia.toISOString())
        .lte('fecha_propuesta', finDia.toISOString())

      const conflicto = (partidosCancha || []).find((r: any) =>
        Math.abs(new Date(r.fecha_propuesta).getTime() - nuevaHoraMs) < DURACION_PARTIDO_MS
      )
      if (conflicto) {
        return NextResponse.json({ error: 'Esa cancha ya tiene otro partido cerca de esa nueva hora. No se pudo ajustar la fecha.' }, { status: 400 })
      }

      const { data: reservasCancha } = await db
        .from('reservas_cancha')
        .select('id, fecha_hora, duracion_min')
        .eq('cancha', reto.cancha)
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
        return NextResponse.json({ error: 'Esa cancha ya tiene una reserva casual cerca de esa nueva hora. No se pudo ajustar la fecha.' }, { status: 400 })
      }

      updateData.fecha_propuesta = nuevaFecha.toISOString()
    }

    const { error: errUpdate } = await db.from('retos').update(updateData).eq('id', retoId)
    if (errUpdate) throw errUpdate

    // Si lo rechazó, avisamos por correo a quien lo había retado (si falla el correo, no revertimos nada)
    if (nuevoEstado === 'rechazado') {
      try {
        const retador: any = reto.retador
        const retado: any = reto.retado
        if (retador?.email) {
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
              <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
              <p>Hola ${retador.nombre || ''},</p>
              <p>Nos complace escribirte desde <strong>HGV TENNIS CLUB</strong> para informarte que <strong>${retado?.nombre || 'tu rival'}</strong> no pudo aceptar tu reto en esta ocasión.</p>
              <p>No te preocupes — puedes proponerle un nuevo horario, o retar a otro jugador desde la escalera.</p>
              <p style="margin-top: 24px;">Recibe un cordial saludo y nos vemos en cancha ¡¡🎾</p>
              <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
            </div>
          `
          await enviarCorreo(retador.email, `🎾 ${retado?.nombre || 'Tu rival'} no pudo aceptar tu reto`, html)
        }
      } catch {
        // No bloqueamos el rechazo si el correo falla
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al responder' }, { status: 500 })
  }
}
