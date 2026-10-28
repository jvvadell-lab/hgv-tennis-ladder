'use client'
import { useEffect, useState } from 'react'
import { formatearBs } from '@/app/components/TasaBcv'
import FormPagoTorneo from '@/app/components/FormPagoTorneo'
import { formatearFechaConAnio, formatearFechaHora, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_TORNEO, MAX_CATEGORIAS_POR_JUGADOR, type EstadoInscripcion, type EstadoTorneo, type Nivel } from '@/lib/torneo'
import {
  DIAS_TORNEO,
  categoriaAbierta,
  ETIQUETA_NIVEL,
  FRANJAS_TORNEO,
  MAX_NOTA_DISPONIBILIDAD,
  celdaDisponibilidad,
  nivelAdmitido,
  nivelParaTorneo,
} from '@/lib/torneoInscripcion'
import { ETIQUETA_TIPO_PAGO } from '@/lib/delegacion'
import { ETIQUETA_ESTADO_DOBLES, enlaceWhatsApp, mensajeInvitacionWhatsApp, telefonoLegible, type CandidatoPareja, type EstadoEnDobles } from '@/lib/torneoDobles'
import NavJugador, { BotonPanelAdmin } from '@/app/components/NavJugador'
import { textoMonto, textoMontoCorto, textoTarifas, type MontoFijado, type MontoInscripcion, type TarifasTorneo } from '@/lib/torneoPrecios'
import LineaMonto from '@/app/components/LineaMonto'

// "Inscribirme en el Torneo Navidad": inscripción individual por categoría
// (también en dobles: cada jugador se inscribe y paga solo), estado de cada
// inscripción con sus pagos, reporte de pago en Bs., la dupla en dobles
// (invitar a un jugador de la app o por WhatsApp a un teléfono, aceptar o
// rechazar las que recibo) y limitaciones de horario. Todo lo valida el
// servidor (/api/jugador/torneo/...); aquí solo se filtra para ayudar a elegir.

type Categoria = {
  id: string
  nombre: string
  modalidad: 'single' | 'doble'
  genero: 'caballeros' | 'damas' | 'mixto'
  categoria_nivel: Nivel | null
  cupo: number
  inscripciones_abiertas: boolean
  inscripciones_cambiadas_at: string | null   // null = nunca se abrió ("próximamente")
  sorteo_publicado_at: string | null
  cancelada_at: string | null
  ocupados: number        // inscripciones vivas (en dobles, jugadores)
  cupoJugadores: number   // en dobles, cupo de parejas × 2
  duplas: number          // dobles: duplas formadas
}

type Candidato = { id: string; nombre: string; genero: string; categoria: string; categoria_torneo: string | null }

type MiInscripcion = {
  id: string
  categoria: { id: string; nombre: string; modalidad: string }
  estado: EstadoInscripcion
  monto: MontoFijado
  dobles: {
    estado: EstadoEnDobles
    pareja: { equipoId: string; nombre: string } | null
    enviada: { id: string; nombre: string; telefono: string | null; vence_at: string } | null
    candidatos: CandidatoPareja[]
  } | null
  pendientes: { tipo: string; jugadorId: string; texto: string }[]
  pagos: { id: string; numero_recibo: number; jugador_id: string; jugador_nombre: string; tipo_pago: string; monto: number; fecha: string; referencia: string | null; validado: boolean }[]
}

type Datos = {
  torneo: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; estado: EstadoTorneo } & TarifasTorneo | null
  yo: Candidato
  categorias: Categoria[]
  misInscripciones: MiInscripcion[]
  disponibilidad: { no_disponible: string[]; nota: string | null }
  misEsperas: { categoriaId: string; puesto: number }[]
  proximaInscripcion: MontoInscripcion | null   // lo que pagaría mi próxima categoría
  invitacionesRecibidas: { id: string; categoria: { id: string; nombre: string }; de: string; vence_at: string; inscrito: boolean }[]
  cierreInscripcionesAt: string | null
}

