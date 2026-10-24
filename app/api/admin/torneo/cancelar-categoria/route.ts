import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { escaparHtml, notificarJugadores, torneoVigente } from '@/lib/torneoServidor'
import { errorGeneros, nivelAdmitido, nivelParaTorneo } from '@/lib/torneoInscripcion'
import type { Nivel } from '@/lib/torneo'

// Categoría con menos de 3 duplas o inscritos, antes de su sorteo:
//  * { categoriaId, destinoId }  la fusiona con otra compatible (mismas
//    modalidad; nivel y género de cada jugador): las inscripciones pasan allá
//    con sus duplas y su pago;
//  * { categoriaId }             la cancela: sus inscripciones se retiran con
//    el pago marcado para devolución.
// Todo en una transacción (torneo_cancelar_categoria) y aviso a los inscritos.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { categoriaId, destinoId } = await request.json()
    if (typeof categoriaId !== 'string' || (destinoId != null && typeof destinoId !== 'string')) {
      return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
    }
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })

    const { data: cats, error: errC } = await db
      .from('torneo_categorias')
      .select('id, nombre, genero, categoria_nivel, torneo_id')
      .in('id', [categoriaId, ...(destinoId ? [destinoId] : [])])
    if (errC) throw errC
    const origen = (cats || []).find((c) => c.id === categoriaId)
    const destino = destinoId ? (cats || []).find((c) => c.id === destinoId) : null
    if (!origen || origen.torneo_id !== torneo.id) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    const { data: ins, error: errI } = await db
      .from('torneo_inscripciones')
      .select('id, jugador1_id, menor_id, torneo_menores(representante_jugador_id, genero)')
      .eq('categoria_id', categoriaId)
      .neq('estado', 'retirada')
    if (errI) throw errI

    // Fusión: cada jugador tiene que poder jugar la de destino (nivel y género).
    if (destino) {
      const ids = (ins || []).map((i) => i.jugador1_id).filter(Boolean) as string[]
      const { data: jugs } = ids.length ? await db.from('jugadores').select('id, nombre, genero, categoria, categoria_torneo').in('id', ids) : { data: [] as any[] }
      for (const j of jugs || []) {
        if (destino.genero !== 'mixto' && errorGeneros(destino.genero, [j.genero])) return NextResponse.json({ error: `${j.nombre} no puede pasar a ${destino.nombre} por género` }, { status: 400 })
        if (!nivelAdmitido(destino.categoria_nivel as Nivel | null, nivelParaTorneo(j))) return NextResponse.json({ error: `${j.nombre} no puede pasar a ${destino.nombre} por su nivel` }, { status: 400 })
      }
    }

    const { error } = await db.rpc('torneo_cancelar_categoria', { p_categoria_id: categoriaId, p_admin_id: session!.id, p_destino_id: destino?.id ?? null })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const personas = [...new Set((ins || []).map((i: any) => i.jugador1_id ?? i.torneo_menores?.representante_jugador_id).filter(Boolean))] as string[]
    await notificarJugadores(db, personas, destino ? {
      tipo: 'torneo_categoria_fusionada',
      mensaje: `🔁 ${origen.nombre} no llegó al mínimo y se unió a ${destino.nombre}: tu inscripción (y tu dupla) pasan allá.`,
      asunto: `🔁 ${origen.nombre} se une a ${destino.nombre}`,
      cuerpoHtml: () => `<p><strong>${escaparHtml(origen.nombre)}</strong> no llegó al mínimo de participantes y se unió a <strong>${escaparHtml(destino.nombre)}</strong>. Tu inscripción, tu pago y tu dupla pasan a esa categoría.</p>`,
    } : {
      tipo: 'torneo_categoria_cancelada',
      mensaje: `❌ ${origen.nombre} se canceló por no llegar al mínimo. Tu pago quedó marcado para devolución.`,
      asunto: `❌ ${origen.nombre} se canceló`,
      cuerpoHtml: () => `<p><strong>${escaparHtml(origen.nombre)}</strong> se canceló por no llegar al mínimo de participantes. Tu pago quedó <strong>marcado para devolución</strong>; el club te contactará.</p>`,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cancelar la categoría' }, { status: 500 })
  }
}
