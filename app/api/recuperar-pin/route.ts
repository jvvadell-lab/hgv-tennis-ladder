import { NextResponse } from 'next/server'
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
      .select('id, nombre, email')
      .ilike('email', emailNormalizado)
      .maybeSingle()

    // Por seguridad, siempre respondemos lo mismo exista o no el correo —
    // así nadie puede usar esto para adivinar qué emails están registrados.
    if (jugador) {
      const nuevoPin = String(Math.floor(1000 + Math.random() * 9000))
      await db.from('jugadores').update({ pin: nuevoPin }).eq('id', jugador.id)

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
          <p style="font-size: 24px; margin: 0 0 10px 0;">🎾</p>
          <h2 style="color: #1c7ec4; margin: 0 0 16px 0; font-size: 20px;">Tu nuevo PIN — HGV Tennis Club</h2>
          <p>Hola ${jugador.nombre},</p>
          <p>Recibimos una solicitud para recuperar tu acceso. Este es tu nuevo PIN para iniciar sesión:</p>
          <p style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 0.3em; background: #f0f7fc; border-radius: 8px; padding: 16px; text-align: center; color: #0f1b26;">
            ${nuevoPin}
          </p>
          <p>Puedes cambiarlo por uno de tu preferencia desde "Mi Perfil" una vez que inicies sesión.</p>
          <p>Si tú no pediste este cambio, contacta a la Comisión de Tenis.</p>
          <p style="margin-top: 24px;">— HGV Tennis Club 🎾</p>
        </div>
      `
      await enviarCorreo(jugador.email, '🎾 Tu nuevo PIN — HGV Tennis Club', html)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al procesar la solicitud' }, { status: 500 })
  }
}
