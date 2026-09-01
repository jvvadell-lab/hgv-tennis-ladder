import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'

// La sesión (hgv_session) viaja sellada y cifrada con iron-session — antes
// era JSON.stringify sin firmar, así que cualquiera podía escribir esa
// cookie a mano en su navegador y volverse cualquier jugador o admin sin
// PIN real. Con esto, una cookie que no venga sellada con SESSION_SECRET
// (vieja, o forjada) simplemente no abre — iron-session la trata como
// sesión vacía en vez de tirar error, así que no hace falta manejar el
// caso de cookies viejas colgando en navegadores de antes de este cambio.
export type SessionData = {
  role: 'admin' | 'jugador'
  id: string
  nombre: string
  categoria?: string
  genero?: string
  nivel?: 'completo' | 'pagos'
}

export type Session = SessionData | null

const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 días, igual que antes

function sessionOptions() {
  const password = process.env.SESSION_SECRET
  if (!password) {
    throw new Error('Falta la variable de entorno SESSION_SECRET')
  }
  return {
    password,
    cookieName: 'hgv_session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: SESSION_MAX_AGE,
      path: '/',
    },
  }
}

async function getIronSessionInstance() {
  return getIronSession<Partial<SessionData>>(await cookies(), sessionOptions())
}

export async function getSession(): Promise<Session> {
  const session = await getIronSessionInstance()
  if (!session.role || !session.id || !session.nombre) return null
  return {
    role: session.role,
    id: session.id,
    nombre: session.nombre,
    categoria: session.categoria,
    genero: session.genero,
    nivel: session.nivel,
  }
}

// Reemplaza el store.set('hgv_session', JSON.stringify(...)) manual que
// antes se repetía (con las mismas opciones de cookie) en cada rama de
// app/api/login/route.ts.
export async function crearSession(data: SessionData): Promise<void> {
  const session = await getIronSessionInstance()
  Object.assign(session, data)
  await session.save()
}

// session.destroy() es síncrono en iron-session — borra la cookie antes de
// que salgan los headers, no hace falta (ni se puede) esperar nada después.
export async function destruirSession(): Promise<void> {
  const session = await getIronSessionInstance()
  session.destroy()
}

// Los administradores de nivel "pagos" solo pueden usar las rutas de Pagos
// y edición de perfil de jugadores — cualquier otra acción de admin requiere
// nivel "completo" (o ausencia del campo, para no romper cuentas viejas).
export function esAdminCompleto(session: Session): boolean {
  return !!session && session.role === 'admin' && (!session.nivel || session.nivel === 'completo')
}
