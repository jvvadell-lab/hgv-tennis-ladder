'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    categoria: '',
    genero: ''
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
        .from('players')
        .insert([{
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          categoria: formData.categoria,
          genero: formData.genero
        }])

      if (error) throw error

      setMessage('✅ ¡Registro exitoso! Bienvenido al Club HGV Tennis')
      setFormData({ name: '', email: '', phone: '', categoria: '', genero: '' })
    } catch (err: any) {
      setError('❌ Error al registrar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a472a 0%, #2d5a27 50%, #1a472a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        width: '100%',
        maxWidth: '500px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ color: '#1a472a', fontSize: '28px', fontWeight: 'bold' }}>
            🎾 HGV Tennis Club
          </h1>
          <h2 style={{ color: '#555', fontSize: '18px', marginTop: '8px' }}>
            Registro de Jugador
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nombre */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
              👤 Nombre Completo *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Ej: Juan García"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
              📧 Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="Ej: juan@email.com"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Teléfono */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
              📱 Teléfono *
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              placeholder="Ej: +34 612 345 678"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Género */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
              👥 Género *
            </label>
            <select
              required
              value={formData.genero}
              onChange={(e) => setFormData({...formData, genero: e.target.value})}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                background: 'white'
              }}
            >
              <option value="">-- Selecciona tu género --</option>
              <option value="Masculino">♂️ Masculino</option>
              <option value="Femenino">♀️ Femenino</option>
            </select>
          </div>

          {/* Categoría */}
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
              🏆 Categoría *
            </label>
            <select
              required
              value={formData.categoria}
              onChange={(e) => setFormData({...formData, categoria: e.target.value})}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                background: 'white'
              }}
            >
              <option value="">-- Selecciona tu categoría --</option>
              <option value="Sexta Novato">🥉 Sexta Novato</option>
              <option value="Sexta">🎾 Sexta</option>
              <option value="Quinta">🥈 Quinta</option>
              <option value="Cuarta">🥇 Cuarta</option>
            </select>
          </div>

          {/* Mensajes */}
          {message && (
            <div style={{
              background: '#d4edda',
              color: '#155724',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}
          {error && (
            <div style={{
              background: '#f8d7da',
              color: '#721c24',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#ccc' : '#1a472a',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Registrando...' : '✅ Registrarme'}
          </button>
        </form>

        {/* Volver */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a href="/" style={{ color: '#1a472a', textDecoration: 'none', fontSize: '14px' }}>
            ← Volver al inicio
          </a>
        </div>
      </div>
    </div>
  )
}