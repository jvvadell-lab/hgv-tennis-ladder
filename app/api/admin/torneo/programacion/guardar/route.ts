import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { guardarProgramacion } from '@/lib/torneoProgramacionServidor'

// Guarda horarios (la propuesta del asistente o una asignación a mano) o
// los quita (cancha e inicio null). La revisión (errores / avisos con
// forzar) y la transacción están en guardarProgramacion.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })

    const { asignaciones, forzar } = await request.json()
    if (!Array.isArray(asignaciones) || !asignaciones.length) return NextResponse.json({ error: 'No hay horarios para guardar' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })

    const r = await guardarProgramacion(db, torneo, asignaciones, !!forzar, session!.id)
    if (!r.ok) {
      const { ok: _ok, status, ...cuerpo } = r
      return NextResponse.json(cuerpo, { status })
    }
    return NextResponse.json({ ok: true, guardados: r.guardados, avisos: r.avisos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la programación' }, { status: 500 })
  }
}
