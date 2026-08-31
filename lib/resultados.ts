// Lógica de marcador de partidos — compartida entre el formulario del jugador
// (app/ladder/page.tsx), el ingreso directo del admin (app/admin/page.tsx) y
// los endpoints server-side que validan y guardan el resultado. Antes esta
// lógica vivía duplicada casi al carácter en ladder y admin (evaluarSet /
// evaluarSetDirecto, calcularResultadoPartido / calcularResultadoDirecto) —
// se consolida aquí en funciones puras (sin llamadas a Supabase) para poder
// importarlas tanto en cliente como en servidor.
//
// Modelo de partido de este club: hasta 2 sets normales + un Super Tiebreak
// como desempate si quedan 1-1 en sets (nunca un 3er set completo). Un set
// que llega a 6-6 se define con su propio tie-break (formato "7-6(7-4)").
// Un tie-break de set se juega a 7 puntos y el Super Tiebreak a 10 — ambos
// exigen ganar por al menos 2 (7-5 válido, 7-6 no; si se empata en el
// mínimo-1 sigue a mínimo+1, mínimo+2... con margen 2, ej. 8-6, 9-7).
//
// "j1"/"j2" en el JSON de `sets` corresponde siempre a retador/retado, en
// ese orden — no hay concepto de "jugador1/jugador2" en el dominio.

export type SetJugado = {
  numero: number
  games_j1: number
  games_j2: number
  completo: boolean
  tiebreak_retador?: number
  tiebreak_retado?: number
  es_super_tiebreak?: boolean
}

export type TipoResultado = 'normal' | 'retiro'

export type CampoSet = {
  golesRetador: string
  golesRetado: string
  tbRetador?: string
  tbRetado?: string
}

// Un tie-break (de set, a 7, o el Super Tiebreak, a 10) se gana llegando al
// mínimo con al menos 2 puntos de ventaja. Si se llega al mínimo sin esa
// ventaja, sigue punto a punto — a partir de ahí el margen final siempre es
// exactamente 2 (7-5 válido; 7-6 no; empatado en 6-6 sigue a 8-6, 9-7...).
function margenTiebreakValido(minimo: number, ganador: number, perdedor: number): boolean {
  if (ganador < minimo) return false
  if (ganador === minimo) return perdedor <= minimo - 2
  return perdedor === ganador - 2
}

// Evalúa un set a partir de los inputs de texto del formulario: si llega a
// 6-6 hace falta su propio tie-break (a 7, con margen de 2) para estar
// completo; cualquier otro marcador con números distintos ya está completo.
// Con esSuperTiebreak=true, evalúa en cambio el Super Tiebreak (a 10, mismo
// margen) — se usa así para el campo `st` de construirSets.
export function evaluarSet(c: CampoSet, esSuperTiebreak = false): { completo: boolean; ganadorEsRetador: boolean | null } {
  const gr = parseInt(c.golesRetador, 10)
  const gd = parseInt(c.golesRetado, 10)
  if (isNaN(gr) || isNaN(gd)) return { completo: false, ganadorEsRetador: null }

  if (esSuperTiebreak) {
    if (gr === gd) return { completo: false, ganadorEsRetador: null }
    if (!margenTiebreakValido(10, Math.max(gr, gd), Math.min(gr, gd))) return { completo: false, ganadorEsRetador: null }
    return { completo: true, ganadorEsRetador: gr > gd }
  }

  if (gr === 6 && gd === 6) {
    const tbr = parseInt(c.tbRetador || '', 10)
    const tbd = parseInt(c.tbRetado || '', 10)
    if (isNaN(tbr) || isNaN(tbd) || tbr === tbd) return { completo: false, ganadorEsRetador: null }
    if (!margenTiebreakValido(7, Math.max(tbr, tbd), Math.min(tbr, tbd))) return { completo: false, ganadorEsRetador: null }
    return { completo: true, ganadorEsRetador: tbr > tbd }
  }

  if (gr === gd) return { completo: false, ganadorEsRetador: null }
  return { completo: true, ganadorEsRetador: gr > gd }
}

