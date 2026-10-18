// Documentos de entrega de un lote de uniformes (Pagos → Delegación →
// Uniformes): la lista de entrega para firmar y las etiquetas para pegar en
// cada prenda. Sin imports de servidor ni DOM, como reporteInscritos: recibe
// el logo ya cargado (data URL). jspdf se carga recién al generarlos.

import type { jsPDF } from 'jspdf'
import { ahora, formatearFechaConAnio } from '@/lib/tiempo'
import { ETIQUETA_INVITADO, TIPOS_PRENDA, etiquetaExterno, etiquetaPrenda, type PersonaDelegacion } from '@/lib/delegacion'

export type ItemLote = {
  tipo_prenda: string
  talla: string
  manga: string | null
  cantidad: number
  lote_id: string | null
}

export type PagoLote = PersonaDelegacion & {
  jugador_id: string | null
  concepto: string
  anulado: boolean
  items: ItemLote[]
}

export type LogoPdf = { dataUrl: string; ancho: number; alto: number } | null

type Prenda = { tipo_prenda: string; talla: string; manga: string | null; cantidad: number }
export type PersonaLote = { nombre: string; etiqueta: string | null; prendas: Prenda[] }

const AZUL: [number, number, number] = [28, 126, 196] // #1c7ec4, --color-court
const TINTA: [number, number, number] = [15, 27, 38]

const ordenTipo = (t: string) => TIPOS_PRENDA.indexOf(t as (typeof TIPOS_PRENDA)[number])

// Una entrada por persona (jugador o nombre libre), juntando todos sus pagos
// no anulados con prendas en este lote. Las prendas iguales se suman.
export function personasDelLote(loteId: string, pagos: PagoLote[]): PersonaLote[] {
  const porPersona = new Map<string, PersonaLote>()
  for (const p of pagos) {
    if (p.concepto !== 'uniforme' || p.anulado) continue
    const items = p.items.filter((i) => i.lote_id === loteId)
    if (!items.length) continue
    const nombre = p.jugadores?.nombre || p.nombre_externo || '—'
    const clave = p.jugador_id ? `j:${p.jugador_id}` : `e:${nombre.trim().toLowerCase()}`
    const persona = porPersona.get(clave) ?? { nombre, etiqueta: etiquetaExterno(p), prendas: [] }
    porPersona.set(clave, persona)
    for (const i of items) {
      const igual = persona.prendas.find((x) => x.tipo_prenda === i.tipo_prenda && x.talla === i.talla && (x.manga || null) === (i.manga || null))
      if (igual) igual.cantidad += i.cantidad
      else persona.prendas.push({ tipo_prenda: i.tipo_prenda, talla: i.talla, manga: i.manga || null, cantidad: i.cantidad })
    }
  }
  const lista = [...porPersona.values()]
  lista.forEach((p) => p.prendas.sort((a, b) => ordenTipo(a.tipo_prenda) - ordenTipo(b.tipo_prenda)))
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}

const textoPrendas = (p: PersonaLote) => p.prendas.map((x) => `${etiquetaPrenda(x)} ${x.talla} ×${x.cantidad}`).join(', ')

// --- Lista de entrega (para firmar al entregar) ---

