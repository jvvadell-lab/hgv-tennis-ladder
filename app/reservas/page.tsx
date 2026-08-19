'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DURACION_SINGLE_MIN = 60
const DURACION_DOBLE_MIN = 90
const DURACION_RETO_MIN = 90
const PENALIDAD_NO_PRESENTADO_DIAS = 5 // si reservaste y no fuiste (ni cancelaste a tiempo)
const PASO_MIN = 15 // granularidad de los horarios que se ofrecen (cada 15 min)

// Ventanas en las que se abre cada tipo de reserva (en minutos desde medianoche)
const APERTURA_MISMO_DIA_MIN = 600  // 10:00am — desde aquí se puede reservar para HOY
const APERTURA_MANANA_MIN = 960     // 4:00pm — desde aquí se puede reservar la mañana de MAÑANA (solo HGV2)
const MANANA_HGV2_INICIO_MIN = 360  // 6:00am
const MANANA_HGV2_FIN_MIN = 720     // 12:00pm (mediodía)

function seSolapan(inicio1Ms: number, duracion1Min: number, inicio2Ms: number, duracion2Min: number) {
  const fin1 = inicio1Ms + duracion1Min * 60000
  const fin2 = inicio2Ms + duracion2Min * 60000
  return inicio1Ms < fin2 && inicio2Ms < fin1
}

// Devuelve si esa cancha, empezando a esa hora y con esa duración, cabe por
// completo dentro de su horario de apertura normal (sin pasarse del cierre).
function horaValidaParaCancha(cancha: string, fecha: Date, duracionMin: number): boolean {
  const dia = fecha.getDay() // 0 domingo ... 6 sábado
  const esFinde = dia === 0 || dia === 6
  if (esFinde) return true

  const esViernes = dia === 5
  const minutos = fecha.getHours() * 60 + fecha.getMinutes()
  const minutosFin = minutos + duracionMin

  if (cancha === 'HGV1') {
    return esViernes
      ? minutos >= 1080 && minutosFin <= 1440  // Viernes: 6:00pm – 12:00am
      : minutos >= 1200 && minutosFin <= 1440  // Lun-Jue: 8:00pm – 12:00am
  }
  if (cancha === 'HGV2') {
    // Los viernes, HGV 2 mantiene su franja de mañana normal, pero la noche
    // empieza una hora antes (6:00pm en vez de 7:00pm) — igual que HGV 1 ese día.
    const enManana = minutos >= 360 && minutosFin <= 840   // 6:00am – 2:00pm
    const enNoche = esViernes
      ? minutos >= 1080 && minutosFin <= 1440  // Viernes: 6:00pm – 12:00am
      : minutos >= 1140 && minutosFin <= 1440  // Lun-Jue: 7:00pm – 12:00am
    return enManana || enNoche
  }
  return true
}

