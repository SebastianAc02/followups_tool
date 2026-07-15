# Modo prueba (pruebas.db al lado de isps.db) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Un toggle en la UI que manda todo el negocio (`/cola`, `/seguimiento`, `/cadencias`) a `pruebas.db`, sin que `repository.ts` ni las ~50 acciones se enteren, y sin que una escritura pueda escaparse a `isps.db`.

**Architecture:** El corte es identidad SIEMPRE real / negocio conmutable. `app/db/index.ts` abre dos conexiones y exporta `dbReal` (fija) y `db` (Proxy que resuelve la base por request vía `AsyncLocalStorage`, igual que el candado solo-lectura). De los 6 importadores de `db`, cinco son identidad y pasan a `dbReal`; solo `repository.ts` conmuta.

**Tech Stack:** Next.js + TypeScript, Drizzle/better-sqlite3, node:test, AsyncLocalStorage.

**Spec:** `docs/superpowers/specs/2026-07-15-modo-prueba-design.md`

**Orden no negociable:** `esModoPrueba()` lanza si nadie declaró el modo. Por eso las conexiones y los declarantes (Tasks 1-4) van ANTES de activar la conmutación (Task 5). Invertir el orden revienta el repo a mitad de camino.

**Ya hecho (commit 485c471):** `app/lib/modo-prueba.ts` existe con `marcarModoPrueba()` y `esModoPrueba()`. Nadie lo llama todavía, por eso no rompe nada.

---

## ESTADO: Tasks 1-6 EJECUTADAS Y VERDES (2026-07-15)

`npm test` → **825 pass / 0 fail** en la suite + **2/0** en el aislado. `tsc` limpio.

**Corrección importante al plan, descubierta al ejecutar la Task 4:** el throw NO costaba 9
scripts, costaba **~59 archivos de test**. La estimación salió de contar los importadores
*directos* de `db` (6), pero un throw se propaga por el **grafo de llamadas en runtime**:
`repository.ts` importa `db` una vez y los 44 archivos que lo llaman heredan el throw sin importar
nada. Para un cambio estático contar importadores sirve; para un cambio de comportamiento hay que
correr la suite.

**Solución adoptada (decisión de Sebastián):** setup global en `scripts/test-setup.ts`, cargado con
`--import` en el script `test:suite`. Declara modo real una vez por proceso. **Cero archivos de test
tocados** y el throw intacto. El test del throw vive en `app/db/aislado/modo-prueba-throw.test.ts`
(fuera del glob de la suite) porque necesita un proceso sin marca: `enterWith` marca el contexto
raíz para siempre, así que con el setup pasaría por la razón equivocada. Corre con
`npm run test:aislado`, encadenado en `npm test`.

**Otros hallazgos de la ejecución:**
- Con `:memory:` las bases nacen SIN esquema. Los tests viejos no lo notan porque hacen
  `db.insert()` sin `.run()` (arman el query builder y nunca ejecutan). Los tests nuevos que sí
  ejecutan crean la tabla a mano.
- `evolution.test.ts` es flaky (mockea `fetch` global, el runner corre archivos en paralelo). Ajeno
  a este plan, quedó como tarea aparte.

**Falta:** Tasks 7-9 (todas [RUNBOOK], las corre Sebastián).

---

### Task 1: Segunda conexión y `dbReal`

**Por qué:** hoy `app/db/index.ts` abre una sola conexión en el import (singleton de módulo). Necesitamos dos, y un export fijo para la identidad. Esta tarea NO conmuta nada todavía: `db` sigue apuntando a la real. Es un paso deliberadamente inerte para que el repo nunca quede roto.

**Files:**
- Modify: `app/db/index.ts:1-37`
- Modify: `package.json` (el script `test`)
- Test: `app/db/dos-conexiones.test.ts` (crear)

- [x] **Step 1: Escribir el test que falla**

Crear `app/db/dos-conexiones.test.ts`:

```ts
// Las dos conexiones son independientes: una escritura en una NO se ve en la otra.
// Es el invariante que hace posible el modo prueba; si esto falla, todo lo demas miente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dbReal, dbPruebas } from './index.ts';
import { organizacion } from './schema.ts';

test('dbReal y dbPruebas son conexiones distintas y aisladas', () => {
  dbReal.insert(organizacion).values({ nombre: 'solo-en-real' }).run();

  const enReal = dbReal.select().from(organizacion).all();
  const enPruebas = dbPruebas.select().from(organizacion).all();

  assert.equal(enReal.length, 1, 'la real debe tener su fila');
  assert.equal(enPruebas.length, 0, 'la de pruebas NO debe ver lo escrito en la real');
});
```

