import { NextResponse } from 'next/server'
import { esAdminCompleto, getSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { METODOS_SORTEO, armarSorteoCategoria, planCategoria, type MetodoSorteo } from '@/lib/torneoSorteo'
import { azarSorteo, datosParaSorteo } from '@/lib/torneoSorteoServidor'

// Vista previa del sorteo (SPEC §3): arma los grupos al azar con las
// inscripciones confirmadas y los devuelve SIN guardar nada. El admin puede
// repetirla cuantas veces quiera; lo que publique se revisa otra vez en
// /api/admin/torneo/sorteo/publicar.
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!esAdminCompleto(session)) {
      return NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 })
    }

    const { metodo } = await request.json()
    if (!(METODOS_SORTEO as readonly string[]).includes(metodo)) {
      return NextResponse.json({ error: 'Elige el método del sorteo: bombos o serpentina' }, { status: 400 })
    }

    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })
    if (torneo.estado !== 'inscripcion') {
      return NextResponse.json({ error: 'El sorteo se hace con el torneo en inscripción' }, { status: 400 })
    }

    const categorias = await datosParaSorteo(db, torneo)
    const errores: string[] = []
    const resultado = categorias.map((c) => {
      const r = armarSorteoCategoria(c, c.inscripciones, metodo as MetodoSorteo, azarSorteo)
      if (!r.ok) {
        errores.push(r.error)
        return { categoriaId: c.id, nombre: c.nombre, error: r.error, inscritas: c.inscripciones.length }
      }
      const nombre = new Map(c.inscripciones.map((i) => [i.id, { nombre: i.nombre, siembra: i.siembra, bombo: i.bombo }]))
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
