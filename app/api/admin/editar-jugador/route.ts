import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { jugadorId, nombre, email, telefono, categoria, genero, numeroAccion, activo } = await request.json()
    if (!jugadorId || !nombre?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
    }

    const db = supabaseServer()

    // Evitar duplicar el email con otro jugador distinto
    const { data: existente, error: errExist } = await db
      .from('jugadores')
      .select('id')
      .ilike('email', email.trim())
      .neq('id', jugadorId)
      .maybeSingle()
    if (errExist) throw errExist
    if (existente) {
      return NextResponse.json({ error: 'Ya hay otro jugador con ese email.' }, { status: 400 })
    }

    const { error } = await db
      .from('jugadores')
      .update({
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono || null,
        categoria,
        genero,
        numero_accion: numeroAccion || null,
        activo: activo !== false,
      })
      .eq('id', jugadorId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar' }, { status: 500 })
  }
}
