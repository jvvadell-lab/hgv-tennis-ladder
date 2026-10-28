'use client'
import { useEffect, useMemo, useState } from 'react'
import { formatearBs } from '@/app/components/TasaBcv'
import FormPagoTorneo from '@/app/components/FormPagoTorneo'
import { formatearFechaConAnio, hoyEnCaracas, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_TORNEO, MAX_CATEGORIAS_POR_JUGADOR, type EstadoInscripcion, type EstadoTorneo, type GeneroCategoria } from '@/lib/torneo'
import {
  ETIQUETA_GENERO_CATEGORIA_INFANTIL,
  ETIQUETA_GENERO_MENOR,
  ETIQUETA_PARENTESCO,
  PARENTESCOS,
  categoriaSugerida,
  categoriasParaMenor,
  edadAlCorte,
} from '@/lib/torneoInfantil'
import { categoriaAbierta } from '@/lib/torneoInscripcion'
import { ETIQUETA_TIPO_PAGO } from '@/lib/delegacion'
import NavJugador from '@/app/components/NavJugador'

// "Inscribir a mi hijo/a" (Torneo Navidad, sección Infantil — SPEC §14):
// fichas de mis representados (reutilizables en torneos futuros),
// inscripción con categoría sugerida por la edad al corte y las dos
// autorizaciones por separado, estado y reporte de pago. Todo lo valida el
// servidor (/api/jugador/torneo/infantil/...); el admin certifica la categoría.

type Categoria = { id: string; nombre: string; genero: GeneroCategoria; edad_min: number | null; edad_max: number | null; cupo: number; inscripciones_abiertas: boolean; ocupados: number; duracion_min: number }

type Pago = { id: string; numero_recibo: number; jugador_id: string; tipo_pago: string; monto: number; fecha: string; validado: boolean }

type InscripcionMenor = {
  id: string
  estado: EstadoInscripcion
  categoria: { id: string; nombre: string }
  certificada: boolean
  pendientes: { tipo: string; jugadorId: string; texto: string }[]
  pagos: Pago[]
}

type Representado = {
  id: string
  nombre: string
  apellido: string
  fecha_nacimiento: string
  genero: 'caballeros' | 'damas'
  numero_accion: string | null
  parentesco: string
  emergencia_nombre: string
  emergencia_telefono: string
  autorizacion_imagen: boolean
  inscripciones?: InscripcionMenor[]
}

type Torneo = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; estado: EstadoTorneo; monto_inscripcion_eur: number; fecha_corte_edad: string | null; solo_socios: boolean }

type Datos = {
  torneo: Torneo | null
  fechaCorte?: string
  categorias?: Categoria[]
  representados: Representado[]
}

const fecha = (iso: string) => formatearFechaConAnio(instanteEnCaracas(iso, '12:00'))

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', border: '1px solid rgba(15,27,38,0.2)', borderRadius: '4px',
  fontSize: '15px', boxSizing: 'border-box', background: 'white',
}
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px', fontWeight: 600, color: 'var(--color-ink)', fontSize: '14px' }
const seccion: React.CSSProperties = { borderTop: '1px solid rgba(15,27,38,0.12)', paddingTop: '20px', marginTop: '24px' }
const tituloSeccion: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '19px', margin: '0 0 12px 0' }
const tarjeta: React.CSSProperties = { background: 'white', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '6px', padding: '14px 16px', marginBottom: '12px' }
const botonPrincipal = (deshabilitado: boolean): React.CSSProperties => ({
  width: '100%', padding: '12px', border: 'none', borderRadius: '4px', fontSize: '15px', fontWeight: 700,
  background: deshabilitado ? '#9bb' : 'var(--color-court)', color: 'white', cursor: deshabilitado ? 'default' : 'pointer',
})
const botonSecundario: React.CSSProperties = { padding: '8px 14px', border: '1px solid var(--color-court)', background: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }

