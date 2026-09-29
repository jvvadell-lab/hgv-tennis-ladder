import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { camposTorneo } from '@/lib/delegacion'

// Editar un torneo externo (nombre, sede, fechas, monto referencial,
// activo) — solo admin completo, igual que crearlo.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador completo puede editar torneos' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const res = camposTorneo(body, false)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
    if (!Object.keys(res.campos).length) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 })

    const db = supabaseServer()
    const { data: actual, error: actualError } = await db
      .from('torneos_externos')
      .select('fecha_inicio, fecha_fin')
      .eq('id', id)
      .maybeSingle()
    if (actualError) throw actualError
    if (!actual) return NextResponse.json({ error: 'El torneo no existe' }, { status: 404 })

    const inicio = 'fecha_inicio' in res.campos ? res.campos.fecha_inicio : actual.fecha_inicio
    const fin = 'fecha_fin' in res.campos ? res.campos.fecha_fin : actual.fecha_fin
    if (inicio && fin && fin < inicio) {
      return NextResponse.json({ error: 'La fecha de fin no puede ser antes del inicio' }, { status: 400 })
    }

    const { data, error } = await db.from('torneos_externos').update(res.campos).eq('id', id).select('*').single()
    if (error) throw error

    return NextResponse.json({ ok: true, torneo: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al editar el torneo' }, { status: 500 })
  }
}
