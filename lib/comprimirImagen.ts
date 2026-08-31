// Redimensiona y recomprime una imagen en el navegador antes de subirla, para no
// llenar Storage (y su egress) con fotos de cámara de 3-8MB a resolución completa.
// Los archivos que no son imagen (ej. PDF de un informe médico) se devuelven intactos.
export async function comprimirImagen(file: File, maxAncho: number, calidad = 0.78): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  let fuente: ImageBitmap | HTMLImageElement
  try {
    // imageOrientation: 'from-image' respeta la rotación EXIF de fotos tomadas
    // directo con la cámara del celular — si no, algunas quedan de lado.
    fuente = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    fuente = await cargarImagen(file)
  }

  const ancho = fuente instanceof ImageBitmap ? fuente.width : fuente.naturalWidth
  const alto = fuente instanceof ImageBitmap ? fuente.height : fuente.naturalHeight

  if (!ancho || !alto || ancho <= maxAncho) {
    if (fuente instanceof ImageBitmap) fuente.close()
    return file
  }

  const anchoFinal = maxAncho
  const altoFinal = Math.round(alto * (maxAncho / ancho))

  const canvas = document.createElement('canvas')
  canvas.width = anchoFinal
  canvas.height = altoFinal
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    if (fuente instanceof ImageBitmap) fuente.close()
    return file
  }
  ctx.drawImage(fuente, 0, 0, anchoFinal, altoFinal)
  if (fuente instanceof ImageBitmap) fuente.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', calidad))
  if (!blob) return file

  const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], nombre, { type: 'image/jpeg' })
}

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}
