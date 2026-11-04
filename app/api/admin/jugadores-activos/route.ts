import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Jugadores activos que no son cuentas de prueba, para los desplegables del
// admin (Pagos, Permisos médicos, anotar en la escalera, Delegación) y el
// total del Dashboard. Se lee aquí con service role para no depender de qué
// columnas de jugadores puede leer la clave anónima (es_prueba no estaba
// abierta y esas listas quedaron vacías el 30/31-oct-2026).
// ?conteo=1 devuelve solo el total.
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()

    if (new URL(request.url).searchParams.get('conteo') === '1') {
      const { count, error } = await db
        .from('jugadores')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true)
        .eq('es_prueba', false)
        .eq('es_representante', false)
      if (error) throw error
      return NextResponse.json({ ok: true, total: count || 0 })
    }

    const { data, error } = await db
      .from('jugadores')
      .select('id, nombre, categoria, genero')
      .eq('activo', true)
      .eq('es_prueba', false)
      .eq('es_representante', false)
      .order('nombre', { ascending: true })
    if (error) throw error

    return NextResponse.json({ ok: true, jugadores: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar los jugadores activos' }, { status: 500 })
  }
}
