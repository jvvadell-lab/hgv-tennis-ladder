import { describe, expect, it } from 'vitest'
import type { SetJugado } from './resultados'
import {
  crucesTodosContraTodos,
  distribuirSerpentina,
  generarLlave,
  ordenarGrupo,
  parsearOrigen,
  validarMarcadorTorneo,
  type PartidoParaTabla,
} from './torneo'

// --- Helpers ---------------------------------------------------------------

const set = (numero: number, j1: number, j2: number, tb?: [number, number]): SetJugado => ({
  numero, games_j1: j1, games_j2: j2, completo: true,
  ...(tb ? { tiebreak_retador: tb[0], tiebreak_retado: tb[1] } : {}),
})
const st = (j1: number, j2: number): SetJugado => ({ numero: 3, games_j1: j1, games_j2: j2, completo: true, es_super_tiebreak: true })

// Partido jugado y validado; el ganador sale de los sets.
function jugado(a: string, b: string, sets: SetJugado[]): PartidoParaTabla {
  const ultimo = sets[sets.length - 1]
  const setsA = sets.filter((s) => s.games_j1 > s.games_j2).length
  const ganaA = ultimo.es_super_tiebreak ? ultimo.games_j1 > ultimo.games_j2 : setsA === 2
  return {
    inscripcion_a: a, inscripcion_b: b, estado: 'jugado', validado: true, sets,
    tipo_resultado: 'normal', retirada_inscripcion_id: null,
    ganador_inscripcion_id: ganaA ? a : b, wo_ausente_inscripcion_id: null,
  }
}
const g2_0 = (a: string, b: string, ga = 6, gb = 0) => jugado(a, b, [set(1, ga, gb), set(2, ga, gb)])

const miembros = (...ids: string[]) => ids.map((id) => ({ inscripcion_id: id, desempate_manual: null }))
const orden = (filas: { inscripcion_id: string }[]) => filas.map((f) => f.inscripcion_id)

// --- Serpentina ------------------------------------------------------------

describe('distribuirSerpentina', () => {
  const siembras = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

  it('12 parejas en 4 grupos', () => {
    expect(distribuirSerpentina(siembras(12), 4)).toEqual([[1, 8, 9], [2, 7, 10], [3, 6, 11], [4, 5, 12]])
  })

  it('8 jugadores en 2 grupos', () => {
    expect(distribuirSerpentina(siembras(8), 2)).toEqual([[1, 4, 5, 8], [2, 3, 6, 7]])
  })

  it('rechaza un número de grupos inválido', () => {
    expect(() => distribuirSerpentina([1, 2], 0)).toThrow()
  })
})

// --- Round robin -----------------------------------------------------------

describe('crucesTodosContraTodos', () => {
  for (const n of [3, 4]) {
    it(`grupo de ${n}: cada par se cruza una vez y nadie juega dos veces por ronda`, () => {
      const cruces = crucesTodosContraTodos(n)
      expect(cruces).toHaveLength((n * (n - 1)) / 2)

      const pares = new Set(cruces.map((c) => `${c.a}-${c.b}`))
      expect(pares.size).toBe(cruces.length)
      for (const c of cruces) expect(c.a).toBeLessThan(c.b)

      const rondas = new Map<number, number[]>()
      for (const c of cruces) rondas.set(c.ronda, [...(rondas.get(c.ronda) ?? []), c.a, c.b])
      expect(rondas.size).toBe(3)
      for (const jugadores of rondas.values()) expect(new Set(jugadores).size).toBe(jugadores.length)

      expect(cruces.map((c) => c.orden)).toEqual(cruces.map((_, i) => i + 1))
    })
  }

  it('grupo de 4 → 3 rondas de 2 partidos', () => {
    const porRonda = crucesTodosContraTodos(4).reduce<Record<number, number>>((acc, c) => ({ ...acc, [c.ronda]: (acc[c.ronda] ?? 0) + 1 }), {})
    expect(porRonda).toEqual({ 1: 2, 2: 2, 3: 2 })
  })
})

// --- Llave -----------------------------------------------------------------

