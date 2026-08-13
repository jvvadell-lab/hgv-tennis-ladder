import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

function fechaVenezuelaHoy(): string {
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { permisoId } = await request.json()
    if (!permisoId) return NextResponse.json({ error: 'Falta el id del permiso' }, { status: 400 })

    const db = supabaseServer()
    const { data: permiso, error: errBuscar } = await db
      .from('permisos_medicos')
      .select('id, estado')
      .eq('id', permisoId)
      .maybeSingle()
    if (errBuscar) throw errBuscar
    if (!permiso) return NextResponse.json({ error: 'Permiso no encontrado' }, { status: 404 })
    if (permiso.estado !== 'aprobado') {
      return NextResponse.json({ error: 'Este permiso no está activo.' }, { status: 400 })
    }

    // Adelantamos la fecha de fin a ayer — así el jugador queda libre de inmediato
    // (no tocamos días/fecha_inicio, quedan como registro histórico de lo aprobado).
    const ayer = new Date(fechaVenezuelaHoy() + 'T00:00:00')
    ayer.setDate(ayer.getDate() - 1)

    const { error } = await db
      .from('permisos_medicos')
      .update({ fecha_fin: ayer.toISOString().slice(0, 10) })
      .eq('id', permisoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al desactivar' }, { status: 500 })
  }
}
