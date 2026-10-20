# Torneo Navidad HGV 2026 — Especificación de la lógica de la app

Documento para implementar en Claude Code. Reglas aprobadas por la Comisión de Tenis (16-oct-2026).
Los puntos marcados **[CONFIRMAR]** son supuestos razonables que la Comisión aún no ha ratificado.
Decisiones del 20-oct-2026: sorteo por bombos o serpentina (§3), WO (§6), handicap del Mixto (§4.1), horario de la academia por franjas liberadas (§14.5), y en una segunda ronda: premiación el 11-dic, desempates (§7), retiro, Infantil y Juvenil separados, solo socios con invitados / wild card (§2.1). Lista de [CONFIRMAR] abiertos en §15.

## 0. Reglas del torneo (fuente de verdad)

| Regla | Valor |
|---|---|
| Fechas | Lunes 2-nov-2026 a viernes 11-dic-2026. Cierre y premiación el **viernes 11-dic** (aprobado 20-oct-2026), el día de las finales de adultos |
| Categorías | Doble Masculino Sexta (12 parejas), Doble Femenino Sexta (12), Mixto con handicap (12), Single Caballeros Quinta (8 jugadores) |
| Dobles | 4 grupos de 3, todos contra todos. Pasan 1º y 2º → cuartos, semis, final |
| Single | 2 grupos de 4, todos contra todos. Pasan 1º y 2º → semis cruzadas, final |
| 3er lugar | No hay |
| Formato de partido | 2 sets. Si quedan 1-1, súper tie-break (a 10, diferencia de 2) |
| Empate entre 2 en el grupo | Resultado entre ellos (head-to-head) |
| Empate entre 3 en el grupo | Clasifican los dos mejores por score: diferencia de sets, luego diferencia de games (aprobado 20-oct-2026) |
| Participantes | **Solo socios**, adultos e infantiles. El admin puede autorizar invitados / wild card, también para completar una categoría (§2.1) |
| No presentación | Se declara WO a favor del rival tras **15 min de tolerancia** (aprobado 20-oct-2026). Cuenta 2-0 en sets y 12-0 en games |
| Mixto con handicap | 15-0 al inicio de **cada game** para la pareja que el admin marque en cada partido (§4.1) |
| Inscripción | 15 € por jugador por categoría, pagadero en Bs. a tasa BCV del euro del día |
| Un jugador puede jugar | Hasta 2 categorías |
| Duración del turno | 90 min (dobles y single) |

## 1. Modelo de datos (migraciones nuevas)

Tablas nuevas, independientes de `temporadas`/`ladder_posiciones` (la escalera no se toca).

```
torneos
  id uuid pk, nombre text, fecha_inicio date, fecha_fin date,
  estado text check in ('borrador','inscripcion','sorteado','en_curso','finalizado'),
  monto_inscripcion_eur numeric default 15, created_at timestamptz

torneo_categorias
  id uuid pk, torneo_id fk, nombre text,                 -- 'Doble Masculino Sexta'
  modalidad text check in ('single','doble'),
  genero text check in ('caballeros','damas','mixto'),
  categoria_nivel text,                                   -- 'sexta','quinta' (igual a jugadores.categoria)
  cupo int,                                               -- 12 parejas / 8 jugadores
  num_grupos int, tamano_grupo int, clasifican_por_grupo int default 2,
  llave_desde text check in ('cuartos','semis'),
  duracion_min int,                                       -- 90
  orden int

torneo_inscripciones           -- una fila = una pareja (doble) o un jugador (single)
  id uuid pk, categoria_id fk,
  jugador1_id fk jugadores, jugador2_id fk jugadores null,   -- null en single
  siembra int null,                                       -- la asigna el admin antes del sorteo
  estado text check in ('pendiente_pago','confirmada','retirada'),
  created_at
  unique (categoria_id, jugador1_id), unique (categoria_id, jugador2_id)

torneo_grupos
  id uuid pk, categoria_id fk, letra text                 -- 'A','B','C','D'

torneo_grupo_miembros
  grupo_id fk, inscripcion_id fk, siembra int, primary key (grupo_id, inscripcion_id)

torneo_partidos
  id uuid pk, categoria_id fk,
  fase text check in ('grupo','cuartos','semis','final'),
  grupo_id fk null, orden int,                            -- orden dentro de la fase (C1..C4, S1, S2)
  origen_a text, origen_b text,                           -- '1A','2B','G:C1' (ganador de C1)…
  inscripcion_a fk null, inscripcion_b fk null,           -- null hasta que se conozcan
  cancha text check in ('HGV1','HGV2') null, fecha_hora timestamptz null,
  estado text check in ('pendiente','programado','jugado','wo','doble_wo'),
  sets jsonb null,                                        -- mismo formato que resultados.sets
  ganador_inscripcion_id fk null, wo_ausente_inscripcion_id fk null,
  reportado_por uuid null, validado boolean default false, validado_at timestamptz null,
  bloqueo_id fk bloqueos_cancha null,
  created_at
```

