-- Copa Navidad: la edad del menor solo recomienda la categoría infantil.
-- El representante (o el joven que se inscribe solo) puede elegir otra
-- categoría de su género; el admin la revisa al certificar. El trigger deja
-- de bloquear por edad y sigue validando género, duplicado, máximo 2 y cupo.
do $$
declare
  v_def text;
  v_old text := $old$    v_edad := extract(year from age(v_corte, v_menor.fecha_nacimiento))::int;
    if v_edad < v_edad_min or v_edad > v_edad_max then
      raise exception 'La edad del menor no corresponde a la categoría';
    end if;
$old$;
begin
  v_def := pg_get_functiondef('public.torneo_inscripciones_validar'::regproc);
  if position(v_old in v_def) = 0 then
    raise exception 'No encontré el chequeo de edad en torneo_inscripciones_validar';
  end if;
  execute replace(v_def, v_old, $new$    -- La edad solo recomienda la categoría (20261113203000).
$new$);
end;
$$;
