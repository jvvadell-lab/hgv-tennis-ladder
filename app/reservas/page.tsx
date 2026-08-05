'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DURACION_RESERVA_MIN = 60
const DURACION_RETO_MIN = 90

function seSolapan(inicio1Ms: number, duracion1Min: number, inicio2Ms: number, duracion2Min: number) {
  const fin1 = inicio1Ms + duracion1Min * 60000
  const fin2 = inicio2Ms + duracion2Min * 60000
  return inicio1Ms < fin2 && inicio2Ms < fin1
}

function validarHorarioCancha(cancha: string, fechaStr: string, horaStr: string): { valido: boolean; mensaje?: string } {
  if (!fechaStr || !horaStr) return { valido: true }
  const [y, m, d] = fechaStr.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  const dia = fecha.getDay() // 0 = domingo, 1 = lunes, ... 5 = viernes, 6 = sábado
  const esFinde = dia === 0 || dia === 6
  if (esFinde) return { valido: true }

  const esViernes = dia === 5
  const [hh, mm] = horaStr.split(':').map(Number)
  const minutos = hh * 60 + mm

  if (cancha === 'HGV1') {
    // Viernes: libre desde las 2:00pm hasta medianoche. Lunes-jueves: solo 8:00pm-12:00am.
    const disponible = esViernes
      ? minutos >= 840 && minutos < 1440   // 2:00pm – 12:00am
      : minutos >= 1200 && minutos < 1440  // 8:00pm – 12:00am
    if (disponible) return { valido: true }
    return {
      valido: false,
      mensaje: esViernes
        ? 'Los viernes, HGV 1 está disponible a partir de las 2:00pm.'
        : 'HGV 1 solo está disponible de lunes a jueves de 8:00pm a 12:00am (viernes desde las 2:00pm, fines de semana todo el día).',
    }
  }

  if (cancha === 'HGV2') {
    const enManana = minutos >= 360 && minutos < 840   // 6:00am – 2:00pm
    const enNoche = minutos >= 1140 && minutos < 1440  // 7:00pm – 12:00am
    if (enManana || enNoche) return { valido: true }
    return {
      valido: false,
      mensaje: 'HGV 2 solo está disponible de lunes a viernes de 6:00am a 2:00pm y de 7:00pm a 12:00am (fines de semana, todo el día).',
    }
  }

  return { valido: true }
}

