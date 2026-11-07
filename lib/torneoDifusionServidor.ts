// Datos de la zona 📣 Difusión (SPEC §18): los mismos que /api/publico/torneo.
// Horario solo con la programación publicada; marcador y ganador solo de lo
// validado. Nombres públicos: nada de teléfonos ni datos de representantes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { competidoresPorId } from '@/lib/torneoEquiposServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'
import { torneoVigente } from '@/lib/torneoServidor'
import type { PartidoDifusion } from '@/lib/torneoDifusion'

export async function cargarPartidosDifusion(db: SupabaseClient): Promise<PartidoDifusion[]> {
  const torneo = await torneoVigente(db)
  if (!torneo?.programacion_publicada_at) return []

  const { data: categorias, error: errC } = await db.from('torneo_categorias').select('id, nombre, formato_llave').eq('torneo_id', torneo.id)
  if (errC) throw errC
  const categoriaDe = new Map((categorias || []).map((c) => [c.id, c]))
  const ids = [...categoriaDe.keys()]
  if (!ids.length) return []

  const [{ data: partidos, error: errP }, { data: grupos, error: errG }] = await Promise.all([
    db.from('torneo_partidos')
      .select('id, categoria_id, fase, grupo_id, orden, origen_a, origen_b, equipo_a, equipo_b, cancha, fecha_hora, estado, sets, tipo_resultado, ganador_equipo_id, wo_ausente_equipo_id, validado, reportado_at')
      .in('categoria_id', ids)
      .not('fecha_hora', 'is', null),
    db.from('torneo_grupos').select('id, letra').in('categoria_id', ids),
  ])
  if (errP) throw errP
  if (errG) throw errG

  const letra = new Map((grupos || []).map((g) => [g.id, g.letra as string]))
  const competidores = await competidoresPorId(db, (partidos || []).flatMap((p) => [p.equipo_a, p.equipo_b]).filter(Boolean) as string[])
  const nombres = await nombresInscripciones(db, [...competidores.values()])

  return (partidos || []).map((p) => {
    const c = categoriaDe.get(p.categoria_id)!
    return {
      id: p.id,
      categoria: c.nombre,
      formato_llave: c.formato_llave ?? 'normal',
      fase: p.fase,
      grupo: p.grupo_id ? letra.get(p.grupo_id) ?? null : null,
      orden: p.orden,
      origen_a: p.origen_a,
      origen_b: p.origen_b,
      equipo_a: p.equipo_a,
      equipo_b: p.equipo_b,
      nombre_a: p.equipo_a ? nombres.get(p.equipo_a) ?? null : null,
      nombre_b: p.equipo_b ? nombres.get(p.equipo_b) ?? null : null,
      cancha: p.cancha,
      fecha_hora: p.fecha_hora,
      estado: p.estado,
      validado: p.validado,
      reportado: !!p.reportado_at,
      sets: p.validado ? p.sets : null,
      tipo_resultado: p.validado ? p.tipo_resultado : 'normal',
      ganador: p.validado ? p.ganador_equipo_id : null,
      wo_ausente: p.validado ? p.wo_ausente_equipo_id : null,
    }
  })
}
