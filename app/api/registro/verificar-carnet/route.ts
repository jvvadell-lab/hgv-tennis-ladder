import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { verificarNumeroAccion } from '@/lib/verificarAccion'

// Ruta pública (sin sesión) — se llama justo después del registro, antes de
// que exista cualquier sesión, con el id que acaba de crear el propio registro.
export async function POST(request: Request) {
  try {
    const { jugadorId } = await request.json()
    if (!jugadorId) return NextResponse.json({ error: 'Falta el id del jugador' }, { status: 400 })

    const db = supabaseServer()
    const { data: jugador, error } = await db
      .from('jugadores')
      .select('foto_carnet_url, numero_accion, estado_verificacion')
      .eq('id', jugadorId)
      .maybeSingle()
    if (error) throw error
    if (!jugador?.foto_carnet_url) return NextResponse.json({ ok: true }) // no hay foto, nada que verificar

    const { ocr, coincide } = await verificarNumeroAccion(jugador.foto_carnet_url, jugador.numero_accion || '')

    const updateData: any = { numero_accion_ocr: ocr, numero_accion_coincide: coincide }
    // Si la IA confirma que el número coincide con la foto, verificamos la membresía
    // automáticamente — así el admin no tiene que revisarlo a mano. Nunca reescribimos
    // un "no_permitido" que un admin haya puesto a propósito.
    if (coincide === true && jugador.estado_verificacion !== 'no_permitido') {
      updateData.estado_verificacion = 'verificado'
    }

    await db
      .from('jugadores')
      .update(updateData)
      .eq('id', jugadorId)

    return NextResponse.json({ ok: true, ocr, coincide })
  } catch (err: any) {
    // No queremos que un fallo aquí aparente que el registro falló.
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 })
  }
}
