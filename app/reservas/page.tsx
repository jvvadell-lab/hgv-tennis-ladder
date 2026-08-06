'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DURACION_RESERVA_MIN = 60
const DURACION_RETO_MIN = 90
const VENTANA_ANTICIPACION_MIN = 180 // máximo 3 horas de anticipación
const PENALIDAD_DIAS = 5 // días de espera si usó la cancha, o si no fue y no canceló a tiempo
const PASO_MIN = 15 // granularidad de los horarios que se ofrecen (cada 15 min)

function seSolapan(inicio1Ms: number, duracion1Min: number, inicio2Ms: number, duracion2Min: number) {
  const fin1 = inicio1Ms + duracion1Min * 60000
  const fin2 = inicio2Ms + duracion2Min * 60000
  return inicio1Ms < fin2 && inicio2Ms < fin1
}

// Devuelve si esa cancha, a esa hora exacta de HOY, está dentro de su horario de apertura.
function horaValidaParaCancha(cancha: string, fecha: Date): boolean {
  const dia = fecha.getDay() // 0 domingo ... 6 sábado
  const esFinde = dia === 0 || dia === 6
  if (esFinde) return true

  const esViernes = dia === 5
  const minutos = fecha.getHours() * 60 + fecha.getMinutes()

  if (cancha === 'HGV1') {
    return esViernes
      ? minutos >= 840 && minutos < 1440   // Viernes: 2:00pm – 12:00am
      : minutos >= 1200 && minutos < 1440  // Lun-Jue: 8:00pm – 12:00am
  }
  if (cancha === 'HGV2') {
    const enManana = minutos >= 360 && minutos < 840   // 6:00am – 2:00pm
    const enNoche = minutos >= 1140 && minutos < 1440  // 7:00pm – 12:00am
    return enManana || enNoche
  }
  return true
}

