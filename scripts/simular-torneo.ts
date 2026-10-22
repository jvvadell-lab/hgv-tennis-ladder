// Simulación del torneo en el entorno de pruebas LOCAL (Supabase en Docker).
// Ver scripts/README-simulacion.md.
//
//   npm run simular -- preparar        24 jugadoras, 12 parejas en Doble Femenino Sexta, pagos y siembras
//   npm run simular -- sortear         sorteo por bombos + asistente de programación (y la publica)
//   npm run simular -- jugar <etapa>   grupos-j1 | grupos-j2 | grupos-j3 | cuartos | semis | final
//   npm run simular -- estado          resumen de lo que hay
//   npm run simular -- reset           borra todo lo que creó la simulación
//
// Se NIEGA a correr si .env.local.staging no apunta a un Supabase local
// (scripts/entornoStaging.ts). Usa las MISMAS funciones que la app:
// recalcularInscripcion, datosParaSorteo / armarSorteoCategoria /
// publicarSorteo, proponerProgramacion / guardarProgramacion /
// publicarProgramacion, y reportarResultado / validarResultado /
// registrarWO, que corren el avance automático.
//
// La simulación vive en su propio torneo ("SIMULACIÓN — …"), con una copia
// de la categoría Doble Femenino Sexta: el sorteo real exige al menos 3
// inscripciones en TODAS las categorías del torneo, y así el Torneo Navidad
// de los datos base no se toca. Mientras existe es el torneo vigente (empieza
// un día antes). Marcas para "reset": ese torneo (borra en cascada sus
// categorías, inscripciones, grupos y partidos), los bloqueos de cancha de
// sus partidos, los pagos de sus inscripciones y las jugadoras con correo
// @simulacion.invalid. "Prueba 01" (cuenta de prueba de los datos base) no se borra.
//
// Escenarios a propósito (semilla fija, reproducible):
//   Grupo A: triple empate 1-1-1, resuelto por diferencia de sets.
//   Grupo B: un WO.
//   Grupo C: un doble WO (no suma a nadie; el 2º se define por games).
//   C1 (cuartos): un retiro a mitad del 2º set.

import { leerEnvStaging } from './entornoStaging'

const NOMBRE_TORNEO_SIM = 'SIMULACIÓN — Torneo Navidad HGV 2026'
const TORNEO_BASE = 'Torneo Navidad HGV 2026'
const CATEGORIA = 'Doble Femenino Sexta'
const DOMINIO_SIM = '@simulacion.invalid'
const CORREO_JUGADORA_PRUEBA = 'prueba01@staging.local'
const CORREO_ADMIN = 'admin@staging.local'
const SEMILLA = 2026

const ETAPAS = ['grupos-j1', 'grupos-j2', 'grupos-j3', 'cuartos', 'semis', 'final'] as const
type Etapa = (typeof ETAPAS)[number]

// --- Azar reproducible ----------------------------------------------------

function mulberry32(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (texto: string) => [...texto].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const azarPara = (clave: string) => mulberry32(SEMILLA ^ hash(clave))

type Set = { numero: number; games_j1: number; games_j2: number; completo: boolean; tiebreak_retador?: number; tiebreak_retado?: number; es_super_tiebreak?: boolean }

// Un set ganado por j1 (se da vuelta si lo gana j2).
function setGanado(numero: number, rng: () => number, ganaJ1: boolean): Set {
  const opciones: [number, number][] = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6]]
  const [g, p] = opciones[Math.floor(rng() * opciones.length)]
  const set: Set = { numero, games_j1: g, games_j2: p, completo: true }
  if (g === 7 && p === 6) {
    const perdedorTb = Math.floor(rng() * 6)
    set.tiebreak_retador = 7
    set.tiebreak_retado = perdedorTb
  }
  return ganaJ1 ? set : darVuelta(set)
}
function darVuelta(s: Set): Set {
  const r: Set = { ...s, games_j1: s.games_j2, games_j2: s.games_j1 }
  if (s.tiebreak_retador != null) { r.tiebreak_retador = s.tiebreak_retado; r.tiebreak_retado = s.tiebreak_retador }
  return r
}
const fijo = (numero: number, a: number, b: number): Set => ({ numero, games_j1: a, games_j2: b, completo: true })
const stb = (a: number, b: number): Set => ({ numero: 3, games_j1: a, games_j2: b, completo: true, es_super_tiebreak: true })

