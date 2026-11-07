'use client'
import { useEffect, useState } from 'react'
import { formatearFechaCorta, formatearHora } from '@/lib/tiempo'
import { CUADROS, ETIQUETA_FASE, PREFIJO_FASE, TITULO_CUADRO, cabezasDeSerieCuadros, cuadroDe, numeroPartido, type Cuadro, type Fase, type FormatoLlave } from '@/lib/torneo'
import type { SetJugado } from '@/lib/resultados'

// "🎾 Ver llave" de /torneo: el cuadro dibujado al estilo tenis. En el formato
// cuadros, la primera ronda a la izquierda y los cuadros A y B a la derecha; en
// el teléfono se ve un panel a la vez. En el formato normal, solo la llave.

export type PartidoTorneo = {
  id: string; categoria_id: string; formato_llave: FormatoLlave; fase: Fase; grupo: string | null; orden: number
  origen_a: string | null; origen_b: string | null; equipo_a: string | null; equipo_b: string | null
  cancha: string | null; fecha_hora: string | null; estado: string; sets: SetJugado[] | null; tipo_resultado: string
  ganador: string | null; wo_ausente: string | null; retirada: string | null; handicap: string | null; foto_url: string | null
}

type Comun = {
  nombre: (id: string | null) => string | null
  mias: Set<string>
  marcador: (p: PartidoTorneo, lado: 'a' | 'b') => string
  origen: (o: string | null) => string
  semillas: Map<string, number>
}

const FASES: Fase[] = ['cuartos', 'semis', 'final']
// Alto de un partido de la primera columna. La altura del cuadro es fija, para
// que cada ronda reparta exacto y las líneas queden alineadas con cualquier nombre.
const ALTO_HUECO = 136
const CERRADO = ['jugado', 'wo', 'doble_wo']

const cuando = (p: PartidoTorneo) =>
  p.fecha_hora ? ` · ${formatearFechaCorta(p.fecha_hora, { mes: 'corto' })} ${formatearHora(p.fecha_hora)} · ${p.cancha}` : ''

const columnasDe = (partidos: PartidoTorneo[]) =>
  FASES.map((f) => partidos.filter((p) => p.fase === f).sort((a, b) => a.orden - b.orden)).filter((c) => c.length)

function Ficha({ p, titulo, c }: { p: PartidoTorneo; titulo: string; c: Comun }) {
  const lado = (l: 'a' | 'b') => {
    const id = l === 'a' ? p.equipo_a : p.equipo_b
    const semilla = id ? c.semillas.get(id) : undefined
    return (
      <div className={`cd-lado${id && c.mias.has(id) ? ' cd-mia' : ''}${id && p.ganador === id ? ' cd-gana' : ''}`}>
        <span className={id ? 'cd-nombre' : 'cd-nombre cd-vacio'} title={id ? c.nombre(id) ?? undefined : undefined}>
          {semilla && <b className="cd-semilla">[{semilla}] </b>}
          {id ? c.nombre(id) : c.origen(l === 'a' ? p.origen_a : p.origen_b)}
        </span>
        <span className="cd-marcador">{c.marcador(p, l)}</span>
      </div>
    )
  }
  return (
    <div className="cd-ficha">
      <div className="cd-meta">{titulo}{cuando(p)}</div>
      {lado('a')}
      {lado('b')}
    </div>
  )
}

function Campeon({ final, c }: { final: PartidoTorneo; c: Comun }) {
  const sub = final.ganador ? (final.ganador === final.equipo_a ? final.equipo_b : final.equipo_a) : null
  const mia = final.ganador && c.mias.has(final.ganador)
  return (
    <div className={`cd-ficha cd-campeon${mia ? ' cd-mia' : ''}`}>
      <div className="cd-copa">🏆</div>
      {final.ganador
        ? <div className="cd-gana">{c.nombre(final.ganador)}</div>
        : <div className="cd-vacio">Por definir</div>}
      {sub && <div className="cd-sub">🥈 Subcampeón: {c.nombre(sub)}</div>}
    </div>
  )
}

