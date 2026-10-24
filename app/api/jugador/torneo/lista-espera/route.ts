import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { anotarEnEspera, salirDeEspera } from '@/lib/torneoCierreServidor'

// Lista de espera de una categoría cerrada o llena (sin pago):
// { categoriaId, accion: 'anotar' | 'salir' }.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }
    const { categoriaId, accion } = await request.json().catch(() => ({}))
    if (typeof categoriaId !== 'string') return NextResponse.json({ error: 'Elige la categoría' }, { status: 400 })
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo abierto' }, { status: 400 })
    const r = accion === 'anotar' ? await anotarEnEspera(db, torneo, categoriaId, session.id)
      : accion === 'salir' ? await salirDeEspera(db, categoriaId, session.id)
      : { ok: false as const, error: 'Acción no válida' }
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error con la lista de espera' }, { status: 500 })
  }
}
