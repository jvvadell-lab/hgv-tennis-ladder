'use client'
import { useEffect, useMemo, useState } from 'react'
import FormMarcadorTorneo from '@/app/components/FormMarcadorTorneo'
import { formatearFechaHora } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_PARTIDO, ETIQUETA_FASE, PREFIJO_FASE, type EstadoPartido, type Fase } from '@/lib/torneo'
import type { SetJugado, TipoResultado } from '@/lib/resultados'
import { textoMarcador } from '@/lib/torneoResultados'

// Resultados del torneo (SPEC §5, §6 y §8), dentro de la pestaña Torneo del
// admin: validar lo que reportan los jugadores, cargar un resultado y
// validarlo de una vez, y marcar WO / doble WO. Cada validación corre el
// avance automático (tabla del grupo → llave, ganador → ronda siguiente).
// Todo por /api/admin/torneo/resultados/...

type Partido = {
  id: string
  categoria_id: string
  categoria_nombre: string
  fase: Fase
  grupo_letra: string | null
  orden: number
  equipo_a: string | null
  equipo_b: string | null
  nombre_a: string | null
  nombre_b: string | null
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

type Filtro = 'por_validar' | 'por_jugar' | 'cerrados' | 'todos'

const tarjeta: React.CSSProperties = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }
const btn = (color: string, relleno = false): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
  border: `1px solid ${color}`, background: relleno ? color : 'white', color: relleno ? 'white' : color, whiteSpace: 'nowrap',
})

const etiqueta = (p: Partido) =>
  p.fase === 'grupo' ? `Grupo ${p.grupo_letra} · P${p.orden}` : `${ETIQUETA_FASE[p.fase]} ${PREFIJO_FASE[p.fase as Exclude<Fase, 'grupo'>]}${p.orden}`

const porValidar = (p: Partido) => !p.validado && !!p.reportado_at
const porJugar = (p: Partido) => !p.validado && !p.reportado_at && !!p.equipo_a && !!p.equipo_b

