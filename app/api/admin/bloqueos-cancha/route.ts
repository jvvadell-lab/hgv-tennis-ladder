import { NextResponse } from 'next/server'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { ahora } from '@/lib/tiempo'
import { DURACION_RETO_MIN, DURACION_SINGLE_MIN, ESTADOS_RESERVA_OCUPAN_CANCHA, seSolapan } from '@/lib/reservas'
import { ESTADOS_RETO_OCUPAN_CANCHA } from '@/lib/choquesCancha'

// Bloqueos de cancha por decisión del club — solo admin completo.
//   GET  -> bloqueos que todavía no terminaron (para la lista del panel).
//   POST { bloques: [{ cancha, inicio, fin }], motivo, confirmar? }
//        Sin `confirmar`, si hay retos o reservas ya agendados en esas franjas
//        NO guarda nada: devuelve { requiereConfirmacion, conflictos } para
//        que el admin los vea. Con `confirmar: true` guarda igual. En ningún
//        caso toca esos retos/reservas: el admin conversa con los jugadores y
//        los anula o reagenda a mano con las herramientas de siempre.

const CANCHAS_VALIDAS = ['HGV1', 'HGV2']
const MAX_MOTIVO = 120
// La reserva casual más larga posible (doble, o single + media hora extra).
const DURACION_MAX_RESERVA_MIN = 90

type Bloque = { cancha: string; inicio: Date; fin: Date }
export type ConflictoBloqueo = {
  tipo: 'reto' | 'reserva'
  id: string
  cancha: string
  inicio: string
  fin: string
  estado: string
  jugadores: string
}

async function exigirAdminCompleto() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 }) }
  }
  if (!esAdminCompleto(session)) {
    return { error: NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 }) }
  }
  return { session }
}

async function buscarConflictos(db: ReturnType<typeof supabaseServer>, bloque: Bloque): Promise<ConflictoBloqueo[]> {
  const inicioMs = bloque.inicio.getTime()
  const duracionMin = (bloque.fin.getTime() - inicioMs) / 60000

  const [{ data: retos, error: errRetos }, { data: reservas, error: errReservas }] = await Promise.all([
    db.from('retos')
      .select('id, cancha, fecha_propuesta, estado, retador:retador_id(nombre), retado:retado_id(nombre)')
      .eq('cancha', bloque.cancha)
      .in('estado', ESTADOS_RETO_OCUPAN_CANCHA)
      .gt('fecha_propuesta', new Date(inicioMs - DURACION_RETO_MIN * 60000).toISOString())
      .lt('fecha_propuesta', bloque.fin.toISOString())
      .order('fecha_propuesta', { ascending: true }),
    db.from('reservas_cancha')
      .select('id, cancha, fecha_hora, duracion_min, estado, jugador:jugador_id(nombre)')
      .eq('cancha', bloque.cancha)
      .in('estado', ESTADOS_RESERVA_OCUPAN_CANCHA)
      .gt('fecha_hora', new Date(inicioMs - DURACION_MAX_RESERVA_MIN * 60000).toISOString())
      .lt('fecha_hora', bloque.fin.toISOString())
      .order('fecha_hora', { ascending: true }),
  ])
  if (errRetos) throw errRetos
  if (errReservas) throw errReservas

  const conflictos: ConflictoBloqueo[] = []
  for (const r of (retos || []) as any[]) {
    const rInicio = new Date(r.fecha_propuesta).getTime()
    if (!seSolapan(inicioMs, duracionMin, rInicio, DURACION_RETO_MIN)) continue
    conflictos.push({
      tipo: 'reto',
      id: r.id,
      cancha: r.cancha,
      inicio: r.fecha_propuesta,
      fin: new Date(rInicio + DURACION_RETO_MIN * 60000).toISOString(),
      estado: r.estado,
      jugadores: `${r.retador?.nombre || '?'} vs ${r.retado?.nombre || '?'}`,
    })
  }
  for (const r of (reservas || []) as any[]) {
    const rInicio = new Date(r.fecha_hora).getTime()
    const rDuracion = r.duracion_min || DURACION_SINGLE_MIN
    if (!seSolapan(inicioMs, duracionMin, rInicio, rDuracion)) continue
    conflictos.push({
      tipo: 'reserva',
      id: r.id,
      cancha: r.cancha,
      inicio: r.fecha_hora,
      fin: new Date(rInicio + rDuracion * 60000).toISOString(),
      estado: r.estado,
      jugadores: r.jugador?.nombre || '?',
    })
  }
  return conflictos
}

