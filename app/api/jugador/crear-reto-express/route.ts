import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora, sumarDiasEnCaracas } from '@/lib/tiempo'
import {
  RANGO_RETO_EXPRESS, ESCALERA_EXPRESS_HORARIOS, ESCALERA_EXPRESS_CANCHAS,
  ventanaExpressAbierta, instanteCupoExpress,
} from '@/lib/escaleraExpress'

// Crea un reto de Escalera Express: horario y cancha fijos (elegidos de una lista
// cerrada, no un datetime libre), rango ampliado a 5 posiciones, y siempre para
// jugarse el sábado 12 de septiembre de 2026. Ver lib/escaleraExpress.ts para el
// resto de las reglas del evento. Endpoint separado de crear-reto/route.ts porque
// las reglas de validación son bastante distintas (horario fijo vs. libre, rango 5
// vs. 3) y esto es temporal — se puede borrar entero después del evento.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { temporadaId, retadoId, cancha, horario } = await request.json()
    if (!temporadaId || !retadoId || !cancha || !horario) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    if (retadoId === session.id) {
      return NextResponse.json({ error: 'No puedes retarte a ti mismo' }, { status: 400 })
    }
    if (!(ESCALERA_EXPRESS_CANCHAS as readonly string[]).includes(cancha)) {
      return NextResponse.json({ error: 'Cancha inválida' }, { status: 400 })
    }
    if (!ESCALERA_EXPRESS_HORARIOS.includes(horario)) {
      return NextResponse.json({ error: 'Horario inválido' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id, estado, sorteo_realizado')
      .eq('id', temporadaId)
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada || temporada.estado !== 'activa') {
      return NextResponse.json({ error: 'Esta temporada no está activa' }, { status: 400 })
    }
    if (!temporada.sorteo_realizado) {
      return NextResponse.json({ error: 'El sorteo de esta temporada todavía no se ha realizado' }, { status: 400 })
    }

    // Contamos los cupos ya ocupados (pendientes o aceptados) para saber si la
    // ventana sigue abierta, y de paso si el cupo pedido ya lo tomó otro jugador.
    const { data: retosExpressActivos, error: errActivos } = await db
      .from('retos')
      .select('fecha_propuesta, cancha')
      .eq('temporada_id', temporadaId)
      .eq('escalera_express', true)
      .in('estado', ['pendiente', 'aceptado'])
    if (errActivos) throw errActivos

    if (!ventanaExpressAbierta(ahora(), (retosExpressActivos || []).length)) {
      return NextResponse.json({
        error: 'La ventana de Escalera Express está cerrada — ya no se pueden crear nuevos retos de este evento.',
      }, { status: 403 })
    }

    const fechaPropuesta = instanteCupoExpress(horario)
    const cupoTomado = (retosExpressActivos || []).some((r: any) =>
      r.cancha === cancha && new Date(r.fecha_propuesta).getTime() === fechaPropuesta.getTime()
    )
    if (cupoTomado) {
      return NextResponse.json({ error: 'Ese horario y cancha ya fue tomado por otro jugador — elige otro cupo.' }, { status: 400 })
    }

    // El retador siempre es quien tiene la sesión — nunca lo que mande el cliente.
    const { data: posiciones, error: errPos } = await db
      .from('ladder_posiciones')
      .select('jugador_id, categoria, genero, posicion')
      .eq('temporada_id', temporadaId)
      .in('jugador_id', [session.id, retadoId])
    if (errPos) throw errPos

    const yo = (posiciones || []).find((p: any) => p.jugador_id === session.id)
    const rival = (posiciones || []).find((p: any) => p.jugador_id === retadoId)

    if (!yo) {
      return NextResponse.json({ error: 'No estás inscrito en el escalafón de esta temporada' }, { status: 403 })
    }
    if (!rival) {
      return NextResponse.json({ error: 'Ese jugador no está inscrito en el escalafón de esta temporada' }, { status: 403 })
    }
    if (yo.categoria !== rival.categoria || yo.genero !== rival.genero) {
      return NextResponse.json({ error: 'Solo puedes retar a jugadores de tu misma categoría y género' }, { status: 403 })
    }

    const puestosEntreMedio = yo.posicion - rival.posicion
    if (puestosEntreMedio <= 0 || puestosEntreMedio > RANGO_RETO_EXPRESS) {
      return NextResponse.json({ error: `Durante Escalera Express solo puedes retar a jugadores hasta ${RANGO_RETO_EXPRESS} posiciones arriba de ti` }, { status: 403 })
    }

    const { data: existentes, error: errCheck } = await db
      .from('retos')
      .select('id, retador_id, retado_id')
      .eq('temporada_id', temporadaId)
      .in('estado', ['pendiente', 'aceptado'])
      .or(`retador_id.eq.${session.id},retado_id.eq.${session.id},retador_id.eq.${retadoId},retado_id.eq.${retadoId}`)
    if (errCheck) throw errCheck
    if (existentes && existentes.length > 0) {
      const involucraAlRival = existentes.some((r: any) => r.retador_id === retadoId || r.retado_id === retadoId)
      return NextResponse.json({
        error: involucraAlRival
          ? 'Ese jugador ya tiene un reto pendiente o en curso con otra persona.'
          : 'Ya tienes un reto pendiente o un partido en curso — no puedes lanzar otro.',
      }, { status: 400 })
    }

    // Enfriamiento: si el rival me ganó hace menos de 5 días, no puedo retarlo de nuevo.
    const { data: retosPrevios } = await db
      .from('retos')
      .select('id')
      .eq('temporada_id', temporadaId)
      .or(`and(retador_id.eq.${session.id},retado_id.eq.${retadoId}),and(retador_id.eq.${retadoId},retado_id.eq.${session.id})`)

    const idsRetosPrevios = (retosPrevios || []).map((r: any) => r.id)
    if (idsRetosPrevios.length > 0) {
      const cincoDiasAtras = sumarDiasEnCaracas(ahora(), -5)

      const { data: resultadoReciente } = await db
        .from('resultados')
        .select('ganador_id, validado_at')
        .in('reto_id', idsRetosPrevios)
        .eq('validado', true)
        .eq('ganador_id', retadoId)
        .gte('validado_at', cincoDiasAtras.toISOString())
        .order('validado_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (resultadoReciente) {
        return NextResponse.json({ error: 'Este jugador te ganó recientemente — todavía no puedes retarlo de nuevo.' }, { status: 400 })
      }
    }

    const { data: nuevoReto, error: errInsert } = await db.from('retos').insert([{
      temporada_id: temporadaId,
      retador_id: session.id,
      retado_id: retadoId,
      cancha,
      fecha_propuesta: fechaPropuesta.toISOString(),
      estado: 'pendiente',
      escalera_express: true,
    }]).select('id').single()
    if (errInsert) {
      if (errInsert.message?.includes('RETO_JUGADOR_OCUPADO')) {
        return NextResponse.json({
          error: 'Ya tienes un reto pendiente o un partido en curso — no puedes lanzar otro.',
        }, { status: 400 })
      }
      // Índice único ux_retos_escalera_express_slot: alguien más tomó ese cupo
      // en el instante entre nuestra verificación y el insert.
      if (errInsert.code === '23505') {
        return NextResponse.json({ error: 'Ese horario y cancha ya fue tomado por otro jugador — elige otro cupo.' }, { status: 400 })
      }
      throw errInsert
    }

    const { error: errNotif } = await db.from('notificaciones').insert([{
      jugador_id: retadoId,
      tipo: 'reto_recibido',
      reto_id: nuevoReto.id,
      mensaje: `${session.nombre} te ha retado a un partido de Escalera Express`,
    }])
    if (errNotif) console.error('[crear-reto-express] Error al crear notificación:', errNotif)

    const { data: retadoInfo, error: errRetadoInfo } = await db
      .from('jugadores')
      .select('nombre, telefono')
      .eq('id', retadoId)
      .maybeSingle()
    if (errRetadoInfo) console.error('[crear-reto-express] Error al obtener datos del retado:', errRetadoInfo)

    return NextResponse.json({
      ok: true,
      id: nuevoReto.id,
      reto: { id: nuevoReto.id, fecha_propuesta: fechaPropuesta.toISOString() },
      retado: {
        nombre: retadoInfo?.nombre ?? null,
        telefono: retadoInfo?.telefono || null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al lanzar el reto de Escalera Express' }, { status: 500 })
  }
}
