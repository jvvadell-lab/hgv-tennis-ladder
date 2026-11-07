import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { competidoresPorId } from '@/lib/torneoEquiposServidor'
import { fotoPublica } from '@/lib/torneoFotos'
import { equiposSinAutorizacionImagen } from '@/lib/torneoFotosServidor'
import { nombresInscripciones } from '@/lib/torneoSorteoServidor'
import { ETIQUETA_FASE, etapaCuadros, type Fase } from '@/lib/torneo'
import { textoMarcador } from '@/lib/torneoResultados'

// Fotos de los partidos del torneo para /galeria (SPEC §17). De los menores
// sale solo el nombre público. Una foto cuyo menor ya no tiene autorización no sale.
export async function GET() {
  try {
    const db = supabaseServer()
    const { data, error } = await db
      .from('torneo_partidos')
      .select('id, fase, orden, equipo_a, equipo_b, cancha, fecha_hora, estado, validado, sets, tipo_resultado, wo_ausente_equipo_id, foto_url, foto_subida_at, torneo_categorias(nombre, formato_llave), torneo_grupos(letra)')
      .not('foto_url', 'is', null)
      .eq('validado', true)
      .order('foto_subida_at', { ascending: false })
    if (error) throw error
    const partidos = (data || []) as any[]

    const ids = partidos.flatMap((p) => [p.equipo_a, p.equipo_b]).filter(Boolean) as string[]
    const [competidores, sinAutorizacion] = await Promise.all([competidoresPorId(db, ids), equiposSinAutorizacionImagen(db, ids)])
    const nombres = await nombresInscripciones(db, [...competidores.values()])

    const fotos = partidos.flatMap((p) => {
      const url = fotoPublica(p, sinAutorizacion.has(p.equipo_a) || sinAutorizacion.has(p.equipo_b))
      if (!url) return []
      const letra: string | null = p.torneo_grupos?.letra ?? null
      const fase = p.fase as Fase
      return [{
        id: p.id,
        foto_url: url,
        fecha: p.fecha_hora ?? p.foto_subida_at,
        categoria: p.torneo_categorias?.nombre ?? '',
        etapa: p.torneo_categorias?.formato_llave === 'cuadros'
          ? etapaCuadros({ fase, orden: p.orden, grupoLetra: letra })
          : fase === 'grupo' ? `Grupo ${letra}` : ETIQUETA_FASE[fase],
        nombre_a: nombres.get(p.equipo_a) ?? '—',
        nombre_b: nombres.get(p.equipo_b) ?? '—',
        marcador: textoMarcador(p),
        cancha: p.cancha,
      }]
    })
    return NextResponse.json({ ok: true, fotos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar las fotos' }, { status: 500 })
  }
}
