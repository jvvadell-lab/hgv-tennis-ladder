'use client'
import { useEffect, useState } from 'react'
import { formatearFechaLarga, formatearHora, hoyEnCaracas, instanteEnCaracas } from '@/lib/tiempo'
import { CANCHAS_TORNEO, type CanchaTorneo } from '@/lib/torneo'
import { VENTANA_ACADEMIA, type Franja } from '@/lib/torneoProgramacion'

// "Horario academia" (Torneo Navidad, SPEC §14.5): el profesor o el admin
// liberan franjas concretas (fecha, cancha, inicio y fin, entre 15:00 y
// 18:00) para los partidos infantiles, las ven con sus partidos y retiran
// las que no tienen partido. La usan /academia (nivel academia) y la
// pestaña Torneo del admin. Todo por /api/academia/franjas.

type Datos = {
  torneo: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; estado: string } | null
  franjas: Franja[]
  partidos: Record<string, { id: string; texto: string; fecha_hora: string }[]>
}

const input: React.CSSProperties = { padding: '8px', border: '1px solid rgba(15,27,38,0.25)', borderRadius: '6px', fontSize: '14px', background: 'white' }
const etiqueta: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export default function HorarioAcademia() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [fecha, setFecha] = useState('')
  const [cancha, setCancha] = useState<CanchaTorneo>('HGV1')
  const [desde, setDesde] = useState(VENTANA_ACADEMIA.desde)
  const [hasta, setHasta] = useState(VENTANA_ACADEMIA.hasta)

  const cargar = async () => {
    try {
      const res = await fetch('/api/academia/franjas', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el horario')
      setDatos(data)
      if (data.torneo) setFecha((f) => f || (hoyEnCaracas() > data.torneo.fecha_inicio && hoyEnCaracas() <= data.torneo.fecha_fin ? hoyEnCaracas() : data.torneo.fecha_inicio))
    } catch (err: any) {
      setError(err.message)
    }
  }
  useEffect(() => { cargar() }, [])

  const enviar = async (clave: string, metodo: 'POST' | 'DELETE', body: object, exito: string) => {
    setOcupado(clave); setError(''); setMensaje('')
    try {
      const res = await fetch('/api/academia/franjas', { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo completar')
      setMensaje(exito)
      await cargar()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setOcupado(null)
    }
  }

  if (!datos) return <p className="loading-row">{error || <><span className="spinner" /> Cargando…</>}</p>
  if (!datos.torneo) return <p>No hay un torneo en organización.</p>

  const porFecha = new Map<string, Franja[]>()
  for (const f of datos.franjas) porFecha.set(f.fecha, [...(porFecha.get(f.fecha) || []), f])

  return (
    <div>
      <div style={{ background: 'white', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 4px 0', color: 'var(--color-ink)', fontSize: '16px' }}>Liberar una franja</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#555' }}>
          Los partidos de las categorías infantiles solo se programan dentro de estas franjas ({VENTANA_ACADEMIA.desde}–{VENTANA_ACADEMIA.hasta}).
          Liberar una franja no bloquea la cancha: se bloquea cuando el admin programa cada partido.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={etiqueta}>Fecha</label>
            <input type="date" value={fecha} min={datos.torneo.fecha_inicio} max={datos.torneo.fecha_fin} onChange={(e) => setFecha(e.target.value)} style={input} />
          </div>
          <div>
            <label style={etiqueta}>Cancha</label>
            <select value={cancha} onChange={(e) => setCancha(e.target.value as CanchaTorneo)} style={input}>
              {CANCHAS_TORNEO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={etiqueta}>Desde</label>
            <input type="time" step={600} value={desde} min={VENTANA_ACADEMIA.desde} max={VENTANA_ACADEMIA.hasta} onChange={(e) => setDesde(e.target.value)} style={input} />
          </div>
          <div>
            <label style={etiqueta}>Hasta</label>
            <input type="time" step={600} value={hasta} min={VENTANA_ACADEMIA.desde} max={VENTANA_ACADEMIA.hasta} onChange={(e) => setHasta(e.target.value)} style={input} />
          </div>
          <button
            disabled={!fecha || ocupado === 'nueva'}
            onClick={() => enviar('nueva', 'POST', { fecha, cancha, hora_inicio: desde, hora_fin: hasta }, 'Franja liberada')}
            style={{ padding: '9px 16px', borderRadius: '6px', border: 'none', background: 'var(--color-court)', color: 'white', fontWeight: 700, cursor: 'pointer' }}
          >
            {ocupado === 'nueva' ? 'Guardando…' : '➕ Liberar'}
          </button>
        </div>
      </div>

      {mensaje && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 14px', borderRadius: '6px', fontSize: '14px' }}>{mensaje}</p>}
      {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '6px', fontSize: '14px' }}>{error}</p>}

      {datos.franjas.length === 0 && <p style={{ fontSize: '14px', color: '#666' }}>Todavía no hay franjas liberadas.</p>}
      {[...porFecha.entries()].map(([dia, franjas]) => (
        <div key={dia} style={{ marginBottom: '14px' }}>
          <h4 style={{ margin: '0 0 6px 0', color: 'var(--color-ink)', fontSize: '14px' }}>
            {mayuscula(formatearFechaLarga(instanteEnCaracas(dia, '12:00')))}
          </h4>
          {franjas.map((f) => {
            const partidos = datos.partidos[f.id] || []
            return (
              <div key={f.id} style={{ background: 'white', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '6px', padding: '10px 12px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: '14px' }}>{f.cancha} · {f.hora_inicio}–{f.hora_fin}</strong>
                  {partidos.length === 0
                    ? <div style={{ fontSize: '12px', color: '#888' }}>Sin partidos programados</div>
                    : partidos.map((p) => <div key={p.id} style={{ fontSize: '12px', color: '#444' }}>🎾 {formatearHora(p.fecha_hora)} · {p.texto}</div>)}
                </div>
                <button
                  disabled={partidos.length > 0 || ocupado === f.id}
                  title={partidos.length ? 'Tiene partidos programados: el admin tiene que moverlos antes' : undefined}
                  onClick={() => {
                    if (!confirm(`¿Retirar la franja ${f.cancha} ${f.hora_inicio}–${f.hora_fin}?`)) return
                    enviar(f.id, 'DELETE', { franjaId: f.id }, 'Franja retirada')
                  }}
                  style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: '1px solid #c0392b', background: 'white', color: '#c0392b', cursor: partidos.length ? 'not-allowed' : 'pointer', opacity: partidos.length ? 0.5 : 1 }}
                >
                  Retirar
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
