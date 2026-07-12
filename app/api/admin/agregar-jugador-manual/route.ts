import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { temporadaId, jugadorId } = await request.json()
    if (!temporadaId || !jugadorId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: jugador, error: errJugador } = await db
      .from('jugadores')
      .select('id, nombre, categoria, genero')
      .eq('id', jugadorId)
      .maybeSingle()
    if (errJugador) throw errJugador
    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })

    const { data: yaAnotado } = await db
      .from('ladder_posiciones')
      .select('id')
      .eq('temporada_id', temporadaId)
      .eq('jugador_id', jugadorId)
      .maybeSingle()
    if (yaAnotado) {
      return NextResponse.json({ error: `${jugador.nombre} ya está en el escalafón de esta temporada.` }, { status: 400 })
    }

    const { count } = await db
      .from('ladder_posiciones')
      .select('id', { count: 'exact', head: true })
      .eq('temporada_id', temporadaId)
      .eq('categoria', jugador.categoria)
      .eq('genero', jugador.genero)

    const nuevaPosicion = (count || 0) + 1

    const { error: errInsert } = await db.from('ladder_posiciones').insert([{
      temporada_id: temporadaId,
      jugador_id: jugador.id,
      categoria: jugador.categoria,
      genero: jugador.genero,
      posicion: nuevaPosicion,
      posicion_inicial: nuevaPosicion,
    }])
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, nombre: jugador.nombre })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al agregar' }, { status: 500 })
  }
}