Pagos: reutilizar `pagos` agregando `torneo_inscripcion_id uuid null` (y `tipo_pago = 'torneo_navidad'`).
Monto en Bs. = 15 × `tasas_bcv.eur` de la fecha de pago. Cada jugador paga su parte; la inscripción pasa a `confirmada` cuando todos sus jugadores tienen pago validado.

RLS: igual que el resto del proyecto (SELECT abierto, mutaciones solo por rutas server con service role).

## 2. Inscripción

- El jugador elige categoría; en dobles indica a su pareja (otro jugador activo).
- Validaciones server: `jugadores.categoria` coincide con `categoria_nivel` (o la certifica el admin); género compatible (Mixto = 1 caballero + 1 dama); el jugador no supera 2 categorías; no excede `cupo`; el torneo está en `inscripcion`.
- Ambos jugadores reciben notificación; cada uno reporta su pago.

### 2.1 Solo socios, invitados y wild card (aprobado 20-oct-2026)

- El torneo es **solo para socios**, adultos e infantiles (`torneos.solo_socios = true`).
- **Invitado = wild card** (es lo mismo): una persona que no es socia y que el admin autoriza a jugar.
- **Cuenta del invitado:** se registra como cualquier jugador, marcando "No soy socio" (sin N.º de acción ni carné): `jugadores.es_invitado`. Juega los torneos a los que lo invite el club. La **escalera, los retos y las reservas** son para socios; un admin puede **habilitar** al invitado para esas actividades (`jugadores.invitado_habilitado_por/_at`, lista de jugadores del admin). Nadie se registra ya habilitado (trigger `jugadores_registro_sin_habilitacion`).
- **Inscripción de un no socio** (invitado adulto, o un menor sin N.º de acción): se inscribe normalmente, pero la inscripción no se confirma hasta que el admin la autoriza como invitado / wild card en la pestaña Torneo (`torneo_inscripciones.invitado_autorizado_por/_at`). La base lo repite en el trigger `torneo_inscripciones_validar`.
- **Categoría incompleta:** se completa con invitados / wild card antes del sorteo.

## 3. Sorteo y generación de grupos

Aprobado 20-oct-2026. El admin elige el método al sortear: **bombos** (por defecto) o **serpentina**.

- El torneo tiene que estar en `inscripcion`; al publicar el sorteo pasa a `sorteado`.
- Solo entran las inscripciones **confirmadas**.
- Si una categoría tiene **menos de 3** inscripciones confirmadas, el sorteo se bloquea con un aviso (hay que fusionarla o retirarla antes).
- **Vista previa:** el admin puede repetir el sorteo cuantas veces quiera; nada se guarda hasta que lo publica. Al publicar queda fijo y se guarda quién lo hizo, cuándo y con qué método (`torneos.sorteo_metodo`, `sorteo_publicado_por`, `sorteo_publicado_at`). Si entre la vista previa y la publicación cambian las inscripciones confirmadas, la publicación se rechaza y hay que repetir el sorteo.
- Todo se escribe en una transacción (función Postgres `torneo_publicar_sorteo`, como `retirar_de_escalafon`).