- [x] **Step 2: Correr el test para verificar que falla**

Run: `ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/dos-conexiones.test.ts`
Expected: FAIL — `dbPruebas` no existe (`SyntaxError: The requested module './index.ts' does not provide an export named 'dbPruebas'`).

- [x] **Step 3: Abrir la segunda conexión**

En `app/db/index.ts`, reemplazar las líneas 7-15 por:

```ts
// isps.db es la fuente de la verdad (un nivel arriba del proyecto).
const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

// pruebas.db vive AL LADO de isps.db. Misma carpeta, mismo esquema, cero filas de
// negocio: en modo prueba es imposible mandarle correo a un ISP real porque no existe
// ninguno. Se crea con `ISPS_DB_PATH=../pruebas.db npm run migrate` (Task 7).
const PRUEBAS_DB_PATH =
  process.env.PRUEBAS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/pruebas.db';

const sqliteReal = new Database(DB_PATH);
sqliteReal.pragma('journal_mode = WAL');

const sqlitePruebas = new Database(PRUEBAS_DB_PATH);
sqlitePruebas.pragma('journal_mode = WAL');

const esquema = { ...schema, ...authSchema };
const drizzleReal = drizzle(sqliteReal, { schema: esquema });
const drizzlePruebas = drizzle(sqlitePruebas, { schema: esquema });

// dbReal: la identidad (auth, membresia, preferencias, panel) NUNCA conmuta. Tu sesion
// es la misma en los dos modos; si conmutara, activar el modo prueba te sacaria a /login.
export const dbReal = drizzleReal;
export const dbPruebas = drizzlePruebas;

const drizzleDb = drizzleReal;
```

El resto del archivo (el Proxy de las líneas 22-35) queda intacto en esta tarea.

- [x] **Step 4: Aislar los tests de la pruebas.db real**

En `package.json`, el script `test` empieza con `ISPS_DB_PATH=:memory:`. Agregar `PRUEBAS_DB_PATH=:memory:` justo después, para que la suite no abra el archivo real:

```
"test": "ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test \"app/db/*.test.ts\" \"app/lib/*.test.ts\" \"app/core/*.test.ts\" \"app/core/**/*.test.ts\" \"app/adapters/*.test.ts\" \"app/adapters/**/*.test.ts\" \"app/worker/*.test.ts\" \"app/campanas/**/*.test.ts\" \"app/cadencias/**/*.test.ts\" \"app/llamada/**/*.test.ts\" \"app/api/**/*.test.ts\" \"app/ui/*.test.ts\" \"app/cola/*.test.ts\" \"app/conectores/*.test.ts\""
```

Nota: dos `new Database(':memory:')` crean dos bases en memoria SEPARADAS. Eso es exactamente lo que el test de arriba necesita.

- [x] **Step 5: Correr el test para verificar que pasa**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, sin regresiones (`# fail 0`).

- [x] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -v "normalizar-fechas-toque"`
Expected: sin salida. (El error de `scripts/normalizar-fechas-toque.ts` con `node:sqlite` es preexistente y ajeno a este plan.)

- [x] **Step 7: Commit**

```bash
git add app/db/index.ts app/db/dos-conexiones.test.ts package.json
git commit -m "feat(modo-prueba): abrir pruebas.db como segunda conexion + export dbReal"
```

---

### Task 2: La identidad pasa a `dbReal`

**Por qué:** `requireSession()` lee la membresía (línea 21) ANTES de marcar el ALS (línea 28). Si `organizacion-repository` conmutara, en la Task 5 el login reventaría en toda request. Los cinco archivos de identidad se anclan a `dbReal` ahora, antes de que el Proxy conmute.

**Files:**
- Modify: `app/lib/auth.ts:3` y `:8`
- Modify: `app/db/organizacion-repository.ts:4`
- Modify: `app/db/preferencias-repository.ts:2`
- Modify: `app/db/panel-tablero-repository.ts:2`
- Modify: `app/adapters/preferencias-db.ts:4`

- [x] **Step 1: Anclar auth**

En `app/lib/auth.ts`, línea 3: `import { db } from '../db/index';` pasa a:

```ts
import { dbReal } from '../db/index';
```

Y la línea 8: `database: drizzleAdapter(db, { provider: 'sqlite' }),` pasa a:

```ts
  // dbReal y no db: tu sesion es la misma en modo prueba y en modo real. Si auth
  // conmutara, activar el modo prueba buscaria tu sesion en pruebas.db (donde no
  // existe) y te sacaria a /login, y loguearte ahi crearia una cuenta duplicada.
  database: drizzleAdapter(dbReal, { provider: 'sqlite' }),
