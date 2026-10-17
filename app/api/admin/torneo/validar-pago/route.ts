import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { avisarInscripcionConfirmada, escaparHtml, notificarJugadores, recalcularInscripcion } from '@/lib/torneoServidor'

// Valida un pago de inscripción al torneo (cualquier nivel de admin, como
// los pagos de la escalera), recalcula la inscripción y avisa: al jugador
// del pago, que se confirmó; y si con esto la inscripción queda confirmada,
// a todos sus jugadores.
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
      .select('id, jugador_id, validado, monto, torneo_inscripcion_id')
      .eq('id', pagoId)
      .maybeSingle()
    if (errPago) throw errPago
    if (!pago || !pago.torneo_inscripcion_id) return NextResponse.json({ error: 'Pago de torneo no encontrado' }, { status: 404 })
    if (pago.validado) return NextResponse.json({ error: 'Ese pago ya estaba validado' }, { status: 400 })

    const { error } = await db.from('pagos').update({ validado: true }).eq('id', pagoId)
    if (error) throw error

    const r = await recalcularInscripcion(db, pago.torneo_inscripcion_id)
    const torneoNombre = r.torneoNombre

    if (r.antes !== 'confirmada' && r.despues === 'confirmada') {
      await avisarInscripcionConfirmada(db, r)
    } else {
      const monto = Number(pago.monto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      await notificarJugadores(db, [pago.jugador_id], {
        tipo: 'torneo_pago_validado',
        mensaje: `💳 Se confirmó tu pago de inscripción en ${r.categoriaNombre} (Bs. ${monto}).`,
        asunto: `💳 Pago confirmado — ${torneoNombre}`,
        cuerpoHtml: () => `
          <p>Confirmamos tu pago de inscripción en <strong>${escaparHtml(r.categoriaNombre)}</strong> por <strong>Bs. ${monto}</strong>.</p>
          <p>La inscripción se confirma cuando estén validados los pagos de todos sus jugadores y su categoría.</p>
        `,
      })
    }

    return NextResponse.json({ ok: true, estadoInscripcion: r.despues })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al validar el pago' }, { status: 500 })
  }
}
