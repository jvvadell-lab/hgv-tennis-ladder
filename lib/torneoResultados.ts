// Resultados, WO y avance automático del torneo (SPEC §5, §6 y §8 — fase 6).
// Lógica pura, sin llamadas a Supabase: la usan lib/torneoResultadosServidor.ts
// (endpoints del jugador y del admin, y scripts/simular-torneo.ts). Tests en
// lib/torneoResultados.test.ts.
//
// j1 = equipo_a y j2 = equipo_b en `sets` (como en lib/torneo.ts).

import type { SetJugado, TipoResultado } from './resultados'
import {
  PREFIJO_FASE,
  ordenarGrupo,
  ordenarPrimeros,
  parsearOrigen,
  validarMarcadorTorneo,
  type MiembroParaTabla,
  type TorneoPartido,
} from './torneo'

export type PartidoAvance = Pick<
  TorneoPartido,
  | 'id' | 'fase' | 'grupo_id' | 'orden' | 'origen_a' | 'origen_b' | 'equipo_a' | 'equipo_b'
  | 'estado' | 'validado' | 'sets' | 'tipo_resultado' | 'retirada_equipo_id'
  | 'ganador_equipo_id' | 'wo_ausente_equipo_id'
>

// Código del partido de llave al que se refiere 'G:<codigo>' ('C1', 'S2', 'F1').
export function codigoLlave(p: Pick<PartidoAvance, 'fase' | 'orden'>): string | null {
  return p.fase === 'grupo' ? null : `${PREFIJO_FASE[p.fase]}${p.orden}`
}

// Un partido "cerrado" (cuenta para la tabla y la llave): validado y con
// resultado (jugado, WO o doble WO).
export const partidoCerrado = (p: Pick<PartidoAvance, 'validado' | 'estado'>) =>
  p.validado && ['jugado', 'wo', 'doble_wo'].includes(p.estado)

// ---------------------------------------------------------------------------
// Reporte de un resultado
// ---------------------------------------------------------------------------

export type DatosReporte = {
  sets: unknown
  tipoResultado: TipoResultado
  retiradaInscripcionId: string | null
}

// Valida el reporte contra el partido y devuelve el ganador. Retiro: gana
// la otra inscripción, con lo jugado (SPEC §7, aprobado 20-oct-2026).
export function evaluarReporte(
  partido: Pick<PartidoAvance, 'equipo_a' | 'equipo_b' | 'estado' | 'validado'>,
  d: DatosReporte,
): { ok: false; error: string } | { ok: true; ganador: string } {
  const { equipo_a: a, equipo_b: b } = partido
  if (!a || !b) return { ok: false, error: 'Todavía no se conocen los dos rivales de este partido' }
  if (partido.validado) return { ok: false, error: 'Este partido ya tiene un resultado validado' }
  if (partido.estado === 'wo' || partido.estado === 'doble_wo') return { ok: false, error: 'Este partido se cerró por WO' }
  if (d.tipoResultado !== 'normal' && d.tipoResultado !== 'retiro') return { ok: false, error: 'Tipo de resultado no válido' }

  const error = validarMarcadorTorneo(d.sets, d.tipoResultado)
  if (error) return { ok: false, error }
  const sets = d.sets as SetJugado[]

  if (d.tipoResultado === 'retiro') {
    if (d.retiradaInscripcionId !== a && d.retiradaInscripcionId !== b) return { ok: false, error: 'Indica quién se retiró' }
    return { ok: true, ganador: d.retiradaInscripcionId === a ? b : a }
  }
  if (d.retiradaInscripcionId) return { ok: false, error: 'Solo un retiro lleva quién se retiró' }

  const ganados = (j: 1 | 2) => sets.filter((s) => s.completo && (j === 1 ? s.games_j1 > s.games_j2 : s.games_j2 > s.games_j1)).length
  if (ganados(1) === 2) return { ok: true, ganador: a }
  if (ganados(2) === 2) return { ok: true, ganador: b }
  return { ok: false, error: 'El marcador no tiene un ganador: alguien tiene que ganar 2 sets (o 1-1 y el Super Tiebreak)' }
}

// ---------------------------------------------------------------------------
// Avance automático (SPEC §8)
// ---------------------------------------------------------------------------

export type Lado = 'a' | 'b'