export async function generarPdfListaEntrega(lote: { id: string; numero: number }, pagos: PagoLote[], logo: LogoPdf) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const margen = 14
  const personas = personasDelLote(lote.id, pagos)

  // Encabezado: logo a la izquierda, títulos a la derecha (como el de inscritos).
  const altoLogo = 28
  if (logo) doc.addImage(logo.dataUrl, 'PNG', margen, 10, (altoLogo * logo.ancho) / logo.alto, altoLogo)
  doc.setTextColor(...TINTA)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`HGV Tennis Club — Entrega de uniformes, Lote #${lote.numero}`, anchoPagina - margen, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(`Fecha: ${formatearFechaConAnio(ahora())}`, anchoPagina - margen, 27, { align: 'right' })
  doc.setDrawColor(...AZUL)
  doc.setLineWidth(0.6)
  doc.line(margen, 42, anchoPagina - margen, 42)

  autoTable(doc, {
    startY: 47,
    margin: { left: margen, right: margen, bottom: 20 },
    head: [['N.º', 'Jugador', 'Prendas', 'Fecha de entrega', 'Firma']],
    body: personas.map((p, i) => [String(i + 1), p.etiqueta === ETIQUETA_INVITADO ? `${p.nombre}\n(${p.etiqueta})` : p.nombre, textoPrendas(p), '', '']),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, textColor: TINTA, lineColor: [170, 175, 180], valign: 'middle', minCellHeight: 15 },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold', minCellHeight: 0 },
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 44 },
      3: { cellWidth: 26 },
      4: { cellWidth: 52 },
    },
  })

  let y = (doc as any).lastAutoTable.finalY + 8
  if (y + 12 > altoPagina - 20) {
    doc.addPage()
    y = 20
  }
  const totalPrendas = personas.reduce((s, p) => s + p.prendas.reduce((a, x) => a + x.cantidad, 0), 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TINTA)
  doc.text(`Total de jugadores: ${personas.length}`, margen, y)
  doc.text(`Total de prendas: ${totalPrendas}`, margen, y + 6)

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Lote #${lote.numero} · Página ${i} de ${paginas}`, anchoPagina - margen, altoPagina - 9, { align: 'right' })
  }
  return { doc, personas: personas.length, prendas: totalPrendas, paginas }
}

// --- Etiquetas (hoja carta, 3 × 6, para cortar a mano) ---

const ANCHO_ETIQUETA = 65
const ALTO_ETIQUETA = 40
const COLUMNAS = 3
const FILAS = 6
const MARGEN_INTERNO = 3.5 // ≥ 3 mm, por si el corte se desvía
const MM_POR_PT = 25.4 / 72

type Etiqueta = { nombre: string; prenda: string; talla: string }

// Una etiqueta por unidad, en el orden de la lista (por nombre), así las
// prendas de cada jugador quedan juntas.
export function etiquetasDelLote(loteId: string, pagos: PagoLote[]): Etiqueta[] {
  return personasDelLote(loteId, pagos).flatMap((p) =>
    p.prendas.flatMap((x) => Array.from({ length: x.cantidad }, () => ({ nombre: p.nombre, prenda: etiquetaPrenda(x), talla: x.talla })))
  )
}

// Ajusta un texto a un ancho: baja el tamaño hasta `minimo` en una línea; si
// no cabe, prueba en 2 líneas desde `maximo`; y si ni así, corta con "…".
function ajustarTexto(doc: jsPDF, texto: string, ancho: number, maximo: number, minimo: number): { lineas: string[]; tamano: number } {
  for (let t = maximo; t >= minimo; t -= 0.5) {
    doc.setFontSize(t)
    if (doc.getTextWidth(texto) <= ancho) return { lineas: [texto], tamano: t }
  }
  for (let t = maximo; t >= minimo; t -= 0.5) {
    doc.setFontSize(t)
    const lineas: string[] = doc.splitTextToSize(texto, ancho)
    if (lineas.length <= 2 && lineas.every((l) => doc.getTextWidth(l) <= ancho)) return { lineas, tamano: t }
  }
  doc.setFontSize(minimo)
  const [primera, ...resto] = doc.splitTextToSize(texto, ancho) as string[]
  let segunda = resto.join(' ')
  while (segunda && doc.getTextWidth(`${segunda}…`) > ancho) segunda = segunda.slice(0, -1)
  return { lineas: [primera, `${segunda.trimEnd()}…`], tamano: minimo }
}

// Tijera dibujada (la fuente estándar de jspdf no trae el glifo ✂), con el
// filo apuntando en la dirección del corte.
function tijera(doc: jsPDF, x: number, y: number, vertical: boolean) {
  const p = (a: number, b: number): [number, number] => (vertical ? [x + b, y + a] : [x + a, y + b])
  doc.setDrawColor(110, 110, 110)
  doc.setLineDashPattern([], 0)
  doc.setLineWidth(0.25)
  const [c1x, c1y] = p(-1.6, -1.1)
  const [c2x, c2y] = p(-1.6, 1.1)
  doc.circle(c1x, c1y, 0.75, 'S')
  doc.circle(c2x, c2y, 0.75, 'S')
  doc.line(...p(-1, -0.7), ...p(2.2, 0.9))
  doc.line(...p(-1, 0.7), ...p(2.2, -0.9))
}

