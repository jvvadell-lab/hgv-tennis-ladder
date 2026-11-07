'use client'
import { useEffect, useState } from 'react'
import { hoyEnCaracas } from '@/lib/tiempo'
import { MEDIDAS_PIEZA, tipoPorDefecto, type FormatoPieza, type TipoPieza } from '@/lib/torneoDifusion'

// Zona 📣 Difusión (SPEC §18): la pieza de la semana o del día, lista para
// descargar o compartir. La imagen sale de /api/publico/torneo/pieza.

type Datos = { paginas: number; partidos: number; porValidar: number; texto: string }

const tarjeta: React.CSSProperties = { background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }
const boton = (activo: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
  border: activo ? '2px solid var(--color-ink)' : '1px solid #ddd', background: activo ? 'var(--color-ink)' : 'white', color: activo ? 'white' : 'var(--color-ink)',
})
const accion: React.CSSProperties = { padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-court)', background: 'white', color: 'var(--color-ink)', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }

export default function TorneoDifusion({ onIrAResultados }: { onIrAResultados: () => void }) {
  const [fecha, setFecha] = useState(hoyEnCaracas)
  const [tipo, setTipo] = useState<TipoPieza>(() => tipoPorDefecto(hoyEnCaracas()))
  const [formato, setFormato] = useState<FormatoPieza>('historia')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)

  const consulta = `tipo=${tipo}&fecha=${fecha}&formato=${formato}`

  useEffect(() => {
    if (!fecha) return
    let vigente = true
    setDatos(null)
    setError('')
    fetch(`/api/admin/torneo/difusion?${consulta}`, { cache: 'no-store' })
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'No se pudo preparar la pieza')))))
      .then((d: Datos) => { if (vigente) setDatos(d) })
      .catch((err) => { if (vigente) setError(err.message) })
    return () => { vigente = false }
  }, [consulta, fecha])

  const urlDe = (pagina: number) => `/api/publico/torneo/pieza?${consulta}&pagina=${pagina}`

  const archivoDe = async (pagina: number) => {
    const res = await fetch(urlDe(pagina))
    if (!res.ok) throw new Error('No se pudo generar la imagen')
    const nombre = `copa-navidad-${tipo === 'dia' ? 'hoy' : 'semana'}-${fecha}-${formato}${datos && datos.paginas > 1 ? `-${pagina}` : ''}.png`
    return new File([await res.blob()], nombre, { type: 'image/png' })
  }

  const guardar = (archivo: File) => {
    const url = URL.createObjectURL(archivo)
    const a = document.createElement('a')
    a.href = url
    a.download = archivo.name
    a.click()
    URL.revokeObjectURL(url)
  }

  const descargar = async (pagina: number) => {
    setError('')
    try {
      guardar(await archivoDe(pagina))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const compartir = async (pagina: number) => {
    setError('')
    try {
      const archivo = await archivoDe(pagina)
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo] })
      else guardar(archivo)
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message)   // AbortError: cerró el menú de compartir
    }
  }

  const copiar = async () => {
    if (!datos) return
    await navigator.clipboard.writeText(datos.texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const { ancho, alto } = MEDIDAS_PIEZA[formato]

  return (
    <div>
      <div style={tarjeta}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {([['semana', 'Semana'], ['dia', 'Día']] as const).map(([id, texto]) => <button key={id} onClick={() => setTipo(id)} style={boton(tipo === id)}>{texto}</button>)}
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ padding: '6px', fontSize: '13px', borderRadius: '6px', border: '1px solid #ccc' }} />
          <span style={{ width: '12px' }} />
          {([['historia', 'Historia'], ['post', 'Post']] as const).map(([id, texto]) => <button key={id} onClick={() => setFormato(id)} style={boton(formato === id)}>{texto}</button>)}
        </div>
      </div>

      {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{error}</p>}

      {!!datos?.porValidar && (
        <p style={{ background: '#fff4d6', color: '#8a5a00', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>
          ⚠️ {datos.porValidar === 1 ? 'Hay 1 resultado por validar: valídalo para que salga en la pieza.' : `Hay ${datos.porValidar} resultados por validar: valídalos para que salgan en la pieza.`}{' '}
          <button onClick={onIrAResultados} style={{ background: 'none', border: 'none', padding: 0, color: '#8a5a00', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px' }}>Ir a Resultados</button>
        </p>
      )}

      {!datos && !error && <p className="loading-row"><span className="spinner" /> Preparando la pieza…</p>}

      {datos && (
        <>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {Array.from({ length: datos.paginas }, (_, i) => i + 1).map((pagina) => (
              <div key={pagina} style={{ width: 'min(320px, 100%)' }}>
                <img src={urlDe(pagina)} alt={`Pieza, página ${pagina} de ${datos.paginas}`} width={ancho} height={alto} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '6px', background: '#0B1F3A' }} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button onClick={() => descargar(pagina)} style={accion}>⬇️ Descargar</button>
                  <button onClick={() => compartir(pagina)} style={accion}>📤 Compartir</button>
                </div>
              </div>
            ))}
          </div>

          <div style={tarjeta}>
            <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-ink)' }}>Texto sugerido</h4>
            <textarea readOnly value={datos.texto} rows={Math.min(10, datos.texto.split('\n').length + 1)} style={{ width: '100%', boxSizing: 'border-box', fontSize: '13px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: 'inherit' }} />
            <button onClick={copiar} style={{ ...accion, marginTop: '8px' }}>{copiado ? '✓ Copiado' : '📋 Copiar texto'}</button>
          </div>
        </>
      )}
    </div>
  )
}
