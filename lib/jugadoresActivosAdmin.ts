// Cliente del endpoint /api/admin/jugadores-activos (solo para pantallas del
// admin). Devuelve [] / null si falla, igual que antes hacían las consultas
// directas, para no romper las pantallas que lo usan.

export type JugadorActivoAdmin = { id: string; nombre: string; categoria: string | null; genero: string | null }

export async function cargarJugadoresActivosAdmin(): Promise<JugadorActivoAdmin[]> {
  try {
    const res = await fetch('/api/admin/jugadores-activos', { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return data.jugadores || []
  } catch {
    return []
  }
}

export async function contarJugadoresActivosAdmin(): Promise<number | null> {
  try {
    const res = await fetch('/api/admin/jugadores-activos?conteo=1', { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.total === 'number' ? data.total : null
  } catch {
    return null
  }
}
