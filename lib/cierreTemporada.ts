// Cierre de agenda de la temporada: después de `temporadas.fecha_fin` (día
// calendario en Caracas, inclusive) ya no se pueden crear retos ni proponer /
// reprogramar partidos para después de esa fecha. La fecha vive SOLO en la BD
// (temporadas.fecha_fin, editable desde admin) — este módulo nunca la fija.
//
// Esto NO cierra la temporada: el cierre formal (estado 'finalizada') sigue
// siendo manual desde admin (cerrar-temporada). Los retos ya agendados con
// fecha <= fecha_fin siguen su curso normal (aceptar, jugar, cargar resultado).
//
// Todas las comparaciones son sobre "YYYY-MM-DD" en hora de Caracas — así el
// 15/10 a las 23:30 Caracas (ya 16/10 en UTC) sigue contando como día 15.

import { ahora, fechaISOEnCaracas, formatearFechaCorta, instanteEnCaracas } from './tiempo'

// ¿Ya pasó el cierre? Verdadero desde las 00:00 Caracas del día siguiente a fechaFin.
export function temporadaCerradaParaRetos(fechaFin: string | null | undefined, instante: Date = ahora()): boolean {
  if (!fechaFin) return false
  return fechaISOEnCaracas(instante) > fechaFin
}

// ¿El partido propuesto cae en un día (Caracas) posterior al cierre?
export function fechaDespuesDelCierre(fechaFin: string | null | undefined, instantePropuesto: Date | string): boolean {
  if (!fechaFin) return false
  return fechaISOEnCaracas(instantePropuesto) > fechaFin
}

// "15 de octubre", a partir de la fecha guardada en la BD.
export function fechaCierreLegible(fechaFin: string): string {
  return formatearFechaCorta(instanteEnCaracas(fechaFin))
}

export function mensajeTemporadaCerrada(fechaFin: string): string {
  return `La temporada cerró el ${fechaCierreLegible(fechaFin)}. Ya no se pueden agendar retos.`
}

export function mensajeFechaDespuesDelCierre(fechaFin: string): string {
  return `La temporada cierra el ${fechaCierreLegible(fechaFin)} — el partido tiene que jugarse ese día o antes.`
}