```

- [x] **Step 2: Anclar los otros cuatro**

En los cuatro archivos siguientes, el import `import { db as dbSingleton } from ...` pasa a importar `dbReal as dbSingleton` desde la misma ruta. El resto de cada archivo no cambia (ya usan el alias `dbSingleton`).

- `app/db/organizacion-repository.ts:4` → `import { dbReal as dbSingleton } from './index';`
- `app/db/preferencias-repository.ts:2` → `import { dbReal as dbSingleton } from './index';`
- `app/db/panel-tablero-repository.ts:2` → `import { dbReal as dbSingleton } from './index';`
- `app/adapters/preferencias-db.ts:4` → `import { dbReal as dbSingleton } from '../db/index';`

- [x] **Step 3: Correr la suite**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `# fail 0`.

- [x] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -v "normalizar-fechas-toque"`
Expected: sin salida.

- [x] **Step 5: Commit**

```bash
git add app/lib/auth.ts app/db/organizacion-repository.ts app/db/preferencias-repository.ts app/db/panel-tablero-repository.ts app/adapters/preferencias-db.ts
git commit -m "refactor(modo-prueba): la identidad (auth, membresia, preferencias, panel) se ancla a dbReal"
```

---

### Task 3: Los 9 scripts declaran su modo

**Por qué:** `esModoPrueba()` lanza si nadie declaró el modo. Los scripts no pasan por `requireSession()`, así que en la Task 5 reventarían todos. Declaran ahora, antes de que el throw esté vivo.

**Files (los 9, todos en `scripts/`):**
`demo_fase4.ts`, `aplicar_fusiones_aprobadas.ts`, `dedup_reporte.ts`, `enlazar_page_ids.ts`, `enriquecer_desde_notion.ts`, `lanzar_prueba_multicanal.ts`, `sync_estados_notion.ts`, `verificar_invariantes.ts`, `importar_toques_legacy.ts`

- [x] **Step 1: Agregar la declaración a cada script**

En cada uno de los 9, después del último `import` y antes de cualquier otro código, agregar:

```ts
import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';

// Los scripts no pasan por requireSession(), asi que declaran su modo a mano: sin esto
// el primer acceso a la DB lanza (modo-prueba.ts no tiene default a proposito).
marcarModoPrueba(false);
```

Nota: si el script ya importa algo de `../app/lib/`, agregar el import junto a los otros. La llamada `marcarModoPrueba(false)` va a nivel de módulo, no dentro de una función.

- [x] **Step 2: Declarar también en read-only.test.ts**

`app/lib/read-only.test.ts` importa `db` y lo usa directo (líneas 18-21, 29, 35, 37, 66, 68). Con el throw vivo, revienta. Agregar después de los imports:

```ts
import { marcarModoPrueba } from './modo-prueba.ts';

// Este test es sobre el candado solo-lectura, no sobre el modo prueba: declara real y
// se olvida del tema. Sin esto, el Proxy del db lanza al no saber contra que base va.
marcarModoPrueba(false);
```

- [x] **Step 3: Verificar que ningún script quedó sin declarar**

Run: `for f in scripts/demo_fase4.ts scripts/aplicar_fusiones_aprobadas.ts scripts/dedup_reporte.ts scripts/enlazar_page_ids.ts scripts/enriquecer_desde_notion.ts scripts/lanzar_prueba_multicanal.ts scripts/sync_estados_notion.ts scripts/verificar_invariantes.ts scripts/importar_toques_legacy.ts; do grep -L "marcarModoPrueba" "$f"; done`
Expected: sin salida (todos declaran).

- [x] **Step 4: Correr la suite**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `# fail 0`.

- [x] **Step 5: Commit**

```bash
git add scripts/ app/lib/read-only.test.ts
git commit -m "chore(modo-prueba): los 9 scripts y read-only.test declaran modo real explicito"
```

---

### Task 4: El Proxy conmuta la base

**Por qué:** el corazón del diseño. El Proxy pasa de tener una responsabilidad (candado) a dos (resolver base + candado). Es el único punto donde se decide contra qué base corre una request, y por eso `repository.ts` no necesita ni un `if`.

**Files:**
- Modify: `app/db/index.ts:22-35`
- Test: `app/db/modo-prueba-proxy.test.ts` (crear)

- [x] **Step 1: Escribir el test que falla**

Crear `app/db/modo-prueba-proxy.test.ts`:

