'use client'
import { useState } from 'react'
import { formatearFechaHora } from '@/lib/tiempo'
import { ETIQUETA_FASE, textoOrigen, type EstadoTorneo } from '@/lib/torneo'
import { ETIQUETA_METODO_SORTEO, METODOS_SORTEO, type FormatoSorteo, type MetodoSorteo } from '@/lib/torneoSorteo'

// Sorteo del torneo (SPEC §3) POR CATEGORÍA, dentro de la pestaña Torneo del
// admin: siembra y bombo de cada equipo (la dupla en dobles, la inscripción
// en single e infantil; pagado o no), vista previa de una categoría
// (repetible, no guarda nada) y su publicación. Cada categoría se publica por
// separado; el torneo queda "Sorteado" con la última. Por
// /api/admin/torneo/siembra y /api/admin/torneo/sorteo/...

type EquipoSorteo = { id: string; categoria_id: string; siembra: number | null; bombo: number | null; nombre: string; pendiente: boolean }
type CategoriaSorteo = { id: string; nombre: string; es_infantil: boolean; modalidad: string; sorteo_publicado_at: string | null; sorteo_metodo: MetodoSorteo | null; cancelada_at: string | null }

type CategoriaPrevia =
  | { categoriaId: string; nombre: string; inscritas: number; error: string }
  | {
      categoriaId: string; nombre: string; inscritas: number; formato: FormatoSorteo; grupos: string[][]
      gruposDetalle: { letra: string; miembros: { id: string; nombre: string; siembra: number | null; bombo: number | null }[] }[]
      partidosGrupo: number
      llave: { fase: string; orden: number; origen_a: string; origen_b: string }[]
    }

type Previa = { metodo: MetodoSorteo; bloqueado: boolean; errores: string[]; avisos: string[]; categorias: CategoriaPrevia[] }

const tarjeta: React.CSSProperties = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }
const btn = (color: string, relleno = false): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
  border: `1px solid ${color}`, background: relleno ? color : 'white', color: relleno ? 'white' : color,
})