**Bombos** (`torneo_inscripciones.bombo`, lo asigna el admin): con G grupos, las siembras 1..G forman el bombo 1 y quedan fijas como cabezas de A..G (siembra 1 → A, 2 → B…). Cada bombo siguiente se sortea al azar, uno por grupo; un bombo puede tener como máximo G inscripciones. Las inscripciones sin bombo van, en orden aleatorio, a bombos adicionales de G al final. Si un bombo tiene menos de G, sus inscripciones van a los grupos con menos miembros (al azar entre los empatados), así los grupos nunca difieren en más de 1.

**Serpentina:** las inscripciones con siembra van en su orden y las que no tienen, en orden aleatorio detrás. Se reparten en zigzag:

**Distribución en zigzag (serpentina)** con G grupos:
- fila 0: siembras 1..G → grupos A..G
- fila 1: siembras G+1..2G → grupos G..A (invertido)
- y así alternando.

Resultado esperado (tests):
- 12 parejas, 4 grupos: A = 1,8,9 · B = 2,7,10 · C = 3,6,11 · D = 4,5,12
- 8 jugadores, 2 grupos: A = 1,4,5,8 · B = 2,3,6,7

**Partidos de grupo** (todos contra todos, método del círculo):
- Grupo de 3 → 3 partidos. Grupo de 4 → 6 partidos (3 rondas de 2).

**Llave** (se crean al sortear, con `origen_*` y sin inscripciones):
- Dobles: C1 = 1A vs 2B · C2 = 1C vs 2D · C3 = 1B vs 2A · C4 = 1D vs 2C · S1 = G:C1 vs G:C2 · S2 = G:C3 vs G:C4 · F = G:S1 vs G:S2
- Single: S1 = 1A vs 2B · S2 = 1B vs 2A · F = G:S1 vs G:S2

Pelota Naranja (`sin_llave`): solo grupos.

**Categorías infantiles con menos inscritos que el cupo** (aprobado 20-oct-2026, `formatoSorteo` en `lib/torneoSorteo.ts`), con N confirmadas:

| N | Con llave (Verde, Infantil, Juvenil) | Pelota Naranja (festival) |
|---|---|---|
| < 3 | Sorteo bloqueado | Sorteo bloqueado |
| 3–4 | 1 grupo, todos contra todos, **sin llave**: el 1º es el campeón | 1 grupo |
| 5–7 | 1 grupo + **final** 1A vs 2A | 1 grupo (4 a 6 partidos por niño) |
| ≥ 8 | Grupos de la categoría (`num_grupos`); si algún grupo quedaría con menos de 3, se baja a 2 grupos y la llave empieza en semis | `num_grupos`, reducido para que cada grupo tenga al menos 4 (mínimo 3 partidos por niño) |

Pelota Naranja con 3 inscritos solo da 2 partidos por niño: el sorteo lo permite y avisa.

Adultos: siempre `num_grupos` de la categoría. Si con los confirmados algún grupo quedaría con menos de 3, el sorteo se bloquea con un aviso: la categoría se completa con invitados / wild card (§2.1, aprobado 20-oct-2026).

## 4. Programación de partidos

Aprobado 20-oct-2026:
- **Adultos:** plantilla de turnos nocturnos (tabla de abajo).
- **Infantiles:** solo dentro de las **franjas liberadas por la academia** (§14.5).
- El **asistente** propone fecha, hora y cancha de cada partido, en orden de fase, respetando: `horaValidaParaCancha` (adultos), franjas liberadas (niños), la duración de cada categoría, las limitaciones de horario del jugador (`torneo_disponibilidad`), que un jugador (o menor) en 2 categorías no tenga partidos solapados ni dos partidos el mismo día, que un partido de llave vaya **en un día posterior** a los partidos de los que depende, que no choque con bloqueos del club, reservas ni retos ya agendados, y las 4 finales de adultos el viernes 11-dic. Lo que no encaje queda **sin horario** para que el admin lo asigne a mano, con aviso de conflictos.
- La propuesta no se guarda hasta que el admin la **confirma**: entonces se crea un `bloqueos_cancha` por partido (reprogramar mueve el bloqueo; quitar el horario lo borra).
- Al **publicar** la programación (`torneos.programacion_publicada_at/_por`) se notifica a cada jugador o representante (campana y correo) con sus partidos. Después de publicada, cada cambio de horario avisa a los afectados.
- Al asignar a mano, son errores (no se guarda): fuera del horario/franja, cancha ocupada, jugador con dos partidos solapados, partido de llave antes de lo que depende. Son avisos (el admin puede forzar): dos partidos el mismo día, limitación de horario del jugador y final de adultos fuera del 11-dic.

