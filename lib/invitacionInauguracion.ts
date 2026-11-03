// Invitación por correo a la inauguración de la Copa Navidad (vie 6-nov-2026,
// 6:00 pm en Caracas). Lógica pura: quién la recibe, con qué versión y cómo
// se arma el correo. El envío está en app/api/admin/correos/invitacion-inauguracion.
//
// Dos versiones: 'inscrito' (ya está en alguna categoría de la Copa) y
// 'no_inscrito'. La tarjeta va embebida en el correo (cid), no enlazada:
// muchos clientes bloquean imágenes remotas.

import { instanteEnCaracas } from './tiempo'

export const CAMPANA_INAUGURACION = 'inauguracion-copa-2026'

// Hasta cuándo tiene sentido mandarla: la hora del evento en Caracas.
export const INICIO_INAUGURACION = instanteEnCaracas('2026-11-06', '18:00')

export const IMAGEN_INAUGURACION = {
  archivo: 'public/correos/invitacion-inauguracion-copa.jpg',
  url: '/correos/invitacion-inauguracion-copa.jpg',
  cid: 'tarjeta-inauguracion@hgv',
  ancho: 600,
  alto: 1170,
}

// Gmail con contraseña de aplicación: ~500 destinatarios al día por cuenta.
// Se manda en lotes cortos (el navegador del admin pide el siguiente lote),
// con pausa entre correos y un tope diario por debajo del límite.
export const TAMANO_LOTE = 10
export const PAUSA_ENTRE_CORREOS_MS = 1200
export const TOPE_DIARIO = 400

export type Variante = 'inscrito' | 'no_inscrito'

type Plantilla = { asunto: string; parrafos: string[] }

// {nombre} = primer nombre del jugador. Cada párrafo es texto plano (se
// escapa); una línea en blanco separa párrafos.
// TODO(Juan): reemplazar por las versiones A y B definitivas.
export const PLANTILLAS: Record<Variante, Plantilla> = {
  inscrito: {
    asunto: '{nombre}, te esperamos en la inauguración de la Copa Navidad',
    parrafos: [
      'Hola {nombre}:',
      '[PENDIENTE — versión A, para inscritos en la Copa]',
    ],
  },
  no_inscrito: {
    asunto: '{nombre}, te invitamos a la inauguración de la Copa Navidad',
    parrafos: [
      'Hola {nombre}:',
      '[PENDIENTE — versión B, para socios no inscritos]',
    ],
  },
}

export type JugadorCorreo = { id: string; nombre: string; email: string | null; activo: boolean | null; es_prueba: boolean | null }
export type Destinatario = { jugador_id: string; nombre: string; email: string; variante: Variante }

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Activos, no de prueba y con un correo con forma de correo. inscritosIds =
// jugadores con una inscripción no retirada en cualquier categoría de la Copa.
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

export function primerNombre(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  const primero = limpio.split(' ')[0] || limpio
  // "JUAN" o "juan" → "Juan"; "María" queda igual.
  return primero.charAt(0).toLocaleUpperCase('es') + primero.slice(1).toLocaleLowerCase('es')
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function rellenar(texto: string, nombre: string): string {
  return texto.replaceAll('{nombre}', nombre)
}

// imagenSrc: 'cid:…' para el correo real; la URL pública para la vista previa.
export function armarCorreoInauguracion(variante: Variante, nombreCompleto: string, imagenSrc: string): { asunto: string; html: string; texto: string } {
  const plantilla = PLANTILLAS[variante]
  const nombre = primerNombre(nombreCompleto)
  const parrafos = plantilla.parrafos.map((p) => rellenar(p, nombre))
  const { ancho, alto } = IMAGEN_INAUGURACION
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f2f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="${ancho}" cellpadding="0" cellspacing="0" style="max-width:${ancho}px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:28px 28px 12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1d2433;">
${parrafos.map((p) => `<p style="margin:0 0 14px;">${escaparHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
</td></tr>
<tr><td style="padding:0;"><img src="${escaparHtml(imagenSrc)}" width="${ancho}" height="${alto}" alt="Invitación: Inauguración de la Copa Navidad 2026 — viernes 6 de noviembre, 6:00 pm, canchas de tenis del club" style="display:block;width:100%;max-width:${ancho}px;height:auto;border:0;"></td></tr>
</table>
</td></tr></table>
</body></html>`
  return { asunto: rellenar(plantilla.asunto, nombre), html, texto: parrafos.join('\n\n') }
}
