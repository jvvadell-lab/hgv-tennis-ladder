import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const db = supabaseServer()

    const { data: temporada } = await db
      .from('temporadas')
      .select('id, nombre')
      .eq('estado', 'activa')
      .maybeSingle()

    if (!temporada) {
      return NextResponse.json({ ok: true, pagos: [], temporada: null })
    }

    const { data: pagos, error } = await db
      .from('pagos')
      .select('id, numero_recibo, tipo_pago, monto, fecha')
      .eq('jugador_id', session.id)
      .eq('temporada_id', temporada.id)
      .order('fecha', { ascending: false })
    if (error) throw error

    return NextResponse.json({ ok: true, pagos: pagos || [], temporada })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al consultar tus pagos' }, { status: 500 })
  }
}
