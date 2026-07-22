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
      .select('id, estado')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })
    if (!['pendiente', 'aceptado'].includes(reto.estado)) {
      return NextResponse.json({ error: 'Este reto ya no está activo, no hace falta cancelarlo.' }, { status: 400 })
    }

    // Reutilizamos el estado "rechazado" para representar la cancelación
    // administrativa — libera a ambos jugadores para retar de nuevo.
    const { error } = await db.from('retos').update({ estado: 'rechazado' }).eq('id', retoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cancelar' }, { status: 500 })
  }
}
