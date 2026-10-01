'use client'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import TasaBcv, { formatearBs, type TasaBcvVigente } from '@/app/components/TasaBcv'
import { hoyEnCaracas, instanteEnCaracas, formatearFechaConAnio, formatearFechaHora } from '@/lib/tiempo'
import {
  ETIQUETA_ESTADO_PRENDA,
  ETIQUETA_MANGA,
  ETIQUETA_PRENDA,
  ETIQUETA_TIPO_PAGO,
  MANGAS,
  TALLAS_ADULTO,
  TALLAS_NINO,
  TALLAS_POR_PRENDA,
  TIPOS_PAGO,
  TIPOS_PRENDA,
  VARIANTES_PRENDA,
  estadoPrenda,
  etiquetaDiferencia,
  etiquetaPrenda,
  llevaManga,
  validarPrenda,
  varianteDe,
  formatearMontoDelegacion,
  monedaFijaDe,
  monedaPorDefectoDe,
  tasaDosDecimales,
  validarDatosPago,
  type EstadoPrenda,
  type TipoPrenda,
} from '@/lib/delegacion'

// Pagos → Delegación: cobros de la delegación HGV en torneos inter-clubes
// (inscripciones) y compra de uniformes. Separado de los pagos de la
// escalera (tabla pagos); todo se lee y escribe por /api/admin/delegacion/...

type Torneo = {
  id: string
  nombre: string
  sede: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  monto_inscripcion: number | null
  moneda: 'USD' | 'BS'
  activo: boolean
}

type Item = {
  id: string
  tipo_prenda: TipoPrenda
  talla: string
  manga: 'corta' | 'sin_mangas' | null
  cantidad: number
  precio_unitario: number | null
  entregado: boolean
  entregado_at: string | null
  lote_id: string | null
}

type Lote = {
  id: string
  numero: number
  estado: 'en_fabrica' | 'recibido'
  enviado_at: string
  recibido_at: string | null
  notas: string | null
  enviador: { nombre: string } | null
}

// Cantidades por variante de prenda (ver VARIANTES_PRENDA) y talla.
type Matriz = Record<string, Record<string, number>>

type PagoDelegacion = {
  id: string
  numero_recibo: number
  concepto: 'inscripcion_torneo' | 'uniforme'
  torneo_id: string | null
  jugador_id: string | null
  nombre_externo: string | null
  monto: number
  moneda: 'USD' | 'BS'
  tipo_pago: string
  referencia: string | null
  fecha: string
  validado: boolean
  notas: string | null
  anulado: boolean
  anulado_at: string | null
  motivo_anulacion: string | null
  tasa_bcv: number | null
  monto_usd_equivalente: number | null
  diferencia_usd: number
  created_at: string
  jugadores: { nombre: string } | null
  torneo: { nombre: string } | null
  registrado: { nombre: string } | null
  anulador: { nombre: string } | null
  items: Item[]
}

type FormPago = {
  jugadorId: string
  externo: boolean
  nombreExterno: string
  busqueda: string
  tipoPago: string
  moneda: string
  referencia: string
  fecha: string
  notas: string
}

// precioCentavos: precio unitario en US$ (pre-llenado desde precios_prendas).
// manga: solo franela dama ('' = sin elegir todavía).
type LineaPrenda = { tipo_prenda: TipoPrenda; talla: string; manga: string; cantidad: string; precioCentavos: string }

const formPagoInicial = (tipoPago = 'efectivo'): FormPago => ({
  jugadorId: '',
  externo: false,
  nombreExterno: '',
  busqueda: '',
  tipoPago,
  moneda: monedaPorDefectoDe(tipoPago),
  referencia: '',
  fecha: hoyEnCaracas(),
  notas: '',
})

const lineaInicial = (): LineaPrenda => ({ tipo_prenda: 'franela_caballero', talla: 'M', manga: '', cantidad: '1', precioCentavos: '' })

// Al cambiar el tipo de prenda: conserva la talla si existe para la nueva
// prenda (si no, una talla media por defecto) y limpia la manga si no aplica.
function ajustarPrenda<T extends { tipo_prenda: string; talla: string; manga: string }>(x: T, tipo: TipoPrenda): T {
  const tallas = TALLAS_POR_PRENDA[tipo]
  const talla = tallas.includes(x.talla) ? x.talla : tipo === 'franela_nino' ? '8' : 'M'
  return { ...x, tipo_prenda: tipo, talla, manga: llevaManga(tipo) ? x.manga : '' }
}

// Mismo esquema que el formulario de Pagos de la escalera: el admin teclea
// solo dígitos, como centavos ("4000" -> 40,00).
const formatearCentavos = (digitos: string) =>
  (parseInt(digitos || '0', 10) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const centavosANumero = (digitos: string) => parseInt(digitos || '0', 10) / 100
const numeroACentavos = (n: number | null) => (n ? String(Math.round(Number(n) * 100)) : '')

const nombrePersona = (p: PagoDelegacion) => p.jugadores?.nombre || (p.nombre_externo ? `${p.nombre_externo} (invitado)` : '—')
const fechaTabla = (fechaISO: string) => formatearFechaConAnio(instanteEnCaracas(fechaISO))

// Nombre corto para la hoja de Excel: "Abierto Guataparo Country Club 2026"
// -> "Guataparo", "Copa ASOCENCA 2026" -> "ASOCENCA". Excel limita a 31
// caracteres y prohíbe []:*?/\ en el nombre de la hoja.
function nombreCortoTorneo(nombre: string): string {
  const palabrasGenericas = /^(abierto|copa|torneo|country|club|de|del|la|el|\d+)$/i
  const clave = nombre.split(/\s+/).filter((w) => !palabrasGenericas.test(w)).join(' ')
  return clave || nombre
}
function nombreHoja(base: string, usados: Set<string>): string {
  let limpio = base.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31)
  let n = 2
  while (usados.has(limpio)) limpio = `${base.slice(0, 27)} (${n++})`
  usados.add(limpio)
  return limpio
}

const matrizVacia = (): Matriz =>
  Object.fromEntries(VARIANTES_PRENDA.map((v) => [v.clave, Object.fromEntries(v.tallas.map((s) => [s, 0]))]))

const sumarAMatriz = (m: Matriz, i: { tipo_prenda: string; manga?: string | null; talla: string; cantidad: number }) => {
  const fila = m[varianteDe(i)]
  if (fila) fila[i.talla] = (fila[i.talla] || 0) + i.cantidad
}
const totalVariante = (m: Matriz, clave: string) => Object.values(m[clave] || {}).reduce((a, b) => a + b, 0)

// Resumen de tallas en dos grupos: adultos (XS–XXXL; la dama separada por
// manga y sin XXXL) y niño (2–16). "Falta definir manga" solo aparece si
// tiene prendas. Celda null = esa talla no existe para esa prenda.
type GrupoMatriz = { titulo: string; tallas: readonly string[]; filas: { etiqueta: string; valores: (number | null)[]; total: number }[]; totales: number[] }
function gruposMatriz(m: Matriz): GrupoMatriz[] {
  return [
    { titulo: 'Adultos', tallas: TALLAS_ADULTO, nino: false },
    { titulo: 'Niños', tallas: TALLAS_NINO, nino: true },
  ].map(({ titulo, tallas, nino }) => {
    const variantes = VARIANTES_PRENDA.filter((v) => v.nino === nino && (v.clave !== 'franela_dama:sin_definir' || totalVariante(m, v.clave) > 0))
    const filas = variantes.map((v) => {
      const valores = tallas.map((t) => (v.tallas.includes(t) ? m[v.clave]?.[t] || 0 : null))
      return { etiqueta: v.etiqueta, valores, total: totalVariante(m, v.clave) }
    })
    const totales = tallas.map((_, k) => filas.reduce((a, f) => a + (f.valores[k] || 0), 0))
    return { titulo, tallas, filas, totales }
  })
}

const COLOR_ESTADO_PRENDA: Record<EstadoPrenda, { fondo: string; texto: string }> = {
  pendiente: { fondo: '#eee', texto: '#555' },
  en_fabrica: { fondo: '#fff4d6', texto: '#8a5a00' },
  recibido: { fondo: '#e0efff', texto: '#1c5f99' },
  entregado: { fondo: '#e3f5e1', texto: '#2f7a2a' },
}

// PDF del lote para el proveedor: solo cantidades por tipo y talla, sin
// nombres ni precios. jspdf se carga recién al pulsar el botón, para no
// sumarle peso al panel admin.
async function descargarPdfLote(lote: Lote, m: Matriz) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(`HGV Tennis Club — Pedido de uniformes, Lote #${lote.numero}`, 14, 18)
  doc.setFontSize(11)
  doc.text(`Fecha: ${formatearFechaConAnio(lote.enviado_at)}`, 14, 26)
  if (lote.notas) doc.text(`Notas: ${lote.notas}`, 14, 32)

  // Una tabla por variante (la franela dama separada por manga; la de niño
  // con sus tallas 2–16), con las tallas como columnas y el total al final.
  let y = lote.notas ? 40 : 34
  let totalGeneral = 0
  VARIANTES_PRENDA.forEach((v) => {
    const totalTipo = totalVariante(m, v.clave)
    if (!totalTipo) return
    totalGeneral += totalTipo
    doc.setFontSize(13)
    doc.text(v.etiqueta, 14, y)
    autoTable(doc, {
      startY: y + 3,
      head: [[...v.tallas, 'Total']],
      body: [[...v.tallas.map((s) => (m[v.clave][s] ? String(m[v.clave][s]) : '–')), String(totalTipo)]],
      theme: 'grid',
      headStyles: { fillColor: [15, 27, 38], halign: 'center' },
      bodyStyles: { halign: 'center' },
      columnStyles: { [v.tallas.length]: { fontStyle: 'bold' } },
    })
    y = (doc as any).lastAutoTable.finalY + 12
  })
  doc.setFontSize(13)
  doc.text(`Total general: ${totalGeneral} prendas`, 14, y)
  doc.save(`hgv-uniformes-lote-${lote.numero}.pdf`)
}

