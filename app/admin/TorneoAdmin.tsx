'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatearFechaConAnio, formatearFechaHora, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_INSCRIPCION, ETIQUETA_ESTADO_TORNEO, NIVELES, type EstadoInscripcion, type EstadoTorneo, type Nivel } from '@/lib/torneo'
import {
  DIAS_TORNEO,
  ETIQUETA_GENERO_JUGADOR,
  ETIQUETA_NIVEL,
  FRANJAS_TORNEO,
  celdaDisponibilidad,
  nivelAdmitido,
} from '@/lib/torneoInscripcion'
import { ETIQUETA_TIPO_PAGO, type TipoPago } from '@/lib/delegacion'

// Pestaña Torneo del admin (Torneo Navidad, fase 3): inscripciones por
// categoría con su estado, pagos (validar / rechazar), categoría oficial de
// cada jugador (asignar / confirmar) y limitaciones de horario. Todo por
// /api/admin/torneo/...

type Jugador = {
  id: string
  nombre: string
  genero: string
  categoria: string
  categoria_torneo: string | null
  telefono: string | null
  email: string | null
}

type Pago = {
  id: string
  numero_recibo: number
  jugador_id: string
  tipo_pago: string
  monto: number
  fecha: string
  referencia: string | null
  validado: boolean
  tasa_bcv_eur: number | null
}

type Inscripcion = {
  id: string
  categoria_id: string
  estado: EstadoInscripcion
  created_at: string
  jugadores: Jugador[]
  pagos: Pago[]
  pendientes: { tipo: string; jugadorId: string; texto: string }[]
}

type Categoria = { id: string; nombre: string; modalidad: string; genero: string; categoria_nivel: Nivel | null; cupo: number }

type Disponibilidad = { jugador_id: string; no_disponible: string[]; nota: string | null }

type Datos = {
  torneo: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; estado: EstadoTorneo; monto_inscripcion_eur: number } | null
  categorias: Categoria[]
  inscripciones: Inscripcion[]
  disponibilidad: Disponibilidad[]
}

