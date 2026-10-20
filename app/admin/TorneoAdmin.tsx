'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatearFechaConAnio, formatearFechaHora, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_INSCRIPCION, ETIQUETA_ESTADO_TORNEO, NIVELES, type EstadoInscripcion, type EstadoTorneo, type GeneroCategoria, type Nivel } from '@/lib/torneo'
import {
  DIAS_TORNEO,
  ETIQUETA_GENERO_JUGADOR,
  ETIQUETA_NIVEL,
  FRANJAS_TORNEO,
  celdaDisponibilidad,
  nivelAdmitido,
} from '@/lib/torneoInscripcion'
import { ETIQUETA_TIPO_PAGO, type TipoPago } from '@/lib/delegacion'
import {
  ETIQUETA_GENERO_CATEGORIA_INFANTIL,
  ETIQUETA_GENERO_MENOR,
  ETIQUETA_PARENTESCO,
  PARENTESCOS,
  categoriasParaMenor,
  edadAlCorte,
  type Parentesco,
} from '@/lib/torneoInfantil'
import TorneoSorteo from './TorneoSorteo'
import HorarioAcademia from '@/app/components/HorarioAcademia'

// Pestaña Torneo del admin (Torneo Navidad, fase 3): inscripciones por
// categoría con su estado, pagos (validar / rechazar), categoría oficial de
// cada jugador (asignar / confirmar) y limitaciones de horario. Todo por
// /api/admin/torneo/...
//
// Categorías infantiles (SPEC §14): cada fila es un menor, con su edad al
// corte, representante, contacto de emergencia y autorización de imagen;
// el admin certifica (o cambia) su categoría y puede inscribir a un menor
// en nombre de un representante con cuenta.

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

type Menor = {
  id: string
  nombre: string
  apellido: string
  fecha_nacimiento: string
  genero: string
  numero_accion: string | null
  parentesco: Parentesco
  emergencia_nombre: string
  emergencia_telefono: string
  autorizacion_imagen: boolean
  autorizacion_participacion_at: string
  edad_al_corte: number
  representante: { jugador_id: string; nombre: string | null; telefono: string | null; email: string | null }
}

type Inscripcion = {
  id: string
  categoria_id: string
  estado: EstadoInscripcion
  created_at: string
  categoria_certificada_at: string | null
  menor_nombre_publico: string | null
  siembra: number | null
  bombo: number | null
  jugadores: Jugador[]
  menor: Menor | null
  pagos: Pago[]
  pendientes: { tipo: string; jugadorId: string; texto: string }[]
}

type Categoria = {
  id: string; nombre: string; modalidad: string; genero: GeneroCategoria; categoria_nivel: Nivel | null; cupo: number
  es_infantil: boolean; edad_min: number | null; edad_max: number | null; duracion_min: number
  plantilla_turnos: unknown | null
}

type Disponibilidad = { jugador_id: string; no_disponible: string[]; nota: string | null }

type TorneoAdminDatos = {
  id: string; nombre: string; fecha_inicio: string; fecha_fin: string; estado: EstadoTorneo; monto_inscripcion_eur: number
  fecha_corte_edad: string | null; solo_socios: boolean
  sorteo_metodo: 'bombos' | 'serpentina' | null; sorteo_publicado_at: string | null
}

type Datos = {
  torneo: TorneoAdminDatos | null
  fechaCorte: string
  categorias: Categoria[]
  inscripciones: Inscripcion[]
  disponibilidad: Disponibilidad[]
  jugadoresActivos: { id: string; nombre: string }[]
  sorteoPublicadoPor: string | null
}

