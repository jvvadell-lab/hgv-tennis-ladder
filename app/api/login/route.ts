import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { crearSession } from '@/lib/session'

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
      await crearSession({ role: 'admin', id: admin.id, nombre: admin.nombre, nivel: admin.nivel || 'completo' })
      return NextResponse.json({ role: 'admin', nombre: admin.nombre, nivel: admin.nivel || 'completo' })
    }

    // 2. ¿Es jugador?
    const { data: jugador } = await db
      .from('jugadores')
      .select('id, nombre, email, pin, categoria, genero, activo, email_verificado')
      .eq('email', email)
      .maybeSingle()

    if (jugador && jugador.pin === pin) {
      if (!jugador.activo) {
        return NextResponse.json(
          { error: 'Tu cuenta está inactiva. Contacta a un administrador.' },
          { status: 403 }
        )
      }

      if (!jugador.email_verificado) {
        return NextResponse.json(
          { error: 'Debes verificar tu correo antes de entrar — revisa tu bandeja de entrada (y spam).' },
          { status: 403 }
        )
      }

      await crearSession({
        role: 'jugador',
        id: jugador.id,
        nombre: jugador.nombre,
        categoria: jugador.categoria,
        genero: jugador.genero,
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
