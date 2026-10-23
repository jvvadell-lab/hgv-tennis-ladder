import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { hoyEnCaracas } from '@/lib/tiempo'

// Permisos médicos para el panel del admin: pendientes y aprobados vigentes,
// con el motivo y el informe médico. Esas dos columnas ya no se leen con la
// clave anónima (son datos de salud): solo por aquí, con service role.
export async function GET() {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const db = supabaseServer()
    const [{ data: pendientes, error: errP }, { data: activos, error: errA }] = await Promise.all([
      db.from('permisos_medicos')
        .select('id, dias, motivo, informe_url, estado, created_at, jugadores:jugador_id(nombre)')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true }),
      db.from('permisos_medicos')
        .select('id, dias, motivo, informe_url, fecha_inicio, fecha_fin, jugadores:jugador_id(nombre)')
        .eq('estado', 'aprobado')
        .gte('fecha_fin', hoyEnCaracas())
        .order('fecha_fin', { ascending: true }),
    ])
    if (errP) throw errP
    if (errA) throw errA

    return NextResponse.json({ ok: true, pendientes: pendientes || [], activos: activos || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar los permisos médicos' }, { status: 500 })
  }
}
