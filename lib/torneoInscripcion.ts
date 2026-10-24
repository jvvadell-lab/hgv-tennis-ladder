// Inscripción y pagos de torneos internos (Torneo Navidad HGV 2026 — SPEC §1
// y §2, fase 3). Lógica pura, sin llamadas a Supabase: la usan las rutas
// app/api/jugador/torneo/... y app/api/admin/torneo/... y la UI. Tests en
// lib/torneoInscripcion.test.ts.
//
// Categoría oficial de torneo (jugadores.categoria_torneo): la asigna solo el
// admin. Mientras no la tenga, el jugador se inscribe de forma provisional
// con su categoría de la escalera (jugadores.categoria) y la inscripción no
// se confirma hasta que el admin le asigne una compatible.

import { tasaDosDecimales } from './delegacion'
import { MAX_CATEGORIAS_POR_JUGADOR, type EstadoInscripcion, type EstadoTorneo, type TorneoCategoria, type Nivel } from './torneo'

export const ETIQUETA_NIVEL: Record<Nivel, string> = {
  sexta_novatos: 'Sexta Novato',
  sexta: 'Sexta',
  quinta: 'Quinta',
  cuarta: 'Cuarta',
}

export const ETIQUETA_GENERO_JUGADOR: Record<string, string> = {
  caballeros: 'Caballero',
  damas: 'Dama',
}

// Métodos de pago del torneo: se paga en Bs., así que no hay efectivo (US$).
export const TIPOS_PAGO_TORNEO = ['pago_movil', 'transferencia'] as const
export type TipoPagoTorneo = (typeof TIPOS_PAGO_TORNEO)[number]

// ---------------------------------------------------------------------------
// Nivel y género
// ---------------------------------------------------------------------------

// Niveles que admite una categoría. Sexta admite también Sexta Novato; el
// resto, solo su nivel exacto. null = libre (Mixto con handicap).
export function nivelesAdmitidos(nivelCategoria: Nivel | null): Nivel[] | null {
  if (nivelCategoria === null) return null
  if (nivelCategoria === 'sexta') return ['sexta', 'sexta_novatos']
  return [nivelCategoria]
}

export function nivelAdmitido(nivelCategoria: Nivel | null, nivelJugador: string | null | undefined): boolean {
  const admitidos = nivelesAdmitidos(nivelCategoria)
  if (admitidos === null) return true
  return !!nivelJugador && (admitidos as string[]).includes(nivelJugador)
}

// null si los géneros cuadran con la categoría; si no, el error.
export function errorGeneros(generoCategoria: TorneoCategoria['genero'], generos: string[]): string | null {
  if (generoCategoria === 'abierto') return null
  if (generoCategoria === 'mixto') {
    const ordenados = [...generos].sort().join(',')
    return ordenados === 'caballeros,damas' ? null : 'El Mixto es para una pareja de un caballero y una dama'
  }
  if (generos.every((g) => g === generoCategoria)) return null
  return generoCategoria === 'damas' ? 'Esta categoría es solo para damas' : 'Esta categoría es solo para caballeros'
}

// ---------------------------------------------------------------------------
// Apertura por categoría
// ---------------------------------------------------------------------------

// Una categoría acepta inscripciones solo con el torneo en 'inscripcion' y
// la categoría abierta por el admin (el trigger lo repite).
export function categoriaAbierta(estadoTorneo: EstadoTorneo, categoria: Pick<TorneoCategoria, 'inscripciones_abiertas'>): boolean {
  return estadoTorneo === 'inscripcion' && categoria.inscripciones_abiertas
}

export const ERROR_CATEGORIA_CERRADA = 'Las inscripciones de esta categoría no están abiertas'

// ---------------------------------------------------------------------------
// Validación de una inscripción nueva
// ---------------------------------------------------------------------------

export type JugadorParaInscripcion = {
  id: string
  nombre: string
  genero: string
  categoria: string                 // de la escalera (la declara el jugador)
  categoria_torneo: string | null   // oficial, la asigna el admin
  activo: boolean
  estado_verificacion: string
}

