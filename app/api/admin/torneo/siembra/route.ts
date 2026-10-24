import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Siembra y bombo de un equipo para el sorteo (SPEC §3): la dupla en dobles,
// la inscripción en single e infantil. Solo antes del sorteo de su
// categoría. null borra el valor. Dos equipos activos de la misma categoría
// no pueden tener la misma siembra (índice único en la base).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { equipoId, siembra, bombo } = await request.json()
    if (typeof equipoId !== 'string' || !equipoId) return NextResponse.json({ error: 'Falta el equipo' }, { status: 400 })
    const entero = (v: unknown, max: number) => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max)
    if (!entero(siembra, 99)) return NextResponse.json({ error: 'La siembra tiene que ser un número entero desde 1' }, { status: 400 })
    if (!entero(bombo, 26)) return NextResponse.json({ error: 'El bombo tiene que ser un número entero del 1 al 26' }, { status: 400 })

    const db = supabaseServer()
    const { data: equipo, error: errE } = await db
      .from('torneo_equipos')
      .select('id, estado, torneo_categorias:categoria_id(sorteo_publicado_at, torneos:torneo_id(estado))')
      .eq('id', equipoId)
      .maybeSingle()
    if (errE) throw errE
    if (!equipo) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })
    if (equipo.estado !== 'activo') return NextResponse.json({ error: 'La dupla ya no está activa' }, { status: 400 })
    const cat = equipo.torneo_categorias as any
    if (cat?.sorteo_publicado_at || !['borrador', 'inscripcion'].includes(cat?.torneos?.estado)) {
      return NextResponse.json({ error: 'El sorteo ya se publicó: la siembra y los bombos quedan fijos' }, { status: 400 })
    }

    const { error } = await db.from('torneo_equipos').update({ siembra, bombo }).eq('id', equipoId)
    if (error) {
      if (error.message.includes('torneo_equipos_siembra_unica')) {
        return NextResponse.json({ error: `Otra dupla o inscripción de la categoría ya tiene la siembra ${siembra}` }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la siembra' }, { status: 500 })
  }
}
