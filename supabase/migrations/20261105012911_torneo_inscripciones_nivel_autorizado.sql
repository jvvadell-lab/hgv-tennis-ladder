-- Autorización del admin para que un jugador juegue UNA categoría del torneo
-- aunque su categoría oficial no corresponda (p. ej. un Quinta en Doble
-- Sexta), sin cambiar su categoría oficial ni la de la escalera. Se guarda
-- en la inscripción: vale solo para esa categoría. (Ya aplicada.)
alter table public.torneo_inscripciones
  add column nivel_autorizado_por uuid null references public.administradores(id),
  add column nivel_autorizado_at timestamptz null;

alter table public.torneo_inscripciones add constraint torneo_inscripciones_nivel_autorizado_con_fecha check (
  (nivel_autorizado_por is null) = (nivel_autorizado_at is null)
);
