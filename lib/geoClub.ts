// "Ya llegué" con geolocalización — constantes y reglas en un solo lugar.
// Sin imports de servidor: lo usan la ruta de confirmación, el aviso y la
// pantalla de reservas.
//
// Fase 1 (GEO_ESTRICTO = false): observación. Siempre confirma, con o sin
// ubicación, cerca o lejos; solo registra distancia, precisión y método.
// Fase 2 (GEO_ESTRICTO = true): rechaza si la ubicación es buena y aun
// descontando la precisión queda fuera del radio. Sin permiso, sin GPS o con
// precisión peor que PRECISION_MAX_M, confirma como 'sin_ubicacion' — nunca
// bloquea por no poder ubicar.

// Un solo punto cubre HGV1 y HGV2.
export const CLUB_COORDS = { lat: 10.21886, lng: -68.006486 }
export const RADIO_M = 200
export const PRECISION_MAX_M = 100
export const GEO_ESTRICTO = false

// Ventana para confirmar: desde MINUTOS_ANTES_CONFIRMAR antes del inicio
// hasta el final de la reserva (inicio + duración).
export const MINUTOS_ANTES_CONFIRMAR = 15

export type Ubicacion = { lat: number; lng: number; accuracy: number }
export type MetodoConfirmacion = 'ubicacion' | 'sin_ubicacion' | 'admin'

// Distancia en metros entre dos puntos (haversine, radio medio de la Tierra).
export function haversineMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function ventanaConfirmacion(fechaHora: string | Date, duracionMin: number): { desde: Date; hasta: Date } {
  const inicio = new Date(fechaHora).getTime()
  return {
    desde: new Date(inicio - MINUTOS_ANTES_CONFIRMAR * 60_000),
    hasta: new Date(inicio + duracionMin * 60_000),
  }
}

export function dentroDeVentana(fechaHora: string | Date, duracionMin: number, ahoraMs: number = Date.now()): boolean {
  const { desde, hasta } = ventanaConfirmacion(fechaHora, duracionMin)
  return ahoraMs >= desde.getTime() && ahoraMs <= hasta.getTime()
}

// Valida lo que manda el cliente; cualquier cosa rara cuenta como "sin ubicación".
export function ubicacionValida(u: unknown): Ubicacion | null {
  const v = u as Partial<Ubicacion> | null
  if (!v) return null
  const lat = Number(v.lat), lng = Number(v.lng), accuracy = Number(v.accuracy)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || accuracy < 0) return null
  return { lat, lng, accuracy }
}

export type EvaluacionUbicacion = {
  metodo: 'ubicacion' | 'sin_ubicacion'
  distanciaM: number | null
  precisionM: number | null
  rechazo: string | null // solo con GEO_ESTRICTO
}

export function evaluarUbicacion(u: Ubicacion | null, estricto: boolean = GEO_ESTRICTO): EvaluacionUbicacion {
  if (!u) return { metodo: 'sin_ubicacion', distanciaM: null, precisionM: null, rechazo: null }
  const distanciaM = Math.round(haversineMetros(u, CLUB_COORDS))
  const precisionM = Math.round(u.accuracy)
  let rechazo: string | null = null
  if (estricto && precisionM <= PRECISION_MAX_M && distanciaM - precisionM > RADIO_M) {
    rechazo = `Tu ubicación aparece a unos ${formatearDistancia(distanciaM)} del club. Para confirmar tienes que estar en la cancha; si ya estás, espera unos segundos a que el GPS se ajuste e intenta de nuevo.`
  }
  // En modo estricto, una ubicación muy imprecisa no sirve para decidir: se
  // trata como "sin ubicación" (confirma igual). En observación se guarda tal
  // cual, para analizar la semana.
  if (estricto && precisionM > PRECISION_MAX_M) {
    return { metodo: 'sin_ubicacion', distanciaM: null, precisionM, rechazo: null }
  }
  return { metodo: 'ubicacion', distanciaM, precisionM, rechazo }
}

export function formatearDistancia(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`
}
