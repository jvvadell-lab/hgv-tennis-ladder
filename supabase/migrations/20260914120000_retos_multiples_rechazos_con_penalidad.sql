-- Rediseño de la regla de rechazo: ya no hay límite duro de 1 rechazo por
-- temporada. Ahora un jugador puede rechazar las veces que quiera; el primer
-- rechazo de la temporada sigue sin penalidad, pero del segundo en adelante
-- baja 1 posición en el escalafón (ver app/api/jugador/responder-reto/route.ts).
-- El índice único que imponía el límite de 1 ya no aplica.
DROP INDEX IF EXISTS public.ux_retos_un_rechazo_por_temporada;

-- Timestamp de cuándo se rechazó el reto (distinto de created_at, que es
-- cuándo se creó) — lo necesita el enfriamiento anti-acoso de 5 días: si
-- alguien te rechaza, no puedes volver a retarlo por 5 días desde el rechazo.
ALTER TABLE public.retos ADD COLUMN IF NOT EXISTS rechazado_at timestamptz;
