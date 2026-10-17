import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Abre o cierra las inscripciones del torneo (borrador ↔ inscripcion). Los
// demás estados (sorteado, en curso, finalizado) los mueven el sorteo y las
// fases siguientes, no esta ruta.
const TRANSICIONES: Record<string, string[]> = {
  borrador: ['inscripcion'],
  inscripcion: ['borrador'],
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { torneoId, estado } = await request.json()
    if (!torneoId || typeof estado !== 'string') {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data: torneo, error: errT } = await db.from('torneos').select('id, estado').eq('id', torneoId).maybeSingle()
    if (errT) throw errT
    if (!torneo) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })
    if (!(TRANSICIONES[torneo.estado] || []).includes(estado)) {
      return NextResponse.json({ error: `No se puede pasar el torneo de "${torneo.estado}" a "${estado}" desde aquí` }, { status: 400 })
    }

    const { error } = await db.from('torneos').update({ estado }).eq('id', torneoId).eq('estado', torneo.estado)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cambiar el estado del torneo' }, { status: 500 })
  }
}
