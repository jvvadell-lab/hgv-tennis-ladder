// Invitación por correo a la inauguración de la Copa Navidad (vie 6-nov-2026,
// 6:00 pm en Caracas). Lógica pura: quién la recibe, con qué versión y cómo
// se arma el correo. El envío está en app/api/admin/correos/invitacion-inauguracion.
//
// Dos versiones: A 'inscrito' (tiene una inscripción en la Copa, o es
// representante de un niño inscrito) y B 'no_inscrito' (la B invita a
// inscribirse: después del cierre de inscripciones no se manda). La tarjeta
// va embebida en el correo (cid), no enlazada: muchos clientes bloquean
// imágenes remotas.

import { instanteEnCaracas } from './tiempo'

export const CAMPANA_INAUGURACION = 'inauguracion-copa-2026'

// Hasta cuándo tiene sentido mandarla: la hora del evento en Caracas.
export const INICIO_INAUGURACION = instanteEnCaracas('2026-11-06', '18:00')
// Cierre de inscripciones si el torneo no trae cierre_inscripciones_at.
export const CIERRE_INSCRIPCIONES_RESPALDO = instanteEnCaracas('2026-11-04', '23:59')

export const URL_SITIO = 'https://hgv-tennis-ladder.vercel.app'
export const REMITENTE_INAUGURACION = 'Comisión de Tenis HGV'

export const IMAGEN_INAUGURACION = {
  archivo: 'public/torneo/invitacion-inauguracion.jpg',
  url: '/torneo/invitacion-inauguracion.jpg',
  cid: 'tarjeta-inauguracion@hgv',
  ancho: 600,
  alto: 1170,
}

// Gmail (cuenta normal con contraseña de aplicación): hasta ~500
// destinatarios al día. Se manda en lotes cortos (el navegador del admin
// pide el siguiente lote), con pausa entre correos y un tope diario por
// debajo del límite.
export const TAMANO_LOTE = 10
export const PAUSA_ENTRE_CORREOS_MS = 1200
export const TOPE_DIARIO = 400

export type Variante = 'inscrito' | 'no_inscrito'

export const ASUNTO_INAUGURACION = 'Inauguración Copa Navidad 2026 – vie 6 de nov, 6:00 pm 🎾🎄'

// {nombre} = nombre de pila. [texto](/ruta) = enlace al sitio. Cada
// elemento es un párrafo; \n dentro de un párrafo es un salto de línea.
export const PLANTILLAS: Record<Variante, string[]> = {
  inscrito: [
    'Hola, {nombre} 🎾🎄',
    'Este viernes 6 de noviembre a las 6:00 pm inauguramos la Copa Navidad 2026 en las canchas de la Hermandad, ¡y tú eres parte de ella! Te compartimos la tarjeta de invitación.',
    'Ven con tu familia y amigos a acompañarnos en el arranque del torneo. Celebraremos la apertura con un brindis 🥂',
    'Como ya estás inscrito, [revisa tus partidos](/torneo/mis-partidos) en la página apenas arranquemos. El sorteo es el jueves 5 y allí verás tu grupo, tus rivales y tus horarios.',
    '¡Te esperamos!\nComisión de Tenis HGV',
  ],
  no_inscrito: [
    'Hola, {nombre} 🎾🎄',
    'Este viernes 6 de noviembre a las 6:00 pm inauguramos la Copa Navidad 2026 en las canchas de la Hermandad. Te compartimos la tarjeta de invitación.',
    'Ven con tu familia y amigos a acompañarnos en el arranque del torneo. Celebraremos la apertura con un brindis 🥂',
    'Y si todavía no te has inscrito, ¡aún estás a tiempo! Las inscripciones cierran el miércoles 4 de noviembre a las 11:59 pm en [la página del torneo](/torneo/inscripcion).',
    '¡Te esperamos!\nComisión de Tenis HGV',
  ],
}

export type JugadorCorreo = { id: string; nombre: string; email: string | null; activo: boolean | null; es_prueba: boolean | null }
export type Destinatario = { jugador_id: string; nombre: string; email: string; variante: Variante }

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Activos, no de prueba y con un correo con forma de correo. inscritosIds =
// jugadores con una inscripción no retirada en cualquier categoría de la
// Copa, más los representantes de los niños inscritos.
export function destinatariosInauguracion(jugadores: JugadorCorreo[], inscritosIds: Iterable<string>): Destinatario[] {
  const inscritos = new Set(inscritosIds)
  return jugadores
    .filter((j) => j.activo === true && j.es_prueba !== true && RE_EMAIL.test((j.email || '').trim()))
    .map((j) => ({
      jugador_id: j.id,
      nombre: j.nombre.trim(),
      email: j.email!.trim(),
      variante: (inscritos.has(j.id) ? 'inscrito' : 'no_inscrito') as Variante,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Después del cierre de inscripciones la versión B ya no tiene sentido.
export function variantesPermitidas(inscripcionesCerradas: boolean): Variante[] {
  return inscripcionesCerradas ? ['inscrito'] : ['inscrito', 'no_inscrito']
}

export function primerNombre(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  const primero = limpio.split(' ')[0] || limpio
  // "JUAN" o "juan" → "Juan"; "María" queda igual.
  return primero.charAt(0).toLocaleUpperCase('es') + primero.slice(1).toLocaleLowerCase('es')
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const RE_ENLACE = /\[([^\]]+)\]\((\/[^)\s]*)\)/g

function parrafoHtml(p: string): string {
  let html = ''
  let desde = 0
  for (const m of p.matchAll(RE_ENLACE)) {
    html += escaparHtml(p.slice(desde, m.index))
    html += `<a href="${escaparHtml(URL_SITIO + m[2])}" style="color:#1d4f91;font-weight:bold;text-decoration:underline;">${escaparHtml(m[1])}</a>`
    desde = m.index! + m[0].length
  }
  return (html + escaparHtml(p.slice(desde))).replace(/\n/g, '<br>')
}

function parrafoTexto(p: string): string {
  return p.replace(RE_ENLACE, (_, texto: string, ruta: string) => `${texto} (${URL_SITIO}${ruta})`)
}

// imagenSrc: 'cid:…' para el correo real; la URL pública para la vista previa.
export function armarCorreoInauguracion(variante: Variante, nombreCompleto: string, imagenSrc: string): { asunto: string; html: string; texto: string } {
  const nombre = primerNombre(nombreCompleto)
  // El nombre se inserta después de procesar los enlaces: un nombre con
  // corchetes no puede fabricar un enlace.
  const parrafos = PLANTILLAS[variante]
  const { ancho, alto } = IMAGEN_INAUGURACION
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f2f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="${ancho}" cellpadding="0" cellspacing="0" style="max-width:${ancho}px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:0;"><img src="${escaparHtml(imagenSrc)}" width="${ancho}" height="${alto}" alt="Invitación: Inauguración de la Copa Navidad 2026 — viernes 6 de noviembre, 6:00 pm, canchas de tenis del club" style="display:block;width:100%;max-width:${ancho}px;height:auto;border:0;"></td></tr>
<tr><td style="padding:24px 22px 10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1d2433;">
${parrafos.map((p) => `<p style="margin:0 0 14px;">${parrafoHtml(p.replaceAll('{nombre}', '\u0000')).replaceAll('\u0000', escaparHtml(nombre))}</p>`).join('\n')}
</td></tr>
</table>
</td></tr></table>
</body></html>`
  return {
    asunto: ASUNTO_INAUGURACION,
    html,
    texto: parrafos.map((p) => parrafoTexto(p).replaceAll('{nombre}', nombre)).join('\n\n'),
  }
}
