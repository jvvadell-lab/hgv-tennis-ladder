-- Aprobación previa del admin para invitar a no socios (4-nov-2026).
--
-- Por categoría: con invitar_no_socios_con_aprobacion = true, la invitación
-- de un socio a un no socio (jugador con es_invitado, o un teléfono sin
-- cuenta) se crea con requiere_aprobacion = true y queda "por aprobar": el
-- invitado no la ve ni recibe aviso, y no se envía el WhatsApp, hasta que el
-- admin la aprueba (aprobada_por/_at). Si el admin no la aprueba, pasa a
-- 'rechazada'. Mientras está por aprobar sigue en estado 'pendiente', así
-- cuenta como "una pendiente por jugador y categoría" y vence al cerrar la
-- categoría como las demás. Al aceptarla, la aprobación cuenta también como
-- la autorización de invitado de su inscripción (un solo paso). Y en estas
-- categorías un no socio no puede inscribirse solo (lo valida el servidor):
-- entra solo con invitación aprobada o inscrito por el admin.
-- Se activa solo en Doble Masculino Sexta.

alter table public.torneo_categorias
  add column if not exists invitar_no_socios_con_aprobacion boolean not null default false;

alter table public.torneo_invitaciones
  add column if not exists requiere_aprobacion boolean not null default false,
  add column if not exists aprobada_por uuid null references public.administradores(id),
  add column if not exists aprobada_at timestamptz null;

alter table public.torneo_invitaciones
  add constraint torneo_invitaciones_aprobada_coherente check (
    (aprobada_por is null) = (aprobada_at is null)
    and (aprobada_at is null or requiere_aprobacion)
  );

-- Aceptar una invitación por aprobar: la base también lo impide.
create or replace function public.torneo_invitacion_no_aceptar_sin_aprobar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = 'aceptada' and old.estado = 'pendiente'
     and old.requiere_aprobacion and old.aprobada_at is null then
    raise exception 'La invitación todavía no la aprobó el admin';
  end if;
  return new;
end $$;

drop trigger if exists torneo_invitaciones_no_aceptar_sin_aprobar on public.torneo_invitaciones;
create trigger torneo_invitaciones_no_aceptar_sin_aprobar
  before update of estado on public.torneo_invitaciones
  for each row execute function public.torneo_invitacion_no_aceptar_sin_aprobar();

update public.torneo_categorias c
   set invitar_no_socios_con_aprobacion = true
  from public.torneos t
 where t.id = c.torneo_id
   and t.estado = 'inscripcion'
   and c.nombre = 'Doble Masculino Sexta';
