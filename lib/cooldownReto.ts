// Único lugar que interpreta el flag de pausa de los cooldowns de la escalera
// (derrota reciente y anti-acoso por rechazo). Los puntos donde se aplican
// estos cooldowns importan esta función en vez de leer `cooldown_pausado`
// directamente, para que no puedan quedar desincronizados sobre qué significa
// "pausado" — el mismo tipo de bug que causó la desincronización server/cliente
// que se corrigió antes en este mecanismo.
export function cooldownPausado(
  temporada: { cooldown_pausado?: boolean | null } | null | undefined
): boolean {
  return temporada?.cooldown_pausado === true
}
