// Programación del torneo — helpers de servidor (reciben el cliente de
// Supabase con service role). Los usan app/api/admin/torneo/programacion/...
// La lógica pura (turnos, reglas y asistente) está en lib/torneoProgramacion.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_RETO_OCUPAN_CANCHA } from '@/lib/choquesCancha'
import { DURACION_RETO_MIN, DURACION_SINGLE_MIN, ESTADOS_RESERVA_OCUPAN_CANCHA } from '@/lib/reservas'
import { formatearFechaHora, instanteEnCaracas, sumarDiasEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_FASE, crucesTodosContraTodos, type CanchaTorneo, type EstadoPartido, type Fase, type Torneo } from '@/lib/torneo'
import { codigoPartido, type ContextoProgramacion, type Franja, type Horario, type Ocupacion, type PartidoProg } from '@/lib/torneoProgramacion'
import { escaparHtml, notificarJugadores } from '@/lib/torneoServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'

export type PartidoDetalle = PartidoProg & {
  estado: EstadoPartido
  esMixto: boolean
  inscripcion_a: string | null
  inscripcion_b: string | null
  nombre_a: string | null
  nombre_b: string | null
  handicap_inscripcion_id: string | null
  // Personas a avisar: jugadores y, por cada menor, su representante.
  avisar: string[]
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
      .select('id, categoria_id, fase, grupo_id, orden, origen_a, origen_b, inscripcion_a, inscripcion_b, cancha, fecha_hora, estado, bloqueo_id, handicap_inscripcion_id')
      .in('categoria_id', categoriaIds),
    db.from('torneo_grupos').select('id, letra, torneo_grupo_miembros(inscripcion_id)').in('categoria_id', categoriaIds),
    db.from('torneo_franjas_academia').select('id, fecha, cancha, hora_inicio, hora_fin').eq('torneo_id', torneo.id),
    db.from('torneo_disponibilidad').select('jugador_id, no_disponible').eq('torneo_id', torneo.id),
  ])
  if (errP) throw errP
  if (errG) throw errG
  if (errF) throw errF
  if (errD) throw errD

  const inscripcionIds = [...new Set((partidos || []).flatMap((p) => [p.inscripcion_a, p.inscripcion_b]).filter(Boolean))] as string[]
  const { data: inscripciones, error: errI } = inscripcionIds.length
    ? await db.from('torneo_inscripciones').select('id, jugador1_id, jugador2_id, menor_id, menor_nombre_publico, torneo_menores(representante_jugador_id)').in('id', inscripcionIds)
    : { data: [] as any[], error: null }
  if (errI) throw errI
  const insPorId = new Map((inscripciones || []).map((i: any) => [i.id, i]))
  const nombres = await nombresInscripciones(db, inscripciones || [])

  const grupoPorId = new Map((grupos || []).map((g: any) => [g.id, { letra: g.letra as string, tamano: (g.torneo_grupo_miembros || []).length as number }]))

  const personasDe = (insId: string | null) => {
    const i = insId ? insPorId.get(insId) : null
    if (!i) return []
    return i.menor_id ? [`m:${i.menor_id}`] : [i.jugador1_id, i.jugador2_id].filter(Boolean)
  }
  const avisarDe = (insId: string | null) => {
    const i = insId ? insPorId.get(insId) : null
    if (!i) return []
    return i.menor_id ? [i.torneo_menores?.representante_jugador_id].filter(Boolean) : [i.jugador1_id, i.jugador2_id].filter(Boolean)
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
      personas: [...personasDe(p.inscripcion_a), ...personasDe(p.inscripcion_b)],
      cerrado: ['jugado', 'wo', 'doble_wo'].includes(p.estado),
      estado: p.estado as EstadoPartido,
      inscripcion_a: p.inscripcion_a,
      inscripcion_b: p.inscripcion_b,
      nombre_a: p.inscripcion_a ? nombres.get(p.inscripcion_a) ?? null : null,
      nombre_b: p.inscripcion_b ? nombres.get(p.inscripcion_b) ?? null : null,
      handicap_inscripcion_id: p.handicap_inscripcion_id,
      avisar: [...new Set([...avisarDe(p.inscripcion_a), ...avisarDe(p.inscripcion_b)])],
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
