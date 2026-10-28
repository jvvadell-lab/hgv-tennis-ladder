'use client'
import { useState } from 'react'
import TasaBcv, { formatearBs, type TasaBcvVigente } from '@/app/components/TasaBcv'
import { hoyEnCaracas } from '@/lib/tiempo'
import { montoInscripcionBs } from '@/lib/torneoInscripcion'
import { formatearEur } from '@/lib/torneoPrecios'

// Reporte de pago de una inscripción del torneo, en Bs. a la tasa BCV del
// euro del día del pago (/api/jugador/torneo/reportar-pago). Lo usan
// "Inscribirme" (con la opción de incluir a la pareja) e "Inscribir a mi
// hijo/a" (el pago va a nombre del representante).

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', border: '1px solid rgba(15,27,38,0.2)', borderRadius: '4px',
  fontSize: '15px', boxSizing: 'border-box', background: 'white',
}
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--color-ink)', fontSize: '14px' }
const botonPrincipal = (deshabilitado: boolean): React.CSSProperties => ({
  width: '100%', padding: '12px', border: 'none', borderRadius: '4px', fontSize: '15px', fontWeight: 700,
  background: deshabilitado ? '#9bb' : 'var(--color-court)', color: 'white', cursor: deshabilitado ? 'default' : 'pointer',
})

export default function FormPagoTorneo({ inscripcionId, montoEur, etiquetaMonto = 'por jugador', parejaNombre = null, onCancelar, onListo }: {
  inscripcionId: string
  montoEur: number
  etiquetaMonto?: string
  // Nombre de la pareja cuya parte todavía no se reportó (null = no se ofrece incluirla).
  parejaNombre?: string | null
  onCancelar: () => void
  onListo: () => Promise<void>
}) {
  const [tipoPago, setTipoPago] = useState('pago_movil')
  const [fechaPago, setFechaPago] = useState(hoyEnCaracas())
  const [referencia, setReferencia] = useState('')
  const [incluyePareja, setIncluyePareja] = useState(false)
  const [tasa, setTasa] = useState<TasaBcvVigente | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const porJugador = tasa ? montoInscripcionBs(montoEur, tasa.eur) : null
  const total = porJugador === null ? null : porJugador * (incluyePareja ? 2 : 1)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/jugador/torneo/reportar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscripcionId, tipoPago, fecha: fechaPago, referencia, incluyePareja }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo completar')
      await onListo()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ marginTop: '12px', background: 'rgba(28,126,196,0.05)', border: '1px solid rgba(28,126,196,0.15)', borderRadius: '4px', padding: '14px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px', background: '#fff', border: '1px solid rgba(28,126,196,0.25)', borderRadius: '4px', padding: '10px 12px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-ink)', margin: '0 0 4px 0' }}>📱 Datos para Pago Móvil</p>
          <p style={{ fontSize: '13px', color: '#333', margin: 0, lineHeight: 1.6 }}>
            Yelitza Contreras<br />V-19.523.642<br />0412-7628281<br />Banco BNC
          </p>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <TasaBcv fecha={fechaPago} onTasa={setTasa} />
        </div>
      </div>

      <p style={{ fontSize: '14px', margin: '0 0 12px 0', color: 'var(--color-ink)' }}>
        {formatearEur(montoEur)} {etiquetaMonto}, en Bs. a la tasa BCV del euro del día del pago:{' '}
        <strong>{total === null ? '—' : formatearBs(total)}</strong>
        {incluyePareja && porJugador !== null && <span style={{ color: '#666' }}> ({formatearBs(porJugador)} × 2)</span>}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label style={labelStyle}>Tipo de pago</label>
          <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} style={inputStyle}>
            <option value="pago_movil">Pago móvil</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Fecha del pago</label>
          <input type="date" value={fechaPago} max={hoyEnCaracas()} onChange={(e) => setFechaPago(e.target.value)} required style={inputStyle} />
        </div>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={labelStyle}>Número de referencia</label>
        <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} required style={inputStyle} />
      </div>
      {parejaNombre && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', marginBottom: '10px' }}>
          <input type="checkbox" checked={incluyePareja} onChange={(e) => setIncluyePareja(e.target.checked)} />
          El pago incluye la parte de {parejaNombre}
        </label>
      )}
      <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>Quedará <strong>pendiente de validación</strong> hasta que un administrador confirme que lo recibió.</p>
      {error && <div style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '4px', fontSize: '14px', margin: '12px 0' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="submit" disabled={enviando || !tasa} style={botonPrincipal(enviando || !tasa)}>{enviando ? 'Enviando…' : 'Reportar pago'}</button>
        <button type="button" onClick={onCancelar} style={{ padding: '12px 16px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
      </div>
    </form>
  )
}
