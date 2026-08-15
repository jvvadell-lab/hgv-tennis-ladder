import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

function nombreCancha(cancha: string | null, nombreForanea: string | null) {
  if (!cancha) return 'Por definir'
  if (cancha === 'FORANEA') return nombreForanea || 'Cancha foránea'
  if (cancha === 'HGV1') return 'HGV 1'
  if (cancha === 'HGV2') return 'HGV 2'
  return cancha
}

// Ruta solo para el admin — reenvía el correo de "te han retado" de un reto
// que YA existe, sin crear nada nuevo ni tocar el escalafón. Pensada para
// probar cambios al correo (como el bloque de WhatsApp o la hora) sin
// necesidad de que haya jugadores libres para lanzar un reto de prueba.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { retoId } = await request.json()
    if (!retoId) return NextResponse.json({ error: 'Falta el id del reto' }, { status: 400 })

    const db = supabaseServer()
    const { data: reto, error } = await db
      .from('retos')
      .select('id, cancha, nombre_cancha_foranea, fecha_propuesta, comentarios, retador:retador_id(nombre, telefono), retado:retado_id(nombre, email)')
      .eq('id', retoId)
      .maybeSingle()

    if (error) throw error
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })

    const retador: any = reto.retador
    const retado: any = reto.retado
    if (!retado?.email) {
      return NextResponse.json({ error: 'El retado no tiene email registrado.' }, { status: 400 })
    }

    const fecha = reto.fecha_propuesta
      ? new Date(reto.fecha_propuesta).toLocaleString('es-ES', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Caracas',
        })
      : 'Por definir'

    const telefonoLimpio = retador?.telefono ? String(retador.telefono).replace(/\D/g, '') : ''
    const linkWhatsapp = telefonoLimpio ? `https://wa.me/${telefonoLimpio}` : null

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
        <p style="background: #fff3cd; padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #7a4a0e;">
          🔁 Este es un reenvío de prueba solicitado por el admin — el reto no cambió.
        </p>
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
        </div>` : `<p style="font-size: 12px; color: #a83226;">⚠️ (Este retador no tiene teléfono registrado, por eso no sale el bloque de WhatsApp.)</p>`}
        <p style="margin-top: 24px;">Recibe un cordial saludo y nos vemos en cancha ¡¡🎾</p>
        <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
      </div>
    `

    await enviarCorreo(retado.email, `🎾 [Prueba] ${retador?.nombre || 'Un jugador'} te ha retado`, html)

    return NextResponse.json({ ok: true, tieneTelefonoRetador: !!retador?.telefono })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al reenviar' }, { status: 500 })
  }
}
