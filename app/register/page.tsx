'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

// Convierte "juan garcía" o "JUAN GARCÍA" a "Juan García"
function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Da formato (XXX)-XXX-XXXX a los 10 dígitos del teléfono, mientras se escribe
function formatTelefonoLocal(digits: string) {
  const d = digits.replace(/\D/g, '').slice(0, 10)
  const area = d.slice(0, 3)
  const medio = d.slice(3, 6)
  const final = d.slice(6, 10)
  let out = ''
  if (area) out += `(${area}`
  if (area.length === 3) out += ')'
  if (medio) out += `-${medio}`
  if (final) out += `-${final}`
  return out
}

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    categoria: '',
    genero: '',
    pin: '',
    numeroAccion: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const { error } = await supabase
        .from('jugadores')
        .insert([{
          nombre: toTitleCase(formData.name.trim()),
          email: formData.email.trim().toLowerCase(),
          telefono: `+58 ${formatTelefonoLocal(formData.phone)}`,
          categoria: formData.categoria,
          genero: formData.genero,
          pin: formData.pin,
          numero_accion: formData.numeroAccion,
          activo: true
        }])

      if (error) throw error

      setMessage('✅ ¡Registro exitoso! Ya puedes iniciar sesión con tu email y PIN')
      setFormData({ name: '', email: '', phone: '', categoria: '', genero: '', pin: '', numeroAccion: '' })
    } catch (err: any) {
      setError('❌ Error al registrar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="court-bg" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--color-chalk)',
        borderRadius: '4px',
        borderTop: '3px solid var(--color-ball)',
        padding: '40px',
        width: '100%',
        maxWidth: '500px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <img
            src="/logo-hgv.png"
            alt="Escudo HGV Tennis Club"
            style={{ width: '68px', height: '68px', objectFit: 'contain', margin: '0 auto 12px auto', display: 'block' }}
          />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            color: 'var(--color-ink)',
            fontSize: '28px',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            HGV Tennis Club
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-court)',
            fontSize: '12px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginTop: '8px',
          }}>
            Registro de jugador
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Nombre completo *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Ej: Juan García"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Email *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="Ej: juan@email.com"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Teléfono *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                ...inputStyle,
                width: 'auto',
                flex: '0 0 auto',
                background: '#f0f0f0',
                color: 'var(--color-line)',
                textAlign: 'center',
                fontWeight: 600,
              }}>
                +58
              </span>
              <input
                type="tel"
                required
                inputMode="numeric"
                value={formatTelefonoLocal(formData.phone)}
                onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                placeholder="(xxx)-XXX-XXXX"
                maxLength={14}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Número de acción (socio) *</label>
            <input
              type="text"
              required
              value={formData.numeroAccion}
              onChange={(e) => setFormData({...formData, numeroAccion: e.target.value})}
              placeholder="Ej: 1234"
              style={inputStyle}
            />
            <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '4px' }}>
              La escalera es exclusiva para socios del club — se validará tu número de acción.
            </p>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Género *</label>
            <select
              required
              value={formData.genero}
              onChange={(e) => setFormData({...formData, genero: e.target.value})}
              style={{ ...inputStyle, background: 'white' }}
            >
              <option value="">-- Selecciona tu género --</option>
              <option value="caballeros">Caballeros</option>
              <option value="damas">Damas</option>
            </select>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Crea un PIN de 4 dígitos *</label>
            <input
              type="password"
              required
              maxLength={4}
              pattern="[0-9]{4}"
              inputMode="numeric"
              value={formData.pin}
              onChange={(e) => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})}
              placeholder="····"
              title="El PIN debe tener exactamente 4 dígitos"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', letterSpacing: '0.3em' }}
            />
            <p style={{ fontSize: '12px', color: 'var(--color-line)', marginTop: '4px' }}>
              Lo usarás junto con tu email para iniciar sesión y gestionar tus retos.
            </p>
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={labelStyle}>Categoría *</label>
            <select
              required
              value={formData.categoria}
              onChange={(e) => setFormData({...formData, categoria: e.target.value})}
              style={{ ...inputStyle, background: 'white' }}
            >
              <option value="">-- Selecciona tu categoría --</option>
              <option value="sexta_novatos">Sexta Novato</option>
              <option value="sexta">Sexta</option>
              <option value="quinta">Quinta</option>
              <option value="cuarta">Cuarta</option>
            </select>
          </div>

          {message && (
            <div style={{
              background: 'rgba(47,82,51,0.1)', color: 'var(--color-net)',
              padding: '12px', borderRadius: '4px', marginBottom: '18px', textAlign: 'center', fontSize: '14px'
            }}>
              {message}
            </div>
          )}
          {error && (
            <div style={{
              background: 'rgba(197,60,50,0.1)', color: '#a83226',
              padding: '12px', borderRadius: '4px', marginBottom: '18px', textAlign: 'center', fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#ccc' : 'var(--color-ball)',
              color: 'var(--color-ink)',
              border: 'none',
              borderRadius: '4px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Registrando…' : 'Registrarme'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a href="/" style={{ color: 'var(--color-line)', textDecoration: 'none', fontSize: '13px' }}>
            ← Volver al inicio
          </a>
        </div>
      </div>
    </div>
  )
}
