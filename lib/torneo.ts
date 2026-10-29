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
  monto_inscripcion_eur: number            // 1ª inscripción (SPEC §2.5)
  monto_inscripcion_adicional_eur: number  // 2ª categoría / 2º hijo y siguientes
  monto_inscripcion_invitado_eur?: number | null  // adulto invitado (no socio), cada categoría
  fecha_corte_edad: string | null  // edad de los menores; null = 31-dic del año de fecha_inicio
  solo_socios: boolean
  sorteo_metodo: 'bombos' | 'serpentina' | null
  sorteo_publicado_por: string | null
  sorteo_publicado_at: string | null
  programacion_publicada_at: string | null
  programacion_publicada_por: string | null
  // Cierre de inscripciones (cuenta regresiva y vencimiento de las
  // invitaciones de dobles). El cierre en sí lo hace el admin a mano.
  cierre_inscripciones_at: string | null
  fecha_sorteo: string | null   // 'YYYY-MM-DD', informativa
  cierre_vencido_avisado_at: string | null   // aviso a los admins de categorías abiertas tras el cierre programado
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
  // Sorteo por categoría; cancelada = no se sortea (fusionada_en = destino).
  sorteo_metodo: 'bombos' | 'serpentina' | null
  sorteo_publicado_por: string | null
  sorteo_publicado_at: string | null
  cancelada_at: string | null
  cancelada_por: string | null
  fusionada_en: string | null
  created_at: string
}

export type TorneoInscripcion = {
  id: string
  categoria_id: string
  jugador1_id: string | null    // null si es de un menor
  jugador2_id: string | null    // siempre null: cada jugador se inscribe solo (la dupla es torneo_equipos)
  menor_id: string | null       // inscripción infantil (SPEC §14)
  menor_nombre_publico: string | null
  categoria_certificada_por: string | null
  categoria_certificada_at: string | null
  inscrita_por_admin: string | null
  estado: EstadoInscripcion
  inscrita_por: string | null
  created_at: string
}

// Competidor del cuadro: la dupla en dobles, una inscripción en single e
// infantil (se crea sola). Grupos y partidos apuntan aquí.
export type TorneoEquipo = {
  id: string
  categoria_id: string
  inscripcion1_id: string
  inscripcion2_id: string | null
  estado: 'activo' | 'disuelto'
  origen: 'individual' | 'invitacion' | 'admin'
  siembra: number | null
  bombo: number | null          // sorteo por bombos (SPEC §3)
  created_at: string
}

export type TorneoGrupo = {
  id: string
  categoria_id: string
  letra: string
}

