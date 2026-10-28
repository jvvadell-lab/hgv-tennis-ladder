-- Precios de inscripción del Torneo Navidad (regla del 28-oct-2026, SPEC §2.5).
-- Siguen en € a la tasa BCV del euro del día del pago. Adultos e infantiles
-- se cuentan POR SEPARADO:
--  * Adultos (por jugador): la inscripción adulta activa más antigua paga la
--    tarifa base (torneos.monto_inscripcion_eur, 15 €); cada categoría más,
--    la adicional (torneos.monto_inscripcion_adicional_eur, 10 €).
--  * Infantiles (por cuenta del representante, torneo_menores.representante_jugador_id):
--    la 1ª inscripción infantil de esa cuenta paga la base; cada una
--    siguiente (otro hijo o el mismo niño en otra categoría), la adicional.
--    Jugar en adultos no da descuento a los niños. Un mayor de 14 con cuenta
--    propia es su propio representante.
--  * En dobles cada jugador paga lo suyo (cada inscripción es de una persona).
-- El monto se calcula al crear la inscripción (trigger) y queda FIJADO:
-- retiros, traslados o fusiones posteriores no lo recalculan. El admin lo
-- puede ajustar a mano con una nota del motivo (monto_ajuste_*), y
-- monto_calculado_eur conserva lo que calculó la regla.

alter table public.torneos
  add column monto_inscripcion_adicional_eur numeric(10,2) not null default 10
    check (monto_inscripcion_adicional_eur > 0);

alter table public.torneo_inscripciones
  add column monto_eur numeric(10,2) null check (monto_eur >= 0),
  add column monto_calculado_eur numeric(10,2) null,
  add column monto_motivo text null,
  add column monto_ajustado_por uuid null references public.administradores(id),
  add column monto_ajustado_at timestamptz null,
  add column monto_ajuste_nota text null,
  add constraint torneo_inscripciones_ajuste_con_nota check (
    (monto_ajustado_por is null) = (monto_ajuste_nota is null)
    and (monto_ajustado_por is null) = (monto_ajustado_at is null)
    and (monto_ajuste_nota is null or btrim(monto_ajuste_nota) <> '')
  );

-- Las inscripciones existentes se hicieron con la tarifa única: conservan el
-- monto que se les anunció. Si alguna se corrige, lo decide el admin.
update public.torneo_inscripciones i
   set monto_eur = t.monto_inscripcion_eur,
       monto_calculado_eur = t.monto_inscripcion_eur,
       monto_motivo = 'Tarifa única anterior al 28-oct-2026'
  from public.torneo_categorias c
  join public.torneos t on t.id = c.torneo_id
 where c.id = i.categoria_id;

alter table public.torneo_inscripciones
  alter column monto_eur set not null,
  alter column monto_calculado_eur set not null,
  alter column monto_motivo set not null;

-- Monto y motivo que le tocaría a una inscripción nueva en p_categoria, de
-- p_jugador (adulto) o de p_menor (infantil). Lo usan el trigger y la API
-- (vista previa antes de confirmar), así la regla vive en un solo lugar.
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
  v_representante uuid;
  v_previas integer;
  v_hijos integer;
  v_mismo_nino boolean;
  v_ordinal text[] := array['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta'];
  v_ordinal_m text[] := array['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto'];
begin
  select c.torneo_id, c.es_infantil, t.monto_inscripcion_eur, t.monto_inscripcion_adicional_eur
    into v_torneo_id, v_es_infantil, v_base, v_adicional
  from public.torneo_categorias c
  join public.torneos t on t.id = c.torneo_id
  where c.id = p_categoria;
  if v_torneo_id is null then
    raise exception 'Categoría inexistente';
  end if;

  if not v_es_infantil then
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

-- Fija el monto al crear la inscripción, venga de donde venga (jugador,
-- invitación aceptada, lista de espera, admin). Ignora lo que mande el
-- cliente. El candado por persona evita que dos inscripciones simultáneas
-- se lleven las dos la tarifa base.
create or replace function public.torneo_inscripciones_fijar_monto()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_torneo_id uuid;
  v_persona uuid;
  v_calc record;
begin
  select c.torneo_id into v_torneo_id from public.torneo_categorias c where c.id = new.categoria_id;
  if new.menor_id is not null then
    select m.representante_jugador_id into v_persona from public.torneo_menores m where m.id = new.menor_id;
  else
    v_persona := new.jugador1_id;
  end if;
  perform pg_advisory_xact_lock(hashtext('torneo_monto:' || v_torneo_id::text || ':' || coalesce(v_persona::text, '')));

  select * into v_calc from public.torneo_monto_inscripcion(new.categoria_id, new.jugador1_id, new.menor_id);
  new.monto_eur := v_calc.monto_eur;
  new.monto_calculado_eur := v_calc.monto_eur;
  new.monto_motivo := v_calc.motivo;
  new.monto_ajustado_por := null;
  new.monto_ajustado_at := null;
  new.monto_ajuste_nota := null;
  return new;
end;
$$;

create trigger torneo_inscripciones_fijar_monto
  before insert on public.torneo_inscripciones
  for each row execute function public.torneo_inscripciones_fijar_monto();
