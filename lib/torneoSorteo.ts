// Sorteo de grupos del torneo (Torneo Navidad HGV 2026 — SPEC §3). Lógica
// pura, sin llamadas a Supabase: la usan las rutas
// app/api/admin/torneo/sorteo/... (vista previa y publicación) y la UI.
// Tests en lib/torneoSorteo.test.ts.
//
// Flujo: la vista previa arma el sorteo con armarSorteoCategoria (al azar);
// el admin lo repite cuantas veces quiera. Al publicar, el servidor vuelve a
// validar los grupos que manda la vista previa (validarGruposSorteo),
// regenera los partidos (planCategoria) y los escribe en una transacción
// con la función Postgres torneo_publicar_sorteo.

import { crucesTodosContraTodos, distribuirSerpentina, generarLlave, letraGrupo, type FaseLlave, type LlaveDesde, type TorneoCategoria } from './torneo'
import type { Pendiente } from './torneoInscripcion'

export const METODOS_SORTEO = ['bombos', 'serpentina'] as const
export type MetodoSorteo = (typeof METODOS_SORTEO)[number]

export const ETIQUETA_METODO_SORTEO: Record<MetodoSorteo, string> = {
  bombos: 'Bombos',
  serpentina: 'Serpentina',
}

// Mínimo de inscripciones para sortear una categoría.
export const MINIMO_PARA_SORTEAR = 3

// Entran al sorteo todas las inscripciones vivas (no retiradas), hayan
// pagado o no (decisión del 20-oct-2026): el pago se sigue reportando y
// validando después. Lo que sí impide sortear es lo que define quién puede
// jugar: categoría oficial sin asignar o incompatible, menor sin certificar
// o invitado sin autorizar. Esas se resuelven o se retiran antes.
export const PENDIENTES_QUE_NO_BLOQUEAN_SORTEO: Pendiente['tipo'][] = ['pago', 'pago_por_validar']

export function pendientesQueBloqueanSorteo<P extends { tipo: Pendiente['tipo'] }>(pendientes: P[]): P[] {
  return pendientes.filter((p) => !PENDIENTES_QUE_NO_BLOQUEAN_SORTEO.includes(p.tipo))
}

export type LlaveSorteo = LlaveDesde | 'final' | 'sin_llave'

export type FormatoSorteo = {
  numGrupos: number
  llave: LlaveSorteo
  avisos: string[]
}

export type CategoriaParaSorteo = Pick<
  TorneoCategoria,
  'id' | 'nombre' | 'es_infantil' | 'num_grupos' | 'llave_desde' | 'partidos_minimos' | 'orden'
>

// Tamaños de los grupos al repartir n en g grupos lo más parejo posible
// (los primeros grupos se llevan el sobrante): 7 en 2 → [4, 3].
export function tamanosGrupos(n: number, g: number): number[] {
  return Array.from({ length: g }, (_, i) => Math.floor(n / g) + (i < n % g ? 1 : 0))
}

// Grupos y llave de una categoría con `n` inscripciones confirmadas (SPEC §3,
// aprobado 20-oct-2026):
//  * < 3: no se puede sortear.
//  * Adultos: siempre los grupos de la categoría; si algún grupo quedaría
//    con menos de 3, se bloquea: se completa con invitados o wild card.
//  * Infantil con llave: 3–4 → 1 grupo sin llave · 5–7 → 1 grupo + final ·
//    ≥ 8 → los grupos de la categoría; si algún grupo quedaría con menos de
//    3, 2 grupos y semis.
//  * Pelota Naranja (sin llave): ≤ 7 → 1 grupo · ≥ 8 → los grupos de la
//    categoría, reducidos para que cada uno tenga al menos 4.
export function formatoSorteo(c: CategoriaParaSorteo, n: number): { ok: false; error: string } | { ok: true; formato: FormatoSorteo } {
  if (n < MINIMO_PARA_SORTEAR) {
    return { ok: false, error: `${c.nombre}: tiene ${n} inscripción${n === 1 ? '' : 'es'} y hacen falta al menos ${MINIMO_PARA_SORTEAR} para sortear. Complétala con invitados o wild card, o retírala antes del sorteo.` }
  }

  const minimoGrupo = (g: number) => Math.min(...tamanosGrupos(n, g))
  const avisos: string[] = []

  if (!c.es_infantil) {
    if (c.llave_desde === 'sin_llave') return { ok: false, error: `${c.nombre}: una categoría de adultos necesita llave` }
    if (minimoGrupo(c.num_grupos) < 3) {
      return { ok: false, error: `${c.nombre}: con ${n} inscripciones algún grupo quedaría con menos de 3. Complétala con invitados o wild card antes del sorteo.` }
    }
    return { ok: true, formato: { numGrupos: c.num_grupos, llave: c.llave_desde, avisos } }
  }

  if (c.llave_desde === 'sin_llave') {
    const numGrupos = n <= 7 ? 1 : Math.max(1, Math.min(c.num_grupos, Math.floor(n / 4)))
    const partidosPorNino = minimoGrupo(numGrupos) - 1
    if (c.partidos_minimos && partidosPorNino < c.partidos_minimos) {
      avisos.push(`${c.nombre}: con ${n} inscritos cada niño juega ${partidosPorNino} partido${partidosPorNino === 1 ? '' : 's'}, menos que el mínimo de ${c.partidos_minimos}.`)
    }
    return { ok: true, formato: { numGrupos, llave: 'sin_llave', avisos } }
  }

  if (n <= 4) {
    avisos.push(`${c.nombre}: con ${n} inscritos se juega un solo grupo sin llave; el 1º de la tabla es el campeón.`)
    return { ok: true, formato: { numGrupos: 1, llave: 'sin_llave', avisos } }
  }
  if (n <= 7) {
    avisos.push(`${c.nombre}: con ${n} inscritos se juega un solo grupo y una final entre el 1º y el 2º.`)
    return { ok: true, formato: { numGrupos: 1, llave: 'final', avisos } }
  }
  if (minimoGrupo(c.num_grupos) >= 3) return { ok: true, formato: { numGrupos: c.num_grupos, llave: c.llave_desde, avisos } }
  avisos.push(`${c.nombre}: con ${n} inscritos se juegan 2 grupos y la llave empieza en semifinales.`)
  return { ok: true, formato: { numGrupos: 2, llave: 'semis', avisos } }
}