const COLOR_ESTADO: Record<EstadoInscripcion, { fondo: string; texto: string; etiqueta: string }> = {
  pendiente_pago: { fondo: '#fff4d6', texto: '#8a5a00', etiqueta: 'Pendiente' },
  confirmada: { fondo: '#dff5e3', texto: '#1e6b34', etiqueta: 'Confirmada' },
  retirada: { fondo: '#eee', texto: '#777', etiqueta: 'Retirada' },
}

async function postJson(ruta: string, body: object) {
  const res = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'No se pudo completar')
  return data
}

function Aviso({ tipo, children }: { tipo: 'ok' | 'error' | 'info'; children: React.ReactNode }) {
  const colores = { ok: ['#dff5e3', '#1e6b34'], error: ['#f8d7da', '#842029'], info: ['#e8f1f8', '#1c4e72'] }[tipo]
  return <div style={{ background: colores[0], color: colores[1], padding: '10px 14px', borderRadius: '4px', fontSize: '14px', margin: '12px 0' }}>{children}</div>
}

export default function InscripcionInfantil() {
  const [checking, setChecking] = useState(true)
  const [esJugador, setEsJugador] = useState(false)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<Representado | 'nuevo' | null>(null)

  const cargar = async () => {
    const res = await fetch('/api/jugador/torneo/infantil', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al cargar')
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
        <p style={{ color: 'var(--color-chalk)', marginBottom: '16px' }}>Debes iniciar sesión como jugador para inscribir a tu hijo/a en el torneo.</p>
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
          <p style={{ fontSize: '34px', margin: 0 }}>🎄🧒🎾</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '24px', margin: '6px 0 0 0' }}>
            Inscribir a mi hijo/a
          </h1>
          {torneo && (
            <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-court)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>
              {torneo.nombre} · {ETIQUETA_ESTADO_TORNEO[torneo.estado]}
            </p>
          )}
        </div>

        {error && <Aviso tipo="error">{error}</Aviso>}

        {torneo && datos?.fechaCorte && (
          <p style={{ fontSize: '13px', color: '#555', textAlign: 'center', margin: '8px 0 0 0' }}>
            Categorías por edad cumplida al <strong>{fecha(datos.fechaCorte)}</strong> · {torneo.monto_inscripcion_eur} € por niño y categoría
          </p>
        )}

        {datos && (
          <>
            <MisRepresentados datos={datos} onCambio={cargar} onEditar={setEditando} />

            {editando ? (
              <FormFicha
                ficha={editando === 'nuevo' ? null : editando}
                onCancelar={() => setEditando(null)}
                onListo={async () => {
                  setEditando(null)
                  await cargar()
                }}
              />
            ) : (
              <div style={{ marginTop: '12px' }}>
                <button onClick={() => setEditando('nuevo')} style={botonSecundario}>➕ Agregar un niño o niña</button>
              </div>
            )}

            {torneo?.estado === 'inscripcion' && datos.representados.length > 0 && <FormInscribir datos={datos} onCambio={cargar} />}
            {torneo && torneo.estado === 'borrador' && (
              <Aviso tipo="info">
                {datos.representados.some((m: any) => m.inscripciones?.some((i: any) => i.estado !== 'retirada'))
                  ? 'Las inscripciones están cerradas. Si te falta, todavía puedes reportar el pago.'
                  : 'Las inscripciones abrirán pronto. Ya puedes dejar lista la ficha de tu hijo/a.'}
              </Aviso>
            )}
            {!torneo && <Aviso tipo="info">No hay un torneo en organización por ahora.</Aviso>}
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '28px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['/torneo/inscripcion', '🎄 Mi inscripción'], ['/torneo/mis-partidos', '📋 Mis partidos']].map(([href, texto]) => (
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

// --- Mis representados, con sus inscripciones y pagos ---

function MisRepresentados({ datos, onCambio, onEditar }: { datos: Datos; onCambio: () => Promise<void>; onEditar: (r: Representado) => void }) {
  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const torneo = datos.torneo
  return (
    <div style={seccion}>
      <h2 style={tituloSeccion}>Mis representados</h2>
      {datos.representados.length === 0 && (
        <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Todavía no has registrado a ningún niño o niña. La ficha queda guardada para próximos torneos.</p>
      )}
      {datos.representados.map((r) => (
        <div key={r.id} style={tarjeta}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: 'var(--color-ink)' }}>{r.nombre} {r.apellido}</strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#666' }}>
                {ETIQUETA_GENERO_MENOR[r.genero]} · nació el {fecha(r.fecha_nacimiento)}
                {torneo && ` · ${edadAlCorte(r.fecha_nacimiento, torneo)} años al corte`}
              </p>
            </div>
            <button onClick={() => onEditar(r)} style={{ ...botonSecundario, padding: '5px 10px', fontSize: '12px' }}>Editar ficha</button>
          </div>

          {(r.inscripciones || []).map((ins) => {
            const color = COLOR_ESTADO[ins.estado]
            const pagoVivo = ins.pagos.length > 0
            return (
              <div key={ins.id} style={{ borderTop: '1px dashed #e2e2e2', marginTop: '10px', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>{ins.categoria.nombre}{ins.certificada && <span style={{ color: '#1e6b34', fontWeight: 400 }}> · categoría certificada</span>}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: color.fondo, color: color.texto }}>{color.etiqueta}</span>
                </div>
                {ins.pendientes.length > 0 && (
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '13px', color: '#8a5a00' }}>
                    {ins.pendientes.map((p) => <li key={`${p.tipo}-${p.jugadorId}`}>{p.texto}</li>)}
                  </ul>
                )}
                {ins.pagos.map((p) => (
                  <div key={p.id} style={{ fontSize: '13px', padding: '6px 0' }}>
                    <strong>{formatearBs(p.monto)}</strong> · {ETIQUETA_TIPO_PAGO[p.tipo_pago as keyof typeof ETIQUETA_TIPO_PAGO] || p.tipo_pago} · {fecha(p.fecha)}
                    <span style={{ marginLeft: '6px', fontWeight: 700, color: p.validado ? '#1e6b34' : '#8a5a00' }}>{p.validado ? '✓ Validado' : 'Por validar'}</span>
                  </div>
                ))}
                {ins.estado !== 'retirada' && !pagoVivo && torneo && (
                  pagandoId === ins.id ? (
                    <FormPagoTorneo
                      inscripcionId={ins.id}
                      montoEur={torneo.monto_inscripcion_eur}
                      etiquetaMonto="por niño"
                      onCancelar={() => setPagandoId(null)}
                      onListo={async () => {
                        setPagandoId(null)
                        await onCambio()
                      }}
                    />
                  ) : (
                    <button onClick={() => setPagandoId(ins.id)} style={{ ...botonPrincipal(false), marginTop: '8px' }}>💳 Reportar el pago</button>
                  )
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// --- Ficha del menor (nueva o editar) ---

function FormFicha({ ficha, onCancelar, onListo }: { ficha: Representado | null; onCancelar: () => void; onListo: () => Promise<void> }) {
  const [f, setF] = useState({
    nombre: ficha?.nombre || '',
    apellido: ficha?.apellido || '',
    fecha_nacimiento: ficha?.fecha_nacimiento || '',
    genero: ficha?.genero || '',
    numero_accion: ficha?.numero_accion || '',
    parentesco: ficha?.parentesco || '',
    emergencia_nombre: ficha?.emergencia_nombre || '',
    emergencia_telefono: ficha?.emergencia_telefono || '',
  })
  const [autorizacion, setAutorizacion] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) })

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      await postJson('/api/jugador/torneo/infantil/representado', { ...f, id: ficha?.id, autorizacionParticipacion: ficha ? undefined : autorizacion })
      await onListo()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ ...tarjeta, marginTop: '12px', background: 'rgba(28,126,196,0.05)' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: 'var(--color-ink)' }}>{ficha ? `Ficha de ${ficha.nombre}` : 'Nuevo niño o niña'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        <div><label style={labelStyle}>Nombre</label><input required maxLength={60} {...campo('nombre')} style={inputStyle} /></div>
        <div><label style={labelStyle}>Apellido</label><input required maxLength={60} {...campo('apellido')} style={inputStyle} /></div>
        <div><label style={labelStyle}>Fecha de nacimiento</label><input type="date" required max={hoyEnCaracas()} {...campo('fecha_nacimiento')} style={inputStyle} /></div>
        <div>
          <label style={labelStyle}>Niño o niña</label>
          <select required {...campo('genero')} style={inputStyle}>
            <option value="">Elige…</option>
            <option value="caballeros">Niño</option>
            <option value="damas">Niña</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Tu parentesco</label>
          <select required {...campo('parentesco')} style={inputStyle}>
            <option value="">Elige…</option>
            {PARENTESCOS.map((p) => <option key={p} value={p}>{ETIQUETA_PARENTESCO[p]}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>N.º de acción del socio (sin acción entra como invitado, si el admin lo autoriza)</label><input {...campo('numero_accion')} style={inputStyle} /></div>
      </div>
      <p style={{ ...labelStyle, margin: '14px 0 6px 0' }}>Contacto de emergencia</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        <input required placeholder="Nombre" {...campo('emergencia_nombre')} style={inputStyle} />
        <input required type="tel" placeholder="Teléfono" {...campo('emergencia_telefono')} style={inputStyle} />
      </div>
      <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 0 0' }}>No pedimos ni guardamos datos médicos. Solo el club ve esta ficha; en grupos y llaves aparece como “{f.nombre.trim() || 'Nombre'} {f.apellido.trim().charAt(0).toUpperCase() || 'A'}.”.</p>
      {!ficha && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', marginTop: '12px' }}>
          <input type="checkbox" required checked={autorizacion} onChange={(e) => setAutorizacion(e.target.checked)} style={{ marginTop: '3px' }} />
          <span>Soy su representante y lo/la autorizo a participar en las actividades de tenis del club.</span>
        </label>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button type="submit" disabled={enviando} style={botonPrincipal(enviando)}>{enviando ? 'Guardando…' : 'Guardar ficha'}</button>
        <button type="button" onClick={onCancelar} style={{ padding: '12px 16px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
      </div>
    </form>
  )
}

// --- Inscribir a un representado ---

function FormInscribir({ datos, onCambio }: { datos: Datos; onCambio: () => Promise<void> }) {
  const torneo = datos.torneo!
  const categorias = datos.categorias || []
  const [menorId, setMenorId] = useState(datos.representados[0]?.id || '')
  const [categoriaId, setCategoriaId] = useState('')
  const [participacion, setParticipacion] = useState(false)
  const [imagen, setImagen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const menor = datos.representados.find((r) => r.id === menorId)
  const edad = menor ? edadAlCorte(menor.fecha_nacimiento, torneo) : null
  const vivas = (menor?.inscripciones || []).filter((i) => i.estado !== 'retirada')
  const posibles = useMemo(() => (menor && edad !== null ? categoriasParaMenor(edad, menor.genero, categorias) : []), [menor, edad, categorias])
  const sugerida = menor && edad !== null ? categoriaSugerida(edad, menor.genero, categorias) : null

  // Al cambiar de niño, preselecciona la sugerida (si sigue disponible).
  useEffect(() => {
    const yaEn = new Set(vivas.map((i) => i.categoria.id))
    setCategoriaId(sugerida && !yaEn.has(sugerida.id) && categoriaAbierta(torneo.estado, sugerida) && sugerida.ocupados < sugerida.cupo ? sugerida.id : '')
    setImagen(!!menor?.autorizacion_imagen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menorId])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    setOk('')
    try {
      await postJson('/api/jugador/torneo/infantil/inscribir', { menorId, categoriaId, autorizacionParticipacion: participacion, autorizacionImagen: imagen })
      setOk(`¡${menor?.nombre} quedó inscrito! Ahora reporta el pago; el admin certificará la categoría.`)
      setParticipacion(false)
      setCategoriaId('')
      await onCambio()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const deshabilitado = enviando || !menor || !categoriaId || !participacion

  return (
    <div style={seccion}>
      <h2 style={tituloSeccion}>Inscribir en el torneo</h2>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      <form onSubmit={enviar}>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Niño o niña</label>
          <select value={menorId} onChange={(e) => setMenorId(e.target.value)} style={inputStyle}>
            {datos.representados.map((r) => <option key={r.id} value={r.id}>{r.nombre} {r.apellido}</option>)}
          </select>
          {menor && edad !== null && (
            <p style={{ fontSize: '13px', color: '#555', margin: '6px 0 0 0' }}>
              Tendrá <strong>{edad} años</strong> al {fecha(datos.fechaCorte!)}.
              {sugerida ? <> Categoría sugerida: <strong>{sugerida.nombre}</strong>.</> : ' No hay categorías para su edad en este torneo.'}
            </p>
          )}
        </div>

        {vivas.length >= MAX_CATEGORIAS_POR_JUGADOR ? (
          <Aviso tipo="info">{menor?.nombre} ya está inscrito en {MAX_CATEGORIAS_POR_JUGADOR} categorías, el máximo por niño.</Aviso>
        ) : (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Categoría</label>
              <div style={{ display: 'grid', gap: '8px' }}>
                {categorias.map((c) => {
                  const cerrada = !categoriaAbierta(torneo.estado, c)
                  const motivo = vivas.some((i) => i.categoria.id === c.id)
                    ? 'ya inscrito'
                    : cerrada
                      ? 'Inscripciones próximamente'
                      : !posibles.some((p) => p.id === c.id)
                      ? `de ${c.edad_min} a ${c.edad_max} años${c.genero !== 'abierto' ? `, ${ETIQUETA_GENERO_CATEGORIA_INFANTIL[c.genero].toLowerCase()}` : ''}`
                      : c.ocupados >= c.cupo ? 'sin cupo' : null
                  const sel = categoriaId === c.id
                  return (
                    <label key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '4px', cursor: motivo ? 'default' : 'pointer',
                      border: sel ? '2px solid var(--color-court)' : '1px solid rgba(15,27,38,0.15)', background: motivo ? '#f2f2f2' : 'white', opacity: motivo ? 0.65 : 1,
                    }}>
                      <input type="radio" name="categoria" disabled={!!motivo} checked={sel} onChange={() => setCategoriaId(c.id)} />
                      <span style={{ flex: 1 }}>
                        <strong style={{ fontSize: '14px' }}>{c.nombre}</strong>
                        {sugerida?.id === c.id && <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--color-court)' }}>SUGERIDA</span>}
                        <span style={{ display: 'block', fontSize: '12px', color: '#666' }}>
                          {c.edad_min}–{c.edad_max} años · {ETIQUETA_GENERO_CATEGORIA_INFANTIL[c.genero] || c.genero}{!cerrada && ` · ${c.cupo - c.ocupados} de ${c.cupo} cupos`}
                          {motivo && ` · ${motivo}`}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div style={{ ...tarjeta, background: '#fffdf5' }}>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px' }}>
                <input type="checkbox" checked={participacion} onChange={(e) => setParticipacion(e.target.checked)} style={{ marginTop: '3px' }} />
                <span><strong>Autorización de participación (obligatoria).</strong> Como su representante, autorizo a {menor?.nombre || 'mi representado/a'} a participar en el {torneo.nombre}.</span>
              </label>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', marginTop: '12px' }}>
                <input type="checkbox" checked={imagen} onChange={(e) => setImagen(e.target.checked)} style={{ marginTop: '3px' }} />
                <span><strong>Autorización de uso de imagen (opcional).</strong> El club puede publicar fotos y videos donde aparezca durante el torneo.</span>
              </label>
            </div>

            {error && <Aviso tipo="error">{error}</Aviso>}
            <button type="submit" disabled={deshabilitado} style={botonPrincipal(deshabilitado)}>
              {enviando ? 'Inscribiendo…' : 'Inscribir'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
