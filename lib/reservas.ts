// Reglas de negocio de reservas de cancha casuales — compartidas entre la UI
// (app/reservas/page.tsx, para calcular qué horarios mostrar como libres) y el
// endpoint server-side (app/api/jugador/crear-reserva/route.ts, que revalida
// lo mismo antes de insertar). Son funciones puras, sin llamadas a Supabase,
// para poder importarlas tanto en cliente como en servidor.
//
// horaValidaParaCancha y fechaAlInicioDelDia se reexportan desde lib/tiempo.ts
// (única fuente de verdad para fecha/hora Caracas) — se mantienen estos nombres
// aquí para no tener que tocar los imports existentes en cada archivo.
import { horaValidaParaCancha as _horaValidaParaCancha, inicioDelDiaEnCaracas } from '@/lib/tiempo'

export const DURACION_SINGLE_MIN = 60
export const DURACION_DOBLE_MIN = 90
export const DURACION_RETO_MIN = 90 // igual que DURACION_PARTIDO_MS (90 min) en ladder/page.tsx y los endpoints de retos
export const PENALIDAD_NO_PRESENTADO_DIAS = 5 // si reservaste y no fuiste (ni cancelaste a tiempo)
export const PASO_MIN = 15 // granularidad de los horarios que se ofrecen (cada 15 min)

// Estados de reserva casual que OCUPAN la cancha. 'usada' = el jugador ya tocó
// "Ya llegué" y está jugando — sigue ocupando su franja hasta que termine. Usar
// siempre esta constante (con `.in('estado', ...)`) al calcular disponibilidad o
// choques; nunca `.eq('estado', 'activa')`, que liberaba la franja al confirmar
// llegada (caso real 13/09/2026). La BD lo refuerza con la exclusion constraint
// reservas_cancha_sin_solapes. OJO: "una reserva a la vez" y la penalidad por no
// presentarse SÍ miran solo 'activa' — ahí 'usada' significa que sí se presentó.
export const ESTADOS_RESERVA_OCUPAN_CANCHA = ['activa', 'usada']

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

export const horaValidaParaCancha = _horaValidaParaCancha
export const fechaAlInicioDelDia = inicioDelDiaEnCaracas

export function duracionParaTipoJuego(tipoJuego: 'single' | 'doble'): number {
  return tipoJuego === 'doble' ? DURACION_DOBLE_MIN : DURACION_SINGLE_MIN
}
