import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }
    if (!session.categoria || !session.genero) {
      return NextResponse.json({ error: 'Tu sesión no tiene categoría/género definidos' }, { status: 400 })
    }

    const { temporadaId } = await request.json()
    if (!temporadaId) return NextResponse.json({ error: 'Falta el id de la temporada' }, { status: 400 })

    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id, estado, fecha_limite_inscripcion, sorteo_realizado')
      .eq('id', temporadaId)
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada || temporada.estado !== 'activa') {
      return NextResponse.json({ error: 'Esta temporada no está activa' }, { status: 400 })
    }

    const { data: jugador } = await db
      .from('jugadores')
      .select('estado_verificacion')
      .eq('id', session.id)
      .maybeSingle()
    if (jugador?.estado_verificacion === 'no_permitido') {
      return NextResponse.json({ error: 'Tu cuenta no está habilitada para participar en el escalafón. Contacta a un administrador.' }, { status: 403 })
    }

    if (temporada.sorteo_realizado) {
      return NextResponse.json({ error: 'El sorteo de esta temporada ya se realizó. Pide a un administrador que te agregue al escalafón.' }, { status: 400 })
    }

    const hoy = new Date().toISOString().slice(0, 10)
    if (temporada.fecha_limite_inscripcion && hoy > temporada.fecha_limite_inscripcion) {
      return NextResponse.json({ error: 'El plazo de inscripción ya cerró. Pide a un administrador que te agregue.' }, { status: 400 })
    }

    const { data: yaAnotado } = await db
      .from('ladder_posiciones')
      .select('id')
      .eq('temporada_id', temporadaId)
      .eq('jugador_id', session.id)
      .maybeSingle()
    if (yaAnotado) {
      return NextResponse.json({ error: 'Ya estás anotado en esta temporada' }, { status: 400 })
    }

    const { count } = await db
      .from('ladder_posiciones')
      .select('id', { count: 'exact', head: true })
      .eq('temporada_id', temporadaId)
      .eq('categoria', session.categoria)
      .eq('genero', session.genero)

    const nuevaPosicion = (count || 0) + 1

    const { error: errInsert } = await db.from('ladder_posiciones').insert([{
      temporada_id: temporadaId,
      jugador_id: session.id,
      categoria: session.categoria,
      genero: session.genero,
      posicion: nuevaPosicion,
      posicion_inicial: nuevaPosicion,
    }])
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al anotarte' }, { status: 500 })
  }
}
