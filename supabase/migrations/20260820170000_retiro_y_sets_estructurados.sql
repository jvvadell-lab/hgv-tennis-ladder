-- Retiro (RET) + sets estructurados en carga de resultados.
-- `sets` es la fuente de verdad del marcador; marcador_retador/marcador_retado
-- (columnas ya existentes) se siguen generando automáticamente a partir de
-- `sets`, nunca se escriben a mano — se mantienen porque ya hay código que
-- las lee (correos, historial, galería).
ALTER TABLE resultados
  ADD COLUMN sets JSONB,
  ADD COLUMN tipo_resultado TEXT NOT NULL DEFAULT 'normal'
    CHECK (tipo_resultado IN ('normal', 'retiro')),
  ADD COLUMN jugador_retirado_id UUID REFERENCES jugadores(id),
  ADD COLUMN nota TEXT;