export default function TorneoSorteo({
  torneo,
  categorias,
  equipos,
  sinPareja,
  publicadoPor,
  onCambio,
}: {
  torneo: { id: string; estado: EstadoTorneo; sorteo_metodo: MetodoSorteo | null; sorteo_publicado_at: string | null }
  categorias: CategoriaSorteo[]
  equipos: EquipoSorteo[]
  sinPareja: Record<string, number>
  publicadoPor: string | null
  onCambio: () => Promise<void>
}) {
  const [metodo, setMetodo] = useState<MetodoSorteo>('bombos')
  const [previas, setPrevias] = useState<Record<string, Previa>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const post = async (ruta: string, body: object) => {
    const res = await fetch(`/api/admin/torneo/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción')
    return data
  }

  const ejecutar = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave); setError(''); setMensaje('')
    try { await fn() } catch (err: any) { setError(err.message) } finally { setOcupado(null) }
  }
  const sinPrevia = (categoriaId: string) => setPrevias((p) => { const { [categoriaId]: _, ...resto } = p; return resto })

  const editable = torneo.estado === 'borrador' || torneo.estado === 'inscripcion'
  const guardar = (e: EquipoSorteo, campo: 'siembra' | 'bombo', valor: string) => {
    const n = valor.trim() === '' ? null : Number(valor)
    if (n === e[campo]) return
    ejecutar(`${campo}-${e.id}`, async () => {
      await post('siembra', { equipoId: e.id, siembra: campo === 'siembra' ? n : e.siembra, bombo: campo === 'bombo' ? n : e.bombo })
      sinPrevia(e.categoria_id)
      await onCambio()
    })
  }

  const sortear = (c: CategoriaSorteo) => ejecutar(`previa-${c.id}`, async () => {
    const p = await post('sorteo/vista-previa', { categoriaId: c.id, metodo })
    setPrevias((x) => ({ ...x, [c.id]: p }))
  })

  const publicar = (c: CategoriaSorteo) => {
    const previa = previas[c.id]
    const cat = previa?.categorias[0]
    if (!previa || previa.bloqueado || !cat || !('grupos' in cat)) return
    if (!confirm(`¿Publicar el sorteo de ${c.nombre}? Queda fijo: se crean sus grupos, partidos y llave, se cierran sus inscripciones y se avisa a cada jugador y representante.`)) return
    ejecutar(`publicar-${c.id}`, async () => {
      const r = await post('sorteo/publicar', { categoriaId: c.id, metodo: previa.metodo, grupos: cat.grupos })
      sinPrevia(c.id)
      setMensaje(`Sorteo de ${c.nombre} publicado${r.torneoSorteado ? ' — con esta, el torneo quedó sorteado' : ''}`)
      await onCambio()
    })
  }

  return (
    <div>
      <div style={tarjeta}>
        <h4 style={{ margin: '0 0 6px 0', color: 'var(--color-ink)' }}>🎲 Sorteo de grupos (por categoría)</h4>
        {torneo.sorteo_publicado_at && (
          <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#1e6b34' }}>
            ✅ Todas las categorías están sorteadas ({formatearFechaHora(torneo.sorteo_publicado_at)} · {publicadoPor || 'admin'}). <a href="/torneo" style={{ color: 'var(--color-court)', fontWeight: 'bold' }}>Ver grupos y llaves en /torneo →</a>
          </p>
        )}
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#555' }}>
          Cada categoría se sortea y se publica <strong>por separado</strong>; al publicarla se cierran sus inscripciones. Entran <strong>todas las duplas (o inscripciones) activas, hayan pagado o no</strong>: el pago se sigue reportando y validando después. Antes hay que resolver la categoría oficial, la certificación de los menores, la autorización de los invitados / wild card y, en dobles, los jugadores sin pareja.
          <strong> Bombos:</strong> las siembras 1..G son cabezas fijas de A..G; cada bombo siguiente se sortea uno por grupo; lo que no tiene bombo va al final. <strong>Serpentina:</strong> zigzag por siembra; lo que no tiene siembra va detrás, al azar.
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {METODOS_SORTEO.map((m) => (
            <label key={m} style={{ fontSize: '14px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="radio" checked={metodo === m} onChange={() => { setMetodo(m); setPrevias({}) }} />
              {ETIQUETA_METODO_SORTEO[m]}{m === 'bombos' ? ' (por defecto)' : ''}
            </label>
          ))}
        </div>
      </div>

      {mensaje && <p style={{ background: '#dff5e3', color: '#1e6b34', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{mensaje}</p>}
      {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{error}</p>}

      {categorias.map((c) => {
        const delaCat = equipos.filter((e) => e.categoria_id === c.id)
        const pendientes = delaCat.filter((e) => e.pendiente).length
        const ordenados = [...delaCat].sort((a, b) => (a.siembra ?? 999) - (b.siembra ?? 999) || a.nombre.localeCompare(b.nombre))
        const doble = c.modalidad === 'doble'
        const previa = previas[c.id]
        const puedeSortear = editable && !c.sorteo_publicado_at && !c.cancelada_at
        return (
          <div key={c.id} style={{ ...tarjeta, opacity: c.cancelada_at ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ margin: '0 0 4px 0', color: 'var(--color-ink)' }}>{c.nombre}</h4>
                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: delaCat.length < 3 && puedeSortear ? '#c0392b' : '#666' }}>
                  {c.cancelada_at ? 'Cancelada' : c.sorteo_publicado_at
                    ? `🎲 Sorteada el ${formatearFechaHora(c.sorteo_publicado_at)} · ${ETIQUETA_METODO_SORTEO[c.sorteo_metodo!] || c.sorteo_metodo}. Queda fija.`
                    : <>
                        {delaCat.length} {doble ? 'duplas' : 'inscripciones'}{pendientes ? ` · ${pendientes} con pago u otro pendiente` : ''}
                        {doble && sinPareja[c.id] ? ` · ${sinPareja[c.id]} jugadores sin pareja (bloquea el sorteo)` : ''}
                        {delaCat.length < 3 ? ' · menos de 3: bloquea el sorteo (fusiónala o cancélala en Inscripciones)' : ''}
                      </>}
                </p>
              </div>
              {puedeSortear && (
                <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button disabled={ocupado === `previa-${c.id}`} onClick={() => sortear(c)} style={btn('var(--color-court)', true)}>
                    {ocupado === `previa-${c.id}` ? 'Sorteando…' : previa ? '🔁 Repetir' : '🎲 Vista previa'}
                  </button>
                  {previa && !previa.bloqueado && (
                    <button disabled={ocupado === `publicar-${c.id}`} onClick={() => publicar(c)} style={btn('#c0392b', true)}>
                      {ocupado === `publicar-${c.id}` ? 'Publicando…' : '📣 Publicar'}
                    </button>
                  )}
                </span>
              )}
            </div>

            {previa && <VistaPrevia previa={previa} />}

            {ordenados.length > 0 && !c.cancelada_at && (
              <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%', maxWidth: '560px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#666' }}>
                    <th style={{ padding: '4px 6px' }}>{doble ? 'Dupla' : 'Inscripción'}</th>
                    <th style={{ padding: '4px 6px', width: '80px' }}>Siembra</th>
                    {metodo === 'bombos' && <th style={{ padding: '4px 6px', width: '80px' }}>Bombo</th>}
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((e) => (
                    <tr key={e.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '4px 6px' }}>
                        {e.nombre}
                        {e.pendiente && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#8a5a00', background: '#fff4d6', padding: '1px 6px', borderRadius: '999px' }}>pendiente</span>}
                      </td>
                      {(['siembra', 'bombo'] as const).filter((campo) => campo === 'siembra' || metodo === 'bombos').map((campo) => (
                        <td key={campo} style={{ padding: '4px 6px' }}>
                          <input
                            type="number"
                            min={1}
                            defaultValue={e[campo] ?? ''}
                            key={`${campo}-${e[campo]}`}
                            disabled={!puedeSortear || ocupado === `${campo}-${e.id}`}
                            onBlur={(ev) => guardar(e, campo, ev.target.value)}
                            style={{ width: '60px', padding: '4px', border: '1px solid #ccc', borderRadius: '6px' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

function VistaPrevia({ previa }: { previa: Previa }) {
  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '10px 14px', margin: '0 0 12px 0' }}>
      <strong style={{ fontSize: '13px', color: 'var(--color-ink)' }}>Vista previa — {ETIQUETA_METODO_SORTEO[previa.metodo]} (sin guardar)</strong>
      {previa.errores.length > 0 && (
        <div style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', margin: '8px 0' }}>
          <strong>⛔ El sorteo está bloqueado:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>{previa.errores.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {previa.avisos.length > 0 && (
        <div style={{ background: '#fff4d6', color: '#8a5a00', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', margin: '8px 0' }}>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>{previa.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {previa.categorias.filter((c) => 'gruposDetalle' in c).map((c: any) => (
        <div key={c.categoriaId} style={{ padding: '8px 0 0 0' }}>
          {c.formato?.descripcion && <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--color-court)' }}>📐 Formato: {c.formato.descripcion}</div>}
          <span style={{ fontSize: '12px', color: '#666' }}>
            {c.inscritas} en el sorteo · {c.partidosGrupo} partidos de grupo ·{' '}
            {c.llave.length ? `llave desde ${ETIQUETA_FASE[c.llave[0].fase as keyof typeof ETIQUETA_FASE].toLowerCase()} (${c.llave.filter((p: any) => p.fase === c.llave[0].fase).map((p: any) => `${textoOrigen(p.origen_a)} vs ${textoOrigen(p.origen_b)}`).join(' · ')})` : 'sin llave'}
          </span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
            {c.gruposDetalle.map((g: any) => (
              <div key={g.letra} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '8px 12px', minWidth: '170px', background: 'white' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>Grupo {g.letra}</div>
                {g.miembros.map((m: any, k: number) => (
                  <div key={m.id} style={{ fontSize: '13px' }}>
                    {k === 0 && c.gruposDetalle.length > 1 ? '⭐ ' : ''}{m.nombre}
                    {m.siembra ? <span style={{ color: '#888', fontSize: '11px' }}> (s{m.siembra})</span> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
