// Resultados, WO y avance automático del torneo — helpers de servidor
// (reciben el cliente de Supabase con service role). Los usan las rutas
// app/api/jugador/torneo/... y app/api/admin/torneo/resultados/..., y
// scripts/simular-torneo.ts, para que la simulación pase por el mismo
// código que la app. La lógica pura está en lib/torneoResultados.ts.
//
// Flujo (SPEC §5): un jugador de cualquiera de las dos inscripciones (o el
// representante de un menor) reporta → el admin valida. Solo lo validado
// cuenta para la tabla y la llave. El admin también puede cargar y validar
// de una vez, y marcar WO / doble WO (SPEC §6).
//
// El avance (SPEC §8) se recalcula siempre desde el estado de la base: es
// idempotente, así que volver a llamarlo repara cualquier corte a mitad.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ahora } from '@/lib/tiempo'
import { ETIQUETA_FASE, type EstadoTorneo, type Fase } from '@/lib/torneo'
import {
  avanceGrupo,
  avanceMejoresPrimeros,
  avanceLlave,
  evaluarReporte,
  pasesPorVacante,
  partidoCerrado,
  type CambioAvance,
  type DatosReporte,
  type PartidoAvance,
} from '@/lib/torneoResultados'
import { escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import { competidoresPorId, pagosPendientes, personasDe } from '@/lib/torneoEquiposServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'

export const COLUMNAS_PARTIDO =
  'id, categoria_id, fase, grupo_id, orden, origen_a, origen_b, equipo_a, equipo_b, cancha, fecha_hora, estado, sets, tipo_resultado, retirada_equipo_id, ganador_equipo_id, wo_ausente_equipo_id, validado, reportado_por, reportado_at'

export type PartidoFila = PartidoAvance & {
  categoria_id: string
  cancha: string | null
  fecha_hora: string | null
  reportado_por: string | null
  reportado_at: string | null
}

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number }

const ESTADOS_CON_RESULTADOS: EstadoTorneo[] = ['sorteado', 'en_curso']

