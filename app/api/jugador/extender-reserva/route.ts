import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

const DURACION_BASE_MIN = 60
const DURACION_RETO_MIN = 90
const EXTENSION_MIN = 30

function seSolapan(inicio1Ms: number, duracion1Min: number, inicio2Ms: number, duracion2Min: number) {
  const fin1 = inicio1Ms + duracion1Min * 60000
  const fin2 = inicio2Ms + duracion2Min * 60000
  return inicio1Ms < fin2 && inicio2Ms < fin1
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { reservaId } = await request.json()
    if (!reservaId) return NextResponse.json({ error: 'Falta el id de la reserva' }, { status: 400 })

    const db = supabaseServer()

    const { data: reserva, error: errReserva } = await db
      .from('reservas_cancha')
      .select('id, jugador_id, cancha, fecha_hora, estado, duracion_min')
      .eq('id', reservaId)
      .maybeSingle()
    if (errReserva) throw errReserva
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
    if (reserva.jugador_id !== session.id) {
      return NextResponse.json({ error: 'Esta reserva no te pertenece' }, { status: 403 })
    }
    if (reserva.estado !== 'activa') {
      return NextResponse.json({ error: 'Esta reserva ya no está activa' }, { status: 400 })
    }
    if ((reserva.duracion_min || DURACION_BASE_MIN) > DURACION_BASE_MIN) {
      return NextResponse.json({ error: 'Ya tienes la media hora extra asignada.' }, { status: 400 })
    }

    const inicioMs = new Date(reserva.fecha_hora).getTime()
    const finBaseMs = inicioMs + DURACION_BASE_MIN * 60000
    const momentoHabilitadoMs = finBaseMs - 5 * 60000 // 5 min antes de que termine su hora
    if (Date.now() < momentoHabilitadoMs) {
      return NextResponse.json({ error: 'Todavía es muy temprano — puedes pedir la media hora extra 5 minutos antes de que termine tu hora.' }, { status: 400 })
    }

    const inicioDia = new Date(inicioMs); inicioDia.setHours(0, 0, 0, 0)
    const finDia = new Date(inicioMs); finDia.setHours(23, 59, 59, 999)

    // Revisamos si el bloque de 30 min siguiente (los minutos 60-90 desde el inicio
    // de esta reserva) sigue libre — tanto de partidos de la escalera como de otras
    // reservas casuales — antes de asignárselo.
    const { data: retosDia } = await db
      .from('retos')
      .select('id, fecha_propuesta')
      .eq('cancha', reserva.cancha)
      .in('estado', ['pendiente', 'aceptado'])
      .gte('fecha_propuesta', inicioDia.toISOString())
      .lte('fecha_propuesta', finDia.toISOString())

    const conflictoReto = (retosDia || []).some((r: any) =>
      seSolapan(inicioMs, DURACION_BASE_MIN + EXTENSION_MIN, new Date(r.fecha_propuesta).getTime(), DURACION_RETO_MIN)
    )
    if (conflictoReto) {
      return NextResponse.json({ error: 'Ya hay un partido de la escalera programado justo después — no se puede extender.' }, { status: 400 })
    }

    const { data: reservasDia } = await db
      .from('reservas_cancha')
      .select('id, fecha_hora, duracion_min')
      .eq('cancha', reserva.cancha)
      .eq('estado', 'activa')
      .neq('id', reservaId)
      .gte('fecha_hora', inicioDia.toISOString())
      .lte('fecha_hora', finDia.toISOString())

    const conflictoReserva = (reservasDia || []).some((r: any) =>
      seSolapan(inicioMs, DURACION_BASE_MIN + EXTENSION_MIN, new Date(r.fecha_hora).getTime(), r.duracion_min || DURACION_BASE_MIN)
    )
    if (conflictoReserva) {
      return NextResponse.json({ error: 'Otro jugador ya reservó esa cancha justo después — no se puede extender.' }, { status: 400 })
    }

    const { error: errUpdate } = await db
      .from('reservas_cancha')
      .update({ duracion_min: DURACION_BASE_MIN + EXTENSION_MIN })
      .eq('id', reservaId)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true, duracionMin: DURACION_BASE_MIN + EXTENSION_MIN })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al extender la reserva' }, { status: 500 })
  }
}
