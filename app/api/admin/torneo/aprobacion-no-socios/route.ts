import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Activa o quita, por categoría de dobles, la aprobación previa del admin
// para las invitaciones a no socios. Solo afecta a las invitaciones nuevas.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { categoriaId, activa } = await request.json().catch(() => ({}))
    if (typeof categoriaId !== 'string' || !categoriaId) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })
    if (typeof activa !== 'boolean') return NextResponse.json({ error: 'Falta indicar si se activa' }, { status: 400 })

    const db = supabaseServer()
    const { data, error } = await db
      .from('torneo_categorias')
      .update({ invitar_no_socios_con_aprobacion: activa })
      .eq('id', categoriaId)
      .eq('modalidad', 'doble')
      .is('sorteo_publicado_at', null)
      .select('id')
    if (error) throw error
    if (!(data || []).length) return NextResponse.json({ error: 'Solo en categorías de dobles sin sortear' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cambiar la aprobación' }, { status: 500 })
  }
}
