import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { listarPartidos } from '@/lib/torneoResultadosServidor'

// Partidos del torneo vigente para la sección Resultados de la pestaña
// Torneo: por validar, por jugar y cerrados.
export async function GET() {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null, partidos: [] })
    return NextResponse.json({ ok: true, torneo: { id: torneo.id, estado: torneo.estado }, partidos: await listarPartidos(db, torneo.id) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar los resultados' }, { status: 500 })
  }
}
