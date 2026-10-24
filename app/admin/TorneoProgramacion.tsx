'use client'
import { useEffect, useMemo, useState } from 'react'
import { fechaISOEnCaracas, formatearFechaHora, formatearFechaLarga, formatearHora } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_PARTIDO, ETIQUETA_FASE, type EstadoPartido, type Fase } from '@/lib/torneo'

// Programación del torneo (SPEC §4), dentro de la pestaña Torneo del admin:
// asistente (propone sin guardar), confirmación, asignación a mano con
// errores y avisos, handicap del Mixto y publicación. Todo por
// /api/admin/torneo/programacion/...

type Partido = {
  id: string
  categoriaId: string
  categoriaNombre: string
  categoriaOrden: number
  esInfantil: boolean
  esMixto: boolean
  duracionMin: number
  fase: Fase
  grupoLetra: string | null
  orden: number
  origen_a: string | null
  origen_b: string | null
  estado: EstadoPartido
  retiro: boolean
  cerrado: boolean
  equipo_a: string | null
  equipo_b: string | null
  nombre_a: string | null
  nombre_b: string | null
  handicap_equipo_id: string | null
  cancha: string | null
  inicio: string | null
  errores: string[]
  avisos: string[]
}

type TurnoOpcion = { cancha: string; inicio: string }

type Datos = {
  torneo: { id: string; estado: string; fecha_inicio: string; fecha_fin: string; programacion_publicada_at: string | null; programacion_publicada_por_nombre: string | null } | null
  partidos: Partido[]
  turnos: { adultos: TurnoOpcion[]; infantiles: Record<string, TurnoOpcion[]> }
}

type Propuesta = { asignaciones: { partidoId: string; cancha: string; inicio: string }[]; sinHorario: { partidoId: string; motivo: string }[] }

const RANGO_FASE: Record<Fase, number> = { grupo: 0, cuartos: 1, semis: 2, final: 3 }
const PREFIJO: Record<Exclude<Fase, 'grupo'>, string> = { cuartos: 'C', semis: 'S', final: 'F' }

const tarjeta: React.CSSProperties = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }
const btn = (color: string, relleno = false): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
  border: `1px solid ${color}`, background: relleno ? color : 'white', color: relleno ? 'white' : color, whiteSpace: 'nowrap',
})

const etiqueta = (p: Partido) => (p.fase === 'grupo' ? `Grupo ${p.grupoLetra} · P${p.orden}` : `${ETIQUETA_FASE[p.fase]} ${PREFIJO[p.fase]}${p.orden}`)
const rivales = (p: Partido) =>
  `${p.nombre_a ?? (p.origen_a ? origenTexto(p.origen_a) : '—')} vs ${p.nombre_b ?? (p.origen_b ? origenTexto(p.origen_b) : '—')}`
