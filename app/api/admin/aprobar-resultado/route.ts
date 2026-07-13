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

    const { resultadoId } = await request.json()
    if (!resultadoId) {
      return NextResponse.json({ error: 'Falta el id del resultado' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: resultado, error: errResultado } = await db
      .from('resultados')
      .select(`
        id, ganador_id, no_presentado, reto_id, marcador_retador, marcador_retado,
        retos:reto_id(
          id, temporada_id, retador_id, retado_id,
          retador:retador_id(nombre, email),
          retado:retado_id(nombre, email)
        )
      `)
      .eq('id', resultadoId)
      .maybeSingle()

    if (errResultado) throw errResultado
    if (!resultado) return NextResponse.json({ error: 'Resultado no encontrado' }, { status: 404 })

    const reto: any = resultado.retos
    if (!reto) return NextResponse.json({ error: 'No se encontró el reto asociado' }, { status: 404 })

    const { data: posActuales, error: errPos } = await db
      .from('ladder_posiciones')
      .select('id, jugador_id, posicion')
      .eq('temporada_id', reto.temporada_id)
      .in('jugador_id', [reto.retador_id, reto.retado_id])

    if (errPos) throw errPos

    const posRetador = posActuales?.find((p: any) => p.jugador_id === reto.retador_id)
    const posRetado = posActuales?.find((p: any) => p.jugador_id === reto.retado_id)

    const retadorGana = resultado.ganador_id === reto.retador_id
    const intercambio = !!(retadorGana && posRetador && posRetado && posRetador.posicion > posRetado.posicion)

    if (intercambio && posRetador && posRetado) {
      const { error: e1 } = await db.from('ladder_posiciones').update({ posicion: -1 }).eq('id', posRetador.id)
      if (e1) throw e1
      const { error: e2 } = await db.from('ladder_posiciones').update({ posicion: posRetador.posicion }).eq('id', posRetado.id)
      if (e2) throw e2
      const { error: e3 } = await db.from('ladder_posiciones').update({ posicion: posRetado.posicion }).eq('id', posRetador.id)
      if (e3) throw e3
    }

    const { error: errUpdateResultado } = await db
      .from('resultados')
      .update({ validado: true, validado_at: new Date().toISOString(), posiciones_intercambiadas: intercambio })
      .eq('id', resultadoId)
    if (errUpdateResultado) throw errUpdateResultado

    const { error: errUpdateReto } = await db
      .from('retos')
      .update({ estado: resultado.no_presentado ? 'no_presentado' : 'jugado' })
      .eq('id', reto.id)
    if (errUpdateReto) throw errUpdateReto

    // Enviar correo con el resultado a ambos jugadores (si falla, no revertimos la aprobación)
    try {
      const retador = reto.retador
      const retado = reto.retado
      const ganadorEsRetador = resultado.ganador_id === reto.retador_id
      const nombreGanador = ganadorEsRetador ? retador?.nombre : retado?.nombre
      const nombreAusente = ganadorEsRetador ? retado?.nombre : retador?.nombre

      const cuerpoResultado = resultado.no_presentado
        ? `<p>⚠️ <strong>${nombreAusente || 'El rival'}</strong> no se presentó al partido.</p>
           <p>🏆 Gana por walkover: <strong>${nombreGanador || '—'}</strong></p>`
        : `<p>Marcador: <strong>${resultado.marcador_retador} — ${resultado.marcador_retado}</strong></p>
           <p>🏆 Ganador: <strong>${nombreGanador || '—'}</strong></p>`

      const armarCorreo = (nombreDestinatario: string) => `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
          <p>Hola ${nombreDestinatario || ''},</p>
          <p>Nos complace escribirte desde <strong>HGV TENNIS CLUB</strong> para informarte el resultado de tu partido:</p>
          <p><strong>${retador?.nombre || 'Jugador'}</strong> vs <strong>${retado?.nombre || 'Jugador'}</strong></p>
          ${cuerpoResultado}
          <p>Este resultado ya fue validado y el escalafón fue actualizado.</p>
          <p style="margin-top: 24px;">Recibe un cordial saludo y nos vemos en cancha ¡¡🎾</p>
          <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
        </div>
      `

      if (retador?.email) await enviarCorreo(retador.email, '🏆 Resultado de tu partido — HGV Tennis Club', armarCorreo(retador.nombre))
      if (retado?.email) await enviarCorreo(retado.email, '🏆 Resultado de tu partido — HGV Tennis Club', armarCorreo(retado.nombre))
    } catch {
      // No bloqueamos la aprobación si el correo falla
    }

    return NextResponse.json({ ok: true, intercambio })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al aprobar' }, { status: 500 })
  }
}
