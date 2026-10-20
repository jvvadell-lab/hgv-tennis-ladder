import { describe, expect, it } from 'vitest'
import { edadEnFecha, formatearHora, instanteEnCaracas } from './tiempo'
import {
  HORARIO_ESCUELA,
  categoriaSugerida,
  categoriasParaMenor,
  edadAlCorte,
  estadoInscripcionMenorCalculado,
  fechaCorteEdad,
  nombrePublicoMenor,
  normalizarFichaMenor,
  parsearPlantillaTurnos,
  pendientesInscripcionMenor,
  turnoInfantilValido,
  turnosInfantilesDelDia,
  validarInscripcionMenor,
  type DatosInscripcionMenor,
} from './torneoInfantil'
import { errorGeneros } from './torneoInscripcion'

// Las 4 categorías de la carga inicial (SPEC §14.1), género abierto.
const naranja = { id: 'nar', nombre: 'Pelota Naranja', genero: 'abierto' as const, edad_min: 8, edad_max: 10 }
const verde = { id: 'ver', nombre: 'Pelota Verde', genero: 'abierto' as const, edad_min: 9, edad_max: 11 }
const infantil = { id: 'inf', nombre: 'Infantil', genero: 'abierto' as const, edad_min: 12, edad_max: 14 }
const juvenil = { id: 'juv', nombre: 'Juvenil', genero: 'abierto' as const, edad_min: 15, edad_max: 17 }
const CATEGORIAS = [naranja, verde, infantil, juvenil]
const ids = (cs: { id: string }[]) => cs.map((c) => c.id)

const torneo2026 = { fecha_inicio: '2026-11-02', fecha_corte_edad: null }
const CORTE = '2026-12-31'

describe('edadEnFecha', () => {
  it('cuenta años cumplidos', () => {
    expect(edadEnFecha('2016-05-10', '2026-12-31')).toBe(10)
    expect(edadEnFecha('2016-12-31', '2026-12-31')).toBe(10) // cumple justo el día del corte
    expect(edadEnFecha('2017-01-01', '2026-12-31')).toBe(9)  // cumple al día siguiente del corte
  })
  it('29 de febrero cumple el 1 de marzo en años no bisiestos (como age() de Postgres)', () => {
    expect(edadEnFecha('2016-02-29', '2026-02-28')).toBe(9)
    expect(edadEnFecha('2016-02-29', '2026-03-01')).toBe(10)
  })
})

describe('fecha de corte', () => {
  it('sin fecha configurada, 31-dic del año del torneo', () => {
    expect(fechaCorteEdad(torneo2026)).toBe('2026-12-31')
    expect(fechaCorteEdad({ fecha_inicio: '2026-11-02', fecha_corte_edad: '2026-11-02' })).toBe('2026-11-02')
  })
  it('la edad se toma al corte, no hoy', () => {
    // Cumple 12 el 15-dic-2026: hoy (oct) tiene 11, pero al corte tiene 12.
    expect(edadAlCorte('2014-12-15', torneo2026)).toBe(12)
  })
})

describe('edad → categoría', () => {
  const casos: [number, string[], string | null][] = [
    [7, [], null],
    [8, ['nar'], 'nar'],
    [9, ['nar', 'ver'], 'nar'],   // centro Naranja = 9
    [10, ['nar', 'ver'], 'ver'],  // centro Verde = 10
    [11, ['ver'], 'ver'],
    [12, ['inf'], 'inf'],
    [14, ['inf'], 'inf'],
    [15, ['juv'], 'juv'],
    [17, ['juv'], 'juv'],
    [18, [], null],
  ]
  it.each(casos)('%i años → %j (sugerida %s)', (edad, posibles, sugerida) => {
    expect(ids(categoriasParaMenor(edad, 'caballeros', CATEGORIAS))).toEqual(posibles)
    expect(categoriaSugerida(edad, 'damas', CATEGORIAS)?.id ?? null).toBe(sugerida)
  })

  it('con categorías separadas por género, solo las de su género', () => {
    const verdeNinos = { ...verde, id: 'ver-m', genero: 'caballeros' as const }
    const verdeNinas = { ...verde, id: 'ver-f', genero: 'damas' as const }
    expect(ids(categoriasParaMenor(11, 'damas', [naranja, verdeNinos, verdeNinas]))).toEqual(['ver-f'])
    expect(ids(categoriasParaMenor(11, 'caballeros', [naranja, verdeNinos, verdeNinas]))).toEqual(['ver-m'])
  })

  it('empate de distancia → la de menor edad mínima', () => {
    const a = { id: 'a', nombre: 'A', genero: 'abierto' as const, edad_min: 8, edad_max: 12 }
    const b = { id: 'b', nombre: 'B', genero: 'abierto' as const, edad_min: 9, edad_max: 11 }
    expect(categoriaSugerida(10, 'caballeros', [b, a])?.id).toBe('a')
  })

  it("género 'abierto' admite a cualquiera en errorGeneros", () => {
    expect(errorGeneros('abierto', ['damas'])).toBeNull()
  })
})

