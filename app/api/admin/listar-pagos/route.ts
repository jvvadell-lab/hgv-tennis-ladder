import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { temporadaId } = await request.json().catch(() => ({ temporadaId: null }))

    const db = supabaseServer()
    let query = db
      .from('pagos')
      .select('id, numero_recibo, jugador_id, temporada_id, tipo_pago, monto, fecha, referencia, jugadores:jugador_id(nombre)')
      .order('numero_recibo', { ascending: false })

    if (temporadaId) query = query.eq('temporada_id', temporadaId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ ok: true, pagos: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al listar pagos' }, { status: 500 })
  }
}
