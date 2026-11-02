import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { armarDuplaAdmin, armarDuplaAdminConJugadores, candidatosArmarDuplaAdmin, deshacerDuplaAdmin } from '@/lib/torneoDoblesServidor'

// Duplas de dobles armadas por el admin, solo antes del sorteo de la categoría:
//  * armar    { inscripcionIds: [a, b] }   con dos inscritos disponibles (al cierre, impares…)
//  * deshacer { equipoId }                 para cambiar la pareja de una dupla (los dos vuelven a disponible)
//  * armar_jugadores { categoriaId, jugadorIds: [a, b] }  con cualquier jugador del club: inscribe a los
//    que falten (inscrita_por_admin), arma la dupla y, si hay un invitado, cuenta como su autorización
// Cambiar pareja = deshacer + armar. Avisa a los jugadores.
// GET ?categoriaId= : jugadores que se pueden elegir para armar_jugadores.
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const categoriaId = new URL(request.url).searchParams.get('categoriaId')
    if (!categoriaId) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    const r = await candidatosArmarDuplaAdmin(db, torneo, categoriaId)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar los jugadores' }, { status: 500 })
  }
}

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
    if (body.accion === 'armar_jugadores') {
      const ids = body.jugadorIds
      if (typeof body.categoriaId !== 'string' || !Array.isArray(ids) || ids.length !== 2 || !ids.every((i) => typeof i === 'string') || ids[0] === ids[1]) {
        return NextResponse.json({ error: 'Elige la categoría y dos jugadores distintos' }, { status: 400 })
      }
      const r = await armarDuplaAdminConJugadores(db, torneo, body.categoriaId, [ids[0], ids[1]], session!.id)
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
