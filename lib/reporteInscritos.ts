// Reporte PDF de inscritos de un torneo externo (Pagos → Delegación →
// Inscripciones). Sin imports de servidor: lo usa el panel admin, y recibe
// el logo ya cargado (data URL) para no depender de fetch ni del DOM.
// jspdf se carga recién al generarlo, para no sumarle peso al panel admin.

import { ahora, formatearFechaConAnio, formatearHora, instanteEnCaracas } from '@/lib/tiempo'
import {
  ETIQUETA_TIPO_PAGO,
  etiquetaExterno,
  formatearMontoDelegacion,
  numeroAccionDe,
  telefonoDe,
  type PersonaDelegacion,
} from '@/lib/delegacion'

export type InscripcionReporte = PersonaDelegacion & {
  numero_recibo: number
  monto: number | string
  moneda: 'USD' | 'BS'
  tipo_pago: string
  referencia: string | null
  fecha: string
  monto_usd_equivalente: number | string | null
  anulado: boolean
}

export type DatosReporteInscritos = {
  torneo: string
  admin: string
  inscripciones: InscripcionReporte[]
  logo: { dataUrl: string; ancho: number; alto: number } | null
}

const AZUL: [number, number, number] = [28, 126, 196] // #1c7ec4, --color-court
const TINTA: [number, number, number] = [15, 27, 38]

const nombreDe = (p: InscripcionReporte) => p.jugadores?.nombre || p.nombre_externo || '—'

export async function generarPdfInscritos(d: DatosReporteInscritos) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const margen = 14
  const emitido = ahora()

  // Encabezado: logo a la izquierda, títulos a la derecha.
  const altoLogo = 28
  if (d.logo) {
    doc.addImage(d.logo.dataUrl, 'PNG', margen, 10, (altoLogo * d.logo.ancho) / d.logo.alto, altoLogo)
  }
  doc.setTextColor(...TINTA)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Comisión de Tenis — Hermandad Gallega de Valencia', anchoPagina - margen, 18, { align: 'right' })
  doc.setFontSize(12)
  doc.setTextColor(...AZUL)
  doc.text(`Inscritos: ${d.torneo}`, anchoPagina - margen, 26, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text(`Emitido el ${formatearFechaConAnio(emitido)}`, anchoPagina - margen, 32, { align: 'right' })
  doc.setDrawColor(...AZUL)
  doc.setLineWidth(0.6)
  doc.line(margen, 42, anchoPagina - margen, 42)

  const validos = d.inscripciones
    .filter((p) => !p.anulado)
    .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es', { sensitivity: 'base' }) || a.numero_recibo - b.numero_recibo)

  autoTable(doc, {
    startY: 47,
    margin: { left: margen, right: margen, bottom: 20 },
    head: [['N.º', 'Nombre', 'N.º de acción', 'Teléfono', 'Método', 'Referencia', 'Fecha de pago', 'Recibo', 'Monto']],
    body: validos.map((p, i) => [
      String(i + 1),
      // Los de nombre libre con su etiqueta debajo ("Socio (no registrado en la app)" o "Invitado").
      etiquetaExterno(p) ? `${nombreDe(p)}\n${etiquetaExterno(p)}` : nombreDe(p),
      numeroAccionDe(p) || (etiquetaExterno(p) ? 'Falta' : '—'),
      telefonoDe(p) || '—',
      ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago,
      p.referencia || '—',
      formatearFechaConAnio(instanteEnCaracas(p.fecha)),
      `#${p.numero_recibo}`,
      formatearMontoDelegacion(Number(p.monto), p.moneda),
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.6, textColor: TINTA, lineColor: [210, 215, 220] },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 246, 251] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      2: { halign: 'center', cellWidth: 15 },
      3: { cellWidth: 31 }, // "+58 (414)-582-4497" en una sola línea
      6: { cellWidth: 21 },
      7: { halign: 'center', cellWidth: 13 },
      8: { halign: 'right', cellWidth: 19 },
    },
    // "Falta" (socio sin N.º de acción) en ámbar, para que se note.
    didParseCell: (c) => {
      if (c.section === 'body' && c.column.index === 2 && c.cell.raw === 'Falta') {
        c.cell.styles.textColor = [160, 100, 0]
        c.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // Totales: sin mezclar monedas, más el equivalente en US$ con la tasa
  // congelada de cada pago en Bs. (los que no la tienen quedan fuera y se anotan).
  const usd = validos.filter((p) => p.moneda === 'USD')
  const bs = validos.filter((p) => p.moneda === 'BS')
  const bsSinTasa = bs.filter((p) => p.monto_usd_equivalente == null)
  const totalUsd = usd.reduce((s, p) => s + Number(p.monto), 0)
  const totalBs = bs.reduce((s, p) => s + Number(p.monto), 0)
  const equivalente = totalUsd + bs.reduce((s, p) => s + Number(p.monto_usd_equivalente ?? 0), 0)

  let y = (doc as any).lastAutoTable.finalY + 8
  const lineas: [string, string][] = [
    ['Inscritos', String(validos.length)],
    ['Total en US$', formatearMontoDelegacion(totalUsd, 'USD')],
    ['Total en Bs.', formatearMontoDelegacion(totalBs, 'BS')],
    ['Total equivalente en US$', formatearMontoDelegacion(equivalente, 'USD')],
  ]
  const altoTotales = lineas.length * 6 + (bsSinTasa.length ? 10 : 0)
  if (y + altoTotales > altoPagina - 20) {
    doc.addPage()
    y = 20
  }
  const xEtiqueta = anchoPagina - margen - 80
  doc.setFontSize(10)
  lineas.forEach(([etiqueta, valor], i) => {
    const ultima = i === lineas.length - 1
    doc.setFont('helvetica', ultima ? 'bold' : 'normal')
    doc.setTextColor(...(ultima ? AZUL : TINTA))
    doc.text(etiqueta, xEtiqueta, y)
    doc.text(valor, anchoPagina - margen, y, { align: 'right' })
    y += 6
  })
  if (bsSinTasa.length) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(140, 90, 0)
    const recibos = bsSinTasa.map((p) => `#${p.numero_recibo}`).join(', ')
    const nota = `No incluye ${bsSinTasa.length === 1 ? 'el pago' : `${bsSinTasa.length} pagos`} en Bs. sin tasa BCV congelada (recibo ${recibos}): ${formatearMontoDelegacion(bsSinTasa.reduce((s, p) => s + Number(p.monto), 0), 'BS')}.`
    doc.text(doc.splitTextToSize(nota, anchoPagina - margen - xEtiqueta), xEtiqueta, y)
  }

  // Pie en todas las páginas, ya con el total conocido.
  const paginas = doc.getNumberOfPages()
  const generado = `Generado por ${d.admin} el ${formatearFechaConAnio(emitido)}, ${formatearHora(emitido)} (hora de Caracas)`
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.setDrawColor(210, 215, 220)
    doc.setLineWidth(0.2)
    doc.line(margen, altoPagina - 14, anchoPagina - margen, altoPagina - 14)
    doc.text(generado, margen, altoPagina - 9)
    doc.text(`Página ${i} de ${paginas}`, anchoPagina - margen, altoPagina - 9, { align: 'right' })
  }

  return doc
}

// Nombre de archivo: "inscritos-abierto-guataparo-2026-10-15.pdf".
export function nombreArchivoInscritos(torneo: string, fechaISO: string): string {
  const slug = torneo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `inscritos-${slug}-${fechaISO}.pdf`
}