const fecha = (iso: string) => formatearFechaConAnio(instanteEnCaracas(iso, '12:00'))

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', border: '1px solid rgba(15,27,38,0.2)', borderRadius: '4px',
  fontSize: '15px', boxSizing: 'border-box', background: 'white',
}
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--color-ink)', fontSize: '14px' }
const seccion: React.CSSProperties = { borderTop: '1px solid rgba(15,27,38,0.12)', paddingTop: '20px', marginTop: '24px' }
const tituloSeccion: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '19px', margin: '0 0 12px 0' }
const botonPrincipal = (deshabilitado: boolean): React.CSSProperties => ({
  width: '100%', padding: '12px', border: 'none', borderRadius: '4px', fontSize: '15px', fontWeight: 700,
  background: deshabilitado ? '#9bb' : 'var(--color-court)', color: 'white', cursor: deshabilitado ? 'default' : 'pointer',
})

const COLOR_ESTADO: Record<EstadoInscripcion, { fondo: string; texto: string; etiqueta: string }> = {
  pendiente_pago: { fondo: '#fff4d6', texto: '#8a5a00', etiqueta: 'Pendiente' },
  confirmada: { fondo: '#dff5e3', texto: '#1e6b34', etiqueta: 'Confirmada' },
  retirada: { fondo: '#eee', texto: '#777', etiqueta: 'Retirada' },
}

export default function InscripcionTorneo() {
  const [checking, setChecking] = useState(true)
  const [esJugador, setEsJugador] = useState(false)
  const [rol, setRol] = useState<string | null>(null)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  const cargar = async () => {
    const res = await fetch('/api/jugador/torneo', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al cargar el torneo')
    setDatos(data)
  }

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then(async (d) => {
        setRol(d.session?.role ?? null)
        if (d.session?.role !== 'jugador') return
        setEsJugador(true)
        await cargar()
      })
      .catch((err) => setError(err.message))
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <NavJugador />
        <p style={{ color: 'var(--color-chalk)' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando…</p>
      </main>
    )
  }

  if (!esJugador) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <NavJugador />
        <p style={{ color: 'var(--color-chalk)', marginBottom: '16px' }}>Debes iniciar sesión como jugador para inscribirte en el torneo.</p>
        <BotonPanelAdmin rol={rol} />
        <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Iniciar sesión</a>
      </main>
    )
  }

  const torneo = datos?.torneo

  return (
    <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
      <NavJugador />
      <div style={{
        background: 'var(--color-chalk)', borderRadius: '4px', borderTop: '3px solid var(--color-ball)',
        padding: 'clamp(20px, 5vw, 36px)', width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <p style={{ fontSize: '34px', margin: 0 }}>🎄🎾</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '24px', margin: '6px 0 0 0' }}>
            {torneo?.nombre || 'Torneo Navidad'}
          </h1>
          {torneo && (
            <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-court)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>
              {fecha(torneo.fecha_inicio)} — {fecha(torneo.fecha_fin)} · {ETIQUETA_ESTADO_TORNEO[torneo.estado]}
            </p>
          )}
        </div>

        {error && <Aviso tipo="error">{error}</Aviso>}

        {!torneo ? (
          <p style={{ textAlign: 'center', color: '#555' }}>No hay un torneo en organización por ahora.</p>
        ) : torneo.estado === 'borrador' && !datos?.misInscripciones.length ? (
          <p style={{ textAlign: 'center', color: '#555' }}>Las inscripciones abrirán pronto. Te avisaremos.</p>
        ) : (
          datos && (
            <>
              {torneo.estado === 'borrador' && (
                <Aviso tipo="info">Las inscripciones están cerradas. Si te falta, todavía puedes reportar tu pago.</Aviso>
              )}
              {datos.cierreInscripcionesAt && <CuentaRegresiva cierre={datos.cierreInscripcionesAt} />}
              <InvitacionesRecibidas datos={datos} onCambio={cargar} />
              <MisInscripciones datos={datos} onCambio={cargar} />
              {torneo.estado === 'inscripcion' && <FormInscripcion datos={datos} onCambio={cargar} />}
              <Limitaciones datos={datos} />
            </>
          )
        )}

        <div style={{ textAlign: 'center', marginTop: '28px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['/torneo/inscripcion/infantil', '🧒 Inscribir a mi hijo/a'], ['/torneo/mis-partidos', '📋 Mis partidos']].map(([href, texto]) => (
            <a key={href} href={href} style={{
              color: 'var(--color-ink)', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
              border: '1px solid var(--color-court)', borderRadius: '4px', padding: '9px 20px',
            }}>
              {texto}
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}

function Aviso({ tipo, children }: { tipo: 'ok' | 'error' | 'info'; children: React.ReactNode }) {
  const colores = { ok: ['#dff5e3', '#1e6b34'], error: ['#f8d7da', '#842029'], info: ['#e8f1f8', '#1c4e72'] }[tipo]
  return <div style={{ background: colores[0], color: colores[1], padding: '10px 14px', borderRadius: '4px', fontSize: '14px', margin: '12px 0' }}>{children}</div>
}

async function postJson(ruta: string, body: object) {
  const res = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'No se pudo completar')
  return data
}

