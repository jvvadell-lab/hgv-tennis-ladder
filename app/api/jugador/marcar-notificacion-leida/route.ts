import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { notificacionId } = await request.json()
    if (!notificacionId) {
      return NextResponse.json({ error: 'Falta el id de la notificación' }, { status: 400 })
    }

    const db = supabaseServer()

    // El UPDATE no está expuesto vía RLS al cliente — se valida aquí, contra la
    // cookie de sesión, que la notificación pertenece a quien la está marcando.
    const { data: notificacion, error: errSelect } = await db
      .from('notificaciones')
      .select('id, jugador_id')
      .eq('id', notificacionId)
      .maybeSingle()
    if (errSelect) throw errSelect
    if (!notificacion) return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 })
    if (notificacion.jugador_id !== session.id) {
      return NextResponse.json({ error: 'Esta notificación no te pertenece' }, { status: 403 })
    }

    const { error: errUpdate } = await db
      .from('notificaciones')
      .update({ leido: true })
      .eq('id', notificacionId)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al marcar la notificación como leída' }, { status: 500 })
  }
}
