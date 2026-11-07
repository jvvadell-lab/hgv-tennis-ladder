import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { guardarFotoPartido, quitarFotoPartido } from '@/lib/torneoFotosServidor'

// El admin agrega, cambia o quita la foto de cualquier partido jugado (SPEC §17).
const SOLO_ADMIN = { error: 'Solo un administrador puede hacer esto' }

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || !esAdminCompleto(session)) return NextResponse.json(SOLO_ADMIN, { status: 403 })
    const form = await request.formData()
    const partidoId = form.get('partidoId')
    const archivo = form.get('foto')
    if (typeof partidoId !== 'string' || !partidoId || !(archivo instanceof File)) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }
    const r = await guardarFotoPartido(supabaseServer(), { partidoId, archivo, autor: { id: session.id, rol: 'admin' } })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, fotoUrl: r.fotoUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la foto' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session || !esAdminCompleto(session)) return NextResponse.json(SOLO_ADMIN, { status: 403 })
    const { partidoId } = await request.json()
    if (typeof partidoId !== 'string' || !partidoId) return NextResponse.json({ error: 'Falta el partido' }, { status: 400 })
    const r = await quitarFotoPartido(supabaseServer(), partidoId)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al quitar la foto' }, { status: 500 })
  }
}
