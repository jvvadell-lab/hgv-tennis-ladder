import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { capturarDesdeDolarApi, validarTasa } from '@/lib/tasaBcv'

// Respaldo manual de la tasa BCV — solo admin completo.
//   { accion: 'actualizar' }                         -> "Actualizar ahora" desde DolarAPI (+ relleno)
//   { accion: 'manual', fecha, usd, eur, confirmarVariacion? } -> carga a mano si la API falla
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador completo puede actualizar la tasa BCV' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const db = supabaseServer()

    if (body?.accion === 'actualizar') {
      try {
        const resultado = await capturarDesdeDolarApi(db, { rellenar: true })
        return NextResponse.json({ ok: true, ...resultado })
      } catch (err: any) {
        console.error('[tasa-bcv] "Actualizar ahora" falló:', err.message)
        return NextResponse.json({ error: `DolarAPI no respondió bien (${err.message}). Puedes cargar la tasa a mano.` }, { status: 502 })
      }
    }

    if (body?.accion !== 'manual') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })

    const fecha = String(body.fecha || '')
    const usd = Number(body.usd)
    const eur = Number(body.eur)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 })

    // Misma validación que la automática; la variación grande se puede
    // confirmar a propósito (p. ej. una devaluación real).
    const { data: anterior, error: antError } = await db
      .from('tasas_bcv')
      .select('usd, eur')
      .lt('fecha_vigencia', fecha)
      .order('fecha_vigencia', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (antError) throw antError
    const motivo = validarTasa({ usd, eur }, anterior && body.confirmarVariacion !== true ? { usd: Number(anterior.usd), eur: Number(anterior.eur) } : null)
    if (motivo) {
      return NextResponse.json({ error: motivo, requiereConfirmacion: motivo.startsWith('Variación') }, { status: 400 })
    }

    const { error } = await db.from('tasas_bcv').upsert(
      { fecha_vigencia: fecha, usd, eur, fuente: 'manual', registrada_por: session.id, capturada_at: new Date().toISOString() },
      { onConflict: 'fecha_vigencia' }
    )
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar la tasa' }, { status: 500 })
  }
}