function fechaAlInicioDelDia(base: Date): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  return d
}

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

  // Genera la lista de horarios que se pueden reservar AHORA MISMO, combinando
  // las dos ventanas: hoy (si ya son las 10am) y, solo para HGV2, la mañana de
  // mañana (si ya son las 4pm) — cada opción guarda su fecha y hora completas,
  // porque ahora puede tratarse de dos días distintos.
  const [horariosDisponibles, setHorariosDisponibles] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    const ahoraDate = new Date()
    const horaActualMin = ahoraDate.getHours() * 60 + ahoraDate.getMinutes()
    const opciones: { value: string; label: string }[] = []
    const duracionMin = tipoJuego === 'doble' ? DURACION_DOBLE_MIN : DURACION_SINGLE_MIN

    const agregarSiValido = (fecha: Date, etiquetaDia: string) => {
      if (!horaValidaParaCancha(cancha, fecha, duracionMin)) return
      opciones.push({
        value: fecha.toISOString(),
        label: `${etiquetaDia} ${fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      })
    }

    // Ventana de HOY — abierta desde las 10:00am
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

    // Ventana de MAÑANA en la mañana — solo HGV2, abierta desde las 4:00pm de hoy
    if (cancha === 'HGV2' && horaActualMin >= APERTURA_MANANA_MIN) {
      const inicioManana = new Date(ahoraDate)
      inicioManana.setDate(inicioManana.getDate() + 1)
      inicioManana.setHours(Math.floor(MANANA_HGV2_INICIO_MIN / 60), MANANA_HGV2_INICIO_MIN % 60, 0, 0)
      const finManana = new Date(ahoraDate)
      finManana.setDate(finManana.getDate() + 1)
      finManana.setHours(Math.floor(MANANA_HGV2_FIN_MIN / 60), MANANA_HGV2_FIN_MIN % 60, 0, 0)

      const cursor2 = new Date(inicioManana)
      while (cursor2 <= finManana) {
        agregarSiValido(new Date(cursor2), 'Mañana')
        cursor2.setMinutes(cursor2.getMinutes() + PASO_MIN)
      }
    }

    setHorariosDisponibles(opciones)
    setHoraSeleccionada((actual) => (opciones.some((o) => o.value === actual) ? actual : (opciones[0]?.value || '')))
  }, [cancha, tipoJuego, ahora])

  const crearReserva = async () => {
    if (!session || session.role !== 'jugador') return
    setMsg('')

    if (!horaSeleccionada) {
      setMsg('❌ No hay horarios disponibles para reservar en este momento.')
      return
    }

    setReservando(true)
    try {
      const nuevaHora = new Date(horaSeleccionada)
      const nuevaHoraMs = nuevaHora.getTime()
      const ahoraMs = Date.now()

      if (nuevaHoraMs < ahoraMs) {
        setMsg('❌ Ese horario ya pasó. Elige otro.')
        setReservando(false)
        return
      }

      // Traemos las reservas recientes del jugador (últimos días + próximas), para
      // revisar tanto si tiene una sin resolver, como si le toca esperar alguna penalidad.
      const desdeVentana = new Date(ahoraMs - (PENALIDAD_NO_PRESENTADO_DIAS + 1) * 24 * 60 * 60 * 1000)
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

      // 2) Penalidad por NO PRESENTARSE (quedó activa sin cancelar y ya pasó su hora) — 5 días
      const noPresentados = (misReservasRecientes || []).filter((r: any) => {
        const yaPaso = new Date(r.fecha_hora).getTime() <= ahoraMs
        return r.estado === 'activa' && yaPaso
      })
      if (noPresentados.length > 0) {
        const ultimaMs = Math.max(...noPresentados.map((r: any) => new Date(r.fecha_hora).getTime()))
        const disponibleDesde = ultimaMs + PENALIDAD_NO_PRESENTADO_DIAS * 24 * 60 * 60 * 1000
        if (ahoraMs < disponibleDesde) {
          const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
          setMsg(`❌ Por no presentarte a tu última reserva, puedes volver a reservar a partir del ${fmt(new Date(disponibleDesde))} (${PENALIDAD_NO_PRESENTADO_DIAS} días después).`)
          setReservando(false)
          return
        }
      }

      // 3) Uso normal de la cancha — "día por medio": si jugaste un día, el
      // siguiente día queda bloqueado, pero el de después ya está disponible.
      const usadas = (misReservasRecientes || []).filter((r: any) => r.estado === 'usada')
      if (usadas.length > 0) {
        const fechaUsoMasReciente = new Date(Math.max(...usadas.map((r: any) => new Date(r.fecha_hora).getTime())))
        const diaUso = fechaAlInicioDelDia(fechaUsoMasReciente)
        const diaBloqueado = new Date(diaUso); diaBloqueado.setDate(diaBloqueado.getDate() + 1)
        const diaSolicitado = fechaAlInicioDelDia(nuevaHora)
        if (diaSolicitado.getTime() === diaBloqueado.getTime()) {
          const disponibleDesde = new Date(diaBloqueado); disponibleDesde.setDate(disponibleDesde.getDate() + 1)
          const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
          setMsg(`❌ Jugaste el ${fmt(diaUso)} — las reservas son día por medio, así que recién puedes volver a reservar a partir del ${fmt(disponibleDesde)}.`)
          setReservando(false)
          return
        }
      }

      const inicioDia = fechaAlInicioDelDia(nuevaHora)
      const finDia = new Date(inicioDia); finDia.setHours(23, 59, 59, 999)
      const duracionMin = tipoJuego === 'doble' ? DURACION_DOBLE_MIN : DURACION_SINGLE_MIN

      // No debe chocar con partidos de la escalera (bloquean 1h30) en esa cancha ese día
      const { data: retosDia, error: errRetos } = await supabase
        .from('retos')
        .select('id, fecha_propuesta')
        .eq('cancha', cancha)
        .in('estado', ['pendiente', 'aceptado'])
        .gte('fecha_propuesta', inicioDia.toISOString())
        .lte('fecha_propuesta', finDia.toISOString())
      if (errRetos) throw errRetos

      const conflictoReto = (retosDia || []).find((r: any) =>
        seSolapan(nuevaHoraMs, duracionMin, new Date(r.fecha_propuesta).getTime(), DURACION_RETO_MIN)
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
        .gte('fecha_hora', inicioDia.toISOString())
        .lte('fecha_hora', finDia.toISOString())
      if (errReservas) throw errReservas

      const conflictoReserva = (reservasDia || []).find((r: any) =>
        seSolapan(nuevaHoraMs, duracionMin, new Date(r.fecha_hora).getTime(), r.duracion_min || DURACION_SINGLE_MIN)
      )
      if (conflictoReserva) {
        const inicioOcupado = new Date(conflictoReserva.fecha_hora)
        const finOcupado = new Date(inicioOcupado.getTime() + (conflictoReserva.duracion_min || DURACION_SINGLE_MIN) * 60000)
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
        tipo_juego: tipoJuego,
        duracion_min: duracionMin,
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
          <p style={{ fontSize: '13px', color: 'var(--color-line)', margin: '0 0 6px 0' }}>
            Puedes reservar para <strong>hoy</strong> a partir de las <strong>10:00am</strong>. Solo en <strong>HGV 2</strong>, desde las <strong>4:00pm</strong> puedes reservar la mañana de <strong>mañana</strong> (6:00am–12:00pm). Cada reserva dura <strong>1 hora en Single</strong> o <strong>1h30 en Dobles</strong>.
          </p>
          <div style={{ background: 'rgba(230,126,34,0.1)', border: '1px solid rgba(230,126,34,0.3)', borderRadius: '4px', padding: '10px 14px', marginBottom: '18px' }}>
            <p style={{ fontSize: '12px', color: '#7a4a0e', margin: '0 0 6px 0' }}>
              ⚠️ Si reservas y no puedes ir, <strong>cancela antes de la hora</strong> — no tiene penalidad. Si no vas y no cancelas a tiempo, no podrás reservar hasta dentro de {PENALIDAD_NO_PRESENTADO_DIAS} días.
            </p>
            <p style={{ fontSize: '12px', color: '#7a4a0e', margin: 0 }}>
              🎾 Si usas la cancha, las reservas son <strong>día por medio</strong> — si jugaste hoy, el siguiente día no puedes reservar, pero el de después sí.
            </p>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>🎾 Cancha</label>
            <select value={cancha} onChange={(e) => setCancha(e.target.value)} style={inputStyle}>
              <option value="HGV1">HGV 1</option>
              <option value="HGV2">HGV 2</option>
            </select>
            <p style={{ fontSize: '11px', color: 'var(--color-line)', margin: '6px 0 0 0' }}>
              {cancha === 'HGV1' && 'Lun-Jue: 8:00pm–12:00am · Vie: desde 6:00pm · Sáb-Dom: todo el día'}
              {cancha === 'HGV2' && 'Lun-Jue: 6:00am–2:00pm y 7:00pm–12:00am · Vie: 6:00am–2:00pm y 6:00pm–12:00am · Sáb-Dom: todo el día'}
            </p>
          </div>

          <div style={{ marginBottom: '14px' }}>
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
            <label style={labelStyle}>🕐 Horario disponible</label>
            {horariosDisponibles.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#a83226', margin: 0 }}>
                {(() => {
                  const horaActualMin = new Date().getHours() * 60 + new Date().getMinutes()
                  if (horaActualMin < APERTURA_MISMO_DIA_MIN) {
                    return 'La reserva para hoy abre a las 10:00am.'
                  }
                  return 'No hay horarios disponibles para esta cancha en este momento.'
                })()}
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
