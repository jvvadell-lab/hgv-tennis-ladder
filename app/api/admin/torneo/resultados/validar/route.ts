import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { validarResultado } from '@/lib/torneoResultadosServidor'

// Valida el resultado reportado por un jugador y corre el avance automático
// (tabla del grupo → llave; ganador → partido siguiente). SPEC §5 y §8.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    const { partidoId } = await request.json()
    if (typeof partidoId !== 'string' || !partidoId) return NextResponse.json({ error: 'Falta el partido' }, { status: 400 })

    const r = await validarResultado(supabaseServer(), { partidoId, adminId: session!.id })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, avisos: r.avisos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al validar el resultado' }, { status: 500 })
  }
}