describe('validarInscripcionMenor', () => {
  const datos = (p: Partial<DatosInscripcionMenor> = {}): DatosInscripcionMenor => ({
    estadoTorneo: 'inscripcion',
    soloSocios: false,
    fechaCorte: CORTE,
    categoria: { ...verde, cupo: 16, es_infantil: true },
    menor: { nombre: 'Sofía', genero: 'damas', fecha_nacimiento: '2016-03-01', numero_accion: null },
    autorizacionParticipacion: true,
    ocupados: 0,
    categoriasDelMenor: [],
    ...p,
  })
  const error = (p: Partial<DatosInscripcionMenor> = {}) => {
    const r = validarInscripcionMenor(datos(p))
    return r.ok ? null : r.error
  }

  it('caso válido', () => expect(error()).toBeNull())
  it('torneo sin inscripciones abiertas (el admin sí puede en borrador)', () => {
    expect(error({ estadoTorneo: 'borrador' })).toMatch(/no están abiertas/)
    expect(error({ estadoTorneo: 'borrador', porAdmin: true })).toBeNull()
    expect(error({ estadoTorneo: 'sorteado', porAdmin: true })).toMatch(/no están abiertas/)
  })
  it('autorización de participación obligatoria', () => expect(error({ autorizacionParticipacion: false })).toMatch(/autorización/))
  it('edad fuera de rango', () => {
    expect(error({ menor: { ...datos().menor, fecha_nacimiento: '2014-06-01' } })).toMatch(/12 años.*9 a 11/)
  })
  it('categoría de adultos', () => expect(error({ categoria: { ...verde, cupo: 16, es_infantil: false } })).toMatch(/no es una categoría infantil/))
  it('género', () => {
    expect(error({ categoria: { ...verde, genero: 'caballeros', cupo: 16, es_infantil: true } })).toMatch(/solo para niños/)
  })
  it('solo socios: sin N.º de acción igual se inscribe (queda pendiente de autorización)', () => {
    expect(error({ soloSocios: true })).toBeNull()
  })
  it('máximo 2 categorías y sin repetir', () => {
    expect(error({ categoriasDelMenor: ['ver'] })).toMatch(/ya está inscrito en Pelota Verde/)
    expect(error({ categoriasDelMenor: ['nar', 'otra'] })).toMatch(/máximo/)
    expect(error({ categoriasDelMenor: ['nar'] })).toBeNull()
  })
  it('cupo', () => expect(error({ ocupados: 16 })).toMatch(/cupo/))
})

describe('estado de la inscripción del menor', () => {
  const base = { estado: 'pendiente_pago' as const, menorId: 'm1', representanteJugadorId: 'rep', certificada: true, pagos: [] as { jugador_id: string; validado: boolean }[], soloSocios: true, menorConAccion: true, invitadoAutorizado: false }

  it('confirmada con pago del representante validado y categoría certificada', () => {
    expect(estadoInscripcionMenorCalculado({ ...base, pagos: [{ jugador_id: 'rep', validado: true }] })).toBe('confirmada')
  })
  it('pendientes: pago, pago por validar, certificación', () => {
    expect(pendientesInscripcionMenor(base).map((p) => p.tipo)).toEqual(['pago'])
    expect(pendientesInscripcionMenor({ ...base, pagos: [{ jugador_id: 'rep', validado: false }] }).map((p) => p.tipo)).toEqual(['pago_por_validar'])
    expect(pendientesInscripcionMenor({ ...base, certificada: false, pagos: [{ jugador_id: 'rep', validado: true }] }).map((p) => p.tipo)).toEqual(['categoria_por_certificar'])
  })
  it('el pago de otra persona no cuenta', () => {
    expect(pendientesInscripcionMenor({ ...base, pagos: [{ jugador_id: 'otro', validado: true }] }).map((p) => p.tipo)).toEqual(['pago'])
  })
  it('la retirada no se toca', () => expect(estadoInscripcionMenorCalculado({ ...base, estado: 'retirada' })).toBe('retirada'))
  it('solo socios: un menor sin N.º de acción necesita la autorización del admin (invitado / wild card)', () => {
    const pagado = { ...base, menorConAccion: false, pagos: [{ jugador_id: 'rep', validado: true }] }
    expect(pendientesInscripcionMenor(pagado).map((p) => p.tipo)).toEqual(['invitado_por_autorizar'])
    expect(estadoInscripcionMenorCalculado({ ...pagado, invitadoAutorizado: true })).toBe('confirmada')
  })
})

