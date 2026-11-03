import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSession, esAdminCompleto } from '@/lib/session'
import { supabaseServer } from '@/lib/supabaseServer'
import { enviarCorreo } from '@/lib/email'
import { torneoVigente } from '@/lib/torneoServidor'
import { ahora, yaPaso } from '@/lib/tiempo'
import {
  CAMPANA_INAUGURACION, IMAGEN_INAUGURACION, INICIO_INAUGURACION, PAUSA_ENTRE_CORREOS_MS, TAMANO_LOTE, TOPE_DIARIO,
  armarCorreoInauguracion, destinatariosInauguracion, type Destinatario, type Variante,
} from '@/lib/invitacionInauguracion'

// Invitación a la inauguración de la Copa Navidad — solo admin completo.
//  GET                       → conteos por versión, estado de cada envío y vista previa
//  POST { accion: 'prueba' } → las dos versiones al correo del admin (no queda registrado)
//  POST { accion: 'lote' }   → manda el siguiente lote de pendientes; el panel
//                              repite hasta que quedan 0 (cada llamada es corta).
//                              Los que fallaron solo se reintentan con { reintentar: true }.

export const maxDuration = 60

async function exigirAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 }) }
  }
  if (!esAdminCompleto(session)) {
    return { error: NextResponse.json({ error: 'Esta acción requiere permisos de administrador completo.' }, { status: 403 }) }
  }
  return { session }
}

type Envio = { jugador_id: string; estado: 'enviando' | 'enviado' | 'error'; error: string | null; enviado_at: string | null }

async function cargarDestinatarios(db: SupabaseClient): Promise<Destinatario[]> {
  const torneo = await torneoVigente(db)
  const inscritos = new Set<string>()
  if (torneo) {
    const { data: ins, error } = await db
      .from('torneo_inscripciones')
      .select('jugador1_id, torneo_categorias!inner(torneo_id)')
      .eq('torneo_categorias.torneo_id', torneo.id)
      .neq('estado', 'retirada')
      .not('jugador1_id', 'is', null)
    if (error) throw error
    for (const i of ins || []) inscritos.add(i.jugador1_id as string)
  }
  const { data: jugadores, error } = await db
    .from('jugadores')
    .select('id, nombre, email, activo, es_prueba')
    .eq('activo', true)
    .eq('es_prueba', false)
  if (error) throw error
  return destinatariosInauguracion(jugadores || [], inscritos)
}

async function cargarEnvios(db: SupabaseClient): Promise<Map<string, Envio>> {
  const { data, error } = await db
    .from('correos_envios')
    .select('jugador_id, estado, error, enviado_at')
    .eq('campana', CAMPANA_INAUGURACION)
  if (error) throw error
  return new Map((data as Envio[] || []).map((e) => [e.jugador_id, e]))
}

let imagenEnMemoria: Buffer | null = null
async function imagen(): Promise<Buffer> {
  imagenEnMemoria ??= await readFile(join(process.cwd(), IMAGEN_INAUGURACION.archivo))
  return imagenEnMemoria
}

