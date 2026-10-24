import { describe, expect, it } from 'vitest'
import { generarLlave, ordenarPrimeros } from './torneo'
import type { SetJugado } from './resultados'
import { avanceGrupo, avanceLlave, avanceMejoresPrimeros, codigoLlave, evaluarReporte, pasesPorVacante, textoMarcador, type PartidoAvance } from './torneoResultados'

const set = (numero: number, a: number, b: number, extra: Partial<SetJugado> = {}): SetJugado => ({ numero, games_j1: a, games_j2: b, completo: true, ...extra })
const stb = (a: number, b: number): SetJugado => ({ numero: 3, games_j1: a, games_j2: b, completo: true, es_super_tiebreak: true })

const base: PartidoAvance = {
  id: 'p', fase: 'grupo', grupo_id: 'gA', orden: 1, origen_a: null, origen_b: null,
  equipo_a: 'a', equipo_b: 'b', estado: 'programado', validado: false,
  sets: null, tipo_resultado: 'normal', retirada_equipo_id: null, ganador_equipo_id: null, wo_ausente_equipo_id: null,
}

describe('evaluarReporte', () => {
  const evaluar = (d: Partial<Parameters<typeof evaluarReporte>[1]>, p: Partial<PartidoAvance> = {}) =>
    evaluarReporte({ ...base, ...p }, { sets: [set(1, 6, 3), set(2, 6, 4)], tipoResultado: 'normal', retiradaInscripcionId: null, ...d })

  it('gana quien gana 2 sets', () => {
    expect(evaluar({})).toEqual({ ok: true, ganador: 'a' })
    expect(evaluar({ sets: [set(1, 3, 6), set(2, 4, 6)] })).toEqual({ ok: true, ganador: 'b' })
  })
  it('1-1 se define con el Super Tiebreak', () => {
    expect(evaluar({ sets: [set(1, 6, 3), set(2, 4, 6), stb(8, 10)] })).toEqual({ ok: true, ganador: 'b' })
    expect(evaluar({ sets: [set(1, 6, 3), set(2, 4, 6)] })).toMatchObject({ ok: false })
  })
  it('retiro: gana la otra inscripción, con lo jugado', () => {
    const sets = [set(1, 6, 2), { numero: 2, games_j1: 1, games_j2: 3, completo: false }]
    expect(evaluar({ sets, tipoResultado: 'retiro', retiradaInscripcionId: 'a' })).toEqual({ ok: true, ganador: 'b' })
    expect(evaluar({ sets, tipoResultado: 'retiro', retiradaInscripcionId: null })).toMatchObject({ ok: false, error: /quién se retiró/ })
    expect(evaluar({ retiradaInscripcionId: 'a' })).toMatchObject({ ok: false, error: /Solo un retiro/ })
  })
  it('rechaza partidos sin rivales, ya validados o cerrados por WO', () => {
    expect(evaluar({}, { equipo_b: null })).toMatchObject({ ok: false, error: /rivales/ })
    expect(evaluar({}, { validado: true })).toMatchObject({ ok: false, error: /ya tiene/ })
    expect(evaluar({}, { estado: 'wo' })).toMatchObject({ ok: false, error: /WO/ })
  })
  it('rechaza marcadores mal formados', () => {
    expect(evaluar({ sets: [set(1, 6, 3), set(2, 6, 4), stb(10, 3)] })).toMatchObject({ ok: false })
    expect(evaluar({ sets: [] })).toMatchObject({ ok: false })
  })
})

// --- Llave de dobles: 4 grupos de 3 → cuartos, semis y final ---------------

const llaveDe = (n: number, desde: 'cuartos' | 'semis') =>
  generarLlave(n, desde).map((l): PartidoAvance => ({
    ...base, id: l.codigo, fase: l.fase, grupo_id: null, orden: l.orden,
    origen_a: l.origen_a, origen_b: l.origen_b, equipo_a: null, equipo_b: null, estado: 'pendiente',
  }))

const jugado = (id: string, a: string, b: string, ganador: string, sets: SetJugado[], extra: Partial<PartidoAvance> = {}): PartidoAvance => ({
  ...base, id, equipo_a: a, equipo_b: b, estado: 'jugado', validado: true, sets, ganador_equipo_id: ganador, ...extra,
})

