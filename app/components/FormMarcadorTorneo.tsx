'use client'
import { useState } from 'react'
import { validarSetInfantil, validarShortSets } from '@/lib/torneoResultados'
import { construirSets, pideTiebreak, type CampoSet, type SetJugado } from '@/lib/resultados'

// Formulario del marcador de un partido de torneo (2 sets + Super Tiebreak
// si quedan 1-1, tie-break en 6-6, retiro). Arma `sets` con construirSets
// (el mismo de la escalera) y lo manda con onEnviar; el servidor vuelve a
// validar todo. Lo usan "Mis partidos" (reportar) y la pestaña Resultados
// del admin (cargar y validar). A = equipo_a, B = equipo_b.

const vacio = (): CampoSet => ({ golesRetador: '', golesRetado: '', tbRetador: '', tbRetado: '' })

const num: React.CSSProperties = { width: '48px', padding: '6px', fontSize: '15px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }

export default function FormMarcadorTorneo({ nombreA, nombreB, inscripcionA, inscripcionB, textoBoton, onEnviar, onCancelar, limiteInfantil }: {
  limiteInfantil?: number
  nombreA: string
  nombreB: string
  inscripcionA: string
  inscripcionB: string
  textoBoton: string
  onEnviar: (datos: { sets: unknown; tipoResultado: 'normal' | 'retiro'; retiradaInscripcionId: string | null }) => Promise<void>
  onCancelar: () => void
}) {
  const [set1, setSet1] = useState(vacio)
  const [set2, setSet2] = useState(vacio)
  const [st, setSt] = useState(vacio)
  const [retiro, setRetiro] = useState(false)
  const [retirada, setRetirada] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const corto = limiteInfantil === -4
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const r: { error: string } | { sets: SetJugado[] } = corto ? (() => {
      const sets: SetJugado[] = []
      for (const [i,c] of [set1,set2,st].entries()) {
        if (!c.golesRetador.trim() && !c.golesRetado.trim()) continue
        if (!c.golesRetador.trim() || !c.golesRetado.trim() || i !== sets.length) return { error: 'Introduce ambos marcadores en orden' }
        const a=Number(c.golesRetador), b=Number(c.golesRetado), hi=Math.max(a,b), lo=Math.min(a,b)
        const tb=i<2 && hi===5 && lo===4
        if (tb && (!c.tbRetador?.trim() || !c.tbRetado?.trim())) return { error: 'Introduce ambos puntos del tie-break' }
        sets.push({numero:i+1,games_j1:a,games_j2:b,completo:i===2 ? hi===Math.max(10,lo+2) : tb || (hi===4 && lo<=2) || (hi===5 && lo===3), ...(i===2 ? {es_super_tiebreak:true} : {}), ...(tb ? {tiebreak_retador:Number(c.tbRetador),tiebreak_retado:Number(c.tbRetado)} : {})})
      }
      const error=validarShortSets(sets,retiro)
      return error ? {error} : {sets}
    })() : limiteInfantil ? ((): { error: string } | { sets: SetJugado[] } => {
      const a = Number(set1.golesRetador), b = Number(set1.golesRetado)
      if (!set1.golesRetador.trim() || !set1.golesRetado.trim()) return { error: 'Introduce ambos games' }
      const tb = Math.max(a,b) === limiteInfantil+1 && Math.min(a,b) === limiteInfantil
      const sets = [{ numero: 1, games_j1: a, games_j2: b, completo: tb || (Math.max(a,b) === limiteInfantil && Math.min(a,b) < limiteInfantil), ...(tb ? { tiebreak_retador: Number(set1.tbRetador), tiebreak_retado: Number(set1.tbRetado) } : {}) }]
      if (tb && (!set1.tbRetador?.trim() || !set1.tbRetado?.trim())) return { error: 'Introduce ambos puntos del tie-break' }
      const error = validarSetInfantil(sets, limiteInfantil, retiro)
      return error ? { error } : { sets }
    })() : construirSets({ set1, set2, st, retiro })
    if ('error' in r) return setError(r.error ?? 'Marcador inválido')
    if (retiro && !retirada) return setError('Indica quién se retiró')
    setEnviando(true)
    try {
      await onEnviar({ sets: r.sets, tipoResultado: retiro ? 'retiro' : 'normal', retiradaInscripcionId: retiro ? retirada : null })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const fila = (titulo: string, c: CampoSet, set: (c: CampoSet) => void, conTb: boolean) => (
    <tr>
      <td style={{ paddingRight: '10px', fontSize: '13px', fontWeight: 600 }}>{titulo}</td>
      <td><input inputMode="numeric" aria-label={`${titulo} ${nombreA}`} value={c.golesRetador} onChange={(e) => set({ ...c, golesRetador: e.target.value })} style={num} /></td>
      <td><input inputMode="numeric" aria-label={`${titulo} ${nombreB}`} value={c.golesRetado} onChange={(e) => set({ ...c, golesRetado: e.target.value })} style={num} /></td>
      {conTb && (limiteInfantil ? Math.max(Number(c.golesRetador),Number(c.golesRetado)) === Math.abs(limiteInfantil)+1 && Math.min(Number(c.golesRetador),Number(c.golesRetado)) === Math.abs(limiteInfantil) : pideTiebreak(c.golesRetador, c.golesRetado)) && (
        <td style={{ fontSize: '12px', paddingLeft: '8px' }}>
          TB <input inputMode="numeric" aria-label={`Tie-break ${titulo} ${nombreA}`} value={c.tbRetador} onChange={(e) => set({ ...c, tbRetador: e.target.value })} style={{ ...num, width: '40px' }} />
          {' '}<input inputMode="numeric" aria-label={`Tie-break ${titulo} ${nombreB}`} value={c.tbRetado} onChange={(e) => set({ ...c, tbRetado: e.target.value })} style={{ ...num, width: '40px' }} />
        </td>
      )}
    </tr>
  )

  return (
    <form onSubmit={enviar} style={{ marginTop: '10px', background: 'rgba(28,126,196,0.05)', border: '1px solid rgba(28,126,196,0.15)', borderRadius: '6px', padding: '12px' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: '4px' }}>
        <thead>
          <tr style={{ fontSize: '12px', color: '#555' }}>
            <th />
            <th style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreA}</th>
            <th style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreB}</th>
          </tr>
        </thead>
        <tbody>
          {fila('Set 1', set1, setSet1, true)}
          {(corto || !limiteInfantil) && fila('Set 2', set2, setSet2, true)}
          {(corto || !limiteInfantil) && fila('Super TB', st, setSt, false)}
        </tbody>
      </table>
      <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 8px 0' }}>{corto ? 'Dos Short Sets a 4, punto de oro. 5-3 válido; en 4-4 TB a 7 (registra 5-4). En 1-1 Super TB a 10, diferencia de 2.' : limiteInfantil ? `Set a ${limiteInfantil} games, punto de oro. En ${limiteInfantil}-${limiteInfantil}, TB a 7 con diferencia de 2; registra ${limiteInfantil+1}-${limiteInfantil} o al revés.` : 'El Super Tiebreak (a 10) solo si quedan 1 set a 1. Si un set termina 7-6, carga también su tie-break (ej. 7-6 con TB 7-4).'}</p>
      <label style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input type="checkbox" checked={retiro} onChange={(e) => setRetiro(e.target.checked)} /> Hubo un retiro (carga lo jugado hasta ese momento)
      </label>
      {retiro && (
        <select value={retirada} onChange={(e) => setRetirada(e.target.value)} style={{ marginTop: '6px', padding: '6px', fontSize: '13px' }}>
          <option value="">¿Quién se retiró?</option>
          <option value={inscripcionA}>{nombreA}</option>
          <option value={inscripcionB}>{nombreB}</option>
        </select>
      )}
      {error && <p style={{ background: '#f8d7da', color: '#842029', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', margin: '8px 0 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button type="submit" disabled={enviando} style={{ padding: '8px 14px', border: 'none', borderRadius: '4px', background: enviando ? '#9bb' : 'var(--color-court)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
          {enviando ? 'Enviando…' : textoBoton}
        </button>
        <button type="button" onClick={onCancelar} style={{ padding: '8px 14px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
      </div>
    </form>
  )
}
