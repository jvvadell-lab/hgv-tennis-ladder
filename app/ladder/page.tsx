'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Session = {
  role: 'admin' | 'jugador'
  id: string
  nombre: string
  categoria?: string
  genero?: string
} | null

type Posicion = {
  id: string
  jugador_id: string
  posicion: number
  posicion_inicial: number | null
  categoria: string
  genero: string
  jugadores: { nombre: string } | null
}

type Reto = {
  id: string
  retador_id: string
  retado_id: string
  estado: string
  created_at: string
  fecha_propuesta: string | null
  cancha: string | null
  nombre_cancha_foranea: string | null
  comentarios: string | null
  resultado_anticipado_autorizado: boolean
  retador?: { nombre: string } | null
  retado?: { nombre: string } | null
}

type ProximoPartido = {
  id: string
  fecha_propuesta: string
  cancha: string
  nombre_cancha_foranea: string | null
  retador: { nombre: string; categoria: string; genero: string } | null
  retado: { nombre: string } | null
}

const CATEGORIAS = [
  { value: 'sexta_novatos', label: 'Sexta Novato' },
  { value: 'sexta', label: 'Sexta' },
  { value: 'quinta', label: 'Quinta' },
  { value: 'cuarta', label: 'Cuarta' },
]
const GENEROS = [
  { value: 'caballeros', label: 'Caballeros' },
  { value: 'damas', label: 'Damas' },
]
const RANGO_RETO = 3 // puedes retar hasta 3 posiciones arriba de ti

