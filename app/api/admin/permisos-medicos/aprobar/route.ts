import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Venezuela es UTC-4 fijo — usamos esto para que "hoy" no dependa de en qué
// zona horaria corra el servidor.
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

    const { permisoId, dias } = await request.json()
    const diasNum = Number(dias)
    if (!permisoId) return NextResponse.json({ error: 'Falta el id de la solicitud' }, { status: 400 })
    if (!Number.isInteger(diasNum) || diasNum < 1) {
      return NextResponse.json({ error: 'Escribe una cantidad de días válida' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: permiso, error: errBuscar } = await db
      .from('permisos_medicos')
      .select('id, estado')
      .eq('id', permisoId)
      .maybeSingle()
    if (errBuscar) throw errBuscar
    if (!permiso) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    if (permiso.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Esta solicitud ya fue resuelta.' }, { status: 400 })
    }

    const fechaInicio = fechaVenezuelaHoy()
    const fechaFin = new Date(fechaInicio + 'T00:00:00')
    fechaFin.setDate(fechaFin.getDate() + diasNum - 1)

    const { error } = await db
      .from('permisos_medicos')
      .update({
        estado: 'aprobado',
        dias: diasNum,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin.toISOString().slice(0, 10),
      })
      .eq('id', permisoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al aprobar' }, { status: 500 })
  }
}
