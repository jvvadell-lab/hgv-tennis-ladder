import { describe, expect, it } from 'vitest'
import { avisoAntesDeCerrar, categoriaNoRecibe, cierreVencido, errorAnotarseEnEspera, errorCambioApertura, ordenEspera } from './torneoCierre'
import { validarInscripcion } from './torneoInscripcion'

const cat = (extra: object = {}) => ({
  id: 'c', nombre: 'Doble Femenino Sexta', modalidad: 'doble' as const, cupo: 12,
  inscripciones_abiertas: true, sorteo_publicado_at: null as string | null, cancelada_at: null as string | null, ...extra,
})
const CIERRE = '2026-11-05T03:59:00Z'   // 4-nov 23:59 de Caracas

describe('cierre manual por categoría', () => {
  it('se cierra y se reabre mientras no se publique su sorteo', () => {
    expect(errorCambioApertura('inscripcion', cat(), false)).toBeNull()
    expect(errorCambioApertura('inscripcion', cat({ inscripciones_abiertas: false }), true)).toBeNull()
    expect(errorCambioApertura('inscripcion', cat({ sorteo_publicado_at: '2026-11-05T12:00:00Z' }), true)).toMatch(/ya se sorteó/)
    expect(errorCambioApertura('inscripcion', cat({ cancelada_at: '2026-11-05T12:00:00Z' }), true)).toMatch(/cancelada/)
    expect(errorCambioApertura('sorteado', cat(), true)).toMatch(/ya terminó/)
  })

  it('al cerrar con jugadores sin pareja o invitaciones pendientes, avisa con la lista', () => {
    expect(avisoAntesDeCerrar('DFS', ['Ana', 'Bea', 'Cris'], 2)).toBe(
      'DFS: Quedan 3 sin pareja (Ana, Bea, Cris): arma la dupla, trasládalos o marca su devolución. 2 invitaciones pendientes vencerán al cerrar.')
    expect(avisoAntesDeCerrar('DFS', [], 1)).toBe('DFS: 1 invitación pendiente vencerá al cerrar.')
    expect(avisoAntesDeCerrar('DFS', [], 0)).toBeNull()
  })

  it('cupo lleno sin cerrar: el servidor no acepta más (dobles = parejas × 2)', () => {
    const d = (ocupados: number) => validarInscripcion({
      estadoTorneo: 'inscripcion', categoria: { modalidad: 'doble', genero: 'damas', categoria_nivel: 'sexta', cupo: 12, inscripciones_abiertas: true },
      jugadores: [{ id: 'a', nombre: 'A', genero: 'damas', categoria: 'sexta', categoria_torneo: 'sexta', activo: true, estado_verificacion: 'verificado' }],
      ocupados, categoriasDe: {}, categoriaId: 'c',
    })
    expect(d(23).ok).toBe(true)
    expect(d(24)).toEqual({ ok: false, error: 'La categoría ya no tiene cupo' })
  })
})

describe('cierre programado vencido', () => {
  const torneo = { estado: 'inscripcion' as const, cierre_inscripciones_at: CIERRE }
  const categorias = [cat(), cat({ id: 'd', nombre: 'Mixto', inscripciones_abiertas: false }), cat({ id: 'e', nombre: 'Single', sorteo_publicado_at: CIERRE })]
  it('antes de la hora no alerta; después, lista las categorías que siguen abiertas', () => {
    expect(cierreVencido(torneo, categorias, new Date('2026-11-05T03:58:00Z'))).toEqual([])
    expect(cierreVencido(torneo, categorias, new Date('2026-11-05T03:59:00Z')).map((c) => c.nombre)).toEqual(['Doble Femenino Sexta'])
  })
  it('sin hora programada o con el torneo cerrado, no alerta', () => {
    expect(cierreVencido({ ...torneo, cierre_inscripciones_at: null }, categorias, new Date('2027-01-01'))).toEqual([])
    expect(cierreVencido({ ...torneo, estado: 'borrador' }, categorias, new Date('2027-01-01'))).toEqual([])
  })
})

describe('lista de espera', () => {
  it('solo con la categoría cerrada o llena', () => {
    expect(categoriaNoRecibe('inscripcion', cat(), 10)).toBeNull()
    expect(categoriaNoRecibe('inscripcion', cat(), 24)).toBe('llena')
    expect(categoriaNoRecibe('inscripcion', cat({ inscripciones_abiertas: false }), 4)).toBe('cerrada')
    expect(categoriaNoRecibe('inscripcion', cat({ sorteo_publicado_at: CIERRE }), 24)).toBeNull()
  })
  it('anotarse: no si hay lugar, si ya está inscrito o en la lista, ni después del sorteo', () => {
    const base = { estadoTorneo: 'inscripcion' as const, categoria: cat({ inscripciones_abiertas: false }), ocupados: 10, yaInscrito: false, yaEnLista: false }
    expect(errorAnotarseEnEspera(base)).toBeNull()
    expect(errorAnotarseEnEspera({ ...base, categoria: cat(), ocupados: 10 })).toMatch(/inscríbete directamente/)
    expect(errorAnotarseEnEspera({ ...base, yaInscrito: true })).toMatch(/Ya estás inscrito/)
    expect(errorAnotarseEnEspera({ ...base, yaEnLista: true })).toMatch(/lista de espera/)
    expect(errorAnotarseEnEspera({ ...base, categoria: cat({ sorteo_publicado_at: CIERRE }) })).toMatch(/ya no admite/)
  })
  it('orden de llegada, sin los que ya salieron o se inscribieron', () => {
    const l = ordenEspera([
      { id: 'b', estado: 'esperando', created_at: '2026-10-30T10:00:00Z' },
      { id: 'a', estado: 'esperando', created_at: '2026-10-29T10:00:00Z' },
      { id: 'x', estado: 'inscrito', created_at: '2026-10-28T10:00:00Z' },
    ])
    expect(l.map((e) => `${e.puesto}:${e.id}`)).toEqual(['1:a', '2:b'])
  })
})
