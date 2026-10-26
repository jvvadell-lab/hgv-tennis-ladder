// Patrocinantes de la portada (tabla patrocinantes). Tipos y validación
// compartidos entre /api/admin/patrocinantes y el panel — sin imports de
// servidor.

export type NivelPatrocinante = 'principal' | 'estandar'
export type FondoLogo = 'claro' | 'oscuro'

export type Patrocinante = {
  id: string
  nombre: string
  logo_url: string | null
  instagram: string | null
  enlace_url: string | null
  promo: string | null
  nivel: NivelPatrocinante
  fondo: FondoLogo
  orden: number
  activo: boolean
}

// Lo que ve la portada (sin auditoría).
export type PatrocinantePublico = Pick<Patrocinante, 'id' | 'nombre' | 'logo_url' | 'instagram' | 'enlace_url' | 'promo' | 'nivel' | 'fondo'>

export const COLUMNAS_PUBLICAS = 'id, nombre, logo_url, instagram, enlace_url, promo, nivel, fondo'

// "@petsmall", "instagram.com/petsmall/" o "petsmall" → "petsmall".
export function normalizarInstagram(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
  return limpio || null
}

export function enlaceDe(p: Pick<Patrocinante, 'instagram' | 'enlace_url'>): string | null {
  if (p.instagram) return `https://instagram.com/${p.instagram}`
  return p.enlace_url || null
}

export type DatosPatrocinante = Omit<Patrocinante, 'id'>

// Valida lo que manda el panel. Devuelve el registro listo para guardar o un error legible.
export function validarPatrocinante(body: any): { ok: true; datos: DatosPatrocinante } | { ok: false; error: string } {
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return { ok: false, error: 'Escribe el nombre del patrocinante.' }
  if (nombre.length > 80) return { ok: false, error: 'El nombre es muy largo (máximo 80 caracteres).' }

  const instagram = normalizarInstagram(body?.instagram)
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
    return { ok: false, error: 'El usuario de Instagram solo puede tener letras, números, punto y guion bajo.' }
  }

  const enlace = typeof body?.enlace_url === 'string' ? body.enlace_url.trim() : ''
  if (enlace && !/^https:\/\/\S+$/.test(enlace)) return { ok: false, error: 'El enlace debe empezar por https://' }

  const promo = typeof body?.promo === 'string' ? body.promo.trim() : ''
  if (promo.length > 120) return { ok: false, error: 'La promo es muy larga (máximo 120 caracteres).' }

  const logo = typeof body?.logo_url === 'string' ? body.logo_url.trim() : ''
  if (logo && !/^(https:\/\/\S+|\/[\w./-]+)$/.test(logo)) return { ok: false, error: 'La URL del logo no es válida.' }

  const orden = Number.isFinite(Number(body?.orden)) ? Math.round(Number(body.orden)) : 0

  return {
    ok: true,
    datos: {
      nombre,
      logo_url: logo || null,
      instagram,
      enlace_url: enlace || null,
      promo: promo || null,
      nivel: body?.nivel === 'principal' ? 'principal' : 'estandar',
      fondo: body?.fondo === 'oscuro' ? 'oscuro' : 'claro',
      orden,
      activo: body?.activo !== false,
    },
  }
}
