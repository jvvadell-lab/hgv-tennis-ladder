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
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (!session || session.role !== 'jugador') return
    fetch('/api/jugador/mis-pagos')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setPagos(data.pagos || [])
          setTemporadaPagos(data.temporada || null)
        }
      })
      .finally(() => setLoadingPagos(false))
  }, [session])

  useEffect(() => {
    if (!session || session.role !== 'jugador') return
    supabase
      .from('jugadores')
      .select('nombre, email, telefono, numero_accion, categoria, genero')
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
        }
        setLoading(false)
      })
  }, [session])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setMensaje('')
    try {
      const res = await fetch('/api/jugador/editar-perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      setMensaje('✅ Datos actualizados correctamente.')
      setForm({ ...form, pin: '' })
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
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '18px', margin: '0 0 4px 0' }}>
            💳 Mis pagos
          </h2>
          {temporadaPagos && (
            <p style={{ fontSize: '12px', color: 'var(--color-line)', margin: '0 0 12px 0' }}>
              Temporada: {temporadaPagos.nombre}
            </p>
          )}
          {loadingPagos ? (
            <p className="loading-row" style={{ fontSize: '13px', color: 'var(--color-line)' }}><span className="spinner" /> Cargando…</p>
          ) : !temporadaPagos ? (
            <p style={{ fontSize: '13px', color: 'var(--color-line)' }}>No hay una temporada activa en este momento.</p>
          ) : pagos.length === 0 ? (
            <div style={{ background: 'rgba(197,60,50,0.08)', color: '#a83226', padding: '12px', borderRadius: '4px', fontSize: '13px' }}>
              ⚠️ Todavía no tienes un pago registrado en esta temporada. Sin un pago, no puedes ser incluido en el sorteo — habla con un administrador.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pagos.map((p) => (
                <div key={p.id} style={{
                  background: 'rgba(47,82,51,0.06)', border: '1px solid rgba(47,82,51,0.15)',
                  borderRadius: '4px', padding: '10px 14px', fontSize: '13px', color: 'var(--color-ink)',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>Recibo #{p.numero_recibo}</span>
                  {' — '}Bs. {Number(p.monto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {p.tipo_pago.replace('_', ' ')} · {p.fecha}
                  {p.referencia && <> · Ref: {p.referencia}</>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a href="/ladder" style={{ color: 'var(--color-line)', textDecoration: 'none', fontSize: '13px' }}>
            ← Volver a la escalera
          </a>
        </div>
      </div>
    </main>
  )
}
