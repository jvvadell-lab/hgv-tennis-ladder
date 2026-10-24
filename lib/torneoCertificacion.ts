import { NIVELES, type Nivel } from './torneo'

// Certificación masiva de la categoría oficial de torneo (categoria_torneo)
// para los jugadores que están en la escalera: toma la categoría con la que
// juegan en ella (jugadores.categoria). El resto sigue con el flujo de uno
// en uno (categoría provisional hasta que el admin la valide).

export type TemporadaConEscalera = { id: string; nombre: string; fecha_inicio: string; jugadores: number }

// Temporada propuesta por defecto: la que tiene más jugadores en
// ladder_posiciones y, a igualdad, la más reciente. No vale "la más reciente"
// a secas: una temporada recién creada (o la de la Copa Navidad) puede tener
// solo un puñado de filas mientras la escalera real es la anterior.
export function temporadaPorDefecto(temporadas: TemporadaConEscalera[]): TemporadaConEscalera | null {
  const con = temporadas.filter((t) => t.jugadores > 0)
  if (con.length === 0) return null
  return [...con].sort((a, b) => b.jugadores - a.jugadores || b.fecha_inicio.localeCompare(a.fecha_inicio))[0]
}

export type JugadorEnEscalera = {
  id: string
  nombre: string
  genero: string
  categoria: string
  categoria_torneo: string | null
  activo: boolean | null
}

export type PlanCertificacion = {
  // A los que se les asigna categoria_torneo = categoria.
  certificar: (JugadorEnEscalera & { categoria: Nivel })[]
  // Ya tenían categoría oficial: no se tocan.
  yaCertificados: number
  // Inactivos: no se tocan.
  inactivos: number
  // Categoría de escalera que no es un nivel de torneo: se excluyen y se avisa.
  categoriaInvalida: JugadorEnEscalera[]
}

export function planCertificacion(jugadores: JugadorEnEscalera[]): PlanCertificacion {
  const plan: PlanCertificacion = { certificar: [], yaCertificados: 0, inactivos: 0, categoriaInvalida: [] }
  const vistos = new Set<string>()
  for (const j of jugadores) {
    if (vistos.has(j.id)) continue
    vistos.add(j.id)
    if (j.activo === false) plan.inactivos++
    else if (j.categoria_torneo) plan.yaCertificados++
    else if (!(NIVELES as readonly string[]).includes(j.categoria)) plan.categoriaInvalida.push(j)
    else plan.certificar.push(j as JugadorEnEscalera & { categoria: Nivel })
  }
  plan.certificar.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return plan
}

export type GrupoCertificacion = { categoria: Nivel; genero: string; jugadores: { id: string; nombre: string }[] }

// Agrupa por categoría (en el orden de NIVELES) y género, para la vista previa.
export function agruparPorCategoriaYGenero(certificar: PlanCertificacion['certificar']): GrupoCertificacion[] {
  const grupos = new Map<string, GrupoCertificacion>()
  for (const j of certificar) {
    const clave = `${j.categoria}|${j.genero}`
    if (!grupos.has(clave)) grupos.set(clave, { categoria: j.categoria, genero: j.genero, jugadores: [] })
    grupos.get(clave)!.jugadores.push({ id: j.id, nombre: j.nombre })
  }
  return [...grupos.values()].sort(
    (a, b) => NIVELES.indexOf(a.categoria) - NIVELES.indexOf(b.categoria) || a.genero.localeCompare(b.genero)
  )
}
