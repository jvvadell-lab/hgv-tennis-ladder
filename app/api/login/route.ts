import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'

// Cuánto dura la sesión (30 días)
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export async function POST(request: Request) {
  try {
    const { email, pin } = await request.json()

    if (!email || !pin) {
      return NextResponse.json(
        { error: 'Email y PIN son obligatorios' },
        { status: 400 }
      )
    }

    const db = supabaseServer()

    // 1. ¿Es administrador?
    const { data: admin } = await db
      .from('administradores')
      .select('id, nombre, email, pin, nivel')
      .eq('email', email)
      .maybeSingle()

    if (admin && admin.pin === pin) {
      const session = JSON.stringify({ role: 'admin', id: admin.id, nombre: admin.nombre, nivel: admin.nivel || 'completo' })
      const store = await cookies()
      store.set('hgv_session', session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })
      return NextResponse.json({ role: 'admin', nombre: admin.nombre, nivel: admin.nivel || 'completo' })
    }

    // 2. ¿Es jugador?
    const { data: jugador } = await db
      .from('jugadores')
      .select('id, nombre, email, pin, categoria, genero, activo')
      .eq('email', email)
      .maybeSingle()

    if (jugador && jugador.pin === pin) {
      if (!jugador.activo) {
        return NextResponse.json(
          { error: 'Tu cuenta está inactiva. Contacta a un administrador.' },
          { status: 403 }
        )
      }

      const session = JSON.stringify({
        role: 'jugador',
        id: jugador.id,
        nombre: jugador.nombre,
        categoria: jugador.categoria,
        genero: jugador.genero,
      })
      const store = await cookies()
      store.set('hgv_session', session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })
      return NextResponse.json({
        role: 'jugador',
        nombre: jugador.nombre,
        categoria: jugador.categoria,
        genero: jugador.genero,
      })
    }

    // Ni admin ni jugador coincidieron
    return NextResponse.json({ error: 'Email o PIN incorrecto' }, { status: 401 })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error al iniciar sesión: ' + err.message },
      { status: 500 }
    )
  }
}
