'use client'
import { useState } from 'react'
import { comprimirImagen } from '@/lib/comprimirImagen'
import { TEXTO_FALTA_AUTORIZACION } from '@/lib/torneoFotos'

// Agregar o cambiar la foto de un partido del torneo (SPEC §17). La usan Mis
// partidos y Admin → Resultados, cada una con su ruta.

export async function subirFotoPartido(ruta: string, partidoId: string, archivo: File) {
  const form = new FormData()
  form.append('partidoId', partidoId)
  form.append('foto', await comprimirImagen(archivo, 1600))
  const res = await fetch(ruta, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo subir la foto')
}

type Props = {
  ruta: string
  partidoId: string
  textoAgregar: string
  textoCambiar: string
  tieneFoto: boolean
  faltaAutorizacion: boolean
  onSubida: () => void | Promise<void>
  onError: (mensaje: string) => void
  estilo?: React.CSSProperties
}

export default function BotonFotoPartido({ ruta, partidoId, textoAgregar, textoCambiar, tieneFoto, faltaAutorizacion, onSubida, onError, estilo }: Props) {
  const [subiendo, setSubiendo] = useState(false)
  const base: React.CSSProperties = { display: 'inline-block', padding: '8px 14px', border: '1px solid var(--color-court)', background: 'white', borderRadius: '4px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', ...estilo }

  if (faltaAutorizacion) {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
        <button type="button" disabled style={{ ...base, opacity: 0.5, cursor: 'not-allowed' }}>{textoAgregar}</button>
        <span style={{ fontSize: '12px', color: '#8a5a00' }}>{TEXTO_FALTA_AUTORIZACION}</span>
      </span>
    )
  }

  return (
    <label style={{ ...base, opacity: subiendo ? 0.6 : 1 }}>
      {subiendo ? '⏳ Subiendo…' : tieneFoto ? textoCambiar : textoAgregar}
      <input
        type="file"
        accept="image/*"
        disabled={subiendo}
        style={{ display: 'none' }}
        onChange={async (e) => {
          const archivo = e.target.files?.[0]
          e.target.value = ''
          if (!archivo) return
          setSubiendo(true)
          try {
            await subirFotoPartido(ruta, partidoId, archivo)
            await onSubida()
          } catch (err: any) {
            onError(err.message)
          } finally {
            setSubiendo(false)
          }
        }}
      />
    </label>
  )
}