describe('generarLlave', () => {
  const resumen = (n: number, desde: 'cuartos' | 'semis' | 'final') =>
    generarLlave(n, desde).map((p) => `${p.codigo}=${p.origen_a}/${p.origen_b}`)

  it('dobles: 4 grupos desde cuartos', () => {
    expect(resumen(4, 'cuartos')).toEqual([
      'C1=1A/2B', 'C2=1C/2D', 'C3=1B/2A', 'C4=1D/2C',
      'S1=G:C1/G:C2', 'S2=G:C3/G:C4',
      'F1=G:S1/G:S2',
    ])
  })

  it('single: 2 grupos desde semis', () => {
    expect(resumen(2, 'semis')).toEqual(['S1=1A/2B', 'S2=1B/2A', 'F1=G:S1/G:S2'])
  })

  it('fase y orden de cada partido', () => {
    const llave = generarLlave(2, 'semis')
    expect(llave.map((p) => [p.fase, p.orden])).toEqual([['semis', 1], ['semis', 2], ['final', 1]])
  })

  it('infantil de 5–7: 1 grupo y final directa 1A-2A', () => {
    expect(resumen(1, 'final')).toEqual(['F1=1A/2A'])
  })

  it('rechaza grupos que no cuadran con la llave', () => {
    expect(() => generarLlave(2, 'final')).toThrow()
    expect(() => generarLlave(2, 'cuartos')).toThrow()
    expect(() => generarLlave(4, 'semis')).toThrow()
  })
})

describe('parsearOrigen', () => {
  it('posición de grupo y ganador de partido', () => {
    expect(parsearOrigen('1A')).toEqual({ tipo: 'grupo', puesto: 1, letra: 'A' })
    expect(parsearOrigen('2D')).toEqual({ tipo: 'grupo', puesto: 2, letra: 'D' })
    expect(parsearOrigen('G:C3')).toEqual({ tipo: 'ganador', codigo: 'C3' })
    expect(parsearOrigen('G:F1')).toEqual({ tipo: 'ganador', codigo: 'F1' })
  })

  it('rechaza basura', () => {
    expect(parsearOrigen('')).toBeNull()
    expect(parsearOrigen('1a')).toBeNull()
    expect(parsearOrigen('G:X1')).toBeNull()
  })
})

// --- Marcador --------------------------------------------------------------

describe('validarMarcadorTorneo', () => {
  it('acepta 2-0 y 1-1 con Súper tie-break', () => {
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 7, 5)], 'normal')).toBeNull()
    expect(validarMarcadorTorneo([set(1, 7, 6, [7, 4]), set(2, 6, 0)], 'normal')).toBeNull()
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 3, 6), st(10, 8)], 'normal')).toBeNull()
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 3, 6), st(12, 10)], 'normal')).toBeNull()
  })

  it('rechaza sets que no son marcador real', () => {
    expect(validarMarcadorTorneo([set(1, 6, 5), set(2, 6, 0)], 'normal')).not.toBeNull()
    expect(validarMarcadorTorneo([set(1, 7, 6), set(2, 6, 0)], 'normal')).not.toBeNull() // 7-6 sin tie-break
    expect(validarMarcadorTorneo([set(1, 8, 6), set(2, 6, 0)], 'normal')).not.toBeNull()
  })

  it('1-1 exige Súper tie-break válido', () => {
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 3, 6)], 'normal')).not.toBeNull()
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 3, 6), st(10, 9)], 'normal')).not.toBeNull()
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 3, 6), st(9, 7)], 'normal')).not.toBeNull()
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 3, 6), set(3, 6, 2)], 'normal')).not.toBeNull()
  })

  it('2-0 no admite 3er set', () => {
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 6, 4), st(10, 5)], 'normal')).not.toBeNull()
  })

  it('Súper tie-break no puede ser set 1 o 2', () => {
    expect(validarMarcadorTorneo([{ ...st(10, 5), numero: 1 }, set(2, 6, 4)], 'normal')).not.toBeNull()
  })

  it('retiro: acepta lo jugado hasta el retiro', () => {
    expect(validarMarcadorTorneo([set(1, 6, 2), { numero: 2, games_j1: 3, games_j2: 1, completo: false }], 'retiro')).toBeNull()
    expect(validarMarcadorTorneo([{ numero: 1, games_j1: 2, games_j2: 1, completo: false }], 'retiro')).toBeNull()
    expect(validarMarcadorTorneo([set(1, 6, 4), set(2, 3, 6), { ...st(5, 3), completo: false }], 'retiro')).toBeNull()
  })
})