Plantilla de turnos por día (hora Caracas, usar `lib/tiempo.ts`):

| Día | Turnos |
|---|---|
| Lun–Mié | 19:00 HGV2 · 20:00 HGV1 · 20:30 HGV2 |
| Jue | 19:00 HGV2 · 20:30 HGV1 · 20:30 HGV2 |
| Vie | 18:30 HGV1 · 18:30 HGV2 · 20:30 HGV1 · 20:30 HGV2 |

- Validar cada turno con `horaValidaParaCancha(cancha, fecha, duracion_min)`.
- Al programar un partido se crea su fila en `bloqueos_cancha` (motivo "Torneo Navidad – <categoría> – <fase>") para que no se pueda reservar; al reprogramar se mueve el bloqueo; al cancelar se borra.
- Regla: un jugador no puede tener dos partidos que se solapen ni dos partidos la misma noche (revisar ambos jugadores de cada inscripción, en todas las categorías).
- Regla: un partido de llave no se puede programar antes que los partidos de los que depende.
- Asistente de programación (admin): propone automáticamente llenar los turnos libres en orden de fase (grupos → cuartos → semis → final) respetando las reglas; el admin ajusta a mano. Las 4 finales van fijas el viernes 11-dic (último día del torneo).
- Cambio de horario: el jugador lo solicita; el admin reprograma (reutilizar el patrón de `reagendar-reto` y `retos_historial_reagendado`).

### 4.1 Handicap del Mixto (aprobado 20-oct-2026)

- La pareja con handicap empieza **cada game** con 15-0 a su favor.
- Lo marca el admin **en cada partido**: `torneo_partidos.handicap_inscripcion_id` (null = sin handicap). Solo en la categoría Mixto y solo una de las dos inscripciones del partido (lo valida la base).
- La ficha del partido en /torneo lo muestra ("Handicap 15-0 para …"). No cambia la validación del marcador.

## 5. Resultados

Reutilizar `lib/resultados.ts` (`validarSets`, `calcularGanador`, formato `sets` con `games_j1`/`games_j2`/`es_super_tiebreak`), donde j1 = inscripcion_a y j2 = inscripcion_b.

Validación del marcador:
- Sets 1 y 2: 6-0…6-4, 7-5 o 7-6.
- Si quedan 1-1 → 3er "set" obligatorio como súper tie-break: ganador ≥ 10 y diferencia ≥ 2.
- Si un equipo gana 2-0 no se admite 3er set.
- Retiro durante el partido: `tipo_resultado = 'retiro'` como en la escalera.

Flujo: un jugador de cualquiera de las dos inscripciones reporta → el admin valida (igual que `aprobar-resultado`). Solo los resultados validados cuentan para la tabla y la llave.

## 6. WO (no presentación)

- El admin marca WO indicando la inscripción ausente → `estado = 'wo'`, `ganador` = la otra.
- Para la tabla, el WO cuenta como victoria **2-0 en sets y 12-0 en games (6-0, 6-0)** para el presente (aprobado 20-oct-2026).
- Si no se presenta ninguna → `doble_wo`: ninguna suma partido ganado. En llave, la Comisión decide (por defecto, el partido siguiente queda con un solo clasificado que pasa por WO). **[CONFIRMAR]**
- Tolerancia de espera antes de declarar WO: **15 minutos** desde la hora programada (aprobado 20-oct-2026).

## 7. Tabla de posiciones del grupo

