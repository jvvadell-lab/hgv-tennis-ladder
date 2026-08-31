// Lógica de marcador de partidos — compartida entre el formulario del jugador
// (app/ladder/page.tsx) y el ingreso directo del admin (app/admin/page.tsx).
// Antes vivía duplicada casi al carácter en los dos archivos (evaluarSet /
// evaluarSetDirecto, calcularResultadoPartido / calcularResultadoDirecto) —
// se consolida aquí sin cambiar el comportamiento.
//
// Modelo de partido de este club: hasta 2 sets normales + un Super Tiebreak
// como desempate si quedan 1-1 en sets (nunca un 3er set completo). Un set
// que llega a 6-6 se define con su propio tie-break (formato "7-6(7-4)").

export type CampoSet = {
  golesRetador: string
  golesRetado: string
  tbRetador?: string
  tbRetado?: string
}

// Evalúa un set individual: si quedó 6-6, hace falta su propio tie-break
// (distinto del Super Tiebreak que decide el PARTIDO cuando queda 1 set a
// 1). Devuelve si el set ya está completo/válido y quién lo ganó.
export function evaluarSet(c: CampoSet): { completo: boolean; ganadorEsRetador: boolean | null } {
  const gr = parseInt(c.golesRetador, 10)
  const gd = parseInt(c.golesRetado, 10)
  if (isNaN(gr) || isNaN(gd)) return { completo: false, ganadorEsRetador: null }
  if (gr === 6 && gd === 6) {
    const tbr = parseInt(c.tbRetador || '', 10)
    const tbd = parseInt(c.tbRetado || '', 10)
    if (isNaN(tbr) || isNaN(tbd) || tbr === tbd) return { completo: false, ganadorEsRetador: null }
    return { completo: true, ganadorEsRetador: tbr > tbd }
  }
  if (gr === gd) return { completo: false, ganadorEsRetador: null }
  return { completo: true, ganadorEsRetador: gr > gd }
}

// Da vuelta un texto de marcador de set ("7-6(7-4)" -> "6-7(4-7)", "6-3" ->
// "3-6") para mostrárselo al retado desde su propia perspectiva.
export function invertirMarcadorSet(texto: string): string {
  const match = texto.match(/^(\d+)-(\d+)(\((\d+)-(\d+)\))?$/)
  if (!match) return texto
  const [, a, b, , tba, tbb] = match
  return tba ? `${b}-${a}(${tbb}-${tba})` : `${b}-${a}`
}

function textoDesdeCampoSet(c: CampoSet, ganadorEsRetador: boolean): string {
  const gr = parseInt(c.golesRetador, 10)
  const gd = parseInt(c.golesRetado, 10)
  if (gr === 6 && gd === 6) {
    const tbr = parseInt(c.tbRetador || '', 10)
    const tbd = parseInt(c.tbRetado || '', 10)
    return ganadorEsRetador ? `7-6(${tbr}-${tbd})` : `6-7(${tbd}-${tbr})`
  }
  return `${gr}-${gd}`
}

// Calcula sets ganados por cada lado (con soporte de tie-break de set a 6-6),
// si hace falta Super Tiebreak (partido 1-1 en sets), y quién ganó el partido.
export function calcularResultadoPartido(
  set1: CampoSet, set2: CampoSet, st: CampoSet
):
  | { valido: true; ganadorEsRetador: boolean; marcadorRetador: string; marcadorRetado: string }
  | { valido: false } {
  const e1 = evaluarSet(set1)
  const e2 = evaluarSet(set2)
  if (!e1.completo || !e2.completo) return { valido: false }

  const t1 = textoDesdeCampoSet(set1, !!e1.ganadorEsRetador)
  const t2 = textoDesdeCampoSet(set2, !!e2.ganadorEsRetador)
  const setsRetador = (e1.ganadorEsRetador ? 1 : 0) + (e2.ganadorEsRetador ? 1 : 0)

  if (setsRetador !== 1) {
    return {
      valido: true,
      ganadorEsRetador: setsRetador === 2,
      marcadorRetador: `${t1}, ${t2}`,
      marcadorRetado: `${invertirMarcadorSet(t1)}, ${invertirMarcadorSet(t2)}`,
    }
  }

  const eSt = evaluarSet(st)
  if (!eSt.completo) return { valido: false }
  const tbr = parseInt(st.golesRetador, 10)
  const tbd = parseInt(st.golesRetado, 10)
  return {
    valido: true,
    ganadorEsRetador: !!eSt.ganadorEsRetador,
    marcadorRetador: `${t1}, ${t2}, ST ${tbr}-${tbd}`,
    marcadorRetado: `${invertirMarcadorSet(t1)}, ${invertirMarcadorSet(t2)}, ST ${tbd}-${tbr}`,
  }
}
