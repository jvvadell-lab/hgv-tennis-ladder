// Cliente: pide la ubicación (si se puede) y confirma "Ya llegué". Nunca se
// queda colgado: sin soporte, permiso negado, sin GPS o si el navegador no
// responde (pasa en iPhone), se confirma igual "sin ubicación".

import type { Ubicacion } from '@/lib/geoClub'

const TIMEOUT_GPS_MS = 10_000

export function obtenerUbicacion(): Promise<Ubicacion | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    let listo = false
    const terminar = (u: Ubicacion | null) => {
      if (listo) return
      listo = true
      resolve(u)
    }
    // Respaldo por si el callback nunca llega (algunas PWAs en iOS).
    const respaldo = setTimeout(() => terminar(null), TIMEOUT_GPS_MS + 2_000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(respaldo)
        terminar({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
      },
      () => {
        clearTimeout(respaldo)
        terminar(null)
      },
      // maximumAge 0: posición fresca en cada intento — con Fase 2 activa, un
      // reintento por mala precisión no debe reusar la misma lectura imprecisa.
      { enableHighAccuracy: true, timeout: TIMEOUT_GPS_MS, maximumAge: 0 }
    )
  })
}

export async function confirmarLlegada(reservaId: string): Promise<{ ok: true; metodo: string; distanciaM: number | null } | { ok: false; error: string }> {
  const ubicacion = await obtenerUbicacion()
  try {
    const res = await fetch('/api/jugador/confirmar-uso-reserva', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservaId, ubicacion }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || 'No se pudo confirmar' }
    return { ok: true, metodo: data.metodo, distanciaM: data.distanciaM ?? null }
  } catch {
    return { ok: false, error: 'No se pudo confirmar: revisa tu conexión e intenta de nuevo.' }
  }
}