// --- Lista interna del lote (control del club, con nombres y montos) ---

type FilaListaInterna = {
  persona: string
  prenda: string
  talla: string
  manga: string
  cantidad: number
  monto: number | null // solo en la primera fila de cada pago, para no duplicar totales
  diferencia: string // "Debe $27" / "A favor $5", también solo en la primera fila
  moneda: string
  metodo: string
  referencia: string
  recibo: number
  estado: string
}

type ListaInterna = {
  filas: FilaListaInterna[]
  anuladas: FilaListaInterna[] // pagos anulados cuyas prendas ya estaban en el lote
  totalPrendas: number
  usd: number
  bs: number
}

// Arma la lista a partir de las prendas del lote, agrupadas por pago y
// ordenadas por nombre. Los totales cuentan cada pago una sola vez.
function armarListaInterna(lote: Lote, pagos: PagoDelegacion[], estadoLote: Record<string, string>): ListaInterna {
  const aFilas = (lista: PagoDelegacion[]) =>
    lista
      .map((p) => ({ p, items: p.items.filter((i) => i.lote_id === lote.id) }))
      .filter(({ items }) => items.length > 0)
      .sort((a, b) => nombrePersona(a.p).localeCompare(nombrePersona(b.p), 'es', { sensitivity: 'base' }) || a.p.numero_recibo - b.p.numero_recibo)
      .flatMap(({ p, items }) =>
        items.map((i, k) => ({
          persona: nombrePersona(p),
          prenda: ETIQUETA_PRENDA[i.tipo_prenda],
          talla: i.talla,
          manga: i.manga ? ETIQUETA_MANGA[i.manga] : llevaManga(i.tipo_prenda) ? 'Falta definir' : '',
          cantidad: i.cantidad,
          monto: k === 0 ? Number(p.monto) : null,
          diferencia: k === 0 ? etiquetaDiferencia(p.diferencia_usd) || '' : '',
          moneda: p.moneda === 'USD' ? '$' : 'Bs.',
          metodo: ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago,
          referencia: p.referencia || '',
          recibo: p.numero_recibo,
          estado: ETIQUETA_ESTADO_PRENDA[estadoPrenda(i, estadoLote[lote.id])],
        }))
      )
  const uniformes = pagos.filter((p) => p.concepto === 'uniforme')
  const validos = uniformes.filter((p) => !p.anulado)
  const filas = aFilas(validos)
  const pagosDelLote = validos.filter((p) => p.items.some((i) => i.lote_id === lote.id))
  return {
    filas,
    anuladas: aFilas(uniformes.filter((p) => p.anulado)),
    totalPrendas: filas.reduce((a, f) => a + f.cantidad, 0),
    usd: pagosDelLote.filter((p) => p.moneda === 'USD').reduce((a, p) => a + Number(p.monto), 0),
    bs: pagosDelLote.filter((p) => p.moneda === 'BS').reduce((a, p) => a + Number(p.monto), 0),
  }
}

const COLUMNAS_LISTA_INTERNA = ['Jugador', 'Prenda', 'Manga', 'Talla', 'Cant.', 'Monto', 'Moneda', 'Diferencia', 'Método', 'Referencia', 'Recibo', 'Estado', 'Entregado / firma']

async function descargarPdfListaInterna(lote: Lote, lista: ListaInterna) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(16)
  doc.text(`HGV Tennis Club — Lote #${lote.numero}`, 14, 16)
  doc.setFontSize(11)
  doc.text(`Lista interna · Fecha: ${formatearFechaConAnio(lote.enviado_at)}`, 14, 23)

  const aCeldas = (f: FilaListaInterna) => [
    f.persona, f.prenda, f.manga, f.talla, String(f.cantidad),
    f.monto != null ? formatearMontoDelegacion(f.monto, f.moneda === '$' ? 'USD' : 'BS') : '',
    f.moneda, f.diferencia, f.metodo, f.referencia, `#${f.recibo}`, f.estado, '',
  ]
  const estilo = {
    theme: 'grid' as const,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 27, 38] as [number, number, number] },
    columnStyles: { 4: { halign: 'center' as const }, 5: { halign: 'right' as const }, 12: { cellWidth: 34 } },
  }
  autoTable(doc, { ...estilo, startY: 28, head: [COLUMNAS_LISTA_INTERNA], body: lista.filas.map(aCeldas) })
  let y = (doc as any).lastAutoTable.finalY + 8
  doc.setFontSize(11)
  doc.text(`Total prendas: ${lista.totalPrendas}`, 14, y)
  doc.text(`Recaudado: ${formatearMontoDelegacion(lista.usd, 'USD')}  ·  ${formatearMontoDelegacion(lista.bs, 'BS')}`, 14, y + 6)

  if (lista.anuladas.length) {
    doc.setFontSize(12)
    doc.text('Anulados con prendas ya en fábrica', 14, y + 16)
    autoTable(doc, {
      ...estilo,
      startY: y + 19,
      head: [COLUMNAS_LISTA_INTERNA],
      body: lista.anuladas.map(aCeldas),
      headStyles: { fillColor: [192, 57, 43] },
    })
  }
  doc.save(`hgv-uniformes-lote-${lote.numero}-lista-interna.pdf`)
}

