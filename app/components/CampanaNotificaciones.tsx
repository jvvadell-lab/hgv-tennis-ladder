'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Notificacion = {
  id: string
  tipo: string
  reto_id: string | null
  mensaje: string
  leido: boolean
  created_at: string
}

export default function CampanaNotificaciones({ jugadorId }: { jugadorId: string }) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let cancelado = false

    async function cargarInicial() {
      const [{ count }, { data: recientes }] = await Promise.all([
        supabase.from('notificaciones').select('id', { count: 'exact', head: true })
          .eq('jugador_id', jugadorId).eq('leido', false),
        supabase.from('notificaciones').select('id, tipo, reto_id, mensaje, leido, created_at')
          .eq('jugador_id', jugadorId).order('created_at', { ascending: false }).limit(20),
      ])
      if (cancelado) return
      setNoLeidas(count || 0)
      setNotificaciones(recientes || [])
    }
    cargarInicial()

    const canal = supabase
      .channel(`notificaciones-${jugadorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `jugador_id=eq.${jugadorId}` },
        (payload) => {
          const nueva = payload.new as Notificacion
          setNotificaciones((prev) => [nueva, ...prev].slice(0, 20))
          setNoLeidas((prev) => prev + 1)
        }
      )
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [jugadorId])

  useEffect(() => {
    function alHacerClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', alHacerClickFuera)
    return () => document.removeEventListener('mousedown', alHacerClickFuera)
  }, [])

  async function marcarLeida(notif: Notificacion) {
    if (notif.leido) return
    setNotificaciones((prev) => prev.map((n) => (n.id === notif.id ? { ...n, leido: true } : n)))
    setNoLeidas((prev) => Math.max(0, prev - 1))
    try {
      // keepalive: el click navega a /ladder de inmediato — sin esto, el
      // navegador cancela el POST a medias antes de que llegue al servidor.
      await fetch('/api/jugador/marcar-notificacion-leida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificacionId: notif.id }),
        keepalive: true,
      })
    } catch {
      // Si falla, se queda marcada como leída en el cliente — no es crítico,
      // en el peor caso el badge queda desincronizado hasta la próxima carga.
    }
  }

  return (
    // Todo este árbol usa <span> en vez de <div>/<p> — el componente se monta
    // dentro de un <p> en ladder/page.tsx, y HTML no permite bloques anidados
    // en un <p> (rompería la hidratación de React).
    <span ref={contenedorRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label="Notificaciones"
        style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '20px', padding: '4px', lineHeight: 1, verticalAlign: 'middle',
        }}
      >
        🔔
        {noLeidas > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -4, minWidth: '16px', height: '16px',
            padding: '0 4px', borderRadius: '9px', backgroundColor: 'var(--color-court)',
            color: 'var(--color-chalk)', fontSize: '10px', fontWeight: 700,
            fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', lineHeight: 1,
          }}>
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <span style={{
          position: 'absolute', right: 0, top: '32px', width: '300px', maxHeight: '360px',
          overflowY: 'auto', backgroundColor: 'var(--color-ink)', border: '1px solid var(--color-line)',
          borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 1000, display: 'block',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', color: 'var(--color-ball)', fontSize: '11px',
            letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0, padding: '12px 14px 8px',
            display: 'block',
          }}>
            Notificaciones
          </span>
          {notificaciones.length === 0 ? (
            <span style={{ color: 'rgba(247,243,234,0.6)', fontSize: '13px', padding: '4px 14px 14px', display: 'block' }}>
              No tienes notificaciones todavía.
            </span>
          ) : (
            notificaciones.map((n) => (
              <a
                key={n.id}
                href="/ladder"
                onClick={() => marcarLeida(n)}
                style={{
                  display: 'block', padding: '10px 14px', textDecoration: 'none',
                  borderTop: '1px solid rgba(77,101,117,0.4)',
                  backgroundColor: n.leido ? 'transparent' : 'rgba(28,126,196,0.12)',
                }}
              >
                <span style={{ color: 'var(--color-chalk)', fontSize: '13px', margin: 0, lineHeight: 1.4, display: 'block' }}>
                  {!n.leido && (
                    <span style={{
                      display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                      backgroundColor: 'var(--color-ball)', marginRight: '6px',
                    }} />
                  )}
                  {n.mensaje}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', color: 'rgba(247,243,234,0.5)', fontSize: '10px',
                  margin: '4px 0 0 0', display: 'block',
                }}>
                  {new Date(n.created_at).toLocaleString('es-ES', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    timeZone: 'America/Caracas',
                  })}
                </span>
              </a>
            ))
          )}
        </span>
      )}
    </span>
  )
}
