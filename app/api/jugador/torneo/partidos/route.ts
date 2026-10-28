import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { inscripcionesDeJugador, listarPartidos } from '@/lib/torneoResultadosServidor'

// "Mis partidos": los partidos del torneo vigente de mis inscripciones (y
// las de los menores que represento), con rival, horario y resultado, y el
// monto fijado de cada una de esas inscripciones (SPEC §2.5).
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null, partidos: [], mias: [], inscripciones: [] })

    const mias = await inscripcionesDeJugador(db, torneo.id, session.id)
    const partidos = await listarPartidos(db, torneo.id, mias)

    const { data: menores, error: errM } = await db.from('torneo_menores').select('id').eq('representante_jugador_id', session.id)
    if (errM) throw errM
    const { data: inscripciones, error: errI } = await db
      .from('torneo_inscripciones')
      .select('id, estado, monto_eur, monto_motivo, monto_ajuste_nota, menor_nombre_publico, torneo_categorias:categoria_id!inner(nombre, torneo_id, orden)')
      .eq('torneo_categorias.torneo_id', torneo.id)
      .neq('estado', 'retirada')
      .or([`jugador1_id.eq.${session.id}`, ...(menores || []).map((m) => `menor_id.eq.${m.id}`)].join(','))
    if (errI) throw errI
    return NextResponse.json({
      ok: true,
      torneo: { id: torneo.id, nombre: torneo.nombre, estado: torneo.estado, programacion_publicada_at: (torneo as any).programacion_publicada_at ?? null },
      mias,
      partidos,
      inscripciones: (inscripciones || [])
        .sort((a: any, b: any) => a.torneo_categorias.orden - b.torneo_categorias.orden)
        .map((i: any) => ({
          id: i.id,
          categoria_nombre: i.torneo_categorias.nombre,
          menor: i.menor_nombre_publico,
          monto: { monto_eur: Number(i.monto_eur), motivo: i.monto_motivo, ajuste: i.monto_ajuste_nota },
        })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar tus partidos' }, { status: 500 })
  }
}
