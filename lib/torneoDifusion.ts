// Zona 📣 Difusión del torneo (SPEC §18): de los horarios publicados y los
// resultados validados salen las filas de las piezas y de /torneo/hoy. Lógica
// pura, sin imports de servidor.
//
// Lo reportado sin validar se muestra como programado: solo cuenta lo validado.

import { ETIQUETA_FASE, etapaCuadros, numeroPartido, parsearOrigen, textoOrigen, textoOrigenCuadros, type Fase, type FormatoLlave } from './torneo'
import type { SetJugado } from './resultados'
import { diaDeLaSemanaEnCaracas, fechaISOEnCaracas, formatearHora, instanteEnCaracas, sumarDiasEnCaracas } from './tiempo'

export type PartidoDifusion = {
  id: string
  categoria: string
  formato_llave: FormatoLlave
  fase: Fase
  grupo: string | null
  orden: number
  origen_a: string | null
  origen_b: string | null
  equipo_a: string | null
  equipo_b: string | null
  nombre_a: string | null      // de un menor, solo su nombre público
  nombre_b: string | null
  cancha: string | null
  fecha_hora: string | null
  estado: string
  validado: boolean
  reportado: boolean           // tiene reporte; solo para el aviso del admin
  sets: SetJugado[] | null
  tipo_resultado: string
  ganador: string | null
  wo_ausente: string | null
}

export type LadoFila = { texto: string; conocido: boolean; ganador: boolean; nota: string | null }
export type EstadoFila = 'programado' | 'jugado' | 'wo' | 'doble_wo'

export type FilaDifusion = {
  id: string
  fecha: string       // YYYY-MM-DD en Caracas
  hora: string
  cancha: string
  categoria: string
  etapa: string
  a: LadoFila
  b: LadoFila
  estado: EstadoFila
  marcador: string | null
}

export type DiaDifusion = { fecha: string; filas: FilaDifusion[] }

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const DIAS_LARGOS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// --- Fechas ---

export const esFechaISO = (f: string | null | undefined): f is string =>
  !!f && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(`${f}T12:00:00Z`).getTime())

const alMediodia = (fecha: string) => instanteEnCaracas(fecha, '12:00')
export const sumarDias = (fecha: string, dias: number) => fechaISOEnCaracas(sumarDiasEnCaracas(alMediodia(fecha), dias))
const diaDeSemana = (fecha: string) => diaDeLaSemanaEnCaracas(alMediodia(fecha))
const diaYMes = (fecha: string) => ({ dia: Number(fecha.slice(8, 10)), mes: MESES[Number(fecha.slice(5, 7)) - 1] })

// Lunes y viernes de la semana de la fecha. El sábado y el domingo no caen en
// ninguna: dan la semana siguiente, que es la que se publica ese fin de semana.
export function semanaDe(fecha: string): { lunes: string; viernes: string } {
  const d = diaDeSemana(fecha)
  const lunes = sumarDias(fecha, d === 0 ? 1 : d === 6 ? 2 : 1 - d)
  return { lunes, viernes: sumarDias(lunes, 4) }
}

// Lo que el admin ve al abrir la pestaña: los lunes, la semana; si no, el día.
export const tipoPorDefecto = (fecha: string): 'dia' | 'semana' => (diaDeSemana(fecha) === 1 ? 'semana' : 'dia')

export function fechaCorta(fecha: string): string {
  const { dia, mes } = diaYMes(fecha)
  return `${DIAS[diaDeSemana(fecha)]} ${dia} ${mes}`
}

export function fechaEncabezado(fecha: string): string {
  const { dia, mes } = diaYMes(fecha)
  return `${DIAS_LARGOS[diaDeSemana(fecha)]} ${dia} ${mes}`
}

export const tituloDia = (fecha: string) => `HOY EN LA COPA · ${fechaCorta(fecha)}`

export function tituloSemana(fecha: string): string {
  const { lunes, viernes } = semanaDe(fecha)
  const a = diaYMes(lunes)
  const b = diaYMes(viernes)
  return `PROGRAMACIÓN DE LA SEMANA · ${a.dia}${a.mes === b.mes ? '' : ` ${a.mes}`} AL ${b.dia} ${b.mes}`
}

// --- Filas ---