// Marcador normal con ganador dado: 2-0 (75 %) o 2-1 con Super Tiebreak.
function marcador(rng: () => number, ganaA: boolean): Set[] {
  if (rng() < 0.75) return [setGanado(1, rng, ganaA), setGanado(2, rng, ganaA)]
  const pierdePrimero = rng() < 0.5
  const s1 = setGanado(1, rng, pierdePrimero ? !ganaA : ganaA)
  const s2 = setGanado(2, rng, pierdePrimero ? ganaA : !ganaA)
  const perdedor = Math.floor(rng() * 9)
  return [s1, s2, ganaA ? stb(10, perdedor) : stb(perdedor, 10)]
}

// --- Principal ------------------------------------------------------------

async function main() {
  const [comando, arg] = process.argv.slice(2)
  const vars = leerEnvStaging()            // se niega si no es local
  Object.assign(process.env, vars, { CORREOS_DESACTIVADOS: '1' })
  console.log(`▶ Supabase local: ${vars.NEXT_PUBLIC_SUPABASE_URL}`)

  // Después de fijar el entorno: las libs leen process.env al usarse.
  const { supabaseServer } = await import('../lib/supabaseServer')
  const db = supabaseServer()

  const comandos: Record<string, () => Promise<void>> = {
    preparar: () => preparar(db),
    sortear: () => sortear(db),
    jugar: () => jugar(db, arg as Etapa),
    estado: () => estado(db),
    reset: () => reset(db),
  }
  const fn = comandos[comando]
  if (!fn) {
    console.error('Uso: npm run simular -- preparar | sortear | jugar <grupos-j1|grupos-j2|grupos-j3|cuartos|semis|final> | estado | reset')
    process.exit(1)
  }
  await fn()
}

type Db = ReturnType<typeof import('../lib/supabaseServer')['supabaseServer']>

async function adminId(db: Db): Promise<string> {
  const { data, error } = await db.from('administradores').select('id').eq('email', CORREO_ADMIN).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`No está el admin de prueba (${CORREO_ADMIN}). Corre primero: scripts/staging-db.sh base`)
  return data.id
}

async function torneoSim(db: Db) {
  const { data, error } = await db.from('torneos').select('*').eq('nombre', NOMBRE_TORNEO_SIM).maybeSingle()
  if (error) throw error
  return data
}

// El torneo vigente de la app tiene que ser el de la simulación.
async function vigenteEsSim(db: Db) {
  const { torneoVigente } = await import('../lib/torneoServidor')
  const t = await torneoVigente(db)
  if (!t || t.nombre !== NOMBRE_TORNEO_SIM) throw new Error('El torneo vigente no es el de la simulación. Corre primero: npm run simular -- preparar')
  return t
}

// --- preparar -------------------------------------------------------------

