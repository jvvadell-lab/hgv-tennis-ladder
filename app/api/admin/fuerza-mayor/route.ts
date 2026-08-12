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

    const { activar } = await request.json()
    const db = supabaseServer()

    // Venezuela es UTC-4 todo el año (sin horario de verano) — calculamos la fecha
    // así en vez de con new Date().toISOString() para que no se adelante un día
    // apenas pasan las 8:00pm hora local (cuando en UTC ya es el día siguiente).
    const hoy = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { error } = await db
      .from('fuerza_mayor')
      .update({ activo: !!activar, fecha: activar ? hoy : null, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) throw error

    return NextResponse.json({ ok: true, activo: !!activar, fecha: activar ? hoy : null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: 500 })
  }
}