// Nombre para mostrar de una inscripción (pareja, jugador o menor).
const nombreInscripcion = (i: Inscripcion) =>
  i.menor ? `${i.menor.nombre} ${i.menor.apellido}` : i.jugadores.map((j) => j.nombre).join(' / ')

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
  const [vista, setVista] = useState<'inscripciones' | 'sorteo' | 'academia'>('inscripciones')

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
  const accion = async (clave: string, ruta: string, body: object, exito: string): Promise<boolean> => {
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
      return true
    } catch (err: any) {
      setError(err.message)
      return false
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

      {esAdminCompleto && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '2px solid #ddd' }}>
          {([['inscripciones', '📝 Inscripciones'], ['sorteo', '🎲 Sorteo'], ['academia', '🧒 Horario academia']] as const).map(([id, etiqueta]) => (
            <button
              key={id}
              onClick={() => setVista(id)}
              style={{
                padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
                color: vista === id ? 'var(--color-ink)' : '#888', borderBottom: vista === id ? '3px solid var(--color-court)' : '3px solid transparent', marginBottom: '-2px',
              }}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      )}

      {vista === 'sorteo' && esAdminCompleto && (
        <TorneoSorteo
          torneo={torneo}
          categorias={categorias}
          inscripciones={inscripciones.map((i) => ({ id: i.id, categoria_id: i.categoria_id, estado: i.estado, siembra: i.siembra, bombo: i.bombo, nombre: nombreInscripcion(i) }))}
          publicadoPor={datos.sorteoPublicadoPor}
          onCambio={cargar}
        />
      )}

      {vista === 'academia' && esAdminCompleto && (
        <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
          <HorarioAcademia />
        </div>
      )}

      {vista === 'inscripciones' && <>
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
        const nivel = c.es_infantil
          ? `${c.edad_min}–${c.edad_max} años · ${ETIQUETA_GENERO_CATEGORIA_INFANTIL[c.genero] || c.genero} · turnos de ${c.duracion_min} min`
          : c.categoria_nivel ? ETIQUETA_NIVEL[c.categoria_nivel] + (c.categoria_nivel === 'sexta' ? ' (incluye Novato)' : '') : 'Nivel libre'
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
                  <strong style={{ fontSize: '14px', color: 'var(--color-ink)' }}>
                    {nombreInscripcion(ins)}
                    {ins.menor_nombre_publico && <span style={{ fontWeight: 'normal', color: '#888', fontSize: '12px' }}> · público: {ins.menor_nombre_publico}</span>}
                  </strong>
                  <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '999px', background: COLOR_ESTADO[ins.estado].fondo, color: COLOR_ESTADO[ins.estado].texto }}>
                      {ins.estado === 'pendiente_pago' ? 'Pendiente' : ETIQUETA_ESTADO_INSCRIPCION[ins.estado]}
                    </span>
                    {esAdminCompleto && ins.estado !== 'retirada' && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && (
                      <button
                        disabled={ocupado === `retirar-${ins.id}`}
                        onClick={() => {
                          if (!confirm(`¿Retirar la inscripción de ${nombreInscripcion(ins)}? Se libera su cupo; sus pagos quedan registrados.`)) return
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

                {ins.menor ? (
                  <FichaMenorAdmin
                    ins={ins}
                    menor={ins.menor}
                    categoria={c}
                    categorias={categorias}
                    editable={esAdminCompleto && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && ins.estado !== 'retirada'}
                    ocupado={ocupado === `cert-${ins.id}` || ocupado?.startsWith('pago-') === true}
                    onCertificar={(body, exito) => accion(`cert-${ins.id}`, 'infantil/certificar', { inscripcionId: ins.id, ...body }, exito)}
                    onPago={(pagoId, validar) => {
                      if (!validar && !confirm(`¿Rechazar el pago del representante de ${ins.menor!.nombre}? Se borra y se le avisa para que lo reporte de nuevo.`)) return
                      accion(`pago-${pagoId}`, validar ? 'validar-pago' : 'rechazar-pago', { pagoId }, validar ? 'Pago validado' : 'Pago rechazado')
                    }}
                  />
                ) : (
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
                )}
              </div>
            ))}
          </div>
        )
      })}

      {esAdminCompleto && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && categorias.some((c) => c.es_infantil) && (
        <FormMenorAdmin
          torneo={torneo}
          categorias={categorias.filter((c) => c.es_infantil)}
          jugadores={datos.jugadoresActivos}
          fechaCorte={datos.fechaCorte}
          ocupado={ocupado === 'menor-nuevo'}
          onEnviar={(body) => accion('menor-nuevo', 'infantil/inscribir', body, 'Menor inscrito')}
        />
      )}
      </>}
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

// --- Infantil ---

const fechaCorta = (iso: string) => formatearFechaConAnio(instanteEnCaracas(iso, '12:00'))

