#!/usr/bin/env bash
# Entorno de pruebas LOCAL (Supabase en Docker) — ver scripts/README-simulacion.md.
#
#   scripts/staging-db.sh env    crea .env.local.staging con las claves del Supabase local
#   scripts/staging-db.sh base   (re)construye la base local:
#                                  1. borra el esquema public del Supabase LOCAL
#                                  2. carga supabase/staging/esquema-produccion.sql (solo estructura)
#                                  3. registra como aplicadas las migraciones que ya están en prod
#                                  4. aplica encima las del repo que NO están en prod
#                                  5. carga los datos base (torneo y categorías antes del paso 4;
#                                     tasas BCV de ejemplo y cuentas de prueba al final)
#
# Solo habla con el contenedor local de Docker (supabase_db_hgv-staging):
# nunca con producción.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.docker/bin:$PATH"

CONTENEDOR="supabase_db_hgv-staging"
ESQUEMA="supabase/staging/esquema-produccion.sql"
EN_PROD="supabase/staging/migraciones-en-produccion.txt"

# psql_local: lee SQL de la entrada estándar (archivos). psql_cmd: un -c, sin
# tomar la entrada estándar (si no, dentro de un "while read" se come la lista).
psql_local() { docker exec -i "$CONTENEDOR" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres "$@"; }
psql_cmd() { docker exec "$CONTENEDOR" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres "$@" < /dev/null; }

verificar_contenedor() {
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR"; then
    echo "✖ No está corriendo $CONTENEDOR. Levanta Supabase local con: npx supabase start" >&2
    exit 1
  fi
}

case "${1:-}" in
  env)
    if [ -f .env.local.staging ]; then echo "• .env.local.staging ya existe: no lo toco."; exit 0; fi
    estado=$(npx supabase status -o env)
    valor() { echo "$estado" | sed -n "s/^$1=\"\(.*\)\"$/\1/p"; }
    {
      echo "# Entorno de pruebas LOCAL — generado por scripts/staging-db.sh env. No se versiona."
      echo "NEXT_PUBLIC_SUPABASE_URL=$(valor API_URL)"
      echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$(valor ANON_KEY)"
      echo "SUPABASE_SERVICE_ROLE_KEY=$(valor SERVICE_ROLE_KEY)"
      echo "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
      echo "# Ningún correo sale de staging (lib/email.ts solo lo escribe en la consola)."
      echo "CORREOS_DESACTIVADOS=1"
    } > .env.local.staging
    echo "✔ .env.local.staging creado (apunta a $(valor API_URL))"
    ;;

  base)
    verificar_contenedor
    [ -f "$ESQUEMA" ] || { echo "✖ Falta $ESQUEMA (ver README-simulacion.md)" >&2; exit 1; }

    echo "▶ 1/5 Borrando el esquema public LOCAL…"
    psql_cmd -c "drop schema if exists public cascade;" -c "drop schema if exists supabase_migrations cascade;" 2>&1 | grep -v "^drop cascades\|^NOTICE" || true

    echo "▶ 2/5 Cargando el esquema de producción (sin datos)…"
    # El volcado de "public" no trae las extensiones. btree_gist (choques de
    # canchas) está en "extensions" en prod; las demás ya vienen en Supabase local.
    psql_cmd -c "create extension if not exists btree_gist with schema extensions;"
    psql_local < "$ESQUEMA" > /dev/null

    echo "▶ 3/5 Registrando las migraciones que ya están en producción…"
    psql_local <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL
    grep -vE '^\s*(#|$)' "$EN_PROD" | grep -v '^manual ' | while read -r version nombre; do
      psql_cmd -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$nombre') on conflict do nothing;"
    done

    # Los datos del torneo ya están en prod (el volcado trae solo la
    # estructura): se cargan antes de las migraciones pendientes, que pueden
    # tocarlos (p. ej. invitados_wild_card pone solo_socios = true).
    for nombre in torneo_navidad_2026_datos torneo_infantil_datos; do
      psql_local < "$(ls supabase/migrations/*_"$nombre".sql)"
    done

    echo "▶ 4/5 Aplicando las migraciones del repo que no están en producción…"
    nombres_prod=$(grep -vE '^\s*(#|$)' "$EN_PROD" | awk '{print $2}')
    for archivo in $(ls supabase/migrations/*.sql | sort); do
      base=$(basename "$archivo" .sql)
      version=${base%%_*}
      nombre=${base#*_}
      if echo "$nombres_prod" | grep -qx "$nombre"; then continue; fi
      echo "   • $base"
      if ! psql_local < "$archivo"; then
        echo "✖ Falló la migración $base. La base local quedó a medias: corrige y vuelve a correr 'base'." >&2
        exit 1
      fi
      psql_cmd -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$nombre');"
    done

    echo "▶ 5/5 Datos base (tasas BCV de ejemplo y cuentas de prueba)…"
    psql_local < supabase/staging/datos-base.sql

    # PostgREST vuelve a leer el esquema (si no, no ve las tablas nuevas hasta reiniciar).
    psql_cmd -c "notify pgrst, 'reload schema';"
    echo "✔ Base local lista."
    ;;

  *)
    echo "Uso: scripts/staging-db.sh env | base" >&2
    exit 1
    ;;
esac
