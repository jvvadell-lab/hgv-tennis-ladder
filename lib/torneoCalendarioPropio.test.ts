import { describe, expect, it } from 'vitest'
import { categoriaAbierta, categoriaAntesDelSorteo, cierreDeCategoria } from './torneoInscripcion'
import { cierreVencido, errorCambioApertura } from './torneoCierre'
import { validarInscripcionMenor } from './torneoInfantil'
import { revisarHorario, type ContextoProgramacion, type PartidoProg } from './torneoProgramacion'
import { instanteEnCaracas } from './tiempo'

// Calendario propio por categoría (migración 20261104023339): las infantiles
// del Navidad 2026 se inscriben hasta el 20-nov y juegan del 23-nov al 4-dic,
// aunque los adultos ya estén sorteados (5-nov) y jugando (6-nov).
const ADULTO = { inscripciones_abiertas: true, fecha_inicio: null, sorteo_publicado_at: null, cancelada_at: null }
const INFANTIL = { inscripciones_abiertas: true, fecha_inicio: '2026-11-23', sorteo_publicado_at: null, cancelada_at: null }

describe('categoriaAbierta con calendario propio', () => {
  it('con el torneo en inscripción, las dos reciben', () => {
    expect(categoriaAbierta('inscripcion', ADULTO)).toBe(true)
    expect(categoriaAbierta('inscripcion', INFANTIL)).toBe(true)
  })
  it('con los adultos ya sorteados o jugando, solo recibe la de calendario propio', () => {
    for (const estado of ['sorteado', 'en_curso'] as const) {
      expect(categoriaAbierta(estado, ADULTO)).toBe(false)
      expect(categoriaAbierta(estado, INFANTIL)).toBe(true)
    }
  })
  it('cerrada por el admin, sorteada o con el torneo terminado: no recibe', () => {
    expect(categoriaAbierta('sorteado', { ...INFANTIL, inscripciones_abiertas: false })).toBe(false)
    expect(categoriaAbierta('sorteado', { ...INFANTIL, sorteo_publicado_at: '2026-11-21T12:00:00Z' })).toBe(false)
    expect(categoriaAbierta('finalizado', INFANTIL)).toBe(false)
    expect(categoriaAbierta('borrador', INFANTIL)).toBe(false)
  })
  it('sin los campos nuevos se comporta como antes', () => {
    expect(categoriaAbierta('inscripcion', { inscripciones_abiertas: true })).toBe(true)
    expect(categoriaAbierta('sorteado', { inscripciones_abiertas: true })).toBe(false)
  })
})

describe('categoriaAntesDelSorteo', () => {
  it('la infantil se sortea después que los adultos', () => {
    expect(categoriaAntesDelSorteo('sorteado', INFANTIL)).toBe(true)
    expect(categoriaAntesDelSorteo('en_curso', INFANTIL)).toBe(true)
    expect(categoriaAntesDelSorteo('sorteado', ADULTO)).toBe(false)
  })
  it('una vez sorteada o cancelada, ya no', () => {
    expect(categoriaAntesDelSorteo('inscripcion', { ...INFANTIL, sorteo_publicado_at: 'x' })).toBe(false)
    expect(categoriaAntesDelSorteo('en_curso', { ...INFANTIL, cancelada_at: 'x' })).toBe(false)
  })
})

describe('cierre programado por categoría', () => {
  const torneo = { estado: 'sorteado' as const, cierre_inscripciones_at: '2026-11-05T03:59:00Z' }
  const infantil = { id: 'i', nombre: 'Pelota Verde', ...INFANTIL, cierre_inscripciones_at: '2026-11-21T03:59:00Z' }

  it('usa la hora de la categoría si la tiene', () => {
    expect(cierreDeCategoria(torneo, infantil)).toBe('2026-11-21T03:59:00Z')
    expect(cierreDeCategoria(torneo, { cierre_inscripciones_at: null })).toBe('2026-11-05T03:59:00Z')
  })
  it('la infantil no figura como "cierre vencido" antes del 20-nov', () => {
    expect(cierreVencido(torneo, [infantil], new Date('2026-11-10T12:00:00Z'))).toEqual([])
    expect(cierreVencido(torneo, [infantil], new Date('2026-11-21T12:00:00Z')).map((c) => c.nombre)).toEqual(['Pelota Verde'])
  })
  it('se puede cerrar y reabrir con los adultos ya sorteados', () => {
    expect(errorCambioApertura('sorteado', { nombre: 'Pelota Verde', ...INFANTIL }, false)).toBeNull()
    expect(errorCambioApertura('sorteado', { nombre: 'Single Quinta', ...ADULTO }, true)).toMatch(/sorteo del torneo/)
  })
})

describe('validarInscripcionMenor con los adultos ya sorteados', () => {
  const base = {
    soloSocios: true,
    fechaCorte: '2026-12-31',
    categoria: { id: 'v', nombre: 'Pelota Verde', genero: 'abierto' as const, edad_min: 9, edad_max: 11, cupo: 16, es_infantil: true, ...INFANTIL },
    menor: { nombre: 'Sofía', genero: 'damas', fecha_nacimiento: '2016-05-12', numero_accion: '1234' },
    autorizacionParticipacion: true,
    ocupados: 0,
    categoriasDelMenor: [],
  }
  it('el representante inscribe con el torneo sorteado', () => {
    expect(validarInscripcionMenor({ ...base, estadoTorneo: 'sorteado' })).toEqual({ ok: true })
  })
  it('sin calendario propio, como antes, no', () => {
    expect(validarInscripcionMenor({ ...base, estadoTorneo: 'sorteado', categoria: { ...base.categoria, fecha_inicio: null } }).ok).toBe(false)
  })
  it('el admin también, hasta el sorteo de la categoría', () => {
    expect(validarInscripcionMenor({ ...base, estadoTorneo: 'en_curso', porAdmin: true, categoria: { ...base.categoria, inscripciones_abiertas: false } })).toEqual({ ok: true })
    expect(validarInscripcionMenor({ ...base, estadoTorneo: 'en_curso', porAdmin: true, categoria: { ...base.categoria, sorteo_publicado_at: 'x' } }).ok).toBe(false)
  })
})

describe('programación dentro del calendario de la categoría', () => {
  const partido: PartidoProg = {
    id: 'p', categoriaId: 'v', categoriaNombre: 'Pelota Verde', categoriaOrden: 12, esInfantil: true, duracionMin: 60,
    fase: 'grupo', grupoLetra: 'A', orden: 1, ronda: 1, origen_a: null, origen_b: null, personas: [], cerrado: false,
    fechaInicioCategoria: '2026-11-23', fechaFinCategoria: '2026-12-04',
  }
  const ctx = (fecha: string): ContextoProgramacion => ({
    fechaInicio: '2026-11-06', fechaFin: '2026-12-11', partidos: [partido],
    franjas: [{ id: 'f', fecha, cancha: 'HGV1', hora_inicio: '15:00', hora_fin: '18:00' }],
    ocupaciones: [], noDisponible: {},
  })
  const en = (fecha: string) => ({ cancha: 'HGV1' as const, inicio: instanteEnCaracas(fecha, '15:00').getTime() })

  it('antes del 23-nov da error aunque esté dentro del torneo', () => {
    expect(revisarHorario(ctx('2026-11-16'), new Map(), partido, en('2026-11-16')).errores.join(' ')).toMatch(/se juega del 23\/11 al 4\/12/)
  })
  it('dentro de su calendario, sin ese error', () => {
    expect(revisarHorario(ctx('2026-11-24'), new Map(), partido, en('2026-11-24')).errores).toEqual([])
  })
})