export default function ReservasPage() {
  const [session, setSession] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  const [cancha, setCancha] = useState('HGV1')
  const [horaSeleccionada, setHoraSeleccionada] = useState<string>('') // "HH:MM" en 24h
  const [reservando, setReservando] = useState(false)
  const [msg, setMsg] = useState('')

  const [misReservas, setMisReservas] = useState<any[]>([])
  const [loadingMisReservas, setLoadingMisReservas] = useState(true)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [ahora, setAhora] = useState(Date.now())

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .finally(() => setChecking(false))
  }, [])

  // Refrescamos "ahora" cada 30s — así los botones de Cancelar/Confirmar
  // aparecen o desaparecen solos según va pasando la hora, sin recargar.
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30000)
    return () => clearInterval(intervalo)
  }, [])

  const cargarMisReservas = useCallback(() => {
    if (!session) return
    setLoadingMisReservas(true)
    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
    supabase
      .from('reservas_cancha')
      .select('id, cancha, fecha_hora, estado, duracion_min')
      .eq('jugador_id', session.id)
      .eq('estado', 'activa')
      .gte('fecha_hora', inicioHoy.toISOString())
      .order('fecha_hora', { ascending: true })
      .then(({ data }) => {
        setMisReservas(data || [])
        setLoadingMisReservas(false)
      })
  }, [session])

  useEffect(() => {
    if (session?.role === 'jugador') cargarMisReservas()
  }, [session, cargarMisReservas])

  // Genera la lista de horarios válidos para la cancha elegida: entre ahora y
  // dentro de las próximas 3 horas, cada 15 min, respetando el horario de la cancha.
  const [horariosDisponibles, setHorariosDisponibles] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    const ahoraDate = new Date()
    const opciones: { value: string; label: string }[] = []
    const cursor = new Date(ahoraDate)
    const minutosSobrantes = cursor.getMinutes() % PASO_MIN
    if (minutosSobrantes !== 0) cursor.setMinutes(cursor.getMinutes() + (PASO_MIN - minutosSobrantes))
    cursor.setSeconds(0, 0)

    const limite = new Date(ahoraDate.getTime() + VENTANA_ANTICIPACION_MIN * 60000)

    while (cursor <= limite) {
      if (horaValidaParaCancha(cancha, cursor)) {
        const hh = String(cursor.getHours()).padStart(2, '0')
        const mm = String(cursor.getMinutes()).padStart(2, '0')
        opciones.push({
          value: `${hh}:${mm}`,
          label: cursor.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        })
      }
      cursor.setMinutes(cursor.getMinutes() + PASO_MIN)
    }

    setHorariosDisponibles(opciones)
    setHoraSeleccionada((actual) => (opciones.some((o) => o.value === actual) ? actual : (opciones[0]?.value || '')))
  }, [cancha])

  const crearReserva = async () => {
    if (!session || session.role !== 'jugador') return
    setMsg('')

    if (!horaSeleccionada) {
      setMsg('❌ No hay horarios disponibles para esta cancha en este momento.')
      return
    }

    setReservando(true)
    try {
      const hoyStr = new Date().toISOString().slice(0, 10)
      const nuevaHora = new Date(`${hoyStr}T${horaSeleccionada}`)
      const nuevaHoraMs = nuevaHora.getTime()
      const ahoraMs = Date.now()

      if (nuevaHoraMs < ahoraMs || nuevaHoraMs > ahoraMs + VENTANA_ANTICIPACION_MIN * 60000) {
        setMsg('❌ Ese horario ya no está dentro de la ventana de reserva (máximo 3 horas de anticipación). Elige otro.')
        setReservando(false)
        return
      }

      // Traemos las reservas recientes del jugador (últimos días + hoy) en cualquier cancha,
      // para revisar tanto si tiene una sin resolver, como si le toca esperar la penalidad.
      const desdeVentana = new Date(ahoraMs - (PENALIDAD_DIAS + 1) * 24 * 60 * 60 * 1000)
      const { data: misReservasRecientes, error: errMisReservas } = await supabase
        .from('reservas_cancha')
        .select('id, cancha, fecha_hora, estado, duracion_min')
        .eq('jugador_id', session.id)
        .in('estado', ['activa', 'usada'])
        .gte('fecha_hora', desdeVentana.toISOString())
      if (errMisReservas) throw errMisReservas

      // 1) ¿Tiene una reserva sin resolver todavía (activa y su hora no ha pasado)?
      const conReservaActiva = (misReservasRecientes || []).find((r: any) => {
        if (r.estado !== 'activa') return false
        return new Date(r.fecha_hora).getTime() > ahoraMs
      })
      if (conReservaActiva) {
        const fmt = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        setMsg(`❌ Ya tienes una reserva activa (${conReservaActiva.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'} a las ${fmt(new Date(conReservaActiva.fecha_hora))}) — no puedes tener más de una a la vez.`)
        setReservando(false)
        return
      }

      // 2) ¿Tiene alguna reserva "penalizante" reciente? — la usó (estado='usada'),
      // o quedó activa sin cancelar y su hora ya pasó (no fue y no avisó).
      const penalizantes = (misReservasRecientes || []).filter((r: any) => {
        const yaPaso = new Date(r.fecha_hora).getTime() <= ahoraMs
        return r.estado === 'usada' || (r.estado === 'activa' && yaPaso)
      })
      if (penalizantes.length > 0) {
        const ultimaMs = Math.max(...penalizantes.map((r: any) => new Date(r.fecha_hora).getTime()))
        const disponibleDesde = ultimaMs + PENALIDAD_DIAS * 24 * 60 * 60 * 1000
        if (ahoraMs < disponibleDesde) {
          const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
          setMsg(`❌ Por tu última reserva, puedes volver a reservar a partir del ${fmt(new Date(disponibleDesde))} (${PENALIDAD_DIAS} días después). Si reservas y no puedes ir, cancela antes de la hora para evitar esta espera.`)
          setReservando(false)
          return
        }
      }

      const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
      const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999)
      const inicioDia = inicioHoy.toISOString()
      const finDia = finHoy.toISOString()

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
        setMsg(`❌ Esa cancha tiene un partido de la escalera a las ${fmt(inicioOcupado)} — ocupada hasta las ${fmt(finOcupado)}. Elige otro horario.`)
        setReservando(false)
        return
      }

      // No debe chocar con otras reservas casuales en esa cancha ese día
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
        setMsg(`❌ Esa cancha ya está reservada a las ${fmt(inicioOcupado)} — ocupada hasta las ${fmt(finOcupado)}. Elige otro horario.`)
        setReservando(false)
        return
      }

      const { error } = await supabase.from('reservas_cancha').insert([{
        jugador_id: session.id,
        cancha,
        fecha_hora: nuevaHora.toISOString(),
        estado: 'activa',
      }])
      if (error) throw error

      setMsg('✅ ¡Cancha reservada! No olvides confirmar que llegaste, o cancelarla a tiempo si no vas a poder ir.')
      cargarMisReservas()
    } catch (err: any) {
      setMsg('❌ Error al reservar: ' + err.message)
    } finally {
      setReservando(false)
    }
  }

  const cancelarReserva = async (reservaId: string) => {
    if (!confirm('¿Cancelar esta reserva? Al cancelar a tiempo, no tienes ninguna penalidad y puedes volver a reservar de inmediato.')) return
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

  const confirmarUso = async (reservaId: string) => {
    setConfirmando(reservaId)
    try {
      const res = await fetch('/api/jugador/confirmar-uso-reserva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al confirmar')
      cargarMisReservas()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setConfirmando(null)
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
          <p style={{ fontSize: '13px', color: 'var(--color-line)', margin: '0 0 10px 0' }}>
            Las reservas son solo para hoy, con un máximo de 3 horas de anticipación. Cada reserva dura 1 hora.
          </p>
          <div style={{ background: 'rgba(230,126,34,0.1)', border: '1px solid rgba(230,126,34,0.3)', borderRadius: '4px', padding: '10px 14px', marginBottom: '18px' }}>
            <p style={{ fontSize: '12px', color: '#7a4a0e', margin: 0 }}>
              ⚠️ Si reservas y no puedes ir, <strong>cancela antes de la hora</strong> — no tiene penalidad. Si usas la cancha, o si no vas y no cancelas a tiempo, no podrás volver a reservar hasta dentro de {PENALIDAD_DIAS} días.
            </p>
          </div>

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

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>🕐 Horario disponible (próximas 3 horas)</label>
            {horariosDisponibles.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#a83226', margin: 0 }}>
                No hay horarios disponibles para esta cancha en este momento.
              </p>
            ) : (
              <select value={horaSeleccionada} onChange={(e) => setHoraSeleccionada(e.target.value)} style={inputStyle}>
                {horariosDisponibles.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={crearReserva}
            disabled={reservando || horariosDisponibles.length === 0}
            style={{
              width: '100%', padding: '14px', background: (reservando || horariosDisponibles.length === 0) ? '#ccc' : 'var(--color-ball)',
              color: 'var(--color-ink)', border: 'none', borderRadius: '4px', fontSize: '15px', fontWeight: 700,
              cursor: (reservando || horariosDisponibles.length === 0) ? 'not-allowed' : 'pointer',
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
            📋 Mis reservas de hoy
          </h2>
          {loadingMisReservas ? (
            <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)' }}><span className="spinner" /> Cargando…</p>
          ) : misReservas.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-line)' }}>No tienes reservas activas por ahora.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {misReservas.map((r) => {
                const duracion = r.duracion_min || 60
                const inicio = new Date(r.fecha_hora)
                const fin = new Date(inicio.getTime() + duracion * 60000)
                const yaEmpezo = ahora >= inicio.getTime()
                return (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    background: 'rgba(28,126,196,0.06)', border: '1px solid rgba(28,126,196,0.15)',
                    borderRadius: '4px', padding: '10px 14px', fontSize: '13px', color: 'var(--color-ink)',
                  }}>
                    <span>
                      <strong>{r.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'}</strong>
                      {' — '}
                      {inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {yaEmpezo ? (
                        <button
                          onClick={() => confirmarUso(r.id)}
                          disabled={confirmando === r.id}
                          title="Confirma que llegaste y usaste la cancha"
                          style={{
                            background: confirmando === r.id ? '#ccc' : '#28a745', color: 'white', border: 'none', padding: '5px 12px',
                            borderRadius: '4px', cursor: confirmando === r.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold',
                          }}
                        >
                          {confirmando === r.id ? 'Confirmando…' : '✅ Ya llegué'}
                        </button>
                      ) : (
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
                      )}
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
