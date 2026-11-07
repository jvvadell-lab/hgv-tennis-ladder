import { ALTO_DIA, ALTO_FILA, MAX_FILAS_GRANDES, fechaEncabezado, fuenteNombresGrande, type DiaDifusion, type FilaDifusion, type FormatoPieza, type LadoFila } from '@/lib/torneoDifusion'

// La pieza que se publica (SPEC §18), con el estilo del flyer de la
// inauguración. Satori solo entiende flexbox y no dibuja emojis sin ir a
// internet: por eso aquí no hay ninguno.

export const AZUL_MARINO = '#0B1F3A'
const DORADO = '#E3B341'
const AZUL = '#1E4E9C'
const ROJO = '#C7102E'
const BLANCO = '#FFFFFF'
const TENUE = '#A9B6C9'
const TITULOS = 'Barlow Condensed'

export type LogoPieza = { nombre: string; src: string | null; fondo: 'claro' | 'oscuro' }

type Props = {
  formato: FormatoPieza
  encabezado: string          // HOY EN LA COPA | PROGRAMACIÓN DE LA SEMANA
  detalle: string             // VIE 6 NOV | 9 AL 13 NOV
  dias: DiaDifusion[]
  conEncabezadoDia: boolean
  pagina: number
  paginas: number
  logoHgv: string
  logoCopa: string
  logoComision: string
  patrocinantes: LogoPieza[]
}

function Lado({ lado, prefijo, resaltar, fuente = 32 }: { lado: LadoFila; prefijo: boolean; resaltar: boolean; fuente?: number }) {
  const menor = Math.round(fuente * 0.75)
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: Math.round(fuente * 1.3125) }}>
      <div style={{ display: 'flex', width: Math.round(fuente * 1.375), flexShrink: 0, fontSize: menor, color: TENUE, fontWeight: 500 }}>{prefijo ? 'vs' : ''}</div>
      <div style={{
        display: 'block', flexShrink: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: fuente, lineHeight: 1.25,
        fontWeight: lado.ganador ? 700 : 500,
        color: lado.ganador ? DORADO : resaltar ? TENUE : lado.conocido ? BLANCO : TENUE,
      }}>{lado.texto}</div>
      {lado.nota && <div style={{ display: 'flex', flexShrink: 0, marginLeft: 14, fontSize: menor, fontWeight: 700, color: lado.ganador ? DORADO : TENUE }}>{lado.nota}</div>}
    </div>
  )
}

function Fila({ f }: { f: FilaDifusion }) {
  const conResultado = f.estado === 'jugado' || f.estado === 'wo'
  return (
    <div style={{ display: 'flex', height: ALTO_FILA - 12, marginBottom: 12, background: 'rgba(255,255,255,0.06)', borderLeft: `6px solid ${f.estado === 'programado' ? AZUL : DORADO}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: 150, flexShrink: 0 }}>
        <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: 52, color: BLANCO, lineHeight: 1 }}>{f.hora}</div>
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 500, color: TENUE, marginTop: 6 }}>{f.cancha}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 20 }}>
        <div style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: TITULOS, fontWeight: 700, fontSize: 27, letterSpacing: 1, color: DORADO, marginBottom: 2 }}>
          {`${f.categoria} · ${f.etapa}`.toUpperCase()}
        </div>
        <Lado lado={f.a} prefijo={false} resaltar={conResultado && !f.a.ganador} />
        <Lado lado={f.b} prefijo resaltar={conResultado && !f.b.ganador} />
      </div>
      {f.marcador && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, maxWidth: 270, paddingRight: 22, textAlign: 'right', fontFamily: TITULOS, fontWeight: 800, fontSize: 38, color: BLANCO, lineHeight: 1.05 }}>
          {f.marcador}
        </div>
      )}
    </div>
  )
}

// Fila de la Historia de un día: la hora arriba deja todo el ancho a los nombres.
function FilaGrande({ f, fuente }: { f: FilaDifusion; fuente: number }) {
  const conResultado = f.estado === 'jugado' || f.estado === 'wo'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20, padding: '18px 28px', background: 'rgba(255,255,255,0.06)', borderLeft: `6px solid ${f.estado === 'programado' ? AZUL : DORADO}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: 64, color: BLANCO, lineHeight: 1 }}>{f.hora}</div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 500, color: TENUE, marginLeft: 22 }}>{f.cancha}</div>
        </div>
        {f.marcador && <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: 48, color: BLANCO, lineHeight: 1 }}>{f.marcador}</div>}
      </div>
      <div style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: TITULOS, fontWeight: 700, fontSize: 32, letterSpacing: 1, color: DORADO, marginTop: 4, marginBottom: 2 }}>
        {`${f.categoria} · ${f.etapa}`.toUpperCase()}
      </div>
      <Lado lado={f.a} prefijo={false} resaltar={conResultado && !f.a.ganador} fuente={fuente} />
      <Lado lado={f.b} prefijo resaltar={conResultado && !f.b.ganador} fuente={fuente} />
    </div>
  )
}

