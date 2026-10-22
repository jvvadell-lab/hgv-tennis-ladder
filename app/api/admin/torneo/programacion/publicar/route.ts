import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { publicarProgramacion } from '@/lib/torneoProgramacionServidor'

// Publica la programación (SPEC §4): ver publicarProgramacion.
export async function POST() {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })

    const r = await publicarProgramacion(db, torneo, session!.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, sinHorario: r.sinHorario })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al publicar la programación' }, { status: 500 })
  }
}
