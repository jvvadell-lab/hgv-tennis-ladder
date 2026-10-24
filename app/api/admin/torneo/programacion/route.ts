import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { revisarHorario, turnosAdultos, turnosEnFranja } from '@/lib/torneoProgramacion'
import { datosProgramacion } from '@/lib/torneoProgramacionServidor'

// Programación del torneo (SPEC §4): partidos con su horario actual y los
// conflictos de cada uno con el resto, más los turnos posibles para
// asignar a mano (plantilla de adultos y franjas de la academia).
export async function GET() {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null })
    const { ctx, horarios, partidos } = await datosProgramacion(db, torneo)

    const filas = partidos.map((p) => {
      const h = horarios.get(p.id) ?? null
      let revision = { errores: [] as string[], avisos: [] as string[] }
      if (h && !p.cerrado) {
        const resto = new Map(horarios)
        resto.delete(p.id)
        revision = revisarHorario(ctx, resto, p, h)
      }
      const { personas: _personas, avisar: _avisar, ...publico } = p
      return { ...publico, cancha: h?.cancha ?? null, inicio: h ? new Date(h.inicio).toISOString() : null, ...revision }
    })

    const duraciones = [...new Set(partidos.map((p) => p.duracionMin))]
    const turnos = {
      adultos: turnosAdultos(torneo.fecha_inicio, torneo.fecha_fin, 90).map((t) => ({ cancha: t.cancha, inicio: new Date(t.inicio).toISOString() })),
      infantiles: Object.fromEntries(duraciones.map((d) => [d, ctx.franjas.flatMap((f) => turnosEnFranja(f, d)).sort((a, b) => a.inicio - b.inicio).map((t) => ({ cancha: t.cancha, inicio: new Date(t.inicio).toISOString() }))])),
    }

    const { data: publicador } = torneo.programacion_publicada_por
      ? await db.from('administradores').select('nombre').eq('id', torneo.programacion_publicada_por).maybeSingle()
      : { data: null }

    return NextResponse.json({
      ok: true,
      torneo: { id: torneo.id, estado: torneo.estado, fecha_inicio: torneo.fecha_inicio, fecha_fin: torneo.fecha_fin, programacion_publicada_at: torneo.programacion_publicada_at, programacion_publicada_por_nombre: publicador?.nombre ?? null },
      partidos: filas,
      franjas: ctx.franjas,
      turnos,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar la programación' }, { status: 500 })
  }
}
