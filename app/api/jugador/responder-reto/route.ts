import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { retoId, nuevoEstado } = await request.json()
    if (!retoId || !['aceptado', 'rechazado'].includes(nuevoEstado)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retador_id, retado_id, estado, retador:retador_id(nombre, email), retado:retado_id(nombre)')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })

    // Solo el jugador retado puede aceptar o rechazar, y solo si sigue pendiente
    if (reto.retado_id !== session.id) {
      return NextResponse.json({ error: 'Este reto no te pertenece' }, { status: 403 })
    }
    if (reto.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Este reto ya no está pendiente' }, { status: 400 })
    }

    const { error: errUpdate } = await db.from('retos').update({ estado: nuevoEstado }).eq('id', retoId)
    if (errUpdate) throw errUpdate

    // Si lo rechazó, avisamos por correo a quien lo había retado (si falla el correo, no revertimos nada)
    if (nuevoEstado === 'rechazado') {
      try {
        const retador: any = reto.retador
        const retado: any = reto.retado
        if (retador?.email) {
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
              <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
              <p>Hola ${retador.nombre || ''},</p>
              <p>Nos complace escribirte desde <strong>HGV TENNIS CLUB</strong> para informarte que <strong>${retado?.nombre || 'tu rival'}</strong> no pudo aceptar tu reto en esta ocasión.</p>
              <p>No te preocupes — puedes proponerle un nuevo horario, o retar a otro jugador desde la escalera.</p>
              <p style="margin-top: 24px;">Recibe un cordial saludo y nos vemos en cancha ¡¡🎾</p>
              <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
            </div>
          `
          await enviarCorreo(retador.email, `🎾 ${retado?.nombre || 'Tu rival'} no pudo aceptar tu reto`, html)
        }
      } catch {
        // No bloqueamos el rechazo si el correo falla
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al responder' }, { status: 500 })
  }
}
