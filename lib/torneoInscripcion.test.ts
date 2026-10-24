import { describe, expect, it } from 'vitest'
import {
  CELDAS_DISPONIBILIDAD,
  ERROR_CATEGORIA_CERRADA,
  categoriaAbierta,
  errorGeneros,
  estadoInscripcionCalculado,
  mensajeErrorBaseInscripcion,
  montoInscripcionBs,
  nivelAdmitido,
  normalizarDisponibilidad,
  pendientesInscripcion,
  validarInscripcion,
  type DatosValidacionInscripcion,
  type JugadorParaInscripcion,
} from './torneoInscripcion'

// --- Helpers ---------------------------------------------------------------

const jugador = (id: string, genero: string, categoria: string, oficial: string | null = categoria): JugadorParaInscripcion => ({
  id, nombre: id.toUpperCase(), genero, categoria, categoria_torneo: oficial, activo: true, estado_verificacion: 'verificado',
})

const dobleMasculinoSexta = { modalidad: 'doble' as const, genero: 'caballeros' as const, categoria_nivel: 'sexta' as const, cupo: 12, inscripciones_abiertas: true }
const mixto = { modalidad: 'doble' as const, genero: 'mixto' as const, categoria_nivel: null, cupo: 12, inscripciones_abiertas: true }
const singleQuinta = { modalidad: 'single' as const, genero: 'caballeros' as const, categoria_nivel: 'quinta' as const, cupo: 8, inscripciones_abiertas: true }

function datos(parcial: Partial<DatosValidacionInscripcion>): DatosValidacionInscripcion {
  return {
    estadoTorneo: 'inscripcion',
    categoria: dobleMasculinoSexta,
    jugadores: [jugador('ana', 'caballeros', 'sexta')],
    ocupados: 0,
    categoriasDe: {},
    categoriaId: 'cat-1',
    ...parcial,
  }
}
const error = (d: DatosValidacionInscripcion) => {
  const r = validarInscripcion(d)
  return r.ok ? null : r.error
}

// --- Nivel y género --------------------------------------------------------

describe('nivelAdmitido', () => {
  it('Sexta admite Sexta y Sexta Novato', () => {
    expect(nivelAdmitido('sexta', 'sexta')).toBe(true)
    expect(nivelAdmitido('sexta', 'sexta_novatos')).toBe(true)
    expect(nivelAdmitido('sexta', 'quinta')).toBe(false)
  })
  it('Quinta solo admite Quinta', () => {
    expect(nivelAdmitido('quinta', 'quinta')).toBe(true)
    expect(nivelAdmitido('quinta', 'sexta')).toBe(false)
    expect(nivelAdmitido('quinta', 'cuarta')).toBe(false)
  })
  it('nivel libre (Mixto con handicap) admite cualquiera', () => {
    expect(nivelAdmitido(null, 'cuarta')).toBe(true)
    expect(nivelAdmitido(null, 'sexta_novatos')).toBe(true)
  })
})

describe('errorGeneros', () => {
  it('Mixto exige un caballero y una dama', () => {
    expect(errorGeneros('mixto', ['damas', 'caballeros'])).toBeNull()
    expect(errorGeneros('mixto', ['damas', 'damas'])).toMatch(/caballero y una dama/)
    expect(errorGeneros('mixto', ['caballeros', 'caballeros'])).toMatch(/caballero y una dama/)
  })
  it('damas y caballeros', () => {
    expect(errorGeneros('damas', ['damas', 'damas'])).toBeNull()
    expect(errorGeneros('damas', ['damas', 'caballeros'])).toMatch(/solo para damas/)
    expect(errorGeneros('caballeros', ['caballeros'])).toBeNull()
  })
})

// --- validarInscripcion ----------------------------------------------------

