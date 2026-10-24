import { describe, expect, it } from 'vitest'
import {
  alertaCategoria,
  candidatosPareja,
  enlaceWhatsApp,
  errorDupla,
  estadoEnDobles,
  invitacionesPorVencer,
  invitacionVigente,
  mensajeInvitacionWhatsApp,
  normalizarTelefonoVe,
  resumenCategoria,
  venceInvitacion,
  type EstadoEnDobles,
  type JugadorDobles,
} from './torneoDobles'

const j = (id: string, genero: string, categoria: string, oficial: string | null = categoria): JugadorDobles => ({
  id, nombre: id.toUpperCase(), genero, categoria, categoria_torneo: oficial,
})
const dobleDamasSexta = { id: 'dds', genero: 'damas' as const, categoria_nivel: 'sexta' as const }
const mixto = { id: 'mix', genero: 'mixto' as const, categoria_nivel: null }

// Cierre: domingo 1-nov-2026, 23:59 de Caracas (UTC-4) = 2-nov 03:59 UTC.
const CIERRE = new Date('2026-11-02T03:59:00Z')

describe('venceInvitacion', () => {
  it('48 h después de enviarla', () => {
    expect(venceInvitacion(new Date('2026-10-27T14:00:00Z'), CIERRE).toISOString()).toBe('2026-10-29T14:00:00.000Z')
  })
  it('el cierre si llega antes de las 48 h', () => {
    expect(venceInvitacion(new Date('2026-11-01T12:00:00Z'), CIERRE)).toEqual(CIERRE)
  })
  it('sin cierre, siempre 48 h', () => {
    expect(venceInvitacion(new Date('2026-11-01T12:00:00Z'), null).toISOString()).toBe('2026-11-03T12:00:00.000Z')
  })
})

describe('vigencia de las invitaciones', () => {
  const inv = { estado: 'pendiente' as const, vence_at: '2026-10-29T14:00:00Z' }
  it('pendiente y sin vencer', () => {
    expect(invitacionVigente(inv, new Date('2026-10-29T13:59:00Z'))).toBe(true)
    expect(invitacionVigente(inv, new Date('2026-10-29T14:00:00Z'))).toBe(false)
    expect(invitacionVigente({ ...inv, estado: 'rechazada' }, new Date('2026-10-28T00:00:00Z'))).toBe(false)
  })
  it('las pendientes vencidas se detectan al leer', () => {
    const lista = [inv, { ...inv, vence_at: '2026-10-30T00:00:00Z' }, { ...inv, estado: 'cancelada' as const }]
    expect(invitacionesPorVencer(lista, new Date('2026-10-29T15:00:00Z'))).toEqual([inv])
  })
})

describe('estadoEnDobles', () => {
  const ahora = new Date('2026-10-28T12:00:00Z')
  const pendiente = { invita_inscripcion_id: 'i1', estado: 'pendiente' as const, vence_at: '2026-10-29T12:00:00Z' }
  it('disponible, invitación enviada o en dupla', () => {
    expect(estadoEnDobles('i1', [], [], ahora)).toBe('disponible')
    expect(estadoEnDobles('i1', [], [pendiente], ahora)).toBe('invitacion_enviada')
    expect(estadoEnDobles('i1', [{ id: 'e', inscripcion1_id: 'i2', inscripcion2_id: 'i1', estado: 'activo' }], [pendiente], ahora)).toBe('en_dupla')
  })
  it('una invitación vencida o una dupla disuelta lo devuelven a disponible', () => {
    expect(estadoEnDobles('i1', [], [pendiente], new Date('2026-10-29T12:00:00Z'))).toBe('disponible')
    expect(estadoEnDobles('i1', [{ id: 'e', inscripcion1_id: 'i1', inscripcion2_id: 'i2', estado: 'disuelto' }], [], ahora)).toBe('disponible')
  })
})

describe('normalizarTelefonoVe', () => {
  it('acepta los formatos habituales', () => {
    for (const t of ['0414-1234567', '0414 123.45.67', '+58 414 1234567', '584141234567', '4141234567', '00584141234567']) {
      expect(normalizarTelefonoVe(t)).toBe('584141234567')
    }
    expect(normalizarTelefonoVe('0212-9876543')).toBe('582129876543')
  })
  it('rechaza lo que no es un número de Venezuela', () => {
    for (const t of ['', '123', '0414-12345', '+1 305 555 1234', '0914-1234567', null]) expect(normalizarTelefonoVe(t)).toBeNull()
  })
})

describe('mensaje de WhatsApp', () => {
  it('dice quién invita, la categoría y los enlaces', () => {
    const m = mensajeInvitacionWhatsApp({
      invitadoNombre: 'Eva', invitaNombre: 'Ana Pérez', categoriaNombre: 'Doble Damas Sexta', torneoNombre: 'Torneo Navidad HGV 2026',
      urlRegistro: 'https://hgv.app/register', urlTorneo: 'https://hgv.app/torneo/inscripcion',
    })
    expect(m).toMatch(/Ana Pérez/)
    expect(m).toMatch(/Doble Damas Sexta/)
    expect(m).toMatch(/https:\/\/hgv.app\/register/)
    expect(m).toMatch(/https:\/\/hgv.app\/torneo\/inscripcion/)
    expect(enlaceWhatsApp('584141234567', 'hola y adiós')).toBe('https://wa.me/584141234567?text=hola%20y%20adi%C3%B3s')
  })
})