// Convierte un campo de set en la fila que se guarda en `sets` (JSONB).
// Devuelve null si el set no tiene ningún número cargado (para omitirlo).
//
// Si el set se decidió por tie-break con margen válido, games_j1/games_j2
// guardan el marcador del SET ("7-6"/"6-7"), no los games crudos — igual
// que se muestra siempre en el marcador — y tiebreak_retador/tiebreak_retado
// llevan el detalle del tie-break aparte. Si en cambio se cargó un
// tie-break que NO llegó a un final válido (retiro a mitad del propio
// tie-break), el set se guarda honesto como 6-6 sin decidir —
// tiebreak_retador/tiebreak_retado quedan igual, para que el marcador
// pueda mostrar algo como "6-6(3-2) RET" en vez de un "7-6" contradictorio.
export function filaDesdeCampoSet(numero: number, c: CampoSet, esSuperTiebreak = false): SetJugado | null {
  const gr = parseInt(c.golesRetador, 10)
  const gd = parseInt(c.golesRetado, 10)
  if (isNaN(gr) && isNaN(gd)) return null

  if (!esSuperTiebreak && gr === 6 && gd === 6) {
    const tbr = parseInt(c.tbRetador || '', 10)
    const tbd = parseInt(c.tbRetado || '', 10)
    if (isNaN(tbr) || isNaN(tbd) || tbr === tbd) {
      // Nada cargado, o empatados — set incompleto tal cual, sin tie-break que mostrar.
      return { numero, games_j1: 6, games_j2: 6, completo: false }
    }
    if (margenTiebreakValido(7, Math.max(tbr, tbd), Math.min(tbr, tbd))) {
      const retadorGanaTb = tbr > tbd
      return {
        numero,
        games_j1: retadorGanaTb ? 7 : 6,
        games_j2: retadorGanaTb ? 6 : 7,
        completo: true,
        tiebreak_retador: tbr,
        tiebreak_retado: tbd,
      }
    }
    // Tie-break cargado pero sin margen válido todavía — retiro a mitad de
    // ESE tie-break. El set se queda 6-6 (no decidido); se guarda el
    // tie-break parcial solo para mostrarlo, no como resultado.
    return { numero, games_j1: 6, games_j2: 6, completo: false, tiebreak_retador: tbr, tiebreak_retado: tbd }
  }

  const fila: SetJugado = {
    numero,
    games_j1: isNaN(gr) ? 0 : gr,
    games_j2: isNaN(gd) ? 0 : gd,
    completo: evaluarSet(c, esSuperTiebreak).completo,
  }
  if (esSuperTiebreak) fila.es_super_tiebreak = true
  return fila
}

// Determina si un set (ya en formato `sets`) realmente se terminó de jugar
// — a diferencia de evaluarSet (que solo exige números distintos, para no
// tocar la validación del flujo normal ya existente), esta es la regla real
// de tenis que se usa para decidir el `completo` de un retiro (y, en
// validarSets, para exigir un marcador de set real): un set con games 6-x≤4
// o 7-5, un set 7-6/6-7 cuyo tie-break tiene margen válido, o un Super
// Tiebreak con margen válido a 10.
function setRealmenteTerminado(fila: SetJugado): boolean {
  if (fila.es_super_tiebreak) {
    if (fila.games_j1 === fila.games_j2) return false
    return margenTiebreakValido(10, Math.max(fila.games_j1, fila.games_j2), Math.min(fila.games_j1, fila.games_j2))
  }
  const a = fila.games_j1
  const b = fila.games_j2
  if (a === 6 && b === 6) return false
  if ((a === 6 && b <= 4) || (b === 6 && a <= 4)) return true
  if ((a === 7 && b === 5) || (b === 7 && a === 5)) return true
  if ((a === 7 && b === 6) || (b === 7 && a === 6)) {
    if (fila.tiebreak_retador == null || fila.tiebreak_retado == null) return false
    return margenTiebreakValido(7, Math.max(fila.tiebreak_retador, fila.tiebreak_retado), Math.min(fila.tiebreak_retador, fila.tiebreak_retado))
  }
  return false
}

