'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatearHora } from '@/lib/tiempo'
import { MINUTOS_ANTES_CONFIRMAR, formatearDistancia } from '@/lib/geoClub'
import { confirmarLlegada } from '@/lib/confirmarLlegada'

// Aviso destacado al abrir la app: si el jugador tiene una reserva 'activa'
// dentro de la ventana de "Ya llegué" (15 min antes → final de la reserva),
// le pregunta si ya llegó. Se revisa cada minuto mientras la app está
// abierta. No hay avisos push a la hora exacta (Vercel Hobby: cron diario).

type Reserva = { id: string; cancha: string; fecha_hora: string; duracion_min: number | null }

export default function AvisoYaLlegue({ jugadorId, onConfirmado }: { jugadorId: string; onConfirmado?: () => void }) {
  const [reserva, setReserva] = useState<Reserva | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [msg, setMsg] = useState('')

  const buscar = useCallback(() => {
    const ahora = Date.now()
    supabase
      .from('reservas_cancha')
      .select('id, cancha, fecha_hora, duracion_min')
      .eq('jugador_id', jugadorId)
      .eq('estado', 'activa')
      .lte('fecha_hora', new Date(ahora + MINUTOS_ANTES_CONFIRMAR * 60_000).toISOString())
      .gte('fecha_hora_fin', new Date(ahora).toISOString())
      .order('fecha_hora', { ascending: true })
      .limit(1)
      .then(({ data }) => setReserva((data?.[0] as Reserva) || null))
  }, [jugadorId])

  useEffect(() => {
    buscar()
    const intervalo = setInterval(buscar, 60_000)
    return () => clearInterval(intervalo)
  }, [buscar])

  const confirmar = async () => {
    if (!reserva) return
    setConfirmando(true)
    setMsg('')
    const r = await confirmarLlegada(reserva.id)
    setConfirmando(false)
    if (!r.ok) return setMsg(`❌ ${r.error}`)
    setMsg(r.distanciaM != null ? `✅ ¡Listo! Llegada confirmada (📍 a ${formatearDistancia(r.distanciaM)} del club).` : '✅ ¡Listo! Llegada confirmada.')
    setReserva(null)
    onConfirmado?.()
  }

  if (!reserva) {
    return msg ? <div style={{ background: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '12px 16px', margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600 }}>{msg}</div> : null
  }

  const cancha = reserva.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'
  return (
    <div
      role="alert"
      style={{
        background: '#fff8e1', border: '2px solid #f0b400', borderRadius: '6px', padding: '14px 16px', margin: '0 0 16px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
      }}
    >
      <div style={{ color: 'var(--color-ink)' }}>
        <div style={{ fontWeight: 900, fontSize: '16px' }}>📍 ¿Ya llegaste a tu cancha {cancha} de las {formatearHora(reserva.fecha_hora)}?</div>
        <div style={{ fontSize: '12px', color: '#6b6b6b', marginTop: '2px' }}>
          Confírmalo estando en la cancha para no recibir la penalidad por no presentarte. Te pediremos tu ubicación para verificarlo (no se guarda: solo la distancia al club).
        </div>
        {msg && <div style={{ fontSize: '13px', marginTop: '6px' }}>{msg}</div>}
      </div>
      <button
        onClick={confirmar}
        disabled={confirmando}
        style={{
          background: confirmando ? '#ccc' : '#28a745', color: 'white', border: 'none', padding: '10px 18px',
          borderRadius: '4px', cursor: confirmando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap',
        }}
      >
        {confirmando ? 'Confirmando…' : '✅ Sí, ya llegué'}
      </button>
    </div>
  )
}
