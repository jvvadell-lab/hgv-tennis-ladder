'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatearFechaConAnio, formatearFechaHora, instanteEnCaracas } from '@/lib/tiempo'
import { ETIQUETA_ESTADO_INSCRIPCION, ETIQUETA_ESTADO_TORNEO, NIVELES, type EstadoInscripcion, type EstadoTorneo, type GeneroCategoria, type Nivel } from '@/lib/torneo'
import {
  categoriaAbierta,
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
import { GestionCategoria, ResumenTorneo, type EquipoAdmin, type EsperaAdmin, type InvitacionAdmin } from './TorneoDoblesAdmin'
import { avisoAntesDeCerrar } from '@/lib/torneoCierre'
import TorneoProgramacion from './TorneoProgramacion'
import TorneoResultados from './TorneoResultados'
import HorarioAcademia from '@/app/components/HorarioAcademia'
import { formatearEur, textoTarifas } from '@/lib/torneoPrecios'

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
  es_invitado: boolean
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
  invitado_autorizado_at: string | null
  devolucion_marcada_at: string | null
  // Monto en € fijado al inscribirse (SPEC §2.5) y ajuste manual del admin.
  monto_eur: number
  monto_calculado_eur: number
  monto_motivo: string
  monto_ajuste_nota: string | null
  monto_ajustado_at: string | null
  jugadores: Jugador[]
  menor: Menor | null
  pagos: Pago[]
  pendientes: { tipo: string; jugadorId: string; texto: string }[]
}

type Categoria = {
  id: string; nombre: string; modalidad: string; genero: GeneroCategoria; categoria_nivel: Nivel | null; cupo: number
  es_infantil: boolean; edad_min: number | null; edad_max: number | null; duracion_min: number
  plantilla_turnos: unknown | null
  inscripciones_abiertas: boolean; inscripciones_cambiadas_at: string | null; admin_cambio: { nombre: string } | null
  sorteo_publicado_at: string | null; sorteo_metodo: 'bombos' | 'serpentina' | null; cancelada_at: string | null
  num_grupos: number; llave_desde: string; partidos_minimos: number | null
}

type Disponibilidad = { jugador_id: string; no_disponible: string[]; nota: string | null }

type TorneoAdminDatos = {
  id: string; nombre: string; fecha_inicio: string; fecha_fin: string; estado: EstadoTorneo; monto_inscripcion_eur: number; monto_inscripcion_adicional_eur: number; monto_inscripcion_invitado_eur?: number | null
  fecha_corte_edad: string | null; solo_socios: boolean; cierre_inscripciones_at: string | null
  sorteo_metodo: 'bombos' | 'serpentina' | null; sorteo_publicado_at: string | null
}