export default function TorneoResultados() {
  const [partidos, setPartidos] = useState<Partido[] | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('por_validar')
  const [categoria, setCategoria] = useState('todas')
  const [cargando, setCargando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [avisos, setAvisos] = useState<string[]>([])
  const [error, setError] = useState('')

  const cargar = async () => {
    try {
      const res = await fetch('/api/admin/torneo/resultados', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar los resultados')
      setPartidos(data.partidos)
    } catch (err: any) {
      setError(err.message)
    }
  }
  useEffect(() => { cargar() }, [])

  const post = async (ruta: string, body: object, exito: string) => {
    setOcupado(JSON.stringify(body))
    setMensaje('')
    setAvisos([])
    setError('')
    try {
      const res = await fetch(`/api/admin/torneo/resultados/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo completar')
      setMensaje(exito)
      setAvisos(data.avisos ?? [])
      await cargar()
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setOcupado(null)
    }
  }

  const categorias = useMemo(() => [...new Map((partidos ?? []).map((p) => [p.categoria_id, p.categoria_nombre])).entries()], [partidos])
  const conteo = (f: (p: Partido) => boolean) => (partidos ?? []).filter(f).length

  if (!partidos) return <p className="loading-row"><span className="spinner" /> Cargando resultados…</p>
  if (!partidos.length) return <div style={tarjeta}><p style={{ margin: 0 }}>{error || 'Todavía no hay partidos: aparecen al publicar el sorteo.'}</p></div>

  const visibles = partidos.filter((p) =>
    (categoria === 'todas' || p.categoria_id === categoria) &&
    (filtro === 'todos' || (filtro === 'por_validar' && porValidar(p)) || (filtro === 'por_jugar' && porJugar(p)) || (filtro === 'cerrados' && p.validado)))

  const filtros: [Filtro, string, number][] = [
    ['por_validar', 'Por validar', conteo(porValidar)],
    ['por_jugar', 'Por jugar', conteo(porJugar)],
    ['cerrados', 'Cerrados', conteo((p) => p.validado)],
    ['todos', 'Todos', partidos.length],
  ]

  return (
    <div>
      {mensaje && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{mensaje}</p>}
      {avisos.map((a) => <p key={a} style={{ background: '#fff4d6', color: '#8a5a00', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>⚠️ {a}</p>)}
      {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
        {filtros.map(([id, texto, n]) => (
          <button key={id} onClick={() => setFiltro(id)} style={{
            padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
            border: filtro === id ? '2px solid var(--color-ink)' : '1px solid #ddd', background: filtro === id ? 'var(--color-ink)' : 'white', color: filtro === id ? 'white' : 'var(--color-ink)',
          }}>
            {texto} <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.8 }}>{n}</span>
          </button>
        ))}
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ marginLeft: 'auto', padding: '6px', fontSize: '13px', borderRadius: '6px', border: '1px solid #ccc' }}>
          <option value="todas">Todas las categorías</option>
          {categorias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
      </div>

      <div style={tarjeta}>
        {visibles.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>No hay partidos en esta lista.</p>}
        {visibles.map((p, i) => {
          const conRivales = !!p.equipo_a && !!p.equipo_b
          const marcador = textoMarcador(p)
          return (
            <div key={p.id} style={{ borderTop: i ? '1px solid #e5e5e5' : 'none', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{p.categoria_nombre} · {etiqueta(p)} · {p.fecha_hora ? `${formatearFechaHora(p.fecha_hora)} · ${p.cancha}` : 'sin horario'}</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-ink)' }}>
                    <span style={{ color: p.validado && p.ganador_equipo_id === p.equipo_a ? '#1e6b34' : 'inherit' }}>{p.nombre_a ?? 'Por definir'}</span>
                    <span style={{ color: '#888', fontWeight: 'normal' }}> vs </span>
                    <span style={{ color: p.validado && p.ganador_equipo_id === p.equipo_b ? '#1e6b34' : 'inherit' }}>{p.nombre_b ?? 'Por definir'}</span>
                  </div>
                  {marcador && <div style={{ fontSize: '13px' }}>{p.validado ? '✓ ' : 'Reportado: '}<strong>{marcador}</strong></div>}
                </div>
                <span style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {p.validado ? (
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e6b34' }}>{ETIQUETA_ESTADO_PARTIDO[p.estado]} · validado</span>
                  ) : conRivales && (
                    <>
                      {porValidar(p) && <button disabled={!!ocupado} onClick={() => post('validar', { partidoId: p.id }, 'Resultado validado').catch(() => {})} style={btn('#1e6b34', true)}>Validar</button>}
                      <button disabled={!!ocupado} onClick={() => setCargando(cargando === p.id ? null : p.id)} style={btn('var(--color-court)')}>{porValidar(p) ? 'Corregir y validar' : 'Cargar resultado'}</button>
                      <select
                        disabled={!!ocupado}
                        value=""
                        onChange={(e) => {
                          const ausente = e.target.value
                          if (!ausente) return
                          const quien = ausente === 'ambos' ? 'doble WO (no se presentó ninguno)' : `WO: no se presentó ${ausente === p.equipo_a ? p.nombre_a : p.nombre_b}`
                          if (!confirm(`¿Registrar ${quien}? Queda validado.`)) return
                          post('wo', { partidoId: p.id, ausente }, ausente === 'ambos' ? 'Doble WO registrado' : 'WO registrado').catch(() => {})
                        }}
                        style={{ fontSize: '12px', padding: '4px', borderRadius: '6px', border: '1px solid #c0392b', color: '#c0392b' }}
                      >
                        <option value="">WO…</option>
                        <option value={p.equipo_a!}>No vino {p.nombre_a}</option>
                        <option value={p.equipo_b!}>No vino {p.nombre_b}</option>
                        <option value="ambos">Doble WO</option>
                      </select>
                    </>
                  )}
                </span>
              </div>
              {cargando === p.id && conRivales && (
                <FormMarcadorTorneo
                  nombreA={p.nombre_a ?? 'A'}
                  nombreB={p.nombre_b ?? 'B'}
                  inscripcionA={p.equipo_a!}
                  inscripcionB={p.equipo_b!}
                  textoBoton="Guardar y validar"
                  onEnviar={async (d) => {
                    await post('cargar', { partidoId: p.id, ...d }, 'Resultado cargado y validado')
                    setCargando(null)
                  }}
                  onCancelar={() => setCargando(null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
