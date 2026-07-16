import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { calcularTrayectoria } from '@/lib/trayectoria'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const db = supabaseServer()
    const trayectoria = await calcularTrayectoria(db, session.id)

    return NextResponse.json({ ok: true, trayectoria })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al consultar tu trayectoria' }, { status: 500 })
  }
}
