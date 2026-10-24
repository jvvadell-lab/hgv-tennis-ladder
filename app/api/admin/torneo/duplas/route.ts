import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { armarDuplaAdmin, deshacerDuplaAdmin } from '@/lib/torneoDoblesServidor'

// Duplas de dobles armadas por el admin, solo antes del sorteo de la categoría:
//  * armar    { inscripcionIds: [a, b] }   con dos inscritos disponibles (al cierre, impares…)
//  * deshacer { equipoId }                 para cambiar la pareja de una dupla (los dos vuelven a disponible)
// Cambiar pareja = deshacer + armar. Avisa a los jugadores.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })

    if (body.accion === 'armar') {
      const ids = body.inscripcionIds
      if (!Array.isArray(ids) || ids.length !== 2 || !ids.every((i) => typeof i === 'string') || ids[0] === ids[1]) {
        return NextResponse.json({ error: 'Elige dos jugadores distintos' }, { status: 400 })
      }
      const r = await armarDuplaAdmin(db, torneo, [ids[0], ids[1]], session!.id)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      return NextResponse.json(r)
    }
    if (body.accion === 'deshacer') {
      if (typeof body.equipoId !== 'string') return NextResponse.json({ error: 'Falta la dupla' }, { status: 400 })
      const r = await deshacerDuplaAdmin(db, torneo, body.equipoId, session!.id)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      return NextResponse.json(r)
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error con la dupla' }, { status: 500 })
  }
}
