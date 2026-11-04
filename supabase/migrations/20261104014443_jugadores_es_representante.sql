-- Cuenta de representante (padre, madre... de un menor) que NO juega: entra
-- a la app, inscribe y paga por sus hijos, recibe avisos, pero no es
-- jugador (no sale en listas de jugadores, escalera ni buscadores de dupla).
-- Sin categoría ni género. El admin lo puede convertir en jugador.
alter table public.jugadores
  add column es_representante boolean not null default false;

alter table public.jugadores
  alter column categoria drop not null,
  alter column genero drop not null;

alter table public.jugadores add constraint jugadores_jugador_con_categoria check (
  es_representante or (categoria is not null and genero is not null)
);

-- Un representante no puede tener categoría de torneo asignada.
alter table public.jugadores add constraint jugadores_representante_sin_categoria_torneo check (
  not es_representante or categoria_torneo is null
);

create index jugadores_es_representante_idx on public.jugadores (es_representante) where es_representante;