// --- Mis inscripciones y pagos ---

function MisInscripciones({ datos, onCambio }: { datos: Datos; onCambio: () => Promise<void> }) {
  const [pagandoId, setPagandoId] = useState<string | null>(null)
  if (datos.misInscripciones.length === 0) return null
  return (
    <div style={seccion}>
      <h2 style={tituloSeccion}>Mis inscripciones</h2>
      {datos.misInscripciones.map((ins) => {
        const color = COLOR_ESTADO[ins.estado]
        const pagoMioVivo = ins.pagos.some((p) => p.jugador_id === datos.yo.id)
        return (
          <div key={ins.id} style={{ background: 'white', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '6px', padding: '14px 16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--color-ink)' }}>{ins.categoria.nombre}</strong>
              <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: color.fondo, color: color.texto }}>{color.etiqueta}</span>
            </div>
            {ins.estado !== 'retirada' && <LineaMonto monto={ins.monto} />}
            {ins.dobles && ins.estado !== 'retirada' && <Dupla ins={ins} datos={datos} onCambio={onCambio} />}

            {ins.pendientes.length > 0 && (
              <ul style={{ margin: '10px 0 0 0', paddingLeft: '18px', fontSize: '13px', color: '#8a5a00' }}>
                {ins.pendientes.map((p) => <li key={`${p.tipo}-${p.jugadorId}`}>{p.texto}</li>)}
              </ul>
            )}

            {ins.pagos.length > 0 && (
              <div style={{ marginTop: '10px', fontSize: '13px' }}>
                {ins.pagos.map((p) => (
                  <div key={p.id} style={{ padding: '6px 0', borderTop: '1px dashed #e2e2e2' }}>
                    <strong>{formatearBs(p.monto)}</strong> · {p.jugador_nombre} · {ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago} · {fecha(p.fecha)}
                    <span style={{ marginLeft: '6px', fontWeight: 700, color: p.validado ? '#1e6b34' : '#8a5a00' }}>{p.validado ? '✓ Validado' : 'Por validar'}</span>
                  </div>
                ))}
              </div>
            )}

            {ins.estado !== 'retirada' && !pagoMioVivo && (
              pagandoId === ins.id ? (
                <FormPagoTorneo
                  inscripcionId={ins.id}
                  montoEur={ins.monto.monto_eur}
                  etiquetaMonto={`(${ins.monto.ajuste ? 'monto ajustado por el admin' : ins.monto.motivo.toLowerCase()})`}
                  parejaNombre={null}
                  onCancelar={() => setPagandoId(null)}
                  onListo={async () => {
                    setPagandoId(null)
                    await onCambio()
                  }}
                />
              ) : (
                <button onClick={() => setPagandoId(ins.id)} style={{ ...botonPrincipal(false), marginTop: '12px' }}>💳 Reportar mi pago</button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

// --- Inscripción nueva ---

function FormInscripcion({ datos, onCambio }: { datos: Datos; onCambio: () => Promise<void> }) {
  const { torneo, yo, categorias, misInscripciones } = datos
  const [categoriaId, setCategoriaId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const vivas = misInscripciones.filter((i) => i.estado !== 'retirada')
  const yaInscrito = new Set(vivas.map((i) => i.categoria.id))
  const categoria = categorias.find((c) => c.id === categoriaId)

  if (vivas.length >= MAX_CATEGORIAS_POR_JUGADOR) {
    return (
      <div style={seccion}>
        <Aviso tipo="info">Ya estás inscrito en {MAX_CATEGORIAS_POR_JUGADOR} categorías, el máximo por jugador.</Aviso>
      </div>
    )
  }

  // Motivo por el que no puedo elegir una categoría (null = puedo).
  const motivoNo = (c: Categoria): string | null => {
    if (yaInscrito.has(c.id)) return 'ya inscrito'
    if (!categoriaAbierta(torneo!.estado, c)) return 'cerrada'
    if (c.ocupados >= c.cupoJugadores) return 'sin cupo'
    if (c.genero !== 'mixto' && c.genero !== yo.genero) return c.genero === 'damas' ? 'solo damas' : 'solo caballeros'
    if (!nivelAdmitido(c.categoria_nivel, nivelParaTorneo(yo))) return `para ${ETIQUETA_NIVEL[c.categoria_nivel!]}`
    return null
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    setOk('')
    try {
      const r = await postJson('/api/jugador/torneo/inscribirme', { categoriaId })
      const pareja = categoria?.modalidad === 'doble' ? ' Ya tienes tu lugar: arriba puedes invitar a tu pareja.' : ''
      setOk(r.provisionales?.length
        ? `¡Inscripción registrada! Queda pendiente del pago y de que el admin confirme la categoría.${pareja}`
        : `¡Inscripción registrada! Ahora reporta tu pago.${pareja}`)
      setCategoriaId('')
      await onCambio()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  // Lista de espera: categoría cerrada (ya abierta alguna vez) o llena, a la que podría entrar.
  const puedoEsperar = (c: Categoria, motivo: string | null) =>
    !c.sorteo_publicado_at && !c.cancelada_at &&
    ((motivo === 'cerrada' && !!c.inscripciones_cambiadas_at) || motivo === 'sin cupo') &&
    (c.genero === 'mixto' || c.genero === yo.genero) && nivelAdmitido(c.categoria_nivel, nivelParaTorneo(yo))
  const espera = async (c: Categoria, accion: 'anotar' | 'salir') => {
    setEnviando(true); setError(''); setOk('')
    try {
      await postJson('/api/jugador/torneo/lista-espera', { categoriaId: c.id, accion })
      setOk(accion === 'anotar' ? `Te anotaste en la lista de espera de ${c.nombre}. Si se libera un lugar antes del sorteo, el admin te avisa.` : `Saliste de la lista de espera de ${c.nombre}.`)
      await onCambio()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const deshabilitado = enviando || !categoria

  return (
    <div style={seccion}>
      <h2 style={tituloSeccion}>Inscribirme</h2>
      {!yo.categoria_torneo && (
        <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px 0' }}>
          Tu categoría oficial de torneo aún no está confirmada: te puedes inscribir con tu categoría de la escalera ({ETIQUETA_NIVEL[yo.categoria as Nivel] || yo.categoria}) y el admin la confirmará.
        </p>
      )}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      <form onSubmit={enviar}>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Categoría</label>
          <div style={{ display: 'grid', gap: '8px' }}>
            {categorias.map((c) => {
              const motivo = motivoNo(c)
              const sel = categoriaId === c.id
              return (
                <label key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '4px', cursor: motivo ? 'default' : 'pointer',
                  border: sel ? '2px solid var(--color-court)' : '1px solid rgba(15,27,38,0.15)', background: motivo ? '#f2f2f2' : 'white', opacity: motivo ? 0.65 : 1,
                }}>
                  <input type="radio" name="categoria" disabled={!!motivo} checked={sel} onChange={() => setCategoriaId(c.id)} />
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontSize: '14px' }}>{c.nombre}</strong>
                    <span style={{ display: 'block', fontSize: '12px', color: '#666' }}>
                      {motivo === 'cerrada'
                        ? (c.inscripciones_cambiadas_at ? 'Inscripciones cerradas' : 'Inscripciones próximamente')
                        : <>
                            {c.modalidad === 'doble'
                              ? `${c.duplas} de ${c.cupo} parejas formadas · ${Math.max(0, c.cupoJugadores - c.ocupados)} lugares libres`
                              : `${c.cupo - c.ocupados} de ${c.cupo} cupos disponibles`}
                            {motivo && ` · ${motivo}`}
                          </>}
                    </span>
                    {(() => {
                      const mia = datos.misEsperas.find((e) => e.categoriaId === c.id)
                      if (mia) return (
                        <span style={{ display: 'block', fontSize: '12px', marginTop: '4px', color: '#1c4e72' }}>
                          ⏳ En lista de espera (puesto {mia.puesto}) ·{' '}
                          <button type="button" disabled={enviando} onClick={() => espera(c, 'salir')} style={{ border: 'none', background: 'none', color: '#c0392b', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '12px' }}>Salir</button>
                        </span>
                      )
                      return puedoEsperar(c, motivo) ? (
                        <button type="button" disabled={enviando} onClick={() => espera(c, 'anotar')}
                          style={{ marginTop: '6px', padding: '5px 10px', fontSize: '12px', fontWeight: 700, borderRadius: '4px', border: '1px solid var(--color-court)', background: 'white', color: 'var(--color-court)', cursor: 'pointer' }}>
                          Anotarme en la lista de espera
                        </button>
                      ) : null
                    })()}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {categoria?.modalidad === 'doble' && (
          <p style={{ fontSize: '13px', color: '#555', margin: '0 0 14px 0' }}>
            En dobles te inscribes y pagas <strong>por tu cuenta</strong>: tu lugar queda reservado. Después invitas a tu pareja (de la app o por WhatsApp) o quedas disponible y el admin arma las duplas al cierre.
            {categoria.genero === 'mixto' ? ' Mixto: la dupla es un caballero y una dama, cualquier nivel.' : ''}
          </p>
        )}

        {categoria && datos.proximaInscripcion && (
          <div style={{ background: '#fff8e1', borderLeft: '4px solid #f0b400', borderRadius: '4px', padding: '10px 14px', margin: '0 0 14px 0', fontSize: '14px', color: 'var(--color-ink)' }}>
            <strong>{textoMonto(datos.proximaInscripcion)}</strong>
            <span style={{ display: 'block', fontSize: '12px', color: '#666', marginTop: '2px' }}>
              {textoTarifas(torneo!)}. En Bs. a la tasa BCV del euro del día del pago.
            </span>
          </div>
        )}

        {error && <Aviso tipo="error">{error}</Aviso>}
        <button type="submit" disabled={deshabilitado} style={botonPrincipal(deshabilitado)}>
          {enviando ? 'Inscribiendo…' : 'Inscribirme'}
        </button>
      </form>
    </div>
  )
}

// --- Cuenta regresiva al cierre ---

function CuentaRegresiva({ cierre }: { cierre: string }) {
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const falta = new Date(cierre).getTime() - ahoraMs
  if (falta <= 0) return <Aviso tipo="info">Pasó el cierre programado ({formatearFechaHora(cierre)}). Las categorías que siguen abiertas aún reciben inscripciones hasta que el admin las cierre.</Aviso>
  const dias = Math.floor(falta / 86_400_000)
  const horas = Math.floor((falta % 86_400_000) / 3_600_000)
  const minutos = Math.floor((falta % 3_600_000) / 60_000)
  return (
    <Aviso tipo="info">
      ⏳ Cierre de inscripciones: <strong>{formatearFechaHora(cierre)}</strong> (hora de Caracas) · faltan {dias ? `${dias} d ` : ''}{horas} h {minutos} min
    </Aviso>
  )
}

// --- Invitaciones que recibí ---

function InvitacionesRecibidas({ datos, onCambio }: { datos: Datos; onCambio: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  if (!datos.invitacionesRecibidas.length && !msg) return null
  const responder = async (id: string, accion: 'aceptar' | 'rechazar') => {
    setOcupado(id); setMsg(null)
    try {
      const r = await postJson('/api/jugador/torneo/invitaciones', { accion, invitacionId: id })
      setMsg({ tipo: 'ok', texto: accion === 'aceptar' ? `🤝 ¡Dupla formada!${r.inscripcionNueva ? ' Quedaste inscrito: falta reportar tu pago.' : ''}` : 'Invitación rechazada.' })
    } catch (err: any) {
      setMsg({ tipo: 'error', texto: err.message })
    } finally {
      setOcupado(null)
      await onCambio()
    }
  }
  return (
    <div style={seccion}>
      <h2 style={tituloSeccion}>Te invitaron a jugar</h2>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      {datos.invitacionesRecibidas.map((v) => (
        <div key={v.id} style={{ background: 'white', border: '2px solid var(--color-ball)', borderRadius: '6px', padding: '14px 16px', marginBottom: '12px' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '15px', color: 'var(--color-ink)' }}>
            <strong>{v.de}</strong> te invita a ser su pareja en <strong>{v.categoria.nombre}</strong>.
          </p>
          <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#666' }}>
            Vence el {formatearFechaHora(v.vence_at)}.{!v.inscrito && ` Al aceptar quedas inscrito en ${v.categoria.nombre} y te falta reportar tu pago${datos.proximaInscripcion ? ` (${textoMontoCorto(datos.proximaInscripcion)})` : ''}.`}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button disabled={ocupado === v.id} onClick={() => responder(v.id, 'aceptar')} style={{ ...botonPrincipal(ocupado === v.id), width: 'auto', padding: '9px 18px' }}>Aceptar</button>
            <button disabled={ocupado === v.id} onClick={() => responder(v.id, 'rechazar')} style={{ padding: '9px 18px', border: '1px solid #c0392b', color: '#c0392b', background: 'white', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Mi dupla en una categoría de dobles ---

const COLOR_DOBLES: Record<EstadoEnDobles, string> = { disponible: '#1c4e72', invitacion_enviada: '#8a5a00', en_dupla: '#1e6b34' }

function Dupla({ ins, datos, onCambio }: { ins: MiInscripcion; datos: Datos; onCambio: () => Promise<void> }) {
  const d = ins.dobles!
  const [modo, setModo] = useState<'app' | 'telefono'>('app')
  const [busqueda, setBusqueda] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // Enlace wa.me de la invitación por teléfono pendiente (se puede reabrir).
  const whatsapp = d.enviada?.telefono
    ? enlaceWhatsApp(d.enviada.telefono, mensajeInvitacionWhatsApp({
        invitadoNombre: d.enviada.nombre, invitaNombre: datos.yo.nombre, categoriaNombre: ins.categoria.nombre, torneoNombre: datos.torneo!.nombre,
        urlRegistro: `${window.location.origin}/register`, urlTorneo: `${window.location.origin}/torneo/inscripcion`,
      }))
    : null

  const accion = async (body: object, ok: string) => {
    setOcupado(true); setMsg(null)
    try {
      const r = await postJson('/api/jugador/torneo/invitaciones', body)
      if (r.whatsapp) window.open(r.whatsapp, '_blank', 'noopener')
      setMsg({ tipo: 'ok', texto: r.aCuenta === true && 'nombre' in body ? 'Ese teléfono ya tiene cuenta en la app: le llegó la invitación a su campana.' : ok })
      await onCambio()
    } catch (err: any) {
      setMsg({ tipo: 'error', texto: err.message })
    } finally {
      setOcupado(false)
    }
  }

  const texto = busqueda.trim().toLowerCase()
  const lista = d.candidatos.filter((c) => !texto || c.nombre.toLowerCase().includes(texto))

  return (
    <div style={{ marginTop: '10px', fontSize: '14px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: COLOR_DOBLES[d.estado] }}>● {ETIQUETA_ESTADO_DOBLES[d.estado]}</span>
      {d.pareja && <p style={{ margin: '4px 0 0 0', color: '#444' }}>Pareja: <strong>{d.pareja.nombre}</strong></p>}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      {d.enviada && (
        <div style={{ marginTop: '6px', color: '#555' }}>
          Esperando a <strong>{d.enviada.nombre}</strong>{d.enviada.telefono ? ` (${telefonoLegible(d.enviada.telefono)})` : ''} · vence el {formatearFechaHora(d.enviada.vence_at)}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', borderRadius: '4px', background: '#25d366', color: 'white', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
                📲 Abrir WhatsApp
              </a>
            )}
            <button disabled={ocupado} onClick={() => accion({ accion: 'cancelar', invitacionId: d.enviada!.id }, 'Invitación cancelada: vuelves a estar disponible.')}
              style={{ padding: '6px 12px', border: '1px solid #c0392b', color: '#c0392b', background: 'white', borderRadius: '4px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Cancelar invitación
            </button>
          </div>
        </div>
      )}

      {d.estado === 'disponible' && datos.categorias.find((c) => c.id === ins.categoria.id)?.inscripciones_abiertas && datos.torneo?.estado === 'inscripcion' && (
        <div style={{ marginTop: '10px', borderTop: '1px dashed #e2e2e2', paddingTop: '10px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {([['app', 'Jugador de la app'], ['telefono', 'No tiene cuenta (WhatsApp)']] as const).map(([m, t]) => (
              <button key={m} type="button" onClick={() => setModo(m)} style={{
                flex: 1, padding: '7px', fontSize: '12px', fontWeight: 700, borderRadius: '4px', cursor: 'pointer',
                border: modo === m ? '2px solid var(--color-court)' : '1px solid rgba(15,27,38,0.2)', background: 'white', color: 'var(--color-ink)',
              }}>{t}</button>
            ))}
          </div>
          {modo === 'app' ? (
            <>
              <input type="search" placeholder="Buscar por nombre…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...inputStyle, marginBottom: '8px' }} />
              <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '4px' }}>
                {lista.length === 0 && <p style={{ padding: '10px', margin: 0, color: '#888', fontSize: '13px' }}>No hay jugadores que cumplan los requisitos.</p>}
                {lista.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 10px', borderTop: '1px solid #f0f0f0', color: c.seleccionable ? 'var(--color-ink)' : '#999', background: c.estado === 'disponible' ? '#f3faf5' : 'white' }}>
                    <span>
                      {c.nombre}
                      <span style={{ display: 'block', fontSize: '11px', color: c.seleccionable ? '#666' : '#aaa' }}>
                        {c.meInvito ? 'Te invitó: acepta o rechaza arriba' : c.estado === 'disponible' ? 'Inscrito y disponible' : c.estado === 'invitacion_enviada' ? `Esperando a ${c.esperandoA ?? '—'}` : 'Aún no inscrito: al aceptar se inscribe'}
                      </span>
                    </span>
                    <button disabled={!c.seleccionable || ocupado} onClick={() => accion({ accion: 'enviar', categoriaId: ins.categoria.id, jugadorId: c.id }, `Invitación enviada a ${c.nombre}. Le llegó a su campana y por correo.`)}
                      style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '4px', border: 'none', cursor: c.seleccionable ? 'pointer' : 'default', background: c.seleccionable ? 'var(--color-court)' : '#ddd', color: 'white' }}>
                      Invitar
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); accion({ accion: 'enviar', categoriaId: ins.categoria.id, nombre, telefono }, 'Invitación creada: envíale el mensaje por WhatsApp. Cuando se registre con ese teléfono la verá en la app.') }}>
              <input placeholder="Nombre de tu pareja" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} style={{ ...inputStyle, marginBottom: '8px' }} />
              <input placeholder="Teléfono (ej. 0414-1234567)" value={telefono} onChange={(e) => setTelefono(e.target.value)} required inputMode="tel" style={{ ...inputStyle, marginBottom: '8px' }} />
              <button type="submit" disabled={ocupado} style={botonPrincipal(ocupado)}>📲 Invitar por WhatsApp</button>
            </form>
          )}
          <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 0 0' }}>
            Una invitación a la vez; vence a las 48 h, al cierre programado o cuando se cierre la categoría. Si no eliges a nadie quedas disponible y el admin arma las duplas al cierre.
          </p>
        </div>
      )}
    </div>
  )
}

// --- Limitaciones de horario ---

function Limitaciones({ datos }: { datos: Datos }) {
  const [noDisponible, setNoDisponible] = useState<string[]>(datos.disponibilidad.no_disponible || [])
  const [nota, setNota] = useState(datos.disponibilidad.nota || '')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const alternar = (celda: string) =>
    setNoDisponible((actual) => (actual.includes(celda) ? actual.filter((c) => c !== celda) : [...actual, celda]))

  const guardar = async () => {
    setGuardando(true)
    setMsg(null)
    try {
      await postJson('/api/jugador/torneo/disponibilidad', { noDisponible, nota })
      setMsg({ tipo: 'ok', texto: 'Limitaciones guardadas.' })
    } catch (err: any) {
      setMsg({ tipo: 'error', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={seccion}>
      <h2 style={tituloSeccion}>Mis limitaciones de horario</h2>
      <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px 0' }}>
        Marca los turnos en los que <strong>no puedes</strong> jugar. Se toman en cuenta al programar los partidos, en la medida de lo posible.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(80px, auto) repeat(${DIAS_TORNEO.length}, 1fr)`, gap: '6px', alignItems: 'center' }}>
        <span />
        {DIAS_TORNEO.map((d) => <span key={d.id} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--color-ink)' }}>{d.etiqueta}</span>)}
        {FRANJAS_TORNEO.map((f) => (
          <FilaFranja key={f.id} franja={f} noDisponible={noDisponible} alternar={alternar} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#666', margin: '8px 0 14px 0' }}>
        <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#dff5e3', border: '1px solid #9cc9a6', marginRight: '4px' }} />Puedo</span>
        <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#c0392b', marginRight: '4px' }} />No puedo</span>
      </div>
      <label style={labelStyle}>Nota (opcional)</label>
      <textarea
        value={nota}
        maxLength={MAX_NOTA_DISPONIBILIDAD}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Ej.: viajo del 20 al 24 de noviembre"
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <button onClick={guardar} disabled={guardando} style={{ ...botonPrincipal(guardando), marginTop: '10px' }}>
        {guardando ? 'Guardando…' : 'Guardar limitaciones'}
      </button>
    </div>
  )
}

function FilaFranja({ franja, noDisponible, alternar }: {
  franja: (typeof FRANJAS_TORNEO)[number]
  noDisponible: string[]
  alternar: (celda: string) => void
}) {
  return (
    <>
      <span style={{ fontSize: '12px', color: 'var(--color-ink)', lineHeight: 1.2 }}>
        <strong>{franja.etiqueta}</strong><br /><span style={{ color: '#777' }}>{franja.horas}</span>
      </span>
      {DIAS_TORNEO.map((d) => {
        const celda = celdaDisponibilidad(d.id, franja.id)
        const no = noDisponible.includes(celda)
        return (
          <button
            key={celda}
            type="button"
            aria-pressed={no}
            aria-label={`${d.etiqueta} ${franja.etiqueta}: ${no ? 'no puedo' : 'puedo'}`}
            onClick={() => alternar(celda)}
            style={{
              height: '40px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px',
              border: no ? '1px solid #c0392b' : '1px solid #9cc9a6', background: no ? '#c0392b' : '#dff5e3', color: no ? 'white' : '#1e6b34',
            }}
          >
            {no ? '✕' : '✓'}
          </button>
        )
      })}
    </>
  )
}
