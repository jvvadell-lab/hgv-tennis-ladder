import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import { cancelarInvitacionesDe } from '@/lib/torneoDoblesServidor'

// Retira una inscripción y marca su pago para devolución (p. ej. el jugador
// impar que quedó sin pareja al cierre). Solo antes del sorteo de la
// categoría. La devolución en sí se hace fuera de la app; aquí queda
// registrado quién la marcó y cuándo.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { inscripcionId } = await request.json()
    if (typeof inscripcionId !== 'string') return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })
    const db = supabaseServer()
    const { data: ins, error } = await db
      .from('torneo_inscripciones')
      .select('id, estado, jugador1_id, devolucion_marcada_at, torneo_categorias:categoria_id(nombre, sorteo_publicado_at, torneos:torneo_id(nombre, estado))')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (error) throw error
    if (!ins) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
    if (ins.devolucion_marcada_at) return NextResponse.json({ error: 'La devolución ya estaba marcada' }, { status: 400 })
    const cat = ins.torneo_categorias as any
    if (cat?.sorteo_publicado_at || !['borrador', 'inscripcion'].includes(cat?.torneos?.estado)) {
      return NextResponse.json({ error: 'La categoría ya se sorteó' }, { status: 400 })
    }

    await cancelarInvitacionesDe(db, [ins.id], 'Se retiró la inscripción')
    const { error: errU } = await db
      .from('torneo_inscripciones')
      .update({ estado: 'retirada', devolucion_marcada_por: session!.id, devolucion_marcada_at: new Date().toISOString() })
      .eq('id', ins.id)
    if (errU) throw errU

    if (ins.jugador1_id) {
      await notificarJugadores(db, [ins.jugador1_id], {
        tipo: 'torneo_devolucion',
        mensaje: `💸 Tu inscripción en ${cat.nombre} se retiró y tu pago quedó marcado para devolución. El club te contactará.`,
        asunto: `Devolución de tu inscripción — ${cat.torneos.nombre}`,
        cuerpoHtml: () => `<p>Tu inscripción en <strong>${escaparHtml(cat.nombre)}</strong> se retiró y tu pago quedó <strong>marcado para devolución</strong>. El club te contactará para hacerla.</p>`,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al marcar la devolución' }, { status: 500 })
  }
}