async function preparar(db: Db) {
  if (await torneoSim(db)) throw new Error('La simulación ya está preparada. Para empezar de nuevo: npm run simular -- reset')
  const admin = await adminId(db)
  const { ahora, hoyEnCaracas } = await import('../lib/tiempo')
  const { obtenerTasaVigente, tasaParaCalculo } = await import('../lib/tasaBcv')
  const { montoInscripcionBs } = await import('../lib/torneoInscripcion')
  const { recalcularInscripcion } = await import('../lib/torneoServidor')

  const { data: base, error: errB } = await db.from('torneos').select('*').eq('nombre', TORNEO_BASE).single()
  if (errB) throw new Error(`No está el ${TORNEO_BASE} (datos base). Corre: scripts/staging-db.sh base`)
  const { data: catBase, error: errC } = await db.from('torneo_categorias').select('*').eq('torneo_id', base.id).eq('nombre', CATEGORIA).single()
  if (errC) throw errC

  // 1. Torneo de la simulación (un día antes que el base, así es el vigente).
  const inicio = new Date(`${base.fecha_inicio}T12:00:00Z`)
  inicio.setUTCDate(inicio.getUTCDate() - 1)
  const { data: torneo, error: errT } = await db.from('torneos').insert({
    nombre: NOMBRE_TORNEO_SIM,
    fecha_inicio: inicio.toISOString().slice(0, 10),
    fecha_fin: base.fecha_fin,
    estado: 'inscripcion',
    monto_inscripcion_eur: base.monto_inscripcion_eur,
    solo_socios: base.solo_socios,
    fecha_corte_edad: base.fecha_corte_edad,
  }).select('*').single()
  if (errT) throw errT

  const { id: _id, torneo_id: _t, created_at: _c, ...config } = catBase
  const { data: categoria, error: errCat } = await db.from('torneo_categorias').insert({ ...config, torneo_id: torneo.id }).select('id, nombre').single()
  if (errCat) throw errCat
  console.log(`✔ Torneo "${NOMBRE_TORNEO_SIM}" (${torneo.fecha_inicio} → ${torneo.fecha_fin}) con ${categoria.nombre}`)

  // 2. Jugadoras: Prueba 01 (cuenta de prueba) + Prueba 02..24 (sin correo real ni teléfono).
  const { data: p01, error: errP1 } = await db.from('jugadores').select('id').eq('email', CORREO_JUGADORA_PRUEBA).maybeSingle()
  if (errP1) throw errP1
  if (!p01) throw new Error(`No está la jugadora de prueba (${CORREO_JUGADORA_PRUEBA}). Corre: scripts/staging-db.sh base`)
  const momento = ahora().toISOString()
  const certificada = { categoria_torneo: 'sexta', categoria_torneo_asignada_por: admin, categoria_torneo_asignada_at: momento }
  const { error: errU1 } = await db.from('jugadores').update(certificada).eq('id', p01.id)
  if (errU1) throw errU1

  const nuevas = Array.from({ length: 23 }, (_, i) => {
    const n = String(i + 2).padStart(2, '0')
    return {
      nombre: `Prueba ${n}`,
      telefono: '',
      email: `prueba${n}${DOMINIO_SIM}`,
      pin: crypto.randomUUID(),          // nadie entra con estas cuentas
      categoria: 'sexta',
      genero: 'damas',
      numero_accion: `SIM-${n}`,
      activo: true,
      estado_verificacion: 'verificado',
      email_verificado: true,
      ...certificada,
    }
  })
  const { data: creadas, error: errJ } = await db.from('jugadores').insert(nuevas).select('id, nombre')
  if (errJ) throw errJ
  const jugadoras = [p01.id, ...[...creadas!].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((j) => j.id)]
  console.log(`✔ 24 jugadoras (Prueba 01 es la cuenta de prueba; 02..24 con correo ${DOMINIO_SIM})`)

  // 3. 12 parejas: siembras 1-4 (bombo 1), bombo 2 = parejas 5-8, bombo 3 = parejas 9-12.
  const filas = Array.from({ length: 12 }, (_, k) => ({
    categoria_id: categoria.id,
    jugador1_id: jugadoras[2 * k],
    jugador2_id: jugadoras[2 * k + 1],
    inscrita_por: jugadoras[2 * k],
    siembra: k < 4 ? k + 1 : null,
    bombo: Math.floor(k / 4) + 1,
  }))
  const inscripciones: { id: string }[] = []
  for (const f of filas) {
    const { data, error } = await db.from('torneo_inscripciones').insert(f).select('id').single()
    if (error) throw error
    inscripciones.push(data)
  }
  console.log('✔ 12 parejas inscritas (siembras 1-4 y bombos 1-3)')

  // 4. Pagos validados de cada jugadora a la tasa BCV del euro de hoy, y estado recalculado.
  const hoy = hoyEnCaracas()
  const tasa = await obtenerTasaVigente(db, hoy)
  if (!tasa) throw new Error('No hay tasa BCV de ejemplo para hoy. Corre: scripts/staging-db.sh base')
  const monto = montoInscripcionBs(torneo.monto_inscripcion_eur, tasa.eur)
  for (const [k, ins] of inscripciones.entries()) {
    const { error } = await db.from('pagos').insert([filas[k].jugador1_id, filas[k].jugador2_id].map((jugadorId, j) => ({
      jugador_id: jugadorId,
      temporada_id: null,
      torneo_inscripcion_id: ins.id,
      tipo_pago: 'pago_movil',
      monto,
      fecha: hoy,
      referencia: `SIM-PAGO-${k + 1}-${j + 1}`,
      tasa_bcv_eur: tasaParaCalculo(tasa.eur),
      validado: true,
    })))
    if (error) throw error
    const r = await recalcularInscripcion(db, ins.id)
    if (r.despues !== 'confirmada') {
      throw new Error(`La pareja ${k + 1} quedó ${r.despues}: ${r.pendientes.map((p) => p.tipo).join(', ')}`)
    }
  }
  console.log(`✔ 24 pagos validados (Bs. ${monto} c/u) — las 12 inscripciones quedaron confirmadas`)
  console.log('\nSiguiente: npm run simular -- sortear')
}

