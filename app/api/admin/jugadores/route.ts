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
      .select('id, nombre, email, telefono, numero_accion, categoria, genero, activo, estado_verificacion, email_verificado, created_at, foto_carnet_url, numero_accion_ocr, numero_accion_coincide, es_invitado, invitado_habilitado_at, es_prueba, es_representante')
      .order('created_at', { ascending: false })
    if (error) throw error
    const jugadores = (data || []) as any[]

    // "Invitado por": para los invitados (no socios), quién los invitó en el
    // torneo, sacado de torneo_invitaciones. Si hay varias, gana la aceptada
    // y, si no, la más reciente.
    const idsInvitados = jugadores.filter((j) => j.es_invitado).map((j) => j.id)
    const invitadoPor = new Map<string, { nombre: string; categoria: string; estado: string }>()
    if (idsInvitados.length) {
      const { data: invs, error: errInv } = await db
        .from('torneo_invitaciones')
        .select('invitado_jugador_id, estado, created_at, torneo_categorias:categoria_id(nombre), inscripcion:invita_inscripcion_id(jugadores:jugador1_id(nombre))')
        .in('invitado_jugador_id', idsInvitados)
        .order('created_at', { ascending: false })
      if (errInv) throw errInv
      for (const inv of (invs || []) as any[]) {
        const actual = invitadoPor.get(inv.invitado_jugador_id)
        if (actual && (actual.estado === 'aceptada' || inv.estado !== 'aceptada')) continue
        invitadoPor.set(inv.invitado_jugador_id, {
          nombre: inv.inscripcion?.jugadores?.nombre || '—',
          categoria: inv.torneo_categorias?.nombre || '',
          estado: inv.estado,
        })
      }
    }

    // Hijos que representa cada cuenta (representantes y jugadores que
    // también inscriben a sus hijos): solo nombre y fecha de nacimiento.
    const { data: menores, error: errMen } = await db
      .from('torneo_menores')
      .select('representante_jugador_id, nombre, apellido, fecha_nacimiento')
      .order('fecha_nacimiento')
    if (errMen) throw errMen
    const hijosDe = new Map<string, { nombre: string; fecha_nacimiento: string }[]>()
    for (const m of (menores || []) as any[]) {
      const lista = hijosDe.get(m.representante_jugador_id) || []
      lista.push({ nombre: `${m.nombre} ${m.apellido}`, fecha_nacimiento: m.fecha_nacimiento })
      hijosDe.set(m.representante_jugador_id, lista)
    }

    return NextResponse.json({
      ok: true,
      jugadores: jugadores.map((j) => ({
        ...j,
        ...(j.es_invitado ? { invitado_por: invitadoPor.get(j.id) ?? null } : {}),
        hijos: hijosDe.get(j.id) || [],
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar jugadores' }, { status: 500 })
  }
}
