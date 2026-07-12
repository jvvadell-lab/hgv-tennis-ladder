import { cookies } from 'next/headers'

export type Session = {
  role: 'admin' | 'jugador'
  id: string
  nombre: string
  categoria?: string
  genero?: string
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