function Logo({ p, ancho, alto }: { p: LogoPieza; ancho: number; alto: number }) {
  const oscuro = p.fondo === 'oscuro'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: ancho, height: alto, margin: 4, borderRadius: 8, background: oscuro ? AZUL_MARINO : BLANCO }}>
      {p.src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={p.src} width={ancho - 16} height={alto - 12} style={{ objectFit: 'contain' }} alt="" />
        : <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: oscuro ? BLANCO : AZUL_MARINO, textAlign: 'center' }}>{p.nombre}</div>}
    </div>
  )
}

export default function Pieza({ formato, encabezado, detalle, dias, conEncabezadoDia, pagina, paginas, logoHgv, logoCopa, logoComision, patrocinantes }: Props) {
  const historia = formato === 'historia'
  const logo = historia ? 104 : 84
  const copa = historia ? 140 : 96
  const vacio = !dias.length
  const filas = dias.flatMap((d) => d.filas)
  const grande = historia && !conEncabezadoDia && !vacio && filas.length <= MAX_FILAS_GRANDES
  const fuente = grande ? fuenteNombresGrande(filas) : 32
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: AZUL_MARINO, fontFamily: 'Inter', color: BLANCO }}>
      <div style={{ display: 'flex', height: 12, background: DORADO, flexShrink: 0 }} />

      {/* Los tres logos como en el flyer: la Copa al centro y más grande. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: historia ? '28px 48px 0' : '16px 48px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoHgv} width={Math.round(logo * 0.64)} height={logo} style={{ objectFit: 'contain' }} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoCopa} width={copa} height={copa} style={{ objectFit: 'contain', margin: '0 44px' }} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoComision} width={logo} height={logo} style={{ objectFit: 'contain' }} alt="" />
        </div>
        <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: TENUE, marginTop: 6, lineHeight: 1.1 }}>COMISIÓN DE TENIS · HERMANDAD GALLEGA DE VALENCIA</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: historia ? '18px 48px 26px' : '12px 48px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: encabezado.length > 20 ? 84 : historia ? 92 : 76, lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>{encabezado}</div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 800, fontSize: historia ? 76 : 62, lineHeight: 1, color: DORADO }}>{detalle}</div>
          {paginas > 1 && <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 700, fontSize: 40, color: TENUE, marginLeft: 24 }}>{`${pagina}/${paginas}`}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '0 40px', justifyContent: 'center', alignItems: vacio ? 'center' : 'stretch' }}>
        {vacio && <div style={{ display: 'flex', fontSize: 38, fontWeight: 500, color: TENUE }}>Sin partidos programados</div>}
        {dias.map((d) => (
          <div key={d.fecha} style={{ display: 'flex', flexDirection: 'column' }}>
            {conEncabezadoDia && (
              <div style={{ display: 'flex', alignItems: 'center', height: ALTO_DIA, fontFamily: TITULOS, fontWeight: 800, fontSize: 40, letterSpacing: 2, color: BLANCO }}>{fechaEncabezado(d.fecha)}</div>
            )}
            {d.filas.map((f) => grande ? <FilaGrande key={f.id} f={f} fuente={fuente} /> : <Fila key={f.id} f={f} />)}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 6, background: DORADO }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: historia ? 66 : 54, background: AZUL, fontFamily: TITULOS, fontWeight: 700, fontSize: 30, letterSpacing: 4 }}>
          COPA NAVIDAD HGV 2026
        </div>
        <div style={{ display: 'flex', height: 8, background: ROJO }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: BLANCO, padding: historia ? '16px 20px 60px' : '8px 20px 12px' }}>
          <div style={{ display: 'flex', fontFamily: TITULOS, fontWeight: 700, fontSize: 22, letterSpacing: 6, color: AZUL_MARINO, marginBottom: 4 }}>PATROCINAN</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
            {patrocinantes.map((p) => <Logo key={p.nombre} p={p} ancho={122} alto={historia ? 72 : 56} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
