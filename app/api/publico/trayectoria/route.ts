import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { calcularTrayectoria } from '@/lib/trayectoria'

export async function POST(request: Request) {
  try {
    const { jugadorId } = await request.json()
    if (!jugadorId) return NextResponse.json({ error: 'Falta el id del jugador' }, { status: 400 })

    const db = supabaseServer()

    const { data: jugador, error } = await db
      .from('jugadores')
      .select('nombre, categoria, genero')
      .eq('id', jugadorId)
      .maybeSingle()
    if (error) throw error
    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })

    const trayectoria = await calcularTrayectoria(db, jugadorId)

    return NextResponse.json({ ok: true, jugador, trayectoria })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al consultar' }, { status: 500 })
  }
}
