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
  CAMPANA_INAUGURACION, CIERRE_INSCRIPCIONES_RESPALDO, IMAGEN_INAUGURACION, INICIO_INAUGURACION, PAUSA_ENTRE_CORREOS_MS,
  REMITENTE_INAUGURACION, TAMANO_LOTE, TOPE_DIARIO,
  armarCorreoInauguracion, destinatariosInauguracion, variantesPermitidas, type Destinatario, type Variante,
} from '@/lib/invitacionInauguracion'

// Invitación a la inauguración de la Copa Navidad — solo admin completo.
//  GET                       → conteos por versión, estado de cada envío, cupo diario y vista previa
//  POST { accion: 'prueba' } → las dos versiones al correo del admin (no queda registrado)
//  POST { accion: 'lote' }   → manda el siguiente lote de pendientes; el panel
//                              repite hasta que quedan 0 (cada llamada es corta).
//  POST { accion: 'lote', reintentar: true } → solo los que fallaron.
// Después del cierre de inscripciones la versión B (no inscritos) no se manda.

export const maxDuration = 60

const NOMBRE_EJEMPLO = 'María'

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

// Destinatarios y cierre de inscripciones del torneo vigente.
async function cargarDestinatarios(db: SupabaseClient): Promise<{ destinatarios: Destinatario[]; cierre: Date }> {
  const torneo = await torneoVigente(db)
  const inscritos = new Set<string>()
  if (torneo) {
    const { data: ins, error } = await db
      .from('torneo_inscripciones')
      .select('jugador1_id, torneo_menores:menor_id(representante_jugador_id), torneo_categorias!inner(torneo_id)')
      .eq('torneo_categorias.torneo_id', torneo.id)
      .neq('estado', 'retirada')
    if (error) throw error
    for (const i of (ins || []) as unknown as { jugador1_id: string | null; torneo_menores: { representante_jugador_id: string | null } | null }[]) {
      if (i.jugador1_id) inscritos.add(i.jugador1_id)
      // El representante del niño inscrito cuenta como inscrito.
      if (i.torneo_menores?.representante_jugador_id) inscritos.add(i.torneo_menores.representante_jugador_id)
    }
  }
  const { data: jugadores, error } = await db
    .from('jugadores')
    .select('id, nombre, email, activo, es_prueba')
    .eq('activo', true)
    .eq('es_prueba', false)
  if (error) throw error
  const cierre = torneo?.cierre_inscripciones_at ? new Date(torneo.cierre_inscripciones_at) : CIERRE_INSCRIPCIONES_RESPALDO
  return { destinatarios: destinatariosInauguracion(jugadores || [], inscritos), cierre }
}

async function cargarEnvios(db: SupabaseClient): Promise<Map<string, Envio>> {
  const { data, error } = await db
    .from('correos_envios')
    .select('jugador_id, estado, error, enviado_at')
    .eq('campana', CAMPANA_INAUGURACION)
  if (error) throw error
  return new Map((data as Envio[] || []).map((e) => [e.jugador_id, e]))
}

// Correos aceptados por Gmail en las últimas 24 h (todas las campañas).
async function enviadosUltimas24h(db: SupabaseClient): Promise<number> {
  const haceUnDia = new Date(ahora().getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await db
    .from('correos_envios')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'enviado')
    .gte('enviado_at', haceUnDia)
  if (error) throw error
  return count || 0
}

let imagenEnMemoria: Buffer | null = null
async function imagen(): Promise<Buffer> {
  imagenEnMemoria ??= await readFile(join(process.cwd(), IMAGEN_INAUGURACION.archivo))
  return imagenEnMemoria
}

