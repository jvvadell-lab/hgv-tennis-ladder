// Sección Infantil del torneo (Torneo Navidad HGV 2026 — SPEC §14). Lógica
// pura, sin llamadas a Supabase: la usan las rutas
// app/api/jugador/torneo/infantil/..., app/api/admin/torneo/infantil/... y
// la UI. Tests en lib/torneoInfantil.test.ts.
//
// La edad se calcula a la fecha de corte del torneo (torneos.fecha_corte_edad,
// o el 31-dic del año de fecha_inicio) con edadEnFecha de lib/tiempo.ts. La
// base repite las reglas en el trigger torneo_inscripciones_validar.

import { diaDeLaSemanaEnCaracas, edadEnFecha, instanteEnCaracas, minutosDesdeMedianocheEnCaracas, fechaISOEnCaracas } from './tiempo'
import { MAX_CATEGORIAS_POR_JUGADOR, CANCHAS_TORNEO, type CanchaTorneo, type EstadoInscripcion, type EstadoTorneo, type Torneo, type TorneoCategoria } from './torneo'
import type { Pendiente } from './torneoInscripcion'

export const ETIQUETA_GENERO_MENOR: Record<string, string> = {
  caballeros: 'Niño',
  damas: 'Niña',
}

export const ETIQUETA_GENERO_CATEGORIA_INFANTIL: Record<string, string> = {
  abierto: 'Niños y niñas',
  caballeros: 'Solo niños',
  damas: 'Solo niñas',
}

export const PARENTESCOS = ['madre', 'padre', 'abuelo', 'tio', 'representante_legal', 'otro'] as const
export type Parentesco = (typeof PARENTESCOS)[number]

export const ETIQUETA_PARENTESCO: Record<Parentesco, string> = {
  madre: 'Madre',
  padre: 'Padre',
  abuelo: 'Abuelo/a',
  tio: 'Tío/a',
  representante_legal: 'Representante legal',
  otro: 'Otro',
}

// Rango de edades que admite la app para una ficha (sanidad del dato, no
// regla del torneo: la regla la pone cada categoría).
export const EDAD_MIN_FICHA = 3
export const EDAD_MAX_FICHA = 17

// ---------------------------------------------------------------------------
// Edad y categoría
// ---------------------------------------------------------------------------

export function fechaCorteEdad(torneo: Pick<Torneo, 'fecha_corte_edad' | 'fecha_inicio'>): string {
  return torneo.fecha_corte_edad ?? `${torneo.fecha_inicio.slice(0, 4)}-12-31`
}

export function edadAlCorte(fechaNacimiento: string, torneo: Pick<Torneo, 'fecha_corte_edad' | 'fecha_inicio'>): number {
  return edadEnFecha(fechaNacimiento, fechaCorteEdad(torneo))
}

export type CategoriaInfantil = Pick<TorneoCategoria, 'id' | 'nombre' | 'genero' | 'edad_min' | 'edad_max'>

export function generoAdmitido(generoCategoria: string, generoMenor: string): boolean {
  return generoCategoria === 'abierto' || generoCategoria === generoMenor
}

export function edadAdmitida(c: Pick<CategoriaInfantil, 'edad_min' | 'edad_max'>, edad: number): boolean {
  return c.edad_min !== null && c.edad_max !== null && edad >= c.edad_min && edad <= c.edad_max
}

// Categorías infantiles que le corresponden por edad y género, en el orden recibido.
export function categoriasParaMenor<C extends CategoriaInfantil>(edad: number, genero: string, categorias: C[]): C[] {
  return categorias.filter((c) => edadAdmitida(c, edad) && generoAdmitido(c.genero, genero))
}

// Categoría sugerida: entre las que le corresponden, la del rango cuyo
// centro está más cerca de su edad (Naranja 8–10 y Verde 9–11: 9 → Naranja,
// 10 → Verde). Empate → la de menor edad mínima. El admin la certifica.
export function categoriaSugerida<C extends CategoriaInfantil>(edad: number, genero: string, categorias: C[]): C | null {
  const posibles = categoriasParaMenor(edad, genero, categorias)
  if (!posibles.length) return null
  const distancia = (c: C) => Math.abs((c.edad_min! + c.edad_max!) / 2 - edad)
  return [...posibles].sort((a, b) => distancia(a) - distancia(b) || a.edad_min! - b.edad_min!)[0]
}

// Lo único público del menor: "Nombre I." (igual que torneo_nombre_publico_menor en la base).
export function nombrePublicoMenor(nombre: string, apellido: string): string {
  return `${nombre.trim()} ${apellido.trim().charAt(0).toUpperCase()}.`
}

// ---------------------------------------------------------------------------
// Ficha del menor
// ---------------------------------------------------------------------------

