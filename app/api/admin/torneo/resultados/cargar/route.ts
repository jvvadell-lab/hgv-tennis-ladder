import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { cargarYValidar } from '@/lib/torneoResultadosServidor'

// El admin carga el resultado de un partido y lo valida de una vez (por
// ejemplo, si nadie lo reportó). Corre el avance automático.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    const { partidoId, sets, tipoResultado, retiradaInscripcionId } = await request.json()
    if (typeof partidoId !== 'string' || !partidoId) return NextResponse.json({ error: 'Falta el partido' }, { status: 400 })

    const r = await cargarYValidar(supabaseServer(), {
      partidoId,
      adminId: session!.id,
      datos: { sets, tipoResultado, retiradaInscripcionId: retiradaInscripcionId ?? null },
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, avisos: r.avisos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el resultado' }, { status: 500 })
  }
}
