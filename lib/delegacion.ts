// Módulo "Delegación" (Pagos → Delegación): inscripciones a torneos
// inter-clubes y compra de uniformes. Constantes y validaciones compartidas
// entre las rutas app/api/admin/delegacion/... y la UI (app/admin/Delegacion.tsx)
// — sin imports de servidor, se puede usar en ambos lados.
//
// La base (migración delegacion_pagos) ya bloquea los casos inválidos con
// checks e índice único; aquí se repite la validación para dar un mensaje
// claro antes del insert, y se traducen los errores de Postgres que igual
// se escapen.

export const TIPOS_PAGO = ['pago_movil', 'transferencia', 'efectivo'] as const
export type TipoPago = (typeof TIPOS_PAGO)[number]

export const MONEDAS = ['USD', 'BS'] as const
export type Moneda = (typeof MONEDAS)[number]

export const TIPOS_PRENDA = ['franela_dama', 'franela_caballero', 'chaqueta'] as const
export type TipoPrenda = (typeof TIPOS_PRENDA)[number]

export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const
export type Talla = (typeof TALLAS)[number]

export const ETIQUETA_TIPO_PAGO: Record<TipoPago, string> = {
  pago_movil: 'Pago móvil',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo (US$)',
}

export const ETIQUETA_PRENDA: Record<TipoPrenda, string> = {
  franela_dama: 'Franela dama',
  franela_caballero: 'Franela caballero',
  chaqueta: 'Chaqueta',
}

// Estado de una prenda en el ciclo de fabricación: sin lote = pendiente por
// enviar; con lote en fábrica / recibido; y finalmente entregada al jugador.
export type EstadoPrenda = 'pendiente' | 'en_fabrica' | 'recibido' | 'entregado'

export const ETIQUETA_ESTADO_PRENDA: Record<EstadoPrenda, string> = {
  pendiente: 'Pendiente',
  en_fabrica: 'En fábrica',
  recibido: 'Recibido',
  entregado: 'Entregado',
}

export function estadoPrenda(item: { entregado: boolean; lote_id: string | null }, estadoLote: string | undefined): EstadoPrenda {
  if (item.entregado) return 'entregado'
  if (!item.lote_id) return 'pendiente'
  return estadoLote === 'recibido' ? 'recibido' : 'en_fabrica'
}

// Tasa BCV a 2 decimales como la publica el BCV y como se cobra: TRUNCADA,
// no redondeada (857,8876 -> 857,88; 859,0629 -> 859,06). tasas_bcv guarda
// la tasa completa; esto es lo que se muestra, se usa para calcular montos
// y se congela en pagos_delegacion.tasa_bcv. El paso por 1e6 evita que un
// error de coma flotante (p. ej. 859.06 * 100 = 85905.99999…) baje un centavo.
export function tasaDosDecimales(tasa: number): number {
  return Math.floor(Math.round(Number(tasa) * 1e6) / 1e4) / 100
}

export const SIMBOLO_MONEDA: Record<Moneda, string> = { USD: '$', BS: 'Bs.' }

// Efectivo siempre en US$ y pago móvil siempre en Bs.; la transferencia la
// elige el admin (hay cuentas en dólares en bancos venezolanos), por
// defecto Bs. Devuelve null si la moneda queda libre.
export function monedaFijaDe(tipoPago: string): Moneda | null {
  if (tipoPago === 'efectivo') return 'USD'
  if (tipoPago === 'pago_movil') return 'BS'
  return null
}

export function monedaPorDefectoDe(tipoPago: string): Moneda {
  return monedaFijaDe(tipoPago) ?? 'BS'
}

// Mismo formato que la tabla de Pagos de la escalera: Bs. con punto de
// miles y coma decimal (es-VE), $ con coma de miles y punto decimal (en-US).
export function formatearMontoDelegacion(monto: number, moneda: string): string {
  const opciones = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return moneda === 'USD'
    ? `$ ${Number(monto).toLocaleString('en-US', opciones)}`
    : `Bs. ${Number(monto).toLocaleString('es-VE', opciones)}`
}

// --- Validación server-side (y reutilizable en el cliente) ---

export type DatosPago = {
  monto: number
  moneda: string
  tipo_pago: string
  referencia: string | null
}

// Reglas comunes a cualquier pago de delegación. Devuelve el mensaje de
// error para el admin, o null si todo está bien.
export function validarDatosPago(p: DatosPago): string | null {
  if (!TIPOS_PAGO.includes(p.tipo_pago as TipoPago)) return 'El método de pago no es válido'
  if (!MONEDAS.includes(p.moneda as Moneda)) return 'La moneda no es válida'
  if (!Number.isFinite(p.monto) || p.monto <= 0) return 'El monto debe ser mayor a 0'
  if (p.tipo_pago === 'efectivo' && p.moneda !== 'USD') return 'El efectivo se registra solo en US$'
  if (p.tipo_pago === 'pago_movil' && p.moneda !== 'BS') return 'El pago móvil es solo en Bs.'
  if (p.tipo_pago !== 'efectivo' && !p.referencia) return 'Falta la referencia'
  return null
}

