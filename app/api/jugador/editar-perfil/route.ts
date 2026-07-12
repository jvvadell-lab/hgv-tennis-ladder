import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { nombre, email, telefono, numeroAccion, pin } = await request.json()
    if (!nombre?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nombre y email son obligatorios' }, { status: 400 })
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'El PIN debe tener exactamente 4 dígitos' }, { status: 400 })
    }

    const db = supabaseServer()

    // Evitar duplicar el email con otro jugador distinto (siempre usamos session.id,
    // nunca un id que venga del cliente, para que nadie pueda editar el perfil de otro)
    const { data: existente, error: errExist } = await db
      .from('jugadores')
      .select('id')
      .ilike('email', email.trim())
      .neq('id', session.id)
      .maybeSingle()
    if (errExist) throw errExist
    if (existente) {
      return NextResponse.json({ error: 'Ya hay otro jugador con ese email.' }, { status: 400 })
    }

    const updateData: any = {
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      telefono: telefono || null,
      numero_accion: numeroAccion || null,
    }
    if (pin) updateData.pin = pin

    const { error } = await db.from('jugadores').update(updateData).eq('id', session.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar' }, { status: 500 })
  }
}
