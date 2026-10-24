import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { inscribirDesdeEspera } from '@/lib/torneoCierreServidor'

// El admin inscribe a un jugador de la lista de espera cuando se libera un
// lugar antes del sorteo de la categoría (con aviso al jugador).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { esperaId } = await request.json().catch(() => ({}))
    if (typeof esperaId !== 'string') return NextResponse.json({ error: 'Falta el jugador de la lista' }, { status: 400 })
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    const r = await inscribirDesdeEspera(db, torneo, esperaId, session!.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al inscribir desde la lista de espera' }, { status: 500 })
  }
}
