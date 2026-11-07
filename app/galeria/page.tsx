'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatearFechaConAnio, formatearFechaLarga } from '@/lib/tiempo'
import NavJugador from '@/app/components/NavJugador'

type FotoGaleria = {
  id: string
  foto_url: string
  created_at: string
  marcador_retador: string | null
  marcador_retado: string | null
  no_presentado: boolean | null
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

// Foto de un partido del torneo (/api/publico/torneo/fotos).
type FotoCopa = {
  id: string
  foto_url: string
  fecha: string
  categoria: string
  etapa: string
  nombre_a: string
  nombre_b: string
  marcador: string | null
  cancha: string | null
}

// Lo que pinta la galería, venga de la escalera o del torneo.
type Item = {
  id: string
  foto_url: string
  orden: string
  copa: boolean
  titulo: string
  subtitulo: string | null
  marcador: string | null
  fecha: string
  lugar: string | null
}
type Filtro = 'todas' | 'escalera' | 'copa'
const FILTROS: [Filtro, string][] = [['todas', 'Todas'], ['escalera', 'Escalera'], ['copa', '🎄 Copa Navidad']]

const deEscalera = (f: FotoGaleria): Item => ({
  id: f.id,
  foto_url: f.foto_url,
  orden: f.created_at,
  copa: false,
  titulo: `${f.retos?.retador?.nombre} vs ${f.retos?.retado?.nombre}`,
  subtitulo: null,
  marcador: textoMarcador(f),
  fecha: f.retos?.fecha_propuesta ?? f.created_at,
  lugar: nombreCancha(f),
})

const deCopa = (f: FotoCopa): Item => ({
  id: f.id,
  foto_url: f.foto_url,
  orden: f.fecha,
  copa: true,
  titulo: `${f.nombre_a} vs ${f.nombre_b}`,
  subtitulo: `${f.categoria} · ${f.etapa}`,
  marcador: f.marcador,
  fecha: f.fecha,
  lugar: f.cancha === 'HGV1' ? 'HGV 1' : f.cancha === 'HGV2' ? 'HGV 2' : f.cancha,
})

// El marcador ya viene listo desde el lado del retador (ej: "6-4, 6-3" o,
// si hubo walkover, "No presentado"/"W.O.") — solo lo mostramos tal cual.
function textoMarcador(f: FotoGaleria) {
  if (!f.marcador_retador) return null
  if (f.no_presentado) return '⚠️ No se presentó uno de los jugadores'
  return f.marcador_retador
}

export default function GaleriaPage() {
  const [fotos, setFotos] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [fotoSeleccionada, setFotoSeleccionada] = useState<Item | null>(null)

  useEffect(() => {
    const escalera = supabase
      .from('resultados')
      .select('id, foto_url, created_at, marcador_retador, marcador_retado, no_presentado, retos:reto_id(cancha, nombre_cancha_foranea, fecha_propuesta, retador:retador_id(nombre), retado:retado_id(nombre))')
      .not('foto_url', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => ((data as any as FotoGaleria[]) || []).map(deEscalera))
    // Si falla el torneo, la galería de la escalera se ve igual.
    const copa = fetch('/api/publico/torneo/fotos')
      .then((r) => (r.ok ? r.json() : { fotos: [] }))
      .then((d) => ((d.fotos as FotoCopa[]) || []).map(deCopa))
      .catch(() => [] as Item[])
    Promise.all([escalera, copa]).then(([a, b]) => {
      setFotos([...a, ...b].sort((x, y) => new Date(y.orden).getTime() - new Date(x.orden).getTime()))
      setLoading(false)
    })
  }, [])

  const visibles = fotos.filter((f) => filtro === 'todas' || f.copa === (filtro === 'copa'))
  const hayCopa = fotos.some((f) => f.copa)

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
      <NavJugador />
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
            Momentos de la escalera y la Copa Navidad HGV
          </p>
        </div>

        {hayCopa && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
            {FILTROS.map(([id, texto]) => (
              <button key={id} onClick={() => setFiltro(id)} style={{
                padding: '7px 14px', borderRadius: '999px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                border: '1px solid var(--color-ball)',
                background: filtro === id ? 'var(--color-ball)' : 'transparent',
                color: filtro === id ? 'var(--color-ink)' : 'var(--color-chalk)',
              }}>{texto}</button>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--color-chalk)', textAlign: 'center' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando fotos…</p>
        ) : fotos.length === 0 ? (
          <div style={{ background: 'var(--color-chalk)', borderRadius: '4px', borderTop: '3px solid var(--color-ball)', padding: '40px', textAlign: 'center', color: 'var(--color-line)' }}>
            Todavía no hay fotos cargadas. ¡Sube la primera al registrar el resultado de un partido!
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px',
          }}>
            {visibles.map((f) => (
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
                  {f.copa && (
                    <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 5px 0' }}>
                      🎄 Copa Navidad
                    </p>
                  )}
                  <p style={{ color: 'var(--color-chalk)', fontSize: '14px', margin: 0, fontWeight: 600 }}>
                    {f.titulo}
                  </p>
                  {f.subtitulo && (
                    <p style={{ color: 'var(--color-chalk)', fontSize: '12px', margin: '4px 0 0 0', opacity: 0.85 }}>
                      {f.subtitulo}
                    </p>
                  )}
                  {f.marcador && (
                    <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-chalk)', fontSize: '12px', margin: '4px 0 0 0', opacity: 0.85 }}>
                      {f.marcador}
                    </p>
                  )}
                  <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '11px', margin: '5px 0 0 0' }}>
                    {formatearFechaConAnio(f.orden)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '34px' }}>
          <a href="/" style={{
            display: 'inline-block',
            color: 'var(--color-chalk)',
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            textDecoration: 'none',
            border: '1px solid var(--color-ball)',
            borderRadius: '4px',
            padding: '11px 26px',
          }}>🎾 Volver al inicio</a>
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
              {fotoSeleccionada.titulo}
            </p>
            {fotoSeleccionada.subtitulo && (
              <p style={{ color: 'var(--color-chalk)', fontSize: '14px', margin: '6px 0 0 0' }}>
                {fotoSeleccionada.subtitulo}
              </p>
            )}
            {fotoSeleccionada.marcador && (
              <p style={{
                fontFamily: 'var(--font-mono)', color: 'var(--color-ball)',
                fontSize: '16px', fontWeight: 700, margin: '8px 0 0 0',
              }}>
                {fotoSeleccionada.marcador}
              </p>
            )}
            <p style={{ fontFamily: 'var(--font-mono)', color: 'rgba(247,243,234,0.7)', fontSize: '13px', margin: '10px 0 0 0' }}>
              {formatearFechaLarga(fotoSeleccionada.fecha, { conAnio: true })}
              {fotoSeleccionada.lugar && ` · Cancha ${fotoSeleccionada.lugar}`}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