async function mandar(email: string, variante: Variante, nombre: string, prefijoAsunto = '') {
  const { asunto, html, texto } = armarCorreoInauguracion(variante, nombre, `cid:${IMAGEN_INAUGURACION.cid}`)
  await enviarCorreo(email, prefijoAsunto + asunto, html, {
    remitente: REMITENTE_INAUGURACION,
    texto,
    embebidas: [{ cid: IMAGEN_INAUGURACION.cid, nombreArchivo: 'invitacion-inauguracion-copa-navidad.jpg', contenido: await imagen(), tipo: 'image/jpeg' }],
  })
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function GET(request: Request) {
  try {
    const { error } = await exigirAdmin()
    if (error) return error
    const db = supabaseServer()
    const [{ destinatarios, cierre }, envios, enviadosHoy] = await Promise.all([cargarDestinatarios(db), cargarEnvios(db), enviadosUltimas24h(db)])

    const lista = destinatarios.map((d) => {
      const e = envios.get(d.jugador_id)
      return { jugador_id: d.jugador_id, nombre: d.nombre, variante: d.variante, estado: e?.estado ?? 'pendiente', error: e?.error ?? null, enviado_at: e?.enviado_at ?? null }
    })
    const resumen = (v: Variante) => {
      const grupo = lista.filter((d) => d.variante === v)
      const enviados = grupo.filter((d) => d.estado === 'enviado').length
      const errores = grupo.filter((d) => d.estado === 'error').length
      return { total: grupo.length, enviados, errores, pendientes: grupo.length - enviados - errores }
    }

    // URL absoluta: la vista previa va en un iframe aislado (srcdoc + sandbox),
    // que no resuelve rutas relativas.
    const imagenPrevia = new URL(IMAGEN_INAUGURACION.url, request.url).href

    return NextResponse.json({
      ok: true,
      vencida: yaPaso(INICIO_INAUGURACION),
      inicio: INICIO_INAUGURACION.toISOString(),
      cierre: cierre.toISOString(),
      inscripcionesCerradas: yaPaso(cierre),
      cupoDiario: Math.max(0, TOPE_DIARIO - enviadosHoy),
      topeDiario: TOPE_DIARIO,
      inscrito: resumen('inscrito'),
      no_inscrito: resumen('no_inscrito'),
      lista,
      previa: {
        inscrito: armarCorreoInauguracion('inscrito', NOMBRE_EJEMPLO, imagenPrevia),
        no_inscrito: armarCorreoInauguracion('no_inscrito', NOMBRE_EJEMPLO, imagenPrevia),
      },
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
      const nombre = admin.nombre || session.nombre
      await mandar(admin.email, 'inscrito', nombre, '[Prueba A · inscritos] ')
      await esperar(PAUSA_ENTRE_CORREOS_MS)
      await mandar(admin.email, 'no_inscrito', nombre, '[Prueba B · no inscritos] ')
      return NextResponse.json({ ok: true, email: admin.email })
    }

    if (body?.accion !== 'lote') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    if (yaPaso(INICIO_INAUGURACION)) {
      return NextResponse.json({ error: 'La inauguración ya empezó: no se manda más la invitación' }, { status: 400 })
    }

    const cupo = Math.min(TAMANO_LOTE, TOPE_DIARIO - await enviadosUltimas24h(db))
    if (cupo <= 0) {
      return NextResponse.json({ error: `Se llegó al tope de ${TOPE_DIARIO} correos en 24 h. Sigue mañana: los pendientes no se pierden.` }, { status: 429 })
    }

    const [{ destinatarios, cierre }, envios] = await Promise.all([cargarDestinatarios(db), cargarEnvios(db)])
    const permitidas = variantesPermitidas(yaPaso(cierre))
    const reintentar = body?.reintentar === true
    // Envío normal: los que no tienen fila (o quedaron colgados en
    // 'enviando'); reintento: solo los 'error'.
    const porMandar = (envios: Map<string, Envio>) => destinatarios.filter((d) => {
      if (!permitidas.includes(d.variante)) return false
      const estado = envios.get(d.jugador_id)?.estado
      return reintentar ? estado === 'error' : estado !== 'enviado' && estado !== 'error'
    })
    const todos = porMandar(envios)
    const candidatos = todos.slice(0, cupo)
    if (candidatos.length === 0) return NextResponse.json({ ok: true, enviados: 0, errores: 0, reclamados: 0, restantes: 0 })

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

    // En un reintento, los que vuelven a fallar no cuentan como restantes
    // (si no, el panel reintentaría sin fin): quedan los que no entraron en este lote.
    const restantes = reintentar ? todos.length - candidatos.length : porMandar(await cargarEnvios(db)).length
    return NextResponse.json({ ok: true, enviados, errores, reclamados: (reclamados || []).length, restantes })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al enviar' }, { status: 500 })
  }
}
