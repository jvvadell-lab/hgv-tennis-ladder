// Reglas de negocio de reservas de cancha casuales — compartidas entre la UI
// (app/reservas/page.tsx, para calcular qué horarios mostrar como libres) y el
// endpoint server-side (app/api/jugador/crear-reserva/route.ts, que revalida
// lo mismo antes de insertar). Son funciones puras, sin llamadas a Supabase,
// para poder importarlas tanto en cliente como en servidor.

export const DURACION_SINGLE_MIN = 60
export const DURACION_DOBLE_MIN = 90
export const DURACION_RETO_MIN = 90 // igual que DURACION_PARTIDO_MS (90 min) en ladder/page.tsx y los endpoints de retos
export const PENALIDAD_NO_PRESENTADO_DIAS = 5 // si reservaste y no fuiste (ni cancelaste a tiempo)
export const PASO_MIN = 15 // granularidad de los horarios que se ofrecen (cada 15 min)

// Ventanas en las que se abre cada tipo de reserva (en minutos desde medianoche)
export const APERTURA_MISMO_DIA_MIN = 360  // 6:00am — desde aquí se puede reservar para HOY
export const APERTURA_MANANA_MIN = 1080    // 6:00pm — desde aquí se puede reservar la mañana de MAÑANA (solo HGV2)
export const MANANA_HGV2_INICIO_MIN = 360  // 6:00am
export const MANANA_HGV2_FIN_MIN = 840     // 2:00pm

export function seSolapan(inicio1Ms: number, duracion1Min: number, inicio2Ms: number, duracion2Min: number) {
  const fin1 = inicio1Ms + duracion1Min * 60000
  const fin2 = inicio2Ms + duracion2Min * 60000
  return inicio1Ms < fin2 && inicio2Ms < fin1
}

// Día de la semana (0 domingo … 6 sábado) y minutos desde medianoche, ambos
// calculados en la hora del club (America/Caracas) — no en la del proceso
// Node, que en producción corre en UTC y desalinearía los horarios de apertura.
function diaYMinutosEnCaracas(fecha: Date): { dia: number; minutos: number } {
  const DIAS_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(fecha)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  let hora = parseInt(valor('hour'), 10)
  if (hora === 24) hora = 0 // algunos motores ICU devuelven "24" para medianoche con hour12:false
  const minuto = parseInt(valor('minute'), 10)
  return { dia: DIAS_SEMANA[valor('weekday')], minutos: hora * 60 + minuto }
}

// Devuelve si esa cancha, empezando a esa hora y con esa duración, cabe por
// completo dentro de su horario de apertura normal (sin pasarse del cierre).
export function horaValidaParaCancha(cancha: string, fecha: Date, duracionMin: number): boolean {
  const { dia, minutos } = diaYMinutosEnCaracas(fecha)
  const esFinde = dia === 0 || dia === 6
  if (esFinde) return true

  const esViernes = dia === 5
  const minutosFin = minutos + duracionMin

  if (cancha === 'HGV1') {
    return esViernes
      ? minutos >= 1080 && minutosFin <= 1440  // Viernes: 6:00pm – 12:00am
      : minutos >= 1200 && minutosFin <= 1440  // Lun-Jue: 8:00pm – 12:00am
  }
  if (cancha === 'HGV2') {
    // Los viernes, HGV 2 mantiene su franja de mañana normal, pero la noche
    // empieza una hora antes (6:00pm en vez de 7:00pm) — igual que HGV 1 ese día.
    const enManana = minutos >= 360 && minutosFin <= 840   // 6:00am – 2:00pm
    const enNoche = esViernes
      ? minutos >= 1080 && minutosFin <= 1440  // Viernes: 6:00pm – 12:00am
      : minutos >= 1140 && minutosFin <= 1440  // Lun-Jue: 7:00pm – 12:00am
    return enManana || enNoche
  }
  return true
}

// Instante UTC que corresponde a la medianoche EN CARACAS del día que
// contiene `base` — para acotar rangos "por día del club" en consultas.
export function fechaAlInicioDelDia(base: Date): Date {
  const { minutos } = diaYMinutosEnCaracas(base)
  const msDesdeMedianocheCaracas = minutos * 60000 + base.getUTCSeconds() * 1000 + base.getUTCMilliseconds()
  return new Date(base.getTime() - msDesdeMedianocheCaracas)
}

export function duracionParaTipoJuego(tipoJuego: 'single' | 'doble'): number {
  return tipoJuego === 'doble' ? DURACION_DOBLE_MIN : DURACION_SINGLE_MIN
}