// --- sortear --------------------------------------------------------------

async function sortear(db: Db) {
  const admin = await adminId(db)
  const torneo = await vigenteEsSim(db)
  const { armarSorteoCategoria } = await import('../lib/torneoSorteo')
  const { datosParaSorteo, publicarSorteo } = await import('../lib/torneoSorteoServidor')
  const { proponerProgramacion } = await import('../lib/torneoProgramacion')
  const { datosProgramacion, guardarProgramacion, publicarProgramacion } = await import('../lib/torneoProgramacionServidor')
  const { torneoVigente } = await import('../lib/torneoServidor')

  // Sorteo por bombos: lo mismo que la vista previa (armarSorteoCategoria)
  // y la publicación (publicarSorteo) de la app, con azar de semilla fija.
  const categorias = await datosParaSorteo(db, torneo)
  const grupos: Record<string, string[][]> = {}
  for (const c of categorias) {
    const r = armarSorteoCategoria(c, c.inscripciones, 'bombos', azarPara(`sorteo-${c.nombre}`))
    if (!r.ok) throw new Error(r.error)
    grupos[c.id] = r.sorteo.grupos
    const nombre = new Map(c.inscripciones.map((i) => [i.id, i.nombre]))
    r.sorteo.grupos.forEach((g, i) => console.log(`  Grupo ${String.fromCharCode(65 + i)}: ${g.map((id) => nombre.get(id)).join(' · ')}`))
  }
  const pub = await publicarSorteo(db, torneo, 'bombos', grupos, admin)
  if (!pub.ok) throw new Error(pub.error)
  console.log('✔ Sorteo publicado (bombos)')

  // Asistente de programación + guardar (como "Confirmar propuesta"; los
  // avisos se aceptan, los errores no) + publicar la programación.
  const t2 = (await torneoVigente(db))!
  const { ctx, horarios } = await datosProgramacion(db, t2)
  const propuesta = proponerProgramacion(ctx, horarios)
  const asignaciones = [...propuesta.horarios.entries()]
    .filter(([id]) => !horarios.has(id))
    .map(([partidoId, h]) => ({ partidoId, cancha: h.cancha, inicio: new Date(h.inicio).toISOString() }))
  if (!asignaciones.length) throw new Error('El asistente no propuso horarios')
  const g = await guardarProgramacion(db, t2, asignaciones, true, admin)
  if (!g.ok) throw new Error(`${g.error}${g.errores?.length ? `: ${g.errores.join(' · ')}` : ''}`)
  console.log(`✔ Asistente: ${g.guardados} partidos con horario${propuesta.sinHorario.length ? `, ${propuesta.sinHorario.length} sin horario` : ''}${g.avisos.length ? ` (${g.avisos.length} avisos aceptados)` : ''}`)
  const p = await publicarProgramacion(db, (await torneoVigente(db))!, admin)
  if (!p.ok) throw new Error(p.error)
  console.log('✔ Programación publicada')
  console.log('\nSiguiente: npm run simular -- jugar grupos-j1')
}

