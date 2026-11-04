import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { resolverAprobacionInvitacion } from '@/lib/torneoDoblesServidor'

// Aprobación previa (4-nov-2026): en las categorías que la exigen, la
// invitación de un socio a un no socio espera el OK del admin antes de
// llegarle al invitado. { invitacionId, aprobar: true | false }.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }
    const { invitacionId, aprobar } = await request.json().catch(() => ({}))
    if (typeof invitacionId !== 'string' || !invitacionId) return NextResponse.json({ error: 'Falta la invitación' }, { status: 400 })
    if (typeof aprobar !== 'boolean') return NextResponse.json({ error: 'Falta indicar si se aprueba' }, { status: 400 })

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo vigente' }, { status: 400 })
    const r = await resolverAprobacionInvitacion(db, torneo, invitacionId, aprobar, session!.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al resolver la invitación' }, { status: 500 })
  }
}