// Cambios a aplicar en los partidos de la llave.
export type CambioAvance =
  | { tipo: 'asignar'; partidoId: string; lado: Lado; inscripcionId: string }
  // El rival de este lado no llega (doble WO en el partido de origen): el
  // presente pasa por WO (SPEC §6, por defecto [CONFIRMAR]).
  | { tipo: 'pase'; partidoId: string; ganador: string }
  // Ninguno de los dos llega (doble WO en los dos partidos de origen).
  | { tipo: 'doble_wo'; partidoId: string }

export type ResultadoAvance = { cambios: CambioAvance[]; avisos: string[] }

const lados: Lado[] = ['a', 'b']
const origenDe = (p: PartidoAvance, lado: Lado) => (lado === 'a' ? p.origen_a : p.origen_b)
const inscripcionDe = (p: PartidoAvance, lado: Lado) => (lado === 'a' ? p.equipo_a : p.equipo_b)

// Cuando el grupo está completo (todos sus partidos cerrados), llena los
// partidos de llave cuyo origen es '1X'/'2X'. Si un puesto que clasifica
// sigue empatado (falta el desempate manual del admin, SPEC §7.4), ese
// puesto no se llena y se avisa.
export function avanceGrupo(
  grupo: { id: string; letra: string },
  partidos: PartidoAvance[],
  miembros: MiembroParaTabla[],
  llave: PartidoAvance[],
): ResultadoAvance {
  const delGrupo = partidos.filter((p) => p.fase === 'grupo' && p.grupo_id === grupo.id)
  if (!delGrupo.length || !delGrupo.every(partidoCerrado)) return { cambios: [], avisos: [] }

  const tabla = ordenarGrupo(delGrupo, miembros)
  const cambios: CambioAvance[] = []
  const avisos: string[] = []
  for (const p of llave) {
    for (const lado of lados) {
      const o = parsearOrigen(origenDe(p, lado) ?? '')
      if (o?.tipo !== 'grupo' || o.letra !== grupo.letra) continue
      const fila = tabla[o.puesto - 1]
      if (!fila) continue
      if (fila.requiere_sorteo) {
        avisos.push(`Grupo ${grupo.letra}: el ${o.puesto}º puesto sigue empatado — falta el desempate del admin`)
        continue
      }
      if (inscripcionDe(p, lado) !== fila.equipo_id) {
        cambios.push({ tipo: 'asignar', partidoId: p.id, lado, inscripcionId: fila.equipo_id })
      }
    }
  }
  return { cambios, avisos: [...new Set(avisos)] }
}

// Llave de 3 grupos (cuartos con 2 byes): cuando TODOS los grupos están
// completos, ordena a los primeros (ordenarPrimeros) y llena 'P1'..'P3' con
// los primeros y '2P1'..'2P3' con el 2º del grupo de cada uno. Si un 1º o un
// 2º sigue empatado (falta el desempate del admin), no llena nada y avisa.
export function avanceMejoresPrimeros(
  grupos: { id: string; letra: string; miembros: MiembroParaTabla[] }[],
  partidos: PartidoAvance[],
  llave: PartidoAvance[],
): ResultadoAvance {
  const usa = llave.some((p) => lados.some((l) => {
    const o = parsearOrigen(origenDe(p, l) ?? '')
    return o?.tipo === 'mejor_primero' || o?.tipo === 'segundo_de_mejor'
  }))
  if (!usa) return { cambios: [], avisos: [] }
  const tablas = []
  for (const g of grupos) {
    const delGrupo = partidos.filter((p) => p.fase === 'grupo' && p.grupo_id === g.id)
    if (!delGrupo.length || !delGrupo.every(partidoCerrado)) return { cambios: [], avisos: [] }
    tablas.push({ letra: g.letra, tabla: ordenarGrupo(delGrupo, g.miembros) })
  }
  const empatados = tablas.filter((t) => t.tabla.slice(0, 2).some((f) => f.requiere_sorteo)).map((t) => t.letra)
  if (empatados.length) {
    return { cambios: [], avisos: empatados.map((l) => `Grupo ${l}: el 1º o el 2º sigue empatado — falta el desempate del admin`) }
  }
  const orden = ordenarPrimeros(tablas.map((t) => ({ letra: t.letra, fila: t.tabla[0] })))
  const tablaDe = new Map(tablas.map((t) => [t.letra, t.tabla]))

  const cambios: CambioAvance[] = []
  for (const p of llave) {
    for (const lado of lados) {
      const o = parsearOrigen(origenDe(p, lado) ?? '')
      if (o?.tipo !== 'mejor_primero' && o?.tipo !== 'segundo_de_mejor') continue
      const letra = orden[o.k - 1]?.letra
      const fila = letra ? tablaDe.get(letra)![o.tipo === 'mejor_primero' ? 0 : 1] : null
      if (fila && inscripcionDe(p, lado) !== fila.equipo_id) {
        cambios.push({ tipo: 'asignar', partidoId: p.id, lado, inscripcionId: fila.equipo_id })
      }
    }
  }
  return { cambios, avisos: [] }
}

