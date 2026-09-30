import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// POST { ids: string[] } -> cómo se confirmó cada reserva y si se le quitó
// la penalidad. Estas columnas no son legibles con la clave anónima (la
// tabla es de lectura pública solo en sus columnas de siempre), así que el
// admin las pide aquí, con service role. Solo admin completo (igual que la
// sección Reservas).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador completo puede ver esto' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const ids: unknown = body?.ids
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) {
      return NextResponse.json({ error: 'Faltan los ids de las reservas' }, { status: 400 })
    }
    if (ids.length === 0) return NextResponse.json({ ok: true, confirmaciones: {} })
    if (ids.length > 1000) return NextResponse.json({ error: 'Demasiadas reservas a la vez' }, { status: 400 })

    const { data, error } = await supabaseServer()
      .from('reservas_cancha')
      .select(`
        id, confirmado_at, confirmacion_metodo, confirmacion_distancia_m, confirmacion_precision_m,
        penalidad_anulada_at,
        confirmador:confirmado_por(nombre),
        anulador_penalidad:penalidad_anulada_por(nombre)
      `)
      .in('id', ids as string[])
    if (error) throw error

    return NextResponse.json({ ok: true, confirmaciones: Object.fromEntries((data || []).map((r) => [r.id, r])) })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string } | null)?.message || 'Error al leer las confirmaciones' }, { status: 500 })
  }
}
