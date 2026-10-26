'use client'
import { useEffect, useState } from 'react'
import type { Patrocinante } from '@/lib/patrocinantes'

// Tarjeta "Patrocinantes" del Dashboard del admin: alta, edición, orden,
// activar/apagar y logo. Lo que está activo sale en la cinta de la portada;
// los de nivel "principal" además van en el banner del torneo.

type Borrador = Omit<Patrocinante, 'id'> & { id?: string }

const VACIO: Borrador = { nombre: '', logo_url: null, instagram: '', enlace_url: '', promo: '', nivel: 'estandar', orden: 0, activo: true }

// Reduce el logo a 480 px de ancho en WebP (conserva la transparencia, a
// diferencia de comprimirImagen que pasa a JPEG con fondo negro).
async function logoAWebp(file: File): Promise<File> {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, 480 / bmp.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.88))
  if (!blob || blob.type !== 'image/webp') return file   // navegador sin WebP: sube el original
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}

const estiloInput = { width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' as const }
const estiloLabel = { fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }

export default function PatrocinantesAdmin() {
  const [lista, setLista] = useState<Patrocinante[]>([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    setCargando(true)
    try {
      const r = await fetch('/api/admin/patrocinantes', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setLista(d.patrocinantes)
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'No se pudieron cargar los patrocinantes'))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { cargar() }, [])

  const guardar = async (p: Borrador) => {
    setGuardando(true)
    setMsg('')
    try {
      const r = await fetch('/api/admin/patrocinantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg('✅ Guardado. La portada se actualiza en un minuto.')
      setEditando(null)
      await cargar()
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'Error al guardar'))
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (p: Patrocinante) => {
    if (!confirm(`¿Eliminar a ${p.nombre}? Si solo quieres sacarlo de la portada, desactívalo.`)) return
    const r = await fetch(`/api/admin/patrocinantes?id=${p.id}`, { method: 'DELETE' })
    const d = await r.json()
    setMsg(r.ok ? '✅ Eliminado.' : '❌ ' + d.error)
    cargar()
  }

  const mover = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= lista.length) return
    const a = lista[i], b = lista[j]
    // Reasigna órdenes espaciados para que el intercambio siempre cambie algo.
    await Promise.all([
      guardarSilencioso({ ...a, orden: (j + 1) * 10 }),
      guardarSilencioso({ ...b, orden: (i + 1) * 10 }),
    ])
    cargar()
  }
  const guardarSilencioso = (p: Patrocinante) =>
    fetch('/api/admin/patrocinantes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })

  const subirLogo = async (file: File) => {
    if (!editando) return
    setSubiendo(true)
    setMsg('')
    try {
      const logo = await logoAWebp(file)
      const form = new FormData()
      form.append('logo', logo)
      const r = await fetch('/api/admin/patrocinantes/logo', { method: 'POST', body: form })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setEditando({ ...editando, logo_url: d.url })
    } catch (e: any) {
      setMsg('❌ ' + (e.message || 'Error al subir el logo'))
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: 'var(--color-ink)', margin: 0 }}>🤝 Patrocinantes</h3>
          <p style={{ color: '#6b6b6b', fontSize: '13px', margin: '4px 0 0 0' }}>
            Los activos salen en la cinta animada de la portada. Los de nivel <strong>principal</strong> también van en el banner del torneo.
          </p>
        </div>
        {!editando && (
          <button
            onClick={() => setEditando({ ...VACIO, orden: (lista.length + 1) * 10 })}
            style={{ background: 'var(--color-court)', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Agregar
          </button>
        )}
      </div>

      {msg && <p style={{ fontSize: '13px', margin: '12px 0 0 0' }}>{msg}</p>}

      {editando && (
        <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', border: '1px solid #e2dccd', background: 'white' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={estiloLabel}>Nombre *</label>
              <input style={estiloInput} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Banco Sofitasa" />
            </div>
            <div>
              <label style={estiloLabel}>Instagram</label>
              <input style={estiloInput} value={editando.instagram || ''} onChange={(e) => setEditando({ ...editando, instagram: e.target.value })} placeholder="@bancosofitasa" />
            </div>
            <div>
              <label style={estiloLabel}>Enlace (si no tiene Instagram)</label>
              <input style={estiloInput} value={editando.enlace_url || ''} onChange={(e) => setEditando({ ...editando, enlace_url: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <label style={estiloLabel}>Promo o cupón (opcional)</label>
              <input style={estiloInput} maxLength={120} value={editando.promo || ''} onChange={(e) => setEditando({ ...editando, promo: e.target.value })} placeholder="10% con el código HGV" />
            </div>
            <div>
              <label style={estiloLabel}>Nivel</label>
              <select style={estiloInput} value={editando.nivel} onChange={(e) => setEditando({ ...editando, nivel: e.target.value as Borrador['nivel'] })}>
                <option value="estandar">Estándar (solo cinta)</option>
                <option value="principal">Principal (cinta + banner del torneo)</option>
              </select>
            </div>
            <div>
              <label style={estiloLabel}>Logo (PNG con fondo transparente, ideal)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '96px', height: '54px', borderRadius: '6px', background: 'var(--color-chalk)', border: '1px solid #e2dccd', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', boxSizing: 'border-box' }}>
                  {editando.logo_url
                    ? <img src={editando.logo_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: '11px', color: '#999' }}>Sin logo</span>}
                </div>
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={subiendo} onChange={(e) => e.target.files?.[0] && subirLogo(e.target.files[0])} style={{ fontSize: '12px', maxWidth: '100%' }} />
              </div>
              {subiendo && <span style={{ fontSize: '12px', color: '#666' }}>Subiendo…</span>}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#333', margin: '14px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
            Mostrar en la portada
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => guardar(editando)}
              disabled={guardando || subiendo}
              style={{ background: 'var(--color-court)', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 600, cursor: 'pointer', opacity: guardando || subiendo ? 0.6 : 1 }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => setEditando(null)} style={{ background: 'none', border: '1px solid #ccc', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {cargando ? (
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Cargando…</p>
        ) : lista.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Todavía no hay patrocinantes. Agrega el primero.</p>
        ) : lista.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'white', border: '1px solid #ece6d8', opacity: p.activo ? 1 : 0.55, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <button aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', padding: 0, lineHeight: 1.2 }}>▲</button>
              <button aria-label="Bajar" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', padding: 0, lineHeight: 1.2 }}>▼</button>
            </div>
            <div style={{ width: '80px', height: '44px', borderRadius: '6px', background: 'var(--color-chalk)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', boxSizing: 'border-box', flexShrink: 0 }}>
              {p.logo_url ? <img src={p.logo_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '10px', color: '#999' }}>Sin logo</span>}
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <strong style={{ fontSize: '14px', color: 'var(--color-ink)' }}>{p.nombre}</strong>
              {p.nivel === 'principal' && <span style={{ marginLeft: '6px', fontSize: '11px', background: '#d4e157', color: '#1b2e10', padding: '2px 7px', borderRadius: '999px', fontWeight: 700 }}>Principal</span>}
              {!p.activo && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#888' }}>(oculto)</span>}
              <div style={{ fontSize: '12px', color: '#777' }}>
                {p.instagram ? `@${p.instagram}` : p.enlace_url || 'Sin enlace'}{p.promo ? ` · ${p.promo}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => guardar({ ...p, activo: !p.activo })} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', background: 'white', cursor: 'pointer' }}>
                {p.activo ? 'Ocultar' : 'Mostrar'}
              </button>
              <button onClick={() => { setMsg(''); setEditando({ ...p }) }} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', background: 'white', cursor: 'pointer' }}>
                Editar
              </button>
              <button onClick={() => eliminar(p)} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0b4b4', color: '#a33', background: 'white', cursor: 'pointer' }}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
