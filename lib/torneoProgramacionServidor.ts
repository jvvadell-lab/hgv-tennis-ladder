// Programación del torneo — helpers de servidor (reciben el cliente de
// Supabase con service role). Los usan app/api/admin/torneo/programacion/...
// La lógica pura (turnos, reglas y asistente) está en lib/torneoProgramacion.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_RETO_OCUPAN_CANCHA } from '@/lib/choquesCancha'
import { DURACION_RETO_MIN, DURACION_SINGLE_MIN, ESTADOS_RESERVA_OCUPAN_CANCHA } from '@/lib/reservas'
import { ahora, formatearFechaHora, instanteEnCaracas, sumarDiasEnCaracas } from '@/lib/tiempo'
import { CANCHAS_TORNEO, ETIQUETA_FASE, crucesTodosContraTodos, type CanchaTorneo, type EstadoPartido, type Fase, type Torneo } from '@/lib/torneo'
import { codigoPartido, dependenciasDe, etiquetaPartido, revisarHorario, type ContextoProgramacion, type Franja, type Horario, type Ocupacion, type PartidoProg } from '@/lib/torneoProgramacion'
import { escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import { competidoresPorId, pagosPendientes, personasDe } from '@/lib/torneoEquiposServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'

export type PartidoDetalle = PartidoProg & {
  estado: EstadoPartido
  // Jugado, pero terminó por retiro de una de las parejas.
  retiro: boolean
  esMixto: boolean
  equipo_a: string | null
  equipo_b: string | null
  nombre_a: string | null
  nombre_b: string | null
  handicap_equipo_id: string | null
  // Personas a avisar: jugadores y, por cada menor, su representante.
  avisar: string[]
  // Sin pago validado (no pueden jugar su primer partido): se marca en rojo.
  pagoPendiente: string[]
}

export type DatosProgramacion = {
  ctx: ContextoProgramacion
  horarios: Map<string, Horario>
  partidos: PartidoDetalle[]
}

export async function datosProgramacion(db: SupabaseClient, torneo: Torneo): Promise<DatosProgramacion> {
  const { data: categorias, error: errCat } = await db
    .from('torneo_categorias')
    .select('id, nombre, orden, es_infantil, duracion_min, genero')
    .eq('torneo_id', torneo.id)
  if (errCat) throw errCat
  const catPorId = new Map((categorias || []).map((c) => [c.id, c]))
  const categoriaIds = [...catPorId.keys()]

  const [{ data: partidos, error: errP }, { data: grupos, error: errG }, { data: franjas, error: errF }, { data: disp, error: errD }] = await Promise.all([
    db.from('torneo_partidos')
      .select('id, categoria_id, fase, grupo_id, orden, origen_a, origen_b, equipo_a, equipo_b, cancha, fecha_hora, estado, tipo_resultado, bloqueo_id, handicap_equipo_id')
      .in('categoria_id', categoriaIds),
    db.from('torneo_grupos').select('id, letra, torneo_grupo_miembros(equipo_id)').in('categoria_id', categoriaIds),
    db.from('torneo_franjas_academia').select('id, fecha, cancha, hora_inicio, hora_fin').eq('torneo_id', torneo.id),
    db.from('torneo_disponibilidad').select('jugador_id, no_disponible').eq('torneo_id', torneo.id),
  ])
  if (errP) throw errP
  if (errG) throw errG
  if (errF) throw errF
  if (errD) throw errD

  const inscripcionIds = [...new Set((partidos || []).flatMap((p) => [p.equipo_a, p.equipo_b]).filter(Boolean))] as string[]
  // Los rivales son equipos (la dupla, o la inscripción en single/infantil).
  const insPorId = await competidoresPorId(db, inscripcionIds)
  const nombres = await nombresInscripciones(db, [...insPorId.values()])
  const sinPago = await pagosPendientes(db, [...insPorId.values()])

  const grupoPorId = new Map((grupos || []).map((g: any) => [g.id, { letra: g.letra as string, tamano: (g.torneo_grupo_miembros || []).length as number }]))

  // Para los choques de horario, un menor cuenta como persona propia.
  const personasCuadro = (equipoId: string | null): string[] => {
    const e = equipoId ? insPorId.get(equipoId) : null
    if (!e) return []
    return e.menor_id ? [`m:${e.menor_id}`] : ([e.jugador1_id, e.jugador2_id].filter(Boolean) as string[])
  }
  const avisarDe = (equipoId: string | null): string[] => {
    const e = equipoId ? insPorId.get(equipoId) : null
    return e ? personasDe(e) : []
  }

  const detalle: PartidoDetalle[] = (partidos || []).map((p) => {
    const c = catPorId.get(p.categoria_id)!
    const g = p.grupo_id ? grupoPorId.get(p.grupo_id) : null
    return {
      id: p.id,
      categoriaId: p.categoria_id,
      categoriaNombre: c.nombre,
      categoriaOrden: c.orden,
      esInfantil: c.es_infantil,
      esMixto: c.genero === 'mixto',
      duracionMin: c.duracion_min,
      fase: p.fase as Fase,
      grupoLetra: g?.letra ?? null,
      orden: p.orden,
      ronda: g && g.tamano >= 2 ? crucesTodosContraTodos(g.tamano)[p.orden - 1]?.ronda ?? null : null,
      origen_a: p.origen_a,
      origen_b: p.origen_b,
      personas: [...personasCuadro(p.equipo_a), ...personasCuadro(p.equipo_b)],
      cerrado: ['jugado', 'wo', 'doble_wo'].includes(p.estado),
      estado: p.estado as EstadoPartido,
      retiro: p.estado === 'jugado' && p.tipo_resultado === 'retiro',
      equipo_a: p.equipo_a,
      equipo_b: p.equipo_b,
      nombre_a: p.equipo_a ? nombres.get(p.equipo_a) ?? null : null,
      nombre_b: p.equipo_b ? nombres.get(p.equipo_b) ?? null : null,
      handicap_equipo_id: p.handicap_equipo_id,
      avisar: [...new Set([...avisarDe(p.equipo_a), ...avisarDe(p.equipo_b)])],
      pagoPendiente: [...(p.equipo_a ? sinPago.get(p.equipo_a) ?? [] : []), ...(p.equipo_b ? sinPago.get(p.equipo_b) ?? [] : [])],
    }
  })

  const horarios = new Map<string, Horario>()
  for (const p of partidos || []) {
    if (p.cancha && p.fecha_hora) horarios.set(p.id, { cancha: p.cancha as CanchaTorneo, inicio: new Date(p.fecha_hora).getTime() })
  }

  const propios = new Set((partidos || []).map((p) => p.bloqueo_id).filter(Boolean))
  const ocupaciones = await ocupacionesDelClub(db, torneo, propios as Set<string>)

  const noDisponible: Record<string, string[]> = {}
  for (const d of disp || []) noDisponible[d.jugador_id] = d.no_disponible || []

  return {
    ctx: {
      fechaInicio: torneo.fecha_inicio,
      fechaFin: torneo.fecha_fin,
      partidos: detalle,
      franjas: (franjas || []).map((f) => ({ ...f, hora_inicio: f.hora_inicio.slice(0, 5), hora_fin: f.hora_fin.slice(0, 5) })) as Franja[],
      ocupaciones,
      noDisponible,
    },
    horarios,
    partidos: detalle,
  }
}

// Bloqueos del club (menos los de los propios partidos del torneo), reservas
// y retos que ocupan HGV1/HGV2 durante el torneo.
async function ocupacionesDelClub(db: SupabaseClient, torneo: Torneo, bloqueosPropios: Set<string>): Promise<Ocupacion[]> {
  const desde = instanteEnCaracas(torneo.fecha_inicio).toISOString()
  const hasta = sumarDiasEnCaracas(instanteEnCaracas(torneo.fecha_fin), 1).toISOString()
  const canchas = ['HGV1', 'HGV2']
  const [{ data: bloqueos, error: errB }, { data: reservas, error: errR }, { data: retos, error: errT }] = await Promise.all([
    db.from('bloqueos_cancha').select('id, cancha, inicio, fin, motivo').in('cancha', canchas).lt('inicio', hasta).gt('fin', desde),
    db.from('reservas_cancha').select('cancha, fecha_hora, duracion_min').in('cancha', canchas).in('estado', ESTADOS_RESERVA_OCUPAN_CANCHA).gte('fecha_hora', desde).lt('fecha_hora', hasta),
    db.from('retos').select('cancha, fecha_propuesta').in('cancha', canchas).in('estado', ESTADOS_RETO_OCUPAN_CANCHA).gte('fecha_propuesta', desde).lt('fecha_propuesta', hasta),
  ])
  if (errB) throw errB
  if (errR) throw errR
  if (errT) throw errT
  return [
    ...(bloqueos || []).filter((b) => !bloqueosPropios.has(b.id)).map((b) => ({
      cancha: b.cancha, inicio: new Date(b.inicio).getTime(), fin: new Date(b.fin).getTime(), motivo: b.motivo, tipo: 'bloqueo' as const,
    })),
    ...(reservas || []).map((r) => {
      const inicio = new Date(r.fecha_hora).getTime()
      return { cancha: r.cancha, inicio, fin: inicio + (r.duracion_min || DURACION_SINGLE_MIN) * 60000, motivo: 'reserva de socio', tipo: 'reserva' as const }
    }),
    ...(retos || []).map((r) => {
      const inicio = new Date(r.fecha_propuesta).getTime()
      return { cancha: r.cancha, inicio, fin: inicio + DURACION_RETO_MIN * 60000, motivo: 'reto de la escalera', tipo: 'reto' as const }
    }),
  ]
}

// "Pelota Naranja · Grupo A" / "Doble Masculino Sexta · Semifinal (S1)".
export function nombrePartido(p: Pick<PartidoDetalle, 'categoriaNombre' | 'fase' | 'grupoLetra' | 'orden'>): string {
  return p.fase === 'grupo'
    ? `${p.categoriaNombre} · Grupo ${p.grupoLetra}`
    : `${p.categoriaNombre} · ${ETIQUETA_FASE[p.fase]} (${codigoPartido(p)})`
}

// Avisa a cada jugador o representante (campana + correo) de sus partidos
// con horario. `soloPartidos` limita el aviso a esos partidos (cambios
// después de publicar); `titulo` cambia el asunto.
export async function avisarProgramacion(
  db: SupabaseClient,
  torneoNombre: string,
  partidos: PartidoDetalle[],
  horarios: Map<string, Horario>,
  opciones: { cambio: boolean },
): Promise<void> {
  const porPersona = new Map<string, string[]>()
  for (const p of partidos) {
    const h = horarios.get(p.id)
    const rival = p.nombre_a && p.nombre_b ? `${p.nombre_a} vs ${p.nombre_b}` : 'rival por definir'
    const linea = h
      ? `${nombrePartido(p)}: ${rival} — ${formatearFechaHora(new Date(h.inicio))}, ${h.cancha}`
      : `${nombrePartido(p)}: ${rival} — sin horario por ahora`
    for (const id of p.avisar) porPersona.set(id, [...(porPersona.get(id) || []), linea])
  }
  for (const [id, lineas] of porPersona) {
    await notificarJugadores(db, [id], {
      tipo: 'torneo_programacion',
      mensaje: opciones.cambio
        ? `📅 Cambio de horario en el ${torneoNombre}: ${lineas.join(' · ')}`
        : `📅 Ya está el calendario del ${torneoNombre}: ${lineas.length} partido${lineas.length === 1 ? '' : 's'}. ${lineas[0]}${lineas.length > 1 ? '…' : ''}`,
      asunto: opciones.cambio ? `📅 Cambio de horario — ${torneoNombre}` : `📅 Tus partidos — ${torneoNombre}`,
      cuerpoHtml: () => `
        <p>${opciones.cambio ? 'Cambió el horario de' : 'Ya está publicado el calendario del'} <strong>${escaparHtml(torneoNombre)}</strong>${opciones.cambio ? ':' : '. Tus partidos:'}</p>
        <ul>${lineas.map((l) => `<li>${escaparHtml(l)}</li>`).join('')}</ul>
        <p>Tolerancia de 15 minutos: pasado ese tiempo se declara WO a favor del rival. Si no puedes en algún horario, avísale al admin cuanto antes.</p>
      `,
    })
  }
}

// --- Guardar y publicar (los usan las rutas .../programacion/guardar y
// .../publicar, y scripts/simular-torneo.ts) ---------------------------------

export type Asignacion = { partidoId: string; cancha: string | null; inicio: string | null }

export type ResultadoGuardar =
  | { ok: true; guardados: number; avisos: string[] }
  | { ok: false; status: number; error: string; errores?: string[]; avisos?: string[]; requiereConfirmar?: boolean }

// Guarda horarios (la propuesta del asistente o una asignación a mano) o
// los quita (cancha e inicio null). Revisa cada uno contra la programación
// completa que quedaría: los errores no se guardan nunca; los avisos solo
// con forzar = true. torneo_programar_partidos crea, mueve o borra el
// bloqueo de cancha de cada partido en una transacción. Si la programación
// ya está publicada, avisa a los afectados.
export async function guardarProgramacion(
  db: SupabaseClient,
  torneo: Torneo,
  asignaciones: Asignacion[],
  forzar: boolean,
  adminId: string,
): Promise<ResultadoGuardar> {
  if (!['sorteado', 'en_curso'].includes(torneo.estado)) {
    return { ok: false, status: 400, error: 'La programación se arma después de publicar el sorteo' }
  }
  const { ctx, horarios, partidos } = await datosProgramacion(db, torneo)
  const porId = new Map(partidos.map((p) => [p.id, p]))
  const nuevos = new Map(horarios)
  const cambiados: string[] = []
  for (const a of asignaciones) {
    const p = porId.get(a?.partidoId)
    if (!p) return { ok: false, status: 404, error: 'Partido no encontrado' }
    if (p.cerrado) return { ok: false, status: 400, error: `${etiquetaPartido(p)} ya tiene resultado: no se puede mover` }
    if (a.cancha === null) {
      nuevos.delete(p.id)
    } else {
      const inicio = typeof a.inicio === 'string' ? new Date(a.inicio).getTime() : NaN
      if (!(CANCHAS_TORNEO as readonly string[]).includes(a.cancha) || Number.isNaN(inicio)) {
        return { ok: false, status: 400, error: `Horario no válido para ${etiquetaPartido(p)}` }
      }
      nuevos.set(p.id, { cancha: a.cancha as CanchaTorneo, inicio })
    }
    cambiados.push(p.id)
  }

  const errores: string[] = []
  const avisos: string[] = []
  for (const id of cambiados) {
    const h = nuevos.get(id)
    if (!h) {
      // Sin horario: ningún partido de llave programado puede depender de él.
      for (const q of ctx.partidos) {
        if (nuevos.has(q.id) && dependenciasDe(q, ctx.partidos).some((d) => d.id === id)) {
          errores.push(`${etiquetaPartido(porId.get(id)!)}: primero quita el horario de ${etiquetaPartido(q)}, que depende de este partido`)
        }
      }
      continue
    }
    const resto = new Map<string, Horario>(nuevos)
    resto.delete(id)
    const r = revisarHorario(ctx, resto, porId.get(id)!, h)
    errores.push(...r.errores.map((e) => `${etiquetaPartido(porId.get(id)!)}: ${e}`))
    avisos.push(...r.avisos.map((e) => `${etiquetaPartido(porId.get(id)!)}: ${e}`))
  }
  if (errores.length) return { ok: false, status: 400, error: 'Hay conflictos que impiden guardar', errores, avisos }
  if (avisos.length && !forzar) return { ok: false, status: 409, error: 'Hay avisos: revisa y confirma para guardar igual', requiereConfirmar: true, errores: [], avisos }

  const { error } = await db.rpc('torneo_programar_partidos', {
    p_admin_id: adminId,
    p_asignaciones: cambiados.map((id) => {
      const h = nuevos.get(id)
      return { partido_id: id, cancha: h?.cancha ?? null, inicio: h ? new Date(h.inicio).toISOString() : null }
    }),
  })
  if (error) return { ok: false, status: 400, error: error.message }

  if (torneo.programacion_publicada_at) {
    try {
      await avisarProgramacion(db, torneo.nombre, cambiados.map((id) => porId.get(id)!), nuevos, { cambio: true })
    } catch (err: any) {
      console.error('[torneo] No se pudo avisar el cambio de horario:', err.message)
    }
  }
  return { ok: true, guardados: cambiados.length, avisos }
}

// Publica la programación (SPEC §4): registra quién y cuándo, y avisa a
// cada jugador o representante (campana + correo) con sus partidos. Se
// publica una vez; después, cada cambio de horario avisa a los afectados
// desde guardarProgramacion.
export async function publicarProgramacion(
  db: SupabaseClient,
  torneo: Torneo,
  adminId: string,
): Promise<{ ok: true; sinHorario: number } | { ok: false; status: number; error: string }> {
  if (!['sorteado', 'en_curso'].includes(torneo.estado)) {
    return { ok: false, status: 400, error: 'La programación se publica después del sorteo' }
  }
  if (torneo.programacion_publicada_at) return { ok: false, status: 400, error: 'La programación ya estaba publicada' }

  const { horarios, partidos } = await datosProgramacion(db, torneo)
  if (!horarios.size) return { ok: false, status: 400, error: 'Todavía no hay partidos con horario' }

  const { data, error } = await db
    .from('torneos')
    .update({ programacion_publicada_at: ahora().toISOString(), programacion_publicada_por: adminId })
    .eq('id', torneo.id)
    .is('programacion_publicada_at', null)
    .select('id')
  if (error) throw error
  if (!data?.length) return { ok: false, status: 400, error: 'La programación ya estaba publicada' }

  try {
    await avisarProgramacion(db, torneo.nombre, partidos.filter((p) => p.avisar.length && !p.cerrado), horarios, { cambio: false })
  } catch (err: any) {
    console.error('[torneo] No se pudo avisar la programación:', err.message)
  }
  return { ok: true, sinHorario: partidos.filter((p) => !horarios.has(p.id)).length }
}
