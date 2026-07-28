import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

const TIPOS_VALIDOS = ['pago_movil', 'transferencia', 'efectivo']

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { tipoPago, monto, fecha, referencia } = await request.json()
    if (!TIPOS_VALIDOS.includes(tipoPago)) {
      return NextResponse.json({ error: 'El tipo de pago no es válido' }, { status: 400 })
    }
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id')
      .eq('estado', 'activa')
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada) {
      return NextResponse.json({ error: 'No hay una temporada activa en este momento.' }, { status: 400 })
    }

    const { data, error } = await db
      .from('pagos')
      .insert([{
        jugador_id: session.id,
        temporada_id: temporada.id,
        tipo_pago: tipoPago,
        monto: montoNum,
        fecha: fecha || new Date().toISOString().slice(0, 10),
        referencia: referencia?.trim() || null,
        validado: false,
      }])
      .select('numero_recibo')
      .single()
    if (error) throw error

    return NextResponse.json({ ok: true, numeroRecibo: data.numero_recibo })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al reportar el pago' }, { status: 500 })
  }
}
