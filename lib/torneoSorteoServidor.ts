// Sorteo del torneo — helpers de servidor (reciben el cliente de Supabase con
// service role). Los usan app/api/admin/torneo/sorteo/... La lógica pura
// está en lib/torneoSorteo.ts.

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoInscripcion, Nivel, Torneo } from '@/lib/torneo'
import { pendientesInscripcion, textoPendiente } from '@/lib/torneoInscripcion'
import { pendientesInscripcionMenor } from '@/lib/torneoInfantil'
import { pendientesQueBloqueanSorteo, type CategoriaParaSorteo, type InscripcionParaSorteo } from '@/lib/torneoSorteo'

// Azar del sorteo con el generador criptográfico del servidor (no Math.random).
export const azarSorteo = () => randomInt(0, 2 ** 32) / 2 ** 32

export type CategoriaConInscritas = CategoriaParaSorteo & {
  inscripciones: (InscripcionParaSorteo & { nombre: string; pagoPendiente: boolean })[]
  // Lo que impide sortear la categoría (categoría oficial, certificación,
  // invitado sin autorizar), como texto para el admin. El pago no bloquea.
  bloqueos: string[]
}

// Categorías del torneo con sus inscripciones VIVAS (no retiradas: entran
// al sorteo hayan pagado o no), el nombre para mostrar de cada una y lo
// que todavía bloquea el sorteo.
export async function datosParaSorteo(db: SupabaseClient, torneo: Torneo): Promise<CategoriaConInscritas[]> {
  const { data: categorias, error: errCat } = await db
    .from('torneo_categorias')
    .select('id, nombre, es_infantil, num_grupos, llave_desde, partidos_minimos, orden, categoria_nivel')
    .eq('torneo_id', torneo.id)
    .order('orden')
  if (errCat) throw errCat
  const ids = (categorias || []).map((c) => c.id)
  if (!ids.length) return []

  const { data: inscripciones, error: errIns } = await db
    .from('torneo_inscripciones')
    .select('id, categoria_id, estado, siembra, bombo, jugador1_id, jugador2_id, menor_id, menor_nombre_publico, categoria_certificada_at, invitado_autorizado_at')
    .in('categoria_id', ids)
    .neq('estado', 'retirada')
    .order('created_at')
  if (errIns) throw errIns

  const lista = inscripciones || []
  const jugadorIds = [...new Set(lista.flatMap((i) => [i.jugador1_id, i.jugador2_id]).filter(Boolean))] as string[]
  const menorIds = [...new Set(lista.map((i) => i.menor_id).filter(Boolean))] as string[]
  const [{ data: jugadores, error: errJ }, { data: menores, error: errM }] = await Promise.all([
    jugadorIds.length
      ? db.from('jugadores').select('id, nombre, categoria_torneo, es_invitado').in('id', jugadorIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    menorIds.length
      ? db.from('torneo_menores').select('id, numero_accion').in('id', menorIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (errJ) throw errJ
  if (errM) throw errM
  const jugadorPorId = new Map((jugadores || []).map((j: any) => [j.id, j]))
  const accionMenor = new Map((menores || []).map((m: any) => [m.id, !!m.numero_accion?.trim()]))
  const nombres = await nombresInscripciones(db, lista)

  return (categorias || []).map((c) => {
    const delaCategoria = lista.filter((i) => i.categoria_id === c.id)
    const bloqueos: string[] = []
    for (const i of delaCategoria) {
      // Los pagos no se cargan: sus pendientes no bloquean el sorteo.
      const pendientes = i.menor_id
        ? pendientesInscripcionMenor({
            estado: i.estado as EstadoInscripcion, menorId: i.menor_id, representanteJugadorId: '', pagos: [],
            certificada: !!i.categoria_certificada_at, soloSocios: torneo.solo_socios,
            menorConAccion: accionMenor.get(i.menor_id) ?? false, invitadoAutorizado: !!i.invitado_autorizado_at,
          })
        : pendientesInscripcion({
            estado: i.estado as EstadoInscripcion, nivelCategoria: c.categoria_nivel as Nivel | null, pagos: [],
            jugadores: [i.jugador1_id, i.jugador2_id].filter(Boolean).map((id) => ({
              id: id!, categoria_torneo: jugadorPorId.get(id!)?.categoria_torneo ?? null, es_invitado: !!jugadorPorId.get(id!)?.es_invitado,
            })),
            soloSocios: torneo.solo_socios, invitadoAutorizado: !!i.invitado_autorizado_at,
          })
      for (const p of pendientesQueBloqueanSorteo(pendientes)) {
        const quien = p.jugadorId === i.menor_id ? i.menor_nombre_publico ?? 'el menor' : jugadorPorId.get(p.jugadorId)?.nombre ?? '—'
        bloqueos.push(`${c.nombre} · ${nombres.get(i.id) || '—'}: ${textoPendiente(p, quien)}`)
      }
    }
    return {
      ...(c as CategoriaParaSorteo),
      bloqueos,
      inscripciones: delaCategoria.map((i) => ({
        id: i.id, siembra: i.siembra, bombo: i.bombo, nombre: nombres.get(i.id) || '—', pagoPendiente: i.estado !== 'confirmada',
      })),
    }
  })
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