export type FichaMenor = {
  nombre: string
  apellido: string
  fecha_nacimiento: string
  genero: 'caballeros' | 'damas'
  numero_accion: string | null
  parentesco: Parentesco
  emergencia_nombre: string
  emergencia_telefono: string
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// Valida y normaliza lo que manda el formulario. `hoy` = hoyEnCaracas().
export function normalizarFichaMenor(entrada: any, hoy: string): { error: string } | { ficha: FichaMenor } {
  const nombre = texto(entrada?.nombre)
  const apellido = texto(entrada?.apellido)
  if (!nombre || !apellido) return { error: 'Escribe el nombre y el apellido del niño o niña' }
  if (nombre.length > 60 || apellido.length > 60) return { error: 'El nombre y el apellido pueden tener máximo 60 caracteres' }

  const fecha = texto(entrada?.fecha_nacimiento)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) {
    return { error: 'La fecha de nacimiento no es válida' }
  }
  if (fecha >= hoy) return { error: 'La fecha de nacimiento tiene que ser anterior a hoy' }
  const edad = edadEnFecha(fecha, hoy)
  if (edad < EDAD_MIN_FICHA || edad > EDAD_MAX_FICHA) {
    return { error: `La ficha es para menores de ${EDAD_MIN_FICHA} a ${EDAD_MAX_FICHA} años: revisa la fecha de nacimiento` }
  }

  const genero = entrada?.genero
  if (genero !== 'caballeros' && genero !== 'damas') return { error: 'Indica si es niño o niña' }

  const parentesco = entrada?.parentesco
  if (!(PARENTESCOS as readonly string[]).includes(parentesco)) return { error: 'Indica el parentesco con el niño o niña' }

  const emergencia_nombre = texto(entrada?.emergencia_nombre)
  const emergencia_telefono = texto(entrada?.emergencia_telefono)
  if (!emergencia_nombre || !emergencia_telefono) return { error: 'El contacto de emergencia (nombre y teléfono) es obligatorio' }

  return {
    ficha: {
      nombre, apellido, fecha_nacimiento: fecha, genero, parentesco,
      numero_accion: texto(entrada?.numero_accion) || null,
      emergencia_nombre, emergencia_telefono,
    },
  }
}

// ---------------------------------------------------------------------------
// Validación de una inscripción infantil
// ---------------------------------------------------------------------------

export type DatosInscripcionMenor = {
  estadoTorneo: EstadoTorneo
  soloSocios: boolean            // un no socio se inscribe igual; queda pendiente de autorización
  fechaCorte: string
  categoria: CategoriaInfantil & Pick<TorneoCategoria, 'cupo' | 'es_infantil'>
  menor: { nombre: string; genero: string; fecha_nacimiento: string; numero_accion: string | null }
  autorizacionParticipacion: boolean
  ocupados: number
  // Categorías (ids) en las que el menor ya está inscrito en este torneo.
  categoriasDelMenor: string[]
  // El admin puede inscribir con el torneo cerrado (borrador), no después del sorteo.
  porAdmin?: boolean
}

