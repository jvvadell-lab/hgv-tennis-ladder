import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { TIPOS_PRENDA } from '@/lib/delegacion'

// PATCH { precios: { franela_dama?: number, franela_caballero?: number, chaqueta?: number, chaqueta_dama?: number, franela_nino?: number } }
// Precios de referencia de las prendas en US$ — solo admin completo. (La
// lectura va junto con /api/admin/delegacion/listar.)
export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador completo puede cambiar los precios' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const precios = body?.precios
    if (!precios || typeof precios !== 'object') return NextResponse.json({ error: 'Faltan los precios' }, { status: 400 })

    const filas = []
    for (const [tipo, valor] of Object.entries(precios)) {
      if (!TIPOS_PRENDA.includes(tipo as any)) return NextResponse.json({ error: `Prenda no válida: ${tipo}` }, { status: 400 })
      const precio = Number(valor)
      if (!Number.isFinite(precio) || precio <= 0) return NextResponse.json({ error: 'Cada precio debe ser mayor a 0' }, { status: 400 })
      filas.push({ tipo_prenda: tipo, precio_usd: precio, updated_at: new Date().toISOString(), updated_por: session.id })
    }
    if (!filas.length) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 })

    const { error } = await supabaseServer().from('precios_prendas').upsert(filas, { onConflict: 'tipo_prenda' })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar los precios' }, { status: 500 })
  }
}
