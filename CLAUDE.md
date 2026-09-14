# HGV Tennis Club — Escalera de Retos

Stack: Next.js + TypeScript, Supabase (Postgres + Storage), PIN propio (cookie httpOnly), Vercel Hobby.
Producción: https://hgv-tennis-ladder.vercel.app
Repo: jvvadell-lab/hgv-tennis-ladder

## Flujo de git — reglas fijas, siempre

1. **Antes de cualquier `git add`**, revisa `git status` y `git diff` completo. Es común que haya trabajo pendiente sin commitear de otra tarea (features a medio construir, scripts sueltos) — NUNCA lo incluyas en un commit de una tarea distinta.
2. **Un commit = una tarea.** Si el working tree mezcla tu cambio con trabajo de otra feature en el mismo archivo, sepáralo por hunks (`git add -p`, o armar el patch a mano) — no commitees el archivo completo si trae cosas de otra tarea.
3. **Corre `npm run build` antes de cada push**, sin excepción — incluso para cambios que "se ven chicos". Ya perdimos horas por un build que fallaba silenciosamente en producción por falta de `<Suspense>` con `useSearchParams`.
4. Antes de dar por bueno un fix relacionado con una variable de entorno o configuración de Vercel, confirma que el deploy relevante realmente terminó en estado "Ready" — no asumas que un cambio de código implica que ya está sirviendo tráfico.
5. Explica el plan y espera confirmación antes de escribir en la base de datos de producción, especialmente si mueve posiciones del escalafón o toca datos de más de un jugador.

## Seguridad — no negociable

- **Nunca debilites un chequeo de autenticación/sesión, ni siquiera temporalmente para tomar una captura o probar algo visualmente.** Si hace falta ver algo autenticado, pide credenciales de prueba o pide que lo revise el humano — no lo rodees.
- Si un clasificador de seguridad bloquea una acción, no busques la vuelta. Repórtalo y sigue por otro camino (validación por SQL directo, pruebas unitarias, etc.).

## Zona horaria — todo el sitio corre en hora de Venezuela

- El servidor (Vercel) corre en UTC. Venezuela es UTC-4 fijo, sin horario de verano.
- **Cualquier fecha/hora mostrada al usuario o evaluada como "hoy"** debe usar `timeZone: 'America/Caracas'` explícito (en `toLocaleString`, `toLocaleDateString`, etc.) o el equivalente al comparar fechas — nunca confíes en la hora local del dispositivo/servidor sin ajustar.
- Ya tuvimos bugs reales por esto en: correos del cron, comparación de "hoy" para fuerza mayor, y discrepancias entre lo que veía el admin vs. el jugador.

## Convenciones de la lógica del escalafón

- **Swap normal** (resultado de partido normal, o rechazo penalizado): intercambio directo de 2 posiciones entre los dos jugadores involucrados.
- **"Insertar y correr"** (solo Escalera Express): el ganador toma la posición objetivo, y todos los que estaban entre su posición vieja y la objetivo bajan 1 puesto cada uno. Nunca mezclar los dos mecanismos.
- Los jugadores en standby o permiso médico se **saltan** (no cuentan) al calcular rangos de posición o buscar "quién está justo debajo" para un swap.
- El cron (`app/api/cron/procesar-retos/route.ts`) corre 1 vez al día, 12:00 UTC = 8:00am Caracas, y requiere la variable de entorno `CRON_SECRET` configurada en Vercel (Production) — sin ella, el endpoint devuelve 401 en silencio y nadie se entera.

## Antes de tocar reglas de negocio existentes

Este proyecto tiene muchas reglas específicas y con matices (rechazos, permisos médicos, reservas, Escalera Express). Antes de asumir el comportamiento de una regla:
1. Lee el código real, no la documentación de una sesión anterior (puede haber cambiado).
2. Si vas a corregir un "bug" reportado, verifica con datos reales de Supabase antes de asumir causa — más de una vez lo que parecía un bug era un dato mal interpretado (ej: un estado de enum reutilizado para dos significados distintos).
