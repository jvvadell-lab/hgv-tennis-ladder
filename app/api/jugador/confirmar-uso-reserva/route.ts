import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { formatearHora } from '@/lib/tiempo'
import { DURACION_SINGLE_MIN } from '@/lib/reservas'
import { evaluarUbicacion, ubicacionValida, ventanaConfirmacion } from '@/lib/geoClub'

// "Ya llegué": el jugador confirma que está usando la cancha reservada
// (pasa a 'usada'; sigue ocupando su franja). Ventana: desde 15 min antes
// del inicio hasta el final de la reserva, con el reloj del servidor.
//
// Geolocalización (ver lib/geoClub): el cliente manda { lat, lng, accuracy }
// si pudo obtenerla. Se guarda solo la distancia al club y la precisión, en
// metros, y el método. Fase 1 (GEO_ESTRICTO = false): confirma siempre.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { reservaId, ubicacion } = await request.json()
    if (!reservaId) return NextResponse.json({ error: 'Falta el id de la reserva' }, { status: 400 })

    const db = supabaseServer()

    const { data: reserva, error: errBuscar } = await db
      .from('reservas_cancha')
      .select('id, jugador_id, fecha_hora, estado, duracion_min')
      .eq('id', reservaId)
      .maybeSingle()
    if (errBuscar) throw errBuscar
    if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
    if (reserva.jugador_id !== session.id) {
      return NextResponse.json({ error: 'Esta reserva no te pertenece' }, { status: 403 })
    }
    if (reserva.estado !== 'activa') {
      return NextResponse.json({ error: 'Esta reserva ya no está activa' }, { status: 400 })
    }

    const { desde, hasta } = ventanaConfirmacion(reserva.fecha_hora, reserva.duracion_min || DURACION_SINGLE_MIN)
    const ahora = Date.now()
    if (ahora < desde.getTime()) {
      return NextResponse.json({ error: `Todavía es temprano: puedes confirmar desde las ${formatearHora(desde)}.` }, { status: 400 })
    }
    if (ahora > hasta.getTime()) {
      return NextResponse.json({ error: `Tu reserva terminó a las ${formatearHora(hasta)}; ya no se puede confirmar la llegada.` }, { status: 400 })
    }

    const evaluacion = evaluarUbicacion(ubicacionValida(ubicacion))
    if (evaluacion.rechazo) {
      return NextResponse.json({ error: evaluacion.rechazo }, { status: 400 })
    }

    // .eq('estado', 'activa'): si se tocó dos veces, la segunda no pisa la primera.
    const { data, error } = await db
      .from('reservas_cancha')
      .update({
        estado: 'usada',
        confirmado_at: new Date(ahora).toISOString(),
        confirmacion_metodo: evaluacion.metodo,
        confirmacion_distancia_m: evaluacion.distanciaM,
        confirmacion_precision_m: evaluacion.precisionM,
      })
      .eq('id', reservaId)
      .eq('estado', 'activa')
      .select('id')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'Esta reserva ya no está activa' }, { status: 400 })

    return NextResponse.json({ ok: true, metodo: evaluacion.metodo, distanciaM: evaluacion.distanciaM })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al confirmar' }, { status: 500 })
  }
}
