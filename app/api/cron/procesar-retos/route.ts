import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'
import { hoyEnCaracas, fechaISOEnCaracas, instanteEnCaracas, sumarDiasEnCaracas, formatearFechaHora, formatearHora } from '@/lib/tiempo'
import { esEscaleraExpress, ESCALERA_EXPRESS_FECHA_RECORDATORIO, ESCALERA_EXPRESS_FECHA_JUEGO } from '@/lib/escaleraExpress'

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
  const hoy = hoyEnCaracas()
  const resumen = {
    recordatorio1: 0, recordatorio2: 0, autoAceptados: 0, avisoDelDia: 0, descensosPermisoMedico: 0,
    recordatorioExpress: 0, autoAceptadosExpress: 0,
    recordatorioResultado1: 0, recordatorioResultado2: 0, avisoAdminResultado: 0,
    errores: [] as string[],
  }

  try {
    // 1) Retos pendientes: recordatorios día 1 y 2, aceptación automática al día 3
    // (pausado durante Escalera Express: los retos quedan congelados esos días, así
    // que no tiene sentido recordarle a nadie que responda ni auto-aceptarlos)
    const { data: pendientes } = esEscaleraExpress(hoy)
      ? { data: [] }
      : await db
          .from('retos')
          .select('id, created_at, fecha_propuesta, cancha, nombre_cancha_foranea, recordatorios_enviados, retador:retador_id(nombre, email), retado:retado_id(nombre, email)')
          .eq('estado', 'pendiente')

    for (const r of pendientes || []) {
      const dias = diasEntre(fechaISOEnCaracas(r.created_at), hoy)
      const retador: any = r.retador
      const retado: any = r.retado
      const fechaFmt = r.fecha_propuesta ? formatearFechaHora(r.fecha_propuesta) : 'Por definir'
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

    // 1.5) Escalera Express tiene su propio ciclo de recordatorio/auto-aceptación,
    // independiente del de 3 días de arriba (no cabe en la ventana jueves-tarde →
    // sábado 4pm). Como el cron corre una sola vez al día, se ancla a fechas
    // calendario fijas en vez de "días desde la creación":
    //   - Viernes (única corrida antes del cierre): recordatorio a quien no respondió.
    //   - Sábado (última corrida antes de que empiecen los partidos a las 4pm):
    //     aceptación automática de lo que siga pendiente, para no perder el cupo.
    // Nota: un reto creado el viernes después de esta corrida (si la ventana seguía
    // abierta por no llenarse los 12 cupos) se salta el recordatorio y va directo a
    // la aceptación automática del sábado — inevitable con una corrida diaria.
    if (hoy === ESCALERA_EXPRESS_FECHA_RECORDATORIO || hoy === ESCALERA_EXPRESS_FECHA_JUEGO) {
      const { data: pendientesExpress } = await db
        .from('retos')
        .select('id, fecha_propuesta, cancha, recordatorios_enviados, retador:retador_id(nombre, email), retado:retado_id(nombre, email)')
        .eq('estado', 'pendiente')
        .eq('escalera_express', true)

      for (const r of pendientesExpress || []) {
        const retador: any = r.retador
        const retado: any = r.retado
        const fechaFmt = r.fecha_propuesta ? formatearFechaHora(r.fecha_propuesta) : 'Por definir'
        const canchaFmt = nombreCancha(r.cancha, null)

        try {
          if (hoy === ESCALERA_EXPRESS_FECHA_JUEGO) {
            const { error } = await db.from('retos').update({ estado: 'aceptado' }).eq('id', r.id)
            if (error) throw error
            resumen.autoAceptadosExpress++

            if (retado?.email) {
              await enviarCorreo(retado.email, '🚀 Tu reto de Escalera Express quedó aceptado automáticamente', envoltorio(`
                <p>Hola ${retado.nombre || ''},</p>
                <p>Como no respondiste a tiempo la solicitud de reto de <strong>${retador?.nombre || 'un jugador'}</strong> de Escalera Express, el partido quedó <strong>aceptado automáticamente</strong> para hoy, con la hora ya propuesta:</p>
                ${tablaPartido(retador?.nombre || 'Rival', fechaFmt, canchaFmt)}
              `))
            }
            if (retador?.email) {
              await enviarCorreo(retador.email, '🚀 Tu reto de Escalera Express quedó aceptado automáticamente', envoltorio(`
                <p>Hola ${retador.nombre || ''},</p>
                <p><strong>${retado?.nombre || 'Tu rival'}</strong> no respondió a tiempo, así que tu partido de Escalera Express quedó <strong>aceptado automáticamente</strong> para hoy:</p>
                ${tablaPartido(retado?.nombre || 'Rival', fechaFmt, canchaFmt)}
              `))
            }
          } else if ((r.recordatorios_enviados || 0) < 1) {
            await db.from('retos').update({ recordatorios_enviados: 1 }).eq('id', r.id)
            resumen.recordatorioExpress++

            if (retado?.email) {
              await enviarCorreo(retado.email, '🚀 Responde ya tu reto de Escalera Express', envoltorio(`
                <p>Hola ${retado.nombre || ''},</p>
                <p>Tienes un reto de <strong>Escalera Express</strong> sin responder, de parte de <strong>${retador?.nombre || 'un jugador'}</strong>:</p>
                ${tablaPartido(retador?.nombre || 'Rival', fechaFmt, canchaFmt)}
                <p>Entra a la escalera para <strong>aceptar</strong> o <strong>rechazar</strong> el reto. Si no respondes, mañana sábado quedará <strong>aceptado automáticamente</strong> con esta misma fecha y hora, para no perder el cupo de cancha.</p>
              `))
            }
          }
        } catch (err: any) {
          resumen.errores.push(`reto express ${r.id}: ${err.message}`)
        }
      }
    }

    const inicioHoy = instanteEnCaracas(hoy)

    // 2) Retos aceptados cuya fecha de partido ya pasó y nadie cargó el
    // resultado: recordatorio a ambos jugadores los días 1 y 2, y al día 3
    // un aviso al administrador para que intervenga manualmente — no se
    // decide nada por el reto (ni estado ni ganador), solo se avisa. Usa su
    // propio contador (recordatorios_resultado_enviados) en vez de
    // recordatorios_enviados, porque ese otro campo ya se gastó en la fase
    // 'pendiente' (recordatorios de respuesta) y podría llegar aquí ya en 1
    // o 2, haciendo que el cron crea que ya avisó cuando en realidad nunca
    // mandó estos correos.
    const { data: resultadosExistentes } = await db.from('resultados').select('reto_id')
    const idsConResultado = new Set((resultadosExistentes || []).map((res: any) => res.reto_id))

    const { data: aceptadosSinResultado } = await db
      .from('retos')
      .select('id, fecha_propuesta, cancha, nombre_cancha_foranea, recordatorios_resultado_enviados, retador:retador_id(nombre, email), retado:retado_id(nombre, email)')
      .eq('estado', 'aceptado')
      .not('fecha_propuesta', 'is', null)
      .lt('fecha_propuesta', inicioHoy.toISOString())

    for (const r of (aceptadosSinResultado || []).filter((r: any) => !idsConResultado.has(r.id))) {
      const dias = diasEntre(fechaISOEnCaracas(r.fecha_propuesta), hoy)
      const retador: any = r.retador
      const retado: any = r.retado
      const fechaFmt = formatearFechaHora(r.fecha_propuesta)
      const canchaFmt = nombreCancha(r.cancha, r.nombre_cancha_foranea)
      const enviados = r.recordatorios_resultado_enviados || 0

      try {
        if (dias === 1 && enviados < 1) {
          await db.from('retos').update({ recordatorios_resultado_enviados: 1 }).eq('id', r.id)
          resumen.recordatorioResultado1++
          for (const [destinatario, rival] of [[retador, retado], [retado, retador]] as const) {
            if (!destinatario?.email) continue
            await enviarCorreo(destinatario.email, '🎾 Recordatorio: registra el resultado de tu partido', envoltorio(`
              <p>Hola ${destinatario.nombre || ''},</p>
              <p>Tu partido contra <strong>${rival?.nombre || 'tu rival'}</strong> ya debería haberse jugado:</p>
              ${tablaPartido(rival?.nombre || 'Rival', fechaFmt, canchaFmt)}
              <p>Entra a la escalera y registra el resultado: si jugaron, carga el marcador; si tu rival no se presentó, usa la opción <strong>"El rival no se presentó"</strong> al registrar el resultado.</p>
            `))
          }
        } else if (dias === 2 && enviados < 2) {
          await db.from('retos').update({ recordatorios_resultado_enviados: 2 }).eq('id', r.id)
          resumen.recordatorioResultado2++
          for (const [destinatario, rival] of [[retador, retado], [retado, retador]] as const) {
            if (!destinatario?.email) continue
            await enviarCorreo(destinatario.email, '🎾 Último recordatorio: registra el resultado de tu partido', envoltorio(`
              <p>Hola ${destinatario.nombre || ''},</p>
              <p>Este es tu <strong>último recordatorio</strong> — todavía no se ha registrado el resultado de tu partido contra <strong>${rival?.nombre || 'tu rival'}</strong>:</p>
              ${tablaPartido(rival?.nombre || 'Rival', fechaFmt, canchaFmt)}
              <p>Entra a la escalera y registra el resultado: si jugaron, carga el marcador; si tu rival no se presentó, usa la opción <strong>"El rival no se presentó"</strong> al registrar el resultado. Si nadie lo hace, un administrador va a tener que intervenir manualmente.</p>
            `))
          }
        } else if (dias === 3 && enviados < 3) {
          await db.from('retos').update({ recordatorios_resultado_enviados: 3 }).eq('id', r.id)
          resumen.avisoAdminResultado++

          const { data: admins } = await db.from('administradores').select('email')
          for (const admin of admins || []) {
            if (!admin.email) continue
            await enviarCorreo(admin.email, '⚠️ Partido sin resultado hace 3 días — revisión manual', envoltorio(`
              <p>El siguiente partido de la Escalera lleva <strong>3 días</strong> sin que nadie cargue el resultado ni reporte inasistencia:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 6px 0; color: #666;">⚔️ Retador</td><td style="padding: 6px 0;"><strong>${retador?.nombre || '—'}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">🆚 Retado</td><td style="padding: 6px 0;"><strong>${retado?.nombre || '—'}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">📅 Fecha del partido</td><td style="padding: 6px 0;"><strong>${fechaFmt}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">🎾 Cancha</td><td style="padding: 6px 0;"><strong>${canchaFmt}</strong></td></tr>
              </table>
              <p>Contáctalos directamente para resolver qué pasó — el reto sigue en estado <strong>aceptado</strong>, no se tomó ninguna acción automática.</p>
            `))
          }
        }
      } catch (err: any) {
        resumen.errores.push(`reto ${r.id} (resultado pendiente): ${err.message}`)
      }
    }

    // 3) Retos aceptados con partido programado para HOY — aviso de la mañana
    const finHoy = sumarDiasEnCaracas(inicioHoy, 1)

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
      const horaFmt = formatearHora(r.fecha_propuesta)
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

    // 4) Permisos médicos activos: descuento de posición cada 3 días
    const { descensosAplicados, errores: erroresPermiso } = await aplicarDescensosPermisosMedicos(db, hoy)
    resumen.descensosPermisoMedico = descensosAplicados
    resumen.errores.push(...erroresPermiso)

    return NextResponse.json({ ok: true, resumen })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al procesar' }, { status: 500 })
  }
}
