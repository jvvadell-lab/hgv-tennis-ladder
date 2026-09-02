import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { resultadoId } = await request.json()
    if (!resultadoId) return NextResponse.json({ error: 'Falta el id del resultado' }, { status: 400 })

    const db = supabaseServer()
    // La foto vive como campo foto_url dentro de "resultados" — no hay tabla de galería aparte.
    // La quitamos poniendo foto_url en null; el resultado y el marcador quedan intactos.
    const { error } = await db.from('resultados').update({ foto_url: null }).eq('id', resultadoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar la foto' }, { status: 500 })
  }
}
