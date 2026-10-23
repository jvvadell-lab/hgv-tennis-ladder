// Sorteo del torneo — helpers de servidor (reciben el cliente de Supabase con
// service role). Los usan app/api/admin/torneo/sorteo/... La lógica pura
// está en lib/torneoSorteo.ts.

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoInscripcion, Nivel, Torneo } from '@/lib/torneo'
import { escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import { pendientesInscripcion, textoPendiente } from '@/lib/torneoInscripcion'
import { pendientesInscripcionMenor } from '@/lib/torneoInfantil'
import { pendientesQueBloqueanSorteo, planCategoria, validarGruposSorteo, type CategoriaParaSorteo, type InscripcionParaSorteo, type MetodoSorteo, type PlanCategoria } from '@/lib/torneoSorteo'

// Azar del sorteo con el generador criptográfico del servidor (no Math.random).
export const azarSorteo = () => randomInt(0, 2 ** 32) / 2 ** 32

export type CategoriaConInscritas = CategoriaParaSorteo & {
  inscripciones: (InscripcionParaSorteo & { nombre: string; pagoPendiente: boolean })[]
  // Lo que impide sortear la categoría (categoría oficial, certificación,
  // invitado sin autorizar), como texto para el admin. El pago no bloquea.
  bloqueos: string[]
}

// Categorías del torneo con sus inscripciones VIVAS (no retiradas: entran
// al sorteo hayan pagado o no), el nombre para mostrar de cada una y lo
// que todavía bloquea el sorteo.
export async function datosParaSorteo(db: SupabaseClient, torneo: Torneo): Promise<CategoriaConInscritas[]> {
  const { data: categorias, error: errCat } = await db
    .from('torneo_categorias')
    .select('id, nombre, es_infantil, num_grupos, llave_desde, partidos_minimos, orden, categoria_nivel')
    .eq('torneo_id', torneo.id)
    .order('orden')
  if (errCat) throw errCat
  const ids = (categorias || []).map((c) => c.id)
  if (!ids.length) return []

  const { data: inscripciones, error: errIns } = await db
    .from('torneo_inscripciones')
    .select('id, categoria_id, estado, siembra, bombo, jugador1_id, jugador2_id, menor_id, menor_nombre_publico, categoria_certificada_at, invitado_autorizado_at')
    .in('categoria_id', ids)
    .neq('estado', 'retirada')
    .order('created_at')
  if (errIns) throw errIns

  const lista = inscripciones || []
  const jugadorIds = [...new Set(lista.flatMap((i) => [i.jugador1_id, i.jugador2_id]).filter(Boolean))] as string[]
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
  const nombres = await nombresInscripciones(db, lista)

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
            jugadores: [i.jugador1_id, i.jugador2_id].filter(Boolean).map((id) => ({
              id: id!, categoria_torneo: jugadorPorId.get(id!)?.categoria_torneo ?? null, es_invitado: !!jugadorPorId.get(id!)?.es_invitado,
            })),
            soloSocios: torneo.solo_socios, invitadoAutorizado: !!i.invitado_autorizado_at,
          })
      for (const p of pendientesQueBloqueanSorteo(pendientes)) {
        const quien = p.jugadorId === i.menor_id ? i.menor_nombre_publico ?? 'el menor' : jugadorPorId.get(p.jugadorId)?.nombre ?? '—'
        bloqueos.push(`${c.nombre} · ${nombres.get(i.id) || '—'}: ${textoPendiente(p, quien)}`)
      }
    }
    return {
      ...(c as CategoriaParaSorteo),
      bloqueos,
      inscripciones: delaCategoria.map((i) => ({
        id: i.id, siembra: i.siembra, bombo: i.bombo, nombre: nombres.get(i.id) || '—', pagoPendiente: i.estado !== 'confirmada',
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

// Publica el sorteo (SPEC §3): vuelve a validar los grupos de la vista
// previa contra las inscripciones vivas de ahora, regenera los partidos en
// el servidor y escribe todo en una transacción con torneo_publicar_sorteo
// (que también pasa el torneo a 'sorteado'). Después avisa a cada jugador.
// La usan app/api/admin/torneo/sorteo/publicar y scripts/simular-torneo.ts.
export async function publicarSorteo(
  db: SupabaseClient,
  torneo: Torneo,
  metodo: MetodoSorteo,
  grupos: unknown,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!['borrador', 'inscripcion'].includes(torneo.estado)) return { ok: false, error: 'El sorteo ya se hizo' }
  if (!grupos || typeof grupos !== 'object') return { ok: false, error: 'Falta el sorteo a publicar' }

  const categorias = await datosParaSorteo(db, torneo)
  const bloqueos = categorias.flatMap((c) => c.bloqueos)
  if (bloqueos.length) return { ok: false, error: `Antes del sorteo falta resolver: ${bloqueos.join(' · ')}` }
  const planes: PlanCategoria[] = []
  for (const c of categorias) {
    const r = validarGruposSorteo(c, c.inscripciones, metodo, (grupos as Record<string, unknown>)[c.id])
    if (!r.ok) return { ok: false, error: r.error }
    planes.push(planCategoria(r.sorteo))
  }

  const { error } = await db.rpc('torneo_publicar_sorteo', {
    p_torneo_id: torneo.id,
    p_metodo: metodo,
    p_admin_id: adminId,
    p_plan: planes,
  })
  if (error) return { ok: false, error: error.message }

  await avisarSorteo(db, torneo.id, torneo.nombre)
  return { ok: true }
}

// Aviso a cada jugador (o representante) de su grupo. Informativo: si falla
// no revierte el sorteo.
async function avisarSorteo(db: SupabaseClient, torneoId: string, torneoNombre: string) {
  try {
    const { data: categorias, error: errCat } = await db.from('torneo_categorias').select('id, nombre').eq('torneo_id', torneoId)
    if (errCat) throw errCat
    const nombreCat = new Map((categorias || []).map((c) => [c.id, c.nombre as string]))
    const { data: grupos, error: errG } = await db.from('torneo_grupos').select('id, letra, categoria_id').in('categoria_id', [...nombreCat.keys()])
    if (errG) throw errG
    const grupoPorId = new Map((grupos || []).map((g) => [g.id, g]))
    const { data: miembros, error: errM } = await db
      .from('torneo_grupo_miembros')
      .select('grupo_id, torneo_inscripciones(jugador1_id, jugador2_id, menor_nombre_publico, torneo_menores(representante_jugador_id))')
      .in('grupo_id', [...grupoPorId.keys()])
    if (errM) throw errM

    // Un aviso por persona, con todos sus grupos (puede jugar 2 categorías o representar a varios).
    const porPersona = new Map<string, string[]>()
    for (const m of (miembros || []) as any[]) {
      const ins = m.torneo_inscripciones
      const g = grupoPorId.get(m.grupo_id)!
      const linea = `${nombreCat.get(g.categoria_id)}: grupo ${g.letra}${ins.menor_nombre_publico ? ` (${ins.menor_nombre_publico})` : ''}`
      const personas: (string | null)[] = ins.menor_nombre_publico ? [ins.torneo_menores?.representante_jugador_id] : [ins.jugador1_id, ins.jugador2_id]
      for (const id of personas.filter(Boolean) as string[]) porPersona.set(id, [...(porPersona.get(id) || []), linea])
    }
    for (const [id, lineas] of porPersona) {
      await notificarJugadores(db, [id], {
        tipo: 'torneo_sorteo',
        mensaje: `🎲 Sorteo del ${torneoNombre}: ${lineas.join(' · ')}. Mira los grupos en Torneo.`,
        asunto: `🎲 Sorteo de grupos — ${torneoNombre}`,
        cuerpoHtml: () => `
          <p>Ya se hizo el sorteo de los grupos del <strong>${escaparHtml(torneoNombre)}</strong>.</p>
          <ul>${lineas.map((l) => `<li>${escaparHtml(l)}</li>`).join('')}</ul>
          <p>Te avisaremos cuando se publique el calendario con tus partidos.</p>
        `,
      })
    }
  } catch (err: any) {
    console.error('[torneo] No se pudo avisar el sorteo:', err.message)
  }
}
