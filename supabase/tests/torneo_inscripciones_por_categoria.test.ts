// Prueba la migración 20261023180000_torneo_inscripciones_por_categoria en un
// Postgres local (PGlite), sobre copias reducidas de las tablas del torneo y
// el trigger torneo_inscripciones_validar como estaba en producción el
// 23-oct-2026 (solo las columnas que usa el trigger).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRACION = readFileSync(
  join(__dirname, '../migrations/20261023180000_torneo_inscripciones_por_categoria.sql'),
  'utf8',
)

const ESTADO_PROD = `
  create role anon nologin;
  create role authenticated nologin;
  create table public.administradores (id uuid primary key default gen_random_uuid(), nombre text not null);
  create table public.torneos (
    id uuid primary key default gen_random_uuid(), estado text not null default 'borrador',
    fecha_inicio date not null default '2026-12-01', fecha_corte_edad date null, solo_socios boolean not null default false
  );
  create table public.torneo_categorias (
    id uuid primary key default gen_random_uuid(), torneo_id uuid not null references public.torneos(id),
    nombre text not null, modalidad text not null, genero text not null, cupo integer not null,
    es_infantil boolean not null default false, edad_min integer null, edad_max integer null
  );
  create table public.torneo_menores (
    id uuid primary key default gen_random_uuid(), nombre text not null, apellido text not null,
    fecha_nacimiento date not null, genero text not null, numero_accion text null
  );
  create table public.torneo_inscripciones (
    id uuid primary key default gen_random_uuid(), categoria_id uuid not null references public.torneo_categorias(id),
    jugador1_id uuid null, jugador2_id uuid null, menor_id uuid null references public.torneo_menores(id),
    menor_nombre_publico text null, estado text not null default 'pendiente_pago',
    inscrita_por_admin uuid null references public.administradores(id)
  );
  create function public.torneo_nombre_publico_menor(p_nombre text, p_apellido text) returns text
    language sql immutable set search_path = public
    as $$ select btrim(p_nombre) || ' ' || upper(left(btrim(p_apellido), 1)) || '.' $$;
  create function public.torneo_inscripciones_validar() returns trigger language plpgsql as $$ begin return new; end; $$;
  create trigger torneo_inscripciones_validar
    before insert or update of categoria_id, jugador1_id, jugador2_id, menor_id, estado
    on public.torneo_inscripciones
    for each row execute function public.torneo_inscripciones_validar();

  insert into public.administradores (id, nombre) values ('00000000-0000-0000-0000-00000000000a', 'Admin');
  insert into public.torneos (id, estado) values ('00000000-0000-0000-0000-000000000001', 'inscripcion');
  insert into public.torneo_categorias (id, torneo_id, nombre, modalidad, genero, cupo) values
    ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 'Single Quinta', 'single', 'caballeros', 8),
    ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', 'Doble Sexta', 'doble', 'caballeros', 8);
  insert into public.torneo_categorias (id, torneo_id, nombre, modalidad, genero, cupo, es_infantil, edad_min, edad_max) values
    ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000001', 'Pelota Verde', 'single', 'abierto', 16, true, 9, 11);
  insert into public.torneo_menores (id, nombre, apellido, fecha_nacimiento, genero) values
    ('00000000-0000-0000-0000-0000000000e1', 'Sofía', 'Pérez', '2016-03-01', 'damas');
  -- Inscripción hecha antes de la migración (la categoría todavía no tenía la columna).
  insert into public.torneo_inscripciones (id, categoria_id, jugador1_id, jugador2_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', gen_random_uuid(), gen_random_uuid());
`

const T = '00000000-0000-0000-0000-000000000001'
const SINGLE = '00000000-0000-0000-0000-0000000000c1'
const DOBLE = '00000000-0000-0000-0000-0000000000c2'
const INFANTIL = '00000000-0000-0000-0000-0000000000c3'
const ADMIN = '00000000-0000-0000-0000-00000000000a'
const MENOR = '00000000-0000-0000-0000-0000000000e1'
const PREVIA = '00000000-0000-0000-0000-0000000000a1'

let db: PGlite

