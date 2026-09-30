'use client'
import { useEffect, useState } from 'react'
import { formatearFechaCorta, hoyEnCaracas, instanteEnCaracas } from '@/lib/tiempo'
import { tasaDosDecimales } from '@/lib/delegacion'

// Tasa BCV vigente ("Tasa BCV · $ Bs. X · € Bs. Y"), leída de /api/tasa-bcv.
//   fecha           -> la vigente en esa fecha (p. ej. la fecha de un pago); sin ella, la de hoy
//   controlesAdmin  -> "Actualizar ahora" y carga manual (solo admin completo; la ruta lo exige igual)
//   onTasa          -> avisa al padre la tasa cargada (o null si no hay)

export type TasaBcvVigente = {
  fecha_vigencia: string
  usd: number
  eur: number
  fuente: 'dolarapi' | 'manual'
  desactualizada: boolean
}

export const formatearBs = (n: number) =>
  `Bs. ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function TasaBcv({
  fecha,
  controlesAdmin = false,
  onTasa,
  compacto = false,
}: {
  fecha?: string
  controlesAdmin?: boolean
  onTasa?: (tasa: TasaBcvVigente | null) => void
  compacto?: boolean
}) {
  const [tasa, setTasa] = useState<TasaBcvVigente | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [manualAbierto, setManualAbierto] = useState(false)
  const [manual, setManual] = useState({ fecha: hoyEnCaracas(), usd: '', eur: '' })

  useEffect(() => {
    let vigente = true
    setCargando(true)
    const url = fecha && fecha !== hoyEnCaracas() ? `/api/tasa-bcv?fecha=${fecha}` : '/api/tasa-bcv'
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({ tasa: null }))
      .then((data) => {
        if (!vigente) return
        const t = data?.tasa ? { ...data.tasa, usd: Number(data.tasa.usd), eur: Number(data.tasa.eur) } : null
        setTasa(t)
        onTasa?.(t)
        setCargando(false)
      })
    return () => {
      vigente = false
    }
    // onTasa queda fuera a propósito: el padre suele pasar una función nueva en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, recarga])

  const actualizarAhora = async () => {
    setOcupado(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/tasa-bcv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'actualizar' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const guardadas = (data.guardadas || []).map((g: any) => g.fecha).join(', ')
      const rechazadas = (data.rechazadas || []).map((r: any) => `${r.fecha}: ${r.motivo}`).join(' · ')
      setMsg(guardadas ? `✅ Guardada: ${guardadas}${rechazadas ? ` · ⚠️ ${rechazadas}` : ''}` : rechazadas ? `⚠️ ${rechazadas}` : '✅ Sin cambios')
      setRecarga((n) => n + 1)
    } catch (err: any) {
      setMsg(`❌ ${err.message || 'Error al actualizar'}`)
    } finally {
      setOcupado(false)
    }
  }

  const guardarManual = async (confirmarVariacion = false) => {
    setOcupado(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/tasa-bcv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'manual', fecha: manual.fecha, usd: Number(manual.usd.replace(',', '.')), eur: Number(manual.eur.replace(',', '.')), confirmarVariacion }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requiereConfirmacion && confirm(`${data.error}.\n\n¿Guardarla de todas formas?`)) return guardarManual(true)
        throw new Error(data.error)
      }
      setMsg('✅ Tasa manual guardada')
      setManualAbierto(false)
      setRecarga((n) => n + 1)
    } catch (err: any) {
      setMsg(`❌ ${err.message || 'Error al guardar'}`)
    } finally {
      setOcupado(false)
    }
  }

  const ambar = tasa?.desactualizada
  const estiloInput: React.CSSProperties = { padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '120px' }
  const estiloBoton: React.CSSProperties = { background: 'var(--color-court)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }

  return (
    <div
      style={{
        background: ambar ? '#fff8e1' : 'white',
        border: `1px solid ${ambar ? '#f0c36d' : 'rgba(28,126,196,0.3)'}`,
        borderLeft: `4px solid ${ambar ? '#e0a100' : '#1c7ec4'}`,
        borderRadius: '8px',
        padding: compacto ? '8px 12px' : '12px 16px',
        fontSize: '13px',
        color: '#333',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          {cargando ? (
            <span style={{ color: '#6b6b6b' }}>Cargando tasa BCV…</span>
          ) : !tasa ? (
            <span style={{ color: '#8a5a00' }}>⚠️ No hay tasa BCV cargada{fecha ? ' para esa fecha' : ''}.</span>
          ) : (
            <>
              <strong>Tasa BCV</strong> ·{' '}
              <span style={{ fontFamily: 'var(--font-mono)' }}>$ {formatearBs(tasaDosDecimales(tasa.usd))}</span> ·{' '}
              <span style={{ fontFamily: 'var(--font-mono)' }}>€ {formatearBs(tasaDosDecimales(tasa.eur))}</span>
              <div style={{ fontSize: '11px', color: ambar ? '#8a5a00' : '#6b6b6b', marginTop: '2px' }}>
                Vigente desde el {formatearFechaCorta(instanteEnCaracas(tasa.fecha_vigencia), { conAnio: true })}
                {tasa.fuente === 'manual' && ' · carga manual'}
                {ambar && ' · ⚠️ desactualizada'}
              </div>
            </>
          )}
        </div>
        {controlesAdmin && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={actualizarAhora} disabled={ocupado} style={{ ...estiloBoton, opacity: ocupado ? 0.6 : 1 }}>
              🔄 Actualizar ahora
            </button>
            <button onClick={() => { setManualAbierto(!manualAbierto); setMsg('') }} style={{ ...estiloBoton, background: 'white', color: 'var(--color-ink)', border: '1px solid #ddd' }}>
              ✏️ Carga manual
            </button>
          </div>
        )}
      </div>

      {controlesAdmin && manualAbierto && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '10px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#555' }}>
            Fecha de vigencia
            <input type="date" value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} style={{ ...estiloInput, display: 'block', marginTop: '4px', width: 'auto' }} />
          </label>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#555' }}>
            USD (Bs.)
            <input inputMode="decimal" value={manual.usd} onChange={(e) => setManual({ ...manual, usd: e.target.value })} placeholder="859,06" style={{ ...estiloInput, display: 'block', marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#555' }}>
            EUR (Bs.)
            <input inputMode="decimal" value={manual.eur} onChange={(e) => setManual({ ...manual, eur: e.target.value })} placeholder="973,31" style={{ ...estiloInput, display: 'block', marginTop: '4px' }} />
          </label>
          <button onClick={() => guardarManual()} disabled={ocupado} style={{ ...estiloBoton, background: '#28a745' }}>✅ Guardar</button>
        </div>
      )}
      {msg && <div style={{ marginTop: '8px', fontSize: '12px' }}>{msg}</div>}
    </div>
  )
}