async function mandar(email: string, variante: Variante, nombre: string, prefijoAsunto = '') {
  const { asunto, html, texto } = armarCorreoInauguracion(variante, nombre, `cid:${IMAGEN_INAUGURACION.cid}`)
  await enviarCorreo(email, prefijoAsunto + asunto, html, {
    texto,
    embebidas: [{ cid: IMAGEN_INAUGURACION.cid, nombreArchivo: 'invitacion-inauguracion-copa-navidad.jpg', contenido: await imagen(), tipo: 'image/jpeg' }],
  })
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function GET() {
  try {
    const { session, error } = await exigirAdmin()
    if (error) return error
    const db = supabaseServer()
    const [destinatarios, envios] = await Promise.all([cargarDestinatarios(db), cargarEnvios(db)])

    const lista = destinatarios.map((d) => {
      const e = envios.get(d.jugador_id)
      return { ...d, estado: e?.estado ?? 'pendiente', error: e?.error ?? null, enviado_at: e?.enviado_at ?? null }
    })
    const resumen = (v: Variante) => {
      const grupo = lista.filter((d) => d.variante === v)
      return {
        total: grupo.length,
        enviados: grupo.filter((d) => d.estado === 'enviado').length,
        errores: grupo.filter((d) => d.estado === 'error').length,
      }
    }
    const nombreEjemplo = session.nombre
    const previa = (v: Variante) => armarCorreoInauguracion(v, nombreEjemplo, IMAGEN_INAUGURACION.url)

    return NextResponse.json({
      ok: true,
      vencida: yaPaso(INICIO_INAUGURACION),
      inicio: INICIO_INAUGURACION.toISOString(),
      inscrito: resumen('inscrito'),
      no_inscrito: resumen('no_inscrito'),
      pendientes: lista.filter((d) => d.estado !== 'enviado').length,
      lista: lista.map(({ email: _email, ...resto }) => resto),
      previa: { inscrito: previa('inscrito'), no_inscrito: previa('no_inscrito') },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al cargar la invitación' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { session, error } = await exigirAdmin()
    if (error) return error
    const body = await request.json().catch(() => ({}))
    const db = supabaseServer()

    if (body?.accion === 'prueba') {
      const { data: admin, error: errA } = await db.from('administradores').select('email, nombre').eq('id', session.id).maybeSingle()
      if (errA) throw errA
      if (!admin?.email) return NextResponse.json({ error: 'Tu cuenta de administrador no tiene correo' }, { status: 400 })
      await mandar(admin.email, 'inscrito', admin.nombre || session.nombre, '[Prueba · inscritos] ')
      await esperar(PAUSA_ENTRE_CORREOS_MS)
      await mandar(admin.email, 'no_inscrito', admin.nombre || session.nombre, '[Prueba · no inscritos] ')
      return NextResponse.json({ ok: true, email: admin.email })
    }

    if (body?.accion !== 'lote') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    if (yaPaso(INICIO_INAUGURACION)) {
      return NextResponse.json({ error: 'La inauguración ya empezó: no se manda más la invitación' }, { status: 400 })
    }

    // Tope diario de la cuenta de Gmail (todas las campañas de este panel).
    const haceUnDia = new Date(ahora().getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { count: enviadosHoy, error: errC } = await db
      .from('correos_envios')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'enviado')
      .gte('enviado_at', haceUnDia)
    if (errC) throw errC
    const cupo = Math.min(TAMANO_LOTE, TOPE_DIARIO - (enviadosHoy || 0))
    if (cupo <= 0) {
      return NextResponse.json({ error: `Se llegó al tope de ${TOPE_DIARIO} correos en 24 h. Sigue mañana: los pendientes no se pierden.` }, { status: 429 })
    }

    const [destinatarios, envios] = await Promise.all([cargarDestinatarios(db), cargarEnvios(db)])
    const reintentar = body?.reintentar === true
    const porMandar = (envios: Map<string, Envio>) => destinatarios.filter((d) => {
      const estado = envios.get(d.jugador_id)?.estado
      return estado !== 'enviado' && (reintentar || estado !== 'error')
    })
    const candidatos = porMandar(envios).slice(0, cupo)
    if (candidatos.length === 0) return NextResponse.json({ ok: true, enviados: 0, errores: 0, restantes: 0 })

    // Reclamo atómico: si otro lote (otra pestaña, doble clic) ya los tomó,
    // no vuelven aquí.
    const { data: reclamados, error: errR } = await db.rpc('correos_reclamar_lote', {
      p_campana: CAMPANA_INAUGURACION,
      p_filas: candidatos.map(({ jugador_id, email, variante }) => ({ jugador_id, email, variante })),
      p_admin: session.id,
    })
    if (errR) throw errR
    const nombres = new Map(candidatos.map((d) => [d.jugador_id, d.nombre]))

    let enviados = 0
    let errores = 0
    for (const [i, r] of ((reclamados || []) as { jugador_id: string; email: string; variante: Variante }[]).entries()) {
      if (i > 0) await esperar(PAUSA_ENTRE_CORREOS_MS)
      try {
        await mandar(r.email, r.variante, nombres.get(r.jugador_id) || '')
        enviados++
        await db.from('correos_envios').update({ estado: 'enviado', enviado_at: ahora().toISOString(), error: null })
          .eq('campana', CAMPANA_INAUGURACION).eq('jugador_id', r.jugador_id)
      } catch (e: any) {
        errores++
        await db.from('correos_envios').update({ estado: 'error', error: String(e?.message || e).slice(0, 300) })
          .eq('campana', CAMPANA_INAUGURACION).eq('jugador_id', r.jugador_id)
      }
    }

    const restantes = porMandar(await cargarEnvios(db)).length
    return NextResponse.json({ ok: true, enviados, errores, reclamados: (reclamados || []).length, restantes })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al enviar' }, { status: 500 })
  }
}
