'use client'
import { useState } from 'react'
import { formatearDistancia } from '@/lib/geoClub'
import { PENALIDAD_NO_PRESENTADO_DIAS } from '@/lib/reservas'

// Cómo se confirmó una reserva de cancha (📍 a X m / ⚠️ sin ubicación /
// 👤 admin / sin confirmar) y, si quedó sin confirmar, los arreglos del
// admin: "Marcar usada" (sí jugó y olvidó "Ya llegué") o "Quitar penalidad"
// (no sabemos si jugó, pero no debe castigar). Los datos de confirmación
// vienen de /api/admin/reservas/confirmaciones: no se leen con la clave anónima.

export type InfoConfirmacion = {
  confirmado_at: string | null
  confirmacion_metodo: 'ubicacion' | 'sin_ubicacion' | 'admin' | null
  confirmacion_distancia_m: number | null
  confirmacion_precision_m: number | null
  penalidad_anulada_at: string | null
  confirmador: { nombre: string } | null
  anulador_penalidad: { nombre: string } | null
}

const pastilla = (bg: string, color: string): React.CSSProperties => ({
  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: bg, color, whiteSpace: 'nowrap',
})
const boton: React.CSSProperties = {
  background: 'white', border: '1px solid #ccc', padding: '2px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
}

export default function ConfirmacionReserva({
  reserva,
  info,
  onCambio,
}: {
  reserva: { id: string; estado: string; fecha_hora: string; duracion_min: number | null }
  info: InfoConfirmacion | undefined
  onCambio: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  // Hora de referencia fija al montar (la lista se recarga tras cada acción).
  const [ahora] = useState(() => Date.now())

  const accion = async (accion: 'marcar_usada' | 'quitar_penalidad', pregunta: string) => {
    if (!confirm(pregunta)) return
    setOcupado(true)
    try {
      const res = await fetch(`/api/admin/reservas/${reserva.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onCambio()
    } catch (err) {
      alert('❌ ' + ((err as { message?: string } | null)?.message || 'Error'))
    } finally {
      setOcupado(false)
    }
  }

  if (reserva.estado === 'usada') {
    const m = info?.confirmacion_metodo
    if (m === 'ubicacion') {
      return (
        <span style={pastilla('#dcfce7', '#166534')} title={info?.confirmacion_precision_m != null ? `Precisión del GPS: ±${info.confirmacion_precision_m} m` : ''}>
          📍 a {formatearDistancia(info!.confirmacion_distancia_m ?? 0)}
          {info?.confirmacion_precision_m != null ? ` (±${info.confirmacion_precision_m} m)` : ''}
        </span>
      )
    }
    if (m === 'sin_ubicacion') return <span style={pastilla('#fff4d6', '#8a5a00')}>⚠️ sin ubicación</span>
    if (m === 'admin') return <span style={pastilla('#e0e7ff', '#3730a3')}>👤 admin{info?.confirmador?.nombre ? ` (${info.confirmador.nombre})` : ''}</span>
    return <span style={pastilla('#eef2f7', '#4d6575')} title="Confirmada antes de la geolocalización">✅ confirmada</span>
  }

  if (reserva.estado !== 'activa') return null
  const inicio = new Date(reserva.fecha_hora).getTime()
  if (ahora < inicio) return null // todavía no empieza: nada que mostrar

  const penalidadVigente = ahora < inicio + PENALIDAD_NO_PRESENTADO_DIAS * 24 * 60 * 60 * 1000
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={pastilla('#fee2e2', '#991b1b')}>sin confirmar</span>
      {info?.penalidad_anulada_at ? (
        <span style={pastilla('#eef2f7', '#4d6575')}>penalidad quitada{info.anulador_penalidad?.nombre ? ` (${info.anulador_penalidad.nombre})` : ''}</span>
      ) : null}
      <button
        disabled={ocupado}
        style={boton}
        onClick={() => accion('marcar_usada', '¿Marcar esta reserva como usada? Úsalo si sabes que el jugador sí jugó y olvidó tocar "Ya llegué". Queda registrado que la confirmó un admin.')}
      >
        ✅ Marcar usada
      </button>
      {!info?.penalidad_anulada_at && penalidadVigente && (
        <button
          disabled={ocupado}
          style={boton}
          onClick={() => accion('quitar_penalidad', `¿Quitar la penalidad de ${PENALIDAD_NO_PRESENTADO_DIAS} días de esta reserva? Seguirá como "sin confirmar", pero no le impedirá reservar.`)}
        >
          🚫 Quitar penalidad
        </button>
      )}
    </span>
  )
}
