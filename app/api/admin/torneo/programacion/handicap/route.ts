import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Handicap del Mixto (SPEC §4.1): la pareja que empieza cada game con 15-0
// en ese partido. inscripcionId null = sin handicap. La base revisa que sea
// del Mixto y una de las dos inscripciones del partido.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const { partidoId, inscripcionId } = await request.json()
    if (typeof partidoId !== 'string' || !partidoId) return NextResponse.json({ error: 'Falta el partido' }, { status: 400 })
    if (inscripcionId !== null && typeof inscripcionId !== 'string') return NextResponse.json({ error: 'Pareja no válida' }, { status: 400 })

    const db = supabaseServer()
    const { data: p, error: errP } = await db
      .from('torneo_partidos')
      .select('id, estado, equipo_a, equipo_b, torneo_categorias:categoria_id(genero)')
      .eq('id', partidoId)
      .maybeSingle()
    if (errP) throw errP
    if (!p) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
    if ((p.torneo_categorias as any)?.genero !== 'mixto') return NextResponse.json({ error: 'El handicap solo se usa en el Mixto' }, { status: 400 })
    if (['jugado', 'wo', 'doble_wo'].includes(p.estado)) return NextResponse.json({ error: 'El partido ya tiene resultado' }, { status: 400 })
    if (inscripcionId && inscripcionId !== p.equipo_a && inscripcionId !== p.equipo_b) {
      return NextResponse.json({ error: 'La pareja con handicap tiene que ser una de las dos del partido' }, { status: 400 })
    }

    const { error } = await db.from('torneo_partidos').update({ handicap_equipo_id: inscripcionId }).eq('id', partidoId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar el handicap' }, { status: 500 })
  }
}
