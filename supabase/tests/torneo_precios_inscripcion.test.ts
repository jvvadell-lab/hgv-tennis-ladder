// Prueba la migración 20261028164247_torneo_precios_inscripcion en un
// Postgres local (PGlite), sobre copias reducidas de las tablas del torneo
// (solo las columnas que usan la función y el trigger del monto).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRACION = readFileSync(
  join(__dirname, '../migrations/20261028164247_torneo_precios_inscripcion.sql'),
  'utf8',
)

const T = '00000000-0000-0000-0000-000000000001'
const SINGLE_QUINTA = '00000000-0000-0000-0000-0000000000c1'
const SINGLE_SEXTA = '00000000-0000-0000-0000-0000000000c2'
const DOBLE_QUINTA = '00000000-0000-0000-0000-0000000000c3'
const NARANJA = '00000000-0000-0000-0000-0000000000c4'
const VERDE = '00000000-0000-0000-0000-0000000000c5'
const JUVENIL = '00000000-0000-0000-0000-0000000000c6'
const ADMIN = '00000000-0000-0000-0000-00000000000a'
const PREVIA = '00000000-0000-0000-0000-0000000000a1'

const ESTADO_PROD = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create table public.administradores (id uuid primary key default gen_random_uuid(), nombre text not null);
  create table public.torneos (
    id uuid primary key default gen_random_uuid(), monto_inscripcion_eur numeric default 15
  );
  create table public.torneo_categorias (
    id uuid primary key default gen_random_uuid(), torneo_id uuid not null references public.torneos(id),
    nombre text not null, es_infantil boolean not null default false
  );
  create table public.torneo_menores (
    id uuid primary key default gen_random_uuid(), nombre text not null, representante_jugador_id uuid not null
  );
  create table public.torneo_inscripciones (
    id uuid primary key default gen_random_uuid(), categoria_id uuid not null references public.torneo_categorias(id),
    jugador1_id uuid null, menor_id uuid null references public.torneo_menores(id),
    estado text not null default 'pendiente_pago', created_at timestamptz not null default now()
  );

  insert into public.administradores (id, nombre) values ('${ADMIN}', 'Admin');
  insert into public.torneos (id) values ('${T}');
  insert into public.torneo_categorias (id, torneo_id, nombre, es_infantil) values
    ('${SINGLE_QUINTA}', '${T}', 'Single Quinta', false),
    ('${SINGLE_SEXTA}', '${T}', 'Single Sexta', false),
    ('${DOBLE_QUINTA}', '${T}', 'Doble Quinta', false),
    ('${NARANJA}', '${T}', 'Pelota Naranja', true),
    ('${VERDE}', '${T}', 'Pelota Verde', true),
    ('${JUVENIL}', '${T}', 'Juvenil Caballeros', true);
  -- Inscripción hecha antes de la migración, con la tarifa única.
  insert into public.torneo_inscripciones (id, categoria_id, jugador1_id) values
    ('${PREVIA}', '${SINGLE_QUINTA}', gen_random_uuid());
