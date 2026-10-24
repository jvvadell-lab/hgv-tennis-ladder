import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { registrarWO } from '@/lib/torneoResultadosServidor'

// WO (SPEC §6): ausente = id de la inscripción que no se presentó, o
// 'ambos' para doble WO. Queda validado y corre el avance automático.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    const { partidoId, ausente } = await request.json()
    if (typeof partidoId !== 'string' || !partidoId) return NextResponse.json({ error: 'Falta el partido' }, { status: 400 })
    if (typeof ausente !== 'string' || !ausente) return NextResponse.json({ error: 'Indica quién no se presentó' }, { status: 400 })

    const r = await registrarWO(supabaseServer(), { partidoId, ausente, adminId: session!.id })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, avisos: r.avisos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al registrar el WO' }, { status: 500 })
  }
}
