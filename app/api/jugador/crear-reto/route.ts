import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

const RANGO_RETO = 3 // puedes retar hasta 3 posiciones arriba de ti — debe coincidir con ladder/page.tsx

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { temporadaId, retadoId, cancha, nombreCanchaForanea, fechaPropuesta, comentarios } = await request.json()
    if (!temporadaId || !retadoId || !cancha || !fechaPropuesta) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    if (retadoId === session.id) {
      return NextResponse.json({ error: 'No puedes retarte a ti mismo' }, { status: 400 })
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

    // El retador siempre es quien tiene la sesión — nunca lo que mande el cliente,
    // para que nadie pueda lanzar un reto haciéndose pasar por otro jugador.
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
    if (puestosEntreMedio <= 0 || puestosEntreMedio > RANGO_RETO) {
      return NextResponse.json({ error: `Solo puedes retar a jugadores hasta ${RANGO_RETO} posiciones arriba de ti` }, { status: 403 })
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
      const cincoDiasAtras = new Date()
      cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5)

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
      nombre_cancha_foranea: cancha === 'FORANEA' ? (nombreCanchaForanea || null) : null,
      fecha_propuesta: fechaPropuesta,
      comentarios: comentarios || null,
      estado: 'pendiente',
    }]).select('id').single()
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, id: nuevoReto.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al lanzar el reto' }, { status: 500 })
  }
}
