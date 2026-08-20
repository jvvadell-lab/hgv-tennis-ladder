ALTER TABLE public.ladder_posiciones ADD CONSTRAINT ladder_posiciones_temporada_jugador_key UNIQUE (temporada_id, jugador_id);
