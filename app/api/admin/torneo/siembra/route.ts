import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Siembra y bombo de una inscripción para el sorteo (SPEC §3). Solo antes
// del sorteo. null borra el valor. Dos inscripciones vivas de la misma
// categoría no pueden tener la misma siembra (índice único en la base).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { inscripcionId, siembra, bombo } = await request.json()
    if (typeof inscripcionId !== 'string' || !inscripcionId) return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })
    const entero = (v: unknown, max: number) => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max)
    if (!entero(siembra, 99)) return NextResponse.json({ error: 'La siembra tiene que ser un número entero desde 1' }, { status: 400 })
    if (!entero(bombo, 26)) return NextResponse.json({ error: 'El bombo tiene que ser un número entero del 1 al 26' }, { status: 400 })

    const db = supabaseServer()
    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, torneo_categorias:categoria_id(torneos:torneo_id(estado))')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    if (!ins) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'La inscripción está retirada' }, { status: 400 })
    const estadoTorneo = (ins.torneo_categorias as any)?.torneos?.estado
    if (!['borrador', 'inscripcion'].includes(estadoTorneo)) {
      return NextResponse.json({ error: 'El sorteo ya se publicó: la siembra y los bombos quedan fijos' }, { status: 400 })
    }

    const { error } = await db.from('torneo_inscripciones').update({ siembra, bombo }).eq('id', inscripcionId)
    if (error) {
      if (error.message.includes('torneo_inscripciones_siembra_unica')) {
        return NextResponse.json({ error: `Otra inscripción de la categoría ya tiene la siembra ${siembra}` }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la siembra' }, { status: 500 })
  }
}
