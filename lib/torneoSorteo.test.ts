import { describe, expect, it } from 'vitest'
import {
  armarSorteoCategoria,
  barajar,
  formatoSorteo,
  pendientesQueBloqueanSorteo,
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

  it('grupos flexibles (dobles, single e infantiles): 3–5 final, 6–8 semis, 9–11 cuartos con byes, 12–16 cuartos', () => {
    const casos: [number, string][] = [
      [3, '1/final'], [5, '1/final'], [6, '2/semis'], [7, '2/semis'], [8, '2/semis'],
      [9, '3/cuartos'], [10, '3/cuartos'], [11, '3/cuartos'], [12, '4/cuartos'], [13, '4/cuartos'], [16, '4/cuartos'],
    ]
    for (const c of [dobles, single, infantil, verde]) {
      for (const [n, esperado] of casos) expect(formato(c, n), `${c.nombre} con ${n}`).toBe(esperado)
    }
    expect(formato(dobles, 17)).toBe('bloqueado')
  })

  it('grupos de 3 o 4 (y uno de 5 con 5 inscritos)', () => {
    expect(tamanosGrupos(5, 1)).toEqual([5])
    expect(tamanosGrupos(7, 2)).toEqual([4, 3])
    expect(tamanosGrupos(9, 3)).toEqual([3, 3, 3])
    expect(tamanosGrupos(10, 3)).toEqual([4, 3, 3])
    expect(tamanosGrupos(11, 3)).toEqual([4, 4, 3])
    expect(tamanosGrupos(13, 4)).toEqual([4, 3, 3, 3])
  })

  it('la vista previa explica el formato y por qué', () => {
    const r = formatoSorteo(dobles, 10)
    expect(r.ok && r.formato.descripcion).toBe('10 duplas o inscritos (9 a 11) → 3 grupos (4, 3, 3) y cuartos con 2 byes: los 2 mejores primeros pasan directo a semis.')
    const r5 = formatoSorteo(single, 5)
    expect(r5.ok && r5.formato.descripcion).toContain('1 grupo todos contra todos y final')
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

  it('un solo grupo (3–5) no exige siembras', () => {
    const r = armarSorteoCategoria(infantil, inscripciones(5), 'bombos', semilla(2))
    if (!r.ok) throw new Error(r.error)
    expect(r.sorteo.grupos).toHaveLength(1)
    expect([...r.sorteo.grupos[0]].sort()).toEqual(['i1', 'i2', 'i3', 'i4', 'i5'])
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
    expect(grupoA.map((p) => [p.equipo_a, p.equipo_b].sort().join('-')).sort()).toEqual(['i1-i8', 'i1-i9', 'i8-i9'])
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

  it('5 inscritos: grupo único (10 partidos) y final 1A-2A', () => {
    const r = armarSorteoCategoria(infantil, inscripciones(5), 'serpentina', semilla(1))
    if (!r.ok) throw new Error(r.error)
    const plan = planCategoria(r.sorteo)
    expect(plan.partidos.filter((p) => p.fase === 'grupo')).toHaveLength(10)
    expect(plan.partidos.filter((p) => p.fase !== 'grupo').map((p) => `${p.fase}:${p.origen_a}-${p.origen_b}`)).toEqual(['final:1A-2A'])
  })

  it('3 inscritos: grupo de 3 y final entre los 2 primeros', () => {
    const r = armarSorteoCategoria(dobles, inscripciones(3), 'bombos', semilla(1))
    if (!r.ok) throw new Error(r.error)
    const plan = planCategoria(r.sorteo)
    expect(plan.partidos.filter((p) => p.fase === 'grupo')).toHaveLength(3)
    expect(plan.partidos.filter((p) => p.fase !== 'grupo').map((p) => `${p.origen_a}-${p.origen_b}`)).toEqual(['1A-2A'])
  })

  it('7 inscritos: 2 grupos (4 y 3) y semis cruzadas', () => {
    const r = armarSorteoCategoria(dobles, inscripciones(7, 2), 'bombos', semilla(3))
    if (!r.ok) throw new Error(r.error)
    const plan = planCategoria(r.sorteo)
    expect(plan.grupos.map((g) => g.miembros.length).sort().reverse()).toEqual([4, 3])
    expect(plan.partidos.filter((p) => p.fase === 'grupo')).toHaveLength(6 + 3)
    expect(plan.partidos.filter((p) => p.fase !== 'grupo').map((p) => `${p.fase}:${p.origen_a}-${p.origen_b}`)).toEqual(['semis:1A-2B', 'semis:1B-2A', 'final:G:S1-G:S2'])
  })

  it('9, 10 y 11 inscritos: 3 grupos y cuartos con 2 byes para los mejores primeros', () => {
    for (const n of [9, 10, 11]) {
      const r = armarSorteoCategoria(dobles, inscripciones(n, 3), 'bombos', semilla(n))
      if (!r.ok) throw new Error(r.error)
      const plan = planCategoria(r.sorteo)
      expect(plan.grupos).toHaveLength(3)
      expect(plan.partidos.filter((p) => p.fase !== 'grupo').map((p) => `${p.fase}:${p.origen_a}-${p.origen_b}`)).toEqual([
        'cuartos:P3-2P2', 'cuartos:2P1-2P3', 'semis:P1-G:C1', 'semis:P2-G:C2', 'final:G:S1-G:S2',
      ])
    }
  })

  it('13 inscritos: 4 grupos (4, 3, 3, 3) y cuartos', () => {
    const r = armarSorteoCategoria(dobles, inscripciones(13, 4), 'bombos', semilla(13))
    if (!r.ok) throw new Error(r.error)
    const plan = planCategoria(r.sorteo)
    expect(plan.grupos.map((g) => g.miembros.length).sort().reverse()).toEqual([4, 3, 3, 3])
    expect(plan.partidos.filter((p) => p.fase === 'cuartos')).toHaveLength(4)
  })
})

describe('pendientesQueBloqueanSorteo', () => {
  it('el pago pendiente no bloquea; la categoría, la certificación o la autorización de invitado sí', () => {
    const p = (tipo: any) => ({ tipo, jugadorId: 'x' })
    expect(pendientesQueBloqueanSorteo([p('pago'), p('pago_por_validar')])).toEqual([])
    expect(pendientesQueBloqueanSorteo([p('pago'), p('categoria'), p('categoria_incompatible'), p('categoria_por_certificar'), p('invitado_por_autorizar')]).map((x) => x.tipo))
      .toEqual(['categoria', 'categoria_incompatible', 'categoria_por_certificar', 'invitado_por_autorizar'])
  })
})

describe('barajar', () => {
  it('no pierde ni repite elementos', () => {
    expect(barajar([1, 2, 3, 4, 5], semilla(7)).sort()).toEqual([1, 2, 3, 4, 5])
  })
})
