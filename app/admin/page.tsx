'use client'
import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

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
  const [session, setSession] = useState<any>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [players, setPlayers] = useState<any[]>([])

  const [jugadorModal, setJugadorModal] = useState<any>(null)
  const [trayectoriaModal, setTrayectoriaModal] = useState<any>(null)
  const [cargandoTrayectoriaModal, setCargandoTrayectoriaModal] = useState(false)
  const [panelModalAbierto, setPanelModalAbierto] = useState<string | null>(null)
  const [carnetAmpliado, setCarnetAmpliado] = useState<string | null>(null)

  const abrirTrayectoria = async (jugadorId: string) => {
    setJugadorModal({ id: jugadorId })
    setTrayectoriaModal(null)
    setPanelModalAbierto(null)
    setCargandoTrayectoriaModal(true)
    try {
      const res = await fetch('/api/publico/trayectoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadorId }),
      })
      const data = await res.json()
      if (res.ok) {
        setJugadorModal(data.jugador)
        setTrayectoriaModal(data.trayectoria)
      }
    } finally {
      setCargandoTrayectoriaModal(false)
    }
  }

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
  const [standbyMap, setStandbyMap] = useState<Record<string, { dias: number; fecha_inicio: string; fecha_fin: string }>>({})
  const [activandoStandbyId, setActivandoStandbyId] = useState<string | null>(null)
  const [pagos, setPagos] = useState<any[]>([])
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [temporadaActivaPagos, setTemporadaActivaPagos] = useState<any>(null)
  const [jugadoresParaPago, setJugadoresParaPago] = useState<any[]>([])
  const [inscritos, setInscritos] = useState<any[]>([])
  const [pagoJugadorId, setPagoJugadorId] = useState('')
  const [pagoTipo, setPagoTipo] = useState('pago_movil')
  const [pagoMontoCentavos, setPagoMontoCentavos] = useState('')
  const [pagoReferencia, setPagoReferencia] = useState('')
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10))
  const [registrandoPago, setRegistrandoPago] = useState(false)
  const [validandoPago, setValidandoPago] = useState<string | null>(null)
  const [rechazandoPago, setRechazandoPago] = useState<string | null>(null)
  const [pagoMsg, setPagoMsg] = useState('')
  const [sorteando, setSorteando] = useState(false)

  const [retos, setRetos] = useState<any[]>([])
  const [loadingRetos, setLoadingRetos] = useState(false)
  const [fechaReservas, setFechaReservas] = useState(new Date().toISOString().slice(0, 10))
  const [reservasDelDia, setReservasDelDia] = useState<any[]>([])
  const [reservasCasualesDelDia, setReservasCasualesDelDia] = useState<any[]>([])
  const [loadingReservas, setLoadingReservas] = useState(false)
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

  const [fotosGaleria, setFotosGaleria] = useState<any[]>([])
  const [loadingFotos, setLoadingFotos] = useState(false)
  const [eliminandoFoto, setEliminandoFoto] = useState<string | null>(null)
  const [fotosMsg, setFotosMsg] = useState('')

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session)
        if (data.session?.role === 'admin' && data.session?.nivel === 'pagos') {
          setActiveSection('payments')
        }
      })
      .finally(() => setCheckingSession(false))
  }, [])

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

  useEffect(() => {
    if (activeSection === 'galeria') {
      fetchFotosGaleria()
    }
  }, [activeSection])

  const fetchFotosGaleria = async () => {
    setLoadingFotos(true)
    const { data } = await supabase
      .from('resultados')
      .select('id, foto_url, created_at, retos:reto_id(cancha, nombre_cancha_foranea, fecha_propuesta, retador:retador_id(nombre), retado:retado_id(nombre))')
      .not('foto_url', 'is', null)
      .order('created_at', { ascending: false })
    setFotosGaleria(data || [])
    setLoadingFotos(false)
  }

  const eliminarFoto = async (resultadoId: string) => {
    if (!confirm('¿Eliminar esta foto de la galería? El resultado del partido no se ve afectado, solo se quita la foto.')) return
    setEliminandoFoto(resultadoId)
    setFotosMsg('')
    try {
      const res = await fetch('/api/admin/eliminar-foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultadoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      setFotosMsg('✅ Foto eliminada de la galería.')
      fetchFotosGaleria()
    } catch (err: any) {
      setFotosMsg('❌ ' + err.message)
    } finally {
      setEliminandoFoto(null)
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
    if (activeSection === 'reservas') {
      fetchReservasDelDia(fechaReservas)
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection === 'reservas') {
      fetchReservasDelDia(fechaReservas)
    }
  }, [fechaReservas])

  const fetchReservasDelDia = async (fecha: string) => {
    setLoadingReservas(true)
    const inicio = new Date(fecha + 'T00:00:00')
    const fin = new Date(fecha + 'T23:59:59.999')
    const { data } = await supabase
      .from('retos')
      .select('id, cancha, nombre_cancha_foranea, fecha_propuesta, estado, retador:retador_id(nombre, categoria, genero), retado:retado_id(nombre)')
      .in('estado', ['pendiente', 'aceptado', 'jugado', 'no_presentado'])
      .gte('fecha_propuesta', inicio.toISOString())
      .lte('fecha_propuesta', fin.toISOString())
      .order('fecha_propuesta', { ascending: true })
    setReservasDelDia(data || [])

    const { data: casuales } = await supabase
      .from('reservas_cancha')
      .select('id, cancha, fecha_hora, estado, jugadores:jugador_id(nombre)')
      .eq('estado', 'activa')
      .gte('fecha_hora', inicio.toISOString())
      .lte('fecha_hora', fin.toISOString())
      .order('fecha_hora', { ascending: true })
    setReservasCasualesDelDia(casuales || [])

    setLoadingReservas(false)
  }

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
  const [eliminandoTemp, setEliminandoTemp] = useState<string | null>(null)

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
  const [retirandoPosicionId, setRetirandoPosicionId] = useState<string | null>(null)
  const [tasaBcvActual, setTasaBcvActual] = useState<{ valor: number; fecha: string } | null>(null)
  const [editandoTasaBcv, setEditandoTasaBcv] = useState(false)
  const [tasaBcvValorInput, setTasaBcvValorInput] = useState('')
  const [tasaBcvFechaInput, setTasaBcvFechaInput] = useState('')
  const [guardandoTasaBcv, setGuardandoTasaBcv] = useState(false)
  const [tasaBcvMsg, setTasaBcvMsg] = useState('')
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
      fetchTasaBcv()
    }
  }, [activeSection])

  const fetchTasaBcv = async () => {
    const { data } = await supabase.from('tasa_bcv').select('valor, fecha').eq('id', 1).maybeSingle()
    if (data) {
      setTasaBcvActual(data)
      setTasaBcvValorInput(String(data.valor))
      setTasaBcvFechaInput(data.fecha)
    } else {
      setTasaBcvFechaInput(new Date().toISOString().slice(0, 10))
    }
  }

  const fetchTemporadaActivaSimple = async () => {
    const { data } = await supabase.from('temporadas').select('id, nombre').eq('estado', 'activa').maybeSingle()
    setTemporadaActivaPagos(data || null)
    if (data) {
      const { data: anotados } = await supabase
        .from('ladder_posiciones')
        .select('jugador_id, categoria, genero, jugadores:jugador_id(nombre)')
        .eq('temporada_id', data.id)
        .order('categoria', { ascending: true })
      setInscritos(anotados || [])
      fetchRecordatorios(data.id)
    } else {
      setInscritos([])
    }
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

  const [notificando, setNotificando] = useState<string | null>(null)
  const [recordatorios, setRecordatorios] = useState<any[]>([]) // {jugador_id, enviado_at}[]

  const fetchRecordatorios = async (temporadaId: string) => {
    const res = await fetch('/api/admin/listar-recordatorios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temporadaId }),
    })
    const data = await res.json()
    if (res.ok) setRecordatorios(data.recordatorios || [])
  }

  const recordatoriosDe = (jugadorId: string) =>
    recordatorios.filter((r) => r.jugador_id === jugadorId).sort((a, b) => (a.enviado_at < b.enviado_at ? 1 : -1))

  const notificarPagoPendiente = async (jugadorId: string) => {
    const previos = recordatoriosDe(jugadorId)
    if (previos.length > 0) {
      const ultima = new Date(previos[0].enviado_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
      const continuar = confirm(`Ya se le enviaron ${previos.length} recordatorio(s) a este jugador — el último el ${ultima}. ¿Enviar otro de todas formas?`)
      if (!continuar) return
    }

    setNotificando(jugadorId)
    try {
      const res = await fetch('/api/admin/notificar-pago-pendiente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadorId, temporadaId: temporadaActivaPagos?.id, temporadaNombre: temporadaActivaPagos?.nombre }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar')
      if (temporadaActivaPagos?.id) fetchRecordatorios(temporadaActivaPagos.id)
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setNotificando(null)
    }
  }

  const validarPago = async (pagoId: string) => {
    setValidandoPago(pagoId)
    try {
      const res = await fetch('/api/admin/validar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al validar')
      fetchPagos()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setValidandoPago(null)
    }
  }

  const registrarPago = async () => {
    if (!temporadaActivaPagos) {
      setPagoMsg('❌ No hay una temporada activa para registrar el pago.')
      return
    }
    if (!pagoJugadorId || !pagoMontoCentavos) {
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
          monto: montoNumerico(pagoMontoCentavos),
          fecha: pagoFecha,
          referencia: pagoReferencia,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al registrar')

      setPagoMsg(`✅ Pago registrado — recibo #${data.numeroRecibo}`)
      setPagoJugadorId('')
      setPagoMontoCentavos('')
      setPagoReferencia('')
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

  const [editandoMontoPagoId, setEditandoMontoPagoId] = useState<string | null>(null)
  const [nuevoMontoInput, setNuevoMontoInput] = useState('')
  const [guardandoMonto, setGuardandoMonto] = useState(false)
  const [modoSorteoManual, setModoSorteoManual] = useState(false)
  const [posicionesManualInput, setPosicionesManualInput] = useState<Record<string, string>>({})
  const [guardandoSorteoManual, setGuardandoSorteoManual] = useState(false)

  const abrirEdicionMonto = (pago: any) => {
    setEditandoMontoPagoId(pago.id)
    setNuevoMontoInput(String(pago.monto))
  }

  const guardarNuevoMonto = async (pagoId: string) => {
    setGuardandoMonto(true)
    try {
      const res = await fetch('/api/admin/editar-monto-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId, monto: nuevoMontoInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setEditandoMontoPagoId(null)
      fetchPagos()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setGuardandoMonto(false)
    }
  }

  // Rechazar un pago reportado por el jugador (el dinero nunca llegó a la cuenta).
  // Lo elimina y le manda un correo avisándole y con el contacto de Yelitza.
  const rechazarPago = async (pagoId: string) => {
    if (!confirm('¿Rechazar este pago? Se eliminará y se le enviará un correo al jugador avisándole que verifique los datos y lo cargue de nuevo.')) return
    setRechazandoPago(pagoId)
    try {
      const res = await fetch('/api/admin/rechazar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al rechazar')
      fetchPagos()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setRechazandoPago(null)
    }
  }

  // El efectivo se registra en dólares; pago móvil y transferencia, en bolívares —
  // por eso se totalizan por separado, no tiene sentido sumarlos juntos.
  const monedaDe = (tipoPago: string) => (tipoPago === 'efectivo' ? '$' : 'Bs.')

  const pagosPendientes = pagos.filter((p) => !p.validado)
  const pagosValidados = pagos.filter((p) => p.validado)

  const pagaronSet = new Set(pagosValidados.map((p) => p.jugador_id))

  const pagosFiltrados = pagosValidados.filter((p) => {
    if (filtroFechaDesde && p.fecha < filtroFechaDesde) return false
    if (filtroFechaHasta && p.fecha > filtroFechaHasta) return false
    return true
  })

  const totalesPorMoneda = pagosFiltrados.reduce(
    (acc, p) => {
      if (p.tipo_pago === 'efectivo') acc.dolares += Number(p.monto)
      else acc.bolivares += Number(p.monto)
      return acc
    },
    { bolivares: 0, dolares: 0 }
  )

  const rangoTexto = filtroFechaDesde || filtroFechaHasta
    ? `Del ${filtroFechaDesde || '(inicio)'} al ${filtroFechaHasta || '(hoy)'}`
    : 'Todos los pagos registrados'

  const exportarExcel = () => {
    const filas = pagosFiltrados.map((p) => ({
      'N° Recibo': p.numero_recibo,
      'Jugador': p.jugadores?.nombre || '',
      'Tipo de pago': p.tipo_pago.replace('_', ' '),
      'Moneda': monedaDe(p.tipo_pago),
      'Monto': Number(p.monto),
      'Referencia': p.referencia || '',
      'Fecha': p.fecha,
    }))
    // Filas en blanco + totales al final del reporte
    filas.push({ 'N° Recibo': '' as any, 'Jugador': '', 'Tipo de pago': '', 'Moneda': '', 'Monto': '' as any, 'Referencia': '', 'Fecha': '' })
    filas.push({ 'N° Recibo': '' as any, 'Jugador': '', 'Tipo de pago': '', 'Moneda': 'Bs.', 'Monto': totalesPorMoneda.bolivares, 'Referencia': 'TOTAL bolívares', 'Fecha': '' })
    filas.push({ 'N° Recibo': '' as any, 'Jugador': '', 'Tipo de pago': '', 'Moneda': '$', 'Monto': totalesPorMoneda.dolares, 'Referencia': 'TOTAL dólares', 'Fecha': '' })

    const hoja = XLSX.utils.json_to_sheet(filas)
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Pagos')
    const nombreArchivo = `pagos-hgv-${temporadaActivaPagos?.nombre || 'temporada'}.xlsx`.replace(/\s+/g, '-')
    XLSX.writeFile(libro, nombreArchivo)
  }

  const imprimirPagos = () => {
    window.print()
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

  const eliminarTemporada = async (temporadaId: string, nombreTemp: string) => {
    const confirmacion1 = confirm(`¿Eliminar por completo "${nombreTemp}"? Esto borra TODOS sus datos: jugadores anotados, retos, resultados, pagos y recordatorios de esa temporada. No se puede deshacer.`)
    if (!confirmacion1) return
    const confirmacion2 = confirm('Confirma una vez más: esta acción es permanente. ¿Continuar?')
    if (!confirmacion2) return

    setEliminandoTemp(temporadaId)
    try {
      const res = await fetch('/api/admin/eliminar-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporadaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')

      fetchTemporadaYLadder()
      fetchHistorial()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setEliminandoTemp(null)
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

      const { data: standbyRows } = await supabase
        .from('standby')
        .select('jugador_id, dias, fecha_inicio, fecha_fin')
        .eq('temporada_id', temporada.id)
      const mapaStandby: Record<string, { dias: number; fecha_inicio: string; fecha_fin: string }> = {}
      ;(standbyRows || []).forEach((s: any) => {
        mapaStandby[s.jugador_id] = { dias: s.dias, fecha_inicio: s.fecha_inicio, fecha_fin: s.fecha_fin }
      })
      setStandbyMap(mapaStandby)

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

  // "Hoy" comparado como texto YYYY-MM-DD, igual que en /ladder, para evitar líos de huso horario.
  const enStandby = (jugadorId: string) => {
    const s = standbyMap[jugadorId]
    if (!s) return false
    const hoy = new Date().toISOString().slice(0, 10)
    return hoy >= s.fecha_inicio && hoy <= s.fecha_fin
  }

  const activarStandbyAdmin = async (jugadorId: string, nombreJugador: string) => {
    const respuesta = prompt(`¿Cuántos días de standby para ${nombreJugador}? Escribe 3 o 5.`)
    if (!respuesta) return
    const dias = Number(respuesta.trim())
    if (![3, 5].includes(dias)) {
      alert('❌ Solo se acepta 3 o 5 días.')
      return
    }
    if (!confirm(`¿Activar standby de ${dias} días para ${nombreJugador}? Es una única vez por temporada — no se puede repetir ni deshacer.`)) return

    setActivandoStandbyId(jugadorId)
    try {
      const res = await fetch('/api/admin/activar-standby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadorId, temporadaId: temporadaActiva.id, dias }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al activar')
      setSorteoMsg(`✅ Standby de ${dias} días activado para ${data.nombre}, hasta el ${new Date(data.fechaFin + 'T00:00:00').toLocaleDateString('es-ES')}.`)
      fetchTemporadaYLadder()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setActivandoStandbyId(null)
    }
  }

  const retirarDeEscalafon = async (posicionId: string, nombreJugador: string) => {
    if (!confirm(`¿Retirar a ${nombreJugador} del escalafón de esta temporada? Úsalo cuando quedó anotado en la categoría o género equivocado — su historial de partidos no se toca. Después corrígele la categoría/género en la pestaña Jugadores y vuelve a anotarlo (o pídele que se anote él mismo).`)) return

    setRetirandoPosicionId(posicionId)
    setSorteoMsg('')
    try {
      const res = await fetch('/api/admin/retirar-de-escalafon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posicionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al retirar')

      setSorteoMsg(`✅ ${data.nombre} fue retirado del escalafón de esta temporada.`)
      fetchTemporadaYLadder()
    } catch (err: any) {
      setSorteoMsg('❌ ' + err.message)
    } finally {
      setRetirandoPosicionId(null)
    }
  }

  const guardarTasaBcv = async () => {
    setGuardandoTasaBcv(true)
    setTasaBcvMsg('')
    try {
      const res = await fetch('/api/admin/guardar-tasa-bcv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: tasaBcvValorInput, fecha: tasaBcvFechaInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      setTasaBcvActual({ valor: Number(tasaBcvValorInput), fecha: tasaBcvFechaInput })
      setEditandoTasaBcv(false)
    } catch (err: any) {
      setTasaBcvMsg('❌ ' + err.message)
    } finally {
      setGuardandoTasaBcv(false)
    }
  }

  const confirmarSorteoManual = async () => {
    if (!temporadaActiva) return
    const jugadoresAnotados = Object.values(ladderPreview).flat()

    const faltantes = jugadoresAnotados.filter((p: any) => !posicionesManualInput[p.jugador_id]?.trim())
    if (faltantes.length > 0) {
      setSorteoMsg(`❌ Falta ponerle posición a ${faltantes.length} jugador(es) — completa todos antes de confirmar.`)
      return
    }

    const asignaciones = jugadoresAnotados.map((p: any) => ({
      jugadorId: p.jugador_id,
      posicion: Number(posicionesManualInput[p.jugador_id]),
    }))

    if (!confirm('¿Confirmar el sorteo manual con estas posiciones? Esta acción no se puede repetir ni deshacer.')) return

    setGuardandoSorteoManual(true)
    setSorteoMsg('')
    try {
      const res = await fetch('/api/admin/sorteo-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporadaId: temporadaActiva.id, asignaciones }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      setSorteoMsg(`✅ Sorteo manual confirmado — ${data.count} jugadores ubicados en el escalafón.`)
      setModoSorteoManual(false)
      setPosicionesManualInput({})
      fetchTemporadaYLadder()
    } catch (err: any) {
      setSorteoMsg('❌ ' + err.message)
    } finally {
      setGuardandoSorteoManual(false)
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
      .select('id, nombre, email, telefono, numero_accion, categoria, genero, activo, estado_verificacion, created_at, foto_carnet_url, numero_accion_ocr, numero_accion_coincide')
      .order('created_at', { ascending: false })
    if (!error) setPlayers(data || [])
    setLoading(false)
  }

  const [verificando, setVerificando] = useState<string | null>(null)

  const verificarJugador = async (jugadorId: string, estado: string) => {
    setVerificando(jugadorId)
    try {
      const res = await fetch('/api/admin/verificar-jugador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadorId, estado }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      fetchPlayers()
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally {
      setVerificando(null)
    }
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

  const esAdminLimitado = session?.role === 'admin' && session?.nivel === 'pagos'

  const menuItemsCompletos = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'players', icon: '👥', label: 'Jugadores' },
    { id: 'challenges', icon: '⚔️', label: 'Desafíos' },
    { id: 'results', icon: '🏆', label: 'Resultados' },
    { id: 'ladder', icon: '🎾', label: 'Escalafón' },
    { id: 'reservas', icon: '📅', label: 'Reservas' },
    { id: 'galeria', icon: '🖼️', label: 'Galería' },
    { id: 'payments', icon: '💳', label: 'Pagos' },
  ]

  const menuItems = esAdminLimitado
    ? menuItemsCompletos.filter((m) => m.id === 'players' || m.id === 'payments')
    : menuItemsCompletos

  const categoriaLabel = (value: string) => CATEGORIAS.find(c => c.value === value)?.label || value

  // El admin escribe solo dígitos (como si tecleara centavos, ej: "150000" -> Bs. 1.500,00)
  // y esto lo muestra formateado con punto de miles y coma decimal.
  const formatearMontoDesdeCentavos = (digitos: string) => {
    const num = parseInt(digitos || '0', 10)
    return (num / 100).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const montoNumerico = (digitos: string) => parseInt(digitos || '0', 10) / 100
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

  if (checkingSession) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="loading-row">
        <span className="spinner" /> Cargando…
      </div>
    )
  }

  if (!session || session.role !== 'admin') {
    return (
      <div className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-chalk)', fontSize: '18px', marginBottom: '16px' }}>🔒 Acceso restringido — necesitas iniciar sesión como administrador.</p>
        <a href="/login" style={{ color: 'var(--color-ball)', fontWeight: 'bold' }}>Iniciar sesión</a>
      </div>
    )
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
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
            Panel Admin{esAdminLimitado ? ' — Pagos' : ''}
          </div>
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
          <a href="/" style={{ color: 'var(--color-chalk)', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}>
            🎾 Volver al inicio
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
          <span style={{ color: '#6b6b6b', fontSize: '14px' }}>
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
                    <div style={{ color: '#6b6b6b', fontSize: '14px' }}>{card.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '30px' }}>
                <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>📢 Anuncio del club</h3>
                <p style={{ color: '#6b6b6b', fontSize: '13px', margin: '0 0 16px 0' }}>
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

                <span style={{ marginLeft: 'auto', color: '#6b6b6b', fontSize: '14px' }}>
                  Total: <strong>{filteredPlayers.length}</strong> jugadores
                </span>
              </div>

              {/* Tabla */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando jugadores...</div>
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
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>🪪 Membresía</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center' }}>🖼️ Carné</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left' }}>📅 Registro</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center' }}>⚙️ Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }}>
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
                            <td style={{ padding: '12px 16px', color: '#6b6b6b', fontSize: '14px' }}>{index + 1}</td>
                            <td
                              onClick={() => abrirTrayectoria(player.id)}
                              style={{ padding: '12px 16px', fontWeight: '600', color: '#333', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '3px' }}
                              title="Ver trayectoria"
                            >
                              {player.nombre}
                            </td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>{player.email}</td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>{player.telefono}</td>
                            <td style={{ padding: '12px 16px', color: '#555', fontSize: '14px' }}>
                              {player.numero_accion || '—'}
                              {player.numero_accion_coincide === false && (
                                <span
                                  title={`La IA leyó "${player.numero_accion_ocr}" en el carné, pero el jugador escribió "${player.numero_accion}" — revisa la foto antes de verificarlo.`}
                                  style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 'bold', color: '#c0392b', background: '#fee2e2', padding: '2px 6px', borderRadius: '8px', cursor: 'help' }}
                                >
                                  ⚠️ no coincide
                                </span>
                              )}
                            </td>
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
                            <td style={{ padding: '12px 16px' }}>
                              {player.estado_verificacion === 'verificado' ? (
                                <span style={{ color: '#28a745', fontWeight: 'bold', fontSize: '13px' }}>✅ Verificado</span>
                              ) : player.estado_verificacion === 'no_permitido' ? (
                                <span style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '13px' }}>🚫 No permitido</span>
                              ) : (
                                <span style={{ color: '#e67e22', fontWeight: 'bold', fontSize: '13px' }}>⏳ Pendiente</span>
                              )}
                              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                {player.estado_verificacion !== 'verificado' && (
                                  <button
                                    onClick={() => verificarJugador(player.id, 'verificado')}
                                    disabled={verificando === player.id}
                                    style={{ background: '#d4edda', color: '#155724', border: 'none', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}
                                  >
                                    Verificar
                                  </button>
                                )}
                                {player.estado_verificacion !== 'no_permitido' && (
                                  <button
                                    onClick={() => verificarJugador(player.id, 'no_permitido')}
                                    disabled={verificando === player.id}
                                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}
                                  >
                                    No permitir
                                  </button>
                                )}
                                {player.estado_verificacion && player.estado_verificacion !== 'pendiente' && (
                                  <button
                                    onClick={() => verificarJugador(player.id, 'pendiente')}
                                    disabled={verificando === player.id}
                                    style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}
                                  >
                                    Reiniciar
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              {player.foto_carnet_url ? (
                                <img
                                  src={player.foto_carnet_url}
                                  alt="Carné de socio"
                                  onClick={() => setCarnetAmpliado(player.foto_carnet_url)}
                                  style={{ width: '44px', height: '32px', objectFit: 'cover', borderRadius: '4px', cursor: 'zoom-in', border: '1px solid #ddd' }}
                                />
                              ) : (
                                <span style={{ color: '#bbb', fontSize: '12px' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px', color: '#6b6b6b', fontSize: '13px' }}>
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
                              <td colSpan={10} style={{ padding: '16px', background: '#f8f9fa' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Nombre</label>
                                    <input
                                      type="text"
                                      value={editJugadorForm.nombre}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, nombre: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Email</label>
                                    <input
                                      type="email"
                                      value={editJugadorForm.email}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, email: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Teléfono</label>
                                    <input
                                      type="text"
                                      value={editJugadorForm.telefono}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, telefono: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Número de acción</label>
                                    <input
                                      type="text"
                                      value={editJugadorForm.numeroAccion}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, numeroAccion: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Género</label>
                                    <select
                                      value={editJugadorForm.genero}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, genero: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    >
                                      {GENEROS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Categoría</label>
                                    <select
                                      value={editJugadorForm.categoria}
                                      onChange={(e) => setEditJugadorForm({ ...editJugadorForm, categoria: e.target.value })}
                                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                                    >
                                      {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Activo</label>
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
                <span style={{ marginLeft: 'auto', color: '#6b6b6b', fontSize: '14px' }}>
                  Total: <strong>{filteredRetos.length}</strong> desafíos
                </span>
              </div>

              {loadingRetos ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando desafíos...</div>
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
                          <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }}>
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

          {/* RESERVAS */}
          {activeSection === 'reservas' && (
            <div>
              <div style={{
                background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px',
                marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap'
              }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>📅 Ver reservas del día:</span>
                <input
                  type="date"
                  value={fechaReservas}
                  onChange={(e) => setFechaReservas(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '14px' }}
                />
                <button
                  onClick={() => setFechaReservas(new Date().toISOString().slice(0, 10))}
                  style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                >
                  Hoy
                </button>
                <span style={{ marginLeft: 'auto', color: '#6b6b6b', fontSize: '14px' }}>
                  Total: <strong>{reservasDelDia.length + reservasCasualesDelDia.length}</strong> reservas
                </span>
              </div>

              {loadingReservas ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando reservas...</div>
              ) : reservasDelDia.length === 0 && reservasCasualesDelDia.length === 0 ? (
                <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#6b6b6b', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                  No hay nada programado para este día.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  {['HGV1', 'HGV2', 'FORANEA'].map((canchaId) => {
                    const partidos = reservasDelDia
                      .filter((r) => r.cancha === canchaId)
                      .map((r) => ({ tipo: 'escalera' as const, hora: r.fecha_propuesta, data: r }))
                    const casuales = canchaId === 'FORANEA' ? [] : reservasCasualesDelDia
                      .filter((r) => r.cancha === canchaId)
                      .map((r) => ({ tipo: 'casual' as const, hora: r.fecha_hora, data: r }))
                    const itemsCancha = [...partidos, ...casuales].sort((a, b) => a.hora < b.hora ? -1 : 1)
                    if (itemsCancha.length === 0) return null
                    const nombreCanchaGrupo = canchaId === 'FORANEA' ? 'Canchas foráneas' : canchaId === 'HGV1' ? 'Cancha HGV 1' : 'Cancha HGV 2'
                    return (
                      <div key={canchaId} style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                        <h4 style={{ color: 'var(--color-ink)', marginTop: 0 }}>🎾 {nombreCanchaGrupo}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {itemsCancha.map((item) => {
                            if (item.tipo === 'escalera') {
                              const r = item.data
                              const ec = estadoColor(r.estado)
                              return (
                                <div key={`reto-${r.id}`} style={{ borderTop: '1px solid #eee', paddingTop: '10px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--color-court)' }}>
                                      {new Date(r.fecha_propuesta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span style={{ display: 'flex', gap: '6px' }}>
                                      <span style={{ background: '#e0f2fe', color: '#075985', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                                        🎾 Escalera
                                      </span>
                                      <span style={{ background: ec.bg, color: ec.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                                        {r.estado}
                                      </span>
                                    </span>
                                  </div>
                                  <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#333' }}>
                                    {r.retador?.nombre || '—'} vs {r.retado?.nombre || '—'}
                                  </p>
                                  {canchaId === 'FORANEA' && r.nombre_cancha_foranea && (
                                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6b6b6b' }}>{r.nombre_cancha_foranea}</p>
                                  )}
                                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6b6b6b' }}>
                                    {CATEGORIAS.find(c => c.value === r.retador?.categoria)?.label || '—'}
                                    {' — '}
                                    {GENEROS.find(g => g.value === r.retador?.genero)?.label || '—'}
                                  </p>
                                </div>
                              )
                            }
                            const res = item.data
                            return (
                              <div key={`reserva-${res.id}`} style={{ borderTop: '1px solid #eee', paddingTop: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--color-court)' }}>
                                    {new Date(res.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                                    📅 Reserva casual
                                  </span>
                                </div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#333' }}>
                                  {res.jugadores?.nombre || 'Socio'}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
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
                <span style={{ marginLeft: 'auto', color: '#6b6b6b', fontSize: '14px' }}>
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
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando resultados...</div>
              ) : (
                <>
                  {/* PENDIENTES DE VALIDAR */}
                  <h3 style={{ color: 'var(--color-ink)' }}>⏳ Pendientes de validar</h3>
                  {resultados.filter(r => !r.validado).length === 0 ? (
                    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#6b6b6b', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '30px' }}>
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
                            <p style={{ margin: 0, fontSize: '12px', color: '#6b6b6b' }}>
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
                    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#6b6b6b', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
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
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b6b6b' }}>
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

          {/* GALERÍA */}
          {activeSection === 'galeria' && (
            <div>
              <div style={{
                background: 'var(--color-chalk)', borderRadius: '12px', padding: '20px',
                marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                display: 'flex', gap: '16px', alignItems: 'center'
              }}>
                <button
                  onClick={fetchFotosGaleria}
                  style={{ background: 'var(--color-court)', color: 'var(--color-chalk)', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
                >
                  🔄 Actualizar
                </button>
                <span style={{ marginLeft: 'auto', color: '#6b6b6b', fontSize: '14px' }}>
                  Total: <strong>{fotosGaleria.length}</strong> fotos
                </span>
              </div>

              {fotosMsg && (
                <div style={{
                  marginBottom: '20px', padding: '12px', borderRadius: '8px',
                  background: fotosMsg.includes('✅') ? '#d4edda' : '#f8d7da',
                  color: fotosMsg.includes('✅') ? '#155724' : '#721c24',
                }}>
                  {fotosMsg}
                </div>
              )}

              {loadingFotos ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando fotos...</div>
              ) : fotosGaleria.length === 0 ? (
                <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#6b6b6b', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                  Todavía no hay fotos cargadas en la galería.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                  {fotosGaleria.map((f) => (
                    <div key={f.id} style={{ background: 'var(--color-chalk)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                      <img
                        src={f.foto_url}
                        alt="Foto del partido"
                        style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ padding: '12px 14px' }}>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#333' }}>
                          {f.retos?.retador?.nombre || '—'} vs {f.retos?.retado?.nombre || '—'}
                        </p>
                        <p style={{ margin: '4px 0 10px 0', fontSize: '12px', color: '#6b6b6b' }}>
                          {new Date(f.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <button
                          onClick={() => eliminarFoto(f.id)}
                          disabled={eliminandoFoto === f.id}
                          style={{
                            width: '100%', background: eliminandoFoto === f.id ? '#ccc' : '#fee2e2', color: '#dc2626', border: 'none',
                            padding: '8px 10px', borderRadius: '6px', cursor: eliminandoFoto === f.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold'
                          }}
                        >
                          {eliminandoFoto === f.id ? '⏳ Eliminando...' : '🗑️ Eliminar foto'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
                <p style={{ fontSize: '12px', color: '#6b6b6b', margin: '-4px 0 10px 0' }}>
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
                  <p style={{ color: '#6b6b6b' }}>Crea una temporada con estado 'activa' antes de sortear el escalafón.</p>
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
                            <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block' }}>Límite de inscripción</label>
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
                        : modoSorteoManual
                        ? 'Modo sorteo manual activado — a medida que saquen las pelotas en vivo, escríbele a cada jugador la posición que le tocó en la tabla de abajo. Cuando todos tengan su número, confirma con el botón al final de la tabla.'
                        : 'Todavía no se ha hecho el sorteo. Puedes sortear automáticamente (aleatorio) o en modo manual, escribiendo tú mismo la posición de cada jugador a medida que la sacan en vivo con las pelotas.'}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {!temporadaActiva.sorteo_realizado && !modoSorteoManual && (
                        <button
                          onClick={realizarSorteo}
                          disabled={sorteando || cerrando}
                          style={{
                            background: sorteando ? '#ccc' : '#e67e22', color: 'var(--color-chalk)', border: 'none',
                            padding: '12px 24px', borderRadius: '8px', cursor: sorteando ? 'not-allowed' : 'pointer',
                            fontSize: '15px', fontWeight: 'bold'
                          }}
                        >
                          {sorteando ? '⏳ Sorteando...' : '🎲 Sorteo automático (aleatorio)'}
                        </button>
                      )}
                      {!temporadaActiva.sorteo_realizado && (
                        <button
                          onClick={() => { setModoSorteoManual(!modoSorteoManual); setSorteoMsg('') }}
                          disabled={sorteando || cerrando}
                          style={{
                            background: modoSorteoManual ? '#6b6b6b' : 'none', color: modoSorteoManual ? 'white' : '#e67e22',
                            border: '2px solid #e67e22',
                            padding: '10px 22px', borderRadius: '8px', cursor: 'pointer',
                            fontSize: '15px', fontWeight: 'bold'
                          }}
                        >
                          {modoSorteoManual ? '✕ Cancelar sorteo manual' : '🎾 Sorteo manual (pelotas físicas)'}
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
                      <button
                        onClick={() => eliminarTemporada(temporadaActiva.id, temporadaActiva.nombre)}
                        disabled={eliminandoTemp === temporadaActiva.id}
                        style={{
                          background: 'none', color: '#c0392b', border: '1px solid #c0392b',
                          padding: '12px 24px', borderRadius: '8px', cursor: eliminandoTemp === temporadaActiva.id ? 'not-allowed' : 'pointer',
                          fontSize: '15px', fontWeight: 'bold'
                        }}
                      >
                        {eliminandoTemp === temporadaActiva.id ? '⏳ Eliminando...' : '🗑️ Eliminar temporada'}
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

                    <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid #eee' }}>
                      <h4 style={{ color: 'var(--color-ink)', margin: '0 0 8px 0' }}>➕ Agregar jugador manualmente</h4>
                      <p style={{ fontSize: '13px', color: '#6b6b6b', margin: '0 0 10px 0' }}>
                        {temporadaActiva.sorteo_realizado
                          ? 'Para socios que se anotan tarde (después del plazo). Entran al final de su categoría/género, sin pasar por el sorteo.'
                          : 'Requiere que el jugador ya esté verificado y con el pago validado en esta temporada. Entra en el orden de inscripción — su posición real la definirá el sorteo cuando lo hagas.'}
                      </p>
                      {jugadoresDisponibles.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#6b6b6b' }}>Todos los socios activos ya están en el escalafón.</p>
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
                  </div>

                  {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando escalafón...</div>
                  ) : Object.keys(ladderPreview).length === 0 ? (
                    <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#6b6b6b', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                      {temporadaActiva.sorteo_realizado ? 'Todavía no hay posiciones asignadas.' : 'Todavía no hay jugadores anotados a esta temporada.'}
                    </div>
                  ) : (
                    <>
                      {!temporadaActiva.sorteo_realizado && (
                        <p style={{ fontSize: '13px', color: '#e67e22', fontWeight: 'bold', margin: '0 0 14px 0' }}>
                          🎲 El sorteo todavía no se ha hecho — el orden de abajo es solo el de inscripción, no es el ranking final.
                        </p>
                      )}
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
                                <tr style={{ color: '#6b6b6b', textAlign: 'left' }}>
                                  <th style={{ padding: '2px 4px' }}>{temporadaActiva.sorteo_realizado ? '#' : 'Orden'}</th>
                                  <th style={{ padding: '2px 4px' }}>Jugador</th>
                                  <th style={{ padding: '2px 4px' }}>Inicial</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>PJ</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>G</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>P</th>
                                  <th style={{ padding: '2px 4px', textAlign: 'center' }}>NP</th>
                                  <th style={{ padding: '2px 4px' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {lista.map((p: any) => {
                                  const inicial = p.posicion_inicial ?? p.posicion
                                  const diferencia = inicial - p.posicion
                                  const s = ladderStats[p.jugador_id] || { jugados: 0, ganados: 0, perdidos: 0, noPresentado: 0 }
                                  return (
                                    <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                                      <td style={{ padding: '4px', fontWeight: 'bold', color: 'var(--color-ink)' }}>
                                        {modoSorteoManual ? (
                                          <input
                                            type="number"
                                            min="1"
                                            value={posicionesManualInput[p.jugador_id] || ''}
                                            onChange={(e) => setPosicionesManualInput({ ...posicionesManualInput, [p.jugador_id]: e.target.value })}
                                            placeholder="—"
                                            style={{ width: '48px', padding: '3px 4px', borderRadius: '4px', border: '1px solid #e67e22', fontSize: '13px', textAlign: 'center' }}
                                          />
                                        ) : (
                                          <span onClick={() => abrirTrayectoria(p.jugador_id)} style={{ cursor: 'pointer' }}>{p.posicion}</span>
                                        )}
                                      </td>
                                      <td
                                        onClick={() => abrirTrayectoria(p.jugador_id)}
                                        style={{ padding: '4px', color: '#333', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}
                                      >
                                        {p.jugadores?.nombre || 'Jugador'}
                                        {enStandby(p.jugador_id) && (
                                          <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 'bold', color: '#e67e22', background: '#fff3cd', padding: '2px 5px', borderRadius: '8px' }}>
                                            🧳 hasta {new Date(standbyMap[p.jugador_id].fecha_fin + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ padding: '4px', color: '#6b6b6b', fontSize: '12px' }}>
                                        #{inicial}
                                        {diferencia > 0 && <span style={{ color: '#28a745' }}> ▲{diferencia}</span>}
                                        {diferencia < 0 && <span style={{ color: '#c0392b' }}> ▼{Math.abs(diferencia)}</span>}
                                      </td>
                                      <td style={{ padding: '4px', textAlign: 'center' }}>{s.jugados}</td>
                                      <td style={{ padding: '4px', textAlign: 'center', color: '#28a745', fontWeight: 'bold' }}>{s.ganados}</td>
                                      <td style={{ padding: '4px', textAlign: 'center', color: '#c0392b' }}>{s.perdidos}</td>
                                      <td style={{ padding: '4px', textAlign: 'center', color: '#6b6b6b' }}>{s.noPresentado}</td>
                                      <td style={{ padding: '4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        {!standbyMap[p.jugador_id] && (
                                          <button
                                            onClick={() => activarStandbyAdmin(p.jugador_id, p.jugadores?.nombre || 'este jugador')}
                                            disabled={activandoStandbyId === p.jugador_id}
                                            title="Activar standby (viaje) — única vez por temporada"
                                            style={{
                                              background: 'none', border: 'none', color: activandoStandbyId === p.jugador_id ? '#ccc' : '#e67e22',
                                              cursor: activandoStandbyId === p.jugador_id ? 'not-allowed' : 'pointer', fontSize: '13px', padding: '2px 4px'
                                            }}
                                          >
                                            {activandoStandbyId === p.jugador_id ? '⏳' : '🧳'}
                                          </button>
                                        )}
                                        <button
                                          onClick={() => retirarDeEscalafon(p.id, p.jugadores?.nombre || 'este jugador')}
                                          disabled={retirandoPosicionId === p.id}
                                          title="Retirar del escalafón — usar si quedó en la categoría o género equivocado"
                                          style={{
                                            background: 'none', border: 'none', color: retirandoPosicionId === p.id ? '#ccc' : '#c0392b',
                                            cursor: retirandoPosicionId === p.id ? 'not-allowed' : 'pointer', fontSize: '13px', padding: '2px 4px'
                                          }}
                                        >
                                          {retirandoPosicionId === p.id ? '⏳' : '🗑️'}
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      })}
                    </div>
                    {modoSorteoManual && (
                      <div style={{ marginTop: '20px', textAlign: 'center' }}>
                        <button
                          onClick={confirmarSorteoManual}
                          disabled={guardandoSorteoManual}
                          style={{
                            background: guardandoSorteoManual ? '#ccc' : '#28a745', color: 'white', border: 'none',
                            padding: '14px 32px', borderRadius: '8px', cursor: guardandoSorteoManual ? 'not-allowed' : 'pointer',
                            fontSize: '16px', fontWeight: 'bold'
                          }}
                        >
                          {guardandoSorteoManual ? '⏳ Guardando...' : '✅ Confirmar sorteo manual completo'}
                        </button>
                        <p style={{ fontSize: '12px', color: '#6b6b6b', marginTop: '8px' }}>
                          Verifica que cada categoría/género tenga las posiciones 1 a N completas antes de confirmar — no se puede deshacer.
                        </p>
                      </div>
                    )}
                    </>
                  )}

                  {temporadaActiva.sorteo_realizado && Object.keys(ladderPreview).length > 0 && (
                    <div style={{ marginTop: '30px' }}>
                      <h3 style={{ color: 'var(--color-ink)' }}>🏆 Premios sugeridos</h3>
                      <p style={{ fontSize: '13px', color: '#6b6b6b', margin: '0 0 16px 0' }}>
                        Basado en el escalafón actual — el campeón (posición #1) y quien más subió desde su posición inicial, por categoría.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {Object.entries(ladderPreview).map(([key, lista]) => {
                          const [catVal, genVal] = key.split('__')
                          const catLabel = CATEGORIAS.find(c => c.value === catVal)?.label || catVal
                          const genLabel = GENEROS.find(g => g.value === genVal)?.label || genVal

                          const campeon = lista.find((p: any) => p.posicion === 1)

                          const conProgreso = lista.map((p: any) => ({
                            ...p,
                            progreso: (p.posicion_inicial ?? p.posicion) - p.posicion,
                          }))
                          const mayorProgreso = conProgreso.reduce(
                            (max: any, p: any) => (!max || p.progreso > max.progreso ? p : max),
                            null
                          )

                          return (
                            <div key={key} style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', borderTop: '3px solid var(--color-ball)' }}>
                              <h4 style={{ color: 'var(--color-ink)', marginTop: 0, marginBottom: '12px' }}>{catLabel} — {genLabel}</h4>
                              <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                                🏆 <strong>Campeón:</strong> {campeon?.jugadores?.nombre || '—'}
                              </p>
                              <p style={{ margin: 0, fontSize: '14px' }}>
                                📈 <strong>Mayor progreso:</strong> {mayorProgreso?.jugadores?.nombre || '—'}
                                {mayorProgreso && mayorProgreso.progreso > 0 && (
                                  <span style={{ color: '#28a745', fontWeight: 'bold' }}> (+{mayorProgreso.progreso} posiciones)</span>
                                )}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* HISTORIAL DE TEMPORADAS CERRADAS */}
              <div style={{ marginTop: '30px' }}>
                <h3 style={{ color: 'var(--color-ink)' }}>📜 Historial de escalafones cerrados</h3>
                {historial.length === 0 ? (
                  <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#6b6b6b', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                    Todavía no hay temporadas cerradas.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {historial.map((t) => (
                      <div key={t.id} style={{ background: 'var(--color-chalk)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <button
                            onClick={() => verHistorialTemporada(t.id)}
                            style={{
                              flex: 1, textAlign: 'left', padding: '16px 20px', background: 'none', border: 'none',
                              cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <span style={{ fontWeight: '600', color: 'var(--color-ink)' }}>{t.nombre}</span>
                            <span style={{ fontSize: '13px', color: '#6b6b6b' }}>
                              {t.fecha_inicio} → {t.fecha_fin} {historialAbierto === t.id ? '▲' : '▼'}
                            </span>
                          </button>
                          <button
                            onClick={() => eliminarTemporada(t.id, t.nombre)}
                            disabled={eliminandoTemp === t.id}
                            style={{
                              background: 'none', border: 'none', color: '#c0392b', cursor: eliminandoTemp === t.id ? 'not-allowed' : 'pointer',
                              fontSize: '18px', padding: '16px 20px',
                            }}
                            title="Eliminar esta temporada por completo"
                          >
                            {eliminandoTemp === t.id ? '⏳' : '🗑️'}
                          </button>
                        </div>

                        {historialAbierto === t.id && (
                          <div style={{ padding: '0 20px 20px 20px' }}>
                            {!historialPosiciones[t.id] ? (
                              <p style={{ color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando...</p>
                            ) : Object.keys(historialPosiciones[t.id]).length === 0 ? (
                              <p style={{ color: '#6b6b6b' }}>No hubo posiciones registradas en esta temporada.</p>
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
                                          <tr style={{ color: '#6b6b6b', textAlign: 'left' }}>
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
                                                <td
                                                  onClick={() => abrirTrayectoria(p.jugador_id)}
                                                  style={{ padding: '4px', color: '#333', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}
                                                >
                                                  {p.jugadores?.nombre || 'Jugador'}
                                                </td>
                                                <td style={{ padding: '4px', textAlign: 'center' }}>{s.jugados}</td>
                                                <td style={{ padding: '4px', textAlign: 'center', color: '#28a745', fontWeight: 'bold' }}>{s.ganados}</td>
                                                <td style={{ padding: '4px', textAlign: 'center', color: '#c0392b' }}>{s.perdidos}</td>
                                                <td style={{ padding: '4px', textAlign: 'center', color: '#6b6b6b' }}>{s.noPresentado}</td>
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
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <div style={{ flex: '1 1 260px', background: '#f0f7fc', border: '1px solid rgba(28,126,196,0.2)', borderRadius: '8px', padding: '12px 16px', fontSize: '13px' }}>
                    <strong style={{ color: 'var(--color-ink)' }}>📱 Datos para Pago Móvil:</strong>{' '}
                    <span style={{ color: '#333' }}>YELITZA CONTRERAS · V-19.523.642 · 0412-7628281 · Banco BNC</span>
                  </div>

                  <div style={{ flex: '1 1 260px', background: 'white', border: '1px solid rgba(28,126,196,0.3)', borderLeft: '4px solid #1c7ec4', borderRadius: '8px', padding: '12px 16px' }}>
                    {!editandoTasaBcv ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          {tasaBcvActual ? (
                            <p style={{ margin: 0, fontSize: '13px', color: '#333' }}>
                              💶 Tasa € del día <strong style={{ fontFamily: 'var(--font-mono)' }}>
                                {tasaBcvActual.valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </strong> según BCV
                              <span style={{ color: '#6b6b6b', fontSize: '11px' }}> — {new Date(tasaBcvActual.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            </p>
                          ) : (
                            <p style={{ margin: 0, fontSize: '13px', color: '#6b6b6b' }}>💶 Todavía no se ha registrado la tasa BCV de hoy.</p>
                          )}
                          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#999' }}>
                            Fuente: <a href="https://www.bcv.org.ve" target="_blank" rel="noopener noreferrer" style={{ color: '#999', textDecoration: 'underline' }}>bcv.org.ve</a>
                          </p>
                        </div>
                        <button
                          onClick={() => { setEditandoTasaBcv(true); setTasaBcvMsg('') }}
                          style={{ background: 'var(--color-court)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                        >
                          {tasaBcvActual ? '✏️ Actualizar' : '➕ Registrar'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Tasa € (Bs.)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={tasaBcvValorInput}
                              onChange={(e) => setTasaBcvValorInput(e.target.value)}
                              placeholder="Ej: 145.32"
                              style={{ padding: '7px 9px', borderRadius: '6px', border: '1px solid #ddd', width: '110px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Fecha</label>
                            <input
                              type="date"
                              value={tasaBcvFechaInput}
                              onChange={(e) => setTasaBcvFechaInput(e.target.value)}
                              style={{ padding: '7px 9px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                            />
                          </div>
                          <button
                            onClick={guardarTasaBcv}
                            disabled={guardandoTasaBcv}
                            style={{ background: guardandoTasaBcv ? '#ccc' : '#28a745', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: guardandoTasaBcv ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                          >
                            {guardandoTasaBcv ? 'Guardando...' : '✅ Guardar'}
                          </button>
                          <button
                            onClick={() => setEditandoTasaBcv(false)}
                            style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            Cancelar
                          </button>
                        </div>
                        {tasaBcvMsg && (
                          <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: '#f8d7da', color: '#721c24', fontSize: '12px' }}>
                            {tasaBcvMsg}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {!temporadaActivaPagos ? (
                  <p style={{ color: '#6b6b6b' }}>No hay una temporada activa en este momento.</p>
                ) : (
                  <>
                    <p style={{ color: '#6b6b6b', fontSize: '13px', margin: '0 0 16px 0' }}>
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
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Monto ({monedaDe(pagoTipo)})</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={pagoMontoCentavos ? formatearMontoDesdeCentavos(pagoMontoCentavos) : ''}
                          onChange={(e) => setPagoMontoCentavos(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="0,00"
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
                      <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>
                          {pagoTipo === 'efectivo' ? 'Seriales del billete' : 'Número de referencia'}
                        </label>
                        <input
                          type="text"
                          value={pagoReferencia}
                          onChange={(e) => setPagoReferencia(e.target.value)}
                          placeholder={pagoTipo === 'efectivo' ? 'Ej: AB1234567' : 'Ej: 000123456789'}
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

              {pagosPendientes.length > 0 && (
                <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', borderLeft: '4px solid #e67e22' }}>
                  <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>⏳ Pagos pendientes de validar</h3>
                  <p style={{ fontSize: '13px', color: '#6b6b6b', margin: '0 0 14px 0' }}>
                    Pagos reportados directamente por jugadores — revisa el comprobante con ellos y valida cuando confirmes que el pago sí se recibió.
                  </p>
                  <div className="table-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ color: '#6b6b6b', textAlign: 'left', borderBottom: '1px solid #eee' }}>
                          <th style={{ padding: '6px 10px' }}>Jugador</th>
                          <th style={{ padding: '6px 10px' }}>Tipo</th>
                          <th style={{ padding: '6px 10px' }}>Monto</th>
                          <th style={{ padding: '6px 10px' }}>Referencia</th>
                          <th style={{ padding: '6px 10px' }}>Fecha</th>
                          <th style={{ padding: '6px 10px', textAlign: 'center' }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagosPendientes.map((p) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '8px 10px' }}>{p.jugadores?.nombre || 'Jugador'}</td>
                            <td style={{ padding: '8px 10px', textTransform: 'capitalize' }}>{p.tipo_pago.replace('_', ' ')}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>
                              {monedaDe(p.tipo_pago)} {Number(p.monto).toLocaleString(p.tipo_pago === 'efectivo' ? 'en-US' : 'es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#555' }}>{p.referencia || '—'}</td>
                            <td style={{ padding: '8px 10px', color: '#6b6b6b' }}>{p.fecha}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <button
                                onClick={() => validarPago(p.id)}
                                disabled={validandoPago === p.id || rechazandoPago === p.id}
                                style={{
                                  background: validandoPago === p.id ? '#ccc' : '#28a745', color: 'white', border: 'none',
                                  padding: '5px 12px', borderRadius: '6px', cursor: validandoPago === p.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold', marginRight: '6px'
                                }}
                              >
                                {validandoPago === p.id ? 'Validando...' : '✅ Validar'}
                              </button>
                              <button
                                onClick={() => rechazarPago(p.id)}
                                disabled={validandoPago === p.id || rechazandoPago === p.id}
                                style={{
                                  background: rechazandoPago === p.id ? '#ccc' : '#fee2e2', color: '#dc2626', border: 'none',
                                  padding: '5px 12px', borderRadius: '6px', cursor: rechazandoPago === p.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold'
                                }}
                              >
                                {rechazandoPago === p.id ? 'Rechazando...' : '❌ Rechazar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {temporadaActivaPagos && (
                <div style={{ background: 'var(--color-chalk)', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                  <h3 style={{ color: 'var(--color-ink)', marginTop: 0 }}>✅ Estado de pago de inscritos</h3>
                  {inscritos.length === 0 ? (
                    <p style={{ color: '#6b6b6b', fontSize: '13px' }}>Todavía no hay jugadores anotados en esta temporada.</p>
                  ) : (
                    <>
                      <p style={{ fontSize: '13px', color: '#555', margin: '0 0 14px 0' }}>
                        {inscritos.filter((j) => pagaronSet.has(j.jugador_id)).length} de {inscritos.length} inscritos tienen pago registrado.
                      </p>
                      <div className="table-scroll">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ color: '#6b6b6b', textAlign: 'left', borderBottom: '1px solid #eee' }}>
                              <th style={{ padding: '6px 10px' }}>Jugador</th>
                              <th style={{ padding: '6px 10px' }}>Categoría</th>
                              <th style={{ padding: '6px 10px' }}>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inscritos.map((j: any) => {
                              const pagoValidado = pagosValidados.find((p) => p.jugador_id === j.jugador_id)
                              const pagoPendiente = pagosPendientes.find((p) => p.jugador_id === j.jugador_id)
                              return (
                                <tr key={j.jugador_id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                  <td
                                    onClick={() => abrirTrayectoria(j.jugador_id)}
                                    style={{ padding: '8px 10px', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}
                                  >
                                    {j.jugadores?.nombre || 'Jugador'}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: '#5c5c5c' }}>
                                    {categoriaLabel(j.categoria)} — {GENEROS.find(g => g.value === j.genero)?.label}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {pagoValidado ? (
                                      <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Pagado (recibo #{pagoValidado.numero_recibo})</span>
                                    ) : pagoPendiente ? (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#e67e22', fontWeight: 'bold' }}>⏳ Pago reportado, pendiente de validar</span>
                                        <button
                                          onClick={() => validarPago(pagoPendiente.id)}
                                          disabled={validandoPago === pagoPendiente.id || rechazandoPago === pagoPendiente.id}
                                          style={{
                                            background: validandoPago === pagoPendiente.id ? '#ccc' : '#28a745', color: 'white', border: 'none',
                                            padding: '4px 10px', borderRadius: '6px', cursor: validandoPago === pagoPendiente.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold'
                                          }}
                                        >
                                          {validandoPago === pagoPendiente.id ? 'Validando...' : '✅ Validar'}
                                        </button>
                                        <button
                                          onClick={() => rechazarPago(pagoPendiente.id)}
                                          disabled={validandoPago === pagoPendiente.id || rechazandoPago === pagoPendiente.id}
                                          style={{
                                            background: rechazandoPago === pagoPendiente.id ? '#ccc' : '#fee2e2', color: '#dc2626', border: 'none',
                                            padding: '4px 10px', borderRadius: '6px', cursor: rechazandoPago === pagoPendiente.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold'
                                          }}
                                        >
                                          {rechazandoPago === pagoPendiente.id ? 'Rechazando...' : '❌ Rechazar'}
                                        </button>
                                      </span>
                                    ) : (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#c0392b', fontWeight: 'bold' }}>❌ Sin pago</span>
                                        {recordatoriosDe(j.jugador_id).length > 0 && (
                                          <span style={{ color: '#e67e22', fontSize: '12px' }}>
                                            📧 {recordatoriosDe(j.jugador_id).length} recordatorio{recordatoriosDe(j.jugador_id).length > 1 ? 's' : ''}
                                            {' · último '}
                                            {new Date(recordatoriosDe(j.jugador_id)[0].enviado_at).toLocaleDateString('es-ES')}
                                          </span>
                                        )}
                                        <button
                                          onClick={() => notificarPagoPendiente(j.jugador_id)}
                                          disabled={notificando === j.jugador_id}
                                          style={{
                                            background: notificando === j.jugador_id ? '#ccc' : '#e67e22', color: 'white', border: 'none',
                                            padding: '4px 10px', borderRadius: '6px', cursor: notificando === j.jugador_id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold'
                                          }}
                                        >
                                          {notificando === j.jugador_id ? 'Enviando...' : '📧 Notificar'}
                                        </button>
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="pagos-imprimible" style={{ background: 'var(--color-chalk)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <div style={{ padding: '20px 20px 0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ color: 'var(--color-ink)', margin: 0 }}>📋 Pagos validados</h3>
                    <p style={{ fontSize: '12px', color: '#6b6b6b', marginTop: '4px' }}>{rangoTexto}</p>
                    {pagosFiltrados.length > 0 && (
                      <p style={{ fontSize: '13px', color: '#555', marginTop: '6px' }}>
                        Total Bs. (pago móvil + transferencia): <strong>Bs. {totalesPorMoneda.bolivares.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        {' · '}
                        Total $ (efectivo): <strong>$ {totalesPorMoneda.dolares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </p>
                    )}
                  </div>
                  {pagosValidados.length > 0 && (
                    <div className="no-imprimir" style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block', marginBottom: '2px' }}>Desde</label>
                        <input
                          type="date"
                          value={filtroFechaDesde}
                          onChange={(e) => setFiltroFechaDesde(e.target.value)}
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#6b6b6b', display: 'block', marginBottom: '2px' }}>Hasta</label>
                        <input
                          type="date"
                          value={filtroFechaHasta}
                          onChange={(e) => setFiltroFechaHasta(e.target.value)}
                          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                        />
                      </div>
                      {(filtroFechaDesde || filtroFechaHasta) && (
                        <button
                          onClick={() => { setFiltroFechaDesde(''); setFiltroFechaHasta('') }}
                          style={{ background: 'none', border: '1px solid #ccc', color: '#555', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                        >
                          Limpiar
                        </button>
                      )}
                      <button
                        onClick={exportarExcel}
                        style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                      >
                        📊 Exportar a Excel
                      </button>
                      <button
                        onClick={imprimirPagos}
                        style={{ background: 'var(--color-court)', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                      >
                        🖨️ Imprimir / PDF
                      </button>
                    </div>
                  )}
                </div>
                {loadingPagos ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }} className="loading-row"><span className="spinner" /> Cargando pagos...</div>
                ) : pagosFiltrados.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#6b6b6b' }}>
                    {pagosValidados.length === 0 ? 'Todavía no hay pagos validados.' : 'No hay pagos en el rango de fechas seleccionado.'}
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-court)', color: 'var(--color-chalk)' }}>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Recibo</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Jugador</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Tipo</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Monto</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Referencia</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left' }}>Fecha</th>
                          <th className="no-imprimir" style={{ padding: '10px 16px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagosFiltrados.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'var(--color-chalk)' : '#fafafa' }}>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>#{p.numero_recibo}</td>
                            <td style={{ padding: '10px 16px' }}>{p.jugadores?.nombre || 'Jugador'}</td>
                            <td style={{ padding: '10px 16px', fontSize: '13px', textTransform: 'capitalize' }}>{p.tipo_pago.replace('_', ' ')}</td>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>
                              {editandoMontoPagoId === p.id ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={nuevoMontoInput}
                                    onChange={(e) => setNuevoMontoInput(e.target.value)}
                                    style={{ width: '90px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => guardarNuevoMonto(p.id)}
                                    disabled={guardandoMonto}
                                    style={{ background: '#28a745', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                  >
                                    {guardandoMonto ? '...' : '✅'}
                                  </button>
                                  <button
                                    onClick={() => setEditandoMontoPagoId(null)}
                                    style={{ background: 'none', border: '1px solid #ccc', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {monedaDe(p.tipo_pago)} {Number(p.monto).toLocaleString(p.tipo_pago === 'efectivo' ? 'en-US' : 'es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  <button
                                    onClick={() => abrirEdicionMonto(p)}
                                    className="no-imprimir"
                                    title="Editar monto"
                                    style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '11px', marginLeft: '6px' }}
                                  >
                                    ✏️
                                  </button>
                                </>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: '13px', color: '#555' }}>{p.referencia || '—'}</td>
                            <td style={{ padding: '10px 16px', fontSize: '13px', color: '#6b6b6b' }}>{p.fecha}</td>
                            <td className="no-imprimir" style={{ padding: '10px 16px', textAlign: 'center' }}>
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
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--color-ink)', fontWeight: 'bold' }}>
                          <td colSpan={3} style={{ padding: '12px 16px', textAlign: 'right' }}>TOTALES</td>
                          <td colSpan={4} style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)' }}>
                            Bs. {totalesPorMoneda.bolivares.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {'   ·   '}
                            $ {totalesPorMoneda.dolares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {jugadorModal && (
        <div
          onClick={() => setJugadorModal(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,27,38,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', zIndex: 1000, cursor: 'zoom-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-chalk)', borderRadius: '12px', borderTop: '3px solid var(--color-ball)',
              padding: '28px', maxWidth: '380px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', cursor: 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: 'var(--color-ink)', fontSize: '22px', margin: 0 }}>
                  {jugadorModal.nombre || 'Cargando…'}
                </h3>
                {jugadorModal.categoria && (
                  <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-court)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '4px 0 0 0' }}>
                    {CATEGORIAS.find(c => c.value === jugadorModal.categoria)?.label} — {GENEROS.find(g => g.value === jugadorModal.genero)?.label}
                  </p>
                )}
              </div>
              <button
                onClick={() => setJugadorModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999', lineHeight: 1 }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: '18px' }}>
              {cargandoTrayectoriaModal ? (
                <p className="loading-row" style={{ fontSize: '13px', color: '#6b6b6b' }}><span className="spinner" /> Cargando trayectoria…</p>
              ) : !trayectoriaModal || trayectoriaModal.jugados === 0 ? (
                <p style={{ fontSize: '13px', color: '#6b6b6b' }}>Todavía no tiene partidos registrados.</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {[
                      { key: 'temporadas', label: 'Temporadas', valor: trayectoriaModal.temporadas },
                      { key: 'jugados', label: 'Jugados', valor: trayectoriaModal.jugados },
                      { key: 'ganados', label: 'Ganados', valor: trayectoriaModal.ganados, color: '#28a745' },
                      { key: 'perdidos', label: 'Perdidos', valor: trayectoriaModal.perdidos, color: '#c0392b' },
                      { key: 'pct', label: '% Victorias', valor: `${trayectoriaModal.porcentajeVictorias}%` },
                      { key: 'mejor', label: 'Mejor pos.', valor: trayectoriaModal.mejorPosicion ? `#${trayectoriaModal.mejorPosicion}` : '—' },
                    ].map((item) => {
                      const esClicable = item.key === 'temporadas' || item.key === 'ganados'
                      return (
                        <div
                          key={item.label}
                          onClick={() => esClicable && setPanelModalAbierto(panelModalAbierto === item.key ? null : item.key)}
                          style={{
                            background: panelModalAbierto === item.key ? 'rgba(28,126,196,0.14)' : 'rgba(28,126,196,0.06)',
                            border: '1px solid rgba(28,126,196,0.15)',
                            borderRadius: '8px', padding: '10px', textAlign: 'center',
                            cursor: esClicable ? 'pointer' : 'default',
                          }}
                        >
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '18px', color: item.color || 'var(--color-ink)' }}>
                            {item.valor}
                          </div>
                          <div style={{ fontSize: '10px', color: '#6b6b6b', marginTop: '2px' }}>
                            {item.label}{esClicable && ' 🔍'}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {panelModalAbierto === 'temporadas' && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                      {trayectoriaModal.temporadasDetalle.map((t: any, i: number) => (
                        <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '6px', padding: '8px 12px', fontSize: '11px' }}>
                          <strong>{t.nombre}</strong> — {CATEGORIAS.find(c => c.value === t.categoria)?.label} / {GENEROS.find(g => g.value === t.genero)?.label}
                          <br />
                          <span style={{ color: '#6b6b6b' }}>
                            Posición final #{t.posicion} (inicial #{t.posicionInicial}) · {t.fechaInicio} al {t.fechaFin}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {panelModalAbierto === 'ganados' && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                      {trayectoriaModal.partidosGanadosDetalle.map((p: any, i: number) => (
                        <div key={i} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '6px', padding: '8px 12px', fontSize: '11px' }}>
                          vs <strong>{p.oponente}</strong> — <span style={{ fontFamily: 'var(--font-mono)' }}>{p.marcador}</span>
                          <br />
                          <span style={{ color: '#6b6b6b' }}>{p.temporada} · {p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {carnetAmpliado && (
        <div
          onClick={() => setCarnetAmpliado(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,27,38,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', zIndex: 1100, cursor: 'zoom-out',
          }}
        >
          <img
            src={carnetAmpliado}
            alt="Carné de socio ampliado"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '6px', cursor: 'default' }}
          />
        </div>
      )}
    </div>
  )
}
