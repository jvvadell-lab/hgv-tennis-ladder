import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { jugadorId, temporadaNombre } = await request.json()
    if (!jugadorId) return NextResponse.json({ error: 'Falta el id del jugador' }, { status: 400 })

    const db = supabaseServer()
    const { data: jugador, error } = await db
      .from('jugadores')
      .select('nombre, email')
      .eq('id', jugadorId)
      .maybeSingle()
    if (error) throw error
    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
    if (!jugador.email) {
      return NextResponse.json({ error: 'Este jugador no tiene un email registrado.' }, { status: 400 })
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
        <p>Hola ${jugador.nombre || ''},</p>
        <p>Nos complace escribirte desde <strong>HGV TENNIS CLUB</strong> para informarte que, según nuestros registros, todavía no hemos recibido tu pago de inscripción${temporadaNombre ? ` correspondiente a la <strong>${temporadaNombre}</strong>` : ''}.</p>
        <div style="background: #fff3cd; border-left: 4px solid #e67e22; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
          <strong>⚠️ Importante:</strong> el pago es un requisito indispensable para ser incluido en el sorteo de posiciones del escalafón. Sin él, lamentablemente no podremos considerarte en esta ronda.
        </div>
        <p>Si ya realizaste el pago y esto es un error de nuestra parte, o si tienes alguna duda, por favor contacta a la administración del club.</p>
        <p style="margin-top: 24px;">Recibe un cordial saludo y esperamos verte pronto en cancha ¡¡🎾</p>
        <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
      </div>
    `

    await enviarCorreo(jugador.email, '🎾 Recordatorio: pago de inscripción pendiente — HGV Tennis Club', html)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al enviar el correo' }, { status: 500 })
  }
}
