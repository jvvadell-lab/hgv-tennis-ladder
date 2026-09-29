import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { mensajeErrorPostgres } from '@/lib/delegacion'

// PATCH { entregado: boolean } — marca (o desmarca) una prenda como
// entregada. Solo se entrega si su lote ya se recibió de la fábrica (la base
// lo garantiza con un trigger; aquí se da el mensaje antes). Admin completo
// o "solo pagos".
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (typeof body?.entregado !== 'boolean') {
      return NextResponse.json({ error: 'Falta indicar si la prenda fue entregada' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data: item, error: itemError } = await db
      .from('pedido_uniforme_items')
      .select('id, entregado, pago:pago_id(anulado), lote:lote_id(estado)')
      .eq('id', id)
      .maybeSingle()
    if (itemError) throw itemError
    if (!item) return NextResponse.json({ error: 'La prenda no existe' }, { status: 404 })
    if ((item.pago as any)?.anulado) {
      return NextResponse.json({ error: 'Este pedido está anulado; no se puede marcar la entrega' }, { status: 409 })
    }

    if (body.entregado && !item.entregado && (item.lote as any)?.estado !== 'recibido') {
      return NextResponse.json(
        { error: (item.lote as any) ? 'Esta prenda sigue en fábrica; márcala entregada cuando el lote se reciba' : 'Esta prenda todavía no se ha enviado a fábrica' },
        { status: 409 }
      )
    }

    const { error } = await db
      .from('pedido_uniforme_items')
      .update({ entregado: body.entregado, entregado_at: body.entregado ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status: 409 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar la prenda' }, { status: 500 })
  }
}
