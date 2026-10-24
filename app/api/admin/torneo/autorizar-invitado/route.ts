import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'
import { avisarInscripcionConfirmada, recalcularInscripcion } from '@/lib/torneoServidor'
import { mensajeErrorBaseInscripcion } from '@/lib/torneoInscripcion'

// Torneo solo para socios (SPEC §2.1): el admin autoriza (o quita la
// autorización) a una inscripción con un invitado, o con un menor sin N.º
// de acción, como invitado / wild card. Solo antes del sorteo. Después
// recalcula la inscripción (sin autorización no se confirma).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { inscripcionId, autorizar } = await request.json()
    if (typeof inscripcionId !== 'string' || !inscripcionId) return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })

    const db = supabaseServer()
    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, torneo_categorias:categoria_id(torneos:torneo_id(estado))')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    if (!ins) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'La inscripción está retirada' }, { status: 400 })
    if (!['borrador', 'inscripcion'].includes((ins.torneo_categorias as any)?.torneos?.estado)) {
      return NextResponse.json({ error: 'El torneo ya fue sorteado: la autorización no se cambia desde aquí' }, { status: 400 })
    }

    const { error } = await db
      .from('torneo_inscripciones')
      .update(autorizar === false
        ? { invitado_autorizado_por: null, invitado_autorizado_at: null }
        : { invitado_autorizado_por: session!.id, invitado_autorizado_at: ahora().toISOString() })
      .eq('id', inscripcionId)
    if (error) throw error

    try {
      const r = await recalcularInscripcion(db, inscripcionId)
      if (r.antes !== 'confirmada' && r.despues === 'confirmada') await avisarInscripcionConfirmada(db, r)
      return NextResponse.json({ ok: true, estadoInscripcion: r.despues })
    } catch (err: any) {
      const claro = mensajeErrorBaseInscripcion(err.message || '')
      if (claro) return NextResponse.json({ error: claro }, { status: 400 })
      throw err
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al autorizar al invitado' }, { status: 500 })
  }
}