function etapaDe(p: PartidoDifusion): string {
  if (p.formato_llave === 'cuadros') return etapaCuadros({ fase: p.fase, orden: p.orden, grupoLetra: p.grupo })
  return p.fase === 'grupo' ? `Grupo ${p.grupo}` : ETIQUETA_FASE[p.fase]
}

function textoOrigenDe(p: PartidoDifusion, origen: string | null): string {
  if (!origen) return 'Por definir'
  if (p.formato_llave !== 'cuadros') return textoOrigen(origen)
  // En el cuadro A espera al ganador del partido. En el B queda solo «Partido N».
  const o = parsearOrigen(origen)
  return o?.tipo === 'grupo' && o.puesto === 1 ? `Ganador Partido ${numeroPartido(o.letra)}` : textoOrigenCuadros(origen)
}

// Por sets, desde el lado del ganador, como se publica en tenis: "6-4 3-6 10-8".
// El súper tie-break va como un set más.
function marcadorDe(p: PartidoDifusion): string | null {
  if (!p.sets?.length) return null
  const invertir = !!p.ganador && p.ganador === p.equipo_b
  const sets = p.sets.map((s) => {
    const [x, y] = invertir ? [s.games_j2, s.games_j1] : [s.games_j1, s.games_j2]
    const tb = s.tiebreak_retador != null && s.tiebreak_retado != null
      ? `(${invertir ? `${s.tiebreak_retado}-${s.tiebreak_retador}` : `${s.tiebreak_retador}-${s.tiebreak_retado}`})`
      : ''
    return `${x}-${y}${tb}`
  })
  return sets.join(' ') + (p.tipo_resultado === 'retiro' ? ' ret.' : '')
}

const estadoDe = (p: PartidoDifusion): EstadoFila =>
  p.validado && (p.estado === 'jugado' || p.estado === 'wo' || p.estado === 'doble_wo') ? p.estado : 'programado'

export function filaDe(p: PartidoDifusion): FilaDifusion {
  const estado = estadoDe(p)
  const conGanador = estado === 'jugado' || estado === 'wo'
  const primeraRondaCuadros = p.formato_llave === 'cuadros' && p.fase === 'grupo'

  const lado = (id: string | null, nombre: string | null, origen: string | null): LadoFila => {
    const ganador = conGanador && !!id && id === p.ganador
    const nota = [
      estado === 'wo' && ganador ? 'W.O.' : null,
      conGanador && primeraRondaCuadros && id ? (ganador ? '→ Cuadro A' : '→ Cuadro B') : null,
    ].filter(Boolean).join(' ')
    return { texto: nombre ?? textoOrigenDe(p, origen), conocido: !!nombre, ganador, nota: nota || null }
  }

  return {
    id: p.id,
    fecha: fechaISOEnCaracas(p.fecha_hora!),
    hora: formatearHora(p.fecha_hora!),
    cancha: p.cancha === 'HGV1' ? 'Cancha 1' : p.cancha === 'HGV2' ? 'Cancha 2' : p.cancha ?? '',
    categoria: p.categoria,
    etapa: etapaDe(p),
    a: lado(p.equipo_a, p.nombre_a, p.origen_a),
    b: lado(p.equipo_b, p.nombre_b, p.origen_b),
    estado,
    marcador: estado === 'jugado' ? marcadorDe(p) : estado === 'doble_wo' ? 'Doble W.O.' : null,
  }
}

const programados = (partidos: PartidoDifusion[]) => partidos.filter((p) => p.fecha_hora)

// Por hora y luego por cancha: HGV1 antes que HGV2.
const enOrden = (x: PartidoDifusion, y: PartidoDifusion) =>
  new Date(x.fecha_hora!).getTime() - new Date(y.fecha_hora!).getTime() || (x.cancha ?? '').localeCompare(y.cancha ?? '')

export function partidosDelDia(partidos: PartidoDifusion[], fecha: string): FilaDifusion[] {
  return programados(partidos).filter((p) => fechaISOEnCaracas(p.fecha_hora!) === fecha).sort(enOrden).map(filaDe)
}

export function partidosDeLaSemana(partidos: PartidoDifusion[], fecha: string): FilaDifusion[] {
  const { lunes, viernes } = semanaDe(fecha)
  return programados(partidos)
    .filter((p) => { const f = fechaISOEnCaracas(p.fecha_hora!); return f >= lunes && f <= viernes })
    .sort(enOrden)
    .map(filaDe)
}

