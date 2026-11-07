import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ALTO_DIA, ALTO_FILA, agruparPorDia, esFechaISO, filaDe, fechaCorta, fuenteNombresGrande, paginarDias, paginasDePieza, partidosDeLaSemana, partidosDelDia,
  porValidarEntre, semanaDe, sumarDias, textoSugerido, tipoPorDefecto, tituloDia, tituloSemana, type DiaDifusion, type FilaDifusion, type PartidoDifusion,
} from './torneoDifusion'

const base: PartidoDifusion = {
  id: 'p', categoria: 'Single Caballeros Quinta', formato_llave: 'normal', fase: 'grupo', grupo: 'A', orden: 1,
  origen_a: null, origen_b: null, equipo_a: 'a', equipo_b: 'b', nombre_a: 'Ana', nombre_b: 'Beto',
  cancha: 'HGV1', fecha_hora: '2026-11-06T22:30:00.000Z', estado: 'programado', validado: false, reportado: false,
  sets: null, tipo_resultado: 'normal', ganador: null, wo_ausente: null,
}
const sets = (...s: [number, number, boolean?][]) => s.map(([games_j1, games_j2, es_super_tiebreak], i) => ({ numero: i + 1, games_j1, games_j2, completo: true, es_super_tiebreak }))
const jugado = (o: Partial<PartidoDifusion>): PartidoDifusion => ({ ...base, estado: 'jugado', validado: true, sets: sets([6, 4], [3, 6], [10, 8, true]), ganador: 'a', ...o })

