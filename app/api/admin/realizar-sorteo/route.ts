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

    const { temporadaId } = await request.json()
    if (!temporadaId) {
      return NextResponse.json({ error: 'Falta el id de la temporada' }, { status: 400 })
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

    const { data: anotados, error: errAnotados } = await db
      .from('ladder_posiciones')
      .select('jugador_id, categoria, genero')
      .eq('temporada_id', temporadaId)
    if (errAnotados) throw errAnotados

    if (!anotados || anotados.length === 0) {
      return NextResponse.json({ error: 'Todavía no hay jugadores anotados a esta temporada.' }, { status: 400 })
    }

    // Solo entran al sorteo los que además tienen al menos un pago registrado
    // en esta temporada, Y su membresía ya fue verificada por un admin —
    // estar anotado no es suficiente por sí solo.
    const { data: pagosTemp, error: errPagos } = await db
      .from('pagos')
      .select('jugador_id')
      .eq('temporada_id', temporadaId)
    if (errPagos) throw errPagos

    const jugadorIds = anotados.map((j: any) => j.jugador_id)
    const { data: jugadoresInfo, error: errJugadores } = await db
      .from('jugadores')
      .select('id, estado_verificacion')
      .in('id', jugadorIds)
    if (errJugadores) throw errJugadores

    const verificados = new Set(
      (jugadoresInfo || []).filter((j: any) => j.estado_verificacion === 'verificado').map((j: any) => j.id)
    )
    const pagaron = new Set((pagosTemp || []).map((p: any) => p.jugador_id))
    const elegibles = anotados.filter((j: any) => pagaron.has(j.jugador_id) && verificados.has(j.jugador_id))
    const excluidos = anotados.length - elegibles.length

    if (elegibles.length === 0) {
      return NextResponse.json({ error: 'Ninguno de los jugadores anotados cumple los dos requisitos (pago registrado y membresía verificada). Revísalos antes de sortear.' }, { status: 400 })
    }

    const { error: errDelete } = await db.from('ladder_posiciones').delete().eq('temporada_id', temporadaId)
    if (errDelete) throw errDelete

    const grupos: Record<string, any[]> = {}
    elegibles.forEach((j: any) => {
      const key = `${j.categoria}__${j.genero}`
      if (!grupos[key]) grupos[key] = []
      grupos[key].push(j)
    })

    const filas: any[] = []
    Object.entries(grupos).forEach(([key, lista]) => {
      const [categoria, genero] = key.split('__')
      const mezclado = [...lista]
      for (let i = mezclado.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[mezclado[i], mezclado[j]] = [mezclado[j], mezclado[i]]
      }
      mezclado.forEach((jugador, idx) => {
        filas.push({
          temporada_id: temporadaId,
          jugador_id: jugador.jugador_id,
          categoria,
          genero,
          posicion: idx + 1,
          posicion_inicial: idx + 1,
        })
      })
    })

    const { error: errInsert } = await db.from('ladder_posiciones').insert(filas)
    if (errInsert) throw errInsert

    const { error: errUpdateTemp } = await db.from('temporadas').update({ sorteo_realizado: true }).eq('id', temporadaId)
    if (errUpdateTemp) throw errUpdateTemp

    return NextResponse.json({ ok: true, count: filas.length, excluidos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al sortear' }, { status: 500 })
  }
}
