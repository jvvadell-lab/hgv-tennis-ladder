import { describe, expect, it } from 'vitest'
import { agruparPorCategoriaYGenero, planCertificacion, temporadaPorDefecto, type JugadorEnEscalera } from './torneoCertificacion'

const j = (id: string, parcial: Partial<JugadorEnEscalera> = {}): JugadorEnEscalera => ({
  id, nombre: id.toUpperCase(), genero: 'caballeros', categoria: 'sexta', categoria_torneo: null, activo: true, ...parcial,
})

describe('temporadaPorDefecto', () => {
  it('prefiere la que tiene más jugadores aunque haya una más reciente', () => {
    const t = temporadaPorDefecto([
      { id: 'copa', nombre: 'Copa', fecha_inicio: '2026-11-02', jugadores: 4 },
      { id: 'escalera', nombre: 'Escalera', fecha_inicio: '2026-08-07', jugadores: 37 },
    ])
    expect(t?.id).toBe('escalera')
  })

  it('a igualdad de jugadores, la más reciente', () => {
    const t = temporadaPorDefecto([
      { id: 'vieja', nombre: 'A', fecha_inicio: '2025-08-01', jugadores: 10 },
      { id: 'nueva', nombre: 'B', fecha_inicio: '2026-08-01', jugadores: 10 },
    ])
    expect(t?.id).toBe('nueva')
  })

  it('null si ninguna tiene escalera', () => {
    expect(temporadaPorDefecto([{ id: 'x', nombre: 'X', fecha_inicio: '2026-01-01', jugadores: 0 }])).toBeNull()
    expect(temporadaPorDefecto([])).toBeNull()
  })
})

describe('planCertificacion', () => {
  it('certifica solo a los activos sin categoría oficial', () => {
    const plan = planCertificacion([
      j('ana', { categoria: 'quinta', genero: 'damas' }),
      j('beto', { categoria_torneo: 'cuarta' }),
      j('caro', { activo: false }),
      j('dani'),
    ])
    expect(plan.certificar.map((x) => x.id)).toEqual(['ana', 'dani'])
    expect(plan.yaCertificados).toBe(1)
    expect(plan.inactivos).toBe(1)
    expect(plan.categoriaInvalida).toEqual([])
  })

  it('excluye y reporta categorías que no son nivel de torneo', () => {
    const plan = planCertificacion([j('eva', { categoria: 'tercera' }), j('fede')])
    expect(plan.certificar.map((x) => x.id)).toEqual(['fede'])
    expect(plan.categoriaInvalida.map((x) => x.id)).toEqual(['eva'])
  })

  it('no repite a un jugador con dos filas en la escalera', () => {
    const plan = planCertificacion([j('gus'), j('gus')])
    expect(plan.certificar).toHaveLength(1)
  })

  it('activo null cuenta como activo (default de la columna)', () => {
    expect(planCertificacion([j('hugo', { activo: null })]).certificar).toHaveLength(1)
  })
})

describe('agruparPorCategoriaYGenero', () => {
  it('agrupa en el orden de los niveles y luego por género', () => {
    const { certificar } = planCertificacion([
      j('a', { categoria: 'cuarta' }),
      j('b', { categoria: 'sexta', genero: 'damas' }),
      j('c', { categoria: 'sexta' }),
      j('d', { categoria: 'sexta_novatos' }),
      j('e', { categoria: 'sexta' }),
    ])
    const grupos = agruparPorCategoriaYGenero(certificar)
    expect(grupos.map((g) => `${g.categoria}/${g.genero}/${g.jugadores.length}`)).toEqual([
      'sexta_novatos/caballeros/1',
      'sexta/caballeros/2',
      'sexta/damas/1',
      'cuarta/caballeros/1',
    ])
  })
})
