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

    const { jugadorId } = await request.json()
    if (!jugadorId) {
      return NextResponse.json({ error: 'Falta el id del jugador' }, { status: 400 })
    }

    const db = supabaseServer()

    // Si el jugador ya tiene historial (fue ganador de algún resultado, participó
    // en retos, o tiene posiciones en algún escalafón), no lo dejamos borrar —
    // se perdería el rastro de esos partidos. Mejor sugerir desactivarlo.
    const [{ count: comoGanador }, { count: comoRetador }, { count: comoRetado }, { count: enEscalafon }] = await Promise.all([
      db.from('resultados').select('id', { count: 'exact', head: true }).eq('ganador_id', jugadorId),
      db.from('retos').select('id', { count: 'exact', head: true }).eq('retador_id', jugadorId),
      db.from('retos').select('id', { count: 'exact', head: true }).eq('retado_id', jugadorId),
      db.from('ladder_posiciones').select('id', { count: 'exact', head: true }).eq('jugador_id', jugadorId),
    ])

    const tieneHistorial = (comoGanador || 0) > 0 || (comoRetador || 0) > 0 || (comoRetado || 0) > 0 || (enEscalafon || 0) > 0
    if (tieneHistorial) {
      return NextResponse.json({
        error: 'Este jugador ya tiene partidos o escalafones asociados — no se puede eliminar sin perder ese historial. En su lugar, edítalo y márcalo como "Activo: No".',
      }, { status: 400 })
    }

    const { error } = await db.from('jugadores').delete().eq('id', jugadorId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar' }, { status: 500 })
  }
}
