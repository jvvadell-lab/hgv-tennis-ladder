// Tasa BCV (USD y EUR) — captura desde DolarAPI, validación y "tasa
// vigente". Solo servidor: recibe el cliente de Supabase (service role) de
// quien la llama.
//
// fecha_vigencia es la "fecha valor" del BCV: DolarAPI la entrega en
// fechaActualizacion como medianoche de Caracas (p. ej.
// "2026-09-30T00:00:00-04:00"), verificado contra el histórico y los
// valores publicados por el BCV. El BCV publica en la tarde (4–6 pm) la
// tasa del siguiente día hábil, así que después de esa hora DolarAPI ya
// devuelve la fecha de mañana (o del lunes, si es viernes).
//
// La tasa vigente en una fecha es la fila más reciente con
// fecha_vigencia <= esa fecha: fines de semana y feriados queda la del
// último día hábil.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fechaISOEnCaracas, hoyEnCaracas, instanteEnCaracas, sumarDiasEnCaracas, diaDeLaSemanaEnCaracas } from '@/lib/tiempo'

const URL_USD = 'https://ve.dolarapi.com/v1/dolares/oficial'
const URL_EUR = 'https://ve.dolarapi.com/v1/euros/oficial'
const URL_HIST_USD = 'https://ve.dolarapi.com/v1/historicos/dolares/oficial'
const URL_HIST_EUR = 'https://ve.dolarapi.com/v1/historicos/euros/oficial'

// Variación máxima aceptada contra la tasa anterior antes de considerar el
// valor absurdo y no guardarlo.
export const VARIACION_MAXIMA = 0.2
// Días hacia atrás que el cron revisa en el histórico para rellenar huecos
// (p. ej. si un día falló).
const DIAS_RELLENO = 14
// Más días hábiles que esto sin tasa nueva = "desactualizada".
export const DIAS_HABILES_DESACTUALIZADA = 3

export type TasaBcv = {
  fecha_vigencia: string
  usd: number
  eur: number
  fuente: 'dolarapi' | 'manual'
  capturada_at: string
}

export type TasaVigente = TasaBcv & { dias_habiles_antiguedad: number; desactualizada: boolean }

type Candidata = { fecha: string; usd: number; eur: number }

export type ResultadoCaptura = {
  guardadas: { fecha: string; usd: number; eur: number; tipo: 'actual' | 'relleno' }[]
  rechazadas: { fecha: string; motivo: string }[]
}

// --- Fechas ---

export function esDiaHabil(fechaISO: string): boolean {
  const dia = diaDeLaSemanaEnCaracas(instanteEnCaracas(fechaISO, '12:00'))
  return dia >= 1 && dia <= 5
}

// Días hábiles (lun–vie) transcurridos después de `desde` hasta `hasta`
// inclusive. No conoce feriados: tras un feriado largo puede marcar
// "desactualizada" un día antes de lo justo.
export function diasHabilesEntre(desdeISO: string, hastaISO: string): number {
  let n = 0
  let cursor = instanteEnCaracas(desdeISO, '12:00')
  const fin = instanteEnCaracas(hastaISO, '12:00')
  while (true) {
    cursor = sumarDiasEnCaracas(cursor, 1)
    if (cursor > fin) break
    if (esDiaHabil(fechaISOEnCaracas(cursor))) n++
  }
  return n
}

// "2026-09-30T00:00:00-04:00" -> "2026-09-30", interpretada en Caracas (no
// con slice sobre el string ni sobre el ISO en UTC).
export function fechaVigenciaDesdeApi(fechaActualizacion: string): string | null {
  const instante = new Date(fechaActualizacion)
  if (isNaN(instante.getTime())) return null
  return fechaISOEnCaracas(instante)
}

// --- Validación ---

// Devuelve el motivo de rechazo, o null si la tasa es aceptable.
export function validarTasa(nueva: { usd: number; eur: number }, anterior: { usd: number; eur: number } | null): string | null {
  for (const moneda of ['usd', 'eur'] as const) {
    const v = nueva[moneda]
    if (!Number.isFinite(v) || v <= 0) return `Valor ${moneda.toUpperCase()} vacío o inválido (${v})`
    if (anterior) {
      const variacion = Math.abs(v - Number(anterior[moneda])) / Number(anterior[moneda])
      if (variacion > VARIACION_MAXIMA) {
        return `Variación ${moneda.toUpperCase()} de ${(variacion * 100).toFixed(1)}% contra la tasa anterior (${anterior[moneda]} → ${v})`
      }
    }
  }
  return null
}

