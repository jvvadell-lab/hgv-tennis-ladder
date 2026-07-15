import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { temporadaId } = await request.json()
    if (!temporadaId) return NextResponse.json({ error: 'Falta el id de la temporada' }, { status: 400 })

    const db = supabaseServer()
    const { data, error } = await db
      .from('recordatorios_pago')
      .select('jugador_id, enviado_at')
      .eq('temporada_id', temporadaId)
      .order('enviado_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ ok: true, recordatorios: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al consultar' }, { status: 500 })
  }
}