export default function LadderPage() {
  const [session, setSession] = useState<Session>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const [temporadaId, setTemporadaId] = useState<string | null>(null)
  const [temporadaNombre, setTemporadaNombre] = useState<string>('')
  const [temporadaLimite, setTemporadaLimite] = useState<string | null>(null)
  const [temporadaInicio, setTemporadaInicio] = useState<string | null>(null)
  const [temporadaFin, setTemporadaFin] = useState<string | null>(null)
  const [temporadaSorteada, setTemporadaSorteada] = useState(false)

  const [categoria, setCategoria] = useState(CATEGORIAS[0].value)
  const [genero, setGenero] = useState(GENEROS[0].value)

  const [posiciones, setPosiciones] = useState<Posicion[]>([])
  const [misRetos, setMisRetos] = useState<Reto[]>([])
  const [cooldowns, setCooldowns] = useState<Record<string, string>>({}) // jugador_id que me ganó -> fecha en que se libera el reto
  const [jugadoresOcupados, setJugadoresOcupados] = useState<Set<string>>(new Set()) // cualquiera con un reto pendiente/aceptado, sin importar quién lo inició
  const [retosConResultadoPendiente, setRetosConResultadoPendiente] = useState<Set<string>>(new Set())
  const [proximosPartidos, setProximosPartidos] = useState<ProximoPartido[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null)
  const [historialPosiciones, setHistorialPosiciones] = useState<Record<string, Record<string, any[]>>>({})
  const [historialStats, setHistorialStats] = useState<Record<string, Record<string, any>>>({})
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')

  const [resultadoRetoId, setResultadoRetoId] = useState<string | null>(null)
  const [set1Retador, setSet1Retador] = useState('')
  const [set1Retado, setSet1Retado] = useState('')
  const [set2Retador, setSet2Retador] = useState('')
  const [set2Retado, setSet2Retado] = useState('')
  const [tbRetador, setTbRetador] = useState('')
  const [tbRetado, setTbRetado] = useState('')
  const [modoNoPresentado, setModoNoPresentado] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  const [retandoA, setRetandoA] = useState<string | null>(null)
  const [retoFecha, setRetoFecha] = useState('')
  const [retoHora, setRetoHora] = useState('')
  const [retoCancha, setRetoCancha] = useState('HGV1')
  const [retoCanchaForanea, setRetoCanchaForanea] = useState('')
  const [retoComentarios, setRetoComentarios] = useState('')
  const [retoFormMsg, setRetoFormMsg] = useState('')

  // 1. Cargar sesión
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session)
        if (data.session?.categoria) setCategoria(data.session.categoria)
        if (data.session?.genero) setGenero(data.session.genero)
      })
      .finally(() => setCheckingSession(false))
  }, [])

  // 2. Cargar temporada activa
  useEffect(() => {
    supabase
      .from('temporadas')
      .select('id, nombre, fecha_limite_inscripcion, fecha_inicio, fecha_fin, sorteo_realizado')
      .eq('estado', 'activa')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTemporadaId(data.id)
          setTemporadaNombre(data.nombre)
          setTemporadaLimite(data.fecha_limite_inscripcion || null)
          setTemporadaInicio(data.fecha_inicio || null)
          setTemporadaFin(data.fecha_fin || null)
          setTemporadaSorteada(!!data.sorteo_realizado)
        }
      })
  }, [])

  const cargarDatos = useCallback(async () => {
    if (!temporadaId) return
    setLoading(true)

    const { data: pos } = await supabase
      .from('ladder_posiciones')
      .select('id, jugador_id, posicion, posicion_inicial, categoria, genero, jugadores(nombre)')
      .eq('temporada_id', temporadaId)
      .eq('categoria', categoria)
      .eq('genero', genero)
      .order('posicion', { ascending: true })

    setPosiciones((pos as any) || [])

    // Cualquier jugador con un reto pendiente o aceptado (sea quien lo haya iniciado)
    // queda "ocupado" — nadie más puede retarlo hasta que se resuelva.
    const { data: retosActivos } = await supabase
      .from('retos')
      .select('retador_id, retado_id')
      .eq('temporada_id', temporadaId)
      .in('estado', ['pendiente', 'aceptado'])

    const ocupados = new Set<string>()
    ;(retosActivos || []).forEach((r: any) => {
      ocupados.add(r.retador_id)
      ocupados.add(r.retado_id)
    })
    setJugadoresOcupados(ocupados)

    if (session?.role === 'jugador') {
      const { data: retos } = await supabase
        .from('retos')
        .select('id, retador_id, retado_id, estado, created_at, fecha_propuesta, cancha, nombre_cancha_foranea, comentarios, resultado_anticipado_autorizado, retador:retador_id(nombre), retado:retado_id(nombre)')
        .eq('temporada_id', temporadaId)
        .or(`retador_id.eq.${session.id},retado_id.eq.${session.id}`)
        .order('created_at', { ascending: false })

      setMisRetos((retos as any) || [])

      const retoIds = (retos || []).map((r: any) => r.id)
      if (retoIds.length > 0) {
        const { data: resultadosPend } = await supabase
          .from('resultados')
          .select('reto_id, validado')
          .in('reto_id', retoIds)
          .eq('validado', false)
        setRetosConResultadoPendiente(new Set((resultadosPend || []).map((r: any) => r.reto_id)))

        // Calcular "enfriamiento": si un rival me ganó hace menos de 5 días,
        // no puedo volver a retarlo hasta que se cumplan esos 5 días.
        const { data: resultadosJugados } = await supabase
          .from('resultados')
          .select('ganador_id, validado_at, reto_id')
          .in('reto_id', retoIds)
          .eq('validado', true)

        const retosMap: Record<string, Reto> = {}
        ;(retos || []).forEach((r: any) => { retosMap[r.id] = r })

        const nuevoCooldown: Record<string, string> = {}
        ;(resultadosJugados || []).forEach((r: any) => {
          const reto = retosMap[r.reto_id]
          if (!reto || !r.validado_at) return
          const oponente = reto.retador_id === session.id ? reto.retado_id : reto.retado_id === session.id ? reto.retador_id : null
          if (!oponente) return
          if (r.ganador_id !== oponente) return // solo importa si el oponente fue quien ganó

          const liberaEn = new Date(r.validado_at)
          liberaEn.setDate(liberaEn.getDate() + 5)
          if (!nuevoCooldown[oponente] || new Date(liberaEn) > new Date(nuevoCooldown[oponente])) {
            nuevoCooldown[oponente] = liberaEn.toISOString()
          }
        })
        setCooldowns(nuevoCooldown)
      } else {
        setRetosConResultadoPendiente(new Set())
        setCooldowns({})
      }
    }

    setLoading(false)
  }, [temporadaId, categoria, genero, session])

  const cargarProximosPartidos = useCallback(async () => {
    if (!temporadaId) return
    const { data } = await supabase
      .from('retos')
      .select('id, fecha_propuesta, cancha, nombre_cancha_foranea, retador:retador_id(nombre, categoria, genero), retado:retado_id(nombre)')
      .eq('temporada_id', temporadaId)
      .eq('estado', 'aceptado')
      .gte('fecha_propuesta', new Date().toISOString())
      .order('fecha_propuesta', { ascending: true })

    setProximosPartidos((data as any) || [])
  }, [temporadaId])

  useEffect(() => {
    cargarProximosPartidos()
  }, [cargarProximosPartidos])

  const fetchHistorial = useCallback(async () => {
    const { data } = await supabase
      .from('temporadas')
      .select('id, nombre, estado, fecha_inicio, fecha_fin')
      .eq('estado', 'finalizada')
      .order('fecha_fin', { ascending: false })
    setHistorial(data || [])
  }, [])

  useEffect(() => {
    fetchHistorial()
  }, [fetchHistorial])

  async function verHistorialTemporada(temporadaIdHist: string) {
    if (historialAbierto === temporadaIdHist) {
      setHistorialAbierto(null)
      return
    }
    setHistorialAbierto(temporadaIdHist)

    if (!historialPosiciones[temporadaIdHist]) {
      const { data: posiciones } = await supabase
        .from('ladder_posiciones')
        .select('id, jugador_id, categoria, genero, posicion, jugadores(nombre)')
        .eq('temporada_id', temporadaIdHist)
        .order('categoria', { ascending: true })
        .order('genero', { ascending: true })
        .order('posicion', { ascending: true })

      const agrupado: Record<string, any[]> = {}
      ;(posiciones || []).forEach((p: any) => {
        const key = `${p.categoria}__${p.genero}`
        if (!agrupado[key]) agrupado[key] = []
        agrupado[key].push(p)
      })
      setHistorialPosiciones((prev) => ({ ...prev, [temporadaIdHist]: agrupado }))
    }

    if (!historialStats[temporadaIdHist]) {
      const { data: retosTemp } = await supabase
        .from('retos')
        .select('id, retador_id, retado_id')
        .eq('temporada_id', temporadaIdHist)

      const retoIds = (retosTemp || []).map((r: any) => r.id)
      const retosMap: Record<string, any> = {}
      ;(retosTemp || []).forEach((r: any) => { retosMap[r.id] = r })

      const stats: Record<string, any> = {}

      if (retoIds.length > 0) {
        const { data: resultadosTemp } = await supabase
          .from('resultados')
          .select('reto_id, ganador_id, no_presentado, validado')
          .in('reto_id', retoIds)
          .eq('validado', true)

        ;(resultadosTemp || []).forEach((res: any) => {
          const reto = retosMap[res.reto_id]
          if (!reto) return
          const participantes = [reto.retador_id, reto.retado_id]

          participantes.forEach((p: string) => {
            if (!stats[p]) stats[p] = { jugados: 0, ganados: 0, perdidos: 0, noPresentado: 0 }

            if (res.no_presentado) {
              if (p === res.ganador_id) {
                stats[p].jugados += 1
                stats[p].ganados += 1
              } else {
                stats[p].noPresentado += 1
              }
            } else {
              stats[p].jugados += 1
              if (p === res.ganador_id) {
                stats[p].ganados += 1
              } else {
                stats[p].perdidos += 1
              }
            }
          })
        })
      }

      setHistorialStats((prev) => ({ ...prev, [temporadaIdHist]: stats }))
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // 3. Verificar si el jugador logueado ya está anotado en esta temporada (sin inscribirlo solo)
  const [yaAnotado, setYaAnotado] = useState<boolean | null>(null)
  const [anotando, setAnotando] = useState(false)

  useEffect(() => {
    async function verificarAnotado() {
      if (!session || session.role !== 'jugador' || !temporadaId) return
      const { data: existente } = await supabase
        .from('ladder_posiciones')
        .select('id')
        .eq('temporada_id', temporadaId)
        .eq('jugador_id', session.id)
        .eq('categoria', session.categoria)
        .eq('genero', session.genero)
        .maybeSingle()

      setYaAnotado(!!existente)
    }
    verificarAnotado()
  }, [session, temporadaId])

  async function anotarmeEnTemporada() {
    if (!session || session.role !== 'jugador' || !temporadaId) return
    setAnotando(true)

    try {
      const res = await fetch('/api/jugador/anotarme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporadaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al anotarte')

      setYaAnotado(true)
      cargarDatos()
    } catch (err: any) {
      setActionMsg('❌ ' + err.message)
    } finally {
      setAnotando(false)
    }
  }

  // Horarios de disponibilidad de las canchas del club
  // Convierte "HH:MM" (24h) a partes de 12h para los selects, y viceversa —
  // así el selector de hora se ve igual en cualquier navegador/dispositivo,
  // sin depender del <input type="time"> nativo (que varía mucho entre ellos).
  function partesDesde24(hhmm: string) {
    if (!hhmm) return { h12: '', min: '00', ampm: 'AM' as 'AM' | 'PM' }
    const [hStr, mStr] = hhmm.split(':')
    const h = parseInt(hStr, 10)
    const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM'
    let h12 = h % 12
    if (h12 === 0) h12 = 12
    return { h12: String(h12), min: mStr, ampm }
  }

  function combinarA24(h12: string, min: string, ampm: string) {
    let h = parseInt(h12, 10) % 12
    if (ampm === 'PM') h += 12
    return `${String(h).padStart(2, '0')}:${min}`
  }

  function validarHorarioCancha(cancha: string, fechaStr: string, horaStr: string): { valido: boolean; mensaje?: string } {
    if (cancha === 'FORANEA') return { valido: true } // cancha externa, sin restricción del club
    if (!fechaStr || !horaStr) return { valido: true }

    const [y, m, d] = fechaStr.split('-').map(Number)
    const fecha = new Date(y, m - 1, d)
    const dia = fecha.getDay() // 0 = domingo, 6 = sábado
    const esFinde = dia === 0 || dia === 6
    if (esFinde) return { valido: true } // sábado y domingo, todo el día, ambas canchas

    const [hh, mm] = horaStr.split(':').map(Number)
    const minutos = hh * 60 + mm

    if (cancha === 'HGV1') {
      const enManana = minutos >= 360 && minutos < 840   // 6:00am – 2:00pm
      const enNoche = minutos >= 1200 && minutos < 1440  // 8:00pm – 12:00am
      if (enManana || enNoche) return { valido: true }
      return {
        valido: false,
        mensaje: 'HGV 1 solo está disponible de lunes a viernes de 6:00am a 2:00pm y de 8:00pm a 12:00am (fines de semana, todo el día).',
      }
    }

    if (cancha === 'HGV2') {
      const enNoche = minutos >= 1140 && minutos < 1440  // 7:00pm – 12:00am
      if (enNoche) return { valido: true }
      return {
        valido: false,
        mensaje: 'HGV 2 solo está disponible de lunes a viernes de 7:00pm a 12:00am (fines de semana, todo el día).',
      }
    }

    return { valido: true }
  }

  async function lanzarReto() {
    if (!session || session.role !== 'jugador' || !temporadaId || !retandoA) return
    setActionMsg('')
    setRetoFormMsg('')

    if (!temporadaSorteada) {
      setRetoFormMsg('❌ El sorteo de esta temporada todavía no se ha realizado.')
      return
    }

    if (!retoFecha || !retoHora) {
      setRetoFormMsg('❌ Selecciona fecha y hora propuestas')
      return
    }

    if ((temporadaInicio && retoFecha < temporadaInicio) || (temporadaFin && retoFecha > temporadaFin)) {
      setRetoFormMsg(`❌ La fecha debe estar dentro de la temporada (${temporadaInicio} a ${temporadaFin}).`)
      return
    }

    if (retoCancha === 'FORANEA' && !retoCanchaForanea.trim()) {
      setRetoFormMsg('❌ Escribe el nombre de la cancha foránea')
      return
    }

    const horario = validarHorarioCancha(retoCancha, retoFecha, retoHora)
    if (!horario.valido) {
      setRetoFormMsg('❌ ' + horario.mensaje)
      return
    }

    // Verificación en vivo contra la base de datos (no contra datos ya cargados en el navegador),
    // para evitar que dos clics rápidos generen retos duplicados, y para confirmar que ni yo
    // ni el rival tengamos ya un reto pendiente/aceptado con cualquier otra persona.
    const { data: existentes, error: errCheck } = await supabase
      .from('retos')
      .select('id, estado, retador_id, retado_id')
      .eq('temporada_id', temporadaId)
      .in('estado', ['pendiente', 'aceptado'])
      .or(`retador_id.eq.${session.id},retado_id.eq.${session.id},retador_id.eq.${retandoA},retado_id.eq.${retandoA}`)

    if (errCheck) {
      setRetoFormMsg('❌ Error al verificar: ' + errCheck.message)
      return
    }
    if (existentes && existentes.length > 0) {
      const involucraAlRival = existentes.some((r: any) => r.retador_id === retandoA || r.retado_id === retandoA)
      setActionMsg(
        involucraAlRival
          ? '❌ Ese jugador ya tiene un reto pendiente o en curso con otra persona.'
          : '❌ Ya tienes un reto pendiente o un partido en curso — no puedes lanzar otro.'
      )
      setRetandoA(null)
      cargarDatos()
      return
    }

    // Verificación de enfriamiento: si el rival me ganó hace menos de 5 días, no puedo retarlo de nuevo
    const cincoDiasAtras = new Date()
    cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5)

    const { data: retosPrevios } = await supabase
      .from('retos')
      .select('id, retador_id, retado_id')
      .eq('temporada_id', temporadaId)
      .or(`and(retador_id.eq.${session.id},retado_id.eq.${retandoA}),and(retador_id.eq.${retandoA},retado_id.eq.${session.id})`)

    const idsRetosPrevios = (retosPrevios || []).map((r: any) => r.id)
    if (idsRetosPrevios.length > 0) {
      const { data: resultadoReciente } = await supabase
        .from('resultados')
        .select('ganador_id, validado_at')
        .in('reto_id', idsRetosPrevios)
        .eq('validado', true)
        .eq('ganador_id', retandoA)
        .gte('validado_at', cincoDiasAtras.toISOString())
        .order('validado_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (resultadoReciente) {
        const libera = new Date(resultadoReciente.validado_at)
        libera.setDate(libera.getDate() + 5)
        setRetoFormMsg(`❌ Este jugador te ganó recientemente — puedes retarlo de nuevo a partir del ${libera.toLocaleDateString('es-ES')}.`)
        return
      }
    }

    const fechaPropuesta = new Date(`${retoFecha}T${retoHora}`).toISOString()

    const { data: nuevoReto, error } = await supabase.from('retos').insert([{
      temporada_id: temporadaId,
      retador_id: session.id,
      retado_id: retandoA,
      cancha: retoCancha,
      nombre_cancha_foranea: retoCancha === 'FORANEA' ? retoCanchaForanea : null,
      fecha_propuesta: fechaPropuesta,
      comentarios: retoComentarios || null,
      estado: 'pendiente',
    }]).select('id').single()

    if (error) {
      setRetoFormMsg('❌ Error al lanzar el reto: ' + error.message)
    } else {
      setActionMsg('✅ ¡Reto enviado!')
      setRetandoA(null)
      setRetoFecha('')
      setRetoHora('')
      setRetoCancha('HGV1')
      setRetoCanchaForanea('')
      setRetoComentarios('')
      cargarDatos()

      // Enviar el correo al rival en segundo plano — si falla, no afecta el reto ya creado
      if (nuevoReto?.id) {
        fetch('/api/notificar/nuevo-reto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retoId: nuevoReto.id }),
        }).catch(() => {})
      }
    }
  }

  async function responderReto(retoId: string, nuevoEstado: 'aceptado' | 'rechazado') {
    try {
      const res = await fetch('/api/jugador/responder-reto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retoId, nuevoEstado }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al responder')

      cargarDatos()
      cargarProximosPartidos()
    } catch (err: any) {
      setActionMsg('❌ ' + err.message)
    }
  }

  // Calcula sets ganados por cada lado, si hace falta tie-break, y quién ganó
  function calcularResultadoPartido() {
    const s1r = parseInt(set1Retador, 10)
    const s1d = parseInt(set1Retado, 10)
    const s2r = parseInt(set2Retador, 10)
    const s2d = parseInt(set2Retado, 10)

    const set1Valido = !isNaN(s1r) && !isNaN(s1d) && s1r !== s1d
    const set2Valido = !isNaN(s2r) && !isNaN(s2d) && s2r !== s2d

    if (!set1Valido || !set2Valido) return { valido: false as const }

    const setsRetador = (s1r > s1d ? 1 : 0) + (s2r > s2d ? 1 : 0)
    const setsRetado = 2 - setsRetador
    const necesitaTiebreak = setsRetador === 1 && setsRetado === 1

    if (!necesitaTiebreak) {
      return {
        valido: true as const,
        ganadorEsRetador: setsRetador === 2,
        marcadorRetador: `${s1r}-${s1d}, ${s2r}-${s2d}`,
        marcadorRetado: `${s1d}-${s1r}, ${s2d}-${s2r}`,
      }
    }

    const tbr = parseInt(tbRetador, 10)
    const tbd = parseInt(tbRetado, 10)
    if (isNaN(tbr) || isNaN(tbd) || tbr === tbd) return { valido: false as const, necesitaTiebreak: true }

    return {
      valido: true as const,
      ganadorEsRetador: tbr > tbd,
      marcadorRetador: `${s1r}-${s1d}, ${s2r}-${s2d}, TB ${tbr}-${tbd}`,
      marcadorRetado: `${s1d}-${s1r}, ${s2d}-${s2r}, TB ${tbd}-${tbr}`,
    }
  }

  async function registrarResultado(reto: Reto) {
    const resultado = calcularResultadoPartido()
    if (!resultado.valido) {
      setActionMsg('❌ Completa los 2 sets (y el tie-break si quedó 1-1) con marcadores válidos')
      return
    }

    const ganadorId = resultado.ganadorEsRetador ? reto.retador_id : reto.retado_id

    let fotoUrl: string | null = null
    if (fotoFile) {
      setSubiendoFoto(true)
      const ext = fotoFile.name.split('.').pop()
      const path = `${reto.id}-${Date.now()}.${ext}`
      const { error: errSubida } = await supabase.storage.from('fotos-partidos').upload(path, fotoFile)
      setSubiendoFoto(false)

      if (errSubida) {
        setActionMsg('❌ Error al subir la foto: ' + errSubida.message)
        return
      }
      const { data: urlData } = supabase.storage.from('fotos-partidos').getPublicUrl(path)
      fotoUrl = urlData.publicUrl
    }

    const { error: errResultado } = await supabase.from('resultados').insert([{
      reto_id: reto.id,
      ganador_id: ganadorId,
      marcador_retador: resultado.marcadorRetador,
      marcador_retado: resultado.marcadorRetado,
      foto_url: fotoUrl,
      validado: false,
    }])

    if (errResultado) {
      setActionMsg('❌ Error al guardar resultado: ' + errResultado.message)
      return
    }

    setActionMsg('✅ Resultado enviado — queda pendiente de validación por un administrador.')
    setResultadoRetoId(null)
    setSet1Retador('')
    setSet1Retado('')
    setSet2Retador('')
    setSet2Retado('')
    setTbRetador('')
    setTbRetado('')
    setFotoFile(null)
    cargarDatos()
  }

  async function registrarNoPresentado(reto: Reto, ausenteId: string) {
    const ganadorId = ausenteId === reto.retador_id ? reto.retado_id : reto.retador_id

    const { error } = await supabase.from('resultados').insert([{
      reto_id: reto.id,
      ganador_id: ganadorId,
      marcador_retador: ausenteId === reto.retador_id ? 'No presentado' : 'W.O.',
      marcador_retado: ausenteId === reto.retado_id ? 'No presentado' : 'W.O.',
      no_presentado: true,
      validado: false,
    }])

    if (error) {
      setActionMsg('❌ Error al registrar: ' + error.message)
      return
    }

    setActionMsg('✅ Reportado — queda pendiente de validación por un administrador.')
    setResultadoRetoId(null)
    setModoNoPresentado(null)
    cargarDatos()
  }

  async function cerrarSesion() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/'
  }

  const miPosicion = session?.role === 'jugador'
    ? posiciones.find((p) => p.jugador_id === session.id)
    : null

  const tengoRetoPendiente = session?.role === 'jugador'
    ? misRetos.some((r) => r.estado === 'pendiente' && r.retador_id === session.id)
    : false

  const tengoInvitacionPendiente = session?.role === 'jugador'
    ? misRetos.some((r) => r.estado === 'pendiente' && r.retado_id === session.id)
    : false

  const tengoPartidoEnCurso = session?.role === 'jugador'
    ? misRetos.some((r) => r.estado === 'aceptado' && (r.retador_id === session.id || r.retado_id === session.id))
    : false

  const bloqueado = tengoRetoPendiente || tengoInvitacionPendiente || tengoPartidoEnCurso

  const esElegible = (p: Posicion) => {
    if (!session || session.role !== 'jugador' || !miPosicion) return false
    if (p.jugador_id === session.id) return false
    const diferencia = miPosicion.posicion - p.posicion
    return diferencia > 0 && diferencia <= RANGO_RETO
  }

  const enEnfriamiento = (jugadorId: string) => {
    const fecha = cooldowns[jugadorId]
    if (!fecha) return false
    return new Date() < new Date(fecha)
  }

  const puedoRetar = (p: Posicion) => {
    return (
      esElegible(p) &&
      temporadaSorteada &&
      !bloqueado &&
      !retandoA &&
      !enEnfriamiento(p.jugador_id) &&
      !jugadoresOcupados.has(p.jugador_id)
    )
  }

  if (checkingSession) {
    return <CentroMensaje texto="Cargando..." />
  }

  return (
    <main className="court-bg" style={{
      minHeight: '100vh',
      padding: '30px 16px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src="/logo-hgv.png" alt="Escudo HGV" style={{ width: '64px', height: '64px', objectFit: 'contain', margin: '0 auto 10px auto', display: 'block' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ball)', fontSize: '32px', margin: 0 }}>Escalera HGV</h1>
          <p style={{ color: 'var(--color-chalk)', marginTop: '6px' }}>
            {temporadaNombre ? `Temporada: ${temporadaNombre}` : 'No hay temporada activa'}
          </p>
          {temporadaInicio && temporadaFin && (
            <p style={{
              fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '12px',
              letterSpacing: '0.06em', marginTop: '4px',
            }}>
              {temporadaInicio} → {temporadaFin}
            </p>
          )}
          {!session && (
            <p style={{ color: '#cce5ff', marginTop: '10px' }}>
              <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Inicia sesión</a> para retar y registrar resultados.
            </p>
          )}
          {session?.role === 'jugador' && (
            <p style={{ color: '#cce5ff', marginTop: '10px' }}>
              Conectado como <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ball)' }}>{session.nombre}</strong>
              {' — '}
              <a href="/perfil" style={{ color: 'var(--color-ball)', textDecoration: 'underline', fontSize: 'inherit' }}>
                Mi Perfil
              </a>
              {' — '}
              <button
                onClick={cerrarSesion}
                style={{
                  background: 'none', border: 'none', color: 'var(--color-ball)',
                  textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', padding: 0
                }}
              >
                Cerrar sesión
              </button>
            </p>
          )}
        </div>

        {!temporadaId && (
          <CentroMensaje texto="Todavía no hay ninguna temporada marcada como 'activa'. Un administrador debe crear una en la tabla temporadas." />
        )}

        {temporadaId && (
          <>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={selectStyle}>
                {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select value={genero} onChange={(e) => setGenero(e.target.value)} style={selectStyle}>
                {GENEROS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>

            {actionMsg && (
              <div style={{ background: 'rgba(255,255,255,0.15)', color: 'var(--color-chalk)', padding: '10px', borderRadius: '8px', textAlign: 'center', marginBottom: '16px' }}>
                {actionMsg}
              </div>
            )}

            {/* Próximos partidos confirmados — visible para todos */}
            <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h2 style={{ color: 'var(--color-ink)', marginTop: 0 }}>📅 Próximos partidos confirmados</h2>
              {proximosPartidos.length === 0 ? (
                <p style={{ color: '#777' }}>No hay partidos confirmados por ahora.</p>
              ) : (
                proximosPartidos.map((partido) => (
                  <div key={partido.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                    <p style={{ margin: 0 }}>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{partido.retador?.nombre}</strong> vs <strong style={{ fontFamily: 'var(--font-mono)' }}>{partido.retado?.nombre}</strong>
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#777' }}>
                      {new Date(partido.fecha_propuesta).toLocaleString('es-ES', {
                        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                      })}
                      {' · '}
                      {partido.cancha === 'FORANEA'
                        ? (partido.nombre_cancha_foranea || 'Cancha foránea')
                        : partido.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'}
                      {' · '}
                      {CATEGORIAS.find(c => c.value === partido.retador?.categoria)?.label}
                      {' — '}
                      {GENEROS.find(g => g.value === partido.retador?.genero)?.label}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Mi posición destacada */}
            {session?.role === 'jugador' && miPosicion && (
              <div style={{
                background: 'linear-gradient(135deg, #d4e157 0%, #b9c93f 100%)',
                borderRadius: '12px', padding: '20px 24px', marginBottom: '24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'
              }}>
                <div>
                  <p style={{ margin: 0, color: 'var(--color-ink)', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Tu posición actual
                  </p>
                  <p style={{ margin: '2px 0 0 0', color: 'var(--color-ink)', fontSize: '13px' }}>
                    {CATEGORIAS.find(c => c.value === miPosicion.categoria)?.label} — {GENEROS.find(g => g.value === miPosicion.genero)?.label}
                  </p>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '42px', fontWeight: 'bold', color: 'var(--color-ink)' }}>
                  #{miPosicion.posicion}
                </div>
              </div>
            )}

            {/* Aviso para anotarse a la temporada activa */}
            {session?.role === 'jugador' && yaAnotado === false && (() => {
              const hoy = new Date().toISOString().slice(0, 10)
              const plazoVencido = !!temporadaLimite && hoy > temporadaLimite
              const cerrado = plazoVencido || temporadaSorteada

              return (
                <div style={{
                  background: 'var(--color-chalk)', border: '2px dashed var(--color-ball)', borderRadius: '12px',
                  padding: '20px 24px', marginBottom: '24px', textAlign: 'center'
                }}>
                  <p style={{ margin: '0 0 12px 0', color: 'var(--color-ink)', fontWeight: 'bold' }}>
                    🎾 Todavía no estás anotado en {temporadaNombre}
                  </p>
                  <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>
                    Categoría: {CATEGORIAS.find(c => c.value === session.categoria)?.label} — {GENEROS.find(g => g.value === session.genero)?.label}
                  </p>
                  {temporadaInicio && temporadaFin && (
                    <p style={{ margin: '0 0 14px 0', color: '#666', fontSize: '14px' }}>
                      📅 La temporada corre del <strong>{temporadaInicio}</strong> al <strong>{temporadaFin}</strong>
                    </p>
                  )}

                  {temporadaSorteada ? (
                    <p style={{ margin: '0 0 14px 0', fontSize: '13px', fontWeight: 'bold', color: '#c0392b' }}>
                      🔒 El sorteo de esta temporada ya se realizó.
                    </p>
                  ) : temporadaLimite && (
                    <p style={{ margin: '0 0 14px 0', fontSize: '13px', fontWeight: 'bold', color: plazoVencido ? '#c0392b' : '#28a745' }}>
                      {plazoVencido
                        ? `🔒 El plazo para anotarse cerró el ${temporadaLimite}.`
                        : `🟢 Plazo para anotarte: hasta el ${temporadaLimite}`}
                    </p>
                  )}

                  {cerrado ? (
                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                      Pídele a un administrador que te agregue manualmente al escalafón.
                    </p>
                  ) : (
                    <button
                      onClick={anotarmeEnTemporada}
                      disabled={anotando}
                      style={{
                        background: anotando ? '#ccc' : 'var(--color-ball)', color: 'var(--color-ink)', border: 'none',
                        padding: '12px 28px', borderRadius: '8px', cursor: anotando ? 'not-allowed' : 'pointer',
                        fontSize: '15px', fontWeight: 'bold'
                      }}
                    >
                      {anotando ? '⏳ Anotando...' : '✅ Anotarme a esta temporada'}
                    </button>
                  )}
                </div>
              )
            })()}

            {/* Ranking */}
            <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h2 style={{ color: 'var(--color-ink)', marginTop: 0 }}>
                Ranking — {CATEGORIAS.find(c => c.value === categoria)?.label} / {GENEROS.find(g => g.value === genero)?.label}
              </h2>
              {loading ? (
                <p>Cargando...</p>
              ) : posiciones.length === 0 ? (
                <p style={{ color: '#777' }}>Todavía no hay jugadores en esta categoría.</p>
              ) : (
                <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#999', fontSize: '11px', textAlign: 'left' }}>
                      <th style={{ padding: '4px 10px', fontWeight: 'normal' }}>Actual</th>
                      <th style={{ padding: '4px 10px', fontWeight: 'normal' }}>Jugador</th>
                      <th style={{ padding: '4px 10px', fontWeight: 'normal', textAlign: 'center' }}>Inicial</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {posiciones.map((p) => {
                      const inicial = p.posicion_inicial ?? p.posicion
                      const diferencia = inicial - p.posicion // positivo = subió, negativo = bajó
                      return (
                        <tr key={p.id} style={{
                          borderBottom: '1px solid #eee',
                          background: p.jugador_id === session?.id ? '#fff9e0' : 'transparent',
                        }}>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--color-ink)', width: '40px' }}>#{p.posicion}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)' }}>{p.jugadores?.nombre || 'Jugador'}</td>
                          <td style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                            #{inicial}
                            {diferencia > 0 && <span style={{ color: '#28a745', marginLeft: '4px' }}>▲{diferencia}</span>}
                            {diferencia < 0 && <span style={{ color: '#c0392b', marginLeft: '4px' }}>▼{Math.abs(diferencia)}</span>}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            {esElegible(p) && retandoA !== p.jugador_id && (
                              <>
                                <button
                                  onClick={() => puedoRetar(p) && (setRetandoA(p.jugador_id), setRetoFormMsg(''))}
                                  disabled={!puedoRetar(p)}
                                  style={puedoRetar(p) ? btnRetar : btnRetarDeshabilitado}
                                  title={
                                    !temporadaSorteada
                                      ? 'El sorteo de esta temporada todavía no se ha realizado'
                                      : enEnfriamiento(p.jugador_id)
                                      ? `Te ganó recientemente — puedes retarlo de nuevo a partir del ${new Date(cooldowns[p.jugador_id]).toLocaleDateString('es-ES')}`
                                      : jugadoresOcupados.has(p.jugador_id)
                                      ? 'Este jugador ya tiene un reto pendiente o en curso con otra persona'
                                      : bloqueado ? 'Tienes un reto pendiente o un partido en curso' : ''
                                  }
                                >
                                  ⚔️ Retar
                                </button>
                                {temporadaSorteada && !enEnfriamiento(p.jugador_id) && jugadoresOcupados.has(p.jugador_id) && (
                                  <p style={{ fontSize: '10px', color: '#c0392b', margin: '4px 0 0 0' }}>
                                    Ocupado en otro reto
                                  </p>
                                )}
                                {enEnfriamiento(p.jugador_id) && (
                                  <p style={{ fontSize: '10px', color: '#c0392b', margin: '4px 0 0 0' }}>
                                    Disponible el {new Date(cooldowns[p.jugador_id]).toLocaleDateString('es-ES')}
                                  </p>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              )}

              {retandoA && (
                <div style={{ marginTop: '16px', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <h4 style={{ marginTop: 0, color: 'var(--color-ink)' }}>
                    Retar a {posiciones.find(p => p.jugador_id === retandoA)?.jugadores?.nombre}
                  </h4>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <label style={labelStyle}>📅 Fecha propuesta</label>
                      <input
                        type="date"
                        value={retoFecha}
                        onChange={(e) => setRetoFecha(e.target.value)}
                        min={temporadaInicio || undefined}
                        max={temporadaFin || undefined}
                        style={inputPequeno}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <label style={labelStyle}>🕐 Hora propuesta</label>
                      {(() => {
                        const { h12, min, ampm } = partesDesde24(retoHora)
                        return (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <select
                              value={h12}
                              onChange={(e) => setRetoHora(e.target.value ? combinarA24(e.target.value, min, ampm) : '')}
                              style={{ ...inputPequeno, flex: 1 }}
                            >
                              <option value="">--</option>
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            <select
                              value={min}
                              onChange={(e) => setRetoHora(combinarA24(h12 || '12', e.target.value, ampm))}
                              style={{ ...inputPequeno, flex: 1 }}
                            >
                              {['00', '15', '30', '45'].map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <select
                              value={ampm}
                              onChange={(e) => setRetoHora(combinarA24(h12 || '12', min, e.target.value))}
                              style={{ ...inputPequeno, flex: 1 }}
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {temporadaInicio && temporadaFin && (
                    <p style={{ fontSize: '11px', color: '#888', margin: '-6px 0 10px 0' }}>
                      La fecha debe estar dentro de la temporada: {temporadaInicio} a {temporadaFin}
                    </p>
                  )}

                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>🎾 Cancha</label>
                    <select value={retoCancha} onChange={(e) => setRetoCancha(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                      <option value="HGV1">HGV 1</option>
                      <option value="HGV2">HGV 2</option>
                      <option value="FORANEA">Foránea</option>
                    </select>
                    <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0 0' }}>
                      {retoCancha === 'HGV1' && 'Lun-Vie: 6:00am–2:00pm y 8:00pm–12:00am · Sáb-Dom: todo el día'}
                      {retoCancha === 'HGV2' && 'Lun-Vie: 7:00pm–12:00am · Sáb-Dom: todo el día'}
                      {retoCancha === 'FORANEA' && 'Sin restricción de horario del club (cancha externa)'}
                    </p>
                  </div>

                  {retoCancha === 'FORANEA' && (
                    <div style={{ marginBottom: '10px' }}>
                      <label style={labelStyle}>📍 Nombre de la cancha foránea</label>
                      <input
                        type="text"
                        value={retoCanchaForanea}
                        onChange={(e) => setRetoCanchaForanea(e.target.value)}
                        placeholder="Ej: Club Los Pinos"
                        style={{ ...inputPequeno, width: '100%' }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>💬 Comentarios (opcional)</label>
                    <input
                      type="text"
                      value={retoComentarios}
                      onChange={(e) => setRetoComentarios(e.target.value)}
                      placeholder="Ej: prefiero por la tarde"
                      style={{ ...inputPequeno, width: '100%' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={lanzarReto} style={btnPequeno('var(--color-ball)')}>Enviar reto</button>
                    <button onClick={() => { setRetandoA(null); setRetoFormMsg('') }} style={btnPequeno('#999')}>Cancelar</button>
                  </div>
                  {retoFormMsg && (
                    <div style={{
                      marginTop: '10px', padding: '10px 12px', borderRadius: '6px',
                      background: '#f8d7da', color: '#721c24', fontSize: '13px', fontWeight: 'bold'
                    }}>
                      {retoFormMsg}
                    </div>
                  )}
                </div>
              )}
              {session?.role === 'jugador' && !temporadaSorteada && (
                <p style={{ fontSize: '13px', color: '#c0392b', marginTop: '8px', fontWeight: 'bold' }}>
                  🔒 El sorteo de esta temporada todavía no se ha realizado — los retos se habilitan después de que el admin lo haga.
                </p>
              )}
              {session?.role === 'jugador' && temporadaSorteada && bloqueado && (
                <p style={{ fontSize: '13px', color: '#c0392b', marginTop: '8px', fontWeight: 'bold' }}>
                  {tengoPartidoEnCurso
                    ? 'Tienes un partido aceptado en curso — no puedes retar ni aceptar otros retos hasta que se registre el resultado.'
                    : tengoInvitacionPendiente
                    ? 'Tienes una invitación a un reto sin responder — acéptala o recházala en "Mis retos" antes de lanzar uno nuevo.'
                    : 'Tienes un reto pendiente de respuesta — no puedes lanzar otro hasta que se resuelva.'}
                </p>
              )}
              {session?.role === 'jugador' && miPosicion && temporadaSorteada && !bloqueado && (
                <p style={{ fontSize: '13px', color: '#777', marginTop: '12px' }}>
                  Puedes retar a jugadores hasta {RANGO_RETO} posiciones arriba de ti.
                </p>
              )}
            </div>

            {/* Mis retos */}
            {session?.role === 'jugador' && (
              <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px' }}>
                <h2 style={{ color: 'var(--color-ink)', marginTop: 0 }}>Mis retos</h2>
                {misRetos.length === 0 ? (
                  <p style={{ color: '#777' }}>No tienes retos todavía.</p>
                ) : (
                  misRetos.map((r) => (
                    <div key={r.id} style={{ borderBottom: '1px solid #eee', padding: '12px 0' }}>
                      <p style={{ margin: '0 0 6px 0' }}>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{r.retador?.nombre}</strong> vs <strong style={{ fontFamily: 'var(--font-mono)' }}>{r.retado?.nombre}</strong>{' '}
                        <span style={{
                          fontSize: '12px', padding: '2px 8px', borderRadius: '10px',
                          background: r.estado === 'pendiente' ? '#fff3cd' : r.estado === 'aceptado' ? '#d1ecf1' : r.estado === 'jugado' ? '#d4edda' : '#f8d7da',
                          color: '#333',
                        }}>
                          {r.estado}
                        </span>
                      </p>

                      {r.fecha_propuesta && (
                        <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#555' }}>
                          📅 {new Date(r.fecha_propuesta).toLocaleString('es-ES', {
                            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      )}
                      {r.cancha && (
                        <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#555' }}>
                          🎾 {r.cancha === 'FORANEA' ? (r.nombre_cancha_foranea || 'Cancha foránea') : r.cancha === 'HGV1' ? 'HGV 1' : 'HGV 2'}
                        </p>
                      )}
                      {r.comentarios && (
                        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#777', fontStyle: 'italic' }}>
                          💬 {r.comentarios}
                        </p>
                      )}

                      {/* Aceptar / rechazar si me retaron a mí */}
                      {r.estado === 'pendiente' && r.retado_id === session.id && (
                        tengoPartidoEnCurso ? (
                          <p style={{ fontSize: '13px', color: '#c0392b', margin: '4px 0' }}>
                            Tienes un partido en curso — resuélvelo antes de aceptar este reto.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => responderReto(r.id, 'aceptado')} style={btnPequeno('#28a745')}>Aceptar</button>
                            <button onClick={() => responderReto(r.id, 'rechazado')} style={btnPequeno('#dc3545')}>Rechazar</button>
                          </div>
                        )
                      )}

                      {/* Registrar resultado si el reto fue aceptado, o aviso si ya se cargó y falta validación */}
                      {r.estado === 'aceptado' && retosConResultadoPendiente.has(r.id) && (
                        <p style={{ fontSize: '13px', color: '#856404', background: '#fff3cd', padding: '8px 12px', borderRadius: '6px', margin: 0 }}>
                          ⏳ Resultado enviado — esperando validación de un administrador.
                        </p>
                      )}
                      {(() => {
                        if (r.estado !== 'aceptado' || retosConResultadoPendiente.has(r.id)) return null

                        const yaSeJugo = !r.fecha_propuesta || new Date() >= new Date(r.fecha_propuesta)
                        const puedeCargar = yaSeJugo || r.resultado_anticipado_autorizado

                        if (!puedeCargar) {
                          return (
                            <p style={{ fontSize: '13px', color: '#666', background: '#f0f0f0', padding: '8px 12px', borderRadius: '6px', margin: 0 }}>
                              🕐 Podrás cargar el resultado a partir del {new Date(r.fecha_propuesta!).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}, o antes si un administrador lo autoriza.
                            </p>
                          )
                        }

                        if (resultadoRetoId === r.id) return null

                        return (
                          <button onClick={() => { setResultadoRetoId(r.id); setModoNoPresentado(null) }} style={btnPequeno('var(--color-ink)')}>
                            Registrar resultado
                          </button>
                        )
                      })()}


                      {resultadoRetoId === r.id && (
                        <div style={{ marginTop: '10px', padding: '12px', background: '#f8f9fa', borderRadius: '8px' }}>

                          {modoNoPresentado === null && (
                            <p style={{ margin: '0 0 10px 0' }}>
                              <button
                                onClick={() => setModoNoPresentado('elegir')}
                                style={{ background: 'none', border: 'none', color: '#c0392b', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                              >
                                ❌ El rival no se presentó
                              </button>
                            </p>
                          )}

                          {modoNoPresentado === 'elegir' && (
                            <div style={{ marginBottom: '10px' }}>
                              <p style={{ fontSize: '13px', color: '#c0392b', fontWeight: 'bold', margin: '0 0 8px 0' }}>
                                ¿Quién no se presentó?
                              </p>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <button onClick={() => registrarNoPresentado(r, r.retador_id)} style={btnPequeno('#c0392b')}>
                                  {r.retador?.nombre}
                                </button>
                                <button onClick={() => registrarNoPresentado(r, r.retado_id)} style={btnPequeno('#c0392b')}>
                                  {r.retado?.nombre}
                                </button>
                              </div>
                              <button
                                onClick={() => setModoNoPresentado(null)}
                                style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                              >
                                ← Volver a cargar marcador
                              </button>
                            </div>
                          )}

                          {modoNoPresentado === null && (
                            <>
                              <p style={{ fontSize: '12px', color: '#777', margin: '0 0 8px 0' }}>
                                Juegos ganados por set (2 sets; si queda 1-1 se pide tie-break)
                              </p>

                              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: '#555' }}>Set 1</span>
                                <input type="number" min="0" placeholder={r.retador?.nombre} value={set1Retador} onChange={(e) => setSet1Retador(e.target.value)} style={inputPequeno} />
                                <input type="number" min="0" placeholder={r.retado?.nombre} value={set1Retado} onChange={(e) => setSet1Retado(e.target.value)} style={inputPequeno} />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', color: '#555' }}>Set 2</span>
                                <input type="number" min="0" placeholder={r.retador?.nombre} value={set2Retador} onChange={(e) => setSet2Retador(e.target.value)} style={inputPequeno} />
                                <input type="number" min="0" placeholder={r.retado?.nombre} value={set2Retado} onChange={(e) => setSet2Retado(e.target.value)} style={inputPequeno} />
                              </div>

                              {(() => {
                                const s1r = parseInt(set1Retador, 10), s1d = parseInt(set1Retado, 10)
                                const s2r = parseInt(set2Retador, 10), s2d = parseInt(set2Retado, 10)
                                const set1Ok = !isNaN(s1r) && !isNaN(s1d) && s1r !== s1d
                                const set2Ok = !isNaN(s2r) && !isNaN(s2d) && s2r !== s2d
                                const setsRetador = (set1Ok && s1r > s1d ? 1 : 0) + (set2Ok && s2r > s2d ? 1 : 0)
                                const setsRetado = (set1Ok && s1d > s1r ? 1 : 0) + (set2Ok && s2d > s2r ? 1 : 0)
                                const necesitaTiebreak = set1Ok && set2Ok && setsRetador === 1 && setsRetado === 1
                                if (!necesitaTiebreak) return null
                                return (
                                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '12px', color: '#c0392b', fontWeight: 'bold' }}>Tie-break</span>
                                    <input type="number" min="0" placeholder={r.retador?.nombre} value={tbRetador} onChange={(e) => setTbRetador(e.target.value)} style={inputPequeno} />
                                    <input type="number" min="0" placeholder={r.retado?.nombre} value={tbRetado} onChange={(e) => setTbRetado(e.target.value)} style={inputPequeno} />
                                  </div>
                                )
                              })()}

                              <div style={{ marginBottom: '10px' }}>
                                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>
                                  📸 Foto del partido (opcional)
                                </label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => setFotoFile(e.target.files?.[0] || null)}
                                  style={{ fontSize: '13px' }}
                                />
                              </div>

                              <button onClick={() => registrarResultado(r)} disabled={subiendoFoto} style={btnPequeno(subiendoFoto ? '#ccc' : '#28a745')}>
                                {subiendoFoto ? '⏳ Subiendo foto...' : 'Guardar resultado'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Historial de temporadas cerradas — visible para todos */}
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ color: 'var(--color-ball)', textAlign: 'center', marginBottom: '16px' }}>📜 Historial de escalafones anteriores</h2>
          {historial.length === 0 ? (
            <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#888' }}>
              Todavía no hay temporadas cerradas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {historial.map((t) => (
                <div key={t.id} style={{ background: 'var(--color-chalk)', borderRadius: '12px', overflow: 'hidden' }}>
                  <button
                    onClick={() => verHistorialTemporada(t.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '16px 20px', background: 'none', border: 'none',
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                  >
                    <span style={{ fontWeight: '600', color: 'var(--color-ink)' }}>{t.nombre}</span>
                    <span style={{ fontSize: '13px', color: '#888' }}>
                      {t.fecha_inicio} → {t.fecha_fin} {historialAbierto === t.id ? '▲' : '▼'}
                    </span>
                  </button>

                  {historialAbierto === t.id && (
                    <div style={{ padding: '0 20px 20px 20px' }}>
                      {!historialPosiciones[t.id] ? (
                        <p style={{ color: '#888' }}>⏳ Cargando...</p>
                      ) : Object.keys(historialPosiciones[t.id]).length === 0 ? (
                        <p style={{ color: '#888' }}>No hubo posiciones registradas en esta temporada.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                          {Object.entries(historialPosiciones[t.id]).map(([key, lista]) => {
                            const [catVal, genVal] = key.split('__')
                            const catLabel = CATEGORIAS.find(c => c.value === catVal)?.label || catVal
                            const genLabel = GENEROS.find(g => g.value === genVal)?.label || genVal
                            const stats = historialStats[t.id] || {}
                            return (
                              <div key={key} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '14px' }}>
                                <h5 style={{ margin: '0 0 8px 0', color: 'var(--color-ink)' }}>{catLabel} — {genLabel}</h5>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                  <thead>
                                    <tr style={{ color: '#888', textAlign: 'left' }}>
                                      <th style={{ padding: '2px 4px' }}>#</th>
                                      <th style={{ padding: '2px 4px' }}>Jugador</th>
                                      <th style={{ padding: '2px 4px', textAlign: 'center' }}>PJ</th>
                                      <th style={{ padding: '2px 4px', textAlign: 'center' }}>G</th>
                                      <th style={{ padding: '2px 4px', textAlign: 'center' }}>P</th>
                                      <th style={{ padding: '2px 4px', textAlign: 'center' }}>NP</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(lista as any[]).map((p: any) => {
                                      const s = stats[p.jugador_id] || { jugados: 0, ganados: 0, perdidos: 0, noPresentado: 0 }
                                      return (
                                        <tr key={p.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                                          <td style={{ padding: '4px', fontWeight: 'bold', color: 'var(--color-ink)' }}>{p.posicion}</td>
                                          <td style={{ padding: '4px', fontFamily: 'var(--font-mono)', color: '#333' }}>{p.jugadores?.nombre || 'Jugador'}</td>
                                          <td style={{ padding: '4px', textAlign: 'center' }}>{s.jugados}</td>
                                          <td style={{ padding: '4px', textAlign: 'center', color: '#28a745', fontWeight: 'bold' }}>{s.ganados}</td>
                                          <td style={{ padding: '4px', textAlign: 'center', color: '#c0392b' }}>{s.perdidos}</td>
                                          <td style={{ padding: '4px', textAlign: 'center', color: '#888' }}>{s.noPresentado}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '32px', marginBottom: '20px' }}>
          <a
            href="/"
            style={{
              display: 'inline-block',
              color: 'var(--color-chalk)',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              textDecoration: 'none',
              border: '1px solid rgba(247,243,234,0.4)',
              borderRadius: '4px',
              padding: '10px 24px',
            }}
          >
            ← Volver al inicio
          </a>
        </div>
      </div>
    </main>
  )
}

function CentroMensaje({ texto }: { texto: string }) {
  return (
    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#555' }}>
      {texto}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  border: 'none',
  fontSize: '14px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#555',
  marginBottom: '4px',
}

const btnRetar: React.CSSProperties = {
  background: 'var(--color-ball)',
  color: 'var(--color-ink)',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
}

const btnRetarDeshabilitado: React.CSSProperties = {
  ...btnRetar,
  background: '#e0e0e0',
  color: '#999',
  cursor: 'not-allowed',
}

const inputPequeno: React.CSSProperties = {
  flex: 1,
  padding: '8px',
  borderRadius: '6px',
  border: '1px solid #ddd',
}

function btnPequeno(color: string): React.CSSProperties {
  return {
    background: color,
    color: 'var(--color-chalk)',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
  }
}
