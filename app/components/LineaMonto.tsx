import { formatearEur, type MontoFijado } from '@/lib/torneoPrecios'

// Monto en € fijado en una inscripción del torneo, con su motivo
// ("Segunda categoría") o la nota del admin si lo ajustó (SPEC §2.5).
export default function LineaMonto({ monto }: { monto: MontoFijado }) {
  return (
    <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#444' }}>
      💶 <strong>{formatearEur(monto.monto_eur)}</strong> · {monto.ajuste ? `ajustado por el admin: ${monto.ajuste}` : monto.motivo}
    </p>
  )
}
