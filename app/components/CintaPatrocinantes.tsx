'use client'
import type { PatrocinantePublico } from '@/lib/patrocinantes'
import { enlaceDe } from '@/lib/patrocinantes'

// Cinta de patrocinantes de la portada. Con 3 o más logos corre en bucle
// (la lista va duplicada para que el salto sea invisible) y se detiene al
// pasar el dedo o el ratón; con menos, o con prefers-reduced-motion, queda
// fija y centrada. Estilos en globals.css (.cinta-patro*).
function Tarjeta({ p, oculto }: { p: PatrocinantePublico; oculto?: boolean }) {
  const href = enlaceDe(p)
  const contenido = (
    <>
      <div className="cinta-patro-logo" data-fondo={p.fondo}>
        {p.logo_url ? <img src={p.logo_url} alt={oculto ? '' : p.nombre} loading="lazy" /> : <strong>{p.nombre}</strong>}
      </div>
      {p.promo
        ? <p className="cinta-patro-promo">{p.promo}</p>
        : p.instagram ? <p className="cinta-patro-ig">@{p.instagram}</p> : null}
    </>
  )
  const props = { className: 'cinta-patro-item', 'aria-hidden': oculto || undefined, tabIndex: oculto ? -1 : undefined }
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{contenido}</a>
    : <div {...props}>{contenido}</div>
}

export default function CintaPatrocinantes({ patrocinantes }: { patrocinantes: PatrocinantePublico[] }) {
  if (!patrocinantes.length) return null
  const enBucle = patrocinantes.length >= 3
  // Duración proporcional al número de logos: ~4 s por logo.
  const duracion = `${Math.max(16, patrocinantes.length * 4)}s`

  return (
    <section className="cinta-patro" aria-label="Patrocinantes">
      <p className="cinta-patro-titulo">Con el apoyo de</p>
      <div className={enBucle ? 'cinta-patro-ventana' : undefined}>
        <div className={enBucle ? 'cinta-patro-pista' : 'cinta-patro-fija'} style={enBucle ? { animationDuration: duracion } : undefined}>
          {patrocinantes.map((p) => <Tarjeta key={p.id} p={p} />)}
          {enBucle && patrocinantes.map((p) => <Tarjeta key={`${p.id}-copia`} p={p} oculto />)}
        </div>
      </div>
    </section>
  )
}
