import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { escaparHtml, notificarJugadores, torneoVigente } from '@/lib/torneoServidor'
import { mensajeErrorBaseInscripcion, validarInscripcion, type JugadorParaInscripcion } from '@/lib/torneoInscripcion'
import type { TorneoCategoria } from '@/lib/torneo'

// Inscripción del jugador con sesión en una categoría del torneo vigente.
// También en dobles cada jugador se inscribe y paga solo: la pareja se forma
// después con una invitación (/api/jugador/torneo/invitaciones) o la arma el
// admin al cierre. Todo se valida aquí con mensajes claros; el trigger
// torneo_inscripciones_validar repite categoría abierta / cupo / máximo 2
// categorías como red de seguridad (inscripciones simultáneas).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { categoriaId } = await request.json()
    if (!categoriaId || typeof categoriaId !== 'string') {
      return NextResponse.json({ error: 'Elige una categoría' }, { status: 400 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo abierto' }, { status: 400 })

    const { data: categorias, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, modalidad, genero, categoria_nivel, cupo, inscripciones_abiertas')
      .eq('torneo_id', torneo.id)
      .eq('es_infantil', false) // a un menor lo inscribe su representante (/api/jugador/torneo/infantil)
    if (errCat) throw errCat
    const categoria = (categorias || []).find((c) => c.id === categoriaId) as
      (Pick<TorneoCategoria, 'id' | 'nombre' | 'modalidad' | 'genero' | 'categoria_nivel' | 'cupo' | 'inscripciones_abiertas'>) | undefined
    if (!categoria) return NextResponse.json({ error: 'Esa categoría no es de este torneo' }, { status: 400 })

    const { data: yo, error: errJug } = await db
      .from('jugadores')
      .select('id, nombre, genero, categoria, categoria_torneo, activo, estado_verificacion')
      .eq('id', session.id)
      .single()
    if (errJug) throw errJug

    // Inscripciones vivas del torneo: cupo de la categoría y mis categorías.
    const { data: vivas, error: errVivas } = await db
      .from('torneo_inscripciones')
      .select('categoria_id, jugador1_id')
      .in('categoria_id', (categorias || []).map((c) => c.id))
      .neq('estado', 'retirada')
    if (errVivas) throw errVivas

    const validacion = validarInscripcion({
      estadoTorneo: torneo.estado,
      categoria,
      jugadores: [yo as JugadorParaInscripcion],
      ocupados: (vivas || []).filter((i) => i.categoria_id === categoria.id).length,
      categoriasDe: { [yo.id]: [...new Set((vivas || []).filter((i) => i.jugador1_id === yo.id).map((i) => i.categoria_id))] },
      categoriaId: categoria.id,
    })
    if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 })

    const { data: nueva, error: errIns } = await db
      .from('torneo_inscripciones')
      .insert({ categoria_id: categoria.id, jugador1_id: session.id, inscrita_por: session.id })
      .select('id')
      .single()
    if (errIns) {
      const claro = mensajeErrorBaseInscripcion(errIns.message)
      if (claro) return NextResponse.json({ error: claro }, { status: 400 })
      throw errIns
    }

    const dobles = categoria.modalidad === 'doble'
    await notificarJugadores(db, [yo.id], {
      tipo: 'torneo_inscripcion',
      mensaje: `🎄 Te inscribiste en ${categoria.nombre}. Falta reportar tu pago${dobles ? ' e invitar a tu pareja (o esperar a que el admin arme las duplas al cierre)' : ''}.`,
      asunto: `🎄 Inscripción en el ${torneo.nombre}`,
      cuerpoHtml: () => `
        <p>Te inscribiste en <strong>${escaparHtml(categoria.nombre)}</strong> del <strong>${escaparHtml(torneo.nombre)}</strong>.</p>
        <div style="background: #fff8e1; border-left: 4px solid #f0b400; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
          Tu inscripción queda <strong>pendiente</strong> hasta que se valide tu pago (${torneo.monto_inscripcion_eur} €, en Bs. a la tasa BCV del euro del día del pago)${validacion.provisionales.length ? ' y el admin confirme tu categoría' : ''}.
        </div>
        ${dobles ? '<p>Tu lugar ya está reservado. Invita a tu pareja desde la app; si no eliges a nadie, quedas <strong>disponible</strong> y el admin arma las duplas al cierre de inscripciones.</p>' : ''}
      `,
    })

    return NextResponse.json({ ok: true, inscripcionId: nueva.id, provisionales: validacion.provisionales })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al inscribirte' }, { status: 500 })
  }
}
