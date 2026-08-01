import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { pagoId } = await request.json()
    if (!pagoId) return NextResponse.json({ error: 'Falta el id del pago' }, { status: 400 })

    const db = supabaseServer()

    const { data: pago, error: errPago } = await db
      .from('pagos')
      .select('id, jugador_id, jugadores:jugador_id(nombre, email)')
      .eq('id', pagoId)
      .maybeSingle()
    if (errPago) throw errPago
    if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

    const jugador = pago.jugadores as any

    const { error: errDelete } = await db.from('pagos').delete().eq('id', pagoId)
    if (errDelete) throw errDelete

    // El correo es informativo — si el jugador no tiene email o el envío falla,
    // el pago ya quedó rechazado de todas formas; no revertimos por eso.
    if (jugador?.email) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
          <p>Hola ${jugador.nombre || ''},</p>
          <p>Te escribimos desde <strong>HGV TENNIS CLUB</strong> para informarte que el pago que reportaste <strong>fue rechazado</strong> — no logramos confirmar que el dinero llegó a la cuenta del club.</p>
          <div style="background: #f8d7da; border-left: 4px solid #c0392b; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
            Por favor verifica los datos y vuelve a cargarlo en el sistema. Si tienes dudas, contacta a <strong>Yelitza Contreras</strong> vía WhatsApp al <strong>0412-7628281</strong>.
          </div>
          <p style="margin-top: 24px;">Recibe un cordial saludo.</p>
          <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
        </div>
      `
      await enviarCorreo(jugador.email, '🎾 Tu pago fue rechazado — HGV Tennis Club', html)
    }

    return NextResponse.json({ ok: true, nombre: jugador?.nombre })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al rechazar el pago' }, { status: 500 })
  }
}
