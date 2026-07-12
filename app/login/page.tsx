'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [formData, setFormData] = useState({ email: '', pin: '' })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, email: formData.email.trim().toLowerCase() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage('❌ ' + (data.error || 'Email o PIN incorrecto'))
        setLoading(false)
        return
      }

      setMessage(`✅ ¡Bienvenido ${data.nombre}!`)
      setTimeout(() => {
        router.push(data.role === 'admin' ? '/admin' : '/ladder')
      }, 1000)
    } catch {
      setMessage('❌ Error al iniciar sesión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <main className="court-bg" style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
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
        maxWidth: '400px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <img
            src="/logo-hgv.png"
            alt="Escudo HGV Tennis Club"
            style={{ width: '72px', height: '72px', objectFit: 'contain', margin: '0 auto 14px auto', display: 'block' }}
          />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            color: 'var(--color-ink)',
            fontSize: '30px',
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
            Iniciar sesión
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--color-ink)', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="tu@email.com"
              required
              style={{
                width: '100%', padding: '12px', borderRadius: '4px',
                border: '1px solid rgba(15,27,38,0.2)', fontSize: '15px', boxSizing: 'border-box',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', color: 'var(--color-ink)', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>
              PIN (4 dígitos)
            </label>
            <input
              type="password"
              name="pin"
              value={formData.pin}
              onChange={handleChange}
              placeholder="····"
              maxLength={4}
              required
              style={{
                width: '100%', padding: '12px', borderRadius: '4px',
                border: '1px solid rgba(15,27,38,0.2)', fontSize: '15px', boxSizing: 'border-box',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.3em',
              }}
            />
          </div>

          {message && (
            <div style={{
              padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px',
              background: message.includes('✅') ? 'rgba(47,82,51,0.1)' : 'rgba(197,60,50,0.1)',
              color: message.includes('✅') ? 'var(--color-net)' : '#a83226',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              background: loading ? '#ccc' : 'var(--color-ball)',
              color: 'var(--color-ink)', border: 'none', borderRadius: '4px',
              fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <p style={{ color: 'var(--color-line)', fontSize: '14px' }}>
            ¿No tienes cuenta?{' '}
            <a href="/register" style={{ color: 'var(--color-court)', fontWeight: 700, textDecoration: 'none' }}>
              Regístrate
            </a>
          </p>
          <a href="/" style={{ color: 'var(--color-line)', fontSize: '13px', textDecoration: 'none' }}>
            ← Volver al inicio
          </a>
        </div>
      </div>
    </main>
  )
}
