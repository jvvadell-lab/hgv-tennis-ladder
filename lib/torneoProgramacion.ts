// Programación de los partidos del torneo (Torneo Navidad HGV 2026 — SPEC §4
// y §14.5, decisiones del 20-oct-2026). Lógica pura, sin llamadas a
// Supabase: la usan las rutas app/api/admin/torneo/programacion/... y la
// UI. Tests en lib/torneoProgramacion.test.ts.
//
//  * Adultos: plantilla de turnos nocturnos (TURNOS_ADULTOS), validados con
//    horaValidaParaCancha.
//  * Infantiles: solo dentro de las franjas que libera la academia
//    (torneo_franjas_academia). horaValidaParaCancha no se usa para ellos.
//
// Todas las horas se manejan como instantes (ms) y se descomponen en hora de
// Caracas con lib/tiempo.ts.

import {
  diaDeLaSemanaEnCaracas,
  fechaISOEnCaracas,
  formatearFechaHora,
  formatearHora,
  horaValidaParaCancha,
  instanteEnCaracas,
  minutosDesdeMedianocheEnCaracas,
  sumarDiasEnCaracas,
} from './tiempo'
import { PREFIJO_FASE, parsearOrigen, type CanchaTorneo, type Fase } from './torneo'
import { celdaDisponibilidad } from './torneoInscripcion'

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

// Plantilla de turnos de adultos por día de la semana (SPEC §4), hora Caracas.
export const TURNOS_ADULTOS: Record<number, { hora: string; cancha: CanchaTorneo }[]> = {
  1: [{ hora: '19:00', cancha: 'HGV2' }, { hora: '20:00', cancha: 'HGV1' }, { hora: '20:30', cancha: 'HGV2' }],
  2: [{ hora: '19:00', cancha: 'HGV2' }, { hora: '20:00', cancha: 'HGV1' }, { hora: '20:30', cancha: 'HGV2' }],
  3: [{ hora: '19:00', cancha: 'HGV2' }, { hora: '20:00', cancha: 'HGV1' }, { hora: '20:30', cancha: 'HGV2' }],
  4: [{ hora: '19:00', cancha: 'HGV2' }, { hora: '20:30', cancha: 'HGV1' }, { hora: '20:30', cancha: 'HGV2' }],
  5: [{ hora: '18:30', cancha: 'HGV1' }, { hora: '18:30', cancha: 'HGV2' }, { hora: '20:30', cancha: 'HGV1' }, { hora: '20:30', cancha: 'HGV2' }],
}

// Ventana en la que la academia puede liberar franjas (SPEC §14.5).
export const VENTANA_ACADEMIA = { desde: '15:00', hasta: '18:00' }

// Paso entre inicios candidatos dentro de una franja infantil.
const PASO_FRANJA_MIN = 10

export type Turno = { cancha: CanchaTorneo; inicio: number }   // inicio en ms

export function fechasDelTorneo(fechaInicio: string, fechaFin: string): string[] {
  const fechas: string[] = []
  for (let d = instanteEnCaracas(fechaInicio, '12:00'); fechaISOEnCaracas(d) <= fechaFin; d = sumarDiasEnCaracas(d, 1)) {
    fechas.push(fechaISOEnCaracas(d))
  }
  return fechas
}

// Turnos de adultos de todo el torneo que cumplen horaValidaParaCancha.
export function turnosAdultos(fechaInicio: string, fechaFin: string, duracionMin: number): Turno[] {
  return fechasDelTorneo(fechaInicio, fechaFin).flatMap((fecha) => {
    const dia = diaDeLaSemanaEnCaracas(instanteEnCaracas(fecha, '12:00'))
    return (TURNOS_ADULTOS[dia] || [])
      .map((t) => ({ cancha: t.cancha, inicio: instanteEnCaracas(fecha, t.hora).getTime() }))
      .filter((t) => horaValidaParaCancha(t.cancha, new Date(t.inicio), duracionMin))
  })
}

