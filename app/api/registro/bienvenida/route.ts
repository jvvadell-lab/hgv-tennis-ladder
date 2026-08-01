import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

// Ruta pública (sin sesión) — se llama justo después de que un jugador se
// registra, antes de que exista cualquier sesión. Solo necesita el id que
// acaba de crear el propio registro.
export async function POST(request: Request) {
  try {
    const { jugadorId } = await request.json()
    if (!jugadorId) return NextResponse.json({ error: 'Falta el id del jugador' }, { status: 400 })

    const db = supabaseServer()
    const { data: jugador, error } = await db
      .from('jugadores')
      .select('nombre, email')
      .eq('id', jugadorId)
      .maybeSingle()
    if (error) throw error
    if (!jugador?.email) return NextResponse.json({ ok: true }) // nada que hacer, pero no es un error del registro

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
        <h2 style="color: #1c7ec4; margin: 0 0 4px 0;">¡Bienvenidos a una nueva era del tenis en HGV!</h2>
        <p>Estimados socios,</p>
        <p>Hoy nos llena de orgullo anunciarles algo que nunca antes habíamos hecho en la historia de nuestro club: el <strong>Torneo Escalera Retos HGV</strong>.</p>
        <p>Esto no se trata solo de ganar o perder. Se trata de competir con nobleza, medirnos con respeto, y fortalecer los lazos que nos hacen, ante todo, una hermandad. Cada reto que lances es una oportunidad para crecer como jugador — y para escribir, junto a todos nosotros, la primera página de esta escalera.</p>
        <p>Ahora te toca a ti, <strong>${jugador.nombre || ''}</strong>. Anótate, reta, compite — y hazte parte de esta primera escalera que esperamos se convierta en tradición.</p>
        <p>¡Nos vemos en cancha! 🎾🏆</p>

        <div style="background: #fdf6d8; border: 1px solid #d4e157; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-weight: bold; color: #1c7ec4; font-size: 15px;">✅ Para quedar listo, solo necesitas:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
            <tr>
              <td style="padding: 4px 8px 4px 0; vertical-align: top; width: 24px;">💳</td>
              <td style="padding: 4px 0; font-size: 14px;">Hacer tu pago de inscripción</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px 4px 0; vertical-align: top;">🪪</td>
              <td style="padding: 4px 0; font-size: 14px;">Cargar la foto de tu carné de socio</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px 4px 0; vertical-align: top;">📝</td>
              <td style="padding: 4px 0; font-size: 14px;">Reportar tu pago en el sistema</td>
            </tr>
          </table>
          <p style="margin: 0 0 4px 0; font-size: 14px;">¡Y listo! Solo acompáñanos el día del sorteo:</p>
          <p style="margin: 0; font-size: 17px; font-weight: bold; color: #0f1b26;">
            🗓️ 5 de agosto · 🕖 7:00 pm<br />
            📍 Canchas del Club HGV
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #eee; margin: 26px 0;" />

        <h3 style="color: #1c7ec4; margin: 0 0 14px 0;">Reglas de la Escalera de Retos HGV</h3>

        <p style="margin: 0 0 4px 0;"><strong>● Para participar</strong></p>
        <p style="margin: 0 0 18px 0;">
          Debes anotarte a la temporada activa — es gratis, pero para que te incluyan en el sorteo de posiciones necesitas: un pago validado de la inscripción de esa temporada, y tu membresía verificada por un administrador.
        </p>

        <p style="margin: 0 0 4px 0;"><strong>● A quién puedes retar</strong></p>
        <ul style="margin: 0 0 18px 0; padding-left: 18px;">
          <li>Solo a quienes estén hasta 3 posiciones por encima de ti en el ranking.</li>
          <li>El sorteo de la temporada debe haberse realizado antes de que se puedan lanzar retos.</li>
          <li>No puedes retar a alguien que ya tenga un reto pendiente o aceptado con otra persona (aparece "ocupado").</li>
          <li>Solo puedes tener un reto activo a la vez — ni tú ni tu rival pueden tener otro pendiente o aceptado al mismo tiempo.</li>
        </ul>

        <p style="margin: 0 0 4px 0;"><strong>● Reservar cancha para el partido</strong></p>
        <ul style="margin: 0 0 18px 0; padding-left: 18px;">
          <li>Cada partido de escalera bloquea la cancha por 1 hora y 30 minutos.</li>
          <li>El sistema no te deja proponer un horario que choque con otro partido de escalera o con las clases de la Academia de Tenis.</li>
          <li>Horarios de cancha, de lunes a viernes (fines de semana no hay restricción): HGV 1, de 6:00am a 2:00pm y de 8:00pm a 12:00am. HGV 2, de 7:00pm a 12:00am. Cancha foránea, sin restricción de horario del club.</li>
        </ul>

        <p style="margin: 0 0 4px 0;"><strong>● Aceptar o rechazar</strong></p>
        <ul style="margin: 0 0 18px 0; padding-left: 18px;">
          <li>Cuando alguien te reta, puedes aceptar (queda confirmado el partido) o rechazar (ambos quedan libres para retar de nuevo).</li>
        </ul>

        <p style="margin: 0 0 4px 0;"><strong>● Cargar el resultado</strong></p>
        <ul style="margin: 0 0 18px 0; padding-left: 18px;">
          <li>No puedes cargar el resultado antes de la fecha/hora programada del partido, salvo que un administrador autorice la carga anticipada.</li>
          <li>Cualquiera de los dos jugadores puede cargar el resultado.</li>
          <li>Si tu rival no se presentó, no cargas marcador — reportas directamente "no se presentó", y ganas por walkover una vez que un admin lo aprueba.</li>
          <li>Todo resultado (normal o walkover) queda pendiente de validación — el ranking no se actualiza hasta que un administrador lo apruebe.</li>
        </ul>

        <p style="margin: 0 0 4px 0;"><strong>● Cómo cambia tu posición</strong></p>
        <ul style="margin: 0 0 18px 0; padding-left: 18px;">
          <li>Si ganas, tomas la posición de tu rival (intercambio de posiciones).</li>
          <li>Si pierdes, te quedas donde estabas.</li>
        </ul>

        <p style="margin: 24px 0 0 0;">Si tienes alguna duda, contacta a <strong>Johan Contreras</strong> al WhatsApp <strong>0424-4032313</strong> o escríbenos a <a href="mailto:hgvtennisclub@gmail.com" style="color: #1c7ec4;">hgvtennisclub@gmail.com</a>.</p>

        <p style="margin-top: 20px;">Con cariño y espíritu deportivo,<br /><strong>Comisión de Tenis HGV</strong></p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 26px 0 16px 0;" />

        <p style="text-align: center; font-size: 11px; color: #999; letter-spacing: 0.05em; text-transform: uppercase; margin: 0 0 10px 0;">Con el apoyo de nuestros patrocinantes</p>
        <p style="text-align: center; margin: 0 0 20px 0;">
          <img src="https://znfsxpmmlxezzeasjtqa.supabase.co/storage/v1/object/public/fotos-partidos/Sponsors/Patrocinio%201.png" alt="Patrocinantes HGV Tennis Club" style="max-width: 100%; height: auto; display: inline-block;" />
        </p>

        <p style="color: #888; font-size: 13px; margin-top: 8px;">— HGV Tennis Club 🎾</p>
      </div>
    `

    await enviarCorreo(jugador.email, '🎾 ¡Bienvenido a HGV Tennis Club! — Conoce la Escalera de Retos', html)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // Nunca queremos que un fallo de correo aparente que el registro falló —
    // el jugador ya se registró bien; esto es solo un aviso adicional.
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 })
  }
}
