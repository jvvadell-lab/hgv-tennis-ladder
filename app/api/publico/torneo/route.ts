import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'
import { ordenarGrupo, type PartidoParaTabla } from '@/lib/torneo'

// Vista pública del torneo (/torneo, SPEC §9): categorías, grupos con su
// tabla en vivo, partidos (calendario y llave) y nombres públicos.
//  * De los menores solo sale menor_nombre_publico ("Sofía M."); nunca su
//    ficha ni datos del representante.
//  * Fecha, hora y cancha solo cuando la programación está publicada.
//  * Marcador y ganador solo de partidos validados.
//  * `mias`: inscripciones del usuario con sesión (las suyas y las de sus
//    representados), para resaltarlas.
export async function GET() {
  try {
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null })

    const { data: categorias, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, modalidad, genero, es_infantil, orden, llave_desde, formato_partido, duracion_min')
      .eq('torneo_id', torneo.id)
      .order('orden')
    if (errCat) throw errCat
    const categoriaIds = (categorias || []).map((c) => c.id)

    const [{ data: inscripciones, error: errIns }, { data: grupos, error: errG }, { data: partidos, error: errP }] = await Promise.all([
      db.from('torneo_inscripciones')
        .select('id, categoria_id, jugador1_id, jugador2_id, menor_id, menor_nombre_publico, estado')
        .in('categoria_id', categoriaIds)
        .neq('estado', 'retirada'),
      db.from('torneo_grupos').select('id, categoria_id, letra, torneo_grupo_miembros(inscripcion_id, desempate_manual)').in('categoria_id', categoriaIds).order('letra'),
      db.from('torneo_partidos')
        .select('id, categoria_id, fase, grupo_id, orden, origen_a, origen_b, inscripcion_a, inscripcion_b, cancha, fecha_hora, estado, sets, tipo_resultado, retirada_inscripcion_id, ganador_inscripcion_id, wo_ausente_inscripcion_id, validado, handicap_inscripcion_id')
        .in('categoria_id', categoriaIds),
    ])
    if (errIns) throw errIns
    if (errG) throw errG
    if (errP) throw errP

    const nombres = await nombresInscripciones(db, inscripciones || [])
    const publicada = !!torneo.programacion_publicada_at

    // Inscripciones del usuario con sesión: las suyas o las de sus representados.
    const session = await getSession()
    let mias: string[] = []
    if (session?.role === 'jugador') {
      const menorIds = (inscripciones || []).some((i) => i.menor_id)
        ? ((await db.from('torneo_menores').select('id').eq('representante_jugador_id', session.id)).data || []).map((m) => m.id)
        : []
      mias = (inscripciones || [])
        .filter((i) => i.jugador1_id === session.id || i.jugador2_id === session.id || (i.menor_id && menorIds.includes(i.menor_id)))
        .map((i) => i.id)
    }

    const letraDe = new Map((grupos || []).map((g) => [g.id, g.letra]))
    const partidosPublicos = (partidos || []).map((p) => ({
      id: p.id,
      categoria_id: p.categoria_id,
      fase: p.fase,
      grupo: p.grupo_id ? letraDe.get(p.grupo_id) ?? null : null,
      orden: p.orden,
      origen_a: p.origen_a,
      origen_b: p.origen_b,
      inscripcion_a: p.inscripcion_a,
      inscripcion_b: p.inscripcion_b,
      cancha: publicada ? p.cancha : null,
      fecha_hora: publicada ? p.fecha_hora : null,
      estado: p.validado ? p.estado : publicada && p.fecha_hora ? 'programado' : 'pendiente',
      sets: p.validado ? p.sets : null,
      tipo_resultado: p.validado ? p.tipo_resultado : 'normal',
      ganador: p.validado ? p.ganador_inscripcion_id : null,
      wo_ausente: p.validado ? p.wo_ausente_inscripcion_id : null,
      handicap: p.handicap_inscripcion_id,
    }))

    const gruposPublicos = (grupos || []).map((g) => {
      const miembros = ((g as any).torneo_grupo_miembros || []) as { inscripcion_id: string; desempate_manual: number | null }[]
      const delGrupo = (partidos || []).filter((p) => p.grupo_id === g.id) as unknown as PartidoParaTabla[]
      return {
        id: g.id,
        categoria_id: g.categoria_id,
        letra: g.letra,
        tabla: ordenarGrupo(delGrupo, miembros),
      }
    })

    return NextResponse.json({
      ok: true,
      torneo: { nombre: torneo.nombre, fecha_inicio: torneo.fecha_inicio, fecha_fin: torneo.fecha_fin, estado: torneo.estado, sorteado: !!torneo.sorteo_publicado_at, programacion_publicada: publicada },
      categorias: (categorias || []).map((c) => ({
        ...c,
        inscritas: (inscripciones || []).filter((i) => i.categoria_id === c.id).length,
      })),
      nombres: Object.fromEntries(nombres),
      grupos: gruposPublicos,
      partidos: partidosPublicos,
      mias,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el torneo' }, { status: 500 })
  }
}
