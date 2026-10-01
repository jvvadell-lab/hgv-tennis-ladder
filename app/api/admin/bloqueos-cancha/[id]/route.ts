import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Elimina un bloqueo de cancha — solo admin completo. Solo reabre la franja
// para lo nuevo: no restaura nada que se haya anulado o movido por él.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { id } = await params
    const db = supabaseServer()
    const { data, error } = await db.from('bloqueos_cancha').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'Ese bloqueo ya no existe' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar el bloqueo' }, { status: 500 })
  }
}
