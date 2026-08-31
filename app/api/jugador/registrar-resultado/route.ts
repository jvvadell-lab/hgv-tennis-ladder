import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { validarSets, calcularGanador, generarMarcadores, type TipoResultado } from '@/lib/resultados'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { retoId, noPresentadoId, sets, tipoResultado, jugadorRetiradoId, nota, fotoUrl } = await request.json()
    if (!retoId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    if (!noPresentadoId && (!sets || !tipoResultado)) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    if (tipoResultado && tipoResultado !== 'normal' && tipoResultado !== 'retiro') {
      return NextResponse.json({ error: 'Tipo de resultado inválido' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retador_id, retado_id, estado')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })
    if (session.id !== reto.retador_id && session.id !== reto.retado_id) {
      return NextResponse.json({ error: 'Este partido no te pertenece' }, { status: 403 })
    }
    if (reto.estado !== 'aceptado') {
      return NextResponse.json({ error: 'Este reto no está en un estado que permita cargar resultado' }, { status: 400 })
    }

    const { data: resultadoExistente, error: errExistente } = await db
      .from('resultados')
      .select('id')
      .eq('reto_id', retoId)
      .maybeSingle()
    if (errExistente) throw errExistente
    if (resultadoExistente) {
      return NextResponse.json({ error: 'Este partido ya tiene un resultado cargado' }, { status: 400 })
    }

    let insertPayload: {
      ganador_id: string
      marcador_retador: string
      marcador_retado: string
      sets: unknown | null
      tipo_resultado: TipoResultado
      jugador_retirado_id: string | null
      nota: string | null
      no_presentado: boolean
    }

    if (noPresentadoId) {
      // Igual que el ingreso directo del admin: quien no se presentó pierde por walkover.
      if (noPresentadoId !== reto.retador_id && noPresentadoId !== reto.retado_id) {
        return NextResponse.json({ error: 'Ese jugador no pertenece a este partido' }, { status: 400 })
      }
      const ganadorId = noPresentadoId === reto.retador_id ? reto.retado_id : reto.retador_id
      insertPayload = {
        ganador_id: ganadorId,
        marcador_retador: noPresentadoId === reto.retador_id ? 'No presentado' : 'W.O.',
        marcador_retado: noPresentadoId === reto.retado_id ? 'No presentado' : 'W.O.',
        sets: null,
        tipo_resultado: 'normal',
        jugador_retirado_id: null,
        nota: null,
        no_presentado: true,
      }
    } else {
      const errorSets = validarSets(sets, tipoResultado as TipoResultado)
      if (errorSets) return NextResponse.json({ error: errorSets }, { status: 400 })

      let ganadorId: string
      let jugadorRetiradoFinal: string | null = null

      if (tipoResultado === 'retiro') {
        if (jugadorRetiradoId !== reto.retador_id && jugadorRetiradoId !== reto.retado_id) {
          return NextResponse.json({ error: 'El jugador retirado debe ser uno de los dos jugadores del partido' }, { status: 400 })
        }
        // El ganador de un retiro se calcula SIEMPRE en el servidor como el
        // otro jugador — nunca se toma de un valor que mande el cliente.
        ganadorId = jugadorRetiradoId === reto.retador_id ? reto.retado_id : reto.retador_id
        jugadorRetiradoFinal = jugadorRetiradoId
      } else {
        const ganadorCalculado = calcularGanador(sets, reto.retador_id, reto.retado_id)
        if (!ganadorCalculado) {
          return NextResponse.json({ error: 'No se pudo determinar un ganador con ese marcador' }, { status: 400 })
        }
        ganadorId = ganadorCalculado
      }

      const { marcadorRetador, marcadorRetado } = generarMarcadores(sets, tipoResultado as TipoResultado)
      insertPayload = {
        ganador_id: ganadorId,
        marcador_retador: marcadorRetador,
        marcador_retado: marcadorRetado,
        sets,
        tipo_resultado: tipoResultado as TipoResultado,
        jugador_retirado_id: jugadorRetiradoFinal,
        nota: nota?.trim() || null,
        no_presentado: false,
      }
    }

    const { data: nuevoResultado, error: errInsert } = await db.from('resultados').insert([{
      reto_id: retoId,
      ganador_id: insertPayload.ganador_id,
      marcador_retador: insertPayload.marcador_retador,
      marcador_retado: insertPayload.marcador_retado,
      sets: insertPayload.sets,
      tipo_resultado: insertPayload.tipo_resultado,
      jugador_retirado_id: insertPayload.jugador_retirado_id,
      nota: insertPayload.nota,
      foto_url: fotoUrl || null,
      no_presentado: insertPayload.no_presentado,
      validado: false,
    }]).select('id').single()
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, id: nuevoResultado.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar el resultado' }, { status: 500 })
  }
}
