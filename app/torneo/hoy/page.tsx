import NavJugador from '@/app/components/NavJugador'
import { supabaseServer } from '@/lib/supabaseServer'
import { hoyEnCaracas } from '@/lib/tiempo'
import { esFechaISO, fechaCorta, partidosDelDia, sumarDias, type FilaDifusion, type LadoFila } from '@/lib/torneoDifusion'
import { cargarPartidosDifusion } from '@/lib/torneoDifusionServidor'

// "Hoy en la Copa" (SPEC §18): la pieza del día en vivo, en HTML. Pública:
// para la bio de Instagram y el grupo de WhatsApp.
export const dynamic = 'force-dynamic'

const AZUL_MARINO = '#0B1F3A'
const DORADO = '#E3B341'
const TENUE = '#A9B6C9'

function Lado({ lado, vs, atenuar }: { lado: LadoFila; vs: boolean; atenuar: boolean }) {
  return (
    <div style={{ fontSize: '15px', lineHeight: 1.35, color: lado.ganador ? DORADO : atenuar || !lado.conocido ? TENUE : 'white', fontWeight: lado.ganador ? 700 : 500 }}>
      {vs && <span style={{ color: TENUE, fontWeight: 500, fontSize: '13px' }}>vs </span>}
      {lado.texto}
      {lado.nota && <span style={{ fontSize: '12px', fontWeight: 700, marginLeft: '8px', whiteSpace: 'nowrap' }}>{lado.nota}</span>}
    </div>
  )
}

function Fila({ f }: { f: FilaDifusion }) {
  const conResultado = f.estado === 'jugado' || f.estado === 'wo'
  return (
    <div style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.06)', borderLeft: `4px solid ${f.estado === 'programado' ? '#1E4E9C' : DORADO}`, padding: '10px 12px', marginBottom: '8px' }}>
      <div style={{ width: '64px', flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '19px', color: 'white' }}>{f.hora}</div>
        <div style={{ fontSize: '11px', color: TENUE, marginTop: '2px' }}>{f.cancha}</div>
      </div>
      <div style={{ minWidth: 0, flexGrow: 1 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: DORADO, marginBottom: '3px' }}>{f.categoria} · {f.etapa}</div>
        <Lado lado={f.a} vs={false} atenuar={conResultado && !f.a.ganador} />
        <Lado lado={f.b} vs atenuar={conResultado && !f.b.ganador} />
        {f.marcador && <div style={{ fontSize: '15px', fontWeight: 800, color: 'white', marginTop: '4px' }}>{f.marcador}</div>}
      </div>
    </div>
  )
}

export default async function HoyEnLaCopa({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: pedida } = await searchParams
  const hoy = hoyEnCaracas()
  const fecha = esFechaISO(pedida) ? pedida : hoy
  const filas = partidosDelDia(await cargarPartidosDifusion(supabaseServer()), fecha)

  const flecha = (destino: string, texto: string, etiqueta: string) => (
    <a href={`/torneo/hoy?fecha=${destino}`} aria-label={etiqueta} style={{ color: DORADO, fontSize: '26px', fontWeight: 800, textDecoration: 'none', padding: '4px 14px' }}>{texto}</a>
  )

  return (
    <main className="court-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
      <NavJugador />
      <div style={{ background: AZUL_MARINO, borderTop: `4px solid ${DORADO}`, borderRadius: '6px', padding: '22px 14px', width: '100%', maxWidth: '640px', boxSizing: 'border-box' }}>
        <header style={{ textAlign: 'center', marginBottom: '16px' }}>
          <h1 style={{ margin: 0, color: 'white', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(24px, 6vw, 32px)' }}>{fecha === hoy ? 'Hoy en la Copa' : 'En la Copa'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '6px' }}>
            {flecha(sumarDias(fecha, -1), '‹', 'Día anterior')}
            <span style={{ color: DORADO, fontWeight: 800, fontSize: '20px', minWidth: '130px' }}>{fechaCorta(fecha)}</span>
            {flecha(sumarDias(fecha, 1), '›', 'Día siguiente')}
          </div>
        </header>

        {filas.length === 0
          ? <p style={{ color: TENUE, textAlign: 'center', margin: '28px 0' }}>No hay partidos programados este día.</p>
          : filas.map((f) => <Fila key={f.id} f={f} />)}

        <div style={{ textAlign: 'center', marginTop: '18px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {fecha !== hoy && <a href="/torneo/hoy" style={{ color: 'white', fontSize: '14px', fontWeight: 700, textDecoration: 'none', border: `1px solid ${DORADO}`, borderRadius: '4px', padding: '8px 16px' }}>Volver a hoy</a>}
          <a href="/torneo" style={{ color: 'white', fontSize: '14px', fontWeight: 700, textDecoration: 'none', border: `1px solid ${DORADO}`, borderRadius: '4px', padding: '8px 16px' }}>🏆 Grupos y llave</a>
        </div>
      </div>
    </main>
  )
}