```ts
// El invariante que de verdad importa: en modo prueba, isps.db no recibe NI UNA escritura.
import test from 'node:test';
import assert from 'node:assert/strict';
import { db, dbReal, dbPruebas } from './index.ts';
import { organizacion } from './schema.ts';
import { marcarModoPrueba } from '../lib/modo-prueba.ts';
import { marcarSoloLectura } from '../lib/read-only.ts';

test('en modo prueba, db escribe en pruebas.db y NO toca la real', () => {
  marcarSoloLectura(false);
  marcarModoPrueba(true);

  db.insert(organizacion).values({ nombre: 'nacida-en-prueba' }).run();

  const enPruebas = dbPruebas.select().from(organizacion).all();
  const enReal = dbReal.select().from(organizacion).all();

  assert.ok(enPruebas.some((o) => o.nombre === 'nacida-en-prueba'), 'debe estar en pruebas.db');
  assert.ok(!enReal.some((o) => o.nombre === 'nacida-en-prueba'), 'isps.db NO debe recibir la escritura');
  marcarModoPrueba(false);
});

test('sin modo declarado, el Proxy lanza en vez de adivinar la base', async () => {
  // En contexto limpio (sin marca previa): el ALS no tiene valor y el acceso debe reventar.
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.throws(() => db.select().from(organizacion), /sin modo declarado/i);
      resolve();
    }, 0);
  });
});

test('el candado solo-lectura sigue vivo dentro del modo prueba', () => {
  marcarModoPrueba(true);
  marcarSoloLectura(true);
  assert.throws(() => db.insert(organizacion), /solo lectura/i);
  marcarSoloLectura(false);
  marcarModoPrueba(false);
});
```

- [x] **Step 2: Correr el test para verificar que falla**

Run: `npm test 2>&1 | grep -A3 "modo prueba"`
Expected: FAIL — hoy `db` siempre escribe en la real, así que el primer test falla en el assert de `isps.db NO debe recibir la escritura`.

- [x] **Step 3: Hacer que el Proxy resuelva la base**

En `app/db/index.ts`, agregar el import arriba (junto al de `read-only`):

```ts
import { esModoPrueba } from '../lib/modo-prueba';
```

Y reemplazar el bloque del Proxy (líneas 22-35 del original) por:

```ts
// El Proxy hace DOS cosas, y las dos en el mismo punto de choque:
//   1. Resuelve CONTRA QUE BASE corre esta request (esModoPrueba).
//   2. Bloquea las escrituras si la request es de un visitante (esSoloLectura).
// Por eso repository.ts no tiene un solo if de modo prueba: no puede olvidarse de
// chequear porque nunca chequea. Para cuando recibe su db, ya es la correcta.
const METODOS_ESCRITURA = new Set(['insert', 'update', 'delete', 'transaction']);

export const db: typeof drizzleReal = new Proxy(drizzleReal, {
  get(_target, prop) {
    // Reflect.get con `base` como receiver (no el proxy): si un getter de Drizzle leyera
    // `this`, apuntar al proxy lo haria recursar sobre este mismo handler.
    const base = esModoPrueba() ? drizzlePruebas : drizzleReal;
    const valor = Reflect.get(base, prop, base);
    if (typeof prop === 'string' && METODOS_ESCRITURA.has(prop) && typeof valor === 'function') {
      return (...args: unknown[]) => {
        if (esSoloLectura()) throw new ErrorSoloLectura();
        return (valor as (...a: unknown[]) => unknown).apply(base, args);
      };
    }
    return valor;
  },
});
```

Borrar la línea `const drizzleDb = drizzleReal;` de la Task 1: ya no se usa.

- [x] **Step 4: Correr los tests para verificar que pasan**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `# fail 0`. Los 6 de `read-only.test.ts` siguen verdes (el candado no se rompió).

- [x] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -v "normalizar-fechas-toque"`
Expected: sin salida.

- [x] **Step 6: Commit**

```bash
git add app/db/index.ts app/db/modo-prueba-proxy.test.ts
git commit -m "feat(modo-prueba): el Proxy del db resuelve la base por request

