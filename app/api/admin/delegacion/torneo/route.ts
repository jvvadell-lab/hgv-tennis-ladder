import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { camposTorneo } from '@/lib/delegacion'

// Crear un torneo externo — solo admin completo (el admin "solo pagos"
// registra pagos, pero no cambia torneos ni montos de inscripción).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador completo puede crear torneos' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const res = camposTorneo(body, true)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })

    const db = supabaseServer()
    const { data, error } = await db.from('torneos_externos').insert([res.campos]).select('*').single()
    if (error) throw error

    return NextResponse.json({ ok: true, torneo: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al crear el torneo' }, { status: 500 })
  }
}
