import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { METODOS_SORTEO, armarSorteoCategoria, planCategoria, type MetodoSorteo } from '@/lib/torneoSorteo'
import { azarSorteo, datosParaSorteo } from '@/lib/torneoSorteoServidor'

// Vista previa del sorteo de UNA categoría (SPEC §3): arma los grupos al azar
// con sus equipos activos (duplas en dobles; hayan pagado o no) y los
// devuelve SIN guardar nada.
// Se puede con las inscripciones abiertas o cerradas. El admin puede
// repetirla cuantas veces quiera; lo que publique se revisa otra vez en
// /api/admin/torneo/sorteo/publicar.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { categoriaId, metodo } = await request.json()
    if (typeof categoriaId !== 'string') return NextResponse.json({ error: 'Elige la categoría' }, { status: 400 })
    if (!(METODOS_SORTEO as readonly string[]).includes(metodo)) {
      return NextResponse.json({ error: 'Elige el método del sorteo: bombos o serpentina' }, { status: 400 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (!['borrador', 'inscripcion'].includes(torneo.estado)) {
      return NextResponse.json({ error: 'El sorteo ya se hizo' }, { status: 400 })
    }

    const categorias = await datosParaSorteo(db, torneo, categoriaId)
    if (!categorias.length) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    if (categorias[0].sorteo_publicado_at) return NextResponse.json({ error: `${categorias[0].nombre}: el sorteo ya se publicó` }, { status: 400 })
    if (categorias[0].cancelada_at) return NextResponse.json({ error: `${categorias[0].nombre}: la categoría está cancelada` }, { status: 400 })
    // Categoría oficial, certificación o invitado sin autorizar: se resuelven antes.
    const errores: string[] = categorias.flatMap((c) => c.bloqueos)
    const resultado = categorias.map((c) => {
      const r = armarSorteoCategoria(c, c.inscripciones, metodo as MetodoSorteo, azarSorteo)
      if (!r.ok) {
        errores.push(r.error)
        return { categoriaId: c.id, nombre: c.nombre, error: r.error, inscritas: c.inscripciones.length }
      }
      const nombre = new Map(c.inscripciones.map((i) => [i.id, { nombre: i.nombre, siembra: i.siembra, bombo: i.bombo, pagoPendiente: i.pagoPendiente }]))
      const plan = planCategoria(r.sorteo)
      return {
        categoriaId: c.id,
        nombre: c.nombre,
        inscritas: c.inscripciones.length,
        formato: r.sorteo.formato,
        grupos: r.sorteo.grupos,
        gruposDetalle: plan.grupos.map((g) => ({ letra: g.letra, miembros: g.miembros.map((id) => ({ id, ...nombre.get(id)! })) })),
        partidosGrupo: plan.partidos.filter((p) => p.fase === 'grupo').length,
        llave: plan.partidos.filter((p) => p.fase !== 'grupo').map((p) => ({ fase: p.fase, orden: p.orden, origen_a: p.origen_a, origen_b: p.origen_b })),
      }
    })

    return NextResponse.json({
      ok: true,
      metodo,
      bloqueado: errores.length > 0,
      errores,
      avisos: resultado.flatMap((r) => ('formato' in r && r.formato ? r.formato.avisos : [])),
      categorias: resultado,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al armar el sorteo' }, { status: 500 })
  }
}
