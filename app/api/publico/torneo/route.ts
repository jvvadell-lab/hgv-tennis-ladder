import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { competidoresDeCategorias, competidoresPorId, personasDe } from '@/lib/torneoEquiposServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'
import { ordenarGrupo, type PartidoParaTabla } from '@/lib/torneo'

// Vista pública del torneo (/torneo, SPEC §9): categorías, grupos con su
// tabla en vivo, partidos (calendario y llave) y nombres públicos.
//  * De los menores solo sale menor_nombre_publico ("Sofía M."); nunca su
//    ficha ni datos del representante.
//  * Fecha, hora y cancha solo cuando la programación está publicada.
//  * Marcador y ganador solo de partidos validados.
//  * `mias`: equipos del usuario con sesión (los suyos y los de sus
//    representados), para resaltarlos.
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

    // Los competidores son equipos: la dupla en dobles, la inscripción en single/infantil.
    const [equipos, { data: grupos, error: errG }, { data: partidos, error: errP }] = await Promise.all([
      competidoresDeCategorias(db, categoriaIds),
      db.from('torneo_grupos').select('id, categoria_id, letra, torneo_grupo_miembros(equipo_id, desempate_manual)').in('categoria_id', categoriaIds).order('letra'),
      db.from('torneo_partidos')
        .select('id, categoria_id, fase, grupo_id, orden, origen_a, origen_b, equipo_a, equipo_b, cancha, fecha_hora, estado, sets, tipo_resultado, retirada_equipo_id, ganador_equipo_id, wo_ausente_equipo_id, validado, handicap_equipo_id')
        .in('categoria_id', categoriaIds),
    ])
    if (errG) throw errG
    if (errP) throw errP

    // Un partido o grupo puede apuntar a un equipo que ya no está activo.
    const enCuadro = [...(partidos || []).flatMap((p) => [p.equipo_a, p.equipo_b]), ...(grupos || []).flatMap((g: any) => g.torneo_grupo_miembros.map((m: any) => m.equipo_id))]
    const faltan = enCuadro.filter((id) => id && !equipos.some((e) => e.id === id)) as string[]
    const todos = [...equipos, ...(await competidoresPorId(db, faltan)).values()]
    const nombres = await nombresInscripciones(db, todos)
    const publicada = !!torneo.programacion_publicada_at

    // Inscripciones del usuario con sesión: las suyas o las de sus representados.
    const session = await getSession()
    let mias: string[] = []
    if (session?.role === 'jugador') {
      mias = todos
        .filter((e) => personasDe(e).includes(session.id))
        .map((e) => e.id)
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
      equipo_a: p.equipo_a,
      equipo_b: p.equipo_b,
      cancha: publicada ? p.cancha : null,
      fecha_hora: publicada ? p.fecha_hora : null,
      estado: p.validado ? p.estado : publicada && p.fecha_hora ? 'programado' : 'pendiente',
      sets: p.validado ? p.sets : null,
      tipo_resultado: p.validado ? p.tipo_resultado : 'normal',
      ganador: p.validado ? p.ganador_equipo_id : null,
      wo_ausente: p.validado ? p.wo_ausente_equipo_id : null,
      retirada: p.validado && p.tipo_resultado === 'retiro' ? p.retirada_equipo_id : null,
      handicap: p.handicap_equipo_id,
    }))

    const gruposPublicos = (grupos || []).map((g) => {
      const miembros = ((g as any).torneo_grupo_miembros || []) as { equipo_id: string; desempate_manual: number | null }[]
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
        // Duplas formadas en dobles; inscritos en single e infantil.
        inscritas: equipos.filter((e) => e.categoria_id === c.id).length,
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
