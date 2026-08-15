import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

function nombreCancha(cancha: string | null, nombreForanea: string | null) {
  if (!cancha) return 'Por definir'
  if (cancha === 'FORANEA') return nombreForanea || 'Cancha foránea'
  if (cancha === 'HGV1') return 'HGV 1'
  if (cancha === 'HGV2') return 'HGV 2'
  return cancha
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { retoId } = await request.json()
    if (!retoId) return NextResponse.json({ error: 'Falta el id del reto' }, { status: 400 })

    const db = supabaseServer()
    const { data: reto, error } = await db
      .from('retos')
      .select('id, retador_id, cancha, nombre_cancha_foranea, fecha_propuesta, comentarios, retador:retador_id(nombre, telefono), retado:retado_id(nombre, email)')
      .eq('id', retoId)
      .maybeSingle()

    if (error) throw error
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })
    if (reto.retador_id !== session.id) {
      return NextResponse.json({ error: 'Este reto no te pertenece' }, { status: 403 })
    }

    const retador: any = reto.retador
    const retado: any = reto.retado
    if (!retado?.email) {
      console.log('[notificar-nuevo-reto] El rival no tiene email registrado:', retado?.nombre)
      return NextResponse.json({ ok: true, aviso: 'El rival no tiene email registrado, no se envió correo.' })
    }

    // OJO: este código corre en el servidor de Vercel, que trabaja en horario UTC —
    // sin especificar timeZone aquí, la hora que sale en el correo queda 4 horas
    // adelantada respecto a la hora real de Venezuela.
    const fecha = reto.fecha_propuesta
      ? new Date(reto.fecha_propuesta).toLocaleString('es-ES', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Caracas',
        })
      : 'Por definir'

    // Link directo a WhatsApp del retador, si tiene teléfono registrado — quitamos
    // todo lo que no sea dígito para que el enlace wa.me funcione sin importar
    // cómo esté guardado el número (con espacios, guiones, paréntesis, etc.)
    const telefonoLimpio = retador?.telefono ? String(retador.telefono).replace(/\D/g, '') : ''
    const linkWhatsapp = telefonoLimpio ? `https://wa.me/${telefonoLimpio}` : null

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
        <p>Hola ${retado?.nombre || ''},</p>
        <p>Nos complace escribirte desde <strong>HGV TENNIS CLUB</strong> para informarte que <strong>${retador?.nombre || 'un jugador'}</strong> te ha retado a un partido:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 0; color: #666;">📅 Fecha propuesta</td><td style="padding: 6px 0;"><strong>${fecha}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #666;">🎾 Cancha</td><td style="padding: 6px 0;"><strong>${nombreCancha(reto.cancha, reto.nombre_cancha_foranea)}</strong></td></tr>
          ${reto.comentarios ? `<tr><td style="padding: 6px 0; color: #666;">💬 Comentario</td><td style="padding: 6px 0;">${reto.comentarios}</td></tr>` : ''}
        </table>
        <p>Entra a la escalera para aceptar o rechazar este reto.</p>
        ${retador?.telefono ? `
        <div style="background: #f0f7fc; border-radius: 8px; padding: 14px 16px; margin: 18px 0;">
          <p style="margin: 0; font-size: 14px;">
            📱 Si prefieres proponer otra fecha, escríbele por WhatsApp a ${retador.nombre}:
            ${linkWhatsapp
              ? `<br /><a href="${linkWhatsapp}" style="color: #1c7ec4; font-weight: bold; text-decoration: none;">${retador.telefono}</a>`
              : `<br /><strong>${retador.telefono}</strong>`}
          </p>
        </div>` : ''}
        <p style="margin-top: 24px;">Recibe un cordial saludo y nos vemos en cancha ¡¡🎾</p>
        <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
      </div>
    `

    await enviarCorreo(retado.email, `🎾 ${retador?.nombre || 'Un jugador'} te ha retado`, html)
    console.log('[notificar-nuevo-reto] Correo enviado a', retado.email)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[notificar-nuevo-reto] ERROR:', err)
    // No queremos que un fallo de correo tumbe la creación del reto —
    // solo devolvemos el error para registrarlo, sin romper el flujo.
    return NextResponse.json({ error: err.message || 'Error al enviar el correo' }, { status: 500 })
  }
}
