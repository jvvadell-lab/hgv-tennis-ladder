import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { aceptarInvitacion, cancelarInvitacion, enviarInvitacion, rechazarInvitacion } from '@/lib/torneoDoblesServidor'
import { enlaceWhatsApp, mensajeInvitacionWhatsApp } from '@/lib/torneoDobles'

// Invitaciones a formar dupla en dobles (rediseño del 23-oct-2026):
//  * enviar   { categoriaId, jugadorId }            a un jugador de la app
//  * enviar   { categoriaId, nombre, telefono }      a alguien sin cuenta: devuelve el enlace wa.me
//  * aceptar | rechazar { invitacionId }             el invitado
//  * cancelar { invitacionId }                       quien invitó
// Toda la lógica y los avisos están en lib/torneoDoblesServidor.ts.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'jugador') {
      return NextResponse.json({ error: 'Debes iniciar sesión como jugador' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const { accion } = body
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo abierto' }, { status: 400 })

    if (accion === 'enviar') {
      if (typeof body.categoriaId !== 'string') return NextResponse.json({ error: 'Elige la categoría' }, { status: 400 })
      const destino = typeof body.jugadorId === 'string'
        ? { jugadorId: body.jugadorId }
        : { nombre: String(body.nombre ?? ''), telefono: String(body.telefono ?? '') }
      if ('jugadorId' in destino && destino.jugadorId === session.id) return NextResponse.json({ error: 'Tu pareja tiene que ser otro jugador' }, { status: 400 })
      const r = await enviarInvitacion(db, torneo, body.categoriaId, session.id, destino)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      let whatsapp: string | null = null
      if (r.whatsapp) {
        const [{ data: yo }, { data: cat }] = await Promise.all([
          db.from('jugadores').select('nombre').eq('id', session.id).single(),
          db.from('torneo_categorias').select('nombre').eq('id', body.categoriaId).single(),
        ])
        const base = new URL(request.url).origin
        whatsapp = enlaceWhatsApp(r.whatsapp.telefono, mensajeInvitacionWhatsApp({
          invitadoNombre: r.whatsapp.nombre, invitaNombre: yo?.nombre ?? '', categoriaNombre: cat?.nombre ?? '',
          torneoNombre: torneo.nombre, urlRegistro: `${base}/register`, urlTorneo: `${base}/torneo/inscripcion`,
        }))
      }
      return NextResponse.json({ ok: true, invitacionId: r.invitacion.id, aCuenta: !!r.invitacion.invitado_jugador_id, whatsapp })
    }

    if (typeof body.invitacionId !== 'string') return NextResponse.json({ error: 'Falta la invitación' }, { status: 400 })
    const r =
      accion === 'aceptar' ? await aceptarInvitacion(db, torneo, body.invitacionId, session.id)
      : accion === 'rechazar' ? await rechazarInvitacion(db, body.invitacionId, session.id)
      : accion === 'cancelar' ? await cancelarInvitacion(db, body.invitacionId, session.id)
      : { ok: false as const, error: 'Acción no válida' }
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error con la invitación' }, { status: 500 })
  }
}
