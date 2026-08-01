import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { dias } = await request.json()
    const diasNum = Number(dias)
    if (![3, 5].includes(diasNum)) {
      return NextResponse.json({ error: 'El standby debe ser de 3 o 5 días' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id, estado, sorteo_realizado')
      .eq('estado', 'activa')
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada) return NextResponse.json({ error: 'No hay una temporada activa' }, { status: 400 })
    if (!temporada.sorteo_realizado) {
      return NextResponse.json({ error: 'El standby se habilita después del sorteo de la temporada.' }, { status: 400 })
    }

    // La tabla ya tiene UNIQUE(jugador_id, temporada_id), pero revisamos antes
    // para devolver un mensaje claro en vez del error crudo de la base de datos.
    const { data: yaUsado } = await db
      .from('standby')
      .select('id')
      .eq('jugador_id', session.id)
      .eq('temporada_id', temporada.id)
      .maybeSingle()
    if (yaUsado) {
      return NextResponse.json({ error: 'Ya usaste tu standby en esta temporada — es una única vez.' }, { status: 400 })
    }

    // No lo dejamos activar standby si tiene un reto pendiente o aceptado —
    // primero hay que resolverlo (aceptar, rechazar, o jugarlo).
    const { data: retosActivos, error: errRetos } = await db
      .from('retos')
      .select('id')
      .eq('temporada_id', temporada.id)
      .in('estado', ['pendiente', 'aceptado'])
      .or(`retador_id.eq.${session.id},retado_id.eq.${session.id}`)
    if (errRetos) throw errRetos
    if (retosActivos && retosActivos.length > 0) {
      return NextResponse.json({ error: 'Tienes un reto pendiente o un partido en curso — resuélvelo antes de activar el standby.' }, { status: 400 })
    }

    const fechaInicio = new Date()
    const fechaFin = new Date()
    fechaFin.setDate(fechaFin.getDate() + diasNum)

    const { error: errInsert } = await db.from('standby').insert([{
      jugador_id: session.id,
      temporada_id: temporada.id,
      dias: diasNum,
      fecha_inicio: fechaInicio.toISOString().slice(0, 10),
      fecha_fin: fechaFin.toISOString().slice(0, 10),
      creado_por: 'jugador',
    }])
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, fechaInicio: fechaInicio.toISOString().slice(0, 10), fechaFin: fechaFin.toISOString().slice(0, 10) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al activar el standby' }, { status: 500 })
  }
}