// Al cerrar un partido de llave: su ganador va al partido cuyo origen es
// 'G:<codigo>'. Si fue doble WO no pasa nadie, y el partido siguiente se
// resuelve con pasesPorVacante.
export function avanceLlave(partido: PartidoAvance, llave: PartidoAvance[]): ResultadoAvance {
  const codigo = codigoLlave(partido)
  if (!codigo || !partidoCerrado(partido)) return { cambios: [], avisos: [] }
  const cambios: CambioAvance[] = []
  for (const p of llave) {
    for (const lado of lados) {
      if (origenDe(p, lado) !== `G:${codigo}`) continue
      if (partido.ganador_equipo_id && inscripcionDe(p, lado) !== partido.ganador_equipo_id) {
        cambios.push({ tipo: 'asignar', partidoId: p.id, lado, inscripcionId: partido.ganador_equipo_id })
      }
    }
  }
  return { cambios, avisos: [] }
}

// Partidos de llave que no se pueden jugar porque un lado (o los dos)
// viene de un doble WO ya cerrado: con un solo clasificado, pasa por WO;
// sin ninguno, queda como doble WO. Solo mira partidos aún sin cerrar.
export function pasesPorVacante(llave: PartidoAvance[]): CambioAvance[] {
  const porCodigo = new Map(llave.map((p) => [codigoLlave(p), p]))
  const vacante = (p: PartidoAvance, lado: Lado) => {
    const o = parsearOrigen(origenDe(p, lado) ?? '')
    if (o?.tipo !== 'ganador') return false
    const origen = porCodigo.get(o.codigo)
    return !!origen && partidoCerrado(origen) && origen.estado === 'doble_wo'
  }

  const cambios: CambioAvance[] = []
  for (const p of llave) {
    if (partidoCerrado(p)) continue
    const va = vacante(p, 'a')
    const vb = vacante(p, 'b')
    if (va && vb) cambios.push({ tipo: 'doble_wo', partidoId: p.id })
    else if (va && p.equipo_b) cambios.push({ tipo: 'pase', partidoId: p.id, ganador: p.equipo_b })
    else if (vb && p.equipo_a) cambios.push({ tipo: 'pase', partidoId: p.id, ganador: p.equipo_a })
  }
  return cambios
}

// ---------------------------------------------------------------------------
// Marcador para mostrar
// ---------------------------------------------------------------------------

// Texto del marcador desde el lado de equipo_a: "6-3 4-6 [10-8]",
// "7-6(7-4) 6-2", "6-2 1-3 ret.", "WO", "Doble WO" o "Pasa por WO" (rival
// vacante por un doble WO). null si no hay resultado.
export function textoMarcador(p: Pick<PartidoAvance, 'estado' | 'sets' | 'tipo_resultado' | 'wo_ausente_equipo_id'>): string | null {
  if (p.estado === 'doble_wo') return 'Doble WO'
  if (p.estado === 'wo') return p.wo_ausente_equipo_id ? 'WO' : 'Pasa por WO'
  if (!p.sets?.length) return null
  const sets = p.sets.map((s) => {
    if (s.es_super_tiebreak) return `[${s.games_j1}-${s.games_j2}]`
    const tb = s.tiebreak_retador != null && s.tiebreak_retado != null ? `(${s.tiebreak_retador}-${s.tiebreak_retado})` : ''
    return `${s.games_j1}-${s.games_j2}${tb}`
  })
  return sets.join(' ') + (p.tipo_resultado === 'retiro' ? ' ret.' : '')
}
