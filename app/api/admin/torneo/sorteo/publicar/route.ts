import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { METODOS_SORTEO, type MetodoSorteo } from '@/lib/torneoSorteo'
import { publicarSorteo } from '@/lib/torneoSorteoServidor'

// Publica el sorteo que el admin vio en la vista previa (SPEC §3). Vuelve a
// validar los grupos contra las inscripciones vivas de ahora (hayan pagado
// o no; con las inscripciones abiertas o cerradas),
// regenera los partidos en el servidor (no confía en los del navegador) y
// escribe todo en una transacción con torneo_publicar_sorteo, que también
// pasa el torneo a 'sorteado' y registra quién lo publicó y cuándo.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { metodo, grupos } = await request.json()
    if (!(METODOS_SORTEO as readonly string[]).includes(metodo)) {
      return NextResponse.json({ error: 'Método de sorteo no válido' }, { status: 400 })
    }
    if (!grupos || typeof grupos !== 'object') return NextResponse.json({ error: 'Falta el sorteo a publicar' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['borrador', 'inscripcion'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'El sorteo ya se hizo' }, { status: 400 })
    }

    const r = await publicarSorteo(db, torneo, metodo as MetodoSorteo, grupos, session!.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al publicar el sorteo' }, { status: 500 })
  }
}