export type Franja = { id: string; fecha: string; cancha: CanchaTorneo; hora_inicio: string; hora_fin: string }

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function limitesFranja(f: Franja): { inicio: number; fin: number } {
  return { inicio: instanteEnCaracas(f.fecha, f.hora_inicio.slice(0, 5)).getTime(), fin: instanteEnCaracas(f.fecha, f.hora_fin.slice(0, 5)).getTime() }
}

// Valida una franja nueva de la academia: fecha del torneo, cancha del club,
// dentro de 15:00–18:00, inicio antes del fin y sin solaparse con otra
// franja de la misma cancha ese día.
export function validarFranja(
  f: { fecha: unknown; cancha: unknown; hora_inicio: unknown; hora_fin: unknown },
  torneo: { fecha_inicio: string; fecha_fin: string },
  existentes: Franja[],
): { error: string } | { franja: Omit<Franja, 'id'> } {
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/
  if (typeof f.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { error: 'La fecha no es válida' }
  if (f.fecha < torneo.fecha_inicio || f.fecha > torneo.fecha_fin) return { error: 'La fecha tiene que estar dentro del torneo' }
  if (f.cancha !== 'HGV1' && f.cancha !== 'HGV2') return { error: 'Elige HGV1 o HGV2' }
  if (typeof f.hora_inicio !== 'string' || typeof f.hora_fin !== 'string' || !hora.test(f.hora_inicio) || !hora.test(f.hora_fin)) {
    return { error: 'Las horas no son válidas' }
  }
  const ini = minutos(f.hora_inicio)
  const fin = minutos(f.hora_fin)
  if (ini < minutos(VENTANA_ACADEMIA.desde) || fin > minutos(VENTANA_ACADEMIA.hasta)) {
    return { error: `La franja tiene que estar entre las ${VENTANA_ACADEMIA.desde} y las ${VENTANA_ACADEMIA.hasta}` }
  }
  if (ini >= fin) return { error: 'La hora de inicio tiene que ser anterior a la de fin' }
  const choque = existentes.find((e) => e.fecha === f.fecha && e.cancha === f.cancha && minutos(e.hora_inicio) < fin && ini < minutos(e.hora_fin))
  if (choque) return { error: `Se solapa con la franja de ${choque.hora_inicio.slice(0, 5)} a ${choque.hora_fin.slice(0, 5)} en ${choque.cancha}` }
  return { franja: { fecha: f.fecha, cancha: f.cancha, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin } }
}

// Inicios candidatos de un turno infantil dentro de una franja (cada 10 min
// desde la apertura, mientras termine dentro de ella).
export function turnosEnFranja(f: Franja, duracionMin: number): Turno[] {
  const { inicio, fin } = limitesFranja(f)
  const turnos: Turno[] = []
  for (let t = inicio; t + duracionMin * 60000 <= fin; t += PASO_FRANJA_MIN * 60000) turnos.push({ cancha: f.cancha, inicio: t })
  return turnos
}

// ---------------------------------------------------------------------------
// Partidos y reglas
// ---------------------------------------------------------------------------

export type PartidoProg = {
  id: string
  categoriaId: string
  categoriaNombre: string
  categoriaOrden: number
  esInfantil: boolean
  duracionMin: number
  fase: Fase
  grupoLetra: string | null
  orden: number
  ronda: number | null          // ronda del todos contra todos (grupos)
  origen_a: string | null
  origen_b: string | null
  // Personas que juegan el partido, si ya se conocen: ids de jugadores y
  // 'm:<menor_id>' para los menores. Vacío en la llave hasta que se conozcan.
  personas: string[]
  // Partido ya jugado (o WO): no se mueve.
  cerrado: boolean
}

export type Ocupacion = { cancha: string; inicio: number; fin: number; motivo: string; tipo: 'bloqueo' | 'reserva' | 'reto' }

export type ContextoProgramacion = {
  fechaInicio: string
  fechaFin: string             // día de las finales de adultos (viernes 11-dic)
  partidos: PartidoProg[]
  franjas: Franja[]
  // Lo que ya ocupa las canchas fuera del torneo (bloqueos del club,
  // reservas y retos). Los bloqueos de los propios partidos no van aquí.
  ocupaciones: Ocupacion[]
  // Celdas 'lun_1'… en las que cada jugador NO puede jugar (adultos).
  noDisponible: Record<string, string[]>
}

export type Horario = { cancha: CanchaTorneo; inicio: number }

// Código del partido de llave como se referencia en origen_* ('C1', 'S2', 'F1').
export const codigoPartido = (p: Pick<PartidoProg, 'fase' | 'orden' | 'grupoLetra'>) =>
  p.fase === 'grupo' ? `${p.grupoLetra}${p.orden}` : `${PREFIJO_FASE[p.fase]}${p.orden}`

export const etiquetaPartido = (p: PartidoProg) =>
  `${p.categoriaNombre} · ${p.fase === 'grupo' ? `Grupo ${p.grupoLetra}, partido ${p.orden}` : codigoPartido(p)}`

// Partidos de los que depende uno de llave: '1A'/'2A' → todos los del grupo
// A de su categoría; 'G:C1' → el C1.
export function dependenciasDe(p: PartidoProg, todos: PartidoProg[]): PartidoProg[] {
  return dependencias(todos).deps.get(p.id) ?? calcularDependencias(p, todos)
}

// Dependencias (y su inversa) de toda la lista, calculadas una vez por lista.
const cacheDependencias = new WeakMap<PartidoProg[], { deps: Map<string, PartidoProg[]>; dependientes: Map<string, PartidoProg[]> }>()
function dependencias(todos: PartidoProg[]) {
  let c = cacheDependencias.get(todos)
  if (!c) {
    c = { deps: new Map(), dependientes: new Map() }
    for (const p of todos) {
      const ds = calcularDependencias(p, todos)
      c.deps.set(p.id, ds)
      for (const d of ds) c.dependientes.set(d.id, [...(c.dependientes.get(d.id) || []), p])
    }
    cacheDependencias.set(todos, c)
  }
  return c
}

function calcularDependencias(p: PartidoProg, todos: PartidoProg[]): PartidoProg[] {
  if (p.fase === 'grupo') return []
  const deps: PartidoProg[] = []
  for (const origen of [p.origen_a, p.origen_b]) {
    const o = origen ? parsearOrigen(origen) : null
    if (!o) continue
    for (const q of todos) {
      if (q.categoriaId !== p.categoriaId || deps.includes(q)) continue
      if (o.tipo === 'grupo' ? q.fase === 'grupo' && q.grupoLetra === o.letra : q.fase !== 'grupo' && codigoPartido(q) === o.codigo) deps.push(q)
    }
  }
  return deps
}

const DIAS_CELDA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

// Celda de disponibilidad de un turno de adultos: 1er turno (18:30/19:00) o
// 2do (20:00/20:30), como la cuadrícula de la inscripción.
export function celdaDeTurno(inicio: number): string {
  const d = new Date(inicio)
  return celdaDisponibilidad(DIAS_CELDA[diaDeLaSemanaEnCaracas(d)], minutosDesdeMedianocheEnCaracas(d) < 19 * 60 + 30 ? '1' : '2')
}

export type Revision = { errores: string[]; avisos: string[] }

// El asistente revisa miles de turnos candidatos: las conversiones a hora
// de Caracas (Intl) se memorizan por instante.
function memo<T>(fn: (ms: number) => T): (ms: number) => T {
  const cache = new Map<number, T>()
  return (ms) => {
    if (!cache.has(ms)) cache.set(ms, fn(ms))
    return cache.get(ms)!
  }
}
const dia = memo((ms) => fechaISOEnCaracas(new Date(ms)))
const hora = memo((ms) => formatearHora(new Date(ms)))
const fechaHora = memo((ms) => formatearFechaHora(new Date(ms)))
const celda = memo(celdaDeTurno)
const abreCancha = new Map<string, boolean>()
const horaValida = (cancha: string, ms: number, duracionMin: number) => {
  const clave = `${cancha}|${ms}|${duracionMin}`
  if (!abreCancha.has(clave)) abreCancha.set(clave, horaValidaParaCancha(cancha, new Date(ms), duracionMin))
  return abreCancha.get(clave)!
}

const fin = (p: PartidoProg, h: Horario) => h.inicio + p.duracionMin * 60000

// Revisa poner `p` en `h` con el resto de la programación `horarios` (sin
// `p`). Errores = no se puede guardar; avisos = el admin puede forzar a
// mano (el asistente los trata como errores).
export function revisarHorario(ctx: ContextoProgramacion, horarios: Map<string, Horario>, p: PartidoProg, h: Horario): Revision {
  const errores: string[] = []
  const avisos: string[] = []
  const iniMs = h.inicio
  const finMs = fin(p, h)

  // Horario del club o franja de la academia.
  if (p.esInfantil) {
    const dentro = ctx.franjas.some((f) => {
      if (f.cancha !== h.cancha) return false
      const l = limitesFranja(f)
      return iniMs >= l.inicio && finMs <= l.fin
    })
    if (!dentro) errores.push(`${fechaHora(iniMs)} en ${h.cancha} no está dentro de una franja liberada por la academia`)
  } else if (!horaValida(h.cancha, iniMs, p.duracionMin)) {
    errores.push(`${h.cancha} no abre para un turno de ${p.duracionMin} min el ${fechaHora(iniMs)}`)
  }
  if (dia(iniMs) < ctx.fechaInicio || dia(iniMs) > ctx.fechaFin) errores.push('La fecha está fuera del torneo')

  // Finales de adultos: el último día del torneo, y ese día solo finales.
  if (!p.esInfantil) {
    if (p.fase === 'final' && dia(iniMs) !== ctx.fechaFin) avisos.push(`Las finales de adultos van el ${formatearFechaCortaISO(ctx.fechaFin)}`)
    if (p.fase !== 'final' && dia(iniMs) === ctx.fechaFin) avisos.push(`El ${formatearFechaCortaISO(ctx.fechaFin)} es el día de las finales de adultos`)
  }

  // Cancha: otros partidos del torneo y lo que ya está agendado en el club.
  for (const q of ctx.partidos) {
    const hq = horarios.get(q.id)
    if (!hq || q.id === p.id || hq.cancha !== h.cancha) continue
    if (iniMs < fin(q, hq) && hq.inicio < finMs) errores.push(`${h.cancha} ya está ocupada por ${etiquetaPartido(q)} (${hora(hq.inicio)})`)
  }
  for (const o of ctx.ocupaciones) {
    if (o.cancha !== h.cancha || !(iniMs < o.fin && o.inicio < finMs)) continue
    const texto = `${h.cancha} tiene ${o.tipo === 'bloqueo' ? 'un bloqueo del club' : o.tipo === 'reserva' ? 'una reserva' : 'un reto'} de ${hora(o.inicio)} a ${hora(o.fin)} (${o.motivo})`
    if (o.tipo === 'bloqueo') errores.push(texto)
    else avisos.push(texto)
  }

  // Jugadores (o menores) en dos categorías: nada solapado ni el mismo día.
  for (const q of ctx.partidos) {
    const hq = horarios.get(q.id)
    if (!hq || q.id === p.id) continue
    const comunes = p.personas.filter((x) => q.personas.includes(x))
    if (!comunes.length) continue
    if (iniMs < fin(q, hq) && hq.inicio < finMs) errores.push(`Un jugador tiene otro partido a esa hora: ${etiquetaPartido(q)}`)
    else if (dia(hq.inicio) === dia(iniMs)) avisos.push(`Un jugador ya juega ese día: ${etiquetaPartido(q)} a las ${hora(hq.inicio)}`)
  }

  // Limitaciones de horario que declaró cada jugador (solo adultos).
  if (!p.esInfantil) {
    const c = celda(iniMs)
    if (p.personas.some((x) => (ctx.noDisponible[x] || []).includes(c))) avisos.push('Un jugador marcó que no puede jugar en ese turno')
  }

  // Llave: en un día posterior a todos los partidos de los que depende, y
  // antes que los que dependen de él.
  for (const d of dependenciasDe(p, ctx.partidos)) {
    const hd = horarios.get(d.id)
    if (!hd) errores.push(`Depende de ${etiquetaPartido(d)}, que todavía no tiene horario`)
    else if (dia(hd.inicio) >= dia(iniMs)) errores.push(`Tiene que ir en un día posterior a ${etiquetaPartido(d)} (${fechaHora(hd.inicio)})`)
  }
  for (const q of dependencias(ctx.partidos).dependientes.get(p.id) || []) {
    const hq = horarios.get(q.id)
    if (!hq) continue
    if (dia(hq.inicio) <= dia(iniMs)) errores.push(`${etiquetaPartido(q)} depende de este partido y está el ${fechaHora(hq.inicio)}`)
  }

  return { errores: [...new Set(errores)], avisos: [...new Set(avisos)] }
}

function formatearFechaCortaISO(fechaISO: string): string {
  const [, m, d] = fechaISO.split('-').map(Number)
  return `${d}/${m}`
}

// ---------------------------------------------------------------------------
// Asistente
// ---------------------------------------------------------------------------

const RANGO_FASE: Record<Fase, number> = { grupo: 0, cuartos: 1, semis: 2, final: 3 }

export type Propuesta = {
  horarios: Map<string, Horario>
  sinHorario: { partidoId: string; motivo: string }[]
}

// Propone fecha, hora y cancha para cada partido sin horario, en orden de
// fase (grupos → cuartos → semis → final; en grupos, por ronda y
// categoría), en el primer turno libre que no tenga errores ni avisos.
// `fijos` son los horarios que ya existen y se respetan (partidos ya
// programados o jugados). Lo que no encaja queda en sinHorario con el
// motivo más frecuente.
export function proponerProgramacion(ctx: ContextoProgramacion, fijos: Map<string, Horario>): Propuesta {
  const horarios = new Map(fijos)
  const sinHorario: Propuesta['sinHorario'] = []

  const pendientes = ctx.partidos
    .filter((p) => !horarios.has(p.id) && !p.cerrado)
    .sort((a, b) =>
      RANGO_FASE[a.fase] - RANGO_FASE[b.fase] ||
      (a.ronda ?? 0) - (b.ronda ?? 0) ||
      a.categoriaOrden - b.categoriaOrden ||
      (a.grupoLetra ?? '').localeCompare(b.grupoLetra ?? '') ||
      a.orden - b.orden,
    )

  const turnosPorDuracion = new Map<number, Turno[]>()
  const candidatos = (p: PartidoProg): Turno[] => {
    if (p.esInfantil) {
      return ctx.franjas.flatMap((f) => turnosEnFranja(f, p.duracionMin)).sort((a, b) => a.inicio - b.inicio || a.cancha.localeCompare(b.cancha))
    }
    if (!turnosPorDuracion.has(p.duracionMin)) turnosPorDuracion.set(p.duracionMin, turnosAdultos(ctx.fechaInicio, ctx.fechaFin, p.duracionMin))
    return turnosPorDuracion.get(p.duracionMin)!
  }

  for (const p of pendientes) {
    const motivos = new Map<string, number>()
    let elegido: Horario | null = null
    for (const t of candidatos(p)) {
      const r = revisarHorario(ctx, horarios, p, t)
      if (!r.errores.length && !r.avisos.length) { elegido = t; break }
      const motivo = (r.errores[0] ?? r.avisos[0]).replace(/ \(.*\)$/, '')
      motivos.set(motivo, (motivos.get(motivo) || 0) + 1)
    }
    if (elegido) {
      horarios.set(p.id, elegido)
      continue
    }
    const dependePendiente = dependenciasDe(p, ctx.partidos).find((d) => !horarios.has(d.id))
    const masFrecuente = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    sinHorario.push({
      partidoId: p.id,
      motivo: dependePendiente
        ? `Depende de ${etiquetaPartido(dependePendiente)}, que quedó sin horario`
        : p.esInfantil && !ctx.franjas.length
          ? 'La academia todavía no liberó franjas'
          : masFrecuente
            ? `Ningún turno libre cumple las reglas (lo más común: ${masFrecuente})`
            : 'No hay turnos disponibles',
    })
  }
  return { horarios, sinHorario }
}