`

let db: PGlite
let n = 0
const uuid = () => `00000000-0000-0000-0001-${String(++n).padStart(12, '0')}`

type Fila = { id: string; monto_eur: string; monto_calculado_eur: string; monto_motivo: string }

const inscribirAdulto = async (categoria: string, jugador: string) =>
  (await db.query<Fila>(
    `insert into public.torneo_inscripciones (categoria_id, jugador1_id) values ($1, $2)
     returning id, monto_eur::text, monto_calculado_eur::text, monto_motivo`,
    [categoria, jugador],
  )).rows[0]

const nuevoMenor = async (representante: string) => {
  const id = uuid()
  await db.query('insert into public.torneo_menores (id, nombre, representante_jugador_id) values ($1, $2, $3)', [id, 'Niño', representante])
  return id
}

const inscribirMenor = async (categoria: string, menor: string) =>
  (await db.query<Fila>(
    `insert into public.torneo_inscripciones (categoria_id, menor_id) values ($1, $2)
     returning id, monto_eur::text, monto_calculado_eur::text, monto_motivo`,
    [categoria, menor],
  )).rows[0]

const montoYMotivo = (f: Fila) => [Number(f.monto_eur), f.monto_motivo]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(ESTADO_PROD)
  await db.exec(MIGRACION)
}, 30_000)

describe('migración', () => {
  it('las inscripciones existentes conservan la tarifa única', async () => {
    const { rows } = await db.query<Fila>(
      'select monto_eur::text, monto_calculado_eur::text, monto_motivo from public.torneo_inscripciones where id = $1', [PREVIA])
    expect(Number(rows[0].monto_eur)).toBe(15)
    expect(Number(rows[0].monto_calculado_eur)).toBe(15)
    expect(rows[0].monto_motivo).toMatch(/Tarifa única/)
  })

  it('el torneo trae la tarifa adicional de 10 €', async () => {
    const { rows } = await db.query<{ a: string }>('select monto_inscripcion_adicional_eur::text as a from public.torneos')
    expect(Number(rows[0].a)).toBe(10)
  })
})

describe('adultos', () => {
  it('1, 2 y 3 categorías: 15, 10 y 10 €', async () => {
    const j = uuid()
    expect(montoYMotivo(await inscribirAdulto(SINGLE_QUINTA, j))).toEqual([15, 'Primera categoría'])
    expect(montoYMotivo(await inscribirAdulto(SINGLE_SEXTA, j))).toEqual([10, 'Segunda categoría'])
    expect(montoYMotivo(await inscribirAdulto(DOBLE_QUINTA, j))).toEqual([10, 'Tercera categoría'])
  })

  it('pareja de dobles con distinto número de categorías: cada uno paga según las suyas', async () => {
    const a = uuid()
    const b = uuid()
    await inscribirAdulto(SINGLE_QUINTA, b) // b ya juega single
    expect(montoYMotivo(await inscribirAdulto(DOBLE_QUINTA, a))).toEqual([15, 'Primera categoría'])
    expect(montoYMotivo(await inscribirAdulto(DOBLE_QUINTA, b))).toEqual([10, 'Segunda categoría'])
  })

  it('un retiro no recalcula las que quedan', async () => {
    const j = uuid()
    const primera = await inscribirAdulto(SINGLE_QUINTA, j)
    const segunda = await inscribirAdulto(DOBLE_QUINTA, j)
    await db.query(`update public.torneo_inscripciones set estado = 'retirada' where id = $1`, [primera.id])
    const { rows } = await db.query<Fila>('select monto_eur::text, monto_motivo from public.torneo_inscripciones where id = $1', [segunda.id])
    expect(montoYMotivo(rows[0])).toEqual([10, 'Segunda categoría'])
  })

  it('ignora el monto que mande el cliente', async () => {
    const { rows } = await db.query<Fila>(
      `insert into public.torneo_inscripciones (categoria_id, jugador1_id, monto_eur, monto_calculado_eur, monto_motivo)
       values ($1, $2, 1, 1, 'trampa') returning monto_eur::text, monto_motivo`, [SINGLE_SEXTA, uuid()])
    expect(montoYMotivo(rows[0])).toEqual([15, 'Primera categoría'])
  })
})

describe('infantiles', () => {
  it('un hijo: 15 €', async () => {
    const rep = uuid()
    expect(montoYMotivo(await inscribirMenor(NARANJA, await nuevoMenor(rep)))).toEqual([15, 'Primera inscripción infantil'])
  })

  it('dos y tres hijos del mismo representante: 15, 10 y 10 €', async () => {
    const rep = uuid()
    expect(montoYMotivo(await inscribirMenor(NARANJA, await nuevoMenor(rep)))).toEqual([15, 'Primera inscripción infantil'])
    expect(montoYMotivo(await inscribirMenor(VERDE, await nuevoMenor(rep)))).toEqual([10, 'Segundo hijo'])
    expect(montoYMotivo(await inscribirMenor(JUVENIL, await nuevoMenor(rep)))).toEqual([10, 'Tercer hijo'])
  })

  it('el mismo niño en dos categorías: 15 y 10 €', async () => {
    const menor = await nuevoMenor(uuid())
    expect(montoYMotivo(await inscribirMenor(NARANJA, menor))).toEqual([15, 'Primera inscripción infantil'])
    expect(montoYMotivo(await inscribirMenor(VERDE, menor))).toEqual([10, 'Mismo niño en otra categoría'])
  })

  it('padre inscrito en adultos + hijo: el hijo paga 15 €', async () => {
    const padre = uuid()
    await inscribirAdulto(SINGLE_QUINTA, padre)
    await inscribirAdulto(DOBLE_QUINTA, padre)
    expect(montoYMotivo(await inscribirMenor(NARANJA, await nuevoMenor(padre)))).toEqual([15, 'Primera inscripción infantil'])
  })

  it('mayor de 14 con cuenta propia: es su propio representante y paga 15 €', async () => {
    const juvenil = uuid()
    await inscribirAdulto(SINGLE_SEXTA, juvenil) // también juega en adultos: no cambia nada
    expect(montoYMotivo(await inscribirMenor(JUVENIL, await nuevoMenor(juvenil)))).toEqual([15, 'Primera inscripción infantil'])
  })

  it('los hijos de otro representante no cuentan', async () => {
    await inscribirMenor(NARANJA, await nuevoMenor(uuid()))
    expect(montoYMotivo(await inscribirMenor(NARANJA, await nuevoMenor(uuid())))).toEqual([15, 'Primera inscripción infantil'])
  })
})

describe('ajuste del admin', () => {
  it('exige nota, admin y fecha juntos', async () => {
    const ins = await inscribirAdulto(SINGLE_QUINTA, uuid())
    await expect(db.query(
      'update public.torneo_inscripciones set monto_eur = 0, monto_ajustado_por = $2, monto_ajustado_at = now() where id = $1',
      [ins.id, ADMIN])).rejects.toThrow(/torneo_inscripciones_ajuste_con_nota/)
    await db.query(
      `update public.torneo_inscripciones set monto_eur = 0, monto_ajustado_por = $2, monto_ajustado_at = now(),
         monto_ajuste_nota = 'Beca de la comisión' where id = $1`, [ins.id, ADMIN])
    const { rows } = await db.query<Fila>('select monto_eur::text, monto_calculado_eur::text from public.torneo_inscripciones where id = $1', [ins.id])
    expect(Number(rows[0].monto_eur)).toBe(0)
    expect(Number(rows[0].monto_calculado_eur)).toBe(15)
  })
})

describe('función de vista previa', () => {
  it('devuelve lo mismo que fijaría el trigger, sin inscribir', async () => {
    const j = uuid()
    await inscribirAdulto(SINGLE_QUINTA, j)
    const { rows } = await db.query<{ monto_eur: string; motivo: string }>(
      'select monto_eur::text, motivo from public.torneo_monto_inscripcion($1, $2, null)', [SINGLE_SEXTA, j])
    expect([Number(rows[0].monto_eur), rows[0].motivo]).toEqual([10, 'Segunda categoría'])
  })
})