async function cargarPartido(db: SupabaseClient, partidoId: string) {
  const { data, error } = await db
    .from('torneo_partidos')
    .select(`${COLUMNAS_PARTIDO}, torneo_categorias:categoria_id(nombre, torneo_id, torneos:torneo_id(id, nombre, estado))`)
    .eq('id', partidoId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const cat = data.torneo_categorias as unknown as { nombre: string; torneo_id: string; torneos: { id: string; nombre: string; estado: EstadoTorneo } }
  return { partido: data as unknown as PartidoFila, categoriaNombre: cat.nombre, torneo: cat.torneos }
}

// Personas de cada equipo (los ids de partidos y grupos son equipos): sus
// jugadores o, si es de un menor, su representante. Sirve para saber quién
// puede reportar y a quién avisar.
export async function personasDeInscripciones(db: SupabaseClient, ids: string[]): Promise<Map<string, string[]>> {
  const equipos = await competidoresPorId(db, ids)
  return new Map([...equipos].map(([id, e]) => [id, personasDe(e)]))
}

const nombrePartido = (fase: Fase, categoria: string) => `${categoria} — ${ETIQUETA_FASE[fase]}`

// --- Reportar ---------------------------------------------------------------

// Un jugador (o el representante de un menor) reporta el resultado. Si ya
// había un reporte sin validar, se reemplaza. porJugadorId = null cuando lo
// carga el admin (cargarYValidar).
export async function reportarResultado(
  db: SupabaseClient,
  p: { partidoId: string; porJugadorId: string | null; datos: DatosReporte },
): Promise<Resultado<{ ganador: string }>> {
  const c = await cargarPartido(db, p.partidoId)
  if (!c) return { ok: false, error: 'Partido no encontrado', status: 404 }
  const { partido } = c
  if (!ESTADOS_CON_RESULTADOS.includes(c.torneo.estado)) {
    return { ok: false, error: 'El torneo no está en juego: todavía no se pueden cargar resultados', status: 400 }
  }

  const personas = await personasDeInscripciones(db, [partido.equipo_a!, partido.equipo_b!])
  if (p.porJugadorId) {
    const propias = [...(personas.get(partido.equipo_a!) ?? []), ...(personas.get(partido.equipo_b!) ?? [])]
    if (!propias.includes(p.porJugadorId)) return { ok: false, error: 'Solo los jugadores de este partido pueden reportar su resultado', status: 403 }
  }

  const r = evaluarReporte(partido, p.datos)
  if (!r.ok) return { ok: false, error: r.error, status: 400 }

  const { error } = await db
    .from('torneo_partidos')
    .update({
      estado: 'jugado',
      sets: p.datos.sets,
      tipo_resultado: p.datos.tipoResultado,
      retirada_equipo_id: p.datos.tipoResultado === 'retiro' ? p.datos.retiradaInscripcionId : null,
      ganador_equipo_id: r.ganador,
      wo_ausente_equipo_id: null,
      reportado_por: p.porJugadorId,
      reportado_at: ahora().toISOString(),
      validado: false,
      validado_at: null,
      validado_por: null,
    })
    .eq('id', partido.id)
    .eq('validado', false)
  if (error) throw error

  // Aviso al rival (y al compañero): el resultado queda por validar.
  if (p.porJugadorId) {
    const otros = [...(personas.get(partido.equipo_a!) ?? []), ...(personas.get(partido.equipo_b!) ?? [])]
      .filter((id) => id !== p.porJugadorId)
    await notificarJugadores(db, otros, {
      tipo: 'torneo_resultado_reportado',
      mensaje: `🎾 Se reportó el resultado de tu partido de ${nombrePartido(partido.fase, c.categoriaNombre)}. Queda por validar.`,
      asunto: `🎾 Resultado reportado — ${c.torneo.nombre}`,
      cuerpoHtml: () => `<p>Se reportó el resultado de tu partido de <strong>${escaparHtml(nombrePartido(partido.fase, c.categoriaNombre))}</strong>. Si no es correcto, avísale al admin antes de que lo valide.</p>`,
    })
  }
  return { ok: true, ganador: r.ganador }
}

// --- Validar / cargar / WO --------------------------------------------------

async function marcarEnCurso(db: SupabaseClient, torneoId: string) {
  const { error } = await db.from('torneos').update({ estado: 'en_curso' }).eq('id', torneoId).eq('estado', 'sorteado')
  if (error) throw error
}

export async function validarResultado(
  db: SupabaseClient,
  p: { partidoId: string; adminId: string },
): Promise<Resultado<{ avisos: string[] }>> {
  const c = await cargarPartido(db, p.partidoId)
  if (!c) return { ok: false, error: 'Partido no encontrado', status: 404 }
  const { partido } = c
  if (partido.validado) return { ok: false, error: 'Ese resultado ya estaba validado', status: 400 }
  if (partido.estado !== 'jugado' || !partido.reportado_at) return { ok: false, error: 'Ese partido no tiene un resultado reportado', status: 400 }

  const { error } = await db
    .from('torneo_partidos')
    .update({ validado: true, validado_at: ahora().toISOString(), validado_por: p.adminId })
    .eq('id', partido.id)
    .eq('validado', false)
  if (error) throw error

  await marcarEnCurso(db, c.torneo.id)
  const avance = await avanzarCategoria(db, partido.categoria_id, p.adminId)
  await avisarResultadoValidado(db, partido, c.categoriaNombre, c.torneo.nombre)
  return { ok: true, avisos: avance.avisos }
}

// El admin carga el resultado y lo valida de una vez.
export async function cargarYValidar(
  db: SupabaseClient,
  p: { partidoId: string; adminId: string; datos: DatosReporte },
): Promise<Resultado<{ avisos: string[] }>> {
  const r = await reportarResultado(db, { partidoId: p.partidoId, porJugadorId: null, datos: p.datos })
  if (!r.ok) return r
  return validarResultado(db, { partidoId: p.partidoId, adminId: p.adminId })
}

// WO (SPEC §6): ausente = la inscripción que no se presentó, o 'ambos'
// (doble WO). Lo marca el admin y queda validado.
export async function registrarWO(
  db: SupabaseClient,
  p: { partidoId: string; adminId: string; ausente: string },
): Promise<Resultado<{ avisos: string[] }>> {
  const c = await cargarPartido(db, p.partidoId)
  if (!c) return { ok: false, error: 'Partido no encontrado', status: 404 }
  const { partido } = c
  if (!ESTADOS_CON_RESULTADOS.includes(c.torneo.estado)) {
    return { ok: false, error: 'El torneo no está en juego: todavía no se pueden cargar resultados', status: 400 }
  }
  if (partido.validado) return { ok: false, error: 'Este partido ya tiene un resultado validado', status: 400 }
  const { equipo_a: a, equipo_b: b } = partido
  if (!a || !b) return { ok: false, error: 'Todavía no se conocen los dos rivales de este partido', status: 400 }

  const doble = p.ausente === 'ambos'
  if (!doble && p.ausente !== a && p.ausente !== b) return { ok: false, error: 'Indica quién no se presentó', status: 400 }

  const momento = ahora().toISOString()
  const { error } = await db
    .from('torneo_partidos')
    .update({
      estado: doble ? 'doble_wo' : 'wo',
      sets: null,
      tipo_resultado: 'normal',
      retirada_equipo_id: null,
      ganador_equipo_id: doble ? null : p.ausente === a ? b : a,
      wo_ausente_equipo_id: doble ? null : p.ausente,
      reportado_por: null,
      reportado_at: momento,
      validado: true,
      validado_at: momento,
      validado_por: p.adminId,
    })
    .eq('id', partido.id)
    .eq('validado', false)
  if (error) throw error

  await marcarEnCurso(db, c.torneo.id)
  const avance = await avanzarCategoria(db, partido.categoria_id, p.adminId)
  await avisarResultadoValidado(db, { ...partido, estado: doble ? 'doble_wo' : 'wo' }, c.categoriaNombre, c.torneo.nombre)
  return { ok: true, avisos: avance.avisos }
}

// Desempate manual del admin (SPEC §7.4): el orden de las inscripciones
// que siguen empatadas. Después vuelve a correr el avance del grupo.
export async function fijarDesempate(
  db: SupabaseClient,
  p: { grupoId: string; orden: string[]; adminId: string },
): Promise<Resultado<{ avisos: string[] }>> {
  const { data: grupo, error } = await db
    .from('torneo_grupos')
    .select('id, categoria_id, torneo_grupo_miembros(equipo_id)')
    .eq('id', p.grupoId)
    .maybeSingle()
  if (error) throw error
  if (!grupo) return { ok: false, error: 'Grupo no encontrado', status: 404 }
  const miembros = new Set((grupo.torneo_grupo_miembros as { equipo_id: string }[]).map((m) => m.equipo_id))
  if (!p.orden.length || new Set(p.orden).size !== p.orden.length || p.orden.some((id) => !miembros.has(id))) {
    return { ok: false, error: 'El orden tiene que ser de inscripciones del grupo, sin repetir', status: 400 }
  }
  for (const [i, id] of p.orden.entries()) {
    const { error: errU } = await db.from('torneo_grupo_miembros').update({ desempate_manual: i + 1 }).eq('grupo_id', p.grupoId).eq('equipo_id', id)
    if (errU) throw errU
  }
  const avance = await avanzarCategoria(db, grupo.categoria_id, p.adminId)
  return { ok: true, avisos: avance.avisos }
}

// --- Avance automático ------------------------------------------------------

// Aplica el avance de toda la categoría hasta que no haya más cambios (un
// pase por WO puede habilitar otro avance). Avisa a los jugadores que ya
// conocen a su rival.
export async function avanzarCategoria(db: SupabaseClient, categoriaId: string, adminId: string): Promise<{ avisos: string[] }> {
  const avisos = new Set<string>()
  const completados = new Set<string>()   // partidos de llave que quedaron con los 2 rivales

  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const [{ data: partidos, error: errP }, { data: grupos, error: errG }] = await Promise.all([
      db.from('torneo_partidos').select(COLUMNAS_PARTIDO).eq('categoria_id', categoriaId),
      db.from('torneo_grupos').select('id, letra, torneo_grupo_miembros(equipo_id, desempate_manual)').eq('categoria_id', categoriaId),
    ])
    if (errP) throw errP
    if (errG) throw errG
    const todos = (partidos || []) as unknown as PartidoFila[]
    const llave = todos.filter((p) => p.fase !== 'grupo')

    const cambios: CambioAvance[] = []
    for (const g of grupos || []) {
      const r = avanceGrupo({ id: g.id, letra: g.letra }, todos, g.torneo_grupo_miembros as any, llave)
      cambios.push(...r.cambios)
      r.avisos.forEach((a) => avisos.add(a))
    }
    const mejores = avanceMejoresPrimeros(
      (grupos || []).map((g: any) => ({ id: g.id, letra: g.letra, miembros: g.torneo_grupo_miembros })), todos, llave)
    cambios.push(...mejores.cambios)
    mejores.avisos.forEach((a) => avisos.add(a))
    for (const p of llave.filter(partidoCerrado)) cambios.push(...avanceLlave(p, llave).cambios)
    cambios.push(...pasesPorVacante(llave))
    if (!cambios.length) break

    const momento = ahora().toISOString()
    for (const cambio of cambios) {
      const actual = llave.find((p) => p.id === cambio.partidoId)
      if (!actual || actual.validado) continue
      if (cambio.tipo === 'asignar') {
        const { error } = await db
          .from('torneo_partidos')
          .update(cambio.lado === 'a' ? { equipo_a: cambio.inscripcionId } : { equipo_b: cambio.inscripcionId })
          .eq('id', cambio.partidoId)
          .eq('validado', false)
        if (error) throw error
        const otro = cambio.lado === 'a' ? actual.equipo_b : actual.equipo_a
        if (otro) completados.add(cambio.partidoId)
      } else {
        const { error } = await db
          .from('torneo_partidos')
          .update({
            estado: cambio.tipo === 'pase' ? 'wo' : 'doble_wo',
            ganador_equipo_id: cambio.tipo === 'pase' ? cambio.ganador : null,
            wo_ausente_equipo_id: null,
            sets: null,
            validado: true,
            validado_at: momento,
            validado_por: adminId,
          })
          .eq('id', cambio.partidoId)
          .eq('validado', false)
        if (error) throw error
        avisos.add(cambio.tipo === 'pase'
          ? `${ETIQUETA_FASE[actual.fase]}: un lado venía de un doble WO, el otro pasa por WO`
          : `${ETIQUETA_FASE[actual.fase]}: los dos lados venían de doble WO`)
      }
    }
  }

  if (completados.size) await avisarRivalConocido(db, [...completados])
  return { avisos: [...avisos] }
}

