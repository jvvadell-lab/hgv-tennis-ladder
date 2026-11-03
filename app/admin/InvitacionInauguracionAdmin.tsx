'use client'
import { useEffect, useRef, useState } from 'react'
import { formatearFechaHora } from '@/lib/tiempo'

// Admin → Torneo → "Invitación inauguración": manda por correo la invitación
// a la inauguración de la Copa Navidad, versión A a los inscritos y B a los
// no inscritos. Vista previa, prueba al correo del admin y envío en lotes
// (el servidor registra a quién ya le llegó, así que no se duplica).

type Variante = 'inscrito' | 'no_inscrito'
type Resumen = { total: number; enviados: number; errores: number; pendientes: number }
type Fila = { jugador_id: string; nombre: string; variante: Variante; estado: 'pendiente' | 'enviando' | 'enviado' | 'error'; error: string | null; enviado_at: string | null }
type Estado = {
  vencida: boolean
  inicio: string
  cierre: string
  inscripcionesCerradas: boolean
  cupoDiario: number
  topeDiario: number
  inscrito: Resumen
  no_inscrito: Resumen
  lista: Fila[]
  previa: Record<Variante, { asunto: string; html: string }>
}

const ETIQUETA: Record<Variante, string> = { inscrito: 'A · Inscritos', no_inscrito: 'B · No inscritos' }
const RUTA = '/api/admin/correos/invitacion-inauguracion'

