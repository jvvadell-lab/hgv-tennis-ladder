import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { METODOS_SORTEO, type MetodoSorteo } from '@/lib/torneoSorteo'
import { publicarSorteo } from '@/lib/torneoSorteoServidor'

// Publica el sorteo de UNA categoría que el admin vio en la vista previa
// (SPEC §3). Vuelve a validar los grupos contra sus equipos activos de ahora
// (hayan pagado o no), regenera los partidos en el servidor (no confía en los
// del navegador) y escribe todo en una transacción con
// torneo_publicar_sorteo_categoria: cierra las inscripciones de la categoría,
// registra quién lo publicó y cuándo y, si era la última, pasa el torneo a
// 'sorteado'.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { categoriaId, metodo, grupos } = await request.json()
    if (typeof categoriaId !== 'string') return NextResponse.json({ error: 'Elige la categoría' }, { status: 400 })
    if (!(METODOS_SORTEO as readonly string[]).includes(metodo)) {
      return NextResponse.json({ error: 'Método de sorteo no válido' }, { status: 400 })
    }
    if (!Array.isArray(grupos)) return NextResponse.json({ error: 'Falta el sorteo a publicar' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['borrador', 'inscripcion'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'El sorteo ya se hizo' }, { status: 400 })
    }

    const r = await publicarSorteo(db, torneo, categoriaId, metodo as MetodoSorteo, grupos, session!.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true, torneoSorteado: r.torneoSorteado })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al publicar el sorteo' }, { status: 500 })
  }
}
