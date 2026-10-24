// Resumen de la pestaña Torneo del admin (contadores calculados en el
// servidor): duplas o inscritos por categoría, faltantes, listos para el
// sorteo, sin pareja, invitaciones pendientes, pagos por validar y alertas.
// Lo usa app/api/admin/torneo/resumen. La cuenta de cada categoría está en
// lib/torneoDobles.ts (resumenCategoria).

import type { SupabaseClient } from '@supabase/supabase-js'
import { ahora } from '@/lib/tiempo'
import type { EstadoInscripcion, Nivel, Torneo } from '@/lib/torneo'
import { resumenCategoria, type ResumenCategoria } from '@/lib/torneoDobles'
import { pendientesInscripcion } from '@/lib/torneoInscripcion'
import { pendientesInscripcionMenor } from '@/lib/torneoInfantil'
import { pendientesQueBloqueanSorteo } from '@/lib/torneoSorteo'
import { vencerInvitaciones } from '@/lib/torneoDoblesServidor'
import { revisarCierreVencido } from '@/lib/torneoCierreServidor'

export type ResumenTorneo = {
  cierreInscripcionesAt: string | null
  // Categorías abiertas después del cierre programado ("cierre programado vencido").
  cierreVencido: string[]
  dobles: { duplas: number; cupo: number }
  singleEInfantil: { inscritos: number; cupo: number }
  categorias: (ResumenCategoria & { nombre: string; es_infantil: boolean; sorteada: boolean; cancelada: boolean })[]
}

export async function resumenTorneo(db: SupabaseClient, torneo: Torneo): Promise<ResumenTorneo> {
  const { data: categorias, error: errC } = await db
    .from('torneo_categorias')
    .select('id, nombre, modalidad, cupo, categoria_nivel, es_infantil, orden, sorteo_publicado_at, cancelada_at')
    .eq('torneo_id', torneo.id)
    .order('orden')
  if (errC) throw errC
  const ids = (categorias || []).map((c) => c.id)
  await vencerInvitaciones(db, (categorias || []).filter((c) => c.modalidad === 'doble').map((c) => c.id))

  const [{ data: ins, error: errI }, { data: equipos, error: errE }, { data: invs, error: errV }] = await Promise.all([
    ids.length
      ? db.from('torneo_inscripciones')
          .select('id, categoria_id, estado, jugador1_id, menor_id, categoria_certificada_at, invitado_autorizado_at, torneo_menores(numero_accion)')
          .in('categoria_id', ids).neq('estado', 'retirada')
      : Promise.resolve({ data: [] as any[], error: null }),
    ids.length ? db.from('torneo_equipos').select('id, categoria_id, inscripcion1_id, inscripcion2_id').in('categoria_id', ids).eq('estado', 'activo') : Promise.resolve({ data: [] as any[], error: null }),
    ids.length ? db.from('torneo_invitaciones').select('categoria_id, estado, vence_at').in('categoria_id', ids).eq('estado', 'pendiente') : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (errI) throw errI
  if (errE) throw errE
  if (errV) throw errV
  const insIds = (ins || []).map((i: any) => i.id)
  const jugIds = [...new Set((ins || []).map((i: any) => i.jugador1_id).filter(Boolean))] as string[]
  const [{ data: pagos, error: errP }, { data: jugs, error: errJ }] = await Promise.all([
    insIds.length ? db.from('pagos').select('torneo_inscripcion_id, validado').in('torneo_inscripcion_id', insIds) : Promise.resolve({ data: [] as any[], error: null }),
    jugIds.length ? db.from('jugadores').select('id, categoria_torneo, es_invitado').in('id', jugIds) : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (errP) throw errP
  if (errJ) throw errJ
  const jug = new Map((jugs || []).map((j: any) => [j.id, j]))
  const catPorId = new Map((categorias || []).map((c) => [c.id, c]))

  // Lo que bloquea el sorteo de cada inscripción (sin contar el pago).
  const bloqueada = new Set<string>()
  for (const i of (ins || []) as any[]) {
    const p = i.menor_id
      ? pendientesInscripcionMenor({
          estado: i.estado as EstadoInscripcion, menorId: i.menor_id, representanteJugadorId: '', pagos: [],
          certificada: !!i.categoria_certificada_at, soloSocios: torneo.solo_socios,
          menorConAccion: !!i.torneo_menores?.numero_accion?.trim(), invitadoAutorizado: !!i.invitado_autorizado_at,
        })
      : pendientesInscripcion({
          estado: i.estado as EstadoInscripcion, nivelCategoria: catPorId.get(i.categoria_id)!.categoria_nivel as Nivel | null, pagos: [],
          jugadores: [{ id: i.jugador1_id, categoria_torneo: jug.get(i.jugador1_id)?.categoria_torneo ?? null, es_invitado: !!jug.get(i.jugador1_id)?.es_invitado }],
          soloSocios: torneo.solo_socios, invitadoAutorizado: !!i.invitado_autorizado_at,
        })
    if (pendientesQueBloqueanSorteo(p).length) bloqueada.add(i.id)
  }

  const momento = ahora()
  const filas = (categorias || []).map((c) => {
    const r = resumenCategoria({
      categoria: c as any,
      inscripciones: (ins || []).filter((i: any) => i.categoria_id === c.id),
      equipos: (equipos || []).filter((e: any) => e.categoria_id === c.id).map((e: any) => {
        const ids2 = [e.inscripcion1_id, e.inscripcion2_id].filter(Boolean) as string[]
        return { inscripcionIds: ids2, bloqueado: ids2.some((id) => bloqueada.has(id)) }
      }),
      invitaciones: (invs || []).filter((v: any) => v.categoria_id === c.id),
      pagos: pagos || [],
      ahora: momento,
    })
    return { ...r, nombre: c.nombre, es_infantil: c.es_infantil, sorteada: !!c.sorteo_publicado_at, cancelada: !!c.cancelada_at }
  })
  const vivas = filas.filter((f) => !f.cancelada)
  const dobles = vivas.filter((f) => f.modalidad === 'doble')
  const otras = vivas.filter((f) => f.modalidad !== 'doble')
  return {
    cierreInscripcionesAt: torneo.cierre_inscripciones_at,
    cierreVencido: await revisarCierreVencido(db, torneo),
    dobles: { duplas: dobles.reduce((s, f) => s + f.confirmados, 0), cupo: dobles.reduce((s, f) => s + f.cupo, 0) },
    singleEInfantil: { inscritos: otras.reduce((s, f) => s + f.inscritos, 0), cupo: otras.reduce((s, f) => s + f.cupo, 0) },
    categorias: filas,
  }
}
