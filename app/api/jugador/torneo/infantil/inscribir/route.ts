import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { inscribirMenor } from '@/lib/torneoInfantilServidor'

// El representante inscribe a uno de sus representados en una categoría
// infantil del torneo vigente, con las dos autorizaciones por separado
// (participación obligatoria, imagen opcional).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { menorId, categoriaId, autorizacionParticipacion, autorizacionImagen } = await request.json()
    if (typeof menorId !== 'string' || !menorId) return NextResponse.json({ error: 'Elige al niño o niña' }, { status: 400 })
    if (typeof categoriaId !== 'string' || !categoriaId) return NextResponse.json({ error: 'Elige una categoría' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo abierto' }, { status: 400 })

    const { data: menor, error } = await db
      .from('torneo_menores')
      .select('id, nombre, apellido, genero, fecha_nacimiento, numero_accion, representante_jugador_id')
      .eq('id', menorId)
      .eq('representante_jugador_id', session.id)
      .maybeSingle()
    if (error) throw error
    if (!menor) return NextResponse.json({ error: 'Ese niño o niña no está entre tus representados' }, { status: 403 })

    const r = await inscribirMenor(db, {
      torneo,
      menor,
      categoriaId,
      autorizacionParticipacion: autorizacionParticipacion === true,
      autorizacionImagen: autorizacionImagen === true,
      inscritaPor: { jugadorId: session.id },
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true, inscripcionId: r.inscripcionId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al inscribir' }, { status: 500 })
  }
}
