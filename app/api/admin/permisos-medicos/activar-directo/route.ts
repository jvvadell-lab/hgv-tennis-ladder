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

    const { jugadorId, dias, motivo } = await request.json()
    const diasNum = Number(dias)
    if (!jugadorId) return NextResponse.json({ error: 'Falta el jugador' }, { status: 400 })
    if (!Number.isInteger(diasNum) || diasNum < 1) {
      return NextResponse.json({ error: 'Escribe una cantidad de días válida' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id')
      .eq('estado', 'activa')
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada) return NextResponse.json({ error: 'No hay una temporada activa' }, { status: 400 })

    const fechaInicio = fechaVenezuelaHoy()
    const fechaFin = new Date(fechaInicio + 'T00:00:00')
    fechaFin.setDate(fechaFin.getDate() + diasNum - 1)

    const { error } = await db.from('permisos_medicos').insert([{
      jugador_id: jugadorId,
      temporada_id: temporada.id,
      dias: diasNum,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin.toISOString().slice(0, 10),
      motivo: motivo || null,
      estado: 'aprobado',
      creado_por: 'admin',
    }])
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al activar' }, { status: 500 })
  }
}
