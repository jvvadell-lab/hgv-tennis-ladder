'use client'
import { useEffect, useRef, useState } from 'react'
import { formatearFechaHora } from '@/lib/tiempo'

// Tarjeta "Invitación inauguración" del Dashboard del admin: manda por correo
// la invitación a la inauguración de la Copa Navidad, con una versión para
// inscritos y otra para no inscritos. Vista previa, prueba al correo del
// admin y envío en lotes (el servidor registra a quién ya le llegó).

type Variante = 'inscrito' | 'no_inscrito'
type Resumen = { total: number; enviados: number; errores: number }
type Fila = { jugador_id: string; nombre: string; variante: Variante; estado: 'pendiente' | 'enviando' | 'enviado' | 'error'; error: string | null; enviado_at: string | null }
type Estado = {
  vencida: boolean
  inicio: string
  inscrito: Resumen
  no_inscrito: Resumen
  pendientes: number
  lista: Fila[]
  previa: Record<Variante, { asunto: string; html: string }>
}

const ETIQUETA: Record<Variante, string> = { inscrito: 'Inscritos en la Copa', no_inscrito: 'No inscritos' }

const estiloBoton = (fondo: string, deshabilitado: boolean) => ({
  background: deshabilitado ? '#ccc' : fondo, color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px',
  cursor: deshabilitado ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' as const,
})

