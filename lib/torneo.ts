// Torneos internos por grupos + llave (Torneo Navidad HGV 2026 — ver
// docs/torneo-navidad/SPEC.md). Tipos y constantes compartidos entre las
// rutas server-side y la UI — sin imports de servidor, se puede usar en
// ambos lados.
//
// Reflejan la migración torneo_navidad: los checks de la base usan
// exactamente estos valores.
//
// La segunda mitad del archivo es la lógica pura del torneo (serpentina,
// round robin, llave, validación de marcador y tabla del grupo) — sin
// llamadas a Supabase, con tests en lib/torneo.test.ts.

import { validarSets, type SetJugado, type TipoResultado } from './resultados'

export const ESTADOS_TORNEO = ['borrador', 'inscripcion', 'sorteado', 'en_curso', 'finalizado'] as const
export type EstadoTorneo = (typeof ESTADOS_TORNEO)[number]

export const MODALIDADES = ['single', 'doble'] as const
export type Modalidad = (typeof MODALIDADES)[number]

// 'abierto' = niños y niñas juntos (solo categorías infantiles, SPEC §14).
export const GENEROS_CATEGORIA = ['caballeros', 'damas', 'mixto', 'abierto'] as const
export type GeneroCategoria = (typeof GENEROS_CATEGORIA)[number]

// Mismos valores que jugadores.categoria
export const NIVELES = ['sexta_novatos', 'sexta', 'quinta', 'cuarta'] as const
export type Nivel = (typeof NIVELES)[number]

export const LLAVE_DESDE = ['cuartos', 'semis'] as const
export type LlaveDesde = (typeof LLAVE_DESDE)[number]

// Formato de partido de la categoría (SPEC §14.1). Adultos: dos_sets_stb.
export const FORMATOS_PARTIDO = ['dos_sets_stb', 'un_set_6_tb', 'festival_4games'] as const
export type FormatoPartido = (typeof FORMATOS_PARTIDO)[number]

export const ESTADOS_INSCRIPCION = ['pendiente_pago', 'confirmada', 'retirada'] as const
export type EstadoInscripcion = (typeof ESTADOS_INSCRIPCION)[number]

export const FASES = ['grupo', 'cuartos', 'semis', 'final'] as const
export type Fase = (typeof FASES)[number]

export const ESTADOS_PARTIDO = ['pendiente', 'programado', 'jugado', 'wo', 'doble_wo'] as const
export type EstadoPartido = (typeof ESTADOS_PARTIDO)[number]

export const CANCHAS_TORNEO = ['HGV1', 'HGV2'] as const
export type CanchaTorneo = (typeof CANCHAS_TORNEO)[number]

export const ETIQUETA_ESTADO_TORNEO: Record<EstadoTorneo, string> = {
  borrador: 'Borrador',
  inscripcion: 'Inscripción abierta',
  sorteado: 'Sorteado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
}

export const ETIQUETA_FASE: Record<Fase, string> = {
  grupo: 'Fase de grupos',
  cuartos: 'Cuartos de final',
  semis: 'Semifinal',
  final: 'Final',
}

// Prefijo del partido de llave en origen_* ('G:C1' = ganador de C1).
export const PREFIJO_FASE: Record<Exclude<Fase, 'grupo'>, string> = {
  cuartos: 'C',
  semis: 'S',
  final: 'F',
}

export const ETIQUETA_ESTADO_INSCRIPCION: Record<EstadoInscripcion, string> = {
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  retirada: 'Retirada',
}

export const ETIQUETA_ESTADO_PARTIDO: Record<EstadoPartido, string> = {
  pendiente: 'Por programar',
  programado: 'Programado',
  jugado: 'Jugado',
  wo: 'WO',
  doble_wo: 'Doble WO',
}

// Un jugador puede jugar como máximo este número de categorías por torneo
// (la base lo vuelve a validar en el trigger torneo_inscripciones_validar).
export const MAX_CATEGORIAS_POR_JUGADOR = 2

