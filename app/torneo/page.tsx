'use client'
import { useEffect, useMemo, useState } from 'react'
import { fechaISOEnCaracas, formatearFechaConAnio, formatearFechaCorta, formatearFechaLarga, formatearHora, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_TORNEO, ETIQUETA_FASE, PREFIJO_FASE, type EstadoTorneo, type Fase, textoOrigen } from '@/lib/torneo'
import type { SetJugado } from '@/lib/resultados'
import NavJugador from '@/app/components/NavJugador'

// Vista pública del Torneo Navidad (SPEC §9): pestañas Adultos | Infantil y
// una por categoría con la tabla de grupos en vivo, el calendario por día y
// la llave gráfica (serie 1 arriba, serie 2 abajo; en el celular se desliza
// por rondas). Resalta las inscripciones del usuario con sesión. Los datos
// vienen de /api/publico/torneo (solo nombres públicos; de los menores,
// "Nombre I.").

type Categoria = { id: string; nombre: string; modalidad: string; genero: string; es_infantil: boolean; orden: number; llave_desde: string; inscritas: number }
type Fila = { equipo_id: string; posicion: number; pj: number; pg: number; pp: number; sets_favor: number; sets_contra: number; games_favor: number; games_contra: number; stb_puntos_favor: number; stb_puntos_contra: number; requiere_sorteo: boolean }
type Grupo = { id: string; categoria_id: string; letra: string; tabla: Fila[] }
type Partido = {
  id: string; categoria_id: string; fase: Fase; grupo: string | null; orden: number
  origen_a: string | null; origen_b: string | null; equipo_a: string | null; equipo_b: string | null
  cancha: string | null; fecha_hora: string | null; estado: string; sets: SetJugado[] | null; tipo_resultado: string
  ganador: string | null; wo_ausente: string | null; retirada: string | null; handicap: string | null
}
type Datos = {
  torneo: { nombre: string; fecha_inicio: string; fecha_fin: string; estado: EstadoTorneo; sorteado: boolean; programacion_publicada: boolean } | null
  categorias: Categoria[]
  nombres: Record<string, string>
  grupos: Grupo[]
  partidos: Partido[]
  mias: string[]
}

const RESALTE = '#fff3b0'
const FASES_LLAVE: Fase[] = ['cuartos', 'semis', 'final']

const fecha = (iso: string) => formatearFechaConAnio(instanteEnCaracas(iso, '12:00'))

function origenTexto(o: string | null): string {
  if (!o) return 'Por definir'
  if (/^2?P\d$/.test(o)) return textoOrigen(o)   // llave de 3 grupos (mejores primeros)
  const g = o.match(/^([1-9])([A-Z])$/)
  if (g) return `${g[1]}º grupo ${g[2]}`
  const w = o.match(/^G:([CSF])(\d+)$/)
  if (w) return `Ganador ${w[1] === 'C' ? 'cuartos' : w[1] === 'S' ? 'semi' : 'final'} ${w[2]}`
  return o
}