Para cada inscripción, sobre partidos de grupo validados (jugado o WO):
PJ, PG, PP, sets a favor/en contra, games a favor/en contra.
El súper tie-break cuenta como 1 set ganado y como 1-0 en games (no se suman sus puntos a los games). Su resultado (p. ej. 10-8) queda registrado y la tabla suma los puntos aparte (`stb_puntos_*`) para revisarlos cuando hay empate (aprobado 20-oct-2026).
Retiro durante el partido: el partido va a favor de la otra dupla; para la tabla se cuenta lo jugado y se le completa el partido al ganador (aprobado 20-oct-2026).

Orden:
1. Partidos ganados (PG).
2. Si empatan **2** inscripciones: resultado entre ellas.
3. Si empatan **3 o más**: pasan los dos mejores por score, diferencia de sets → diferencia de games (entre todos los partidos del grupo). Si tras un criterio quedan 2 empatadas, se resuelve entre ellas por resultado directo.
4. Si persiste el empate: el admin revisa (incluidos los puntos de súper tie-break) y fija el orden (campo manual `desempate_manual`).

Implementar como función pura `ordenarGrupo(partidos, inscripciones)` en `lib/torneo.ts` con tests unitarios (casos: sin empate, empate doble, triple empate 1-1-1 resuelto por sets, triple empate resuelto por games, empate total).

## 8. Avance automático

- Al validar el último partido de un grupo: calcular la tabla y asignar 1º/2º en los partidos de llave cuyo `origen` sea '1X'/'2X'.
- Al validar un partido de llave: poner al ganador en el partido cuyo `origen` sea 'G:<orden>'.
- Notificar a los jugadores (tabla `notificaciones` + correo) cuando se conoce su rival y cuando se programa su partido.
- Si el admin corrige un resultado ya validado, recalcular la tabla y los partidos dependientes que aún no se hayan jugado; si ya se jugaron, bloquear la corrección y avisar.
- Para incidencias que el avance automático no resuelve (puestos vacantes), ver "Ajustar llave" en la sección 13.

## 9. Pantallas

**Públicas (/torneo):** pestañas Adultos | Infantil y una por categoría: tabla de grupos en vivo, calendario por día (cancha y hora) y llave gráfica (serie 1 arriba, serie 2 abajo; "1º grupo A" hasta que se conozca el clasificado, después nombre y marcador; en el celular se desliza por rondas). Resalta la inscripción del usuario con sesión (o de sus representados). En el Mixto, el handicap en la ficha del partido. De los menores solo se muestra `menor_nombre_publico`, nunca datos del representante. Acceso desde la home, /ladder y Mi Perfil.
**Jugador:** mis partidos, reportar resultado, pedir cambio de horario, estado de pago.
**Admin (pestaña Torneo):** categorías y cupos, inscripciones y pagos, siembra y sorteo, programación (asistente + ajuste manual), validación de resultados, WO, reprogramación, exportar calendario a Excel. En una fase posterior, "Ajustar llave" (sección 13).

## 10. Orden de implementación sugerido

1. Migraciones (tablas + `pagos.torneo_inscripcion_id`) y tipos.
2. `lib/torneo.ts`: serpentina, round robin, llave, validación de marcador, `ordenarGrupo` — con tests.
3. Inscripción + pagos.
4. Sorteo (función Postgres transaccional).
5. Programación + bloqueos de cancha.
6. Resultados, WO, tabla y avance automático.
7. Vistas públicas y del jugador.
8. Notificaciones y exportación.
9. (Fase posterior) "Ajustar llave" para incidencias (sección 13).

## 11. Estadísticas (se calculan de `torneo_partidos` validados; sin tablas nuevas)

Implementar en `lib/torneo-estadisticas.ts` como funciones puras, con tests. Un WO cuenta en PJ/PG/PP y se muestra aparte; no suma sets ni games salvo la regla de la sección 6.

**Por inscripción (pareja o jugador en el torneo):** PJ, PG, PP, WO a favor/en contra, sets y games a favor/en contra y diferencia, % de games ganados, súper tie-breaks jugados/ganados, ronda alcanzada (grupos, cuartos, semis, final, campeón).

**Por jugador:** las mismas métricas sumando todas sus inscripciones, total y desglosado por categoría (Masculino, Mixto…), y opcionalmente combinado con su historial de la escalera.

