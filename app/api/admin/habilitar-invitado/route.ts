import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'

// Habilita (o deshabilita) a un invitado para la escalera, los retos y las
// reservas (lib/invitados.ts). Sin habilitación, un invitado solo juega los
// torneos a los que lo invite el club.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { jugadorId, habilitar } = await request.json()
    if (typeof jugadorId !== 'string' || !jugadorId || typeof habilitar !== 'boolean') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data: jugador, error: errJ } = await db.from('jugadores').select('id, es_invitado').eq('id', jugadorId).maybeSingle()
    if (errJ) throw errJ
    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
    if (!jugador.es_invitado) return NextResponse.json({ error: 'Ese jugador es socio: no necesita habilitación' }, { status: 400 })

    const { error } = await db
      .from('jugadores')
      .update(habilitar
        ? { invitado_habilitado_por: session!.id, invitado_habilitado_at: ahora().toISOString() }
        : { invitado_habilitado_por: null, invitado_habilitado_at: null })
      .eq('id', jugadorId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar' }, { status: 500 })
  }
}