// Ficha de un menor inscrito: datos privados (solo admin), pago del
// representante y certificación de la categoría.
function FichaMenorAdmin({ ins, menor, categoria, categorias, editable, ocupado, onCertificar, onPago }: {
  ins: Inscripcion
  menor: Menor
  categoria: Categoria
  categorias: Categoria[]
  editable: boolean
  ocupado: boolean
  onCertificar: (body: { certificar?: boolean; categoriaId?: string }, exito: string) => void
  onPago: (pagoId: string, validar: boolean) => void
}) {
  const rep = menor.representante
  const otras = categoriasParaMenor(menor.edad_al_corte, menor.genero, categorias.filter((c) => c.es_infantil))
    .filter((c) => c.id !== categoria.id)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', fontSize: '12px', background: 'white', padding: '10px', borderRadius: '6px' }}>
      <div>
        <div style={{ fontWeight: 'bold' }}>{ETIQUETA_GENERO_MENOR[menor.genero] || menor.genero} · {menor.edad_al_corte} años al corte</div>
        <div style={{ color: '#777' }}>Nació el {fechaCorta(menor.fecha_nacimiento)}{menor.numero_accion ? ` · acción ${menor.numero_accion}` : ''}</div>
        <div style={{ marginTop: '6px' }}>
          {menor.autorizacion_imagen
            ? <span style={{ color: '#1e6b34', fontWeight: 'bold' }}>📷 Autoriza uso de imagen</span>
            : <span style={{ color: '#c0392b', fontWeight: 'bold' }}>🚫 NO autoriza uso de imagen</span>}
        </div>
        <div style={{ color: '#777' }}>Participación autorizada el {formatearFechaHora(menor.autorizacion_participacion_at)}</div>
      </div>
      <div>
        <div style={{ fontWeight: 'bold' }}>
          Representante: {rep.nombre || '—'} ({ETIQUETA_PARENTESCO[menor.parentesco] || menor.parentesco})
        </div>
        {rep.telefono && <div style={{ color: '#777' }}>{rep.telefono}</div>}
        {rep.email && <div style={{ color: '#777' }}>{rep.email}</div>}
        <div style={{ marginTop: '6px' }}>Emergencia: {menor.emergencia_nombre} · {menor.emergencia_telefono}</div>
      </div>
      <div>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Pago</div>
        {ins.pagos.length === 0 && <span style={{ color: '#999' }}>Sin reportar</span>}
        {ins.pagos.map((p) => (
          <div key={p.id} style={{ marginBottom: '6px' }}>
            <div><strong>{bs(p.monto)}</strong> · {ETIQUETA_TIPO_PAGO[p.tipo_pago as TipoPago] || p.tipo_pago} · {fecha(p.fecha)}</div>
            <div style={{ color: '#777' }}>Recibo #{p.numero_recibo}{p.referencia ? ` · ref. ${p.referencia}` : ''}</div>
            {p.validado ? (
              <span style={{ color: '#1e6b34', fontWeight: 'bold' }}>✓ Validado</span>
            ) : (
              <span style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <button disabled={ocupado} onClick={() => onPago(p.id, true)} style={boton('#1e6b34', true)}>Validar</button>
                <button disabled={ocupado} onClick={() => onPago(p.id, false)} style={boton('#c0392b')}>Rechazar</button>
              </span>
            )}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Categoría</div>
        {ins.categoria_certificada_at
          ? <div style={{ color: '#1e6b34', fontWeight: 'bold' }}>✓ Certificada ({categoria.nombre})</div>
          : <div style={{ color: '#8a5a00', fontWeight: 'bold' }}>Por certificar</div>}
        {editable && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
            {!ins.categoria_certificada_at ? (
              <button disabled={ocupado} onClick={() => onCertificar({ certificar: true }, `${menor.nombre}: ${categoria.nombre} certificada`)} style={boton('var(--color-court)', true)}>
                Certificar {categoria.nombre}
              </button>
            ) : (
              <button disabled={ocupado} onClick={() => onCertificar({ certificar: false }, `${menor.nombre}: certificación quitada`)} style={boton('#777')}>
                Quitar certificación
              </button>
            )}
            {otras.length > 0 && (
              <select
                disabled={ocupado}
                value=""
                onChange={(e) => {
                  const destino = otras.find((c) => c.id === e.target.value)
                  if (destino && confirm(`¿Pasar a ${menor.nombre} a ${destino.nombre} y certificarla?`)) {
                    onCertificar({ certificar: true, categoriaId: destino.id }, `${menor.nombre}: pasa a ${destino.nombre} (certificada)`)
                  }
                }}
                style={{ fontSize: '12px', padding: '4px', borderRadius: '6px', border: '1px solid #ccc' }}
              >
                <option value="">Pasar a…</option>
                {otras.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const campoAdmin: React.CSSProperties = { width: '100%', padding: '7px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }

// Inscribir a un menor desde el admin en nombre de un representante que
// tiene cuenta en la app (se elige de la lista). Sin cuenta no se puede:
// primero tiene que registrarse (mejora futura, SPEC §14.6).
function FormMenorAdmin({ torneo, categorias, jugadores, fechaCorte, ocupado, onEnviar }: {
  torneo: TorneoAdminDatos
  categorias: Categoria[]
  jugadores: { id: string; nombre: string }[]
  fechaCorte: string
  ocupado: boolean
  onEnviar: (body: object) => Promise<boolean>
}) {
  const vacio = {
    nombre: '', apellido: '', fecha_nacimiento: '', genero: '', numero_accion: '', parentesco: '',
    emergencia_nombre: '', emergencia_telefono: '',
  }
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState(vacio)
  const [representanteJugadorId, setRepresentanteJugadorId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [participacion, setParticipacion] = useState(false)
  const [imagen, setImagen] = useState(false)
  const campo = (k: keyof typeof vacio) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) })

  const edad = /^\d{4}-\d{2}-\d{2}$/.test(f.fecha_nacimiento) ? edadAlCorte(f.fecha_nacimiento, torneo) : null
  const posibles = edad !== null && f.genero ? categoriasParaMenor(edad, f.genero, categorias) : []

  if (!abierto) {
    return <button onClick={() => setAbierto(true)} style={{ ...boton('var(--color-court)', true), padding: '10px 16px', fontSize: '13px' }}>🧒 Inscribir a un menor</button>
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await onEnviar({
      ...f,
      representanteJugadorId,
      categoriaId,
      autorizacionParticipacion: participacion,
      autorizacionImagen: imagen,
    })
    if (ok) {
      setF(vacio)
      setCategoriaId('')
      setParticipacion(false)
      setImagen(false)
      setAbierto(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <h4 style={{ color: 'var(--color-ink)', margin: '0 0 12px 0' }}>🧒 Inscribir a un menor</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', fontSize: '12px' }}>
        <label>Nombre<input required {...campo('nombre')} style={campoAdmin} /></label>
        <label>Apellido<input required {...campo('apellido')} style={campoAdmin} /></label>
        <label>Fecha de nacimiento<input type="date" required {...campo('fecha_nacimiento')} style={campoAdmin} /></label>
        <label>Niño / niña
          <select required {...campo('genero')} style={campoAdmin}>
            <option value="">—</option><option value="caballeros">Niño</option><option value="damas">Niña</option>
          </select>
        </label>
        <label>N.º de acción<input {...campo('numero_accion')} style={campoAdmin} /></label>
        <label>Parentesco del representante
          <select required {...campo('parentesco')} style={campoAdmin}>
            <option value="">—</option>
            {PARENTESCOS.map((p) => <option key={p} value={p}>{ETIQUETA_PARENTESCO[p]}</option>)}
          </select>
        </label>
        <label>Emergencia: nombre<input required {...campo('emergencia_nombre')} style={campoAdmin} /></label>
        <label>Emergencia: teléfono<input required {...campo('emergencia_telefono')} style={campoAdmin} /></label>
      </div>

      <div style={{ marginTop: '12px', fontSize: '13px' }}>
        <div style={{ marginBottom: '6px' }}>Representante (usuario de la app)</div>
        <select required value={representanteJugadorId} onChange={(e) => setRepresentanteJugadorId(e.target.value)} style={{ ...campoAdmin, maxWidth: '360px' }}>
          <option value="">Elige al usuario…</option>
          {jugadores.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
        </select>
        <p style={{ fontSize: '12px', color: '#666', margin: '6px 0 0 0' }}>
          Si el representante no tiene cuenta, primero tiene que registrarse en la app (no entra al escalafón).
        </p>
      </div>

      <div style={{ marginTop: '12px', fontSize: '13px' }}>
        <div style={{ marginBottom: '6px' }}>
          Categoría {edad !== null && <span style={{ color: '#666' }}>({edad} años al {fechaCorta(fechaCorte)})</span>}
        </div>
        <select required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={{ ...campoAdmin, maxWidth: '360px' }}>
          <option value="">{posibles.length ? 'Elige…' : 'Completa fecha de nacimiento y género'}</option>
          {posibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      <label style={{ display: 'block', marginTop: '10px', fontSize: '13px' }}>
        <input type="checkbox" checked={participacion} onChange={(e) => setParticipacion(e.target.checked)} /> El representante autorizó la participación (obligatoria)
      </label>
      <label style={{ display: 'block', marginTop: '4px', fontSize: '13px' }}>
        <input type="checkbox" checked={imagen} onChange={(e) => setImagen(e.target.checked)} /> El representante autorizó el uso de imagen (opcional)
      </label>

      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button type="submit" disabled={ocupado || !participacion || !categoriaId} style={boton('var(--color-court)', true)}>{ocupado ? 'Inscribiendo…' : 'Inscribir'}</button>
        <button type="button" onClick={() => setAbierto(false)} style={boton('#777')}>Cancelar</button>
      </div>
    </form>
  )
}
