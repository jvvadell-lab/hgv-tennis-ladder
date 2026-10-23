-- Torneo Navidad HGV 2026 — fase 6: resultados, WO y avance automático
-- (docs/torneo-navidad/SPEC.md §5, §6 y §8).
--
-- Doble WO en la llave (SPEC §6, por defecto [CONFIRMAR]): si un lado del
-- partido siguiente queda vacante porque su partido de origen fue doble WO,
-- el clasificado presente pasa por WO. Ese partido queda en estado 'wo' con
-- un solo rival y sin "ausente" (no hay a quién marcar). El check anterior
-- exigía siempre wo_ausente_inscripcion_id con estado 'wo'; ahora se admite
-- sin ausente solo cuando falta exactamente uno de los dos rivales.
--
-- El resto de la fase 6 no necesita cambios de esquema: torneo_partidos ya
-- tiene sets, tipo_resultado, retirada, ganador, reportado_* y validado_*.

alter table public.torneo_partidos drop constraint torneo_partidos_wo_con_ausente;
alter table public.torneo_partidos add constraint torneo_partidos_wo_con_ausente check (
  (wo_ausente_inscripcion_id is null
    or (estado = 'wo' and wo_ausente_inscripcion_id in (inscripcion_a, inscripcion_b)))
  and (estado <> 'wo'
    or wo_ausente_inscripcion_id is not null
    or ((inscripcion_a is null) <> (inscripcion_b is null)))
);

-- Pendientes de validar, para la lista del admin.
create index torneo_partidos_por_validar_idx on public.torneo_partidos (categoria_id)
  where reportado_at is not null and not validado;
