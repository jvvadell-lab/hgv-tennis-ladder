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

    const { temporadaId, jugadorId } = await request.json()
    if (!temporadaId || !jugadorId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: jugador, error: errJugador } = await db
      .from('jugadores')
      .select('id, nombre, categoria, genero, estado_verificacion')
      .eq('id', jugadorId)
      .maybeSingle()
    if (errJugador) throw errJugador
    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })

    if (jugador.estado_verificacion !== 'verificado') {
      return NextResponse.json({ error: `${jugador.nombre} todavía no tiene su membresía verificada — revísalo primero en la pestaña Jugadores.` }, { status: 400 })
    }

    const { data: yaAnotado } = await db
      .from('ladder_posiciones')
      .select('id')
      .eq('temporada_id', temporadaId)
      .eq('jugador_id', jugadorId)
      .maybeSingle()
    if (yaAnotado) {
      return NextResponse.json({ error: `${jugador.nombre} ya está en el escalafón de esta temporada.` }, { status: 400 })
    }

    // Mismo requisito que el sorteo: sin pago registrado en esta temporada, no entra.
    const { data: pago } = await db
      .from('pagos')
      .select('id')
      .eq('temporada_id', temporadaId)
      .eq('jugador_id', jugadorId)
      .maybeSingle()
    if (!pago) {
      return NextResponse.json({ error: `${jugador.nombre} todavía no tiene un pago registrado en esta temporada — regístralo primero en la pestaña Pagos.` }, { status: 400 })
    }

    const { count } = await db
      .from('ladder_posiciones')
      .select('id', { count: 'exact', head: true })
      .eq('temporada_id', temporadaId)
      .eq('categoria', jugador.categoria)
      .eq('genero', jugador.genero)

    const nuevaPosicion = (count || 0) + 1

    const { error: errInsert } = await db.from('ladder_posiciones').insert([{
      temporada_id: temporadaId,
      jugador_id: jugador.id,
      categoria: jugador.categoria,
      genero: jugador.genero,
      posicion: nuevaPosicion,
      posicion_inicial: nuevaPosicion,
    }])
    if (errInsert) throw errInsert

    return NextResponse.json({ ok: true, nombre: jugador.nombre })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al agregar' }, { status: 500 })
  }
}
