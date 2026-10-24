import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { desempatesPendientes, fijarDesempate, fijarDesempatePrimeros } from '@/lib/torneoResultadosServidor'

// Desempates que esperan al admin (SPEC §7.4 y §3):
//  * GET  → los pendientes: puestos empatados en todo dentro de un grupo, y
//           primeros empatados en todo con la llave de 3 grupos.
//  * POST { grupoId, orden: equipoIds } o { categoriaId, orden: letras }
//         → fija el orden (de mejor a peor) y corre el avance automático.
export async function GET() {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, pendientes: [] })
    return NextResponse.json({ ok: true, pendientes: await desempatesPendientes(db, torneo.id) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar los desempates' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    const { grupoId, categoriaId, orden } = await request.json().catch(() => ({}))
    if (!Array.isArray(orden) || orden.some((x) => typeof x !== 'string')) return NextResponse.json({ error: 'Orden no válido' }, { status: 400 })
    const db = supabaseServer()
    const r = typeof grupoId === 'string'
      ? await fijarDesempate(db, { grupoId, orden, adminId: session!.id })
      : typeof categoriaId === 'string'
        ? await fijarDesempatePrimeros(db, { categoriaId, orden, adminId: session!.id })
        : { ok: false as const, error: 'Falta el grupo o la categoría', status: 400 }
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, avisos: r.avisos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al fijar el desempate' }, { status: 500 })
  }
}