const grupoA = { id: 'gA', letra: 'A' }
const miembrosA = ['a1', 'a2', 'a3'].map((equipo_id) => ({ equipo_id, desempate_manual: null }))

describe('avanceGrupo', () => {
  const llave = llaveDe(4, 'cuartos')
  const partidosA = [
    jugado('g1', 'a1', 'a2', 'a1', [set(1, 6, 2), set(2, 6, 3)]),
    jugado('g2', 'a1', 'a3', 'a1', [set(1, 6, 4), set(2, 6, 4)]),
    jugado('g3', 'a2', 'a3', 'a2', [set(1, 6, 1), set(2, 6, 1)]),
  ]

  it('con el grupo completo llena 1A y 2A en los cuartos', () => {
    const r = avanceGrupo(grupoA, partidosA, miembrosA, llave)
    expect(r.avisos).toEqual([])
    expect(r.cambios).toEqual([
      { tipo: 'asignar', partidoId: 'C1', lado: 'a', inscripcionId: 'a1' },   // C1 = 1A vs 2B
      { tipo: 'asignar', partidoId: 'C3', lado: 'b', inscripcionId: 'a2' },   // C3 = 1B vs 2A
    ])
  })

  it('no hace nada si falta un partido del grupo', () => {
    const r = avanceGrupo(grupoA, [...partidosA.slice(0, 2), { ...partidosA[2], validado: false }], miembrosA, llave)
    expect(r.cambios).toEqual([])
  })

  it('triple empate resuelto por sets: pasan los dos mejores por score', () => {
    // a1 > a2 2-0, a2 > a3 2-1 (STB), a3 > a1 2-0 → 1-1-1. Sets: a1 +0, a2 +1, a3 -1.
    const triple = [
      jugado('g1', 'a1', 'a2', 'a1', [set(1, 6, 4), set(2, 6, 4)]),
      jugado('g2', 'a2', 'a3', 'a2', [set(1, 6, 3), set(2, 3, 6), stb(10, 7)]),
      jugado('g3', 'a3', 'a1', 'a3', [set(1, 6, 3), set(2, 6, 3)]),
    ]
    const r = avanceGrupo(grupoA, triple, miembrosA, llave)
    const asignados = r.cambios.map((c) => (c.tipo === 'asignar' ? c.inscripcionId : null))
    expect(asignados).toHaveLength(2)
    expect(new Set(asignados).size).toBe(2)
    expect(r.avisos).toEqual([])
  })

  it('empate total sin desempate manual: no llena ese puesto y avisa', () => {
    const iguales = [
      jugado('g1', 'a1', 'a2', 'a1', [set(1, 6, 4), set(2, 6, 4)]),
      jugado('g2', 'a2', 'a3', 'a2', [set(1, 6, 4), set(2, 6, 4)]),
      jugado('g3', 'a3', 'a1', 'a3', [set(1, 6, 4), set(2, 6, 4)]),
    ]
    const r = avanceGrupo(grupoA, iguales, miembrosA, llave)
    expect(r.cambios).toEqual([])
    expect(r.avisos.join(' ')).toMatch(/Grupo A.*desempate/)
  })

  it('con desempate manual del admin sí llena', () => {
    const iguales = [
      jugado('g1', 'a1', 'a2', 'a1', [set(1, 6, 4), set(2, 6, 4)]),
      jugado('g2', 'a2', 'a3', 'a2', [set(1, 6, 4), set(2, 6, 4)]),
      jugado('g3', 'a3', 'a1', 'a3', [set(1, 6, 4), set(2, 6, 4)]),
    ]
    const miembros = [
      { equipo_id: 'a1', desempate_manual: 2 },
      { equipo_id: 'a2', desempate_manual: 3 },
      { equipo_id: 'a3', desempate_manual: 1 },
    ]
    const r = avanceGrupo(grupoA, iguales, miembros, llave)
    expect(r.cambios).toEqual([
      { tipo: 'asignar', partidoId: 'C1', lado: 'a', inscripcionId: 'a3' },
      { tipo: 'asignar', partidoId: 'C3', lado: 'b', inscripcionId: 'a1' },
    ])
  })

  it('WO y doble WO cuentan para cerrar el grupo', () => {
    const conWo = [
      jugado('g1', 'a1', 'a2', 'a1', [set(1, 6, 2), set(2, 6, 3)]),
      { ...base, id: 'g2', equipo_a: 'a1', equipo_b: 'a3', estado: 'wo' as const, validado: true, ganador_equipo_id: 'a1', wo_ausente_equipo_id: 'a3' },
      { ...base, id: 'g3', equipo_a: 'a2', equipo_b: 'a3', estado: 'doble_wo' as const, validado: true },
    ]
    // a1 2 PG; a2 y a3 0 PG; a2 perdió 0-2 en sets, a3 perdió por WO 0-2 → empate por sets y games:
    // a2 games 5-12 (-7) vs a3 0-12 (-12) → 2º a2.
    const r = avanceGrupo(grupoA, conWo, miembrosA, llave)
    expect(r.cambios).toEqual([
      { tipo: 'asignar', partidoId: 'C1', lado: 'a', inscripcionId: 'a1' },
      { tipo: 'asignar', partidoId: 'C3', lado: 'b', inscripcionId: 'a2' },
    ])
  })

  it('no repite asignaciones que ya están hechas', () => {
    const yaLlena = llave.map((p) => (p.id === 'C1' ? { ...p, equipo_a: 'a1' } : p))
    const r = avanceGrupo(grupoA, partidosA, miembrosA, yaLlena)
    expect(r.cambios.map((c) => c.partidoId)).toEqual(['C3'])
  })
})

