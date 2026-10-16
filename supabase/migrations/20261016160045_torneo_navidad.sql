-- Torneo Navidad HGV 2026 (docs/torneo-navidad/SPEC.md, fase 1): modelo de
-- datos de torneos internos por grupos + llave. Tablas nuevas, independientes
-- de temporadas / ladder_posiciones — la escalera no se toca.
--
-- No confundir con torneos_externos (módulo Delegación: torneos inter-clubes
-- a los que va la delegación HGV).
--
-- RLS como retos / bloqueos_cancha: SELECT abierto para que /torneo pinte
-- grupos, llaves y calendario con la clave anónima; toda escritura va por
-- rutas server-side con service role.

create table public.torneos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'inscripcion', 'sorteado', 'en_curso', 'finalizado')),
  monto_inscripcion_eur numeric not null default 15 check (monto_inscripcion_eur >= 0),
  created_at timestamptz not null default now(),
  constraint torneos_rango_fechas check (fecha_fin >= fecha_inicio)
);

create table public.torneo_categorias (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),   -- 'Doble Masculino Sexta'
  modalidad text not null check (modalidad in ('single', 'doble')),
  genero text not null check (genero in ('caballeros', 'damas', 'mixto')),
  -- Mismos valores que jugadores.categoria. Null = libre (Mixto con handicap).
  categoria_nivel text null check (categoria_nivel in ('sexta_novatos', 'sexta', 'quinta', 'cuarta')),
  cupo integer not null check (cupo > 0),                    -- parejas (doble) o jugadores (single)
  num_grupos integer not null check (num_grupos > 0),
  tamano_grupo integer not null check (tamano_grupo >= 2),
  clasifican_por_grupo integer not null default 2 check (clasifican_por_grupo >= 1),
  llave_desde text not null check (llave_desde in ('cuartos', 'semis')),
  duracion_min integer not null check (duracion_min > 0),    -- 90 dobles / 60 single
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  constraint torneo_categorias_mixto_es_doble check (genero <> 'mixto' or modalidad = 'doble'),
  constraint torneo_categorias_grupos_llenan_cupo check (num_grupos * tamano_grupo = cupo),
  constraint torneo_categorias_clasifican_menos_que_grupo check (clasifican_por_grupo < tamano_grupo)
);

create index torneo_categorias_torneo_idx on public.torneo_categorias (torneo_id, orden);

-- Una fila = una pareja (doble) o un jugador (single).
create table public.torneo_inscripciones (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.torneo_categorias(id) on delete cascade,
  jugador1_id uuid not null references public.jugadores(id),
  jugador2_id uuid null references public.jugadores(id),    -- null en single
  siembra integer null check (siembra > 0),                  -- la asigna el admin antes del sorteo
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'confirmada', 'retirada')),
  created_at timestamptz not null default now(),
  constraint torneo_inscripciones_pareja_distinta check (jugador2_id is null or jugador2_id <> jugador1_id)
);

create index torneo_inscripciones_categoria_idx on public.torneo_inscripciones (categoria_id);
create index torneo_inscripciones_jugador1_idx on public.torneo_inscripciones (jugador1_id);
create index torneo_inscripciones_jugador2_idx on public.torneo_inscripciones (jugador2_id);

-- Dos inscripciones vivas no pueden tener la misma siembra en una categoría.
create unique index torneo_inscripciones_siembra_unica
  on public.torneo_inscripciones (categoria_id, siembra)
  where siembra is not null and estado <> 'retirada';

-- Reglas que cruzan filas/tablas (la API las valida antes con mensajes
-- claros; esto es la red de seguridad, como los checks de Delegación):
--  * single ⇒ sin pareja; doble ⇒ con pareja.
--  * un jugador aparece una sola vez por categoría (como jugador1 o jugador2;
--    un unique por columna no lo cubre). Las retiradas no cuentan, así se
--    puede reinscribir.
--  * un jugador juega como máximo 2 categorías del mismo torneo.
create function public.torneo_inscripciones_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_modalidad text;
  v_torneo_id uuid;
  v_jugador uuid;
  v_categorias integer;
