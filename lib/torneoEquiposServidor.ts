// Equipos del torneo (torneo_equipos) — helpers de servidor. Un equipo es el
// competidor del cuadro: en dobles, la dupla de dos inscripciones
// individuales; en single e infantil, una sola inscripción. Grupos y
// partidos apuntan a equipos; estos helpers los devuelven con la misma forma
// que tenía una inscripción de pareja (jugador1_id, jugador2_id,
// menor_nombre_publico…) para que nombres, avisos y "mis partidos" no
// cambien.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Competidor = {
  id: string                  // id del equipo
  categoria_id: string
  estado: 'activo' | 'disuelto'
  siembra: number | null
  bombo: number | null
  inscripcionIds: string[]
  jugador1_id: string | null
  jugador2_id: string | null
  menor_id: string | null
  menor_nombre_publico: string | null
  torneo_menores: { representante_jugador_id: string } | null
}

const COLUMNAS_INSCRIPCION = 'id, jugador1_id, menor_id, menor_nombre_publico, torneo_menores(representante_jugador_id)'
const SELECT_EQUIPO = `id, categoria_id, estado, siembra, bombo,
  i1:torneo_inscripciones!torneo_equipos_inscripcion1_id_fkey(${COLUMNAS_INSCRIPCION}),
  i2:torneo_inscripciones!torneo_equipos_inscripcion2_id_fkey(${COLUMNAS_INSCRIPCION})`

function aCompetidor(e: any): Competidor {
  const i1 = e.i1
  const i2 = e.i2
  return {
    id: e.id,
    categoria_id: e.categoria_id,
    estado: e.estado,
    siembra: e.siembra,
    bombo: e.bombo,
    inscripcionIds: [i1?.id, i2?.id].filter(Boolean),
    jugador1_id: i1?.jugador1_id ?? null,
    jugador2_id: i2?.jugador1_id ?? null,
    menor_id: i1?.menor_id ?? null,
    menor_nombre_publico: i1?.menor_nombre_publico ?? null,
    torneo_menores: i1?.torneo_menores ?? null,
  }
}

// Equipos por id (incluye disueltos: un partido viejo puede apuntar a uno).
export async function competidoresPorId(db: SupabaseClient, ids: string[]): Promise<Map<string, Competidor>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return new Map()
  const { data, error } = await db.from('torneo_equipos').select(SELECT_EQUIPO).in('id', unicos)
  if (error) throw error
  return new Map((data || []).map((e) => [e.id as string, aCompetidor(e)]))
}

// Equipos activos de unas categorías, en orden de creación.
export async function competidoresDeCategorias(db: SupabaseClient, categoriaIds: string[]): Promise<Competidor[]> {
  if (!categoriaIds.length) return []
  const { data, error } = await db
    .from('torneo_equipos')
    .select(SELECT_EQUIPO)
    .in('categoria_id', categoriaIds)
    .eq('estado', 'activo')
    .order('created_at')
  if (error) throw error
  return (data || []).map(aCompetidor)
}

// Personas a avisar de un competidor: los jugadores o, en infantil, el representante.
export function personasDe(c: Pick<Competidor, 'jugador1_id' | 'jugador2_id' | 'menor_id' | 'torneo_menores'>): string[] {
  if (c.menor_id) return c.torneo_menores?.representante_jugador_id ? [c.torneo_menores.representante_jugador_id] : []
  return [c.jugador1_id, c.jugador2_id].filter(Boolean) as string[]
}
