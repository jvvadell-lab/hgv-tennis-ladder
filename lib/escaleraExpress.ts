// Escalera Express: evento especial jugado el sábado 12 de septiembre de 2026.
//
// Línea de tiempo (hora de Caracas):
// - Antes del jueves 10/sep 5:00pm: nadie puede crear NINGÚN reto (ni normal ni Express).
// - Jueves 10/sep, desde las 5:00pm: ventana especial — solo se pueden crear retos
//   Express (rango ampliado, horario/cancha fijos entre los definidos abajo, para
//   jugarse el sábado). La ventana se cierra sola cuando se ocupan los 12 cupos
//   (6 horarios × 2 canchas), o si no se llenan, sigue abierta durante el viernes
//   hasta llenarse o hasta que empiece el sábado (lo que ocurra primero).
// - Mientras la ventana esté cerrada (llena, o llegó el sábado) y hasta que termine
//   el sábado 12: se vuelve a bloquear la creación de CUALQUIER reto.
// - El aceptar/rechazar de un reto marcado escalera_express NUNCA se congela — sigue
//   las reglas normales (incluida la de 1 rechazo por temporada) sin importar la fecha.
// - Domingo 13 en adelante: todo vuelve a la normalidad.

import { instanteEnCaracas, hoyEnCaracas } from './tiempo'

export const ESCALERA_EXPRESS_INICIO = '2026-09-10'
export const ESCALERA_EXPRESS_FIN = '2026-09-12'

// Rango ampliado de reto durante la ventana especial (en vez de los 3 normales).
export const RANGO_RETO_EXPRESS = 5

// Los retos Express son exclusivamente para este día — no se puede elegir otra fecha.
export const ESCALERA_EXPRESS_FECHA_JUEGO = '2026-09-12'

// Cron (una corrida diaria, 8am Caracas): el viernes se manda un recordatorio a
// quien no ha respondido, y el sábado (última corrida antes de que empiecen los
// partidos a las 4pm) se acepta automáticamente lo que siga pendiente, para no
// perder el cupo de cancha. Ver app/api/cron/procesar-retos/route.ts.
export const ESCALERA_EXPRESS_FECHA_RECORDATORIO = '2026-09-11'

// Horarios de inicio fijos y exactos (hora de Caracas) — cada partido dura 1 hora,
// no se permite elegir minutos intermedios.
export const ESCALERA_EXPRESS_HORARIOS = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00']

export const ESCALERA_EXPRESS_CANCHAS = ['HGV1', 'HGV2'] as const

export const ESCALERA_EXPRESS_TOTAL_CUPOS = ESCALERA_EXPRESS_HORARIOS.length * ESCALERA_EXPRESS_CANCHAS.length

// Bloqueo general: del 10 al 12 de septiembre (inclusive) se congela la creación de
// retos normales y el aceptar/rechazar de retos que NO sean Escalera Express.
export function esEscaleraExpress(fechaISO: string): boolean {
  return fechaISO >= ESCALERA_EXPRESS_INICIO && fechaISO <= ESCALERA_EXPRESS_FIN
}

// Instante exacto (Caracas) en que abre la ventana especial de creación.
export function aperturaVentanaExpress(): Date {
  return instanteEnCaracas(ESCALERA_EXPRESS_INICIO, '17:00')
}

// Instante exacto (Caracas) en que la ventana se cierra a más tardar, aunque no se
// hayan llenado los 12 cupos — al empezar el sábado (día de juego), porque ya no
// tiene sentido seguir agendando partidos para un día que ya llegó.
export function cierreMaximoVentanaExpress(): Date {
  return instanteEnCaracas(ESCALERA_EXPRESS_FECHA_JUEGO, '00:00')
}

// ¿Está abierta ahora mismo la ventana de creación de retos Express? Depende de la
// hora actual Y de cuántos de los 12 cupos (horario × cancha) ya están ocupados por
// retos Express pendientes/aceptados — hay que consultarlos en la base de datos y
// pasar el conteo aquí, esta función no toca la BD.
export function ventanaExpressAbierta(ahora: Date, cuposOcupados: number): boolean {
  return (
    ahora >= aperturaVentanaExpress() &&
    ahora < cierreMaximoVentanaExpress() &&
    cuposOcupados < ESCALERA_EXPRESS_TOTAL_CUPOS
  )
}

// Todas las combinaciones horario×cancha posibles del evento (12 cupos totales).
export function cuposExpressPosibles(): { horario: string; cancha: string }[] {
  const cupos: { horario: string; cancha: string }[] = []
  for (const horario of ESCALERA_EXPRESS_HORARIOS) {
    for (const cancha of ESCALERA_EXPRESS_CANCHAS) {
      cupos.push({ horario, cancha })
    }
  }
  return cupos
}

// Instante (Caracas) del inicio de un partido Express en un horario dado.
export function instanteCupoExpress(horario: string): Date {
  return instanteEnCaracas(ESCALERA_EXPRESS_FECHA_JUEGO, horario)
}

// Dada la lista de retos Express activos (pendiente/aceptado) ya creados, arma el
// mapa de cupos disponibles/ocupados para mostrar en la UI.
export function calcularCuposExpress(retosActivos: { fecha_propuesta: string; cancha: string }[]) {
  const ocupados = new Set(
    retosActivos.map((r) => `${r.cancha}__${new Date(r.fecha_propuesta).toISOString()}`)
  )
  return cuposExpressPosibles().map((cupo) => {
    const iso = instanteCupoExpress(cupo.horario).toISOString()
    return { ...cupo, ocupado: ocupados.has(`${cupo.cancha}__${iso}`) }
  })
}

export function hoyEsVentanaOJuegoExpress(): boolean {
  return esEscaleraExpress(hoyEnCaracas())
}
