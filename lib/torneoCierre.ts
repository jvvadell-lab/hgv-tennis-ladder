// Cierre de inscripciones MANUAL por categoría y lista de espera (ajustes
// del 23-oct-2026, SPEC §2.3). Lógica pura; los helpers de servidor están en
// lib/torneoCierreServidor.ts. Tests en lib/torneoCierre.test.ts.
//
// El admin cierra cada categoría cuando quiere (normalmente al llenarse) y
// la puede reabrir mientras no publique su sorteo. La hora de cierre
// programada (4-nov 23:59 de Caracas) NO cierra nada: si pasa con alguna
// categoría abierta, el panel lo alerta y se avisa a los admins. Las
// invitaciones pendientes sí vencen a esa hora (lib/torneoDobles.ts).

import { categoriaAbierta, cupoInscripciones } from './torneoInscripcion'
import type { EstadoTorneo, TorneoCategoria } from './torneo'

type CategoriaCierre = Pick<TorneoCategoria, 'id' | 'nombre' | 'inscripciones_abiertas' | 'sorteo_publicado_at' | 'cancelada_at'>

// Categorías que siguen abiertas después del cierre programado ("cierre
// programado vencido"). Vacío si la hora no pasó o el torneo no está en
// inscripción.
export function cierreVencido(
  torneo: { estado: EstadoTorneo; cierre_inscripciones_at: string | null },
  categorias: CategoriaCierre[],
  ahora: Date,
): CategoriaCierre[] {
  if (!torneo.cierre_inscripciones_at || ahora < new Date(torneo.cierre_inscripciones_at)) return []
  return categorias.filter((c) => !c.sorteo_publicado_at && !c.cancelada_at && categoriaAbierta(torneo.estado, c))
}

// Abrir o cerrar una categoría: null si se puede; si no, el motivo.
export function errorCambioApertura(
  estadoTorneo: EstadoTorneo,
  c: Pick<TorneoCategoria, 'nombre' | 'sorteo_publicado_at' | 'cancelada_at'>,
  abrir: boolean,
): string | null {
  if (!['borrador', 'inscripcion'].includes(estadoTorneo)) return 'El sorteo del torneo ya terminó: las inscripciones no se pueden abrir ni cerrar'
  if (c.cancelada_at) return `${c.nombre} está cancelada`
  if (c.sorteo_publicado_at) return abrir ? `${c.nombre} ya se sorteó: no se puede reabrir` : `${c.nombre} ya se sorteó (quedó cerrada)`
  return null
}

// Aviso antes de cerrar: quiénes quedan sin pareja y cuántas invitaciones
// pendientes vencerán. null si no hay nada que avisar.
export function avisoAntesDeCerrar(nombreCategoria: string, sinPareja: string[], invitacionesPendientes: number): string | null {
  const partes: string[] = []
  if (sinPareja.length) {
    partes.push(`Quedan ${sinPareja.length} sin pareja (${sinPareja.join(', ')}): arma la dupla, trasládalos o marca su devolución.`)
  }
  if (invitacionesPendientes) {
    partes.push(invitacionesPendientes === 1 ? '1 invitación pendiente vencerá al cerrar.' : `${invitacionesPendientes} invitaciones pendientes vencerán al cerrar.`)
  }
  return partes.length ? `${nombreCategoria}: ${partes.join(' ')}` : null
}

// ---------------------------------------------------------------------------
// Lista de espera
// ---------------------------------------------------------------------------

// La categoría ya no recibe inscripciones de jugadores: cerrada o con el cupo lleno.
export function categoriaNoRecibe(
  estadoTorneo: EstadoTorneo,
  c: Pick<TorneoCategoria, 'modalidad' | 'cupo' | 'inscripciones_abiertas' | 'sorteo_publicado_at' | 'cancelada_at'>,
  ocupados: number,
): 'cerrada' | 'llena' | null {
  if (c.sorteo_publicado_at || c.cancelada_at) return null           // ya no hay lista que valga
  if (!categoriaAbierta(estadoTorneo, c)) return 'cerrada'
  if (ocupados >= cupoInscripciones(c)) return 'llena'
  return null
}

// Puede anotarse en la lista de espera: la categoría no recibe, el torneo
// no está sorteado, no está inscrito en ella ni ya en la lista.
export function errorAnotarseEnEspera(d: {
  estadoTorneo: EstadoTorneo
  categoria: Pick<TorneoCategoria, 'nombre' | 'modalidad' | 'cupo' | 'inscripciones_abiertas' | 'sorteo_publicado_at' | 'cancelada_at'>
  ocupados: number
  yaInscrito: boolean
  yaEnLista: boolean
}): string | null {
  if (!['borrador', 'inscripcion'].includes(d.estadoTorneo) || d.categoria.sorteo_publicado_at || d.categoria.cancelada_at) {
    return `${d.categoria.nombre} ya no admite lista de espera`
  }
  if (d.yaInscrito) return 'Ya estás inscrito en esta categoría'
  if (d.yaEnLista) return 'Ya estás en la lista de espera'
  if (!categoriaNoRecibe(d.estadoTorneo, d.categoria, d.ocupados)) return 'La categoría tiene lugar: inscríbete directamente'
  return null
}

// Lista en orden de llegada (solo las que siguen esperando), con su puesto.
export function ordenEspera<E extends { estado: string; created_at: string }>(lista: E[]): (E & { puesto: number })[] {
  return lista
    .filter((e) => e.estado === 'esperando')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((e, i) => ({ ...e, puesto: i + 1 }))
}