Un solo punto de choque decide contra que base corre cada request. repository.ts
(5374 lineas) no cambia ni una linea: no puede saltarse el modo porque nunca lo
consulta."
```

---

### Task 5: Concurrencia — dos requests, dos bases

**Por qué:** el modo prueba se para sobre el mismo `enterWith` que el candado solo-lectura. Ese mecanismo se verificó sano (6/6 el 2026-07-15), pero eso probó el candado, no el modo. Este es el regression test propio: si una request en modo prueba contamina a una normal, la normal escribe en la base equivocada.

**Files:**
- Modify: `app/db/modo-prueba-proxy.test.ts`

- [x] **Step 1: Escribir el test que falla**

Agregar al final de `app/db/modo-prueba-proxy.test.ts`:

```ts
// Gemelo del test de concurrencia de read-only.test.ts, con delays cruzados a proposito:
// la request en prueba (lenta) resuelve DESPUES de que la normal ya cambio el ALS. Si
// hubiera fuga entre contextos, esto es lo que la mostraria.
test('dos requests concurrentes (prueba y normal) escriben cada una en SU base', async () => {
  marcarSoloLectura(false);

  async function simularRequest(enPrueba: boolean, delayMs: number, marca: string) {
    marcarModoPrueba(enPrueba);
    await new Promise((r) => setTimeout(r, delayMs));
    // La escritura DESPUES del await es el criterio real: si el ALS se filtro entre
    // contextos, esta fila aparece en la base equivocada.
    db.insert(organizacion).values({ nombre: marca }).run();
  }

  await Promise.all([
    simularRequest(true, 20, 'concurrente-prueba'),
    simularRequest(false, 5, 'concurrente-real'),
  ]);

  const pruebas = dbPruebas.select().from(organizacion).all().map((o) => o.nombre);
  const reales = dbReal.select().from(organizacion).all().map((o) => o.nombre);

  assert.ok(pruebas.includes('concurrente-prueba'), 'la request de prueba escribe en pruebas.db');
  assert.ok(!pruebas.includes('concurrente-real'), 'la normal NO debe filtrarse a pruebas.db');
  assert.ok(reales.includes('concurrente-real'), 'la request normal escribe en isps.db');
  assert.ok(!reales.includes('concurrente-prueba'), 'la de prueba NO debe filtrarse a isps.db');

  marcarModoPrueba(false);
});
```

No hacen falta imports nuevos: `marcarModoPrueba`, `db`, `dbReal`, `dbPruebas` y `organizacion` ya están importados en el archivo desde la Task 4.

- [x] **Step 2: Correr el test**

Run: `npm test 2>&1 | grep -A5 "concurrentes"`
Expected: PASS. Si FALLA, es la señal real de que `enterWith` filtra y hay que migrar `modo-prueba.ts` y `read-only.ts` a `run()`. No migrar sin ver este test rojo.

- [x] **Step 3: Commit**

```bash
git add app/db/modo-prueba-proxy.test.ts
git commit -m "test(modo-prueba): regression de concurrencia, dos requests dos bases"
```

---

### Task 6: La cookie y `requireSession`

**Por qué:** el modo tiene que sobrevivir entre requests. Cookie de sesión y no fila en la base: muere al cerrar el navegador, así que no se queda pegado sin que te des cuenta (el bug que ya mordió con `BETTER_AUTH_URL` en `.env.local` el 2026-07-14).

**Files:**
- Create: `app/lib/cookie-modo.ts`
- Modify: `app/lib/session.ts:11-31`

- [x] **Step 1: Crear el helper de la cookie**

Crear `app/lib/cookie-modo.ts`:

```ts
import { cookies } from 'next/headers';

// Cookie de SESION (sin maxAge): muere al cerrar el navegador. A proposito -- un modo
// prueba que se queda pegado en silencio es peor que uno que hay que volver a prender.
export const COOKIE_MODO_PRUEBA = 'modo_prueba';

export async function leerCookieModoPrueba(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_MODO_PRUEBA)?.value === '1';
}

export async function escribirCookieModoPrueba(valor: boolean): Promise<void> {
  const store = await cookies();
  if (valor) {
    store.set(COOKIE_MODO_PRUEBA, '1', { httpOnly: true, sameSite: 'lax', path: '/' });
  } else {
    store.delete(COOKIE_MODO_PRUEBA);
  }
}
```

- [x] **Step 2: Cablear en requireSession**

En `app/lib/session.ts`, agregar a los imports:

```ts
import { marcarModoPrueba } from './modo-prueba';
import { leerCookieModoPrueba } from './cookie-modo';
```

Y dentro de `requireSession()`, insertar JUSTO DESPUÉS de `if (!session) redirect('/login');` (línea 13) y ANTES de `const membresia = ...` (línea 21):

```ts
  // El modo se marca ANTES del primer acceso a `db` conmutable. getSession y
  // organizacionDeUsuario leen dbReal (fijo), asi que no dependen de esta marca --
  // pero cualquier query de negocio de esta request si.
  marcarModoPrueba(await leerCookieModoPrueba());