const origenTexto = (o: string) => {
  const g = o.match(/^([1-9])([A-Z])$/)
  if (g) return `${g[1]}º grupo ${g[2]}`
  const w = o.match(/^G:(.+)$/)
  return w ? `Ganador ${w[1]}` : o
}
const turnoTexto = (t: TurnoOpcion) => `${formatearFechaHora(t.inicio)} · ${t.cancha}`

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export default function TorneoProgramacion() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState<{ errores: string[]; avisos: string[] } | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [categoria, setCategoria] = useState('todas')
  const [eleccion, setEleccion] = useState<Record<string, string>>({})

  const cargar = async () => {
    try {
      const res = await fetch('/api/admin/torneo/programacion', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la programación')
      setDatos(data)
    } catch (err: any) {
      setError(err.message)
    }
  }
  useEffect(() => { cargar() }, [])

  const post = async (ruta: string, body: object = {}) => {
    const res = await fetch(`/api/admin/torneo/programacion/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    return { res, data }
  }

  const ejecutar = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave); setError(''); setMensaje(''); setDetalle(null)
    try { await fn() } catch (err: any) { setError(err.message) } finally { setOcupado(null) }
  }

  // Guarda horarios; si el servidor responde con avisos, pregunta si forzar.
  const guardar = async (asignaciones: { partidoId: string; cancha: string | null; inicio: string | null }[], exito: string) => {
    let { res, data } = await post('guardar', { asignaciones })
    if (res.status === 409 && data.requiereConfirmar) {
      if (!confirm(`Avisos:\n\n• ${data.avisos.join('\n• ')}\n\n¿Guardar igual?`)) return false
      ;({ res, data } = await post('guardar', { asignaciones, forzar: true }))
    }
    if (!res.ok) {
      setDetalle({ errores: data.errores || [], avisos: data.avisos || [] })
      throw new Error(data.error || 'No se pudo guardar')
    }
    setMensaje(exito)
    await cargar()
    return true
  }

  const porId = useMemo(() => new Map((datos?.partidos || []).map((p) => [p.id, p])), [datos])

  if (!datos) return <p className="loading-row">{error || <><span className="spinner" /> Cargando programación…</>}</p>
  if (!datos.torneo) return <p>No hay un torneo en organización.</p>
  const { torneo, partidos, turnos } = datos
  if (!['sorteado', 'en_curso', 'finalizado'].includes(torneo.estado) || !partidos.length) {
    return <div style={tarjeta}><p style={{ margin: 0 }}>La programación se arma después de publicar el sorteo.</p></div>
  }

  const categorias = [...new Map(partidos.map((p) => [p.categoriaId, { id: p.categoriaId, nombre: p.categoriaNombre, orden: p.categoriaOrden }])).values()].sort((a, b) => a.orden - b.orden)
  const visibles = partidos
    .filter((p) => categoria === 'todas' || p.categoriaId === categoria)
    .sort((a, b) => a.categoriaOrden - b.categoriaOrden || RANGO_FASE[a.fase] - RANGO_FASE[b.fase] || (a.grupoLetra ?? '').localeCompare(b.grupoLetra ?? '') || a.orden - b.orden)
  const conHorario = partidos.filter((p) => p.inicio).length
  const conConflicto = partidos.filter((p) => p.errores.length || p.avisos.length).length
  const opcionesDe = (p: Partido) => (p.esInfantil ? turnos.infantiles[p.duracionMin] || [] : turnos.adultos)

  return (
    <div>
      <div style={tarjeta}>
        <h4 style={{ margin: '0 0 6px 0', color: 'var(--color-ink)' }}>📅 Programación</h4>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#555' }}>
          {conHorario}/{partidos.length} partidos con horario{conConflicto ? <> · <strong style={{ color: '#c0392b' }}>{conConflicto} con conflictos</strong></> : null}
          {torneo.programacion_publicada_at
            ? <> · <strong>Publicada</strong> el {formatearFechaHora(torneo.programacion_publicada_at)}{torneo.programacion_publicada_por_nombre ? ` por ${torneo.programacion_publicada_por_nombre}` : ''}. Cada cambio de horario avisa a los afectados.</>
            : ' · Sin publicar: los jugadores todavía no reciben avisos.'}
        </p>
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#666' }}>
          Adultos: plantilla de turnos nocturnos (finales el viernes {torneo.fecha_fin.split('-').reverse().slice(0, 2).join('/')}). Infantiles: solo dentro de las franjas de la academia (pestaña Horario academia).
          Al guardar un horario se bloquea la cancha; al quitarlo se libera.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button disabled={ocupado === 'asistente'} onClick={() => ejecutar('asistente', async () => {
            const { res, data } = await post('asistente')
            if (!res.ok) throw new Error(data.error || 'No se pudo proponer')
            setPropuesta(data)
          })} style={btn('var(--color-court)', true)}>
            {ocupado === 'asistente' ? 'Pensando…' : '🤖 Asistente: proponer horarios'}
          </button>
          {!torneo.programacion_publicada_at && conHorario > 0 && (
            <button disabled={ocupado === 'publicar'} onClick={() => {
              const faltan = partidos.length - conHorario
              if (!confirm(`¿Publicar la programación? Se avisa a cada jugador o representante (campana y correo) con sus partidos.${faltan ? `\n\nOjo: ${faltan} partidos siguen sin horario.` : ''}`)) return
              ejecutar('publicar', async () => {
                const { res, data } = await post('publicar')
                if (!res.ok) throw new Error(data.error || 'No se pudo publicar')
                setMensaje('Programación publicada y avisos enviados')
                await cargar()
              })
            }} style={btn('#c0392b', true)}>
              {ocupado === 'publicar' ? 'Publicando…' : '📣 Publicar programación'}
            </button>
          )}
        </div>
      </div>

      {mensaje && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{mensaje}</p>}
      {error && (
        <div style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '14px', marginBottom: '12px' }}>
          {error}
          {detalle && (detalle.errores.length > 0 || detalle.avisos.length > 0) && (
            <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '13px' }}>
              {detalle.errores.map((e) => <li key={e}>⛔ {e}</li>)}
              {detalle.avisos.map((e) => <li key={e}>⚠️ {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {propuesta && (
        <div style={tarjeta}>
          <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-ink)' }}>Propuesta del asistente (sin guardar)</h4>
          {propuesta.asignaciones.length === 0 && <p style={{ fontSize: '13px', margin: '0 0 8px 0' }}>No hay horarios nuevos para proponer.</p>}
          {Object.entries(
            propuesta.asignaciones.reduce<Record<string, Propuesta['asignaciones']>>((acc, a) => {
              const d = fechaISOEnCaracas(a.inicio)
              ;(acc[d] ||= []).push(a)
              return acc
            }, {}),
          ).sort(([a], [b]) => a.localeCompare(b)).map(([dia, lista]) => (
            <div key={dia} style={{ marginBottom: '8px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{mayuscula(formatearFechaLarga(lista[0].inicio))}</div>
              {lista.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.cancha.localeCompare(b.cancha)).map((a) => {
                const p = porId.get(a.partidoId)
                return (
                  <div key={a.partidoId} style={{ fontSize: '12px', paddingLeft: '10px' }}>
                    {formatearHora(a.inicio)} {a.cancha} · {p ? `${p.categoriaNombre} · ${etiqueta(p)} · ${rivales(p)}` : a.partidoId}
                  </div>
                )
              })}
            </div>
          ))}
          {propuesta.sinHorario.length > 0 && (
            <div style={{ background: '#fff4d6', color: '#8a5a00', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', margin: '8px 0' }}>
              <strong>Sin horario ({propuesta.sinHorario.length}) — asígnalos a mano:</strong>
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                {propuesta.sinHorario.map((s) => {
                  const p = porId.get(s.partidoId)
                  return <li key={s.partidoId}>{p ? `${p.categoriaNombre} · ${etiqueta(p)}` : s.partidoId}: {s.motivo}</li>
                })}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            {propuesta.asignaciones.length > 0 && (
              <button disabled={ocupado === 'confirmar'} onClick={() => ejecutar('confirmar', async () => {
                const ok = await guardar(propuesta.asignaciones, `${propuesta.asignaciones.length} partidos programados y canchas bloqueadas`)
                if (ok) setPropuesta(null)
              })} style={btn('var(--color-court)', true)}>
                {ocupado === 'confirmar' ? 'Guardando…' : `✅ Confirmar ${propuesta.asignaciones.length} horarios`}
              </button>
            )}
            <button onClick={() => setPropuesta(null)} style={btn('#666')}>Descartar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {[{ id: 'todas', nombre: 'Todas' }, ...categorias].map((c) => (
          <button key={c.id} onClick={() => setCategoria(c.id)} style={{
            padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
            border: categoria === c.id ? '2px solid var(--color-ink)' : '1px solid #ddd',
            background: categoria === c.id ? 'var(--color-ink)' : 'white', color: categoria === c.id ? 'white' : 'var(--color-ink)',
          }}>{c.nombre}</button>
        ))}
      </div>

      <div style={tarjeta}>
        {visibles.map((p, idx) => {
          const opciones = opcionesDe(p)
          const elegido = eleccion[p.id] ?? ''
          return (
            <div key={p.id} style={{ borderTop: idx ? '1px solid #e5e5e5' : 'none', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: '13px' }}>
                  <strong>{p.categoriaNombre}</strong> · {etiqueta(p)} · {rivales(p)}
                  <div style={{ fontSize: '12px', color: p.inicio ? '#1e6b34' : '#888' }}>
                    {p.inicio ? `📅 ${formatearFechaHora(p.inicio)} · ${p.cancha}` : 'Sin horario'} · {ETIQUETA_ESTADO_PARTIDO[p.estado]}{p.retiro ? ' (retiro)' : ''}
                  </div>
                </div>
                {!p.cerrado && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={elegido} onChange={(e) => setEleccion({ ...eleccion, [p.id]: e.target.value })} style={{ padding: '5px', fontSize: '12px', borderRadius: '6px', border: '1px solid #ccc', maxWidth: '260px' }}>
                      <option value="">{opciones.length ? 'Elegir turno…' : p.esInfantil ? 'Sin franjas de la academia' : 'Sin turnos'}</option>
                      {opciones.map((t) => <option key={`${t.cancha}|${t.inicio}`} value={`${t.cancha}|${t.inicio}`}>{turnoTexto(t)}</option>)}
                    </select>
                    <button disabled={!elegido || ocupado === p.id} onClick={() => ejecutar(p.id, async () => {
                      const [cancha, inicio] = elegido.split('|')
                      await guardar([{ partidoId: p.id, cancha, inicio }], 'Horario guardado')
                      setEleccion((e) => ({ ...e, [p.id]: '' }))
                    })} style={btn('var(--color-court)', true)}>Guardar</button>
                    {p.inicio && (
                      <button disabled={ocupado === p.id} onClick={() => {
                        if (!confirm('¿Quitar el horario de este partido? Se libera la cancha.')) return
                        ejecutar(p.id, async () => { await guardar([{ partidoId: p.id, cancha: null, inicio: null }], 'Horario quitado') })
                      }} style={btn('#c0392b')}>Quitar</button>
                    )}
                  </div>
                )}
              </div>
              {p.esMixto && p.equipo_a && p.equipo_b && !p.cerrado && (
                <div style={{ fontSize: '12px', marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  Handicap 15-0:
                  <select
                    value={p.handicap_equipo_id ?? ''}
                    disabled={ocupado === `h-${p.id}`}
                    onChange={(e) => ejecutar(`h-${p.id}`, async () => {
                      const res = await fetch('/api/admin/torneo/programacion/handicap', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ partidoId: p.id, inscripcionId: e.target.value || null }),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el handicap')
                      setMensaje('Handicap guardado')
                      await cargar()
                    })}
                    style={{ padding: '4px', fontSize: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
                  >
                    <option value="">Sin handicap</option>
                    <option value={p.equipo_a}>{p.nombre_a}</option>
                    <option value={p.equipo_b}>{p.nombre_b}</option>
                  </select>
                </div>
              )}
              {(p.errores.length > 0 || p.avisos.length > 0) && (
                <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '12px' }}>
                  {p.errores.map((e) => <li key={e} style={{ color: '#c0392b' }}>⛔ {e}</li>)}
                  {p.avisos.map((e) => <li key={e} style={{ color: '#8a5a00' }}>⚠️ {e}</li>)}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
