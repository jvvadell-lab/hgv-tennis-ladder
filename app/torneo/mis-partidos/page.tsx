'use client'
import { useEffect, useState } from 'react'
import FormMarcadorTorneo from '@/app/components/FormMarcadorTorneo'
import { formatearFechaHora } from '@/lib/tiempo'
import { ETIQUETA_FASE, PREFIJO_FASE, type EstadoPartido, type Fase, textoOrigen } from '@/lib/torneo'
import type { SetJugado, TipoResultado } from '@/lib/resultados'
import { textoMarcador } from '@/lib/torneoResultados'
import NavJugador, { BotonPanelAdmin } from '@/app/components/NavJugador'

// "Mis partidos" (SPEC §9, fase 6): mis partidos del torneo vigente (y los
// de los menores que represento), con rival, horario y resultado, y el
// formulario para reportar el resultado. El admin lo valida después.

type Partido = {
  id: string
  categoria_nombre: string
  fase: Fase
  grupo_letra: string | null
  orden: number
  equipo_a: string | null
  equipo_b: string | null
  nombre_a: string | null
  nombre_b: string | null
  origen_a: string | null
  origen_b: string | null
  cancha: string | null
  fecha_hora: string | null
  estado: EstadoPartido
  sets: SetJugado[] | null
  tipo_resultado: TipoResultado
  wo_ausente_equipo_id: string | null
  ganador_equipo_id: string | null
  validado: boolean
  reportado_at: string | null
}

type Datos = {
  torneo: { nombre: string; estado: string; programacion_publicada_at: string | null } | null
  mias: string[]
  partidos: Partido[]
}

const tarjeta: React.CSSProperties = { background: 'white', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '6px', padding: '14px 16px', marginBottom: '12px' }
const tituloSeccion: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '19px', margin: '24px 0 12px 0' }

const etiquetaPartido = (p: Partido) =>
  p.fase === 'grupo' ? `Grupo ${p.grupo_letra}` : `${ETIQUETA_FASE[p.fase]} ${PREFIJO_FASE[p.fase as Exclude<Fase, 'grupo'>]}${p.orden}`

const origenTexto = (o: string | null) => {
  if (o && /^2?P\d$/.test(o)) return textoOrigen(o)   // llave de 3 grupos (mejores primeros)
  const g = o?.match(/^([1-9])([A-Z])$/)
  if (g) return `${g[1]}º del grupo ${g[2]}`
  const w = o?.match(/^G:([CSF]\d+)$/)
  return w ? `Ganador de ${w[1]}` : 'Por definir'
}