```

- [x] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -v "normalizar-fechas-toque"`
Expected: sin salida.

- [x] **Step 4: Correr la suite**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, `# fail 0`.

- [x] **Step 5: Commit**

```bash
git add app/lib/cookie-modo.ts app/lib/session.ts
git commit -m "feat(modo-prueba): cookie de sesion + marca en requireSession"
```

---

### Task 7: Crear y sembrar `pruebas.db` [RUNBOOK]

**Por qué:** la base tiene que existir con el esquema al día y los 4 contactos reales. Es [RUNBOOK]: crea un archivo nuevo al lado de `isps.db`. Lo corre Sebastián.

**Files:**
- Create: `scripts/seed_pruebas.ts`

> **CORREGIDO 2026-07-15.** El plan original decía crear `pruebas.db` con `npm run migrate`.
> **Está mal y se verificó:** una base creada desde el journal tiene **31 tablas; `isps.db` tiene
> 50**. Faltan 19, incluida `cliente`, que `repository.ts` usa 6 veces. La causa es la de CLAUDE.md:
> `isps.db` se seedeó desde Notion y muchas tablas nunca pasaron por Drizzle, así que el baseline
> `0000` solo modela lo que está en `schema.ts`. Migrar produciría una `pruebas.db` que miente sobre
> el esquema. Se replica el esquema REAL, que además es lo que manda la constitución del repo:
> "NO recrear tablas: reflejar las que hay".

- [x] **Step 1: Crear pruebas.db replicando el esquema real (sin datos)**

Run:
```bash
sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db .schema \
  | grep -v "^CREATE TABLE sqlite_sequence" \
  | sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/pruebas.db
```

(`sqlite_sequence` es interna de SQLite: SQLite la crea sola y rechaza el CREATE explícito con
"object name reserved for internal use".)

Verificar que la réplica es exacta y está vacía:
```bash
PDB=/Users/sebastianacostamolina/01_Documents/06_onepay/pruebas.db
RDB=/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db
for tipo in table index view trigger; do
  echo "$tipo: nueva=$(sqlite3 "$PDB" "SELECT count(*) FROM sqlite_master WHERE type='$tipo';") real=$(sqlite3 "$RDB" "SELECT count(*) FROM sqlite_master WHERE type='$tipo';")"
done
sqlite3 "$PDB" "SELECT (SELECT count(*) FROM empresa), (SELECT count(*) FROM contacto), (SELECT count(*) FROM toque);"
```
Expected: `table: nueva=50 real=50`, `index: 70/70`, `view: 3/3`, `trigger: 4/4`, y `0|0|0`.

> **Deuda que esto NO arregla** (avisada por la sesión paralela, verificada aquí): el journal de
> migraciones está inconsistente. `isps.db` tiene `identidad_decision` e `id_empresa_matriz`
> creadas FUERA del journal (vienen de embudo-real-y-registro Task 12: se agregaron a `schema.ts`
> sin generar migración), producción NO las tiene, y `drizzle/0007_brown_maverick.sql` está
> generada sin correr. Aplicar `0007` sobre `isps.db` reventaría (columna y tabla ya existen). Es
> la misma cicatriz que `scripts/migrate.ts` documenta con `empresa.pbx_forma` el 2026-07-14, y la
> razón de fondo es que CI corre contra `:memory:` (siempre en sync con `schema.ts`) y nunca ve el
> desfase. **Fuera del alcance de este plan** — pero mientras exista, `pruebas.db` DEBE nacer del
> esquema real, no del journal.

- [x] **Step 2: Escribir el seed**

Crear `scripts/seed_pruebas.ts`:

