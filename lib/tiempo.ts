// Única fuente de verdad para fecha/hora en toda la app.
//
// Venezuela usa UTC-4 fijo — sin horario de verano — pero el servidor
// (Vercel/Node) corre en UTC por defecto, y el navegador de cada visitante
// puede estar en cualquier zona horaria del mundo. Cualquier `new Date()`,
// `getHours()`, `setDate()`, `toLocaleString()` etc. "pelado" queda atado a
// la zona de quien ejecuta el código, no a la hora real del club en
// Caracas. El resto del código (cliente y servidor) debe pasar por estas
// funciones en vez de tocar `Date` directamente.
//
// NOTA transitoria: lib/reservas.ts todavía tiene su propia copia de la
// descomposición día/minutos (diaYMinutosEnCaracas) — se migrará a
// reexportar desde aquí cuando le toque su turno en la Fase 3.

export const ZONA_HORARIA = 'America/Caracas'

const DIAS_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function aFecha(instante: Date | string): Date {
  return typeof instante === 'string' ? new Date(instante) : instante
}

// --- Primitiva de descomposición (motor interno de todo lo demás) ---

function descomponerEnCaracas(instante: Date): { dia: number; minutos: number; fechaISO: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(instante)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  let hora = parseInt(valor('hour'), 10)
  if (hora === 24) hora = 0 // algunos motores ICU devuelven "24" para medianoche con hour12:false
  const minuto = parseInt(valor('minute'), 10)
  return {
    dia: DIAS_SEMANA[valor('weekday')],
    minutos: hora * 60 + minuto,
    fechaISO: `${valor('year')}-${valor('month')}-${valor('day')}`,
  }
}

// --- "Ahora" y "hoy" ---

// Existe solo para que el resto del código nunca llame a `new Date()`
// pelado — así queda grep-eable qué usa la hora actual.
export function ahora(): Date {
  return new Date()
}

// Fecha de HOY en Caracas, "YYYY-MM-DD". Reemplaza tanto
// `new Date().toISOString().slice(0,10)` (bug: da la fecha en UTC, se
// adelanta un día 4h antes de medianoche Caracas) como las copias de
// `fechaVenezuela`/`fechaVenezuelaHoy` (Date.now() - 4h) repartidas por
// varios endpoints.
export function hoyEnCaracas(): string {
  return fechaISOEnCaracas(ahora())
}

// Fecha calendario "YYYY-MM-DD" en Caracas de un instante arbitrario (no
// solo "hoy") — para convertir created_at, validado_at, fecha_propuesta, etc.
export function fechaISOEnCaracas(instante: Date | string): string {
  return descomponerEnCaracas(aFecha(instante)).fechaISO
}

// --- Límites de día ---

// Instante UTC de la medianoche EN CARACAS del día que contiene `instante`
// — para acotar rangos "por día del club" en consultas. (Migrado de
// fechaAlInicioDelDia en lib/reservas.ts, mismo comportamiento.)
export function inicioDelDiaEnCaracas(instante: Date): Date {
  const base = aFecha(instante)
  const { minutos } = descomponerEnCaracas(base)
  const msDesdeMedianocheCaracas = minutos * 60000 + base.getUTCSeconds() * 1000 + base.getUTCMilliseconds()
  return new Date(base.getTime() - msDesdeMedianocheCaracas)
}

// Instante UTC del último milisegundo del día EN CARACAS que contiene
// `instante` (23:59:59.999 hora Caracas) — reemplaza los
// `d.setHours(23,59,59,999)` y los `T23:59:59`/`T23:59:59.999` sin offset
// repartidos en ladder/admin/reservas.
export function finDelDiaEnCaracas(instante: Date): Date {
  return new Date(inicioDelDiaEnCaracas(instante).getTime() + 24 * 60 * 60 * 1000 - 1)
}

// Construye el instante UTC de una fecha+hora "de pared" en Caracas, dadas
// como componentes ("YYYY-MM-DD", "HH:mm") — reemplaza `new Date(`${fecha}T${hora}`)`,
// que hoy se parsea en hora local del navegador o del proceso (UTC en
// producción), no en Caracas. Como el offset de Caracas es fijo (-04:00,
// sin horario de verano), basta con anexarlo al string ISO.
//
// Esta función NO ajusta el día calendario si el resultado cruza
// medianoche (p. ej. instanteEnCaracas('2026-09-05', '23:30') + 60 min de
// duración cae en el 6 de septiembre) — quien la use y necesite un rango
// de duración debe sumar los minutos en milisegundos sobre el instante
// resultante, no reconstruir la hora de fin a partir de otro string de
// fecha/hora asumiendo que es el mismo día.
export function instanteEnCaracas(fechaISO: string, horaHHMM: string = '00:00'): Date {
  const horaConSegundos = horaHHMM.length === 5 ? `${horaHHMM}:00` : horaHHMM
  return new Date(`${fechaISO}T${horaConSegundos}-04:00`)
}