begin
  if new.estado = 'retirada' then
    return new;
  end if;

  select modalidad, torneo_id into v_modalidad, v_torneo_id
  from public.torneo_categorias where id = new.categoria_id;

  if v_modalidad = 'single' and new.jugador2_id is not null then
    raise exception 'Una inscripción de single no lleva pareja';
  end if;
  if v_modalidad = 'doble' and new.jugador2_id is null then
    raise exception 'Una inscripción de dobles necesita pareja';
  end if;

  foreach v_jugador in array array_remove(array[new.jugador1_id, new.jugador2_id], null) loop
    if exists (
      select 1 from public.torneo_inscripciones i
      where i.categoria_id = new.categoria_id
        and i.id <> new.id
        and i.estado <> 'retirada'
        and v_jugador in (i.jugador1_id, i.jugador2_id)
    ) then
      raise exception 'El jugador ya está inscrito en esta categoría';
    end if;

    select count(distinct i.categoria_id) into v_categorias
    from public.torneo_inscripciones i
    join public.torneo_categorias c on c.id = i.categoria_id
    where c.torneo_id = v_torneo_id
      and i.id <> new.id
      and i.categoria_id <> new.categoria_id
      and i.estado <> 'retirada'
      and v_jugador in (i.jugador1_id, i.jugador2_id);

    if v_categorias >= 2 then
      raise exception 'Un jugador puede inscribirse en máximo 2 categorías del torneo';
    end if;
  end loop;

  return new;
end;
$$;

create trigger torneo_inscripciones_validar
  before insert or update of categoria_id, jugador1_id, jugador2_id, estado
  on public.torneo_inscripciones
  for each row execute function public.torneo_inscripciones_validar();

create table public.torneo_grupos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.torneo_categorias(id) on delete cascade,
  letra text not null check (letra ~ '^[A-Z]$'),
  unique (categoria_id, letra)
);

create table public.torneo_grupo_miembros (
  grupo_id uuid not null references public.torneo_grupos(id) on delete cascade,
  inscripcion_id uuid not null references public.torneo_inscripciones(id) on delete cascade,
  siembra integer not null check (siembra > 0),
  -- Último criterio de la tabla del grupo (SPEC §7): orden fijado por
  -- sorteo del admin cuando todo lo demás empata. Menor = mejor.
  desempate_manual integer null,
  primary key (grupo_id, inscripcion_id)
);

-- Una inscripción está en un solo grupo.
create unique index torneo_grupo_miembros_inscripcion_unica on public.torneo_grupo_miembros (inscripcion_id);

create table public.torneo_partidos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.torneo_categorias(id) on delete cascade,
  fase text not null check (fase in ('grupo', 'cuartos', 'semis', 'final')),
  grupo_id uuid null references public.torneo_grupos(id) on delete cascade,
  orden integer not null,                     -- orden dentro de la fase (C1..C4, S1, S2, F1)
  origen_a text null,                         -- '1A', '2B', 'G:C1' (ganador de C1)…
  origen_b text null,
  inscripcion_a uuid null references public.torneo_inscripciones(id),   -- null hasta que se conozca
  inscripcion_b uuid null references public.torneo_inscripciones(id),
  cancha text null check (cancha in ('HGV1', 'HGV2')),
  fecha_hora timestamptz null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'programado', 'jugado', 'wo', 'doble_wo')),
  -- Mismo formato que resultados.sets (lib/resultados.ts): j1 = inscripcion_a, j2 = inscripcion_b.
  sets jsonb null,
  tipo_resultado text not null default 'normal' check (tipo_resultado in ('normal', 'retiro')),
  retirada_inscripcion_id uuid null references public.torneo_inscripciones(id),
  ganador_inscripcion_id uuid null references public.torneo_inscripciones(id),
  wo_ausente_inscripcion_id uuid null references public.torneo_inscripciones(id),
  reportado_por uuid null references public.jugadores(id),
  reportado_at timestamptz null,
  validado boolean not null default false,
  validado_at timestamptz null,
  validado_por uuid null references public.administradores(id),
  bloqueo_id uuid null references public.bloqueos_cancha(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint torneo_partidos_grupo_segun_fase check ((fase = 'grupo') = (grupo_id is not null)),
  constraint torneo_partidos_rivales_distintos check (inscripcion_a is null or inscripcion_b is null or inscripcion_a <> inscripcion_b),
  constraint torneo_partidos_cancha_y_hora_juntas check ((cancha is null) = (fecha_hora is null)),
  constraint torneo_partidos_programado_con_hora check (estado <> 'programado' or fecha_hora is not null),
  constraint torneo_partidos_ganador_es_rival check (
    ganador_inscripcion_id is null or ganador_inscripcion_id in (inscripcion_a, inscripcion_b)
  ),
  constraint torneo_partidos_wo_con_ausente check (
    (estado = 'wo') = (wo_ausente_inscripcion_id is not null)
    and (wo_ausente_inscripcion_id is null or wo_ausente_inscripcion_id in (inscripcion_a, inscripcion_b))
  ),
  constraint torneo_partidos_doble_wo_sin_ganador check (estado <> 'doble_wo' or ganador_inscripcion_id is null),
  constraint torneo_partidos_retiro_con_retirada check (
    (tipo_resultado = 'retiro') = (retirada_inscripcion_id is not null)
  ),
  constraint torneo_partidos_validado_con_fecha check (not validado or validado_at is not null)
);

