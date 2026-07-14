import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { titulo, descripcion, activo } = await request.json()

    const db = supabaseServer()
    const { error } = await db
      .from('anuncio')
      .update({
        titulo: titulo?.trim() || '',
        descripcion: descripcion?.trim() || '',
        activo: !!activo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar' }, { status: 500 })
  }
}
