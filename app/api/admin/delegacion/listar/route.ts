import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Las tablas de delegación no tienen política SELECT (igual que pagos):
// el admin las lee solo por aquí, con service role.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const [torneosRes, pagosRes, lotesRes] = await Promise.all([
      db.from('torneos_externos').select('*').order('created_at', { ascending: true }),
      db
        .from('pagos_delegacion')
        .select(`
          *,
          jugadores:jugador_id(nombre),
          torneo:torneo_id(nombre),
          registrado:registrado_por(nombre),
          anulador:anulado_por(nombre),
          items:pedido_uniforme_items(*)
        `)
        .order('numero_recibo', { ascending: false }),
      db.from('lotes_uniforme').select('*, enviador:enviado_por(nombre)').order('numero', { ascending: false }),
    ])
    if (torneosRes.error) throw torneosRes.error
    if (pagosRes.error) throw pagosRes.error
    if (lotesRes.error) throw lotesRes.error

    return NextResponse.json({ ok: true, torneos: torneosRes.data || [], pagos: pagosRes.data || [], lotes: lotesRes.data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al listar pagos de delegación' }, { status: 500 })
  }
}
