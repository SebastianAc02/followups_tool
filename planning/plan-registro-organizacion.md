# Registro con organización y selección de identidad — Plan de implementación

> **Para quien ejecute esto:** usa `superpowers:subagent-driven-development` (recomendado si
> se ejecuta en sesiones separadas) o `superpowers:executing-plans` (recomendado si se ejecuta
> inline, tarea por tarea, en esta misma sesión con checkpoints). Los pasos usan checkbox
> (`- [ ]`) para llevar el conteo.

**Objetivo:** Reemplazar el alta de usuarios por script con una pantalla `/register`
self-service: el usuario elige la organización (fija: Onepay), elige quién es de una lista
de nombres libres (no reclamados), pone correo y contraseña, y la cuenta queda ligada a su
owner canónico. También se agrega "Crear cuenta" y "Recordar sesión" a `/login`.

**Arquitectura:** 2 tablas nuevas (`organizacion`, `organizacion_miembro`) creadas por
migración Python idempotente (mismo patrón que `migrate_auth_apply.py`). Un archivo nuevo
`app/db/organizacion-repository.ts` (separado de `repository.ts` porque cruza el dominio de
Onepay con la tabla `user` de Better Auth — cohesión propia, no se mezcla con las queries de
empresa/toque/cadencia). Un server action `app/register/actions.ts` orquesta: reclamar el
miembro, crear la cuenta vía `auth.api.signUpEmail`, y fijar `user.owner`. El campo `owner`
sigue sin poder mandarse como texto libre desde el cliente (se elige un `id` de una lista que
controla el servidor).

**Tech Stack:** Next.js (App Router, server actions), Drizzle ORM sobre SQLite (better-sqlite3),
Better Auth, Zod, `node:test` para pruebas.

---

## Contexto que ya se confirmó (no hace falta re-investigar)

- Owners canónicos reales en `empresa.owner` hoy: `Sebastian Acosta Molina` (74),
  `Thomas Schumacher` (68), `Felipe Castro` (64), `Camilo fonseca` (13, **f minúscula**).
- Solo existe una cuenta hoy: `sacostamolin@gmail.com` con `owner = 'Sebastian Acosta Molina'`.
- `disableSignUp` de Better Auth bloquea tanto la ruta HTTP como las llamadas directas
  `auth.api.signUpEmail(...)` (mismo handler compartido, confirmado en
  `node_modules/better-auth/dist/api/routes/sign-up.mjs:143`). Hay que ponerlo en `false`.
- `owner` sigue con `input: false` en `app/lib/auth.ts` — el cliente nunca lo manda como
  string. El registro setea `owner` con un UPDATE directo a la tabla `user`, igual que ya
  hace `scripts/seed_auth_users.ts:43`.
- Better Auth's `rememberMe` ya es `true` por defecto (sesión persistente). El checkbox
  "Recordar sesión" controla si se manda `rememberMe: false` (sesión no persistente) cuando
  el usuario lo destilda.
- Este repo NO usa `drizzle-kit generate/push` para migrar `isps.db`: las migraciones son
  scripts Python de mano (`scripts/migrate_*_apply.py` / `*_dryrun.py`), idempotentes con
  `CREATE TABLE IF NOT EXISTS`, logueando en `sync_cambios`. `app/db/schema.ts` y
  `auth-schema.ts` solo reflejan columnas para que Drizzle pueda hacer queries — no declaran
  índices (los índices viven solo en el DDL de la migración y, para pruebas, en
  `app/db/test-helpers.ts`).

---

### Task 1: Tablas `organizacion` / `organizacion_miembro` (migración + schema + test estructural)

**Files:**
- Create: `scripts/migrate_organizacion_dryrun.py`
- Create: `scripts/migrate_organizacion_apply.py`
- Modify: `app/db/schema.ts` (agregar las 2 tablas al final)
- Modify: `app/db/test-helpers.ts` (agregar las 2 tablas al DDL de prueba)
- Test: `app/db/organizacion.test.ts`

- [ ] **Step 1: Escribir el dry-run**

```python
#!/usr/bin/env python3
"""Dry-run: muestra si faltan las tablas organizacion/organizacion_miembro en isps.db.
No escribe nada."""
import os
import sqlite3

DB_PATH = os.environ.get(
    "ISPS_DB_PATH",
    "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db",
)

TABLAS = ["organizacion", "organizacion_miembro"]


def main():
    con = sqlite3.connect(DB_PATH)
    existentes = {
        r[0]
        for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    for t in TABLAS:
        estado = "YA EXISTE (no se toca)" if t in existentes else "SE CREARIA"
        print(f"  {t}: {estado}")
    con.close()


if __name__ == "__main__":
    main()
```

