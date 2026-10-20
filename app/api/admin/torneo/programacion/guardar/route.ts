import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { CANCHAS_TORNEO, type CanchaTorneo } from '@/lib/torneo'
import { dependenciasDe, etiquetaPartido, revisarHorario, type Horario } from '@/lib/torneoProgramacion'
import { avisarProgramacion, datosProgramacion } from '@/lib/torneoProgramacionServidor'

// Guarda horarios (la propuesta del asistente o una asignación a mano) o
// los quita (cancha e inicio null). Revisa cada uno contra la programación
// completa que quedaría: los errores no se guardan nunca; los avisos solo
// con forzar = true. torneo_programar_partidos crea, mueve o borra el
// bloqueo de cancha de cada partido en una transacción. Si la programación
// ya está publicada, avisa a los afectados.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const { asignaciones, forzar } = await request.json()
    if (!Array.isArray(asignaciones) || !asignaciones.length) return NextResponse.json({ error: 'No hay horarios para guardar' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['sorteado', 'en_curso'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'La programación se arma después de publicar el sorteo' }, { status: 400 })
    }

    const { ctx, horarios, partidos } = await datosProgramacion(db, torneo)
    const porId = new Map(partidos.map((p) => [p.id, p]))
    const nuevos = new Map(horarios)
    const cambiados: string[] = []
    for (const a of asignaciones) {
      const p = porId.get(a?.partidoId)
      if (!p) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
      if (p.cerrado) return NextResponse.json({ error: `${etiquetaPartido(p)} ya tiene resultado: no se puede mover` }, { status: 400 })
      if (a.cancha === null) {
        nuevos.delete(p.id)
      } else {
        const inicio = typeof a.inicio === 'string' ? new Date(a.inicio).getTime() : NaN
        if (!(CANCHAS_TORNEO as readonly string[]).includes(a.cancha) || Number.isNaN(inicio)) {
          return NextResponse.json({ error: `Horario no válido para ${etiquetaPartido(p)}` }, { status: 400 })
        }
        nuevos.set(p.id, { cancha: a.cancha as CanchaTorneo, inicio })
      }
      cambiados.push(p.id)
    }

    const errores: string[] = []
    const avisos: string[] = []
    for (const id of cambiados) {
      const h = nuevos.get(id)
      if (!h) {
        // Sin horario: ningún partido de llave programado puede depender de él.
        for (const q of ctx.partidos) {
          if (nuevos.has(q.id) && dependenciasDe(q, ctx.partidos).some((d) => d.id === id)) {
            errores.push(`${etiquetaPartido(porId.get(id)!)}: primero quita el horario de ${etiquetaPartido(q)}, que depende de este partido`)
          }
        }
        continue
      }
      const resto = new Map<string, Horario>(nuevos)
      resto.delete(id)
      const r = revisarHorario(ctx, resto, porId.get(id)!, h)
      errores.push(...r.errores.map((e) => `${etiquetaPartido(porId.get(id)!)}: ${e}`))
      avisos.push(...r.avisos.map((e) => `${etiquetaPartido(porId.get(id)!)}: ${e}`))
    }
    if (errores.length) return NextResponse.json({ error: 'Hay conflictos que impiden guardar', errores, avisos }, { status: 400 })
    if (avisos.length && !forzar) return NextResponse.json({ error: 'Hay avisos: revisa y confirma para guardar igual', requiereConfirmar: true, errores: [], avisos }, { status: 409 })

    const { error } = await db.rpc('torneo_programar_partidos', {
      p_admin_id: session!.id,
      p_asignaciones: cambiados.map((id) => {
        const h = nuevos.get(id)
        return { partido_id: id, cancha: h?.cancha ?? null, inicio: h ? new Date(h.inicio).toISOString() : null }
      }),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (torneo.programacion_publicada_at) {
      try {
        await avisarProgramacion(db, torneo.nombre, cambiados.map((id) => porId.get(id)!), nuevos, { cambio: true })
      } catch (err: any) {
        console.error('[torneo] No se pudo avisar el cambio de horario:', err.message)
      }
    }
    return NextResponse.json({ ok: true, guardados: cambiados.length, avisos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la programación' }, { status: 500 })
  }
}
