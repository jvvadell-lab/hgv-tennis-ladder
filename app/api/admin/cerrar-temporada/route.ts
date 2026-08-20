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

    const { temporadaId, force } = await request.json()
    if (!temporadaId) return NextResponse.json({ error: 'Falta el id de la temporada' }, { status: 400 })

    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id, sorteo_realizado')
      .eq('id', temporadaId)
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada) return NextResponse.json({ error: 'Temporada no encontrada' }, { status: 404 })

    if (!temporada.sorteo_realizado && !force) {
      const { count } = await db
        .from('ladder_posiciones')
        .select('id', { count: 'exact', head: true })
        .eq('temporada_id', temporadaId)
      if ((count || 0) > 0) {
        return NextResponse.json({
          error: `Esta temporada tiene ${count} jugador(es) anotado(s) pero el sorteo nunca se hizo — si la cierras así, quedará en el historial sin ranking. Haz el sorteo primero, o confirma de nuevo para cerrarla igual.`,
          requiereConfirmacion: true,
        }, { status: 400 })
      }
    }

    const { error } = await db.from('temporadas').update({ estado: 'finalizada' }).eq('id', temporadaId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cerrar la temporada' }, { status: 500 })
  }
}