// --- Lectura ---

export async function obtenerTasaVigente(db: SupabaseClient, fechaISO: string = hoyEnCaracas()): Promise<TasaVigente | null> {
  const { data, error } = await db
    .from('tasas_bcv')
    .select('fecha_vigencia, usd, eur, fuente, capturada_at')
    .lte('fecha_vigencia', fechaISO)
    .order('fecha_vigencia', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const dias = diasHabilesEntre(data.fecha_vigencia, fechaISO)
  return {
    ...data,
    usd: Number(data.usd),
    eur: Number(data.eur),
    dias_habiles_antiguedad: dias,
    desactualizada: dias > DIAS_HABILES_DESACTUALIZADA,
  }
}

async function tasaAnteriorA(db: SupabaseClient, fechaISO: string) {
  const { data, error } = await db
    .from('tasas_bcv')
    .select('usd, eur')
    .lt('fecha_vigencia', fechaISO)
    .order('fecha_vigencia', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { usd: Number(data.usd), eur: Number(data.eur) } : null
}

// --- DolarAPI ---

async function pedirJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`DolarAPI ${url} respondió ${res.status}`)
  return res.json()
}

// Tasa actual (la última publicada) de USD y EUR. Falla si las dos no traen
// la misma fecha valor.
async function pedirTasaActual(): Promise<Candidata> {
  const [usd, eur] = await Promise.all([pedirJson(URL_USD), pedirJson(URL_EUR)])
  const fechaUsd = fechaVigenciaDesdeApi(usd?.fechaActualizacion)
  const fechaEur = fechaVigenciaDesdeApi(eur?.fechaActualizacion)
  if (!fechaUsd || !fechaEur) throw new Error('DolarAPI no trajo fechaActualizacion válida')
  if (fechaUsd !== fechaEur) throw new Error(`Fechas distintas en DolarAPI: USD ${fechaUsd}, EUR ${fechaEur}`)
  return { fecha: fechaUsd, usd: Number(usd?.promedio), eur: Number(eur?.promedio) }
}

// Histórico de los últimos DIAS_RELLENO días, solo fechas con USD y EUR.
async function pedirHistoricoReciente(): Promise<Candidata[]> {
  const [usd, eur] = await Promise.all([pedirJson(URL_HIST_USD), pedirJson(URL_HIST_EUR)])
  const desde = fechaISOEnCaracas(sumarDiasEnCaracas(instanteEnCaracas(hoyEnCaracas(), '12:00'), -DIAS_RELLENO))
  const eurPorFecha = new Map<string, number>((eur as any[]).map((r) => [r.fecha, Number(r.promedio)]))
  return (usd as any[])
    .filter((r) => r.fecha >= desde && eurPorFecha.has(r.fecha))
    .map((r) => ({ fecha: r.fecha, usd: Number(r.promedio), eur: eurPorFecha.get(r.fecha)! }))
}

async function guardar(db: SupabaseClient, c: Candidata) {
  const { error } = await db.from('tasas_bcv').upsert(
    { fecha_vigencia: c.fecha, usd: c.usd, eur: c.eur, fuente: 'dolarapi', registrada_por: null, capturada_at: new Date().toISOString() },
    { onConflict: 'fecha_vigencia' }
  )
  if (error) throw error
}

