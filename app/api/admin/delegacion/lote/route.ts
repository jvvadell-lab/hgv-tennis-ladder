import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { mensajeErrorPostgres, textoOpcional } from '@/lib/delegacion'

// "Enviar a fábrica": crea un lote con TODAS las prendas pendientes de
// pagos validados y no anulados (atómico, vía crear_lote_uniforme).
// Admin completo o "solo pagos".
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))

    const db = supabaseServer()
    const { data, error } = await db.rpc('crear_lote_uniforme', {
      p_enviado_por: session.id,
      p_notas: textoOpcional(body?.notas),
    })
    if (error) {
      const status = error.code === 'P0002' ? 409 : 400
      return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status })
    }

    return NextResponse.json({ ok: true, lote: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al crear el lote' }, { status: 500 })
  }
}
