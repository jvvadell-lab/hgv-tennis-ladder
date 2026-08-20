import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import {
  DURACION_SINGLE_MIN, DURACION_RETO_MIN, PENALIDAD_NO_PRESENTADO_DIAS,
  seSolapan, horaValidaParaCancha, fechaAlInicioDelDia, duracionParaTipoJuego,
} from '@/lib/reservas'

const CANCHAS_VALIDAS = ['HGV1', 'HGV2']

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { cancha, tipoJuego, fechaHora } = await request.json()
    if (!cancha || !tipoJuego || !fechaHora) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    if (!CANCHAS_VALIDAS.includes(cancha)) {
      return NextResponse.json({ error: 'Cancha inválida' }, { status: 400 })
    }
    if (tipoJuego !== 'single' && tipoJuego !== 'doble') {
      return NextResponse.json({ error: 'Modalidad inválida' }, { status: 400 })
    }

    const nuevaHora = new Date(fechaHora)
    if (isNaN(nuevaHora.getTime())) {
      return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
    }
    const nuevaHoraMs = nuevaHora.getTime()
    const ahoraMs = Date.now()
    const duracionMin = duracionParaTipoJuego(tipoJuego)

    if (nuevaHoraMs < ahoraMs) {
      return NextResponse.json({ error: 'Ese horario ya pasó. Elige otro.' }, { status: 400 })
    }

    // Solo se puede reservar para hoy, o (solo HGV2) para la mañana de mañana
    // — así no se puede colar una reserva para cualquier día futuro.
    const inicioHoy = fechaAlInicioDelDia(new Date())
    const inicioManana = new Date(inicioHoy); inicioManana.setDate(inicioManana.getDate() + 1)
    const diaSolicitado = fechaAlInicioDelDia(nuevaHora)
    const esHoy = diaSolicitado.getTime() === inicioHoy.getTime()
    const esMananaHGV2 = cancha === 'HGV2' && diaSolicitado.getTime() === inicioManana.getTime()
    if (!esHoy && !esMananaHGV2) {
      return NextResponse.json({ error: 'Solo puedes reservar para hoy (o, en HGV 2, para la mañana de mañana).' }, { status: 400 })
    }

    if (!horaValidaParaCancha(cancha, nuevaHora, duracionMin)) {
      return NextResponse.json({ error: 'Ese horario está fuera del horario de apertura de esta cancha.' }, { status: 400 })
    }

    const db = supabaseServer()

    // Traemos las reservas recientes del jugador (últimos días + próximas), para
    // revisar tanto si tiene una sin resolver, como si le toca esperar alguna penalidad.
    const desdeVentana = new Date(ahoraMs - (PENALIDAD_NO_PRESENTADO_DIAS + 1) * 24 * 60 * 60 * 1000)
    const { data: misReservasRecientes, error: errMisReservas } = await db
      .from('reservas_cancha')
      .select('id, cancha, fecha_hora, estado, duracion_min')
      .eq('jugador_id', session.id)
      .in('estado', ['activa', 'usada'])
      .gte('fecha_hora', desdeVentana.toISOString())
    if (errMisReservas) throw errMisReservas

    // 1) ¿Tiene una reserva sin resolver todavía (activa y su hora no ha pasado)?
    const conReservaActiva = (misReservasRecientes || []).find((r: any) => {
      if (r.estado !== 'activa') return false
      return new Date(r.fecha_hora).getTime() > ahoraMs
    })
    if (conReservaActiva) {
      const fmt = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      return NextResponse.json({
        error: `Ya tienes una reserva activa (${conReservaActiva.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'} a las ${fmt(new Date(conReservaActiva.fecha_hora))}) — no puedes tener más de una a la vez.`,
      }, { status: 400 })
    }

    // 2) Penalidad por NO PRESENTARSE (quedó activa sin cancelar y ya pasó su hora) — 5 días
    const noPresentados = (misReservasRecientes || []).filter((r: any) => {
      const yaPaso = new Date(r.fecha_hora).getTime() <= ahoraMs
      return r.estado === 'activa' && yaPaso
    })
    if (noPresentados.length > 0) {
      const ultimaMs = Math.max(...noPresentados.map((r: any) => new Date(r.fecha_hora).getTime()))
      const disponibleDesde = ultimaMs + PENALIDAD_NO_PRESENTADO_DIAS * 24 * 60 * 60 * 1000
      if (ahoraMs < disponibleDesde) {
        const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
        return NextResponse.json({
          error: `Por no presentarte a tu última reserva, puedes volver a reservar a partir del ${fmt(new Date(disponibleDesde))} (${PENALIDAD_NO_PRESENTADO_DIAS} días después).`,
        }, { status: 400 })
      }
    }

    // 3) Uso normal de la cancha — "día por medio": si jugaste un día, el
    // siguiente día queda bloqueado, pero el de después ya está disponible.
    const usadas = (misReservasRecientes || []).filter((r: any) => r.estado === 'usada')
    if (usadas.length > 0) {
      const fechaUsoMasReciente = new Date(Math.max(...usadas.map((r: any) => new Date(r.fecha_hora).getTime())))
      const diaUso = fechaAlInicioDelDia(fechaUsoMasReciente)
      const diaBloqueado = new Date(diaUso); diaBloqueado.setDate(diaBloqueado.getDate() + 1)
      if (diaSolicitado.getTime() === diaBloqueado.getTime()) {
        const disponibleDesde = new Date(diaBloqueado); disponibleDesde.setDate(disponibleDesde.getDate() + 1)
        const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
        return NextResponse.json({
          error: `Jugaste el ${fmt(diaUso)} — las reservas son día por medio, así que recién puedes volver a reservar a partir del ${fmt(disponibleDesde)}.`,
        }, { status: 400 })
      }
    }

    const inicioDia = fechaAlInicioDelDia(nuevaHora)
    const finDia = new Date(inicioDia); finDia.setHours(23, 59, 59, 999)

    // No debe chocar con partidos de la escalera (bloquean 1h30) en esa cancha ese día
    const { data: retosDia, error: errRetos } = await db
      .from('retos')
      .select('id, fecha_propuesta')
      .eq('cancha', cancha)
      .in('estado', ['pendiente', 'aceptado'])
      .gte('fecha_propuesta', inicioDia.toISOString())
      .lte('fecha_propuesta', finDia.toISOString())
    if (errRetos) throw errRetos

    const conflictoReto = (retosDia || []).find((r: any) =>
      seSolapan(nuevaHoraMs, duracionMin, new Date(r.fecha_propuesta).getTime(), DURACION_RETO_MIN)
    )
    if (conflictoReto) {
      const inicioOcupado = new Date(conflictoReto.fecha_propuesta)
      const finOcupado = new Date(inicioOcupado.getTime() + DURACION_RETO_MIN * 60000)
      const fmt = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      return NextResponse.json({
        error: `Esa cancha tiene un partido de la escalera a las ${fmt(inicioOcupado)} — ocupada hasta las ${fmt(finOcupado)}. Elige otro horario.`,
      }, { status: 400 })
    }

    // No debe chocar con otras reservas casuales en esa cancha ese día
    const { data: reservasDia, error: errReservas } = await db
      .from('reservas_cancha')
      .select('id, fecha_hora, duracion_min')
      .eq('cancha', cancha)
      .eq('estado', 'activa')
      .gte('fecha_hora', inicioDia.toISOString())
      .lte('fecha_hora', finDia.toISOString())
    if (errReservas) throw errReservas

    const conflictoReserva = (reservasDia || []).find((r: any) =>
      seSolapan(nuevaHoraMs, duracionMin, new Date(r.fecha_hora).getTime(), r.duracion_min || DURACION_SINGLE_MIN)
    )
    if (conflictoReserva) {
      const inicioOcupado = new Date(conflictoReserva.fecha_hora)
      const finOcupado = new Date(inicioOcupado.getTime() + (conflictoReserva.duracion_min || DURACION_SINGLE_MIN) * 60000)
      const fmt = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      return NextResponse.json({
        error: `Esa cancha ya está reservada a las ${fmt(inicioOcupado)} — ocupada hasta las ${fmt(finOcupado)}. Elige otro horario.`,
      }, { status: 400 })
    }

    const { data: nuevaReserva, error: errInsert } = await db.from('reservas_cancha').insert([{
      jugador_id: session.id,
      cancha,
      fecha_hora: nuevaHora.toISOString(),
      estado: 'activa',
      tipo_juego: tipoJuego,
      duracion_min: duracionMin,
    }]).select('id').single()
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, id: nuevaReserva.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al reservar' }, { status: 500 })
  }
}
