import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { jugadorId, nombre, email, telefono, categoria, genero, numeroAccion, activo } = await request.json()
    if (!jugadorId || !nombre?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
    }

    const db = supabaseServer()

    // Evitar duplicar el email con otro jugador distinto
    const { data: existente, error: errExist } = await db
      .from('jugadores')
      .select('id')
      .ilike('email', email.trim())
      .neq('id', jugadorId)
      .maybeSingle()
    if (errExist) throw errExist
    if (existente) {
      return NextResponse.json({ error: 'Ya hay otro jugador con ese email.' }, { status: 400 })
    }

    const { error } = await db
      .from('jugadores')
      .update({
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono || null,
        categoria,
        genero,
        numero_accion: numeroAccion || null,
        activo: activo !== false,
      })
      .eq('id', jugadorId)
    if (error) throw error

    // Si este jugador ya está anotado en la temporada activa y le cambiamos
    // categoría/género, su fila del escalafón queda con datos viejos — la
    // sincronizamos, moviéndolo al final de su nuevo grupo (su posición
    // anterior no tiene sentido en la categoría/género nuevos).
    const { data: temporadaActivaAhora } = await db
      .from('temporadas')
      .select('id')
      .eq('estado', 'activa')
      .maybeSingle()

    if (temporadaActivaAhora) {
      const { data: posicionActual } = await db
        .from('ladder_posiciones')
        .select('id, categoria, genero')
        .eq('temporada_id', temporadaActivaAhora.id)
        .eq('jugador_id', jugadorId)
        .maybeSingle()

      if (posicionActual && (posicionActual.categoria !== categoria || posicionActual.genero !== genero)) {
        const { count } = await db
          .from('ladder_posiciones')
          .select('id', { count: 'exact', head: true })
          .eq('temporada_id', temporadaActivaAhora.id)
          .eq('categoria', categoria)
          .eq('genero', genero)

        const nuevaPosicion = (count || 0) + 1

        await db
          .from('ladder_posiciones')
          .update({ categoria, genero, posicion: nuevaPosicion, posicion_inicial: nuevaPosicion })
          .eq('id', posicionActual.id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar' }, { status: 500 })
  }
}
