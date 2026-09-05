import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { retoId } = await request.json()
    if (!retoId) return NextResponse.json({ error: 'Falta el id del reto' }, { status: 400 })

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, estado, retador_id, retado_id')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })
    if (!['pendiente', 'aceptado'].includes(reto.estado)) {
      return NextResponse.json({ error: 'Este reto ya no está activo, no hace falta cancelarlo.' }, { status: 400 })
    }

    // Reutilizamos el estado "rechazado" para representar la cancelación
    // administrativa — libera a ambos jugadores para retar de nuevo (trigger
    // trg_retos_sync_ocupados limpia jugadores_ocupados automáticamente).
    const { error } = await db.from('retos').update({ estado: 'rechazado' }).eq('id', retoId)
    if (error) throw error

    // No dejamos que un fallo al notificar tumbe la cancelación, que ya quedó guardada.
    const { error: errNotif } = await db.from('notificaciones').insert([
      {
        jugador_id: reto.retador_id,
        tipo: 'reto_cancelado_admin',
        reto_id: retoId,
        mensaje: 'Un administrador canceló tu reto pendiente. Ya puedes retar de nuevo.',
      },
      {
        jugador_id: reto.retado_id,
        tipo: 'reto_cancelado_admin',
        reto_id: retoId,
        mensaje: 'Un administrador canceló tu reto pendiente. Ya puedes retar de nuevo.',
      },
    ])
    if (errNotif) console.error('[cancelar-reto] Error al crear notificaciones:', errNotif)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cancelar' }, { status: 500 })
  }
}
