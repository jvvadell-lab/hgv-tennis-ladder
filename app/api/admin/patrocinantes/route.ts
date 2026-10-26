import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { validarPatrocinante } from '@/lib/patrocinantes'

// Patrocinantes de la portada — solo admin completo.
//  GET    → todos (activos e inactivos), por orden
//  POST   → crear ({ ...datos }) o editar ({ id, ...datos })
//  DELETE → ?id=… elimina el registro (el logo queda en Storage)

async function exigirAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 }) }
  }
  if (!esAdminCompleto(session)) {
    return { error: NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 }) }
  }
  return { session }
}

export async function GET() {
  try {
    const { error } = await exigirAdmin()
    if (error) return error
    const { data, error: errDb } = await supabaseServer()
      .from('patrocinantes')
      .select('id, nombre, logo_url, instagram, enlace_url, promo, nivel, fondo, orden, activo')
      .order('orden')
      .order('created_at')
    if (errDb) throw errDb
    return NextResponse.json({ ok: true, patrocinantes: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar los patrocinantes' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { session, error } = await exigirAdmin()
    if (error) return error
    const body = await request.json()
    const v = validarPatrocinante(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const db = supabaseServer()
    const fila = { ...v.datos, actualizado_por: session.id, updated_at: new Date().toISOString() }
    const consulta = typeof body?.id === 'string' && body.id
      ? db.from('patrocinantes').update(fila).eq('id', body.id).select('id').maybeSingle()
      : db.from('patrocinantes').insert(fila).select('id').single()
    const { data, error: errDb } = await consulta
    if (errDb) throw errDb
    if (!data) return NextResponse.json({ error: 'Ese patrocinante ya no existe' }, { status: 404 })
    return NextResponse.json({ ok: true, id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { error } = await exigirAdmin()
    if (error) return error
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
    const { error: errDb } = await supabaseServer().from('patrocinantes').delete().eq('id', id)
    if (errDb) throw errDb
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar' }, { status: 500 })
  }
}
