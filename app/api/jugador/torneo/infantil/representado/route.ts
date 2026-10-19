import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora, hoyEnCaracas } from '@/lib/tiempo'
import { normalizarFichaMenor } from '@/lib/torneoInfantil'

// Crea (sin id) o actualiza (con id) la ficha de un menor que represento.
// Las autorizaciones no se tocan aquí: se dan en cada inscripción
// (/api/jugador/torneo/infantil/inscribir). Una ficha nueva queda con la
// de participación registrada ahora, porque la tabla la exige.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const body = await request.json()
    const r = normalizarFichaMenor(body, hoyEnCaracas())
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })

    const db = supabaseServer()
    const momento = ahora().toISOString()

    if (body.id) {
      if (typeof body.id !== 'string') return NextResponse.json({ error: 'Ficha no válida' }, { status: 400 })
      const { data, error } = await db
        .from('torneo_menores')
        .update({ ...r.ficha, updated_at: momento })
        .eq('id', body.id)
        .eq('representante_jugador_id', session.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Esa ficha no es de un menor que representes' }, { status: 403 })
      return NextResponse.json({ ok: true, menorId: data.id })
    }

    if (body.autorizacionParticipacion !== true) {
      return NextResponse.json({ error: 'La autorización de participación del representante es obligatoria' }, { status: 400 })
    }

    const { data, error } = await db
      .from('torneo_menores')
      .insert({
        ...r.ficha,
        representante_jugador_id: session.id,
        autorizacion_participacion: true,
        autorizacion_participacion_at: momento,
        autorizacion_imagen: false,
        registrado_por_jugador: session.id,
      })
      .select('id')
      .single()
    if (error) throw error
    return NextResponse.json({ ok: true, menorId: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la ficha' }, { status: 500 })
  }
}
