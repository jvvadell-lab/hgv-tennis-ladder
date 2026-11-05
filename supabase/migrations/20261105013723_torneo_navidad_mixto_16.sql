-- Mixto con handicap: cupo de 12 a 16 parejas (4 grupos de 4), para que
-- entren las duplas invitadas el día del cierre. 4-nov. (Ya aplicada.)
update public.torneo_categorias c
   set cupo = 16, num_grupos = 4, tamano_grupo = 4
  from public.torneos t
 where t.id = c.torneo_id and t.nombre = 'Torneo Navidad HGV 2026' and c.nombre = 'Mixto con handicap';