export async function generarPdfEtiquetas(lote: { id: string; numero: number }, pagos: PagoLote[], logo: LogoPdf) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  // Etiquetas pegadas (sin espacio), cuadrícula centrada en la hoja.
  const x0 = (anchoPagina - COLUMNAS * ANCHO_ETIQUETA) / 2
  const y0 = (altoPagina - FILAS * ALTO_ETIQUETA) / 2
  const borde = 5 // las líneas de corte llegan hasta aquí, el límite del área imprimible
  const etiquetas = etiquetasDelLote(lote.id, pagos)
  const porHoja = COLUMNAS * FILAS
  const hojas = Math.max(1, Math.ceil(etiquetas.length / porHoja))

  const altoLogo = ALTO_ETIQUETA - 2 * MARGEN_INTERNO - 8
  const anchoLogo = logo ? (altoLogo * logo.ancho) / logo.alto : 0
  const anchoTexto = ANCHO_ETIQUETA - 2 * MARGEN_INTERNO - (logo ? anchoLogo + 3 : 0)

  for (let h = 0; h < hojas; h++) {
    if (h > 0) doc.addPage()
    etiquetas.slice(h * porHoja, (h + 1) * porHoja).forEach((e, k) => {
      const x = x0 + (k % COLUMNAS) * ANCHO_ETIQUETA
      const y = y0 + Math.floor(k / COLUMNAS) * ALTO_ETIQUETA
      if (logo) doc.addImage(logo.dataUrl, 'PNG', x + MARGEN_INTERNO, y + (ALTO_ETIQUETA - altoLogo) / 2, anchoLogo, altoLogo)
      const xt = x + ANCHO_ETIQUETA - MARGEN_INTERNO - anchoTexto

      doc.setFont('helvetica', 'bold')
      const nombre = ajustarTexto(doc, e.nombre, anchoTexto, 11, 7)
      doc.setFont('helvetica', 'normal')
      const prenda = ajustarTexto(doc, e.prenda, anchoTexto, 8.5, 6.5)
      doc.setFont('helvetica', 'bold')
      const talla = ajustarTexto(doc, e.talla, anchoTexto, 24, 12)

      // Bloque de texto centrado en vertical; cada línea mide ~1,15 × su tamaño.
      const alto = (b: { lineas: string[]; tamano: number }) => b.lineas.length * b.tamano * 1.15 * MM_POR_PT
      const separacion = 1.2
      const total = alto(nombre) + separacion + alto(prenda) + separacion + alto(talla)
      let yt = y + (ALTO_ETIQUETA - total) / 2
      const escribir = (b: { lineas: string[]; tamano: number }, estilo: string, color: [number, number, number]) => {
        doc.setFont('helvetica', estilo)
        doc.setFontSize(b.tamano)
        doc.setTextColor(...color)
        b.lineas.forEach((l) => {
          yt += b.tamano * 1.15 * MM_POR_PT
          doc.text(l, xt, yt - b.tamano * 0.25 * MM_POR_PT)
        })
      }
      escribir(nombre, 'bold', TINTA)
      yt += separacion
      escribir(prenda, 'normal', [70, 70, 70])
      yt += separacion
      escribir(talla, 'bold', AZUL)
    })

    // Líneas de corte: cada una es un solo tajo recto de borde a borde.
    doc.setDrawColor(140, 140, 140)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([1.5, 1], 0)
    for (let f = 0; f <= FILAS; f++) {
      const y = y0 + f * ALTO_ETIQUETA
      doc.line(f === 0 ? borde + 5 : borde, y, anchoPagina - borde, y)
    }
    for (let c = 0; c <= COLUMNAS; c++) {
      const x = x0 + c * ANCHO_ETIQUETA
      doc.line(x, c === 0 ? borde + 5 : borde, x, altoPagina - borde)
    }
    tijera(doc, borde + 2, y0, false)
    tijera(doc, x0, borde + 2, true)
    doc.setLineDashPattern([], 0)
  }
  return { doc, etiquetas: etiquetas.length, paginas: hojas }
}
