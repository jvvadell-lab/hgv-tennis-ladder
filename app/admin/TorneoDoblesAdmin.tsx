'use client'
import { useEffect, useState } from 'react'
import { formatearFechaHora } from '@/lib/tiempo'
import type { Alerta, ResumenCategoria } from '@/lib/torneoDobles'
import { telefonoLegible } from '@/lib/torneoDobles'

// Pestaña Torneo del admin — resumen con contadores (de
// /api/admin/torneo/resumen, calculados en el servidor y pedidos otra vez
// tras cada acción) y gestión de dobles de cada categoría: duplas, jugadores
// sin pareja (Armar dupla), invitaciones pendientes, traslado, devolución y
// cancelar o fusionar una categoría con menos de 3 duplas o inscritos.

type FilaResumen = ResumenCategoria & { nombre: string; es_infantil: boolean; sorteada: boolean; cancelada: boolean }
type Resumen = {
  cierreInscripcionesAt: string | null
  dobles: { duplas: number; cupo: number }
  singleEInfantil: { inscritos: number; cupo: number }
  categorias: FilaResumen[]
}

const ICONO_ALERTA: Record<Exclude<Alerta, null>, { icono: string; texto: string }> = {
  roja: { icono: '🔴', texto: 'menos de 3' },
  naranja: { icono: '🟠', texto: 'número impar sin pareja' },
  verde: { icono: '🟢', texto: 'cupo completo' },
}

const tarjeta: React.CSSProperties = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }
const boton = (color: string, relleno = false): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
  border: `1px solid ${color}`, background: relleno ? color : 'white', color: relleno ? 'white' : color, whiteSpace: 'nowrap',
})

function faltaPara(cierre: string, ahoraMs: number): string {
  const falta = new Date(cierre).getTime() - ahoraMs
  if (falta <= 0) return 'cerradas'
  const d = Math.floor(falta / 86_400_000), h = Math.floor((falta % 86_400_000) / 3_600_000), m = Math.floor((falta % 3_600_000) / 60_000)
  return `faltan ${d ? `${d} d ` : ''}${h} h ${m} min`
}

export function ResumenTorneo({ version, categoriaSel, onElegir }: { version: number; categoriaSel: string; onElegir: (categoriaId: string) => void }) {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState('')
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())

  useEffect(() => {
    let cancelado = false
    fetch('/api/admin/torneo/resumen', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error al cargar el resumen')
        if (!cancelado) { setResumen(d.resumen); setError('') }
      })
      .catch((e) => !cancelado && setError(e.message))
    return () => { cancelado = true }
  }, [version])
  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  if (error) return <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{error}</p>
  if (!resumen) return null

  const cifra = (valor: string, etiqueta: string) => (
    <div style={{ background: 'white', borderRadius: '8px', padding: '10px 14px', minWidth: '150px', flex: 1 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 'bold', color: 'var(--color-ink)' }}>{valor}</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{etiqueta}</div>
    </div>
  )

  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {cifra(`${resumen.dobles.duplas}/${resumen.dobles.cupo}`, 'duplas confirmadas en dobles')}
        {cifra(`${resumen.singleEInfantil.inscritos}/${resumen.singleEInfantil.cupo}`, 'inscritos en single e infantiles')}
        {resumen.cierreInscripcionesAt && cifra(faltaPara(resumen.cierreInscripcionesAt, ahoraMs), `cierre: ${formatearFechaHora(resumen.cierreInscripcionesAt)} (Caracas)`)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px' }}>
        {resumen.categorias.map((c) => {
          const alerta = c.cancelada || c.sorteada ? null : c.alerta
          const doble = c.modalidad === 'doble'
          return (
            <button
              key={c.categoriaId}
              onClick={() => onElegir(c.categoriaId)}
              style={{
                textAlign: 'left', background: 'white', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontSize: '12px', color: '#444',
                border: categoriaSel === c.categoriaId ? '2px solid var(--color-ink)' : '1px solid #ddd', opacity: c.cancelada ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--color-ink)' }}>{c.nombre}</strong>
                {alerta && <span title={ICONO_ALERTA[alerta].texto}>{ICONO_ALERTA[alerta].icono}</span>}
              </div>
              {c.cancelada ? <div>Cancelada</div> : (
                <>
                  <div>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{doble ? `${c.confirmados}/${c.cupo}` : `${c.inscritos}/${c.cupo}`}</strong>{' '}
                    {doble ? 'duplas confirmadas' : 'inscritos'}
                    {doble && c.formados !== c.confirmados ? ` · ${c.formados} formadas` : ''}
                    {c.faltan ? ` · faltan ${c.faltan}` : ''}
                  </div>
                  <div>{c.sorteada ? '🎲 Sorteada' : `${c.listosSorteo} listas para el sorteo`}</div>
                  {doble && (c.sinPareja > 0 || c.invitacionesPendientes > 0) && (
                    <div>
                      {c.sinPareja > 0 && `${c.sinPareja} sin pareja`}{c.sinPareja > 0 && c.invitacionesPendientes > 0 && ' · '}
                      {c.invitacionesPendientes > 0 && `${c.invitacionesPendientes} invitaciones (próxima vence ${formatearFechaHora(c.proximaEnVencer!)})`}
                    </div>
                  )}
                  {c.pagosPorValidar > 0 && <div style={{ color: '#8a5a00' }}>{c.pagosPorValidar} pagos por validar</div>}
                </>
              )}
            </button>
          )
        })}
      </div>
      <p style={{ fontSize: '11px', color: '#888', margin: '10px 0 0 0' }}>🔴 menos de 3 duplas o inscritos · 🟠 número impar sin pareja · 🟢 cupo completo. Clic en una categoría para ver el detalle y sus acciones.</p>
    </div>
  )
}

