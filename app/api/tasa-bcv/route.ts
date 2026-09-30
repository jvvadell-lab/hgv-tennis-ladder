import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { obtenerTasaVigente, tasaVigenteConRespaldo } from '@/lib/tasaBcv'
import { hoyEnCaracas } from '@/lib/tiempo'

// Tasa BCV vigente — pública (la muestran Mi Perfil y el panel admin); la
// tabla tasas_bcv no tiene políticas, se lee solo por aquí.
//
// Sin ?fecha (o con la de hoy): si hoy es día hábil y todavía no hay fila de
// hoy, consulta DolarAPI en ese momento (respaldo del cron; ver
// tasaVigenteConRespaldo). Si DolarAPI falla, devuelve la última disponible
// marcada como desactualizada — nunca rompe la página.
// Con ?fecha=YYYY-MM-DD: la vigente en esa fecha (para calcular un pago con
// fecha pasada), sin consultar DolarAPI.
export async function GET(request: Request) {
  const fecha = new URL(request.url).searchParams.get('fecha')
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  const db = supabaseServer()
  try {
    const tasa = !fecha || fecha === hoyEnCaracas()
      ? await tasaVigenteConRespaldo(db)
      : await obtenerTasaVigente(db, fecha)
    return NextResponse.json({ ok: true, tasa }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    console.error('[tasa-bcv] GET falló:', err.message)
    // Último intento sin respaldo, para no dejar la página sin tasa por un
    // error en la consulta a DolarAPI o en el upsert.
    try {
      const tasa = await obtenerTasaVigente(db, fecha || hoyEnCaracas())
      return NextResponse.json({ ok: true, tasa: tasa && { ...tasa, desactualizada: true } }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return NextResponse.json({ ok: false, tasa: null, error: 'No se pudo leer la tasa BCV' }, { status: 200 })
    }
  }
}
