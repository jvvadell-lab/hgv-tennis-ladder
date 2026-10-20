import { describe, expect, it } from 'vitest'
import { crucesTodosContraTodos } from './torneo'
import { armarSorteoCategoria, planCategoria, type CategoriaParaSorteo } from './torneoSorteo'
import {
  celdaDeTurno,
  dependenciasDe,
  proponerProgramacion,
  revisarHorario,
  turnosAdultos,
  turnosEnFranja,
  validarFranja,
  type ContextoProgramacion,
  type Franja,
  type Horario,
  type PartidoProg,
} from './torneoProgramacion'
import { diaDeLaSemanaEnCaracas, fechaISOEnCaracas, formatearHora, instanteEnCaracas } from './tiempo'

const TORNEO = { fecha_inicio: '2026-11-02', fecha_fin: '2026-12-11' }
const en = (fecha: string, hora: string) => instanteEnCaracas(fecha, hora).getTime()

// Partidos de una categoría a partir del sorteo real (lib/torneoSorteo.ts).
// Las inscripciones son jugadores 'j<categoria>-<k>' (o el id que se pase).
function partidosDe(
  cat: CategoriaParaSorteo & { duracion: number },
  personas: string[][],
): PartidoProg[] {
  const ins = personas.map((_, k) => ({ id: `${cat.id}-i${k + 1}`, siembra: k + 1, bombo: null }))
  const r = armarSorteoCategoria(cat, ins, 'serpentina')
  if (!r.ok) throw new Error(r.error)
  const plan = planCategoria(r.sorteo)
  const personasDe = new Map(ins.map((i, k) => [i.id, personas[k]]))
  return plan.partidos.map((p, k) => ({
    id: `${cat.id}-p${k + 1}`,
    categoriaId: cat.id,
    categoriaNombre: cat.nombre,
    categoriaOrden: cat.orden,
    esInfantil: cat.es_infantil,
    duracionMin: cat.duracion,
    fase: p.fase,
    grupoLetra: p.letra,
    orden: p.orden,
    ronda: p.fase === 'grupo' ? crucesTodosContraTodos(plan.grupos.find((g) => g.letra === p.letra)!.miembros.length)[p.orden - 1].ronda : null,
    origen_a: p.origen_a,
    origen_b: p.origen_b,
    personas: [p.inscripcion_a, p.inscripcion_b].filter(Boolean).flatMap((id) => personasDe.get(id!)!),
    cerrado: false,
  }))
}

const single = { id: 'sq', nombre: 'Single Quinta', es_infantil: false, num_grupos: 2, llave_desde: 'semis' as const, partidos_minimos: null, orden: 4, duracion: 90 }
const dobles = { id: 'dm', nombre: 'Doble Masculino', es_infantil: false, num_grupos: 4, llave_desde: 'cuartos' as const, partidos_minimos: null, orden: 1, duracion: 90 }
const naranja = { id: 'pn', nombre: 'Pelota Naranja', es_infantil: true, num_grupos: 4, llave_desde: 'sin_llave' as const, partidos_minimos: 3, orden: 11, duracion: 40 }

const jugadores = (prefijo: string, n: number, porInscripcion = 1) =>
  Array.from({ length: n }, (_, k) => Array.from({ length: porInscripcion }, (_, x) => `${prefijo}${k * porInscripcion + x + 1}`))

const ctxBase = (partidos: PartidoProg[], extra: Partial<ContextoProgramacion> = {}): ContextoProgramacion => ({
  fechaInicio: TORNEO.fecha_inicio, fechaFin: TORNEO.fecha_fin, partidos, franjas: [], ocupaciones: [], noDisponible: {}, ...extra,
})

const franja = (fecha: string, cancha: 'HGV1' | 'HGV2', desde: string, hasta: string, id = `${fecha}-${cancha}-${desde}`): Franja =>
  ({ id, fecha, cancha, hora_inicio: desde, hora_fin: hasta })

// --- Turnos ---------------------------------------------------------------------