-- Llave: un solo C1, S1, F1… por categoría. En grupos el orden es por grupo.
create unique index torneo_partidos_llave_unica
  on public.torneo_partidos (categoria_id, fase, orden) where fase <> 'grupo';
create unique index torneo_partidos_grupo_orden_unico
  on public.torneo_partidos (grupo_id, orden) where fase = 'grupo';
create index torneo_partidos_categoria_idx on public.torneo_partidos (categoria_id);
create index torneo_partidos_fecha_idx on public.torneo_partidos (fecha_hora) where fecha_hora is not null;
create unique index torneo_partidos_bloqueo_unico on public.torneo_partidos (bloqueo_id) where bloqueo_id is not null;

-- Pagos: se reutiliza la tabla pagos de la escalera. tipo_pago sigue siendo
-- el método (pago_movil / transferencia / efectivo) — el concepto lo da qué
-- columna está llena: temporada_id (escalera) o torneo_inscripcion_id
-- (torneo). Por eso temporada_id deja de ser obligatorio.
alter table public.pagos
  add column torneo_inscripcion_id uuid null references public.torneo_inscripciones(id),
  -- Tasa BCV del euro usada para convertir los 15 € a Bs. (auditoría).
  add column tasa_bcv_eur numeric null check (tasa_bcv_eur > 0);

alter table public.pagos alter column temporada_id drop not null;

alter table public.pagos add constraint pagos_temporada_o_torneo check (
  (temporada_id is null) <> (torneo_inscripcion_id is null)
);

create index pagos_torneo_inscripcion_idx on public.pagos (torneo_inscripcion_id) where torneo_inscripcion_id is not null;

alter table public.torneos enable row level security;
alter table public.torneo_categorias enable row level security;
alter table public.torneo_inscripciones enable row level security;
alter table public.torneo_grupos enable row level security;
alter table public.torneo_grupo_miembros enable row level security;
alter table public.torneo_partidos enable row level security;

create policy "Cualquiera puede ver los torneos"
  on public.torneos for select to anon using (true);
create policy "Cualquiera puede ver las categorías de torneo"
  on public.torneo_categorias for select to anon using (true);
create policy "Cualquiera puede ver las inscripciones de torneo"
  on public.torneo_inscripciones for select to anon using (true);
create policy "Cualquiera puede ver los grupos de torneo"
  on public.torneo_grupos for select to anon using (true);
create policy "Cualquiera puede ver los miembros de grupo de torneo"
  on public.torneo_grupo_miembros for select to anon using (true);
create policy "Cualquiera puede ver los partidos de torneo"
  on public.torneo_partidos for select to anon using (true);

revoke execute on function public.torneo_inscripciones_validar() from public, anon, authenticated;
