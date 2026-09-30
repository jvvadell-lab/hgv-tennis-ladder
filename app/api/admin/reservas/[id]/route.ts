import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// PATCH { accion } sobre una reserva de cancha — solo admin completo.
//   'marcar_usada'     -> el jugador sí usó la cancha y olvidó "Ya llegué":
//                         pasa a 'usada' con confirmacion_metodo = 'admin'.
//   'quitar_penalidad' -> no sabemos si se usó, pero no debe castigar: sigue
//                         'activa' (sin confirmar) y crear-reserva la ignora
//                         al calcular los 5 días de penalidad.
// Ambas solo para reservas 'activa' cuya hora ya empezó.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador completo puede hacer esto' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    const accion = body?.accion
    if (accion !== 'marcar_usada' && accion !== 'quitar_penalidad') {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data: reserva, error: errBuscar } = await db
      .from('reservas_cancha')
      .select('id, estado, fecha_hora, penalidad_anulada_at')
      .eq('id', id)
      .maybeSingle()
    if (errBuscar) throw errBuscar
    if (!reserva) return NextResponse.json({ error: 'La reserva no existe' }, { status: 404 })
    if (reserva.estado !== 'activa') {
      return NextResponse.json({ error: `Esta reserva está '${reserva.estado}'; solo se corrigen reservas sin confirmar` }, { status: 409 })
    }
    if (new Date(reserva.fecha_hora).getTime() > Date.now()) {
      return NextResponse.json({ error: 'Esta reserva todavía no empieza' }, { status: 409 })
    }

    const ahora = new Date().toISOString()
    const cambios = accion === 'marcar_usada'
      ? { estado: 'usada', confirmado_at: ahora, confirmacion_metodo: 'admin', confirmado_por: session.id }
      : reserva.penalidad_anulada_at
        ? null
        : { penalidad_anulada_at: ahora, penalidad_anulada_por: session.id }
    if (!cambios) return NextResponse.json({ error: 'Esta reserva ya no tenía penalidad' }, { status: 409 })

    const { data, error } = await db.from('reservas_cancha').update(cambios).eq('id', id).eq('estado', 'activa').select('id')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'La reserva cambió mientras tanto; recarga la lista' }, { status: 409 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string } | null)?.message || 'Error al actualizar la reserva' }, { status: 500 })
  }
}