// --- jugar ----------------------------------------------------------------

async function jugar(db: Db, etapa: Etapa) {
  if (!ETAPAS.includes(etapa)) throw new Error(`Etapa no válida. Usa: ${ETAPAS.join(' | ')}`)
  const admin = await adminId(db)
  const torneo = await vigenteEsSim(db)
  const { listarPartidos, reportarResultado, validarResultado, registrarWO, personasDeInscripciones } = await import('../lib/torneoResultadosServidor')
  const { textoMarcador } = await import('../lib/torneoResultados')

  const todos = await listarPartidos(db, torneo.id)
  const ronda = etapa.startsWith('grupos-') ? Number(etapa.slice(-1)) : null
  const deLaEtapa = todos.filter((p) => (ronda ? p.fase === 'grupo' && p.orden === ronda : p.fase === etapa))
  if (!deLaEtapa.length) throw new Error(`No hay partidos de ${etapa}${torneo.estado === 'inscripcion' ? ' (¿falta sortear?)' : ''}`)

  // Fuerza de cada pareja: su siembra/bombo (menor = mejor).
  const ids = [...new Set(todos.flatMap((p) => [p.inscripcion_a, p.inscripcion_b]).filter(Boolean))] as string[]
  const { data: ins, error } = await db.from('torneo_inscripciones').select('id, siembra, bombo, created_at').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  if (error) throw error
  const orden = [...(ins || [])].sort((a, b) => (a.bombo ?? 9) - (b.bombo ?? 9) || (a.siembra ?? 99) - (b.siembra ?? 99) || a.created_at.localeCompare(b.created_at))
  const fuerza = new Map(orden.map((i, k) => [i.id, k]))
  const personas = await personasDeInscripciones(db, ids)

  for (const p of deLaEtapa) {
    const clave = `${p.fase}-${p.grupo_letra ?? ''}-${p.orden}`
    const etiqueta = p.fase === 'grupo' ? `Grupo ${p.grupo_letra} P${p.orden}` : clave.replace(/^(\w)\w*--/, (_, f) => f.toUpperCase())
    if (p.validado) { console.log(`  · ${etiqueta}: ya jugado (${textoMarcador(p)})`); continue }
    if (!p.inscripcion_a || !p.inscripcion_b) throw new Error(`${etiqueta}: todavía no se conocen los rivales — juega antes la etapa anterior`)

    const a = p.inscripcion_a
    const b = p.inscripcion_b
    const rng = azarPara(clave)
    const aEsMejor = fuerza.get(a)! < fuerza.get(b)!
    const reportante = personas.get(a)![0]
    let r: { ok: boolean; error?: string; avisos?: string[] }

    // Miembros del grupo ordenados por fuerza (0 = la más fuerte).
    const delGrupo = p.grupo_id ? [...new Set(todos.filter((q) => q.grupo_id === p.grupo_id).flatMap((q) => [q.inscripcion_a!, q.inscripcion_b!]))].sort((x, y) => fuerza.get(x)! - fuerza.get(y)!) : []
    const pos = (id: string) => delGrupo.indexOf(id)
    const par = [pos(a), pos(b)].sort().join('-')

    let datos: { sets: Set[]; tipoResultado: 'normal' | 'retiro'; retiradaInscripcionId: string | null } | null = null
    let wo: string | null = null

    if (p.grupo_letra === 'A') {
      // Triple empate 1-1-1: 0 > 1 (2-0), 1 > 2 (con Super Tiebreak), 2 > 0 (2-0) → se resuelve por sets.
      const ganador = par === '0-1' ? delGrupo[0] : par === '1-2' ? delGrupo[1] : delGrupo[2]
      const ganaA = ganador === a
      const sets = par === '0-1' ? [fijo(1, 6, 3), fijo(2, 6, 3)]
        : par === '1-2' ? [fijo(1, 6, 4), fijo(2, 3, 6), stb(10, 7)]
        : [fijo(1, 6, 2), fijo(2, 6, 4)]
      datos = { sets: ganaA ? sets : sets.map(darVuelta), tipoResultado: 'normal', retiradaInscripcionId: null }
    } else if (p.grupo_letra === 'B' && par === '1-2') {
      wo = delGrupo[2]                                   // WO: no se presenta la más débil
    } else if (p.grupo_letra === 'C' && par === '1-2') {
      wo = 'ambos'                                       // doble WO
    } else if (p.grupo_letra === 'C') {
      // La más fuerte gana las dos; con distinto margen, así el 2º se define por games.
      const ganaA = pos(a) === 0
      const sets = par === '0-1' ? [fijo(1, 6, 4), fijo(2, 6, 4)] : [fijo(1, 6, 1), fijo(2, 6, 2)]
      datos = { sets: ganaA ? sets : sets.map(darVuelta), tipoResultado: 'normal', retiradaInscripcionId: null }
    } else if (p.fase === 'cuartos' && p.orden === 1) {
      // Retiro: B gana el 1er set, A va 3-1 en el 2º y B se retira.
      datos = { sets: [fijo(1, 4, 6), { numero: 2, games_j1: 3, games_j2: 1, completo: false }], tipoResultado: 'retiro', retiradaInscripcionId: b }
    } else if (p.fase === 'grupo') {
      datos = { sets: marcador(rng, aEsMejor), tipoResultado: 'normal', retiradaInscripcionId: null }
    } else {
      // Llave: gana la mejor el 70 % de las veces.
      datos = { sets: marcador(rng, rng() < 0.7 ? aEsMejor : !aEsMejor), tipoResultado: 'normal', retiradaInscripcionId: null }
    }

    if (wo) {
      r = await registrarWO(db, { partidoId: p.id, adminId: admin, ausente: wo })
    } else {
      const rep = await reportarResultado(db, { partidoId: p.id, porJugadorId: reportante, datos: datos! })
      if (!rep.ok) throw new Error(`${etiqueta}: ${rep.error}`)
      r = await validarResultado(db, { partidoId: p.id, adminId: admin })
    }
    if (!r.ok) throw new Error(`${etiqueta}: ${r.error}`)

    const final = (await listarPartidos(db, torneo.id)).find((q) => q.id === p.id)!
    const ganador = final.ganador_inscripcion_id === a ? p.nombre_a : final.ganador_inscripcion_id === b ? p.nombre_b : 'nadie'
    console.log(`  ✔ ${etiqueta}: ${p.nombre_a} vs ${p.nombre_b} → ${textoMarcador(final)} · gana ${ganador}`)
    for (const aviso of r.avisos ?? []) console.log(`    ⚠️  ${aviso}`)
  }

  await estado(db)
  const siguiente = ETAPAS[ETAPAS.indexOf(etapa) + 1]
  console.log(siguiente ? `\nSiguiente: npm run simular -- jugar ${siguiente}` : '\n🏆 Torneo simulado completo.')
}

