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
    if (!temporadaId) return NextResponse.json({ error: 'Falta el id de la temporada' }, { status: 400 })

    const db = supabaseServer()

    // Borramos en orden, de lo más dependiente a lo menos, para respetar las llaves foráneas.
    const { data: retosTemp } = await db.from('retos').select('id').eq('temporada_id', temporadaId)
    const retoIds = (retosTemp || []).map((r: any) => r.id)

    if (retoIds.length > 0) {
      const { error: errResultados } = await db.from('resultados').delete().in('reto_id', retoIds)
      if (errResultados) throw errResultados
    }

    const { error: errRetos } = await db.from('retos').delete().eq('temporada_id', temporadaId)
    if (errRetos) throw errRetos

    const { error: errPosiciones } = await db.from('ladder_posiciones').delete().eq('temporada_id', temporadaId)
    if (errPosiciones) throw errPosiciones

    const { error: errRecordatorios } = await db.from('recordatorios_pago').delete().eq('temporada_id', temporadaId)
    if (errRecordatorios) throw errRecordatorios

    const { error: errPagos } = await db.from('pagos').delete().eq('temporada_id', temporadaId)
    if (errPagos) throw errPagos

    const { error: errTemporada } = await db.from('temporadas').delete().eq('id', temporadaId)
    if (errTemporada) throw errTemporada

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar la temporada' }, { status: 500 })
  }
}
