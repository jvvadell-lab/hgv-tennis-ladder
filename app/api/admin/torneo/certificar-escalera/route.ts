import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { avisarInscripcionConfirmada, recalcularInscripcion, torneoVigente } from '@/lib/torneoServidor'
import {
  agruparPorCategoriaYGenero,
  planCertificacion,
  temporadaPorDefecto,
  type JugadorEnEscalera,
  type TemporadaConEscalera,
} from '@/lib/torneoCertificacion'

// Certifica de una vez la categoría oficial de torneo de los jugadores de la
// escalera: categoria_torneo = categoria para los activos con fila en
// ladder_posiciones de la temporada elegida y sin categoría oficial todavía.
// GET (?temporadaId=) = vista previa; POST { temporadaId, jugadorIds } = aplica
// a los de la vista previa que sigan cumpliendo. Después recalcula sus
// inscripciones vivas del torneo vigente, como categoria-jugador.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function temporadasConEscalera(db: SupabaseClient): Promise<TemporadaConEscalera[]> {
  const { data, error } = await db.from('temporadas').select('id, nombre, fecha_inicio, ladder_posiciones(count)')
  if (error) throw error
  return (data || [])
    .map((t: any) => ({ id: t.id, nombre: t.nombre, fecha_inicio: t.fecha_inicio, jugadores: t.ladder_posiciones?.[0]?.count ?? 0 }))
    .filter((t) => t.jugadores > 0)
    .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))
}

async function plan(db: SupabaseClient, temporadaId: string) {
  const { data, error } = await db
    .from('ladder_posiciones')
    .select('jugadores:jugador_id(id, nombre, genero, categoria, categoria_torneo, activo)')
    .eq('temporada_id', temporadaId)
  if (error) throw error
  return planCertificacion((data || []).map((f: any) => f.jugadores as JugadorEnEscalera).filter(Boolean))
}

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const temporadas = await temporadasConEscalera(db)
    const pedida = new URL(request.url).searchParams.get('temporadaId')
    const temporada = pedida ? temporadas.find((t) => t.id === pedida) : temporadaPorDefecto(temporadas)
    if (!temporada) return NextResponse.json({ temporadas, temporada: null })

    const p = await plan(db, temporada.id)
    return NextResponse.json({
      temporadas,
      temporada,
      total: p.certificar.length,
      grupos: agruparPorCategoriaYGenero(p.certificar),
      yaCertificados: p.yaCertificados,
      inactivos: p.inactivos,
      categoriaInvalida: p.categoriaInvalida.map((j) => ({ id: j.id, nombre: j.nombre, categoria: j.categoria })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al preparar la certificación' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { temporadaId, jugadorIds } = await request.json()
    if (typeof temporadaId !== 'string' || !UUID.test(temporadaId)) {
      return NextResponse.json({ error: 'Falta la temporada' }, { status: 400 })
    }
    // Ids de la vista previa: solo se certifica lo que el admin vio. Formato
    // uuid porque van dentro del filtro .or() de PostgREST.
    if (!Array.isArray(jugadorIds) || jugadorIds.length === 0 || !jugadorIds.every((id) => typeof id === 'string' && UUID.test(id))) {
      return NextResponse.json({ error: 'No hay jugadores para certificar' }, { status: 400 })
    }

    const db = supabaseServer()
    const vistos = new Set<string>(jugadorIds)
    const p = await plan(db, temporadaId)
    const certificar = p.certificar.filter((j) => vistos.has(j.id))

    // Uno por uno: cada jugador recibe su propia categoría. El filtro
    // categoria_torneo is null evita pisar una asignada mientras tanto.
    const at = new Date().toISOString()
    const hechos: string[] = []
    for (const j of certificar) {
      const { data, error } = await db
        .from('jugadores')
        .update({ categoria_torneo: j.categoria, categoria_torneo_asignada_por: session!.id, categoria_torneo_asignada_at: at })
        .eq('id', j.id)
        .is('categoria_torneo', null)
        .select('id')
      if (error) throw error
      if (data?.length) hechos.push(j.id)
    }

    const torneo = hechos.length ? await torneoVigente(db) : null
    const cambios = []
    if (torneo) {
      const { data: categorias, error: errCat } = await db.from('torneo_categorias').select('id').eq('torneo_id', torneo.id)
      if (errCat) throw errCat
      const lista = hechos.join(',')
      const { data: inscripciones, error: errIns } = (categorias || []).length
        ? await db
            .from('torneo_inscripciones')
            .select('id')
            .in('categoria_id', (categorias || []).map((c) => c.id))
            .neq('estado', 'retirada')
            .or(`jugador1_id.in.(${lista}),jugador2_id.in.(${lista})`)
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
      certificados: hechos.length,
      omitidos: jugadorIds.length - hechos.length,
      cambios: cambios.map((c) => ({ inscripcionId: c.inscripcionId, categoria: c.categoriaNombre, antes: c.antes, despues: c.despues })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al certificar' }, { status: 500 })
  }
}
