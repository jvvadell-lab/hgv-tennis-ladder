// Prueba la migración 20261022130000_cerrar_notificaciones_permisos_flyer en
// un Postgres local (PGlite), sobre copias de las tres tablas con las mismas
// policies y privilegios que tenía producción el 22-oct-2026.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRACION = readFileSync(
  join(__dirname, '../migrations/20261022130000_cerrar_notificaciones_permisos_flyer.sql'),
  'utf8',
)

const ESTADO_PROD = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table public.notificaciones (
    id uuid primary key default gen_random_uuid(), jugador_id uuid, tipo text, reto_id uuid,
    mensaje text, leido boolean default false, created_at timestamptz default now()
  );
  create table public.permisos_medicos (
    id uuid primary key default gen_random_uuid(), jugador_id uuid, temporada_id uuid, dias integer,
    fecha_inicio date, fecha_fin date, informe_url text, motivo text, estado text, creado_por text,
    created_at timestamptz default now(), posiciones_bajadas integer
  );
  create table public.plantillas_flyer (id text primary key, html text, updated_at timestamptz);
  alter table public.notificaciones enable row level security;
  alter table public.permisos_medicos enable row level security;
  alter table public.plantillas_flyer enable row level security;
  create policy "Cualquiera puede ver notificaciones" on public.notificaciones for select to anon using (true);
  create policy "Lectura publica permisos_medicos" on public.permisos_medicos for select using (true);
  create policy "service role full access" on public.plantillas_flyer for all using (true) with check (true);
  grant all on public.notificaciones, public.permisos_medicos, public.plantillas_flyer to anon, authenticated;
  insert into public.notificaciones (jugador_id, tipo, mensaje) values (gen_random_uuid(), 'pago', 'Tu pago fue validado');
  insert into public.permisos_medicos (jugador_id, dias, fecha_inicio, fecha_fin, informe_url, motivo, estado)
    values (gen_random_uuid(), 10, '2026-10-01', '2026-10-10', 'https://x/informe.jpg', 'Lesión de rodilla', 'aprobado');
`

let db: PGlite

async function como(rol: string, sql: string) {
  await db.exec(`set role ${rol}`)
  try {
    return await db.query(sql)
  } finally {
    await db.exec('reset role')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(ESTADO_PROD)
  // Punto de partida: así estaba prod antes de la migración.
  expect((await como('anon', 'select mensaje from public.notificaciones')).rows).toHaveLength(1)
  expect((await como('anon', 'select motivo, informe_url from public.permisos_medicos')).rows).toHaveLength(1)
  await como('anon', `insert into public.plantillas_flyer (id, html) values ('x', '<script>')`)
  await db.exec('delete from public.plantillas_flyer')
  await db.exec(MIGRACION)
}, 30_000)

describe.each(['anon', 'authenticated'])('después de la migración, %s', (rol) => {
  it('no puede leer notificaciones', async () => {
    await expect(como(rol, 'select mensaje from public.notificaciones')).rejects.toThrow(/permission denied/)
  })

  it.each(['motivo', 'informe_url', 'creado_por', '*'])('no puede leer %s de permisos_medicos', async (columna) => {
    await expect(como(rol, `select ${columna} from public.permisos_medicos`)).rejects.toThrow(/permission denied/)
  })

  it('sigue leyendo lo que usan /ladder y Mi Perfil', async () => {
    const r = await como(rol, 'select id, jugador_id, temporada_id, dias, fecha_inicio, fecha_fin, estado, created_at from public.permisos_medicos')
    expect(r.rows).toHaveLength(1)
  })

  it.each([
    `insert into public.plantillas_flyer (id, html) values ('y', '<script>')`,
    `update public.permisos_medicos set estado = 'aprobado'`,
    `delete from public.notificaciones`,
    `select * from public.plantillas_flyer`,
  ])('no puede: %s', async (sql) => {
    await expect(como(rol, sql)).rejects.toThrow(/permission denied/)
  })
})
