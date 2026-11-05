import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'
import { avisarInscripcionConfirmada, recalcularInscripcion } from '@/lib/torneoServidor'

// El admin autoriza (o quita la autorización) a un jugador inscrito a jugar
// ESTA categoría aunque su categoría oficial no corresponda (p. ej. un
// Quinta en Doble Sexta). No cambia su categoría oficial ni la de la
// escalera: vale solo para esta inscripción. Recalcula y avisa si se confirma.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { inscripcionId, autorizar } = await request.json()
    if (typeof inscripcionId !== 'string' || !inscripcionId) return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })
    if (typeof autorizar !== 'boolean') return NextResponse.json({ error: 'Falta indicar si se autoriza' }, { status: 400 })

    const db = supabaseServer()
    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, jugador1_id, menor_id')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    if (!ins || !ins.jugador1_id) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'La inscripción está retirada' }, { status: 400 })

    const { error } = await db
      .from('torneo_inscripciones')
      .update(autorizar
        ? { nivel_autorizado_por: session!.id, nivel_autorizado_at: ahora().toISOString() }
        : { nivel_autorizado_por: null, nivel_autorizado_at: null })
      .eq('id', inscripcionId)
    if (error) throw error

    const r = await recalcularInscripcion(db, inscripcionId)
    if (r.antes !== 'confirmada' && r.despues === 'confirmada') await avisarInscripcionConfirmada(db, r)
    return NextResponse.json({ ok: true, estadoInscripcion: r.despues })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al autorizar' }, { status: 500 })
  }
}