// --- Aritmética de días calendario (Caracas-aware) ---

// Suma (o resta, con `dias` negativo) días calendario a un instante,
// preservando la hora de pared en Caracas. Como Venezuela no tiene horario
// de verano, el offset nunca cambia entre un día y otro — sumar N*24h en
// milisegundos equivale exactamente a sumar N días calendario en Caracas.
// Reemplaza los `d.setDate(d.getDate() + n)` hechos en hora local (navegador
// o proceso UTC) en reagendar-reto, responder-reto, activar-standby,
// crear-temporada, cooldowns de la escalera, etc.
export function sumarDiasEnCaracas(instante: Date, dias: number): Date {
  return new Date(instante.getTime() + dias * 24 * 60 * 60 * 1000)
}

// Día de la semana en Caracas (0=domingo…6=sábado) de un instante —
// reemplaza `new Date(y, m-1, d).getDay()`, que hoy se calcula en hora
// local del navegador.
export function diaDeLaSemanaEnCaracas(instante: Date): number {
  return descomponerEnCaracas(aFecha(instante)).dia
}

// Minutos desde medianoche en Caracas de un instante.
export function minutosDesdeMedianocheEnCaracas(instante: Date): number {
  return descomponerEnCaracas(aFecha(instante)).minutos
}

// --- Reglas de horario de cancha (mismo comportamiento que
// lib/reservas.ts, construida sobre descomponerEnCaracas de este módulo) ---

// Devuelve si esa cancha, empezando a esa hora y con esa duración, cabe por
// completo dentro de su horario de apertura normal (sin pasarse del cierre).
export function horaValidaParaCancha(cancha: string, fecha: Date, duracionMin: number): boolean {
  const { dia, minutos } = descomponerEnCaracas(fecha)
  const esFinde = dia === 0 || dia === 6
  if (esFinde) return true

  const esViernes = dia === 5
  const minutosFin = minutos + duracionMin

  if (cancha === 'HGV1') {
    return esViernes
      ? minutos >= 1080 && minutosFin <= 1440 // Viernes: 6:00pm – 12:00am
      : minutos >= 1200 && minutosFin <= 1440 // Lun-Jue: 8:00pm – 12:00am
  }
  if (cancha === 'HGV2') {
    // Los viernes, HGV 2 mantiene su franja de mañana normal, pero la noche
    // empieza una hora antes (6:00pm en vez de 7:00pm) — igual que HGV 1 ese día.
    const enManana = minutos >= 360 && minutosFin <= 840 // 6:00am – 2:00pm
    const enNoche = esViernes
      ? minutos >= 1080 && minutosFin <= 1440 // Viernes: 6:00pm – 12:00am
      : minutos >= 1140 && minutosFin <= 1440 // Lun-Jue: 7:00pm – 12:00am
    return enManana || enNoche
  }
  return true
}

// --- Formato para mostrar al usuario (siempre Caracas, sin importar su
// navegador — y siempre en es-VE, no es-ES, por ser una app venezolana) ---

// Hora "HH:mm".
export function formatearHora(instante: Date | string): string {
  return new Intl.DateTimeFormat('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false, // es-VE por defecto usa 12h ("06:00 p. m."); el resto de la app ya asume 24h
    timeZone: ZONA_HORARIA,
  }).format(aFecha(instante))
}

// Fecha corta, p. ej. "5 de septiembre" (o "5 sep" con mes: 'corto', o
// "5 de septiembre de 2026" con conAnio: true).
export function formatearFechaCorta(instante: Date | string, opts?: { mes?: 'corto' | 'largo'; conAnio?: boolean }): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: opts?.mes === 'corto' ? 'short' : 'long',
    ...(opts?.conAnio ? { year: 'numeric' as const } : {}),
    timeZone: ZONA_HORARIA,
  }).format(aFecha(instante))
}

// Fecha larga con día de la semana, p. ej. "sábado 5 de septiembre"
// (o "sábado 5 de septiembre de 2026" con conAnio: true).
export function formatearFechaLarga(instante: Date | string, opts?: { conAnio?: boolean }): string {
  return new Intl.DateTimeFormat('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(opts?.conAnio ? { year: 'numeric' as const } : {}),
    timeZone: ZONA_HORARIA,
  }).format(aFecha(instante))
}

// Fecha + hora combinadas, p. ej. "sábado 5 de septiembre, 18:00".
export function formatearFechaHora(instante: Date | string): string {
  return new Intl.DateTimeFormat('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false, // es-VE por defecto usa 12h ("06:00 p. m."); el resto de la app ya asume 24h
    timeZone: ZONA_HORARIA,
  }).format(aFecha(instante))
}

// Fecha corta con año, sin día de semana — para tablas y reportes admin,
// p. ej. "5 sep 2026".
export function formatearFechaConAnio(instante: Date | string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: ZONA_HORARIA,
  }).format(aFecha(instante))
}