describe('turnosAdultos', () => {
  it('plantilla del SPEC §4: lun 3 turnos, jue 3, vie 4, fin de semana nada', () => {
    const hora = (t: { cancha: string; inicio: number }) => `${formatearHora(new Date(t.inicio))} ${t.cancha}`
    expect(turnosAdultos('2026-11-02', '2026-11-02', 90).map(hora)).toEqual(['19:00 HGV2', '20:00 HGV1', '20:30 HGV2'])
    expect(turnosAdultos('2026-11-05', '2026-11-05', 90).map(hora)).toEqual(['19:00 HGV2', '20:30 HGV1', '20:30 HGV2'])
    expect(turnosAdultos('2026-11-06', '2026-11-06', 90).map(hora)).toEqual(['18:30 HGV1', '18:30 HGV2', '20:30 HGV1', '20:30 HGV2'])
    expect(turnosAdultos('2026-11-07', '2026-11-08', 90)).toEqual([])
  })

  it('todo el torneo: 6 semanas × 16 turnos', () => {
    expect(turnosAdultos(TORNEO.fecha_inicio, TORNEO.fecha_fin, 90)).toHaveLength(96)
  })
})

describe('franjas de la academia', () => {
  it('valida ventana 15:00–18:00, orden, fechas y solapes', () => {
    const ok = validarFranja({ fecha: '2026-11-03', cancha: 'HGV1', hora_inicio: '15:00', hora_fin: '17:00' }, TORNEO, [])
    expect('franja' in ok).toBe(true)
    const err = (f: object, existentes: Franja[] = []) => {
      const r = validarFranja({ fecha: '2026-11-03', cancha: 'HGV1', hora_inicio: '15:00', hora_fin: '17:00', ...f }, TORNEO, existentes)
      return 'error' in r ? r.error : null
    }
    expect(err({ hora_inicio: '14:30' })).toContain('15:00')
    expect(err({ hora_fin: '18:30' })).toContain('18:00')
    expect(err({ hora_inicio: '17:00', hora_fin: '16:00' })).toContain('anterior')
    expect(err({ fecha: '2026-12-20' })).toContain('dentro del torneo')
    expect(err({ cancha: 'FORANEA' })).toContain('HGV1')
    expect(err({}, [franja('2026-11-03', 'HGV1', '16:00', '18:00')])).toContain('Se solapa')
    expect(err({}, [franja('2026-11-03', 'HGV2', '16:00', '18:00')])).toBeNull()
    expect(err({}, [franja('2026-11-03', 'HGV1', '17:00', '18:00')])).toBeNull()
  })

  it('turnos dentro de una franja cada 10 min, terminando dentro', () => {
    const t = turnosEnFranja(franja('2026-11-03', 'HGV1', '15:00', '16:00'), 40)
    expect(t.map((x) => formatearHora(new Date(x.inicio)))).toEqual(['15:00', '15:10', '15:20'])
  })
})

// --- Reglas -----------------------------------------------------------------------