export type DatosValidacionInscripcion = {
  estadoTorneo: EstadoTorneo
  categoria: Pick<TorneoCategoria, 'modalidad' | 'genero' | 'categoria_nivel' | 'cupo' | 'inscripciones_abiertas'>
  // [quien se inscribe]: también en dobles, cada jugador por separado.
  jugadores: JugadorParaInscripcion[]
  // Inscripciones vivas (no retiradas) en la categoría.
  ocupados: number
  // Por jugador: categorías (ids) en las que ya está inscrito en este torneo.
  categoriasDe: Record<string, string[]>
  categoriaId: string
}

export type ResultadoValidacion =
  | { ok: false; error: string }
  // provisionales: jugadores que todavía no tienen categoría oficial.
  | { ok: true; provisionales: string[] }

// Nivel con el que se valida: el oficial si lo tiene; si no, el de la escalera.
export const nivelParaTorneo = (j: Pick<JugadorParaInscripcion, 'categoria' | 'categoria_torneo'>) => j.categoria_torneo ?? j.categoria

// Inscripciones que caben en la categoría: en dobles, parejas × 2.
export const cupoInscripciones = (c: Pick<TorneoCategoria, 'modalidad' | 'cupo'>) => c.cupo * (c.modalidad === 'doble' ? 2 : 1)

export function validarInscripcion(d: DatosValidacionInscripcion): ResultadoValidacion {
  const { categoria, jugadores } = d
  if (d.estadoTorneo !== 'inscripcion') return { ok: false, error: 'Las inscripciones del torneo no están abiertas' }
  if (!categoriaAbierta(d.estadoTorneo, categoria)) return { ok: false, error: ERROR_CATEGORIA_CERRADA }

  // Cada jugador se inscribe solo, también en dobles: la pareja se forma
  // aparte (lib/torneoDobles.ts).
  if (jugadores.length !== 1) return { ok: false, error: 'Cada jugador se inscribe por separado' }

  for (const j of jugadores) {
    if (!j.activo || j.estado_verificacion === 'no_permitido') {
      return { ok: false, error: `${j.nombre} no está activo en el club y no puede inscribirse` }
    }
  }

  // En el Mixto entra cualquiera de los dos géneros; la dupla se revisa al formarla.
  const errGenero = categoria.genero === 'mixto' ? null : errorGeneros(categoria.genero, jugadores.map((j) => j.genero))
  if (errGenero) return { ok: false, error: errGenero }

  for (const j of jugadores) {
    const nivel = nivelParaTorneo(j)
    if (!nivelAdmitido(categoria.categoria_nivel, nivel)) {
      const admitidos = nivelesAdmitidos(categoria.categoria_nivel)!.map((n) => ETIQUETA_NIVEL[n]).join(' o ')
      const origen = j.categoria_torneo ? 'su categoría oficial de torneo' : 'su categoría'
      return { ok: false, error: `${j.nombre} no puede jugar esta categoría: ${origen} es ${ETIQUETA_NIVEL[nivel as Nivel] ?? nivel} y la categoría es para ${admitidos}` }
    }
  }

  for (const j of jugadores) {
    const suyas = d.categoriasDe[j.id] ?? []
    if (suyas.includes(d.categoriaId)) return { ok: false, error: `${j.nombre} ya está inscrito en esta categoría` }
    if (suyas.length >= MAX_CATEGORIAS_POR_JUGADOR) {
      return { ok: false, error: `${j.nombre} ya está inscrito en ${MAX_CATEGORIAS_POR_JUGADOR} categorías, el máximo por jugador` }
    }
  }

  // En dobles el cupo es de parejas: cada una ocupa dos inscripciones.
  if (d.ocupados >= cupoInscripciones(categoria)) return { ok: false, error: 'La categoría ya no tiene cupo' }

  return { ok: true, provisionales: jugadores.filter((j) => !j.categoria_torneo).map((j) => j.id) }
}

