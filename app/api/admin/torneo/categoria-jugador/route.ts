import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { NIVELES } from '@/lib/torneo'
import { avisarInscripcionConfirmada, recalcularInscripcion, torneoVigente } from '@/lib/torneoServidor'

// Asigna (o quita, con null) la categoría oficial de torneo de un jugador.
// No toca jugadores.categoria ni ladder_posiciones. Después recalcula sus
// inscripciones vivas del torneo vigente: pueden confirmarse (si ya tenían
// los pagos) o volver a pendiente (si la categoría no corresponde).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { jugadorId, categoria } = await request.json()
    // Formato uuid: el id va dentro del filtro .or() de PostgREST.
    if (typeof jugadorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jugadorId)) {
      return NextResponse.json({ error: 'Falta el jugador' }, { status: 400 })
    }
    if (categoria !== null && !(NIVELES as readonly string[]).includes(categoria)) {
      return NextResponse.json({ error: 'Categoría no válida' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data: jugador, error } = await db
      .from('jugadores')
      .update({
        categoria_torneo: categoria,
        categoria_torneo_asignada_por: categoria ? session!.id : null,
        categoria_torneo_asignada_at: categoria ? new Date().toISOString() : null,
      })
      .eq('id', jugadorId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })

    const torneo = await torneoVigente(db)
    const cambios = []
    if (torneo) {
      const { data: categorias, error: errCat } = await db.from('torneo_categorias').select('id').eq('torneo_id', torneo.id)
      if (errCat) throw errCat
      const { data: inscripciones, error: errIns } = (categorias || []).length
        ? await db
            .from('torneo_inscripciones')
            .select('id')
            .in('categoria_id', (categorias || []).map((c) => c.id))
            .neq('estado', 'retirada')
            .or(`jugador1_id.eq.${jugadorId},jugador2_id.eq.${jugadorId}`)
        : { data: [], error: null }
      if (errIns) throw errIns

      for (const i of inscripciones || []) {
        const r = await recalcularInscripcion(db, i.id)
        if (r.antes !== r.despues) cambios.push(r)
        if (r.antes !== 'confirmada' && r.despues === 'confirmada') await avisarInscripcionConfirmada(db, r)
      }
    }

    return NextResponse.json({
      ok: true,
      cambios: cambios.map((c) => ({ inscripcionId: c.inscripcionId, categoria: c.categoriaNombre, antes: c.antes, despues: c.despues })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al asignar la categoría' }, { status: 500 })
  }
}
