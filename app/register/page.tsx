'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://znfsxpmmlxezzeasjtqa.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZnN4cG1tbHhlenplYXNqdHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTY2MTYsImV4cCI6MjA5ODc3MjYxNn0.D1VG1_3adZRcj3Bd19mJJj9lFa3-YytksaULXuWW1Pk'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    category: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          category: formData.category,
        }
      ])

    if (error) {
      setError('Error al registrar: ' + error.message)
    } else {
      setMessage('✅ ¡Registro exitoso! Bienvenido/a a la Escalera Challenger.')
      setFormData({ name: '', email: '', phone: '', category: '' })
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a3a5c 0%, #2d6a4f 100%)',
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
        maxWidth: '480px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ color: '#1a3a5c', fontSize: '28px', fontWeight: 'bold' }}>
            HGV Tennis Club
          </h1>
          <p style={{ color: '#666', marginTop: '8px' }}>
            Registro en la Escalera Challenger
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            ❌ {error}
          </div>
        )}

        {message && (
          <div style={{
            background: '#dcfce7',
            color: '#166534',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', color: '#333' }}>
              Nombre completo *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="Tu nombre completo"
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', color: '#333' }}>
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="tu@email.com"
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', color: '#333' }}>
              Teléfono
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="+34 600 000 000"
            />
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', color: '#333' }}>
              Categoría *
            </label>
            <select
              required
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            >
              <option value="">Selecciona una categoría</option>
              <option value="masculino">🎾 Masculino</option>
              <option value="femenino">🎾 Femenino</option>
              <option value="mixto">🎾 Mixto</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#94a3b8' : '#1a3a5c',
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
      </div>
    </div>
  )
}