'use client'
import { useEffect, useMemo, useState } from 'react'
import { formatearBs } from '@/app/components/TasaBcv'
import FormPagoTorneo from '@/app/components/FormPagoTorneo'
import { formatearFechaConAnio, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_TORNEO, MAX_CATEGORIAS_POR_JUGADOR, type EstadoInscripcion, type EstadoTorneo, type Nivel } from '@/lib/torneo'
import {
  DIAS_TORNEO,
  categoriaAbierta,
  ETIQUETA_NIVEL,
  FRANJAS_TORNEO,
  MAX_NOTA_DISPONIBILIDAD,
  celdaDisponibilidad,
  errorGeneros,
  nivelAdmitido,
  nivelParaTorneo,
} from '@/lib/torneoInscripcion'
import { ETIQUETA_TIPO_PAGO } from '@/lib/delegacion'

// "Inscribirme en el Torneo Navidad" (fase 3): inscripción con pareja y
// categoría, estado de cada inscripción con sus pagos, reporte de pago en
// Bs. y limitaciones de horario. Todo lo valida el servidor
// (/api/jugador/torneo/...); aquí solo se filtra para ayudar a elegir.

type Categoria = {
  id: string
  nombre: string
  modalidad: 'single' | 'doble'
  genero: 'caballeros' | 'damas' | 'mixto'
  categoria_nivel: Nivel | null
  cupo: number
  inscripciones_abiertas: boolean
  ocupados: number
}

type Candidato = { id: string; nombre: string; genero: string; categoria: string; categoria_torneo: string | null }

type MiInscripcion = {
  id: string
  categoria: { id: string; nombre: string; modalidad: string }
  pareja: { id: string; nombre: string } | null
  estado: EstadoInscripcion
  pendientes: { tipo: string; jugadorId: string; texto: string }[]
  pagos: { id: string; numero_recibo: number; jugador_id: string; jugador_nombre: string; tipo_pago: string; monto: number; fecha: string; referencia: string | null; validado: boolean }[]
}

type Datos = {
  torneo: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; estado: EstadoTorneo; monto_inscripcion_eur: number } | null
  yo: Candidato
  categorias: Categoria[]
  misInscripciones: MiInscripcion[]
  disponibilidad: { no_disponible: string[]; nota: string | null }
  candidatos: Candidato[]
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
        if (d.session?.role !== 'jugador') return
        setEsJugador(true)
        await cargar()
      })
      .catch((err) => setError(err.message))
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-chalk)' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando…</p>
      </main>
    )
  }

  if (!esJugador) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-chalk)', marginBottom: '16px' }}>Debes iniciar sesión como jugador para inscribirte en el torneo.</p>
        <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Iniciar sesión</a>
      </main>
    )
  }

  const torneo = datos?.torneo

  return (
    <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '20px 16px' }}>
      <div style={{
        background: 'var(--color-chalk)', borderRadius: '4px', borderTop: '3px solid var(--color-ball)',
        padding: 'clamp(20px, 5vw, 36px)', width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', alignSelf: 'flex-start',
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
              <MisInscripciones datos={datos} onCambio={cargar} />
              {torneo.estado === 'inscripcion' && <FormInscripcion datos={datos} onCambio={cargar} />}
              <Limitaciones datos={datos} />
            </>
          )
        )}

        <div style={{ textAlign: 'center', marginTop: '28px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['/torneo/inscripcion/infantil', '🧒 Inscribir a mi hijo/a'], ['/ladder', '🎾 Escalera'], ['/perfil', '👤 Mi perfil']].map(([href, texto]) => (
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
        const pagoParejaVivo = ins.pareja ? ins.pagos.some((p) => p.jugador_id === ins.pareja!.id) : true
        return (
          <div key={ins.id} style={{ background: 'white', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '6px', padding: '14px 16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--color-ink)' }}>{ins.categoria.nombre}</strong>
              <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: color.fondo, color: color.texto }}>{color.etiqueta}</span>
            </div>
            {ins.pareja && <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#444' }}>Pareja: {ins.pareja.nombre}</p>}

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
                  montoEur={datos.torneo!.monto_inscripcion_eur}
                  parejaNombre={ins.pareja && !pagoParejaVivo ? ins.pareja.nombre : null}
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
  const { torneo, yo, categorias, misInscripciones, candidatos } = datos
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [parejaId, setParejaId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const vivas = misInscripciones.filter((i) => i.estado !== 'retirada')
  const yaInscrito = new Set(vivas.map((i) => i.categoria.id))
  const categoria = categorias.find((c) => c.id === categoriaId)

  // Candidatos que cuadran con la categoría (el servidor vuelve a validar).
  const parejasPosibles = useMemo(() => {
    if (!categoria || categoria.modalidad !== 'doble') return []
    const texto = busqueda.trim().toLowerCase()
    return candidatos.filter((c) =>
      !errorGeneros(categoria.genero, [yo.genero, c.genero]) &&
      nivelAdmitido(categoria.categoria_nivel, nivelParaTorneo(c)) &&
      (!texto || c.nombre.toLowerCase().includes(texto))
    )
  }, [categoria, candidatos, busqueda, yo.genero])

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
    if (c.ocupados >= c.cupo) return 'sin cupo'
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
      const r = await postJson('/api/jugador/torneo/inscribirme', { categoriaId, parejaId: categoria?.modalidad === 'doble' ? parejaId : null })
      setOk(r.provisionales?.length
        ? '¡Inscripción registrada! Queda pendiente del pago y de que el admin confirme la categoría.'
        : '¡Inscripción registrada! Ahora reporta tu pago.')
      setCategoriaId('')
      setParejaId('')
      setBusqueda('')
      await onCambio()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const deshabilitado = enviando || !categoria || (categoria.modalidad === 'doble' && !parejaId)

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
                  <input type="radio" name="categoria" disabled={!!motivo} checked={sel} onChange={() => { setCategoriaId(c.id); setParejaId('') }} />
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontSize: '14px' }}>{c.nombre}</strong>
                    <span style={{ display: 'block', fontSize: '12px', color: '#666' }}>
                      {motivo === 'cerrada'
                        ? 'Inscripciones próximamente'
                        : <>
                            {c.modalidad === 'doble' ? `${c.cupo - c.ocupados} de ${c.cupo} parejas disponibles` : `${c.cupo - c.ocupados} de ${c.cupo} cupos disponibles`}
                            {motivo && ` · ${motivo}`}
                          </>}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {categoria?.modalidad === 'doble' && (
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Pareja</label>
            <input type="search" placeholder="Buscar por nombre…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...inputStyle, marginBottom: '8px' }} />
            <select value={parejaId} onChange={(e) => setParejaId(e.target.value)} required style={inputStyle} size={Math.min(6, Math.max(2, parejasPosibles.length + 1))}>
              <option value="">{parejasPosibles.length ? 'Elige a tu pareja' : 'No hay jugadores que cumplan los requisitos'}</option>
              {parejasPosibles.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} — {ETIQUETA_NIVEL[nivelParaTorneo(c) as Nivel] || nivelParaTorneo(c)}</option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#666', margin: '6px 0 0 0' }}>
              {categoria.genero === 'mixto' ? 'Mixto: un caballero y una dama, cualquier nivel.' : `Solo aparecen jugadores que pueden jugar ${categoria.nombre}.`}
            </p>
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