const estiloBoton = (fondo: string, deshabilitado: boolean) => ({
  background: deshabilitado ? '#ccc' : fondo, color: 'white', border: 'none', padding: '11px 16px', borderRadius: '8px',
  cursor: deshabilitado ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' as const, flex: '1 1 180px',
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
      const r = await fetch(RUTA, { cache: 'no-store' })
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
      const r = await fetch(RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'prueba' }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`✅ Te mandamos las versiones A y B a ${d.email}`)
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'No se pudo mandar la prueba'))
    } finally {
      setOcupado('')
    }
  }

  const enviar = async (reintentar: boolean) => {
    if (!estado) return
    const sale = (v: Variante) => (v === 'no_inscrito' && estado.inscripcionesCerradas ? 0 : reintentar ? estado[v].errores : estado[v].pendientes)
    const total = sale('inscrito') + sale('no_inscrito')
    if (total > estado.cupoDiario) {
      setMsg(`⚠️ Saldrían ${total} correos y el cupo de hoy es ${estado.cupoDiario} (tope de ${estado.topeDiario} en 24 h). Se mandarán los primeros ${estado.cupoDiario}; el resto, mañana.`)
    }
    const texto =
      `${reintentar ? 'Reintentar los que fallaron' : 'Enviar la invitación'}: saldrán ${total} correos.\n\n` +
      `• ${ETIQUETA.inscrito}: ${sale('inscrito')}\n` +
      `• ${ETIQUETA.no_inscrito}: ${sale('no_inscrito')}` +
      (estado.inscripcionesCerradas ? ' (las inscripciones ya cerraron: la versión B no se manda)' : '') +
      (total > estado.cupoDiario ? `\n\n⚠️ El cupo de hoy es ${estado.cupoDiario}: el resto queda pendiente para mañana.` : '') +
      '\n\nA quien ya la recibió no se le vuelve a mandar.'
    if (total === 0 || !window.confirm(texto)) return
    setOcupado('envio')
    setMsg('')
    detener.current = false
    let enviados = 0
    let errores = 0
    let aviso = ''
    try {
      for (;;) {
        const r = await fetch(RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'lote', reintentar }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        enviados += d.enviados
        errores += d.errores
        setProgreso(`Enviados ${enviados}${errores ? ` · ${errores} con error` : ''} · faltan ${d.restantes}`)
        if (d.restantes === 0) break
        if (d.reclamados === 0) { aviso = '⚠️ Los que faltan los está mandando otra pestaña o un envío anterior. Recarga en unos minutos.'; break }
        if (detener.current) { aviso = '⏸️ Envío pausado. Los pendientes siguen en la lista: pulsa de nuevo para continuar.'; break }
      }
      setMsg(aviso || `✅ Listo: ${enviados} enviados${errores ? `, ${errores} con error (puedes reintentarlos)` : ''}.`)
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'Se cortó el envío') + ` (llevaba ${enviados}). Puedes continuar: no se duplica.`)
    } finally {
      setOcupado('')
      setProgreso('')
      cargar()
    }
  }

  const tarjeta = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '16px' }

  if (cargando) return <p className="loading-row"><span className="spinner" /> Cargando invitación…</p>
  if (!estado) return <div style={tarjeta}>{msg}</div>

  const cerradas = estado.inscripcionesCerradas
  const porMandar = estado.inscrito.pendientes + (cerradas ? 0 : estado.no_inscrito.pendientes)
  const fallidos = estado.lista.filter((f) => f.estado === 'error' && (f.variante === 'inscrito' || !cerradas))
  const bloqueado = !!ocupado || estado.vencida

  return (
    <div style={tarjeta}>
      <h3 style={{ color: 'var(--color-ink)', margin: '0 0 4px' }}>💌 Invitación inauguración</h3>
      <p style={{ color: '#666', fontSize: '13px', margin: '0 0 14px' }}>
        Inauguración: {formatearFechaHora(estado.inicio)} · Remitente: Comisión de Tenis HGV.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        {(['inscrito', 'no_inscrito'] as Variante[]).map((v) => (
          <div key={v} style={{ border: '1px solid #e3e3e3', borderRadius: '10px', padding: '10px', background: 'white', opacity: v === 'no_inscrito' && cerradas ? 0.6 : 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>{ETIQUETA[v]}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>{estado[v].total}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              {estado[v].enviados} enviados{estado[v].errores ? ` · ${estado[v].errores} fallidos` : ''}
            </div>
          </div>
        ))}
      </div>

      {cerradas && (
        <div style={{ background: '#fff3cd', color: '#856404', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' }}>
          Las inscripciones cerraron ({formatearFechaHora(estado.cierre)}): la versión B invita a inscribirse y ya no tiene sentido, así que no se envía.
        </div>
      )}
      {!estado.vencida && porMandar > estado.cupoDiario && (
        <div style={{ background: '#fff3cd', color: '#856404', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' }}>
          ⚠️ Faltan {porMandar} correos y el cupo de hoy es {estado.cupoDiario} (tope de {estado.topeDiario} en 24 h para no pasar el límite de Gmail).
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {(['inscrito', 'no_inscrito'] as Variante[]).map((v) => (
          <button key={v} onClick={() => setVista(v)} style={{
            flex: 1, padding: '7px 8px', borderRadius: '999px', fontSize: '13px', cursor: 'pointer',
            border: '1px solid var(--color-court)', background: vista === v ? 'var(--color-court)' : 'white', color: vista === v ? 'white' : 'var(--color-court)',
          }}>
            Vista previa {v === 'inscrito' ? 'A' : 'B'}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '13px', color: '#333', marginBottom: '6px', overflowWrap: 'anywhere' }}><strong>Asunto:</strong> {estado.previa[vista].asunto}</div>
      <iframe
        title={`Vista previa — ${ETIQUETA[vista]}`}
        srcDoc={estado.previa[vista].html}
        sandbox="allow-same-origin"
        style={{ width: '100%', height: '480px', border: '1px solid #ddd', borderRadius: '8px', background: 'white', display: 'block' }}
      />
      <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0' }}>Con «María» como nombre de ejemplo.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
        <button onClick={enviarPrueba} disabled={!!ocupado} style={estiloBoton('#555', !!ocupado)}>
          {ocupado === 'prueba' ? 'Enviando prueba…' : '📨 Enviarme una prueba'}
        </button>
        <button onClick={() => enviar(false)} disabled={bloqueado || porMandar === 0} style={estiloBoton('var(--color-court)', bloqueado || porMandar === 0)}>
          {ocupado === 'envio' ? 'Enviando…' : porMandar === 0 ? '✅ Nada pendiente' : `🚀 Enviar a todos (${porMandar})`}
        </button>
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

      {fallidos.length > 0 && (
        <div style={{ marginTop: '14px', border: '1px solid #f5c2c7', background: '#fff5f5', borderRadius: '8px', padding: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#842029', marginBottom: '6px' }}>❌ Fallidos ({fallidos.length})</div>
          {fallidos.map((f) => (
            <div key={f.jugador_id} style={{ fontSize: '13px', padding: '3px 0', overflowWrap: 'anywhere' }}>
              {f.nombre} <span style={{ color: '#888' }}>· {f.variante === 'inscrito' ? 'A' : 'B'} · {f.error}</span>
            </div>
          ))}
          <button onClick={() => enviar(true)} disabled={bloqueado} style={{ ...estiloBoton('#b45309', bloqueado), marginTop: '8px', width: '100%' }}>
            🔁 Reintentar solo los fallidos ({fallidos.length})
          </button>
        </div>
      )}

      <button onClick={() => setVerLista(!verLista)} style={{ marginTop: '14px', background: 'none', border: 'none', color: 'var(--color-court)', cursor: 'pointer', fontSize: '13px', padding: 0 }}>
        {verLista ? '▲ Ocultar destinatarios' : `▼ Ver destinatarios (${estado.lista.length})`}
      </button>
      {verLista && (
        <div style={{ maxHeight: '320px', overflowY: 'auto', marginTop: '8px', border: '1px solid #eee', borderRadius: '8px', background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {estado.lista.map((f) => (
                <tr key={f.jugador_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 8px' }}>{f.nombre}</td>
                  <td style={{ padding: '6px 8px', color: '#666' }}>{f.variante === 'inscrito' ? 'A' : 'B'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {f.estado === 'enviado' ? `✅ ${f.enviado_at ? formatearFechaHora(f.enviado_at) : ''}` : f.estado === 'error' ? '❌ Fallido' : f.estado === 'enviando' ? '⏳ Enviando' : '— Pendiente'}
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
