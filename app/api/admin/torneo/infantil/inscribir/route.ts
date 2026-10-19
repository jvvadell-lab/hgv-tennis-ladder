import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora, hoyEnCaracas } from '@/lib/tiempo'
import { torneoVigente } from '@/lib/torneoServidor'
import { inscribirMenor } from '@/lib/torneoInfantilServidor'
import { normalizarFichaMenor, normalizarRepresentanteExterno } from '@/lib/torneoInfantil'

// El admin inscribe a un menor: una ficha ya existente (menorId) o una
// nueva, cuyo representante es un jugador con cuenta
// (representanteJugadorId) o una persona sin cuenta (nombre, teléfono y
// correo libres, como en Delegación). Las autorizaciones las confirma el
// admin en nombre del representante (p. ej. planilla firmada).
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const body = await request.json()
    const { menorId, categoriaId, autorizacionParticipacion, autorizacionImagen, representanteJugadorId } = body
    if (typeof categoriaId !== 'string' || !categoriaId) return NextResponse.json({ error: 'Elige una categoría' }, { status: 400 })
    if (autorizacionParticipacion !== true) {
      return NextResponse.json({ error: 'La autorización de participación del representante es obligatoria' }, { status: 400 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 400 })

    let id: string
    if (menorId) {
      if (typeof menorId !== 'string') return NextResponse.json({ error: 'Ficha no válida' }, { status: 400 })
      id = menorId
    } else {
      const f = normalizarFichaMenor(body, hoyEnCaracas())
      if ('error' in f) return NextResponse.json({ error: f.error }, { status: 400 })

      let representante: object
      if (representanteJugadorId) {
        const { data: rep, error: errRep } = await db.from('jugadores').select('id').eq('id', representanteJugadorId).maybeSingle()
        if (errRep) throw errRep
        if (!rep) return NextResponse.json({ error: 'No encontramos al representante entre los jugadores' }, { status: 400 })
        representante = { representante_jugador_id: rep.id }
      } else {
        const r = normalizarRepresentanteExterno(body)
        if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
        representante = r.representante
      }

      const { data: nuevo, error: errNuevo } = await db
        .from('torneo_menores')
        .insert({
          ...f.ficha,
          ...representante,
          autorizacion_participacion: true,
          autorizacion_participacion_at: ahora().toISOString(),
          autorizacion_imagen: false,
          registrado_por_admin: session!.id,
        })
        .select('id')
        .single()
      if (errNuevo) throw errNuevo
      id = nuevo.id
    }

    const { data: menor, error } = await db
      .from('torneo_menores')
      .select('id, nombre, apellido, genero, fecha_nacimiento, numero_accion, representante_jugador_id, representante_nombre, representante_correo')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!menor) return NextResponse.json({ error: 'Ficha del menor no encontrada' }, { status: 404 })

    const r = await inscribirMenor(db, {
      torneo,
      menor,
      categoriaId,
      autorizacionParticipacion: true,
      autorizacionImagen: autorizacionImagen === true,
      inscritaPor: { adminId: session!.id },
    })
    if (!r.ok) return NextResponse.json({ error: r.error, menorId: id }, { status: 400 })
    return NextResponse.json({ ok: true, inscripcionId: r.inscripcionId, menorId: id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al inscribir al menor' }, { status: 500 })
  }
}