// Traduce los errores del trigger torneo_inscripciones_validar (la red de
// seguridad de la base, p. ej. dos inscripciones simultáneas por el último
// cupo) a un mensaje para el jugador. null si no es uno de ellos.
export function mensajeErrorBaseInscripcion(mensaje: string): string | null {
  const conocidos = [
    ERROR_CATEGORIA_CERRADA,
    'La categoría ya no tiene cupo',
    'El jugador ya está inscrito en esta categoría',
    'Un jugador puede inscribirse en máximo 2 categorías del torneo',
    'Cada jugador se inscribe por separado: la pareja se forma aparte',
    'La categoría ya tiene todas sus parejas',
    'Uno de los jugadores ya está en una dupla de esta categoría',
    'El Mixto es para una pareja de un caballero y una dama',
    'La edad del menor no corresponde a la categoría',
    'El género del menor no corresponde a la categoría',
    'El torneo es solo para socios: falta la autorización del admin como invitado / wild card',
    'El menor ya está inscrito en esta categoría',
    'Un menor puede inscribirse en máximo 2 categorías del torneo',
    'Un menor solo puede inscribirse en una categoría infantil',
    'Las categorías infantiles son para menores',
  ]
  return conocidos.find((c) => mensaje.includes(c)) ?? null
}

// ---------------------------------------------------------------------------
// Estado de la inscripción: confirmada cuando cada jugador tiene su pago
// validado y una categoría oficial compatible.
// ---------------------------------------------------------------------------

export type Pendiente =
  | { tipo: 'pago'; jugadorId: string }
  | { tipo: 'pago_por_validar'; jugadorId: string }
  | { tipo: 'categoria'; jugadorId: string }              // sin categoría oficial
  | { tipo: 'categoria_incompatible'; jugadorId: string } // la oficial no admite esta categoría
  // Infantil (lib/torneoInfantil.ts): jugadorId = id del menor.
  | { tipo: 'categoria_por_certificar'; jugadorId: string }
  // Torneo solo para socios: un invitado (o menor sin N.º de acción) necesita
  // la autorización del admin como invitado / wild card.
  | { tipo: 'invitado_por_autorizar'; jugadorId: string }

export type DatosEstadoInscripcion = {
  estado: EstadoInscripcion
  nivelCategoria: Nivel | null
  jugadores: { id: string; categoria_torneo: string | null; es_invitado: boolean }[]
  pagos: { jugador_id: string; validado: boolean }[]
  soloSocios: boolean
  invitadoAutorizado: boolean   // torneo_inscripciones.invitado_autorizado_at
}

export function pendientesInscripcion(d: DatosEstadoInscripcion): Pendiente[] {
  const pendientes: Pendiente[] = []
  for (const j of d.jugadores) {
    const suyos = d.pagos.filter((p) => p.jugador_id === j.id)
    if (!suyos.some((p) => p.validado)) {
      pendientes.push({ tipo: suyos.length ? 'pago_por_validar' : 'pago', jugadorId: j.id })
    }
    if (!j.categoria_torneo) pendientes.push({ tipo: 'categoria', jugadorId: j.id })
    else if (!nivelAdmitido(d.nivelCategoria, j.categoria_torneo)) pendientes.push({ tipo: 'categoria_incompatible', jugadorId: j.id })
    if (d.soloSocios && j.es_invitado && !d.invitadoAutorizado) pendientes.push({ tipo: 'invitado_por_autorizar', jugadorId: j.id })
  }
  return pendientes
}

// La retirada no se toca; el resto queda confirmada o pendiente según falte algo.
export function estadoInscripcionCalculado(d: DatosEstadoInscripcion): EstadoInscripcion {
  if (d.estado === 'retirada') return 'retirada'
  return pendientesInscripcion(d).length === 0 ? 'confirmada' : 'pendiente_pago'
}

