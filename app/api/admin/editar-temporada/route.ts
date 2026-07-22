import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 })
    }

    const { temporadaId, nombre, fechaInicio, fechaFin, fechaLimite } = await request.json()
    if (!temporadaId || !nombre?.trim() || !fechaInicio || !fechaFin) {
      return NextResponse.json({ error: 'Completa nombre, fecha de inicio y fecha de fin' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: existentes, error: errExist } = await db
      .from('temporadas')
      .select('id')
      .ilike('nombre', nombre.trim())
      .neq('id', temporadaId)
    if (errExist) throw errExist
    if (existentes && existentes.length > 0) {
      return NextResponse.json({ error: `Ya existe otra temporada llamada "${nombre.trim()}".` }, { status: 400 })
    }

    const { error: errUpdate } = await db
      .from('temporadas')
      .update({
        nombre: nombre.trim(),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        fecha_limite_inscripcion: fechaLimite || null,
      })
      .eq('id', temporadaId)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar' }, { status: 500 })
  }
}