describe('errorDupla', () => {
  it('género y nivel de los dos', () => {
    expect(errorDupla(dobleDamasSexta, j('ana', 'damas', 'sexta'), j('eva', 'damas', 'sexta_novatos'))).toBeNull()
    expect(errorDupla(dobleDamasSexta, j('ana', 'damas', 'sexta'), j('luis', 'caballeros', 'sexta'))).toMatch(/solo para damas/)
    expect(errorDupla(dobleDamasSexta, j('ana', 'damas', 'sexta'), j('eva', 'damas', 'sexta', 'quinta'))).toMatch(/EVA no puede/)
    expect(errorDupla(mixto, j('ana', 'damas', 'sexta'), j('eva', 'damas', 'cuarta'))).toMatch(/caballero y una dama/)
    expect(errorDupla(mixto, j('ana', 'damas', 'sexta'), j('luis', 'caballeros', 'cuarta'))).toBeNull()
    expect(errorDupla(mixto, j('ana', 'damas', 'sexta'), j('ana', 'damas', 'sexta'))).toMatch(/otro jugador/)
  })
})

describe('candidatosPareja', () => {
  const yo = j('ana', 'damas', 'sexta')
  const jugadores = [
    yo,
    j('zoe', 'damas', 'sexta'),           // no inscrita
    j('bea', 'damas', 'sexta_novatos'),   // disponible
    j('cris', 'damas', 'sexta'),          // esperando a otra
    j('dani', 'damas', 'sexta'),          // en dupla
    j('elsa', 'damas', 'quinta'),         // otro nivel
    j('luis', 'caballeros', 'sexta'),     // otro género
    j('fer', 'damas', 'sexta'),           // no inscrita y ya en 2 categorías
    j('gaby', 'damas', 'sexta'),          // disponible aquí aunque tenga 2 categorías
  ]
  const estado = new Map<string, EstadoEnDobles>([['bea', 'disponible'], ['cris', 'invitacion_enviada'], ['dani', 'en_dupla'], ['gaby', 'disponible']])
  const lista = candidatosPareja({
    yo, categoria: dobleDamasSexta, jugadores, estadoEnCategoria: estado,
    esperandoA: new Map([['cris', 'Marta']]),
    categoriasDe: new Map([['fer', ['c1', 'c2']], ['gaby', ['dds', 'c2']]]),
  })

  it('filtra por género, nivel, dupla y máximo de categorías', () => {
    expect(lista.map((c) => c.id)).toEqual(['bea', 'gaby', 'zoe', 'cris'])
  })
  it('disponibles arriba; los que esperan en gris, sin poder elegirlos', () => {
    expect(lista[0]).toMatchObject({ estado: 'disponible', seleccionable: true })
    expect(lista[2]).toMatchObject({ estado: 'no_inscrito', seleccionable: true })
    expect(lista[3]).toEqual({ id: 'cris', nombre: 'CRIS', estado: 'invitacion_enviada', esperandoA: 'Marta', meInvito: false, seleccionable: false })
  })
  it('marca a quien me invitó (se acepta arriba)', () => {
    const l = candidatosPareja({ yo, categoria: dobleDamasSexta, jugadores, estadoEnCategoria: estado, esperandoA: new Map([['cris', 'ANA']]), categoriasDe: new Map(), meInvitaron: new Set(['cris']) })
    expect(l.find((c) => c.id === 'cris')).toMatchObject({ meInvito: true, seleccionable: false })
  })
  it('en el Mixto, solo el otro género', () => {
    const l = candidatosPareja({ yo, categoria: mixto, jugadores, estadoEnCategoria: new Map(), esperandoA: new Map(), categoriasDe: new Map() })
    expect(l.map((c) => c.id)).toEqual(['luis'])
  })
})

describe('resumenCategoria', () => {
  const ahora = new Date('2026-10-28T12:00:00Z')
  const categoria = { id: 'dds', modalidad: 'doble' as const, cupo: 12 }
  const inscripciones = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, k) => ({ id, estado: k < 2 ? 'confirmada' : 'pendiente_pago' }))
  const equipos = [
    { inscripcionIds: ['a', 'b'], bloqueado: false },
    { inscripcionIds: ['c', 'd'], bloqueado: true },
  ]
  const r = resumenCategoria({
    categoria, inscripciones, equipos, ahora,
    invitaciones: [
      { estado: 'pendiente', vence_at: '2026-10-29T20:00:00Z' },
      { estado: 'pendiente', vence_at: '2026-10-29T10:00:00Z' },
      { estado: 'pendiente', vence_at: '2026-10-27T10:00:00Z' }, // ya venció
      { estado: 'rechazada', vence_at: '2026-10-30T10:00:00Z' },
    ],
    pagos: [{ torneo_inscripcion_id: 'c', validado: false }, { torneo_inscripcion_id: 'a', validado: true }, { torneo_inscripcion_id: 'x', validado: false }],
  })
  it('cuenta duplas, faltantes, sin pareja, invitaciones y pagos', () => {
    expect(r).toMatchObject({
      cupo: 12, confirmados: 1, formados: 2, faltan: 10, listosSorteo: 1, inscritos: 7, sinPareja: 3,
      invitacionesPendientes: 2, proximaEnVencer: '2026-10-29T10:00:00Z', pagosPorValidar: 1,
    })
  })
  it('alertas: roja con menos de 3, naranja con impares sin pareja, verde con el cupo lleno', () => {
    expect(r.alerta).toBe('roja')
    expect(alertaCategoria({ modalidad: 'doble', formados: 4, cupo: 12, sinPareja: 1 })).toBe('naranja')
    expect(alertaCategoria({ modalidad: 'doble', formados: 4, cupo: 12, sinPareja: 2 })).toBeNull()
    expect(alertaCategoria({ modalidad: 'doble', formados: 12, cupo: 12, sinPareja: 0 })).toBe('verde')
    expect(alertaCategoria({ modalidad: 'single', formados: 8, cupo: 8, sinPareja: 0 })).toBe('verde')
  })
})
