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

    const { temporadaId, pausar } = await request.json()
    if (!temporadaId) {
      return NextResponse.json({ error: 'Falta la temporada' }, { status: 400 })
    }

    const db = supabaseServer()
    const { error } = await db
      .from('temporadas')
      .update(
        pausar
          ? { cooldown_pausado: true, cooldown_pausado_por: session.id, cooldown_pausado_at: new Date().toISOString() }
          : { cooldown_pausado: false, cooldown_pausado_por: null, cooldown_pausado_at: null }
      )
      .eq('id', temporadaId)
    if (error) throw error

    return NextResponse.json({ ok: true, cooldown_pausado: !!pausar })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: 500 })
  }
}