// `nombre` null = el propio jugador que lo lee ("tu pago").
export function textoPendiente(p: Pendiente, nombre: string | null): string {
  if (nombre === null) {
    switch (p.tipo) {
      case 'pago': return 'Falta tu pago'
      case 'pago_por_validar': return 'Tu pago está por validar'
      case 'categoria': return 'Falta que el admin confirme tu categoría'
      case 'categoria_incompatible': return 'Tu categoría oficial no corresponde a esta categoría'
      case 'categoria_por_certificar': return 'Falta que el admin certifique la categoría'
      case 'invitado_por_autorizar': return 'Eres invitado: falta que el admin te autorice (invitado / wild card)'
    }
  }
  switch (p.tipo) {
    case 'pago': return `Falta el pago de ${nombre}`
    case 'pago_por_validar': return `Pago de ${nombre} por validar`
    case 'categoria': return `Falta confirmar la categoría de ${nombre}`
    case 'categoria_incompatible': return `La categoría oficial de ${nombre} no corresponde a esta categoría`
    case 'categoria_por_certificar': return `Falta certificar la categoría de ${nombre}`
    case 'invitado_por_autorizar': return `${nombre} no es socio: falta autorizarlo como invitado / wild card`
  }
}

// ---------------------------------------------------------------------------
// Monto en Bs.
// ---------------------------------------------------------------------------

// Monto por jugador en Bs.: euros × tasa BCV del euro (truncada a 2
// decimales, como la publica el BCV y como se cobra en Delegación),
// redondeado al céntimo.
export function montoInscripcionBs(montoEur: number, tasaEur: number): number {
  return Math.round(Number(montoEur) * tasaDosDecimales(tasaEur) * 100) / 100
}

// ---------------------------------------------------------------------------
// Limitaciones de horario: cuadrícula día × franja
// ---------------------------------------------------------------------------

// Días de juego del torneo (lun–vie) y dos franjas que agrupan los turnos de
// la plantilla del SPEC §4: 1ª = 18:30/19:00, 2ª = 20:00/20:30.
export const DIAS_TORNEO = [
  { id: 'lun', etiqueta: 'Lun' },
  { id: 'mar', etiqueta: 'Mar' },
  { id: 'mie', etiqueta: 'Mié' },
  { id: 'jue', etiqueta: 'Jue' },
  { id: 'vie', etiqueta: 'Vie' },
] as const

export const FRANJAS_TORNEO = [
  { id: '1', etiqueta: '1er turno', horas: '6:30–7:00 pm' },
  { id: '2', etiqueta: '2do turno', horas: '8:00–8:30 pm' },
] as const

export const celdaDisponibilidad = (dia: string, franja: string) => `${dia}_${franja}`

export const CELDAS_DISPONIBILIDAD: string[] = DIAS_TORNEO.flatMap((d) => FRANJAS_TORNEO.map((f) => celdaDisponibilidad(d.id, f.id)))

export const MAX_NOTA_DISPONIBILIDAD = 500

// Valida lo que manda el jugador y lo devuelve normalizado (celdas sin
// repetir, en el orden de la cuadrícula; nota recortada o null).
export function normalizarDisponibilidad(noDisponible: unknown, nota: unknown):
  { error: string } | { no_disponible: string[]; nota: string | null } {
  if (!Array.isArray(noDisponible)) return { error: 'Las limitaciones de horario no son válidas' }
  const invalida = noDisponible.find((c) => typeof c !== 'string' || !CELDAS_DISPONIBILIDAD.includes(c))
  if (invalida !== undefined) return { error: `Franja no válida: ${String(invalida)}` }
  if (nota != null && typeof nota !== 'string') return { error: 'La nota no es válida' }
  const texto = (nota ?? '').trim()
  if (texto.length > MAX_NOTA_DISPONIBILIDAD) return { error: `La nota puede tener máximo ${MAX_NOTA_DISPONIBILIDAD} caracteres` }
  return {
    no_disponible: CELDAS_DISPONIBILIDAD.filter((c) => noDisponible.includes(c)),
    nota: texto || null,
  }
}
