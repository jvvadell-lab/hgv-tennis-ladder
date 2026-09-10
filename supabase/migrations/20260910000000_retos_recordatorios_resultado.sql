-- Contador dedicado para los recordatorios de "carga el resultado" que se
-- envían cuando un reto queda 'aceptado' pero pasa la fecha del partido sin
-- que nadie registre el resultado. No se reutiliza recordatorios_enviados
-- porque ese campo ya se usa en la fase 'pendiente' (recordatorios de
-- respuesta) y un reto puede llegar a 'aceptado' con ese contador ya en 1 o
-- 2, lo que haría que el cron pensara que ya mandó avisos de resultado que
-- en realidad nunca mandó.
alter table retos
  add column recordatorios_resultado_enviados integer not null default 0;