**Por pareja entre torneos:** la pareja se identifica por el par no ordenado {jugador1_id, jugador2_id} (normalizar con el menor id primero), así se acumula su historial en todos los torneos donde jugaron juntos.

**Rankings del torneo (pestaña "Estadísticas" en /torneo):** campeón y subcampeón por categoría, pareja revelación (peor siembra que llegó más lejos), partido más reñido (súper tie-break con menor diferencia), pareja más dominante (mayor % de games ganados, mínimo 2 partidos jugados). Totales para el informe a patrocinantes: partidos jugados, súper tie-breaks, socios distintos que jugaron.

## 12. "Mi historial" del jugador (perfil)

Vista en /perfil (o /torneo/jugador/[id], pública) con:

- **Resumen:** récord total en torneos (PJ-PG-PP), % de victorias, títulos y finales.
- **Por compañero:** una fila por cada pareja con la que jugó → compañero, torneos juntos, PJ, PG, PP, % victorias, mejor resultado (p. ej. "Campeones Navidad 2026"). Ordenable; destacar "mejor compañero" (mayor % con mínimo 3 partidos).
- **Por torneo:** lista de torneos con categoría, compañero, ronda alcanzada y cada partido (rival, marcador, fecha), con enlace a la llave.
- **Contra rivales (opcional):** récord cara a cara contra cada pareja/jugador rival.

Datos: consulta sobre `torneo_inscripciones` (donde jugador1_id o jugador2_id = jugador) + `torneo_partidos` validados de esas inscripciones. El compañero es el otro jugador de la inscripción; en single no hay compañero.

## 13. "Ajustar llave" del admin (fase posterior, solo incidencias)

Botón en la vista de llave del admin para resolver incidencias que el avance automático (sección 8) no cubre. No es una herramienta para rehacer la llave.

**Cuándo se permite:**
- Solo sobre un **puesto vacante** de la llave, es decir, que quedó libre por retiro, descalificación o doble WO.
- Solo **antes de que empiece** el partido de llave de ese puesto.

**Qué está prohibido:**
- Mover un 2º de grupo a un puesto de 1º.
- Cambiar de línea de la llave a un 1º de grupo.
- Tocar un puesto ya ocupado por resultado (ganador de grupo o de un partido validado).
- Usar la siembra para ordenar la llave: la siembra del admin solo influye en el armado de grupos (sección 3), nunca en la llave.

**Errores de marcador:** no se corrigen con "Ajustar llave". Se corrigen en el partido, con el flujo de corrección de resultados, y la llave se recalcula sola (sección 8).

**Registro y transparencia:**
- Motivo obligatorio (texto libre) en cada ajuste.
- Se guarda qué admin lo hizo y cuándo, junto con el puesto ajustado y la inscripción anterior y la nueva, por ejemplo en una tabla `torneo_ajustes_llave` (partido_id, posición, inscripción anterior, inscripción nueva, motivo, admin_id, created_at).
- Las validaciones anteriores van en el servidor (endpoint o función Postgres), no solo en la UI.
- La vista pública de la llave muestra una nota en el puesto ajustado (p. ej. "Ajustado por la organización: <motivo>").

## 14. Infantil

Sección del torneo para menores de edad, dentro del mismo `torneos` (Torneo Navidad HGV 2026). Comparte grupos, llave, resultados y pagos con los adultos. Cambian quién se inscribe (un menor, inscrito por su representante), el formato de partido y el horario.

### 14.1 Categorías (solo single)

La edad se calcula **al 31-dic-2026** (aprobado 19-oct-2026). La fecha queda en `torneos.fecha_corte_edad`; si está vacía, se usa el 31-dic del año de `fecha_inicio`.

| Categoría | Edad | Género | Formato de partido | Turno | Cupo máx. / grupos / llave |
|---|---|---|---|---|---|
| Pelota Naranja | 8–10 | Mixto | Festival: todos contra todos, sets a 4 games, **mínimo 3 partidos por niño** | 40 min | 16 · grupos de 4 (3 partidos c/u), sin llave |
| Pelota Verde | 9–11 | Mixto | 1 set a 6 games con tie-break en 6-6 | 60 min | 16 · 4 grupos de 4 → cuartos |
| Infantil Caballeros / Infantil Damas | 12–14 | Separado | 2 sets con súper tie-break (como adultos) | 90 min | 8 c/u · 2 grupos de 4 → semis |
| Juvenil Caballeros / Juvenil Damas | 15–17 | Separado | 2 sets con súper tie-break (como adultos) | 90 min | 8 c/u · 2 grupos de 4 → semis |

