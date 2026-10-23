import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { reportarResultado } from '@/lib/torneoResultadosServidor'

// Un jugador del partido (o el representante de un menor) reporta el
// resultado (SPEC §5). Queda por validar hasta que lo confirme el admin.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }
    const { partidoId, sets, tipoResultado, retiradaInscripcionId } = await request.json()
    if (typeof partidoId !== 'string' || !partidoId) return NextResponse.json({ error: 'Falta el partido' }, { status: 400 })

    const r = await reportarResultado(supabaseServer(), {
      partidoId,
      porJugadorId: session.id,
      datos: { sets, tipoResultado, retiradaInscripcionId: retiradaInscripcionId ?? null },
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al reportar el resultado' }, { status: 500 })
  }
}