// ---------------------------------------------------------------------------
// Reparto en grupos
// ---------------------------------------------------------------------------

export type InscripcionParaSorteo = { id: string; siembra: number | null; bombo: number | null }

export type Azar = () => number   // [0, 1), como Math.random

export function barajar<T>(lista: T[], azar: Azar): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

const porSiembra = (a: InscripcionParaSorteo, b: InscripcionParaSorteo) => a.siembra! - b.siembra!

// Bombos (SPEC §3): con G grupos, las siembras 1..G son el bombo 1 y quedan
// fijas como cabezas de A..G. Los bombos siguientes (los que asignó el
// admin, y después las inscripciones sin bombo, barajadas, de a G) se
// sortean uno por grupo; un bombo incompleto va a los grupos con menos
// miembros, así los grupos nunca difieren en más de 1.
function repartirPorBombos(ins: InscripcionParaSorteo[], g: number, azar: Azar): { ok: false; error: string } | { ok: true; grupos: string[][] } {
  if (g === 1) {
    const conSiembra = ins.filter((i) => i.siembra != null).sort(porSiembra)
    return { ok: true, grupos: [[...conSiembra, ...barajar(ins.filter((i) => i.siembra == null), azar)].map((i) => i.id)] }
  }

  const cabezas: InscripcionParaSorteo[] = []
  for (let s = 1; s <= g; s++) {
    const cabeza = ins.find((i) => i.siembra === s)
    if (!cabeza) return { ok: false, error: `Faltan las siembras 1 a ${g} (cabezas de grupo): asigna la siembra ${s}` }
    if (cabeza.bombo != null && cabeza.bombo !== 1) return { ok: false, error: `La siembra ${s} es cabeza de grupo: va en el bombo 1` }
    cabezas.push(cabeza)
  }
  const resto = ins.filter((i) => !cabezas.includes(i))
  if (resto.some((i) => i.bombo === 1)) return { ok: false, error: `El bombo 1 son solo las siembras 1 a ${g}` }

  const explicitos = [...new Set(resto.filter((i) => i.bombo != null).map((i) => i.bombo!))].sort((a, b) => a - b)
  const bombos: InscripcionParaSorteo[][] = explicitos.map((b) => resto.filter((i) => i.bombo === b))
  const grande = bombos.find((b) => b.length > g)
  if (grande) return { ok: false, error: `El bombo ${grande[0].bombo} tiene ${grande.length} inscripciones y hay ${g} grupos: como máximo una por grupo` }
  const sinBombo = barajar(resto.filter((i) => i.bombo == null), azar)
  for (let k = 0; k < sinBombo.length; k += g) bombos.push(sinBombo.slice(k, k + g))

  const grupos = cabezas.map((c) => [c.id])
  for (const bombo of bombos) {
    // Los grupos con menos miembros primero (al azar entre los empatados).
    const destino = barajar(grupos.map((_, i) => i), azar)
      .sort((a, b) => grupos[a].length - grupos[b].length)
      .slice(0, bombo.length)
    barajar(bombo, azar).forEach((i, k) => grupos[destino[k]].push(i.id))
  }
  return { ok: true, grupos }
}

// Serpentina (SPEC §3): las que tienen siembra en su orden, las demás
// barajadas detrás, repartidas en zigzag.
function repartirPorSerpentina(ins: InscripcionParaSorteo[], g: number, azar: Azar): string[][] {
  const conSiembra = ins.filter((i) => i.siembra != null).sort(porSiembra)
  const orden = [...conSiembra, ...barajar(ins.filter((i) => i.siembra == null), azar)]
  return distribuirSerpentina(orden.map((i) => i.id), g)
}

