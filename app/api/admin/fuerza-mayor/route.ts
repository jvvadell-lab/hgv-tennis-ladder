import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { activar } = await request.json()
    const db = supabaseServer()

    const hoy = new Date().toISOString().slice(0, 10)
    const { error } = await db
      .from('fuerza_mayor')
      .update({ activo: !!activar, fecha: activar ? hoy : null, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) throw error

    return NextResponse.json({ ok: true, activo: !!activar, fecha: activar ? hoy : null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: 500 })
  }
}