const estiloLabel: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }
const estiloInput: React.CSSProperties = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box', background: 'white' }
const estiloCard: React.CSSProperties = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }
const estiloTh: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' }
const estiloTd: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const estiloBotonPrimario: React.CSSProperties = { background: 'var(--color-court)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }
const estiloBotonChico: React.CSSProperties = { background: 'white', border: '1px solid #ddd', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }

export default function Delegacion({ esAdminCompleto }: { esAdminCompleto: boolean }) {
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [pagos, setPagos] = useState<PagoDelegacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [jugadores, setJugadores] = useState<{ id: string; nombre: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  const [vista, setVista] = useState<'inscripciones' | 'uniformes' | 'torneos'>('inscripciones')
  const [mostrarAnulados, setMostrarAnulados] = useState(false)
  const [filtroTorneo, setFiltroTorneo] = useState('')
  const [recibo, setRecibo] = useState<PagoDelegacion | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null) // id del pago/prenda con acción en curso
  // "Modificar prenda": la prenda que se está editando y sus valores nuevos.
  const [editando, setEditando] = useState<{ itemId: string; tipo_prenda: TipoPrenda; talla: string; manga: string } | null>(null)
  const [editMsg, setEditMsg] = useState('')

  // Formulario de inscripción
  const [insForm, setInsForm] = useState<FormPago>(() => formPagoInicial('efectivo'))
  const [insTorneoId, setInsTorneoId] = useState('')
  const [insMontoCentavos, setInsMontoCentavos] = useState('')
  const [insMsg, setInsMsg] = useState('')
  const [insGuardando, setInsGuardando] = useState(false)

  // Formulario de uniformes
  const [uniForm, setUniForm] = useState<FormPago>(() => formPagoInicial('efectivo'))
  const [uniLineas, setUniLineas] = useState<LineaPrenda[]>([lineaInicial()])
  const [uniMsg, setUniMsg] = useState('')
  const [uniTasa, setUniTasa] = useState<TasaBcvVigente | null>(null)
  const [uniMontoBsCentavos, setUniMontoBsCentavos] = useState('')
  const [insTasa, setInsTasa] = useState<TasaBcvVigente | null>(null)
  const [precios, setPrecios] = useState<Record<string, number>>({})
  const [preciosForm, setPreciosForm] = useState<Record<string, string>>({})
  const [preciosMsg, setPreciosMsg] = useState('')
  const [uniGuardando, setUniGuardando] = useState(false)

  // Torneos (solo admin completo)
  const [torneoEditando, setTorneoEditando] = useState<string | null>(null) // id, 'nuevo' o null
  const [torneoForm, setTorneoForm] = useState({ nombre: '', sede: '', fechaInicio: '', fechaFin: '', montoInscripcion: '', moneda: 'USD', activo: true })
  const [torneoMsg, setTorneoMsg] = useState('')

  const cargar = async () => {
    try {
      const res = await fetch('/api/admin/delegacion/listar', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setTorneos(data.torneos)
      setPagos(data.pagos)
      setLotes(data.lotes)
      setPrecios(data.precios || {})
      setPreciosForm(Object.fromEntries(Object.entries(data.precios || {}).map(([k, v]) => [k, numeroACentavos(v as number)])))
      // Las prendas del formulario que aún no tienen precio toman el de referencia.
      setUniLineas((ls) => ls.map((l) => (l.precioCentavos ? l : { ...l, precioCentavos: numeroACentavos(data.precios?.[l.tipo_prenda] ?? null) })))
      setErrorCarga('')
    } catch (err: any) {
      setErrorCarga(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    supabase
      .from('jugadores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .then(({ data }) => setJugadores(data || []))
  }, [])

  const torneosActivos = torneos.filter((t) => t.activo)
  const pagosVisibles = pagos.filter((p) => mostrarAnulados || !p.anulado)
  const inscripciones = pagosVisibles.filter((p) => p.concepto === 'inscripcion_torneo' && (!filtroTorneo || p.torneo_id === filtroTorneo))
  const pedidosUniforme = pagosVisibles.filter((p) => p.concepto === 'uniforme')
  const cantidadAnulados = pagos.filter((p) => p.anulado).length

  // Totales por torneo — sin anulados, y sin sumar monedas distintas.
  const totalesPorTorneo = useMemo(() => {
    return torneos.map((t) => {
      const validos = pagos.filter((p) => p.concepto === 'inscripcion_torneo' && p.torneo_id === t.id && !p.anulado)
      return {
        torneo: t,
        inscritos: validos.length,
        usd: validos.filter((p) => p.moneda === 'USD').reduce((s, p) => s + Number(p.monto), 0),
        bs: validos.filter((p) => p.moneda === 'BS').reduce((s, p) => s + Number(p.monto), 0),
      }
    })
  }, [torneos, pagos])

  const estadoLote = useMemo(() => Object.fromEntries(lotes.map((l) => [l.id, l.estado])), [lotes])

  // Matrices tipo de prenda × talla: "Pendientes por enviar" (sin lote, de
  // pagos validados y no anulados — lo mismo que toma crear_lote_uniforme)
  // y una por lote (todas sus prendas, lo que ya se le mandó al proveedor).
  const matrices = useMemo(() => {
    const pendientes = matrizVacia()
    let totalPendientes = 0
    const porLote: Record<string, Matriz> = Object.fromEntries(lotes.map((l) => [l.id, matrizVacia()]))
    const prendasPorLote: Record<string, number> = {}
    const recibosSinManga = new Set<number>()
    pagos.filter((p) => p.concepto === 'uniforme').forEach((p) => {
      p.items.forEach((i) => {
        if (i.lote_id) {
          if (porLote[i.lote_id]) sumarAMatriz(porLote[i.lote_id], i)
          prendasPorLote[i.lote_id] = (prendasPorLote[i.lote_id] || 0) + i.cantidad
        } else if (p.validado && !p.anulado) {
          sumarAMatriz(pendientes, i)
          totalPendientes += i.cantidad
          if (i.tipo_prenda === 'franela_dama' && !i.manga) recibosSinManga.add(p.numero_recibo)
        }
      })
    })
    // Franelas dama pendientes sin manga (de antes de existir la opción): el
    // envío a fábrica falla hasta corregirlas con "Modificar prenda".
    const sinManga = [...recibosSinManga].sort((a, b) => a - b)
    return { pendientes, totalPendientes, porLote, prendasPorLote, sinManga }
  }, [pagos, lotes])

  const totalesUniformes = useMemo(() => {
    const validos = pagos.filter((p) => p.concepto === 'uniforme' && !p.anulado)
    return {
      pedidos: validos.length,
      usd: validos.filter((p) => p.moneda === 'USD').reduce((s, p) => s + Number(p.monto), 0),
      bs: validos.filter((p) => p.moneda === 'BS').reduce((s, p) => s + Number(p.monto), 0),
    }
  }, [pagos])

  // --- Acciones ---

  const registrarInscripcion = async () => {
    setInsMsg('')
    const torneo = torneos.find((t) => t.id === insTorneoId)
    if (!torneo) return setInsMsg('❌ Elige el torneo')
    if (!insForm.externo && !insForm.jugadorId) return setInsMsg('❌ Elige el jugador')
    if (insForm.externo && !insForm.nombreExterno.trim()) return setInsMsg('❌ Escribe el nombre de la persona')
    const monto = centavosANumero(insMontoCentavos)
    const errorDatos = validarDatosPago({ monto, moneda: insForm.moneda, tipo_pago: insForm.tipoPago, referencia: insForm.referencia.trim() || null })
    if (errorDatos) return setInsMsg(`❌ ${errorDatos}`)

    setInsGuardando(true)
    try {
      const res = await fetch('/api/admin/delegacion/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto: 'inscripcion_torneo',
          torneoId: insTorneoId,
          jugadorId: insForm.externo ? null : insForm.jugadorId,
          nombreExterno: insForm.externo ? insForm.nombreExterno : null,
          monto,
          moneda: insForm.moneda,
          tipoPago: insForm.tipoPago,
          referencia: insForm.referencia,
          fecha: insForm.fecha,
          notas: insForm.notas,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInsMsg(`✅ Inscripción registrada — recibo #${data.numeroRecibo}${data.sinTasa ? ' · ⚠️ sin tasa BCV para esa fecha: quedó sin equivalente en US$' : ''}`)
      // Se conservan torneo, método y fecha: lo normal es cargar varios seguidos.
      setInsForm({ ...formPagoInicial(insForm.tipoPago), moneda: insForm.moneda, fecha: insForm.fecha })
      await cargar()
    } catch (err: any) {
      setInsMsg(`❌ ${err.message || 'Error al registrar'}`)
    } finally {
      setInsGuardando(false)
    }
  }

  // Total en US$ (los precios de las prendas van en US$). Si el pago es en
  // Bs., monto = total US$ × tasa BCV USD vigente en la fecha del pago,
  // truncada a 2 decimales como la publica el BCV (la que se cobra); el monto queda editable por
  // redondeos, y sin tasa se escribe a mano.
  const totalLineas = uniLineas.reduce((s, l) => s + (parseInt(l.cantidad, 10) || 0) * centavosANumero(l.precioCentavos), 0)
  const cantidadPrendas = uniLineas.reduce((s, l) => s + (parseInt(l.cantidad, 10) || 0), 0)
  const uniEnBs = uniForm.moneda === 'BS'
  const tasaCalculo = uniTasa ? tasaDosDecimales(uniTasa.usd) : null
  const bsCalculado = uniEnBs && tasaCalculo ? Math.round(totalLineas * tasaCalculo * 100) / 100 : null
  useEffect(() => {
    setUniMontoBsCentavos(bsCalculado ? String(Math.round(bsCalculado * 100)) : '')
  }, [bsCalculado])
  const montoUniforme = uniEnBs ? centavosANumero(uniMontoBsCentavos) : totalLineas
  const precioDe = (tipo: string) => numeroACentavos(precios[tipo] ?? null)

  const registrarUniformes = async () => {
    setUniMsg('')
    if (!uniForm.externo && !uniForm.jugadorId) return setUniMsg('❌ Elige el jugador')
    if (uniForm.externo && !uniForm.nombreExterno.trim()) return setUniMsg('❌ Escribe el nombre de la persona')
    for (const l of uniLineas) {
      const prenda = validarPrenda(l)
      if ('error' in prenda) return setUniMsg(`❌ ${prenda.error}`)
      const cantidad = parseInt(l.cantidad, 10)
      if (!cantidad || cantidad <= 0) return setUniMsg('❌ Cada prenda necesita una cantidad mayor a 0')
      if (!centavosANumero(l.precioCentavos)) return setUniMsg('❌ Cada prenda necesita su precio unitario')
    }
    if (uniEnBs && !montoUniforme) return setUniMsg('❌ Escribe el monto en Bs.')
    const errorDatos = validarDatosPago({ monto: montoUniforme, moneda: uniForm.moneda, tipo_pago: uniForm.tipoPago, referencia: uniForm.referencia.trim() || null })
    if (errorDatos) return setUniMsg(`❌ ${errorDatos}`)

    setUniGuardando(true)
    try {
      const res = await fetch('/api/admin/delegacion/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto: 'uniforme',
          jugadorId: uniForm.externo ? null : uniForm.jugadorId,
          nombreExterno: uniForm.externo ? uniForm.nombreExterno : null,
          monto: montoUniforme,
          moneda: uniForm.moneda,
          tipoPago: uniForm.tipoPago,
          referencia: uniForm.referencia,
          fecha: uniForm.fecha,
          notas: uniForm.notas,
          items: uniLineas.map((l) => ({
            tipo_prenda: l.tipo_prenda,
            talla: l.talla,
            manga: llevaManga(l.tipo_prenda) ? l.manga : null,
            cantidad: parseInt(l.cantidad, 10),
            precio_usd: centavosANumero(l.precioCentavos),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUniMsg(`✅ Pedido registrado — recibo #${data.numeroRecibo}${data.sinTasa ? ' · ⚠️ sin tasa BCV para esa fecha: quedó sin equivalente en US$' : ''}`)
      setUniForm({ ...formPagoInicial(uniForm.tipoPago), moneda: uniForm.moneda, fecha: uniForm.fecha })
      setUniLineas([{ ...lineaInicial(), precioCentavos: precioDe(lineaInicial().tipo_prenda) }])
      await cargar()
    } catch (err: any) {
      setUniMsg(`❌ ${err.message || 'Error al registrar'}`)
    } finally {
      setUniGuardando(false)
    }
  }

  const anularPago = async (p: PagoDelegacion) => {
    const enFabrica = p.items.some((i) => i.lote_id && estadoLote[i.lote_id] === 'en_fabrica')
    const aviso = enFabrica ? '\n\n⚠️ Estas prendas ya se enviaron a fabricar: el pago se anula, pero las prendas siguen en su lote.' : ''
    const motivo = prompt(`Anular recibo #${p.numero_recibo} (${nombrePersona(p)}).${aviso}\n\nEscribe el motivo de la anulación:`)
    if (motivo === null) return
    if (!motivo.trim()) return alert('El motivo es obligatorio para anular.')
    setOcupado(p.id)
    try {
      const res = await fetch(`/api/admin/delegacion/pago/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'anular', motivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.advertencia) alert(`⚠️ ${data.advertencia}`)
      await cargar()
    } catch (err: any) {
      alert(err.message || 'Error al anular')
    } finally {
      setOcupado(null)
    }
  }

  const eliminarPago = async (p: PagoDelegacion) => {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE el recibo #${p.numero_recibo} (${nombrePersona(p)})${p.items.length ? ' y sus prendas' : ''}? No se puede deshacer. Si solo quieres dejarlo sin efecto, usa "Anular".`)) return
    setOcupado(p.id)
    try {
      const res = await fetch(`/api/admin/delegacion/pago/${p.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await cargar()
    } catch (err: any) {
      alert(err.message || 'Error al eliminar')
    } finally {
      setOcupado(null)
    }
  }

  // Si cambia el precio, el servidor responde 409 con la diferencia y no
  // guarda; se muestra y, si el admin acepta, se reenvía con confirmar.
  const guardarModificacion = async (pago: PagoDelegacion, confirmar = false): Promise<void> => {
    if (!editando) return
    const prenda = validarPrenda(editando)
    if ('error' in prenda) return setEditMsg(`❌ ${prenda.error}`)
    setOcupado(editando.itemId)
    setEditMsg('')
    try {
      const res = await fetch(`/api/admin/delegacion/item/${editando.itemId}/modificar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prenda, confirmar }),
      })
      const data = await res.json()
      if (res.status === 409 && data.requiereConfirmacion) {
        const dif = Number(data.diferenciaUsd)
        const enBs = data.diferenciaBs != null ? ` (≈ ${formatearBs(Math.abs(data.diferenciaBs))} a la tasa BCV de hoy)` : ''
        const texto = dif > 0
          ? `El cambio sube el precio: el jugador queda debiendo $${Math.abs(dif).toLocaleString('en-US')}${enBs}.`
          : `El cambio baja el precio: el jugador queda con $${Math.abs(dif).toLocaleString('en-US')} a favor${enBs}.`
        if (!confirm(`${texto}\n\nEl monto pagado no cambia; la diferencia queda anotada en el recibo #${pago.numero_recibo}. ¿Guardar el cambio?`)) return
        setOcupado(null)
        return guardarModificacion(pago, true)
      }
      if (!res.ok) throw new Error(data.error)
      setEditando(null)
      await cargar()
    } catch (err) {
      setEditMsg(`❌ ${(err as { message?: string } | null)?.message || 'Error al modificar'}`)
    } finally {
      setOcupado(null)
    }
  }

  const marcarEntregado = async (item: Item, entregado: boolean) => {
    setOcupado(item.id)
    try {
      const res = await fetch(`/api/admin/delegacion/item/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entregado }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await cargar()
    } catch (err: any) {
      alert(err.message || 'Error al marcar la entrega')
    } finally {
      setOcupado(null)
    }
  }

  const enviarAFabrica = async () => {
    if (!matrices.totalPendientes) return alert('No hay prendas pendientes por enviar a fábrica.')
    if (!confirm(`¿Enviar a fábrica ${matrices.totalPendientes} prenda(s) pendientes? Se crea un lote nuevo con todas ellas.`)) return
    setOcupado('lote-nuevo')
    try {
      const res = await fetch('/api/admin/delegacion/lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await cargar()
      alert(`✅ Lote #${data.lote.numero} creado. Descarga el PDF para mandárselo al proveedor.`)
    } catch (err: any) {
      alert(err.message || 'Error al crear el lote')
    } finally {
      setOcupado(null)
    }
  }

  const marcarLoteRecibido = async (lote: Lote) => {
    if (!confirm(`¿Marcar el lote #${lote.numero} como recibido del proveedor? Desde ahí sus prendas se pueden entregar.`)) return
    setOcupado(lote.id)
    try {
      const res = await fetch(`/api/admin/delegacion/lote/${lote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'recibir' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await cargar()
    } catch (err: any) {
      alert(err.message || 'Error al marcar el lote')
    } finally {
      setOcupado(null)
    }
  }

  const guardarPrecios = async () => {
    setPreciosMsg('')
    try {
      const res = await fetch('/api/admin/precios-prendas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precios: Object.fromEntries(Object.entries(preciosForm).map(([k, v]) => [k, centavosANumero(v)])) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreciosMsg('✅ Precios guardados')
      await cargar()
    } catch (err: any) {
      setPreciosMsg(`❌ ${err.message || 'Error al guardar'}`)
    }
  }

  const abrirEdicionTorneo = (t: Torneo | null) => {
    setTorneoMsg('')
    setTorneoEditando(t ? t.id : 'nuevo')
    setTorneoForm({
      nombre: t?.nombre || '',
      sede: t?.sede || '',
      fechaInicio: t?.fecha_inicio || '',
      fechaFin: t?.fecha_fin || '',
      montoInscripcion: numeroACentavos(t?.monto_inscripcion ?? null),
      moneda: t?.moneda || 'USD',
      activo: t?.activo ?? true,
    })
  }

  const guardarTorneo = async () => {
    setTorneoMsg('')
    const esNuevo = torneoEditando === 'nuevo'
    try {
      const res = await fetch(esNuevo ? '/api/admin/delegacion/torneo' : `/api/admin/delegacion/torneo/${torneoEditando}`, {
        method: esNuevo ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...torneoForm,
          montoInscripcion: torneoForm.montoInscripcion ? centavosANumero(torneoForm.montoInscripcion) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTorneoEditando(null)
      await cargar()
    } catch (err: any) {
      setTorneoMsg(`❌ ${err.message || 'Error al guardar'}`)
    }
  }

  // --- Excel: hoja por torneo, Uniformes (una fila por prenda), Resumen tallas ---

  const exportarExcel = () => {
    const libro = XLSX.utils.book_new()
    const usados = new Set<string>()
    const estado = (p: PagoDelegacion) => (p.anulado ? `ANULADO — ${p.motivo_anulacion || ''}` : 'Válido')

    torneos.forEach((t) => {
      const filas: any[] = pagos
        .filter((p) => p.concepto === 'inscripcion_torneo' && p.torneo_id === t.id)
        .slice()
        .reverse()
        .map((p) => ({
          'N° Recibo': p.numero_recibo,
          'Jugador': nombrePersona(p),
          'Método': ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago,
          'Moneda': p.moneda === 'USD' ? '$' : 'Bs.',
          'Monto': Number(p.monto),
          'Tasa BCV': p.tasa_bcv != null ? Number(p.tasa_bcv) : '',
          'Equiv. US$': p.monto_usd_equivalente != null ? Number(p.monto_usd_equivalente) : '',
          'Referencia': p.referencia || '',
          'Fecha': p.fecha,
          'Notas': p.notas || '',
          'Estado': estado(p),
        }))
      const tot = totalesPorTorneo.find((x) => x.torneo.id === t.id)!
      filas.push({})
      filas.push({ 'Jugador': `Inscritos (sin anulados): ${tot.inscritos}` })
      filas.push({ 'Moneda': '$', 'Monto': tot.usd, 'Referencia': 'TOTAL dólares (sin anulados)' })
      filas.push({ 'Moneda': 'Bs.', 'Monto': tot.bs, 'Referencia': 'TOTAL bolívares (sin anulados)' })
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), nombreHoja(`Inscripciones ${nombreCortoTorneo(t.nombre)}`, usados))
    })

    const filasUniformes: any[] = []
    pagos.filter((p) => p.concepto === 'uniforme').slice().reverse().forEach((p) => {
      p.items.forEach((i) => {
        filasUniformes.push({
          'N° Recibo': p.numero_recibo,
          'Jugador': nombrePersona(p),
          'Prenda': ETIQUETA_PRENDA[i.tipo_prenda],
          'Manga': i.manga ? ETIQUETA_MANGA[i.manga] : llevaManga(i.tipo_prenda) ? 'Falta definir' : '',
          'Talla': i.talla,
          'Cantidad': i.cantidad,
          'Precio unitario': i.precio_unitario != null ? Number(i.precio_unitario) : '',
          'Subtotal': i.precio_unitario != null ? Number(i.precio_unitario) * i.cantidad : '',
          'Moneda': p.moneda === 'USD' ? '$' : 'Bs.',
          'Método': ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago,
          'Referencia': p.referencia || '',
          'Fecha pago': p.fecha,
          'Tasa BCV': p.tasa_bcv != null ? Number(p.tasa_bcv) : '',
          'Equiv. US$ del pago': p.monto_usd_equivalente != null ? Number(p.monto_usd_equivalente) : '',
          'Diferencia US$ del pago': Number(p.diferencia_usd || 0) || '',
          'Estado prenda': ETIQUETA_ESTADO_PRENDA[estadoPrenda(i, i.lote_id ? estadoLote[i.lote_id] : undefined)],
          'Lote': i.lote_id ? `#${lotes.find((l) => l.id === i.lote_id)?.numero ?? ''}` : '',
          'Estado': estado(p),
        })
      })
    })
    filasUniformes.push({})
    filasUniformes.push({ 'Moneda': '$', 'Subtotal': totalesUniformes.usd, 'Referencia': 'TOTAL dólares (sin anulados)' })
    filasUniformes.push({ 'Moneda': 'Bs.', 'Subtotal': totalesUniformes.bs, 'Referencia': 'TOTAL bolívares (sin anulados)' })
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasUniformes), nombreHoja('Uniformes', usados))

    const matrizAoa = (titulo: string, m: Matriz) => {
      const filas: (string | number)[][] = [[titulo]]
      gruposMatriz(m).forEach((g) => {
        filas.push([g.titulo, ...g.tallas, 'Total'])
        g.filas.forEach((f) => filas.push([f.etiqueta, ...f.valores.map((v) => (v === null ? '—' : v)), f.total]))
        filas.push(['Total', ...g.totales, g.totales.reduce((a, b) => a + b, 0)])
      })
      return filas
    }
    const resumen = [
      ...matrizAoa('Pendientes por enviar', matrices.pendientes),
      ...lotes.flatMap((l) => [
        [],
        ...matrizAoa(`Lote #${l.numero} — ${l.estado === 'recibido' ? 'recibido' : 'en fábrica'} (enviado ${formatearFechaConAnio(l.enviado_at)})`, matrices.porLote[l.id]),
      ]),
    ]
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen), nombreHoja('Resumen tallas', usados))

    lotes.slice().reverse().forEach((l) => {
      const lista = armarListaInterna(l, pagos, estadoLote)
      const aFila = (f: FilaListaInterna) => [f.persona, f.prenda, f.manga, f.talla, f.cantidad, f.monto ?? '', f.moneda, f.diferencia, f.metodo, f.referencia, f.recibo, f.estado, '']
      const aoa: (string | number)[][] = [
        [`HGV Tennis Club — Lote #${l.numero}`],
        [`Lista interna · Fecha: ${formatearFechaConAnio(l.enviado_at)}`],
        [],
        COLUMNAS_LISTA_INTERNA,
        ...lista.filas.map(aFila),
        [],
        ['Total prendas', '', '', '', lista.totalPrendas],
        ['Recaudado US$', '', '', '', '', lista.usd, '$'],
        ['Recaudado Bs.', '', '', '', '', lista.bs, 'Bs.'],
        ...(lista.anuladas.length
          ? [[], ['Anulados con prendas ya en fábrica'], COLUMNAS_LISTA_INTERNA, ...lista.anuladas.map(aFila)]
          : []),
      ]
      XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(aoa), nombreHoja(`Lote ${l.numero} lista interna`, usados))
    })

    XLSX.writeFile(libro, `delegacion-hgv-${hoyEnCaracas()}.xlsx`)
  }

  // --- Piezas de UI reutilizadas por ambos formularios ---

  const selectorPersona = (form: FormPago, setForm: (f: FormPago) => void) => {
    const filtrados = form.busqueda
      ? jugadores.filter((j) => j.nombre.toLowerCase().includes(form.busqueda.toLowerCase()))
      : jugadores
    return (
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        {!form.externo ? (
          <>
            <div>
              <label style={estiloLabel}>Buscar jugador</label>
              <input
                type="text"
                value={form.busqueda}
                onChange={(e) => setForm({ ...form, busqueda: e.target.value })}
                placeholder="Escribe parte del nombre…"
                style={estiloInput}
              />
            </div>
            <div>
              <label style={estiloLabel}>Jugador</label>
              <select value={form.jugadorId} onChange={(e) => setForm({ ...form, jugadorId: e.target.value })} style={estiloInput}>
                <option value="">-- Selecciona ({filtrados.length}) --</option>
                {filtrados.map((j) => (
                  <option key={j.id} value={j.id}>{j.nombre}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label style={estiloLabel}>Nombre (invitado)</label>
            <input
              type="text"
              value={form.nombreExterno}
              onChange={(e) => setForm({ ...form, nombreExterno: e.target.value })}
              placeholder="Nombre y apellido"
              style={estiloInput}
            />
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', alignSelf: 'end', paddingBottom: '10px' }}>
          <input
            type="checkbox"
            checked={form.externo}
            onChange={(e) => setForm({ ...form, externo: e.target.checked, jugadorId: '', nombreExterno: '' })}
          />
          No está en la lista (nombre libre)
        </label>
      </div>
    )
  }

  const camposPago = (form: FormPago, setForm: (f: FormPago) => void) => {
    const fija = monedaFijaDe(form.tipoPago)
    return (
      <>
        <div>
          <label style={estiloLabel}>Método de pago</label>
          <select
            value={form.tipoPago}
            onChange={(e) => setForm({ ...form, tipoPago: e.target.value, moneda: monedaFijaDe(e.target.value) ?? form.moneda })}
            style={estiloInput}
          >
            {TIPOS_PAGO.map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO_PAGO[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={estiloLabel}>Moneda</label>
          <select
            value={form.moneda}
            disabled={!!fija}
            onChange={(e) => setForm({ ...form, moneda: e.target.value })}
            style={{ ...estiloInput, ...(fija ? { background: '#eee', color: '#666' } : {}) }}
          >
            <option value="BS">Bs.</option>
            <option value="USD">US$</option>
          </select>
          {fija && (
            <p style={{ fontSize: '11px', color: '#999', margin: '4px 0 0 0' }}>
              {form.tipoPago === 'efectivo' ? 'El efectivo se registra solo en US$.' : 'El pago móvil es solo en Bs.'}
            </p>
          )}
        </div>
        <div>
          <label style={estiloLabel}>Referencia{form.tipoPago === 'efectivo' ? ' (opcional)' : ''}</label>
          <input
            type="text"
            value={form.referencia}
            onChange={(e) => setForm({ ...form, referencia: e.target.value })}
            placeholder={form.tipoPago === 'efectivo' ? '—' : 'N° de referencia'}
            style={estiloInput}
          />
        </div>
        <div>
          <label style={estiloLabel}>Fecha</label>
          <input type="date" value={form.fecha} max={hoyEnCaracas()} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={estiloInput} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={estiloLabel}>Notas (opcional)</label>
          <input type="text" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={estiloInput} />
        </div>
      </>
    )
  }

  const acciones = (p: PagoDelegacion) => (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      <button onClick={() => setRecibo(p)} style={estiloBotonChico} title="Ver / imprimir recibo">🧾 Recibo</button>
      {!p.anulado && (
        <button onClick={() => anularPago(p)} disabled={ocupado === p.id} style={estiloBotonChico}>🚫 Anular</button>
      )}
      {esAdminCompleto && (
        <button onClick={() => eliminarPago(p)} disabled={ocupado === p.id} style={{ ...estiloBotonChico, color: '#c0392b' }} title="Eliminar definitivamente">🗑️</button>
      )}
    </div>
  )

  const estiloFila = (p: PagoDelegacion, i: number): React.CSSProperties => ({
    borderBottom: '1px solid #eee',
    background: i % 2 === 0 ? 'white' : '#fafafa',
    ...(p.anulado ? { opacity: 0.5 } : {}),
  })

  const marcaAnulado = (p: PagoDelegacion) =>
    p.anulado ? (
      <div style={{ fontSize: '11px', color: '#c0392b', fontWeight: 'bold', marginTop: '2px' }} title={p.motivo_anulacion || ''}>
        ANULADO — {p.motivo_anulacion}
      </div>
    ) : null

  const matrizTabla = (titulo: string, m: Matriz) => (
    <div style={{ marginBottom: '16px' }}>
      {titulo && <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-ink)' }}>{titulo}</h4>}
      {gruposMatriz(m).map((g) => (
        <div key={g.titulo} style={{ overflowX: 'auto', marginBottom: '10px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '13px', background: 'white', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--color-ink)', color: 'white' }}>
                <th style={estiloTh}>{g.titulo}</th>
                {g.tallas.map((t) => <th key={t} style={{ ...estiloTh, textAlign: 'center' }}>{t}</th>)}
                <th style={{ ...estiloTh, textAlign: 'center' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {g.filas.map((f) => (
                <tr key={f.etiqueta} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ ...estiloTd, whiteSpace: 'nowrap', color: f.etiqueta.includes('falta definir') ? '#b45309' : undefined }}>{f.etiqueta}</td>
                  {f.valores.map((v, k) => (
                    <td key={k} style={{ ...estiloTd, textAlign: 'center', fontFamily: 'var(--font-mono)', color: v ? 'inherit' : '#ccc' }}>{v === null ? '—' : v}</td>
                  ))}
                  <td style={{ ...estiloTd, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{f.total}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--color-ink)', fontWeight: 'bold' }}>
                <td style={estiloTd}>Total</td>
                {g.totales.map((v, k) => (
                  <td key={k} style={{ ...estiloTd, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{v}</td>
                ))}
                <td style={{ ...estiloTd, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{g.totales.reduce((a, b) => a + b, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )

  const torneoSeleccionado = torneos.find((t) => t.id === insTorneoId)

  if (cargando) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando delegación...</div>
  }

  return (
    <div>
      {errorCarga && (
        <div style={{ ...estiloCard, color: '#c0392b' }}>❌ {errorCarga}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        {([
          ['inscripciones', '🏟️ Inscripciones'],
          ['uniformes', '👕 Uniformes'],
          ...(esAdminCompleto ? [['torneos', '⚙️ Torneos y precios']] : []),
        ] as [typeof vista, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            style={{
              padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
              border: vista === id ? '2px solid var(--color-court)' : '1px solid #ddd',
              background: vista === id ? 'var(--color-court)' : 'white',
              color: vista === id ? 'white' : 'var(--color-ink)',
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555' }}>
          <input type="checkbox" checked={mostrarAnulados} onChange={(e) => setMostrarAnulados(e.target.checked)} />
          Mostrar anulados ({cantidadAnulados})
        </label>
        <button onClick={exportarExcel} style={{ ...estiloBotonPrimario, background: 'var(--color-net)', padding: '8px 14px', fontSize: '13px' }}>
          📥 Exportar Excel
        </button>
      </div>

      {vista === 'inscripciones' && (
        <>
          <div style={estiloCard}>
            <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>🏟️ Registrar inscripción</h3>
            {torneosActivos.length === 0 ? (
              <p style={{ color: '#6b6b6b' }}>No hay torneos activos.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <label style={estiloLabel}>Torneo</label>
                    <select
                      value={insTorneoId}
                      onChange={(e) => {
                        const t = torneos.find((x) => x.id === e.target.value)
                        setInsTorneoId(e.target.value)
                        // Pre-llena el monto referencial si la moneda del pago coincide con la del torneo.
                        if (t?.monto_inscripcion) {
                          const puedeUsarMoneda = !monedaFijaDe(insForm.tipoPago) || monedaFijaDe(insForm.tipoPago) === t.moneda
                          if (puedeUsarMoneda) {
                            setInsMontoCentavos(numeroACentavos(t.monto_inscripcion))
                            if (!monedaFijaDe(insForm.tipoPago)) setInsForm({ ...insForm, moneda: t.moneda })
                          }
                        }
                      }}
                      style={estiloInput}
                    >
                      <option value="">-- Selecciona --</option>
                      {torneosActivos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                    {torneoSeleccionado?.monto_inscripcion ? (
                      <p style={{ fontSize: '11px', color: '#999', margin: '4px 0 0 0' }}>
                        Referencial: {formatearMontoDelegacion(torneoSeleccionado.monto_inscripcion, torneoSeleccionado.moneda)}
                      </p>
                    ) : null}
                  </div>
                  {selectorPersona(insForm, setInsForm)}
                  <div>
                    <label style={estiloLabel}>Monto ({insForm.moneda === 'USD' ? 'US$' : 'Bs.'})</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={insMontoCentavos ? formatearCentavos(insMontoCentavos) : ''}
                      onChange={(e) => setInsMontoCentavos(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder="0,00"
                      style={estiloInput}
                    />
                  </div>
                  {camposPago(insForm, setInsForm)}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <TasaBcv fecha={insForm.fecha} onTasa={setInsTasa} compacto />
                    {insForm.moneda === 'BS' && insTasa && insMontoCentavos && (
                      <p style={{ fontSize: '12px', color: '#6b6b6b', margin: '4px 0 0 0' }}>
                        Equivale a {formatearMontoDelegacion(Math.round((centavosANumero(insMontoCentavos) / tasaDosDecimales(insTasa.usd)) * 100) / 100, 'USD')} a la tasa de esa fecha.
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={registrarInscripcion} disabled={insGuardando} style={{ ...estiloBotonPrimario, opacity: insGuardando ? 0.6 : 1 }}>
                  {insGuardando ? 'Guardando…' : '💾 Registrar inscripción'}
                </button>
                {insMsg && <p style={{ margin: '10px 0 0 0', fontSize: '14px' }}>{insMsg}</p>}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {totalesPorTorneo.map(({ torneo, inscritos, usd, bs }) => (
              <div key={torneo.id} style={{ background: 'white', borderRadius: '10px', padding: '14px 16px', borderLeft: '4px solid var(--color-court)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: torneo.activo ? 1 : 0.6 }}>
                <div style={{ fontWeight: 'bold', color: 'var(--color-ink)', fontSize: '14px' }}>{torneo.nombre}{!torneo.activo && ' (inactivo)'}</div>
                <div style={{ fontSize: '13px', color: '#555', marginTop: '6px' }}>Inscritos: <strong>{inscritos}</strong></div>
                <div style={{ fontSize: '13px', color: '#555', fontFamily: 'var(--font-mono)' }}>{formatearMontoDelegacion(usd, 'USD')}</div>
                <div style={{ fontSize: '13px', color: '#555', fontFamily: 'var(--font-mono)' }}>{formatearMontoDelegacion(bs, 'BS')}</div>
              </div>
            ))}
          </div>

          <div style={{ ...estiloCard, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ color: 'var(--color-ink)', margin: 0 }}>📋 Inscripciones</h3>
              <select value={filtroTorneo} onChange={(e) => setFiltroTorneo(e.target.value)} style={{ ...estiloInput, width: 'auto' }}>
                <option value="">Todos los torneos</option>
                {torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            {inscripciones.length === 0 ? (
              <p style={{ padding: '0 24px 24px', color: '#6b6b6b', margin: 0 }}>Todavía no hay inscripciones registradas.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-ink)', color: 'white' }}>
                      <th style={estiloTh}>Recibo</th>
                      <th style={estiloTh}>Jugador</th>
                      <th style={estiloTh}>Torneo</th>
                      <th style={estiloTh}>Monto</th>
                      <th style={estiloTh}>Método</th>
                      <th style={estiloTh}>Referencia</th>
                      <th style={estiloTh}>Fecha</th>
                      <th style={estiloTh}>Validado</th>
                      <th style={estiloTh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inscripciones.map((p, i) => (
                      <tr key={p.id} style={estiloFila(p, i)}>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>#{p.numero_recibo}</td>
                        <td style={estiloTd}>{nombrePersona(p)}{marcaAnulado(p)}</td>
                        <td style={estiloTd}>{p.torneo?.nombre || '—'}</td>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', textDecoration: p.anulado ? 'line-through' : 'none' }}>{formatearMontoDelegacion(p.monto, p.moneda)}</td>
                        <td style={estiloTd}>{ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago}</td>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)' }}>{p.referencia || '—'}</td>
                        <td style={{ ...estiloTd, whiteSpace: 'nowrap' }}>{fechaTabla(p.fecha)}</td>
                        <td style={estiloTd}>{p.validado ? '✅' : '⏳'}</td>
                        <td style={estiloTd}>{acciones(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {vista === 'uniformes' && (
        <>
          <div style={estiloCard}>
            <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>👕 Registrar pedido de uniformes</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {selectorPersona(uniForm, setUniForm)}
            </div>

            <label style={estiloLabel}>Prendas (precio unitario en US$)</label>
            {uniLineas.map((l, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: `minmax(150px, 2fr)${llevaManga(l.tipo_prenda) ? ' minmax(130px, 1.5fr)' : ''} minmax(80px, 1fr) minmax(70px, 1fr) minmax(110px, 1.5fr) auto`, gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <select value={l.tipo_prenda} onChange={(e) => setUniLineas(uniLineas.map((x, k) => (k === idx ? { ...ajustarPrenda(x, e.target.value as TipoPrenda), precioCentavos: precioDe(e.target.value) } : x)))} style={estiloInput} aria-label="Tipo de prenda">
                  {TIPOS_PRENDA.map((t) => <option key={t} value={t}>{ETIQUETA_PRENDA[t]}</option>)}
                </select>
                {llevaManga(l.tipo_prenda) && (
                  <select value={l.manga} onChange={(e) => setUniLineas(uniLineas.map((x, k) => (k === idx ? { ...x, manga: e.target.value } : x)))} style={{ ...estiloInput, borderColor: l.manga ? '#ddd' : '#f0b400' }} aria-label="Manga">
                    <option value="">-- Manga --</option>
                    {MANGAS.map((m) => <option key={m} value={m}>{ETIQUETA_MANGA[m]}</option>)}
                  </select>
                )}
                <select value={l.talla} onChange={(e) => setUniLineas(uniLineas.map((x, k) => (k === idx ? { ...x, talla: e.target.value } : x)))} style={estiloInput} aria-label="Talla">
                  {TALLAS_POR_PRENDA[l.tipo_prenda].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="number"
                  min={1}
                  value={l.cantidad}
                  onChange={(e) => setUniLineas(uniLineas.map((x, k) => (k === idx ? { ...x, cantidad: e.target.value } : x)))}
                  style={estiloInput}
                  aria-label="Cantidad"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={l.precioCentavos ? formatearCentavos(l.precioCentavos) : ''}
                  onChange={(e) => setUniLineas(uniLineas.map((x, k) => (k === idx ? { ...x, precioCentavos: e.target.value.replace(/\D/g, '').slice(0, 12) } : x)))}
                  placeholder="US$ unit."
                  style={estiloInput}
                  aria-label="Precio unitario en US$"
                />
                <button
                  onClick={() => setUniLineas(uniLineas.filter((_, k) => k !== idx))}
                  disabled={uniLineas.length === 1}
                  style={{ ...estiloBotonChico, opacity: uniLineas.length === 1 ? 0.4 : 1 }}
                  aria-label="Quitar prenda"
                >
                  ✕
                </button>
              </div>
            ))}
            <button onClick={() => setUniLineas([...uniLineas, { ...lineaInicial(), precioCentavos: precioDe(lineaInicial().tipo_prenda) }])} style={{ ...estiloBotonChico, marginBottom: '14px' }}>+ Agregar prenda</button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={estiloLabel}>Total (US$)</label>
                <div style={{ ...estiloInput, background: '#f0f0f0', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                  {formatearMontoDelegacion(totalLineas, 'USD')}
                </div>
              </div>
              {uniEnBs && (
                <div>
                  <label style={estiloLabel}>Monto a cobrar (Bs.)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={uniMontoBsCentavos ? formatearCentavos(uniMontoBsCentavos) : ''}
                    onChange={(e) => setUniMontoBsCentavos(e.target.value.replace(/\D/g, '').slice(0, 14))}
                    placeholder="0,00"
                    style={estiloInput}
                  />
                </div>
              )}
              {camposPago(uniForm, setUniForm)}
            </div>
            <div style={{ marginBottom: '14px' }}>
              <TasaBcv fecha={uniForm.fecha} onTasa={setUniTasa} compacto />
              {uniEnBs && (
                <p style={{ fontSize: '13px', margin: '6px 0 0 0', fontFamily: 'var(--font-mono)', color: bsCalculado ? '#333' : '#8a5a00' }}>
                  {bsCalculado && tasaCalculo
                    ? `${cantidadPrendas} prenda${cantidadPrendas === 1 ? '' : 's'} · ${formatearMontoDelegacion(totalLineas, 'USD')} × ${formatearBs(tasaCalculo)} = ${formatearBs(bsCalculado)}`
                    : '⚠️ No hay tasa BCV para la fecha del pago: escribe el monto en Bs. a mano (el pago se registra sin equivalente en US$).'}
                </p>
              )}
            </div>
            <button onClick={registrarUniformes} disabled={uniGuardando} style={{ ...estiloBotonPrimario, opacity: uniGuardando ? 0.6 : 1 }}>
              {uniGuardando ? 'Guardando…' : '💾 Registrar pedido'}
            </button>
            {uniMsg && <p style={{ margin: '10px 0 0 0', fontSize: '14px' }}>{uniMsg}</p>}
          </div>

          <div style={estiloCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
              <h3 style={{ color: 'var(--color-ink)', margin: 0 }}>🏭 Pendientes por enviar</h3>
              <button
                onClick={enviarAFabrica}
                disabled={!matrices.totalPendientes || ocupado === 'lote-nuevo'}
                style={{ ...estiloBotonPrimario, opacity: !matrices.totalPendientes || ocupado === 'lote-nuevo' ? 0.5 : 1 }}
              >
                📦 Enviar a fábrica ({matrices.totalPendientes})
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#6b6b6b', margin: '0 0 12px 0' }}>
              {totalesUniformes.pedidos} pedido(s) · {formatearMontoDelegacion(totalesUniformes.usd, 'USD')} · {formatearMontoDelegacion(totalesUniformes.bs, 'BS')} — sin pedidos anulados.
              Solo entran al lote las prendas de pagos validados y no anulados.
            </p>
            {matrices.sinManga.length > 0 && (
              <p style={{ background: '#fff4d6', color: '#8a5a00', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', margin: '0 0 12px 0' }}>
                ⚠️ Falta definir la manga de franelas dama en los recibos {matrices.sinManga.map((n) => `#${n}`).join(', ')}. No se puede enviar a fábrica hasta corregirlas con &quot;✏️ Modificar prenda&quot; (en la tabla de pedidos).
              </p>
            )}
            {matrizTabla('', matrices.pendientes)}

            <h3 style={{ color: 'var(--color-ink)', margin: '20px 0 8px 0' }}>🚚 Lotes enviados</h3>
            {lotes.length === 0 ? (
              <p style={{ color: '#6b6b6b', margin: 0, fontSize: '13px' }}>Todavía no se ha enviado ningún lote a fábrica.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'white' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-ink)', color: 'white' }}>
                      <th style={estiloTh}>Lote</th>
                      <th style={estiloTh}>Enviado</th>
                      <th style={estiloTh}>Estado</th>
                      <th style={estiloTh}>Prendas</th>
                      <th style={estiloTh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotes.map((l) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>#{l.numero}</td>
                        <td style={{ ...estiloTd, whiteSpace: 'nowrap' }}>
                          {formatearFechaConAnio(l.enviado_at)}
                          {l.enviador?.nombre && <div style={{ fontSize: '11px', color: '#999' }}>por {l.enviador.nombre}</div>}
                        </td>
                        <td style={estiloTd}>
                          {l.estado === 'recibido'
                            ? <>✅ Recibido <span style={{ fontSize: '11px', color: '#999' }}>{l.recibido_at ? formatearFechaConAnio(l.recibido_at) : ''}</span></>
                            : '🏭 En fábrica'}
                        </td>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)' }}>{matrices.prendasPorLote[l.id] || 0}</td>
                        <td style={estiloTd}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button onClick={() => descargarPdfLote(l, matrices.porLote[l.id]).catch((e) => alert(e?.message || 'Error al generar el PDF'))} style={estiloBotonChico}>📄 PDF proveedor</button>
                            <button onClick={() => descargarPdfListaInterna(l, armarListaInterna(l, pagos, estadoLote)).catch((e) => alert(e?.message || 'Error al generar el PDF'))} style={estiloBotonChico}>📋 Lista interna</button>
                            {l.estado === 'en_fabrica' && (
                              <button onClick={() => marcarLoteRecibido(l)} disabled={ocupado === l.id} style={estiloBotonChico}>📥 Marcar recibido</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ ...estiloCard, padding: 0, overflow: 'hidden' }}>
            <h3 style={{ color: 'var(--color-ink)', margin: 0, padding: '16px 24px' }}>📋 Pedidos</h3>
            {pedidosUniforme.length === 0 ? (
              <p style={{ padding: '0 24px 24px', color: '#6b6b6b', margin: 0 }}>Todavía no hay pedidos de uniformes.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-ink)', color: 'white' }}>
                      <th style={estiloTh}>Recibo</th>
                      <th style={estiloTh}>Jugador</th>
                      <th style={estiloTh}>Prendas (✓ = entregada)</th>
                      <th style={estiloTh}>Monto</th>
                      <th style={estiloTh}>Método</th>
                      <th style={estiloTh}>Referencia</th>
                      <th style={estiloTh}>Fecha</th>
                      <th style={estiloTh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosUniforme.map((p, i) => (
                      <tr key={p.id} style={estiloFila(p, i)}>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>#{p.numero_recibo}</td>
                        <td style={estiloTd}>{nombrePersona(p)}{marcaAnulado(p)}</td>
                        <td style={estiloTd}>
                          {p.items.map((it) => {
                            const estado = estadoPrenda(it, it.lote_id ? estadoLote[it.lote_id] : undefined)
                            // Solo se puede marcar entregada si el lote ya se recibió (o desmarcar si ya lo estaba).
                            const puedeMarcar = estado === 'recibido' || estado === 'entregado'
                            const numeroLote = it.lote_id ? lotes.find((l) => l.id === it.lote_id)?.numero : null
                            // Modificable mientras no esté en un lote y el pago no esté anulado.
                            const modificable = !it.lote_id && !p.anulado
                            const enEdicion = editando?.itemId === it.id
                            return (
                              <div key={it.id} style={{ marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
                                  <input
                                    type="checkbox"
                                    checked={it.entregado}
                                    disabled={p.anulado || !puedeMarcar || ocupado === it.id}
                                    title={puedeMarcar ? 'Entregada' : 'Se puede entregar cuando su lote se reciba de la fábrica'}
                                    aria-label="Entregada"
                                    onChange={(e) => marcarEntregado(it, e.target.checked)}
                                  />
                                  {it.cantidad} × {etiquetaPrenda(it)} {it.talla}
                                  {llevaManga(it.tipo_prenda) && !it.manga && (
                                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#fff4d6', color: '#8a5a00', fontWeight: 700 }}>⚠️ Falta definir manga</span>
                                  )}
                                  <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: COLOR_ESTADO_PRENDA[estado].fondo, color: COLOR_ESTADO_PRENDA[estado].texto }}>
                                    {ETIQUETA_ESTADO_PRENDA[estado]}{numeroLote ? ` · lote #${numeroLote}` : ''}
                                  </span>
                                  {modificable && !enEdicion && (
                                    <button
                                      onClick={() => { setEditMsg(''); setEditando({ itemId: it.id, tipo_prenda: it.tipo_prenda, talla: it.talla, manga: it.manga || '' }) }}
                                      style={{ ...estiloBotonChico, fontSize: '11px', padding: '1px 6px' }}
                                    >
                                      ✏️ Modificar prenda
                                    </button>
                                  )}
                                </div>
                                {enEdicion && editando && (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 6px 22px', padding: '6px', background: '#f5f8fb', borderRadius: '6px' }}>
                                    <select value={editando.tipo_prenda} onChange={(e) => setEditando(ajustarPrenda(editando, e.target.value as TipoPrenda))} style={{ ...estiloInput, width: 'auto', padding: '4px' }} aria-label="Tipo de prenda">
                                      {TIPOS_PRENDA.map((t) => <option key={t} value={t}>{ETIQUETA_PRENDA[t]}</option>)}
                                    </select>
                                    {llevaManga(editando.tipo_prenda) && (
                                      <select value={editando.manga} onChange={(e) => setEditando({ ...editando, manga: e.target.value })} style={{ ...estiloInput, width: 'auto', padding: '4px' }} aria-label="Manga">
                                        <option value="">-- Manga --</option>
                                        {MANGAS.map((m) => <option key={m} value={m}>{ETIQUETA_MANGA[m]}</option>)}
                                      </select>
                                    )}
                                    <select value={editando.talla} onChange={(e) => setEditando({ ...editando, talla: e.target.value })} style={{ ...estiloInput, width: 'auto', padding: '4px' }} aria-label="Talla">
                                      {TALLAS_POR_PRENDA[editando.tipo_prenda].map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <button onClick={() => guardarModificacion(p)} disabled={ocupado === it.id} style={{ ...estiloBotonChico, background: 'var(--color-court)', color: 'white', border: 'none' }}>
                                      {ocupado === it.id ? 'Guardando…' : '💾 Guardar'}
                                    </button>
                                    <button onClick={() => setEditando(null)} style={estiloBotonChico}>Cancelar</button>
                                    {editMsg && <span style={{ fontSize: '12px' }}>{editMsg}</span>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </td>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          <span style={{ textDecoration: p.anulado ? 'line-through' : 'none' }}>{formatearMontoDelegacion(p.monto, p.moneda)}</span>
                          {etiquetaDiferencia(p.diferencia_usd) && (
                            <div>
                              <span
                                title="Diferencia por cambios de prenda (el monto pagado no cambia)"
                                style={{ fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', fontFamily: 'var(--font-body)', ...(Number(p.diferencia_usd) > 0 ? { background: '#fee2e2', color: '#991b1b' } : { background: '#dcfce7', color: '#166534' }) }}
                              >
                                {etiquetaDiferencia(p.diferencia_usd)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={estiloTd}>{ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago}</td>
                        <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)' }}>{p.referencia || '—'}</td>
                        <td style={{ ...estiloTd, whiteSpace: 'nowrap' }}>{fechaTabla(p.fecha)}</td>
                        <td style={estiloTd}>{acciones(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {vista === 'torneos' && esAdminCompleto && (
        <div style={estiloCard}>
          <h3 style={{ color: 'var(--color-ink)', margin: '0 0 12px 0' }}>👕 Precios de prendas (US$)</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '8px' }}>
            {TIPOS_PRENDA.map((t) => (
              <div key={t}>
                <label style={estiloLabel}>{ETIQUETA_PRENDA[t]}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={preciosForm[t] ? formatearCentavos(preciosForm[t]) : ''}
                  onChange={(e) => setPreciosForm({ ...preciosForm, [t]: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  style={{ ...estiloInput, width: '130px' }}
                />
              </div>
            ))}
            <button onClick={guardarPrecios} style={estiloBotonPrimario}>💾 Guardar precios</button>
          </div>
          <p style={{ fontSize: '12px', color: '#6b6b6b', margin: 0 }}>Se pre-llenan en el formulario de Uniformes; no cambian los pedidos ya registrados.</p>
          {preciosMsg && <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>{preciosMsg}</p>}
        </div>
      )}

      {vista === 'torneos' && esAdminCompleto && (
        <div style={estiloCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ color: 'var(--color-ink)', margin: 0 }}>⚙️ Torneos externos</h3>
            {!torneoEditando && <button onClick={() => abrirEdicionTorneo(null)} style={estiloBotonPrimario}>+ Nuevo torneo</button>}
          </div>

          {torneoEditando && (
            <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid #ddd' }}>
              <h4 style={{ margin: '0 0 12px 0' }}>{torneoEditando === 'nuevo' ? 'Nuevo torneo' : 'Editar torneo'}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={estiloLabel}>Nombre</label>
                  <input type="text" value={torneoForm.nombre} onChange={(e) => setTorneoForm({ ...torneoForm, nombre: e.target.value })} style={estiloInput} />
                </div>
                <div>
                  <label style={estiloLabel}>Sede</label>
                  <input type="text" value={torneoForm.sede} onChange={(e) => setTorneoForm({ ...torneoForm, sede: e.target.value })} style={estiloInput} />
                </div>
                <div>
                  <label style={estiloLabel}>Fecha inicio</label>
                  <input type="date" value={torneoForm.fechaInicio} onChange={(e) => setTorneoForm({ ...torneoForm, fechaInicio: e.target.value })} style={estiloInput} />
                </div>
                <div>
                  <label style={estiloLabel}>Fecha fin</label>
                  <input type="date" value={torneoForm.fechaFin} onChange={(e) => setTorneoForm({ ...torneoForm, fechaFin: e.target.value })} style={estiloInput} />
                </div>
                <div>
                  <label style={estiloLabel}>Monto inscripción (referencial)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={torneoForm.montoInscripcion ? formatearCentavos(torneoForm.montoInscripcion) : ''}
                    onChange={(e) => setTorneoForm({ ...torneoForm, montoInscripcion: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                    placeholder="0,00"
                    style={estiloInput}
                  />
                </div>
                <div>
                  <label style={estiloLabel}>Moneda</label>
                  <select value={torneoForm.moneda} onChange={(e) => setTorneoForm({ ...torneoForm, moneda: e.target.value })} style={estiloInput}>
                    <option value="USD">US$</option>
                    <option value="BS">Bs.</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', alignSelf: 'end', paddingBottom: '10px' }}>
                  <input type="checkbox" checked={torneoForm.activo} onChange={(e) => setTorneoForm({ ...torneoForm, activo: e.target.checked })} />
                  Activo (acepta inscripciones)
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={guardarTorneo} style={estiloBotonPrimario}>💾 Guardar</button>
                <button onClick={() => setTorneoEditando(null)} style={{ ...estiloBotonPrimario, background: '#999' }}>Cancelar</button>
              </div>
              {torneoMsg && <p style={{ margin: '10px 0 0 0', fontSize: '14px' }}>{torneoMsg}</p>}
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'white' }}>
              <thead>
                <tr style={{ background: 'var(--color-ink)', color: 'white' }}>
                  <th style={estiloTh}>Torneo</th>
                  <th style={estiloTh}>Sede</th>
                  <th style={estiloTh}>Fechas</th>
                  <th style={estiloTh}>Monto referencial</th>
                  <th style={estiloTh}>Estado</th>
                  <th style={estiloTh}></th>
                </tr>
              </thead>
              <tbody>
                {torneos.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #eee', opacity: t.activo ? 1 : 0.6 }}>
                    <td style={estiloTd}>{t.nombre}</td>
                    <td style={estiloTd}>{t.sede || '—'}</td>
                    <td style={{ ...estiloTd, whiteSpace: 'nowrap' }}>
                      {t.fecha_inicio ? fechaTabla(t.fecha_inicio) : '—'}{t.fecha_fin ? ` → ${fechaTabla(t.fecha_fin)}` : ''}
                    </td>
                    <td style={{ ...estiloTd, fontFamily: 'var(--font-mono)' }}>{t.monto_inscripcion ? formatearMontoDelegacion(t.monto_inscripcion, t.moneda) : '—'}</td>
                    <td style={estiloTd}>{t.activo ? '✅ Activo' : '⏸️ Inactivo'}</td>
                    <td style={estiloTd}><button onClick={() => abrirEdicionTorneo(t)} style={estiloBotonChico}>✏️ Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recibo && (
        <div
          onClick={() => setRecibo(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,27,38,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* .pagos-imprimible: mismo mecanismo de impresión que la tabla de Pagos (globals.css) */}
            <div className="pagos-imprimible" style={{ background: 'white', borderRadius: '12px', borderTop: '3px solid var(--color-ball)', padding: '28px', color: 'var(--color-ink)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '20px' }}>HGV Tennis Club</div>
                  <div style={{ fontSize: '12px', color: '#6b6b6b' }}>Delegación — recibo de pago</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '18px', whiteSpace: 'nowrap' }}>N° {recibo.numero_recibo}</div>
              </div>
              {recibo.anulado && (
                <div style={{ margin: '14px 0 0', padding: '8px 12px', border: '2px solid #c0392b', color: '#c0392b', fontWeight: 'bold', borderRadius: '6px', textAlign: 'center' }}>
                  ANULADO{recibo.anulado_at ? ` el ${formatearFechaHora(recibo.anulado_at)}` : ''}{recibo.anulador?.nombre ? ` por ${recibo.anulador.nombre}` : ''}
                  <div style={{ fontWeight: 'normal', fontSize: '12px' }}>Motivo: {recibo.motivo_anulacion}</div>
                </div>
              )}
              <table style={{ width: '100%', fontSize: '14px', marginTop: '18px', borderCollapse: 'collapse' }}>
                <tbody>
                  {([
                    ['Fecha', fechaTabla(recibo.fecha)],
                    ['Recibido de', nombrePersona(recibo)],
                    ['Concepto', recibo.concepto === 'inscripcion_torneo' ? `Inscripción — ${recibo.torneo?.nombre || ''}` : 'Compra de uniformes'],
                    ['Método', ETIQUETA_TIPO_PAGO[recibo.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || recibo.tipo_pago],
                    ['Referencia', recibo.referencia || '—'],
                    ...(recibo.notas ? [['Notas', recibo.notas]] : []),
                  ] as [string, string][]).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '4px 0', color: '#6b6b6b', width: '110px', verticalAlign: 'top' }}>{k}</td>
                      <td style={{ padding: '4px 0' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recibo.items.length > 0 && (
                <table style={{ width: '100%', fontSize: '13px', marginTop: '14px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #ccc' }}>
                      <th style={{ textAlign: 'left', padding: '4px 0' }}>Prenda</th>
                      <th style={{ textAlign: 'center', padding: '4px 0' }}>Talla</th>
                      <th style={{ textAlign: 'center', padding: '4px 0' }}>Cant.</th>
                      <th style={{ textAlign: 'right', padding: '4px 0' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recibo.items.map((it) => (
                      <tr key={it.id}>
                        <td style={{ padding: '4px 0' }}>{etiquetaPrenda(it)}</td>
                        <td style={{ padding: '4px 0', textAlign: 'center' }}>{it.talla}</td>
                        <td style={{ padding: '4px 0', textAlign: 'center' }}>{it.cantidad}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {it.precio_unitario != null ? formatearMontoDelegacion(Number(it.precio_unitario) * it.cantidad, recibo.moneda) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--color-ink)', marginTop: '14px', paddingTop: '10px', fontWeight: 'bold', fontSize: '16px' }}>
                <span>Total</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{formatearMontoDelegacion(recibo.monto, recibo.moneda)}</span>
              </div>
              {recibo.tasa_bcv && (
                <div style={{ fontSize: '12px', color: '#6b6b6b', marginTop: '8px', textAlign: 'right' }}>
                  Tasa BCV aplicada: {formatearBs(recibo.tasa_bcv)} · equivale a {formatearMontoDelegacion(Number(recibo.monto_usd_equivalente), 'USD')}
                </div>
              )}
              {recibo.registrado?.nombre && (
                <div style={{ fontSize: '11px', color: '#999', marginTop: '14px' }}>Registrado por {recibo.registrado.nombre}</div>
              )}
            </div>
            <div className="no-imprimir" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => window.print()} style={estiloBotonPrimario}>🖨️ Imprimir / PDF</button>
              <button onClick={() => setRecibo(null)} style={{ ...estiloBotonPrimario, background: '#999' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
