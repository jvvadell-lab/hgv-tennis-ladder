import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 })
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ preinscripciones: [] })
    const { data: categorias, error: errCategorias } = await db.from('torneo_categorias').select('id, nombre').eq('torneo_id', torneo.id)
    if (errCategorias) throw errCategorias
    const ids = (categorias || []).map(c => c.id)
    if (!ids.length) return NextResponse.json({ preinscripciones: [] })
    const { data, error } = await db.from('torneo_preinscripciones_admin')
      .select('id, categoria_id, nombre_menor, nombre_representante, telefono_representante, estado, created_at')
      .in('categoria_id', ids).eq('estado', 'pendiente_documentacion').order('created_at')
    if (error) throw error
    const nombres = new Map((categorias || []).map(c => [c.id, c.nombre]))
    return NextResponse.json({ preinscripciones: (data || []).map(p => ({ ...p, categoria: nombres.get(p.categoria_id) || 'Sin categoría' })) })
  } catch (error) {
    console.error('Error leyendo preinscripciones administrativas', error)
    return NextResponse.json({ error: 'No se pudieron cargar las preinscripciones' }, { status: 500 })
  }
}
