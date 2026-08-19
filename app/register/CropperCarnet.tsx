'use client'
import { useRef, useState, useEffect } from 'react'

// Tamaño del recuadro de recorte en pantalla, con la proporción estándar de
// una tarjeta/carné (ISO ID-1, la misma de una cédula o tarjeta de crédito).
const CROP_W = 300
const CROP_H = 189 // 300 / 1.586
const OUTPUT_W = 900
const OUTPUT_H = Math.round(OUTPUT_W / (CROP_W / CROP_H))

export default function CropperCarnet({
  archivo,
  onConfirmar,
  onCancelar,
}: {
  archivo: File
  onConfirmar: (archivoRecortado: File) => void
  onCancelar: () => void
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const arrastrando = useRef(false)
  const ultimoPunto = useRef({ x: 0, y: 0 })
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(archivo)
    setImgUrl(url)
    const img = new window.Image()
    img.onload = () => {
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  // La imagen siempre debe cubrir por completo el recuadro de recorte (como
  // "object-fit: cover") — baseScale es el zoom mínimo que logra eso.
  const baseScale = imgNatural.w && imgNatural.h
    ? Math.max(CROP_W / imgNatural.w, CROP_H / imgNatural.h)
    : 1
  const displayScale = baseScale * zoom
  const dispW = imgNatural.w * displayScale
  const dispH = imgNatural.h * displayScale
  const baseLeft = (CROP_W - dispW) / 2
  const baseTop = (CROP_H - dispH) / 2

  // No dejamos que el usuario arrastre la imagen tanto que queden espacios
  // vacíos dentro del recuadro — el pan queda "atrapado" dentro de esos límites.
  const clampPan = (p: { x: number; y: number }, escala: number) => {
    if (!imgNatural.w || !imgNatural.h) return p
    const w = imgNatural.w * escala
    const h = imgNatural.h * escala
    const bLeft = (CROP_W - w) / 2
    const bTop = (CROP_H - h) / 2
    const minPanX = CROP_W - w - bLeft
    const maxPanX = -bLeft
    const minPanY = CROP_H - h - bTop
    const maxPanY = -bTop
    return {
      x: Math.min(maxPanX, Math.max(minPanX, p.x)),
      y: Math.min(maxPanY, Math.max(minPanY, p.y)),
    }
  }

  useEffect(() => {
    setPan((p) => clampPan(p, baseScale * zoom))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, imgNatural.w, imgNatural.h])

  const handlePointerDown = (e: React.PointerEvent) => {
    arrastrando.current = true
    ultimoPunto.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!arrastrando.current) return
    const dx = e.clientX - ultimoPunto.current.x
    const dy = e.clientY - ultimoPunto.current.y
    ultimoPunto.current = { x: e.clientX, y: e.clientY }
    setPan((p) => clampPan({ x: p.x + dx, y: p.y + dy }, displayScale))
  }
  const handlePointerUp = () => {
    arrastrando.current = false
  }

  const confirmar = () => {
    if (!imgNatural.w || !imgNatural.h || !imgRef.current) return
    const imgLeft = baseLeft + pan.x
    const imgTop = baseTop + pan.y

    // Convertimos la posición/zoom que ve el usuario en píxeles reales de la
    // foto original, para recortar exactamente esa porción a buena calidad.
    const srcX = (0 - imgLeft) / displayScale
    const srcY = (0 - imgTop) / displayScale
    const srcW = CROP_W / displayScale
    const srcH = CROP_H / displayScale

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_W
    canvas.height = OUTPUT_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(imgRef.current, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_W, OUTPUT_H)

    canvas.toBlob((blob) => {
      if (!blob) return
      const archivoRecortado = new File([blob], 'carnet.jpg', { type: 'image/jpeg' })
      onConfirmar(archivoRecortado)
    }, 'image/jpeg', 0.9)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,27,38,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px',
    }}>
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px', maxWidth: '360px', width: '100%' }}>
        <p style={{ margin: '0 0 4px 0', fontWeight: 700, color: 'var(--color-ink)', fontSize: '15px' }}>
          Ajusta la foto de tu carné
        </p>
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#666' }}>
          Arrastra la foto para moverla, y usa el control para acercar o alejar.
        </p>
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            width: CROP_W, height: CROP_H, margin: '0 auto', overflow: 'hidden',
            position: 'relative', background: '#000', borderRadius: '4px',
            border: '2px solid var(--color-ball)', cursor: 'grab', touchAction: 'none',
          }}
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              alt="Foto a recortar"
              draggable={false}
              style={{
                position: 'absolute',
                left: baseLeft + pan.x,
                top: baseTop + pan.y,
                width: dispW,
                height: dispH,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
        <div style={{ margin: '14px 0' }}>
          <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>🔍 Zoom</label>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={confirmar}
            style={{
              flex: 1, background: 'var(--color-ball)', color: 'var(--color-ink)', border: 'none',
              padding: '12px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '14px',
            }}
          >
            ✅ Usar esta foto
          </button>
          <button
            type="button"
            onClick={onCancelar}
            style={{
              flex: 1, background: 'none', border: '1px solid #ccc', color: '#555',
              padding: '12px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
