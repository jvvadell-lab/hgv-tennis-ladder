import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { mensajeErrorPostgres, tasaDosDecimales, validarPrenda } from '@/lib/delegacion'
import { obtenerTasaVigente } from '@/lib/tasaBcv'

// PATCH { tipo_prenda, talla, manga, confirmar? } — "Modificar prenda".
// Admin completo o "solo pagos". Solo prendas que no están en un lote y cuyo
// pago no está anulado (la función modificar_prenda_uniforme lo verifica con
// la prenda bloqueada). El monto pagado no cambia: si el precio cambia, la
// diferencia en US$ se acumula en pagos_delegacion.diferencia_usd.
//   - Sin cambio de precio: guarda directo.
//   - Con cambio de precio y sin confirmar: no guarda; responde 409 con la
//     diferencia (y su equivalente en Bs. a la tasa vigente si el pago fue
//     en Bs.) para que el admin confirme y reenvíe con confirmar: true.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    const prenda = validarPrenda(body ?? {})
    if ('error' in prenda) return NextResponse.json({ error: prenda.error }, { status: 400 })

    const db = supabaseServer()
    const { data, error } = await db.rpc('modificar_prenda_uniforme', {
      p_item_id: id,
      p_tipo: prenda.tipo_prenda,
      p_talla: prenda.talla,
      p_manga: prenda.manga,
      p_admin: session.id,
      p_confirmar: body?.confirmar === true,
    })
    if (error) {
      const status = error.code === 'P0002' ? 404 : 409
      return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status })
    }

    const resultado = data as { aplicado: boolean; diferencia_usd: number }
    const diferenciaUsd = Number(resultado.diferencia_usd)
    if (!resultado.aplicado) {
      // Equivalente en Bs. (informativo) si el pago fue en Bs.
      const { data: item } = await db.from('pedido_uniforme_items').select('pago:pago_id(moneda)').eq('id', id).maybeSingle()
      let diferenciaBs: number | null = null
      if ((item?.pago as { moneda?: string } | null)?.moneda === 'BS') {
        const vigente = await obtenerTasaVigente(db)
        if (vigente) diferenciaBs = Math.round(diferenciaUsd * tasaDosDecimales(vigente.usd) * 100) / 100
      }
      return NextResponse.json({ requiereConfirmacion: true, diferenciaUsd, diferenciaBs }, { status: 409 })
    }

    return NextResponse.json({ ok: true, diferenciaUsd })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string } | null)?.message || 'Error al modificar la prenda' }, { status: 500 })
  }
}
