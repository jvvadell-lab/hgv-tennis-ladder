import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'
import { errorCambioApertura } from '@/lib/torneoCierre'
import { vencerInvitacionesDeCategoria } from '@/lib/torneoDoblesServidor'

// Cierre MANUAL por categoría (SPEC §2.3): abre o cierra las inscripciones
// de una categoría y registra quién y cuándo. La categoría solo acepta
// inscripciones con esto abierto Y el torneo en 'inscripcion'
// (lib/torneoInscripcion.ts → categoriaAbierta). Se puede reabrir mientras
// no se publique su sorteo. Al cerrar, sus invitaciones pendientes vencen
// (con aviso); las inscripciones y duplas hechas no se tocan, y el admin
// sigue armando duplas, trasladando y certificando hasta el sorteo.
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
      .select('id, nombre, inscripciones_abiertas, sorteo_publicado_at, cancelada_at, torneos:torneo_id(estado)')
      .eq('id', categoriaId)
      .maybeSingle()
    if (errCat) throw errCat
    if (!categoria) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    const motivo = errorCambioApertura((categoria.torneos as any)?.estado, categoria, abiertas)
    if (motivo) return NextResponse.json({ error: motivo }, { status: 400 })
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

    const vencidas = abiertas ? 0 : await vencerInvitacionesDeCategoria(db, categoriaId, 'Se cerraron las inscripciones de la categoría')
    return NextResponse.json({ ok: true, invitacionesVencidas: vencidas })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cambiar las inscripciones de la categoría' }, { status: 500 })
  }
}
