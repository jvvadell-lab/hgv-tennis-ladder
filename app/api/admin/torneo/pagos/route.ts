import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Pagos de inscripción del torneo para la pestaña Pagos → Torneo del admin
// (cualquier nivel de admin, como los pagos de la escalera). La validación y
// el rechazo siguen en /api/admin/torneo/validar-pago y rechazar-pago.
// ?conteo=1 devuelve solo cuántos están por validar (para el contador de la
// pestaña).
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const soloConteo = new URL(request.url).searchParams.get('conteo') === '1'

    if (soloConteo) {
      const { count, error } = await db
        .from('pagos')
        .select('id', { count: 'exact', head: true })
        .not('torneo_inscripcion_id', 'is', null)
        .eq('validado', false)
      if (error) throw error
      return NextResponse.json({ ok: true, porValidar: count || 0 })
    }

    const { data, error } = await db
      .from('pagos')
      .select(`
        id, numero_recibo, jugador_id, tipo_pago, monto, fecha, referencia, validado, tasa_bcv_eur, created_at,
        jugadores:jugador_id(nombre, es_invitado),
        inscripcion:torneo_inscripcion_id(id, estado, monto_eur, menor_nombre_publico, torneo_categorias:categoria_id(nombre, orden))
      `)
      .not('torneo_inscripcion_id', 'is', null)
      .order('numero_recibo', { ascending: false })
    if (error) throw error

    const pagos = (data || []).map((p: any) => ({
      id: p.id,
      numero_recibo: p.numero_recibo,
      jugador_id: p.jugador_id,
      jugador_nombre: p.jugadores?.nombre || '—',
      es_invitado: !!p.jugadores?.es_invitado,
      tipo_pago: p.tipo_pago,
      monto: Number(p.monto),
      fecha: p.fecha,
      referencia: p.referencia,
      validado: !!p.validado,
      tasa_bcv_eur: p.tasa_bcv_eur != null ? Number(p.tasa_bcv_eur) : null,
      categoria_nombre: p.inscripcion?.torneo_categorias?.nombre || '—',
      categoria_orden: p.inscripcion?.torneo_categorias?.orden ?? 999,
      inscripcion_estado: p.inscripcion?.estado || null,
      monto_eur: p.inscripcion?.monto_eur != null ? Number(p.inscripcion.monto_eur) : null,
      menor_nombre: p.inscripcion?.menor_nombre_publico || null,
    }))

    return NextResponse.json({ ok: true, pagos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al listar los pagos del torneo' }, { status: 500 })
  }
}
