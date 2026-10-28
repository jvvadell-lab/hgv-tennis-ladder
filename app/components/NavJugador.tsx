'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Navegación común de las pantallas del jugador (no se usa en /admin ni
// /academia). En el celular es una barra fija abajo; en pantalla ancha, una
// fila de botones arriba. Los estilos están en globals.css (.nav-jugador*),
// incluido el espacio al final del <main> para que la barra no tape nada.
// Va como primer hijo del <main> de cada página.

const ACCESOS = [
  { href: '/', icono: '🏠', texto: 'Inicio', activo: (p: string) => p === '/' },
  { href: '/torneo', icono: '🎄', texto: 'Copa', activo: (p: string) => p.startsWith('/torneo') },
  { href: '/reservas', icono: '🎾', texto: 'Reservar', activo: (p: string) => p.startsWith('/reservas') },
  { href: '/perfil', icono: '👤', texto: 'Mi perfil', activo: (p: string) => p.startsWith('/perfil') },
]

export default function NavJugador() {
  const pathname = usePathname() || ''
  return (
    <nav className="nav-jugador" aria-label="Navegación principal">
      {ACCESOS.map((a) => {
        const actual = a.activo(pathname)
        return (
          <Link key={a.href} href={a.href} className="nav-jugador-item" aria-current={actual ? 'page' : undefined}>
            <span className="nav-jugador-icono" aria-hidden="true">{a.icono}</span>
            <span>{a.texto}</span>
          </Link>
        )
      })}
    </nav>
  )
}
