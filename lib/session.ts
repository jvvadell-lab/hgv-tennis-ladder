import { cookies } from 'next/headers'

export type Session = {
  role: 'admin' | 'jugador'
  id: string
  nombre: string
  categoria?: string
  genero?: string
  nivel?: 'completo' | 'pagos'
} | null

export async function getSession(): Promise<Session> {
  const store = await cookies()
  const raw = store.get('hgv_session')?.value
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Los administradores de nivel "pagos" solo pueden usar las rutas de Pagos
// y edición de perfil de jugadores — cualquier otra acción de admin requiere
// nivel "completo" (o ausencia del campo, para no romper cuentas viejas).
export function esAdminCompleto(session: Session): boolean {
  return !!session && session.role === 'admin' && (!session.nivel || session.nivel === 'completo')
}