// Cada ronda se reparte en pares que entran a un partido de la siguiente.
function Ronda({ col, primera, c }: { col: PartidoTorneo[]; primera: boolean; c: Comun }) {
  const pares: PartidoTorneo[][] = []
  for (let i = 0; i < col.length; i += 2) pares.push(col.slice(i, i + 2))
  return (
    <div className="cd-col">
      <div className="cd-fase">{ETIQUETA_FASE[col[0].fase]}</div>
      <div className="cd-pares">
        {pares.map((par) => (
          <div key={par[0].id} className={`cd-par${par.length === 2 ? ' cd-unir' : ''}`}>
            {par.map((p) => (
              <div key={p.id} className={`cd-hueco cd-sale${primera ? '' : ' cd-entra'}`}>
                <Ficha p={p} titulo={`${PREFIJO_FASE[p.fase as Exclude<Fase, 'grupo'>]}${p.orden}`} c={c} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Cuadro({ titulo, partidos, c }: { titulo?: string; partidos: PartidoTorneo[]; c: Comun }) {
  const columnas = columnasDe(partidos)
  const final = columnas[columnas.length - 1]?.[0]
  if (!final) return null
  return (
    <section className="cd-cuadro">
      {titulo && <h3 className="cd-titulo">{titulo}</h3>}
      <div className="cd-rondas" style={{ '--cd-alto': `${columnas[0].length * ALTO_HUECO}px` } as React.CSSProperties}>
        {columnas.map((col, i) => <Ronda key={col[0].id} col={col} primera={i === 0} c={c} />)}
        <div className="cd-col cd-col-campeon">
          <div className="cd-fase">Campeón</div>
          <div className="cd-pares"><div className="cd-par"><div className="cd-hueco cd-entra"><Campeon final={final} c={c} /></div></div></div>
        </div>
      </div>
    </section>
  )
}

type Panel = 'ronda' | Cuadro

export default function CuadroDibujado({ categoria, partidos, nombre, mias, marcador, origen, onCerrar }: {
  categoria: string
  partidos: PartidoTorneo[]
  nombre: Comun['nombre']
  mias: Set<string>
  marcador: Comun['marcador']
  origen: Comun['origen']
  onCerrar: () => void
}) {
  const cuadros = partidos.some((p) => p.formato_llave === 'cuadros')
  const ronda = partidos.filter((p) => p.fase === 'grupo').sort((a, b) => (a.grupo ?? '').localeCompare(b.grupo ?? ''))
  const [panel, setPanel] = useState<Panel>(ronda.every((p) => CERRADO.includes(p.estado)) ? 'A' : 'ronda')
  const c: Comun = { nombre, mias, marcador, origen, semillas: cuadros ? cabezasDeSerieCuadros(partidos) : new Map() }

  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => { document.body.style.overflow = previo; window.removeEventListener('keydown', tecla) }
  }, [onCerrar])

  const paneles: [Panel, string][] = [['ronda', 'Primera ronda'], ...CUADROS.map((q) => [q, TITULO_CUADRO[q]] as [Panel, string])]
  const visible = (p: Panel) => (panel === p ? '' : ' cd-oculto')

  return (
    <div className="cd-capa" role="dialog" aria-modal="true" aria-label={`Llave de ${categoria}`}>
      <style>{ESTILOS}</style>
      <header className="cd-cabecera">
        <h2>🎾 {categoria}</h2>
        <button onClick={onCerrar} aria-label="Cerrar" autoFocus>✕</button>
      </header>
      {cuadros && (
        <nav className="cd-pestanas">
          {paneles.map(([id, texto]) => (
            <button key={id} onClick={() => setPanel(id)} className={panel === id ? 'cd-activa' : ''}>{texto}</button>
          ))}
        </nav>
      )}
      <div className="cd-lienzo">
        {cuadros ? (
          <div className="cd-todo">
            <section className={`cd-ronda1${visible('ronda')}`}>
              <h3 className="cd-titulo">Primera ronda</h3>
              <div className="cd-lista">
                {ronda.map((p) => <Ficha key={p.id} p={p} titulo={`Partido ${numeroPartido(p.grupo ?? 'A')}`} c={c} />)}
              </div>
            </section>
            <div className="cd-derecha">
              {CUADROS.map((q) => (
                <div key={q} className={visible(q).trim()}>
                  <Cuadro titulo={TITULO_CUADRO[q]} partidos={partidos.filter((p) => cuadroDe(p) === q)} c={c} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Cuadro partidos={partidos.filter((p) => p.fase !== 'grupo')} c={c} />
        )}
      </div>
    </div>
  )
}

const LINEA = '1.5px solid rgba(15,27,38,0.45)'
const ESTILOS = `
.cd-capa { position: fixed; inset: 0; z-index: 2000; background: var(--color-chalk); display: flex; flex-direction: column; color: var(--color-ink); }
.cd-cabecera { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-bottom: 1px solid rgba(15,27,38,0.15); }
.cd-cabecera h2 { margin: 0; font-family: var(--font-display); font-size: 18px; min-width: 0; }
.cd-cabecera button { flex: none; width: 36px; height: 36px; border: 1px solid rgba(15,27,38,0.25); border-radius: 50%; background: white; cursor: pointer; font-size: 15px; color: var(--color-ink); }
.cd-pestanas { display: flex; gap: 6px; padding: 8px 16px; border-bottom: 1px solid rgba(15,27,38,0.1); }
.cd-pestanas button { flex: 1; padding: 8px 4px; border-radius: 6px; border: 1px solid rgba(15,27,38,0.2); background: white; color: var(--color-ink); font-weight: 700; font-size: 13px; cursor: pointer; }
.cd-pestanas button.cd-activa { background: var(--color-ink); color: white; border-color: var(--color-ink); }
.cd-lienzo { flex: 1; overflow: auto; padding: 12px 16px 24px; -webkit-overflow-scrolling: touch; }
.cd-todo { display: block; }
.cd-oculto { display: none; }
.cd-titulo { font-family: var(--font-display); font-size: 16px; margin: 0 0 8px 0; }
.cd-lista { display: grid; gap: 8px; }
.cd-rondas { display: flex; align-items: stretch; width: max-content; }
.cd-col { display: flex; flex-direction: column; width: 196px; flex: none; }
.cd-col-campeon { width: 160px; }
.cd-fase { font-weight: 800; font-size: 12px; padding: 0 14px 6px; }
.cd-pares { height: var(--cd-alto); display: flex; flex-direction: column; }
.cd-par { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
.cd-par.cd-unir::after { content: ''; position: absolute; right: 0; top: 25%; bottom: 25%; border-right: ${LINEA}; }
.cd-hueco { flex: 1 1 0; display: flex; align-items: center; position: relative; min-height: 0; padding: 4px 14px; box-sizing: border-box; }
.cd-hueco.cd-entra::before { content: ''; position: absolute; left: 0; top: 50%; width: 14px; border-top: ${LINEA}; }
.cd-hueco.cd-sale::after { content: ''; position: absolute; right: 0; top: 50%; width: 14px; border-top: ${LINEA}; }
.cd-ficha { width: 100%; background: white; border: 1px solid rgba(15,27,38,0.2); border-radius: 5px; overflow: hidden; font-size: 12px; }
.cd-meta { font-size: 10px; color: #666; padding: 2px 6px; background: rgba(15,27,38,0.04); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cd-lado { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 3px 6px; min-height: 22px; font-weight: 500; }
.cd-lado + .cd-lado { border-top: 1px solid #eee; }
.cd-mia { background: #fff3b0; }
.cd-gana { font-weight: 800; }
.cd-nombre { min-width: 0; line-height: 1.2; overflow-wrap: anywhere; }
.cd-rondas .cd-lado { font-size: 11px; }
.cd-rondas .cd-nombre { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.cd-vacio { color: #888; font-style: italic; }
.cd-semilla { color: var(--color-court-deep); }
.cd-marcador { font-family: var(--font-mono); white-space: nowrap; font-size: 11px; }
.cd-campeon { padding: 8px 6px; text-align: center; line-height: 1.25; }
.cd-copa { font-size: 20px; }
.cd-sub { font-size: 11px; color: #555; margin-top: 4px; }
@media (min-width: 1000px) {
  .cd-pestanas { display: none; }
  .cd-oculto { display: block; }
  .cd-todo { display: flex; gap: 28px; align-items: flex-start; }
  .cd-ronda1 { width: 250px; flex: none; }
  .cd-derecha { display: grid; gap: 22px; }
}
`
