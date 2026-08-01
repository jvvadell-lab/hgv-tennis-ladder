import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { jugadorId, temporadaId, dias } = await request.json()
    const diasNum = Number(dias)
    if (!jugadorId || !temporadaId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    if (![3, 5].includes(diasNum)) {
      return NextResponse.json({ error: 'El standby debe ser de 3 o 5 días' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: jugador, error: errJugador } = await db
      .from('jugadores')
      .select('nombre')
      .eq('id', jugadorId)
      .maybeSingle()
    if (errJugador) throw errJugador
    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })

    const { data: yaUsado } = await db
      .from('standby')
      .select('id')
      .eq('jugador_id', jugadorId)
      .eq('temporada_id', temporadaId)
      .maybeSingle()
    if (yaUsado) {
      return NextResponse.json({ error: `${jugador.nombre} ya usó su standby en esta temporada — es una única vez.` }, { status: 400 })
    }

    const { data: retosActivos, error: errRetos } = await db
      .from('retos')
      .select('id')
      .eq('temporada_id', temporadaId)
      .in('estado', ['pendiente', 'aceptado'])
      .or(`retador_id.eq.${jugadorId},retado_id.eq.${jugadorId}`)
    if (errRetos) throw errRetos
    if (retosActivos && retosActivos.length > 0) {
      return NextResponse.json({ error: `${jugador.nombre} tiene un reto pendiente o en curso — resuélvelo primero desde Desafíos.` }, { status: 400 })
    }

    const fechaInicio = new Date()
    const fechaFin = new Date()
    fechaFin.setDate(fechaFin.getDate() + diasNum)

    const { error: errInsert } = await db.from('standby').insert([{
      jugador_id: jugadorId,
      temporada_id: temporadaId,
      dias: diasNum,
      fecha_inicio: fechaInicio.toISOString().slice(0, 10),
      fecha_fin: fechaFin.toISOString().slice(0, 10),
      creado_por: 'admin',
    }])
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, nombre: jugador.nombre, fechaFin: fechaFin.toISOString().slice(0, 10) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al activar el standby' }, { status: 500 })
  }
}