// Arma el array `sets` a partir de los 3 campos fijos del formulario (set1,
// set2, Super Tiebreak) y si hubo retiro. Sin retiro, el comportamiento es
// exactamente el de siempre: exige los 2 sets completos (y el Super Tiebreak
// si hace falta). Con retiro, se congela lo realmente jugado — el primer
// set (o el Super Tiebreak) que no llegó a completarse queda como último
// elemento del array, marcado `completo:false`.
export function construirSets(args: {
  set1: CampoSet
  set2: CampoSet
  st: CampoSet
  retiro: boolean
}): { sets: SetJugado[] } | { error: string } {
  const fila1 = filaDesdeCampoSet(1, args.set1)
  if (!fila1) return { error: 'Ingresa al menos el resultado del set 1.' }
  const e1 = evaluarSet(args.set1)

  if (!args.retiro) {
    const e2 = evaluarSet(args.set2)
    if (!e1.completo || !e2.completo) {
      return { error: 'Completa los 2 sets (y los tie-breaks que hagan falta) con marcadores válidos' }
    }
    const fila2 = filaDesdeCampoSet(2, args.set2)!
    const setsRetador = (e1.ganadorEsRetador ? 1 : 0) + (e2.ganadorEsRetador ? 1 : 0)
    if (setsRetador !== 1) return { sets: [fila1, fila2] }

    const eSt = evaluarSet(args.st, true)
    if (!eSt.completo) return { error: 'El partido quedó 1 set a 1 — completa el Super Tiebreak para desempatar' }
    const filaSt = filaDesdeCampoSet(3, args.st, true)!
    return { sets: [fila1, fila2, filaSt] }
  }

  if (!setRealmenteTerminado(fila1)) return { sets: [{ ...fila1, completo: false }] }
  const fila1Ok = { ...fila1, completo: true }

  const fila2 = filaDesdeCampoSet(2, args.set2)
  if (!fila2) return { sets: [fila1Ok] } // se retiró justo al terminar el set 1
  if (!setRealmenteTerminado(fila2)) return { sets: [fila1Ok, { ...fila2, completo: false }] }
  const fila2Ok = { ...fila2, completo: true }

  const setsRetador = (fila1Ok.games_j1 > fila1Ok.games_j2 ? 1 : 0) + (fila2Ok.games_j1 > fila2Ok.games_j2 ? 1 : 0)
  if (setsRetador !== 1) return { sets: [fila1Ok, fila2Ok] } // ya estaba 2-0 cuando se retiró

  const filaSt = filaDesdeCampoSet(3, args.st, true)
  if (!filaSt) return { sets: [fila1Ok, fila2Ok] } // se retiró antes de empezar el Super Tiebreak
  return { sets: [fila1Ok, fila2Ok, { ...filaSt, completo: setRealmenteTerminado(filaSt) }] }
}

// Da vuelta un texto de marcador de set ("7-6(7-4)" -> "6-7(4-7)", "6-3" ->
// "3-6") para mostrárselo al retado desde su propia perspectiva.
export function invertirMarcadorSet(texto: string): string {
  const match = texto.match(/^(\d+)-(\d+)(\((\d+)-(\d+)\))?$/)
  if (!match) return texto
  const [, a, b, , tba, tbb] = match
  return tba ? `${b}-${a}(${tbb}-${tba})` : `${b}-${a}`
}

function textoRetadorDesdeFila(fila: SetJugado): string {
  if (fila.tiebreak_retador != null && fila.tiebreak_retado != null) {
    if (fila.games_j1 === fila.games_j2) {
      // Tie-break interrumpido por retiro, sin definirse — no hay "ganador
      // del set" que priorizar, se muestra desde la perspectiva del retador.
      return `${fila.games_j1}-${fila.games_j2}(${fila.tiebreak_retador}-${fila.tiebreak_retado})`
    }
    return fila.games_j1 > fila.games_j2
      ? `${fila.games_j1}-${fila.games_j2}(${fila.tiebreak_retador}-${fila.tiebreak_retado})`
      : `${fila.games_j1}-${fila.games_j2}(${fila.tiebreak_retado}-${fila.tiebreak_retador})`
  }
  return `${fila.games_j1}-${fila.games_j2}`
}

// Genera marcador_retador / marcador_retado a partir de `sets` — nunca se
// escriben a mano. Agrega " RET" al final si el resultado fue por retiro.
export function generarMarcadores(sets: SetJugado[], tipoResultado: TipoResultado): { marcadorRetador: string; marcadorRetado: string } {
  const partesRetador: string[] = []
  const partesRetado: string[] = []
  for (const fila of sets) {
    if (fila.es_super_tiebreak) {
      partesRetador.push(`ST ${fila.games_j1}-${fila.games_j2}`)
      partesRetado.push(`ST ${fila.games_j2}-${fila.games_j1}`)
    } else {
      const textoRetador = textoRetadorDesdeFila(fila)
      partesRetador.push(textoRetador)
      partesRetado.push(invertirMarcadorSet(textoRetador))
    }
  }
  const sufijo = tipoResultado === 'retiro' ? ' RET' : ''
  return {
    marcadorRetador: partesRetador.join(', ') + sufijo,
    marcadorRetado: partesRetado.join(', ') + sufijo,
  }
}

