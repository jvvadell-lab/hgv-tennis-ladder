import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// PATCH { accion: 'recibir' } — el lote llegó del proveedor; desde aquí sus
// prendas ya se pueden entregar. Admin completo o "solo pagos".
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (body?.accion !== 'recibir') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })

    const db = supabaseServer()
    // .eq('estado', 'en_fabrica'): un lote ya recibido no se vuelve a marcar
    // (conserva su fecha de recepción original).
    const { data, error } = await db
      .from('lotes_uniforme')
      .update({ estado: 'recibido', recibido_at: new Date().toISOString() })
      .eq('id', id)
      .eq('estado', 'en_fabrica')
      .select('numero')
    if (error) throw error
    if (!data?.length) {
      const { data: existe } = await db.from('lotes_uniforme').select('estado').eq('id', id).maybeSingle()
      if (!existe) return NextResponse.json({ error: 'El lote no existe' }, { status: 404 })
      return NextResponse.json({ error: 'Este lote ya estaba marcado como recibido' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al marcar el lote como recibido' }, { status: 500 })
  }
}
