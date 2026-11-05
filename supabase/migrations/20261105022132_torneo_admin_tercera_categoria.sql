-- El máximo de 2 categorías por jugador aplica a lo que hace el jugador; el
-- admin puede inscribir a alguien en una tercera con su autorización
-- (decisión de la Comisión, 4-nov). Se reescribe solo esa condición. (Ya aplicada.)
do $migracion$
declare
  v_def text;
  v_viejo text := 'if v_categorias >= 2 then' || chr(10) || '    raise exception ''Un jugador puede inscribirse en máximo 2 categorías del torneo'';';
begin
  v_def := pg_get_functiondef('public.torneo_inscripciones_validar()'::regprocedure);
  if position(v_viejo in v_def) = 0 then raise exception 'validar: máximo de categorías'; end if;
  v_def := replace(v_def, v_viejo,
    'if v_categorias >= 2 and new.inscrita_por_admin is null then' || chr(10) || '    raise exception ''Un jugador puede inscribirse en máximo 2 categorías del torneo'';');
  execute v_def;
end
$migracion$;
