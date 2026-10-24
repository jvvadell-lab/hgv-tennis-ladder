// Dobles con inscripción individual (rediseño del 23-oct-2026, SPEC §2.2).
// Lógica pura, sin Supabase: la usan las rutas de jugador y admin, la UI y
// scripts/simular-torneo.ts. Tests en lib/torneoDobles.test.ts.
//
// Cada jugador se inscribe y paga solo. La dupla (torneo_equipos) se forma
// aparte: con una invitación a un jugador de la app o a un teléfono (wa.me),
// o la arma el admin al cierre con los que quedaron disponibles. Las
// invitaciones vencen a las 48 h o al cierre de inscripciones, lo que llegue
// primero; el vencimiento se calcula al leer o actuar (sin cron).

import { MAX_CATEGORIAS_POR_JUGADOR, type GeneroCategoria, type Nivel, type TorneoCategoria } from './torneo'
import { errorGeneros, nivelAdmitido, nivelParaTorneo } from './torneoInscripcion'

export const HORAS_VIGENCIA_INVITACION = 48

export type EstadoEnDobles = 'disponible' | 'invitacion_enviada' | 'en_dupla'

export const ETIQUETA_ESTADO_DOBLES: Record<EstadoEnDobles, string> = {
  disponible: 'Disponible',
  invitacion_enviada: 'Invitación enviada',
  en_dupla: 'En dupla',
}

// ---------------------------------------------------------------------------
// Vencimiento de las invitaciones
// ---------------------------------------------------------------------------

// 48 h después de enviarla, o el cierre de inscripciones si llega antes.
export function venceInvitacion(enviadaAt: Date, cierreInscripcionesAt: Date | null): Date {
  const a48h = new Date(enviadaAt.getTime() + HORAS_VIGENCIA_INVITACION * 3600 * 1000)
  return cierreInscripcionesAt && cierreInscripcionesAt < a48h ? cierreInscripcionesAt : a48h
}

export type InvitacionParaEstado = {
  id: string
  invita_inscripcion_id: string
  invitado_jugador_id: string | null
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada' | 'vencida'
  vence_at: string
}

// Pendiente de verdad: estado pendiente y todavía no venció.
export const invitacionVigente = (i: Pick<InvitacionParaEstado, 'estado' | 'vence_at'>, ahora: Date) =>
  i.estado === 'pendiente' && new Date(i.vence_at) > ahora

// Pendientes en la base que ya vencieron (el servidor las pasa a 'vencida' y avisa).
export const invitacionesPorVencer = <I extends Pick<InvitacionParaEstado, 'estado' | 'vence_at'>>(lista: I[], ahora: Date): I[] =>
  lista.filter((i) => i.estado === 'pendiente' && new Date(i.vence_at) <= ahora)

// ---------------------------------------------------------------------------
// Estado del jugador en una categoría de dobles
// ---------------------------------------------------------------------------

export type EquipoParaEstado = { id: string; inscripcion1_id: string; inscripcion2_id: string | null; estado: 'activo' | 'disuelto' }

export function estadoEnDobles(
  inscripcionId: string,
  equipos: EquipoParaEstado[],
  invitaciones: Pick<InvitacionParaEstado, 'invita_inscripcion_id' | 'estado' | 'vence_at'>[],
  ahora: Date,
): EstadoEnDobles {
  if (equipos.some((e) => e.estado === 'activo' && (e.inscripcion1_id === inscripcionId || e.inscripcion2_id === inscripcionId))) return 'en_dupla'
  if (invitaciones.some((i) => i.invita_inscripcion_id === inscripcionId && invitacionVigente(i, ahora))) return 'invitacion_enviada'
  return 'disponible'
}

// ---------------------------------------------------------------------------
// Teléfono y WhatsApp
// ---------------------------------------------------------------------------

