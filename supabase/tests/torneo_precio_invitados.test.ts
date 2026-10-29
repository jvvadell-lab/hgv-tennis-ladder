// Prueba la migración 20261029201034_torneo_precio_invitados (sobre la de
// precios del 28-oct) en un Postgres local (PGlite), con copias reducidas de
// las tablas del torneo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const leer = (f: string) => readFileSync(join(__dirname, '../migrations', f), 'utf8')
const PRECIOS = leer('20261028164247_torneo_precios_inscripcion.sql')
const INVITADOS = leer('20261029201034_torneo_precio_invitados.sql')

const T = '00000000-0000-0000-0000-000000000001'
const SINGLE = '00000000-0000-0000-0000-0000000000c1'
const DOBLE = '00000000-0000-0000-0000-0000000000c2'
const MIXTO = '00000000-0000-0000-0000-0000000000c3'
const NARANJA = '00000000-0000-0000-0000-0000000000c4'
const VERDE = '00000000-0000-0000-0000-0000000000c5'
const INVITADO_PREVIO = '00000000-0000-0000-0000-0000000000b1'
const PREVIA = '00000000-0000-0000-0000-0000000000a1'

const ESTADO_PROD = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create table public.administradores (id uuid primary key default gen_random_uuid(), nombre text not null);
  create table public.jugadores (
    id uuid primary key default gen_random_uuid(), es_invitado boolean not null default false
  );
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

  insert into public.torneos (id) values ('${T}');
  insert into public.torneo_categorias (id, torneo_id, nombre, es_infantil) values
    ('${SINGLE}', '${T}', 'Single Quinta', false),
    ('${DOBLE}', '${T}', 'Doble Sexta', false),
    ('${MIXTO}', '${T}', 'Mixto', false),
    ('${NARANJA}', '${T}', 'Pelota Naranja', true),
    ('${VERDE}', '${T}', 'Pelota Verde', true);
  insert into public.jugadores (id, es_invitado) values ('${INVITADO_PREVIO}', true);
`

let db: PGlite
let n = 0
const uuid = () => `00000000-0000-0000-0001-${String(++n).padStart(12, '0')}`

type Fila = { id: string; monto_eur: string; monto_motivo: string }

const nuevoJugador = async (invitado: boolean) => {
  const id = uuid()
  await db.query('insert into public.jugadores (id, es_invitado) values ($1, $2)', [id, invitado])
  return id
}

const inscribirAdulto = async (categoria: string, jugador: string) =>
  (await db.query<Fila>(
    `insert into public.torneo_inscripciones (categoria_id, jugador1_id) values ($1, $2)
     returning id, monto_eur::text, monto_motivo`,
    [categoria, jugador],
  )).rows[0]

const inscribirMenor = async (categoria: string, representante: string) => {
  const menor = uuid()
  await db.query('insert into public.torneo_menores (id, nombre, representante_jugador_id) values ($1, $2, $3)', [menor, 'Niño', representante])
  return (await db.query<Fila>(
    `insert into public.torneo_inscripciones (categoria_id, menor_id) values ($1, $2)
     returning id, monto_eur::text, monto_motivo`,
    [categoria, menor],
  )).rows[0]
}

const montoYMotivo = (f: Fila) => [Number(f.monto_eur), f.monto_motivo]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(ESTADO_PROD)
  await db.exec(PRECIOS)
  // Invitado inscrito antes de la regla del 29-oct (con la regla vieja).
  await db.query('insert into public.torneo_inscripciones (id, categoria_id, jugador1_id) values ($1, $2, $3)',
    [PREVIA, MIXTO, INVITADO_PREVIO])
  await db.exec(INVITADOS)
}, 30_000)

describe('migración', () => {
  it('el torneo trae la tarifa de invitado de 20 €', async () => {
    const { rows } = await db.query<{ m: string }>('select monto_inscripcion_invitado_eur::text as m from public.torneos')
    expect(Number(rows[0].m)).toBe(20)
  })

  it('las inscripciones existentes de invitados no se recalculan', async () => {
    const { rows } = await db.query<Fila>('select id, monto_eur::text, monto_motivo from public.torneo_inscripciones where id = $1', [PREVIA])
    expect(montoYMotivo(rows[0])).toEqual([15, 'Primera categoría'])
  })
})

describe('invitados adultos', () => {
  it('pagan 20 € en cada categoría, sin descuento', async () => {
    const j = await nuevoJugador(true)
    expect(montoYMotivo(await inscribirAdulto(SINGLE, j))).toEqual([20, 'Invitado (no socio)'])
    expect(montoYMotivo(await inscribirAdulto(DOBLE, j))).toEqual([20, 'Invitado (no socio)'])
  })

  it('el invitado que ya tenía una inscripción paga 20 € en la siguiente', async () => {
    expect(montoYMotivo(await inscribirAdulto(DOBLE, INVITADO_PREVIO))).toEqual([20, 'Invitado (no socio)'])
  })

  it('pareja socio + invitado: cada uno paga su tarifa', async () => {
    const socio = await nuevoJugador(false)
    const invitado = await nuevoJugador(true)
    expect(montoYMotivo(await inscribirAdulto(MIXTO, socio))).toEqual([15, 'Primera categoría'])
    expect(montoYMotivo(await inscribirAdulto(MIXTO, invitado))).toEqual([20, 'Invitado (no socio)'])
  })

  it('respeta la tarifa configurada en el torneo', async () => {
    await db.query('update public.torneos set monto_inscripcion_invitado_eur = 25')
    const j = await nuevoJugador(true)
    expect(montoYMotivo(await inscribirAdulto(SINGLE, j))).toEqual([25, 'Invitado (no socio)'])
    await db.query('update public.torneos set monto_inscripcion_invitado_eur = 20')
  })
})

describe('socios e infantiles no cambian', () => {
  it('socio: 15 y 10 €', async () => {
    const j = await nuevoJugador(false)
    expect(montoYMotivo(await inscribirAdulto(SINGLE, j))).toEqual([15, 'Primera categoría'])
    expect(montoYMotivo(await inscribirAdulto(DOBLE, j))).toEqual([10, 'Segunda categoría'])
  })

  it('niños de un representante invitado: 15 y 10 €', async () => {
    const rep = await nuevoJugador(true)
    expect(montoYMotivo(await inscribirMenor(NARANJA, rep))).toEqual([15, 'Primera inscripción infantil'])
    expect(montoYMotivo(await inscribirMenor(VERDE, rep))).toEqual([10, 'Segundo hijo'])
  })
})
