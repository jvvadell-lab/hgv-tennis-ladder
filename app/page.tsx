'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { inicioDelDiaEnCaracas, finDelDiaEnCaracas } from '@/lib/tiempo'
import { ESTADOS_RESERVA_OCUPAN_CANCHA } from '@/lib/reservas'
import type { PatrocinantePublico } from '@/lib/patrocinantes'
import BannerTorneo, { type TorneoPortada } from '@/app/components/BannerTorneo'
import CintaPatrocinantes from '@/app/components/CintaPatrocinantes'

// Portada. Orden pensado para el celular: encabezado compacto, anuncio del
// club, banner del torneo vigente, accesos, "en cancha hoy" y la cinta de
// patrocinantes. El torneo y los patrocinantes vienen de /api/publico/portada
// (la clave anónima no los lee); anuncio, retos y reservas igual que antes.

type Session = {
  role: 'admin' | 'jugador' | 'academia'
  id: string
  nombre: string
} | null

type Anuncio = {
  titulo: string
  descripcion: string
  activo: boolean
} | null

type PartidoHoy = {
  id: string
  cancha: string
  nombre_cancha_foranea: string | null
  fecha_propuesta: string
  retador: { nombre: string } | null
  retado: { nombre: string } | null
}

type ReservaHoy = {
  id: string
  cancha: string
  fecha_hora: string
  jugadores: { nombre: string } | null
}

type Portada = { torneo: TorneoPortada | null; patrocinantes: PatrocinantePublico[] }

function nombreCanchaCorta(cancha: string, nombreForanea: string | null) {
  if (cancha === 'FORANEA') return nombreForanea || 'Foránea'
  if (cancha === 'HGV1') return 'HGV 1'
  if (cancha === 'HGV2') return 'HGV 2'
  return cancha
}

const horaCaracas = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' })

type Acceso = { href: string; titulo: string; detalle: string; icono: string; destacado?: boolean }

