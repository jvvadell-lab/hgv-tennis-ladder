import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

// Lista de jugadores de la pestaña Jugadores del admin (correo, teléfono,
// verificación, carné...). Esas columnas ya no son legibles con la clave
// anónima, así que se leen aquí con service role. Cualquier nivel de admin:
// el nivel "pagos" también edita perfiles de jugadores.
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const { data, error } = await db
      .from('jugadores')
      .select('id, nombre, email, telefono, numero_accion, categoria, genero, activo, estado_verificacion, email_verificado, created_at, foto_carnet_url, numero_accion_ocr, numero_accion_coincide, es_invitado, invitado_habilitado_at')
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ ok: true, jugadores: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar jugadores' }, { status: 500 })
  }
}
