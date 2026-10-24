import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { proponerProgramacion } from '@/lib/torneoProgramacion'
import { datosProgramacion } from '@/lib/torneoProgramacionServidor'

// Asistente de programación (SPEC §4): propone fecha, hora y cancha para
// los partidos que todavía no tienen horario, sin mover los que ya lo
// tienen. NO guarda nada: el admin revisa y confirma con .../guardar.
export async function POST() {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['sorteado', 'en_curso'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'La programación se arma después de publicar el sorteo' }, { status: 400 })
    }

    const { ctx, horarios } = await datosProgramacion(db, torneo)
    const propuesta = proponerProgramacion(ctx, horarios)
    const nuevas = [...propuesta.horarios.entries()]
      .filter(([id]) => !horarios.has(id))
      .map(([partidoId, h]) => ({ partidoId, cancha: h.cancha, inicio: new Date(h.inicio).toISOString() }))

    return NextResponse.json({ ok: true, asignaciones: nuevas, sinHorario: propuesta.sinHorario })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al proponer la programación' }, { status: 500 })
  }
}