Duraciones, cupos (como máximo) y la regla de sugerencia: aprobados 19-oct-2026. Los grupos y la llave se ajustan antes del sorteo según los inscritos.

- **Género** (`torneo_categorias.genero`): `abierto` = niños y niñas juntos (Naranja y Verde); `caballeros`/`damas` = una categoría por género (Infantil y Juvenil). **Infantil y Juvenil van separados por género** (aprobado 20-oct-2026); si una queda corta, se completa con invitados / wild card (§2.1).
- **Fusionar** dos categorías separadas (p. ej. Infantil Caballeros + Damas → Infantil): se hace antes del sorteo, con el plan aprobado por la Comisión. Se pasa una de las dos a `genero = 'abierto'` (y nombre "Infantil"), se mueven ahí las inscripciones de la otra y se borra la vacía. No hay botón para esto todavía: se hace por SQL revisado.
- **Rangos que se solapan** (Naranja 8–10 y Verde 9–11): un niño de 9 o 10 años puede jugar cualquiera de las dos. La app **sugiere** la categoría cuyo rango tiene el centro más cercano a la edad del niño (9 → Naranja, 10 → Verde) y muestra las demás que le corresponden. El representante elige y **el admin certifica** (§14.4).
- **Cupo:** `cupo` es el máximo de inscritos. En las categorías infantiles `num_grupos × tamano_grupo` **no tiene que ser igual** al cupo, porque es difícil prever cuántos se inscriben. El admin ajusta grupos y tamaño antes del sorteo.
- **Máximo 2 categorías** por menor en el torneo, la misma regla que para los adultos. Con los rangos actuales solo pasa en Naranja + Verde.
- **Resultados:** `validarMarcadorTorneo` hoy solo valida el formato adulto. Hay que agregar los formatos `un_set_6_tb` y `festival_4games` (`torneo_categorias.formato_partido`) antes de la fase de resultados. Tabla del festival: partidos ganados, después games. **[CONFIRMAR]**

### 14.2 Inscripción y pago

- **15 € por niño** y por categoría, en Bs. a tasa BCV del euro del día. Es el mismo flujo de pagos de §1: el pago queda en `pagos` con `torneo_inscripcion_id` de la inscripción del menor y **a nombre del representante** (`pagos.jugador_id` = representante).
- **El representante tiene que tener cuenta en la app** (registro normal de usuario; no entra al escalafón). Así su pago cabe en `pagos.jugador_id` sin cambiar la tabla. El admin puede inscribir a un menor en nombre de un representante con cuenta. Sin cuenta no se puede inscribir (mejora futura en §14.6).
- **Solo socios** (`torneos.solo_socios = true`, aprobado 20-oct-2026): un menor sin `numero_accion` se inscribe, pero necesita la autorización del admin como invitado / wild card (§2.1).
- La inscripción se confirma cuando el pago del representante está validado **y** el admin certificó la categoría.

### 14.3 Datos del menor (`torneo_menores`)

Una ficha por niño, reutilizable en torneos futuros ("Mis representados"). Campos:

- nombre, apellido, fecha de nacimiento, género (`caballeros` = niño, `damas` = niña) y N.º de acción (opcional).
- **Representante:** un usuario con cuenta (`representante_jugador_id`, obligatorio), con su parentesco.
- **Contacto de emergencia:** nombre y teléfono, obligatorios.
- **Autorización de participación** (obligatoria) y **autorización de uso de imagen** (opcional), cada una con fecha. Se vuelven a pedir en cada inscripción y quedan con la fecha de la última.
- Quién la registró (jugador o admin) y cuándo.
- **No se guardan datos médicos.**

