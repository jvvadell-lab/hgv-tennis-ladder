import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { hoyEnCaracas } from '@/lib/tiempo'
import { obtenerTasaVigente, tasaParaCalculo } from '@/lib/tasaBcv'
import { torneoVigente } from '@/lib/torneoServidor'
import { TIPOS_PAGO_TORNEO, montoInscripcionBs } from '@/lib/torneoInscripcion'

// El jugador reporta el pago de su inscripción (y, en dobles, opcionalmente
// también el de su pareja). Mismo flujo que los pagos de la escalera: queda
// sin validar hasta que el admin lo confirme. El monto lo calcula el
// servidor: monto en € del torneo × tasa BCV del euro vigente el día del
// pago, y la tasa usada queda en pagos.tasa_bcv_eur.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }

    const { inscripcionId, tipoPago, fecha, referencia, incluyePareja } = await request.json()
    if (!inscripcionId || typeof inscripcionId !== 'string') {
      return NextResponse.json({ error: 'Falta la inscripción' }, { status: 400 })
    }
    if (!(TIPOS_PAGO_TORNEO as readonly string[]).includes(tipoPago)) {
      return NextResponse.json({ error: 'El pago del torneo es en Bs.: pago móvil o transferencia' }, { status: 400 })
    }
    const ref = typeof referencia === 'string' ? referencia.trim() : ''
    if (!ref) return NextResponse.json({ error: 'Escribe el número de referencia del pago' }, { status: 400 })

    const hoy = hoyEnCaracas()
    const fechaPago = fecha || hoy
    if (typeof fechaPago !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
      return NextResponse.json({ error: 'La fecha del pago no es válida' }, { status: 400 })
    }
    if (fechaPago > hoy) return NextResponse.json({ error: 'La fecha del pago no puede ser futura' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo || torneo.estado === 'borrador') {
      return NextResponse.json({ error: 'No hay un torneo con inscripciones abiertas' }, { status: 400 })
    }

    const { data: ins, error: errIns } = await db
      .from('torneo_inscripciones')
      .select('id, estado, jugador1_id, jugador2_id, torneo_categorias:categoria_id(torneo_id)')
      .eq('id', inscripcionId)
      .maybeSingle()
    if (errIns) throw errIns
    const esMia = ins && (ins.jugador1_id === session.id || ins.jugador2_id === session.id)
    if (!ins || !esMia || (ins.torneo_categorias as any)?.torneo_id !== torneo.id) {
      return NextResponse.json({ error: 'Esa inscripción no es tuya' }, { status: 403 })
    }
    if (ins.estado === 'retirada') return NextResponse.json({ error: 'Esa inscripción está retirada' }, { status: 400 })

    const parejaId = ins.jugador1_id === session.id ? ins.jugador2_id : ins.jugador1_id
    if (incluyePareja && !parejaId) return NextResponse.json({ error: 'Esta inscripción no tiene pareja' }, { status: 400 })
    const cubiertos = [session.id, ...(incluyePareja && parejaId ? [parejaId] : [])]

    // Un pago vivo (por validar o validado) por jugador e inscripción. Uno
    // rechazado se borra, así que no estorba para volver a reportar.
    const { data: existentes, error: errExist } = await db
      .from('pagos')
      .select('jugador_id, validado, jugadores:jugador_id(nombre)')
      .eq('torneo_inscripcion_id', ins.id)
      .in('jugador_id', cubiertos)
    if (errExist) throw errExist
    if (existentes?.length) {
      const yaPago = existentes[0]
      const quien = yaPago.jugador_id === session.id ? 'tuyo' : `de ${(yaPago.jugadores as any)?.nombre || 'tu pareja'}`
      return NextResponse.json({ error: `Ya hay un pago ${quien} reportado en esta inscripción${yaPago.validado ? ' (ya validado)' : ', pendiente de validación'}` }, { status: 400 })
    }

    const tasa = await obtenerTasaVigente(db, fechaPago)
    if (!tasa) return NextResponse.json({ error: 'No hay tasa BCV registrada para esa fecha. Avísale al administrador.' }, { status: 400 })
    const tasaEur = tasaParaCalculo(tasa.eur)
    const monto = montoInscripcionBs(torneo.monto_inscripcion_eur, tasa.eur)

    const { data: creados, error } = await db
      .from('pagos')
      .insert(cubiertos.map((jugadorId) => ({
        jugador_id: jugadorId,
        temporada_id: null,
        torneo_inscripcion_id: ins.id,
        tipo_pago: tipoPago,
        monto,
        fecha: fechaPago,
        referencia: ref,
        tasa_bcv_eur: tasaEur,
        validado: false,
      })))
      .select('numero_recibo')
    if (error) throw error

    return NextResponse.json({ ok: true, monto, tasaEur, recibos: (creados || []).map((p) => p.numero_recibo) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al reportar el pago' }, { status: 500 })
  }
}