describe('validarInscripcion', () => {
  it('en dobles cada jugador se inscribe solo, sin pareja', () => {
    expect(validarInscripcion(datos({}))).toEqual({ ok: true, provisionales: [] })
    expect(error(datos({ jugadores: [jugador('ana', 'caballeros', 'sexta'), jugador('beto', 'caballeros', 'sexta')] }))).toMatch(/por separado/)
  })

  it('solo con el torneo en inscripción', () => {
    expect(error(datos({ estadoTorneo: 'borrador' }))).toMatch(/no están abiertas/)
    expect(error(datos({ estadoTorneo: 'sorteado' }))).toMatch(/no están abiertas/)
  })

  it('rechaza una categoría cerrada aunque el torneo esté en inscripción', () => {
    expect(error(datos({ categoria: { ...dobleMasculinoSexta, inscripciones_abiertas: false } }))).toBe(ERROR_CATEGORIA_CERRADA)
    expect(error(datos({ categoria: { ...dobleMasculinoSexta, inscripciones_abiertas: true } }))).toBeNull()
  })

  it('categoriaAbierta exige torneo en inscripción y categoría abierta', () => {
    expect(categoriaAbierta('inscripcion', { inscripciones_abiertas: true })).toBe(true)
    expect(categoriaAbierta('inscripcion', { inscripciones_abiertas: false })).toBe(false)
    expect(categoriaAbierta('borrador', { inscripciones_abiertas: true })).toBe(false)
    expect(categoriaAbierta('sorteado', { inscripciones_abiertas: true })).toBe(false)
  })

  it('traduce el error del trigger de categoría cerrada', () => {
    expect(mensajeErrorBaseInscripcion('ERROR: Las inscripciones de esta categoría no están abiertas')).toBe(ERROR_CATEGORIA_CERRADA)
  })

  it('single: un jugador', () => {
    expect(error(datos({ categoria: singleQuinta, jugadores: [jugador('ana', 'caballeros', 'quinta')] }))).toBeNull()
  })

  it('jugador inactivo o no permitido', () => {
    expect(error(datos({ jugadores: [{ ...jugador('beto', 'caballeros', 'sexta'), activo: false }] }))).toMatch(/BETO no está activo/)
    expect(error(datos({ jugadores: [{ ...jugador('beto', 'caballeros', 'sexta'), estado_verificacion: 'no_permitido' }] }))).toMatch(/BETO no está activo/)
  })

  it('género de la categoría; en el Mixto entran los dos', () => {
    expect(error(datos({ jugadores: [jugador('eva', 'damas', 'sexta')] }))).toMatch(/solo para caballeros/)
    expect(error(datos({ categoria: mixto, jugadores: [jugador('eva', 'damas', 'sexta_novatos')] }))).toBeNull()
    expect(error(datos({ categoria: mixto, jugadores: [jugador('ana', 'caballeros', 'cuarta')] }))).toBeNull()
  })

  it('nivel: usa la categoría oficial si la hay', () => {
    // En la escalera es sexta, pero el admin lo certificó quinta.
    expect(error(datos({ jugadores: [jugador('beto', 'caballeros', 'sexta', 'quinta')] }))).toMatch(/BETO.*oficial de torneo es Quinta/)
  })

  it('nivel: sin oficial, valida con la de la escalera y queda provisional', () => {
    expect(validarInscripcion(datos({ jugadores: [jugador('beto', 'caballeros', 'sexta_novatos', null)] }))).toEqual({ ok: true, provisionales: ['beto'] })
    expect(error(datos({ jugadores: [jugador('beto', 'caballeros', 'quinta', null)] }))).toMatch(/su categoría es Quinta/)
  })

  it('máximo 2 categorías por jugador, con mensaje claro', () => {
    expect(error(datos({ categoriasDe: { ana: ['cat-2', 'cat-3'] } }))).toMatch(/ANA ya está inscrito en 2 categorías/)
    expect(error(datos({ categoriasDe: { ana: ['cat-2'] } }))).toBeNull()
  })

  it('no dos veces en la misma categoría', () => {
    expect(error(datos({ categoriasDe: { ana: ['cat-1'] } }))).toMatch(/ANA ya está inscrito en esta categoría/)
  })

  it('cupo: en dobles, parejas × 2 inscripciones', () => {
    expect(error(datos({ ocupados: 23 }))).toBeNull()
    expect(error(datos({ ocupados: 24 }))).toMatch(/cupo/)
    expect(error(datos({ categoria: singleQuinta, jugadores: [jugador('ana', 'caballeros', 'quinta')], ocupados: 7 }))).toBeNull()
    expect(error(datos({ categoria: singleQuinta, jugadores: [jugador('ana', 'caballeros', 'quinta')], ocupados: 8 }))).toMatch(/cupo/)
  })
})

describe('mensajeErrorBaseInscripcion', () => {
  it('reconoce los errores del trigger', () => {
    expect(mensajeErrorBaseInscripcion('ERROR: La categoría ya no tiene cupo')).toBe('La categoría ya no tiene cupo')
    expect(mensajeErrorBaseInscripcion('duplicate key value')).toBeNull()
  })
})

// --- Estado de la inscripción ----------------------------------------------

