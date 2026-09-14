import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'
import { sumarDiasEnCaracas, inicioDelDiaEnCaracas, finDelDiaEnCaracas, hoyEnCaracas } from '@/lib/tiempo'
import { esEscaleraExpress } from '@/lib/escaleraExpress'

const DURACION_PARTIDO_MS = 90 * 60 * 1000
const AJUSTES_PERMITIDOS = [-1, 2] // solo "un día antes" o "dos días después"

// Baja 1 posición al jugador dado, intercambiando con el primer jugador NO
// congelado (standby o permiso médico activo hoy) que esté justo debajo de
// él en su misma categoría+género — salta a los congelados como si no
// estuvieran ahí, mismo criterio que esElegible() en app/ladder/page.tsx.
// Si no hay nadie disponible debajo (ya es el último activo), no hace nada.
async function bajarUnaPosicion(db: any, temporadaId: string, jugadorId: string, hoy: string) {
  const { data: miFila, error: errMiFila } = await db
    .from('ladder_posiciones')
    .select('id, categoria, genero, posicion')
    .eq('temporada_id', temporadaId)
    .eq('jugador_id', jugadorId)
    .maybeSingle()
  if (errMiFila) throw errMiFila
  if (!miFila || miFila.posicion === null) return

  const { data: debajo, error: errDebajo } = await db
    .from('ladder_posiciones')
    .select('id, jugador_id, posicion')
    .eq('temporada_id', temporadaId)
    .eq('categoria', miFila.categoria)
    .eq('genero', miFila.genero)
    .gt('posicion', miFila.posicion)
    .order('posicion', { ascending: true })
  if (errDebajo) throw errDebajo
  if (!debajo || debajo.length === 0) return

  const idsDebajo = debajo.map((d: any) => d.jugador_id)

  const [{ data: standbys }, { data: permisos }] = await Promise.all([
    db.from('standby').select('jugador_id, fecha_inicio, fecha_fin').eq('temporada_id', temporadaId).in('jugador_id', idsDebajo),
    db.from('permisos_medicos').select('jugador_id, fecha_inicio, fecha_fin').eq('temporada_id', temporadaId).eq('estado', 'aprobado').in('jugador_id', idsDebajo),
  ])

  const congelado = new Set<string>()
  ;(standbys || []).forEach((s: any) => { if (hoy >= s.fecha_inicio && hoy <= s.fecha_fin) congelado.add(s.jugador_id) })
  ;(permisos || []).forEach((p: any) => { if (hoy >= p.fecha_inicio && hoy <= p.fecha_fin) congelado.add(p.jugador_id) })

  const vecino = debajo.find((d: any) => !congelado.has(d.jugador_id))
  if (!vecino) return

  // Mismo truco que aprobar-resultado: pasar por -1 para no chocar con el
  // índice único (temporada, categoria, genero, posicion).
  const { error: e1 } = await db.from('ladder_posiciones').update({ posicion: -1 }).eq('id', miFila.id)
  if (e1) throw e1
  const { error: e2 } = await db.from('ladder_posiciones').update({ posicion: miFila.posicion }).eq('id', vecino.id)
  if (e2) throw e2
  const { error: e3 } = await db.from('ladder_posiciones').update({ posicion: vecino.posicion }).eq('id', miFila.id)
  if (e3) throw e3
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { retoId, nuevoEstado, ajusteDias, confirmado } = await request.json()
    if (!retoId || !['aceptado', 'rechazado'].includes(nuevoEstado)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    if (ajusteDias !== undefined && ajusteDias !== null && !AJUSTES_PERMITIDOS.includes(Number(ajusteDias))) {
      return NextResponse.json({ error: 'Solo puedes adelantar 1 día o atrasar 2 días la fecha propuesta.' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: reto, error: errReto } = await db
      .from('retos')
      .select('id, retador_id, retado_id, estado, temporada_id, fecha_propuesta, cancha, escalera_express, retador:retador_id(nombre, email), retado:retado_id(nombre)')
      .eq('id', retoId)
      .maybeSingle()
    if (errReto) throw errReto
    if (!reto) return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 })

    // El congelamiento de Escalera Express solo aplica a retos normales — uno
    // marcado escalera_express se acepta/rechaza siempre igual que cualquier otro,
    // sin importar la fecha (incluidas las reglas normales, como la penalidad de
    // posición por rechazo repetido).
    if (!reto.escalera_express && esEscaleraExpress(hoyEnCaracas())) {
      return NextResponse.json({
        error: '🚀 Escalera Express: del 10 al 12 de septiembre los retos quedan congelados — no se pueden aceptar ni rechazar hasta que termine el evento.',
      }, { status: 403 })
    }

    // Los retos de Escalera Express tienen fecha y horario fijos (sábado, elegidos
    // de una grilla cerrada) — no se puede correr esa fecha como en un reto normal,
    // porque eso rompería el conteo de cupos (ux_retos_escalera_express_slot /
    // calcularCuposExpress en lib/escaleraExpress.ts siguen comparando contra el
    // instante fijo del sábado) y sacaría el partido de la ventana congelada.
    if (reto.escalera_express && ajusteDias !== undefined && ajusteDias !== null) {
      return NextResponse.json({
        error: 'Los retos de Escalera Express no permiten cambiar la fecha — se juegan el sábado a la hora acordada.',
      }, { status: 400 })
    }

    // Solo el jugador retado puede aceptar o rechazar, y solo si sigue pendiente
    if (reto.retado_id !== session.id) {
      return NextResponse.json({ error: 'Este reto no te pertenece' }, { status: 403 })
    }
    if (reto.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Este reto ya no está pendiente' }, { status: 400 })
    }

    // El primer rechazo de la temporada es gratis. Del segundo en adelante,
    // además de rechazar, el jugador baja 1 posición — así que hay que
    // confirmarlo explícitamente antes de aplicarlo (el cliente reintenta
    // con confirmado:true una vez que el jugador aceptó la advertencia).
    let rechazosPrevios = 0
    if (nuevoEstado === 'rechazado') {
      const { count } = await db
        .from('retos')
        .select('id', { count: 'exact', head: true })
        .eq('retado_id', session.id)
        .eq('temporada_id', reto.temporada_id)
        .eq('estado', 'rechazado')
      rechazosPrevios = count || 0

      if (rechazosPrevios >= 1 && !confirmado) {
        return NextResponse.json({
          requiereConfirmacion: true,
          mensaje: `Este sería tu rechazo #${rechazosPrevios + 1} esta temporada — vas a bajar 1 posición en la escalera. ¿Confirmas?`,
        })
      }
    }

    const updateData: any = { estado: nuevoEstado }
    if (nuevoEstado === 'rechazado') {
      updateData.rechazado_at = new Date().toISOString()
    }

    // Si acepta con un ajuste de fecha, validamos que el nuevo horario no choque
    // con otro partido o reserva en esa misma cancha antes de guardarlo.
    if (nuevoEstado === 'aceptado' && ajusteDias !== undefined && ajusteDias !== null && reto.cancha && reto.cancha !== 'FORANEA') {
      const nuevaFecha = sumarDiasEnCaracas(new Date(reto.fecha_propuesta), Number(ajusteDias))
      const nuevaHoraMs = nuevaFecha.getTime()

      const inicioDia = inicioDelDiaEnCaracas(nuevaFecha)
      const finDia = finDelDiaEnCaracas(nuevaFecha)

      const { data: partidosCancha } = await db
        .from('retos')
        .select('id, fecha_propuesta')
        .eq('temporada_id', reto.temporada_id)
        .eq('cancha', reto.cancha)
        .in('estado', ['pendiente', 'aceptado'])
        .neq('id', retoId)
        .gte('fecha_propuesta', inicioDia.toISOString())
        .lte('fecha_propuesta', finDia.toISOString())

      const conflicto = (partidosCancha || []).find((r: any) =>
        Math.abs(new Date(r.fecha_propuesta).getTime() - nuevaHoraMs) < DURACION_PARTIDO_MS
      )
      if (conflicto) {
        return NextResponse.json({ error: 'Esa cancha ya tiene otro partido cerca de esa nueva hora. No se pudo ajustar la fecha.' }, { status: 400 })
      }

      const { data: reservasCancha } = await db
        .from('reservas_cancha')
        .select('id, fecha_hora, duracion_min')
        .eq('cancha', reto.cancha)
        .eq('estado', 'activa')
        .gte('fecha_hora', inicioDia.toISOString())
        .lte('fecha_hora', finDia.toISOString())

      const finNuevo = nuevaHoraMs + DURACION_PARTIDO_MS
      const conflictoReserva = (reservasCancha || []).find((r: any) => {
        const inicioReserva = new Date(r.fecha_hora).getTime()
        const finReserva = inicioReserva + (r.duracion_min || 60) * 60 * 1000
        return nuevaHoraMs < finReserva && inicioReserva < finNuevo
      })
      if (conflictoReserva) {
        return NextResponse.json({ error: 'Esa cancha ya tiene una reserva casual cerca de esa nueva hora. No se pudo ajustar la fecha.' }, { status: 400 })
      }

      updateData.fecha_propuesta = nuevaFecha.toISOString()
    }

    // Si este rechazo cuesta una posición, la bajamos ANTES de marcar el reto
    // como rechazado — igual que aprobar-resultado hace el intercambio antes
    // de marcar el resultado validado, para no dejar el reto en un estado
    // inconsistente si el swap fallara a mitad de camino.
    if (nuevoEstado === 'rechazado' && rechazosPrevios >= 1) {
      await bajarUnaPosicion(db, reto.temporada_id, session.id, hoyEnCaracas())
    }

    const { error: errUpdate } = await db.from('retos').update(updateData).eq('id', retoId)
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