// --- estado ---------------------------------------------------------------

async function estado(db: Db) {
  const torneo = await torneoSim(db)
  if (!torneo) { console.log('No hay simulación. Empieza con: npm run simular -- preparar'); return }
  const { listarPartidos } = await import('../lib/torneoResultadosServidor')
  const { ordenarGrupo } = await import('../lib/torneo')
  const { textoMarcador } = await import('../lib/torneoResultados')
  console.log(`\n=== ${torneo.nombre} · estado: ${torneo.estado} ===`)
  const partidos = await listarPartidos(db, torneo.id)
  if (!partidos.length) { console.log('(sin sorteo todavía)'); return }

  const { data: grupos, error } = await db
    .from('torneo_grupos')
    .select('id, letra, torneo_grupo_miembros(inscripcion_id, desempate_manual)')
    .in('id', [...new Set(partidos.map((p) => p.grupo_id).filter(Boolean))] as string[])
    .order('letra')
  if (error) throw error
  const nombre = new Map(partidos.flatMap((p) => [[p.inscripcion_a, p.nombre_a], [p.inscripcion_b, p.nombre_b]]).filter(([id]) => id) as [string, string][])
  for (const g of grupos || []) {
    const delGrupo = partidos.filter((p) => p.grupo_id === g.id)
    const completo = delGrupo.every((p) => p.validado)
    const tabla = ordenarGrupo(delGrupo, g.torneo_grupo_miembros as any)
    console.log(`Grupo ${g.letra}${completo ? ' (cerrado)' : ''}: ${tabla.map((f) => `${f.posicion}º ${nombre.get(f.inscripcion_id)} (PG ${f.pg}, sets ${f.sets_favor}-${f.sets_contra}, games ${f.games_favor}-${f.games_contra})${completo && f.requiere_sorteo ? ' ⚠️ empate sin resolver' : ''}`).join(' | ')}`)
  }
  const llave = partidos.filter((p) => p.fase !== 'grupo')
  for (const p of llave) {
    const codigo = `${p.fase === 'cuartos' ? 'C' : p.fase === 'semis' ? 'S' : 'F'}${p.orden}`
    console.log(`${codigo}: ${p.nombre_a ?? p.origen_a} vs ${p.nombre_b ?? p.origen_b}${p.validado ? ` → ${textoMarcador(p)}` : ''}`)
  }
}

