import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

const TIPOS_VALIDOS = ['pago_movil', 'transferencia', 'efectivo']

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { jugadorId, temporadaId, tipoPago, monto, fecha, referencia } = await request.json()
    if (!jugadorId || !temporadaId || !TIPOS_VALIDOS.includes(tipoPago)) {
      return NextResponse.json({ error: 'Faltan datos o el tipo de pago no es válido' }, { status: 400 })
    }
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data, error } = await db
      .from('pagos')
      .insert([{
        jugador_id: jugadorId,
        temporada_id: temporadaId,
        tipo_pago: tipoPago,
        monto: montoNum,
        fecha: fecha || new Date().toISOString().slice(0, 10),
        referencia: referencia?.trim() || null,
      }])
      .select('numero_recibo')
      .single()
    if (error) throw error

    return NextResponse.json({ ok: true, numeroRecibo: data.numero_recibo })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al registrar el pago' }, { status: 500 })
  }
}
