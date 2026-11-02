import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Todos los recibos de la tabla pagos (escalera y torneo comparten la
// numeración) para la pestaña Pagos → Todos los recibos del admin. Cualquier
// nivel de admin. Los pagos de Delegación van en su propia tabla y pestaña.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const { data, error } = await db
      .from('pagos')
      .select(`
        id, numero_recibo, tipo_pago, monto, fecha, referencia, validado, tasa_bcv_eur, created_at,
        jugadores:jugador_id(nombre),
        temporadas:temporada_id(nombre),
        inscripcion:torneo_inscripcion_id(menor_nombre_publico, torneo_categorias:categoria_id(nombre, torneos:torneo_id(nombre)))
      `)
      .order('numero_recibo', { ascending: false })
    if (error) throw error

    const recibos = (data || []).map((p: any) => {
      const esTorneo = !!p.inscripcion
      const categoria = p.inscripcion?.torneo_categorias?.nombre || null
      return {
        id: p.id,
        numero_recibo: p.numero_recibo,
        origen: esTorneo ? 'torneo' : 'escalera',
        concepto: esTorneo
          ? `${p.inscripcion?.torneo_categorias?.torneos?.nombre || 'Torneo'} · ${categoria || ''}`.trim()
          : `Escalera${p.temporadas?.nombre ? ` · ${p.temporadas.nombre}` : ''}`,
        jugador: p.jugadores?.nombre || '—',
        menor: p.inscripcion?.menor_nombre_publico || null,
        tipo_pago: p.tipo_pago,
        monto: Number(p.monto),
        fecha: p.fecha,
        referencia: p.referencia,
        validado: !!p.validado,
        tasa_bcv_eur: p.tasa_bcv_eur != null ? Number(p.tasa_bcv_eur) : null,
      }
    })

    return NextResponse.json({ ok: true, recibos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al listar los recibos' }, { status: 500 })
  }
}