// Ganador para un resultado NORMAL (para retiro, el ganador es siempre el
// jugador que no se retiró — no se calcula a partir de los sets).
export function calcularGanador(sets: SetJugado[], retadorId: string, retadoId: string): string | null {
  const ultima = sets[sets.length - 1]
  if (ultima?.es_super_tiebreak) {
    if (ultima.games_j1 === ultima.games_j2) return null
    return ultima.games_j1 > ultima.games_j2 ? retadorId : retadoId
  }
  let setsRetador = 0
  let setsRetado = 0
  for (const fila of sets) {
    if (fila.games_j1 > fila.games_j2) setsRetador++
    else if (fila.games_j2 > fila.games_j1) setsRetado++
  }
  if (setsRetador === setsRetado) return null
  return setsRetador > setsRetado ? retadorId : retadoId
}

// Validación server-side de `sets` — independiente de construirSets, porque
// el servidor no puede confiar en que el array haya salido de ese builder.
export function validarSets(sets: unknown, tipoResultado: TipoResultado): string | null {
  if (!Array.isArray(sets) || sets.length === 0) return 'Falta el marcador (sets)'
  if (tipoResultado === 'normal' && sets.length < 2) return 'Un resultado normal necesita al menos 2 sets'

  for (let i = 0; i < sets.length; i++) {
    const s: any = sets[i]
    if (typeof s !== 'object' || s === null) return 'Set inválido'
    if (
      typeof s.games_j1 !== 'number' || typeof s.games_j2 !== 'number' ||
      !Number.isInteger(s.games_j1) || !Number.isInteger(s.games_j2) ||
      s.games_j1 < 0 || s.games_j2 < 0
    ) {
      return 'Los games de cada set deben ser números enteros ≥ 0'
    }
    if (typeof s.completo !== 'boolean') return 'Falta indicar si el set está completo'
    if (!s.completo && i !== sets.length - 1) return 'Solo el último set puede estar incompleto'
    if (tipoResultado === 'normal' && !s.completo) return 'Un resultado normal no puede tener sets incompletos'
    if (s.es_super_tiebreak && i !== sets.length - 1) return 'El Super Tiebreak solo puede ser el último elemento'

    if (s.tiebreak_retador != null || s.tiebreak_retado != null) {
      if (s.es_super_tiebreak) return 'El Super Tiebreak no lleva tiebreak_retador/tiebreak_retado'
      if (typeof s.tiebreak_retador !== 'number' || typeof s.tiebreak_retado !== 'number') {
        return 'tiebreak_retador y tiebreak_retado deben venir juntos'
      }
      const formaValida =
        (s.games_j1 === 7 && s.games_j2 === 6) || (s.games_j1 === 6 && s.games_j2 === 7) ||
        (s.games_j1 === 6 && s.games_j2 === 6)
      if (!formaValida) {
        return 'tiebreak_retador/tiebreak_retado solo aplican a un set 7-6, 6-7, o 6-6 (tie-break sin terminar)'
      }
      // El margen de 2 puntos solo es exigible cuando el set quedó DECIDIDO
      // por el tie-break (7-6/6-7) — un 6-6 con tie-break interrumpido
      // (retiro a mitad de ESE tie-break) puede tener cualquier marcador
      // parcial, es justo lo que congela el retiro.
      if (s.games_j1 !== s.games_j2) {
        const ganadorTb = Math.max(s.tiebreak_retador, s.tiebreak_retado)
        const perdedorTb = Math.min(s.tiebreak_retador, s.tiebreak_retado)
        if (!margenTiebreakValido(7, ganadorTb, perdedorTb)) {
          return 'El tie-break del set debe ganarse por al menos 2 puntos, llegando mínimo a 7'
        }
      }
    }

    // "Marcador de set real": exigible solo cuando el set se declara
    // completo — el último set de un retiro puede quedar con cualquier
    // marcador parcial (incluido un tie-break interrumpido).
    if (s.completo && !setRealmenteTerminado(s as SetJugado)) {
      return s.es_super_tiebreak
        ? 'El Super Tiebreak debe ganarse por al menos 2 puntos, llegando mínimo a 10'
        : 'Ese no es un marcador de set válido'
    }
  }
  return null
}