export function validarInscripcionMenor(d: DatosInscripcionMenor): { ok: false; error: string } | { ok: true } {
  const { categoria, menor } = d
  const abiertas = d.porAdmin ? ['borrador', 'inscripcion'] : ['inscripcion']
  if (!abiertas.includes(d.estadoTorneo)) return { ok: false, error: 'Las inscripciones del torneo no están abiertas' }
  if (!categoria.es_infantil) return { ok: false, error: 'Esa no es una categoría infantil' }
  if (!d.autorizacionParticipacion) return { ok: false, error: 'La autorización de participación del representante es obligatoria' }

  const edad = edadEnFecha(menor.fecha_nacimiento, d.fechaCorte)
  if (!edadAdmitida(categoria, edad)) {
    return { ok: false, error: `${menor.nombre} tendrá ${edad} años al ${d.fechaCorte.split('-').reverse().join('/')} y ${categoria.nombre} es de ${categoria.edad_min} a ${categoria.edad_max} años` }
  }
  if (!generoAdmitido(categoria.genero, menor.genero)) {
    return { ok: false, error: categoria.genero === 'damas' ? `${categoria.nombre} es solo para niñas` : `${categoria.nombre} es solo para niños` }
  }

  if (d.categoriasDelMenor.includes(categoria.id)) return { ok: false, error: `${menor.nombre} ya está inscrito en ${categoria.nombre}` }
  if (d.categoriasDelMenor.length >= MAX_CATEGORIAS_POR_JUGADOR) {
    return { ok: false, error: `${menor.nombre} ya está inscrito en ${MAX_CATEGORIAS_POR_JUGADOR} categorías, el máximo por niño` }
  }
  if (d.ocupados >= categoria.cupo) return { ok: false, error: 'La categoría ya no tiene cupo' }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Estado de una inscripción infantil: confirmada cuando el pago del
// representante está validado y el admin certificó la categoría.
// ---------------------------------------------------------------------------

export type DatosEstadoInscripcionMenor = {
  estado: EstadoInscripcion
  menorId: string
  representanteJugadorId: string
  certificada: boolean
  pagos: { jugador_id: string; validado: boolean }[]
  // Torneo solo para socios: un menor sin N.º de acción entra como invitado
  // / wild card con la autorización del admin.
  soloSocios: boolean
  menorConAccion: boolean
  invitadoAutorizado: boolean
}

export function pendientesInscripcionMenor(d: DatosEstadoInscripcionMenor): Pendiente[] {
  const pendientes: Pendiente[] = []
  const suyos = d.pagos.filter((p) => p.jugador_id === d.representanteJugadorId)
  if (!suyos.some((p) => p.validado)) {
    pendientes.push({ tipo: suyos.length ? 'pago_por_validar' : 'pago', jugadorId: d.representanteJugadorId })
  }
  if (!d.certificada) pendientes.push({ tipo: 'categoria_por_certificar', jugadorId: d.menorId })
  if (d.soloSocios && !d.menorConAccion && !d.invitadoAutorizado) pendientes.push({ tipo: 'invitado_por_autorizar', jugadorId: d.menorId })
  return pendientes
}

export function estadoInscripcionMenorCalculado(d: DatosEstadoInscripcionMenor): EstadoInscripcion {
  if (d.estado === 'retirada') return 'retirada'
  return pendientesInscripcionMenor(d).length === 0 ? 'confirmada' : 'pendiente_pago'
}

// ---------------------------------------------------------------------------
// Horario escuela: turnos de las categorías infantiles (SPEC §14.5). No
// cambia horaValidaParaCancha: esto aplica solo a turnos infantiles.
// ---------------------------------------------------------------------------

export type PlantillaTurnosInfantil = {
  dias: number[]            // 0 = domingo … 6 = sábado (hora Caracas)
  desde: string             // 'HH:mm'
  hasta: string             // 'HH:mm' — el turno tiene que terminar a esta hora o antes
  canchas: CanchaTorneo[]
}

export const HORARIO_ESCUELA: PlantillaTurnosInfantil = { dias: [1, 2, 3, 4, 5], desde: '15:00', hasta: '18:00', canchas: ['HGV1', 'HGV2'] }

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Lee la plantilla guardada en torneo_categorias.plantilla_turnos. null si
// no es válida (o la categoría no tiene, y usa la plantilla adulta).
export function parsearPlantillaTurnos(valor: unknown): PlantillaTurnosInfantil | null {
  const p = valor as Partial<PlantillaTurnosInfantil> | null
  if (!p || typeof p !== 'object') return null
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!Array.isArray(p.dias) || !p.dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null
  if (typeof p.desde !== 'string' || typeof p.hasta !== 'string' || !hora.test(p.desde) || !hora.test(p.hasta)) return null
  if (aMinutos(p.desde) >= aMinutos(p.hasta)) return null
  if (!Array.isArray(p.canchas) || !p.canchas.length || !p.canchas.every((c) => (CANCHAS_TORNEO as readonly string[]).includes(c))) return null
  return { dias: p.dias, desde: p.desde, hasta: p.hasta, canchas: p.canchas }
}

// ¿Un turno infantil que empieza en `inicio` y dura `duracionMin` cabe en la plantilla?
export function turnoInfantilValido(plantilla: PlantillaTurnosInfantil, cancha: string, inicio: Date, duracionMin: number): boolean {
  if (!(plantilla.canchas as string[]).includes(cancha)) return false
  if (!plantilla.dias.includes(diaDeLaSemanaEnCaracas(inicio))) return false
  const minutos = minutosDesdeMedianocheEnCaracas(inicio)
  return minutos >= aMinutos(plantilla.desde) && minutos + duracionMin <= aMinutos(plantilla.hasta)
}

// Turnos de un día ("YYYY-MM-DD" en Caracas): cada `duracionMin` desde la
// apertura, en cada cancha, mientras el turno termine dentro de la ventana.
// Naranja (40 min, 15:00–18:00): 15:00, 15:40, 16:20, 17:00 en HGV1 y HGV2.
export function turnosInfantilesDelDia(fechaISO: string, plantilla: PlantillaTurnosInfantil, duracionMin: number): { cancha: CanchaTorneo; inicio: Date }[] {
  if (duracionMin <= 0) return []
  const medianoche = instanteEnCaracas(fechaISO)
  if (!plantilla.dias.includes(diaDeLaSemanaEnCaracas(medianoche))) return []
  const turnos: { cancha: CanchaTorneo; inicio: Date }[] = []
  for (let m = aMinutos(plantilla.desde); m + duracionMin <= aMinutos(plantilla.hasta); m += duracionMin) {
    const inicio = new Date(medianoche.getTime() + m * 60000)
    if (fechaISOEnCaracas(inicio) !== fechaISO) break
    for (const cancha of plantilla.canchas) turnos.push({ cancha, inicio })
  }
  return turnos
}
