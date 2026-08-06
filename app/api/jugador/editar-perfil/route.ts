import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { verificarNumeroAccion } from '@/lib/verificarAccion'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { nombre, email, telefono, numeroAccion, pin, fotoCarnetUrl } = await request.json()
    if (!nombre?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nombre y email son obligatorios' }, { status: 400 })
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'El PIN debe tener exactamente 4 dígitos' }, { status: 400 })
    }

    const db = supabaseServer()

    // Evitar duplicar el email con otro jugador distinto (siempre usamos session.id,
    // nunca un id que venga del cliente, para que nadie pueda editar el perfil de otro)
    const { data: existente, error: errExist } = await db
      .from('jugadores')
      .select('id')
      .ilike('email', email.trim())
      .neq('id', session.id)
      .maybeSingle()
    if (errExist) throw errExist
    if (existente) {
      return NextResponse.json({ error: 'Ya hay otro jugador con ese email.' }, { status: 400 })
    }

    const updateData: any = {
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      telefono: telefono || null,
      numero_accion: numeroAccion || null,
    }
    if (pin) updateData.pin = pin
    // La foto ya se sube al bucket desde el cliente antes de llamar aquí — solo guardamos la URL resultante.
    if (fotoCarnetUrl) {
      updateData.foto_carnet_url = fotoCarnetUrl
      // Verificamos el número de acción contra la foto nueva — si la IA confirma que
      // coincide, verificamos la membresía automáticamente (sin pisar un "no_permitido"
      // que un admin haya puesto a propósito). Si no coincide o no se pudo leer, queda
      // pendiente para que el admin lo revise a mano, igual que antes.
      const { ocr, coincide } = await verificarNumeroAccion(fotoCarnetUrl, numeroAccion || '')
      updateData.numero_accion_ocr = ocr
      updateData.numero_accion_coincide = coincide

      if (coincide === true) {
        const { data: actual } = await db
          .from('jugadores')
          .select('estado_verificacion')
          .eq('id', session.id)
          .maybeSingle()
        if (actual?.estado_verificacion !== 'no_permitido') {
          updateData.estado_verificacion = 'verificado'
        }
      }
    }

    const { error } = await db.from('jugadores').update(updateData).eq('id', session.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar' }, { status: 500 })
  }
}
