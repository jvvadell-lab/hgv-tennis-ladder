import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'Falta el token de verificación' }, { status: 400 })

    const db = supabaseServer()

    const { data: jugador, error: errBusqueda } = await db
      .from('jugadores')
      .select('id, nombre, email_verificado')
      .eq('token_verificacion', token)
      .maybeSingle()
    if (errBusqueda) throw errBusqueda

    if (!jugador) {
      return NextResponse.json({ error: 'Este enlace de verificación no es válido o ya fue usado.' }, { status: 404 })
    }

    const { error: errUpdate } = await db
      .from('jugadores')
      .update({ email_verificado: true, token_verificacion: null })
      .eq('id', jugador.id)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true, nombre: jugador.nombre })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al verificar el correo' }, { status: 500 })
  }
}
