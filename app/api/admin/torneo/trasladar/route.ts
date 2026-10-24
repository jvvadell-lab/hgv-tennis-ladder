import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { avisarInscripcionConfirmada, escaparHtml, notificarJugadores, recalcularInscripcion, torneoVigente } from '@/lib/torneoServidor'
import { cancelarInvitacionesDe } from '@/lib/torneoDoblesServidor'
import { errorGeneros, mensajeErrorBaseInscripcion, nivelAdmitido, nivelParaTorneo } from '@/lib/torneoInscripcion'
import type { Nivel } from '@/lib/torneo'

// Traslada la inscripción de un jugador (con su pago) a otra categoría de
// adultos del torneo, antes del sorteo de las dos (p. ej. el que quedó sin
// pareja al cierre). Si tenía dupla se deshace (el trigger) y su compañero
// vuelve a "disponible". El trigger repite cupo y máximo 2 categorías.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { inscripcionId, categoriaId } = await request.json()
    if (typeof inscripcionId !== 'string' || typeof categoriaId !== 'string') {
      return NextResponse.json({ error: 'Elige la inscripción y la categoría de destino' }, { status: 400 })
    }
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['borrador', 'inscripcion'].includes(torneo.estado)) return NextResponse.json({ error: 'El sorteo ya se hizo' }, { status: 400 })

    const { data: ins, error: errI } = await db
      .from('torneo_inscripciones')
      .select('id, categoria_id, jugador1_id, estado, menor_id')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errI) throw errI
    if (!ins || ins.estado === 'retirada') return NextResponse.json({ error: 'Inscripción no encontrada o retirada' }, { status: 400 })
    if (ins.menor_id) return NextResponse.json({ error: 'Las inscripciones infantiles se cambian desde la certificación' }, { status: 400 })
    if (ins.categoria_id === categoriaId) return NextResponse.json({ error: 'Ya está en esa categoría' }, { status: 400 })

    const { data: cats, error: errC } = await db
      .from('torneo_categorias')
      .select('id, torneo_id, nombre, genero, categoria_nivel, es_infantil, sorteo_publicado_at, cancelada_at')
      .in('id', [ins.categoria_id, categoriaId])
    if (errC) throw errC
    const origen = (cats || []).find((c) => c.id === ins.categoria_id)
    const destino = (cats || []).find((c) => c.id === categoriaId)
    if (!origen || !destino || destino.torneo_id !== torneo.id || destino.es_infantil) return NextResponse.json({ error: 'Categoría de destino no válida' }, { status: 400 })
    if (origen.sorteo_publicado_at || destino.sorteo_publicado_at) return NextResponse.json({ error: 'Una de las dos categorías ya se sorteó' }, { status: 400 })
    if (destino.cancelada_at) return NextResponse.json({ error: `${destino.nombre} está cancelada` }, { status: 400 })

    const { data: j, error: errJ } = await db.from('jugadores').select('id, nombre, genero, categoria, categoria_torneo').eq('id', ins.jugador1_id).single()
    if (errJ) throw errJ
    const errGenero = destino.genero === 'mixto' ? null : errorGeneros(destino.genero, [j.genero])
    if (errGenero) return NextResponse.json({ error: errGenero }, { status: 400 })
    if (!nivelAdmitido(destino.categoria_nivel as Nivel | null, nivelParaTorneo(j))) {
      return NextResponse.json({ error: `${j.nombre} no puede jugar ${destino.nombre} por su nivel` }, { status: 400 })
    }

    // Las invitaciones pendientes de la categoría vieja dejan de tener sentido.
    await cancelarInvitacionesDe(db, [ins.id], 'Se trasladó a otra categoría')
    const { data: exDupla } = await db
      .from('torneo_equipos')
      .select('inscripcion1_id, inscripcion2_id')
      .eq('estado', 'activo')
      .or(`inscripcion1_id.eq.${ins.id},inscripcion2_id.eq.${ins.id}`)
      .maybeSingle()

    const { error: errU } = await db.from('torneo_inscripciones').update({ categoria_id: categoriaId }).eq('id', ins.id)
    if (errU) {
      const claro = mensajeErrorBaseInscripcion(errU.message)
      return NextResponse.json({ error: claro ?? errU.message }, { status: 400 })
    }
    const r = await recalcularInscripcion(db, ins.id)
    if (r.antes !== 'confirmada' && r.despues === 'confirmada') await avisarInscripcionConfirmada(db, r)

    await notificarJugadores(db, [j.id], {
      tipo: 'torneo_traslado',
      mensaje: `🔁 El admin te trasladó de ${origen.nombre} a ${destino.nombre}. Tu pago se mantiene.`,
      asunto: `🔁 Cambio de categoría — ${torneo.nombre}`,
      cuerpoHtml: () => `<p>El admin trasladó tu inscripción de <strong>${escaparHtml(origen.nombre)}</strong> a <strong>${escaparHtml(destino.nombre)}</strong>. Tu pago se mantiene.</p>`,
    })
    if (exDupla) {
      const otra = exDupla.inscripcion1_id === ins.id ? exDupla.inscripcion2_id : exDupla.inscripcion1_id
      const { data: comp } = await db.from('torneo_inscripciones').select('jugador1_id').eq('id', otra).maybeSingle()
      if (comp?.jugador1_id) {
        await notificarJugadores(db, [comp.jugador1_id], {
          tipo: 'torneo_dupla_deshecha',
          mensaje: `🎾 ${j.nombre} pasó a otra categoría y tu dupla en ${origen.nombre} se deshizo. Sigues inscrito y disponible.`,
          asunto: `Cambio de dupla — ${origen.nombre}`,
          cuerpoHtml: () => `<p><strong>${escaparHtml(j.nombre)}</strong> pasó a otra categoría y tu dupla en <strong>${escaparHtml(origen.nombre)}</strong> se deshizo. Sigues inscrito y <strong>disponible</strong>.</p>`,
        })
      }
    }
    return NextResponse.json({ ok: true, estado: r.despues })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al trasladar' }, { status: 500 })
  }
}
