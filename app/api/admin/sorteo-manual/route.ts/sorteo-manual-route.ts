import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { temporadaId, asignaciones } = await request.json()
    if (!temporadaId || !Array.isArray(asignaciones) || asignaciones.length === 0) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id, sorteo_realizado')
      .eq('id', temporadaId)
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada) return NextResponse.json({ error: 'Temporada no encontrada' }, { status: 404 })
    if (temporada.sorteo_realizado) {
      return NextResponse.json({ error: 'El sorteo de esta temporada ya se realizó y no puede repetirse.' }, { status: 400 })
    }

    const { data: posicionesActuales, error: errPos } = await db
      .from('ladder_posiciones')
      .select('id, jugador_id, categoria, genero')
      .eq('temporada_id', temporadaId)
    if (errPos) throw errPos
    if (!posicionesActuales || posicionesActuales.length === 0) {
      return NextResponse.json({ error: 'No hay jugadores anotados en esta temporada.' }, { status: 400 })
    }

    const mapaJugador: Record<string, { id: string; categoria: string; genero: string }> = {}
    posicionesActuales.forEach((p: any) => { mapaJugador[p.jugador_id] = p })

    // Validar que llegó exactamente una asignación por cada jugador anotado —
    // ni de más ni de menos — antes de tocar nada en la base de datos.
    const idsEnviados = new Set(asignaciones.map((a: any) => a.jugadorId))
    const idsEsperados = new Set(Object.keys(mapaJugador))
    if (idsEnviados.size !== idsEsperados.size || [...idsEsperados].some((id) => !idsEnviados.has(id))) {
      return NextResponse.json({ error: 'Faltan jugadores por asignar, o hay alguno que no corresponde a esta temporada.' }, { status: 400 })
    }

    // Validar que, dentro de cada categoría/género, las posiciones sean exactamente 1..N sin repetir.
    const grupos: Record<string, number[]> = {}
    for (const a of asignaciones) {
      const jugador = mapaJugador[a.jugadorId]
      if (!jugador) return NextResponse.json({ error: 'Hay un jugador que no pertenece a esta temporada.' }, { status: 400 })
      const posicion = Number(a.posicion)
      if (!Number.isInteger(posicion) || posicion < 1) {
        return NextResponse.json({ error: `Posición inválida para uno de los jugadores.` }, { status: 400 })
      }
      const key = `${jugador.categoria}__${jugador.genero}`
      if (!grupos[key]) grupos[key] = []
      grupos[key].push(posicion)
    }
    for (const key of Object.keys(grupos)) {
      const posiciones = grupos[key].sort((x, y) => x - y)
      const n = posiciones.length
      for (let i = 0; i < n; i++) {
        if (posiciones[i] !== i + 1) {
          return NextResponse.json({ error: `Las posiciones de "${key.replace('__', ' — ')}" deben ser exactamente 1 a ${n}, sin repetir ni saltar ninguna.` }, { status: 400 })
        }
      }
    }

    // Todo válido — guardamos posicion y posicion_inicial (el resultado real del sorteo en vivo).
    for (const a of asignaciones) {
      const jugador = mapaJugador[a.jugadorId]
      const posicion = Number(a.posicion)
      const { error: errUpdate } = await db
        .from('ladder_posiciones')
        .update({ posicion, posicion_inicial: posicion })
        .eq('id', jugador.id)
      if (errUpdate) throw errUpdate
    }

    const { error: errTempUpdate } = await db
      .from('temporadas')
      .update({ sorteo_realizado: true })
      .eq('id', temporadaId)
    if (errTempUpdate) throw errTempUpdate

    return NextResponse.json({ ok: true, count: asignaciones.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar el sorteo manual' }, { status: 500 })
  }
}
