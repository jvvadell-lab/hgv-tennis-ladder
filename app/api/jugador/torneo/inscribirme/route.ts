import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { escaparHtml, notificarJugadores, torneoVigente } from '@/lib/torneoServidor'
import { mensajeErrorBaseInscripcion, validarInscripcion, type JugadorParaInscripcion } from '@/lib/torneoInscripcion'
import type { TorneoCategoria } from '@/lib/torneo'

// Inscripción del jugador con sesión (y su pareja, en dobles) en una
// categoría del torneo vigente. Todo se valida aquí con mensajes claros; el
// trigger torneo_inscripciones_validar repite cupo / pareja / máximo 2
// categorías como red de seguridad (inscripciones simultáneas).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { categoriaId, parejaId } = await request.json()
    if (!categoriaId || typeof categoriaId !== 'string') {
      return NextResponse.json({ error: 'Elige una categoría' }, { status: 400 })
    }
    if (parejaId != null && typeof parejaId !== 'string') {
      return NextResponse.json({ error: 'La pareja no es válida' }, { status: 400 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo abierto' }, { status: 400 })

    const { data: categorias, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, modalidad, genero, categoria_nivel, cupo')
      .eq('torneo_id', torneo.id)
    if (errCat) throw errCat
    const categoria = (categorias || []).find((c) => c.id === categoriaId) as
      (Pick<TorneoCategoria, 'id' | 'nombre' | 'modalidad' | 'genero' | 'categoria_nivel' | 'cupo'>) | undefined
    if (!categoria) return NextResponse.json({ error: 'Esa categoría no es de este torneo' }, { status: 400 })

    const ids = [session.id, ...(categoria.modalidad === 'doble' && parejaId ? [parejaId] : [])]
    if (categoria.modalidad === 'single' && parejaId) {
      return NextResponse.json({ error: 'En single te inscribes sin pareja' }, { status: 400 })
    }

    const { data: filas, error: errJug } = await db
      .from('jugadores')
      .select('id, nombre, genero, categoria, categoria_torneo, activo, estado_verificacion')
      .in('id', ids)
    if (errJug) throw errJug
    const porId = new Map((filas || []).map((j) => [j.id, j as JugadorParaInscripcion]))
    if (ids.some((id) => !porId.has(id))) {
      return NextResponse.json({ error: 'No encontramos a tu pareja entre los jugadores del club' }, { status: 400 })
    }
    const jugadores = ids.map((id) => porId.get(id)!)

    // Inscripciones vivas del torneo: cupo de la categoría y categorías de cada jugador.
    const { data: vivas, error: errVivas } = await db
      .from('torneo_inscripciones')
      .select('categoria_id, jugador1_id, jugador2_id')
      .in('categoria_id', (categorias || []).map((c) => c.id))
      .neq('estado', 'retirada')
    if (errVivas) throw errVivas
    const categoriasDe: Record<string, string[]> = {}
    for (const i of vivas || []) {
      for (const j of [i.jugador1_id, i.jugador2_id]) {
        if (j && ids.includes(j)) categoriasDe[j] = [...new Set([...(categoriasDe[j] || []), i.categoria_id])]
      }
    }

    const validacion = validarInscripcion({
      estadoTorneo: torneo.estado,
      categoria,
      jugadores,
      ocupados: (vivas || []).filter((i) => i.categoria_id === categoria.id).length,
      categoriasDe,
      categoriaId: categoria.id,
    })
    if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 })

    const { data: nueva, error: errIns } = await db
      .from('torneo_inscripciones')
      .insert({
        categoria_id: categoria.id,
        jugador1_id: session.id,
        jugador2_id: categoria.modalidad === 'doble' ? parejaId : null,
        inscrita_por: session.id,
      })
      .select('id')
      .single()
    if (errIns) {
      const claro = mensajeErrorBaseInscripcion(errIns.message)
      if (claro) return NextResponse.json({ error: claro }, { status: 400 })
      throw errIns
    }

    const yo = jugadores[0]
    const pareja = jugadores[1]
    const conQuien = pareja ? ` con ${pareja.nombre}` : ''
    await notificarJugadores(db, ids, {
      tipo: 'torneo_inscripcion',
      mensaje: pareja
        ? `🎄 ${yo.nombre} inscribió a la pareja ${yo.nombre} / ${pareja.nombre} en ${categoria.nombre}. Falta reportar el pago de cada uno.`
        : `🎄 Te inscribiste en ${categoria.nombre}. Falta reportar tu pago.`,
      asunto: `🎄 Inscripción en el ${torneo.nombre}`,
      cuerpoHtml: (j) => `
        <p>${j.id === yo.id ? 'Te inscribiste' : `<strong>${escaparHtml(yo.nombre)}</strong> te inscribió`} en <strong>${escaparHtml(categoria.nombre)}</strong> del <strong>${escaparHtml(torneo.nombre)}</strong>${j.id === yo.id ? escaparHtml(conQuien) : ' como su pareja'}.</p>
        <div style="background: #fff8e1; border-left: 4px solid #f0b400; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
          La inscripción queda <strong>pendiente</strong> hasta que se valide el pago de cada jugador (${torneo.monto_inscripcion_eur} € por jugador, en Bs. a la tasa BCV del euro del día del pago)${validacion.provisionales.length ? ' y el admin confirme la categoría' : ''}.
        </div>
      `,
    })

    return NextResponse.json({ ok: true, inscripcionId: nueva.id, provisionales: validacion.provisionales })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al inscribirte' }, { status: 500 })
  }
}
