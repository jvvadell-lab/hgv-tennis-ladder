import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { pendientesInscripcion, textoPendiente } from '@/lib/torneoInscripcion'
import type { Nivel } from '@/lib/torneo'

// Pestaña Torneo del admin: torneo vigente, categorías e inscripciones con
// sus jugadores, pagos, pendientes y limitaciones de horario. La pueden ver
// los dos niveles de admin (el de pagos valida los pagos del torneo).
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null })

    const { data: categorias, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, modalidad, genero, categoria_nivel, cupo, orden')
      .eq('torneo_id', torneo.id)
      .order('orden')
    if (errCat) throw errCat
    const categoriaIds = (categorias || []).map((c) => c.id)

    const { data: inscripciones, error: errIns } = categoriaIds.length
      ? await db
          .from('torneo_inscripciones')
          .select('id, categoria_id, jugador1_id, jugador2_id, siembra, estado, inscrita_por, created_at')
          .in('categoria_id', categoriaIds)
          .order('created_at')
      : { data: [], error: null }
    if (errIns) throw errIns

    const inscripcionIds = (inscripciones || []).map((i) => i.id)
    const jugadorIds = [...new Set((inscripciones || []).flatMap((i) => [i.jugador1_id, i.jugador2_id]).filter(Boolean))] as string[]

    const [{ data: jugadores, error: errJug }, { data: pagos, error: errPag }, { data: disponibilidad, error: errDisp }] = await Promise.all([
      jugadorIds.length
        ? db.from('jugadores').select('id, nombre, genero, categoria, categoria_torneo, telefono, email').in('id', jugadorIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      inscripcionIds.length
        ? db
            .from('pagos')
            .select('id, numero_recibo, jugador_id, torneo_inscripcion_id, tipo_pago, monto, fecha, referencia, validado, tasa_bcv_eur, created_at')
            .in('torneo_inscripcion_id', inscripcionIds)
            .order('created_at')
        : Promise.resolve({ data: [] as any[], error: null }),
      db.from('torneo_disponibilidad').select('jugador_id, no_disponible, nota, updated_at').eq('torneo_id', torneo.id),
    ])
    if (errJug) throw errJug
    if (errPag) throw errPag
    if (errDisp) throw errDisp

    const jugadorPorId = new Map((jugadores || []).map((j: any) => [j.id, j]))
    const catPorId = new Map((categorias || []).map((c) => [c.id, c]))

    const filas = (inscripciones || []).map((i) => {
      const ids = [i.jugador1_id, i.jugador2_id].filter(Boolean) as string[]
      const suyos = (pagos || []).filter((p: any) => p.torneo_inscripcion_id === i.id)
      const pendientes = i.estado === 'retirada' ? [] : pendientesInscripcion({
        estado: i.estado,
        nivelCategoria: catPorId.get(i.categoria_id)!.categoria_nivel as Nivel | null,
        jugadores: ids.map((id) => ({ id, categoria_torneo: jugadorPorId.get(id)?.categoria_torneo ?? null })),
        pagos: suyos.map((p: any) => ({ jugador_id: p.jugador_id, validado: !!p.validado })),
      })
      return {
        ...i,
        jugadores: ids.map((id) => jugadorPorId.get(id)).filter(Boolean),
        pagos: suyos,
        pendientes: pendientes.map((p) => ({ ...p, texto: textoPendiente(p, jugadorPorId.get(p.jugadorId)?.nombre || '—') })),
      }
    })

    return NextResponse.json({
      ok: true,
      torneo,
      categorias: categorias || [],
      inscripciones: filas,
      disponibilidad: disponibilidad || [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el torneo' }, { status: 500 })
  }
}
