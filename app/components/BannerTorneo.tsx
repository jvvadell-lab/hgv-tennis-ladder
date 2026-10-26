'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatearFechaCorta, formatearHora, instanteEnCaracas } from '@/lib/tiempo'
import type { PatrocinantePublico } from '@/lib/patrocinantes'
import { enlaceDe } from '@/lib/patrocinantes'

// Banner animado del torneo vigente en la portada (Torneo Navidad). Cambia
// solo según torneos.estado:
//   borrador            → "muy pronto", sin botón de inscripción
//   inscripcion         → cuenta regresiva al cierre + cupos + inscribirme
//   sorteado / en_curso → partidos de hoy + ver llaves
//   finalizado          → no se muestra (la API ya no lo devuelve)
// La animación es CSS (globals.css, .banner-torneo*) y respeta
// prefers-reduced-motion.

export type CategoriaPortada = {
  id: string
  nombre: string
  es_infantil: boolean
  modalidad: string
  cupo: number
  inscritas: number
  abiertas: boolean
}

export type TorneoPortada = {
  nombre: string
  estado: 'borrador' | 'inscripcion' | 'sorteado' | 'en_curso' | 'finalizado'
  fecha_inicio: string
  fecha_fin: string
  fecha_sorteo: string | null
  cierre_inscripciones_at: string | null
  monto_inscripcion_eur: number
  sorteado: boolean
  programacion_publicada: boolean
  categorias: CategoriaPortada[]
  partidosHoy: { id: string; categoria: string; fecha_hora: string; cancha: string | null; a: string; b: string }[]
}

const fechaCorta = (iso: string) => formatearFechaCorta(instanteEnCaracas(iso, '12:00'))

function useAhora(intervaloMs: number) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), intervaloMs)
    return () => clearInterval(t)
  }, [intervaloMs])
  return ahora
}

function CuentaRegresiva({ hasta }: { hasta: string }) {
  const ahora = useAhora(30_000)
  const resta = new Date(hasta).getTime() - ahora
  if (resta <= 0) return null
  const dias = Math.floor(resta / 86_400_000)
  const horas = Math.floor((resta % 86_400_000) / 3_600_000)
  const minutos = Math.floor((resta % 3_600_000) / 60_000)
  const celdas = dias > 0
    ? [{ v: dias, l: dias === 1 ? 'día' : 'días' }, { v: horas, l: 'horas' }]
    : [{ v: horas, l: 'horas' }, { v: minutos, l: 'min' }]
  return (
    <div className="banner-torneo-cuenta" aria-label="Tiempo para el cierre de inscripciones">
      {celdas.map((c) => (
        <div key={c.l}>
          <strong>{c.v}</strong>
          <span>{c.l}</span>
        </div>
      ))}
      <p>para el cierre</p>
    </div>
  )
}

function Copos() {
  // Copos en posiciones fijas (sin Math.random para no romper la hidratación).
  const copos = [6, 17, 29, 41, 53, 64, 76, 88, 95]
  return (
    <div className="banner-torneo-copos" aria-hidden="true">
      {copos.map((x, i) => (
        <span key={x} style={{ left: `${x}%`, animationDelay: `${(i * 0.83) % 6}s`, animationDuration: `${6 + (i % 3) * 1.5}s` }} />
      ))}
    </div>
  )
}

