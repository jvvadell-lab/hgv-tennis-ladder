import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'

// Abre o cierra las inscripciones de una categoría y registra quién y
// cuándo. La categoría solo acepta inscripciones con esto abierto Y el
// torneo en 'inscripcion' (lib/torneoInscripcion.ts → categoriaAbierta).
// Solo antes del sorteo; las inscripciones ya hechas no se tocan.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { categoriaId, abiertas } = await request.json()
    if (typeof categoriaId !== 'string' || !categoriaId) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })
    if (typeof abiertas !== 'boolean') return NextResponse.json({ error: 'Falta indicar si se abren o se cierran' }, { status: 400 })

    const db = supabaseServer()
    const { data: categoria, error: errCat } = await db
      .from('torneo_categorias')
      .select('id, nombre, inscripciones_abiertas, torneos:torneo_id(estado)')
      .eq('id', categoriaId)
      .maybeSingle()
    if (errCat) throw errCat
    if (!categoria) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    const estadoTorneo = (categoria.torneos as any)?.estado
    if (!['borrador', 'inscripcion'].includes(estadoTorneo)) {
      return NextResponse.json({ error: 'El torneo ya fue sorteado: las inscripciones no se pueden abrir ni cerrar' }, { status: 400 })
    }
    if (categoria.inscripciones_abiertas === abiertas) {
      return NextResponse.json({ ok: true, sinCambios: true })
    }

    const { error } = await db
      .from('torneo_categorias')
      .update({
        inscripciones_abiertas: abiertas,
        inscripciones_cambiadas_por: session!.id,
        inscripciones_cambiadas_at: ahora().toISOString(),
      })
      .eq('id', categoriaId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cambiar las inscripciones de la categoría' }, { status: 500 })
  }
}
