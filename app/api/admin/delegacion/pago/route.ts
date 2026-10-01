import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { hoyEnCaracas } from '@/lib/tiempo'
import { obtenerTasaVigente, tasaParaCalculo } from '@/lib/tasaBcv'
import {
  mensajeErrorPostgres,
  monedaPorDefectoDe,
  textoOpcional,
  validarDatosPago,
  validarItemsUniforme,
} from '@/lib/delegacion'

// Registra un pago de la delegación: inscripción a un torneo externo, o
// pedido de uniformes (pago + prendas, atómico vía registrar_pago_uniforme).
// Abierto a admin completo y a admin "solo pagos".
//
// Pagos en Bs.: se congela la tasa BCV USD vigente en la fecha del pago
// (truncada a 2 decimales como la publica el BCV, la que se usa para cobrar) y el equivalente en
// US$, para que los reportes no cambien cuando la tasa sube después. Si no
// hay tasa cargada para esa fecha el pago no se bloquea: queda sin tasa y
// se avisa.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const concepto = body.concepto
    if (concepto !== 'inscripcion_torneo' && concepto !== 'uniforme') {
      return NextResponse.json({ error: 'Concepto no válido' }, { status: 400 })
    }

    const jugadorId = textoOpcional(body.jugadorId)
    const nombreExterno = jugadorId ? null : textoOpcional(body.nombreExterno)
    if (!jugadorId && !nombreExterno) {
      return NextResponse.json({ error: 'Elige un jugador o escribe el nombre de la persona' }, { status: 400 })
    }

    const tipoPago = String(body.tipoPago || '')
    const datos = {
      monto: Number(body.monto),
      moneda: String(body.moneda || monedaPorDefectoDe(tipoPago)),
      tipo_pago: tipoPago,
      referencia: textoOpcional(body.referencia),
    }
    const errorDatos = validarDatosPago(datos)
    if (errorDatos) return NextResponse.json({ error: errorDatos }, { status: 400 })

    const fecha = textoOpcional(body.fecha) || hoyEnCaracas()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 })
    }
    const notas = textoOpcional(body.notas)

    const db = supabaseServer()

    let tasa: number | null = null
    if (datos.moneda === 'BS') {
      const vigente = await obtenerTasaVigente(db, fecha)
      tasa = vigente ? tasaParaCalculo(vigente.usd) : null
    }
    const redondear = (n: number) => Math.round(n * 100) / 100

    if (concepto === 'inscripcion_torneo') {
      const torneoId = textoOpcional(body.torneoId)
      if (!torneoId) return NextResponse.json({ error: 'Elige el torneo' }, { status: 400 })

      const { data: torneo, error: torneoError } = await db
        .from('torneos_externos')
        .select('id, activo')
        .eq('id', torneoId)
        .maybeSingle()
      if (torneoError) throw torneoError
      if (!torneo) return NextResponse.json({ error: 'El torneo no existe' }, { status: 400 })
      if (!torneo.activo) return NextResponse.json({ error: 'Ese torneo ya no está activo' }, { status: 400 })

      if (jugadorId) {
        const { data: yaInscrito, error: dupError } = await db
          .from('pagos_delegacion')
          .select('numero_recibo')
          .eq('concepto', 'inscripcion_torneo')
          .eq('torneo_id', torneoId)
          .eq('jugador_id', jugadorId)
          .eq('anulado', false)
          .maybeSingle()
        if (dupError) throw dupError
        if (yaInscrito) {
          return NextResponse.json(
            { error: `Este jugador ya está inscrito en este torneo (recibo #${yaInscrito.numero_recibo})` },
            { status: 409 }
          )
        }
      }

      const { data, error } = await db
        .from('pagos_delegacion')
        .insert([{
          concepto,
          torneo_id: torneoId,
          jugador_id: jugadorId,
          nombre_externo: nombreExterno,
          ...datos,
          fecha,
          notas,
          validado: true, // en esta fase solo carga el admin, así que ya queda válido
          registrado_por: session.id,
          tasa_bcv: tasa,
          monto_usd_equivalente: tasa ? redondear(datos.monto / tasa) : null,
        }])
        .select('numero_recibo')
        .single()
      if (error) {
        const status = error.code === '23505' ? 409 : 400
        return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status })
      }
      return NextResponse.json({ ok: true, numeroRecibo: data.numero_recibo, tasaBcv: tasa, sinTasa: datos.moneda === 'BS' && !tasa })
    }

    // Uniformes
    const itemsRes = validarItemsUniforme(body.items)
    if ('error' in itemsRes) return NextResponse.json({ error: itemsRes.error }, { status: 400 })

    // Precio unitario en la moneda del pago: en US$ tal cual; en Bs.,
    // convertido con la tasa (o vacío si no hay tasa: el monto va a mano).
    const items = itemsRes.items.map((i) => ({
      tipo_prenda: i.tipo_prenda,
      talla: i.talla,
      manga: i.manga,
      cantidad: i.cantidad,
      precio_unitario: i.precio_usd == null ? null : datos.moneda === 'USD' ? i.precio_usd : tasa ? redondear(i.precio_usd * tasa) : null,
    }))
    const totalUsd = itemsRes.items.every((i) => i.precio_usd != null)
      ? redondear(itemsRes.items.reduce((s, i) => s + i.cantidad * (i.precio_usd as number), 0))
      : null

    const { data, error } = await db.rpc('registrar_pago_uniforme', {
      p_pago: {
        jugador_id: jugadorId,
        nombre_externo: nombreExterno,
        ...datos,
        fecha,
        notas,
        registrado_por: session.id,
        tasa_bcv: tasa,
        monto_usd_equivalente: tasa && totalUsd ? totalUsd : null,
      },
      p_items: items,
    })
    if (error) return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status: 400 })
    return NextResponse.json({ ok: true, numeroRecibo: (data as any)?.numero_recibo, tasaBcv: tasa, sinTasa: datos.moneda === 'BS' && !tasa })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al registrar el pago' }, { status: 500 })
  }
}