describe('avanceLlave', () => {
  const llave = llaveDe(4, 'cuartos')
  it('el ganador de C1 va a S1 lado a; el de C2 a S1 lado b; el de S2 a la final', () => {
    const c1 = { ...llave.find((p) => p.id === 'C1')!, equipo_a: 'x', equipo_b: 'y', estado: 'jugado' as const, validado: true, ganador_equipo_id: 'y' }
    expect(avanceLlave(c1, llave).cambios).toEqual([{ tipo: 'asignar', partidoId: 'S1', lado: 'a', inscripcionId: 'y' }])
    const c2 = { ...llave.find((p) => p.id === 'C2')!, equipo_a: 'u', equipo_b: 'v', estado: 'wo' as const, validado: true, ganador_equipo_id: 'u', wo_ausente_equipo_id: 'v' }
    expect(avanceLlave(c2, llave).cambios).toEqual([{ tipo: 'asignar', partidoId: 'S1', lado: 'b', inscripcionId: 'u' }])
    const s2 = { ...llave.find((p) => p.id === 'S2')!, equipo_a: 'm', equipo_b: 'n', estado: 'jugado' as const, validado: true, ganador_equipo_id: 'm' }
    expect(avanceLlave(s2, llave).cambios).toEqual([{ tipo: 'asignar', partidoId: 'F1', lado: 'b', inscripcionId: 'm' }])
  })
  it('sin validar o en la final no avanza a ningún lado', () => {
    const c1 = { ...llave.find((p) => p.id === 'C1')!, equipo_a: 'x', equipo_b: 'y', estado: 'jugado' as const, validado: false, ganador_equipo_id: 'y' }
    expect(avanceLlave(c1, llave).cambios).toEqual([])
    const f = { ...llave.find((p) => p.id === 'F1')!, equipo_a: 'x', equipo_b: 'y', estado: 'jugado' as const, validado: true, ganador_equipo_id: 'y' }
    expect(avanceLlave(f, llave).cambios).toEqual([])
  })
  it('códigos de la llave', () => {
    expect(llave.map((p) => codigoLlave(p))).toEqual(['C1', 'C2', 'C3', 'C4', 'S1', 'S2', 'F1'])
  })
})

