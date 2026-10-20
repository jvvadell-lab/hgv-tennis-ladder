import { describe, expect, it } from 'vitest'
import {
  armarSorteoCategoria,
  barajar,
  formatoSorteo,
  planCategoria,
  tamanosGrupos,
  validarGruposSorteo,
  type CategoriaParaSorteo,
  type InscripcionParaSorteo,
} from './torneoSorteo'

// --- Helpers ---------------------------------------------------------------

const dobles: CategoriaParaSorteo = { id: 'dm', nombre: 'Doble Masculino Sexta', es_infantil: false, num_grupos: 4, llave_desde: 'cuartos', partidos_minimos: null, orden: 1 }
const single: CategoriaParaSorteo = { id: 'sq', nombre: 'Single Caballeros Quinta', es_infantil: false, num_grupos: 2, llave_desde: 'semis', partidos_minimos: null, orden: 4 }
const naranja: CategoriaParaSorteo = { id: 'pn', nombre: 'Pelota Naranja', es_infantil: true, num_grupos: 4, llave_desde: 'sin_llave', partidos_minimos: 3, orden: 11 }
const verde: CategoriaParaSorteo = { id: 'pv', nombre: 'Pelota Verde', es_infantil: true, num_grupos: 4, llave_desde: 'cuartos', partidos_minimos: null, orden: 12 }
const infantil: CategoriaParaSorteo = { id: 'ic', nombre: 'Infantil Caballeros', es_infantil: true, num_grupos: 2, llave_desde: 'semis', partidos_minimos: null, orden: 13 }

// n inscripciones 'i1'..'in'; las primeras `sembradas` con siembra 1..k.
const inscripciones = (n: number, sembradas = 0, bombos: Record<string, number> = {}): InscripcionParaSorteo[] =>
  Array.from({ length: n }, (_, k) => ({ id: `i${k + 1}`, siembra: k < sembradas ? k + 1 : null, bombo: bombos[`i${k + 1}`] ?? null }))

// Generador pseudoaleatorio con semilla (mulberry32): sorteos reproducibles.
function semilla(s: number) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const formato = (c: CategoriaParaSorteo, n: number) => {
  const r = formatoSorteo(c, n)
  return r.ok ? `${r.formato.numGrupos}/${r.formato.llave}` : 'bloqueado'
}

// --- Formato según inscritos -------------------------------------------------

describe('formatoSorteo', () => {
  it('menos de 3 confirmadas bloquea el sorteo, en cualquier categoría', () => {
    for (const c of [dobles, single, naranja, verde, infantil]) {
      expect(formato(c, 2)).toBe('bloqueado')
      expect(formato(c, 0)).toBe('bloqueado')
    }
    const r = formatoSorteo(dobles, 2)
    expect(!r.ok && r.error).toContain('al menos 3')
  })

  it('adultos: los grupos de la categoría; bloquea si un grupo quedaría con menos de 3', () => {
    expect(formato(dobles, 12)).toBe('4/cuartos')
    expect(formato(dobles, 11)).toBe('bloqueado')   // 3,3,3,2
    expect(formato(single, 8)).toBe('2/semis')
    expect(formato(single, 7)).toBe('2/semis')      // 4,3
    expect(formato(single, 5)).toBe('bloqueado')    // 3,2
    const r = formatoSorteo(dobles, 11)
    expect(!r.ok && r.error).toContain('invitados o wild card')
  })

  it('infantil con llave: 3–4 sin llave, 5–7 grupo único + final, 8+ grupos', () => {
    expect(formato(infantil, 3)).toBe('1/sin_llave')
    expect(formato(infantil, 4)).toBe('1/sin_llave')
    expect(formato(infantil, 5)).toBe('1/final')
    expect(formato(infantil, 7)).toBe('1/final')
    expect(formato(infantil, 8)).toBe('2/semis')
    expect(formato(verde, 6)).toBe('1/final')
    expect(formato(verde, 16)).toBe('4/cuartos')
    expect(formato(verde, 12)).toBe('4/cuartos')
    expect(formato(verde, 11)).toBe('2/semis')      // 4 grupos dejarían uno de 2
    expect(formato(verde, 8)).toBe('2/semis')
  })

  it('Pelota Naranja: un grupo hasta 7, después grupos de al menos 4', () => {
    expect(formato(naranja, 5)).toBe('1/sin_llave')
    expect(formato(naranja, 7)).toBe('1/sin_llave')
    expect(formato(naranja, 8)).toBe('2/sin_llave')
    expect(formato(naranja, 11)).toBe('2/sin_llave')
    expect(formato(naranja, 12)).toBe('3/sin_llave')
    expect(formato(naranja, 16)).toBe('4/sin_llave')
  })

  it('Pelota Naranja con 3: se puede, pero avisa que no llega al mínimo de partidos', () => {
    const r = formatoSorteo(naranja, 3)
    expect(r.ok && r.formato.avisos.join(' ')).toContain('mínimo de 3')
    const r4 = formatoSorteo(naranja, 4)
    expect(r4.ok && r4.formato.avisos).toEqual([])
  })
})

