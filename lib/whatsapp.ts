// Arma un link "click-to-chat" de WhatsApp (wa.me) para avisarle al rival de un reto
// recién creado — sin API de WhatsApp Business, sin backend, igual que hace Paddit.
import { formatearFechaLarga } from '@/lib/tiempo'

export function formatWhatsAppNumber(telefono: string): string {
  const digits = telefono.replace(/\D/g, '')
  const sinCero = digits.startsWith('0') ? digits.slice(1) : digits
  return sinCero.startsWith('58') ? sinCero : `58${sinCero}`
}

export function formatearFechaLegible(fechaISO: string): string {
  return formatearFechaLarga(fechaISO)
  // → "sábado 5 de septiembre"
}

export function buildRetoWhatsAppLink(
  telefono: string,
  retadoNombre: string,
  fechaPropuestaISO: string
): string {
  const numero = formatWhatsAppNumber(telefono)
  const fecha = formatearFechaLegible(fechaPropuestaISO)
  const mensaje = `Hola ${retadoNombre}, te envié por correo un reto para el ${fecha}. Revisa tu agenda y nos vemos en cancha, o sugiéreme otra fecha si no te queda 🎾`
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}
