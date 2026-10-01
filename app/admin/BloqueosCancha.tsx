'use client'
import { useEffect, useState } from 'react'
import {
  hoyEnCaracas, instanteEnCaracas, horarioDelDiaCancha, formatearFechaLarga, formatearHora, yaPaso,
} from '@/lib/tiempo'
import { franjaBloqueo } from '@/lib/choquesCancha'

// Bloqueos de cancha por decisión del club (pestaña Reservas). Crear uno NO
// toca lo que ya estaba agendado: si hay retos o reservas en esa franja solo
// se listan, y el admin decide si bloquear igual y resolverlos a mano.
// Ver app/api/admin/bloqueos-cancha.

type Bloqueo = { id: string; cancha: string; inicio: string; fin: string; motivo: string; creador: { nombre: string } | null }
type Conflicto = { tipo: 'reto' | 'reserva'; id: string; cancha: string; inicio: string; fin: string; estado: string; jugadores: string }
type BloqueAEnviar = { cancha: string; inicio: string; fin: string }

const NOMBRE_CANCHA: Record<string, string> = { HGV1: 'HGV 1', HGV2: 'HGV 2' }

// Los bloqueos van en múltiplos de 30 min (el servidor lo exige igual).
const PASO_BLOQUEO_MIN = 30
const HORAS_BLOQUEO = Array.from({ length: (24 * 60) / PASO_BLOQUEO_MIN }, (_, i) => {
  const m = i * PASO_BLOQUEO_MIN
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

const tarjeta: React.CSSProperties = {
  background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px',
  marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
}
const etiqueta: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#555', marginBottom: '4px' }
const campo: React.CSSProperties = { padding: '8px 10px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px', background: 'white' }
const botonPrincipal: React.CSSProperties = {
  background: 'var(--color-court)', color: 'white', border: 'none', padding: '10px 18px',
  borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 700,
}
const botonSecundario: React.CSSProperties = {
  background: 'white', border: '1px solid #ccc', color: '#555', padding: '8px 14px',
  borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
}

export default function BloqueosCancha() {
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [cargando, setCargando] = useState(true)

  const [cancha, setCancha] = useState<'HGV1' | 'HGV2' | 'AMBAS'>('AMBAS')
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [todoElDia, setTodoElDia] = useState(false)
  const [horaInicio, setHoraInicio] = useState('18:00')
  const [horaFin, setHoraFin] = useState('21:00')
  const [motivo, setMotivo] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const [conflictos, setConflictos] = useState<Conflicto[] | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)

  const cargar = async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/admin/bloqueos-cancha')
      const data = await res.json()
      if (res.ok) setBloqueos(data.bloqueos || [])
      else setMsg('❌ ' + (data.error || 'No se pudieron cargar los bloqueos'))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // Cualquier cambio en el formulario invalida el aviso de conflictos.
  useEffect(() => { setConflictos(null) }, [cancha, fecha, todoElDia, horaInicio, horaFin])

  const canchasElegidas = cancha === 'AMBAS' ? ['HGV1', 'HGV2'] : [cancha]

  // Franja de cada cancha. "Todo el día" usa el horario real de esa cancha
  // ese día; con horas, fin "00:00" (o anterior al inicio) es medianoche del
  // día siguiente.
  const armarBloques = (): BloqueAEnviar[] | string => {
    if (!fecha) return 'Elige la fecha'
    if (todoElDia) {
      return canchasElegidas.map((c) => {
        const { inicio, fin } = horarioDelDiaCancha(c, fecha)
        return { cancha: c, inicio: inicio.toISOString(), fin: fin.toISOString() }
      })
    }
    if (!horaInicio || !horaFin) return 'Elige la hora de inicio y de fin'
    const inicio = instanteEnCaracas(fecha, horaInicio)
    let fin = instanteEnCaracas(fecha, horaFin)
    if (horaFin === '00:00') fin = new Date(fin.getTime() + 24 * 60 * 60000)
    if (fin.getTime() <= inicio.getTime()) return 'La hora de fin debe ser posterior a la de inicio'
    return canchasElegidas.map((c) => ({ cancha: c, inicio: inicio.toISOString(), fin: fin.toISOString() }))
  }

  const enviar = async (confirmar: boolean) => {
    setMsg('')
    if (!motivo.trim()) { setMsg('❌ Escribe el motivo (se muestra a los jugadores)'); return }
    const bloques = armarBloques()
    if (typeof bloques === 'string') { setMsg('❌ ' + bloques); return }
    if (bloques.every((b) => yaPaso(b.fin))) { setMsg('❌ Esa franja ya terminó'); return }

    setEnviando(true)
    try {
      const res = await fetch('/api/admin/bloqueos-cancha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bloques, motivo: motivo.trim(), confirmar }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg('❌ ' + (data.error || 'No se pudo crear el bloqueo')); return }
      if (data.requiereConfirmacion) { setConflictos(data.conflictos || []); return }

      const pendientes = (data.conflictos || []).length
      setMsg(pendientes > 0
        ? `✅ Bloqueo creado. Quedan ${pendientes} partido(s)/reserva(s) agendados en esa franja: contacta a los jugadores y anula o reagenda a mano.`
        : '✅ Bloqueo creado.')
      setConflictos(null)
      setMotivo('')
      cargar()
    } finally {
      setEnviando(false)
    }
  }

  const eliminar = async (b: Bloqueo) => {
    if (!confirm(`¿Eliminar el bloqueo de ${NOMBRE_CANCHA[b.cancha]} (${b.motivo}, ${formatearFechaLarga(b.inicio)} ${franjaBloqueo(b)})?\n\nLa cancha vuelve a quedar libre para nuevas reservas y retos. No se restaura nada que se haya anulado o reagendado.`)) return
    setEliminando(b.id)
    try {
      const res = await fetch(`/api/admin/bloqueos-cancha/${b.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) setMsg('❌ ' + (data.error || 'No se pudo eliminar'))
      cargar()
    } finally {
      setEliminando(null)
    }
  }

  const vistaPrevia = (() => {
    const bloques = armarBloques()
    if (typeof bloques === 'string') return null
    return bloques.map((b) => `${NOMBRE_CANCHA[b.cancha]}: ${franjaBloqueo(b)}`).join(' · ')
  })()

  return (
    <div style={tarjeta}>
      <h3 style={{ margin: '0 0 4px 0', color: '#333' }}>🚫 Bloquear cancha (uso del club)</h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#666' }}>
        Entrenamientos de la delegación, torneos, mantenimiento… Mientras dure el bloqueo nadie puede reservar ni agendar retos en esa franja.
        Lo que ya esté agendado <strong>no se toca</strong>: se te avisa para que lo resuelvas con los jugadores.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '12px' }}>
        <div>
          <label style={etiqueta}>Cancha</label>
          <select value={cancha} onChange={(e) => setCancha(e.target.value as typeof cancha)} style={campo}>
            <option value="AMBAS">Ambas</option>
            <option value="HGV1">HGV 1</option>
            <option value="HGV2">HGV 2</option>
          </select>
        </div>
        <div>
          <label style={etiqueta}>Fecha</label>
          <input type="date" value={fecha} min={hoyEnCaracas()} onChange={(e) => setFecha(e.target.value)} style={campo} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#333', paddingBottom: '10px' }}>
          <input type="checkbox" checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} />
          Todo el día
        </label>
        {!todoElDia && (
          <>
            <div>
              <label style={etiqueta}>Desde</label>
              <select value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} style={campo}>
                {HORAS_BLOQUEO.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label style={etiqueta}>Hasta</label>
              <select value={horaFin} onChange={(e) => setHoraFin(e.target.value)} style={campo}>
                {[...HORAS_BLOQUEO.slice(1), '00:00'].map((h) => (
                  <option key={h} value={h}>{h === '00:00' ? '00:00 (medianoche)' : h}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={etiqueta}>Motivo (lo verán los jugadores)</label>
        <input
          type="text"
          value={motivo}
          maxLength={120}
          placeholder="Ej: Entrenamiento delegación Copa ASOCENCA"
          onChange={(e) => setMotivo(e.target.value)}
          style={{ ...campo, width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      {vistaPrevia && (
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#666' }}>
          {formatearFechaLarga(instanteEnCaracas(fecha))} — {vistaPrevia}
        </p>
      )}

      {!conflictos && (
        <button onClick={() => enviar(false)} disabled={enviando} style={{ ...botonPrincipal, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'Revisando…' : '🚫 Bloquear'}
        </button>
      )}

      {conflictos && (
        <div style={{ background: '#fff3cd', border: '2px solid #e0a800', borderRadius: '8px', padding: '14px' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#7a5600' }}>
            ⚠️ Ya hay {conflictos.length} partido(s)/reserva(s) agendados en esa franja:
          </p>
          <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px', fontSize: '13px', color: '#333' }}>
            {conflictos.map((c) => (
              <li key={`${c.tipo}-${c.id}`} style={{ marginBottom: '4px' }}>
                <strong>{c.tipo === 'reto' ? '🏆 Reto' : '🎾 Reserva'}</strong> · {NOMBRE_CANCHA[c.cancha]} · {formatearFechaLarga(c.inicio)}, {formatearHora(c.inicio)}–{formatearHora(c.fin)} · {c.jugadores}
                <span style={{ color: '#888' }}> ({c.estado})</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#7a5600' }}>
            El bloqueo no los cancela ni los mueve. Si bloqueas igual, conversa con esos jugadores y anula o reagenda a mano (pestaña Retos).
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => enviar(true)} disabled={enviando} style={{ ...botonPrincipal, background: '#c0392b', opacity: enviando ? 0.6 : 1 }}>
              {enviando ? 'Bloqueando…' : 'Bloquear de todas formas'}
            </button>
            <button onClick={() => setConflictos(null)} disabled={enviando} style={botonSecundario}>Cancelar</button>
          </div>
        </div>
      )}

      {msg && (
        <p style={{ margin: '12px 0 0 0', fontSize: '13px', color: msg.startsWith('✅') ? 'var(--color-net)' : '#a83226' }}>{msg}</p>
      )}

      <h4 style={{ margin: '22px 0 8px 0', color: '#333' }}>Bloqueos próximos</h4>
      {cargando ? (
        <p className="loading-row" style={{ fontSize: '13px', color: '#888', margin: 0 }}><span className="spinner" /> Cargando…</p>
      ) : bloqueos.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No hay bloqueos próximos.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bloqueos.map((b) => (
            <div key={b.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
              background: 'white', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '10px 12px',
            }}>
              <div style={{ fontSize: '13px', color: '#333' }}>
                <strong>{NOMBRE_CANCHA[b.cancha]}</strong> · {formatearFechaLarga(b.inicio)} · {franjaBloqueo(b)}
                <div style={{ color: '#666', marginTop: '2px' }}>
                  {b.motivo}{b.creador?.nombre ? <span style={{ color: '#999' }}> — {b.creador.nombre}</span> : null}
                </div>
              </div>
              <button onClick={() => eliminar(b)} disabled={eliminando === b.id} style={{ ...botonSecundario, color: '#a83226', borderColor: '#e0b4b0' }}>
                {eliminando === b.id ? 'Eliminando…' : '🗑️ Eliminar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