describe('tamanosGrupos', () => {
  it('reparte parejo', () => {
    expect(tamanosGrupos(7, 2)).toEqual([4, 3])
    expect(tamanosGrupos(12, 4)).toEqual([3, 3, 3, 3])
    expect(tamanosGrupos(10, 3)).toEqual([4, 3, 3])
  })
})

// --- Bombos --------------------------------------------------------------------

describe('armarSorteoCategoria — bombos', () => {
  it('las siembras 1..G quedan fijas como cabezas de A..G', () => {
    for (let s = 1; s <= 20; s++) {
      const r = armarSorteoCategoria(dobles, inscripciones(12, 4), 'bombos', semilla(s))
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.sorteo.grupos.map((g) => g[0])).toEqual(['i1', 'i2', 'i3', 'i4'])
      expect(r.sorteo.grupos.map((g) => g.length)).toEqual([3, 3, 3, 3])
    }
  })

  it('cada bombo pone uno por grupo', () => {
    // bombo 2 = i5..i8, bombo 3 = i9..i12
    const bombos = Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`i${k + 5}`, k < 4 ? 2 : 3]))
    for (let s = 1; s <= 20; s++) {
      const r = armarSorteoCategoria(dobles, inscripciones(12, 4, bombos), 'bombos', semilla(s))
      if (!r.ok) throw new Error(r.error)
      for (const g of r.sorteo.grupos) {
        expect(g.filter((id) => bombos[id] === 2)).toHaveLength(1)
        expect(g.filter((id) => bombos[id] === 3)).toHaveLength(1)
      }
    }
  })

  it('repetir el sorteo da resultados distintos (los bombos se sortean)', () => {
    const resultados = new Set<string>()
    for (let s = 1; s <= 10; s++) {
      const r = armarSorteoCategoria(dobles, inscripciones(12, 4), 'bombos', semilla(s))
      if (r.ok) resultados.add(JSON.stringify(r.sorteo.grupos))
    }
    expect(resultados.size).toBeGreaterThan(1)
  })

  it('bombo incompleto: los grupos quedan parejos', () => {
    // 7 en 2 grupos: cabezas 1 y 2, bombo 2 con 2, el resto (3) sin bombo.
    const r = armarSorteoCategoria(single, inscripciones(7, 2, { i3: 2, i4: 2 }), 'bombos', semilla(3))
    if (!r.ok) throw new Error(r.error)
    expect(r.sorteo.grupos.map((g) => g.length).sort()).toEqual([3, 4])
  })

  it('faltan las siembras de las cabezas → error claro', () => {
    const r = armarSorteoCategoria(dobles, inscripciones(12, 3), 'bombos', semilla(1))
    expect(!r.ok && r.error).toContain('siembra 4')
  })

  it('un bombo con más inscripciones que grupos → error', () => {
    const r = armarSorteoCategoria(single, inscripciones(8, 2, { i3: 2, i4: 2, i5: 2 }), 'bombos', semilla(1))
    expect(!r.ok && r.error).toContain('bombo 2')
  })

  it('una cabeza no puede ir en otro bombo, ni otra inscripción en el bombo 1', () => {
    expect(armarSorteoCategoria(single, inscripciones(8, 2, { i1: 2 }), 'bombos').ok).toBe(false)
    expect(armarSorteoCategoria(single, inscripciones(8, 2, { i5: 1 }), 'bombos').ok).toBe(false)
  })

  it('un solo grupo (infantil de 5–7) no exige siembras', () => {
    const r = armarSorteoCategoria(infantil, inscripciones(6), 'bombos', semilla(2))
    if (!r.ok) throw new Error(r.error)
    expect(r.sorteo.grupos).toHaveLength(1)
    expect([...r.sorteo.grupos[0]].sort()).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6'])
  })
})

// --- Serpentina ------------------------------------------------------------------

describe('armarSorteoCategoria — serpentina', () => {
  it('con todas las siembras da la serpentina del SPEC', () => {
    const r = armarSorteoCategoria(dobles, inscripciones(12, 12), 'serpentina', semilla(1))
    if (!r.ok) throw new Error(r.error)
    expect(r.sorteo.grupos).toEqual([
      ['i1', 'i8', 'i9'], ['i2', 'i7', 'i10'], ['i3', 'i6', 'i11'], ['i4', 'i5', 'i12'],
    ])
  })

  it('las que no tienen siembra van detrás, al azar', () => {
    const r = armarSorteoCategoria(dobles, inscripciones(12, 4), 'serpentina', semilla(5))
    if (!r.ok) throw new Error(r.error)
    expect(r.sorteo.grupos.map((g) => g[0])).toEqual(['i1', 'i2', 'i3', 'i4'])
  })
})