// Teléfono venezolano a 58 + 10 dígitos (como lo guarda torneo_invitaciones):
// "0414-123.45.67", "+58 414 1234567", "4141234567" → "584141234567". null si
// no es un número de Venezuela válido (código de operadora o área 2xx/4xx).
export function normalizarTelefonoVe(texto: string | null | undefined): string | null {
  let d = (texto ?? '').replace(/\D/g, '')
  if (d.startsWith('0058')) d = d.slice(4)
  else if (d.startsWith('58') && d.length === 12) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (!/^[24]\d{9}$/.test(d)) return null
  return `58${d}`
}

// "+58 414-1234567" para mostrar.
export const telefonoLegible = (t58: string) => `+58 ${t58.slice(2, 5)}-${t58.slice(5)}`

export function mensajeInvitacionWhatsApp(d: {
  invitadoNombre: string
  invitaNombre: string
  categoriaNombre: string
  torneoNombre: string
  urlRegistro: string
  urlTorneo: string
}): string {
  return [
    `Hola ${d.invitadoNombre}, soy ${d.invitaNombre}. Te invito a ser mi pareja en ${d.categoriaNombre} del ${d.torneoNombre} 🎾🎄`,
    `Regístrate en la app del club con este mismo número de teléfono: ${d.urlRegistro}`,
    `Cuando tu registro esté activo, entra al torneo y acepta la invitación: ${d.urlTorneo}`,
  ].join('\n\n')
}

export const enlaceWhatsApp = (telefono58: string, mensaje: string) => `https://wa.me/${telefono58}?text=${encodeURIComponent(mensaje)}`

// ---------------------------------------------------------------------------
// Elegibilidad y lista de parejas
// ---------------------------------------------------------------------------

export type JugadorDobles = {
  id: string
  nombre: string
  genero: string
  categoria: string
  categoria_torneo: string | null
}

type CategoriaDobles = Pick<TorneoCategoria, 'id' | 'genero' | 'categoria_nivel'>

// Género que puede tener la pareja de `yo` en la categoría (null = cualquiera).
function generoPareja(genero: GeneroCategoria, yo: Pick<JugadorDobles, 'genero'>): string | null {
  if (genero === 'mixto') return yo.genero === 'damas' ? 'caballeros' : 'damas'
  if (genero === 'abierto') return null
  return genero
}

// null si `a` y `b` pueden ser dupla en la categoría; si no, el error.
export function errorDupla(categoria: CategoriaDobles, a: JugadorDobles, b: JugadorDobles): string | null {
  if (a.id === b.id) return 'Tu pareja tiene que ser otro jugador'
  const errGenero = errorGeneros(categoria.genero, [a.genero, b.genero])
  if (errGenero) return errGenero
  for (const j of [a, b]) {
    if (!nivelAdmitido(categoria.categoria_nivel as Nivel | null, nivelParaTorneo(j))) return `${j.nombre} no puede jugar esta categoría por su nivel`
  }
  return null
}

export type CandidatoPareja = {
  id: string
  nombre: string
  // disponible = inscrito en la categoría y sin dupla; invitacion_enviada =
  // inscrito y esperando respuesta de otro; no_inscrito = aún no se inscribió.
  estado: 'disponible' | 'invitacion_enviada' | 'no_inscrito'
  esperandoA: string | null   // solo en invitacion_enviada
  seleccionable: boolean
}