// --- Gestión de una categoría ----------------------------------------------

export type EquipoAdmin = { id: string; categoria_id: string; inscripcion1_id: string; inscripcion2_id: string | null; origen: string; siembra: number | null; bombo: number | null }
export type InvitacionAdmin = { id: string; categoria_id: string; invita_inscripcion_id: string; vence_at: string; para: string; telefono: string | null }
type CategoriaGestion = { id: string; nombre: string; modalidad: string; es_infantil: boolean; sorteo_publicado_at: string | null; cancelada_at: string | null }
type InscripcionGestion = { id: string; categoria_id: string; estado: string; nombre: string; esMenor: boolean }

export function GestionCategoria({
  categoria, categorias, inscripciones, equipos, invitaciones, editable, cerrada, ocupado, accion,
}: {
  categoria: CategoriaGestion
  categorias: CategoriaGestion[]
  inscripciones: InscripcionGestion[]        // vivas de la categoría
  equipos: EquipoAdmin[]
  invitaciones: InvitacionAdmin[]
  editable: boolean                          // admin completo, antes del sorteo de la categoría
  cerrada: boolean                           // sin inscripciones abiertas o pasado el cierre: se puede fusionar o cancelar
  ocupado: string | null
  accion: (clave: string, ruta: string, body: object, exito: string) => Promise<boolean>
}) {
  const [elegidas, setElegidas] = useState<string[]>([])
  const [destino, setDestino] = useState<Record<string, string>>({})
  const [fusion, setFusion] = useState('')
  const nombre = new Map(inscripciones.map((i) => [i.id, i.nombre]))
  const doble = categoria.modalidad === 'doble'
  const duplas = equipos.filter((e) => e.categoria_id === categoria.id && e.inscripcion2_id)
  const enDupla = new Set(duplas.flatMap((e) => [e.inscripcion1_id, e.inscripcion2_id!]))
  const sueltas = doble ? inscripciones.filter((i) => !enDupla.has(i.id)) : []
  const pendientes = invitaciones.filter((v) => v.categoria_id === categoria.id)
  const competidores = doble ? duplas.length : inscripciones.length
  // Destinos de traslado (adultos) y de fusión (misma modalidad), sin sortear ni cancelar.
  const abiertas = categorias.filter((c) => c.id !== categoria.id && !c.sorteo_publicado_at && !c.cancelada_at)
  const destinosTraslado = abiertas.filter((c) => !c.es_infantil)
  const destinosFusion = abiertas.filter((c) => c.modalidad === categoria.modalidad && c.es_infantil === categoria.es_infantil)

  if (categoria.cancelada_at) {
    return <p style={{ fontSize: '13px', color: '#842029', margin: '0 0 12px 0' }}>❌ Categoría cancelada el {formatearFechaHora(categoria.cancelada_at)}.</p>
  }

  const alternar = (id: string) => setElegidas((a) => (a.includes(id) ? a.filter((x) => x !== id) : a.length < 2 ? [...a, id] : [a[1], id]))

  return (
    <div style={{ margin: '0 0 14px 0', fontSize: '13px' }}>
      {doble && (
        <div style={{ background: 'white', borderRadius: '8px', padding: '10px 14px', marginBottom: '10px' }}>
          <strong style={{ color: 'var(--color-ink)' }}>Duplas ({duplas.length})</strong>
          {duplas.length === 0 && <p style={{ margin: '6px 0 0 0', color: '#888' }}>Todavía no hay duplas formadas.</p>}
          {duplas.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', padding: '5px 0', borderTop: '1px solid #f0f0f0' }}>
              <span>
                🤝 {nombre.get(e.inscripcion1_id) ?? '—'} / {nombre.get(e.inscripcion2_id!) ?? '—'}
                <span style={{ color: '#888', fontSize: '11px' }}> · {e.origen === 'admin' ? 'armada por el admin' : 'por invitación'}</span>
              </span>
              {editable && (
                <button
                  disabled={ocupado === `deshacer-${e.id}`}
                  onClick={() => {
                    if (!confirm('¿Deshacer esta dupla para cambiar la pareja? Los dos vuelven a quedar disponibles y se les avisa.')) return
                    accion(`deshacer-${e.id}`, 'duplas', { accion: 'deshacer', equipoId: e.id }, 'Dupla deshecha: los dos quedan disponibles')
                  }}
                  style={boton('#8a5a00')}
                >
                  Cambiar pareja
                </button>
              )}
            </div>
          ))}

          {sueltas.length > 0 && (
            <div style={{ marginTop: '10px', borderTop: '1px solid #e5e5e5', paddingTop: '8px' }}>
              <strong style={{ color: sueltas.length % 2 ? '#c0392b' : 'var(--color-ink)' }}>
                Sin pareja ({sueltas.length}{sueltas.length % 2 ? ', impar' : ''})
              </strong>
              {sueltas.map((i) => {
                const esperando = pendientes.find((v) => v.invita_inscripcion_id === i.id)
                return (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '5px 0', borderTop: '1px solid #f5f5f5' }}>
                    <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {editable && <input type="checkbox" checked={elegidas.includes(i.id)} onChange={() => alternar(i.id)} />}
                      {i.nombre}
                      {esperando && <span style={{ color: '#8a5a00', fontSize: '11px' }}>· esperando a {esperando.para}</span>}
                    </label>
                    {editable && (
                      <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <select value={destino[i.id] ?? ''} onChange={(e) => setDestino((d) => ({ ...d, [i.id]: e.target.value }))} style={{ fontSize: '12px', padding: '3px' }}>
                          <option value="">Trasladar a…</option>
                          {destinosTraslado.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        <button
                          disabled={!destino[i.id] || ocupado === `trasladar-${i.id}`}
                          onClick={() => accion(`trasladar-${i.id}`, 'trasladar', { inscripcionId: i.id, categoriaId: destino[i.id] }, `${i.nombre} trasladada/o`)}
                          style={boton('var(--color-court)')}
                        >
                          Trasladar
                        </button>
                        <button
                          disabled={ocupado === `devolucion-${i.id}`}
                          onClick={() => {
                            if (!confirm(`¿Retirar a ${i.nombre} y marcar su pago para devolución?`)) return
                            accion(`devolucion-${i.id}`, 'devolucion', { inscripcionId: i.id }, `${i.nombre}: retirada/o con el pago marcado para devolución`)
                          }}
                          style={boton('#c0392b')}
                        >
                          Devolución
                        </button>
                      </span>
                    )}
                  </div>
                )
              })}
              {editable && (
                <button
                  disabled={elegidas.length !== 2 || ocupado === 'armar'}
                  onClick={async () => {
                    if (await accion('armar', 'duplas', { accion: 'armar', inscripcionIds: elegidas }, `Dupla armada: ${elegidas.map((id) => nombre.get(id)).join(' / ')}`)) setElegidas([])
                  }}
                  style={{ ...boton('var(--color-court)', true), marginTop: '8px' }}
                >
                  🤝 Armar dupla{elegidas.length === 2 ? `: ${elegidas.map((id) => nombre.get(id)).join(' / ')}` : ' (elige 2)'}
                </button>
              )}
            </div>
          )}

          {pendientes.length > 0 && (
            <div style={{ marginTop: '10px', borderTop: '1px solid #e5e5e5', paddingTop: '8px' }}>
              <strong style={{ color: 'var(--color-ink)' }}>Invitaciones pendientes ({pendientes.length})</strong>
              {pendientes.map((v) => (
                <div key={v.id} style={{ padding: '3px 0', color: '#555' }}>
                  {nombre.get(v.invita_inscripcion_id) ?? '—'} → {v.para}{v.telefono ? ` (${telefonoLegible(v.telefono)}, sin cuenta)` : ''} · vence {formatearFechaHora(v.vence_at)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editable && cerrada && competidores < 3 && (
        <div style={{ background: '#fff4f4', border: '1px solid #f1c0c0', borderRadius: '8px', padding: '10px 14px', marginBottom: '10px' }}>
          <strong style={{ color: '#842029' }}>🔴 {competidores} {doble ? 'duplas' : 'inscritos'}: no alcanza para sortear (mínimo 3).</strong>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
            <select value={fusion} onChange={(e) => setFusion(e.target.value)} style={{ fontSize: '12px', padding: '4px' }}>
              <option value="">Fusionar con…</option>
              {destinosFusion.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button
              disabled={!fusion || ocupado === 'fusionar'}
              onClick={() => {
                const dest = categorias.find((c) => c.id === fusion)!
                if (!confirm(`¿Fusionar ${categoria.nombre} con ${dest.nombre}? Sus inscripciones, pagos y duplas pasan allá y ${categoria.nombre} queda cancelada. Se avisa a los inscritos.`)) return
                accion('fusionar', 'cancelar-categoria', { categoriaId: categoria.id, destinoId: fusion }, `${categoria.nombre} fusionada con ${dest.nombre}`)
              }}
              style={boton('var(--color-court)', true)}
            >
              Fusionar
            </button>
            <button
              disabled={ocupado === 'cancelar-cat'}
              onClick={() => {
                if (!confirm(`¿Cancelar ${categoria.nombre}? Sus inscripciones se retiran con el pago marcado para devolución y se avisa a los inscritos.`)) return
                accion('cancelar-cat', 'cancelar-categoria', { categoriaId: categoria.id }, `${categoria.nombre} cancelada`)
              }}
              style={boton('#c0392b')}
            >
              Cancelar categoría
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
