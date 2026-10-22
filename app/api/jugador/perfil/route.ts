import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Datos del propio perfil (Mi Perfil). El correo, el teléfono, el N.º de
// acción y el carné ya no son legibles con la clave anónima, así que se leen
// aquí con service role — siempre del jugador de la sesión, nunca de un id
// que mande el cliente.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const db = supabaseServer()
    const { data, error } = await db
      .from('jugadores')
      .select('nombre, email, telefono, numero_accion, categoria, genero, foto_carnet_url')
      .eq('id', session.id)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ ok: true, jugador: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el perfil' }, { status: 500 })
  }
}