describe('revisarHorario', () => {
  const partidos = [
    ...partidosDe(single, jugadores('s', 8)),
    ...partidosDe(dobles, [['s1', 'd2'], ...jugadores('d', 11, 2).map((par) => par.map((x) => x + 'x'))]),
  ]
  const ctx = ctxBase(partidos)
  const grupoA = partidos.filter((p) => p.categoriaId === 'sq' && p.grupoLetra === 'A')
  const conS1 = partidos.find((p) => p.categoriaId === 'sq' && p.personas.includes('s1'))!
  const dobleConS1 = partidos.find((p) => p.categoriaId === 'dm' && p.personas.includes('s1'))!
  const semi1 = partidos.find((p) => p.categoriaId === 'sq' && p.fase === 'semis' && p.orden === 1)!
  const final = partidos.find((p) => p.categoriaId === 'sq' && p.fase === 'final')!
  const lun = (hora: string, cancha: 'HGV1' | 'HGV2' = 'HGV2'): Horario => ({ cancha, inicio: en('2026-11-02', hora) })

  it('turno válido sin nada más programado', () => {
    expect(revisarHorario(ctx, new Map(), conS1, lun('19:00'))).toEqual({ errores: [], avisos: [] })
  })

  it('fuera del horario del club (HGV1 lun–jue abre a las 20:00)', () => {
    expect(revisarHorario(ctx, new Map(), conS1, lun('19:00', 'HGV1')).errores.join()).toContain('no abre')
  })

  it('cancha ocupada por otro partido del torneo', () => {
    const otro = partidos.find((p) => p.categoriaId === 'dm' && !p.personas.includes('s1'))!
    const r = revisarHorario(ctx, new Map([[otro.id, lun('19:00')]]), conS1, lun('20:00'))
    expect(r.errores.join()).toContain('ya está ocupada')
  })

  it('jugador en 2 categorías: error si se solapa, aviso si es la misma noche', () => {
    const solapa = revisarHorario(ctx, new Map([[dobleConS1.id, lun('20:00', 'HGV1')]]), conS1, lun('19:00'))
    expect(solapa.errores.join()).toContain('otro partido a esa hora')
    const mismaNoche = revisarHorario(ctx, new Map([[dobleConS1.id, lun('20:30')]]), conS1, lun('19:00'))
    expect(mismaNoche.errores).toEqual([])
    expect(mismaNoche.avisos.join()).toContain('ya juega ese día')
  })

  it('limitación de horario del jugador (1er turno del lunes)', () => {
    expect(celdaDeTurno(en('2026-11-02', '19:00'))).toBe('lun_1')
    expect(celdaDeTurno(en('2026-11-06', '20:30'))).toBe('vie_2')
    const r = revisarHorario(ctxBase(partidos, { noDisponible: { s1: ['lun_1'] } }), new Map(), conS1, lun('19:00'))
    expect(r.avisos.join()).toContain('no puede jugar')
    expect(revisarHorario(ctxBase(partidos, { noDisponible: { s1: ['lun_1'] } }), new Map(), conS1, lun('20:30')).avisos).toEqual([])
  })

  it('bloqueo del club = error; reserva o reto ya agendado = aviso', () => {
    const ocupaciones = [
      { cancha: 'HGV2', inicio: en('2026-11-02', '19:30'), fin: en('2026-11-02', '20:30'), motivo: 'Mantenimiento', tipo: 'bloqueo' as const },
      { cancha: 'HGV2', inicio: en('2026-11-03', '19:00'), fin: en('2026-11-03', '20:00'), motivo: 'Reserva', tipo: 'reserva' as const },
    ]
    const c = ctxBase(partidos, { ocupaciones })
    expect(revisarHorario(c, new Map(), conS1, lun('19:00')).errores.join()).toContain('bloqueo')
    const r = revisarHorario(c, new Map(), conS1, { cancha: 'HGV2', inicio: en('2026-11-03', '19:00') })
    expect(r.errores).toEqual([])
    expect(r.avisos.join()).toContain('reserva')
  })

  it('llave: después (otro día) de todos los partidos de los que depende', () => {
    expect(dependenciasDe(semi1, partidos).map((p) => p.grupoLetra).sort()).toEqual(['A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'B'])
    expect(dependenciasDe(final, partidos).map((p) => `${p.fase}${p.orden}`)).toEqual(['semis1', 'semis2'])

    const horarios = new Map<string, Horario>()
    expect(revisarHorario(ctx, horarios, semi1, lun('19:00')).errores.join()).toContain('todavía no tiene horario')

    // Todos los de grupo el lunes 2; la semi el mismo día no, el martes sí.
    const deps = dependenciasDe(semi1, partidos)
    deps.forEach((d, k) => horarios.set(d.id, { cancha: 'HGV2', inicio: en('2026-11-02', '06:00') + k * 3600000 }))
    expect(revisarHorario(ctx, horarios, semi1, lun('20:30')).errores.join()).toContain('día posterior')
    expect(revisarHorario(ctx, horarios, semi1, { cancha: 'HGV2', inicio: en('2026-11-03', '19:00') }).errores).toEqual([])

    // Y al revés: un partido de grupo no puede ir después de la semi que depende de él.
    horarios.set(semi1.id, { cancha: 'HGV2', inicio: en('2026-11-03', '19:00') })
    expect(revisarHorario(ctx, horarios, grupoA[0], { cancha: 'HGV2', inicio: en('2026-11-04', '19:00') }).errores.join()).toContain('depende de este partido')
  })

  it('finales de adultos solo el 11-dic, y ese día solo finales', () => {
    const vie11 = { cancha: 'HGV1' as const, inicio: en('2026-12-11', '18:30') }
    expect(revisarHorario(ctx, new Map(), conS1, vie11).avisos.join()).toContain('finales')
    const sinDeps = ctxBase(partidos.filter((p) => p.id !== final.id).concat({ ...final, origen_a: null, origen_b: null }))
    const finalSola = sinDeps.partidos.find((p) => p.id === final.id)!
    expect(revisarHorario(sinDeps, new Map(), finalSola, vie11).avisos).toEqual([])
    expect(revisarHorario(sinDeps, new Map(), finalSola, { cancha: 'HGV1', inicio: en('2026-12-04', '18:30') }).avisos.join()).toContain('finales')
  })

  it('infantil: solo dentro de una franja liberada, en su cancha', () => {
    const ninos = partidosDe(naranja, jugadores('m:n', 4))
    const c = ctxBase(ninos, { franjas: [franja('2026-11-03', 'HGV1', '15:00', '16:30')] })
    const p = ninos[0]
    expect(revisarHorario(c, new Map(), p, { cancha: 'HGV1', inicio: en('2026-11-03', '15:00') }).errores).toEqual([])
    expect(revisarHorario(c, new Map(), p, { cancha: 'HGV1', inicio: en('2026-11-03', '16:00') }).errores.join()).toContain('franja')
    expect(revisarHorario(c, new Map(), p, { cancha: 'HGV2', inicio: en('2026-11-03', '15:00') }).errores.join()).toContain('franja')
  })
})

// --- Asistente ----------------------------------------------------------------------

describe('proponerProgramacion', () => {
  const verificar = (ctx: ContextoProgramacion, horarios: Map<string, Horario>) => {
    // Ninguna asignación tiene errores ni avisos con el resto.
    for (const p of ctx.partidos) {
      const h = horarios.get(p.id)
      if (!h) continue
      const resto = new Map(horarios)
      resto.delete(p.id)
      expect(revisarHorario(ctx, resto, p, h), p.id).toEqual({ errores: [], avisos: [] })
    }
  }

  it('adultos: programa grupos, llave y deja las finales el viernes 11-dic', () => {
    const partidos = [
      ...partidosDe(dobles, jugadores('d', 12, 2)),
      ...partidosDe(single, [['d1'], ...jugadores('s', 7)]),   // d1 juega dobles y single
    ]
    const ctx = ctxBase(partidos, { noDisponible: { d1: ['lun_1', 'lun_2'] } })
    const { horarios, sinHorario } = proponerProgramacion(ctx, new Map())
    expect(sinHorario).toEqual([])
    expect(horarios.size).toBe(partidos.length)
    verificar(ctx, horarios)

    const finales = partidos.filter((p) => p.fase === 'final')
    for (const f of finales) expect(fechaISOEnCaracas(new Date(horarios.get(f.id)!.inicio))).toBe('2026-12-11')
    // d1 nunca juega un lunes.
    for (const p of partidos.filter((x) => x.personas.includes('d1'))) {
      expect(diaDeLaSemanaEnCaracas(new Date(horarios.get(p.id)!.inicio))).not.toBe(1)
    }
  })

  it('respeta los horarios fijos y no los mueve', () => {
    const partidos = partidosDe(single, jugadores('s', 8))
    const fijo = { cancha: 'HGV2' as const, inicio: en('2026-11-02', '19:00') }
    const { horarios } = proponerProgramacion(ctxBase(partidos), new Map([[partidos[0].id, fijo]]))
    expect(horarios.get(partidos[0].id)).toEqual(fijo)
    expect([...horarios.entries()].filter(([id, h]) => id !== partidos[0].id && h.inicio === fijo.inicio && h.cancha === 'HGV2')).toEqual([])
  })

  it('lo que no encaja queda sin horario con el motivo', () => {
    const partidos = partidosDe(single, jugadores('s', 8))
    const corto = { ...ctxBase(partidos), fechaInicio: '2026-12-09', fechaFin: '2026-12-11' }
    const { sinHorario } = proponerProgramacion(corto, new Map())
    expect(sinHorario.length).toBeGreaterThan(0)
    expect(sinHorario.some((s) => s.motivo.includes('quedó sin horario'))).toBe(true)
  })

  it('infantil: sin franjas no programa nada y lo dice', () => {
    const ninos = partidosDe(naranja, jugadores('m:n', 4))
    const { sinHorario } = proponerProgramacion(ctxBase(ninos), new Map())
    expect(sinHorario).toHaveLength(6)
    expect(sinHorario[0].motivo).toContain('academia')
  })

  it('infantil: solo dentro de las franjas, un partido por niño por día', () => {
    const ninos = partidosDe(naranja, jugadores('m:n', 4))
    const franjas = ['2026-11-03', '2026-11-04', '2026-11-05'].flatMap((d) => [franja(d, 'HGV1', '15:00', '16:20'), franja(d, 'HGV2', '15:00', '16:20')])
    const ctx = ctxBase(ninos, { franjas })
    const { horarios, sinHorario } = proponerProgramacion(ctx, new Map())
    expect(sinHorario).toEqual([])
    verificar(ctx, horarios)
  })
})