Guardar en `scripts/migrate_organizacion_dryrun.py`.

- [ ] **Step 2: Correr el dry-run para confirmar que faltan las tablas**

Run: `python3 scripts/migrate_organizacion_dryrun.py`
Expected:
```
  organizacion: SE CREARIA
  organizacion_miembro: SE CREARIA
```

- [ ] **Step 3: Escribir el apply**

```python
"""
Migracion organizacion (V6.1): crea 'organizacion' y 'organizacion_miembro' en isps.db.
Idempotente via CREATE TABLE/INDEX IF NOT EXISTS. No toca ninguna tabla del dominio ni de auth.

organizacion_miembro.owner_canonico DEBE ser el valor EXACTO de empresa.owner (respeta
mayusculas/minusculas reales, ej. 'Camilo fonseca' con f minuscula) para que el filtro de
cola por owner matchee. id_user (nullable) se llena cuando alguien reclama el nombre en
/register; el indice unico parcial evita que dos cuentas reclamen el mismo miembro.
Log en sync_cambios con corrida=migrate-organizacion-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = ["organizacion", "organizacion_miembro"]

DDL = """
CREATE TABLE IF NOT EXISTS `organizacion` (
	`id_organizacion` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`created_at` text
);

CREATE TABLE IF NOT EXISTS `organizacion_miembro` (
	`id_miembro` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_organizacion` integer NOT NULL,
	`owner_canonico` text NOT NULL,
	`nombre_display` text NOT NULL,
	`id_user` text,
	`created_at` text
);
CREATE UNIQUE INDEX IF NOT EXISTS `ux_organizacion_miembro_id_user`
  ON `organizacion_miembro` (`id_user`) WHERE `id_user` IS NOT NULL;