describe('pasesPorVacante (doble WO en la llave, SPEC §6 por defecto)', () => {
  const llave = llaveDe(4, 'cuartos')
  const conDobleWo = (id: string) => ({ ...llave.find((p) => p.id === id)!, equipo_a: 'x', equipo_b: 'y', estado: 'doble_wo' as const, validado: true })

  it('el presente pasa por WO cuando el rival venía de un doble WO', () => {
    const l = llave.map((p) => (p.id === 'C1' ? conDobleWo('C1') : p.id === 'S1' ? { ...p, equipo_b: 'ganadorC2' } : p))
    expect(pasesPorVacante(l)).toEqual([{ tipo: 'pase', partidoId: 'S1', ganador: 'ganadorC2' }])
  })
  it('espera mientras el otro lado no se conoce', () => {
    const l = llave.map((p) => (p.id === 'C1' ? conDobleWo('C1') : p))
    expect(pasesPorVacante(l)).toEqual([])
  })
  it('si los dos lados vienen de doble WO, el partido queda como doble WO', () => {
    const l = llave.map((p) => (p.id === 'C1' ? conDobleWo('C1') : p.id === 'C2' ? conDobleWo('C2') : p))
    expect(pasesPorVacante(l)).toEqual([{ tipo: 'doble_wo', partidoId: 'S1' }])
  })
})

describe('llave de single: 2 grupos → semis', () => {
  it('1A y 2A van a S1 y S2', () => {
    const llave = llaveDe(2, 'semis')
    const partidos = [
      jugado('g1', 'a1', 'a2', 'a1', [set(1, 6, 2), set(2, 6, 3)]),
      jugado('g2', 'a1', 'a3', 'a1', [set(1, 6, 4), set(2, 6, 4)]),
      jugado('g3', 'a2', 'a3', 'a2', [set(1, 6, 1), set(2, 6, 1)]),
    ]
    expect(avanceGrupo(grupoA, partidos, miembrosA, llave).cambios).toEqual([
      { tipo: 'asignar', partidoId: 'S1', lado: 'a', inscripcionId: 'a1' },
      { tipo: 'asignar', partidoId: 'S2', lado: 'b', inscripcionId: 'a2' },
    ])
  })
})

describe('textoMarcador', () => {
  const p = (x: Partial<PartidoAvance>) => ({ ...base, ...x })
  it('sets, tie-break, Super Tiebreak y retiro', () => {
    expect(textoMarcador(p({ estado: 'jugado', sets: [set(1, 6, 3), set(2, 4, 6), stb(10, 8)] }))).toBe('6-3 4-6 [10-8]')
    expect(textoMarcador(p({ estado: 'jugado', sets: [set(1, 7, 6, { tiebreak_retador: 7, tiebreak_retado: 4 }), set(2, 6, 2)] }))).toBe('7-6(7-4) 6-2')
    expect(textoMarcador(p({ estado: 'jugado', tipo_resultado: 'retiro', sets: [set(1, 6, 2), { numero: 2, games_j1: 1, games_j2: 3, completo: false }] }))).toBe('6-2 1-3 ret.')
  })
  it('WO, doble WO, pase y sin resultado', () => {
    expect(textoMarcador(p({ estado: 'wo', wo_ausente_equipo_id: 'b' }))).toBe('WO')
    expect(textoMarcador(p({ estado: 'wo' }))).toBe('Pasa por WO')
    expect(textoMarcador(p({ estado: 'doble_wo' }))).toBe('Doble WO')
    expect(textoMarcador(p({ estado: 'programado' }))).toBeNull()
  })
})

// --- Llave de 3 grupos: cuartos con 2 byes ----------------------------------

