-- Calendario propio por categoría (Torneo Navidad HGV 2026).
--
-- Las categorías infantiles se inscriben hasta el viernes 20-nov y juegan del
-- lunes 23-nov al viernes 4-dic, mientras los adultos sortean el 5-nov y
-- juegan desde el 6-nov. Antes, todo dependía del estado del torneo: el
-- torneo solo pasaba a 'sorteado' (programación y resultados) cuando se
-- sorteaba la ÚLTIMA categoría, y nadie se inscribía si no estaba en
-- 'inscripcion'.
--
-- Una categoría con fecha_inicio tiene calendario propio:
--   * recibe inscripciones con el torneo en 'inscripcion', 'sorteado' o
--     'en_curso' mientras ella no se sortee (torneo_categoria_recibe);
--   * se sortea (y se cancela o fusiona) en esos mismos estados
--     (torneo_categoria_antes_del_sorteo);
--   * NO frena el paso del torneo a 'sorteado': basta con que se sorteen
--     las categorías sin calendario propio.
-- cierre_inscripciones_at es la hora de cierre que se le muestra (cuenta
-- regresiva y alerta de cierre vencido); como la del torneo, no cierra sola.

alter table public.torneo_categorias
  add column cierre_inscripciones_at timestamptz null,
  add column fecha_inicio date null,
  add column fecha_fin date null;

alter table public.torneo_categorias add constraint torneo_categorias_calendario_propio check (
  (fecha_inicio is null) = (fecha_fin is null) and (fecha_inicio is null or fecha_inicio <= fecha_fin)
);

create function public.torneo_categoria_recibe(p_estado_torneo text, p_abiertas boolean, p_propio boolean, p_sorteada boolean)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_abiertas, false) and not coalesce(p_sorteada, false) and (
    p_estado_torneo = 'inscripcion'
    or (coalesce(p_propio, false) and p_estado_torneo in ('sorteado', 'en_curso'))
  )
$$;

create function public.torneo_categoria_antes_del_sorteo(p_estado_torneo text, p_propio boolean)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_estado_torneo in ('borrador', 'inscripcion')
      or (coalesce(p_propio, false) and p_estado_torneo in ('sorteado', 'en_curso'))
$$;

-- Las tres funciones se reescriben sobre su definición actual, cambiando
-- solo las líneas de la regla (si alguna no aparece, la migración falla).
do $migracion$
declare
  v_def text;
  v_nuevo text;
begin
  -- 1. Trigger de inscripciones ---------------------------------------------
  v_def := pg_get_functiondef('public.torneo_inscripciones_validar()'::regprocedure);
  v_nuevo := v_def;

  if position('v_abiertas boolean;' in v_nuevo) = 0 then raise exception 'validar: declare'; end if;
  v_nuevo := replace(v_nuevo, 'v_abiertas boolean;', 'v_abiertas boolean;' || chr(10) || '  v_propio boolean;' || chr(10) || '  v_sorteada boolean;');

  if position('t.estado, c.inscripciones_abiertas' || chr(10) in v_nuevo) = 0 then raise exception 'validar: select'; end if;
  v_nuevo := replace(v_nuevo, 't.estado, c.inscripciones_abiertas' || chr(10),
    't.estado, c.inscripciones_abiertas, c.fecha_inicio is not null, c.sorteo_publicado_at is not null' || chr(10));

  if position('v_estado_torneo, v_abiertas' || chr(10) in v_nuevo) = 0 then raise exception 'validar: into'; end if;
  v_nuevo := replace(v_nuevo, 'v_estado_torneo, v_abiertas' || chr(10), 'v_estado_torneo, v_abiertas, v_propio, v_sorteada' || chr(10));

  if position('and not (v_estado_torneo = ''inscripcion'' and v_abiertas) then' in v_nuevo) = 0 then raise exception 'validar: regla'; end if;
  v_nuevo := replace(v_nuevo, 'and not (v_estado_torneo = ''inscripcion'' and v_abiertas) then',
    'and not public.torneo_categoria_recibe(v_estado_torneo, v_abiertas, v_propio, v_sorteada) then');
  execute v_nuevo;

  -- 2. Publicar el sorteo de una categoría ------------------------------------
  v_def := pg_get_functiondef('public.torneo_publicar_sorteo_categoria(uuid, text, uuid, jsonb)'::regprocedure);
  v_nuevo := v_def;

  if position('if v_estado not in (''borrador'', ''inscripcion'') then' in v_nuevo) = 0 then raise exception 'publicar: estado'; end if;
  v_nuevo := replace(v_nuevo, 'if v_estado not in (''borrador'', ''inscripcion'') then',
    'if not public.torneo_categoria_antes_del_sorteo(v_estado, v_cat.fecha_inicio is not null) then');

  if position('and cancelada_at is null and sorteo_publicado_at is null' || chr(10) in v_nuevo) = 0 then raise exception 'publicar: ultima'; end if;
  v_nuevo := replace(v_nuevo, 'and cancelada_at is null and sorteo_publicado_at is null' || chr(10),
    'and cancelada_at is null and sorteo_publicado_at is null and fecha_inicio is null' || chr(10));

  if position('where id = v_cat.torneo_id;' in v_nuevo) = 0 then raise exception 'publicar: update'; end if;
  v_nuevo := replace(v_nuevo, 'where id = v_cat.torneo_id;', 'where id = v_cat.torneo_id and estado in (''borrador'', ''inscripcion'');');
  execute v_nuevo;

  -- 3. Cancelar / fusionar una categoría ------------------------------------
  v_def := pg_get_functiondef('public.torneo_cancelar_categoria(uuid, uuid, uuid)'::regprocedure);
  v_nuevo := v_def;

  if position('if v_estado not in (''borrador'', ''inscripcion'') then' in v_nuevo) = 0 then raise exception 'cancelar: estado'; end if;
  v_nuevo := replace(v_nuevo, 'if v_estado not in (''borrador'', ''inscripcion'') then',
    'if not public.torneo_categoria_antes_del_sorteo(v_estado, v_cat.fecha_inicio is not null) then');

  if position('where torneo_id = v_cat.torneo_id and cancelada_at is null and sorteo_publicado_at is null' || chr(10) in v_nuevo) = 0 then raise exception 'cancelar: ultima'; end if;
  v_nuevo := replace(v_nuevo, 'where torneo_id = v_cat.torneo_id and cancelada_at is null and sorteo_publicado_at is null' || chr(10),
    'where torneo_id = v_cat.torneo_id and cancelada_at is null and sorteo_publicado_at is null and fecha_inicio is null' || chr(10));

  if position('where id = v_cat.torneo_id;' in v_nuevo) = 0 then raise exception 'cancelar: update'; end if;
  v_nuevo := replace(v_nuevo, 'where id = v_cat.torneo_id;', 'where id = v_cat.torneo_id and estado in (''borrador'', ''inscripcion'');');
  execute v_nuevo;
end
$migracion$;

-- Fechas de las categorías infantiles del Navidad 2026: inscripción hasta el
-- viernes 20-nov 23:59 de Caracas, juegos del lunes 23-nov al viernes 4-dic.
update public.torneo_categorias c
   set cierre_inscripciones_at = '2026-11-20 23:59:00-04',
       fecha_inicio = '2026-11-23',
       fecha_fin = '2026-12-04'
  from public.torneos t
 where t.id = c.torneo_id
   and t.nombre = 'Torneo Navidad HGV 2026'
   and c.es_infantil
   and c.cancelada_at is null;
