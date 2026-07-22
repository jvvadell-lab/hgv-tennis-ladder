import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

const ESTADOS_VALIDOS = ['pendiente', 'verificado', 'no_permitido']

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { jugadorId, estado } = await request.json()
    if (!jugadorId || !ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const db = supabaseServer()
    const { error } = await db
      .from('jugadores')
      .update({
        estado_verificacion: estado,
        verificado_por: session.id,
        verificado_at: new Date().toISOString(),
      })
      .eq('id', jugadorId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: 500 })
  }
}
