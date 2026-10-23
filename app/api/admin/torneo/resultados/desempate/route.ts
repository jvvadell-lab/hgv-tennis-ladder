import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { fijarDesempate } from '@/lib/torneoResultadosServidor'

// Desempate manual de un grupo (SPEC §7.4): orden = ids de inscripción de
// mejor a peor entre las que siguen empatadas. Corre el avance automático.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    const { grupoId, orden } = await request.json()
    if (typeof grupoId !== 'string' || !grupoId) return NextResponse.json({ error: 'Falta el grupo' }, { status: 400 })
    if (!Array.isArray(orden) || orden.some((id) => typeof id !== 'string')) return NextResponse.json({ error: 'Orden no válido' }, { status: 400 })

    const r = await fijarDesempate(supabaseServer(), { grupoId, orden, adminId: session!.id })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, avisos: r.avisos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al fijar el desempate' }, { status: 500 })
  }
}
