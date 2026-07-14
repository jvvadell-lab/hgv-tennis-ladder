'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type FotoGaleria = {
  id: string
  foto_url: string
  created_at: string
  retos: {
    cancha: string | null
    nombre_cancha_foranea: string | null
    fecha_propuesta: string | null
    retador: { nombre: string } | null
    retado: { nombre: string } | null
  } | null
}

function nombreCancha(f: FotoGaleria) {
  const c = f.retos?.cancha
  if (!c) return null
  if (c === 'FORANEA') return f.retos?.nombre_cancha_foranea || 'Cancha foránea'
  if (c === 'HGV1') return 'HGV 1'
  if (c === 'HGV2') return 'HGV 2'
  return c
}

export default function GaleriaPage() {
  const [fotos, setFotos] = useState<FotoGaleria[]>([])
  const [loading, setLoading] = useState(true)
  const [fotoSeleccionada, setFotoSeleccionada] = useState<FotoGaleria | null>(null)

  useEffect(() => {
    supabase
      .from('resultados')
      .select('id, foto_url, created_at, retos:reto_id(cancha, nombre_cancha_foranea, fecha_propuesta, retador:retador_id(nombre), retado:retado_id(nombre))')
      .not('foto_url', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setFotos((data as any) || [])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setFotoSeleccionada(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className="court-bg" style={{
      minHeight: '100vh',
      padding: '48px 20px',
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '34px' }}>
          <img src="/logo-hgv.png" alt="Escudo HGV" style={{ width: '83px', height: '83px', objectFit: 'contain', margin: '0 auto 10px auto', display: 'block' }} />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            color: 'var(--color-chalk)',
            fontSize: 'clamp(28px, 5vw, 38px)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            Galería del Torneo
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-ball)',
            fontSize: '12px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginTop: '10px',
          }}>
            Momentos de la escalera HGV
          </p>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-chalk)', textAlign: 'center' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando fotos…</p>
        ) : fotos.length === 0 ? (
          <div style={{ background: 'var(--color-chalk)', borderRadius: '4px', borderTop: '3px solid var(--color-ball)', padding: '40px', textAlign: 'center', color: 'var(--color-line)' }}>
            Todavía no hay fotos cargadas. ¡Sube la primera al registrar el resultado de un partido en la escalera!
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px',
          }}>
            {fotos.map((f) => (
              <div
                key={f.id}
                onClick={() => setFotoSeleccionada(f)}
                style={{
                  backgroundColor: 'rgba(247,243,234,0.06)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: '1px solid rgba(247,243,234,0.14)',
                  borderTop: '2px solid var(--color-ball)',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={f.foto_url}
                  alt="Foto del partido"
                  style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '12px 14px' }}>
                  <p style={{ color: 'var(--color-chalk)', fontSize: '14px', margin: 0, fontWeight: 600 }}>
                    {f.retos?.retador?.nombre} vs {f.retos?.retado?.nombre}
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '11px', margin: '5px 0 0 0' }}>
                    {new Date(f.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '34px' }}>
          <a href="/" style={{ color: 'rgba(247,243,234,0.6)', fontSize: '13px', textDecoration: 'none' }}>← Volver al inicio</a>
        </div>
      </div>

      {/* Visor ampliado (lightbox) */}
      {fotoSeleccionada && (
        <div
          onClick={() => setFotoSeleccionada(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,27,38,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px', zIndex: 1000, cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setFotoSeleccionada(null)}
            style={{
              position: 'absolute', top: '20px', right: '24px', background: 'none', border: 'none',
              color: 'var(--color-chalk)', fontSize: '32px', cursor: 'pointer', lineHeight: 1,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>

          <img
            src={fotoSeleccionada.foto_url}
            alt="Foto del partido ampliada"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: '4px', cursor: 'default' }}
          />

          <div
            onClick={(e) => e.stopPropagation()}
            style={{ marginTop: '18px', textAlign: 'center', maxWidth: '600px' }}
          >
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              color: 'var(--color-chalk)', fontSize: '22px', margin: 0,
            }}>
              {fotoSeleccionada.retos?.retador?.nombre} vs {fotoSeleccionada.retos?.retado?.nombre}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '13px', margin: '10px 0 0 0' }}>
              {fotoSeleccionada.retos?.fecha_propuesta
                ? new Date(fotoSeleccionada.retos.fecha_propuesta).toLocaleDateString('es-ES', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })
                : new Date(fotoSeleccionada.created_at).toLocaleDateString('es-ES', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
              {nombreCancha(fotoSeleccionada) && ` · Cancha ${nombreCancha(fotoSeleccionada)}`}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