type Datos = {
  torneo: TorneoAdminDatos | null
  fechaCorte: string
  categorias: Categoria[]
  inscripciones: Inscripcion[]
  equipos: EquipoAdmin[]
  invitaciones: InvitacionAdmin[]
  listaEspera: EsperaAdmin[]
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
  // Sube con cada carga: el resumen vuelve a pedir sus contadores.
  const [version, setVersion] = useState(0)
  const [vista, setVista] = useState<'inscripciones' | 'sorteo' | 'programacion' | 'resultados' | 'academia'>('inscripciones')

  const cargar = async () => {
    try {
      const res = await fetch('/api/admin/torneo', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar el torneo')
      setDatos(data)
      setVersion((v) => v + 1)
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
              {fecha(torneo.fecha_inicio)} al {fecha(torneo.fecha_fin)} · {textoTarifas(torneo)} ·{' '}
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

      <ResumenTorneo version={version} categoriaSel={categoriaSel} onElegir={(id) => { setCategoriaSel(id); setVista('inscripciones') }} />

      {esAdminCompleto && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '2px solid #ddd', overflowX: 'auto' }}>
          {([['inscripciones', '📝 Inscripciones'], ['sorteo', '🎲 Sorteo'], ['programacion', '📅 Programación'], ['resultados', '🏆 Resultados'], ['academia', '🧒 Horario academia']] as const).map(([id, etiqueta]) => (
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
          equipos={datos.equipos.map((e) => {
            const ins = [e.inscripcion1_id, e.inscripcion2_id].map((id) => inscripciones.find((i) => i.id === id)).filter(Boolean) as Inscripcion[]
            return {
              id: e.id, categoria_id: e.categoria_id, siembra: e.siembra, bombo: e.bombo,
              nombre: ins.map((i) => (i.menor ? `${i.menor.nombre} ${i.menor.apellido}` : i.jugadores.map((j) => j.nombre).join(' / '))).join(' / '),
              pendiente: ins.some((i) => i.estado !== 'confirmada'),
            }
          })}
          sinPareja={Object.fromEntries(categorias.filter((c) => c.modalidad === 'doble').map((c) => {
            const enDupla = new Set(datos.equipos.flatMap((e) => [e.inscripcion1_id, e.inscripcion2_id]))
            return [c.id, vivas.filter((i) => i.categoria_id === c.id && !enDupla.has(i.id)).length]
          }))}
          publicadoPor={datos.sorteoPublicadoPor}
          onCambio={cargar}
        />
      )}

      {vista === 'programacion' && esAdminCompleto && <TorneoProgramacion />}

      {vista === 'resultados' && esAdminCompleto && <TorneoResultados />}

      {vista === 'academia' && esAdminCompleto && (
        <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
          <HorarioAcademia />
        </div>
      )}

      {vista === 'inscripciones' && <>
      {mensaje && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{mensaje}</p>}
      {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{error}</p>}

      {esAdminCompleto && (
        <CertificarEscalera
          ocupado={ocupado === 'certificar-escalera'}
          onConfirmar={(temporadaId, jugadorIds) =>
            accion('certificar-escalera', 'certificar-escalera', { temporadaId, jugadorIds },
              `Categoría oficial certificada a ${jugadorIds.length} jugador${jugadorIds.length === 1 ? '' : 'es'} de la escalera`)
          }
        />
      )}

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
              {c.nombre} <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.8 }}>{c.id === 'todas' ? n : `${n}/${'modalidad' in c && c.modalidad === 'doble' ? c.cupo * 2 : c.cupo}`}</span>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div>
                <h4 style={{ color: 'var(--color-ink)', margin: '0 0 4px 0' }}>{c.nombre}</h4>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                  {c.modalidad === 'doble'
                    ? <>Dobles · {nivel} · {lista.filter((i) => i.estado !== 'retirada').length}/{c.cupo * 2} jugadores ({c.cupo} parejas)</>
                    : <>Single · {nivel} · cupo {lista.filter((i) => i.estado !== 'retirada').length}/{c.cupo}</>}
                  {c.sorteo_publicado_at && <> · 🎲 sorteada</>}
                </p>
              </div>
              <InscripcionesCategoria
                categoria={c}
                estadoTorneo={torneo.estado}
                editable={esAdminCompleto}
                ocupado={ocupado === `abrir-${c.id}`}
                avisoCerrar={(() => {
                  const enDupla = new Set(datos.equipos.flatMap((e) => [e.inscripcion1_id, e.inscripcion2_id]))
                  const sueltos = c.modalidad === 'doble' ? lista.filter((i) => i.estado !== 'retirada' && !enDupla.has(i.id)).map(nombreInscripcion) : []
                  return avisoAntesDeCerrar(c.nombre, sueltos, datos.invitaciones.filter((v) => v.categoria_id === c.id).length)
                })()}
                onCambiar={(abrir) => accion(`abrir-${c.id}`, 'categoria-inscripciones', { categoriaId: c.id, abiertas: abrir }, `${c.nombre}: inscripciones ${abrir ? 'abiertas' : 'cerradas'}`)}
              />
            </div>
            <GestionCategoria
              categoria={c}
              categorias={categorias}
              inscripciones={lista.filter((i) => i.estado !== 'retirada').map((i) => ({ id: i.id, categoria_id: i.categoria_id, estado: i.estado, nombre: nombreInscripcion(i), esMenor: !!i.menor }))}
              equipos={datos.equipos}
              invitaciones={datos.invitaciones}
              listaEspera={datos.listaEspera}
              editable={esAdminCompleto && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && !c.sorteo_publicado_at}
              cerrada={!categoriaAbierta(torneo.estado, c) || (!!torneo.cierre_inscripciones_at && new Date(torneo.cierre_inscripciones_at).getTime() <= Date.now())}
              ocupado={ocupado}
              accion={accion}
            />
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
                    {esAdminCompleto && ins.estado !== 'retirada' && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && !c.sorteo_publicado_at && (
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
                <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 8px 0' }}>
                  Inscrita el {formatearFechaHora(ins.created_at)}
                  {ins.devolucion_marcada_at && <strong style={{ color: '#842029' }}> · 💸 pago marcado para devolución el {formatearFechaHora(ins.devolucion_marcada_at)}</strong>}
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', margin: '0 0 8px 0' }}>
                  <span>
                    💶 <strong>{formatearEur(ins.monto_eur)}</strong> ·{' '}
                    {ins.monto_ajuste_nota
                      ? <>ajustado a mano ({ins.monto_ajuste_nota}; la regla daba {formatearEur(ins.monto_calculado_eur)} por {ins.monto_motivo.toLowerCase()})</>
                      : ins.monto_motivo}
                  </span>
                  {esAdminCompleto && ins.estado !== 'retirada' && (
                    <button
                      disabled={ocupado === `monto-${ins.id}`}
                      onClick={() => {
                        const nuevo = prompt(`Monto en € para ${nombreInscripcion(ins)} en ${c.nombre} (vacío = volver a ${formatearEur(ins.monto_calculado_eur)}, lo que da la regla):`, String(Number(ins.monto_eur)))
                        if (nuevo === null) return
                        if (nuevo.trim() === '') {
                          accion(`monto-${ins.id}`, 'ajustar-monto', { inscripcionId: ins.id, montoEur: null }, 'Monto devuelto al de la regla')
                          return
                        }
                        const nota = prompt('Motivo del ajuste (queda anotado):', ins.monto_ajuste_nota || '')
                        if (nota === null) return
                        accion(`monto-${ins.id}`, 'ajustar-monto', { inscripcionId: ins.id, montoEur: Number(nuevo.replace(',', '.')), nota }, 'Monto ajustado')
                      }}
                      style={boton('#1c4e72')}
                    >
                      Ajustar monto
                    </button>
                  )}
                </div>

                {ins.pendientes.length > 0 && (
                  <ul style={{ margin: '0 0 8px 0', paddingLeft: '18px', fontSize: '12px', color: '#8a5a00' }}>
                    {ins.pendientes.map((p) => <li key={`${p.tipo}-${p.jugadorId}`}>{p.texto}</li>)}
                  </ul>
                )}

                {ins.estado !== 'retirada' && (ins.invitado_autorizado_at || ins.pendientes.some((p) => p.tipo === 'invitado_por_autorizar')) && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', margin: '0 0 8px 0' }}>
                    {ins.invitado_autorizado_at
                      ? <span style={{ color: '#1e6b34', fontWeight: 'bold' }}>🎟️ Autorizado como invitado / wild card el {formatearFechaHora(ins.invitado_autorizado_at)}</span>
                      : <span style={{ color: '#8a5a00', fontWeight: 'bold' }}>🎟️ No socio: el torneo es solo para socios</span>}
                    {esAdminCompleto && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion') && (
                      <button
                        disabled={ocupado === `invitado-${ins.id}`}
                        onClick={() => {
                          const autorizar = !ins.invitado_autorizado_at
                          if (!confirm(autorizar
                            ? `¿Autorizar a ${nombreInscripcion(ins)} como invitado / wild card en ${c.nombre}?`
                            : `¿Quitar la autorización de invitado / wild card a ${nombreInscripcion(ins)}? La inscripción vuelve a quedar pendiente.`)) return
                          accion(`invitado-${ins.id}`, 'autorizar-invitado', { inscripcionId: ins.id, autorizar }, autorizar ? 'Invitado / wild card autorizado' : 'Autorización quitada')
                        }}
                        style={boton(ins.invitado_autorizado_at ? '#c0392b' : '#1e6b34', !ins.invitado_autorizado_at)}
                      >
                        {ins.invitado_autorizado_at ? 'Quitar autorización' : 'Autorizar invitado / wild card'}
                      </button>
                    )}
                  </div>
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
                              <div style={{ fontWeight: 'bold' }}>
                                {j.nombre}
                                {j.es_invitado && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: '#efe3ff', color: '#5b2a86' }}>Invitado</span>}
                              </div>
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

type VistaCertificacion = {
  temporadas: { id: string; nombre: string; jugadores: number }[]
  temporada: { id: string; nombre: string } | null
  total?: number
  grupos?: { categoria: Nivel; genero: string; jugadores: { id: string; nombre: string }[] }[]
  yaCertificados?: number
  inactivos?: number
  categoriaInvalida?: { id: string; nombre: string; categoria: string }[]
}

// Certificar de una vez la categoría oficial de los jugadores de la escalera
// (la de jugadores.categoria). Primero muestra la vista previa por categoría
// y género; el admin confirma y solo se certifican los que vio.
function CertificarEscalera({ ocupado, onConfirmar }: {
  ocupado: boolean
  onConfirmar: (temporadaId: string, jugadorIds: string[]) => Promise<boolean>
}) {
  const [vista, setVista] = useState<VistaCertificacion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const previsualizar = async (temporadaId?: string) => {
    setCargando(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/torneo/certificar-escalera${temporadaId ? `?temporadaId=${temporadaId}` : ''}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo preparar la vista previa')
      setVista(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  const ids = (vista?.grupos || []).flatMap((g) => g.jugadores.map((j) => j.id))

  return (
    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px', fontSize: '13px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <strong>Certificar a los jugadores de la escalera</strong>
          <div style={{ color: '#555', marginTop: '2px' }}>
            Asigna como categoría oficial la de la escalera a quien todavía no tiene una. Los demás siguen con categoría provisional.
          </div>
        </div>
        {!vista && (
          <button disabled={cargando} onClick={() => previsualizar()} style={boton('var(--color-court)')}>
            {cargando ? 'Cargando…' : 'Ver quiénes'}
          </button>
        )}
      </div>

      {error && <p style={{ color: '#842029', margin: '8px 0 0 0' }}>{error}</p>}

      {vista && (
        <div style={{ marginTop: '12px' }}>
          {vista.temporadas.length === 0 || !vista.temporada ? (
            <p style={{ margin: 0 }}>No hay ninguna temporada con jugadores en la escalera.</p>
          ) : (
            <>
              <label>
                Temporada:{' '}
                <select value={vista.temporada.id} disabled={cargando || ocupado} onChange={(e) => previsualizar(e.target.value)} style={{ ...campoAdmin, width: 'auto', maxWidth: '100%' }}>
                  {vista.temporadas.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.jugadores} en la escalera)</option>)}
                </select>
              </label>

              <p style={{ margin: '10px 0 6px 0' }}>
                <strong>{vista.total} jugador{vista.total === 1 ? '' : 'es'}</strong> recibirían su categoría oficial
                {!!vista.yaCertificados && <> · {vista.yaCertificados} ya la tenían</>}
                {!!vista.inactivos && <> · {vista.inactivos} inactivo{vista.inactivos === 1 ? '' : 's'} (no se tocan)</>}
              </p>

              {(vista.grupos || []).map((g) => (
                <div key={`${g.categoria}-${g.genero}`} style={{ marginBottom: '6px' }}>
                  <strong>{ETIQUETA_NIVEL[g.categoria]} · {ETIQUETA_GENERO_JUGADOR[g.genero] || g.genero}</strong> ({g.jugadores.length}):{' '}
                  <span style={{ color: '#555' }}>{g.jugadores.map((j) => j.nombre).join(', ')}</span>
                </div>
              ))}

              {!!vista.categoriaInvalida?.length && (
                <p style={{ color: '#8a5a00', margin: '6px 0' }}>
                  Sin certificar (su categoría de escalera no es un nivel de torneo):{' '}
                  {vista.categoriaInvalida.map((j) => `${j.nombre} (${j.categoria})`).join(', ')}
                </p>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  disabled={ocupado || cargando || ids.length === 0}
                  onClick={async () => {
                    if (!confirm(`¿Certificar la categoría oficial de ${ids.length} jugador${ids.length === 1 ? '' : 'es'} de ${vista.temporada!.nombre}? Se recalculan sus inscripciones.`)) return
                    if (await onConfirmar(vista.temporada!.id, ids)) setVista(null)
                  }}
                  style={boton('var(--color-court)', true)}
                >
                  {ocupado ? 'Certificando…' : `Certificar ${ids.length}`}
                </button>
                <button disabled={ocupado} onClick={() => setVista(null)} style={boton('#777')}>Cancelar</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#555' }
const td: React.CSSProperties = { padding: '8px' }

// Asignar / confirmar la categoría oficial de torneo. "Confirmar" asigna la
// de la escalera de un clic; el selector permite cualquier otra.
// Interruptor abrir/cerrar inscripciones de una categoría, con quién y cuándo
// la cambió por última vez. Solo acepta inscripciones si además el torneo
// está en 'inscripcion'.
function InscripcionesCategoria({ categoria, estadoTorneo, editable, ocupado, avisoCerrar, onCambiar }: {
  categoria: Categoria
  estadoTorneo: EstadoTorneo
  editable: boolean
  ocupado: boolean
  avisoCerrar: string | null   // sin pareja / invitaciones pendientes: se muestra antes de cerrar
  onCambiar: (abrir: boolean) => void
}) {
  const abierta = categoria.inscripciones_abiertas
  // Se puede cerrar y reabrir mientras no se publique el sorteo de la categoría.
  const antesDelSorteo = (estadoTorneo === 'borrador' || estadoTorneo === 'inscripcion') && !categoria.sorteo_publicado_at && !categoria.cancelada_at
  const recibe = categoriaAbierta(estadoTorneo, categoria)
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{
          fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px',
          background: recibe ? '#dff5e3' : '#eee', color: recibe ? '#1e6b34' : '#666',
        }}>
          {recibe ? 'Recibe inscripciones' : abierta ? 'Abierta (torneo cerrado)' : 'Inscripciones cerradas'}
        </span>
        {editable && antesDelSorteo && (
          <button
            disabled={ocupado}
            onClick={() => {
              const texto = abierta
                ? `${avisoCerrar ? `⚠️ ${avisoCerrar}\n\n` : ''}¿Cerrar las inscripciones de ${categoria.nombre}? Nadie más podrá inscribirse, invitar ni aceptar invitaciones en ella; las inscripciones y duplas hechas se mantienen y puedes seguir armando duplas, trasladando y certificando hasta el sorteo. Se puede reabrir mientras no publiques su sorteo.`
                : `¿Abrir las inscripciones de ${categoria.nombre}?${estadoTorneo === 'inscripcion' ? ' Los jugadores podrán inscribirse desde la app.' : ' Recibirá inscripciones cuando abras las del torneo.'}`
              if (confirm(texto)) onCambiar(!abierta)
            }}
            style={boton(abierta ? '#c0392b' : 'var(--color-court)')}
          >
            {ocupado ? '…' : abierta ? '🔒 Cerrar inscripciones' : categoria.inscripciones_cambiadas_at ? '🔓 Reabrir' : '🔓 Abrir'}
          </button>
        )}
      </div>
      {categoria.inscripciones_cambiadas_at && (
        <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0 0' }}>
          {abierta ? 'Abierta' : 'Cerrada'} por {categoria.admin_cambio?.nombre || 'un admin'} el {formatearFechaHora(categoria.inscripciones_cambiadas_at)}
        </p>
      )}
    </div>
  )
}

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
