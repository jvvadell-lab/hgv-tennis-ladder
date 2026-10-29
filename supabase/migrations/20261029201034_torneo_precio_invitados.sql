-- Tarifa de invitados (no socios) del Torneo Navidad (regla del 29-oct-2026,
-- SPEC §2.5). Un jugador ADULTO invitado (jugadores.es_invitado) paga la
-- tarifa de invitado (torneos.monto_inscripcion_invitado_eur, 20 €) en CADA
-- categoría, sin descuento de 2ª categoría. Socios e infantiles no cambian.
-- Las inscripciones existentes no se recalculan (el monto queda fijado al
-- crearlas); el admin las puede ajustar a mano como siempre.

alter table public.torneos
  add column monto_inscripcion_invitado_eur numeric(10,2) not null default 20
    check (monto_inscripcion_invitado_eur > 0);

create or replace function public.torneo_monto_inscripcion(
  p_categoria uuid,
  p_jugador uuid,
  p_menor uuid
)
returns table (monto_eur numeric, motivo text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_torneo_id uuid;
  v_es_infantil boolean;
  v_base numeric;
  v_adicional numeric;
  v_invitado numeric;
  v_es_invitado boolean;
  v_representante uuid;
  v_previas integer;
  v_hijos integer;
  v_mismo_nino boolean;
  v_ordinal text[] := array['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta'];
  v_ordinal_m text[] := array['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto'];
begin
  select c.torneo_id, c.es_infantil, t.monto_inscripcion_eur, t.monto_inscripcion_adicional_eur,
         t.monto_inscripcion_invitado_eur
    into v_torneo_id, v_es_infantil, v_base, v_adicional, v_invitado
  from public.torneo_categorias c
  join public.torneos t on t.id = c.torneo_id
  where c.id = p_categoria;
  if v_torneo_id is null then
    raise exception 'Categoría inexistente';
  end if;

  if not v_es_infantil then
    select coalesce(j.es_invitado, false) into v_es_invitado
    from public.jugadores j where j.id = p_jugador;
    if coalesce(v_es_invitado, false) then
      return query select v_invitado, 'Invitado (no socio)'::text;
      return;
    end if;

    select count(*) into v_previas
    from public.torneo_inscripciones i
    join public.torneo_categorias c on c.id = i.categoria_id
    where c.torneo_id = v_torneo_id
      and not c.es_infantil
      and i.jugador1_id = p_jugador
      and i.estado <> 'retirada';
    return query select
      case when v_previas = 0 then v_base else v_adicional end,
      coalesce(v_ordinal[v_previas + 1], (v_previas + 1)::text || 'ª') || ' categoría';
    return;
  end if;

  select m.representante_jugador_id into v_representante
  from public.torneo_menores m where m.id = p_menor;
  if v_representante is null then
    raise exception 'Menor inexistente';
  end if;

  select count(*), count(distinct i.menor_id), coalesce(bool_or(i.menor_id = p_menor), false)
    into v_previas, v_hijos, v_mismo_nino
  from public.torneo_inscripciones i
  join public.torneo_categorias c on c.id = i.categoria_id
  join public.torneo_menores m on m.id = i.menor_id
  where c.torneo_id = v_torneo_id
    and c.es_infantil
    and m.representante_jugador_id = v_representante
    and i.estado <> 'retirada';

  return query select
    case when v_previas = 0 then v_base else v_adicional end,
    case
      when v_previas = 0 then 'Primera inscripción infantil'
      when v_mismo_nino then 'Mismo niño en otra categoría'
      else coalesce(v_ordinal_m[v_hijos + 1], (v_hijos + 1)::text || 'º') || ' hijo'
    end;
end;
$$;

revoke all on function public.torneo_monto_inscripcion(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.torneo_monto_inscripcion(uuid, uuid, uuid) to service_role;