export type TorneoGrupoMiembro = {
  grupo_id: string
  equipo_id: string
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
  equipo_a: string | null  // j1 en `sets`
  equipo_b: string | null  // j2 en `sets`
  cancha: CanchaTorneo | null
  fecha_hora: string | null
  estado: EstadoPartido
  sets: SetJugado[] | null
  tipo_resultado: TipoResultado
  retirada_equipo_id: string | null
  ganador_equipo_id: string | null
  wo_ausente_equipo_id: string | null
  reportado_por: string | null
  reportado_at: string | null
  validado: boolean
  validado_at: string | null
  validado_por: string | null
  bloqueo_id: string | null
  handicap_equipo_id: string | null   // Mixto: pareja que empieza cada game 15-0 (SPEC §4.1)
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
  // Llave de 3 grupos (cuartos con 2 byes): se conocen al cerrar TODOS los
  // grupos. 'P1' = el mejor de los primeros; '2P1' = el 2º del grupo de P1.
  | { tipo: 'mejor_primero'; k: number }
  | { tipo: 'segundo_de_mejor'; k: number }

export function parsearOrigen(origen: string): Origen | null {
  const pos = origen.match(/^([1-9])([A-Z])$/)
  if (pos) return { tipo: 'grupo', puesto: Number(pos[1]), letra: pos[2] }
  const mejor = origen.match(/^(2?)P([1-9])$/)
  if (mejor) return mejor[1] ? { tipo: 'segundo_de_mejor', k: Number(mejor[2]) } : { tipo: 'mejor_primero', k: Number(mejor[2]) }
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
//   1 grupo (final):    F1 = 1A-2A (3–5 inscritos, SPEC §3)
//   3 grupos (cuartos con 2 byes, 9–11 inscritos): los dos mejores primeros
//   pasan directo a semis, en los extremos; el 3º de los primeros juega con
//   el 2º del grupo de P2, y los 2º de los grupos de P1 y P3 entre sí. Así
//   dos del mismo grupo siempre quedan en mitades opuestas:
//     C1 = P3-2P2 · C2 = 2P1-2P3 · S1 = P1 vs G:C1 · S2 = P2 vs G:C2
export function generarLlave(numGrupos: number, llaveDesde: LlaveDesde | 'final'): PartidoLlave[] {
  if (numGrupos === 3 && llaveDesde === 'cuartos') {
    return [
      { fase: 'cuartos', orden: 1, codigo: 'C1', origen_a: 'P3', origen_b: '2P2' },
      { fase: 'cuartos', orden: 2, codigo: 'C2', origen_a: '2P1', origen_b: '2P3' },
      { fase: 'semis', orden: 1, codigo: 'S1', origen_a: 'P1', origen_b: 'G:C1' },
      { fase: 'semis', orden: 2, codigo: 'S2', origen_a: 'P2', origen_b: 'G:C2' },
      { fase: 'final', orden: 1, codigo: 'F1', origen_a: 'G:S1', origen_b: 'G:S2' },
    ]
  }
  const esperados: Record<LlaveDesde | 'final', number> = { cuartos: 4, semis: 2, final: 1 }
  if (numGrupos !== esperados[llaveDesde]) {
    throw new Error(`Una llave desde ${llaveDesde} necesita ${esperados[llaveDesde]} grupos (con 1º y 2º clasificados); hay ${numGrupos}`)
  }

  const primera: [string, string][] = []
  if (llaveDesde === 'final') primera.push(['1A', '2A'])
  else for (const puestoA of [0, 1]) {
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

// Texto de un origen para mostrar mientras el partido no tiene rivales.
export function textoOrigen(origen: string | null): string {
  const o = origen ? parsearOrigen(origen) : null
  if (!o) return origen ?? '—'
  if (o.tipo === 'grupo') return `${o.puesto}º ${o.letra}`
  if (o.tipo === 'ganador') return `Gan. ${o.codigo}`
  if (o.tipo === 'mejor_primero') return `${o.k}º mejor 1º`
  return `2º del grupo del ${o.k}º mejor 1º`
}

// Orden de los primeros de grupos de distinto tamaño (llave de 3 grupos):
// promedio por partido de lo que mira la tabla del grupo — partidos
// ganados, diferencia de sets, diferencia de games. Si dos siguen iguales
// en todo, decide el admin (como el desempate de grupo, §7.4): `manual` es
// el orden de letras que fijó (torneo_categorias.orden_primeros_manual).
// Sin él, `empatados` trae las letras que faltan desempatar y el orden es
// provisional (por letra).
export function ordenarPrimeros<F extends Pick<FilaTabla, 'pj' | 'pg' | 'sets_favor' | 'sets_contra' | 'games_favor' | 'games_contra'>>(
  primeros: { letra: string; fila: F }[],
  manual: string[] | null = null,
): { orden: { letra: string; fila: F }[]; empatados: string[] } {
  const prom = (n: number, pj: number) => (pj ? n / pj : 0)
  const criterios = (x: { fila: F }) => [
    prom(x.fila.pg, x.fila.pj),
    prom(x.fila.sets_favor - x.fila.sets_contra, x.fila.pj),
    prom(x.fila.games_favor - x.fila.games_contra, x.fila.pj),
  ]
  const empatados = new Set<string>()
  const orden = [...primeros].sort((x, y) => {
    const cx = criterios(x), cy = criterios(y)
    for (let i = 0; i < cx.length; i++) if (cy[i] !== cx[i]) return cy[i] - cx[i]
    const mx = manual?.indexOf(x.letra) ?? -1, my = manual?.indexOf(y.letra) ?? -1
    if (mx >= 0 && my >= 0) return mx - my
    empatados.add(x.letra).add(y.letra)
    return x.letra.localeCompare(y.letra)
  })
  return { orden, empatados: [...empatados].sort() }
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
// j1 = equipo_a, j2 = equipo_b.
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
  | 'equipo_a' | 'equipo_b' | 'estado' | 'validado' | 'sets' | 'tipo_resultado'
  | 'retirada_equipo_id' | 'ganador_equipo_id' | 'wo_ausente_equipo_id'
>

export type MiembroParaTabla = Pick<TorneoGrupoMiembro, 'equipo_id' | 'desempate_manual'>

export type FilaTabla = {
  equipo_id: string
  posicion: number
  pj: number
  pg: number
  pp: number
  sets_favor: number
  sets_contra: number
  games_favor: number
  games_contra: number
  // Puntos de los súper tie-breaks jugados: no cuentan para el orden (el
  // STB vale 1 set y 1-0 en games), quedan para revisar un empate (SPEC §7).
  stb_puntos_favor: number
  stb_puntos_contra: number
  // true si quedó empatada con otra(s) en todos los criterios y falta el
  // sorteo del admin (desempate_manual) — la posición mostrada es provisional.
  requiere_sorteo: boolean
}

type Conteo = { setsA: number; setsB: number; gamesA: number; gamesB: number; stbA: number; stbB: number }

// Sets y games de un partido validado, desde el lado de equipo_a.
//  * WO: el presente gana 2-0 en sets y 12-0 en games (6-0, 6-0). [CONFIRMAR]
//  * Doble WO: no suma sets ni games a nadie.
//  * Súper tie-break: 1 set y 1-0 en games para quien lo gana — sus puntos
//    no se suman a los games; se registran aparte (stb_puntos_*) para
//    revisar los empates (aprobado 20-oct-2026).
//  * Retiro: se cuenta lo jugado y se le completa el partido al ganador:
//    el set interrumpido lo cierra él (6-x, o 7-5 / 7-6 si el rival ya
//    tenía 5 o 6), y los sets que falten van 6-0 (o Súper tie-break 1-0
//    si ya estaban 1-1). Aprobado 20-oct-2026: el partido va a favor de la
//    otra dupla, con lo jugado + lo que falta completado.
function conteoPartido(p: PartidoParaTabla): Conteo {
  const c: Conteo = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, stbA: 0, stbB: 0 }
  if (p.estado === 'doble_wo') return c
  if (p.estado === 'wo') {
    if (p.ganador_equipo_id === p.equipo_a) { c.setsA = 2; c.gamesA = 12 } else { c.setsB = 2; c.gamesB = 12 }
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
      c.stbA += s.games_j1
      c.stbB += s.games_j2
    } else {
      c.gamesA += s.games_j1
      c.gamesB += s.games_j2
    }
  }

  if (p.tipo_resultado !== 'retiro') return c

  const ganaA = p.ganador_equipo_id === p.equipo_a
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
    filas.set(m.equipo_id, {
      equipo_id: m.equipo_id, pj: 0, pg: 0, pp: 0,
      sets_favor: 0, sets_contra: 0, games_favor: 0, games_contra: 0,
      stb_puntos_favor: 0, stb_puntos_contra: 0,
    })
  }

  const contados = partidos.filter(
    (p) => p.validado && ['jugado', 'wo', 'doble_wo'].includes(p.estado) &&
      p.equipo_a != null && p.equipo_b != null &&
      filas.has(p.equipo_a) && filas.has(p.equipo_b),
  )

  for (const p of contados) {
    const a = filas.get(p.equipo_a!)!
    const b = filas.get(p.equipo_b!)!
    const c = conteoPartido(p)
    a.pj++; b.pj++
    if (p.ganador_equipo_id === p.equipo_a) { a.pg++; b.pp++ }
    else if (p.ganador_equipo_id === p.equipo_b) { b.pg++; a.pp++ }
    else { a.pp++; b.pp++ }
    a.sets_favor += c.setsA; a.sets_contra += c.setsB; a.games_favor += c.gamesA; a.games_contra += c.gamesB
    b.sets_favor += c.setsB; b.sets_contra += c.setsA; b.games_favor += c.gamesB; b.games_contra += c.gamesA
    a.stb_puntos_favor += c.stbA; a.stb_puntos_contra += c.stbB
    b.stb_puntos_favor += c.stbB; b.stb_puntos_contra += c.stbA
  }

  const manual = new Map(miembros.map((m) => [m.equipo_id, m.desempate_manual]))
  const sinResolver = new Set<string>()

  // Ganador del partido entre dos inscripciones, o null si no hay uno decidido.
  const directo = (x: string, y: string): string | null => {
    const p = contados.find(
      (q) => (q.equipo_a === x && q.equipo_b === y) || (q.equipo_a === y && q.equipo_b === x),
    )
    const g = p?.ganador_equipo_id
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
