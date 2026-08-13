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

    const { permisoId } = await request.json()
    if (!permisoId) return NextResponse.json({ error: 'Falta el id de la solicitud' }, { status: 400 })

    const db = supabaseServer()
    const { error } = await db
      .from('permisos_medicos')
      .update({ estado: 'rechazado' })
      .eq('id', permisoId)
      .eq('estado', 'pendiente')
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al rechazar' }, { status: 500 })
  }
}
