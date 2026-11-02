'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatearFechaConAnio, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_TIPO_PAGO, type TipoPago } from '@/lib/delegacion'
import { formatearEur } from '@/lib/torneoPrecios'

// Pestaña Pagos → Torneo del admin: todos los pagos de inscripción del
// torneo en un solo lugar, con Validar / Rechazar (mismos endpoints que el
// detalle de cada categoría en la pestaña Torneo).

type PagoTorneo = {
  id: string
  numero_recibo: number
  jugador_id: string
  jugador_nombre: string
  es_invitado: boolean
  tipo_pago: string
  monto: number
  fecha: string
  referencia: string | null
  validado: boolean
  tasa_bcv_eur: number | null
  categoria_nombre: string
  categoria_orden: number
  inscripcion_estado: string | null
  monto_eur: number | null
  menor_nombre: string | null
}

type Filtro = 'por_validar' | 'validados' | 'todos'

const fecha = (iso: string) => formatearFechaConAnio(instanteEnCaracas(iso, '12:00'))
const bs = (n: number) => `Bs. ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const boton = (color: string, relleno = false): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
  border: `1px solid ${color}`, background: relleno ? color : 'white', color: relleno ? 'white' : color, whiteSpace: 'nowrap',
})

export default function PagosTorneo({ onCambio }: { onCambio?: (porValidar: number) => void }) {
  const [pagos, setPagos] = useState<PagoTorneo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('por_validar')
  const [categoria, setCategoria] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const cargadoUnaVez = useRef(false)

  const cargar = async () => {
    try {
      const res = await fetch('/api/admin/torneo/pagos', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar los pagos del torneo')
      const lista: PagoTorneo[] = data.pagos || []
      setPagos(lista)
      // Al abrir: si no hay nada por validar, mostrar todos (si no, la lista sale vacía).
      if (!cargadoUnaVez.current) {
        cargadoUnaVez.current = true
        if (!lista.some((p) => !p.validado)) setFiltro('todos')
      }
      onCambio?.(lista.filter((p) => !p.validado).length)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accion = async (pago: PagoTorneo, validar: boolean) => {
    if (!validar && !confirm(`¿Rechazar el pago de ${pago.jugador_nombre} (${bs(pago.monto)})? Se borra y se le avisa para que lo reporte de nuevo.`)) return
    setOcupado(pago.id)
    setMensaje('')
    setError('')
    try {
      const res = await fetch(`/api/admin/torneo/${validar ? 'validar-pago' : 'rechazar-pago'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId: pago.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción')
      setMensaje(validar ? `Pago de ${pago.jugador_nombre} validado` : `Pago de ${pago.jugador_nombre} rechazado`)
      await cargar()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setOcupado(null)
    }
  }

  const categorias = useMemo(() => {
    const vistas = new Map<string, number>()
    for (const p of pagos) vistas.set(p.categoria_nombre, p.categoria_orden)
    return [...vistas.entries()].sort((a, b) => a[1] - b[1]).map(([nombre]) => nombre)
  }, [pagos])

  const porValidar = pagos.filter((p) => !p.validado).length
  const texto = busqueda.trim().toLowerCase()
  const visibles = pagos.filter((p) =>
    (filtro === 'todos' || (filtro === 'por_validar' ? !p.validado : p.validado)) &&
    (categoria === 'todas' || p.categoria_nombre === categoria) &&
    (!texto ||
      p.jugador_nombre.toLowerCase().includes(texto) ||
      (p.menor_nombre || '').toLowerCase().includes(texto) ||
      (p.referencia || '').toLowerCase().includes(texto) ||
      String(p.numero_recibo).includes(texto))
  )
  const totalVisible = visibles.reduce((s, p) => s + p.monto, 0)

  return (
    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>🎄 Pagos de inscripción del torneo</h3>
      <p style={{ margin: '0 0 16px 0', color: '#555', fontSize: '14px' }}>
        {porValidar === 0 ? 'No hay pagos por validar.' : <><strong>{porValidar}</strong> {porValidar === 1 ? 'pago por validar' : 'pagos por validar'}.</>}
        {' '}La inscripción se confirma cuando están validados los pagos y la categoría.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {([['por_validar', `Por validar (${porValidar})`], ['validados', 'Validados'], ['todos', 'Todos']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            style={{
              padding: '7px 14px', borderRadius: '999px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
              border: filtro === id ? '2px solid var(--color-ink)' : '1px solid #ccc',
              background: filtro === id ? 'var(--color-ink)' : 'white',
              color: filtro === id ? 'white' : 'var(--color-ink)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="search"
          placeholder="Buscar jugador, referencia o recibo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: '1 1 220px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
        />
      </div>

      {mensaje && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 12px', borderRadius: '6px', margin: '0 0 12px 0' }}>{mensaje}</p>}
      {error && <p style={{ background: '#fdecea', color: '#c0392b', padding: '10px 12px', borderRadius: '6px', margin: '0 0 12px 0' }}>{error}</p>}

      {cargando ? (
        <p style={{ color: '#777' }}>Cargando pagos…</p>
      ) : visibles.length === 0 ? (
        <p style={{ color: '#777' }}>{filtro === 'por_validar' ? 'No hay pagos por validar con estos filtros.' : 'No hay pagos con estos filtros.'}</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {visibles.map((p) => (
              <div key={p.id} style={{ background: 'white', border: '1px solid #e3e3e3', borderLeft: `4px solid ${p.validado ? '#1e6b34' : '#f0b400'}`, borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: 'var(--color-ink)' }}>{p.menor_nombre || p.jugador_nombre}</strong>
                    {p.es_invitado && <span style={{ marginLeft: '6px', fontSize: '11px', background: '#eef3fb', color: '#1c7ec4', padding: '2px 6px', borderRadius: '999px', fontWeight: 'bold' }}>Invitado</span>}
                    <div style={{ fontSize: '13px', color: '#555' }}>
                      {p.categoria_nombre}
                      {p.menor_nombre && <> · pagó {p.jugador_nombre} (representante)</>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: 'var(--color-ink)' }}>{bs(p.monto)}</strong>
                    {p.monto_eur != null && <div style={{ fontSize: '12px', color: '#777' }}>{formatearEur(p.monto_eur)}</div>}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#777', marginTop: '6px' }}>
                  Recibo #{p.numero_recibo} · {ETIQUETA_TIPO_PAGO[p.tipo_pago as TipoPago] || p.tipo_pago} · {fecha(p.fecha)}
                  {p.referencia ? ` · ref. ${p.referencia}` : ''}
                  {p.tasa_bcv_eur ? ` · tasa ${p.tasa_bcv_eur.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                  {p.validado ? (
                    <span style={{ color: '#1e6b34', fontWeight: 'bold', fontSize: '13px' }}>✓ Validado</span>
                  ) : (
                    <>
                      <span style={{ color: '#8a5a00', fontWeight: 'bold', fontSize: '13px' }}>Por validar</span>
                      <button disabled={ocupado === p.id} onClick={() => accion(p, true)} style={boton('#1e6b34', true)}>
                        {ocupado === p.id ? '…' : 'Validar'}
                      </button>
                      <button disabled={ocupado === p.id} onClick={() => accion(p, false)} style={boton('#c0392b')}>
                        Rechazar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'right', color: '#555', fontSize: '13px', margin: '12px 0 0 0' }}>
            {visibles.length} {visibles.length === 1 ? 'pago' : 'pagos'} · total {bs(totalVisible)}
          </p>
        </>
      )}
    </div>
  )
}