describe('ficha del menor', () => {
  const HOY = '2026-10-19'
  const valida = {
    nombre: ' Sofía ', apellido: 'Martínez', fecha_nacimiento: '2016-03-01', genero: 'damas',
    parentesco: 'madre', emergencia_nombre: 'Luis', emergencia_telefono: '0414-0000000', numero_accion: '',
  }
  it('normaliza', () => {
    const r = normalizarFichaMenor(valida, HOY)
    expect('ficha' in r && r.ficha).toMatchObject({ nombre: 'Sofía', numero_accion: null })
  })
  it('rechaza datos faltantes o inválidos', () => {
    const err = (p: object) => {
      const r = normalizarFichaMenor({ ...valida, ...p }, HOY)
      return 'error' in r ? r.error : null
    }
    expect(err({ apellido: '' })).toMatch(/apellido/)
    expect(err({ fecha_nacimiento: '2016-13-01' })).toMatch(/no es válida/)
    expect(err({ fecha_nacimiento: '2027-01-01' })).toMatch(/anterior a hoy/)
    expect(err({ fecha_nacimiento: '2000-01-01' })).toMatch(/menores/)
    expect(err({ genero: 'x' })).toMatch(/niño o niña/)
    expect(err({ parentesco: 'vecino' })).toMatch(/parentesco/)
    expect(err({ emergencia_telefono: ' ' })).toMatch(/emergencia/)
  })
  it('nombre público: nombre + inicial del apellido', () => {
    expect(nombrePublicoMenor(' María José ', 'martínez')).toBe('María José M.')
  })
})

describe('horario escuela', () => {
  it('parsea la plantilla de la base y rechaza la mal formada', () => {
    expect(parsearPlantillaTurnos({ dias: [1, 2, 3, 4, 5], desde: '15:00', hasta: '18:00', canchas: ['HGV1', 'HGV2'] })).toEqual(HORARIO_ESCUELA)
    expect(parsearPlantillaTurnos(null)).toBeNull()
    expect(parsearPlantillaTurnos({ ...HORARIO_ESCUELA, desde: '18:00', hasta: '15:00' })).toBeNull()
    expect(parsearPlantillaTurnos({ ...HORARIO_ESCUELA, canchas: ['HGV3'] })).toBeNull()
  })

  it('turno válido solo de 15:00 a 18:00, lunes a viernes', () => {
    const lunes = '2026-11-02'
    expect(turnoInfantilValido(HORARIO_ESCUELA, 'HGV1', instanteEnCaracas(lunes, '15:00'), 40)).toBe(true)
    expect(turnoInfantilValido(HORARIO_ESCUELA, 'HGV1', instanteEnCaracas(lunes, '17:20'), 40)).toBe(true)  // termina 18:00
    expect(turnoInfantilValido(HORARIO_ESCUELA, 'HGV1', instanteEnCaracas(lunes, '17:30'), 40)).toBe(false) // se pasa
    expect(turnoInfantilValido(HORARIO_ESCUELA, 'HGV2', instanteEnCaracas(lunes, '14:30'), 40)).toBe(false)
    expect(turnoInfantilValido(HORARIO_ESCUELA, 'HGV1', instanteEnCaracas('2026-11-07', '15:00'), 40)).toBe(false) // sábado
  })

  it('Naranja (40 min): 4 turnos por cancha', () => {
    const turnos = turnosInfantilesDelDia('2026-11-02', HORARIO_ESCUELA, 40)
    expect(turnos).toHaveLength(8)
    expect([...new Set(turnos.map((t) => formatearHora(t.inicio)))]).toEqual(['15:00', '15:40', '16:20', '17:00'])
  })
  it('90 min: 2 turnos por cancha; sin turnos el fin de semana', () => {
    expect([...new Set(turnosInfantilesDelDia('2026-11-02', HORARIO_ESCUELA, 90).map((t) => formatearHora(t.inicio)))]).toEqual(['15:00', '16:30'])
    expect(turnosInfantilesDelDia('2026-11-08', HORARIO_ESCUELA, 40)).toEqual([])
  })
})
