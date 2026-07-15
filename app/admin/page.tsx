'use client'
import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [players, setPlayers] = useState<any[]>([])
  const [editandoJugadorId, setEditandoJugadorId] = useState<string | null>(null)
  const [editJugadorForm, setEditJugadorForm] = useState<any>({})
  const [guardandoJugador, setGuardandoJugador] = useState(false)
  const [editJugadorMsg, setEditJugadorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterGenero, setFilterGenero] = useState('')

  const [temporadaActiva, setTemporadaActiva] = useState<any>(null)
  const [ladderPreview, setLadderPreview] = useState<Record<string, any[]>>({})
  const [ladderStats, setLadderStats] = useState<Record<string, any>>({})
  const [pagos, setPagos] = useState<any[]>([])
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [temporadaActivaPagos, setTemporadaActivaPagos] = useState<any>(null)
  const [jugadoresParaPago, setJugadoresParaPago] = useState<any[]>([])
  const [pagoJugadorId, setPagoJugadorId] = useState('')
  const [pagoTipo, setPagoTipo] = useState('pago_movil')
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10))
  const [registrandoPago, setRegistrandoPago] = useState(false)
  const [pagoMsg, setPagoMsg] = useState('')
  const [sorteando, setSorteando] = useState(false)

  const [retos, setRetos] = useState<any[]>([])
  const [loadingRetos, setLoadingRetos] = useState(false)
  const [filterEstado, setFilterEstado] = useState('')

  const [dashStats, setDashStats] = useState({ jugadores: 0, desafiosActivos: 0, partidosJugados: 0, esteMes: 0 })
  const [anuncioTitulo, setAnuncioTitulo] = useState('')
  const [anuncioDescripcion, setAnuncioDescripcion] = useState('')
  const [anuncioActivo, setAnuncioActivo] = useState(false)
  const [guardandoAnuncio, setGuardandoAnuncio] = useState(false)
  const [anuncioMsg, setAnuncioMsg] = useState('')
  const [loadingDash, setLoadingDash] = useState(false)

  const [resultados, setResultados] = useState<any[]>([])
  const [loadingResultados, setLoadingResultados] = useState(false)
  const [aprobando, setAprobando] = useState<string | null>(null)
  const [resultadosMsg, setResultadosMsg] = useState('')

  useEffect(() => {
    if (activeSection === 'results') {
      fetchResultados()
    }
  }, [activeSection])

  const fetchResultados = async () => {
    setLoadingResultados(true)
    const { data } = await supabase
      .from('resultados')
      .select(`
        id, marcador_retador, marcador_retado, posiciones_intercambiadas, observaciones, created_at, validado, ganador_id, no_presentado,
        ganador:ganador_id(nombre),
        retos:reto_id(
          id, temporada_id, retador_id, retado_id, cancha, nombre_cancha_foranea, fecha_propuesta,
          retador:retador_id(nombre, categoria, genero),
          retado:retado_id(nombre)
        )
      `)
      .order('created_at', { ascending: false })
    setResultados(data || [])
    setLoadingResultados(false)
  }

  const aprobarResultado = async (resultado: any) => {
    if (!confirm('¿Aprobar este resultado? Esto actualizará el ranking si corresponde.')) return

    setAprobando(resultado.id)
    setResultadosMsg('')

    try {
      const res = await fetch('/api/admin/aprobar-resultado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultadoId: resultado.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al aprobar')

      setResultadosMsg('✅ Resultado aprobado y ranking actualizado.')
      fetchResultados()
    } catch (err: any) {
      setResultadosMsg('❌ Error al aprobar: ' + err.message)
    } finally {
      setAprobando(null)
    }
  }

  const fetchAnuncio = async () => {
    const { data } = await supabase.from('anuncio').select('titulo, descripcion, activo').eq('id', 1).maybeSingle()
    if (data) {
      setAnuncioTitulo(data.titulo || '')
      setAnuncioDescripcion(data.descripcion || '')
      setAnuncioActivo(!!data.activo)
    }
  }

  const guardarAnuncio = async () => {
    setGuardandoAnuncio(true)
    setAnuncioMsg('')
    try {
      const res = await fetch('/api/admin/guardar-anuncio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: anuncioTitulo, descripcion: anuncioDescripcion, activo: anuncioActivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setAnuncioMsg('✅ Anuncio guardado.')
    } catch (err: any) {
      setAnuncioMsg('❌ ' + err.message)
    } finally {
      setGuardandoAnuncio(false)
    }
  }

  useEffect(() => {
    if (activeSection === 'dashboard') {
      fetchDashboardStats()
      fetchAnuncio()
    }
  }, [activeSection])

  const fetchDashboardStats = async () => {
    setLoadingDash(true)

    const { count: totalJugadores } = await supabase
      .from('jugadores')
      .select('id', { count: 'exact', head: true })
      .eq('activo', true)

    const { count: activos } = await supabase
      .from('retos')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'aceptado'])

    const { count: jugados } = await supabase
      .from('retos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'jugado')

    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    const { count: esteMes } = await supabase
      .from('retos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'jugado')
      .gte('fecha_propuesta', inicioMes.toISOString())

    setDashStats({
      jugadores: totalJugadores || 0,
      desafiosActivos: activos || 0,
      partidosJugados: jugados || 0,
      esteMes: esteMes || 0,
    })
    setLoadingDash(false)
  }

  useEffect(() => {
    if (activeSection === 'challenges') {
      fetchRetos()
    }
  }, [activeSection])

  const cancelarReto = async (retoId: string) => {
    if (!confirm('¿Cancelar este reto? Ambos jugadores quedarán libres para retar de nuevo. Úsalo solo si el reto quedó trabado (por ejemplo, uno de los dos fue desactivado).')) return
    try {
      const res = await fetch('/api/admin/cancelar-reto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cancelar')
      fetchRetos()
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
  }

  const fetchRetos = async () => {
    setLoadingRetos(true)
    const { data } = await supabase
      .from('retos')
      .select('id, estado, fecha_propuesta, cancha, nombre_cancha_foranea, comentarios, created_at, resultado_anticipado_autorizado, retador:retador_id(nombre, categoria, genero), retado:retado_id(nombre)')
      .order('created_at', { ascending: false })
    setRetos(data || [])
    setLoadingRetos(false)
  }

  const autorizarAnticipado = async (retoId: string) => {
    if (!confirm('¿Autorizar que se cargue el resultado de este partido antes de la fecha/hora programada?')) return
    const res = await fetch('/api/admin/autorizar-anticipado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retoId }),
    })
    if (res.ok) fetchRetos()
  }

  const filteredRetos = retos.filter(r => (filterEstado ? r.estado === filterEstado : true))

  const estadoColor = (estado: string): { bg: string; color: string } => {
    const map: Record<string, { bg: string; color: string }> = {
      pendiente: { bg: '#fff3cd', color: '#856404' },
      aceptado: { bg: '#d1ecf1', color: '#0c5460' },
      rechazado: { bg: '#f8d7da', color: '#721c24' },
      jugado: { bg: '#d4edda', color: '#155724' },
      no_presentado: { bg: '#e2e3e5', color: '#383d41' },
    }
    return map[estado] || { bg: '#eee', color: '#333' }
  }
  const [sorteoMsg, setSorteoMsg] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const [historial, setHistorial] = useState<any[]>([])
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null)
  const [historialPosiciones, setHistorialPosiciones] = useState<Record<string, Record<string, any[]>>>({})
  const [historialStats, setHistorialStats] = useState<Record<string, Record<string, any>>>({})

  const [nuevaTempNombre, setNuevaTempNombre] = useState('')
  const [nuevaTempInicio, setNuevaTempInicio] = useState('')
  const [nuevaTempFin, setNuevaTempFin] = useState('')
  const [nuevaTempPlazoDias, setNuevaTempPlazoDias] = useState('7')
  const [creandoTemp, setCreandoTemp] = useState(false)
  const [nuevaTempMsg, setNuevaTempMsg] = useState('')

  const [editandoTemp, setEditandoTemp] = useState(false)
  const [editTempNombre, setEditTempNombre] = useState('')
  const [editTempInicio, setEditTempInicio] = useState('')
  const [editTempFin, setEditTempFin] = useState('')
  const [editTempLimite, setEditTempLimite] = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [editTempMsg, setEditTempMsg] = useState('')

  const [jugadorManualId, setJugadorManualId] = useState('')
  const [agregandoManual, setAgregandoManual] = useState(false)
  const [agregarManualMsg, setAgregarManualMsg] = useState('')
  const [jugadoresDisponibles, setJugadoresDisponibles] = useState<any[]>([])

  useEffect(() => {
    if (activeSection === 'ladder') {
      fetchTemporadaYLadder()
      fetchHistorial()
    }
    if (activeSection === 'payments') {
      fetchTemporadaActivaSimple()
      fetchJugadoresActivos()
      fetchPagos()
    }
  }, [activeSection])

  const fetchTemporadaActivaSimple = async () => {
    const { data } = await supabase.from('temporadas').select('id, nombre').eq('estado', 'activa').maybeSingle()
    setTemporadaActivaPagos(data || null)
  }

  const fetchJugadoresActivos = async () => {
    const { data } = await supabase.from('jugadores').select('id, nombre').eq('activo', true).order('nombre', { ascending: true })
    setJugadoresParaPago(data || [])
  }

  const fetchPagos = async () => {
    setLoadingPagos(true)
    try {
      const res = await fetch('/api/admin/listar-pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) setPagos(data.pagos || [])
    } finally {
      setLoadingPagos(false)
    }
  }

  const registrarPago = async () => {
    if (!temporadaActivaPagos) {
      setPagoMsg('❌ No hay una temporada activa para registrar el pago.')
      return
    }
    if (!pagoJugadorId || !pagoMonto) {
      setPagoMsg('❌ Selecciona el jugador y escribe el monto')
      return
    }

    setRegistrandoPago(true)
    setPagoMsg('')
    try {
      const res = await fetch('/api/admin/crear-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jugadorId: pagoJugadorId,
          temporadaId: temporadaActivaPagos.id,
          tipoPago: pagoTipo,
          monto: pagoMonto,
          fecha: pagoFecha,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al registrar')

      setPagoMsg(`✅ Pago registrado — recibo #${data.numeroRecibo}`)
      setPagoJugadorId('')
      setPagoMonto('')
      fetchPagos()
    } catch (err: any) {
      setPagoMsg('❌ ' + err.message)
    } finally {
      setRegistrandoPago(false)
    }
  }

  const eliminarPago = async (pagoId: string) => {
    if (!confirm('¿Eliminar este pago? Úsalo solo si fue un error de registro.')) return
    try {
      const res = await fetch('/api/admin/eliminar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      fetchPagos()
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
  }

  const fetchHistorial = async () => {
    const { data } = await supabase
      .from('temporadas')
      .select('id, nombre, estado, fecha_inicio, fecha_fin')
      .eq('estado', 'finalizada')
      .order('fecha_fin', { ascending: false })
    setHistorial(data || [])
  }

  const verHistorialTemporada = async (temporadaId: string) => {
    if (historialAbierto === temporadaId) {
      setHistorialAbierto(null)
      return
    }
    setHistorialAbierto(temporadaId)

    if (!historialPosiciones[temporadaId]) {
      const { data: posiciones } = await supabase
        .from('ladder_posiciones')
        .select('id, jugador_id, categoria, genero, posicion, posicion_inicial, jugadores(nombre)')
        .eq('temporada_id', temporadaId)
        .order('categoria', { ascending: true })
        .order('genero', { ascending: true })
        .order('posicion', { ascending: true })

      const agrupado: Record<string, any[]> = {}
      ;(posiciones || []).forEach((p: any) => {
        const key = `${p.categoria}__${p.genero}`
        if (!agrupado[key]) agrupado[key] = []
        agrupado[key].push(p)
      })
      setHistorialPosiciones((prev) => ({ ...prev, [temporadaId]: agrupado }))
    }

    if (!historialStats[temporadaId]) {
      const { data: retosTemp } = await supabase
        .from('retos')
        .select('id, retador_id, retado_id')
        .eq('temporada_id', temporadaId)

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

      setHistorialStats((prev) => ({ ...prev, [temporadaId]: stats }))
    }
  }

  const abrirEdicionTemporada = () => {
    if (!temporadaActiva) return
    setEditTempNombre(temporadaActiva.nombre)
    setEditTempInicio(temporadaActiva.fecha_inicio || '')
    setEditTempFin(temporadaActiva.fecha_fin || '')
    setEditTempLimite(temporadaActiva.fecha_limite_inscripcion || '')
    setEditTempMsg('')
    setEditandoTemp(true)
  }

  const guardarEdicionTemporada = async () => {
    if (!temporadaActiva) return
    if (!editTempNombre.trim() || !editTempInicio || !editTempFin) {
      setEditTempMsg('❌ Completa nombre, fecha de inicio y fecha de fin')
      return
    }

    setGuardandoEdicion(true)
    setEditTempMsg('')
    try {
      const res = await fetch('/api/admin/editar-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temporadaId: temporadaActiva.id,
          nombre: editTempNombre,
          fechaInicio: editTempInicio,
          fechaFin: editTempFin,
          fechaLimite: editTempLimite,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      setEditandoTemp(false)
      fetchTemporadaYLadder()
    } catch (err: any) {
      setEditTempMsg('❌ Error al guardar: ' + err.message)
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const cerrarTemporada = async () => {
    if (!temporadaActiva) return
    if (!confirm(`¿Cerrar "${temporadaActiva.nombre}"? El ranking quedará congelado como historial y ya no se podrán retar jugadores en esta temporada. Esta acción no se puede deshacer desde aquí.`)) return

    setCerrando(true)
    setSorteoMsg('')
    try {
      const res = await fetch('/api/admin/cerrar-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporadaId: temporadaActiva.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cerrar')

      setSorteoMsg('✅ Temporada cerrada. El ranking final quedó guardado en el historial.')
      fetchTemporadaYLadder()
      fetchHistorial()
    } catch (err: any) {
      setSorteoMsg('❌ Error al cerrar la temporada: ' + err.message)
    } finally {
      setCerrando(false)
    }
  }

  const crearTemporada = async () => {
    if (!nuevaTempNombre.trim() || !nuevaTempInicio || !nuevaTempFin) {
      setNuevaTempMsg('❌ Completa nombre, fecha de inicio y fecha de fin')
      return
    }

    setCreandoTemp(true)
    setNuevaTempMsg('')
    try {
      const res = await fetch('/api/admin/crear-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevaTempNombre,
          fechaInicio: nuevaTempInicio,
          fechaFin: nuevaTempFin,
          plazoDias: nuevaTempPlazoDias,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear la temporada')

      setNuevaTempMsg(`✅ Nueva temporada creada y activada. Inscripciones abiertas hasta ${data.fechaLimite}.`)
      setNuevaTempNombre('')
      setNuevaTempInicio('')
      setNuevaTempFin('')
      fetchTemporadaYLadder()
      fetchHistorial()
    } catch (err: any) {
      setNuevaTempMsg('❌ ' + err.message)
    } finally {
      setCreandoTemp(false)
    }
  }

  const fetchTemporadaYLadder = async () => {
    setLoading(true)
    const { data: temporada } = await supabase
      .from('temporadas')
      .select('id, nombre, estado, sorteo_realizado, fecha_limite_inscripcion, fecha_inicio, fecha_fin')
      .eq('estado', 'activa')
      .maybeSingle()
    setTemporadaActiva(temporada || null)

    if (temporada) {
      const { data: posiciones } = await supabase
        .from('ladder_posiciones')
        .select('id, jugador_id, categoria, genero, posicion, posicion_inicial, jugadores(nombre)')
        .eq('temporada_id', temporada.id)
        .order('categoria', { ascending: true })
        .order('genero', { ascending: true })
        .order('posicion', { ascending: true })

      const agrupado: Record<string, any[]> = {}
      const idsAnotados = new Set<string>()
      ;(posiciones || []).forEach((p: any) => {
        const key = `${p.categoria}__${p.genero}`
        if (!agrupado[key]) agrupado[key] = []
        agrupado[key].push(p)
        idsAnotados.add(p.jugador_id)
      })
      setLadderPreview(agrupado)

      // Estadísticas de la temporada activa (partidos jugados/ganados/perdidos/no presentado)
      const { data: retosTemp } = await supabase
        .from('retos')
        .select('id, retador_id, retado_id')
        .eq('temporada_id', temporada.id)

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

      setLadderStats(stats)

      const { data: todosJugadores } = await supabase
        .from('jugadores')
        .select('id, nombre, categoria, genero')
        .eq('activo', true)
        .order('nombre', { ascending: true })

      setJugadoresDisponibles((todosJugadores || []).filter((j: any) => !idsAnotados.has(j.id)))
    }
    setLoading(false)
  }

  const agregarJugadorManual = async () => {
    if (!temporadaActiva || !jugadorManualId) return

    setAgregandoManual(true)
    setAgregarManualMsg('')
    try {
      const res = await fetch('/api/admin/agregar-jugador-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporadaId: temporadaActiva.id, jugadorId: jugadorManualId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al agregar')

      setAgregarManualMsg(`✅ ${data.nombre} fue agregado al final del escalafón.`)
      setJugadorManualId('')
      fetchTemporadaYLadder()
    } catch (err: any) {
      setAgregarManualMsg('❌ ' + err.message)
    } finally {
      setAgregandoManual(false)
    }
  }

  const realizarSorteo = async () => {
    if (!temporadaActiva) return
    if (temporadaActiva.sorteo_realizado) {
      setSorteoMsg('❌ El sorteo de esta temporada ya se realizó y no puede repetirse.')
      return
    }

    if (!confirm('¿Realizar el sorteo aleatorio de posiciones entre los jugadores que ya se anotaron a esta temporada? Esta acción no se puede repetir.')) return

    setSorteando(true)
    setSorteoMsg('')

    try {
      const res = await fetch('/api/admin/realizar-sorteo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporadaId: temporadaActiva.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al sortear')

      setSorteoMsg(`✅ Sorteo realizado — ${data.count} jugadores ubicados en el escalafón.`)
      fetchTemporadaYLadder()
    } catch (err: any) {
      setSorteoMsg('❌ ' + err.message)
    } finally {
      setSorteando(false)
    }
  }

  useEffect(() => {
    if (activeSection === 'players') {
      fetchPlayers()
    }
  }, [activeSection])

  const fetchPlayers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('jugadores')
      .select('id, nombre, email, telefono, numero_accion, categoria, genero, activo, created_at')
      .order('created_at', { ascending: false })
    if (!error) setPlayers(data || [])
    setLoading(false)
  }

  const deletePlayer = async (id: string) => {
    if (!confirm('¿Seguro que quieres eliminar este jugador?')) return
    try {
      const res = await fetch('/api/admin/delete-jugador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadorId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      fetchPlayers()
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
  }

  const abrirEdicionJugador = (jugador: any) => {
    setEditandoJugadorId(jugador.id)
    setEditJugadorForm({
      nombre: jugador.nombre || '',
      email: jugador.email || '',
      telefono: jugador.telefono || '',
      categoria: jugador.categoria || '',
      genero: jugador.genero || '',
      numeroAccion: jugador.numero_accion || '',
      activo: jugador.activo !== false,
    })
    setEditJugadorMsg('')
  }

  const guardarEdicionJugador = async () => {
    if (!editandoJugadorId) return
    if (!editJugadorForm.nombre?.trim() || !editJugadorForm.email?.trim()) {
      setEditJugadorMsg('❌ Nombre y email son obligatorios')
      return
    }

    setGuardandoJugador(true)
    setEditJugadorMsg('')
    try {
      const res = await fetch('/api/admin/editar-jugador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadorId: editandoJugadorId, ...editJugadorForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      setEditandoJugadorId(null)
      fetchPlayers()
    } catch (err: any) {
      setEditJugadorMsg('❌ ' + err.message)
    } finally {
      setGuardandoJugador(false)
    }
  }

  const filteredPlayers = players.filter(p => {
    const matchCat = filterCategoria ? p.categoria === filterCategoria : true
    const matchGen = filterGenero ? p.genero === filterGenero : true
    return matchCat && matchGen
  })

  const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'players', icon: '👥', label: 'Jugadores' },
    { id: 'challenges', icon: '⚔️', label: 'Desafíos' },
    { id: 'results', icon: '🏆', label: 'Resultados' },
    { id: 'ladder', icon: '🎾', label: 'Escalafón' },
    { id: 'payments', icon: '💳', label: 'Pagos' },
  ]

  const categoriaLabel = (value: string) => CATEGORIAS.find(c => c.value === value)?.label || value
  const generoLabel = (value: string) => GENEROS.find(g => g.value === value)?.label || value

  const getCategoriaColor = (cat: string) => {
    const colors: any = {
      sexta_novatos: '#8B4513',
      sexta: 'var(--color-court)',
      quinta: '#C0C0C0',
      cuarta: 'var(--color-ball)'
    }
    return colors[cat] || '#666'
  }

  return (
    <div className="admin-shell" style={{ fontFamily: 'var(--font-body)' }}>

      {/* SIDEBAR */}
      <div className="admin-sidebar court-bg" style={{
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="admin-sidebar-header" style={{ textAlign: 'center', padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          <img src="/logo-hgv.png" alt="Escudo HGV" style={{ width: '62px', height: '62px', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-chalk)', fontSize: '15px', marginTop: '8px' }}>HGV Tennis</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Panel Admin</div>
        </div>

        <nav className="admin-nav" style={{ marginTop: '20px', flex: 1 }}>
          {menuItems.map(item => (
            <button
              key={item.id}
              data-active={activeSection === item.id}
              onClick={() => setActiveSection(item.id)}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: activeSection === item.id ? 'rgba(255,255,255,0.2)' : 'transparent',
                border: 'none',
                color: 'var(--color-chalk)',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '15px',
                borderLeft: activeSection === item.id ? '4px solid var(--color-ball)' : '4px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer" style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <a href="/" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', textDecoration: 'none' }}>
            ← Volver al inicio
          </a>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="admin-content" style={{ background: '#f5f5f5', overflow: 'auto' }}>

        {/* HEADER */}
        <div style={{
          background: 'var(--color-chalk)',
          padding: '20px 30px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <h1 style={{ margin: 0, color: 'var(--color-ink)', fontSize: '24px' }}>
            {menuItems.find(m => m.id === activeSection)?.icon}{' '}
            {menuItems.find(m => m.id === activeSection)?.label}
          </h1>
          <span style={{ color: '#888', fontSize: '14px' }}>
            🕐 {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>

        <div className="admin-content-inner" style={{ padding: '30px' }}>

          {/* DASHBOARD */}
          {activeSection === 'dashboard' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                {[
                  { icon: '👥', label: 'Jugadores', value: loadingDash ? '…' : dashStats.jugadores, color: 'var(--color-ink)' },
                  { icon: '⚔️', label: 'Desafíos Activos', value: loadingDash ? '…' : dashStats.desafiosActivos, color: '#e67e22' },
                  { icon: '🏆', label: 'Partidos Jugados', value: loadingDash ? '…' : dashStats.partidosJugados, color: '#3498db' },
                  { icon: '📅', label: 'Este Mes', value: loadingDash ? '…' : dashStats.esteMes, color: '#9b59b6' },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: 'var(--color-chalk)',
                    borderRadius: '12px',
                    padding: '24px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                    borderTop: `4px solid ${card.color}`
                  }}>
                    <div style={{ fontSize: '32px' }}>{card.icon}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 'bold', color: card.color, margin: '8px 0' }}>{card.value}</div>
                    <div style={{ color: '#888', fontSize: '14px' }}>{card.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '30px' }}>
                <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>📢 Anuncio del club</h3>
                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px 0' }}>
                  Se muestra como banner en la página de inicio cuando está activo.
                </p>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Título</label>
                  <input
                    type="text"
                    value={anuncioTitulo}
                    onChange={(e) => setAnuncioTitulo(e.target.value)}
                    placeholder="Ej: Torneo de aniversario — 15 de agosto"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Descripción (opcional)</label>
                  <textarea
                    value={anuncioDescripcion}
                    onChange={(e) => setAnuncioDescripcion(e.target.value)}
                    placeholder="Ej: Inscríbete antes del 10 de agosto en la recepción del club."
                    rows={2}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#333', marginBottom: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={anuncioActivo} onChange={(e) => setAnuncioActivo(e.target.checked)} />
                  Mostrar este anuncio en la página de inicio
                </label>
                <button
                  onClick={guardarAnuncio}
                  disabled={guardandoAnuncio}
                  style={{
                    background: guardandoAnuncio ? '#ccc' : 'var(--color-court)', color: 'white', border: 'none',
                    padding: '10px 20px', borderRadius: '8px', cursor: guardandoAnuncio ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold'
                  }}
                >
                  {guardandoAnuncio ? 'Guardando...' : '✅ Guardar anuncio'}
                </button>
                {anuncioMsg && (
                  <div style={{
                    marginTop: '12px', padding: '10px', borderRadius: '8px', fontSize: '13px',
                    background: anuncioMsg.includes('✅') ? '#d4edda' : '#f8d7da',
                    color: anuncioMsg.includes('✅') ? '#155724' : '#721c24',
                  }}>
                    {anuncioMsg}
                  </div>
                )}
              </div>
              <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>👋 Bienvenido al Panel de Administración</h3>
                <p style={{ color: '#666' }}>Desde aquí puedes gestionar jugadores, desafíos, resultados y el escalafón del club.</p>
                <button
                  onClick={() => setActiveSection('players')}
                  style={{
                    background: 'var(--color-court)', color: 'var(--color-chalk)', border: 'none',
                    padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                  }}
                >
                  👥 Ver Jugadores
                </button>
              </div>
            </div>
          )}

          {/* JUGADORES */}
          {activeSection === 'players' && (
            <div>
              {/* Filtros */}
              <div style={{
                background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px',
                marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap'
              }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>🔍 Filtrar:</span>

                <select
                  value={filterGenero}
                  onChange={(e) => setFilterGenero(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                >
                  <option value="">👥 Todos los géneros</option>
                  {GENEROS.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>

                <select
                  value={filterCategoria}
                  onChange={(e) => setFilterCategoria(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                >
                  <option value="">🏆 Todas las categorías</option>
                  {CATEGORIAS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>

                <button
                  onClick={fetchPlayers}
                  style={{
                    background: 'var(--color-court)', color: 'var(--color-chalk)', border: 'none',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                  }}
                >
                  🔄 Actualizar
                </button>

                <span style={{ marginLeft: 'auto', color: '#888', fontSize: '14px' }}>
                  Total: <strong>{filteredPlayers.length}</strong> jugadores
                </span>
              </div>

              {/* Tabla */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }} className="loading-row"><span className="spinner" /> Cargando jugadores...</div>
              ) : (
                <div className="table-scroll" style={{ background: 'var(--color-chalk)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-court)', color: 'var(--color-chalk)' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>#</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>👤 Nombre</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📧 Email</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📱 Teléfono</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>🎫 Acción</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>👥 Género</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>🏆 Categoría</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📅 Registro</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center' }}>⚙️ Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                            😔 No hay jugadores registrados aún
                          </td>
                        </tr>
                      ) : (
                        filteredPlayers.map((player, index) => (
                          <Fragment key={player.id}>
                          <tr style={{
                            borderBottom: '1px solid #f0f0f0',
                            background: index % 2 === 0 ? 'var(--color-chalk)' : '#fafafa'
                          }}>
                            <td style={{ padding: '12px 16px', color: '#888', fontSize: '14px' }}>{index + 1}</td>
                            <td style={{ padding: '12px 16px', fontWeight: '600', color: '#333' }}>{player.nombre}</td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>{player.email}</td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>{player.telefono}</td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>{player.numero_accion || '—'}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                background: player.genero === 'caballeros' ? '#dbeafe' : '#fce7f3',
                                color: player.genero === 'caballeros' ? '#1e40af' : '#9d174d',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: '600'
                              }}>
                                {player.genero === 'caballeros' ? '♂️' : '♀️'} {generoLabel(player.genero)}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                background: getCategoriaColor(player.categoria),
                                color: 'var(--color-chalk)',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: '600'
                              }}>
                                {categoriaLabel(player.categoria)}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', color: '#888', fontSize: '13px' }}>
                              {player.created_at ? new Date(player.created_at).toLocaleDateString('es-ES') : '—'}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <button
                                onClick={() => abrirEdicionJugador(player)}
                                style={{
                                  background: '#dbeafe', color: '#1e40af', border: 'none',
                                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', marginRight: '6px'
                                }}
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => deletePlayer(player.id)}
                                style={{
                                  background: '#fee2e2', color: '#dc2626', border: 'none',
                                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
                                }}
                              >
                                🗑️ Eliminar
                              </button>
                            </td>
                          </tr>
                          {editandoJugadorId === player.id && (
                            <tr>
                              <td colSpan={9} style={{ padding: '16px', background: '#f8f9fa' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Nombre</label>
                                    <input
                                      type="text"
                                      value={editJugadorForm.nombre}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, nombre: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Email</label>
                                    <input
                                      type="email"
                                      value={editJugadorForm.email}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, email: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Teléfono</label>
                                    <input
                                      type="text"
                                      value={editJugadorForm.telefono}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, telefono: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Número de acción</label>
                                    <input
                                      type="text"
                                      value={editJugadorForm.numeroAccion}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, numeroAccion: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Género</label>
                                    <select
                                      value={editJugadorForm.genero}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, genero: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    >
                                      {GENEROS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Categoría</label>
                                    <select
                                      value={editJugadorForm.categoria}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, categoria: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    >
                                      {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Activo</label>
                                    <select
                                      value={editJugadorForm.activo ? 'si' : 'no'}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, activo: e.target.value === 'si' })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    >
                                      <option value="si">Sí</option>
                                      <option value="no">No</option>
                                    </select>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    onClick={guardarEdicionJugador}
                                    disabled={guardandoJugador}
                                    style={{ background: guardandoJugador ? '#ccc' : 'var(--color-court)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: guardandoJugador ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                                  >
                                    {guardandoJugador ? 'Guardando...' : '✅ Guardar cambios'}
                                  </button>
                                  <button
                                    onClick={() => setEditandoJugadorId(null)}
                                    style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                                {editJugadorMsg && (
                                  <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', background: '#f8d7da', color: '#721c24', fontSize: '13px' }}>
                                    {editJugadorMsg}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DESAFÍOS */}
          {activeSection === 'challenges' && (
            <div>
              <div style={{
                background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px',
                marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap'
              }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>🔍 Filtrar por estado:</span>
                <select
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                >
                  <option value="">Todos los estados</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="aceptado">Aceptado</option>
                  <option value="jugado">Jugado</option>
                  <option value="rechazado">Rechazado</option>
                  <option value="no_presentado">No presentado</option>
                </select>
                <button
                  onClick={fetchRetos}
                  style={{ background: 'var(--color-court)', color: 'var(--color-chalk)', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
                >
                  🔄 Actualizar
                </button>
                <span style={{ marginLeft: 'auto', color: '#888', fontSize: '14px' }}>
                  Total: <strong>{filteredRetos.length}</strong> desafíos
                </span>
              </div>

              {loadingRetos ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }} className="loading-row"><span className="spinner" /> Cargando desafíos...</div>
              ) : (
                <div className="table-scroll" style={{ background: 'var(--color-chalk)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-court)', color: 'var(--color-chalk)' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>⚔️ Retador</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>🆚 Retado</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>🏆 Categoría</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📅 Fecha propuesta</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>🎾 Cancha</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>Estado</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRetos.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                            😔 No hay desafíos que coincidan con el filtro
                          </td>
                        </tr>
                      ) : (
                        filteredRetos.map((r, index) => {
                          const ec = estadoColor(r.estado)
                          return (
                            <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', background: index % 2 === 0 ? 'var(--color-chalk)' : '#fafafa' }}>
                              <td style={{ padding: '12px 16px', fontWeight: '600', color: '#333' }}>{r.retador?.nombre || '—'}</td>
                              <td style={{ padding: '12px 16px', color: '#333' }}>{r.retado?.nombre || '—'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555' }}>
                                {CATEGORIAS.find(c => c.value === r.retador?.categoria)?.label || '—'}
                                {' — '}
                                {GENEROS.find(g => g.value === r.retador?.genero)?.label || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555' }}>
                                {r.fecha_propuesta ? new Date(r.fecha_propuesta).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555' }}>
                                {r.cancha === 'FORANEA' ? (r.nombre_cancha_foranea || 'Foránea') : r.cancha === 'HGV1' ? 'HGV 1' : r.cancha === 'HGV2' ? 'HGV 2' : '—'}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ background: ec.bg, color: ec.color, padding: '4px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>
                                  {r.estado}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                {r.estado === 'aceptado' && r.fecha_propuesta && new Date() < new Date(r.fecha_propuesta) && (
                                  r.resultado_anticipado_autorizado ? (
                                    <span style={{ fontSize: '12px', color: '#28a745', fontWeight: 'bold' }}>✅ Autorizado</span>
                                  ) : (
                                    <button
                                      onClick={() => autorizarAnticipado(r.id)}
                                      style={{ background: '#e67e22', color: 'var(--color-chalk)', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginRight: '6px', marginBottom: '4px' }}
                                    >
                                      Autorizar carga anticipada
                                    </button>
                                  )
                                )}
                                {['pendiente', 'aceptado'].includes(r.estado) && (
                                  <button
                                    onClick={() => cancelarReto(r.id)}
                                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                  >
                                    Cancelar reto
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* RESULTADOS */}
          {activeSection === 'results' && (
            <div>
              <div style={{
                background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px',
                marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                display: 'flex', gap: '16px', alignItems: 'center'
              }}>
                <button
                  onClick={fetchResultados}
                  style={{ background: 'var(--color-court)', color: 'var(--color-chalk)', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
                >
                  🔄 Actualizar
                </button>
                <span style={{ marginLeft: 'auto', color: '#888', fontSize: '14px' }}>
                  Total: <strong>{resultados.length}</strong> resultados
                </span>
              </div>

              {resultadosMsg && (
                <div style={{
                  marginBottom: '20px', padding: '12px', borderRadius: '8px',
                  background: resultadosMsg.includes('✅') ? '#d4edda' : '#f8d7da',
                  color: resultadosMsg.includes('✅') ? '#155724' : '#721c24',
                }}>
                  {resultadosMsg}
                </div>
              )}

              {loadingResultados ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }} className="loading-row"><span className="spinner" /> Cargando resultados...</div>
              ) : (
                <>
                  {/* PENDIENTES DE VALIDAR */}
                  <h3 style={{ color: 'var(--color-ink)' }}>⏳ Pendientes de validar</h3>
                  {resultados.filter(r => !r.validado).length === 0 ? (
                    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#888', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '30px' }}>
                      No hay resultados esperando validación.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '30px' }}>
                      {resultados.filter(r => !r.validado).map((r) => (
                        <div key={r.id} style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <p style={{ margin: '0 0 4px 0', fontWeight: '600', color: '#333' }}>
                              {r.retos?.retador?.nombre} vs {r.retos?.retado?.nombre}
                              {r.no_presentado && (
                                <span style={{ marginLeft: '8px', fontSize: '11px', background: '#f8d7da', color: '#721c24', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                  NO PRESENTADO
                                </span>
                              )}
                            </p>
                            <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#555' }}>
                              Marcador: {r.marcador_retador} — {r.marcador_retado} · Ganador: <strong>{r.ganador?.nombre}</strong>
                            </p>
                            <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
                              {CATEGORIAS.find(c => c.value === r.retos?.retador?.categoria)?.label} — {GENEROS.find(g => g.value === r.retos?.retador?.genero)?.label}
                              {' · '}Enviado {new Date(r.created_at).toLocaleDateString('es-ES')}
                            </p>
                          </div>
                          <button
                            onClick={() => aprobarResultado(r)}
                            disabled={aprobando === r.id}
                            style={{
                              background: aprobando === r.id ? '#ccc' : '#28a745', color: 'var(--color-chalk)', border: 'none',
                              padding: '10px 18px', borderRadius: '8px', cursor: aprobando === r.id ? 'not-allowed' : 'pointer',
                              fontSize: '14px', fontWeight: 'bold'
                            }}
                          >
                            {aprobando === r.id ? '⏳ Aprobando...' : '✅ Aprobar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* HISTORIAL VALIDADO */}
                  <h3 style={{ color: 'var(--color-ink)' }}>✅ Historial validado</h3>
                  {resultados.filter(r => r.validado).length === 0 ? (
                    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#888', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                      Todavía no hay resultados validados.
                    </div>
                  ) : (
                    <div className="table-scroll" style={{ background: 'var(--color-chalk)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-court)', color: 'var(--color-chalk)' }}>
                            <th style={{ padding: '14px 16px', textAlign: 'left' }}>Partido</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left' }}>Marcador</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left' }}>🏆 Ganador</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left' }}>🔀 Intercambio</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left' }}>🏆 Categoría</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left' }}>📅 Validado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultados.filter(r => r.validado).map((r, index) => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', background: index % 2 === 0 ? 'var(--color-chalk)' : '#fafafa' }}>
                              <td style={{ padding: '12px 16px', color: '#333' }}>
                                {r.retos?.retador?.nombre} vs {r.retos?.retado?.nombre}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555' }}>
                                {r.no_presentado ? (
                                  <span style={{ color: '#c0392b', fontWeight: 600 }}>
                                    ⚠️ No se presentó: {r.ganador_id === r.retos?.retador_id ? r.retos?.retado?.nombre : r.retos?.retador?.nombre}
                                  </span>
                                ) : (
                                  <>{r.marcador_retador} — {r.marcador_retado}</>
                                )}
                              </td>
                              <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-ink)' }}>
                                {r.ganador?.nombre || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                {r.posiciones_intercambiadas ? '✅ Sí' : '— No'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555' }}>
                                {CATEGORIAS.find(c => c.value === r.retos?.retador?.categoria)?.label || '—'}
                                {' — '}
                                {GENEROS.find(g => g.value === r.retos?.retador?.genero)?.label || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#888' }}>
                                {new Date(r.created_at).toLocaleDateString('es-ES')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ESCALAFÓN */}
          {activeSection === 'ladder' && (
            <div>
              {/* CREAR / ACTIVAR TEMPORADA */}
              <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>🆕 Crear y activar nueva temporada</h3>
                {temporadaActiva && (
                  <p style={{ fontSize: '13px', color: '#e67e22', margin: '0 0 10px 0' }}>
                    ⚠️ Ya hay una temporada activa ("{temporadaActiva.nombre}"). Debes cerrarla (o editar sus fechas abajo) antes de poder crear una nueva.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Nombre (ej: Temporada 2027)"
                    value={nuevaTempNombre}
                    onChange={(e) => setNuevaTempNombre(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px', flex: '1 1 200px' }}
                  />
                  <input
                    type="date"
                    value={nuevaTempInicio}
                    onChange={(e) => setNuevaTempInicio(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                  />
                  <input
                    type="date"
                    value={nuevaTempFin}
                    onChange={(e) => setNuevaTempFin(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                  />
                  <select
                    value={nuevaTempPlazoDias}
                    onChange={(e) => setNuevaTempPlazoDias(e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                  >
                    <option value="5">Plazo: 5 días</option>
                    <option value="7">Plazo: 7 días</option>
                    <option value="10">Plazo: 10 días</option>
                  </select>
                </div>
                <p style={{ fontSize: '12px', color: '#888', margin: '-4px 0 10px 0' }}>
                  Plazo de inscripción: los jugadores tendrán ese número de días para anotarse antes del sorteo.
                </p>
                <button
                  onClick={crearTemporada}
                  disabled={creandoTemp}
                  style={{
                    background: creandoTemp ? '#ccc' : 'var(--color-court)', color: 'var(--color-chalk)', border: 'none',
                    padding: '10px 20px', borderRadius: '8px', cursor: creandoTemp ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold'
                  }}
                >
                  {creandoTemp ? '⏳ Creando...' : '✅ Crear y activar'}
                </button>
                {nuevaTempMsg && (
                  <div style={{
                    marginTop: '10px', padding: '10px', borderRadius: '8px',
                    background: nuevaTempMsg.includes('✅') ? '#d4edda' : '#f8d7da',
                    color: nuevaTempMsg.includes('✅') ? '#155724' : '#721c24',
                  }}>
                    {nuevaTempMsg}
                  </div>
                )}
              </div>

              {!temporadaActiva ? (
                <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize: '60px' }}>🎾</div>
                  <h2 style={{ color: 'var(--color-ink)' }}>No hay temporada activa</h2>
                  <p style={{ color: '#888' }}>Crea una temporada con estado 'activa' antes de sortear el escalafón.</p>
                </div>
              ) : (
                <>
                  <div style={{
                    background: 'linear-gradient(165deg, #0f1b26 0%, #123a5c 55%, #1c7ec4 100%)',
                    borderRadius: '12px', padding: '28px 24px', marginBottom: '20px',
                    textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '12px',
                      letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0,
                    }}>
                      Temporada activa
                    </p>
                    <h2 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-chalk)',
                      fontSize: 'clamp(24px, 4vw, 34px)', margin: '6px 0 0 0',
                    }}>
                      {temporadaActiva.nombre}
                    </h2>
                    {temporadaActiva.fecha_inicio && temporadaActiva.fecha_fin && (
                      <p style={{
                        fontFamily: 'var(--font-mono)', color: 'rgba(247,243,234,0.8)', fontSize: '13px', marginTop: '10px',
                      }}>
                        {temporadaActiva.fecha_inicio} → {temporadaActiva.fecha_fin}
                      </p>
                    )}
                  </div>

                  <div style={{
                    background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px',
                    marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>
                        🎲 Sorteo de posiciones — {temporadaActiva.nombre}
                      </h3>
                      {!editandoTemp && (
                        <button
                          onClick={abrirEdicionTemporada}
                          style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                        >
                          ✏️ Editar nombre/fechas
                        </button>
                      )}
                    </div>

                    {temporadaActiva.fecha_limite_inscripcion && !editandoTemp && (() => {
                      const hoy = new Date().toISOString().slice(0, 10)
                      const cerrado = hoy > temporadaActiva.fecha_limite_inscripcion
                      return (
                        <p style={{
                          fontSize: '13px', margin: '0 0 12px 0', fontWeight: 'bold',
                          color: cerrado ? '#c0392b' : '#28a745'
                        }}>
                          {cerrado
                            ? `🔒 Inscripción cerrada desde ${temporadaActiva.fecha_limite_inscripcion} — quien se anote ahora entra al final de la fila.`
                            : `🟢 Inscripción abierta hasta ${temporadaActiva.fecha_limite_inscripcion}`}
                        </p>
                      )
                    })()}

                    {editandoTemp && (
                      <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          <input
                            type="text"
                            value={editTempNombre}
                            onChange={(e) => setEditTempNombre(e.target.value)}
                            style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px', flex: '1 1 200px' }}
                          />
                          <input
                            type="date"
                            value={editTempInicio}
                            onChange={(e) => setEditTempInicio(e.target.value)}
                            style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                          />
                          <input
                            type="date"
                            value={editTempFin}
                            onChange={(e) => setEditTempFin(e.target.value)}
                            style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                          />
                          <div>
                            <label style={{ fontSize: '11px', color: '#888', display: 'block' }}>Límite de inscripción</label>
                            <input
                              type="date"
                              value={editTempLimite}
                              onChange={(e) => setEditTempLimite(e.target.value)}
                              style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={guardarEdicionTemporada}
                            disabled={guardandoEdicion}
                            style={{ background: guardandoEdicion ? '#ccc' : 'var(--color-court)', color: 'var(--color-chalk)', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: guardandoEdicion ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                          >
                            {guardandoEdicion ? '⏳ Guardando...' : '✅ Guardar cambios'}
                          </button>
                          <button
                            onClick={() => setEditandoTemp(false)}
                            style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                          >
                            Cancelar
                          </button>
                        </div>
                        {editTempMsg && (
                          <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', background: '#f8d7da', color: '#721c24', fontSize: '13px' }}>
                            {editTempMsg}
                          </div>
                        )}
                      </div>
                    )}

                    <p style={{ color: '#666' }}>
                      {temporadaActiva.sorteo_realizado
                        ? 'El sorteo de esta temporada ya se realizó y quedó fijo — no puede repetirse. Para agregar jugadores tarde, usa "Agregar manualmente" abajo.'
                        : 'Todavía no se ha hecho el sorteo. Esto asignará una posición inicial aleatoria a cada jugador que ya se haya ANOTADO a esta temporada, dentro de su categoría y género.'}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {!temporadaActiva.sorteo_realizado && (
                        <button
                          onClick={realizarSorteo}
                          disabled={sorteando || cerrando}
                          style={{
                            background: sorteando ? '#ccc' : '#e67e22', color: 'var(--color-chalk)', border: 'none',
                            padding: '12px 24px', borderRadius: '8px', cursor: sorteando ? 'not-allowed' : 'pointer',
                            fontSize: '15px', fontWeight: 'bold'
                          }}
                        >
                          {sorteando ? '⏳ Sorteando...' : '🎲 Realizar sorteo'}
                        </button>
                      )}
                      <button
                        onClick={cerrarTemporada}
                        disabled={sorteando || cerrando}
                        style={{
                          background: cerrando ? '#ccc' : '#c0392b', color: 'var(--color-chalk)', border: 'none',
                          padding: '12px 24px', borderRadius: '8px', cursor: cerrando ? 'not-allowed' : 'pointer',
                          fontSize: '15px', fontWeight: 'bold'
                        }}
                      >
                        {cerrando ? '⏳ Cerrando...' : '🔒 Cerrar temporada'}
                      </button>
                    </div>
                    {sorteoMsg && (
                      <div style={{
                        marginTop: '14px', padding: '10px', borderRadius: '8px',
                        background: sorteoMsg.includes('✅') ? '#d4edda' : '#f8d7da',
                        color: sorteoMsg.includes('✅') ? '#155724' : '#721c24',
                      }}>
                        {sorteoMsg}
                      </div>
                    )}

                    {temporadaActiva.sorteo_realizado && (
                      <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid #eee' }}>
                        <h4 style={{ color: 'var(--color-ink)', margin: '0 0 8px 0' }}>➕ Agregar jugador manualmente</h4>
                        <p style={{ fontSize: '13px', color: '#888', margin: '0 0 10px 0' }}>
                          Para socios que se anotan tarde (después del plazo). Entran al final de su categoría/género, sin pasar por el sorteo.
                        </p>
                        {jugadoresDisponibles.length === 0 ? (
                          <p style={{ fontSize: '13px', color: '#888' }}>Todos los socios activos ya están en el escalafón.</p>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <select
                              value={jugadorManualId}
                              onChange={(e) => setJugadorManualId(e.target.value)}
                              style={{ padding: '10px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px', flex: '1 1 240px' }}
                            >
                              <option value="">-- Selecciona un jugador --</option>
                              {jugadoresDisponibles.map((j) => (
                                <option key={j.id} value={j.id}>
                                  {j.nombre} ({CATEGORIAS.find(c => c.value === j.categoria)?.label} — {GENEROS.find(g => g.value === j.genero)?.label})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={agregarJugadorManual}
                              disabled={!jugadorManualId || agregandoManual}
                              style={{
                                background: !jugadorManualId || agregandoManual ? '#ccc' : 'var(--color-court)', color: 'var(--color-chalk)', border: 'none',
                                padding: '10px 18px', borderRadius: '8px', cursor: !jugadorManualId || agregandoManual ? 'not-allowed' : 'pointer',
                                fontSize: '14px', fontWeight: 'bold'
                              }}
                            >
                              {agregandoManual ? '⏳ Agregando...' : '✅ Agregar al escalafón'}
                            </button>
                          </div>
                        )}
                        {agregarManualMsg && (
                          <div style={{
                            marginTop: '10px', padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
                            background: agregarManualMsg.includes('✅') ? '#d4edda' : '#f8d7da',
                            color: agregarManualMsg.includes('✅') ? '#155724' : '#721c24',
                          }}>
                            {agregarManualMsg}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }} className="loading-row"><span className="spinner" /> Cargando escalafón...</div>
                  ) : Object.keys(ladderPreview).length === 0 ? (
                    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#888', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                      Todavía no hay posiciones asignadas. Usa el botón de arriba para sortear.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                      {Object.entries(ladderPreview).map(([key, lista]) => {
                        const [catVal, genVal] = key.split('__')
                        const catLabel = CATEGORIAS.find(c => c.value === catVal)?.label || catVal
                        const genLabel = GENEROS.find(g => g.value === genVal)?.label || genVal
                        return (
                          <div key={key} style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                            <h4 style={{ color: 'var(--color-ink)', marginTop: 0 }}>{catLabel} — {genLabel}</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ color: '#888', textAlign: 'left' }}>
                                  <th style={{ padding: '2px 4px' }}>#</th>
                                  <th style={{ padding: '2px 4px' }}>Jugador</th>
                                  <th style={{ padding: '2px 4px' }}>Inicial</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>PJ</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>G</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>P</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>NP</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lista.map((p: any) => {
                                  const inicial = p.posicion_inicial ?? p.posicion
                                  const diferencia = inicial - p.posicion
                                  const s = ladderStats[p.jugador_id] || { jugados: 0, ganados: 0, perdidos: 0, noPresentado: 0 }
                                  return (
                                    <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                                      <td style={{ padding: '4px', fontWeight: 'bold', color: 'var(--color-ink)' }}>{p.posicion}</td>
                                      <td style={{ padding: '4px', color: '#333' }}>{p.jugadores?.nombre || 'Jugador'}</td>
                                      <td style={{ padding: '4px', color: '#999', fontSize: '12px' }}>
                                        #{inicial}
                                        {diferencia > 0 && <span style={{ color: '#28a745' }}> ▲{diferencia}</span>}
                                        {diferencia < 0 && <span style={{ color: '#c0392b' }}> ▼{Math.abs(diferencia)}</span>}
                                      </td>
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
                </>
              )}

              {/* HISTORIAL DE TEMPORADAS CERRADAS */}
              <div style={{ marginTop: '30px' }}>
                <h3 style={{ color: 'var(--color-ink)' }}>📜 Historial de escalafones cerrados</h3>
                {historial.length === 0 ? (
                  <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#888', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                    Todavía no hay temporadas cerradas.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {historial.map((t) => (
                      <div key={t.id} style={{ background: 'var(--color-chalk)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
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
                              <p style={{ color: '#888' }} className="loading-row"><span className="spinner" /> Cargando...</p>
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
                                          {lista.map((p: any) => {
                                            const s = stats[p.jugador_id] || { jugados: 0, ganados: 0, perdidos: 0, noPresentado: 0 }
                                            return (
                                              <tr key={p.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                                                <td style={{ padding: '4px', fontWeight: 'bold', color: 'var(--color-ink)' }}>{p.posicion}</td>
                                                <td style={{ padding: '4px', color: '#333' }}>{p.jugadores?.nombre || 'Jugador'}</td>
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
            </div>
          )}

          {/* PAGOS */}
          {activeSection === 'payments' && (
            <div>
              <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>💳 Registrar pago</h3>
                {!temporadaActivaPagos ? (
                  <p style={{ color: '#888' }}>No hay una temporada activa en este momento.</p>
                ) : (
                  <>
                    <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px 0' }}>
                      Temporada: <strong>{temporadaActivaPagos.nombre}</strong> — solo los jugadores con pago registrado aquí entran al sorteo.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Jugador</label>
                        <select
                          value={pagoJugadorId}
                          onChange={(e) => setPagoJugadorId(e.target.value)}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                        >
                          <option value="">-- Selecciona --</option>
                          {jugadoresParaPago.map((j) => (
                            <option key={j.id} value={j.id}>{j.nombre}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Tipo de pago</label>
                        <select
                          value={pagoTipo}
                          onChange={(e) => setPagoTipo(e.target.value)}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                        >
                          <option value="pago_movil">Pago móvil</option>
                          <option value="transferencia">Transferencia</option>
                          <option value="efectivo">Efectivo</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Monto</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pagoMonto}
                          onChange={(e) => setPagoMonto(e.target.value)}
                          placeholder="0.00"
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Fecha</label>
                        <input
                          type="date"
                          value={pagoFecha}
                          onChange={(e) => setPagoFecha(e.target.value)}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={registrarPago}
                      disabled={registrandoPago}
                      style={{
                        background: registrandoPago ? '#ccc' : 'var(--color-court)', color: 'white', border: 'none',
                        padding: '10px 20px', borderRadius: '8px', cursor: registrandoPago ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold'
                      }}
                    >
                      {registrandoPago ? 'Registrando...' : '✅ Registrar pago'}
                    </button>
                    {pagoMsg && (
                      <div style={{
                        marginTop: '12px', padding: '10px', borderRadius: '8px', fontSize: '13px',
                        background: pagoMsg.includes('✅') ? '#d4edda' : '#f8d7da',
                        color: pagoMsg.includes('✅') ? '#155724' : '#721c24',
                      }}>
                        {pagoMsg}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <h3 style={{ color: 'var(--color-ink)', padding: '20px 20px 0 20px' }}>📋 Pagos registrados</h3>
                {loadingPagos ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#888' }} className="loading-row"><span className="spinner" /> Cargando pagos...</div>
                ) : pagos.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Todavía no hay pagos registrados.</div>
                ) : (
                  <div className="table-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-court)', color: 'var(--color-chalk)' }}>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Recibo</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Jugador</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Tipo</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Monto</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Fecha</th>
                          <th style={{ padding: '10px 16px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagos.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'var(--color-chalk)' : '#fafafa' }}>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>#{p.numero_recibo}</td>
                            <td style={{ padding: '10px 16px' }}>{p.jugadores?.nombre || 'Jugador'}</td>
                            <td style={{ padding: '10px 16px', fontSize: '13px', textTransform: 'capitalize' }}>{p.tipo_pago.replace('_', ' ')}</td>
                            <td style={{ padding: '10px 16px' }}>${Number(p.monto).toFixed(2)}</td>
                            <td style={{ padding: '10px 16px', fontSize: '13px', color: '#888' }}>{p.fecha}</td>
                            <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                              <button
                                onClick={() => eliminarPago(p.id)}
                                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
