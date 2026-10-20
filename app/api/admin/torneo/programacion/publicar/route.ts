import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'
import { torneoVigente } from '@/lib/torneoServidor'
import { avisarProgramacion, datosProgramacion } from '@/lib/torneoProgramacionServidor'

// Publica la programación (SPEC §4): registra quién y cuándo, y avisa a
// cada jugador o representante (campana + correo) con sus partidos. Se
// publica una vez; después, cada cambio de horario avisa a los afectados
// desde .../guardar.
export async function POST() {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['sorteado', 'en_curso'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'La programación se publica después del sorteo' }, { status: 400 })
    }
    if (torneo.programacion_publicada_at) return NextResponse.json({ error: 'La programación ya estaba publicada' }, { status: 400 })

    const { horarios, partidos } = await datosProgramacion(db, torneo)
    if (!horarios.size) return NextResponse.json({ error: 'Todavía no hay partidos con horario' }, { status: 400 })

    const { data, error } = await db
      .from('torneos')
      .update({ programacion_publicada_at: ahora().toISOString(), programacion_publicada_por: session!.id })
      .eq('id', torneo.id)
      .is('programacion_publicada_at', null)
      .select('id')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'La programación ya estaba publicada' }, { status: 400 })

    try {
      await avisarProgramacion(db, torneo.nombre, partidos.filter((p) => p.avisar.length && !p.cerrado), horarios, { cambio: false })
    } catch (err: any) {
      console.error('[torneo] No se pudo avisar la programación:', err.message)
    }
    return NextResponse.json({ ok: true, sinHorario: partidos.filter((p) => !horarios.has(p.id)).length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al publicar la programación' }, { status: 500 })
  }
}
