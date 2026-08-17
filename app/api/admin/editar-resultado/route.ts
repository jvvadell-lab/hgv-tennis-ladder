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

    const { resultadoId, marcadorRetador, marcadorRetado, ganadorId } = await request.json()
    if (!resultadoId || !marcadorRetador?.trim() || !marcadorRetado?.trim() || !ganadorId) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const db = supabaseServer()

    const { data: resultado, error: errBuscar } = await db
      .from('resultados')
      .select('id, validado, reto_id, retos:reto_id(retador_id, retado_id)')
      .eq('id', resultadoId)
      .maybeSingle()
    if (errBuscar) throw errBuscar
    if (!resultado) return NextResponse.json({ error: 'Resultado no encontrado' }, { status: 404 })

    // Una vez aprobado, ya se intercambiaron las posiciones del escalafón según
    // el ganador registrado — editar el marcador aquí no desharía ese cambio,
    // así que por seguridad solo se permite mientras esté pendiente de validar.
    if (resultado.validado) {
      return NextResponse.json({ error: 'Este resultado ya fue aprobado — no se puede editar desde aquí.' }, { status: 400 })
    }

    const reto: any = resultado.retos
    if (ganadorId !== reto?.retador_id && ganadorId !== reto?.retado_id) {
      return NextResponse.json({ error: 'El ganador debe ser uno de los dos jugadores del partido' }, { status: 400 })
    }

    const { error: errUpdate } = await db
      .from('resultados')
      .update({
        marcador_retador: marcadorRetador.trim(),
        marcador_retado: marcadorRetado.trim(),
        ganador_id: ganadorId,
      })
      .eq('id', resultadoId)
    if (errUpdate) throw errUpdate

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al editar el resultado' }, { status: 500 })
  }
}
