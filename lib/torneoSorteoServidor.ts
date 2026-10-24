// Sorteo del torneo — helpers de servidor (reciben el cliente de Supabase con
// service role). Los usan app/api/admin/torneo/sorteo/... La lógica pura
// está en lib/torneoSorteo.ts.

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoInscripcion, Nivel, Torneo } from '@/lib/torneo'
import { escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import { pendientesInscripcion, textoPendiente } from '@/lib/torneoInscripcion'
import { pendientesInscripcionMenor } from '@/lib/torneoInfantil'
import { competidoresDeCategorias, competidoresPorId, personasDe } from '@/lib/torneoEquiposServidor'
import { pendientesQueBloqueanSorteo, planCategoria, validarGruposSorteo, type CategoriaParaSorteo, type InscripcionParaSorteo, type MetodoSorteo, type PlanCategoria } from '@/lib/torneoSorteo'

// Azar del sorteo con el generador criptográfico del servidor (no Math.random).
export const azarSorteo = () => randomInt(0, 2 ** 32) / 2 ** 32

export type CategoriaConInscritas = CategoriaParaSorteo & {
  // Los competidores del sorteo: equipos activos (la dupla en dobles, la
  // inscripción en single e infantil). El id es el del equipo.
  inscripciones: (InscripcionParaSorteo & { nombre: string; pagoPendiente: boolean })[]
  // Lo que impide sortear la categoría (categoría oficial, certificación,
  // invitado sin autorizar, jugadores de dobles sin pareja), como texto para
  // el admin. El pago no bloquea.
  bloqueos: string[]
  sorteo_publicado_at: string | null
  sorteo_metodo: MetodoSorteo | null
  cancelada_at: string | null
}

// Categorías del torneo con sus equipos activos (entran al sorteo hayan
// pagado o no), el nombre para mostrar de cada uno y lo que todavía bloquea
// el sorteo. Con `categoriaId`, solo esa.
export async function datosParaSorteo(db: SupabaseClient, torneo: Torneo, categoriaId?: string): Promise<CategoriaConInscritas[]> {
  let consulta = db
    .from('torneo_categorias')
    .select('id, nombre, modalidad, es_infantil, num_grupos, llave_desde, partidos_minimos, orden, categoria_nivel, sorteo_publicado_at, sorteo_metodo, cancelada_at')
    .eq('torneo_id', torneo.id)
  if (categoriaId) consulta = consulta.eq('id', categoriaId)
  const { data: categorias, error: errCat } = await consulta.order('orden')
  if (errCat) throw errCat
  const ids = (categorias || []).map((c) => c.id)
  if (!ids.length) return []

  const [{ data: inscripciones, error: errIns }, equipos] = await Promise.all([
    db
      .from('torneo_inscripciones')
      .select('id, categoria_id, estado, jugador1_id, menor_id, menor_nombre_publico, categoria_certificada_at, invitado_autorizado_at')
      .in('categoria_id', ids)
      .neq('estado', 'retirada')
      .order('created_at'),
    competidoresDeCategorias(db, ids),
  ])
  if (errIns) throw errIns

  const lista = inscripciones || []
  const insPorId = new Map(lista.map((i) => [i.id, i]))
  const jugadorIds = [...new Set(lista.map((i) => i.jugador1_id).filter(Boolean))] as string[]
  const menorIds = [...new Set(lista.map((i) => i.menor_id).filter(Boolean))] as string[]
  const [{ data: jugadores, error: errJ }, { data: menores, error: errM }] = await Promise.all([
    jugadorIds.length
      ? db.from('jugadores').select('id, nombre, categoria_torneo, es_invitado').in('id', jugadorIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    menorIds.length
      ? db.from('torneo_menores').select('id, numero_accion').in('id', menorIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (errJ) throw errJ
  if (errM) throw errM
  const jugadorPorId = new Map((jugadores || []).map((j: any) => [j.id, j]))
  const accionMenor = new Map((menores || []).map((m: any) => [m.id, !!m.numero_accion?.trim()]))
  const nombres = await nombresInscripciones(db, equipos)
  const enEquipo = new Set(equipos.flatMap((e) => e.inscripcionIds))

  return (categorias || []).map((c) => {
    const delaCategoria = lista.filter((i) => i.categoria_id === c.id)
    const bloqueos: string[] = []
    for (const i of delaCategoria) {
      // Los pagos no se cargan: sus pendientes no bloquean el sorteo.
      const pendientes = i.menor_id
        ? pendientesInscripcionMenor({
            estado: i.estado as EstadoInscripcion, menorId: i.menor_id, representanteJugadorId: '', pagos: [],
            certificada: !!i.categoria_certificada_at, soloSocios: torneo.solo_socios,
            menorConAccion: accionMenor.get(i.menor_id) ?? false, invitadoAutorizado: !!i.invitado_autorizado_at,
          })
        : pendientesInscripcion({
            estado: i.estado as EstadoInscripcion, nivelCategoria: c.categoria_nivel as Nivel | null, pagos: [],
            jugadores: [{
              id: i.jugador1_id!, categoria_torneo: jugadorPorId.get(i.jugador1_id!)?.categoria_torneo ?? null, es_invitado: !!jugadorPorId.get(i.jugador1_id!)?.es_invitado,
            }],
            soloSocios: torneo.solo_socios, invitadoAutorizado: !!i.invitado_autorizado_at,
          })
      const quienIns = i.menor_id ? i.menor_nombre_publico ?? 'el menor' : jugadorPorId.get(i.jugador1_id!)?.nombre ?? '—'
      for (const p of pendientesQueBloqueanSorteo(pendientes)) {
        const quien = p.jugadorId === i.menor_id ? i.menor_nombre_publico ?? 'el menor' : jugadorPorId.get(p.jugadorId)?.nombre ?? '—'
        bloqueos.push(`${c.nombre} · ${quienIns}: ${textoPendiente(p, quien)}`)
      }
    }
    const sueltos = delaCategoria.filter((i) => !enEquipo.has(i.id))
    if (c.modalidad === 'doble' && sueltos.length) {
      bloqueos.push(`${c.nombre}: ${sueltos.length === 1 ? 'un jugador sin pareja' : `${sueltos.length} jugadores sin pareja`} (${sueltos.map((i) => jugadorPorId.get(i.jugador1_id!)?.nombre ?? '—').join(', ')}). Ármales dupla, trasládalos o retíralos.`)
    }
    return {
      ...(c as CategoriaParaSorteo),
      sorteo_publicado_at: c.sorteo_publicado_at,
      sorteo_metodo: c.sorteo_metodo as MetodoSorteo | null,
      cancelada_at: c.cancelada_at,
      bloqueos,
      inscripciones: equipos.filter((e) => e.categoria_id === c.id).map((e) => ({
        id: e.id, siembra: e.siembra, bombo: e.bombo, nombre: nombres.get(e.id) || '—',
        pagoPendiente: e.inscripcionIds.some((id) => insPorId.get(id)?.estado !== 'confirmada'),
      })),
    }
  })
}

type InscripcionConNombres = { id: string; jugador1_id: string | null; jugador2_id: string | null; menor_nombre_publico: string | null }

// Nombre público de cada inscripción: "Ana / Luis" en dobles, el jugador en
// single y menor_nombre_publico ("Sofía M.") en las infantiles — nunca el
// nombre completo del menor ni datos del representante.
export async function nombresInscripciones(db: SupabaseClient, inscripciones: InscripcionConNombres[]): Promise<Map<string, string>> {
  const jugadorIds = [...new Set(inscripciones.flatMap((i) => [i.jugador1_id, i.jugador2_id]).filter(Boolean))] as string[]
  const { data: jugadores, error } = jugadorIds.length
    ? await db.from('jugadores').select('id, nombre').in('id', jugadorIds)
    : { data: [] as { id: string; nombre: string }[], error: null }
  if (error) throw error
  const nombre = new Map((jugadores || []).map((j) => [j.id, j.nombre as string]))
  return new Map(inscripciones.map((i) => [
    i.id,
    i.menor_nombre_publico ?? [i.jugador1_id, i.jugador2_id].filter(Boolean).map((id) => nombre.get(id!) || '—').join(' / '),
  ]))
}

// Publica el sorteo de UNA categoría (SPEC §3): vuelve a validar los grupos
// de la vista previa contra sus equipos activos de ahora, regenera los
// partidos en el servidor y escribe todo en una transacción con
// torneo_publicar_sorteo_categoria (que cierra sus inscripciones y, si era la
// última, pasa el torneo a 'sorteado'). Después avisa a sus jugadores.
// La usan app/api/admin/torneo/sorteo/publicar y scripts/simular-torneo.ts.
export async function publicarSorteo(
  db: SupabaseClient,
  torneo: Torneo,
  categoriaId: string,
  metodo: MetodoSorteo,
  grupos: unknown,
  adminId: string,
): Promise<{ ok: true; torneoSorteado: boolean } | { ok: false; error: string }> {
  if (!['borrador', 'inscripcion'].includes(torneo.estado)) return { ok: false, error: 'El sorteo ya se hizo' }
  if (!Array.isArray(grupos)) return { ok: false, error: 'Falta el sorteo a publicar' }

  const [c] = await datosParaSorteo(db, torneo, categoriaId)
  if (!c) return { ok: false, error: 'Categoría no encontrada' }
  if (c.cancelada_at) return { ok: false, error: `${c.nombre}: la categoría está cancelada` }
  if (c.sorteo_publicado_at) return { ok: false, error: `${c.nombre}: el sorteo ya se publicó` }
  if (c.bloqueos.length) return { ok: false, error: `Antes del sorteo falta resolver: ${c.bloqueos.join(' · ')}` }
  const r = validarGruposSorteo(c, c.inscripciones, metodo, grupos)
  if (!r.ok) return { ok: false, error: r.error }

  const { error } = await db.rpc('torneo_publicar_sorteo_categoria', {
    p_categoria_id: c.id,
    p_metodo: metodo,
    p_admin_id: adminId,
    p_plan: planCategoria(r.sorteo),
  })
  if (error) return { ok: false, error: error.message }

  await avisarSorteo(db, c.id, c.nombre, torneo.nombre)
  const { data: t } = await db.from('torneos').select('estado').eq('id', torneo.id).single()
  return { ok: true, torneoSorteado: t?.estado === 'sorteado' }
}

// Aviso a cada jugador (o representante) de su grupo en la categoría.
// Informativo: si falla no revierte el sorteo.
async function avisarSorteo(db: SupabaseClient, categoriaId: string, categoriaNombre: string, torneoNombre: string) {
  try {
    const { data: grupos, error: errG } = await db
      .from('torneo_grupos')
      .select('id, letra, torneo_grupo_miembros(equipo_id)')
      .eq('categoria_id', categoriaId)
    if (errG) throw errG
    const equipoIds = (grupos || []).flatMap((g: any) => g.torneo_grupo_miembros.map((m: any) => m.equipo_id as string))
    const equipos = await competidoresPorId(db, equipoIds)
    const nombres = await nombresInscripciones(db, [...equipos.values()])

    // Un aviso por persona (un representante puede tener a varios menores en la categoría).
    const porPersona = new Map<string, string[]>()
    for (const g of (grupos || []) as any[]) {
      for (const m of g.torneo_grupo_miembros) {
        const e = equipos.get(m.equipo_id)
        if (!e) continue
        const rivales = g.torneo_grupo_miembros.filter((o: any) => o.equipo_id !== m.equipo_id).map((o: any) => nombres.get(o.equipo_id) || '—')
        const linea = `${categoriaNombre}: grupo ${g.letra}${e.menor_nombre_publico ? ` (${e.menor_nombre_publico})` : ''} con ${rivales.join(', ')}`
        for (const id of personasDe(e)) porPersona.set(id, [...(porPersona.get(id) || []), linea])
      }
    }
    for (const [id, lineas] of porPersona) {
      await notificarJugadores(db, [id], {
        tipo: 'torneo_sorteo',
        mensaje: `🎲 Sorteo del ${torneoNombre}: ${lineas.join(' · ')}. Mira los grupos en Torneo.`,
        asunto: `🎲 Sorteo de ${categoriaNombre} — ${torneoNombre}`,
        cuerpoHtml: () => `
          <p>Ya se hizo el sorteo de <strong>${escaparHtml(categoriaNombre)}</strong> del <strong>${escaparHtml(torneoNombre)}</strong>.</p>
          <ul>${lineas.map((l) => `<li>${escaparHtml(l)}</li>`).join('')}</ul>
          <p>Te avisaremos cuando se publique el calendario con tus partidos.</p>
        `,
      })
    }
  } catch (err: any) {
    console.error('[torneo] No se pudo avisar el sorteo:', err.message)
  }
}
