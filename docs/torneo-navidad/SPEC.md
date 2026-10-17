# Torneo Navidad HGV 2026 — Especificación de la lógica de la app

Documento para implementar en Claude Code. Reglas aprobadas por la Comisión de Tenis (16-oct-2026).
Los puntos marcados **[CONFIRMAR]** son supuestos razonables que la Comisión aún no ha ratificado.

## 0. Reglas del torneo (fuente de verdad)

| Regla | Valor |
|---|---|
| Fechas | Lunes 2-nov-2026 a viernes 11-dic-2026. Cierre y premiación **[CONFIRMAR fecha, ¿sábado 12-dic?]** |
| Categorías | Doble Masculino Sexta (12 parejas), Doble Femenino Sexta (12), Mixto con handicap (12), Single Caballeros Quinta (8 jugadores) |
| Dobles | 4 grupos de 3, todos contra todos. Pasan 1º y 2º → cuartos, semis, final |
| Single | 2 grupos de 4, todos contra todos. Pasan 1º y 2º → semis cruzadas, final |
| 3er lugar | No hay |
| Formato de partido | 2 sets. Si quedan 1-1, súper tie-break (a 10, diferencia de 2) |
| Empate entre 2 en el grupo | Resultado entre ellos (head-to-head) |
| Empate entre 3 en el grupo | Por score: diferencia de sets, luego diferencia de games **[CONFIRMAR orden y desempate final por sorteo]** |
| No presentación | Se declara WO a favor del rival |
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

## 3. Sorteo y generación de grupos

Admin fija la `siembra` 1..N de cada inscripción confirmada y pulsa "Realizar sorteo".

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

Toda la operación en una transacción (función Postgres, como `retirar_de_escalafon`).

## 4. Programación de partidos

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
- Para la tabla, el WO cuenta como victoria **2-0 en sets y 12-0 en games (6-0, 6-0)** para el presente. **[CONFIRMAR]**
- Si no se presenta ninguna → `doble_wo`: ninguna suma partido ganado. En llave, la Comisión decide (por defecto, el partido siguiente queda con un solo clasificado que pasa por WO). **[CONFIRMAR]**
- Tolerancia de espera antes de declarar WO: **[CONFIRMAR, p. ej. 15 min]**.

## 7. Tabla de posiciones del grupo

Para cada inscripción, sobre partidos de grupo validados (jugado o WO):
PJ, PG, PP, sets a favor/en contra, games a favor/en contra.
El súper tie-break cuenta como 1 set ganado y como 1-0 en games (no se suman los puntos del tie-break). **[CONFIRMAR]**

Orden:
1. Partidos ganados (PG).
2. Si empatan **2** inscripciones: resultado entre ellas.
3. Si empatan **3 o más**: diferencia de sets → diferencia de games (entre todos los partidos del grupo). Si tras un criterio quedan 2 empatadas, se resuelve entre ellas por resultado directo.
4. Si persiste el empate: sorteo por el admin (campo manual `desempate_manual`). **[CONFIRMAR]**

Implementar como función pura `ordenarGrupo(partidos, inscripciones)` en `lib/torneo.ts` con tests unitarios (casos: sin empate, empate doble, triple empate 1-1-1 resuelto por sets, triple empate resuelto por games, empate total).

## 8. Avance automático

- Al validar el último partido de un grupo: calcular la tabla y asignar 1º/2º en los partidos de llave cuyo `origen` sea '1X'/'2X'.
- Al validar un partido de llave: poner al ganador en el partido cuyo `origen` sea 'G:<orden>'.
- Notificar a los jugadores (tabla `notificaciones` + correo) cuando se conoce su rival y cuando se programa su partido.
- Si el admin corrige un resultado ya validado, recalcular la tabla y los partidos dependientes que aún no se hayan jugado; si ya se jugaron, bloquear la corrección y avisar.

## 9. Pantallas

**Públicas (/torneo):** grupos con tabla en vivo, llaves por categoría, calendario por día (con cancha y hora), resultados.
**Jugador:** mis partidos, reportar resultado, pedir cambio de horario, estado de pago.
**Admin (pestaña Torneo):** categorías y cupos, inscripciones y pagos, siembra y sorteo, programación (asistente + ajuste manual), validación de resultados, WO, reprogramación, exportar calendario a Excel.

## 10. Orden de implementación sugerido

1. Migraciones (tablas + `pagos.torneo_inscripcion_id`) y tipos.
2. `lib/torneo.ts`: serpentina, round robin, llave, validación de marcador, `ordenarGrupo` — con tests.
3. Inscripción + pagos.
4. Sorteo (función Postgres transaccional).
5. Programación + bloqueos de cancha.
6. Resultados, WO, tabla y avance automático.
7. Vistas públicas y del jugador.
8. Notificaciones y exportación.

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