const inscribirSingle = () =>
  db.query(`insert into public.torneo_inscripciones (categoria_id, jugador1_id) values ($1, gen_random_uuid()) returning id`, [SINGLE])
const abrir = (categoria: string, abiertas: boolean) =>
  db.query('update public.torneo_categorias set inscripciones_abiertas = $2 where id = $1', [categoria, abiertas])
const torneoEn = (estado: string) => db.query('update public.torneos set estado = $2 where id = $1', [T, estado])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(ESTADO_PROD)
  // Punto de partida: antes de la migración se podía inscribir con el torneo en 'inscripcion'.
  await inscribirSingle()
  await db.exec('delete from public.torneo_inscripciones where categoria_id = \'' + SINGLE + '\'')
  await db.exec(MIGRACION)
}, 30_000)

describe('inscripciones abiertas por categoría', () => {
  it('las categorías existentes arrancan cerradas, sin registro de cambio', async () => {
    const { rows } = await db.query<{ inscripciones_abiertas: boolean; inscripciones_cambiadas_por: string | null }>(
      'select inscripciones_abiertas, inscripciones_cambiadas_por from public.torneo_categorias',
    )
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.inscripciones_abiertas === false && r.inscripciones_cambiadas_por === null)).toBe(true)
  })

  it('rechaza inscribirse en una categoría cerrada aunque el torneo esté en inscripción', async () => {
    await expect(inscribirSingle()).rejects.toThrow('Las inscripciones de esta categoría no están abiertas')
  })

  it('con la categoría abierta y el torneo en inscripción, acepta', async () => {
    await abrir(SINGLE, true)
    const { rows } = await inscribirSingle()
    expect(rows).toHaveLength(1)
  })

  it('con la categoría abierta pero el torneo en borrador, rechaza', async () => {
    await torneoEn('borrador')
    await expect(inscribirSingle()).rejects.toThrow('no están abiertas')
    await torneoEn('inscripcion')
  })

  it('rechaza reactivar una retirada en una categoría cerrada', async () => {
    await db.query(`update public.torneo_inscripciones set estado = 'retirada' where id = $1`, [PREVIA])
    await expect(
      db.query(`update public.torneo_inscripciones set estado = 'pendiente_pago' where id = $1`, [PREVIA]),
    ).rejects.toThrow('no están abiertas')
    await abrir(DOBLE, true)
    await db.query(`update public.torneo_inscripciones set estado = 'pendiente_pago' where id = $1`, [PREVIA])
    await abrir(DOBLE, false)
  })

  it('las inscripciones ya hechas siguen editándose con la categoría cerrada', async () => {
    await db.query('update public.torneo_inscripciones set jugador2_id = gen_random_uuid() where id = $1', [PREVIA])
    await db.query(`update public.torneo_inscripciones set estado = 'retirada' where id = $1`, [PREVIA])
  })

  it('el representante no inscribe en una infantil cerrada; el admin sí, incluso con el torneo en borrador', async () => {
    const menor = (admin: string | null) =>
      db.query(
        'insert into public.torneo_inscripciones (categoria_id, menor_id, inscrita_por_admin) values ($1, $2, $3)',
        [INFANTIL, MENOR, admin],
      )
    await expect(menor(null)).rejects.toThrow('no están abiertas')
    await torneoEn('borrador')
    await menor(ADMIN)
    await torneoEn('inscripcion')
  })

  it('sigue aplicando las demás reglas (cupo)', async () => {
    await db.query('update public.torneo_categorias set cupo = 1 where id = $1', [SINGLE])
    await expect(inscribirSingle()).rejects.toThrow('La categoría ya no tiene cupo')
  })

  it('la función del trigger no la ejecutan anon ni authenticated', async () => {
    const { rows } = await db.query<{ anon: boolean; auth: boolean }>(`
      select has_function_privilege('anon', 'public.torneo_inscripciones_validar()', 'execute') anon,
             has_function_privilege('authenticated', 'public.torneo_inscripciones_validar()', 'execute') auth`)
    expect(rows[0]).toEqual({ anon: false, auth: false })
  })
})
