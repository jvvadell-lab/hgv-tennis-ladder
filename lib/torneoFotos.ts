// Foto de los partidos del torneo (SPEC §17): reglas compartidas entre el
// servidor y las pantallas — sin imports de servidor.

export const TEXTO_FALTA_AUTORIZACION = 'Falta la autorización de uso de imagen del representante'

// La carpeta del bucket fotos-partidos. Lo demás del bucket (fotos de la
// escalera, logos) nunca se borra desde aquí.
export const CARPETA_FOTOS = 'torneo/'
const MARCA_BUCKET = '/fotos-partidos/'

export const TIPOS_FOTO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
// Por debajo del límite de 4,5 MB de una función de Vercel. El navegador la
// manda ya comprimida a 1600 px (lib/comprimirImagen.ts).
export const MAX_BYTES_FOTO = 4 * 1024 * 1024

// Solo un partido jugado lleva foto: reportar o cargar el resultado lo deja
// en 'jugado', validado o no. Sin foto en WO ni en doble WO.
export const aceptaFoto = (p: { estado: string }) => p.estado === 'jugado'

// Lo público solo muestra lo validado: si el admin corrige el partido a WO, la
// foto deja de verse. La falta de autorización manda aunque la foto ya exista.
export const fotoPublica = (
  p: { foto_url: string | null; validado: boolean; estado: string },
  faltaAutorizacion: boolean,
): string | null => (p.validado && aceptaFoto(p) && !faltaAutorizacion ? p.foto_url : null)

// Ruta dentro del bucket de una foto del torneo, para borrarla. null si la URL
// no es de la carpeta del torneo.
export function rutaFotoTorneo(url: string | null): string | null {
  const i = url?.indexOf(MARCA_BUCKET) ?? -1
  if (!url || i < 0) return null
  const ruta = decodeURIComponent(url.slice(i + MARCA_BUCKET.length).split('?')[0])
  return ruta.startsWith(CARPETA_FOTOS) && !ruta.includes('..') ? ruta : null
}

export function errorArchivoFoto(archivo: { type: string; size: number }): string | null {
  if (!TIPOS_FOTO[archivo.type]) return 'La foto debe ser JPG, PNG o WebP'
  if (archivo.size > MAX_BYTES_FOTO) return 'La foto pesa demasiado (máximo 4 MB)'
  return null
}