export default function Home() {
  const [session, setSession] = useState<Session>(null)
  const [checking, setChecking] = useState(true)
  const [anuncio, setAnuncio] = useState<Anuncio>(null)
  const [partidosHoy, setPartidosHoy] = useState<PartidoHoy[]>([])
  const [reservasHoy, setReservasHoy] = useState<ReservaHoy[]>([])
  const [cargandoPartidosHoy, setCargandoPartidosHoy] = useState(true)
  const [portada, setPortada] = useState<Portada | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setSession(data.session))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    fetch('/api/publico/portada')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPortada(d ? { torneo: d.torneo, patrocinantes: d.patrocinantes || [] } : { torneo: null, patrocinantes: [] }))
      .catch(() => setPortada({ torneo: null, patrocinantes: [] }))
  }, [])

  useEffect(() => {
    supabase
      .from('anuncio')
      .select('titulo, descripcion, activo')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.activo && data.titulo) setAnuncio(data as Anuncio)
      })
  }, [])

  useEffect(() => {
    const inicioHoy = inicioDelDiaEnCaracas(new Date())
    const finHoy = finDelDiaEnCaracas(new Date())

    const retos = supabase
      .from('retos')
      .select('id, cancha, nombre_cancha_foranea, fecha_propuesta, retador:retador_id(nombre), retado:retado_id(nombre)')
      .eq('estado', 'aceptado')
      .gte('fecha_propuesta', inicioHoy.toISOString())
      .lte('fecha_propuesta', finHoy.toISOString())
      .order('fecha_propuesta', { ascending: true })
      .then(({ data }) => setPartidosHoy((data as any) || []))

    const reservas = supabase
      .from('reservas_cancha')
      .select('id, cancha, fecha_hora, jugadores:jugador_id(nombre)')
      .in('estado', ESTADOS_RESERVA_OCUPAN_CANCHA)
      .gte('fecha_hora', inicioHoy.toISOString())
      .lte('fecha_hora', finHoy.toISOString())
      .order('fecha_hora', { ascending: true })
      .then(({ data }) => setReservasHoy((data as any) || []))

    Promise.all([retos, reservas]).finally(() => setCargandoPartidosHoy(false))
  }, [])

  async function cerrarSesion() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.reload()
  }

  const torneo = portada?.torneo ?? null
  const patrocinantes = portada?.patrocinantes ?? []
  const principales = patrocinantes.filter((p) => p.nivel === 'principal')

  const accesos: Acceso[] = [
    // Antes de que arranque el torneo, el acceso lleva directo a la inscripción.
    torneo && (torneo.estado === 'borrador' || torneo.estado === 'inscripcion')
      ? { href: '/torneo/inscripcion', titulo: 'Inscripción', detalle: 'Copa Navidad', icono: '🏆', destacado: true }
      : { href: '/torneo', titulo: 'Torneo', detalle: 'Llaves y calendario', icono: '🏆', destacado: !!torneo },
    { href: '/reservas', titulo: 'Reservar', detalle: 'Cancha HGV 1 y HGV 2', icono: '📅' },
    { href: '/ladder', titulo: 'Escalera', detalle: 'Escalafón y retos', icono: '🪜' },
    { href: '/galeria', titulo: 'Galería', detalle: 'Fotos de partidos', icono: '📸' },
  ]
  if (!checking && session?.role === 'admin') accesos.push({ href: '/admin', titulo: 'Panel admin', detalle: 'Gestión del club', icono: '⚙️' })
  if (!checking && session?.role === 'academia') accesos.push({ href: '/academia', titulo: 'Academia', detalle: 'Horario de clases', icono: '🎾' })
  if (!checking && session?.role === 'jugador') accesos.push({ href: '/perfil', titulo: 'Mi perfil', detalle: 'Datos y carné', icono: '👤' })

  const enCancha = [
    ...partidosHoy.map((p) => ({ tipo: 'escalera' as const, hora: p.fecha_propuesta, data: p })),
    ...reservasHoy.map((r) => ({ tipo: 'casual' as const, hora: r.fecha_hora, data: r })),
  ].sort((a, b) => (a.hora < b.hora ? -1 : 1))

  return (
    <main className="court-bg portada">
      {/* Encabezado compacto */}
      <header className="portada-header">
        <Link href="/" className="portada-marca">
          <img src="/logo-hgv.png" alt="" width={56} height={56} />
          <span>
            <strong>HGV Tennis Club</strong>
            <small>Hermandad Gallega de Valencia</small>
          </span>
        </Link>
        <div className="portada-sesion">
          {checking ? null : session ? (
            <>
              <span className="portada-nombre">{session.nombre.split(' ')[0]}</span>
              <button onClick={cerrarSesion}>Salir</button>
            </>
          ) : (
            <>
              <Link href="/login" className="portada-entrar">Entrar</Link>
              <Link href="/register" className="portada-registro">Registrarme</Link>
            </>
          )}
        </div>
      </header>

      <div className="portada-contenido">
        {/* Anuncio del club */}
        {anuncio && (
          <div className="anuncio-banner portada-anuncio">
            <p>📢 Anuncio del club</p>
            <h3>{anuncio.titulo}</h3>
            {anuncio.descripcion && <span>{anuncio.descripcion}</span>}
          </div>
        )}

        {/* Banner 1: torneo vigente (Copa Navidad) — lo ve todo el mundo */}
        {portada === null ? (
          <div className="banner-torneo-esqueleto" aria-hidden="true" />
        ) : torneo ? (
          <BannerTorneo torneo={torneo} conectado={!!session} principales={principales} />
        ) : null}

        {/* Accesos */}
        <nav className="portada-accesos" aria-label="Secciones">
          {accesos.map((a) => (
            <Link key={a.href} href={a.href} className="portada-acceso" data-destacado={a.destacado || undefined}>
              <span className="portada-acceso-icono" aria-hidden="true">{a.icono}</span>
              <strong>{a.titulo}</strong>
              <small>{a.detalle}</small>
            </Link>
          ))}
        </nav>

        {/* En cancha hoy: retos de la escalera y reservas casuales */}
        {!cargandoPartidosHoy && enCancha.length > 0 && (
          <section className="portada-hoy" aria-labelledby="portada-hoy-titulo">
            <p id="portada-hoy-titulo">🎾 En cancha hoy</p>
            <ul>
              {enCancha.map((item) => (
                <li key={`${item.tipo}-${item.data.id}`}>
                  {item.tipo === 'escalera' ? (
                    <span>
                      <strong>{item.data.retador?.nombre || '—'}</strong> vs <strong>{item.data.retado?.nombre || '—'}</strong>
                      <em> · escalera</em>
                    </span>
                  ) : (
                    <span>
                      <strong>{item.data.jugadores?.nombre || 'Socio'}</strong>
                      <em> · reserva</em>
                    </span>
                  )}
                  <span className="portada-hoy-hora">
                    {horaCaracas(item.hora)}
                    {' · '}
                    {item.tipo === 'escalera'
                      ? nombreCanchaCorta(item.data.cancha, item.data.nombre_cancha_foranea)
                      : nombreCanchaCorta(item.data.cancha, null)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Banner 2: patrocinantes */}
        <CintaPatrocinantes patrocinantes={patrocinantes} />

        <p className="portada-footer">© 2026 HGV Tennis Club · Comisión de Tenis</p>
      </div>
    </main>
  )
}