**Privacidad:**
- RLS sin SELECT público, como `torneo_disponibilidad`. Solo se lee por rutas server con service role.
- Lo único público es `torneo_inscripciones.menor_nombre_publico` ("Sofía M.": nombre + inicial del apellido), que llena el trigger y es lo que muestran los grupos, la llave y el calendario.

### 14.4 Validaciones (API y trigger)

- La categoría infantil solo admite inscripciones de menor, y la de adultos solo de jugadores: `torneo_inscripciones` tiene exactamente uno de `jugador1_id` o `menor_id`.
- La edad al corte cae en `edad_min..edad_max` de la categoría.
- El género es compatible: `abierto` admite a cualquiera.
- El menor no está ya inscrito en la categoría, no supera 2 categorías y hay cupo.
- La autorización de participación está dada.
- **Certificación del admin:** `torneo_inscripciones.categoria_certificada_por/_at`. El admin revisa la fecha de nacimiento y puede pasar al niño a otra categoría infantil compatible con su edad. Equivale a la `categoria_torneo` de los adultos.
- Los endpoints validan todo con mensajes claros, y el trigger `torneo_inscripciones_validar` repite edad, categoría, duplicado, máximo 2 y cupo como red de seguridad.

### 14.5 Horario de la academia (franjas liberadas)

Decisión del 20-oct-2026: el horario escuela **no es fijo**. El profesor o el admin **liberan franjas concretas** para el torneo: fecha, cancha, hora de inicio y hora de fin, dentro de **15:00–18:00** (tabla `torneo_franjas_academia`).

- Pantalla **"Horario academia"** para liberar, ver y retirar franjas. No se puede retirar una franja que ya tenga un partido programado (lo valida la API y un trigger).
- Nuevo nivel de admin **`academia`** (`administradores.nivel`): entra con su PIN y solo ve esa pantalla (`/academia`). En la sesión tiene rol propio (`role: 'academia'`), así no pasa ningún chequeo de admin del resto de la app. El admin completo también ve la pantalla, en la pestaña Torneo.
- Liberar una franja **no bloquea** la cancha: la cancha se bloquea al confirmar la programación de cada partido (§4). Las franjas no se solapan entre sí en la misma cancha.
- Los turnos infantiles solo van dentro de una franja liberada: empiezan y terminan dentro de ella. `horaValidaParaCancha` **no cambia** y las reservas normales siguen con su horario.
- La regla de "dos partidos el mismo día" se aplica por menor.
- `torneo_categorias.plantilla_turnos` (la plantilla fija del 19-oct) queda sin uso: el asistente no la lee y la pestaña Torneo ya no la edita. Se borrará la columna en una migración posterior.

### 14.6 Pendientes y mejoras futuras

1. **Mejora futura: representante sin cuenta.** Decisión del 19-oct-2026: por ahora no se cambia `pagos`, y el representante tiene que registrarse. Si más adelante se quiere admitir:
   - Hacer `pagos.jugador_id` nullable.
   - Agregar `pagos.pagador_nombre_externo` y `pagos.registrado_por_admin`, con check `(jugador_id is null) <> (pagador_nombre_externo is null)`.
   - Agregar a `torneo_menores` los datos libres del representante (nombre, teléfono, correo) y hacer `representante_jugador_id` nullable.
   - El admin registra el pago desde la pestaña Torneo, como en Delegación.
   - Antes, revisar los consumidores de `pagos.jugador_id` (recibos, reportes, cierre de temporada).
   - Descartado: crear fichas "sin acceso" en `jugadores`, porque ensucian el escalafón y los listados.
2. Resuelto el 20-oct-2026: Infantil y Juvenil separados, solo socios con invitados / wild card (§2.1) y horario escuela por franjas (§14.5).

## 15. [CONFIRMAR] abiertos (al 20-oct-2026)

1. Doble WO: ninguna suma; en llave, el rival pasa por WO — §6.
2. Tabla del festival (Pelota Naranja): partidos ganados, después games — §14.1.

Resueltos el 20-oct-2026: premiación (11-dic), triple empate, súper tie-break, retiro, Infantil/Juvenil separados, solo socios con invitados / wild card y categoría incompleta.