export type Torneo = {
  id: string
  nombre: string
  fecha_inicio: string          // 'YYYY-MM-DD'
  fecha_fin: string
  estado: EstadoTorneo
  monto_inscripcion_eur: number
  fecha_corte_edad: string | null  // edad de los menores; null = 31-dic del año de fecha_inicio
  solo_socios: boolean
  created_at: string
}

export type TorneoCategoria = {
  id: string
  torneo_id: string
  nombre: string
  modalidad: Modalidad
  genero: GeneroCategoria
  categoria_nivel: Nivel | null  // null = libre (Mixto con handicap)
  cupo: number
  num_grupos: number
  tamano_grupo: number
  clasifican_por_grupo: number
  llave_desde: LlaveDesde | 'sin_llave'   // sin_llave = festival infantil
  duracion_min: number
  orden: number
  es_infantil: boolean
  edad_min: number | null
  edad_max: number | null
  formato_partido: FormatoPartido
  plantilla_turnos: unknown | null         // ver PlantillaTurnosInfantil en lib/torneoInfantil.ts
  partidos_minimos: number | null
  inscripciones_abiertas: boolean          // además del torneo en 'inscripcion'
  inscripciones_cambiadas_por: string | null
  inscripciones_cambiadas_at: string | null
  created_at: string
}

export type TorneoInscripcion = {
  id: string
  categoria_id: string
  jugador1_id: string | null    // null si es de un menor
  jugador2_id: string | null    // null en single
  menor_id: string | null       // inscripción infantil (SPEC §14)
  menor_nombre_publico: string | null
  categoria_certificada_por: string | null
  categoria_certificada_at: string | null
  inscrita_por_admin: string | null
  siembra: number | null
  estado: EstadoInscripcion
  inscrita_por: string | null
  created_at: string
}

export type TorneoGrupo = {
  id: string
  categoria_id: string
  letra: string
}

export type TorneoGrupoMiembro = {
  grupo_id: string
  inscripcion_id: string
  siembra: number
  desempate_manual: number | null
}

