// Prueba la migración 20261022124304_jugadores_cerrar_columnas_anon en un
// Postgres local (PGlite), sobre una copia de la tabla jugadores con los
// mismos privilegios y policies que tenía producción el 20-oct-2026.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRACION = readFileSync(
  join(__dirname, '../migrations/20261022124304_jugadores_cerrar_columnas_anon.sql'),
  'utf8',
)

const ESTADO_PROD = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table public.jugadores (
    id uuid primary key default gen_random_uuid(), nombre varchar not null, telefono varchar not null,
    email varchar not null unique, pin varchar not null, categoria varchar not null, genero varchar not null,
    numero_accion varchar not null, activo boolean default true, created_at timestamptz default now(),
    estado_verificacion text default 'pendiente', verificado_por uuid, verificado_at timestamptz,
    foto_carnet_url text, numero_accion_ocr text, numero_accion_coincide boolean,
    email_verificado boolean not null default false, token_verificacion text, categoria_torneo text,
    categoria_torneo_asignada_por uuid, categoria_torneo_asignada_at timestamptz
  );
  create table public.retos (id serial primary key, retador_id uuid references public.jugadores(id), retado_id uuid references public.jugadores(id));
  alter table public.jugadores enable row level security;
  create policy "Cualquiera puede registrarse" on public.jugadores for insert to anon with check (true);
  create policy "Cualquiera puede ver jugadores" on public.jugadores for select to anon using (true);
  grant all on public.jugadores to anon, authenticated;
  grant all on public.retos to anon, authenticated;
  insert into public.jugadores (nombre, telefono, email, pin, categoria, genero, numero_accion, token_verificacion)
    values ('Ana', '+58 (424)-123-4567', 'ana@correo.com', '1234', 'sexta', 'damas', '99', 'token');
  insert into public.retos (retador_id, retado_id) select id, id from public.jugadores;
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
  const antes = await como('anon', 'select pin, email, token_verificacion from public.jugadores')
  expect(antes.rows).toHaveLength(1)
  await db.exec(MIGRACION)
}, 30_000)

describe.each(['anon', 'authenticated'])('después de la migración, %s', (rol) => {
  it.each(['pin', 'email', 'telefono', 'token_verificacion', 'numero_accion', 'foto_carnet_url', 'estado_verificacion', 'email_verificado', 'categoria_torneo', '*'])(
    'no puede leer %s',
    async (columna) => {
      await expect(como(rol, `select ${columna} from public.jugadores`)).rejects.toThrow(/permission denied/)
    },
  )

  it('no puede filtrar por pin (adivinarlo con un where)', async () => {
    await expect(como(rol, `select id from public.jugadores where pin = '1234'`)).rejects.toThrow(/permission denied/)
  })

  it.each([
    `insert into public.jugadores (nombre, telefono, email, pin, categoria, genero, numero_accion) values ('X', '1', 'x@x.com', '0000', 'sexta', 'damas', '1')`,
    `update public.jugadores set estado_verificacion = 'verificado'`,
    `delete from public.jugadores`,
    `truncate public.jugadores cascade`,
  ])('no puede escribir: %s', async (sql) => {
    await expect(como(rol, sql)).rejects.toThrow(/permission denied/)
  })
})

describe('lo que sigue leyendo el navegador con la clave anónima', () => {
  it.each([
    'select id, nombre from public.jugadores where activo = true order by nombre',
    'select id, nombre, categoria, genero from public.jugadores where activo = true',
    'select count(*) from public.jugadores where activo = true',
    // Joins tipo retador:retador_id(nombre, categoria, genero)
    'select r.id, j.nombre, j.categoria, j.genero from public.retos r join public.jugadores j on j.id = r.retador_id',
  ])('%s', async (sql) => {
    const r = await como('anon', sql)
    expect(r.rows.length).toBeGreaterThan(0)
  })
})

describe('otros efectos', () => {
  it('se quita la policy de insert y queda la de select', async () => {
    const r = await db.query<{ policyname: string }>(`select policyname from pg_policies where tablename = 'jugadores' order by 1`)
    expect(r.rows.map((p) => p.policyname)).toEqual(['Cualquiera puede ver jugadores'])
  })

  it('el service role / postgres sigue leyendo todo', async () => {
    const r = await db.query('select pin, email, token_verificacion from public.jugadores')
    expect(r.rows).toHaveLength(1)
  })

  it('una columna nueva (ej. es_invitado de la rama del torneo) no queda visible para anon', async () => {
    await db.exec('alter table public.jugadores add column es_invitado boolean not null default false')
    await expect(como('anon', 'select es_invitado from public.jugadores')).rejects.toThrow(/permission denied/)
  })

  it('se puede correr dos veces sin error', async () => {
    await db.exec(MIGRACION)
    await expect(como('anon', 'select pin from public.jugadores')).rejects.toThrow(/permission denied/)
  })
})
