import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora, hoyEnCaracas } from '@/lib/tiempo'
import { torneoVigente } from '@/lib/torneoServidor'
import { inscribirMenor } from '@/lib/torneoInfantilServidor'
import { normalizarFichaMenor } from '@/lib/torneoInfantil'

// El admin inscribe a un menor en nombre de su representante: una ficha ya
// existente (menorId) o una nueva. El representante tiene que tener cuenta
// en la app (representanteJugadorId; registro normal, no hace falta que
// esté en el escalafón): su pago va a su nombre en pagos.jugador_id. El
// representante sin cuenta queda como mejora futura (SPEC §14.6). Las
// autorizaciones las confirma el admin en nombre del representante (p. ej.
// planilla firmada).
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

      if (typeof representanteJugadorId !== 'string' || !representanteJugadorId) {
        return NextResponse.json({ error: 'Elige al representante: tiene que tener cuenta en la app' }, { status: 400 })
      }
      const { data: rep, error: errRep } = await db.from('jugadores').select('id, activo').eq('id', representanteJugadorId).maybeSingle()
      if (errRep) throw errRep
      if (!rep || !rep.activo) return NextResponse.json({ error: 'No encontramos al representante entre los usuarios activos de la app' }, { status: 400 })

      const { data: nuevo, error: errNuevo } = await db
        .from('torneo_menores')
        .insert({
          ...f.ficha,
          representante_jugador_id: rep.id,
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
      .select('id, nombre, apellido, genero, fecha_nacimiento, numero_accion, representante_jugador_id')
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
