// Choques de un reto nuevo con lo que ya ocupa esa cancha del club (otros retos
// y reservas casuales) — validación SERVER-SIDE de crear-reto. El cliente
// (ladder/page.tsx) hace lo mismo solo como UX; esto es lo que de verdad frena.
//
// detectarChoque es pura (sin Supabase) para poder probarla con fechas
// simuladas; buscarChoqueCancha hace las consultas y la llama.

import type { supabaseServer } from '@/lib/supabaseServer'
import { DURACION_RETO_MIN, DURACION_SINGLE_MIN, ESTADOS_RESERVA_OCUPAN_CANCHA, seSolapan } from '@/lib/reservas'
import { fechaISOEnCaracas, formatearHora, formatearFechaHora } from '@/lib/tiempo'

// Retos que ocupan cancha. 'jugado' NO: un reto solo pasa a 'jugado' cuando el
// admin aprueba el resultado, así que si su fecha todavía no llegó es porque se
// jugó antes (resultado anticipado autorizado) — la cancha en esa franja está libre.
export const ESTADOS_RETO_OCUPAN_CANCHA = ['pendiente', 'aceptado']

// La reserva casual más larga posible (doble, o single + media hora extra).
const DURACION_MAX_RESERVA_MIN = 90

export type RetoOcupando = { fecha_propuesta: string }
export type ReservaOcupando = { fecha_hora: string; duracion_min: number | null }
export type Choque = { tipo: 'reto' | 'reserva'; inicio: Date; fin: Date }

// ¿Un reto que empieza en `inicioMs` (dura DURACION_RETO_MIN) choca con alguno
// de estos retos o reservas de la MISMA cancha? Misma ventana que el cliente:
// retos a menos de 90 min de distancia, reservas que se solapen con los 90 min.
export function detectarChoque(inicioMs: number, retos: RetoOcupando[], reservas: ReservaOcupando[]): Choque | null {
  for (const r of retos) {
    const otroMs = new Date(r.fecha_propuesta).getTime()
    if (seSolapan(inicioMs, DURACION_RETO_MIN, otroMs, DURACION_RETO_MIN)) {
      return { tipo: 'reto', inicio: new Date(otroMs), fin: new Date(otroMs + DURACION_RETO_MIN * 60000) }
    }
  }
  for (const r of reservas) {
    const otroMs = new Date(r.fecha_hora).getTime()
    const duracion = r.duracion_min || DURACION_SINGLE_MIN
    if (seSolapan(inicioMs, DURACION_RETO_MIN, otroMs, duracion)) {
      return { tipo: 'reserva', inicio: new Date(otroMs), fin: new Date(otroMs + duracion * 60000) }
    }
  }
  return null
}

// Consulta lo que ocupa `cancha` alrededor de `inicio` y devuelve el primer
// choque, o null. Solo canchas del club (HGV1/HGV2) — la foránea no se valida.
// Consulta por ventana de ±90 min alrededor del inicio (no por "día"), así
// también ve un partido de fin de semana que empezó antes de medianoche.
export async function buscarChoqueCancha(
  db: ReturnType<typeof supabaseServer>,
  cancha: string,
  inicio: Date,
): Promise<Choque | null> {
  const inicioMs = inicio.getTime()
  const desdeRetos = new Date(inicioMs - DURACION_RETO_MIN * 60000).toISOString()
  const desdeReservas = new Date(inicioMs - DURACION_MAX_RESERVA_MIN * 60000).toISOString()
  const hasta = new Date(inicioMs + DURACION_RETO_MIN * 60000).toISOString()

  const [{ data: retos, error: errRetos }, { data: reservas, error: errReservas }] = await Promise.all([
    db.from('retos')
      .select('fecha_propuesta')
      .eq('cancha', cancha)
      .in('estado', ESTADOS_RETO_OCUPAN_CANCHA)
      .gt('fecha_propuesta', desdeRetos)
      .lt('fecha_propuesta', hasta),
    db.from('reservas_cancha')
      .select('fecha_hora, duracion_min')
      .eq('cancha', cancha)
      .in('estado', ESTADOS_RESERVA_OCUPAN_CANCHA)
      .gt('fecha_hora', desdeReservas)
      .lt('fecha_hora', hasta),
  ])
  if (errRetos) throw errRetos
  if (errReservas) throw errReservas

  return detectarChoque(inicioMs, (retos || []) as RetoOcupando[], (reservas || []) as ReservaOcupando[])
}

// --- Bloqueos del club (tabla bloqueos_cancha) ---
//
// Un bloqueo cierra la cancha para TODO lo nuevo (retos y reservas casuales)
// en su franja [inicio, fin). Lo que ya estaba agendado no se toca: el admin
// lo resuelve a mano. detectarBloqueo es pura para poder usarla también en el
// cliente (selectores de horario de /ladder y /reservas).

export type BloqueoCancha = { id: string; cancha: string; inicio: string; fin: string; motivo: string }

// ¿Algo que empieza en `inicioMs` y dura `duracionMin` se solapa con alguno de
// estos bloqueos? (Se asume que ya vienen filtrados por cancha.)
export function detectarBloqueo(inicioMs: number, duracionMin: number, bloqueos: BloqueoCancha[]): BloqueoCancha | null {
  const finMs = inicioMs + duracionMin * 60000
  for (const b of bloqueos) {
    if (inicioMs < new Date(b.fin).getTime() && new Date(b.inicio).getTime() < finMs) return b
  }
  return null
}

// Franja legible de un bloqueo: "19:00 a 23:00", o con fecha si dura más de un día.
export function franjaBloqueo(b: Pick<BloqueoCancha, 'inicio' | 'fin'>): string {
  // `fin` es exclusivo: un bloqueo "todo el día" termina a las 00:00 del día
  // siguiente, que sigue siendo el mismo día para quien lo lee.
  const finInclusivo = new Date(new Date(b.fin).getTime() - 1)
  const mismoDia = fechaISOEnCaracas(b.inicio) === fechaISOEnCaracas(finInclusivo)
  if (mismoDia && new Date(b.fin).getTime() - new Date(b.inicio).getTime() === 24 * 60 * 60000) return 'todo el día'
  return mismoDia
    ? `${formatearHora(b.inicio)} a ${formatearHora(b.fin)}`
    : `${formatearFechaHora(b.inicio)} a ${formatearFechaHora(b.fin)}`
}

export function mensajeBloqueo(b: BloqueoCancha): string {
  const franja = franjaBloqueo(b)
  return `Esa cancha está reservada por el club (${b.motivo}) ${franja === 'todo el día' ? franja : `de ${franja}`}. Elige otro horario.`
}

// Validación SERVER-SIDE: primer bloqueo de `cancha` que se solapa con
// [inicio, inicio + duracionMin), o null. FORANEA nunca se bloquea.
export async function buscarBloqueoCancha(
  db: ReturnType<typeof supabaseServer>,
  cancha: string,
  inicio: Date,
  duracionMin: number,
): Promise<BloqueoCancha | null> {
  if (cancha !== 'HGV1' && cancha !== 'HGV2') return null
  const inicioMs = inicio.getTime()
  const { data, error } = await db
    .from('bloqueos_cancha')
    .select('id, cancha, inicio, fin, motivo')
    .eq('cancha', cancha)
    .lt('inicio', new Date(inicioMs + duracionMin * 60000).toISOString())
    .gt('fin', inicio.toISOString())
    .order('inicio', { ascending: true })
    .limit(1)
  if (error) throw error
  return (data?.[0] as BloqueoCancha | undefined) ?? null
}