```ts
// Siembra pruebas.db con las empresas ficticias y los 4 contactos reales. Idempotente:
// borra lo que sembro antes (prefijo prueba-) y vuelve a sembrar.
//
// Correr: PRUEBAS_DB_PATH=../pruebas.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/seed_pruebas.ts
import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';
import { dbPruebas } from '../app/db/index.ts';
import { empresa, contacto, lineaWhatsapp } from '../app/db/schema.ts';
import { eq, like } from 'drizzle-orm';

marcarModoPrueba(true);

const EMPRESAS = [
  { id: 'prueba-viajes-andinos', nombre: 'Viajes Andinos', ciudad: 'Bogota' },
  { id: 'prueba-tour-caribe', nombre: 'Tour Caribe', ciudad: 'Medellin' },
  { id: 'prueba-sierra-tours', nombre: 'Sierra Tours', ciudad: 'Cali' },
  { id: 'prueba-ruta-pacifico', nombre: 'Ruta Pacifico', ciudad: 'Cartagena' },
];

const CONTACTOS = [
  { idEmpresa: 'prueba-viajes-andinos', nombre: 'Sebastian', email: 'sacostamolina@outlook.com', telefono: '+12368895214' },
  { idEmpresa: 'prueba-tour-caribe', nombre: 'Isabela', email: 'sdacostam@eafit.edu.co', telefono: '+573215924704' },
  { idEmpresa: 'prueba-sierra-tours', nombre: 'Felipe', email: 'felipe@onepay.la', telefono: '+573112469262' },
  { idEmpresa: 'prueba-ruta-pacifico', nombre: 'Camilo', email: 'sacostamolin@gmail.com', telefono: '+573102186819' },
];

// Teardown de lo sembrado antes (idempotencia).
for (const e of EMPRESAS) {
  dbPruebas.delete(contacto).where(eq(contacto.idEmpresa, e.id)).run();
}
dbPruebas.delete(empresa).where(like(empresa.idEmpresa, 'prueba-%')).run();

for (const e of EMPRESAS) {
  dbPruebas.insert(empresa).values({
    idEmpresa: e.id,
    tipoId: 'nit',
    nombreOficial: e.nombre,
    nombreNormalizado: e.nombre.toLowerCase().replace(/\s+/g, ' ').trim(),
    ciudadPrincipal: e.ciudad,
    esCliente: 0,
    enConversacion: 0,
    estadoComercial: 'lead',
    categoria: 'agencia_viajes',
    organizacionActivaId: 1,
  }).run();
}

for (const c of CONTACTOS) {
  dbPruebas.insert(contacto).values({
    idEmpresa: c.idEmpresa,
    nombre: c.nombre,
    cargo: 'Gerente Comercial',
    email: c.email,
    telefono: c.telefono,
    esPrincipal: 1,
    fuente: 'seed_pruebas',
  }).run();
}

// La linea de WhatsApp NO se aisla (decision del spec): apunta a la MISMA instancia real
// de Evolution. Mandar WhatsApp de verdad es el objetivo de la prueba.
dbPruebas.delete(lineaWhatsapp).run();
dbPruebas.insert(lineaWhatsapp).values({
  numero: '573105182997',
  tipo: 'personal',
  estado: 'activa',
  techoDiario: 25,
  referenciaProveedor: 'prueba',
}).run();

console.log(`Sembradas ${EMPRESAS.length} empresas y ${CONTACTOS.length} contactos en pruebas.db`);
```

Nombres verificados contra `app/db/schema.ts:465-474`: la columna es `referenciaProveedor` (no `referencia`), y `idUsuario` es nullable, así que se omite.

- [x] **Step 3: Correr el seed [RUNBOOK — con Sebastián]**

Run: `PRUEBAS_DB_PATH=/Users/sebastianacostamolina/01_Documents/06_onepay/pruebas.db node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/seed_pruebas.ts`
Expected: `Sembradas 4 empresas y 4 contactos en pruebas.db`

- [x] **Step 4: Verificar el invariante que importa**

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db "SELECT count(*) FROM empresa WHERE id_empresa LIKE 'prueba-%';"`
Expected: `0` — la base real no recibió nada.

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/pruebas.db "SELECT count(*) FROM contacto;"`
Expected: `4`

- [x] **Step 5: Commit**

```bash
git add scripts/seed_pruebas.ts
git commit -m "feat(modo-prueba): seed de pruebas.db con las 4 empresas y contactos reales"
```

---

### Task 8: El toggle y el banner

**Por qué:** sin señal visible, el riesgo se invierte: creerías estar en prueba estando en real. El banner no es decoración, es la mitad de la seguridad del diseño.

**Files:**
- Create: `app/ui/shell/ModoPruebaToggle.tsx`
- Create: `app/ui/shell/modo-prueba-actions.ts`
- Modify: `app/ui/shell/AppShell.tsx` (verificado: es el shell real; `app/layout.tsx` solo monta fuentes y `<body>`)

- [x] **Step 1: La server action**

Crear `app/ui/shell/modo-prueba-actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '../../lib/session';
import { escribirCookieModoPrueba } from '../../lib/cookie-modo';

export async function alternarModoPrueba(valor: boolean): Promise<void> {
  // requireSession y no requireEscritura: cambiar de modo no escribe en ninguna base,
  // solo cambia una cookie. Un visitante puede mirar el modo prueba (sigue solo-lectura
  // por el candado, que actua independiente de la base).
  await requireSession();
  await escribirCookieModoPrueba(valor);
  revalidatePath('/', 'layout');
}
```

