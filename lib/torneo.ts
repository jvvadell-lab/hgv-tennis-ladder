// Torneos internos por grupos + llave (Torneo Navidad HGV 2026 — ver
// docs/torneo-navidad/SPEC.md). Tipos y constantes compartidos entre las
// rutas server-side y la UI — sin imports de servidor, se puede usar en
// ambos lados.
//
// Reflejan la migración torneo_navidad: los checks de la base usan
// exactamente estos valores.

import type { SetJugado, TipoResultado } from './resultados'

export const ESTADOS_TORNEO = ['borrador', 'inscripcion', 'sorteado', 'en_curso', 'finalizado'] as const
export type EstadoTorneo = (typeof ESTADOS_TORNEO)[number]

export const MODALIDADES = ['single', 'doble'] as const
export type Modalidad = (typeof MODALIDADES)[number]

export const GENEROS_CATEGORIA = ['caballeros', 'damas', 'mixto'] as const
export type GeneroCategoria = (typeof GENEROS_CATEGORIA)[number]

// Mismos valores que jugadores.categoria
export const NIVELES = ['sexta_novatos', 'sexta', 'quinta', 'cuarta'] as const
export type Nivel = (typeof NIVELES)[number]

export const LLAVE_DESDE = ['cuartos', 'semis'] as const
export type LlaveDesde = (typeof LLAVE_DESDE)[number]

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
  llave_desde: LlaveDesde
  duracion_min: number
  orden: number
  created_at: string
}

export type TorneoInscripcion = {
  id: string
  categoria_id: string
  jugador1_id: string
  jugador2_id: string | null    // null en single
  siembra: number | null
  estado: EstadoInscripcion
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
