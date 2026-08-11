import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { resultadoId, fotoUrl } = await request.json()
    if (!resultadoId || !fotoUrl) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const db = supabaseServer()
    const { error } = await db.from('resultados').update({ foto_url: fotoUrl }).eq('id', resultadoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la foto' }, { status: 500 })
  }
}
