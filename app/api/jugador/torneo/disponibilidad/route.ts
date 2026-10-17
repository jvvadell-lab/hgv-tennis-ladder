import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { normalizarDisponibilidad } from '@/lib/torneoInscripcion'

// Guarda las limitaciones de horario del jugador con sesión para el torneo
// vigente: celdas día × franja en las que NO puede jugar + nota libre.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { noDisponible, nota } = await request.json()
    const normalizada = normalizarDisponibilidad(noDisponible, nota)
    if ('error' in normalizada) return NextResponse.json({ error: normalizada.error }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo abierto' }, { status: 400 })
    if (torneo.estado === 'borrador') {
      return NextResponse.json({ error: 'Las inscripciones del torneo todavía no están abiertas' }, { status: 400 })
    }

    const { error } = await db.from('torneo_disponibilidad').upsert(
      {
        torneo_id: torneo.id,
        jugador_id: session.id,
        no_disponible: normalizada.no_disponible,
        nota: normalizada.nota,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'torneo_id,jugador_id' }
    )
    if (error) throw error

    return NextResponse.json({ ok: true, ...normalizada })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar tus limitaciones de horario' }, { status: 500 })
  }
}
