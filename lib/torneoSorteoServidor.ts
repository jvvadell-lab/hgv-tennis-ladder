// Sorteo del torneo — helpers de servidor (reciben el cliente de Supabase con
// service role). Los usan app/api/admin/torneo/sorteo/... La lógica pura
// está en lib/torneoSorteo.ts.

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Torneo } from '@/lib/torneo'
import type { CategoriaParaSorteo, InscripcionParaSorteo } from '@/lib/torneoSorteo'

// Azar del sorteo con el generador criptográfico del servidor (no Math.random).
export const azarSorteo = () => randomInt(0, 2 ** 32) / 2 ** 32

export type CategoriaConInscritas = CategoriaParaSorteo & {
  inscripciones: (InscripcionParaSorteo & { nombre: string })[]
}

// Categorías del torneo con sus inscripciones CONFIRMADAS (las únicas que
// entran al sorteo) y el nombre para mostrar de cada una.
export async function datosParaSorteo(db: SupabaseClient, torneo: Torneo): Promise<CategoriaConInscritas[]> {
  const { data: categorias, error: errCat } = await db
    .from('torneo_categorias')
    .select('id, nombre, es_infantil, num_grupos, llave_desde, partidos_minimos, orden')
    .eq('torneo_id', torneo.id)
    .order('orden')
  if (errCat) throw errCat
  const ids = (categorias || []).map((c) => c.id)
  if (!ids.length) return []

  const { data: inscripciones, error: errIns } = await db
    .from('torneo_inscripciones')
    .select('id, categoria_id, siembra, bombo, jugador1_id, jugador2_id, menor_nombre_publico')
    .in('categoria_id', ids)
    .eq('estado', 'confirmada')
    .order('created_at')
  if (errIns) throw errIns

  const nombres = await nombresInscripciones(db, inscripciones || [])
  return (categorias || []).map((c) => ({
    ...(c as CategoriaParaSorteo),
    inscripciones: (inscripciones || [])
      .filter((i) => i.categoria_id === c.id)
      .map((i) => ({ id: i.id, siembra: i.siembra, bombo: i.bombo, nombre: nombres.get(i.id) || '—' })),
  }))
}

type InscripcionConNombres = { id: string; jugador1_id: string | null; jugador2_id: string | null; menor_nombre_publico: string | null }

// Nombre público de cada inscripción: "Ana / Luis" en dobles, el jugador en
// single y menor_nombre_publico ("Sofía M.") en las infantiles — nunca el
// nombre completo del menor ni datos del representante.
export async function nombresInscripciones(db: SupabaseClient, inscripciones: InscripcionConNombres[]): Promise<Map<string, string>> {
  const jugadorIds = [...new Set(inscripciones.flatMap((i) => [i.jugador1_id, i.jugador2_id]).filter(Boolean))] as string[]
  const { data: jugadores, error } = jugadorIds.length
    ? await db.from('jugadores').select('id, nombre').in('id', jugadorIds)
    : { data: [] as { id: string; nombre: string }[], error: null }
  if (error) throw error
  const nombre = new Map((jugadores || []).map((j) => [j.id, j.nombre as string]))
  return new Map(inscripciones.map((i) => [
    i.id,
    i.menor_nombre_publico ?? [i.jugador1_id, i.jugador2_id].filter(Boolean).map((id) => nombre.get(id!) || '—').join(' / '),
  ]))
}
