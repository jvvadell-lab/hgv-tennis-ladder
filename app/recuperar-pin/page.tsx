'use client'
import { useState } from 'react'

export default function RecuperarPinPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const res = await fetch('/api/recuperar-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al procesar la solicitud')
      setEnviado(true)
    } catch (err: any) {
      setError('❌ ' + err.message)
    } finally {
      setEnviando(false)
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
            style={{ width: '94px', height: '94px', objectFit: 'contain', margin: '0 auto 14px auto', display: 'block' }}
          />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            color: 'var(--color-ink)',
            fontSize: '26px',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            Recuperar PIN
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-court)',
            fontSize: '12px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginTop: '8px',
          }}>
            HGV Tennis Club
          </p>
        </div>

        {enviado ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '15px', color: 'var(--color-ink)', marginBottom: '18px' }}>
              ✅ Si ese correo está registrado, te acabamos de enviar un PIN nuevo. Revisa tu bandeja de entrada (y la de spam, por si acaso).
            </p>
            <a href="/login" style={{
              display: 'inline-block', color: 'var(--color-chalk)', fontSize: '15px', fontWeight: 700,
              fontFamily: 'var(--font-body)', textDecoration: 'none', background: 'var(--color-court)',
              borderRadius: '4px', padding: '12px 26px',
            }}>
              Ir a Iniciar sesión
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: '13px', color: 'var(--color-line)', marginBottom: '18px' }}>
              Escribe el correo con el que te registraste — te enviamos un PIN nuevo para que puedas entrar de nuevo.
            </p>

            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', color: 'var(--color-ink)', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                style={{
                  width: '100%', padding: '12px', borderRadius: '4px',
                  border: '1px solid rgba(15,27,38,0.2)', fontSize: '15px', boxSizing: 'border-box',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px',
                background: 'rgba(197,60,50,0.1)', color: '#a83226', textAlign: 'center'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              style={{
                width: '100%', padding: '14px',
                background: enviando ? '#ccc' : 'var(--color-ball)',
                color: 'var(--color-ink)', border: 'none', borderRadius: '4px',
                fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-body)',
                cursor: enviando ? 'not-allowed' : 'pointer'
              }}
            >
              {enviando ? 'Enviando…' : 'Enviar PIN nuevo'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <a href="/login" style={{
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
            ← Volver a Iniciar sesión
          </a>
        </div>
      </div>
    </main>
  )
}
