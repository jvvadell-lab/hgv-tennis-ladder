export async function calcularTrayectoria(db: any, jugadorId: string) {
  const { data: retos } = await db
    .from('retos')
    .select(`
      id, temporada_id, retador_id, retado_id, fecha_propuesta,
      temporadas:temporada_id(nombre),
      retador:retador_id(nombre),
      retado:retado_id(nombre)
    `)
    .or(`retador_id.eq.${jugadorId},retado_id.eq.${jugadorId}`)

  const retoIds = (retos || []).map((r: any) => r.id)
  const retosMap: Record<string, any> = {}
  ;(retos || []).forEach((r: any) => { retosMap[r.id] = r })

  let jugados = 0
  let ganados = 0
  let perdidos = 0
  let noPresentado = 0
  const partidosGanadosDetalle: any[] = []

  if (retoIds.length > 0) {
    const { data: resultados } = await db
      .from('resultados')
      .select('reto_id, ganador_id, no_presentado, marcador_retador, marcador_retado')
      .in('reto_id', retoIds)
      .eq('validado', true)

    ;(resultados || []).forEach((res: any) => {
      const reto = retosMap[res.reto_id]
      if (!reto) return
      const esRetador = reto.retador_id === jugadorId
      const oponente = esRetador ? reto.retado?.nombre : reto.retador?.nombre

      if (res.no_presentado) {
        if (res.ganador_id === jugadorId) {
          jugados += 1
          ganados += 1
          partidosGanadosDetalle.push({
            oponente,
            temporada: reto.temporadas?.nombre,
            fecha: reto.fecha_propuesta,
            marcador: 'W.O. (rival no se presentó)',
          })
        } else {
          noPresentado += 1
        }
      } else {
        jugados += 1
        if (res.ganador_id === jugadorId) {
          ganados += 1
          const miMarcador = esRetador ? res.marcador_retador : res.marcador_retado
          const suMarcador = esRetador ? res.marcador_retado : res.marcador_retador
          partidosGanadosDetalle.push({
            oponente,
            temporada: reto.temporadas?.nombre,
            fecha: reto.fecha_propuesta,
            marcador: `${miMarcador} — ${suMarcador}`,
          })
        } else {
          perdidos += 1
        }
      }
    })
  }

  partidosGanadosDetalle.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

  const { data: posiciones } = await db
    .from('ladder_posiciones')
    .select('temporada_id, categoria, genero, posicion, posicion_inicial, temporadas:temporada_id(nombre, fecha_inicio, fecha_fin)')
    .eq('jugador_id', jugadorId)

  const temporadasAnotado = new Set((posiciones || []).map((p: any) => p.temporada_id))
  const mejorPosicion = (posiciones || []).reduce(
    (min: number | null, p: any) => (min === null || p.posicion < min ? p.posicion : min),
    null
  )

  const temporadasDetalle = (posiciones || [])
    .map((p: any) => ({
      nombre: p.temporadas?.nombre,
      fechaInicio: p.temporadas?.fecha_inicio,
      fechaFin: p.temporadas?.fecha_fin,
      categoria: p.categoria,
      genero: p.genero,
      posicion: p.posicion,
      posicionInicial: p.posicion_inicial,
    }))
    .sort((a: any, b: any) => (a.fechaInicio < b.fechaInicio ? 1 : -1))

  return {
    jugados,
    ganados,
    perdidos,
    noPresentado,
    porcentajeVictorias: jugados > 0 ? Math.round((ganados / jugados) * 100) : 0,
    temporadas: temporadasAnotado.size,
    mejorPosicion,
    temporadasDetalle,
    partidosGanadosDetalle,
  }
}