"""

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-organizacion-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


try:
    antes = {
        r[0]
        for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    cur.executescript(DDL)
    for t in TABLAS:
        accion = 'create' if t not in antes else 'skip'
        log(t, accion, 'CREATE TABLE IF NOT EXISTS (organizacion)')
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("\n  estado final:")
    for t in TABLAS:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info(`{t}`)")]
        print(f"   {t}: {len(cols)} columnas -> {cols}")
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
```

Guardar en `scripts/migrate_organizacion_apply.py`.

- [ ] **Step 4: Aplicar la migración contra isps.db real**

Run: `python3 scripts/migrate_organizacion_apply.py`
Expected: `APLICADO OK. corrida: migrate-organizacion-<timestamp>` y las 2 tablas listadas con
sus columnas.

- [ ] **Step 5: Confirmar con el dry-run que ya no faltan**

Run: `python3 scripts/migrate_organizacion_dryrun.py`
Expected:
```
  organizacion: YA EXISTE (no se toca)
  organizacion_miembro: YA EXISTE (no se toca)
```

- [ ] **Step 6: Agregar las tablas al schema de Drizzle**

Agregar al final de `app/db/schema.ts`:

```ts
export const organizacion = sqliteTable('organizacion', {
  idOrganizacion: integer('id_organizacion').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  createdAt: text('created_at'),
});

export const organizacionMiembro = sqliteTable('organizacion_miembro', {
  idMiembro: integer('id_miembro').primaryKey({ autoIncrement: true }),
  idOrganizacion: integer('id_organizacion').notNull(),
  // Valor EXACTO de empresa.owner en isps.db (incluye mayusculas/minusculas reales, ej.
  // "Camilo fonseca"). No es el nombre bonito: es la llave con la que se filtra la cola.
  ownerCanonico: text('owner_canonico').notNull(),
  nombreDisplay: text('nombre_display').notNull(),
  idUser: text('id_user'),
  createdAt: text('created_at'),
});
```

- [ ] **Step 7: Agregar las tablas al DDL de prueba**

En `app/db/test-helpers.ts`, agregar antes del cierre del template string de `sqlite.exec`
(después de la tabla `evento_tracking` y sus índices, antes del backtick de cierre):

```sql

    CREATE TABLE organizacion (
      id_organizacion INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE organizacion_miembro (
      id_miembro INTEGER PRIMARY KEY AUTOINCREMENT,
      id_organizacion INTEGER NOT NULL,
      owner_canonico TEXT NOT NULL,
      nombre_display TEXT NOT NULL,
      id_user TEXT,
      created_at TEXT
    );

    CREATE UNIQUE INDEX ux_organizacion_miembro_id_user
      ON organizacion_miembro(id_user) WHERE id_user IS NOT NULL;
```

- [ ] **Step 8: Escribir el test estructural (falla primero: aún no hay nada que probar más
  que la estructura, así que este paso YA verifica el estado final; correrlo confirma que
  Step 6/7 quedaron bien)**

```ts
// Prueba estructural de las tablas de organizacion (V6.1). No prueba el flujo de registro
// completo (eso llega en Task 2 con organizacion-repository.test.ts). Corre contra la DB de
// prueba de test-helpers, nunca isps.db real.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();

function db() {
  return new Database(dbPath);
}

test('las tablas organizacion y organizacion_miembro existen tras crear la DB de prueba', () => {
  const raw = db();
  const nombres = raw
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN
       ('organizacion','organizacion_miembro') ORDER BY name`,
    )
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(nombres, ['organizacion', 'organizacion_miembro']);
  raw.close();
});

test('el indice unico parcial rechaza que dos miembros compartan el mismo id_user', () => {
  const raw = db();
  raw.prepare(`INSERT INTO organizacion (nombre) VALUES ('Onepay')`).run();
  raw
    .prepare(
      `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user)
       VALUES (1, 'Thomas Schumacher', 'Thomas Schumacher', 'user-1')`,
    )
    .run();

  assert.throws(
    () =>
      raw
        .prepare(
          `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user)
           VALUES (1, 'Felipe Castro', 'Felipe Castro', 'user-1')`,
        )
        .run(),
    /UNIQUE constraint failed/,
    'una cuenta no puede reclamar dos nombres (indice parcial sobre id_user IS NOT NULL)',
  );
  raw.close();
});

test('dos miembros con id_user NULL conviven sin problema (nadie los ha reclamado)', () => {
  const raw = db();
  raw
    .prepare(
      `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display)
       VALUES (1, 'Felipe Castro', 'Felipe Castro')`,
    )
    .run();
  raw
    .prepare(
      `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display)
       VALUES (1, 'Camilo fonseca', 'Camilo Fonseca')`,
    )
    .run();

  const total = raw
    .prepare(`SELECT count(*) c FROM organizacion_miembro WHERE id_user IS NULL`)
    .get() as any;
  assert.equal(total.c, 2, 'varios miembros sin reclamar conviven (el indice es parcial)');
  raw.close();
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

Guardar en `app/db/organizacion.test.ts`.

- [ ] **Step 9: Correr los tests**

Run: `npm test`
Expected: los 3 tests nuevos en verde (más todos los existentes, sin romper nada).

- [ ] **Step 10: Commit**

```bash
git add scripts/migrate_organizacion_dryrun.py scripts/migrate_organizacion_apply.py \
  app/db/schema.ts app/db/test-helpers.ts app/db/organizacion.test.ts
git commit -m "feat: tablas organizacion y organizacion_miembro"
```

---

### Task 2: `app/db/organizacion-repository.ts` (queries + reclamo atómico)

**Files:**
- Create: `app/db/organizacion-repository.ts`
- Test: `app/db/organizacion-repository.test.ts`

★ Nota de diseño (checkpoint sugerido, no bloqueante): `reclamarMiembro` es la función que
resuelve la condición de carrera de "dos personas eligen el mismo nombre casi a la vez". El
orden importa: se reclama el miembro **después** de crear la cuenta (Task 3), con un UPDATE
condicionado a `id_user IS NULL`. Si el UPDATE afecta 0 filas, alguien más ganó la carrera —
la cuenta ya quedó creada pero sin owner, y el fallback existente en
`app/lib/session-user.ts:18` (usa `name` si `owner` es null) evita que eso rompa nada; el
usuario simplemente ve una cola vacía y puede pedir que le arreglen el owner a mano. Es un
caso raro (ventana de milisegundos, 4 usuarios) — no se justifica una transacción
distribuida para esto.

★ Insight de implementación: `app/db/index.ts` abre la conexión a `ISPS_DB_PATH` una sola vez
a nivel de módulo (singleton), y todo el resto del repo (incluyendo `repository.ts`) importa
ese singleton directo. Eso significa que `organizacion-repository.ts` no puede apuntar a una
DB de prueba distinta simplemente reimportando el módulo. La solución: sus funciones reciben
la conexión Drizzle como parámetro **opcional** (default al singleton real en producción), y
los tests le pasan una conexión de prueba armada con un helper `dbDePrueba(dbPath)`.

- [ ] **Step 1: Escribir `organizacion-repository.ts` con inyección de DB para tests**

```ts
import { eq, and, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { db as dbSingleton } from './index';
import * as schema from './schema';
import * as authSchema from './auth-schema';

const { organizacionMiembro } = schema;
const { user } = authSchema;

type DbInstancia = typeof dbSingleton;

export function miembrosLibres(idOrganizacion: number, db: DbInstancia = dbSingleton) {
  return db
    .select({ id: organizacionMiembro.idMiembro, nombreDisplay: organizacionMiembro.nombreDisplay })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idOrganizacion, idOrganizacion), isNull(organizacionMiembro.idUser)))
    .all();
}

export function miembroLibrePorId(idMiembro: number, db: DbInstancia = dbSingleton) {
  return db
    .select()
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idMiembro, idMiembro), isNull(organizacionMiembro.idUser)))
    .get();
}

// Reclamo atomico: solo tiene efecto si nadie mas reclamo el miembro entre que se leyo
// (miembroLibrePorId) y que se llama esto. Devuelve true si el reclamo tuvo efecto.
export function reclamarMiembro(idMiembro: number, idUsuario: string, db: DbInstancia = dbSingleton): boolean {
  const res = db
    .update(organizacionMiembro)
    .set({ idUser: idUsuario })
    .where(and(eq(organizacionMiembro.idMiembro, idMiembro), isNull(organizacionMiembro.idUser)))
    .run();
  return res.changes === 1;
}

// owner es input:false en Better Auth (app/lib/auth.ts): nunca se setea desde el cliente.
// Este UPDATE directo es la unica via para escribirlo en runtime, igual que ya hace
// scripts/seed_auth_users.ts a mano para el alta por script.
export function setOwnerDeUsuario(idUsuario: string, owner: string, db: DbInstancia = dbSingleton): void {
  db.update(user).set({ owner }).where(eq(user.id, idUsuario)).run();
}

// Helper solo para tests: crea una instancia Drizzle apuntando a un archivo de prueba, con
// el MISMO shape de schema que el singleton real (schema + authSchema) para que el tipo
// DbInstancia calce sin castear.
export function dbDePrueba(dbPath: string) {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema: { ...schema, ...authSchema } });
}
```

- [ ] **Step 2: Escribir el test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import {
  miembrosLibres,
  miembroLibrePorId,
  reclamarMiembro,
  setOwnerDeUsuario,
  dbDePrueba,
} from './organizacion-repository.ts';

let dbPath: string;

test.beforeEach(() => {
  dbPath = crearDbPrueba();
  const raw = new Database(dbPath);
  raw.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, owner TEXT, admin INTEGER DEFAULT 0);
    INSERT INTO organizacion (id_organizacion, nombre) VALUES (1, 'Onepay');
    INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display)
      VALUES (1, 'Thomas Schumacher', 'Thomas Schumacher');
    INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user)
      VALUES (1, 'Sebastian Acosta Molina', 'Sebastián Acosta', 'user-sebastian');
    INSERT INTO user (id, name, email) VALUES ('user-nuevo', 'Thomas Schumacher', 'thomas@test.com');
  `);
  raw.close();
});

test.afterEach(() => {
  borrarDbPrueba(dbPath);
});

test('miembrosLibres devuelve solo los miembros sin id_user', () => {
  const db = dbDePrueba(dbPath);
  const libres = miembrosLibres(1, db);
  assert.deepEqual(libres.map((m) => m.nombreDisplay), ['Thomas Schumacher']);
});

test('miembroLibrePorId no devuelve un miembro ya reclamado', () => {
  const db = dbDePrueba(dbPath);
  const reclamado = miembroLibrePorId(2, db); // id 2 = Sebastian, ya tiene id_user
  assert.equal(reclamado, undefined);
});

test('reclamarMiembro tiene efecto la primera vez y falla la segunda (ya reclamado)', () => {
  const db = dbDePrueba(dbPath);
  const primero = reclamarMiembro(1, 'user-nuevo', db);
  assert.equal(primero, true);

  const segundo = reclamarMiembro(1, 'otro-user', db);
  assert.equal(segundo, false, 'un miembro ya reclamado no se puede reclamar otra vez');
});

test('setOwnerDeUsuario escribe el owner canonico directo en la tabla user', () => {
  const db = dbDePrueba(dbPath);
  setOwnerDeUsuario('user-nuevo', 'Thomas Schumacher', db);

  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT owner FROM user WHERE id = ?`).get('user-nuevo') as any;
  assert.equal(fila.owner, 'Thomas Schumacher');
  raw.close();
});
```

Guardar en `app/db/organizacion-repository.test.ts`.

- [ ] **Step 3: Correr los tests**

Run: `npm test`
Expected: los 4 tests nuevos en verde.

- [ ] **Step 4: Commit**

```bash
git add app/db/organizacion-repository.ts app/db/organizacion-repository.test.ts
git commit -m "feat: repository de organizacion (miembros libres, reclamo atomico)"
```

---

### Task 3: Seed de la organización Onepay (4 miembros, Sebastián ya reclamado)

**Files:**
- Create: `scripts/seed_organizacion.ts`

- [ ] **Step 1: Escribir el script de seed**

```ts
import Database from 'better-sqlite3';

const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

// owner_canonico = valor EXACTO de empresa.owner en isps.db, confirmado por consulta
// directa el 2026-07-06 (ver planning/spec-registro-organizacion.md). Camilo va con
// f minuscula a proposito: asi esta guardado en empresa.owner.
const MIEMBROS = [
  { ownerCanonico: 'Sebastian Acosta Molina', nombreDisplay: 'Sebastián Acosta', emailYaExistente: 'sacostamolin@gmail.com' },
  { ownerCanonico: 'Thomas Schumacher', nombreDisplay: 'Thomas Schumacher', emailYaExistente: null },
  { ownerCanonico: 'Felipe Castro', nombreDisplay: 'Felipe Castro', emailYaExistente: null },
  { ownerCanonico: 'Camilo fonseca', nombreDisplay: 'Camilo Fonseca', emailYaExistente: null },
];

function main() {
  const db = new Database(DB_PATH);
  try {
    db.exec('BEGIN');

    let org = db.prepare(`SELECT id_organizacion FROM organizacion WHERE nombre = ?`).get('Onepay') as
      | { id_organizacion: number }
      | undefined;
    if (!org) {
      const r = db.prepare(`INSERT INTO organizacion (nombre, created_at) VALUES (?, ?)`).run('Onepay', new Date().toISOString());
      org = { id_organizacion: Number(r.lastInsertRowid) };
      console.log('Organizacion Onepay creada, id', org.id_organizacion);
    } else {
      console.log('Organizacion Onepay ya existia, id', org.id_organizacion);
    }

    for (const m of MIEMBROS) {
      const existe = db
        .prepare(`SELECT id_miembro FROM organizacion_miembro WHERE id_organizacion = ? AND owner_canonico = ?`)
        .get(org.id_organizacion, m.ownerCanonico);
      if (existe) {
        console.log(`Miembro ${m.nombreDisplay} ya existia, se deja igual`);
        continue;
      }

      let idUser: string | null = null;
      if (m.emailYaExistente) {
        const u = db.prepare(`SELECT id FROM user WHERE email = ?`).get(m.emailYaExistente) as { id: string } | undefined;
        if (u) idUser = u.id;
      }

      db.prepare(
        `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(org.id_organizacion, m.ownerCanonico, m.nombreDisplay, idUser, new Date().toISOString());
      console.log(`Miembro ${m.nombreDisplay} creado${idUser ? ' (ya reclamado por cuenta existente)' : ' (libre)'}`);
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.close();
  }
}

main();
```

Guardar en `scripts/seed_organizacion.ts`.

- [ ] **Step 2: Correr el seed contra isps.db real**

Run: `node --experimental-strip-types scripts/seed_organizacion.ts`
Expected:
```
Organizacion Onepay creada, id 1
Miembro Sebastián Acosta creado (ya reclamado por cuenta existente)
Miembro Thomas Schumacher creado (libre)
Miembro Felipe Castro creado (libre)
Miembro Camilo Fonseca creado (libre)
```

- [ ] **Step 3: Verificar a mano que Sebastián no aparece como libre**

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db "SELECT nombre_display, id_user FROM organizacion_miembro;"`
Expected: la fila de Sebastián tiene `id_user` distinto de vacío (su id real de `user`); las
otras 3 tienen `id_user` vacío.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed_organizacion.ts
git commit -m "feat: seed de organizacion Onepay con 4 miembros"
```

---

### Task 4: Abrir el registro en la config de Better Auth

**Files:**
- Modify: `app/lib/auth.ts:9-13`

- [ ] **Step 1: Cambiar `disableSignUp` a `false` fijo**

En `app/lib/auth.ts`, reemplazar:

```ts
  emailAndPassword: {
    enabled: true,
    // Alta de usuarios solo por script (V2.3). Sin ALLOW_SIGNUP=1 nadie se registra solo.
    disableSignUp: process.env.ALLOW_SIGNUP !== '1',
  },
```

por:

```ts
  emailAndPassword: {
    enabled: true,
    // V6: registro self-service real via /register (organizacion-repository controla que
    // solo se pueda tomar un nombre libre). Ya no depende de ALLOW_SIGNUP.
    disableSignUp: false,
  },
```

- [ ] **Step 2: Confirmar que el proyecto sigue arrancando**

Run: `npm run build`
Expected: build sin errores de tipos relacionados a `auth.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/auth.ts
git commit -m "feat: habilitar registro self-service en Better Auth"
```

---

### Task 5: Server action de registro (`app/register/actions.ts`)

**Files:**
- Create: `app/register/actions.ts`

- [ ] **Step 1: Escribir el action**

```ts
'use server';

import { z } from 'zod';
import { auth } from '../lib/auth';
import { miembroLibrePorId, reclamarMiembro, setOwnerDeUsuario } from '../db/organizacion-repository';

const registroSchema = z.object({
  idMiembro: z.coerce.number().int().positive(),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
});

export type RegistroResultado = { ok: true } | { ok: false; error: string };

export async function registrarUsuarioAction(input: unknown): Promise<RegistroResultado> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { idMiembro, email, password } = parsed.data;

  const miembro = miembroLibrePorId(idMiembro);
  if (!miembro) {
    return { ok: false, error: 'Ese nombre ya no está disponible. Recarga la página.' };
  }

  let userId: string;
  try {
    const res = await auth.api.signUpEmail({ body: { email, password, name: miembro.nombreDisplay } });
    userId = res.user.id;
  } catch {
    return { ok: false, error: 'No se pudo crear la cuenta (correo ya registrado o clave muy corta).' };
  }

  const reclamado = reclamarMiembro(idMiembro, userId);
  if (!reclamado) {
    // Alguien mas gano la carrera por este nombre justo despues del check de arriba. La
    // cuenta ya existe sin owner: session-user.ts cae al name (cola vacia, no crash).
    return {
      ok: false,
      error: 'Alguien más tomó ese nombre justo antes que tú. Tu cuenta se creó, pide que te asignen el nombre a mano.',
    };
  }

  setOwnerDeUsuario(userId, miembro.ownerCanonico);
  return { ok: true };
}
```

- [ ] **Step 2: Correr el build para chequear tipos**

Run: `npm run build`
Expected: sin errores de tipos en `app/register/actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/register/actions.ts
git commit -m "feat: server action de registro con reclamo atomico de owner"
```

---

### Task 6: Pantalla `/register`

**Files:**
- Create: `app/register/page.tsx`
- Create: `app/register/RegisterForm.tsx`
- Modify: `app/globals.css` (estilos para select y para el label de organización)

- [ ] **Step 1: Página server component (lista los miembros libres)**

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import { miembrosLibres } from '../db/organizacion-repository';
import RegisterForm from './RegisterForm';

// V6: id 1 = Onepay, sembrada por scripts/seed_organizacion.ts. Una sola organizacion por
// ahora (fuera de alcance: multi-organizacion real).
const ID_ORGANIZACION_ONEPAY = 1;

export default async function RegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');

  const miembros = miembrosLibres(ID_ORGANIZACION_ONEPAY);

  return (
    <div className="wrap login-wrap">
      <div className="h-title">Follow-ups OnePay</div>
      <RegisterForm miembros={miembros} />
    </div>
  );
}
```

- [ ] **Step 2: Form cliente**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registrarUsuarioAction } from './actions';

type Miembro = { id: number; nombreDisplay: string };

export default function RegisterForm({ miembros }: { miembros: Miembro[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const resultado = await registrarUsuarioAction({
        idMiembro: form.get('idMiembro'),
        email: form.get('email'),
        password: form.get('password'),
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.push('/login');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (miembros.length === 0) {
    return (
      <div className="login-form">
        <div className="login-error">Ya no hay nombres libres para registrar. Habla con Sebastián.</div>
        <Link href="/login" className="login-link">Ir a iniciar sesión</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <div className="register-org">Organización: Onepay</div>

      <label className="register-label" htmlFor="idMiembro">Quién eres tú</label>
      <select name="idMiembro" id="idMiembro" required defaultValue="">
        <option value="" disabled>Elige tu nombre</option>
        {miembros.map((m) => (
          <option key={m.id} value={m.id}>{m.nombreDisplay}</option>
        ))}
      </select>

      <input name="email" type="email" placeholder="Correo" required />
      <input name="password" type="password" placeholder="Contraseña (mínimo 8 caracteres)" required minLength={8} />
      {error && <div className="login-error">{error}</div>}
      <button className="rep-btn login-btn" disabled={enviando}>
        {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
      <Link href="/login" className="login-link">¿Ya tienes cuenta? Inicia sesión</Link>
    </form>
  );
}
```

- [ ] **Step 3: Agregar CSS para el select, el label y el link**

En `app/globals.css`, después de la línea `.login-btn { margin-left: 0; }` (línea 83):

```css
.login-form select {
  padding: 10px 12px; border: 1px solid var(--line-strong);
  border-radius: 8px; background: var(--surface); font: inherit; color: var(--ink);
}
.register-org { font-size: 13px; color: var(--muted); }
.register-label { font-size: 13px; color: var(--ink-soft); margin-top: 4px; }
.login-link { font-size: 13px; color: var(--ink-soft); text-decoration: underline; margin-top: 4px; }
.login-remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-soft); }
```

- [ ] **Step 4: Levantar el servidor y probar el flujo a mano**

Run: `npm run dev`

En el navegador:
1. Ir a `/register`. Verificar que aparece "Organización: Onepay" y el select con Thomas,
   Felipe y Camilo (Sebastián NO debe aparecer).
2. Elegir "Thomas Schumacher", poner un correo de prueba y contraseña de 8+ caracteres,
   enviar. Verificar que redirige a `/login`.
3. Entrar con ese correo/contraseña. Verificar que la cola que se ve corresponde a los leads
   de Thomas (owner = 'Thomas Schumacher').
4. Volver a `/register`: verificar que "Thomas Schumacher" ya NO aparece en la lista.

- [ ] **Step 5: Commit**

```bash
git add app/register/page.tsx app/register/RegisterForm.tsx app/globals.css
git commit -m "feat: pantalla de registro con organizacion y seleccion de identidad"
```

---

### Task 7: `/login` — link "Crear cuenta" y checkbox "Recordar sesión"

**Files:**
- Modify: `app/login/LoginForm.tsx`

- [ ] **Step 1: Agregar el checkbox y pasar `rememberMe` al sign in**

Reemplazar el contenido de `app/login/LoginForm.tsx` completo:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recordar, setRecordar] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const { error } = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rememberMe: recordar,
      });
      if (error) {
        setError('Correo o password incorrectos');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <input name="email" type="email" placeholder="Correo" required autoFocus />
      <input name="password" type="password" placeholder="Password" required />
      <label className="login-remember">
        <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
        Recordar sesión
      </label>
      {error && <div className="login-error">{error}</div>}
      <button className="rep-btn login-btn" disabled={enviando}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
      <Link href="/register" className="login-link">¿No tienes cuenta? Crear cuenta</Link>
    </form>
  );
}
```

- [ ] **Step 2: Probar a mano**

Run: `npm run dev` (si no sigue corriendo del Task 6)

En el navegador: ir a `/login`, verificar que aparece el checkbox "Recordar sesión" (marcado
por defecto) y el link "¿No tienes cuenta? Crear cuenta" que lleva a `/register`. Destildar
el checkbox, entrar, y confirmar en devtools que la cookie de sesión queda como cookie de
sesión de navegador (no persistente) en vez de con expiración larga.

- [ ] **Step 3: Commit**

```bash
git add app/login/LoginForm.tsx
git commit -m "feat: link a registro y checkbox recordar sesion en /login"
```

---

## Fuera de alcance (recordatorio, viene del spec)

Multi-organización real, invitación/llave de acceso, editar miembros desde UI, recuperar
contraseña, verificación de correo, owners raros de `empresa` (Manuel H., combinados).
