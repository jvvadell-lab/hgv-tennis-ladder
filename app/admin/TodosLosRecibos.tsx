'use client'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { formatearFechaConAnio, hoyEnCaracas, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_TIPO_PAGO, type TipoPago } from '@/lib/delegacion'

// Pestaña Pagos → Todos los recibos: escalera y torneo juntos, en el orden
// de su numeración (comparten la secuencia de numero_recibo). Avisa de los
// números que faltan (pagos rechazados o borrados).

type Recibo = {
  id: string
  numero_recibo: number
  origen: 'escalera' | 'torneo'
  concepto: string
  jugador: string
  menor: string | null
  tipo_pago: string
  monto: number
  fecha: string
  referencia: string | null
  validado: boolean
  tasa_bcv_eur: number | null
}

const monedaDe = (tipoPago: string) => (tipoPago === 'efectivo' ? '$' : 'Bs.')
const fecha = (iso: string) => formatearFechaConAnio(instanteEnCaracas(iso, '12:00'))
const montoTexto = (r: Pick<Recibo, 'monto' | 'tipo_pago'>) =>
  `${monedaDe(r.tipo_pago)} ${r.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 12px', verticalAlign: 'top' }

export default function TodosLosRecibos() {
  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [origen, setOrigen] = useState<'todos' | 'escalera' | 'torneo'>('todos')
  const [estado, setEstado] = useState<'todos' | 'validados' | 'por_validar'>('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    fetch('/api/admin/recibos', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al cargar los recibos')
        setRecibos(data.recibos || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  const texto = busqueda.trim().toLowerCase()
  const visibles = recibos.filter((r) =>
    (origen === 'todos' || r.origen === origen) &&
    (estado === 'todos' || (estado === 'validados' ? r.validado : !r.validado)) &&
    (!desde || r.fecha >= desde) &&
    (!hasta || r.fecha <= hasta) &&
    (!texto ||
      r.jugador.toLowerCase().includes(texto) ||
      (r.menor || '').toLowerCase().includes(texto) ||
      r.concepto.toLowerCase().includes(texto) ||
      (r.referencia || '').toLowerCase().includes(texto) ||
      String(r.numero_recibo).includes(texto))
  )

  const totales = visibles.reduce(
    (acc, r) => {
      if (monedaDe(r.tipo_pago) === '$') acc.dolares += r.monto
      else acc.bolivares += r.monto
      return acc
    },
    { bolivares: 0, dolares: 0 }
  )

  // Números de recibo que no aparecen (rechazados o borrados), en todo el rango.
  const faltantes = useMemo(() => {
    if (!recibos.length) return []
    const nums = new Set(recibos.map((r) => r.numero_recibo))
    const max = Math.max(...nums)
    const min = Math.min(...nums)
    const lista: number[] = []
    for (let n = min; n <= max; n++) if (!nums.has(n)) lista.push(n)
    return lista
  }, [recibos])

  const exportarExcel = () => {
    const filas: Record<string, string | number>[] = visibles.map((r) => ({
      'N° Recibo': r.numero_recibo,
      'Origen': r.origen === 'torneo' ? 'Torneo' : 'Escalera',
      'Concepto': r.concepto,
      'Jugador': r.menor ? `${r.menor} (pagó ${r.jugador})` : r.jugador,
      'Tipo de pago': ETIQUETA_TIPO_PAGO[r.tipo_pago as TipoPago] || r.tipo_pago,
      'Moneda': monedaDe(r.tipo_pago),
      'Monto': r.monto,
      'Tasa BCV €': r.tasa_bcv_eur ?? '',
      'Referencia': r.referencia || '',
      'Fecha': r.fecha,
      'Estado': r.validado ? 'Validado' : 'Por validar',
    }))
    filas.push({})
    filas.push({ 'Moneda': 'Bs.', 'Monto': totales.bolivares, 'Referencia': 'TOTAL bolívares' })
    filas.push({ 'Moneda': '$', 'Monto': totales.dolares, 'Referencia': 'TOTAL dólares' })
    const hoja = XLSX.utils.json_to_sheet(filas)
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Recibos')
    XLSX.writeFile(libro, `recibos-hgv-${hoyEnCaracas()}.xlsx`)
  }

  const chip = (activo: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: '999px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
    border: activo ? '2px solid var(--color-ink)' : '1px solid #ccc',
    background: activo ? 'var(--color-ink)' : 'white',
    color: activo ? 'white' : 'var(--color-ink)',
  })

  return (
    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>🧾 Todos los recibos</h3>
      <p style={{ margin: '0 0 14px 0', color: '#555', fontSize: '14px' }}>
        Escalera y torneo juntos, en orden de número de recibo (comparten la numeración). Los pagos de Delegación están en su pestaña.
      </p>

      <div className="no-imprimir">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {([['todos', 'Todos'], ['escalera', '🎾 Escalera'], ['torneo', '🎄 Torneo']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setOrigen(id)} style={chip(origen === id)}>{label}</button>
          ))}
          <span style={{ width: '8px' }} />
          {([['todos', 'Cualquier estado'], ['validados', 'Validados'], ['por_validar', 'Por validar']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setEstado(id)} style={chip(estado === id)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: '#555' }}>Desde<br />
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #ccc' }} />
          </label>
          <label style={{ fontSize: '12px', color: '#555' }}>Hasta<br />
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #ccc' }} />
          </label>
          <input
            type="search"
            placeholder="Buscar jugador, categoría, referencia o N° de recibo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ flex: '1 1 220px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
          />
          <button onClick={exportarExcel} disabled={!visibles.length} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #1e6b34', background: '#1e6b34', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
            📊 Excel
          </button>
          <button onClick={() => window.print()} disabled={!visibles.length} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--color-ink)', background: 'white', color: 'var(--color-ink)', fontWeight: 'bold', cursor: 'pointer' }}>
            🖨️ Imprimir
          </button>
        </div>
      </div>

      {error && <p style={{ background: '#fdecea', color: '#c0392b', padding: '10px 12px', borderRadius: '6px' }}>{error}</p>}

      {cargando ? (
        <p style={{ color: '#777' }}>Cargando recibos…</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '0 0 12px 0', fontSize: '14px', color: 'var(--color-ink)' }}>
            <span><strong>{visibles.length}</strong> {visibles.length === 1 ? 'recibo' : 'recibos'}</span>
            <span>Total Bs. <strong>{totales.bolivares.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            {totales.dolares > 0 && <span>Total $ <strong>{totales.dolares.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>}
          </div>
          {faltantes.length > 0 && (
            <p className="no-imprimir" style={{ fontSize: '12px', color: '#8a5a00', background: '#fff8e1', padding: '8px 10px', borderRadius: '6px', margin: '0 0 12px 0' }}>
              Números sin recibo (pagos rechazados o borrados): {faltantes.map((n) => `#${n}`).join(', ')}
            </p>
          )}
          {visibles.length === 0 ? (
            <p style={{ color: '#777' }}>No hay recibos con estos filtros.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: 'white' }}>
                <thead>
                  <tr style={{ background: 'var(--color-court)', color: 'var(--color-chalk)' }}>
                    <th style={th}>Recibo</th>
                    <th style={th}>Concepto</th>
                    <th style={th}>Jugador</th>
                    <th style={th}>Tipo</th>
                    <th style={th}>Monto</th>
                    <th style={th}>Referencia</th>
                    <th style={th}>Fecha</th>
                    <th style={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'var(--color-chalk)' : '#fafafa' }}>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>#{r.numero_recibo}</td>
                      <td style={td}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '999px', background: r.origen === 'torneo' ? '#fde8e8' : '#e8f1fb', color: r.origen === 'torneo' ? '#8b1e1e' : '#1c7ec4', marginRight: '6px' }}>
                          {r.origen === 'torneo' ? 'Torneo' : 'Escalera'}
                        </span>
                        {r.concepto.replace(/^Escalera · /, '').replace(/^Escalera$/, '')}
                      </td>
                      <td style={td}>{r.menor ? <>{r.menor}<div style={{ fontSize: '12px', color: '#777' }}>pagó {r.jugador}</div></> : r.jugador}</td>
                      <td style={td}>{ETIQUETA_TIPO_PAGO[r.tipo_pago as TipoPago] || r.tipo_pago}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {montoTexto(r)}
                        {r.tasa_bcv_eur ? <div style={{ fontSize: '11px', color: '#777' }}>tasa € {r.tasa_bcv_eur.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div> : null}
                      </td>
                      <td style={td}>{r.referencia || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fecha(r.fecha)}</td>
                      <td style={td}>{r.validado ? <span style={{ color: '#1e6b34', fontWeight: 'bold' }}>✓ Validado</span> : <span style={{ color: '#8a5a00', fontWeight: 'bold' }}>Por validar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
