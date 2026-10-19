import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'
import { avisarInscripcionConfirmada, recalcularInscripcion } from '@/lib/torneoServidor'
import { categoriasInfantiles } from '@/lib/torneoInfantilServidor'
import { edadAdmitida, edadAlCorte, generoAdmitido } from '@/lib/torneoInfantil'
import { mensajeErrorBaseInscripcion } from '@/lib/torneoInscripcion'
import type { Torneo } from '@/lib/torneo'

// Certifica (o quita la certificación de) la categoría de un menor, después
// de revisar su fecha de nacimiento — el equivalente a categoria_torneo de
// los adultos. Con categoriaId distinto, además lo pasa a esa otra
// categoría infantil (que tiene que corresponderle por edad y género).
// Solo antes del sorteo. Después recalcula la inscripción.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { inscripcionId, categoriaId, certificar } = await request.json()
    if (typeof inscripcionId !== 'string' || !inscripcionId) return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })

    const db = supabaseServer()
    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, categoria_id, menor_id, torneo_menores:menor_id(nombre, genero, fecha_nacimiento), torneo_categorias:categoria_id(torneos:torneo_id(*))')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    if (!ins || !ins.menor_id) return NextResponse.json({ error: 'Inscripción infantil no encontrada' }, { status: 404 })
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'La inscripción está retirada' }, { status: 400 })
    const torneo = (ins.torneo_categorias as any).torneos as Torneo
    if (!['borrador', 'inscripcion'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'El torneo ya fue sorteado: la categoría no se puede cambiar desde aquí' }, { status: 400 })
    }

    const cambios: Record<string, unknown> = certificar === false
      ? { categoria_certificada_por: null, categoria_certificada_at: null }
      : { categoria_certificada_por: session!.id, categoria_certificada_at: ahora().toISOString() }

    if (categoriaId && categoriaId !== ins.categoria_id) {
      const menor = ins.torneo_menores as any
      const destino = (await categoriasInfantiles(db, torneo.id)).find((c) => c.id === categoriaId)
      if (!destino) return NextResponse.json({ error: 'Esa categoría infantil no es de este torneo' }, { status: 400 })
      const edad = edadAlCorte(menor.fecha_nacimiento, torneo)
      if (!edadAdmitida(destino, edad) || !generoAdmitido(destino.genero, menor.genero)) {
        return NextResponse.json({ error: `${destino.nombre} no le corresponde a ${menor.nombre} (${edad} años al corte)` }, { status: 400 })
      }
      cambios.categoria_id = destino.id
    }

    const { error } = await db.from('torneo_inscripciones').update(cambios).eq('id', inscripcionId)
    if (error) {
      const claro = mensajeErrorBaseInscripcion(error.message)
      if (claro) return NextResponse.json({ error: claro }, { status: 400 })
      throw error
    }

    const r = await recalcularInscripcion(db, inscripcionId)
    if (r.antes !== 'confirmada' && r.despues === 'confirmada') await avisarInscripcionConfirmada(db, r)
    return NextResponse.json({ ok: true, estadoInscripcion: r.despues })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al certificar la categoría' }, { status: 500 })
  }
}