// --- Avisos -----------------------------------------------------------------

async function avisarResultadoValidado(db: SupabaseClient, partido: PartidoFila, categoriaNombre: string, torneoNombre: string) {
  const personas = await personasDeInscripciones(db, [partido.equipo_a!, partido.equipo_b!])
  const ids = [...new Set([...(personas.get(partido.equipo_a!) ?? []), ...(personas.get(partido.equipo_b!) ?? [])])]
  const que = partido.estado === 'doble_wo' ? 'doble WO' : partido.estado === 'wo' ? 'WO' : 'el resultado'
  await notificarJugadores(db, ids, {
    tipo: 'torneo_resultado_validado',
    mensaje: `✅ Se validó ${que} de tu partido de ${nombrePartido(partido.fase, categoriaNombre)}.`,
    asunto: `✅ Resultado validado — ${torneoNombre}`,
    cuerpoHtml: () => `<p>Se validó ${que} de tu partido de <strong>${escaparHtml(nombrePartido(partido.fase, categoriaNombre))}</strong>. Puedes ver la tabla y la llave en la app, en <strong>Torneo</strong>.</p>`,
  })
}

async function avisarRivalConocido(db: SupabaseClient, partidoIds: string[]) {
  const { data, error } = await db
    .from('torneo_partidos')
    .select('id, fase, equipo_a, equipo_b, torneo_categorias:categoria_id(nombre, torneos:torneo_id(nombre))')
    .in('id', partidoIds)
  if (error) throw error
  const inscripcionIds = (data || []).flatMap((p) => [p.equipo_a, p.equipo_b]).filter(Boolean) as string[]
  const nombres = await nombresInscripciones(db, [...(await competidoresPorId(db, inscripcionIds)).values()])
  const personas = await personasDeInscripciones(db, inscripcionIds)

  for (const p of data || []) {
    if (!p.equipo_a || !p.equipo_b) continue
    const cat = p.torneo_categorias as unknown as { nombre: string; torneos: { nombre: string } }
    for (const [mia, rival] of [[p.equipo_a, p.equipo_b], [p.equipo_b, p.equipo_a]]) {
      const nombreRival = nombres.get(rival) || 'tu rival'
      await notificarJugadores(db, personas.get(mia) ?? [], {
        tipo: 'torneo_rival_conocido',
        mensaje: `🎾 ${nombrePartido(p.fase as Fase, cat.nombre)}: tu rival es ${nombreRival}.`,
        asunto: `🎾 Ya conoces a tu rival — ${cat.torneos.nombre}`,
        cuerpoHtml: () => `<p>En <strong>${escaparHtml(nombrePartido(p.fase as Fase, cat.nombre))}</strong> tu rival es <strong>${escaparHtml(nombreRival)}</strong>. Revisa el horario en la app, en <strong>Torneo</strong>.</p>`,
      })
    }
  }
}