describe('avanceMejoresPrimeros (3 grupos)', () => {
  const llave = llaveDe(3, 'cuartos')
  // Grupo de 3: el 1º gana sus 2 partidos con el marcador dado; el 2º gana 1.
  const grupo3 = (g: string, l: string, setsPrimero: SetJugado[]): PartidoAvance[] => [
    { ...jugado(`${g}1`, `${l}1`, `${l}2`, `${l}1`, setsPrimero), grupo_id: g },
    { ...jugado(`${g}2`, `${l}1`, `${l}3`, `${l}1`, setsPrimero), grupo_id: g },
    { ...jugado(`${g}3`, `${l}2`, `${l}3`, `${l}2`, [set(1, 6, 4), set(2, 6, 4)]), grupo_id: g },
  ]
  const miembros = (l: string) => [1, 2, 3].map((k) => ({ equipo_id: `${l}${k}`, desempate_manual: null }))
  const grupos = ['A', 'B', 'C'].map((l) => ({ id: `g${l}`, letra: l, miembros: miembros(l.toLowerCase()) }))
  const partidos = [
    ...grupo3('gA', 'a', [set(1, 6, 4), set(2, 6, 4)]),   // A: dif. games +4 por partido
    ...grupo3('gB', 'b', [set(1, 6, 0), set(2, 6, 0)]),   // B: el mejor primero
    ...grupo3('gC', 'c', [set(1, 6, 2), set(2, 6, 2)]),   // C: segundo mejor
  ]

  it('los dos mejores primeros pasan directo a semis; los del mismo grupo en mitades opuestas', () => {
    const r = avanceMejoresPrimeros(grupos, partidos, llave)
    expect(r.avisos).toEqual([])
    const asignado = Object.fromEntries(r.cambios.map((c: any) => [`${c.partidoId}${c.lado}`, c.inscripcionId]))
    // P1 = b1, P2 = c1, P3 = a1 · C1 = P3 vs 2P2 · C2 = 2P1 vs 2P3 · S1 = P1 · S2 = P2
    expect(asignado).toEqual({ C1a: 'a1', C1b: 'c2', C2a: 'b2', C2b: 'a2', S1a: 'b1', S2a: 'c1' })
  })

  it('no hace nada hasta que todos los grupos estén completos', () => {
    const incompletos = partidos.map((p) => (p.id === 'gC3' ? { ...p, estado: 'programado' as const, validado: false } : p))
    expect(avanceMejoresPrimeros(grupos, incompletos, llave).cambios).toEqual([])
  })

  it('con grupos de distinto tamaño compara promedios por partido', () => {
    const fila = (pj: number, pg: number, sf: number, sc: number, gf: number, gc: number) => ({ pj, pg, sets_favor: sf, sets_contra: sc, games_favor: gf, games_contra: gc })
    const { orden, empatados } = ordenarPrimeros([
      { letra: 'A', fila: fila(3, 3, 6, 1, 38, 20) },   // grupo de 4: 3 de 3
      { letra: 'B', fila: fila(2, 2, 4, 0, 24, 6) },    // grupo de 3: 2 de 2, mejor diferencia por partido
      { letra: 'C', fila: fila(2, 1, 2, 2, 20, 18) },
    ])
    expect(orden.map((o) => o.letra)).toEqual(['B', 'A', 'C'])
    expect(empatados).toEqual([])
  })

  it('empate en todo: lo decide el admin; sin su orden, no avanza', () => {
    const fila = (pj: number, pg: number, sf: number, sc: number, gf: number, gc: number) => ({ pj, pg, sets_favor: sf, sets_contra: sc, games_favor: gf, games_contra: gc })
    const iguales = [
      { letra: 'A', fila: fila(2, 2, 4, 0, 24, 8) },
      { letra: 'B', fila: fila(2, 2, 4, 0, 24, 8) },
      { letra: 'C', fila: fila(2, 1, 2, 2, 20, 18) },
    ]
    expect(ordenarPrimeros(iguales).empatados).toEqual(['A', 'B'])
    const conAdmin = ordenarPrimeros(iguales, ['B', 'A', 'C'])
    expect(conAdmin.empatados).toEqual([])
    expect(conAdmin.orden.map((o) => o.letra)).toEqual(['B', 'A', 'C'])

    // Mismo marcador en los 3 grupos: los tres primeros empatan.
    const parejos = ['gA', 'gB', 'gC'].flatMap((g, i) => grupo3(g, 'abc'[i], [set(1, 6, 3), set(2, 6, 3)]))
    const sin = avanceMejoresPrimeros(grupos, parejos, llave)
    expect(sin.cambios).toEqual([])
    expect(sin.avisos.join()).toMatch(/desempate del admin/)
    const con = avanceMejoresPrimeros(grupos, parejos, llave, ['C', 'A', 'B'])
    expect(con.cambios.find((c: any) => c.partidoId === 'S1' && c.lado === 'a')).toMatchObject({ inscripcionId: 'c1' })
  })
})
