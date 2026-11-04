import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { escaparHtml, notificarJugadores, torneoVigente } from '@/lib/torneoServidor'
import { mensajeErrorBaseInscripcion, validarInscripcion, type JugadorParaInscripcion } from '@/lib/torneoInscripcion'
import type { TorneoCategoria } from '@/lib/torneo'
import { textoMontoCorto } from '@/lib/torneoPrecios'

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
      .select('id, nombre, modalidad, genero, categoria_nivel, cupo, inscripciones_abiertas, invitar_no_socios_con_aprobacion')
      .eq('torneo_id', torneo.id)
      .eq('es_infantil', false) // a un menor lo inscribe su representante (/api/jugador/torneo/infantil)
    if (errCat) throw errCat
    const categoria = (categorias || []).find((c) => c.id === categoriaId) as
      (Pick<TorneoCategoria, 'id' | 'nombre' | 'modalidad' | 'genero' | 'categoria_nivel' | 'cupo' | 'inscripciones_abiertas'>) | undefined
    if (!categoria) return NextResponse.json({ error: 'Esa categoría no es de este torneo' }, { status: 400 })

    const { data: yo, error: errJug } = await db
      .from('jugadores')
      .select('id, nombre, genero, categoria, categoria_torneo, activo, estado_verificacion, es_representante, es_invitado')
      .eq('id', session.id)
      .single()
    if (errJug) throw errJug
    if (yo.es_representante) return NextResponse.json({ error: 'Tu cuenta es de representante: inscribes a tus hijos, pero no juegas. Si quieres jugar, pídele a un administrador que te pase a jugador.' }, { status: 403 })
    // Categorías con aprobación previa: un no socio no entra solo (ocuparía
    // cupo sin el OK del admin). Entra si un socio lo invita y el admin lo
    // aprueba, o si el admin lo inscribe.
    if (yo.es_invitado && (categoria as any).invitar_no_socios_con_aprobacion) {
      return NextResponse.json({ error: `En ${categoria.nombre} los no socios entran solo con aprobación del admin: pídele a tu pareja socia que te invite, o al admin que te inscriba.` }, { status: 403 })
    }

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
      .select('id, monto_eur, monto_motivo')
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
          Tu inscripción queda <strong>pendiente</strong> hasta que se valide tu pago (${textoMontoCorto({ monto_eur: Number(nueva.monto_eur), motivo: nueva.monto_motivo })}, en Bs. a la tasa BCV del euro del día del pago)${validacion.provisionales.length ? ' y el admin confirme tu categoría' : ''}.
        </div>
        ${dobles ? '<p>Tu lugar ya está reservado. Invita a tu pareja desde la app; si no eliges a nadie, quedas <strong>disponible</strong> y el admin arma las duplas al cierre de inscripciones.</p>' : ''}
      `,
    })

    return NextResponse.json({ ok: true, inscripcionId: nueva.id, provisionales: validacion.provisionales, monto: { monto_eur: Number(nueva.monto_eur), motivo: nueva.monto_motivo } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al inscribirte' }, { status: 500 })
  }
}