// --- Listas para las pantallas ----------------------------------------------

export type PartidoLista = PartidoFila & {
  categoria_nombre: string
  categoria_orden: number
  grupo_letra: string | null
  nombre_a: string | null
  nombre_b: string | null
  // Sin pago validado: no pueden jugar su primer partido (se marca en rojo).
  pago_pendiente: string[]
}

// Partidos del torneo con nombres públicos (para "Mis partidos" y la
// pestaña Torneo del admin). soloInscripciones filtra a los de esas
// inscripciones.
export async function listarPartidos(db: SupabaseClient, torneoId: string, soloInscripciones?: string[]): Promise<PartidoLista[]> {
  const { data: categorias, error: errC } = await db.from('torneo_categorias').select('id, nombre, orden').eq('torneo_id', torneoId)
  if (errC) throw errC
  const catPorId = new Map((categorias || []).map((c) => [c.id, c]))
  if (!catPorId.size) return []

  let q = db.from('torneo_partidos').select(COLUMNAS_PARTIDO).in('categoria_id', [...catPorId.keys()])
  if (soloInscripciones) {
    if (!soloInscripciones.length) return []
    const lista = soloInscripciones.join(',')
    q = q.or(`equipo_a.in.(${lista}),equipo_b.in.(${lista})`)
  }
  const [{ data: partidos, error: errP }, { data: grupos, error: errG }] = await Promise.all([
    q,
    db.from('torneo_grupos').select('id, letra').in('categoria_id', [...catPorId.keys()]),
  ])
  if (errP) throw errP
  if (errG) throw errG
  const letra = new Map((grupos || []).map((g) => [g.id, g.letra]))

  const inscripcionIds = [...new Set((partidos || []).flatMap((p: any) => [p.equipo_a, p.equipo_b]).filter(Boolean))] as string[]
  const equipos = [...(await competidoresPorId(db, inscripcionIds)).values()]
  const nombres = await nombresInscripciones(db, equipos)
  const sinPago = await pagosPendientes(db, equipos)

  const ordenFase: Record<Fase, number> = { grupo: 0, cuartos: 1, semis: 2, final: 3 }
  return ((partidos || []) as unknown as PartidoFila[])
    .map((p) => ({
      ...p,
      categoria_nombre: catPorId.get(p.categoria_id)!.nombre,
      categoria_orden: catPorId.get(p.categoria_id)!.orden,
      grupo_letra: p.grupo_id ? letra.get(p.grupo_id) ?? null : null,
      nombre_a: p.equipo_a ? nombres.get(p.equipo_a) ?? null : null,
      nombre_b: p.equipo_b ? nombres.get(p.equipo_b) ?? null : null,
      pago_pendiente: [...(p.equipo_a ? sinPago.get(p.equipo_a) ?? [] : []), ...(p.equipo_b ? sinPago.get(p.equipo_b) ?? [] : [])],
    }))
    .sort((x, y) =>
      x.categoria_orden - y.categoria_orden ||
      ordenFase[x.fase] - ordenFase[y.fase] ||
      (x.grupo_letra ?? '').localeCompare(y.grupo_letra ?? '') ||
      x.orden - y.orden)
}