// Marcador desde el lado de `a` (j1) o de `b` (j2): "6-4 3-6 [10-8]". En un
// retiro, la pareja que se retiró lleva "ret." al final.
function marcador(p: Partido, lado: 'a' | 'b'): string {
  const id = lado === 'a' ? p.equipo_a : p.equipo_b
  if (p.estado === 'wo') return p.wo_ausente === id ? 'WO' : ''
  if (p.estado === 'doble_wo') return 'WO'
  const games = (p.sets || [])
    .map((s) => {
      const [x, y] = lado === 'a' ? [s.games_j1, s.games_j2] : [s.games_j2, s.games_j1]
      return s.es_super_tiebreak ? `[${x}]` : `${x}`
    })
    .join(' ')
  return p.retirada && p.retirada === id ? `${games} ret.` : games
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const etapa = (p: Partido) => (p.fase === 'grupo' ? `Grupo ${p.grupo}` : `${ETIQUETA_FASE[p.fase]}${p.fase === 'final' ? '' : ` ${PREFIJO_FASE[p.fase]}${p.orden}`}`)

export default function TorneoPublico() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [seccion, setSeccion] = useState<'adultos' | 'infantil'>('adultos')
  const [vista, setVista] = useState<string>('calendario')

  useEffect(() => {
    fetch('/api/publico/torneo', { cache: 'no-store' })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'No se pudo cargar el torneo')))))
      .then((d: Datos) => {
        setDatos(d)
        // Arranca en la sección y categoría del usuario, si tiene inscripción.
        const mia = d.partidos?.find((p) => d.mias.includes(p.equipo_a ?? '') || d.mias.includes(p.equipo_b ?? ''))
        const cat = mia ? d.categorias.find((c) => c.id === mia.categoria_id) : null
        if (cat) { setSeccion(cat.es_infantil ? 'infantil' : 'adultos'); setVista(cat.id) }
      })
      .catch((err) => setError(err.message))
  }, [])

  const mias = useMemo(() => new Set(datos?.mias || []), [datos])

  if (!datos) {
    return (
      <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <NavJugador />
        <p style={{ color: 'var(--color-chalk)' }} className="loading-row">{error || <><span className="spinner spinner-chalk" /> Cargando torneo…</>}</p>
      </main>
    )
  }

  const { torneo } = datos
  const categorias = datos.categorias.filter((c) => (seccion === 'infantil') === c.es_infantil)
  const hayInfantil = datos.categorias.some((c) => c.es_infantil)
  const categoria = categorias.find((c) => c.id === vista) ?? null
  const nombre = (id: string | null) => (id ? datos.nombres[id] ?? '—' : null)

  return (
    <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
      <NavJugador />
      <div style={{ background: 'var(--color-chalk)', borderRadius: '8px', padding: '22px 16px', width: '100%', maxWidth: '1040px', boxSizing: 'border-box', minWidth: 0 }}>
        {!torneo ? (
          <p style={{ margin: 0 }}>No hay un torneo en curso.</p>
        ) : (
          <>
            <header style={{ textAlign: 'center', marginBottom: '18px' }}>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-ink)', fontSize: 'clamp(22px, 5vw, 30px)' }}>🎄 {torneo.nombre}</h1>
              <p style={{ margin: '6px 0 0 0', color: '#555', fontSize: '14px' }}>
                {fecha(torneo.fecha_inicio)} al {fecha(torneo.fecha_fin)} · <strong>{ETIQUETA_ESTADO_TORNEO[torneo.estado]}</strong>
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
                {[
                  ...(torneo.estado === 'inscripcion' ? [['/torneo/inscripcion', '✍️ Inscribirme']] : []),
                  ['/torneo/mis-partidos', '📋 Mis partidos'],
                ].map(([href, texto]) => (
                  <a key={href} href={href} style={{ color: 'var(--color-ink)', fontSize: '13px', fontWeight: 700, textDecoration: 'none', border: '1px solid var(--color-court)', borderRadius: '4px', padding: '7px 14px' }}>{texto}</a>
                ))}
              </div>
            </header>

            {hayInfantil && (
              <div style={{ display: 'flex', borderBottom: '2px solid rgba(15,27,38,0.15)', marginBottom: '12px' }}>
                {(['adultos', 'infantil'] as const).map((s) => (
                  <button key={s} onClick={() => { setSeccion(s); setVista('calendario') }} style={{
                    flex: 1, padding: '10px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800, fontSize: '15px',
                    color: seccion === s ? 'var(--color-ink)' : '#888', borderBottom: seccion === s ? '3px solid var(--color-court)' : '3px solid transparent', marginBottom: '-2px',
                  }}>
                    {s === 'adultos' ? 'Adultos' : 'Infantil'}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '16px' }}>
              {[{ id: 'calendario', nombre: '📅 Calendario' }, ...categorias].map((c) => {
                const tieneMia = c.id !== 'calendario' && datos.partidos.some((p) => p.categoria_id === c.id && (mias.has(p.equipo_a ?? '') || mias.has(p.equipo_b ?? '')))
                return (
                  <button key={c.id} onClick={() => setVista(c.id)} style={{
                    padding: '7px 12px', borderRadius: '999px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0,
                    border: vista === c.id ? '2px solid var(--color-ink)' : '1px solid rgba(15,27,38,0.2)',
                    background: vista === c.id ? 'var(--color-ink)' : 'white', color: vista === c.id ? 'white' : 'var(--color-ink)',
                  }}>
                    {c.nombre}{tieneMia ? ' ⭐' : ''}
                  </button>
                )
              })}
            </div>

            {vista === 'calendario' && (
              <Calendario
                partidos={datos.partidos.filter((p) => categorias.some((c) => c.id === p.categoria_id))}
                categorias={categorias}
                publicada={torneo.programacion_publicada}
                nombre={nombre}
                mias={mias}
              />
            )}

            {categoria && (
              // Cada categoría se sortea por separado: se ve en cuanto tiene grupos.
              !datos.grupos.some((g) => g.categoria_id === categoria.id) ? (
                <p style={{ fontSize: '14px', color: '#555' }}>
                  El sorteo de los grupos todavía no se ha hecho · {categoria.inscritas}{' '}
                  {categoria.modalidad === 'doble' ? `dupla${categoria.inscritas === 1 ? '' : 's'} formada${categoria.inscritas === 1 ? '' : 's'}` : `inscrita${categoria.inscritas === 1 ? '' : 's'}`}.
                </p>
              ) : (
                <>
                  <Grupos grupos={datos.grupos.filter((g) => g.categoria_id === categoria.id)} nombre={nombre} mias={mias} />
                  <Llave partidos={datos.partidos.filter((p) => p.categoria_id === categoria.id && p.fase !== 'grupo')} nombre={nombre} mias={mias} />
                  <Calendario
                    partidos={datos.partidos.filter((p) => p.categoria_id === categoria.id)}
                    categorias={[categoria]}
                    publicada={torneo.programacion_publicada}
                    nombre={nombre}
                    mias={mias}
                  />
                </>
              )
            )}
          </>
        )}
      </div>
    </main>
  )
}

const titulo: React.CSSProperties = { fontFamily: 'var(--font-display)', color: 'var(--color-ink)', fontSize: '18px', margin: '18px 0 10px 0' }

function Grupos({ grupos, nombre, mias }: { grupos: Grupo[]; nombre: (id: string | null) => string | null; mias: Set<string> }) {
  if (!grupos.length) return null
  const th: React.CSSProperties = { padding: '5px 4px', fontSize: '11px', color: '#666', fontWeight: 700, textAlign: 'center' }
  const td: React.CSSProperties = { padding: '6px 4px', fontSize: '13px', textAlign: 'center', fontFamily: 'var(--font-mono)' }
  return (
    <section>
      <h2 style={titulo}>Grupos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '12px' }}>
        {grupos.map((g) => (
          <div key={g.id} style={{ background: 'white', border: '1px solid rgba(15,27,38,0.12)', borderRadius: '6px', padding: '10px', overflowX: 'auto' }}>
            <strong style={{ fontSize: '14px' }}>Grupo {g.letra}</strong>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px' }}>
              <thead>
                <tr>
                  <th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Nombre</th><th style={th}>PJ</th><th style={th}>PG</th><th style={th}>PP</th><th style={th}>Sets</th><th style={th}>Games</th>
                </tr>
              </thead>
              <tbody>
                {g.tabla.map((f) => (
                  <tr key={f.equipo_id} style={{ borderTop: '1px solid #eee', background: mias.has(f.equipo_id) ? RESALTE : undefined }}>
                    <td style={td}>{f.posicion}{f.requiere_sorteo ? '*' : ''}</td>
                    <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)', fontWeight: mias.has(f.equipo_id) ? 800 : 500 }}>{nombre(f.equipo_id)}</td>
                    <td style={td}>{f.pj}</td><td style={td}>{f.pg}</td><td style={td}>{f.pp}</td>
                    <td style={td}>{f.sets_favor}-{f.sets_contra}</td><td style={td}>{f.games_favor}-{f.games_contra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {g.tabla.some((f) => f.requiere_sorteo) && (
              <p style={{ fontSize: '11px', color: '#888', margin: '6px 0 0 0' }}>
                * Empate pendiente de revisión.
                {g.tabla.some((f) => f.requiere_sorteo && f.stb_puntos_favor + f.stb_puntos_contra > 0) && (
                  <> Puntos de súper tie-break: {g.tabla.filter((f) => f.requiere_sorteo).map((f) => `${nombre(f.equipo_id)} ${f.stb_puntos_favor}-${f.stb_puntos_contra}`).join(' · ')}.</>
                )}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Ficha({ p, nombre, mias, encabezado }: { p: Partido; nombre: (id: string | null) => string | null; mias: Set<string>; encabezado?: string }) {
  const lado = (l: 'a' | 'b') => {
    const id = l === 'a' ? p.equipo_a : p.equipo_b
    const gana = !!p.ganador && p.ganador === id
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '5px 8px', background: id && mias.has(id) ? RESALTE : undefined, fontWeight: gana ? 800 : 500 }}>
        <span style={{ color: id ? 'var(--color-ink)' : '#888', fontStyle: id ? 'normal' : 'italic', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {id ? nombre(id) : origenTexto(l === 'a' ? p.origen_a : p.origen_b)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{marcador(p, l)}</span>
      </div>
    )
  }
  return (
    <div style={{ background: 'white', border: '1px solid rgba(15,27,38,0.18)', borderRadius: '6px', fontSize: '13px', overflow: 'hidden' }}>
      <div style={{ fontSize: '11px', color: '#666', padding: '4px 8px', background: 'rgba(15,27,38,0.04)' }}>
          {encabezado ?? `${etapa(p)}${p.fecha_hora ? ` · ${formatearFechaCorta(p.fecha_hora, { mes: 'corto' })} ${formatearHora(p.fecha_hora)} · ${p.cancha}` : ''}`}
      </div>
      {lado('a')}
      <div style={{ borderTop: '1px solid #eee' }} />
      {lado('b')}
      {p.handicap && (
        <div style={{ fontSize: '11px', color: '#8a5a00', padding: '3px 8px', background: '#fff8e1' }}>Handicap 15-0 por game: {nombre(p.handicap)}</div>
      )}
    </div>
  )
}

function Llave({ partidos, nombre, mias }: { partidos: Partido[]; nombre: (id: string | null) => string | null; mias: Set<string> }) {
  if (!partidos.length) return null
  const columnas = FASES_LLAVE.map((f) => partidos.filter((p) => p.fase === f).sort((a, b) => a.orden - b.orden)).filter((c) => c.length)
  const altura = Math.max(...columnas.map((c) => c.length)) * 120
  return (
    <section>
      <h2 style={titulo}>Llave</h2>
      <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: '8px' }}>
        {columnas.map((col) => (
          <div key={col[0].fase} style={{ flex: '0 0 min(260px, 82vw)', scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--color-ink)', marginBottom: '6px' }}>{ETIQUETA_FASE[col[0].fase]}</div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: '10px', minHeight: `${altura}px` }}>
              {col.map((p, i) => (
                <div key={p.id}>
                  {col.length > 1 && i === col.length / 2 && <div style={{ borderTop: '1px dashed rgba(15,27,38,0.25)', margin: '0 0 10px 0' }} />}
                  <Ficha p={p} nombre={nombre} mias={mias} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {columnas[0].length > 1 && <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0 0' }}>Serie 1 arriba, serie 2 abajo: dos del mismo grupo solo pueden volver a verse en la final.</p>}
    </section>
  )
}

function Calendario({ partidos, categorias, publicada, nombre, mias }: {
  partidos: Partido[]; categorias: Categoria[]; publicada: boolean; nombre: (id: string | null) => string | null; mias: Set<string>
}) {
  const conHora = partidos.filter((p) => p.fecha_hora).sort((a, b) => a.fecha_hora!.localeCompare(b.fecha_hora!) || (a.cancha ?? '').localeCompare(b.cancha ?? ''))
  const porDia = new Map<string, Partido[]>()
  for (const p of conHora) {
    const d = fechaISOEnCaracas(p.fecha_hora!)
    porDia.set(d, [...(porDia.get(d) || []), p])
  }
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]))
  return (
    <section>
      <h2 style={titulo}>Calendario</h2>
      {!publicada || !conHora.length ? (
        <p style={{ fontSize: '14px', color: '#555' }}>El calendario con días, horas y canchas se publica después del sorteo.</p>
      ) : (
        [...porDia.entries()].map(([dia, lista]) => (
          <div key={dia} style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '14px', margin: '0 0 6px 0', color: 'var(--color-ink)' }}>{mayuscula(formatearFechaLarga(instanteEnCaracas(dia, '12:00')))}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '8px' }}>
              {lista.map((p) => (
                <Ficha
                  key={p.id}
                  p={p}
                  nombre={nombre}
                  mias={mias}
                  encabezado={`${formatearHora(p.fecha_hora!)} · ${p.cancha} · ${categorias.length > 1 ? `${nombreCat.get(p.categoria_id)} · ` : ''}${etapa(p)}`}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