// --- Tabla del grupo -------------------------------------------------------

describe('ordenarGrupo', () => {
  it('sin empate: por partidos ganados', () => {
    const tabla = ordenarGrupo([g2_0('X', 'Y'), g2_0('X', 'Z'), g2_0('Y', 'Z')], miembros('Z', 'Y', 'X'))
    expect(orden(tabla)).toEqual(['X', 'Y', 'Z'])
    expect(tabla[0]).toMatchObject({ posicion: 1, pj: 2, pg: 2, pp: 0, sets_favor: 4, sets_contra: 0, games_favor: 24, games_contra: 0, requiere_sorteo: false })
    expect(tabla[2]).toMatchObject({ posicion: 3, pg: 0, pp: 2 })
  })

  it('empate doble: decide el resultado entre ellas aunque la otra tenga mejor diferencia', () => {
    const partidos = [
      jugado('P1', 'P2', [set(1, 6, 4), set(2, 6, 4)]),
      g2_0('P3', 'P1'),
      jugado('P1', 'P4', [set(1, 6, 4), set(2, 4, 6), st(10, 8)]),
      g2_0('P2', 'P3'),
      g2_0('P2', 'P4'),
      g2_0('P4', 'P3'),
    ]
    const tabla = ordenarGrupo(partidos, miembros('P1', 'P2', 'P3', 'P4'))
    // P2 tiene +2 sets más que P1, pero P1 le ganó.
    expect(orden(tabla)).toEqual(['P1', 'P2', 'P4', 'P3'])
  })

  it('triple empate 1-1-1 resuelto por diferencia de sets', () => {
    const partidos = [
      g2_0('A', 'B'),                                            // A +2
      g2_0('B', 'C'),                                            // B +2
      jugado('C', 'A', [set(1, 6, 4), set(2, 4, 6), st(10, 6)]), // C +1, A −1
    ]
    const tabla = ordenarGrupo(partidos, miembros('C', 'B', 'A'))
    // A: 3-2 (+1) · B: 2-2 (0) · C: 2-3 (−1)
    expect(orden(tabla)).toEqual(['A', 'B', 'C'])
    expect(tabla.every((f) => f.pg === 1 && !f.requiere_sorteo)).toBe(true)
  })

  it('súper tie-break: vale 1 set y 1-0 en games; sus puntos se registran aparte para revisar empates', () => {
    const tabla = ordenarGrupo([jugado('C', 'A', [set(1, 6, 4), set(2, 4, 6), st(10, 6)])], miembros('C', 'A'))
    const c = tabla.find((f) => f.inscripcion_id === 'C')!
    expect([c.sets_favor, c.sets_contra, c.games_favor, c.games_contra]).toEqual([2, 1, 11, 10])
    expect([c.stb_puntos_favor, c.stb_puntos_contra]).toEqual([10, 6])
  })

  it('triple empate resuelto por diferencia de games', () => {
    const partidos = [
      g2_0('A', 'B', 6, 0), // A 12-0
      g2_0('B', 'C', 6, 4), // B 12-8
      g2_0('C', 'A', 6, 3), // C 12-6
    ]
    // Sets: todas 2-2. Games: A 18-12 (+6) · C 20-18 (+2) · B 12-20 (−8)
    const tabla = ordenarGrupo(partidos, miembros('A', 'B', 'C'))
    expect(orden(tabla)).toEqual(['A', 'C', 'B'])
    expect(tabla.map((f) => f.games_favor - f.games_contra)).toEqual([6, 2, -8])
  })

  it('empate total: pide sorteo, y lo resuelve con desempate_manual', () => {
    const partidos = [g2_0('A', 'B'), g2_0('B', 'C'), g2_0('C', 'A')]

    const sinSorteo = ordenarGrupo(partidos, miembros('A', 'B', 'C'))
    expect(sinSorteo.every((f) => f.requiere_sorteo)).toBe(true)

    const conSorteo = ordenarGrupo(partidos, [
      { inscripcion_id: 'A', desempate_manual: 3 },
      { inscripcion_id: 'B', desempate_manual: 1 },
      { inscripcion_id: 'C', desempate_manual: 2 },
    ])
    expect(orden(conSorteo)).toEqual(['B', 'C', 'A'])
    expect(conSorteo.some((f) => f.requiere_sorteo)).toBe(false)
  })

  it('WO cuenta 2-0 en sets y 12-0 en games para el presente', () => {
    const wo: PartidoParaTabla = {
      inscripcion_a: 'A', inscripcion_b: 'B', estado: 'wo', validado: true, sets: null,
      tipo_resultado: 'normal', retirada_inscripcion_id: null,
      ganador_inscripcion_id: 'B', wo_ausente_inscripcion_id: 'A',
    }
    const tabla = ordenarGrupo([wo], miembros('A', 'B'))
    expect(tabla[0]).toMatchObject({ inscripcion_id: 'B', pg: 1, sets_favor: 2, sets_contra: 0, games_favor: 12, games_contra: 0 })
    expect(tabla[1]).toMatchObject({ inscripcion_id: 'A', pp: 1, sets_favor: 0, sets_contra: 2, games_favor: 0, games_contra: 12 })
  })

  it('doble WO: partido perdido para las dos, sin sets ni games', () => {
    const dobleWo: PartidoParaTabla = {
      inscripcion_a: 'A', inscripcion_b: 'B', estado: 'doble_wo', validado: true, sets: null,
      tipo_resultado: 'normal', retirada_inscripcion_id: null,
      ganador_inscripcion_id: null, wo_ausente_inscripcion_id: null,
    }
    const tabla = ordenarGrupo([dobleWo], miembros('A', 'B'))
    for (const f of tabla) expect(f).toMatchObject({ pj: 1, pg: 0, pp: 1, sets_favor: 0, games_favor: 0 })
  })

  it('ignora partidos sin validar o sin jugar', () => {
    const pendiente = { ...g2_0('B', 'A'), validado: false }
    const programado = { ...g2_0('B', 'A'), estado: 'programado' as const }
    const tabla = ordenarGrupo([g2_0('A', 'B'), pendiente, programado], miembros('A', 'B'))
    expect(orden(tabla)).toEqual(['A', 'B'])
    expect(tabla[0].pj).toBe(1)
  })

  it('retiro: se le completa el partido al ganador', () => {
    // B se retira 2-6, 1-0 para A → A cierra el set 2 (6-0) y gana el Súper tie-break (1-0).
    const retiro: PartidoParaTabla = {
      inscripcion_a: 'A', inscripcion_b: 'B', estado: 'jugado', validado: true,
      sets: [set(1, 2, 6), { numero: 2, games_j1: 1, games_j2: 0, completo: false }],
      tipo_resultado: 'retiro', retirada_inscripcion_id: 'B',
      ganador_inscripcion_id: 'A', wo_ausente_inscripcion_id: null,
    }
    const [a, b] = ordenarGrupo([retiro], miembros('A', 'B'))
    expect(a).toMatchObject({ inscripcion_id: 'A', sets_favor: 2, sets_contra: 1, games_favor: 2 + 6 + 1, games_contra: 6 })
    expect(b).toMatchObject({ inscripcion_id: 'B', sets_favor: 1, sets_contra: 2 })
  })

  it('retiro con el rival en 5 games: el set se cierra 7-5', () => {
    const retiro: PartidoParaTabla = {
      inscripcion_a: 'A', inscripcion_b: 'B', estado: 'jugado', validado: true,
      sets: [set(1, 6, 1), { numero: 2, games_j1: 5, games_j2: 5, completo: false }],
      tipo_resultado: 'retiro', retirada_inscripcion_id: 'B',
      ganador_inscripcion_id: 'A', wo_ausente_inscripcion_id: null,
    }
    const [a] = ordenarGrupo([retiro], miembros('A', 'B'))
    expect(a).toMatchObject({ sets_favor: 2, sets_contra: 0, games_favor: 6 + 7, games_contra: 1 + 5 })
  })
})