// Equipos del torneo de un jugador (los suyos y los de los menores que
// representa): es lo que aparece en grupos y partidos.
export async function inscripcionesDeJugador(db: SupabaseClient, torneoId: string, jugadorId: string): Promise<string[]> {
  const { data: categorias, error: errC } = await db.from('torneo_categorias').select('id').eq('torneo_id', torneoId)
  if (errC) throw errC
  const catIds = (categorias || []).map((c) => c.id)
  if (!catIds.length) return []
  const { data: menores, error: errM } = await db.from('torneo_menores').select('id').eq('representante_jugador_id', jugadorId)
  if (errM) throw errM
  const filtros = [`jugador1_id.eq.${jugadorId}`, ...(menores || []).map((m) => `menor_id.eq.${m.id}`)]
  const { data, error } = await db
    .from('torneo_inscripciones')
    .select('id')
    .in('categoria_id', catIds)
    .neq('estado', 'retirada')
    .or(filtros.join(','))
  if (error) throw error
  const ins = (data || []).map((i) => i.id)
  if (!ins.length) return []
  const lista = ins.join(',')
  const { data: equipos, error: errE } = await db
    .from('torneo_equipos')
    .select('id')
    .eq('estado', 'activo')
    .or(`inscripcion1_id.in.(${lista}),inscripcion2_id.in.(${lista})`)
  if (errE) throw errE
  return (equipos || []).map((e) => e.id)
}
