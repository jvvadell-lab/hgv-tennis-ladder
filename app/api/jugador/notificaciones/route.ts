import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Campana del jugador: sus 20 notificaciones más recientes y cuántas no ha
// leído. Antes se leían con la clave anónima filtrando en el navegador, así
// que cualquiera podía leer las de todos; ahora salen de la sesión.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const db = supabaseServer()
    const [{ count, error: errC }, { data: recientes, error: errR }] = await Promise.all([
      db.from('notificaciones').select('id', { count: 'exact', head: true })
        .eq('jugador_id', session.id).eq('leido', false),
      db.from('notificaciones').select('id, tipo, reto_id, mensaje, leido, created_at')
        .eq('jugador_id', session.id).order('created_at', { ascending: false }).limit(20),
    ])
    if (errC) throw errC
    if (errR) throw errR

    return NextResponse.json({ ok: true, noLeidas: count || 0, recientes: recientes || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar las notificaciones' }, { status: 500 })
  }
}
