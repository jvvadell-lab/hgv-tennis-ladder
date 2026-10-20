'use client'
import { useEffect, useState } from 'react'
import HorarioAcademia from '@/app/components/HorarioAcademia'

// Pantalla del profesor de la academia (admin de nivel "academia"): solo el
// horario de la academia del Torneo Navidad (SPEC §14.5). Un admin completo
// también puede entrar. El servidor vuelve a revisar el permiso en
// /api/academia/franjas.

type Session = { role: 'admin' | 'jugador' | 'academia'; nombre: string; nivel?: string } | null

export default function AcademiaPage() {
  const [session, setSession] = useState<Session>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setSession(d.session))
      .finally(() => setCargando(false))
  }, [])

  const salir = async () => {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/'
  }

  if (cargando) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-chalk)' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando…</p>
      </main>
    )
  }

  const autorizado = session?.role === 'academia' || (session?.role === 'admin' && (!session.nivel || session.nivel === 'completo'))
  if (!autorizado) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-chalk)', fontSize: '18px', marginBottom: '16px' }}>🔒 Esta pantalla es para la academia.</p>
        <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Iniciar sesión</a>
      </main>
    )
  }

  return (
    <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '20px 16px' }}>
      <div style={{ background: 'var(--color-chalk)', borderRadius: '8px', padding: '24px 20px', width: '100%', maxWidth: '720px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-ink)', fontSize: '22px' }}>🎄 Horario academia</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#555' }}>Torneo Navidad · {session!.nombre}</p>
          </div>
          <span style={{ display: 'flex', gap: '12px', fontSize: '14px' }}>
            <a href="/torneo" style={{ color: 'var(--color-court)', fontWeight: 700 }}>Ver torneo</a>
            <button onClick={salir} style={{ background: 'none', border: 'none', color: '#c0392b', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>Salir</button>
          </span>
        </div>
        <HorarioAcademia />
      </div>
    </main>
  )
}
