import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { capturarDesdeDolarApi } from '@/lib/tasaBcv'

// Cron diario (vercel.json: 23:00 UTC = 7:00 pm Caracas, después de que el
// BCV publica entre 4 y 6 pm la tasa del siguiente día hábil). Guarda la
// tasa actual de DolarAPI y rellena desde el histórico los días recientes
// que falten (p. ej. si un día el cron falló).
//
// Requiere CRON_SECRET en Vercel (Production): Vercel lo manda como
// "Authorization: Bearer <CRON_SECRET>". Sin la variable, rechaza todo en
// vez de aceptar "Bearer undefined".
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const resultado = await capturarDesdeDolarApi(supabaseServer(), { rellenar: true })
    console.log('[tasa-bcv] Cron:', JSON.stringify(resultado))
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err: any) {
    // DolarAPI caído, respuesta inválida, fechas USD/EUR distintas, etc.:
    // no se guarda nada y queda en los logs de Vercel.
    console.error('[tasa-bcv] Cron falló, no se guardó nada:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 })
  }
}
