// "Ya llegué" con geolocalización — constantes y reglas en un solo lugar.
// Sin imports de servidor: lo usan la ruta de confirmación, el aviso y la
// pantalla de reservas.
//
// Fase 1 (GEO_ESTRICTO = false): observación. Siempre confirma, con o sin
// ubicación, cerca o lejos; solo registra distancia, precisión y método.
// Fase 2 (GEO_ESTRICTO = true, activa desde el 01/10/2026 tras la prueba en
// el club: 4 m ±18 m): acepta si (distancia - precisión) <= RADIO_M; si no,
// rechaza con la distancia. Si la precisión es peor que PRECISION_MAX_M no
// decide: pide reintentar. Sin permiso o sin GPS sigue confirmando como
// 'sin_ubicacion' — nunca bloquea por no poder ubicar.

// Un solo punto cubre HGV1 y HGV2.
export const CLUB_COORDS = { lat: 10.21886, lng: -68.006486 }
export const RADIO_M = 200
export const PRECISION_MAX_M = 100
export const GEO_ESTRICTO = true

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
  // Solo en modo estricto: si viene, NO se confirma y se le muestra al jugador.
  rechazo: string | null
  // true = la ubicación era demasiado imprecisa para decidir: puede reintentar.
  reintentar: boolean
}

export function evaluarUbicacion(u: Ubicacion | null, estricto: boolean = GEO_ESTRICTO): EvaluacionUbicacion {
  // Sin permiso / sin GPS / timeout: confirma igual (nunca bloquea por esto).
  if (!u) return { metodo: 'sin_ubicacion', distanciaM: null, precisionM: null, rechazo: null, reintentar: false }
  const distanciaM = Math.round(haversineMetros(u, CLUB_COORDS))
  const precisionM = Math.round(u.accuracy)
  const base = { metodo: 'ubicacion' as const, distanciaM, precisionM }
  if (!estricto) return { ...base, rechazo: null, reintentar: false }

  if (precisionM > PRECISION_MAX_M) {
    return {
      ...base,
      rechazo: `Tu ubicación todavía no es precisa (±${formatearDistancia(precisionM)}). Espera unos segundos, al aire libre si puedes, y vuelve a intentar.`,
      reintentar: true,
    }
  }
  // Tolerancia: se descuenta la precisión del GPS antes de comparar con el radio.
  if (distanciaM - precisionM > RADIO_M) {
    return {
      ...base,
      rechazo: `Estás a ${formatearDistancia(distanciaM)} del club. Debes estar en la cancha para confirmar tu llegada.`,
      reintentar: false,
    }
  }
  return { ...base, rechazo: null, reintentar: false }
}

export function formatearDistancia(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`
}