describe('fechas', () => {
  it('títulos en hora de Caracas', () => {
    expect(tituloDia('2026-11-06')).toBe('HOY EN LA COPA · VIE 6 NOV')
    expect(tituloSemana('2026-11-11')).toBe('PROGRAMACIÓN DE LA SEMANA · 9 AL 13 NOV')
    expect(tituloSemana('2026-11-30')).toBe('PROGRAMACIÓN DE LA SEMANA · 30 NOV AL 4 DIC')
    expect(fechaCorta('2026-11-09')).toBe('LUN 9 NOV')
  })
  it('la semana va de lunes a viernes y el fin de semana da la siguiente', () => {
    const semana = { lunes: '2026-11-09', viernes: '2026-11-13' }
    for (const f of ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-07', '2026-11-08']) expect(semanaDe(f)).toEqual(semana)
  })
  it('los lunes abre en la semana', () => {
    expect(tipoPorDefecto('2026-11-09')).toBe('semana')
    expect(tipoPorDefecto('2026-11-10')).toBe('dia')
  })
  it('valida el formato de fecha y suma días entre meses', () => {
    expect(esFechaISO('2026-11-06')).toBe(true)
    for (const f of ['2026-13-40', '6-11-2026', '', null]) expect(esFechaISO(f)).toBe(false)
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01')
  })
})

describe('partidosDelDia y partidosDeLaSemana', () => {
  it('día sin partidos', () => expect(partidosDelDia([base], '2026-11-07')).toEqual([]))
  it('ignora los partidos sin horario', () => expect(partidosDelDia([{ ...base, fecha_hora: null, cancha: null }], '2026-11-06')).toEqual([]))
  it('el día es el de Caracas, no el de UTC', () => {
    const p = { ...base, fecha_hora: '2026-11-07T00:30:00.000Z' }   // 20:30 del viernes en Caracas
    expect(partidosDelDia([p], '2026-11-06')).toHaveLength(1)
    expect(partidosDelDia([p], '2026-11-07')).toEqual([])
  })
  it('ordena por hora y luego por cancha', () => {
    const tarde = { ...base, id: 'tarde', fecha_hora: '2026-11-07T00:30:00.000Z' }
    const c2 = { ...base, id: 'c2', cancha: 'HGV2' }
    const c1 = { ...base, id: 'c1' }
    expect(partidosDelDia([tarde, c2, c1], '2026-11-06').map((f) => f.id)).toEqual(['c1', 'c2', 'tarde'])
  })
  it('la semana deja fuera lo demás y se agrupa por día', () => {
    const lunes = { ...base, id: 'l', fecha_hora: '2026-11-09T23:00:00.000Z' }
    const viernes = { ...base, id: 'v', fecha_hora: '2026-11-13T22:30:00.000Z' }
    const otra = { ...base, id: 'o', fecha_hora: '2026-11-16T23:00:00.000Z' }
    const filas = partidosDeLaSemana([otra, viernes, lunes, base], '2026-11-11')
    expect(filas.map((f) => f.id)).toEqual(['l', 'v'])
    expect(agruparPorDia(filas).map((d) => d.fecha)).toEqual(['2026-11-09', '2026-11-13'])
  })
})

describe('filaDe', () => {
  it('programado: hora, cancha y etapa', () => {
    const f = filaDe(base)
    expect(f).toMatchObject({ hora: '18:30', cancha: 'Cancha 1', etapa: 'Grupo A', estado: 'programado', marcador: null })
    expect(f.a).toEqual({ texto: 'Ana', conocido: true, ganador: false, nota: null })
    expect(filaDe({ ...base, cancha: 'HGV2' }).cancha).toBe('Cancha 2')
  })
  it('etapas fuera de grupos', () => {
    expect(filaDe({ ...base, fase: 'semis', grupo: null }).etapa).toBe('Semifinal')
    expect(filaDe({ ...base, fase: 'final', grupo: null }).etapa).toBe('Final')
  })
  it('validado: ganador resaltado y marcador por sets, con el súper tie-break como tal', () => {
    const f = filaDe(jugado({}))
    expect(f.estado).toBe('jugado')
    expect(f.marcador).toBe('6-4 3-6 10-8')
    expect(f.a.ganador).toBe(true)
    expect(f.b.ganador).toBe(false)
  })
  it('el marcador va desde el lado del ganador', () => {
    expect(filaDe(jugado({ ganador: 'b', sets: sets([4, 6], [6, 3], [8, 10, true]) })).marcador).toBe('6-4 3-6 10-8')
    const tb = [{ numero: 1, games_j1: 6, games_j2: 7, completo: true, tiebreak_retador: 3, tiebreak_retado: 7 }]
    expect(filaDe(jugado({ ganador: 'b', sets: tb })).marcador).toBe('7-6(7-3)')
  })
  it('retiro: marcador + ret.', () => {
    expect(filaDe(jugado({ sets: sets([6, 2], [1, 0]), tipo_resultado: 'retiro' })).marcador).toBe('6-2 1-0 ret.')
  })
  it('WO: W.O. del lado presente', () => {
    const f = filaDe({ ...base, estado: 'wo', validado: true, ganador: 'b', wo_ausente: 'a' })
    expect(f.estado).toBe('wo')
    expect(f.b).toMatchObject({ ganador: true, nota: 'W.O.' })
    expect(f.a).toMatchObject({ ganador: false, nota: null })
    expect(f.marcador).toBeNull()
  })
  it('doble WO', () => {
    const f = filaDe({ ...base, estado: 'doble_wo', validado: true })
    expect(f).toMatchObject({ estado: 'doble_wo', marcador: 'Doble W.O.' })
    expect(f.a.ganador).toBe(false)
    expect(f.b.ganador).toBe(false)
  })
  it('reportado sin validar sale como programado, sin marcador', () => {
    const f = filaDe(jugado({ validado: false, reportado: true }))
    expect(f).toMatchObject({ estado: 'programado', marcador: null })
    expect(f.a.ganador).toBe(false)
  })
  it('un menor sale con el nombre público que trae el partido', () => {
    const f = filaDe({ ...base, nombre_a: 'Sofía M.' })
    expect(f.a.texto).toBe('Sofía M.')
    expect(JSON.stringify(f)).not.toContain('equipo_a')
  })
})

describe('formato cuadros', () => {
  const cuadros = { ...base, categoria: 'Mixto con handicap', formato_llave: 'cuadros' as const, grupo: 'C' }
  it('primera ronda: etapa y rótulos A y B', () => {
    const f = filaDe({ ...cuadros, estado: 'jugado', validado: true, sets: sets([6, 4], [6, 4]), ganador: 'b' })
    expect(f.etapa).toBe('Primera ronda · Partido 3')
    expect(f.b.nota).toBe('→ Cuadro A')
    expect(f.a.nota).toBe('→ Cuadro B')
  })
  it('WO en primera ronda: el presente al A, el ausente al B', () => {
    const f = filaDe({ ...cuadros, estado: 'wo', validado: true, ganador: 'a', wo_ausente: 'b' })
    expect(f.a.nota).toBe('W.O. → Cuadro A')
    expect(f.b.nota).toBe('→ Cuadro B')
  })
  it('sin rótulos mientras no esté validado, ni en doble WO, ni después de la primera ronda', () => {
    expect(filaDe(cuadros).a.nota).toBeNull()
    expect(filaDe({ ...cuadros, estado: 'doble_wo', validado: true }).a.nota).toBeNull()
    const cuartos = filaDe({ ...cuadros, fase: 'cuartos', grupo: null, orden: 5, estado: 'jugado', validado: true, sets: sets([6, 4], [6, 4]), ganador: 'a' })
    expect(cuartos.etapa).toBe('Cuadro B – Cuartos de final')
    expect(cuartos.a.nota).toBeNull()
  })
  it('lados sin rival conocido', () => {
    const sinRival = { ...base, equipo_a: null, equipo_b: null, nombre_a: null, nombre_b: null }
    const c = filaDe({ ...sinRival, formato_llave: 'cuadros', fase: 'cuartos', grupo: null, origen_a: '1A', origen_b: '1B' })
    expect(c.a).toMatchObject({ texto: 'Ganador Partido 1', conocido: false })
    expect(c.b.texto).toBe('Ganador Partido 2')
    expect(filaDe({ ...sinRival, formato_llave: 'cuadros', fase: 'cuartos', grupo: null, orden: 5, origen_a: '2A', origen_b: '2B' }).a.texto).toBe('Partido 1')
    expect(filaDe({ ...sinRival, formato_llave: 'cuadros', fase: 'semis', grupo: null, origen_a: 'G:C1', origen_b: 'G:C2' }).a.texto).toBe('Ganador C1')
    expect(filaDe({ ...sinRival, fase: 'semis', grupo: null, origen_a: 'G:C1', origen_b: '1A' }).a.texto).toBe('Gan. C1')
    expect(filaDe({ ...sinRival, fase: 'final', grupo: null }).a.texto).toBe('Por definir')
  })
})

describe('porValidarEntre', () => {
  it('cuenta solo lo reportado sin validar del rango', () => {
    const reportado = { ...base, estado: 'jugado', reportado: true }
    expect(porValidarEntre([reportado, reportado, base, jugado({ reportado: true })], '2026-11-06', '2026-11-06')).toBe(2)
    expect(porValidarEntre([reportado], '2026-11-07', '2026-11-08')).toBe(0)
  })
})

describe('paginarDias', () => {
  const dia = (fecha: string, n: number): DiaDifusion => ({ fecha, filas: Array.from({ length: n }, (_, i) => filaDe({ ...base, id: `${fecha}-${i}` })) })
  const filas = (p: DiaDifusion[]) => p.reduce((n, d) => n + d.filas.length, 0)

  it('sin partidos hay una página vacía', () => expect(paginarDias([], 1000, true)).toEqual([[]]))
  it('cabe en una página', () => expect(paginarDias([dia('x', 3)], ALTO_FILA * 3, false)).toHaveLength(1))
  it('pasa a otra página cuando no cabe, sin perder filas', () => {
    const p = paginarDias([dia('x', 7)], ALTO_FILA * 3, false)
    expect(p.map(filas)).toEqual([3, 3, 1])
  })
  it('un día partido repite su encabezado y nunca pasa del alto', () => {
    const alto = ALTO_DIA + ALTO_FILA * 2
    const p = paginarDias([dia('x', 3)], alto, true)
    expect(p.map((pag) => pag.map((d) => d.fecha))).toEqual([['x'], ['x']])
    expect(p.map(filas)).toEqual([2, 1])
  })
  it('un encabezado no queda solo al final de la página', () => {
    const p = paginarDias([dia('x', 2), dia('y', 1)], ALTO_DIA * 2 + ALTO_FILA * 2, true)
    expect(p.map((pag) => pag.map((d) => d.fecha))).toEqual([['x'], ['y']])
  })
})

describe('fuenteNombresGrande', () => {
  const fila = (texto: string, nota: string | null = null) => ({
    a: { texto, conocido: true, ganador: false, nota },
    b: { texto: 'Ana', conocido: true, ganador: false, nota: null },
  }) as FilaDifusion

  it('usa el máximo con nombres cortos', () => {
    expect(fuenteNombresGrande([fila('Luis Lopez')])).toBe(46)
  })
  it('baja para que quepa el nombre más largo de la pieza', () => {
    const larga = 'Javier Jesús Rodriguez Peña / Romina Román'
    expect(fuenteNombresGrande([fila('Luis Lopez'), fila(larga)])).toBe(40)
  })
  it('cuenta la nota del cuadro', () => {
    const texto = 'Carlos Olaizola / Sandra Madrigal'
    expect(fuenteNombresGrande([fila(texto, 'W.O. → Cuadro A')])).toBeLessThan(fuenteNombresGrande([fila(texto)]))
  })
  it('nunca baja del tamaño de las filas normales', () => {
    expect(fuenteNombresGrande([fila('x'.repeat(120))])).toBe(32)
  })
})

describe('paginasDePieza', () => {
  it('pagina según el formato', () => {
    const partidos = Array.from({ length: 12 }, (_, i) => ({ ...base, id: String(i) }))
    expect(paginasDePieza(partidos, 'dia', '2026-11-06', 'historia').length).toBeLessThan(paginasDePieza(partidos, 'dia', '2026-11-06', 'post').length)
  })
})

describe('textoSugerido', () => {
  it('del día, con los partidos y las etiquetas', () => {
    const t = textoSugerido([filaDe(base)], 'dia', '2026-11-06')
    expect(t).toContain('Hoy en la Copa Navidad HGV 2026 🎄🎾')
    expect(t).toContain('18:30 · Cancha 1 · Single Caballeros Quinta')
    expect(t).toContain('#TenisHGV #CopaNavidadHGV')
  })
  it('cambia cuando ya hay resultados', () => {
    expect(textoSugerido([filaDe(jugado({}))], 'dia', '2026-11-06')).toContain('resultados del día')
    expect(textoSugerido([filaDe(jugado({})), filaDe(base)], 'dia', '2026-11-06')).toContain('Así va la jornada')
  })
  it('de la semana y de un día sin partidos', () => {
    expect(textoSugerido([filaDe(base)], 'semana', '2026-11-11')).toContain('del 9 al 13 de noviembre')
    expect(textoSugerido([], 'dia', '2026-11-07')).toContain('no hay partidos')
  })
})

describe('lenguaje', () => {
  it('ningún texto dice perdedor, consolación ni juego', () => {
    const f = [filaDe(jugado({ formato_llave: 'cuadros' })), filaDe(base)]
    expect(textoSugerido(f, 'dia', '2026-11-06') + JSON.stringify(f)).not.toMatch(/perdedor|consolaci|juego/i)
  })
})

describe('logos de patrocinantes', () => {
  it('cada .webp tiene su .png: next/og no dibuja webp', () => {
    const webp = readdirSync('public/patrocinantes').filter((f) => f.endsWith('.webp')).map((f) => f.replace('.webp', ''))
    const png = readdirSync('public/patrocinantes/png').map((f) => f.replace('.png', ''))
    expect(png.sort()).toEqual(webp.sort())
  })
})
