import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { retoId } = await request.json()
    if (!retoId) return NextResponse.json({ error: 'Falta el id del reto' }, { status: 400 })

    const db = supabaseServer()

    const { data: reto, error: errBuscar } = await db
      .from('retos')
      .select('id, estado')
      .eq('id', retoId)
      .maybeSingle()
    if (errBuscar) throw errBuscar
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })
    if (reto.estado !== 'rechazado') {
      return NextResponse.json({ error: 'Solo se pueden eliminar retos rechazados. Los demás usa "Cancelar reto".' }, { status: 400 })
    }

    // Por si acaso quedó algún resultado huérfano asociado (no debería pasar en un rechazado).
    await db.from('resultados').delete().eq('reto_id', retoId)

    const { error: errDelete } = await db.from('retos').delete().eq('id', retoId)
    if (errDelete) throw errDelete

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar el reto' }, { status: 500 })
  }
}
