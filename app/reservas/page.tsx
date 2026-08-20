'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  DURACION_SINGLE_MIN, DURACION_RETO_MIN, PENALIDAD_NO_PRESENTADO_DIAS,
  PASO_MIN, APERTURA_MISMO_DIA_MIN, APERTURA_MANANA_MIN, MANANA_HGV2_INICIO_MIN, MANANA_HGV2_FIN_MIN,
  seSolapan, horaValidaParaCancha, fechaAlInicioDelDia, duracionParaTipoJuego,
} from '@/lib/reservas'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CANCHAS = ['HGV1', 'HGV2'] as const
const NOMBRE_CANCHA: Record<string, string> = { HGV1: 'HGV 1', HGV2: 'HGV 2' }

export default function ReservasPage() {
  const [session, setSession] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  const [cancha, setCancha] = useState('HGV1')
  const [tipoJuego, setTipoJuego] = useState<'single' | 'doble'>('single')
  const [horaSeleccionada, setHoraSeleccionada] = useState<string>('') // ISO completo (fecha + hora) de la opción elegida
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

  // Refrescamos "ahora" cada 30s — así los botones de Cancelar/Confirmar, y
  // las ventanas de apertura (10am / 4pm), aparecen o desaparecen solos.
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30000)
    return () => clearInterval(intervalo)
  }, [])

  const cargarMisReservas = useCallback(() => {
    if (!session) return
    setLoadingMisReservas(true)
    const inicioHoy = fechaAlInicioDelDia(new Date())
    supabase
      .from('reservas_cancha')
      .select('id, cancha, fecha_hora, estado, duracion_min, tipo_juego')
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

  // Genera, por cancha, la lista de horarios que de verdad están libres AHORA
  // MISMO — combinando las dos ventanas (hoy, y solo para HGV2 la mañana de
  // mañana) con lo que ya está ocupado por reservas activas o retos de la
  // escalera, para no mostrar nunca un bloque que el jugador no podría tomar.
  const [horariosPorCancha, setHorariosPorCancha] = useState<Record<string, { value: string; label: string }[]>>({ HGV1: [], HGV2: [] })
  const [cargandoHorarios, setCargandoHorarios] = useState(true)

  useEffect(() => {
    let cancelado = false
    setCargandoHorarios(true)

    async function calcular() {
      const ahoraDate = new Date()
      const horaActualMin = ahoraDate.getHours() * 60 + ahoraDate.getMinutes()
      const duracionMin = duracionParaTipoJuego(tipoJuego)

      const inicioHoy = fechaAlInicioDelDia(ahoraDate)
      const finManana = new Date(inicioHoy); finManana.setDate(finManana.getDate() + 2) // fin del día de mañana

      // Ocupación real: reservas activas + retos pendientes/aceptados de AMBAS
      // canchas, hoy y mañana — una sola consulta por tabla, filtramos por
      // cancha en memoria al generar cada lista.
      const [{ data: reservasOcupadas, error: errReservas }, { data: retosOcupados, error: errRetos }] = await Promise.all([
        supabase
          .from('reservas_cancha')
          .select('cancha, fecha_hora, duracion_min')
          .in('cancha', CANCHAS as unknown as string[])
          .eq('estado', 'activa')
          .gte('fecha_hora', inicioHoy.toISOString())
          .lt('fecha_hora', finManana.toISOString()),
        supabase
          .from('retos')
          .select('cancha, fecha_propuesta')
          .in('cancha', CANCHAS as unknown as string[])
          .in('estado', ['pendiente', 'aceptado'])
          .gte('fecha_propuesta', inicioHoy.toISOString())
          .lt('fecha_propuesta', finManana.toISOString()),
      ])
      if (cancelado) return
      if (errReservas || errRetos) {
        setHorariosPorCancha({ HGV1: [], HGV2: [] })
        setCargandoHorarios(false)
        return
      }

      const resultado: Record<string, { value: string; label: string }[]> = { HGV1: [], HGV2: [] }

      for (const c of CANCHAS) {
        const ocupacion = [
          ...(reservasOcupadas || []).filter((r: any) => r.cancha === c).map((r: any) => ({
            inicioMs: new Date(r.fecha_hora).getTime(), duracionMin: r.duracion_min || DURACION_SINGLE_MIN,
          })),
          ...(retosOcupados || []).filter((r: any) => r.cancha === c).map((r: any) => ({
            inicioMs: new Date(r.fecha_propuesta).getTime(), duracionMin: DURACION_RETO_MIN,
          })),
        ]

        const libre = (fecha: Date) => !ocupacion.some((o) => seSolapan(fecha.getTime(), duracionMin, o.inicioMs, o.duracionMin))

        const agregarSiValido = (fecha: Date, etiquetaDia: string) => {
          if (!horaValidaParaCancha(c, fecha, duracionMin)) return
          if (!libre(fecha)) return
          resultado[c].push({
            value: fecha.toISOString(),
            label: `${etiquetaDia} ${fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
          })
        }

        // Ventana de HOY — abierta desde las 6:00am
        if (horaActualMin >= APERTURA_MISMO_DIA_MIN) {
          const cursor = new Date(ahoraDate)
          const sobran = cursor.getMinutes() % PASO_MIN
          if (sobran !== 0) cursor.setMinutes(cursor.getMinutes() + (PASO_MIN - sobran))
          cursor.setSeconds(0, 0)
          const finHoy = new Date(ahoraDate); finHoy.setHours(23, 59, 59, 999)
          while (cursor <= finHoy) {
            agregarSiValido(new Date(cursor), 'Hoy')
            cursor.setMinutes(cursor.getMinutes() + PASO_MIN)
          }
        }

        // Ventana de MAÑANA en la mañana — solo HGV2, abierta desde las 6:00pm de hoy
        if (c === 'HGV2' && horaActualMin >= APERTURA_MANANA_MIN) {
          const inicioManana = new Date(ahoraDate)
          inicioManana.setDate(inicioManana.getDate() + 1)
          inicioManana.setHours(Math.floor(MANANA_HGV2_INICIO_MIN / 60), MANANA_HGV2_INICIO_MIN % 60, 0, 0)
          const finMananaVentana = new Date(ahoraDate)
          finMananaVentana.setDate(finMananaVentana.getDate() + 1)
          finMananaVentana.setHours(Math.floor(MANANA_HGV2_FIN_MIN / 60), MANANA_HGV2_FIN_MIN % 60, 0, 0)

          const cursor2 = new Date(inicioManana)
          while (cursor2 <= finMananaVentana) {
            agregarSiValido(new Date(cursor2), 'Mañana')
            cursor2.setMinutes(cursor2.getMinutes() + PASO_MIN)
          }
        }
      }

      setHorariosPorCancha(resultado)
      setCargandoHorarios(false)
      setCancha((c) => (resultado[c]?.length > 0 ? c : (resultado.HGV1.length > 0 ? 'HGV1' : 'HGV2')))
      setHoraSeleccionada((actual) => {
        const todas = [...resultado.HGV1, ...resultado.HGV2]
        return todas.some((o) => o.value === actual) ? actual : ''
      })
    }
    calcular()

    return () => { cancelado = true }
  }, [tipoJuego, ahora])

  const crearReserva = async () => {
    if (!session || session.role !== 'jugador') return
    setMsg('')

    if (!horaSeleccionada) {
      setMsg('❌ No hay horarios disponibles para reservar en este momento.')
      return
    }

    setReservando(true)
    try {
      // Todas las validaciones (choques con retos/otras reservas, penalidades,
      // horario de apertura) se revalidan en el servidor — el cliente ya no
      // hace más que pedirlas, para que no se puedan saltar desde afuera.
      const res = await fetch('/api/jugador/crear-reserva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancha, tipoJuego, fechaHora: horaSeleccionada }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al reservar')

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
        <p style={{ color: 'var(--color-chalk)', fontSize: '18px', marginBottom: '20px' }}>🔒 Necesitas ser socio registrado para reservar cancha.</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <a
            href="/register?next=/reservas"
            style={{
              background: 'var(--color-ball)', color: 'var(--color-ink)', fontWeight: 700, textDecoration: 'none',
              padding: '12px 24px', borderRadius: '4px', fontSize: '14px',
            }}
          >
            Registrarme ahora
          </a>
          <a
            href="/login"
            style={{
              color: 'var(--color-chalk)', fontWeight: 700, textDecoration: 'none',
              border: '1px solid rgba(247,243,234,0.4)', padding: '12px 24px', borderRadius: '4px', fontSize: '14px',
            }}
          >
            Ya tengo cuenta — Iniciar sesión
          </a>
        </div>
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
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '17px', margin: '0 0 14px 0' }}>
            🕐 Horarios que puedes reservar
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            <div style={{ background: '#f0f7fc', border: '1px solid rgba(28,126,196,0.25)', borderRadius: '6px', padding: '14px 16px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 700, color: 'var(--color-court)' }}>
                🎾 ¿Quieres jugar el mismo día?
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-ink)' }}>
                Puedes reservar desde las <strong>6:00am</strong> de ese día.
              </p>
            </div>
            <div style={{ background: '#f0f7fc', border: '1px solid rgba(28,126,196,0.25)', borderRadius: '6px', padding: '14px 16px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 700, color: 'var(--color-court)' }}>
                📅 ¿Quieres jugar el día siguiente?
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-ink)' }}>
                Solo en <strong>HGV 2</strong>, de 6:00am a 2:00pm — puedes reservar desde las <strong>6:00pm del día anterior</strong>.
              </p>
            </div>
          </div>

          <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px', fontSize: '13px', color: 'var(--color-line)', lineHeight: 1.8 }}>
            <li>Cada reserva dura <strong>1 hora en Single</strong> o <strong>1h30 en Dobles</strong>.</li>
            <li>Recuerda, al llegar a la cancha, confirmar desde la app que ya llegaste (botón <strong>"Ya llegué"</strong> en tus reservas).</li>
            <li>Si reservas y no puedes ir, <strong>cancela antes de la hora</strong> — no tiene ninguna penalidad.</li>
            <li>Si no cancelas a tiempo y no te presentas, no podrás reservar hasta dentro de <strong>{PENALIDAD_NO_PRESENTADO_DIAS} días</strong>.</li>
            <li>Si usas la cancha, puedes hacer una nueva reserva <strong>día por medio</strong> — jugaste hoy, el siguiente día no puedes reservar, pero el de después sí.</li>
          </ul>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>🎾 Modalidad</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['single', 'doble'] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoJuego(tipo)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                    border: tipoJuego === tipo ? '2px solid var(--color-court)' : '1px solid rgba(15,27,38,0.2)',
                    background: tipoJuego === tipo ? 'rgba(28,126,196,0.1)' : 'white',
                    color: 'var(--color-ink)',
                  }}
                >
                  {tipo === 'single' ? 'Single (1h)' : 'Dobles (1h 30min)'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>🕐 Horarios libres — elige cancha y hora</label>
            {cargandoHorarios ? (
              <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)', margin: 0 }}>
                <span className="spinner" /> Buscando horarios libres…
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {CANCHAS.map((c) => {
                  const libres = horariosPorCancha[c] || []
                  return (
                    <div key={c} style={{ border: '1px solid rgba(15,27,38,0.15)', borderRadius: '6px', padding: '12px' }}>
                      <p style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                        🎾 {NOMBRE_CANCHA[c]}
                      </p>
                      <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--color-line)' }}>
                        {c === 'HGV1' && 'Lun-Jue: 8:00pm–12:00am · Vie: desde 6:00pm · Sáb-Dom: todo el día'}
                        {c === 'HGV2' && 'Lun-Jue: 6:00am–2:00pm y 7:00pm–12:00am · Vie: 6:00am–2:00pm y 6:00pm–12:00am · Sáb-Dom: todo el día'}
                      </p>
                      {libres.length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#a83226', margin: 0 }}>
                          {(() => {
                            const horaActualMin = new Date().getHours() * 60 + new Date().getMinutes()
                            if (horaActualMin < APERTURA_MISMO_DIA_MIN) return 'La reserva para hoy abre a las 6:00am.'
                            return 'Sin horarios libres por ahora.'
                          })()}
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {libres.map((h) => {
                            const elegido = cancha === c && horaSeleccionada === h.value
                            return (
                              <button
                                key={h.value}
                                type="button"
                                onClick={() => { setCancha(c); setHoraSeleccionada(h.value) }}
                                style={{
                                  padding: '6px 10px', borderRadius: '14px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                                  border: elegido ? '2px solid var(--color-court)' : '1px solid rgba(15,27,38,0.2)',
                                  background: elegido ? 'rgba(28,126,196,0.12)' : 'white',
                                  color: 'var(--color-ink)',
                                }}
                              >
                                {h.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <button
            onClick={crearReserva}
            disabled={reservando || !horaSeleccionada}
            style={{
              width: '100%', padding: '14px', background: (reservando || !horaSeleccionada) ? '#ccc' : 'var(--color-ball)',
              color: 'var(--color-ink)', border: 'none', borderRadius: '4px', fontSize: '15px', fontWeight: 700,
              cursor: (reservando || !horaSeleccionada) ? 'not-allowed' : 'pointer',
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
              {misReservas.map((r) => {
                const duracion = r.duracion_min || 60
                const inicio = new Date(r.fecha_hora)
                const fin = new Date(inicio.getTime() + duracion * 60000)
                const yaEmpezo = ahora >= inicio.getTime()
                const esHoy = fechaAlInicioDelDia(inicio).getTime() === fechaAlInicioDelDia(new Date()).getTime()
                return (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    background: 'rgba(28,126,196,0.06)', border: '1px solid rgba(28,126,196,0.15)',
                    borderRadius: '4px', padding: '10px 14px', fontSize: '13px', color: 'var(--color-ink)',
                  }}>
                    <span>
                      <strong>{r.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'}</strong>
                      {' — '}
                      {esHoy ? 'Hoy' : 'Mañana'}{' '}
                      {inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {' – '}
                      {fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      <span style={{
                        marginLeft: '8px', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                        background: r.tipo_juego === 'doble' ? '#fef3c7' : '#e0f2fe',
                        color: r.tipo_juego === 'doble' ? '#92400e' : '#075985',
                      }}>
                        {r.tipo_juego === 'doble' ? 'Dobles' : 'Single'}
                      </span>
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
