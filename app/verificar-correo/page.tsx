'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function VerificarCorreoContenido() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [estado, setEstado] = useState<'verificando' | 'ok' | 'error'>('verificando')
  const [mensaje, setMensaje] = useState('')
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    if (!token) {
      setEstado('error')
      setMensaje('Este enlace de verificación no es válido — falta el token.')
      return
    }

    fetch('/api/verificar-correo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'No se pudo verificar el correo')
        setNombre(data.nombre || '')
        setEstado('ok')
      })
      .catch((err: any) => {
        setEstado('error')
        setMensaje(err.message || 'Este enlace de verificación no es válido o ya fue usado.')
      })
  }, [token])

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
        maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        textAlign: 'center',
      }}>
        <img
          src="/logo-hgv.png"
          alt="Escudo HGV Tennis Club"
          style={{ width: '88px', height: '88px', objectFit: 'contain', margin: '0 auto 18px auto', display: 'block' }}
        />

        {estado === 'verificando' && (
          <p style={{ fontSize: '15px', color: 'var(--color-ink)' }}>⏳ Verificando tu correo…</p>
        )}

        {estado === 'ok' && (
          <>
            <p style={{ fontSize: '32px', margin: '0 0 12px 0' }}>✅</p>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)',
              fontSize: '22px', margin: '0 0 12px 0',
            }}>
              ¡Correo verificado!
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--color-line)', marginBottom: '24px' }}>
              {nombre ? `Gracias, ${nombre}. ` : ''}Ya puedes iniciar sesión con tu email y PIN.
            </p>
            <a href="/login" style={{
              display: 'inline-block', color: 'var(--color-ink)', fontSize: '15px', fontWeight: 700,
              fontFamily: 'var(--font-body)', textDecoration: 'none', background: 'var(--color-ball)',
              borderRadius: '4px', padding: '12px 26px',
            }}>
              Ir a Iniciar sesión
            </a>
          </>
        )}

        {estado === 'error' && (
          <>
            <p style={{ fontSize: '32px', margin: '0 0 12px 0' }}>❌</p>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)',
              fontSize: '22px', margin: '0 0 12px 0',
            }}>
              Enlace no válido
            </h1>
            <p style={{ fontSize: '14px', color: '#a83226', marginBottom: '24px' }}>
              {mensaje}
            </p>
            <a
              href="/reenviar-verificacion"
              style={{ display: 'inline-block', color: 'var(--color-court)', fontSize: '13px', textDecoration: 'underline' }}
            >
              Solicitar un nuevo enlace de verificación
            </a>
          </>
        )}
      </div>
    </main>
  )
}

// useSearchParams() exige que el componente que lo usa esté envuelto en
// Suspense — si no, Next.js no puede generar la página estáticamente y el
// build falla. Este export es el que realmente usa Next.js como la página.
export default function VerificarCorreoPage() {
  return (
    <Suspense fallback={null}>
      <VerificarCorreoContenido />
    </Suspense>
  )
}
