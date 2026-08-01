import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { valor, fecha } = await request.json()
    const valorNumerico = Number(valor)
    if (!valor || isNaN(valorNumerico) || valorNumerico <= 0) {
      return NextResponse.json({ error: 'Escribe un valor de tasa válido' }, { status: 400 })
    }
    if (!fecha) {
      return NextResponse.json({ error: 'Falta la fecha de la tasa' }, { status: 400 })
    }

    const db = supabaseServer()
    // Tabla de una sola fila (id fijo = 1) — cada guardado sobrescribe la tasa anterior.
    const { error } = await db
      .from('tasa_bcv')
      .upsert({ id: 1, valor: valorNumerico, fecha, updated_at: new Date().toISOString() })
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la tasa' }, { status: 500 })
  }
}
