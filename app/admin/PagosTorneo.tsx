'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatearFechaConAnio, hoyEnCaracas, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_TIPO_PAGO, type TipoPago } from '@/lib/delegacion'
import { formatearEur } from '@/lib/torneoPrecios'
import { montoInscripcionBs } from '@/lib/torneoInscripcion'

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
  const [registrando, setRegistrando] = useState(false)

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--color-ink)', margin: '0 0 12px 0' }}>🎄 Pagos de inscripción del torneo</h3>
        {!registrando && (
          <button onClick={() => setRegistrando(true)} style={boton('var(--color-court)', true)}>➕ Registrar pago</button>
        )}
      </div>
      {registrando && (
        <RegistrarPago
          onCancelar={() => setRegistrando(false)}
          onListo={async (texto) => {
            setRegistrando(false)
            setMensaje(texto)
            setFiltro('validados')
            await cargar()
          }}
        />
      )}
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

// Formulario del admin para registrar un pago hecho por fuera de la app
// (/api/admin/torneo/registrar-pago): queda validado de una vez.
type PendientePago = { inscripcionId: string; pagadorNombre: string; nombre: string; categoria: string; montoEur: number; esSaldo?: boolean }

const campo: React.CSSProperties = { padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', width: '100%', boxSizing: 'border-box' }
const etiqueta: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#555', marginBottom: '4px' }

function RegistrarPago({ onCancelar, onListo }: { onCancelar: () => void; onListo: (mensaje: string) => Promise<void> }) {
  const [pendientes, setPendientes] = useState<PendientePago[] | null>(null)
  const [tasa, setTasa] = useState<{ fecha_vigencia: string; eur: number } | null>(null)
  const [buscar, setBuscar] = useState('')
  const [inscripcionId, setInscripcionId] = useState('')
  const [tipoPago, setTipoPago] = useState('pago_movil')
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [referencia, setReferencia] = useState('')
  const [montoBs, setMontoBs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/torneo/registrar-pago', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las inscripciones')
        setPendientes(d.pendientes || [])
        setTasa(d.tasa)
      })
      .catch((e) => setError(e.message))
  }, [])

  const texto = buscar.trim().toLowerCase()
  const visibles = (pendientes || []).filter((p) => !texto || `${p.nombre} ${p.pagadorNombre} ${p.categoria}`.toLowerCase().includes(texto))
  const elegida = (pendientes || []).find((p) => p.inscripcionId === inscripcionId)
  // Referencia con la tasa de hoy; el servidor usa la del día del pago.
  const sugerido = elegida && tasa ? montoInscripcionBs(elegida.montoEur, tasa.eur) : null

  const enviar = async () => {
    if (!elegida) return setError('Elige la inscripción')
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/admin/torneo/registrar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscripcionId, tipoPago, fecha, referencia, montoBs: montoBs.trim() === '' ? null : Number(montoBs.replace(',', '.')) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudo registrar el pago')
      await onListo(`Pago de ${elegida.nombre} registrado y validado: recibo #${d.numeroRecibo} · ${bs(d.monto)}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #d6e6f5', borderRadius: '10px', padding: '16px', margin: '0 0 16px 0' }}>
      <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#555' }}>
        Para un pago hecho por fuera de la app. Queda <strong>validado</strong> con su número de recibo, a nombre del jugador (o del representante, si es un niño), y se le avisa.
      </p>
      {pendientes === null && !error && <p style={{ color: '#777', fontSize: '14px' }}>Cargando inscripciones…</p>}
      {pendientes && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={etiqueta} htmlFor="rp-buscar">Inscripción sin pago o con diferencia</label>
            <input id="rp-buscar" type="search" placeholder="Buscar por nombre o categoría…" value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ ...campo, marginBottom: '6px' }} />
            <select aria-label="Inscripción" value={inscripcionId} onChange={(e) => setInscripcionId(e.target.value)} style={campo}>
              <option value="">— Elige ({visibles.length}) —</option>
              {visibles.map((p) => (
                <option key={p.inscripcionId} value={p.inscripcionId}>
                  {p.nombre} · {p.categoria}{p.pagadorNombre !== p.nombre ? ` · paga ${p.pagadorNombre}` : ''} · {p.esSaldo ? `diferencia ${formatearEur(p.montoEur)}` : formatearEur(p.montoEur)}
                </option>
              ))}
            </select>
            {pendientes.length === 0 && <p style={{ fontSize: '13px', color: '#777', margin: '6px 0 0 0' }}>Todas las inscripciones ya tienen su pago.</p>}
          </div>
          <div>
            <label style={etiqueta} htmlFor="rp-tipo">Tipo de pago</label>
            <select id="rp-tipo" value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} style={campo}>
              <option value="pago_movil">Pago móvil</option>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </div>
          <div>
            <label style={etiqueta} htmlFor="rp-fecha">Fecha del pago</label>
            <input id="rp-fecha" type="date" value={fecha} max={hoyEnCaracas()} onChange={(e) => setFecha(e.target.value)} style={campo} />
          </div>
          <div>
            <label style={etiqueta} htmlFor="rp-ref">Referencia{tipoPago === 'efectivo' ? ' (opcional)' : ''}</label>
            <input id="rp-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} style={campo} />
          </div>
          <div>
            <label style={etiqueta} htmlFor="rp-monto">Monto en Bs. (vacío = calculado)</label>
            <input id="rp-monto" inputMode="decimal" placeholder={sugerido ? sugerido.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : 'Calculado con la tasa BCV'} value={montoBs} onChange={(e) => setMontoBs(e.target.value)} style={campo} />
          </div>
        </div>
      )}
      {elegida && (
        <p style={{ fontSize: '13px', color: '#555', margin: '10px 0 0 0' }}>
          {formatearEur(elegida.montoEur)} a la tasa BCV del euro del {fecha.split('-').reverse().join('/')}
          {sugerido && fecha === hoyEnCaracas() ? <> ≈ <strong>{bs(sugerido)}</strong></> : ''}. Escribe el monto solo si recibiste otro.
        </p>
      )}
      {error && <p style={{ background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: '6px', margin: '10px 0 0 0', fontSize: '14px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button disabled={enviando || !elegida} onClick={enviar} style={{ ...boton('#1e6b34', true), opacity: enviando || !elegida ? 0.6 : 1 }}>
          {enviando ? 'Registrando…' : 'Registrar pago validado'}
        </button>
        <button onClick={onCancelar} style={boton('#555')}>Cancelar</button>
      </div>
    </div>
  )
}
