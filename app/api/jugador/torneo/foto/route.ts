import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { guardarFotoPartido } from '@/lib/torneoFotosServidor'

// Un jugador del partido (o el representante de un menor) agrega o cambia su
// foto (SPEC §17).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }
    const form = await request.formData()
    const partidoId = form.get('partidoId')
    const archivo = form.get('foto')
    if (typeof partidoId !== 'string' || !partidoId || !(archivo instanceof File)) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    const r = await guardarFotoPartido(supabaseServer(), { partidoId, archivo, autor: { id: session.id, rol: 'jugador' } })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, fotoUrl: r.fotoUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la foto' }, { status: 500 })
  }
}
