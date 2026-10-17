import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { escaparHtml, notificarJugadores, recalcularInscripcion } from '@/lib/torneoServidor'

// Rechaza un pago de inscripción al torneo: como en la escalera, se borra
// (el jugador lo vuelve a reportar) y se le avisa. La inscripción se
// recalcula por si estaba confirmada con ese pago.
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
      .select('id, jugador_id, torneo_inscripcion_id')
      .eq('id', pagoId)
      .maybeSingle()
    if (errPago) throw errPago
    if (!pago || !pago.torneo_inscripcion_id) return NextResponse.json({ error: 'Pago de torneo no encontrado' }, { status: 404 })

    const { error } = await db.from('pagos').delete().eq('id', pagoId)
    if (error) throw error

    const r = await recalcularInscripcion(db, pago.torneo_inscripcion_id)

    await notificarJugadores(db, [pago.jugador_id], {
      tipo: 'torneo_pago_rechazado',
      mensaje: `⚠️ Tu pago de inscripción en ${r.categoriaNombre} fue rechazado. Revisa los datos y repórtalo de nuevo.`,
      asunto: `⚠️ Tu pago fue rechazado — ${r.torneoNombre}`,
      cuerpoHtml: () => `
        <p>El pago de inscripción que se reportó para <strong>${escaparHtml(r.categoriaNombre)}</strong> <strong>fue rechazado</strong>: no logramos confirmar que el dinero llegó a la cuenta del club.</p>
        <div style="background: #f8d7da; border-left: 4px solid #c0392b; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
          Por favor verifica los datos y vuelve a reportarlo. Si tienes dudas, contacta a <strong>Yelitza Contreras</strong> vía WhatsApp al <strong>0412-7628281</strong>.
        </div>
      `,
    })

    return NextResponse.json({ ok: true, estadoInscripcion: r.despues })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al rechazar el pago' }, { status: 500 })
  }
}
