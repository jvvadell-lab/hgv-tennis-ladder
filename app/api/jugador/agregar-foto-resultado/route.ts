import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { resultadoId, fotoUrl } = await request.json()
    if (!resultadoId || !fotoUrl) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const db = supabaseServer()

    const { data: resultado, error: errResultado } = await db
      .from('resultados')
      .select('id, reto_id')
      .eq('id', resultadoId)
      .maybeSingle()
    if (errResultado) throw errResultado
    if (!resultado) return NextResponse.json({ error: 'Resultado no encontrado' }, { status: 404 })

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('retador_id, retado_id')
      .eq('id', resultado.reto_id)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto || (reto.retador_id !== session.id && reto.retado_id !== session.id)) {
      return NextResponse.json({ error: 'Este resultado no corresponde a un partido tuyo' }, { status: 403 })
    }

    const { error: errUpdate } = await db
      .from('resultados')
      .update({ foto_url: fotoUrl })
      .eq('id', resultadoId)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la foto' }, { status: 500 })
  }
}