export default function ReservasPage() {
  const [session, setSession] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  const [cancha, setCancha] = useState('HGV1')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('12:00')
  const [reservando, setReservando] = useState(false)
  const [msg, setMsg] = useState('')

  const [misReservas, setMisReservas] = useState<any[]>([])
  const [loadingMisReservas, setLoadingMisReservas] = useState(true)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [extendiendo, setExtendiendo] = useState<string | null>(null)
  const [extenderMsg, setExtenderMsg] = useState('')

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .finally(() => setChecking(false))
  }, [])

  const cargarMisReservas = () => {
    if (!session) return
    setLoadingMisReservas(true)
    supabase
      .from('reservas_cancha')
      .select('id, cancha, fecha_hora, estado, duracion_min')
      .eq('jugador_id', session.id)
      .eq('estado', 'activa')
      .gte('fecha_hora', new Date().toISOString())
      .order('fecha_hora', { ascending: true })
      .then(({ data }) => {
        setMisReservas(data || [])
        setLoadingMisReservas(false)
      })
  }

  useEffect(() => {
    if (session?.role === 'jugador') cargarMisReservas()
  }, [session])

  function partesDesde24(hhmm: string) {
    const [hStr, mStr] = hhmm.split(':')
    const h = parseInt(hStr, 10)
    const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
    let h12 = h % 12
    if (h12 === 0) h12 = 12
    return { h12: String(h12), min: mStr, ampm }
  }

  function combinarA24(h12: string, min: string, ampm: string) {
    let h = parseInt(h12, 10) % 12
    if (ampm === 'PM') h += 12
    return `${String(h).padStart(2, '0')}:${min}`
  }

  const crearReserva = async () => {
    if (!session || session.role !== 'jugador') return
    setMsg('')

    if (!fecha) {
      setMsg('❌ Falta elegir la fecha — toca la casilla del calendario 📅')
      return
    }

    const hoyStr = new Date().toISOString().slice(0, 10)
    if (fecha < hoyStr) {
      setMsg('❌ No puedes reservar una fecha que ya pasó.')
      return
    }

    const horario = validarHorarioCancha(cancha, fecha, hora)
    if (!horario.valido) {
      setMsg('❌ ' + horario.mensaje)
      return
    }

    setReservando(true)
    try {
      const nuevaHoraMs = new Date(`${fecha}T${hora}`).getTime()
      const inicioDia = new Date(`${fecha}T00:00:00`).toISOString()
      const finDia = new Date(`${fecha}T23:59:59`).toISOString()

      // No debe chocar con partidos de la escalera (bloquean 1h30) en esa cancha ese día
      const { data: retosDia, error: errRetos } = await supabase
        .from('retos')
        .select('id, fecha_propuesta')
        .eq('cancha', cancha)
        .in('estado', ['pendiente', 'aceptado'])
        .gte('fecha_propuesta', inicioDia)
        .lte('fecha_propuesta', finDia)
      if (errRetos) throw errRetos

      const conflictoReto = (retosDia || []).find((r: any) =>
        seSolapan(nuevaHoraMs, DURACION_RESERVA_MIN, new Date(r.fecha_propuesta).getTime(), DURACION_RETO_MIN)
      )
      if (conflictoReto) {
        const inicioOcupado = new Date(conflictoReto.fecha_propuesta)
        const finOcupado = new Date(inicioOcupado.getTime() + DURACION_RETO_MIN * 60000)
        const fmt = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        setMsg(`❌ Esa cancha tiene un partido de la escalera a las ${fmt(inicioOcupado)} — ocupada hasta las ${fmt(finOcupado)}. Puedes reservar desde esa hora en adelante.`)
        setReservando(false)
        return
      }

      // No debe chocar con otras reservas casuales (bloquean 1h, o 1h30 si tienen la extensión) en esa cancha ese día
      const { data: reservasDia, error: errReservas } = await supabase
        .from('reservas_cancha')
        .select('id, fecha_hora, duracion_min')
        .eq('cancha', cancha)
        .eq('estado', 'activa')
        .gte('fecha_hora', inicioDia)
        .lte('fecha_hora', finDia)
      if (errReservas) throw errReservas

      const conflictoReserva = (reservasDia || []).find((r: any) =>
        seSolapan(nuevaHoraMs, DURACION_RESERVA_MIN, new Date(r.fecha_hora).getTime(), r.duracion_min || DURACION_RESERVA_MIN)
      )
      if (conflictoReserva) {
        const inicioOcupado = new Date(conflictoReserva.fecha_hora)
        const finOcupado = new Date(inicioOcupado.getTime() + (conflictoReserva.duracion_min || DURACION_RESERVA_MIN) * 60000)
        const fmt = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        setMsg(`❌ Esa cancha ya está reservada a las ${fmt(inicioOcupado)} — ocupada hasta las ${fmt(finOcupado)}. Puedes reservar desde esa hora en adelante.`)
        setReservando(false)
        return
      }

      const { error } = await supabase.from('reservas_cancha').insert([{
        jugador_id: session.id,
        cancha,
        fecha_hora: new Date(`${fecha}T${hora}`).toISOString(),
        estado: 'activa',
      }])
      if (error) throw error

      setMsg('✅ ¡Cancha reservada!')
      setFecha('')
      setHora('12:00')
      cargarMisReservas()
    } catch (err: any) {
      setMsg('❌ Error al reservar: ' + err.message)
    } finally {
      setReservando(false)
    }
  }

  const cancelarReserva = async (reservaId: string) => {
    if (!confirm('¿Cancelar esta reserva?')) return
    setCancelando(reservaId)
    try {
      const res = await fetch('/api/jugador/cancelar-reserva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cancelar')
      cargarMisReservas()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setCancelando(null)
    }
  }

  const extenderReserva = async (reservaId: string) => {
    setExtendiendo(reservaId)
    setExtenderMsg('')
    try {
      const res = await fetch('/api/jugador/extender-reserva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al extender')
      cargarMisReservas()
    } catch (err: any) {
      setExtenderMsg('❌ ' + err.message)
    } finally {
      setExtendiendo(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '4px',
    border: '1px solid rgba(15,27,38,0.2)', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'var(--font-body)',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', color: 'var(--color-ink)', fontWeight: 600, marginBottom: '6px', fontSize: '13px',
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="loading-row">
        <span className="spinner" /> Cargando…
      </div>
    )
  }

  if (!session || session.role !== 'jugador') {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-chalk)', fontSize: '18px', marginBottom: '16px' }}>🔒 Necesitas iniciar sesión como socio para reservar cancha.</p>
        <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Iniciar sesión</a>
      </main>
    )
  }

  const { h12, min, ampm } = partesDesde24(hora)

  return (
    <main className="court-bg" style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/logo-hgv.png" alt="Escudo HGV" style={{ width: '72px', height: '72px', objectFit: 'contain', margin: '0 auto 14px auto', display: 'block' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-chalk)', fontSize: 'clamp(26px, 5vw, 34px)', margin: 0 }}>
            Reservar Cancha
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '10px' }}>
            HGV Tennis Club
          </p>
        </div>

        {/* Formulario de reserva */}
        <div style={{ background: 'var(--color-chalk)', borderRadius: '4px', borderTop: '3px solid var(--color-ball)', padding: '28px', marginBottom: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-line)', margin: '0 0 18px 0' }}>
            Cada reserva casual bloquea la cancha por 1 hora. No se necesita aprobación — queda confirmada al instante.
          </p>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>🎾 Cancha</label>
            <select value={cancha} onChange={(e) => setCancha(e.target.value)} style={inputStyle}>
              <option value="HGV1">HGV 1</option>
              <option value="HGV2">HGV 2</option>
            </select>
            <p style={{ fontSize: '11px', color: 'var(--color-line)', margin: '6px 0 0 0' }}>
              {cancha === 'HGV1' && 'Lun-Jue: 8:00pm–12:00am · Vie: desde 2:00pm · Sáb-Dom: todo el día'}
              {cancha === 'HGV2' && 'Lun-Vie: 6:00am–2:00pm y 7:00pm–12:00am · Sáb-Dom: todo el día'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={labelStyle}>📅 Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={labelStyle}>🕐 Hora</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  value={h12}
                  onChange={(e) => setHora(combinarA24(e.target.value, min, ampm))}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <select
                  value={min}
                  onChange={(e) => setHora(combinarA24(h12, e.target.value, ampm))}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {['00', '15', '30', '45'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  value={ampm}
                  onChange={(e) => setHora(combinarA24(h12, min, e.target.value))}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={crearReserva}
            disabled={reservando}
            style={{
              width: '100%', padding: '14px', background: reservando ? '#ccc' : 'var(--color-ball)',
              color: 'var(--color-ink)', border: 'none', borderRadius: '4px', fontSize: '15px', fontWeight: 700,
              cursor: reservando ? 'not-allowed' : 'pointer',
            }}
          >
            {reservando ? 'Reservando…' : '✅ Reservar cancha'}
          </button>

          {msg && (
            <div style={{
              marginTop: '14px', padding: '10px 14px', borderRadius: '4px', fontSize: '13px',
              background: msg.includes('✅') ? 'rgba(47,82,51,0.1)' : 'rgba(197,60,50,0.1)',
              color: msg.includes('✅') ? 'var(--color-net)' : '#a83226',
            }}>
              {msg}
            </div>
          )}
        </div>

        {/* Mis reservas */}
        <div style={{ background: 'var(--color-chalk)', borderRadius: '4px', padding: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '18px', margin: '0 0 14px 0' }}>
            📋 Mis próximas reservas
          </h2>
          {loadingMisReservas ? (
            <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)' }}><span className="spinner" /> Cargando…</p>
          ) : misReservas.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-line)' }}>No tienes reservas activas por ahora.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {extenderMsg && (
                <div style={{ padding: '8px 12px', borderRadius: '4px', background: 'rgba(197,60,50,0.1)', color: '#a83226', fontSize: '12px' }}>
                  {extenderMsg}
                </div>
              )}
              {misReservas.map((r) => {
                const duracion = r.duracion_min || 60
                const inicio = new Date(r.fecha_hora)
                const fin = new Date(inicio.getTime() + duracion * 60000)
                const yaExtendida = duracion > 60
                return (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    background: 'rgba(28,126,196,0.06)', border: '1px solid rgba(28,126,196,0.15)',
                    borderRadius: '4px', padding: '10px 14px', fontSize: '13px', color: 'var(--color-ink)',
                  }}>
                    <span>
                      <strong>{r.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'}</strong>
                      {' — '}
                      {inicio.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      {' · '}
                      {inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {yaExtendida && (
                        <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 'bold', color: '#28a745', background: '#d4edda', padding: '2px 6px', borderRadius: '8px' }}>
                          +30 min
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {!yaExtendida && (
                        <button
                          onClick={() => extenderReserva(r.id)}
                          disabled={extendiendo === r.id}
                          title="Si nadie reservó justo después, se te asigna media hora más"
                          style={{
                            background: extendiendo === r.id ? '#ccc' : '#d4e157', color: 'var(--color-ink)', border: 'none', padding: '5px 12px',
                            borderRadius: '4px', cursor: extendiendo === r.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold',
                          }}
                        >
                          {extendiendo === r.id ? 'Revisando…' : '🎾 +30 min'}
                        </button>
                      )}
                      <button
                        onClick={() => cancelarReserva(r.id)}
                        disabled={cancelando === r.id}
                        style={{
                          background: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 12px',
                          borderRadius: '4px', cursor: cancelando === r.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold',
                        }}
                      >
                        {cancelando === r.id ? 'Cancelando…' : 'Cancelar'}
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <a href="/" style={{
            display: 'inline-block', color: 'var(--color-chalk)', fontSize: '15px', fontWeight: 700,
            fontFamily: 'var(--font-body)', textDecoration: 'none', border: '1px solid var(--color-ball)',
            borderRadius: '4px', padding: '11px 26px',
          }}>
            🎾 Volver al inicio
          </a>
        </div>
      </div>
    </main>
  )
}