export function agruparPorDia(filas: FilaDifusion[]): DiaDifusion[] {
  const dias: DiaDifusion[] = []
  for (const f of filas) {
    const ultimo = dias[dias.length - 1]
    if (ultimo?.fecha === f.fecha) ultimo.filas.push(f)
    else dias.push({ fecha: f.fecha, filas: [f] })
  }
  return dias
}

// Reportados sin validar en un rango: el admin debe validarlos para que salgan.
export function porValidarEntre(partidos: PartidoDifusion[], desde: string, hasta: string): number {
  return programados(partidos).filter((p) => {
    const f = fechaISOEnCaracas(p.fecha_hora!)
    return p.reportado && !p.validado && f >= desde && f <= hasta
  }).length
}

// --- Páginas de una pieza ---

export type TipoPieza = 'dia' | 'semana'
export type FormatoPieza = 'historia' | 'post'

export const MEDIDAS_PIEZA: Record<FormatoPieza, { ancho: number; alto: number; altoLista: number }> = {
  historia: { ancho: 1080, alto: 1920, altoLista: 1130 },
  post: { ancho: 1080, alto: 1350, altoLista: 770 },
}
export const ALTO_FILA = 150
export const ALTO_DIA = 60

// Reparte los días en páginas sin pasar del alto. Un encabezado de día nunca
// queda solo al final; si un día se parte, repite su encabezado en la página
// siguiente. Siempre hay al menos una página, aunque no haya partidos.
export function paginarDias(dias: DiaDifusion[], altoLista: number, conEncabezado: boolean): DiaDifusion[][] {
  const paginas: DiaDifusion[][] = [[]]
  let usado = 0
  for (const d of dias) {
    let actual: DiaDifusion | null = null
    for (const f of d.filas) {
      const encabezado = !actual && conEncabezado ? ALTO_DIA : 0
      if (usado + encabezado + ALTO_FILA > altoLista && usado > 0) {
        paginas.push([])
        usado = 0
        actual = null
      }
      if (!actual) {
        actual = { fecha: d.fecha, filas: [] }
        paginas[paginas.length - 1].push(actual)
        usado += conEncabezado ? ALTO_DIA : 0
      }
      actual.filas.push(f)
      usado += ALTO_FILA
    }
  }
  return paginas
}

export function paginasDePieza(partidos: PartidoDifusion[], tipo: TipoPieza, fecha: string, formato: FormatoPieza) {
  const filas = tipo === 'dia' ? partidosDelDia(partidos, fecha) : partidosDeLaSemana(partidos, fecha)
  return paginarDias(agruparPorDia(filas), MEDIDAS_PIEZA[formato].altoLista, tipo === 'semana')
}

// --- Texto para acompañar la pieza ---

const ETIQUETAS = '#TenisHGV #CopaNavidadHGV'

export function textoSugerido(filas: FilaDifusion[], tipo: TipoPieza, fecha: string): string {
  const { lunes, viernes } = semanaDe(fecha)
  if (tipo === 'semana') {
    const mes = (f: string) => MESES_LARGOS[Number(f.slice(5, 7)) - 1]
    const dia = (f: string) => Number(f.slice(8, 10))
    const rango = `del ${dia(lunes)}${mes(lunes) === mes(viernes) ? '' : ` de ${mes(lunes)}`} al ${dia(viernes)} de ${mes(viernes)}`
    return `Programación de la semana ${rango} en la Copa Navidad HGV 2026 🎄🎾\n${filas.length} ${filas.length === 1 ? 'partido' : 'partidos'} en las canchas del club. ¡Te esperamos!\n\n${ETIQUETAS}`
  }
  const jugados = filas.filter((f) => f.estado !== 'programado').length
  if (!filas.length) return `Hoy no hay partidos en la Copa Navidad HGV 2026 🎄🎾\n\n${ETIQUETAS}`
  const cierre = jugados === filas.length ? 'Estos son los resultados del día.' : jugados ? 'Así va la jornada.' : '¡Ven a las canchas del club a apoyar a los jugadores!'
  const lineas = filas.map((f) => `${f.hora} · ${f.cancha} · ${f.categoria}`).join('\n')
  return `Hoy en la Copa Navidad HGV 2026 🎄🎾\n${lineas}\n\n${cierre}\n\n${ETIQUETAS}`
}