export default function MisPartidos() {
  const [checking, setChecking] = useState(true)
  const [esJugador, setEsJugador] = useState(false)
  const [rol, setRol] = useState<string | null>(null)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [reportando, setReportando] = useState<string | null>(null)

  const cargar = async () => {
    const res = await fetch('/api/jugador/torneo/partidos', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al cargar tus partidos')
    setDatos(data)
  }

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then(async (d) => {
        setRol(d.session?.role ?? null)
        if (d.session?.role !== 'jugador') return
        setEsJugador(true)
        await cargar()
      })
      .catch((err) => setError(err.message))
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <NavJugador />
        <p style={{ color: 'var(--color-chalk)' }} className="loading-row"><span className="spinner spinner-chalk" /> Cargando…</p>
      </main>
    )
  }
  if (!esJugador) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <NavJugador />
        <p style={{ color: 'var(--color-chalk)', marginBottom: '16px' }}>Debes iniciar sesión como jugador para ver tus partidos.</p>
        <BotonPanelAdmin rol={rol} />
        <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Iniciar sesión</a>
      </main>
    )
  }

  const mias = new Set(datos?.mias ?? [])
  const partidos = datos?.partidos ?? []
  const porReportar = partidos.filter((p) => !p.validado && p.equipo_a && p.equipo_b && !['wo', 'doble_wo'].includes(p.estado))
  const cerrados = partidos.filter((p) => p.validado)
  const porConocer = partidos.filter((p) => !p.validado && (!p.equipo_a || !p.equipo_b))

  const reportar = async (p: Partido, d: { sets: unknown; tipoResultado: string; retiradaInscripcionId: string | null }) => {
    const res = await fetch('/api/jugador/torneo/resultado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partidoId: p.id, ...d }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo reportar')
    setReportando(null)
    setOk('Resultado reportado. Queda por validar por el admin.')
    await cargar()
  }

  const Rivales = ({ p }: { p: Partido }) => (
    <div style={{ fontSize: '14px', marginTop: '4px' }}>
      {[['a', p.equipo_a, p.nombre_a, p.origen_a], ['b', p.equipo_b, p.nombre_b, p.origen_b]].map(([lado, id, nombre, origen], i) => (
        <span key={lado as string}>
          {i === 1 && <span style={{ color: '#888' }}> vs </span>}
          <span style={{ fontWeight: id && mias.has(id as string) ? 800 : 400, color: id && p.validado && p.ganador_equipo_id === id ? '#1e6b34' : 'inherit' }}>
            {(nombre as string) ?? origenTexto(origen as string | null)}
          </span>
        </span>
      ))}
    </div>
  )

  const Horario = ({ p }: { p: Partido }) => (
    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
      {p.fecha_hora && datos?.torneo?.programacion_publicada_at ? `${formatearFechaHora(p.fecha_hora)} · ${p.cancha}` : 'Horario por publicar'}
    </div>
  )

  return (
    <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
      <NavJugador />
      <div style={{
        background: 'var(--color-chalk)', borderRadius: '4px', borderTop: '3px solid var(--color-ball)',
        padding: 'clamp(20px, 5vw, 36px)', width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '34px', margin: 0 }}>🎄🎾</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '24px', margin: '6px 0 0 0' }}>Mis partidos</h1>
          {datos?.torneo && <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-court)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '8px' }}>{datos.torneo.nombre}</p>}
        </div>

        {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '4px', fontSize: '14px' }}>{error}</p>}
        {ok && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 14px', borderRadius: '4px', fontSize: '14px' }}>{ok}</p>}

        {!datos?.torneo ? (
          <p style={{ textAlign: 'center', color: '#555' }}>No hay un torneo en juego.</p>
        ) : partidos.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#555', marginTop: '20px' }}>Todavía no tienes partidos: aparecen cuando se publica el sorteo.</p>
        ) : (
          <>
            {porReportar.length > 0 && <h2 style={tituloSeccion}>Por jugar o por validar</h2>}
            {porReportar.map((p) => (
              <div key={p.id} style={tarjeta}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--color-ink)', fontSize: '14px' }}>{p.categoria_nombre} · {etiquetaPartido(p)}</strong>
                  {p.reportado_at && <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: '#fff4d6', color: '#8a5a00' }}>Por validar</span>}
                </div>
                <Rivales p={p} />
                <Horario p={p} />
                {p.reportado_at && <div style={{ fontSize: '13px', marginTop: '6px' }}>Reportado: <strong>{textoMarcador(p)}</strong></div>}
                {reportando === p.id ? (
                  <FormMarcadorTorneo
                    nombreA={p.nombre_a ?? 'A'}
                    nombreB={p.nombre_b ?? 'B'}
                    inscripcionA={p.equipo_a!}
                    inscripcionB={p.equipo_b!}
                    textoBoton="Reportar resultado"
                    onEnviar={(d) => reportar(p, d)}
                    onCancelar={() => setReportando(null)}
                  />
                ) : (
                  <button onClick={() => { setOk(''); setReportando(p.id) }} style={{ marginTop: '10px', padding: '8px 14px', border: '1px solid var(--color-court)', background: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                    {p.reportado_at ? 'Corregir el reporte' : '📝 Reportar resultado'}
                  </button>
                )}
              </div>
            ))}

            {porConocer.length > 0 && <h2 style={tituloSeccion}>Próximas rondas</h2>}
            {porConocer.map((p) => (
              <div key={p.id} style={{ ...tarjeta, opacity: 0.85 }}>
                <strong style={{ color: 'var(--color-ink)', fontSize: '14px' }}>{p.categoria_nombre} · {etiquetaPartido(p)}</strong>
                <Rivales p={p} />
                <Horario p={p} />
              </div>
            ))}

            {cerrados.length > 0 && <h2 style={tituloSeccion}>Jugados</h2>}
            {cerrados.map((p) => (
              <div key={p.id} style={tarjeta}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--color-ink)', fontSize: '14px' }}>{p.categoria_nombre} · {etiquetaPartido(p)}</strong>
                  <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: '#dff5e3', color: '#1e6b34' }}>
                    {p.ganador_equipo_id && mias.has(p.ganador_equipo_id) ? 'Ganado' : p.ganador_equipo_id ? 'Perdido' : 'Sin ganador'}
                  </span>
                </div>
                <Rivales p={p} />
                <div style={{ fontSize: '13px', marginTop: '6px' }}><strong>{textoMarcador(p)}</strong></div>
              </div>
            ))}
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '28px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['/torneo', '🏆 Grupos y llave'], ['/torneo/inscripcion', '🎄 Mi inscripción']].map(([href, texto]) => (
            <a key={href} href={href} style={{ color: 'var(--color-ink)', fontSize: '14px', fontWeight: 700, textDecoration: 'none', border: '1px solid var(--color-court)', borderRadius: '4px', padding: '9px 20px' }}>{texto}</a>
          ))}
        </div>
      </div>
    </main>
  )
}