// precio_usd: precio de referencia de la prenda en US$ (precios_prendas).
// El precio_unitario que se guarda va en la moneda del pago: el mismo en un
// pago en US$, o convertido a Bs. con la tasa BCV en un pago en Bs.
export type ItemUniforme = {
  tipo_prenda: string
  talla: string
  cantidad: number
  precio_usd: number | null
}

export function validarItemsUniforme(items: unknown): { items: ItemUniforme[] } | { error: string } {
  if (!Array.isArray(items) || items.length === 0) return { error: 'El pedido debe tener al menos una prenda' }
  const limpios: ItemUniforme[] = []
  for (const i of items as any[]) {
    if (!TIPOS_PRENDA.includes(i?.tipo_prenda)) return { error: 'Tipo de prenda no válido' }
    if (!TALLAS.includes(i?.talla)) return { error: 'Talla no válida' }
    const cantidad = Number(i?.cantidad)
    if (!Number.isInteger(cantidad) || cantidad <= 0) return { error: 'La cantidad de cada prenda debe ser un entero mayor a 0' }
    const precio = i?.precio_usd === '' || i?.precio_usd == null ? null : Number(i.precio_usd)
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return { error: 'El precio unitario no es válido' }
    limpios.push({ tipo_prenda: i.tipo_prenda, talla: i.talla, cantidad, precio_usd: precio })
  }
  return { items: limpios }
}

// Normaliza texto opcional del body: recorta espacios y convierte '' en null.
export function textoOpcional(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

// --- Errores de Postgres → mensaje para el admin ---

export function mensajeErrorPostgres(err: { code?: string; message?: string; details?: string } | null | undefined): string {
  const texto = `${err?.message || ''} ${err?.details || ''}`
  switch (err?.code) {
    case '23505':
      if (texto.includes('pagos_delegacion_inscripcion_unica')) return 'Este jugador ya está inscrito en este torneo'
      return 'Ya existe un registro igual'
    case '23514':
      if (texto.includes('efectivo_en_usd')) return 'El efectivo se registra solo en US$'
      if (texto.includes('pago_movil_en_bs')) return 'El pago móvil es solo en Bs.'
      if (texto.includes('referencia_obligatoria')) return 'Falta la referencia'
      if (texto.includes('entrega_requiere_lote_recibido')) return 'Esta prenda todavía no se ha recibido de la fábrica; no se puede entregar'
      if (texto.includes('monto_check')) return 'El monto debe ser mayor a 0'
      if (texto.includes('tipo_pago_check')) return 'El método de pago no es válido'
      if (texto.includes('moneda_check')) return 'La moneda no es válida'
      if (texto.includes('torneo_si_inscripcion')) return 'Una inscripción necesita torneo, y un pedido de uniformes no lleva torneo'
      if (texto.includes('jugador_o_externo')) return 'Elige un jugador o escribe el nombre de la persona'
      if (texto.includes('talla_check')) return 'Talla no válida'
      if (texto.includes('tipo_prenda_check')) return 'Tipo de prenda no válido'
      if (texto.includes('cantidad_check')) return 'La cantidad de cada prenda debe ser mayor a 0'
      return 'Algún dato del pago no es válido'
    case '23503':
      return 'El jugador o el torneo indicado no existe'
    case 'P0002': // no_data_found, lanzado por crear_lote_uniforme
      return err?.message || 'No hay prendas pendientes por enviar a fábrica'
    default:
      return err?.message || 'Error inesperado'
  }
}

// --- Torneos externos ---

// Lee y valida los campos de un torneo externo desde el body de
// POST/PATCH /api/admin/delegacion/torneo. Solo incluye los campos que
// vienen en el body (para que el PATCH no pise lo que no se mandó); con
// `exigirNombre` (POST) el nombre es obligatorio.
export function camposTorneo(body: any, exigirNombre: boolean): { campos: Record<string, any> } | { error: string } {
  const campos: Record<string, any> = {}

  if (exigirNombre || 'nombre' in body) {
    const nombre = textoOpcional(body.nombre)
    if (!nombre) return { error: 'Escribe el nombre del torneo' }
    campos.nombre = nombre
  }
  if ('sede' in body) campos.sede = textoOpcional(body.sede)

  for (const clave of ['fechaInicio', 'fechaFin'] as const) {
    if (!(clave in body)) continue
    const fecha = textoOpcional(body[clave])
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'La fecha no es válida' }
    campos[clave === 'fechaInicio' ? 'fecha_inicio' : 'fecha_fin'] = fecha
  }
  if (campos.fecha_inicio && campos.fecha_fin && campos.fecha_fin < campos.fecha_inicio) {
    return { error: 'La fecha de fin no puede ser antes del inicio' }
  }

  if ('montoInscripcion' in body) {
    const bruto = body.montoInscripcion
    const monto = bruto === '' || bruto == null ? null : Number(bruto)
    if (monto !== null && (!Number.isFinite(monto) || monto <= 0)) return { error: 'El monto de inscripción debe ser mayor a 0' }
    campos.monto_inscripcion = monto
  }
  if ('moneda' in body) {
    if (!MONEDAS.includes(body.moneda)) return { error: 'La moneda no es válida' }
    campos.moneda = body.moneda
  }
  if ('activo' in body) {
    if (typeof body.activo !== 'boolean') return { error: 'El estado activo no es válido' }
    campos.activo = body.activo
  }

  return { campos }
}
