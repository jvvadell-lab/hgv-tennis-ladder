import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { inscripcionesDeJugador, listarPartidos } from '@/lib/torneoResultadosServidor'

// "Mis partidos": los partidos del torneo vigente de mis inscripciones (y
// las de los menores que represento), con rival, horario y resultado.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null, partidos: [], mias: [] })

    const mias = await inscripcionesDeJugador(db, torneo.id, session.id)
    const partidos = await listarPartidos(db, torneo.id, mias)
    return NextResponse.json({
      ok: true,
      torneo: { id: torneo.id, nombre: torneo.nombre, estado: torneo.estado, programacion_publicada_at: (torneo as any).programacion_publicada_at ?? null },
      mias,
      partidos,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar tus partidos' }, { status: 500 })
  }
}
