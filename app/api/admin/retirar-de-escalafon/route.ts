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

    const { posicionId } = await request.json()
    if (!posicionId) return NextResponse.json({ error: 'Falta el id de la posición' }, { status: 400 })

    const db = supabaseServer()

    const { data: posicion, error: errPos } = await db
      .from('ladder_posiciones')
      .select('id, temporada_id, jugador_id, jugadores(nombre)')
      .eq('id', posicionId)
      .maybeSingle()
    if (errPos) throw errPos
    if (!posicion) return NextResponse.json({ error: 'No se encontró esa posición en el escalafón' }, { status: 404 })

    const nombre = (posicion.jugadores as any)?.nombre || 'El jugador'

    // No lo dejamos retirar si tiene un reto pendiente o aceptado en esta temporada —
    // primero hay que cancelar ese reto (pestaña Desafíos) para no dejarlo huérfano.
    const { data: retosActivos, error: errRetos } = await db
      .from('retos')
      .select('id')
      .eq('temporada_id', posicion.temporada_id)
      .in('estado', ['pendiente', 'aceptado'])
      .or(`retador_id.eq.${posicion.jugador_id},retado_id.eq.${posicion.jugador_id}`)
    if (errRetos) throw errRetos
    if (retosActivos && retosActivos.length > 0) {
      return NextResponse.json({ error: `${nombre} tiene un reto pendiente o en curso en esta temporada — cancélalo primero desde la pestaña Desafíos.` }, { status: 400 })
    }

    // El borrado y el renumerado de los que quedan detrás van en una sola transacción
    // (la función es atómica por statement) para que un fallo a mitad de camino no deje
    // el escalafón con una renumeración parcial — ver
    // supabase/migrations/20260903000000_retirar_de_escalafon_renumera.sql
    const { data: resultado, error: errRetirar } = await db.rpc('retirar_de_escalafon', {
      p_posicion_id: posicionId,
    })
    if (errRetirar) {
      console.error('[retirar-de-escalafon] falló el borrado+renumerado', {
        posicionId,
        temporadaId: posicion.temporada_id,
        jugadorId: posicion.jugador_id,
        error: errRetirar,
      })
      throw errRetirar
    }

    console.log('[retirar-de-escalafon] ok', { posicionId, ...resultado })

    return NextResponse.json({ ok: true, nombre })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al retirar del escalafón' }, { status: 500 })
  }
}
