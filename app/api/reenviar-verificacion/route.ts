import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Falta el email' }, { status: 400 })

    const emailNormalizado = String(email).trim().toLowerCase()
    const db = supabaseServer()

    const { data: jugador } = await db
      .from('jugadores')
      .select('id, nombre, email, email_verificado, token_verificacion')
      .ilike('email', emailNormalizado)
      .maybeSingle()

    // Por seguridad, siempre respondemos lo mismo exista o no el correo, y también
    // si ya estaba verificado — así nadie puede usar esto para adivinar cuentas.
    if (jugador && !jugador.email_verificado) {
      const token = jugador.token_verificacion || randomUUID()
      if (!jugador.token_verificacion) {
        await db.from('jugadores').update({ token_verificacion: token }).eq('id', jugador.id)
      }

      const enlaceVerificacion = `https://hgv-tennis-ladder.vercel.app/verificar-correo?token=${token}`
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
          <p style="font-size: 24px; margin: 0 0 10px 0;">🎾</p>
          <h2 style="color: #1c7ec4; margin: 0 0 16px 0; font-size: 20px;">Confirma tu correo — HGV Tennis Club</h2>
          <p>Hola ${jugador.nombre || ''},</p>
          <p>Recibimos una solicitud para reenviarte el enlace de verificación de tu cuenta. Haz clic en el siguiente botón para confirmar tu correo:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${enlaceVerificacion}" style="display: inline-block; background: #1c7ec4; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 28px; border-radius: 6px; font-size: 15px;">
              ✅ Verificar mi correo
            </a>
          </p>
          <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br />${enlaceVerificacion}</p>
          <p>Si tú no pediste este correo, puedes ignorarlo.</p>
          <p style="margin-top: 24px;">— HGV Tennis Club 🎾</p>
        </div>
      `
      await enviarCorreo(jugador.email, '🎾 Confirma tu correo — HGV Tennis Club', html)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al procesar la solicitud' }, { status: 500 })
  }
}
