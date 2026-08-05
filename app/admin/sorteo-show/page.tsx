'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CATEGORIAS: Record<string, string> = {
  sexta_novatos: 'Sexta Novato',
  sexta: 'Sexta',
  quinta: 'Quinta',
  cuarta: 'Cuarta',
}
const GENEROS: Record<string, string> = {
  caballeros: 'Caballeros',
  damas: 'Damas',
}

type Jugador = { id: string; nombre: string }
type Grupo = {
  categoria: string
  genero: string
  catLabel: string
  genLabel: string
  restantes: Jugador[]
  sacados: Jugador[]
}

export default function SorteoShowPage() {
  const [session, setSession] = useState<any>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const [loading, setLoading] = useState(true)
  const [temporadaActiva, setTemporadaActiva] = useState<any>(null)
  const [grupos, setGrupos] = useState<Record<string, Grupo>>({})
  const [grupoActivoKey, setGrupoActivoKey] = useState<string | null>(null)
  const [sacando, setSacando] = useState(false)
  const [nombreRevelado, setNombreRevelado] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [yaGuardado, setYaGuardado] = useState(false)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .finally(() => setCheckingSession(false))
  }, [])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    const { data: temporada } = await supabase
      .from('temporadas')
      .select('id, nombre, sorteo_realizado')
      .eq('estado', 'activa')
      .maybeSingle()

    setTemporadaActiva(temporada || null)
    if (!temporada || temporada.sorteo_realizado) {
      setLoading(false)
      return
    }

    const { data: posiciones } = await supabase
      .from('ladder_posiciones')
      .select('jugador_id, categoria, genero, jugadores(nombre)')
      .eq('temporada_id', temporada.id)

    const mapa: Record<string, Grupo> = {}
    ;(posiciones || []).forEach((p: any) => {
      const key = `${p.categoria}__${p.genero}`
      if (!mapa[key]) {
        mapa[key] = {
          categoria: p.categoria,
          genero: p.genero,
          catLabel: CATEGORIAS[p.categoria] || p.categoria,
          genLabel: GENEROS[p.genero] || p.genero,
          restantes: [],
          sacados: [],
        }
      }
      mapa[key].restantes.push({ id: p.jugador_id, nombre: p.jugadores?.nombre || 'Jugador' })
    })

    // Orden de barajado inicial aleatorio, para que el "bombo" no muestre
    // los nombres en el mismo orden en que se anotaron.
    Object.values(mapa).forEach((g) => {
      g.restantes.sort(() => Math.random() - 0.5)
    })

    setGrupos(mapa)
    const primeraKey = Object.keys(mapa)[0] || null
    setGrupoActivoKey(primeraKey)
    setLoading(false)
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const grupoActivo = grupoActivoKey ? grupos[grupoActivoKey] : null
  const totalRestantes = Object.values(grupos).reduce((sum, g) => sum + g.restantes.length, 0)
  const todoListo = Object.keys(grupos).length > 0 && totalRestantes === 0

  const sacarBola = () => {
    if (!grupoActivo || grupoActivo.restantes.length === 0 || sacando) return
    setSacando(true)
    setNombreRevelado(null)

    setTimeout(() => {
      setGrupos((prev) => {
        const g = prev[grupoActivoKey!]
        const restantes = [...g.restantes]
        const idx = Math.floor(Math.random() * restantes.length)
        const [elegido] = restantes.splice(idx, 1)
        setNombreRevelado(elegido.nombre)
        return {
          ...prev,
          [grupoActivoKey!]: { ...g, restantes, sacados: [...g.sacados, elegido] },
        }
      })
      setSacando(false)
    }, 3500)
  }

  const guardarSorteoCompleto = async () => {
    if (!temporadaActiva || !todoListo) return
    if (!confirm('¿Guardar el sorteo completo? Esta acción no se puede repetir ni deshacer.')) return

    setGuardando(true)
    setMsg('')
    try {
      const asignaciones = Object.values(grupos).flatMap((g) =>
        g.sacados.map((j, i) => ({ jugadorId: j.id, posicion: i + 1 }))
      )
      const res = await fetch('/api/admin/sorteo-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporadaId: temporadaActiva.id, asignaciones }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setYaGuardado(true)
      setMsg(`✅ ¡Sorteo guardado! ${data.count} jugadores ubicados en el escalafón.`)
    } catch (err: any) {
      setMsg('❌ ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (checkingSession || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1b26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#f7f3ea' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando…</span>
      </div>
    )
  }

  if (!session || session.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1b26', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#f7f3ea', padding: '20px', textAlign: 'center' }}>
        <p style={{ marginBottom: '16px' }}>🔒 Necesitas iniciar sesión como administrador.</p>
        <a href="/login" style={{ color: '#d4e157', fontWeight: 'bold' }}>Iniciar sesión</a>
      </div>
    )
  }

  if (!temporadaActiva) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1b26', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f7f3ea', textAlign: 'center', padding: '20px' }}>
        No hay ninguna temporada activa.
      </div>
    )
  }

  if (temporadaActiva.sorteo_realizado) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1b26', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#f7f3ea', textAlign: 'center', padding: '20px' }}>
        <p style={{ fontSize: '18px', marginBottom: '12px' }}>🔒 El sorteo de "{temporadaActiva.nombre}" ya se realizó.</p>
        <a href="/admin" style={{ color: '#d4e157', fontWeight: 'bold' }}>Volver al panel admin</a>
      </div>
    )
  }

  if (Object.keys(grupos).length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1b26', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f7f3ea', textAlign: 'center', padding: '20px' }}>
        Todavía no hay jugadores anotados en "{temporadaActiva.nombre}".
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #123a5c 0%, #0f1b26 65%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 20px 60px', fontFamily: 'var(--font-body, Arial, sans-serif)',
    }}>
      <style>{`
        @keyframes girarBombo {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(90deg) scale(1.05); }
          50% { transform: rotate(180deg) scale(0.98); }
          75% { transform: rotate(270deg) scale(1.05); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes revelarNombre {
          0% { opacity: 0; transform: scale(0.6) translateY(10px); }
          60% { opacity: 1; transform: scale(1.08) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes flotar {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .bombo-girando { animation: girarBombo 1.1s ease-in-out infinite; }
        .nombre-revelado { animation: revelarNombre 0.5s ease-out; }
        .bola-flotante { animation: flotar 2.4s ease-in-out infinite; }
      `}</style>

      {/* Encabezado */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <img src="/logo-hgv.png" alt="Escudo HGV" style={{ width: '64px', height: '64px', objectFit: 'contain', margin: '0 auto 10px auto', display: 'block' }} />
        <h1 style={{ fontFamily: 'var(--font-display, Georgia)', fontWeight: 900, color: '#f7f3ea', fontSize: 'clamp(26px, 5vw, 38px)', margin: 0 }}>
          Sorteo de la Escalera
        </h1>
        <p style={{ fontFamily: 'var(--font-mono, monospace)', color: '#d4e157', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '8px' }}>
          {temporadaActiva.nombre}
        </p>
      </div>

      {/* Tabs de categoría/género */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '28px', maxWidth: '900px' }}>
        {Object.entries(grupos).map(([key, g]) => {
          const completo = g.restantes.length === 0
          const activo = key === grupoActivoKey
          return (
            <button
              key={key}
              onClick={() => { setGrupoActivoKey(key); setNombreRevelado(null) }}
              style={{
                background: activo ? '#d4e157' : completo ? 'rgba(40,167,69,0.25)' : 'rgba(247,243,234,0.08)',
                color: activo ? '#0f1b26' : '#f7f3ea',
                border: activo ? '2px solid #d4e157' : '1px solid rgba(247,243,234,0.2)',
                borderRadius: '20px', padding: '8px 16px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {completo && '✅ '}{g.catLabel} — {g.genLabel} ({g.sacados.length}/{g.sacados.length + g.restantes.length})
            </button>
          )
        })}
      </div>

      {grupoActivo && (
        <>
          {/* Escenario del bombo */}
          <div style={{
            background: 'rgba(247,243,234,0.06)', border: '1px solid rgba(247,243,234,0.15)',
            borderRadius: '24px', padding: '40px 32px', textAlign: 'center', width: '100%', maxWidth: '480px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div
              className={sacando ? 'bombo-girando' : 'bola-flotante'}
              style={{
                width: '140px', height: '140px', borderRadius: '50%', margin: '0 auto 20px auto',
                background: 'radial-gradient(circle at 35% 30%, #e8f3fb 0%, #1c7ec4 55%, #123a5c 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono, monospace)', fontWeight: 900, fontSize: '28px', color: '#f7f3ea',
                boxShadow: '0 10px 30px rgba(28,126,196,0.5)',
              }}
            >
              {grupoActivo.restantes.length}
            </div>

            {nombreRevelado && !sacando ? (
              <div className="nombre-revelado" style={{ marginBottom: '18px' }}>
                <p style={{ fontFamily: 'var(--font-mono, monospace)', color: '#d4e157', fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 4px 0' }}>
                  Posición #{grupoActivo.sacados.length}
                </p>
                <p style={{ fontFamily: 'var(--font-display, Georgia)', fontWeight: 900, color: '#f7f3ea', fontSize: 'clamp(22px, 4vw, 30px)', margin: 0 }}>
                  {nombreRevelado}
                </p>
              </div>
            ) : (
              <p style={{ color: 'rgba(247,243,234,0.6)', fontSize: '14px', marginBottom: '18px', minHeight: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {sacando ? 'Sacando bola…' : grupoActivo.restantes.length === 0 ? '✅ Categoría completa' : 'Listo para sacar la siguiente bola'}
              </p>
            )}

            {grupoActivo.restantes.length > 0 ? (
              <button
                onClick={sacarBola}
                disabled={sacando}
                style={{
                  background: sacando ? '#6b6b6b' : '#d4e157', color: '#0f1b26', border: 'none',
                  padding: '16px 40px', borderRadius: '10px', fontSize: '17px', fontWeight: 900,
                  cursor: sacando ? 'not-allowed' : 'pointer', letterSpacing: '0.02em',
                }}
              >
                {sacando ? '🎾 Sacando…' : '🎾 Sacar bola'}
              </button>
            ) : (
              <p style={{ color: '#28a745', fontWeight: 700, fontSize: '15px' }}>Pasa a la siguiente categoría arriba ↑</p>
            )}
          </div>

          {/* Resultados de la categoría activa */}
          {grupoActivo.sacados.length > 0 && (
            <div style={{ width: '100%', maxWidth: '480px', marginTop: '24px' }}>
              <p style={{ fontFamily: 'var(--font-mono, monospace)', color: 'rgba(247,243,234,0.6)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Resultado — {grupoActivo.catLabel} / {grupoActivo.genLabel}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {grupoActivo.sacados.map((j, i) => (
                  <div key={j.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: 'rgba(247,243,234,0.06)', borderRadius: '8px', padding: '8px 14px',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 900, color: '#d4e157', fontSize: '15px', width: '26px' }}>
                      #{i + 1}
                    </span>
                    <span style={{ color: '#f7f3ea', fontSize: '14px' }}>{j.nombre}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Guardar sorteo completo */}
      <div style={{ marginTop: '36px', textAlign: 'center' }}>
        {todoListo && !yaGuardado && (
          <button
            onClick={guardarSorteoCompleto}
            disabled={guardando}
            style={{
              background: guardando ? '#6b6b6b' : '#28a745', color: 'white', border: 'none',
              padding: '16px 36px', borderRadius: '10px', fontSize: '16px', fontWeight: 900,
              cursor: guardando ? 'not-allowed' : 'pointer',
            }}
          >
            {guardando ? '⏳ Guardando…' : '🎉 Guardar sorteo completo'}
          </button>
        )}
        {!todoListo && (
          <p style={{ color: 'rgba(247,243,234,0.5)', fontSize: '13px' }}>
            Faltan {totalRestantes} bola{totalRestantes !== 1 ? 's' : ''} por sacar entre todas las categorías.
          </p>
        )}
        {msg && (
          <div style={{
            marginTop: '14px', padding: '12px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 700,
            background: msg.includes('✅') ? 'rgba(40,167,69,0.2)' : 'rgba(197,60,50,0.2)',
            color: msg.includes('✅') ? '#7ee0a0' : '#ff9d94',
          }}>
            {msg}
          </div>
        )}
        {yaGuardado && (
          <p style={{ marginTop: '16px' }}>
            <a href="/admin" style={{ color: '#d4e157', fontWeight: 'bold' }}>Volver al panel admin →</a>
          </p>
        )}
      </div>
    </div>
  )
}