- [x] **Step 2: El toggle + banner**

Crear `app/ui/shell/ModoPruebaToggle.tsx`:

```tsx
'use client';

import { alternarModoPrueba } from './modo-prueba-actions';

export function ModoPruebaToggle({ activo }: { activo: boolean }) {
  if (!activo) {
    return (
      <button type="button" onClick={() => alternarModoPrueba(true)} className="text-xs text-muted-foreground hover:text-foreground">
        Modo prueba
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-500/15 px-3 py-1 text-amber-500">
      <span className="text-xs font-medium">MODO PRUEBA — pruebas.db</span>
      <button type="button" onClick={() => alternarModoPrueba(false)} className="text-xs underline">
        Salir
      </button>
    </div>
  );
}
```

Nota de estilo: los colores van como token de `@theme`, no hex crudo (regla del repo). `amber-500` es de Tailwind; si el shell ya define un token de alerta, usar ese.

- [x] **Step 3: Montarlo en el shell**

En `app/ui/shell/AppShell.tsx` (Server Component), agregar los imports:

```tsx
import { leerCookieModoPrueba } from '../../lib/cookie-modo';
import { ModoPruebaToggle } from './ModoPruebaToggle';
```

Dentro del componente, antes del `return`:

```tsx
const enPrueba = await leerCookieModoPrueba();
```

Y en el header del shell, junto a los controles existentes:

```tsx
<ModoPruebaToggle activo={enPrueba} />
```

Si `AppShell` hoy no es `async`, volverlo `async` (es Server Component, no rompe a los hijos).

Ojo con la sesión concurrente: `AppShell.tsx` fue tocado en el split sidebar/IconPanel. Correr `git status app/ui/shell/` antes de editar y aislar el hunk propio si hay cambios ajenos sin commitear.

- [x] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -v "normalizar-fechas-toque"`
Expected: sin salida.

- [x] **Step 5: Commit**

```bash
git add app/ui/ModoPruebaToggle.tsx app/ui/modo-prueba-actions.ts app/ui/AppShell.tsx
git commit -m "feat(modo-prueba): toggle y banner permanente en el shell"
```

---

### Task 9: Verificación end-to-end [RUNBOOK — con Sebastián]

**Por qué:** los tests prueban el mecanismo; esto prueba el producto. El dev server lo corre Sebastián (nunca la IA).

- [ ] **Step 1: Backup de isps.db antes de tocar nada**

La base está en WAL: `cp` NO es seguro (no copia el `-wal`).

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db ".backup '/Users/sebastianacostamolina/01_Documents/06_onepay/isps-backup-modo-prueba.db'"`

- [ ] **Step 2: Contar el estado real ANTES**

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db "SELECT (SELECT count(*) FROM empresa), (SELECT count(*) FROM contacto), (SELECT count(*) FROM toque), (SELECT count(*) FROM campana);"`
Anotar los 4 números. Son el criterio de aceptación del Step 5.

- [ ] **Step 3: Sebastián levanta el server**

Run (Sebastián): `npm run dev`

- [ ] **Step 4: Recorrido manual**

1. Entrar a `/` → verificar que NO hay banner (modo real).
2. Clic en "Modo prueba" → aparece el banner ámbar.
3. Ir a `/seguimiento` y `/cola` → se ven las 4 empresas de prueba, ningún ISP real.
4. Crear una campaña con cadencia de 3 pasos e inscribir a los 4 contactos.
5. Clic en "Salir" → el banner desaparece y `/seguimiento` vuelve a mostrar el pipeline real, SIN la campaña de prueba.

- [ ] **Step 5: Verificar el invariante duro**

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db "SELECT (SELECT count(*) FROM empresa), (SELECT count(*) FROM contacto), (SELECT count(*) FROM toque), (SELECT count(*) FROM campana);"`
Expected: **los 4 números idénticos a los del Step 2.** Cualquier diferencia significa que una escritura se escapó a la real: parar y diagnosticar antes de seguir.

- [ ] **Step 6: Commit del plan cerrado**

```bash
git add docs/superpowers/plans/2026-07-15-modo-prueba.md
git commit -m "docs(modo-prueba): plan ejecutado y verificado end-to-end"
```

---

## Fuera de alcance (no construir)

- Ver prueba y real lado a lado en la misma pantalla.
- Copiar volumen realista de empresas a `pruebas.db`.
- Aislar la línea de WhatsApp o el buzón de Apollo.
- El fast-forward de días y el bloqueo de contactos (son del módulo `/pruebas`, plan aparte: este plan solo entrega la base aislada y el toggle).
