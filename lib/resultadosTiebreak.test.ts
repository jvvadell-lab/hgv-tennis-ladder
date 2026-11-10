import { describe, expect, it } from 'vitest'
import { construirSets, pideTiebreak, validarSets } from './resultados'
import { validarMarcadorTorneo } from './torneo'

const set = (a: string, b: string, ta = '', tb = '') => ({ golesRetador: a, golesRetado: b, tbRetador: ta, tbRetado: tb })
const vacio = set('', '')

describe('tie-break de un set cargado como 7-6', () => {
  it('pide el tie-break con 7-6, 6-7 y 6-6, no con otros marcadores', () => {
    expect(pideTiebreak('7', '6')).toBe(true)
    expect(pideTiebreak('6', '7')).toBe(true)
    expect(pideTiebreak('6', '6')).toBe(true)
    expect(pideTiebreak('7', '5')).toBe(false)
    expect(pideTiebreak('6', '4')).toBe(false)
  })

  it('7-6 con su tie-break se guarda igual que 6-6 + tie-break', () => {
    const a = construirSets({ set1: set('7', '6', '7', '4'), set2: set('6', '3'), st: vacio, retiro: false })
    const b = construirSets({ set1: set('6', '6', '7', '4'), set2: set('6', '3'), st: vacio, retiro: false })
    expect(a).toEqual(b)
    if ('error' in a) throw new Error(a.error)
    expect(a.sets[0]).toMatchObject({ games_j1: 7, games_j2: 6, tiebreak_retador: 7, tiebreak_retado: 4, completo: true })
    expect(validarSets(a.sets, 'normal')).toBeNull()
    expect(validarMarcadorTorneo(a.sets, 'normal')).toBeNull()
  })

  it('6-7 en el set 2 con tie-break largo y Super Tiebreak', () => {
    const r = construirSets({ set1: set('6', '2'), set2: set('6', '7', '8', '10'), st: set('10', '7'), retiro: false })
    if ('error' in r) throw new Error(r.error)
    expect(r.sets[1]).toMatchObject({ games_j1: 6, games_j2: 7, tiebreak_retador: 8, tiebreak_retado: 10 })
    expect(validarMarcadorTorneo(r.sets, 'normal')).toBeNull()
  })

  it('7-6 sin tie-break pide cargarlo', () => {
    const r = construirSets({ set1: set('7', '6'), set2: set('6', '3'), st: vacio, retiro: false })
    expect(r).toHaveProperty('error')
    expect((r as { error: string }).error).toMatch(/tie-break/)
  })

  it('7-6 con un tie-break ganado por el otro lado se rechaza', () => {
    const r = construirSets({ set1: set('7', '6', '4', '7'), set2: set('6', '3'), st: vacio, retiro: false })
    expect(r).toHaveProperty('error')
  })
})
