import { describe, expect, it } from 'vitest'
import { candidatosArmarAdmin, errorDupla } from './torneoDobles'

const j = (id: string, genero: string, categoria = 'sexta', extra: object = {}) =>
  ({ id, nombre: id, genero, categoria, categoria_torneo: null, ...extra })

describe('candidatosArmarAdmin', () => {
  const masc = { id: 'cat', genero: 'caballeros', categoria_nivel: 'sexta' } as any

  it('filtra por género, quita a los que ya están en dupla y deja al final a los de otro nivel', () => {
    const r = candidatosArmarAdmin({
      categoria: masc,
      jugadores: [j('ana', 'damas'), j('beto', 'caballeros'), j('carlos', 'caballeros', 'cuarta'), j('dani', 'caballeros'), j('eli', 'caballeros')],
      estadoEnCategoria: new Map([['dani', 'en_dupla'], ['eli', 'disponible']]),
      categoriasDe: new Map(),
    })
    expect(r.map((c) => c.id)).toEqual(['eli', 'beto', 'carlos'])
    expect(r[0].estado).toBe('disponible')
    expect(r[1].estado).toBe('no_inscrito')
    // Otro nivel: se puede elegir con la autorización del admin.
    expect(r[2]).toMatchObject({ fueraDeNivel: true, seleccionable: true, nivel: 'cuarta' })
    expect(r[0].fueraDeNivel).toBe(false)
  })

  it('un no inscrito con 2 categorías no se puede elegir; uno ya inscrito sí', () => {
    const r = candidatosArmarAdmin({
      categoria: masc,
      jugadores: [j('a', 'caballeros'), j('b', 'caballeros')],
      estadoEnCategoria: new Map([['b', 'invitacion_enviada']]),
      categoriasDe: new Map([['a', 2], ['b', 2]]),
    })
    const a = r.find((c) => c.id === 'a')!
    const b = r.find((c) => c.id === 'b')!
    expect(a.seleccionable).toBe(false)
    expect(a.motivo).toMatch(/2 categorías/)
    expect(b.seleccionable).toBe(true)
    expect(r[r.length - 1].id).toBe('a') // los no elegibles van al final
  })

  it('en el Mixto admite los dos géneros y errorDupla exige uno de cada uno', () => {
    const mixto = { id: 'm', genero: 'mixto', categoria_nivel: null } as any
    const r = candidatosArmarAdmin({ categoria: mixto, jugadores: [j('h', 'caballeros', 'quinta'), j('m', 'damas')], estadoEnCategoria: new Map(), categoriasDe: new Map() })
    expect(r).toHaveLength(2)
    expect(errorDupla(mixto, j('h1', 'caballeros'), j('h2', 'caballeros'))).not.toBeNull()
    expect(errorDupla(mixto, j('h1', 'caballeros'), j('m1', 'damas'))).toBeNull()
  })

  it('marca a los invitados', () => {
    const r = candidatosArmarAdmin({ categoria: masc, jugadores: [j('x', 'caballeros', 'sexta', { esInvitado: true })], estadoEnCategoria: new Map(), categoriasDe: new Map() })
    expect(r[0].esInvitado).toBe(true)
  })
})
