import { NextResponse } from 'next/server'
import { getSession, puedeGestionarFranjas } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { torneoVigente } from '@/lib/torneoServidor'
import { limitesFranja, validarFranja, type Franja } from '@/lib/torneoProgramacion'
import { ETIQUETA_FASE, type Fase } from '@/lib/torneo'

// Horario de la academia (SPEC §14.5): franjas concretas que el profesor
// (admin nivel academia) o un admin completo liberan para los partidos
// infantiles, dentro de 15:00–18:00. No bloquean la cancha: el bloqueo lo
// crea cada partido al programarse. Una franja con partido no se retira
// (lo repite el trigger torneo_franjas_academia_validar).

const sinPermiso = () => NextResponse.json({ error: 'Solo la academia o un administrador puede hacer esto' }, { status: 403 })

async function cargarFranjas(db: ReturnType<typeof supabaseServer>, torneoId: string): Promise<Franja[]> {
  const { data, error } = await db
    .from('torneo_franjas_academia')
    .select('id, fecha, cancha, hora_inicio, hora_fin')
    .eq('torneo_id', torneoId)
    .order('fecha')
    .order('hora_inicio')
  if (error) throw error
  return (data || []).map((f) => ({ ...f, hora_inicio: f.hora_inicio.slice(0, 5), hora_fin: f.hora_fin.slice(0, 5) })) as Franja[]
}

// Partidos infantiles programados dentro de cada franja (solo categoría,
// fase y hora: la academia no necesita más).
async function partidosEnFranjas(db: ReturnType<typeof supabaseServer>, torneoId: string, franjas: Franja[]) {
  const { data: categorias, error: errCat } = await db.from('torneo_categorias').select('id, nombre').eq('torneo_id', torneoId).eq('es_infantil', true)
  if (errCat) throw errCat
  const nombre = new Map((categorias || []).map((c) => [c.id, c.nombre as string]))
  if (!nombre.size) return {}
  const { data: partidos, error } = await db
    .from('torneo_partidos')
    .select('id, categoria_id, fase, cancha, fecha_hora, torneo_grupos(letra)')
    .in('categoria_id', [...nombre.keys()])
    .not('fecha_hora', 'is', null)
  if (error) throw error
  const porFranja: Record<string, { id: string; texto: string; fecha_hora: string }[]> = {}
  for (const f of franjas) {
    const { inicio, fin } = limitesFranja(f)
    porFranja[f.id] = (partidos || [])
      .filter((p) => p.cancha === f.cancha && new Date(p.fecha_hora!).getTime() >= inicio && new Date(p.fecha_hora!).getTime() < fin)
      .map((p) => ({
        id: p.id,
        fecha_hora: p.fecha_hora!,
        texto: `${nombre.get(p.categoria_id)} · ${p.fase === 'grupo' ? `Grupo ${(p.torneo_grupos as any)?.letra ?? ''}` : ETIQUETA_FASE[p.fase as Fase]}`,
      }))
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
  }
  return porFranja
}

export async function GET() {
  try {
    const session = await getSession()
    if (!puedeGestionarFranjas(session)) return sinPermiso()
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ ok: true, torneo: null, franjas: [], partidos: {} })
    const franjas = await cargarFranjas(db, torneo.id)
    return NextResponse.json({
      ok: true,
      torneo: { id: torneo.id, nombre: torneo.nombre, fecha_inicio: torneo.fecha_inicio, fecha_fin: torneo.fecha_fin, estado: torneo.estado },
      franjas,
      partidos: await partidosEnFranjas(db, torneo.id, franjas),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar el horario de la academia' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!puedeGestionarFranjas(session)) return sinPermiso()
    const body = await request.json()
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })

    const r = validarFranja(body, torneo, await cargarFranjas(db, torneo.id))
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })

    const { error } = await db.from('torneo_franjas_academia').insert({ ...r.franja, torneo_id: torneo.id, liberada_por: session!.id })
    if (error) {
      if (error.message.includes('se solapa')) return NextResponse.json({ error: 'La franja se solapa con otra de la misma cancha ese día' }, { status: 400 })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al liberar la franja' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!puedeGestionarFranjas(session)) return sinPermiso()
    const { franjaId } = await request.json()
    if (typeof franjaId !== 'string' || !franjaId) return NextResponse.json({ error: 'Falta la franja' }, { status: 400 })
    const db = supabaseServer()
    const torneo = await torneoVigente(db)
    if (!torneo) return NextResponse.json({ error: 'No hay un torneo en organización' }, { status: 404 })

    const franjas = await cargarFranjas(db, torneo.id)
    if (!franjas.some((f) => f.id === franjaId)) return NextResponse.json({ error: 'Franja no encontrada' }, { status: 404 })
    const partidos = await partidosEnFranjas(db, torneo.id, franjas)
    if (partidos[franjaId]?.length) {
      return NextResponse.json({ error: 'Esa franja ya tiene un partido programado: pídele al admin que lo mueva antes de retirarla' }, { status: 400 })
    }

    const { error } = await db.from('torneo_franjas_academia').delete().eq('id', franjaId)
    if (error) {
      if (error.message.includes('ya tiene un partido')) {
        return NextResponse.json({ error: 'Esa franja ya tiene un partido programado: pídele al admin que lo mueva antes de retirarla' }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al retirar la franja' }, { status: 500 })
  }
}