// --- reset ----------------------------------------------------------------

async function reset(db: Db) {
  const torneo = await torneoSim(db)
  const { data: jugadoras, error: errJ } = await db.from('jugadores').select('id').like('email', `%${DOMINIO_SIM}`)
  if (errJ) throw errJ
  const { data: p01 } = await db.from('jugadores').select('id').eq('email', CORREO_JUGADORA_PRUEBA).maybeSingle()
  const idsJugadoras = (jugadoras || []).map((j) => j.id)

  if (torneo) {
    const { data: categorias } = await db.from('torneo_categorias').select('id').eq('torneo_id', torneo.id)
    const catIds = (categorias || []).map((c) => c.id)
    const sin = ['00000000-0000-0000-0000-000000000000']
    const { data: partidos } = await db.from('torneo_partidos').select('bloqueo_id').in('categoria_id', catIds.length ? catIds : sin)
    const { data: inscripciones } = await db.from('torneo_inscripciones').select('id').in('categoria_id', catIds.length ? catIds : sin)
    const insIds = (inscripciones || []).map((i) => i.id)
    const bloqueos = (partidos || []).map((p) => p.bloqueo_id).filter(Boolean) as string[]

    const borrar = async (tabla: string, q: any) => { const { error, count } = await q; if (error) throw new Error(`${tabla}: ${error.message}`); return count ?? 0 }
    const nPagos = insIds.length ? await borrar('pagos', db.from('pagos').delete({ count: 'exact' }).in('torneo_inscripcion_id', insIds)) : 0
    // Borra el torneo: en cascada sus categorías, inscripciones, grupos y partidos.
    await borrar('torneos', db.from('torneos').delete().eq('id', torneo.id))
    const nBloq = bloqueos.length ? await borrar('bloqueos_cancha', db.from('bloqueos_cancha').delete({ count: 'exact' }).in('id', bloqueos)) : 0
    console.log(`✔ Torneo de simulación borrado (con sus partidos), ${nPagos} pagos y ${nBloq} bloqueos de cancha`)
  }

  // Avisos del torneo de las jugadoras de la simulación (y de Prueba 01).
  const avisadas = [...idsJugadoras, ...(p01 ? [p01.id] : [])]
  if (avisadas.length) {
    const { error, count } = await db.from('notificaciones').delete({ count: 'exact' }).in('jugador_id', avisadas).like('tipo', 'torneo_%')
    if (error) throw error
    console.log(`✔ ${count ?? 0} notificaciones del torneo borradas`)
  }
  if (idsJugadoras.length) {
    const { error } = await db.from('jugadores').delete().in('id', idsJugadoras)
    if (error) throw error
    console.log(`✔ ${idsJugadoras.length} jugadoras de la simulación borradas (Prueba 01 se mantiene)`)
  }
  if (!torneo && !idsJugadoras.length) console.log('No había nada de la simulación.')
}

main().catch((err) => {
  console.error(`✖ ${err.message}`)
  process.exit(1)
})
