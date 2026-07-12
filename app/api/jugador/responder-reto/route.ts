import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { retoId, nuevoEstado } = await request.json()
    if (!retoId || !['aceptado', 'rechazado'].includes(nuevoEstado)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retado_id, estado')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })

    // Solo el jugador retado puede aceptar o rechazar, y solo si sigue pendiente
    if (reto.retado_id !== session.id) {
      return NextResponse.json({ error: 'Este reto no te pertenece' }, { status: 403 })
    }
    if (reto.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Este reto ya no está pendiente' }, { status: 400 })
    }

    const { error: errUpdate } = await db.from('retos').update({ estado: nuevoEstado }).eq('id', retoId)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al responder' }, { status: 500 })
  }
}
