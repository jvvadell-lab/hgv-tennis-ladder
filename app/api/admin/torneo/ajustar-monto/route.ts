import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'

// El admin ajusta a mano el monto en € fijado en una inscripción (SPEC
// §2.5), con una nota obligatoria del motivo. monto_calculado_eur conserva
// lo que calculó la regla. Los pagos ya reportados no cambian: el nuevo
// monto rige para el próximo reporte. Sin monto (null) vuelve al calculado.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { inscripcionId, montoEur, nota } = await request.json()
    if (typeof inscripcionId !== 'string' || !inscripcionId) return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })
    const volver = montoEur === null
    const monto = Number(montoEur)
    if (!volver && (!Number.isFinite(monto) || monto < 0 || Math.round(monto * 100) !== monto * 100)) {
      return NextResponse.json({ error: 'Escribe un monto en € válido (hasta 2 decimales)' }, { status: 400 })
    }
    const motivo = typeof nota === 'string' ? nota.trim() : ''
    if (!volver && !motivo) return NextResponse.json({ error: 'Escribe el motivo del ajuste' }, { status: 400 })

    const db = supabaseServer()
    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, monto_calculado_eur')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    if (!ins) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'La inscripción está retirada' }, { status: 400 })

    const { error } = await db
      .from('torneo_inscripciones')
      .update(volver
        ? { monto_eur: ins.monto_calculado_eur, monto_ajustado_por: null, monto_ajustado_at: null, monto_ajuste_nota: null }
        : { monto_eur: monto, monto_ajustado_por: session!.id, monto_ajustado_at: ahora().toISOString(), monto_ajuste_nota: motivo })
      .eq('id', inscripcionId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al ajustar el monto' }, { status: 500 })
  }
}
