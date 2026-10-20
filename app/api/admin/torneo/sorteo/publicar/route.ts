import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { escaparHtml, notificarJugadores, torneoVigente } from '@/lib/torneoServidor'
import { METODOS_SORTEO, planCategoria, validarGruposSorteo, type MetodoSorteo, type PlanCategoria } from '@/lib/torneoSorteo'
import { datosParaSorteo } from '@/lib/torneoSorteoServidor'

// Publica el sorteo que el admin vio en la vista previa (SPEC §3). Vuelve a
// validar los grupos contra las inscripciones vivas de ahora (hayan pagado
// o no; con las inscripciones abiertas o cerradas),
// regenera los partidos en el servidor (no confía en los del navegador) y
// escribe todo en una transacción con torneo_publicar_sorteo, que también
// pasa el torneo a 'sorteado' y registra quién lo publicó y cuándo.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { metodo, grupos } = await request.json()
    if (!(METODOS_SORTEO as readonly string[]).includes(metodo)) {
      return NextResponse.json({ error: 'Método de sorteo no válido' }, { status: 400 })
    }
    if (!grupos || typeof grupos !== 'object') return NextResponse.json({ error: 'Falta el sorteo a publicar' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['borrador', 'inscripcion'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'El sorteo ya se hizo' }, { status: 400 })
    }

    const categorias = await datosParaSorteo(db, torneo)
    const bloqueos = categorias.flatMap((c) => c.bloqueos)
    if (bloqueos.length) return NextResponse.json({ error: `Antes del sorteo falta resolver: ${bloqueos.join(' · ')}` }, { status: 400 })
    const planes: PlanCategoria[] = []
    for (const c of categorias) {
      const r = validarGruposSorteo(c, c.inscripciones, metodo as MetodoSorteo, grupos[c.id])
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      planes.push(planCategoria(r.sorteo))
    }

    const { error } = await db.rpc('torneo_publicar_sorteo', {
      p_torneo_id: torneo.id,
      p_metodo: metodo,
      p_admin_id: session!.id,
      p_plan: planes,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await avisarSorteo(db, torneo.id, torneo.nombre)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al publicar el sorteo' }, { status: 500 })
  }
}

// Aviso a cada jugador (o representante) de su grupo. Informativo: si falla
// no revierte el sorteo.
async function avisarSorteo(db: ReturnType<typeof supabaseServer>, torneoId: string, torneoNombre: string) {
  try {
    const { data: categorias, error: errCat } = await db.from('torneo_categorias').select('id, nombre').eq('torneo_id', torneoId)
    if (errCat) throw errCat
    const nombreCat = new Map((categorias || []).map((c) => [c.id, c.nombre as string]))
    const { data: grupos, error: errG } = await db.from('torneo_grupos').select('id, letra, categoria_id').in('categoria_id', [...nombreCat.keys()])
    if (errG) throw errG
    const grupoPorId = new Map((grupos || []).map((g) => [g.id, g]))
    const { data: miembros, error: errM } = await db
      .from('torneo_grupo_miembros')
      .select('grupo_id, torneo_inscripciones(jugador1_id, jugador2_id, menor_nombre_publico, torneo_menores(representante_jugador_id))')
      .in('grupo_id', [...grupoPorId.keys()])
    if (errM) throw errM

    // Un aviso por persona, con todos sus grupos (puede jugar 2 categorías o representar a varios).
    const porPersona = new Map<string, string[]>()
    for (const m of (miembros || []) as any[]) {
      const ins = m.torneo_inscripciones
      const g = grupoPorId.get(m.grupo_id)!
      const linea = `${nombreCat.get(g.categoria_id)}: grupo ${g.letra}${ins.menor_nombre_publico ? ` (${ins.menor_nombre_publico})` : ''}`
      const personas: (string | null)[] = ins.menor_nombre_publico ? [ins.torneo_menores?.representante_jugador_id] : [ins.jugador1_id, ins.jugador2_id]
      for (const id of personas.filter(Boolean) as string[]) porPersona.set(id, [...(porPersona.get(id) || []), linea])
    }
    for (const [id, lineas] of porPersona) {
      await notificarJugadores(db, [id], {
        tipo: 'torneo_sorteo',
        mensaje: `🎲 Sorteo del ${torneoNombre}: ${lineas.join(' · ')}. Mira los grupos en Torneo.`,
        asunto: `🎲 Sorteo de grupos — ${torneoNombre}`,
        cuerpoHtml: () => `
          <p>Ya se hizo el sorteo de los grupos del <strong>${escaparHtml(torneoNombre)}</strong>.</p>
          <ul>${lineas.map((l) => `<li>${escaparHtml(l)}</li>`).join('')}</ul>
          <p>Te avisaremos cuando se publique el calendario con tus partidos.</p>
        `,
      })
    }
  } catch (err: any) {
    console.error('[torneo] No se pudo avisar el sorteo:', err.message)
  }
}