export type SorteoCategoria = {
  categoriaId: string
  formato: FormatoSorteo
  grupos: string[][]          // ids de inscripción; grupos[0] = A, el primero de cada grupo es su cabeza
}

export function armarSorteoCategoria(
  c: CategoriaParaSorteo,
  inscripciones: InscripcionParaSorteo[],
  metodo: MetodoSorteo,
  azar: Azar = Math.random,
): { ok: false; error: string } | { ok: true; sorteo: SorteoCategoria } {
  const f = formatoSorteo(c, inscripciones.length)
  if (!f.ok) return f
  const { numGrupos } = f.formato
  if (metodo === 'serpentina') {
    return { ok: true, sorteo: { categoriaId: c.id, formato: f.formato, grupos: repartirPorSerpentina(inscripciones, numGrupos, azar) } }
  }
  const r = repartirPorBombos(inscripciones, numGrupos, azar)
  if (!r.ok) return { ok: false, error: `${c.nombre}: ${r.error}` }
  return { ok: true, sorteo: { categoriaId: c.id, formato: f.formato, grupos: r.grupos } }
}

// Revisión de los grupos que manda la vista previa antes de publicar:
// están exactamente las inscripciones vivas, una vez cada una, en el
// número de grupos que corresponde, parejos, y (en bombos con 2+ grupos)
// con la siembra k como cabeza del grupo k.
export function validarGruposSorteo(
  c: CategoriaParaSorteo,
  inscripciones: InscripcionParaSorteo[],
  metodo: MetodoSorteo,
  grupos: unknown,
): { ok: false; error: string } | { ok: true; sorteo: SorteoCategoria } {
  const f = formatoSorteo(c, inscripciones.length)
  if (!f.ok) return f
  if (!Array.isArray(grupos) || !grupos.every((g) => Array.isArray(g) && g.every((id) => typeof id === 'string'))) {
    return { ok: false, error: `${c.nombre}: los grupos no son válidos` }
  }
  const lista = grupos as string[][]
  const repetir = `${c.nombre}: las inscripciones cambiaron desde la vista previa. Repite el sorteo.`
  if (lista.length !== f.formato.numGrupos) return { ok: false, error: repetir }
  const ids = lista.flat()
  const esperados = new Set(inscripciones.map((i) => i.id))
  if (ids.length !== esperados.size || new Set(ids).size !== ids.length || !ids.every((id) => esperados.has(id))) {
    return { ok: false, error: repetir }
  }
  const tamanos = lista.map((g) => g.length)
  if (Math.max(...tamanos) - Math.min(...tamanos) > 1 || Math.min(...tamanos) < 2) {
    return { ok: false, error: `${c.nombre}: los grupos no están parejos` }
  }
  if (metodo === 'bombos' && lista.length > 1) {
    const siembra = new Map(inscripciones.map((i) => [i.id, i.siembra]))
    if (lista.some((g, k) => siembra.get(g[0]) !== k + 1)) {
      return { ok: false, error: `${c.nombre}: las cabezas de grupo no coinciden con las siembras 1 a ${lista.length}. Repite el sorteo.` }
    }
  }
  return { ok: true, sorteo: { categoriaId: c.id, formato: f.formato, grupos: lista } }
}

// ---------------------------------------------------------------------------
// Partidos que genera el sorteo
// ---------------------------------------------------------------------------

export type PartidoPlan = {
  fase: 'grupo' | FaseLlave
  letra: string | null        // grupo (solo fase 'grupo')
  orden: number
  ronda: number | null        // ronda del todos contra todos (solo grupos)
  origen_a: string | null
  origen_b: string | null
  inscripcion_a: string | null
  inscripcion_b: string | null
}

export type PlanCategoria = {
  categoria_id: string
  grupos: { letra: string; miembros: string[] }[]
  partidos: PartidoPlan[]
}

// Grupos (con letra), partidos de grupo (todos contra todos) y llave (con
// origen_* y sin inscripciones). Es lo que recibe torneo_publicar_sorteo.
export function planCategoria(s: SorteoCategoria): PlanCategoria {
  const grupos = s.grupos.map((miembros, i) => ({ letra: letraGrupo(i), miembros }))
  const partidos: PartidoPlan[] = []
  for (const g of grupos) {
    for (const cruce of crucesTodosContraTodos(g.miembros.length)) {
      partidos.push({
        fase: 'grupo', letra: g.letra, orden: cruce.orden, ronda: cruce.ronda,
        origen_a: null, origen_b: null,
        inscripcion_a: g.miembros[cruce.a], inscripcion_b: g.miembros[cruce.b],
      })
    }
  }
  if (s.formato.llave !== 'sin_llave') {
    for (const p of generarLlave(s.grupos.length, s.formato.llave)) {
      partidos.push({
        fase: p.fase, letra: null, orden: p.orden, ronda: null,
        origen_a: p.origen_a, origen_b: p.origen_b, inscripcion_a: null, inscripcion_b: null,
      })
    }
  }
  return { categoria_id: s.categoriaId, grupos, partidos }
}
