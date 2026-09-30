import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { mensajeErrorPostgres, textoOpcional, validarDatosPago } from '@/lib/delegacion'

// PATCH { accion: 'editar' | 'validar' | 'anular', ... } — admin completo o "solo pagos".
// Un pago anulado ya no se puede editar, validar ni volver a anular.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const db = supabaseServer()
    const { data: actual, error: actualError } = await db
      .from('pagos_delegacion')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (actualError) throw actualError
    if (!actual) return NextResponse.json({ error: 'El pago no existe' }, { status: 404 })
    if (actual.anulado) {
      return NextResponse.json({ error: 'Este pago está anulado; ya no se puede modificar' }, { status: 409 })
    }

    if (body.accion === 'anular') {
      const motivo = textoOpcional(body.motivo)
      if (!motivo) return NextResponse.json({ error: 'Escribe el motivo de la anulación' }, { status: 400 })
      // anulado_por y anulado_at salen de la sesión y del reloj del servidor,
      // nunca del body. El .eq('anulado', false) evita doble anulación si dos
      // admins anulan a la vez.
      const { data, error } = await db
        .from('pagos_delegacion')
        .update({
          anulado: true,
          anulado_at: new Date().toISOString(),
          anulado_por: session.id,
          motivo_anulacion: motivo,
        })
        .eq('id', id)
        .eq('anulado', false)
        .select('id')
      if (error) return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status: 400 })
      if (!data?.length) return NextResponse.json({ error: 'Este pago ya estaba anulado' }, { status: 409 })

      // No se bloquea, pero si sus prendas ya salieron a fabricar se avisa:
      // esas prendas siguen en su lote (el proveedor ya las tiene).
      const { data: enFabrica } = await db
        .from('pedido_uniforme_items')
        .select('cantidad, lote:lote_id!inner(numero, estado)')
        .eq('pago_id', id)
        .eq('lote.estado', 'en_fabrica')
      const advertencia = enFabrica?.length
        ? `Ojo: estas prendas ya se enviaron a fabricar (lote ${[...new Set(enFabrica.map((i: any) => `#${i.lote.numero}`))].join(', ')}). El pago quedó anulado, pero las prendas siguen en el lote.`
        : null
      return NextResponse.json({ ok: true, advertencia })
    }

    if (body.accion === 'validar') {
      const { error } = await db.from('pagos_delegacion').update({ validado: true }).eq('id', id).eq('anulado', false)
      if (error) return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (body.accion !== 'editar') {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }

    // Editar: solo se tocan los campos que vengan en el body; el resto se
    // conserva. Se valida la fila resultante completa.
    const cambios: Record<string, any> = {}
    if ('jugadorId' in body || 'nombreExterno' in body) {
      const jugadorId = textoOpcional(body.jugadorId)
      const nombreExterno = jugadorId ? null : textoOpcional(body.nombreExterno)
      if (!jugadorId && !nombreExterno) {
        return NextResponse.json({ error: 'Elige un jugador o escribe el nombre de la persona' }, { status: 400 })
      }
      cambios.jugador_id = jugadorId
      cambios.nombre_externo = nombreExterno
    }
    if ('torneoId' in body) {
      if (actual.concepto !== 'inscripcion_torneo') {
        return NextResponse.json({ error: 'Un pedido de uniformes no lleva torneo' }, { status: 400 })
      }
      const torneoId = textoOpcional(body.torneoId)
      if (!torneoId) return NextResponse.json({ error: 'Elige el torneo' }, { status: 400 })
      if (torneoId !== actual.torneo_id) {
        const { data: torneo, error: torneoError } = await db
          .from('torneos_externos')
          .select('id, activo')
          .eq('id', torneoId)
          .maybeSingle()
        if (torneoError) throw torneoError
        if (!torneo) return NextResponse.json({ error: 'El torneo no existe' }, { status: 400 })
        if (!torneo.activo) return NextResponse.json({ error: 'Ese torneo ya no está activo' }, { status: 400 })
      }
      cambios.torneo_id = torneoId
    }
    if ('monto' in body) cambios.monto = Number(body.monto)
    if ('tipoPago' in body) cambios.tipo_pago = String(body.tipoPago || '')
    if ('moneda' in body) cambios.moneda = String(body.moneda || '')
    if ('referencia' in body) cambios.referencia = textoOpcional(body.referencia)
    if ('notas' in body) cambios.notas = textoOpcional(body.notas)
    if ('fecha' in body) {
      const fecha = textoOpcional(body.fecha)
      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 })
      }
      cambios.fecha = fecha
    }
    if (!Object.keys(cambios).length) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 })

    const resultante = { ...actual, ...cambios }
    const errorDatos = validarDatosPago({
      monto: Number(resultante.monto),
      moneda: resultante.moneda,
      tipo_pago: resultante.tipo_pago,
      referencia: resultante.referencia,
    })
    if (errorDatos) return NextResponse.json({ error: errorDatos }, { status: 400 })

    if (resultante.concepto === 'inscripcion_torneo' && resultante.jugador_id) {
      const { data: otro, error: dupError } = await db
        .from('pagos_delegacion')
        .select('numero_recibo')
        .eq('concepto', 'inscripcion_torneo')
        .eq('torneo_id', resultante.torneo_id)
        .eq('jugador_id', resultante.jugador_id)
        .eq('anulado', false)
        .neq('id', id)
        .maybeSingle()
      if (dupError) throw dupError
      if (otro) {
        return NextResponse.json(
          { error: `Este jugador ya está inscrito en este torneo (recibo #${otro.numero_recibo})` },
          { status: 409 }
        )
      }
    }

    // La tasa congelada solo aplica a pagos en Bs.: si pasa a US$ se limpia;
    // si una inscripción en Bs. cambia de monto, se recalcula su equivalente.
    if (resultante.moneda !== 'BS') {
      cambios.tasa_bcv = null
      cambios.monto_usd_equivalente = null
    } else if (resultante.concepto === 'inscripcion_torneo' && resultante.tasa_bcv && 'monto' in cambios) {
      cambios.monto_usd_equivalente = Math.round((Number(resultante.monto) / Number(resultante.tasa_bcv)) * 100) / 100
    }

    const { error } = await db.from('pagos_delegacion').update(cambios).eq('id', id).eq('anulado', false)
    if (error) {
      const status = error.code === '23505' ? 409 : 400
      return NextResponse.json({ error: mensajeErrorPostgres(error) }, { status })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al actualizar el pago' }, { status: 500 })
  }
}

// Borrado definitivo (con sus prendas, por el ON DELETE CASCADE) — solo
// admin completo. El admin "solo pagos" usa anular.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador completo puede eliminar pagos; puedes anularlo' }, { status: 403 })
    }

    const { id } = await params
    const db = supabaseServer()

    // Si alguna prenda ya está en un lote, borrarla cambiaría lo que se le
    // mandó al proveedor — en ese caso solo se permite anular.
    const { count, error: loteError } = await db
      .from('pedido_uniforme_items')
      .select('id', { count: 'exact', head: true })
      .eq('pago_id', id)
      .not('lote_id', 'is', null)
    if (loteError) throw loteError
    if (count) {
      return NextResponse.json({ error: 'Este pedido ya tiene prendas en un lote de fabricación; anúlalo en vez de eliminarlo' }, { status: 409 })
    }

    const { data, error } = await db.from('pagos_delegacion').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'El pago no existe' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al eliminar el pago' }, { status: 500 })
  }
}
