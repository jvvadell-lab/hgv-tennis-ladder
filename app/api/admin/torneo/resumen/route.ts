import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { resumenTorneo } from '@/lib/torneoResumenServidor'

// Contadores de la pestaña Torneo (los dos niveles de admin): se piden al
// cargar y otra vez después de cada acción, sin recargar la página.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, resumen: null })
    return NextResponse.json({ ok: true, resumen: await resumenTorneo(db, torneo) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el resumen' }, { status: 500 })
  }
}
