import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'

// Venezuela es UTC-4 fijo (sin horario de verano).
function fechaVenezuela(ms: number = Date.now()): string {
  return new Date(ms - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function diasEntre(fechaA: string, fechaB: string): number {
  const a = new Date(fechaA + 'T00:00:00Z').getTime()
  const b = new Date(fechaB + 'T00:00:00Z').getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

function nombreCancha(cancha: string | null, nombreForanea: string | null) {
  if (!cancha) return 'Por definir'
  if (cancha === 'FORANEA') return nombreForanea || 'Cancha foránea'
  if (cancha === 'HGV1') return 'HGV 1'
  if (cancha === 'HGV2') return 'HGV 2'
  return cancha
}

function envoltorio(cuerpo: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 28px; margin: 0 0 10px 0;">🎾</p>
      ${cuerpo}
      <p style="margin-top: 24px;">Recibe un cordial saludo y nos vemos en cancha ¡¡🎾</p>
      <p style="color: #888; font-size: 13px; margin-top: 10px;">— HGV Tennis Club 🎾</p>
    </div>
  `
}

function tablaPartido(retador: string, fecha: string, cancha: string) {
  return `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 6px 0; color: #666;">🎾 Contra</td><td style="padding: 6px 0;"><strong>${retador}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">📅 Fecha propuesta</td><td style="padding: 6px 0;"><strong>${fecha}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">🎾 Cancha</td><td style="padding: 6px 0;"><strong>${cancha}</strong></td></tr>
    </table>
  `
}

// Cada 3 días que dura un permiso médico activo, el jugador baja una posición
// en su escalafón (intercambia con quien esté justo debajo) — así se
// desalienta usar el permiso con otra intención, sin depender de nadie más.
async function aplicarDescensosPermisosMedicos(db: any, hoy: string) {
  let descensosAplicados = 0
  const errores: string[] = []

  const { data: activos } = await db
    .from('permisos_medicos')
    .select('id, jugador_id, temporada_id, fecha_inicio, fecha_fin, posiciones_bajadas')
    .eq('estado', 'aprobado')
    .lte('fecha_inicio', hoy)

  for (const permiso of activos || []) {
    try {
      const hastaFecha = permiso.fecha_fin && permiso.fecha_fin < hoy ? permiso.fecha_fin : hoy
      const diasTranscurridos = diasEntre(permiso.fecha_inicio, hastaFecha)
      const dropsEsperados = Math.floor(diasTranscurridos / 3)
      const dropsPendientes = dropsEsperados - (permiso.posiciones_bajadas || 0)
      if (dropsPendientes <= 0) continue

      const { data: miFila } = await db
        .from('ladder_posiciones')
        .select('id, categoria, genero, posicion')
        .eq('temporada_id', permiso.temporada_id)
        .eq('jugador_id', permiso.jugador_id)
        .maybeSingle()
      if (!miFila) continue

      let posicionActual = miFila.posicion
      let bajadasReales = 0

      for (let i = 0; i < dropsPendientes; i++) {
        const { data: filaDebajo } = await db
          .from('ladder_posiciones')
          .select('id, posicion')
          .eq('temporada_id', permiso.temporada_id)
          .eq('categoria', miFila.categoria)
          .eq('genero', miFila.genero)
          .eq('posicion', posicionActual + 1)
          .maybeSingle()

        // Ya está en el último puesto de su categoría — no hay más a dónde bajar.
        if (!filaDebajo) break

        // Usamos un valor temporal negativo para no chocar con la restricción
        // de posición única mientras se hace el intercambio.
        await db.from('ladder_posiciones').update({ posicion: -1 }).eq('id', miFila.id)
        await db.from('ladder_posiciones').update({ posicion: posicionActual }).eq('id', filaDebajo.id)
        await db.from('ladder_posiciones').update({ posicion: posicionActual + 1 }).eq('id', miFila.id)

        posicionActual = posicionActual + 1
        bajadasReales++
      }

      if (bajadasReales > 0) {
        await db
          .from('permisos_medicos')
          .update({ posiciones_bajadas: (permiso.posiciones_bajadas || 0) + bajadasReales })
          .eq('id', permiso.id)
        descensosAplicados += bajadasReales
      }
    } catch (err: any) {
      errores.push(`permiso ${permiso.id}: ${err.message}`)
    }
  }

  return { descensosAplicados, errores }
}

export async function GET(request: Request) {
  // Verificamos que la llamada venga realmente del cron de Vercel, y no de
  // cualquiera que le pegue a esta URL pública.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const db = supabaseServer()
  const hoy = fechaVenezuela()
  const resumen = { recordatorio1: 0, recordatorio2: 0, autoAceptados: 0, avisoDelDia: 0, descensosPermisoMedico: 0, errores: [] as string[] }

  try {
    // 1) Retos pendientes: recordatorios día 1 y 2, aceptación automática al día 3
    const { data: pendientes } = await db
      .from('retos')
      .select('id, created_at, fecha_propuesta, cancha, nombre_cancha_foranea, recordatorios_enviados, retador:retador_id(nombre, email), retado:retado_id(nombre, email)')
      .eq('estado', 'pendiente')

    for (const r of pendientes || []) {
      const dias = diasEntre(fechaVenezuela(new Date(r.created_at).getTime()), hoy)
      const retador: any = r.retador
      const retado: any = r.retado
      const fechaFmt = r.fecha_propuesta
        ? new Date(r.fecha_propuesta).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' })
        : 'Por definir'
      const canchaFmt = nombreCancha(r.cancha, r.nombre_cancha_foranea)

      try {
        if (dias >= 3) {
          const { error } = await db.from('retos').update({ estado: 'aceptado' }).eq('id', r.id)
          if (error) throw error
          resumen.autoAceptados++

          if (retado?.email) {
            await enviarCorreo(retado.email, '🎾 Tu reto quedó aceptado automáticamente', envoltorio(`
              <p>Hola ${retado.nombre || ''},</p>
              <p>Como no respondiste a tiempo la solicitud de reto de <strong>${retador?.nombre || 'un jugador'}</strong>, el partido quedó <strong>aceptado automáticamente</strong> con la fecha que se había propuesto:</p>
              ${tablaPartido(retador?.nombre || 'Rival', fechaFmt, canchaFmt)}
              <p>Si necesitas ajustar la fecha, recuerda que puedes usar el reagendamiento por fuerza mayor si el club lo tiene activo ese día, o hablarlo directamente con tu rival.</p>
            `))
          }
          if (retador?.email) {
            await enviarCorreo(retador.email, '🎾 Tu reto quedó aceptado automáticamente', envoltorio(`
              <p>Hola ${retador.nombre || ''},</p>
              <p><strong>${retado?.nombre || 'Tu rival'}</strong> no respondió a tiempo, así que el partido quedó <strong>aceptado automáticamente</strong> con la fecha propuesta:</p>
              ${tablaPartido(retado?.nombre || 'Rival', fechaFmt, canchaFmt)}
            `))
          }
        } else if (dias === 2 && (r.recordatorios_enviados || 0) < 2) {
          await db.from('retos').update({ recordatorios_enviados: 2 }).eq('id', r.id)
          resumen.recordatorio2++
          if (retado?.email) {
            await enviarCorreo(retado.email, '🎾 Último recordatorio: tienes un reto pendiente', envoltorio(`
              <p>Hola ${retado.nombre || ''},</p>
              <p>Este es tu <strong>último recordatorio</strong> — todavía no has respondido al reto de <strong>${retador?.nombre || 'un jugador'}</strong>:</p>
              ${tablaPartido(retador?.nombre || 'Rival', fechaFmt, canchaFmt)}
              <p>Entra a la escalera para <strong>aceptar</strong>, <strong>aceptar con otra fecha</strong> (un día antes o dos días después), o <strong>rechazar</strong> el reto. Si no respondes, el partido quedará aceptado automáticamente con esta fecha.</p>
            `))
          }
        } else if (dias === 1 && (r.recordatorios_enviados || 0) < 1) {
          await db.from('retos').update({ recordatorios_enviados: 1 }).eq('id', r.id)
          resumen.recordatorio1++
          if (retado?.email) {
            await enviarCorreo(retado.email, '🎾 Recordatorio: tienes un reto pendiente por responder', envoltorio(`
              <p>Hola ${retado.nombre || ''},</p>
              <p>Te recordamos que tienes una solicitud de reto sin responder, de parte de <strong>${retador?.nombre || 'un jugador'}</strong>:</p>
              ${tablaPartido(retador?.nombre || 'Rival', fechaFmt, canchaFmt)}
              <p>Entra a la escalera para <strong>aceptar</strong>, <strong>aceptar con otra fecha</strong> (un día antes o dos días después), o <strong>rechazar</strong> el reto.</p>
            `))
          }
        }
      } catch (err: any) {
        resumen.errores.push(`reto ${r.id}: ${err.message}`)
      }
    }

    // 2) Retos aceptados con partido programado para HOY — aviso de la mañana
    const inicioHoy = new Date(hoy + 'T04:00:00Z') // medianoche Venezuela = 04:00 UTC
    const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000)

    const { data: partidosHoy } = await db
      .from('retos')
      .select('id, fecha_propuesta, cancha, nombre_cancha_foranea, recordatorio_dia_partido_enviado, retador:retador_id(nombre, email), retado:retado_id(nombre, email)')
      .eq('estado', 'aceptado')
      .eq('recordatorio_dia_partido_enviado', false)
      .gte('fecha_propuesta', inicioHoy.toISOString())
      .lt('fecha_propuesta', finHoy.toISOString())

    for (const r of partidosHoy || []) {
      const retador: any = r.retador
      const retado: any = r.retado
      const horaFmt = new Date(r.fecha_propuesta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' })
      const canchaFmt = nombreCancha(r.cancha, r.nombre_cancha_foranea)

      try {
        await db.from('retos').update({ recordatorio_dia_partido_enviado: true }).eq('id', r.id)
        resumen.avisoDelDia++

        if (retador?.email) {
          await enviarCorreo(retador.email, `🎾 Hoy tienes partido a las ${horaFmt}`, envoltorio(`
            <p>Hola ${retador.nombre || ''},</p>
            <p>Te recordamos que <strong>hoy</strong> tienes tu partido de la Escalera:</p>
            ${tablaPartido(retado?.nombre || 'Rival', `hoy, ${horaFmt}`, canchaFmt)}
          `))
        }
        if (retado?.email) {
          await enviarCorreo(retado.email, `🎾 Hoy tienes partido a las ${horaFmt}`, envoltorio(`
            <p>Hola ${retado.nombre || ''},</p>
            <p>Te recordamos que <strong>hoy</strong> tienes tu partido de la Escalera:</p>
            ${tablaPartido(retador?.nombre || 'Rival', `hoy, ${horaFmt}`, canchaFmt)}
          `))
        }
      } catch (err: any) {
        resumen.errores.push(`reto ${r.id} (aviso del día): ${err.message}`)
      }
    }

    // 3) Permisos médicos activos: descuento de posición cada 3 días
    const { descensosAplicados, errores: erroresPermiso } = await aplicarDescensosPermisosMedicos(db, hoy)
    resumen.descensosPermisoMedico = descensosAplicados
    resumen.errores.push(...erroresPermiso)

    return NextResponse.json({ ok: true, resumen })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al procesar' }, { status: 500 })
  }
}
