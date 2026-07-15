import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { pagoId } = await request.json()
    if (!pagoId) return NextResponse.json({ error: 'Falta el id del pago' }, { status: 400 })

    const db = supabaseServer()
    const { error } = await db.from('pagos').delete().eq('id', pagoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar el pago' }, { status: 500 })
  }
}
