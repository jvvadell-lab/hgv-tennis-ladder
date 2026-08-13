'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Session = {
  role: 'admin' | 'jugador'
  id: string
  nombre: string
  categoria?: string
  genero?: string
} | null

const CATEGORIAS: Record<string, string> = {
  sexta_novatos: 'Sexta Novato',
  sexta: 'Sexta',
  quinta: 'Quinta',
  cuarta: 'Cuarta',
}
const GENEROS: Record<string, string> = {
  caballeros: 'Caballeros',
  damas: 'Damas',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  border: '1px solid rgba(15,27,38,0.2)',
  borderRadius: '4px',
  fontSize: '15px',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-body)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: 600,
  color: 'var(--color-ink)',
  fontSize: '14px',
}

export default function PerfilPage() {
  const [session, setSession] = useState<Session>(null)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', numeroAccion: '', pin: '' })
  const [categoria, setCategoria] = useState('')
  const [genero, setGenero] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [pagos, setPagos] = useState<any[]>([])
  const [temporadaPagos, setTemporadaPagos] = useState<any>(null)
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [mostrarFormPago, setMostrarFormPago] = useState(false)
  const [reporteTipo, setReporteTipo] = useState('pago_movil')
  const [reporteMonto, setReporteMonto] = useState('')
  const [reporteFecha, setReporteFecha] = useState(new Date().toISOString().slice(0, 10))
  const [reporteReferencia, setReporteReferencia] = useState('')
  const [reportandoPago, setReportandoPago] = useState(false)
  const [reportePagoMsg, setReportePagoMsg] = useState('')
  const [trayectoria, setTrayectoria] = useState<any>(null)
  const [loadingTrayectoria, setLoadingTrayectoria] = useState(true)
  const [panelAbierto, setPanelAbierto] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [tasaBcv, setTasaBcv] = useState<{ valor: number; fecha: string } | null>(null)
  const [standbyActual, setStandbyActual] = useState<{ dias: number; fecha_inicio: string; fecha_fin: string } | null>(null)
  const [permisoMedico, setPermisoMedico] = useState<{ estado: string; dias: number | null; fecha_inicio: string | null; fecha_fin: string | null } | null>(null)
  const [loadingPermisoMedico, setLoadingPermisoMedico] = useState(true)
  const [informeArchivo, setInformeArchivo] = useState<File | null>(null)
  const [motivoPermiso, setMotivoPermiso] = useState('')
  const [enviandoPermiso, setEnviandoPermiso] = useState(false)
  const [permisoMedicoMsg, setPermisoMedicoMsg] = useState('')
  const [loadingStandby, setLoadingStandby] = useState(true)
  const [activandoStandby, setActivandoStandby] = useState<number | null>(null)
  const [standbyMsg, setStandbyMsg] = useState('')
  const [temporadaSorteada, setTemporadaSorteada] = useState(false)

  const [fotoCarnetActual, setFotoCarnetActual] = useState<string | null>(null)
  const [fotoCarnetArchivo, setFotoCarnetArchivo] = useState<File | null>(null)
  const [previewCarnet, setPreviewCarnet] = useState<string | null>(null)
  const [fotoCarnetError, setFotoCarnetError] = useState('')

  // Formatos que aceptamos para la foto del carné, y tamaño máximo del archivo.
  const FORMATOS_CARNET_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp']
  const TAMANO_MAXIMO_CARNET_MB = 5

  const handleFotoCarnet = (file: File | null) => {
    setFotoCarnetError('')
    if (file && !FORMATOS_CARNET_ACEPTADOS.includes(file.type)) {
      setFotoCarnetError('❌ Formato no soportado — usa JPG, PNG o WEBP.')
      return
    }
    if (file && file.size > TAMANO_MAXIMO_CARNET_MB * 1024 * 1024) {
      setFotoCarnetError(`❌ La foto pesa demasiado — el máximo es ${TAMANO_MAXIMO_CARNET_MB}MB.`)
      return
    }
    setFotoCarnetArchivo(file)
    if (previewCarnet) URL.revokeObjectURL(previewCarnet)
    setPreviewCarnet(file ? URL.createObjectURL(file) : null)
  }

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .finally(() => setChecking(false))
  }, [])

  const reportarPago = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reporteMonto) {
      setReportePagoMsg('❌ Escribe el monto')
      return
    }

    setReportandoPago(true)
    setReportePagoMsg('')
    try {
      const res = await fetch('/api/jugador/reportar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoPago: reporteTipo,
          monto: reporteMonto,
          fecha: reporteFecha,
          referencia: reporteReferencia,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al reportar el pago')

      setReportePagoMsg(`✅ Pago reportado — recibo #${data.numeroRecibo}. Un administrador lo va a validar pronto.`)
      setReporteMonto('')
      setReporteReferencia('')
      setMostrarFormPago(false)
      cargarMisPagos()
    } catch (err: any) {
      setReportePagoMsg('❌ ' + err.message)
    } finally {
      setReportandoPago(false)
    }
  }

  const cargarMisPagos = () => {
    fetch('/api/jugador/mis-pagos')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setPagos(data.pagos || [])
          setTemporadaPagos(data.temporada || null)
        }
      })
      .finally(() => setLoadingPagos(false))
  }

  useEffect(() => {
    if (!session || session.role !== 'jugador' || !temporadaPagos?.id) return
    setLoadingStandby(true)
    supabase
      .from('standby')
      .select('dias, fecha_inicio, fecha_fin')
      .eq('jugador_id', session.id)
      .eq('temporada_id', temporadaPagos.id)
      .maybeSingle()
      .then(({ data }) => {
        setStandbyActual(data || null)
        setLoadingStandby(false)
      })
    supabase
      .from('temporadas')
      .select('sorteo_realizado')
      .eq('id', temporadaPagos.id)
      .maybeSingle()
      .then(({ data }) => setTemporadaSorteada(!!data?.sorteo_realizado))
    setLoadingPermisoMedico(true)
    supabase
      .from('permisos_medicos')
      .select('estado, dias, fecha_inicio, fecha_fin')
      .eq('jugador_id', session.id)
      .eq('temporada_id', temporadaPagos.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setPermisoMedico(data || null)
        setLoadingPermisoMedico(false)
      })
  }, [session, temporadaPagos])

  const solicitarPermisoMedico = async () => {
    setEnviandoPermiso(true)
    setPermisoMedicoMsg('')
    try {
      let informeUrl: string | null = null
      if (informeArchivo) {
        const extension = informeArchivo.name.split('.').pop() || 'jpg'
        const nombreArchivo = `informes-medicos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
        const { error: errorSubida } = await supabase.storage
          .from('fotos-partidos')
          .upload(nombreArchivo, informeArchivo)
        if (errorSubida) throw new Error('No se pudo subir el informe: ' + errorSubida.message)

        const { data: publicUrlData } = supabase.storage
          .from('fotos-partidos')
          .getPublicUrl(nombreArchivo)
        informeUrl = publicUrlData.publicUrl
      }

      const res = await fetch('/api/jugador/solicitar-permiso-medico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informeUrl, motivo: motivoPermiso }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar la solicitud')

      setPermisoMedico({ estado: 'pendiente', dias: null, fecha_inicio: null, fecha_fin: null })
      setInformeArchivo(null)
      setMotivoPermiso('')
    } catch (err: any) {
      setPermisoMedicoMsg('❌ ' + err.message)
    } finally {
      setEnviandoPermiso(false)
    }
  }

  const activarStandby = async (dias: number) => {
    setActivandoStandby(dias)
    setStandbyMsg('')
    try {
      const res = await fetch('/api/jugador/activar-standby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al activar el standby')
      setStandbyActual({ dias, fecha_inicio: data.fechaInicio, fecha_fin: data.fechaFin })
    } catch (err: any) {
      setStandbyMsg('❌ ' + err.message)
    } finally {
      setActivandoStandby(null)
    }
  }

  useEffect(() => {
    if (!session || session.role !== 'jugador') return
    cargarMisPagos()
    supabase
      .from('tasa_bcv')
      .select('valor, fecha')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTasaBcv(data)
      })
  }, [session])

  useEffect(() => {
    if (!session || session.role !== 'jugador') return
    fetch('/api/jugador/mi-trayectoria')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setTrayectoria(data.trayectoria)
      })
      .finally(() => setLoadingTrayectoria(false))
  }, [session])

  useEffect(() => {
    if (!session || session.role !== 'jugador') return
    supabase
      .from('jugadores')
      .select('nombre, email, telefono, numero_accion, categoria, genero, foto_carnet_url')
      .eq('id', session.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setForm({
            nombre: data.nombre || '',
            email: data.email || '',
            telefono: data.telefono || '',
            numeroAccion: data.numero_accion || '',
            pin: '',
          })
          setCategoria(data.categoria || '')
          setGenero(data.genero || '')
          setFotoCarnetActual(data.foto_carnet_url || null)
        }
        setLoading(false)
      })
  }, [session])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setMensaje('')
    try {
      // Si el jugador eligió una foto nueva de carné, la subimos primero al mismo
      // bucket que usa el registro ("fotos-partidos/carnets/") y mandamos la URL.
      let fotoCarnetUrl: string | null = null
      if (fotoCarnetArchivo) {
        const extension = fotoCarnetArchivo.name.split('.').pop() || 'jpg'
        const nombreArchivo = `carnets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
        const { error: errorSubida } = await supabase.storage
          .from('fotos-partidos')
          .upload(nombreArchivo, fotoCarnetArchivo)
        if (errorSubida) throw new Error('No se pudo subir la foto del carné: ' + errorSubida.message)

        const { data: publicUrlData } = supabase.storage
          .from('fotos-partidos')
          .getPublicUrl(nombreArchivo)
        fotoCarnetUrl = publicUrlData.publicUrl
      }

      const res = await fetch('/api/jugador/editar-perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, fotoCarnetUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      setMensaje('✅ Datos actualizados correctamente.')
      setForm({ ...form, pin: '' })
      if (fotoCarnetUrl) {
        setFotoCarnetActual(fotoCarnetUrl)
        handleFotoCarnet(null)
      }
    } catch (err: any) {
      setMensaje('❌ ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (checking || (session && loading)) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-chalk)' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando…</p>
      </main>
    )
  }

  if (!session || session.role !== 'jugador') {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-chalk)', marginBottom: '16px' }}>Debes iniciar sesión como jugador para ver tu perfil.</p>
        <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Iniciar sesión</a>
      </main>
    )
  }

  return (
    <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{
        background: 'var(--color-chalk)',
        borderRadius: '4px',
        borderTop: '3px solid var(--color-ball)',
        padding: '40px',
        width: '100%',
        maxWidth: '460px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <img src="/logo-hgv.png" alt="Escudo HGV" style={{ width: '78px', height: '78px', objectFit: 'contain', margin: '0 auto 10px auto', display: 'block' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '26px', margin: 0 }}>
            Mi Perfil
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-court)', fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '8px' }}>
            {CATEGORIAS[categoria] || categoria} — {GENEROS[genero] || genero}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '4px' }}>
            La categoría y el género solo puede cambiarlos un administrador.
          </p>
          <a href="/reservas" style={{
            display: 'inline-block', marginTop: '16px', color: 'var(--color-ink)', fontSize: '14px', fontWeight: 700,
            fontFamily: 'var(--font-body)', textDecoration: 'none', border: '1px solid var(--color-court)',
            borderRadius: '4px', padding: '9px 20px',
          }}>
            🎾 Reservar cancha
          </a>
        </div>

        <form onSubmit={guardar}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Nombre completo *</label>
            <input
              type="text"
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Teléfono</label>
            <input
              type="tel"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Número de acción (socio)</label>
            <input
              type="text"
              value={form.numeroAccion}
              onChange={(e) => setForm({ ...form, numeroAccion: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Foto de tu carné de socio</label>
            {fotoCarnetActual && !previewCarnet && (
              <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src={fotoCarnetActual}
                  alt="Carné actual"
                  style={{ width: '70px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.15)' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--color-line)' }}>Ya tienes una foto guardada — sube otra para reemplazarla.</span>
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleFotoCarnet(e.target.files?.[0] || null)}
              style={{ ...inputStyle, padding: '8px', background: 'white' }}
            />
            <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '4px' }}>
              {fotoCarnetActual ? 'Formatos' : 'Súbela y te ahorras mostrar el carné físico cuando vayas a jugar. Formatos'} JPG, PNG o WEBP, máximo {TAMANO_MAXIMO_CARNET_MB}MB.
            </p>
            {fotoCarnetError && (
              <p style={{ fontSize: '12px', color: '#a83226', marginTop: '4px' }}>{fotoCarnetError}</p>
            )}
            {previewCarnet && (
              <img
                src={previewCarnet}
                alt="Vista previa del nuevo carné"
                style={{ marginTop: '10px', maxWidth: '160px', maxHeight: '110px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.15)' }}
              />
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Nuevo PIN (opcional)</label>
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              placeholder="Déjalo en blanco para no cambiarlo"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', letterSpacing: '0.3em' }}
            />
          </div>

          {mensaje && (
            <div style={{
              padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px', textAlign: 'center',
              background: mensaje.includes('✅') ? 'rgba(47,82,51,0.1)' : 'rgba(197,60,50,0.1)',
              color: mensaje.includes('✅') ? 'var(--color-net)' : '#a83226',
            }}>
              {mensaje}
            </div>
          )}

          <button
            type="submit"
            disabled={guardando}
            style={{
              width: '100%', padding: '14px',
              background: guardando ? '#ccc' : 'var(--color-ball)',
              color: 'var(--color-ink)', border: 'none', borderRadius: '4px',
              fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-body)',
              cursor: guardando ? 'not-allowed' : 'pointer'
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid rgba(15,27,38,0.1)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '18px', margin: '0 0 12px 0' }}>
            🏆 Mi trayectoria en HGV
          </h2>
          {loadingTrayectoria ? (
            <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)' }}><span className="spinner" /> Cargando…</p>
          ) : !trayectoria || trayectoria.jugados === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--color-line)' }}>Todavía no tienes partidos registrados — ¡anímate a retar a alguien!</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                {[
                  { key: 'temporadas', label: 'Temporadas', valor: trayectoria.temporadas },
                  { key: 'jugados', label: 'Jugados', valor: trayectoria.jugados },
                  { key: 'ganados', label: 'Ganados', valor: trayectoria.ganados, color: 'var(--color-net)' },
                  { key: 'perdidos', label: 'Perdidos', valor: trayectoria.perdidos, color: '#a83226' },
                  { key: 'pct', label: '% Victorias', valor: `${trayectoria.porcentajeVictorias}%` },
                  { key: 'mejor', label: 'Mejor posición', valor: trayectoria.mejorPosicion ? `#${trayectoria.mejorPosicion}` : '—' },
                ].map((item) => {
                  const esClicable = item.key === 'temporadas' || item.key === 'ganados'
                  return (
                    <div
                      key={item.label}
                      onClick={() => esClicable && setPanelAbierto(panelAbierto === item.key ? null : item.key)}
                      style={{
                        background: panelAbierto === item.key ? 'rgba(28,126,196,0.14)' : 'rgba(28,126,196,0.06)',
                        border: '1px solid rgba(28,126,196,0.15)',
                        borderRadius: '8px', padding: '10px', textAlign: 'center',
                        cursor: esClicable ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '20px', color: item.color || 'var(--color-ink)' }}>
                        {item.valor}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-line)', marginTop: '2px' }}>
                        {item.label}{esClicable && ' 🔍'}
                      </div>
                    </div>
                  )
                })}
              </div>

              {panelAbierto === 'temporadas' && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {trayectoria.temporadasDetalle.map((t: any, i: number) => (
                    <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '6px', padding: '8px 12px', fontSize: '12px' }}>
                      <strong>{t.nombre}</strong> — {CATEGORIAS[t.categoria] || t.categoria} / {GENEROS[t.genero] || t.genero}
                      <br />
                      <span style={{ color: '#6b6b6b' }}>
                        Posición final #{t.posicion} (inicial #{t.posicionInicial}) · {t.fechaInicio} al {t.fechaFin}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {panelAbierto === 'ganados' && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {trayectoria.partidosGanadosDetalle.map((p: any, i: number) => (
                    <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '6px', padding: '8px 12px', fontSize: '12px' }}>
                      vs <strong>{p.oponente}</strong> — <span style={{ fontFamily: 'var(--font-mono)' }}>{p.marcador}</span>
                      <br />
                      <span style={{ color: '#6b6b6b' }}>{p.temporada} · {p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid rgba(15,27,38,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '18px', margin: 0 }}>
              💳 Mis pagos
            </h2>
            {temporadaPagos && !mostrarFormPago && (
              <button
                onClick={() => setMostrarFormPago(true)}
                style={{
                  background: 'var(--color-ball)', color: 'var(--color-ink)', border: 'none',
                  padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                }}
              >
                ➕ Reportar un pago
              </button>
            )}
          </div>
          {temporadaPagos && (
            <p style={{ fontSize: '12px', color: 'var(--color-line)', margin: '0 0 10px 0' }}>
              Temporada: {temporadaPagos.nombre}
            </p>
          )}

          {temporadaPagos && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div style={{ flex: '1 1 200px', background: '#fff', border: '1px solid rgba(28,126,196,0.25)', borderRadius: '4px', padding: '12px 14px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-ink)', margin: '0 0 4px 0' }}>📱 Datos para Pago Móvil</p>
                <p style={{ fontSize: '13px', color: '#333', margin: 0, lineHeight: 1.6 }}>
                  Yelitza Contreras<br />
                  V-19.523.642<br />
                  0412-7628281<br />
                  Banco BNC
                </p>
              </div>

              {tasaBcv && (
                <div style={{ flex: '1 1 200px', background: '#fff', border: '1px solid rgba(28,126,196,0.3)', borderLeft: '4px solid #1c7ec4', borderRadius: '4px', padding: '12px 14px' }}>
                  <p style={{ fontSize: '13px', color: '#333', margin: 0 }}>
                    💶 Tasa € del día <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {tasaBcv.valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong> según BCV
                    <span style={{ color: '#6b6b6b', fontSize: '11px' }}> — {new Date(tasaBcv.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</span>
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#999' }}>
                    Fuente: <a href="https://www.bcv.org.ve" target="_blank" rel="noopener noreferrer" style={{ color: '#999', textDecoration: 'underline' }}>bcv.org.ve</a>
                  </p>
                </div>
              )}
            </div>
          )}

          {mostrarFormPago && (
            <form onSubmit={reportarPago} style={{ background: 'rgba(28,126,196,0.05)', border: '1px solid rgba(28,126,196,0.15)', borderRadius: '4px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-line)', margin: '0 0 12px 0' }}>
                Reporta tu pago aquí — quedará <strong>pendiente de validación</strong> hasta que un administrador confirme que lo recibió.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: '4px' }}>Tipo de pago</label>
                  <select
                    value={reporteTipo}
                    onChange={(e) => setReporteTipo(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.2)', boxSizing: 'border-box', fontSize: '13px' }}
                  >
                    <option value="pago_movil">Pago móvil</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: '4px' }}>
                    Monto ({reporteTipo === 'efectivo' ? '$' : 'Bs.'})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={reporteMonto}
                    onChange={(e) => setReporteMonto(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.2)', boxSizing: 'border-box', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: '4px' }}>Fecha</label>
                  <input
                    type="date"
                    value={reporteFecha}
                    onChange={(e) => setReporteFecha(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.2)', boxSizing: 'border-box', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', display: 'block', marginBottom: '4px' }}>
                    {reporteTipo === 'efectivo' ? 'Seriales del billete' : 'N° de referencia'}
                  </label>
                  <input
                    type="text"
                    value={reporteReferencia}
                    onChange={(e) => setReporteReferencia(e.target.value)}
                    placeholder="Opcional"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.2)', boxSizing: 'border-box', fontSize: '13px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={reportandoPago}
                  style={{
                    background: reportandoPago ? '#ccc' : 'var(--color-ball)', color: 'var(--color-ink)', border: 'none',
                    padding: '10px 20px', borderRadius: '4px', cursor: reportandoPago ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700,
                  }}
                >
                  {reportandoPago ? 'Enviando…' : 'Enviar reporte'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMostrarFormPago(false); setReportePagoMsg('') }}
                  style={{ background: 'none', border: '1px solid rgba(15,27,38,0.2)', color: 'var(--color-ink)', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {reportePagoMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: '4px', fontSize: '13px', marginBottom: '14px',
              background: reportePagoMsg.includes('✅') ? 'rgba(47,82,51,0.1)' : 'rgba(197,60,50,0.1)',
              color: reportePagoMsg.includes('✅') ? 'var(--color-net)' : '#a83226',
            }}>
              {reportePagoMsg}
            </div>
          )}

          {loadingPagos ? (
            <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)' }}><span className="spinner" /> Cargando…</p>
          ) : !temporadaPagos ? (
            <p style={{ fontSize: '13px', color: 'var(--color-line)' }}>No hay una temporada activa en este momento.</p>
          ) : pagos.length === 0 ? (
            <div style={{ background: 'rgba(197,60,50,0.08)', color: '#a83226', padding: '12px', borderRadius: '4px', fontSize: '13px' }}>
              ⚠️ Todavía no tienes un pago registrado en esta temporada. Sin un pago validado, no puedes ser incluido en el sorteo — repórtalo arriba, o habla con un administrador.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pagos.map((p) => (
                <div key={p.id} style={{
                  background: p.validado ? 'rgba(47,82,51,0.06)' : 'rgba(230,126,34,0.08)',
                  border: p.validado ? '1px solid rgba(47,82,51,0.15)' : '1px solid rgba(230,126,34,0.3)',
                  borderRadius: '4px', padding: '10px 14px', fontSize: '13px', color: 'var(--color-ink)',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>Recibo #{p.numero_recibo}</span>
                  {' — '}{p.tipo_pago === 'efectivo' ? '$' : 'Bs.'} {Number(p.monto).toLocaleString(p.tipo_pago === 'efectivo' ? 'en-US' : 'es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {p.tipo_pago.replace('_', ' ')} · {p.fecha}
                  {p.referencia && <> · Ref: {p.referencia}</>}
                  <br />
                  {p.validado ? (
                    <span style={{ color: 'var(--color-net)', fontWeight: 700, fontSize: '12px' }}>✅ Validado</span>
                  ) : (
                    <span style={{ color: '#e67e22', fontWeight: 700, fontSize: '12px' }}>⏳ Pendiente de validar</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {temporadaPagos && (
          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid rgba(15,27,38,0.1)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '18px', margin: '0 0 8px 0' }}>
              🧳 Modo standby (viaje)
            </h2>
            {loadingStandby ? (
              <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)' }}><span className="spinner" /> Cargando…</p>
            ) : standbyActual ? (
              <div style={{ background: '#fff3cd', border: '1px solid #e67e22', borderRadius: '4px', padding: '12px 14px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#7a4a0e' }}>
                  🧳 Ya usaste tu standby de esta temporada: <strong>{standbyActual.dias} días</strong>, del {new Date(standbyActual.fecha_inicio + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al {new Date(standbyActual.fecha_fin + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}.
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#7a4a0e' }}>
                  Es una única vez por temporada — ya no puedes activarlo de nuevo hasta la próxima.
                </p>
              </div>
            ) : !temporadaSorteada ? (
              <p style={{ fontSize: '13px', color: 'var(--color-line)' }}>
                🔒 El standby se habilita cuando se haga el sorteo de esta temporada — antes de eso nadie puede retarte de todas formas.
              </p>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: 'var(--color-line)', margin: '0 0 10px 0' }}>
                  ¿Te vas de viaje unos días? Activa el standby y no te van a poder retar mientras dure (tampoco podrás retar tú). Solo puedes usarlo <strong>una vez por temporada</strong> — elige bien los días.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => activarStandby(3)}
                    disabled={activandoStandby !== null}
                    style={{
                      background: activandoStandby === 3 ? '#ccc' : 'var(--color-ball)', color: 'var(--color-ink)', border: 'none',
                      padding: '10px 20px', borderRadius: '4px', cursor: activandoStandby !== null ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 700,
                    }}
                  >
                    {activandoStandby === 3 ? 'Activando…' : '3 días'}
                  </button>
                  <button
                    onClick={() => activarStandby(5)}
                    disabled={activandoStandby !== null}
                    style={{
                      background: activandoStandby === 5 ? '#ccc' : 'var(--color-ball)', color: 'var(--color-ink)', border: 'none',
                      padding: '10px 20px', borderRadius: '4px', cursor: activandoStandby !== null ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 700,
                    }}
                  >
                    {activandoStandby === 5 ? 'Activando…' : '5 días'}
                  </button>
                </div>
                {standbyMsg && (
                  <div style={{
                    marginTop: '10px', padding: '10px 12px', borderRadius: '4px', fontSize: '13px',
                    background: standbyMsg.includes('✅') ? 'rgba(47,82,51,0.1)' : 'rgba(197,60,50,0.1)',
                    color: standbyMsg.includes('✅') ? 'var(--color-net)' : '#a83226',
                  }}>
                    {standbyMsg}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {temporadaPagos && (
          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid rgba(15,27,38,0.1)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '18px', margin: '0 0 8px 0' }}>
              🩹 Permiso por lesión
            </h2>
            {loadingPermisoMedico ? (
              <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)' }}><span className="spinner" /> Cargando…</p>
            ) : permisoMedico?.estado === 'pendiente' ? (
              <div style={{ background: '#fff3cd', border: '1px solid #e67e22', borderRadius: '4px', padding: '12px 14px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#7a4a0e' }}>
                  ⏳ Tu solicitud de permiso médico está pendiente de revisión por el admin.
                </p>
              </div>
            ) : permisoMedico?.estado === 'aprobado' && permisoMedico.fecha_fin && new Date().toISOString().slice(0, 10) <= permisoMedico.fecha_fin ? (
              <div style={{ background: '#d1ecf1', border: '1px solid #1c7ec4', borderRadius: '4px', padding: '12px 14px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#0c5460' }}>
                  🩹 Tienes permiso médico activo: <strong>{permisoMedico.dias} días</strong>, hasta el {new Date(permisoMedico.fecha_fin + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}. Tu posición queda congelada mientras dure — no puedes retar ni ser retado.
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: 'var(--color-line)', margin: '0 0 10px 0' }}>
                  Si estás lesionado y el médico te indicó reposo, solicita el permiso aquí — tu posición queda congelada mientras dure (no te pueden retar, y tú tampoco puedes retar). El admin revisa la solicitud y confirma los días.
                </p>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '6px' }}>
                    Informe médico (opcional)
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setInformeArchivo(e.target.files?.[0] || null)}
                    style={{ fontSize: '13px' }}
                  />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '6px' }}>
                    Cuéntanos qué pasó (opcional)
                  </label>
                  <textarea
                    value={motivoPermiso}
                    onChange={(e) => setMotivoPermiso(e.target.value)}
                    placeholder="Ej: me lesioné el tobillo jugando, el médico me mandó 15 días de reposo"
                    rows={3}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid rgba(15,27,38,0.2)',
                      fontSize: '13px', fontFamily: 'var(--font-body)', boxSizing: 'border-box', resize: 'vertical',
                    }}
                  />
                </div>
                <button
                  onClick={solicitarPermisoMedico}
                  disabled={enviandoPermiso}
                  style={{
                    background: enviandoPermiso ? '#ccc' : 'var(--color-ball)', color: 'var(--color-ink)', border: 'none',
                    padding: '10px 20px', borderRadius: '4px', cursor: enviandoPermiso ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 700,
                  }}
                >
                  {enviandoPermiso ? 'Enviando…' : 'Solicitar permiso médico'}
                </button>
                {permisoMedicoMsg && (
                  <div style={{
                    marginTop: '10px', padding: '10px 12px', borderRadius: '4px', fontSize: '13px',
                    background: 'rgba(197,60,50,0.1)', color: '#a83226',
                  }}>
                    {permisoMedicoMsg}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/ladder" style={{
            display: 'inline-block',
            color: 'var(--color-ink)',
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            textDecoration: 'none',
            border: '1px solid var(--color-court)',
            borderRadius: '4px',
            padding: '10px 24px',
          }}>
            🎾 Volver a la escalera
          </a>
          <a href="/galeria" style={{
            display: 'inline-block',
            color: 'var(--color-ink)',
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            textDecoration: 'none',
            border: '1px solid var(--color-court)',
            borderRadius: '4px',
            padding: '10px 24px',
          }}>
            🖼️ Galería
          </a>
        </div>
      </div>
    </main>
  )
}
