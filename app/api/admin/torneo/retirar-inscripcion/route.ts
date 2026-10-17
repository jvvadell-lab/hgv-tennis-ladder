import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Retira una inscripción (libera su cupo y deja a sus jugadores inscribirse
// en otra categoría). Solo antes del sorteo: después, retirar a alguien
// afecta grupos y partidos y se resuelve en fases siguientes. Los pagos
// quedan registrados para la devolución o el traslado.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { inscripcionId } = await request.json()
    if (!inscripcionId) return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })

    const db = supabaseServer()
    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, torneo_categorias:categoria_id(torneos:torneo_id(estado))')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    if (!ins) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'La inscripción ya estaba retirada' }, { status: 400 })
    const estadoTorneo = (ins.torneo_categorias as any)?.torneos?.estado
    if (!['borrador', 'inscripcion'].includes(estadoTorneo)) {
      return NextResponse.json({ error: 'El torneo ya fue sorteado: no se puede retirar una inscripción desde aquí' }, { status: 400 })
    }

    const { error } = await db.from('torneo_inscripciones').update({ estado: 'retirada' }).eq('id', inscripcionId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al retirar la inscripción' }, { status: 500 })
  }
}