const fecha = (iso: string) => formatearFechaConAnio(instanteEnCaracas(iso, '12:00'))
const bs = (n: number) => `Bs. ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const COLOR_ESTADO: Record<EstadoInscripcion, { fondo: string; texto: string }> = {
  pendiente_pago: { fondo: '#fff4d6', texto: '#8a5a00' },
  confirmada: { fondo: '#dff5e3', texto: '#1e6b34' },
  retirada: { fondo: '#eee', texto: '#777' },
}

const boton = (color: string, relleno = false): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
  border: `1px solid ${color}`, background: relleno ? color : 'white', color: relleno ? 'white' : color, whiteSpace: 'nowrap',
})

export default function TorneoAdmin({ esAdminCompleto }: { esAdminCompleto: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [categoriaSel, setCategoriaSel] = useState<string>('todas')
  const [verRetiradas, setVerRetiradas] = useState(false)

  const cargar = async () => {
    try {
      const res = await fetch('/api/admin/torneo', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar el torneo')
      setDatos(data)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  // POST a una ruta del torneo, con mensaje y recarga.
  const accion = async (clave: string, ruta: string, body: object, exito: string) => {
    setOcupado(clave)
    setMensaje('')
    setError('')
    try {
      const res = await fetch(`/api/admin/torneo/${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción')
      setMensaje(exito)
      await cargar()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setOcupado(null)
    }
  }

  const disponibilidadDe = useMemo(
    () => new Map((datos?.disponibilidad || []).map((d) => [d.jugador_id, d])),
    [datos]
  )

  if (cargando) return <p className="loading-row"><span className="spinner" /> Cargando torneo…</p>
  if (!datos?.torneo) {
    return (
      <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px' }}>
        <p style={{ margin: 0 }}>{error || 'No hay un torneo en organización. Se crea con la migración del Torneo Navidad.'}</p>
      </div>
    )
  }

  const { torneo, categorias, inscripciones } = datos
  const vivas = inscripciones.filter((i) => i.estado !== 'retirada')
  const categoriasVisibles = categorias.filter((c) => categoriaSel === 'todas' || c.id === categoriaSel)

  return (
    <div>
      <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ color: 'var(--color-ink)', margin: 0 }}>🎄 {torneo.nombre}</h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#555' }}>
              {fecha(torneo.fecha_inicio)} al {fecha(torneo.fecha_fin)} · {torneo.monto_inscripcion_eur} € por jugador ·{' '}
              <strong>{ETIQUETA_ESTADO_TORNEO[torneo.estado]}</strong>
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#555' }}>
              {vivas.length} inscripciones · {vivas.filter((i) => i.estado === 'confirmada').length} confirmadas
            </p>
          </div>
          {esAdminCompleto && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && (
            <button
              disabled={ocupado === 'estado'}
              onClick={() => {
                const abrir = torneo.estado === 'borrador'
                if (!confirm(abrir ? '¿Abrir las inscripciones? Los jugadores podrán inscribirse desde la app.' : '¿Cerrar las inscripciones? Nadie más podrá inscribirse.')) return
                accion('estado', 'estado', { torneoId: torneo.id, estado: abrir ? 'inscripcion' : 'borrador' }, abrir ? 'Inscripciones abiertas' : 'Inscripciones cerradas')
              }}
              style={boton(torneo.estado === 'borrador' ? 'var(--color-court)' : '#c0392b', true)}
            >
              {torneo.estado === 'borrador' ? '🔓 Abrir inscripciones' : '🔒 Cerrar inscripciones'}
            </button>
          )}
        </div>
      </div>

      {mensaje && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{mensaje}</p>}
      {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        {[{ id: 'todas', nombre: 'Todas', cupo: 0 }, ...categorias].map((c) => {
          const n = vivas.filter((i) => c.id === 'todas' || i.categoria_id === c.id).length
          const activa = categoriaSel === c.id
          return (
            <button
              key={c.id}
              onClick={() => setCategoriaSel(c.id)}
              style={{
                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
                border: activa ? '2px solid var(--color-ink)' : '1px solid #ddd',
                background: activa ? 'var(--color-ink)' : 'white', color: activa ? 'white' : 'var(--color-ink)',
              }}
            >
              {c.nombre} <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.8 }}>{c.id === 'todas' ? n : `${n}/${c.cupo}`}</span>
            </button>
          )
        })}
        <label style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
          <input type="checkbox" checked={verRetiradas} onChange={(e) => setVerRetiradas(e.target.checked)} /> Ver retiradas
        </label>
      </div>

      {categoriasVisibles.map((c) => {
        const lista = inscripciones.filter((i) => i.categoria_id === c.id && (verRetiradas || i.estado !== 'retirada'))
        const nivel = c.categoria_nivel ? ETIQUETA_NIVEL[c.categoria_nivel] + (c.categoria_nivel === 'sexta' ? ' (incluye Novato)' : '') : 'Nivel libre'
        return (
          <div key={c.id} style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <h4 style={{ color: 'var(--color-ink)', margin: '0 0 4px 0' }}>{c.nombre}</h4>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#666' }}>
              {c.modalidad === 'doble' ? 'Dobles' : 'Single'} · {nivel} · cupo {lista.filter((i) => i.estado !== 'retirada').length}/{c.cupo}
            </p>
            {lista.length === 0 && <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Sin inscripciones todavía.</p>}

            {lista.map((ins, idx) => (
              <div key={ins.id} style={{ borderTop: idx ? '1px solid #e5e5e5' : 'none', padding: '12px 0', opacity: ins.estado === 'retirada' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--color-ink)' }}>{ins.jugadores.map((j) => j.nombre).join(' / ')}</strong>
                  <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '999px', background: COLOR_ESTADO[ins.estado].fondo, color: COLOR_ESTADO[ins.estado].texto }}>
                      {ins.estado === 'pendiente_pago' ? 'Pendiente' : ETIQUETA_ESTADO_INSCRIPCION[ins.estado]}
                    </span>
                    {esAdminCompleto && ins.estado !== 'retirada' && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && (
                      <button
                        disabled={ocupado === `retirar-${ins.id}`}
                        onClick={() => {
                          if (!confirm(`¿Retirar la inscripción de ${ins.jugadores.map((j) => j.nombre).join(' / ')}? Se libera su cupo; sus pagos quedan registrados.`)) return
                          accion(`retirar-${ins.id}`, 'retirar-inscripcion', { inscripcionId: ins.id }, 'Inscripción retirada')
                        }}
                        style={boton('#c0392b')}
                      >
                        Retirar
                      </button>
                    )}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 8px 0' }}>Inscrita el {formatearFechaHora(ins.created_at)}</p>

                {ins.pendientes.length > 0 && (
                  <ul style={{ margin: '0 0 8px 0', paddingLeft: '18px', fontSize: '12px', color: '#8a5a00' }}>
                    {ins.pendientes.map((p) => <li key={`${p.tipo}-${p.jugadorId}`}>{p.texto}</li>)}
                  </ul>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: 'white' }}>
                    <thead>
                      <tr style={{ background: '#f3f5f7', textAlign: 'left' }}>
                        <th style={th}>Jugador</th>
                        <th style={th}>Categoría oficial</th>
                        <th style={th}>Pago</th>
                        <th style={th}>No puede jugar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ins.jugadores.map((j) => {
                        const pagos = ins.pagos.filter((p) => p.jugador_id === j.id)
                        const disp = disponibilidadDe.get(j.id)
                        const compatible = j.categoria_torneo ? nivelAdmitido(c.categoria_nivel, j.categoria_torneo) : null
                        return (
                          <tr key={j.id} style={{ borderTop: '1px solid #eee', verticalAlign: 'top' }}>
                            <td style={td}>
                              <div style={{ fontWeight: 'bold' }}>{j.nombre}</div>
                              <div style={{ color: '#777' }}>
                                {ETIQUETA_GENERO_JUGADOR[j.genero] || j.genero} · escalera: {ETIQUETA_NIVEL[j.categoria as Nivel] || j.categoria}
                              </div>
                              {j.telefono && <div style={{ color: '#777' }}>{j.telefono}</div>}
                            </td>
                            <td style={td}>
                              <CategoriaOficial
                                jugador={j}
                                compatible={compatible}
                                editable={esAdminCompleto}
                                ocupado={ocupado === `cat-${j.id}`}
                                onGuardar={(categoria) =>
                                  accion(`cat-${j.id}`, 'categoria-jugador', { jugadorId: j.id, categoria },
                                    categoria ? `${j.nombre}: categoría oficial ${ETIQUETA_NIVEL[categoria as Nivel]}` : `${j.nombre}: categoría oficial quitada`)
                                }
                              />
                            </td>
                            <td style={td}>
                              {pagos.length === 0 && <span style={{ color: '#999' }}>Sin reportar</span>}
                              {pagos.map((p) => (
                                <div key={p.id} style={{ marginBottom: '6px' }}>
                                  <div>
                                    <strong>{bs(p.monto)}</strong> · {ETIQUETA_TIPO_PAGO[p.tipo_pago as TipoPago] || p.tipo_pago} · {fecha(p.fecha)}
                                  </div>
                                  <div style={{ color: '#777' }}>
                                    Recibo #{p.numero_recibo}{p.referencia ? ` · ref. ${p.referencia}` : ''}{p.tasa_bcv_eur ? ` · tasa ${Number(p.tasa_bcv_eur).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''}
                                  </div>
                                  {p.validado ? (
                                    <span style={{ color: '#1e6b34', fontWeight: 'bold' }}>✓ Validado</span>
                                  ) : (
                                    <span style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                                      <span style={{ color: '#8a5a00', fontWeight: 'bold' }}>Por validar</span>
                                      <button disabled={ocupado === `pago-${p.id}`} onClick={() => accion(`pago-${p.id}`, 'validar-pago', { pagoId: p.id }, `Pago de ${j.nombre} validado`)} style={boton('#1e6b34', true)}>
                                        Validar
                                      </button>
                                      <button
                                        disabled={ocupado === `pago-${p.id}`}
                                        onClick={() => {
                                          if (!confirm(`¿Rechazar el pago de ${j.nombre}? Se borra y se le avisa para que lo reporte de nuevo.`)) return
                                          accion(`pago-${p.id}`, 'rechazar-pago', { pagoId: p.id }, `Pago de ${j.nombre} rechazado`)
                                        }}
                                        style={boton('#c0392b')}
                                      >
                                        Rechazar
                                      </button>
                                    </span>
                                  )}
                                </div>
                              ))}
                            </td>
                            <td style={td}>
                              {!disp || (disp.no_disponible.length === 0 && !disp.nota) ? (
                                <span style={{ color: '#999' }}>{disp ? 'Sin limitaciones' : 'No lo indicó'}</span>
                              ) : (
                                <>
                                  {disp.no_disponible.length > 0 && <MiniCuadricula celdas={disp.no_disponible} />}
                                  {disp.nota && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>“{disp.nota}”</div>}
                                </>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#555' }
const td: React.CSSProperties = { padding: '8px' }

// Asignar / confirmar la categoría oficial de torneo. "Confirmar" asigna la
// de la escalera de un clic; el selector permite cualquier otra.
function CategoriaOficial({ jugador, compatible, editable, ocupado, onGuardar }: {
  jugador: Jugador
  compatible: boolean | null
  editable: boolean
  ocupado: boolean
  onGuardar: (categoria: string | null) => void
}) {
  const actual = jugador.categoria_torneo
  return (
    <div>
      {actual ? (
        <div style={{ fontWeight: 'bold', color: compatible ? '#1e6b34' : '#c0392b' }}>
          {ETIQUETA_NIVEL[actual as Nivel] || actual}
          {!compatible && <div style={{ fontWeight: 'normal' }}>No corresponde a esta categoría</div>}
        </div>
      ) : (
        <div style={{ color: '#8a5a00', fontWeight: 'bold' }}>Por confirmar</div>
      )}
      {editable && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
          {!actual && (
            <button disabled={ocupado} onClick={() => onGuardar(jugador.categoria)} style={boton('var(--color-court)', true)}>
              Confirmar {ETIQUETA_NIVEL[jugador.categoria as Nivel] || jugador.categoria}
            </button>
          )}
          <select
            disabled={ocupado}
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v) onGuardar(v === 'quitar' ? null : v)
            }}
            style={{ fontSize: '12px', padding: '4px', borderRadius: '6px', border: '1px solid #ccc' }}
          >
            <option value="">{actual ? 'Cambiar…' : 'Otra…'}</option>
            {NIVELES.filter((n) => n !== actual).map((n) => <option key={n} value={n}>{ETIQUETA_NIVEL[n]}</option>)}
            {actual && <option value="quitar">Quitar</option>}
          </select>
        </div>
      )}
    </div>
  )
}

// Cuadrícula compacta (lun–vie × franjas) con las celdas en las que no puede.
function MiniCuadricula({ celdas }: { celdas: string[] }) {
  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: `auto repeat(${DIAS_TORNEO.length}, 26px)`, gap: '2px', fontSize: '10px' }}>
      <span />
      {DIAS_TORNEO.map((d) => <span key={d.id} style={{ textAlign: 'center', color: '#777' }}>{d.etiqueta}</span>)}
      {FRANJAS_TORNEO.map((f) => (
        <Fragment key={f.id}>
          <span style={{ color: '#777', paddingRight: '4px' }} title={f.horas}>{f.id === '1' ? '1º' : '2º'}</span>
          {DIAS_TORNEO.map((d) => {
            const no = celdas.includes(celdaDisponibilidad(d.id, f.id))
            return <span key={d.id} style={{ height: '14px', borderRadius: '3px', background: no ? '#c0392b' : '#dff5e3' }} title={`${d.etiqueta} ${f.horas}: ${no ? 'no puede' : 'puede'}`} />
          })}
        </Fragment>
      ))}
    </div>
  )
}
