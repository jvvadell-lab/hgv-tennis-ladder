'use client'
import { useState } from 'react'

export default function Login() {
  const [formData, setFormData] = useState({
    email: '',
    pin: ''
  })
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
      // Verificar admin por ahora
      if (formData.email === 'admin@hgvtennis.com' && formData.pin === '1234') {
        setMessage('✅ ¡Bienvenido Administrador!')
        setTimeout(() => {
          window.location.href = '/admin'
        }, 1500)
      } else {
        setMessage('❌ Email o PIN incorrecto')
      }
    } catch (error) {
      setMessage('❌ Error al iniciar sesión. Intenta de nuevo.')
    }

    setLoading(false)
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a3a5c 0%, #0d5c2e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      padding: '20px'
    }}>
      {/* Tarjeta del formulario */}
      <div style={{
        background: 'white',
        borderRadius: '15px',
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{
            color: '#1a3a5c',
            fontSize: '1.8rem',
            marginBottom: '5px'
          }}>
            🎾 HGV Tennis Club
          </h1>
          <h2 style={{
            color: '#0d5c2e',
            fontSize: '1.2rem',
            fontWeight: 'normal'
          }}>
            Iniciar Sesión
          </h2>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{
              display: 'block',
              color: '#1a3a5c',
              fontWeight: 'bold',
              marginBottom: '5px'
            }}>
              📧 Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="tu@email.com"
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '2px solid #e0e0e0',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* PIN */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: '#1a3a5c',
              fontWeight: 'bold',
              marginBottom: '5px'
            }}>
              🔐 PIN (4 dígitos)
            </label>
            <input
              type="password"
              name="pin"
              value={formData.pin}
              onChange={handleChange}
              placeholder="****"
              maxLength={4}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '2px solid #e0e0e0',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Mensaje */}
          {message && (
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '15px',
              background: message.includes('✅') ? '#d4edda' : '#f8d7da',
              color: message.includes('✅') ? '#155724' : '#721c24',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}

          {/* Botón Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              background: loading ? '#ccc' : '#FFD700',
              color: '#1a3a5c',
              border: 'none',
              borderRadius: '10px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Entrando...' : '🔐 Iniciar Sesión'}
          </button>
        </form>

        {/* Links */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <p style={{ color: '#666' }}>
            ¿No tienes cuenta?{' '}
            <a href="/register" style={{ color: '#1a3a5c', fontWeight: 'bold' }}>
              Registrarse
            </a>
          </p>
          <a href="/" style={{ color: '#0d5c2e', fontSize: '0.9rem' }}>
            ← Volver al inicio
          </a>
        </div>

        {/* Credenciales de prueba */}
        <div style={{
          marginTop: '20px',
          padding: '12px',
          background: '#f0f8ff',
          borderRadius: '8px',
          border: '1px dashed #1a3a5c'
        }}>
          <p style={{
            color: '#1a3a5c',
            fontSize: '0.85rem',
            textAlign: 'center',
            margin: 0
          }}>
            🔑 <strong>Admin de prueba:</strong><br/>
            Email: admin@hgvtennis.com<br/>
            PIN: 1234
          </p>
        </div>
      </div>
    </main>
  )
}