export default function BannerTorneo({ torneo, conectado, principales }: {
  torneo: TorneoPortada
  conectado: boolean
  principales: PatrocinantePublico[]
}) {
  const adultos = torneo.categorias.filter((c) => !c.es_infantil)
  const infantil = torneo.categorias.filter((c) => c.es_infantil)
  const hayAbiertas = torneo.categorias.some((c) => c.abiertas)
  const infantilAbierta = infantil.some((c) => c.abiertas)
  const enJuego = torneo.estado === 'sorteado' || torneo.estado === 'en_curso'
  const destino = (ruta: string) => (conectado ? ruta : `/login?next=${encodeURIComponent(ruta)}`)

  const etiqueta =
    torneo.estado === 'borrador' ? 'Muy pronto'
      : torneo.estado === 'inscripcion' ? (hayAbiertas ? 'Inscripciones abiertas' : 'Inscripciones cerradas')
        : torneo.estado === 'sorteado' ? 'Sorteo publicado'
          : 'En juego'

  return (
    <section className="banner-torneo" aria-labelledby="banner-torneo-titulo">
      <Copos />
      <div className="banner-torneo-cuerpo">
        <p className="banner-torneo-kicker">
          <span className="banner-torneo-pill">{etiqueta}</span>
          Torneo interno · {fechaCorta(torneo.fecha_inicio)} – {fechaCorta(torneo.fecha_fin)}
        </p>
        <h2 id="banner-torneo-titulo">{torneo.nombre}</h2>

        {torneo.estado === 'borrador' && (
          <p className="banner-torneo-texto">
            Dobles, mixto con handicap, single y categorías infantiles. Las inscripciones abren muy pronto.
          </p>
        )}

        {torneo.estado === 'inscripcion' && (
          <>
            <div className="banner-torneo-fila">
              <p className="banner-torneo-texto">
                {torneo.monto_inscripcion_eur} € por jugador
                {torneo.fecha_sorteo ? ` · sorteo el ${fechaCorta(torneo.fecha_sorteo)}` : ''}
              </p>
              {hayAbiertas && torneo.cierre_inscripciones_at && <CuentaRegresiva hasta={torneo.cierre_inscripciones_at} />}
            </div>
            <ul className="banner-torneo-cupos">
              {adultos.map((c) => {
                const lleno = c.inscritas >= c.cupo
                return (
                  <li key={c.id} data-estado={!c.abiertas ? 'cerrada' : lleno ? 'llena' : 'abierta'}>
                    <span>{c.nombre}</span>
                    <strong>{c.abiertas ? (lleno ? 'Completa' : `${c.inscritas}/${c.cupo}`) : 'Cerrada'}</strong>
                  </li>
                )
              })}
              {infantil.length > 0 && (
                <li data-estado={infantilAbierta ? 'abierta' : 'cerrada'}>
                  <span>Infantil y juvenil</span>
                  <strong>{infantilAbierta ? `${infantil.reduce((s, c) => s + c.inscritas, 0)} niños` : 'Cerrada'}</strong>
                </li>
              )}
            </ul>
          </>
        )}

        {enJuego && (
          torneo.partidosHoy.length > 0 ? (
            <ul className="banner-torneo-hoy">
              {torneo.partidosHoy.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <span><strong>{p.a}</strong> vs <strong>{p.b}</strong> <em>· {p.categoria}</em></span>
                  <span className="banner-torneo-hora">{formatearHora(p.fecha_hora)}{p.cancha ? ` · ${p.cancha.replace('HGV', 'HGV ')}` : ''}</span>
                </li>
              ))}
              {torneo.partidosHoy.length > 4 && <li className="banner-torneo-mas">y {torneo.partidosHoy.length - 4} partidos más hoy</li>}
            </ul>
          ) : (
            <p className="banner-torneo-texto">
              {torneo.programacion_publicada ? 'Hoy no hay partidos del torneo. Mira el calendario y las llaves.' : 'Ya salió el sorteo. La programación se publica muy pronto.'}
            </p>
          )
        )}

        <div className="banner-torneo-acciones">
          {torneo.estado === 'inscripcion' && hayAbiertas && (
            <>
              <Link href={destino('/torneo/inscripcion')} className="banner-torneo-cta">Inscribirme</Link>
              {infantilAbierta && (
                <Link href={destino('/torneo/inscripcion/infantil')} className="banner-torneo-secundario">Infantil y juvenil</Link>
              )}
            </>
          )}
          {enJuego && <Link href="/torneo" className="banner-torneo-cta">Ver llaves y calendario</Link>}
          {!enJuego && <Link href="/torneo" className="banner-torneo-link">Ver el torneo →</Link>}
        </div>

        {principales.length > 0 && (
          <div className="banner-torneo-presenta">
            <span>Presentado por</span>
            {principales.map((p) => {
              const href = enlaceDe(p)
              const logo = p.logo_url
                ? <img src={p.logo_url} alt={p.nombre} loading="lazy" />
                : <strong>{p.nombre}</strong>
              return href
                ? <a key={p.id} href={href} target="_blank" rel="noopener noreferrer">{logo}</a>
                : <span key={p.id}>{logo}</span>
            })}
          </div>
        )}
      </div>
    </section>
  )
}
