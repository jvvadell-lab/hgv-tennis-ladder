-- Doble Masculino Sexta: cupo de 12 a 16 parejas (4 grupos de 4, clasifican
-- 2 por grupo a cuartos). Decisión de la Comisión, 4-nov. Ya aplicada.
update public.torneo_categorias c
   set cupo = 16, num_grupos = 4, tamano_grupo = 4
  from public.torneos t
 where t.id = c.torneo_id and t.nombre = 'Torneo Navidad HGV 2026' and c.nombre = 'Doble Masculino Sexta';
