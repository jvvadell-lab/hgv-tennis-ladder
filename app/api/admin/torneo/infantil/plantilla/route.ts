import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { parsearPlantillaTurnos } from '@/lib/torneoInfantil'

// Guarda la plantilla de turnos (horario escuela) de una categoría
// infantil: días, canchas y ventana horaria (SPEC §14.5). No bloquea
// canchas: los bloqueos se crean al programar cada partido.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { categoriaId, plantilla } = await request.json()
    if (typeof categoriaId !== 'string' || !categoriaId) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })
    const normalizada = parsearPlantillaTurnos(plantilla)
    if (!normalizada) {
      return NextResponse.json({ error: 'Horario no válido: elige al menos un día y una cancha, y una hora de inicio anterior a la de fin' }, { status: 400 })
    }

    const db = supabaseServer()
    const { data: categoria, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, es_infantil, duracion_min, torneos:torneo_id(estado)')
      .eq('id', categoriaId)
      .maybeSingle()
    if (errCat) throw errCat
    if (!categoria || !categoria.es_infantil) return NextResponse.json({ error: 'Categoría infantil no encontrada' }, { status: 404 })
    if ((categoria.torneos as any)?.estado === 'finalizado') return NextResponse.json({ error: 'El torneo ya finalizó' }, { status: 400 })

    const [hd, md] = normalizada.desde.split(':').map(Number)
    const [hh, mh] = normalizada.hasta.split(':').map(Number)
    if ((hh * 60 + mh) - (hd * 60 + md) < categoria.duracion_min) {
      return NextResponse.json({ error: `La ventana no alcanza para un turno de ${categoria.duracion_min} min` }, { status: 400 })
    }

    const { error } = await db.from('torneo_categorias').update({ plantilla_turnos: normalizada }).eq('id', categoriaId)
    if (error) throw error
    return NextResponse.json({ ok: true, plantilla: normalizada })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar el horario' }, { status: 500 })
  }
}
