import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { reservaId } = await request.json()
    if (!reservaId) return NextResponse.json({ error: 'Falta el id de la reserva' }, { status: 400 })

    const db = supabaseServer()

    const { data: reserva, error: errBuscar } = await db
      .from('reservas_cancha')
      .select('id, jugador_id, fecha_hora, estado')
      .eq('id', reservaId)
      .maybeSingle()
    if (errBuscar) throw errBuscar
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
    if (reserva.jugador_id !== session.id) {
      return NextResponse.json({ error: 'Esta reserva no te pertenece' }, { status: 403 })
    }
    if (reserva.estado !== 'activa') {
      return NextResponse.json({ error: 'Esta reserva ya no está activa' }, { status: 400 })
    }

    // Solo tiene sentido confirmar una vez que ya llegó la hora reservada.
    if (Date.now() < new Date(reserva.fecha_hora).getTime()) {
      return NextResponse.json({ error: 'Todavía no llega la hora de tu reserva.' }, { status: 400 })
    }

    const { error } = await db.from('reservas_cancha').update({ estado: 'usada' }).eq('id', reservaId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al confirmar' }, { status: 500 })
  }
}