describe('estado de la inscripción', () => {
  const base = {
    estado: 'pendiente_pago' as const,
    nivelCategoria: 'sexta' as const,
    jugadores: [{ id: 'ana', categoria_torneo: 'sexta', es_invitado: false }, { id: 'beto', categoria_torneo: 'sexta_novatos', es_invitado: false }],
    pagos: [{ jugador_id: 'ana', validado: true }, { jugador_id: 'beto', validado: true }],
    soloSocios: true,
    invitadoAutorizado: false,
  }

  it('confirmada con los dos pagos validados y categoría oficial compatible', () => {
    expect(pendientesInscripcion(base)).toEqual([])
    expect(estadoInscripcionCalculado(base)).toBe('confirmada')
  })

  it('falta un pago, o está por validar', () => {
    const d = { ...base, pagos: [{ jugador_id: 'ana', validado: false }] }
    expect(pendientesInscripcion(d)).toEqual([
      { tipo: 'pago_por_validar', jugadorId: 'ana' },
      { tipo: 'pago', jugadorId: 'beto' },
    ])
    expect(estadoInscripcionCalculado(d)).toBe('pendiente_pago')
  })

  it('un pago rechazado y otro validado del mismo jugador basta', () => {
    const d = { ...base, pagos: [...base.pagos, { jugador_id: 'ana', validado: false }] }
    expect(estadoInscripcionCalculado(d)).toBe('confirmada')
  })

  it('pagos al día pero sin categoría oficial: no se confirma', () => {
    const d = { ...base, jugadores: [{ id: 'ana', categoria_torneo: 'sexta', es_invitado: false }, { id: 'beto', categoria_torneo: null, es_invitado: false }] }
    expect(pendientesInscripcion(d)).toEqual([{ tipo: 'categoria', jugadorId: 'beto' }])
    expect(estadoInscripcionCalculado(d)).toBe('pendiente_pago')
  })

  it('categoría oficial incompatible: vuelve a pendiente', () => {
    const d = { ...base, estado: 'confirmada' as const, jugadores: [{ id: 'ana', categoria_torneo: 'quinta', es_invitado: false }, { id: 'beto', categoria_torneo: 'sexta', es_invitado: false }] }
    expect(pendientesInscripcion(d)).toEqual([{ tipo: 'categoria_incompatible', jugadorId: 'ana' }])
    expect(estadoInscripcionCalculado(d)).toBe('pendiente_pago')
  })

  it('una retirada sigue retirada', () => {
    expect(estadoInscripcionCalculado({ ...base, estado: 'retirada' })).toBe('retirada')
  })

  it('solo socios: la pareja con un invitado no se confirma sin la autorización del admin', () => {
    const conInvitado = { ...base, jugadores: [base.jugadores[0], { ...base.jugadores[1], es_invitado: true }] }
    expect(pendientesInscripcion(conInvitado)).toEqual([{ tipo: 'invitado_por_autorizar', jugadorId: 'beto' }])
    expect(estadoInscripcionCalculado(conInvitado)).toBe('pendiente_pago')
    expect(estadoInscripcionCalculado({ ...conInvitado, invitadoAutorizado: true })).toBe('confirmada')
    expect(estadoInscripcionCalculado({ ...conInvitado, soloSocios: false })).toBe('confirmada')
  })
})

// --- Monto y disponibilidad ------------------------------------------------

describe('montoInscripcionBs', () => {
  it('15 € × tasa EUR truncada a 2 decimales', () => {
    expect(montoInscripcionBs(15, 1000.129)).toBe(15001.8) // tasa 1000,12
    expect(montoInscripcionBs(15, 859.0629)).toBe(12885.9) // tasa 859,06
  })
})

describe('normalizarDisponibilidad', () => {
  it('10 celdas: lun–vie × 2 franjas', () => {
    expect(CELDAS_DISPONIBILIDAD).toHaveLength(10)
  })
  it('normaliza orden, repetidos y nota', () => {
    expect(normalizarDisponibilidad(['vie_2', 'lun_1', 'vie_2'], '  Viajo el 20-nov  ')).toEqual({
      no_disponible: ['lun_1', 'vie_2'], nota: 'Viajo el 20-nov',
    })
    expect(normalizarDisponibilidad([], '')).toEqual({ no_disponible: [], nota: null })
  })
  it('rechaza celdas desconocidas y notas largas', () => {
    expect(normalizarDisponibilidad(['sab_1'], null)).toEqual({ error: 'Franja no válida: sab_1' })
    expect(normalizarDisponibilidad('lun_1', null)).toHaveProperty('error')
    expect(normalizarDisponibilidad([], 'x'.repeat(501))).toHaveProperty('error')
  })
})
