import { NextResponse } from 'next/server'
import { destruirSession } from '@/lib/session'

export async function POST() {
  await destruirSession()
  return NextResponse.json({ ok: true })
}