export type TorneoPartido = {
  id: string
  categoria_id: string
  fase: Fase
  grupo_id: string | null
  orden: number
  origen_a: string | null       // '1A', '2B', 'G:C1'…
  origen_b: string | null
  inscripcion_a: string | null  // j1 en `sets`
  inscripcion_b: string | null  // j2 en `sets`
  cancha: CanchaTorneo | null
  fecha_hora: string | null
  estado: EstadoPartido
  sets: SetJugado[] | null
  tipo_resultado: TipoResultado
  retirada_inscripcion_id: string | null
  ganador_inscripcion_id: string | null
  wo_ausente_inscripcion_id: string | null
  reportado_por: string | null
  reportado_at: string | null
  validado: boolean
  validado_at: string | null
  validado_por: string | null
  bloqueo_id: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Sorteo: grupos en serpentina
// ---------------------------------------------------------------------------

// Letra del grupo por índice: 0 → 'A', 1 → 'B'…
export function letraGrupo(indice: number): string {
  return String.fromCharCode(65 + indice)
}

// Reparte en zigzag (serpentina) una lista YA ORDENADA por siembra (1..N):
// fila 0 → grupos A..G, fila 1 → G..A, y así alternando. Así cada grupo
// recibe un cabeza de serie y los grupos quedan parejos.
//   12 en 4 grupos: A = 1,8,9 · B = 2,7,10 · C = 3,6,11 · D = 4,5,12
//   8 en 2 grupos:  A = 1,4,5,8 · B = 2,3,6,7
export function distribuirSerpentina<T>(ordenadosPorSiembra: T[], numGrupos: number): T[][] {
  if (!Number.isInteger(numGrupos) || numGrupos < 1) throw new Error('El número de grupos debe ser un entero ≥ 1')
  const grupos: T[][] = Array.from({ length: numGrupos }, () => [])
  ordenadosPorSiembra.forEach((item, i) => {
    const fila = Math.floor(i / numGrupos)
    const columna = i % numGrupos
    grupos[fila % 2 === 0 ? columna : numGrupos - 1 - columna].push(item)
  })
  return grupos
}

// ---------------------------------------------------------------------------
// Partidos de grupo: todos contra todos (método del círculo)
// ---------------------------------------------------------------------------

export type CruceGrupo = { ronda: number; orden: number; a: number; b: number }

// Cruces de un grupo de n miembros, como índices 0..n-1 dentro del grupo.
// Método del círculo: el 0 queda fijo y el resto rota; con n impar se
// agrega un "descanso" (el que le toca descansa esa ronda).
//   n = 3 → 3 rondas de 1 partido · n = 4 → 3 rondas de 2 partidos.
// `orden` numera los partidos 1..k en el orden en que conviene jugarlos.
export function crucesTodosContraTodos(n: number): CruceGrupo[] {
  if (!Number.isInteger(n) || n < 2) throw new Error('Un grupo necesita al menos 2 miembros')
  const DESCANSO = -1
  const ronda0 = Array.from({ length: n }, (_, i) => i)
  if (n % 2 === 1) ronda0.push(DESCANSO)
  const m = ronda0.length
  const cruces: CruceGrupo[] = []
  let posiciones = ronda0
  for (let r = 0; r < m - 1; r++) {
    for (let k = 0; k < m / 2; k++) {
      const a = posiciones[k]
      const b = posiciones[m - 1 - k]
      if (a === DESCANSO || b === DESCANSO) continue
      cruces.push({ ronda: r + 1, orden: cruces.length + 1, a: Math.min(a, b), b: Math.max(a, b) })
    }
    // Rotación: el primero fijo, el último pasa al segundo lugar.
    posiciones = [posiciones[0], posiciones[m - 1], ...posiciones.slice(1, m - 1)]
  }
  return cruces
}

// ---------------------------------------------------------------------------
// Llave (eliminación directa desde cuartos o semis)
// ---------------------------------------------------------------------------

export type FaseLlave = Exclude<Fase, 'grupo'>

export type PartidoLlave = {
  fase: FaseLlave
  orden: number
  codigo: string      // 'C1', 'S2', 'F1' — lo que se referencia como 'G:<codigo>'
  origen_a: string
  origen_b: string
}

export type Origen =
  | { tipo: 'grupo'; puesto: number; letra: string }   // '1A' = 1º del grupo A
  | { tipo: 'ganador'; codigo: string }                // 'G:C1' = ganador de C1

export function parsearOrigen(origen: string): Origen | null {
  const pos = origen.match(/^([1-9])([A-Z])$/)
  if (pos) return { tipo: 'grupo', puesto: Number(pos[1]), letra: pos[2] }
  const gan = origen.match(/^G:([CSF][1-9]\d*)$/)
  if (gan) return { tipo: 'ganador', codigo: gan[1] }
  return null
}

const FASES_LLAVE: FaseLlave[] = ['cuartos', 'semis', 'final']

// Partidos de la llave, sin inscripciones (se llenan al cerrar los grupos).
// Clasifican 1º y 2º de cada grupo; los grupos se cruzan de a pares (A-B,
// C-D…): primero 1A-2B, 1C-2D…, después 1B-2A, 1D-2C… — así dos del mismo
// grupo solo pueden volver a verse en la final. Cada ronda siguiente cruza
// a los ganadores en orden (S1 = G:C1 vs G:C2…).
//   4 grupos (cuartos): C1 = 1A-2B · C2 = 1C-2D · C3 = 1B-2A · C4 = 1D-2C
//   2 grupos (semis):   S1 = 1A-2B · S2 = 1B-2A
export function generarLlave(numGrupos: number, llaveDesde: LlaveDesde): PartidoLlave[] {
  const esperados: Record<LlaveDesde, number> = { cuartos: 4, semis: 2 }
  if (numGrupos !== esperados[llaveDesde]) {
    throw new Error(`Una llave desde ${llaveDesde} necesita ${esperados[llaveDesde]} grupos (con 1º y 2º clasificados); hay ${numGrupos}`)
  }

  const primera: [string, string][] = []
  for (const puestoA of [0, 1]) {
    for (let g = 0; g < numGrupos; g += 2) {
      // puestoA = 0: 1(par) vs 2(impar) · puestoA = 1: 1(impar) vs 2(par)
      const uno = letraGrupo(g + puestoA)
      const dos = letraGrupo(g + 1 - puestoA)
      primera.push([`1${uno}`, `2${dos}`])
    }
  }

  const partidos: PartidoLlave[] = []
  let ronda = primera
  for (const fase of FASES_LLAVE.slice(FASES_LLAVE.indexOf(llaveDesde))) {
    const codigos = ronda.map(([a, b], i) => {
      const codigo = `${PREFIJO_FASE[fase]}${i + 1}`
      partidos.push({ fase, orden: i + 1, codigo, origen_a: a, origen_b: b })
      return codigo
    })
    ronda = []
    for (let i = 0; i + 1 < codigos.length; i += 2) ronda.push([`G:${codigos[i]}`, `G:${codigos[i + 1]}`])
  }
  return partidos
}

// ---------------------------------------------------------------------------
// Marcador
// ---------------------------------------------------------------------------

// Validación server-side del marcador de un partido de torneo. Reusa
// validarSets (cada set es un marcador real: 6-0…6-4, 7-5, 7-6 con su
// tie-break, Super Tiebreak a 10 con margen 2) y le agrega la estructura
// del formato del torneo (SPEC §5), que validarSets no revisa:
//  * sets 1 y 2 son sets normales;
//  * 1-1 en sets → el 3º es obligatorio y es Super Tiebreak;
//  * 2-0 → no hay 3º.
// Con retiro se admite lo realmente jugado hasta el momento del retiro.
// j1 = inscripcion_a, j2 = inscripcion_b.
export function validarMarcadorTorneo(sets: unknown, tipoResultado: TipoResultado): string | null {
  const error = validarSets(sets, tipoResultado)
  if (error) return error
  const filas = sets as SetJugado[]

  if (filas.length > 3) return 'Un partido tiene como máximo 2 sets y un Super Tiebreak'
  if (filas.slice(0, 2).some((s) => s.es_super_tiebreak)) return 'Los dos primeros sets son sets normales, no Super Tiebreak'
  if (filas.length === 3 && !filas[2].es_super_tiebreak) return 'Si quedan 1 set a 1, se define con Super Tiebreak (no un 3er set)'

  const completos = filas.slice(0, 2).filter((s) => s.completo)
  const setsJ1 = completos.filter((s) => s.games_j1 > s.games_j2).length
  const setsJ2 = completos.filter((s) => s.games_j2 > s.games_j1).length

  if (filas.length === 3 && (completos.length < 2 || setsJ1 !== 1 || setsJ2 !== 1)) {
    return 'El Super Tiebreak solo se juega si quedan 1 set a 1'
  }
  if (tipoResultado === 'normal' && filas.length === 2 && setsJ1 === 1 && setsJ2 === 1) {
    return 'El partido quedó 1 set a 1 — falta el Super Tiebreak'
  }
  return null
}

// ---------------------------------------------------------------------------
// Tabla de posiciones del grupo
// ---------------------------------------------------------------------------

export type PartidoParaTabla = Pick<
  TorneoPartido,
  | 'inscripcion_a' | 'inscripcion_b' | 'estado' | 'validado' | 'sets' | 'tipo_resultado'
  | 'retirada_inscripcion_id' | 'ganador_inscripcion_id' | 'wo_ausente_inscripcion_id'
>

export type MiembroParaTabla = Pick<TorneoGrupoMiembro, 'inscripcion_id' | 'desempate_manual'>

export type FilaTabla = {
  inscripcion_id: string
  posicion: number
  pj: number
  pg: number
  pp: number
  sets_favor: number
  sets_contra: number
  games_favor: number
  games_contra: number
  // true si quedó empatada con otra(s) en todos los criterios y falta el
  // sorteo del admin (desempate_manual) — la posición mostrada es provisional.
  requiere_sorteo: boolean
}

type Conteo = { setsA: number; setsB: number; gamesA: number; gamesB: number }

// Sets y games de un partido validado, desde el lado de inscripcion_a.
//  * WO: el presente gana 2-0 en sets y 12-0 en games (6-0, 6-0). [CONFIRMAR]
//  * Doble WO: no suma sets ni games a nadie.
//  * Súper tie-break: 1 set y 1-0 en games para quien lo gana — no se
//    suman sus puntos. [CONFIRMAR]
//  * Retiro: se cuenta lo jugado y se le completa el partido al ganador:
//    el set interrumpido lo cierra él (6-x, o 7-5 / 7-6 si el rival ya
//    tenía 5 o 6), y los sets que falten van 6-0 (o Súper tie-break 1-0
//    si ya estaban 1-1). [CONFIRMAR con la Comisión]
function conteoPartido(p: PartidoParaTabla): Conteo {
  const c: Conteo = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0 }
  if (p.estado === 'doble_wo') return c
  if (p.estado === 'wo') {
    if (p.ganador_inscripcion_id === p.inscripcion_a) { c.setsA = 2; c.gamesA = 12 } else { c.setsB = 2; c.gamesB = 12 }
    return c
  }

  for (const s of p.sets ?? []) {
    if (!s.completo) continue
    const ganaA = s.games_j1 > s.games_j2
    if (ganaA) c.setsA++
    else c.setsB++
    if (s.es_super_tiebreak) {
      if (ganaA) c.gamesA++
      else c.gamesB++
    } else {
      c.gamesA += s.games_j1
      c.gamesB += s.games_j2
    }
  }

  if (p.tipo_resultado !== 'retiro') return c

  const ganaA = p.ganador_inscripcion_id === p.inscripcion_a
  const sumar = (setsGanador: number, gamesGanador: number, gamesPerdedor: number) => {
    if (ganaA) { c.setsA += setsGanador; c.gamesA += gamesGanador; c.gamesB += gamesPerdedor }
    else { c.setsB += setsGanador; c.gamesB += gamesGanador; c.gamesA += gamesPerdedor }
  }

  const interrumpido = (p.sets ?? []).find((s) => !s.completo)
  if (interrumpido) {
    if (interrumpido.es_super_tiebreak) {
      sumar(1, 1, 0)
    } else {
      const gamesGanador = ganaA ? interrumpido.games_j1 : interrumpido.games_j2
      const gamesPerdedor = ganaA ? interrumpido.games_j2 : interrumpido.games_j1
      const cierre = gamesPerdedor <= 4 ? 6 : 7
      sumar(1, Math.max(gamesGanador, cierre), gamesPerdedor)
    }
  }

  const setsGanador = () => (ganaA ? c.setsA : c.setsB)
  while (setsGanador() < 2 && c.setsA + c.setsB < 3) {
    if (c.setsA + c.setsB >= 2) sumar(1, 1, 0) // 1-1: lo que falta es el Súper tie-break
    else sumar(1, 6, 0)
  }
  return c
}

