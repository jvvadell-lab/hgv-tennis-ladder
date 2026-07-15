'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Session = {
  role: 'admin' | 'jugador'
  id: string
  nombre: string
} | null

type Anuncio = {
  titulo: string
  descripcion: string
  activo: boolean
} | null

// Divisor de "línea de cancha" — doble línea fina, como la línea de fondo
// y la línea de servicio de una cancha de tenis. Es la firma visual de la marca.
function LineaDeCancha() {
  return (
    <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
      <div style={{ height: '1px', background: 'rgba(212,225,87,0.55)', marginBottom: '5px' }} />
      <div style={{ height: '1px', background: 'rgba(212,225,87,0.25)' }} />
    </div>
  )
}

export default function Home() {
  const [session, setSession] = useState<Session>(null)
  const [checking, setChecking] = useState(true)
  const [anuncio, setAnuncio] = useState<Anuncio>(null)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    supabase
      .from('anuncio')
      .select('titulo, descripcion, activo')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.activo && data.titulo) setAnuncio(data as Anuncio)
      })
  }, [])

  async function cerrarSesion() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <main className="court-bg" style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '60px 20px 40px',
    }}>

      {/* Logo y título */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <img
          src="/logo-hgv.png"
          alt="Escudo HGV Tennis Club"
          style={{
            width: '161px',
            height: '161px',
            objectFit: 'contain',
            margin: '0 auto 18px auto',
            display: 'block',
            filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.45))',
          }}
        />

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          color: 'var(--color-chalk)',
          fontSize: 'clamp(34px, 6vw, 54px)',
          margin: 0,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}>
          HGV Tennis Club
        </h1>

        <p style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-ball)',
          fontSize: '13px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          margin: '14px 0 0 0',
        }}>
          Challenger Ladder · 2026
        </p>

        <div style={{ margin: '20px 0' }}>
          <LineaDeCancha />
        </div>

        <p style={{
          color: 'rgba(247,243,234,0.75)',
          fontSize: '16px',
          maxWidth: '380px',
          margin: '0 auto',
          lineHeight: 1.5,
        }}>
          Compite, sube posiciones y conviértete en el campeón del club
        </p>

        {!checking && session && (
          <p style={{ fontSize: '14px', marginTop: '18px' }}>
            <span style={{ color: 'rgba(247,243,234,0.6)' }}>Conectado como </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ball)' }}>{session.nombre}</span>
            <span style={{ color: 'rgba(247,243,234,0.6)' }}>
              {' — '}
              <button
                onClick={cerrarSesion}
                style={{
                  background: 'none', border: 'none', color: 'rgba(247,243,234,0.85)', textDecoration: 'underline',
                  cursor: 'pointer', fontSize: 'inherit', padding: 0, fontFamily: 'var(--font-body)',
                }}
              >
                Cerrar sesión
              </button>
            </span>
          </p>
        )}
      </div>

      {/* Anuncio del club */}
      {anuncio && (
        <div className="anuncio-banner" style={{
          background: 'linear-gradient(135deg, #d4e157 0%, #b9c93f 100%)',
          borderRadius: '12px', padding: '18px 26px', marginBottom: '32px',
          maxWidth: '480px', textAlign: 'center',
        }}>
          <p style={{
            fontFamily: 'var(--font-mono)', color: '#1b2e10', fontSize: '11px',
            letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0, fontWeight: 700,
          }}>
            📢 Anuncio del club
          </p>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)',
            fontSize: 'clamp(18px, 3.5vw, 22px)', margin: '4px 0 0 0',
          }}>
            {anuncio.titulo}
          </h3>
          {anuncio.descripcion && (
            <p style={{ color: '#1b2e10', fontSize: '13px', margin: '6px 0 0 0' }}>
              {anuncio.descripcion}
            </p>
          )}
        </div>
      )}

      {/* Tarjetas de información */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '38px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: '620px',
      }}>
        {[
          { icon: '👥', title: 'Jugadores', desc: 'Regístrate y únete a la escalera' },
          { icon: '⚔️', title: 'Desafíos', desc: 'Reta a jugadores sobre ti' },
          { icon: '📊', title: 'Ranking', desc: 'Sube posiciones ganando partidos' }
        ].map((card) => (
          <div key={card.title} style={{
            backgroundColor: 'rgba(247,243,234,0.06)',
            borderRadius: '4px',
            padding: '22px 20px',
            width: '164px',
            textAlign: 'center',
            border: '1px solid rgba(247,243,234,0.12)',
            borderTop: '2px solid var(--color-ball)',
          }}>
            <div style={{ fontSize: '30px', marginBottom: '10px' }}>{card.icon}</div>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-ball)',
              margin: '0 0 6px 0',
              fontSize: '17px',
              fontWeight: 700,
            }}>
              {card.title}
            </h3>
            <p style={{ color: 'rgba(247,243,234,0.7)', margin: 0, fontSize: '13px', lineHeight: 1.4 }}>{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/ladder" style={{
          backgroundColor: 'var(--color-ball)',
          color: 'var(--color-ink)',
          padding: '14px 30px',
          borderRadius: '4px',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: '15px',
          fontFamily: 'var(--font-body)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          Ver Escalera
        </Link>

        <Link href="/galeria" style={{
          backgroundColor: 'transparent',
          color: 'var(--color-chalk)',
          padding: '14px 30px',
          borderRadius: '4px',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: '15px',
          fontFamily: 'var(--font-body)',
          border: '1px solid rgba(247,243,234,0.4)',
        }}>
          Galería
        </Link>

        {!checking && session ? (
          session.role === 'admin' && (
            <Link href="/admin" style={{
              backgroundColor: 'transparent',
              color: 'var(--color-chalk)',
              padding: '14px 30px',
              borderRadius: '4px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'var(--font-body)',
              border: '1px solid rgba(247,243,234,0.4)',
            }}>
              Panel Admin
            </Link>
          )
        ) : (
          <>
            <Link href="/register" style={{
              backgroundColor: 'transparent',
              color: 'var(--color-chalk)',
              padding: '14px 30px',
              borderRadius: '4px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'var(--font-body)',
              border: '1px solid rgba(247,243,234,0.4)',
            }}>
              Registrarse
            </Link>

            <Link href="/login" style={{
              backgroundColor: 'transparent',
              color: 'var(--color-ball)',
              padding: '14px 30px',
              borderRadius: '4px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'var(--font-body)',
              border: '1px solid var(--color-ball)',
            }}>
              Iniciar Sesión
            </Link>
          </>
        )}
      </div>

      {/* Footer */}
      <p style={{
        color: 'rgba(247,243,234,0.35)',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        marginTop: '56px',
        letterSpacing: '0.04em',
      }}>
        © 2026 HGV Tennis Club
      </p>

    </main>
  )
}
