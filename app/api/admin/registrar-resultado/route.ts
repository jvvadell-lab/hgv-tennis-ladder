import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { validarSets, calcularGanador, generarMarcadores, type TipoResultado } from '@/lib/resultados'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { retoId, noPresentadoId, sets, tipoResultado, jugadorRetiradoId, nota, fotoUrl } = await request.json()
    if (!retoId) {
      return NextResponse.json({ error: 'Falta el partido' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retador_id, retado_id, estado')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })

    const { data: resultadoExistente, error: errExistente } = await db
      .from('resultados')
      .select('id')
      .eq('reto_id', retoId)
      .maybeSingle()
    if (errExistente) throw errExistente
    if (resultadoExistente) {
      return NextResponse.json({ error: 'Este partido ya tiene un resultado cargado' }, { status: 400 })
    }

    let payload: {
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
      // Igual que hoy: quien no se presentó pierde por walkover — sin sets.
      if (noPresentadoId !== reto.retador_id && noPresentadoId !== reto.retado_id) {
        return NextResponse.json({ error: 'Ese jugador no pertenece a este partido' }, { status: 400 })
      }
      const ganadorId = noPresentadoId === reto.retador_id ? reto.retado_id : reto.retador_id
      payload = {
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
      if (!sets || !tipoResultado) {
        return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
      }
      if (tipoResultado !== 'normal' && tipoResultado !== 'retiro') {
        return NextResponse.json({ error: 'Tipo de resultado inválido' }, { status: 400 })
      }

      const errorSets = validarSets(sets, tipoResultado as TipoResultado)
      if (errorSets) return NextResponse.json({ error: errorSets }, { status: 400 })

      let ganadorId: string
      let jugadorRetiradoFinal: string | null = null

      if (tipoResultado === 'retiro') {
        if (jugadorRetiradoId !== reto.retador_id && jugadorRetiradoId !== reto.retado_id) {
          return NextResponse.json({ error: 'El jugador retirado debe ser uno de los dos jugadores del partido' }, { status: 400 })
        }
        // Igual que en el endpoint del jugador: el ganador de un retiro se
        // calcula SIEMPRE en el servidor, nunca se toma del cliente.
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
      payload = {
        ganador_id: ganadorId,
        marcador_retador: marcadorRetador,
        marcador_retado: marcadorRetado,
        sets,
        tipo_resultado: tipoResultado,
        jugador_retirado_id: jugadorRetiradoFinal,
        nota: nota?.trim() || null,
        no_presentado: false,
      }
    }

    // Si el reto no estaba aceptado (ej: quedó rechazado pero sí se jugó), lo
    // dejamos como aceptado para que el resto del flujo (aprobar, ranking) funcione normal.
    if (reto.estado !== 'aceptado') {
      const { error: errEstado } = await db.from('retos').update({ estado: 'aceptado' }).eq('id', reto.id)
      if (errEstado) throw errEstado
    }

    const { data: nuevoResultado, error: errInsert } = await db.from('resultados').insert([{
      reto_id: retoId,
      ganador_id: payload.ganador_id,
      marcador_retador: payload.marcador_retador,
      marcador_retado: payload.marcador_retado,
      sets: payload.sets,
      tipo_resultado: payload.tipo_resultado,
      jugador_retirado_id: payload.jugador_retirado_id,
      nota: payload.nota,
      foto_url: fotoUrl || null,
      no_presentado: payload.no_presentado,
      validado: false,
    }]).select('id').single()
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, id: nuevoResultado.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar el resultado' }, { status: 500 })
  }
}