// Captura la tasa actual (upsert por fecha: una segunda llamada el mismo día
// no duplica; la de DolarAPI reemplaza una carga manual de esa fecha) y, con
// `rellenar`, completa desde el histórico las fechas recientes que falten
// (esas solo se insertan, no pisan lo existente). Cada fecha se valida
// contra la anterior; lo rechazado no se guarda y se registra en los logs.
export async function capturarDesdeDolarApi(db: SupabaseClient, opciones: { rellenar: boolean }): Promise<ResultadoCaptura> {
  const resultado: ResultadoCaptura = { guardadas: [], rechazadas: [] }
  const hoy = hoyEnCaracas()

  const actual = await pedirTasaActual()
  const limiteAtras = fechaISOEnCaracas(sumarDiasEnCaracas(instanteEnCaracas(hoy, '12:00'), -7))
  const limiteAdelante = fechaISOEnCaracas(sumarDiasEnCaracas(instanteEnCaracas(hoy, '12:00'), 5))

  let relleno: Candidata[] = []
  if (opciones.rellenar) {
    try {
      relleno = await pedirHistoricoReciente()
    } catch (err: any) {
      console.error('[tasa-bcv] No se pudo leer el histórico para rellenar:', err.message)
    }
  }

  const { data: existentes, error } = await db
    .from('tasas_bcv')
    .select('fecha_vigencia')
    .gte('fecha_vigencia', relleno[0]?.fecha ?? actual.fecha)
  if (error) throw error
  const yaGuardadas = new Set((existentes || []).map((r) => r.fecha_vigencia))

  // En orden de fecha, para validar cada una contra la anterior ya guardada.
  const pendientes: (Candidata & { tipo: 'actual' | 'relleno' })[] = [
    ...relleno.filter((c) => c.fecha !== actual.fecha && !yaGuardadas.has(c.fecha)).map((c) => ({ ...c, tipo: 'relleno' as const })),
    { ...actual, tipo: 'actual' as const },
  ].sort((a, b) => a.fecha.localeCompare(b.fecha))

  for (const c of pendientes) {
    let motivo: string | null = null
    if (c.tipo === 'actual' && (c.fecha < limiteAtras || c.fecha > limiteAdelante)) {
      motivo = `Fecha de vigencia fuera de rango (${c.fecha}, hoy es ${hoy})`
    } else {
      motivo = validarTasa(c, await tasaAnteriorA(db, c.fecha))
    }
    if (motivo) {
      console.error(`[tasa-bcv] Rechazada ${c.fecha}: ${motivo}`)
      resultado.rechazadas.push({ fecha: c.fecha, motivo })
      continue
    }
    await guardar(db, c)
    resultado.guardadas.push({ fecha: c.fecha, usd: c.usd, eur: c.eur, tipo: c.tipo })
  }
  return resultado
}

// --- Respaldo al leer (GET /api/tasa-bcv) ---

// Una sola consulta a DolarAPI a la vez por instancia, y no más de una cada
// INTERVALO_MIN_RESPALDO_MS: varias visitas simultáneas comparten la misma
// promesa, y en un feriado (día hábil sin tasa propia) no se consulta en
// cada visita. El upsert por fecha evita duplicados aunque dos instancias
// consulten a la vez.
const INTERVALO_MIN_RESPALDO_MS = 10 * 60 * 1000
let respaldoEnCurso: Promise<void> | null = null
let ultimoIntentoRespaldo = 0

export async function tasaVigenteConRespaldo(db: SupabaseClient): Promise<TasaVigente | null> {
  const hoy = hoyEnCaracas()
  let vigente = await obtenerTasaVigente(db, hoy)
  if (vigente?.fecha_vigencia === hoy || !esDiaHabil(hoy)) return vigente

  if (!respaldoEnCurso && Date.now() - ultimoIntentoRespaldo >= INTERVALO_MIN_RESPALDO_MS) {
    ultimoIntentoRespaldo = Date.now()
    respaldoEnCurso = capturarDesdeDolarApi(db, { rellenar: false })
      .then((r) => {
        if (r.guardadas.length) console.log('[tasa-bcv] Respaldo al leer guardó', r.guardadas)
      })
      .catch((err) => console.error('[tasa-bcv] Respaldo al leer falló:', err.message))
      .finally(() => {
        respaldoEnCurso = null
      })
  }
  if (respaldoEnCurso) {
    await respaldoEnCurso
    vigente = await obtenerTasaVigente(db, hoy)
  }
  // Si hoy es hábil y aun así no hay tasa de hoy (DolarAPI caído o feriado),
  // se devuelve la última disponible y se marca desactualizada si no es de hoy.
  if (vigente && vigente.fecha_vigencia !== hoy && esDiaHabil(hoy)) {
    vigente = { ...vigente, desactualizada: vigente.desactualizada || vigente.dias_habiles_antiguedad >= 1 }
  }
  return vigente
}

// Tasa con la que se calcula y se cobra: truncada a 2 decimales, igual que
// la publica el BCV (ver tasaDosDecimales en lib/delegacion).
export { tasaDosDecimales as tasaParaCalculo } from '@/lib/delegacion'
