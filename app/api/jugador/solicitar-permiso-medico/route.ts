import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { informeUrl, motivo } = await request.json()
    const db = supabaseServer()

    const { data: temporada, error: errTemp } = await db
      .from('temporadas')
      .select('id')
      .eq('estado', 'activa')
      .maybeSingle()
    if (errTemp) throw errTemp
    if (!temporada) return NextResponse.json({ error: 'No hay una temporada activa' }, { status: 400 })

    const { data: pendiente } = await db
      .from('permisos_medicos')
      .select('id')
      .eq('jugador_id', session.id)
      .eq('temporada_id', temporada.id)
      .eq('estado', 'pendiente')
      .maybeSingle()
    if (pendiente) {
      return NextResponse.json({ error: 'Ya tienes una solicitud de permiso médico pendiente de revisión.' }, { status: 400 })
    }

    const { error } = await db.from('permisos_medicos').insert([{
      jugador_id: session.id,
      temporada_id: temporada.id,
      informe_url: informeUrl || null,
      motivo: motivo || null,
      estado: 'pendiente',
      creado_por: 'jugador',
    }])
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al enviar la solicitud' }, { status: 500 })
  }
}
