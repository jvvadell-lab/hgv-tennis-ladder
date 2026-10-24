# Simulación del torneo en local (staging con Docker)

Entorno de pruebas 100 % local: Supabase en Docker + la app con `npm run dev:staging`.
**No toca producción ni Vercel.** Los scripts se niegan a correr si la URL de Supabase no es
`localhost` / `127.0.0.1`, y ningún correo sale (`CORREOS_DESACTIVADOS=1`: solo se muestran en la consola).

## Requisitos

- Docker Desktop abierto. Si la terminal no encuentra `docker`: `export PATH="$HOME/.docker/bin:$PATH"`.
- El esquema de producción (solo estructura, sin datos) en `supabase/staging/esquema-produccion.sql`.
  No se versiona: cada quien lo exporta con su contraseña de la base:

  ```bash
  npx supabase db dump --db-url "postgresql://postgres:[CONTRASEÑA]@db.znfsxpmmlxezzeasjtqa.supabase.co:5432/postgres" --schema public -f supabase/staging/esquema-produccion.sql
  ```

## Primera vez

```bash
npx supabase start                # levanta Supabase local (no aplica migraciones solo)
scripts/staging-db.sh env         # crea .env.local.staging (no se versiona)
scripts/staging-db.sh base        # esquema de prod + migraciones pendientes + datos base
```

`base` borra y rehace el esquema `public` **local**:

1. Carga el esquema de producción.
2. Registra como aplicadas las migraciones que ya están en prod (`supabase/staging/migraciones-en-produccion.txt`).
3. Carga el Torneo Navidad y sus categorías.
4. Aplica encima las migraciones del repo que todavía no están en prod.
5. Carga las tasas BCV de ejemplo y las cuentas de prueba (`supabase/staging/datos-base.sql`).

Se puede volver a correr cuando quieras empezar de cero.

## Levantar la app

```bash
npm run dev:staging               # http://localhost:3000 contra el Supabase local
```

Cuentas de prueba (correo y PIN en `supabase/staging/datos-base.sql`):

- **Admin Staging**: entra a `/admin` → pestaña 🎄 Torneo.
- **Prueba 01** (jugadora): está en la pareja 1 de la simulación → `/torneo/mis-partidos`.

## Simulación: 12 parejas en Doble Femenino Sexta

```bash
npm run simular -- preparar
npm run simular -- sortear
npm run simular -- jugar grupos-j1
npm run simular -- jugar grupos-j2
npm run simular -- jugar grupos-j3
npm run simular -- jugar cuartos
npm run simular -- jugar semis
npm run simular -- jugar final
npm run simular -- estado         # tablas y llave en la terminal
npm run simular -- reset          # borra todo lo de la simulación
```

- La simulación crea su propio torneo, **"SIMULACIÓN — Torneo Navidad HGV 2026"**, con una copia de Doble Femenino Sexta.
  - El sorteo real exige al menos 3 inscripciones en *todas* las categorías del torneo, y así el Torneo Navidad no se toca.
  - Mientras existe es el torneo vigente (empieza un día antes).
- Usa las mismas funciones que la app: sorteo por bombos, asistente de programación, reportar y validar resultados, y el avance automático.
- Tiene semilla fija: la misma secuencia da siempre los mismos grupos y marcadores.
- `jugar` es idempotente: los partidos ya jugados se saltan.

Casos a propósito:

| Dónde | Caso |
|---|---|
| Grupo A | Triple empate 1-1-1, resuelto por diferencia de sets |
| Grupo B | Un WO |
| Grupo C | Un doble WO (el 2º sale por games) |
| Cuartos C1 | Un retiro a mitad del 2º set |

## Qué mirar después de cada etapa

| Etapa | Pantalla |
|---|---|
| `preparar` | Admin → Torneo → 📝 Inscripciones: 12 parejas confirmadas con pagos validados. 🎲 Sorteo: siembras 1-4 y bombos. |
| `sortear` | `/torneo` (pestaña Doble Femenino Sexta): 4 grupos de 3 y la llave con "1º grupo A…". Admin → 📅 Programación: horarios publicados. `/torneo/mis-partidos` (Prueba 01): sus 2 partidos de grupo con fecha y cancha. |
| `jugar grupos-j1` a `j3` | `/torneo`: tablas en vivo (WO en B, doble WO en C). Admin → 🏆 Resultados → Cerrados. Al cerrar `j3` la llave de cuartos se llena sola. |
| `jugar cuartos` | `/torneo` → Llave: C1 con el retiro; semifinales ya con rivales. |
| `jugar semis` / `final` | `/torneo` → Llave completa con campeona. Prueba 01 → Mis partidos → Jugados. |

Para probar el flujo a mano, juega una etapa menos con el script y después:

1. Entra como Prueba 01 → Mis partidos → **Reportar resultado**.
2. Entra como admin → Torneo → 🏆 Resultados → **Validar**.

`jugar` se salta los partidos que ya tengan resultado validado.
