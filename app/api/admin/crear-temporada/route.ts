import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { nombre, fechaInicio, fechaFin, plazoDias } = await request.json()
    if (!nombre?.trim() || !fechaInicio || !fechaFin) {
      return NextResponse.json({ error: 'Completa nombre, fecha de inicio y fecha de fin' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: existentes, error: errExist } = await db
      .from('temporadas')
      .select('id')
      .ilike('nombre', nombre.trim())
    if (errExist) throw errExist
    if (existentes && existentes.length > 0) {
      return NextResponse.json({ error: `Ya existe una temporada llamada "${nombre.trim()}". Elige un nombre distinto.` }, { status: 400 })
    }

    const { data: activa, error: errActiva } = await db
      .from('temporadas')
      .select('id, nombre')
      .eq('estado', 'activa')
      .maybeSingle()
    if (errActiva) throw errActiva
    if (activa) {
      return NextResponse.json({ error: `Ya existe una temporada activa ("${activa.nombre}"). Ciérrala primero antes de crear una nueva.` }, { status: 400 })
    }

    const limite = new Date()
    limite.setDate(limite.getDate() + parseInt(plazoDias || '7', 10))
    const limiteStr = limite.toISOString().slice(0, 10)

    const { error: errInsert } = await db.from('temporadas').insert([{
      nombre: nombre.trim(),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      fecha_limite_inscripcion: limiteStr,
      estado: 'activa',
      sorteo_realizado: false,
    }])
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, fechaLimite: limiteStr })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al crear la temporada' }, { status: 500 })
  }
}