export default function InvitacionInauguracionAdmin() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [cargando, setCargando] = useState(true)
  const [vista, setVista] = useState<Variante>('inscrito')
  const [ocupado, setOcupado] = useState<'' | 'prueba' | 'envio'>('')
  const [progreso, setProgreso] = useState('')
  const [msg, setMsg] = useState('')
  const [verLista, setVerLista] = useState(false)
  const detener = useRef(false)

  const cargar = async () => {
    try {
      const r = await fetch('/api/admin/correos/invitacion-inauguracion', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setEstado(d)
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'No se pudo cargar la invitación'))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { cargar() }, [])

  const enviarPrueba = async () => {
    setOcupado('prueba')
    setMsg('')
    try {
      const r = await fetch('/api/admin/correos/invitacion-inauguracion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'prueba' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`✅ Te mandamos las dos versiones a ${d.email}`)
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'No se pudo mandar la prueba'))
    } finally {
      setOcupado('')
    }
  }

  const enviarTodos = async (reintentar: boolean) => {
    if (!estado) return
    const cuantos = reintentar ? estado.inscrito.errores + estado.no_inscrito.errores : estado.pendientes - estado.inscrito.errores - estado.no_inscrito.errores
    const texto = reintentar
      ? `¿Reintentar los ${cuantos} correos que fallaron?`
      : `¿Mandar la invitación a ${cuantos} jugadores?\n\n` +
        `• ${ETIQUETA.inscrito}: ${estado.inscrito.total - estado.inscrito.enviados - estado.inscrito.errores}\n` +
        `• ${ETIQUETA.no_inscrito}: ${estado.no_inscrito.total - estado.no_inscrito.enviados - estado.no_inscrito.errores}\n\n` +
        'A quienes ya la recibieron no se les vuelve a mandar.'
    if (!window.confirm(texto)) return
    setOcupado('envio')
    setMsg('')
    detener.current = false
    let enviados = 0
    let errores = 0
    try {
      for (;;) {
        const r = await fetch('/api/admin/correos/invitacion-inauguracion', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'lote', reintentar }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        enviados += d.enviados
        errores += d.errores
        setProgreso(`Enviados ${enviados}${errores ? ` · ${errores} con error` : ''} · faltan ${d.restantes}`)
        if (d.restantes === 0) break
        if (d.reclamados === 0) {
          setMsg('⚠️ Los que faltan los está mandando otra pestaña o un envío anterior. Recarga en unos minutos.')
          break
        }
        if (detener.current) { setMsg('⏸️ Envío pausado. Los pendientes siguen en la lista.'); break }
      }
      if (!detener.current) setMsg(`✅ Listo: ${enviados} enviados${errores ? `, ${errores} con error` : ''}.`)
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'Se cortó el envío') + ` (llevaba ${enviados}). Puedes continuar: no se duplica.`)
    } finally {
      setOcupado('')
      setProgreso('')
      cargar()
    }
  }

  const tarjeta = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '20px' }

  if (cargando) return <div style={tarjeta}>Cargando invitación…</div>
  if (!estado) return <div style={tarjeta}>{msg}</div>

  const errores = estado.inscrito.errores + estado.no_inscrito.errores
  const porMandar = estado.pendientes - errores

  return (
    <div style={tarjeta}>
      <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>💌 Invitación inauguración</h3>
      <p style={{ color: '#666', fontSize: '14px', marginTop: 0 }}>
        Correo a los jugadores activos con la tarjeta de la inauguración de la Copa Navidad ({formatearFechaHora(estado.inicio)}).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {(['inscrito', 'no_inscrito'] as Variante[]).map((v) => (
          <div key={v} style={{ border: '1px solid #e3e3e3', borderRadius: '10px', padding: '12px', background: 'white' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>{ETIQUETA[v]}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-ink)' }}>{estado[v].total}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              {estado[v].enviados} enviados{estado[v].errores ? ` · ${estado[v].errores} con error` : ''}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {(['inscrito', 'no_inscrito'] as Variante[]).map((v) => (
          <button key={v} onClick={() => setVista(v)} style={{
            padding: '6px 12px', borderRadius: '999px', fontSize: '13px', cursor: 'pointer',
            border: '1px solid var(--color-court)', background: vista === v ? 'var(--color-court)' : 'white', color: vista === v ? 'white' : 'var(--color-court)',
          }}>
            Vista previa · {ETIQUETA[v]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '13px', color: '#333', marginBottom: '6px' }}><strong>Asunto:</strong> {estado.previa[vista].asunto}</div>
      <iframe
        title={`Vista previa — ${ETIQUETA[vista]}`}
        srcDoc={estado.previa[vista].html}
        sandbox=""
        style={{ width: '100%', height: '520px', border: '1px solid #ddd', borderRadius: '8px', background: 'white' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
        <button onClick={enviarPrueba} disabled={!!ocupado} style={estiloBoton('#555', !!ocupado)}>
          {ocupado === 'prueba' ? 'Enviando prueba…' : '📨 Enviarme una prueba'}
        </button>
        <button onClick={() => enviarTodos(false)} disabled={!!ocupado || estado.vencida || porMandar === 0} style={estiloBoton('var(--color-court)', !!ocupado || estado.vencida || porMandar === 0)}>
          {ocupado === 'envio' ? 'Enviando…' : porMandar === 0 ? '✅ Todos enviados' : `🚀 Enviar a todos (${porMandar})`}
        </button>
        {errores > 0 && !ocupado && !estado.vencida && (
          <button onClick={() => enviarTodos(true)} style={estiloBoton('#b45309', false)}>🔁 Reintentar {errores} con error</button>
        )}
        {ocupado === 'envio' && (
          <button onClick={() => { detener.current = true }} style={estiloBoton('#991b1b', false)}>⏸️ Pausar</button>
        )}
      </div>
      {estado.vencida && <div style={{ marginTop: '10px', fontSize: '13px', color: '#721c24' }}>La inauguración ya empezó: el envío está cerrado.</div>}
      {progreso && <div style={{ marginTop: '10px', fontSize: '13px', color: '#333' }}>{progreso}</div>}
      {msg && (
        <div style={{
          marginTop: '12px', padding: '10px', borderRadius: '8px', fontSize: '13px', whiteSpace: 'pre-line',
          background: msg.startsWith('✅') ? '#d4edda' : msg.startsWith('❌') ? '#f8d7da' : '#fff3cd',
          color: msg.startsWith('✅') ? '#155724' : msg.startsWith('❌') ? '#721c24' : '#856404',
        }}>{msg}</div>
      )}

      <button onClick={() => setVerLista(!verLista)} style={{ marginTop: '14px', background: 'none', border: 'none', color: 'var(--color-court)', cursor: 'pointer', fontSize: '13px', padding: 0 }}>
        {verLista ? '▲ Ocultar destinatarios' : `▼ Ver destinatarios (${estado.lista.length})`}
      </button>
      {verLista && (
        <div style={{ maxHeight: '320px', overflowY: 'auto', marginTop: '8px', border: '1px solid #eee', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {estado.lista.map((f) => (
                <tr key={f.jugador_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 8px' }}>{f.nombre}</td>
                  <td style={{ padding: '6px 8px', color: '#666' }}>{f.variante === 'inscrito' ? 'Inscrito' : 'No inscrito'}</td>
                  <td style={{ padding: '6px 8px' }} title={f.error || undefined}>
                    {f.estado === 'enviado' ? `✅ ${f.enviado_at ? formatearFechaHora(f.enviado_at) : ''}` : f.estado === 'error' ? '❌ Error' : f.estado === 'enviando' ? '⏳ Enviando' : '— Pendiente'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