// --- Validación al publicar ---------------------------------------------------------

describe('validarGruposSorteo', () => {
  const ins = inscripciones(8, 2)

  it('acepta lo que armó la vista previa', () => {
    const r = armarSorteoCategoria(single, ins, 'bombos', semilla(4))
    if (!r.ok) throw new Error(r.error)
    expect(validarGruposSorteo(single, ins, 'bombos', r.sorteo.grupos).ok).toBe(true)
  })

  it('rechaza si cambiaron las confirmadas', () => {
    const grupos = [['i1', 'i3', 'i5', 'i7'], ['i2', 'i4', 'i6', 'i8']]
    expect(validarGruposSorteo(single, inscripciones(8, 2), 'bombos', grupos).ok).toBe(true)
    const r = validarGruposSorteo(single, [...ins, { id: 'i9', siembra: null, bombo: null }], 'bombos', grupos)
    expect(!r.ok && r.error).toContain('Repite el sorteo')
    expect(validarGruposSorteo(single, ins, 'bombos', [['i1', 'i3', 'i5', 'i7'], ['i2', 'i4', 'i6', 'i6']]).ok).toBe(false)
  })

  it('rechaza cabezas cambiadas en bombos y grupos disparejos', () => {
    expect(validarGruposSorteo(single, ins, 'bombos', [['i2', 'i3', 'i5', 'i7'], ['i1', 'i4', 'i6', 'i8']]).ok).toBe(false)
    expect(validarGruposSorteo(single, ins, 'serpentina', [['i1', 'i3', 'i5', 'i7', 'i4'], ['i2', 'i6', 'i8']]).ok).toBe(false)
    expect(validarGruposSorteo(single, ins, 'bombos', 'basura').ok).toBe(false)
  })
})

// --- Partidos generados -----------------------------------------------------------

describe('planCategoria', () => {
  it('dobles 4×3: 12 partidos de grupo y 7 de llave desde cuartos', () => {
    const r = armarSorteoCategoria(dobles, inscripciones(12, 12), 'serpentina')
    if (!r.ok) throw new Error(r.error)
    const plan = planCategoria(r.sorteo)
    expect(plan.grupos.map((g) => g.letra)).toEqual(['A', 'B', 'C', 'D'])
    expect(plan.partidos.filter((p) => p.fase === 'grupo')).toHaveLength(12)
    expect(plan.partidos.filter((p) => p.fase !== 'grupo').map((p) => `${p.fase}${p.orden}:${p.origen_a}-${p.origen_b}`)).toEqual([
      'cuartos1:1A-2B', 'cuartos2:1C-2D', 'cuartos3:1B-2A', 'cuartos4:1D-2C',
      'semis1:G:C1-G:C2', 'semis2:G:C3-G:C4', 'final1:G:S1-G:S2',
    ])
    const grupoA = plan.partidos.filter((p) => p.letra === 'A')
    expect(grupoA.map((p) => [p.inscripcion_a, p.inscripcion_b].sort().join('-')).sort()).toEqual(['i1-i8', 'i1-i9', 'i8-i9'])
  })

  it('Pelota Naranja: solo grupos, sin llave', () => {
    const r = armarSorteoCategoria(naranja, inscripciones(16), 'bombos', semilla(9))
    expect(r.ok).toBe(false) // con 4 grupos hacen falta las siembras 1–4
    const ok = armarSorteoCategoria(naranja, inscripciones(16, 4), 'bombos', semilla(9))
    if (!ok.ok) throw new Error(ok.error)
    const plan = planCategoria(ok.sorteo)
    expect(plan.partidos.every((p) => p.fase === 'grupo')).toBe(true)
    expect(plan.partidos).toHaveLength(4 * 6)
  })

  it('infantil de 6: grupo único (15 partidos) y final 1A-2A', () => {
    const r = armarSorteoCategoria(infantil, inscripciones(6), 'serpentina', semilla(1))
    if (!r.ok) throw new Error(r.error)
    const plan = planCategoria(r.sorteo)
    expect(plan.partidos.filter((p) => p.fase === 'grupo')).toHaveLength(15)
    expect(plan.partidos.filter((p) => p.fase !== 'grupo').map((p) => `${p.fase}:${p.origen_a}-${p.origen_b}`)).toEqual(['final:1A-2A'])
  })

  it('infantil de 4: grupo único, sin llave', () => {
    const r = armarSorteoCategoria(infantil, inscripciones(4), 'bombos', semilla(1))
    if (!r.ok) throw new Error(r.error)
    expect(planCategoria(r.sorteo).partidos.every((p) => p.fase === 'grupo')).toBe(true)
  })
})

describe('barajar', () => {
  it('no pierde ni repite elementos', () => {
    expect(barajar([1, 2, 3, 4, 5], semilla(7)).sort()).toEqual([1, 2, 3, 4, 5])
  })
})