// Tabla del grupo (SPEC §7), sobre los partidos validados (jugados, WO o
// doble WO; los demás se ignoran). Orden:
//  1. Partidos ganados.
//  2. Empate entre 2: resultado entre ellas.
//  3. Empate entre 3 o más: diferencia de sets → diferencia de games (de
//     todos los partidos del grupo). Si tras un criterio quedan 2
//     empatadas, se resuelven entre ellas por resultado directo.
//  4. Si persiste: desempate_manual (sorteo del admin; menor = mejor). Si
//     falta, la fila sale con requiere_sorteo = true.
// Un doble WO cuenta como partido perdido para las dos. [CONFIRMAR]
export function ordenarGrupo(partidos: PartidoParaTabla[], miembros: MiembroParaTabla[]): FilaTabla[] {
  const filas = new Map<string, Omit<FilaTabla, 'posicion' | 'requiere_sorteo'>>()
  for (const m of miembros) {
    filas.set(m.inscripcion_id, {
      inscripcion_id: m.inscripcion_id, pj: 0, pg: 0, pp: 0,
      sets_favor: 0, sets_contra: 0, games_favor: 0, games_contra: 0,
    })
  }

  const contados = partidos.filter(
    (p) => p.validado && ['jugado', 'wo', 'doble_wo'].includes(p.estado) &&
      p.inscripcion_a != null && p.inscripcion_b != null &&
      filas.has(p.inscripcion_a) && filas.has(p.inscripcion_b),
  )

  for (const p of contados) {
    const a = filas.get(p.inscripcion_a!)!
    const b = filas.get(p.inscripcion_b!)!
    const c = conteoPartido(p)
    a.pj++; b.pj++
    if (p.ganador_inscripcion_id === p.inscripcion_a) { a.pg++; b.pp++ }
    else if (p.ganador_inscripcion_id === p.inscripcion_b) { b.pg++; a.pp++ }
    else { a.pp++; b.pp++ }
    a.sets_favor += c.setsA; a.sets_contra += c.setsB; a.games_favor += c.gamesA; a.games_contra += c.gamesB
    b.sets_favor += c.setsB; b.sets_contra += c.setsA; b.games_favor += c.gamesB; b.games_contra += c.gamesA
  }

  const manual = new Map(miembros.map((m) => [m.inscripcion_id, m.desempate_manual]))
  const sinResolver = new Set<string>()

  // Ganador del partido entre dos inscripciones, o null si no hay uno decidido.
  const directo = (x: string, y: string): string | null => {
    const p = contados.find(
      (q) => (q.inscripcion_a === x && q.inscripcion_b === y) || (q.inscripcion_a === y && q.inscripcion_b === x),
    )
    const g = p?.ganador_inscripcion_id
    return g === x || g === y ? g : null
  }

  type Criterio = (id: string) => number   // mayor = mejor
  const criterios: Criterio[] = [
    (id) => filas.get(id)!.sets_favor - filas.get(id)!.sets_contra,
    (id) => filas.get(id)!.games_favor - filas.get(id)!.games_contra,
  ]

  // Ordena un bloque de empatadas aplicando los criterios desde `nivel`.
  const desempatar = (ids: string[], nivel: number): string[] => {
    if (ids.length <= 1) return ids
    if (ids.length === 2) {
      const g = directo(ids[0], ids[1])
      if (g) return g === ids[0] ? ids : [ids[1], ids[0]]
    }
    if (nivel >= criterios.length) return porSorteo(ids)
    return agrupar(ids, criterios[nivel]).flatMap((bloque) => desempatar(bloque, nivel + 1))
  }

  const porSorteo = (ids: string[]): string[] => {
    const valores = ids.map((id) => manual.get(id))
    const completos = valores.every((v) => v != null) && new Set(valores).size === valores.length
    if (!completos) ids.forEach((id) => sinResolver.add(id))
    return [...ids].sort((x, y) => (manual.get(x) ?? Infinity) - (manual.get(y) ?? Infinity) || x.localeCompare(y))
  }

  const orden = agrupar([...filas.keys()], (id) => filas.get(id)!.pg).flatMap((bloque) => desempatar(bloque, 0))

  return orden.map((id, i) => ({ ...filas.get(id)!, posicion: i + 1, requiere_sorteo: sinResolver.has(id) }))
}

// Separa en bloques de igual valor, de mayor a menor.
function agrupar(ids: string[], valor: (id: string) => number): string[][] {
  const porValor = new Map<number, string[]>()
  for (const id of ids) {
    const v = valor(id)
    porValor.set(v, [...(porValor.get(v) ?? []), id])
  }
  return [...porValor.entries()].sort((x, y) => y[0] - x[0]).map(([, bloque]) => bloque)
}