// Lista para elegir pareja (regla 4): jugadores elegibles por género y
// nivel que no están en dupla en la categoría y que, si no están inscritos
// en ella, tienen menos de 2 categorías. Los disponibles van arriba; los que
// esperan respuesta de otro se muestran en gris, sin poder elegirlos.
export function candidatosPareja(d: {
  yo: JugadorDobles
  categoria: CategoriaDobles
  jugadores: JugadorDobles[]
  // Estado en esta categoría de cada jugador inscrito en ella.
  estadoEnCategoria: Map<string, EstadoEnDobles>
  // A quién esperan los que tienen una invitación enviada (nombre).
  esperandoA: Map<string, string>
  // Categorías (ids) en que está inscrito cada jugador en el torneo.
  categoriasDe: Map<string, string[]>
}): CandidatoPareja[] {
  const genero = generoPareja(d.categoria.genero, d.yo)
  const lista: CandidatoPareja[] = []
  for (const j of d.jugadores) {
    if (j.id === d.yo.id) continue
    if (genero && j.genero !== genero) continue
    if (!nivelAdmitido(d.categoria.categoria_nivel as Nivel | null, nivelParaTorneo(j))) continue
    const estado = d.estadoEnCategoria.get(j.id)
    if (estado === 'en_dupla') continue
    if (!estado && (d.categoriasDe.get(j.id) ?? []).length >= MAX_CATEGORIAS_POR_JUGADOR) continue
    lista.push({
      id: j.id,
      nombre: j.nombre,
      estado: estado ?? 'no_inscrito',
      esperandoA: estado === 'invitacion_enviada' ? d.esperandoA.get(j.id) ?? null : null,
      seleccionable: estado !== 'invitacion_enviada',
    })
  }
  const peso = { disponible: 0, no_inscrito: 1, invitacion_enviada: 2 }
  return lista.sort((a, b) => peso[a.estado] - peso[b.estado] || a.nombre.localeCompare(b.nombre, 'es'))
}

// ---------------------------------------------------------------------------
// Contadores por categoría (resumen del admin)
// ---------------------------------------------------------------------------

export type Alerta = 'roja' | 'naranja' | 'verde' | null

export type ResumenCategoria = {
  categoriaId: string
  modalidad: 'single' | 'doble'
  cupo: number              // parejas en dobles, inscritos en single/infantil
  confirmados: number       // duplas (o inscripciones) con todo confirmado
  formados: number          // duplas activas (o inscripciones vivas en single)
  faltan: number            // cupo - formados
  listosSorteo: number      // entran al sorteo (equipos activos sin bloqueos)
  inscritos: number         // inscripciones vivas
  sinPareja: number         // dobles: inscritos sin dupla
  invitacionesPendientes: number
  proximaEnVencer: string | null
  pagosPorValidar: number
  alerta: Alerta
}

export function alertaCategoria(r: Pick<ResumenCategoria, 'modalidad' | 'formados' | 'cupo' | 'sinPareja'>): Alerta {
  if (r.formados < 3) return 'roja'
  if (r.modalidad === 'doble' && r.sinPareja % 2 === 1) return 'naranja'
  if (r.formados >= r.cupo) return 'verde'
  return null
}

export function resumenCategoria(d: {
  categoria: Pick<TorneoCategoria, 'id' | 'modalidad' | 'cupo'>
  inscripciones: { id: string; estado: string }[]           // vivas
  equipos: { inscripcionIds: string[]; bloqueado: boolean }[] // activos
  invitaciones: Pick<InvitacionParaEstado, 'estado' | 'vence_at'>[]
  pagos: { torneo_inscripcion_id: string; validado: boolean }[]
  ahora: Date
}): ResumenCategoria {
  const estado = new Map(d.inscripciones.map((i) => [i.id, i.estado]))
  const enEquipo = new Set(d.equipos.flatMap((e) => e.inscripcionIds))
  const vigentes = d.invitaciones.filter((i) => invitacionVigente(i, d.ahora)).map((i) => i.vence_at).sort()
  const vivas = new Set(d.inscripciones.map((i) => i.id))
  const r = {
    categoriaId: d.categoria.id,
    modalidad: d.categoria.modalidad,
    cupo: d.categoria.cupo,
    confirmados: d.equipos.filter((e) => e.inscripcionIds.every((id) => estado.get(id) === 'confirmada')).length,
    formados: d.equipos.length,
    faltan: Math.max(0, d.categoria.cupo - d.equipos.length),
    listosSorteo: d.equipos.filter((e) => !e.bloqueado).length,
    inscritos: d.inscripciones.length,
    sinPareja: d.categoria.modalidad === 'doble' ? d.inscripciones.filter((i) => !enEquipo.has(i.id)).length : 0,
    invitacionesPendientes: vigentes.length,
    proximaEnVencer: vigentes[0] ?? null,
    pagosPorValidar: d.pagos.filter((p) => !p.validado && vivas.has(p.torneo_inscripcion_id)).length,
  }
  return { ...r, alerta: alertaCategoria(r) }
}