export async function GET() {
  try {
    const auth = await exigirAdminCompleto()
    if (auth.error) return auth.error

    const db = supabaseServer()
    const { data, error } = await db
      .from('bloqueos_cancha')
      .select('id, cancha, inicio, fin, motivo, created_at, creador:creado_por(nombre)')
      .gt('fin', ahora().toISOString())
      .order('inicio', { ascending: true })
      .order('cancha', { ascending: true })
    if (error) throw error

    return NextResponse.json({ bloqueos: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar los bloqueos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await exigirAdminCompleto()
    if (auth.error) return auth.error
    const session = auth.session!

    const body = await request.json().catch(() => null)
    const motivo = String(body?.motivo || '').trim()
    const confirmar = body?.confirmar === true
    const bloquesCrudos: any[] = Array.isArray(body?.bloques) ? body.bloques : []

    if (!motivo) return NextResponse.json({ error: 'Escribe el motivo del bloqueo' }, { status: 400 })
    if (motivo.length > MAX_MOTIVO) {
      return NextResponse.json({ error: `El motivo no puede pasar de ${MAX_MOTIVO} caracteres` }, { status: 400 })
    }
    if (bloquesCrudos.length === 0 || bloquesCrudos.length > CANCHAS_VALIDAS.length) {
      return NextResponse.json({ error: 'Faltan datos del bloqueo' }, { status: 400 })
    }

    const bloques: Bloque[] = []
    for (const b of bloquesCrudos) {
      const cancha = String(b?.cancha || '')
      const inicio = new Date(b?.inicio)
      const fin = new Date(b?.fin)
      if (!CANCHAS_VALIDAS.includes(cancha)) {
        return NextResponse.json({ error: 'Cancha inválida' }, { status: 400 })
      }
      if (bloques.some((x) => x.cancha === cancha)) {
        return NextResponse.json({ error: 'Cancha repetida' }, { status: 400 })
      }
      if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        return NextResponse.json({ error: 'Fecha/hora inválida' }, { status: 400 })
      }
      if (fin.getTime() <= inicio.getTime()) {
        return NextResponse.json({ error: 'La hora de fin debe ser posterior a la de inicio' }, { status: 400 })
      }
      if (fin.getTime() <= ahora().getTime()) {
        return NextResponse.json({ error: 'Esa franja ya terminó' }, { status: 400 })
      }
      bloques.push({ cancha, inicio, fin })
    }

    const db = supabaseServer()
    const conflictos = (await Promise.all(bloques.map((b) => buscarConflictos(db, b)))).flat()

    if (conflictos.length > 0 && !confirmar) {
      return NextResponse.json({ requiereConfirmacion: true, conflictos })
    }

    const { data: creados, error: errInsert } = await db
      .from('bloqueos_cancha')
      .insert(bloques.map((b) => ({
        cancha: b.cancha,
        inicio: b.inicio.toISOString(),
        fin: b.fin.toISOString(),
        motivo,
        creado_por: session.id,
      })))
      .select('id')
    if (errInsert) throw errInsert

    if (conflictos.length > 0) {
      console.warn(`[bloqueos-cancha] Admin ${session.id} (${session.nombre}) bloqueó con ${conflictos.length} conflicto(s) sin resolver: ${conflictos.map((c) => `${c.tipo}:${c.id}`).join(', ')}`)
    }

    return NextResponse.json({ ok: true, ids: (creados || []).map((c: { id: string }) => c.id), conflictos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al crear el bloqueo' }, { status: 500 })
  }
}
