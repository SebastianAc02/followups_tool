# Rediseño de /conectores + refuerzo de la lógica — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking.
> Un agente por tarea, diff pequeño, cada tarea cierra con commit.

**Goal:** Rediseñar la pantalla `/conectores` con el look del pad "Conectores Minimal" y, a la vez, reforzar la
lógica de negocio: los conectores dejan de estar hardcodeados; un admin los agrega desde un catálogo y elige su
modo (personal o admin), y un miembro solo puede conectar su credencial en los personales.

**Architecture:** Separación **política vs secreto**. Una tabla nueva `conector_config` (nivel workspace) guarda
qué conectores están habilitados y en qué modo — eso lo controla el admin y lo puede leer todo el mundo. La tabla
`conector` que ya existe sigue guardando los **secretos** (credenciales cifradas) sin cambios: el `modo` de la
config decide qué fila importa (global `id_usuario=NULL` para admin-mode, fila por usuario para personal-mode). El
catálogo de tipos de conector vive en **código** (`app/conectores/catalogo.ts`) porque cada tipo necesita un
adaptador de código para hablar con el proveedor; solo se listan los que tienen adaptador real: Granola, Notion,
Apollo.

**Tech Stack:** Next.js App Router (RSC + server actions), Drizzle ORM sobre SQLite (`isps.db`), Tailwind v4 +
primitivos propios en `app/ui/*`, `node:test` (corre con `npm test`), migraciones Python idempotentes en `scripts/`.

**Invariantes que NO se rompen:**
- La credencial se cifra antes de tocar disco y **nunca** se devuelve al cliente, ni enmascarada (`estadoConector`
  solo dice "hay credencial: sí/no"). El rediseño no toca el camino de cifrado.
- La autoridad es server-side: un miembro no puede escribir una credencial admin-mode ni agregar/quitar conectores,
  aunque manipule el formulario. La UI oculta, el server action **garantiza**.
- Modo cambiado = credenciales del otro modo quedan **dormidas, no borradas** (reversible).

**Decisiones de diseño ya tomadas (del brainstorm):**
- Catálogo en código + modo/estado en DB.
- El admin escoge el modo **libremente** (personal o admin) al agregar; `modoSugerido` del catálogo es solo el
  default preseleccionado en la UI, no una restricción.
- El flujo "Agregar conector" (drawer con el catálogo de disponibles) entra en este pase.
- Fuentes: se agregan Space Grotesk + Inter vía `next/font` (built-in, sin dependencia npm), scopeadas a esta página.

---

## Estructura de archivos

**Crear:**
- `app/conectores/catalogo.ts` — registro de tipos de conector (código). Fuente de la verdad de qué existe.
- `app/conectores/politica.ts` — decisión pura y testeable de autoridad de guardado (modo + esAdmin → permitido/scope).
- `app/conectores/estado-ui.ts` — mapeos puros: `EstadoConector` → vista (label/sev) y conteo de estados.
- `app/conectores/EstadoResumen.tsx` — fila de resumen con los conteos (server component).
- `app/conectores/ConectorRow.tsx` — una fila de conector: estado + badge de modo + descripción + form/error (server).
- `app/conectores/AgregarConector.tsx` — drawer del catálogo de disponibles, admin-only (client, por el open/close).
- `app/conectores/politica.test.ts`, `app/conectores/estado-ui.test.ts` — tests de las funciones puras.
- `app/db/schema.conectorConfig.test.ts` — test estructural de la tabla nueva.
- `scripts/migrate_conectores_dryrun.py`, `scripts/migrate_conectores_apply.py` — migración idempotente.

**Modificar:**
- `app/db/schema.ts` — agregar la tabla Drizzle `conectorConfig`.
- `app/db/test-helpers.ts` — agregar el `CREATE TABLE conector_config` para las DBs de prueba.
- `app/db/repository.ts` — agregar CRUD de config + `modoConector()`; import de `conectorConfig`.
- `app/db/repository.conectorConfig.test.ts` — **crear** (tests del CRUD de config).
- `app/conectores/actions.ts` — generalizar guardado + agregar/cambiar-modo/quitar (admin-gated).
- `app/conectores/page.tsx` — reescribir: orquesta config + estados + resumen + filas + drawer.
- `package.json` — agregar `app/conectores/*.test.ts` al glob de `npm test`.
- `app/layout.tsx` — cargar Space Grotesk + Inter vía `next/font`, exponer vars en `<html>`.

---

## Task 1: Tabla `conector_config` en el schema Drizzle

**Files:**
- Modify: `app/db/schema.ts` (después del bloque `conector`, ~línea 106)

- [ ] **Step 1: Agregar la tabla al schema**

En `app/db/schema.ts`, justo después del `export const conector = ...` (línea ~106), agregar:

```ts
// Rediseño conectores: política a nivel workspace (qué conectores están habilitados y
// en qué modo). SEPARADA de `conector` (que guarda los secretos): esta tabla la controla
// el admin y la puede leer todo el mundo; nunca guarda credenciales. modo = 'personal'
// (cada quien su credencial) | 'admin' (una global para el equipo). habilitado=0 = dormido
// (quitado por el admin) sin borrar sus credenciales, para poder re-agregar sin perder nada.
export const conectorConfig = sqliteTable('conector_config', {
  proveedor: text('proveedor').primaryKey(),
  modo: text('modo').notNull(),
  habilitado: integer('habilitado').notNull().default(1),
  agregadoPor: text('agregado_por'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
```

- [ ] **Step 2: Reflejar la tabla en la DB de prueba**

En `app/db/test-helpers.ts`, dentro del `sqlite.exec(\`...\`)`, después del bloque `CREATE TABLE conector (...)`
(termina con `UNIQUE(proveedor, id_usuario)\n    );`), agregar:

```sql
    CREATE TABLE conector_config (
      proveedor TEXT PRIMARY KEY,
      modo TEXT NOT NULL,
      habilitado INTEGER NOT NULL DEFAULT 1,
      agregado_por TEXT,
      created_at TEXT,
      updated_at TEXT
    );
```

- [ ] **Step 3: Escribir el test estructural (falla)**

Crear `app/db/schema.conectorConfig.test.ts`:

```ts
// Prueba estructural de la tabla conector_config del rediseño de conectores. No prueba
// logica de negocio (eso llega en repository.conectorConfig.test.ts), solo que la migracion
// promete la tabla con sus columnas. Corre contra la DB de prueba, nunca isps.db real.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();

test('la tabla conector_config existe con sus columnas', () => {
  const raw = new Database(dbPath);
  const cols = raw
    .prepare("PRAGMA table_info(conector_config)")
    .all()
    .map((c: any) => c.name)
    .sort();
  raw.close();
  assert.deepEqual(cols, ['agregado_por', 'created_at', 'habilitado', 'modo', 'proveedor', 'updated_at']);
});

test.after(() => borrarDbPrueba(dbPath));
```

- [ ] **Step 4: Correr el test y verlo fallar**

Run: `npm test 2>&1 | grep -A3 conector_config`
Expected: FAIL — la tabla no existe todavía si el Step 2 no se aplicó, o PASS si ya se agregó el DDL. Si el
Step 2 ya está, este test debe **pasar**; el propósito del step es confirmar que test-helpers refleja la tabla.

- [ ] **Step 5: Correr todo el suite y verlo pasar**

Run: `npm test`
Expected: PASS (incluye el nuevo test y no rompe los existentes).

- [ ] **Step 6: Commit**

```bash
git add app/db/schema.ts app/db/test-helpers.ts app/db/schema.conectorConfig.test.ts
git commit -m "feat(conectores): tabla conector_config (politica de modo/habilitado)"
```

---

## Task 2: Migración idempotente para `isps.db`

**Files:**
- Create: `scripts/migrate_conectores_dryrun.py`
- Create: `scripts/migrate_conectores_apply.py`

Contexto: en este repo las migraciones son scripts Python idempotentes con variante `_dryrun` (no escribe) y
`_apply` (escribe + loguea en `sync_cambios`). Sebastián corre el apply a mano contra `isps.db`. Modelar según
`scripts/migrate_f1b_apply.py`.

- [ ] **Step 1: Escribir el dryrun**

Crear `scripts/migrate_conectores_dryrun.py`:

```python
"""
Migracion conectores DRYRUN: crea la tabla conector_config (politica de modo/habilitado
del rediseño de /conectores). Idempotente: si la tabla ya existe, no hace nada. NO escribe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

existe = cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='conector_config'"
).fetchone()

if existe:
    print("SKIP: conector_config ya existe. Nada que hacer.")
else:
    print("CREARIA tabla conector_config (proveedor PK, modo, habilitado, agregado_por, created_at, updated_at)")

con.rollback()
con.close()
```

- [ ] **Step 2: Correr el dryrun**

Run: `python3 scripts/migrate_conectores_dryrun.py`
Expected: imprime "CREARIA tabla conector_config ..." (o "SKIP" si ya existe). No modifica la DB.

- [ ] **Step 3: Escribir el apply**

Crear `scripts/migrate_conectores_apply.py`:

```python
"""
Migracion conectores APPLY: crea la tabla conector_config. Idempotente. Loguea en
sync_cambios con corrida=migrate-conectores-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-conectores-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


try:
    existe = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='conector_config'"
    ).fetchone()
    if existe:
        log('conector_config', 'skip', 'tabla ya existia')
        estado = 'skip'
    else:
        cur.execute("""
            CREATE TABLE conector_config (
              proveedor TEXT PRIMARY KEY,
              modo TEXT NOT NULL,
              habilitado INTEGER NOT NULL DEFAULT 1,
              agregado_por TEXT,
              created_at TEXT,
              updated_at TEXT
            )
        """)
        log('conector_config', 'create', 'tabla conector_config creada')
        estado = 'creada'

    con.commit()
    print("APLICADO OK. corrida:", corrida, "| conector_config:", estado)
    print("  columnas finales:")
    for c in cur.execute("PRAGMA table_info(conector_config)"):
        print("   ", c)
except Exception as e:
    con.rollback()
    print("ERROR, rollback:", e)
    raise
finally:
    con.close()
```

- [ ] **Step 4: NO correr el apply automáticamente**

El apply toca `isps.db` (fuente de la verdad). Dejar que Sebastián lo corra:
`python3 scripts/migrate_conectores_apply.py`. Anotarlo en el handoff, no ejecutarlo dentro de la tarea.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate_conectores_dryrun.py scripts/migrate_conectores_apply.py
git commit -m "feat(conectores): migracion idempotente de conector_config"
```

---

## Task 3: CRUD de config + `modoConector()` en el Repository

**Files:**
- Modify: `app/db/repository.ts` (import de `conectorConfig` en el bloque de imports de schema ~línea 28; funciones nuevas cerca de las de conector, ~línea 505)
- Test: `app/db/repository.conectorConfig.test.ts`

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `app/db/repository.conectorConfig.test.ts`:

```ts
// Pruebas del CRUD de conector_config (rediseño de conectores). Verifica agregar/listar/
// cambiar-modo/quitar y que "quitar" deja la fila dormida (habilitado=0), no la borra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 3).toString('base64');

const {
  agregarConfigConector,
  listarConfigConectores,
  actualizarModoConector,
  quitarConfigConector,
  modoConector,
} = await import('./repository.ts');

test('agregar inserta un conector habilitado y listar lo devuelve', () => {
  agregarConfigConector('notion', 'admin', 'user-seb');
  const lista = listarConfigConectores();
  assert.deepEqual(lista, [{ proveedor: 'notion', modo: 'admin', habilitado: true }]);
});

test('agregar dos veces el mismo proveedor no duplica, actualiza el modo', () => {
  agregarConfigConector('granola', 'admin', 'user-seb');
  agregarConfigConector('granola', 'personal', 'user-seb');
  const granola = listarConfigConectores().find((c) => c.proveedor === 'granola');
  assert.equal(granola?.modo, 'personal');
});

test('actualizarModoConector cambia el modo', () => {
  agregarConfigConector('apollo', 'personal', 'user-seb');
  actualizarModoConector('apollo', 'admin');
  assert.equal(modoConector('apollo'), 'admin');
});

test('quitar deja la fila dormida (no aparece en listar) pero no la borra', () => {
  agregarConfigConector('apollo', 'admin', 'user-seb');
  quitarConfigConector('apollo');
  assert.equal(listarConfigConectores().find((c) => c.proveedor === 'apollo'), undefined);
  // re-agregar la re-habilita sin error (la fila seguia ahi)
  agregarConfigConector('apollo', 'personal', 'user-seb');
  assert.equal(modoConector('apollo'), 'personal');
});

test('modoConector devuelve null si el proveedor no esta habilitado', () => {
  assert.equal(modoConector('no-existe'), null);
});

test.after(() => borrarDbPrueba(dbPath));
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npm test 2>&1 | grep -A3 conectorConfig`
Expected: FAIL — `agregarConfigConector is not a function` (aún no existe).

- [ ] **Step 3: Agregar el import de `conectorConfig`**

En `app/db/repository.ts`, en el bloque que importa las tablas del schema (donde está `conector,` ~línea 28),
agregar `conectorConfig,` a la lista de imports.

- [ ] **Step 4: Escribir las funciones**

En `app/db/repository.ts`, después de `leerCredencialConector` (~línea 505), agregar:

```ts
// Rediseño conectores: CRUD de la POLITICA (conector_config), separado de los secretos.
// El modo aqui decide, server-side, si una credencial es global (admin) o por usuario
// (personal). listar solo devuelve habilitados; quitar deja la fila dormida (habilitado=0)
// para no perder credenciales asociadas: re-agregar la revive.
export type ConfigConector = { proveedor: string; modo: 'personal' | 'admin'; habilitado: boolean };

export function listarConfigConectores(): ConfigConector[] {
  return db
    .select({ proveedor: conectorConfig.proveedor, modo: conectorConfig.modo, habilitado: conectorConfig.habilitado })
    .from(conectorConfig)
    .where(eq(conectorConfig.habilitado, 1))
    .all()
    .map((f) => ({ proveedor: f.proveedor, modo: f.modo as 'personal' | 'admin', habilitado: Boolean(f.habilitado) }));
}

export function agregarConfigConector(proveedor: string, modo: 'personal' | 'admin', agregadoPor: string) {
  const ahora = new Date().toISOString();
  const existente = db
    .select({ proveedor: conectorConfig.proveedor })
    .from(conectorConfig)
    .where(eq(conectorConfig.proveedor, proveedor))
    .get();
  if (existente) {
    db.update(conectorConfig).set({ modo, habilitado: 1, updatedAt: ahora }).where(eq(conectorConfig.proveedor, proveedor)).run();
  } else {
    db.insert(conectorConfig).values({ proveedor, modo, habilitado: 1, agregadoPor, createdAt: ahora, updatedAt: ahora }).run();
  }
}

export function actualizarModoConector(proveedor: string, modo: 'personal' | 'admin') {
  db.update(conectorConfig).set({ modo, updatedAt: new Date().toISOString() }).where(eq(conectorConfig.proveedor, proveedor)).run();
}

export function quitarConfigConector(proveedor: string) {
  db.update(conectorConfig).set({ habilitado: 0, updatedAt: new Date().toISOString() }).where(eq(conectorConfig.proveedor, proveedor)).run();
}

export function modoConector(proveedor: string): 'personal' | 'admin' | null {
  const f = db
    .select({ modo: conectorConfig.modo })
    .from(conectorConfig)
    .where(and(eq(conectorConfig.proveedor, proveedor), eq(conectorConfig.habilitado, 1)))
    .get();
  return (f?.modo as 'personal' | 'admin' | undefined) ?? null;
}
```

Nota: `eq` y `and` ya están importados en `repository.ts` (los usa `filtroConector`). No re-importar.

- [ ] **Step 5: Correr los tests y verlos pasar**

Run: `npm test 2>&1 | grep -A3 conectorConfig`
Expected: PASS (los 5 tests).

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.conectorConfig.test.ts
git commit -m "feat(conectores): CRUD de conector_config + modoConector en repository"
```

---

## Task 4: Catálogo de conectores (registro en código)

**Files:**
- Create: `app/conectores/catalogo.ts`

- [ ] **Step 1: Escribir el catálogo**

Crear `app/conectores/catalogo.ts`:

```ts
// Catalogo de tipos de conector: fuente de la verdad de QUE conectores existen. Vive en
// codigo (no en DB) porque cada tipo necesita un adaptador de codigo real para hablar con
// el proveedor; un catalogo puramente-DB seria mentira (no puedes conectar a algo sin
// adaptador). Solo se listan proveedores con adaptador en app/adapters/: granola, notion,
// apollo. `modoSugerido` es solo el default preseleccionado en la UI de "Agregar"; el admin
// puede escoger cualquier modo libremente.
export type ModoConector = 'personal' | 'admin';

export type ConectorCatalogo = {
  id: string; // = conector.proveedor y = nombre del adaptador
  nombre: string;
  descripcion: string;
  modoSugerido: ModoConector;
};

export const CATALOGO_CONECTORES: ConectorCatalogo[] = [
  {
    id: 'granola',
    nombre: 'Granola',
    descripcion: 'Transcripciones de tus llamadas. Cada quien conecta su propia cuenta.',
    modoSugerido: 'personal',
  },
  {
    id: 'notion',
    nombre: 'Notion',
    descripcion: 'El CRM compartido. Un solo token para todo el equipo.',
    modoSugerido: 'admin',
  },
  {
    id: 'apollo',
    nombre: 'Apollo',
    descripcion: 'Enriquecimiento de prospectos con tu API key.',
    modoSugerido: 'personal',
  },
];

export function conectorDelCatalogo(id: string): ConectorCatalogo | undefined {
  return CATALOGO_CONECTORES.find((c) => c.id === id);
}
```

- [ ] **Step 2: Verificar que compila (sin test propio: es data pura)**

Run: `npx tsc --noEmit 2>&1 | grep catalogo || echo "OK sin errores de tipo en catalogo"`
Expected: "OK sin errores de tipo en catalogo".

- [ ] **Step 3: Commit**

```bash
git add app/conectores/catalogo.ts
git commit -m "feat(conectores): catalogo de tipos en codigo (granola, notion, apollo)"
```

---

## Task 5: Política de autoridad (función pura testeable)

**Files:**
- Create: `app/conectores/politica.ts`
- Create: `app/conectores/politica.test.ts`
- Modify: `package.json` (glob de `test`)

Contexto: el glob de `npm test` hoy NO incluye `app/conectores/`. La decisión de autoridad (quién puede guardar
qué) es dominio y debe testearse sin DB. La extraemos a una función pura y agregamos el glob.

- [ ] **Step 1: Agregar el glob de conectores al test runner**

En `package.json`, en el script `"test"`, agregar ` app/conectores/*.test.ts` al final de la lista de globs
(antes de la comilla de cierre). Queda: `... app/cola/*.test.ts app/conectores/*.test.ts"`.

- [ ] **Step 2: Escribir el test (falla)**

Crear `app/conectores/politica.test.ts`:

```ts
// Autoridad de guardado de credencial, pura y sin DB. admin-mode: solo admin, credencial
// global. personal-mode: cualquier miembro, credencial propia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirGuardado } from './politica.ts';

test('admin-mode + admin: permitido, scope global', () => {
  assert.deepEqual(decidirGuardado('admin', true), { permitido: true, scope: 'global' });
});

test('admin-mode + miembro: NO permitido', () => {
  assert.deepEqual(decidirGuardado('admin', false), { permitido: false });
});

test('personal-mode + miembro: permitido, scope personal', () => {
  assert.deepEqual(decidirGuardado('personal', false), { permitido: true, scope: 'personal' });
});

test('personal-mode + admin: permitido, scope personal (el admin tambien tiene su propia cuenta)', () => {
  assert.deepEqual(decidirGuardado('personal', true), { permitido: true, scope: 'personal' });
});
```

- [ ] **Step 3: Correr el test y verlo fallar**

Run: `npm test 2>&1 | grep -A3 politica`
Expected: FAIL — `Cannot find module './politica.ts'`.

- [ ] **Step 4: Escribir la política**

Crear `app/conectores/politica.ts`:

```ts
import type { ModoConector } from './catalogo.ts';

// Decision de autoridad de escritura de credencial. Pura: el modo viene de la config
// (server-side, no del formulario) y esAdmin de la sesion. Es la garantia real de que un
// miembro no escribe una credencial de equipo aunque manipule el form.
export type DecisionGuardado = { permitido: false } | { permitido: true; scope: 'global' | 'personal' };

export function decidirGuardado(modo: ModoConector, esAdmin: boolean): DecisionGuardado {
  if (modo === 'admin') return esAdmin ? { permitido: true, scope: 'global' } : { permitido: false };
  return { permitido: true, scope: 'personal' };
}
```

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `npm test 2>&1 | grep -A3 politica`
Expected: PASS (los 4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/conectores/politica.ts app/conectores/politica.test.ts package.json
git commit -m "feat(conectores): politica pura de autoridad de guardado + glob de test"
```

---

## Task 6: Server actions generalizados (admin-gated)

**Files:**
- Modify: `app/conectores/actions.ts` (reescribir completo)

- [ ] **Step 1: Reescribir las actions**

Reemplazar todo el contenido de `app/conectores/actions.ts` por:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  guardarCredencialConector,
  agregarConfigConector,
  actualizarModoConector,
  quitarConfigConector,
  modoConector,
} from "../db/repository";
import { requireSession } from "../lib/session";
import { conectorDelCatalogo, type ModoConector } from "./catalogo.ts";
import { decidirGuardado } from "./politica.ts";

function modoValido(v: string): v is ModoConector {
  return v === "personal" || v === "admin";
}

// Guarda la credencial de un conector. El modo (personal/admin) lo decide la config
// server-side, nunca el formulario. La autoridad la resuelve decidirGuardado: personal =
// fila del usuario; admin = fila global, solo admin.
export async function guardarCredencialAction(formData: FormData) {
  const sesion = await requireSession();
  const proveedor = String(formData.get("proveedor") ?? "").trim();
  const credencial = String(formData.get("credencial") ?? "").trim();
  if (!credencial || !conectorDelCatalogo(proveedor)) return;

  const modo = modoConector(proveedor);
  if (!modo) return; // no habilitado

  const decision = decidirGuardado(modo, sesion.admin);
  if (!decision.permitido) return;

  if (decision.scope === "global") {
    guardarCredencialConector(proveedor, credencial);
  } else {
    guardarCredencialConector(proveedor, credencial, sesion.id);
  }
  revalidatePath("/conectores");
}

// Agrega un conector desde el catalogo. Solo admin. El modo lo escoge el admin libremente.
export async function agregarConectorAction(formData: FormData) {
  const sesion = await requireSession();
  if (!sesion.admin) return;

  const proveedor = String(formData.get("proveedor") ?? "").trim();
  const modo = String(formData.get("modo") ?? "").trim();
  if (!conectorDelCatalogo(proveedor) || !modoValido(modo)) return;

  agregarConfigConector(proveedor, modo, sesion.id);
  revalidatePath("/conectores");
}

// Cambia el modo de un conector ya agregado. Solo admin. Las credenciales del otro modo
// quedan dormidas, no se borran.
export async function cambiarModoAction(formData: FormData) {
  const sesion = await requireSession();
  if (!sesion.admin) return;

  const proveedor = String(formData.get("proveedor") ?? "").trim();
  const modo = String(formData.get("modo") ?? "").trim();
  if (!conectorDelCatalogo(proveedor) || !modoValido(modo)) return;

  actualizarModoConector(proveedor, modo);
  revalidatePath("/conectores");
}

// Quita (duerme) un conector. Solo admin. No borra credenciales: re-agregar lo revive.
export async function quitarConectorAction(formData: FormData) {
  const sesion = await requireSession();
  if (!sesion.admin) return;

  const proveedor = String(formData.get("proveedor") ?? "").trim();
  if (!conectorDelCatalogo(proveedor)) return;

  quitarConfigConector(proveedor);
  revalidatePath("/conectores");
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -E "conectores/actions" || echo "OK actions sin errores de tipo"`
Expected: "OK actions sin errores de tipo".

- [ ] **Step 3: Commit**

```bash
git add app/conectores/actions.ts
git commit -m "feat(conectores): actions generalizados (guardar/agregar/cambiar-modo/quitar) admin-gated"
```

---

## Task 7: Helpers de vista de estado (puros) + componentes de UI

**Files:**
- Create: `app/conectores/estado-ui.ts`
- Create: `app/conectores/estado-ui.test.ts`
- Create: `app/conectores/EstadoResumen.tsx`
- Create: `app/conectores/ConectorRow.tsx`

- [ ] **Step 1: Escribir el test de los helpers (falla)**

Crear `app/conectores/estado-ui.test.ts`:

```ts
// Mapeos puros de EstadoConector -> vista (label + severidad del punto) y conteo agregado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vistaEstado, contarEstados } from './estado-ui.ts';
import type { EstadoConector } from '../db/repository.ts';

const base: EstadoConector = { tieneCredencial: true, estado: 'activo', ultimaCorrida: null, ultimoResultado: null };

test('sin credencial -> Sin configurar / faint', () => {
  assert.deepEqual(vistaEstado({ ...base, tieneCredencial: false }), { label: 'Sin configurar', sev: 'faint' });
});

test('ultimoResultado error -> Caido / overdue', () => {
  assert.deepEqual(vistaEstado({ ...base, ultimoResultado: 'error 401' }), { label: 'Caído', sev: 'overdue' });
});

test('ultimoResultado ok -> Vivo / done', () => {
  assert.deepEqual(vistaEstado({ ...base, ultimoResultado: 'ok' }), { label: 'Vivo', sev: 'done' });
});

test('con credencial sin corridas -> Configurado / today', () => {
  assert.deepEqual(vistaEstado(base), { label: 'Configurado', sev: 'today' });
});

test('contarEstados agrega por categoria', () => {
  const vistas = [
    { label: 'Vivo', sev: 'done' as const },
    { label: 'Caído', sev: 'overdue' as const },
    { label: 'Configurado', sev: 'today' as const },
    { label: 'Sin configurar', sev: 'faint' as const },
    { label: 'Vivo', sev: 'done' as const },
  ];
  assert.deepEqual(contarEstados(vistas), { vivo: 2, caido: 1, espera: 1, sinConfigurar: 1 });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test 2>&1 | grep -A3 estado-ui`
Expected: FAIL — `Cannot find module './estado-ui.ts'`.

- [ ] **Step 3: Escribir los helpers**

Crear `app/conectores/estado-ui.ts`:

```ts
import type { EstadoConector } from '../db/repository.ts';

// sev calca las 4 severidades del primitivo Dot (done=verde, overdue=rojo, today=ambar,
// faint=gris). El label es el texto grande de la columna de estado del pad de referencia.
export type SevEstado = 'done' | 'overdue' | 'today' | 'faint';
export type VistaEstado = { label: string; sev: SevEstado };

export function vistaEstado(e: EstadoConector): VistaEstado {
  if (!e.tieneCredencial) return { label: 'Sin configurar', sev: 'faint' };
  if (e.ultimoResultado?.startsWith('error')) return { label: 'Caído', sev: 'overdue' };
  if (e.ultimoResultado === 'ok') return { label: 'Vivo', sev: 'done' };
  return { label: 'Configurado', sev: 'today' };
}

export type ResumenEstados = { vivo: number; caido: number; espera: number; sinConfigurar: number };

export function contarEstados(vistas: Pick<VistaEstado, 'sev'>[]): ResumenEstados {
  const r: ResumenEstados = { vivo: 0, caido: 0, espera: 0, sinConfigurar: 0 };
  for (const v of vistas) {
    if (v.sev === 'done') r.vivo++;
    else if (v.sev === 'overdue') r.caido++;
    else if (v.sev === 'today') r.espera++;
    else r.sinConfigurar++;
  }
  return r;
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npm test 2>&1 | grep -A3 estado-ui`
Expected: PASS (5 tests).

- [ ] **Step 5: Escribir `EstadoResumen.tsx`**

Crear `app/conectores/EstadoResumen.tsx`:

```tsx
import type { ResumenEstados } from "./estado-ui.ts";

// Fila de resumen del pad: "N vivo · N en espera · N caido · N sin configurar". El numero
// va en color de la severidad, el label en muted.
export function EstadoResumen({ r }: { r: ResumenEstados }) {
  const items: { n: number; label: string; color: string }[] = [
    { n: r.vivo, label: "vivo", color: "text-done" },
    { n: r.espera, label: "en espera", color: "text-today" },
    { n: r.caido, label: "caído", color: "text-overdue" },
    { n: r.sinConfigurar, label: "sin configurar", color: "text-muted" },
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-5 border-b border-line pb-5">
      {items.map((it) => (
        <span key={it.label} className="text-sm text-muted">
          <span className={`font-semibold ${it.color}`}>{it.n}</span> {it.label}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Escribir `ConectorRow.tsx`**

Crear `app/conectores/ConectorRow.tsx`:

```tsx
import { Dot } from "../ui/Dot";
import { Pill } from "../ui/Pill";
import { Button } from "../ui/Button";
import type { EstadoConector } from "../db/repository";
import type { ConectorCatalogo, ModoConector } from "./catalogo.ts";
import { vistaEstado } from "./estado-ui.ts";
import { guardarCredencialAction, cambiarModoAction, quitarConectorAction } from "./actions";

// Una fila de conector: columna izquierda de estado (punto + label + timestamp), columna
// derecha con nombre + badge de modo + descripcion + formulario/estado/error. La autoridad
// ya la garantiza el server action; aca solo mostramos lo que corresponde al rol.
export function ConectorRow({
  cat,
  estado,
  modo,
  esAdmin,
}: {
  cat: ConectorCatalogo;
  estado: EstadoConector;
  modo: ModoConector;
  esAdmin: boolean;
}) {
  const v = vistaEstado(estado);
  const color =
    v.sev === "done" ? "text-done" : v.sev === "overdue" ? "text-overdue" : v.sev === "today" ? "text-today" : "text-faint";
  const badge = modo === "personal" ? "Personal" : "Equipo";
  const puedeEditar = modo === "personal" || esAdmin;
  const hayError = estado.ultimoResultado && estado.ultimoResultado.startsWith("error");

  return (
    <div className="flex flex-col gap-8 border-b border-line py-9 sm:flex-row">
      {/* Columna de estado */}
      <div className="w-full flex-none sm:w-40">
        <div className="mb-2 flex items-center gap-2.5">
          <Dot sev={v.sev} />
          <span className={`text-lg font-semibold tracking-tight ${color}`}>{v.label}</span>
        </div>
        {estado.ultimaCorrida && (
          <p className="pl-5 font-[family-name:var(--ff-mono)] text-xs text-muted">
            {estado.ultimaCorrida.slice(0, 16).replace("T", " ")}
          </p>
        )}
      </div>

      {/* Columna principal */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-base font-semibold text-ink">{cat.nombre}</span>
          <Pill tone="cold">{badge}</Pill>
        </div>
        <p className="mb-3 max-w-sm text-sm leading-relaxed text-muted">{cat.descripcion}</p>

        {hayError && (
          <div className="mb-4 max-w-sm rounded-r-md border-l-2 border-overdue bg-overdue-bg px-3 py-2.5 font-[family-name:var(--ff-mono)] text-xs leading-relaxed text-overdue">
            {estado.ultimoResultado}
          </div>
        )}

        {puedeEditar ? (
          <form action={guardarCredencialAction} className="flex max-w-sm items-center gap-2">
            <input type="hidden" name="proveedor" value={cat.id} />
            <input
              name="credencial"
              type="password"
              autoComplete="off"
              placeholder={estado.tieneCredencial ? "Reemplazar credencial" : "Pega tu credencial"}
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 font-[family-name:var(--ff-mono)] text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit">{estado.tieneCredencial ? "Reemplazar" : "Conectar"}</Button>
          </form>
        ) : (
          <p className="max-w-sm rounded-lg border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
            Solo un admin puede configurar esta conexión. Si algo no llega, avísale a tu admin.
          </p>
        )}

        {/* Controles de admin: cambiar modo + quitar */}
        {esAdmin && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={cambiarModoAction} className="flex items-center gap-2">
              <input type="hidden" name="proveedor" value={cat.id} />
              <select
                name="modo"
                defaultValue={modo}
                className="rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="personal">Personal</option>
                <option value="admin">Equipo</option>
              </select>
              <Button type="submit" variant="pill">
                Guardar modo
              </Button>
            </form>
            <form action={quitarConectorAction}>
              <input type="hidden" name="proveedor" value={cat.id} />
              <Button type="submit" variant="pill" className="text-muted">
                Quitar
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
```

Nota: `Pill` solo tiene tonos `hot|warm|cold`; el badge de modo usa `tone="cold"` (shell neutro) y se distingue
por el texto (Personal/Equipo), fiel a que el pad tampoco cambia el fondo del pill. Si en la revisión visual se
quiere el violeta del pad para "Personal", eso es un ajuste de `pill.variants.ts` fuera de este pase.

- [ ] **Step 7: Correr el suite completo**

Run: `npm test`
Expected: PASS (nada roto; los `.tsx` no tienen test propio, se verifican en el runtime en Task 8).

- [ ] **Step 8: Commit**

```bash
git add app/conectores/estado-ui.ts app/conectores/estado-ui.test.ts app/conectores/EstadoResumen.tsx app/conectores/ConectorRow.tsx
git commit -m "feat(conectores): helpers de estado (puros) + EstadoResumen + ConectorRow"
```

---

## Task 8: Drawer "Agregar conector", página nueva, fuentes y verificación en el navegador

**Files:**
- Create: `app/conectores/AgregarConector.tsx`
- Modify: `app/conectores/page.tsx` (reescribir)
- Modify: `app/layout.tsx` (fuentes)

- [ ] **Step 1: Escribir el drawer `AgregarConector.tsx`**

Crear `app/conectores/AgregarConector.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import type { ConectorCatalogo } from "./catalogo.ts";
import { agregarConectorAction } from "./actions";

// Drawer admin-only: lista los conectores del catalogo que aun NO estan agregados. Por cada
// uno, un mini form con el modo (default = modoSugerido) que dispara agregarConectorAction.
// El open/close es estado de cliente; el submit es un server action.
export function AgregarConector({ disponibles }: { disponibles: ConectorCatalogo[] }) {
  const [abierto, setAbierto] = useState(false);

  if (disponibles.length === 0) return null;

  return (
    <div className="mt-2">
      <Button type="button" onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Cerrar" : "Agregar conector"}
      </Button>

      {abierto && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          {disponibles.map((cat) => (
            <form
              key={cat.id}
              action={agregarConectorAction}
              className="flex flex-col gap-3 border-b border-line pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <input type="hidden" name="proveedor" value={cat.id} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{cat.nombre}</div>
                <div className="max-w-md text-xs text-muted">{cat.descripcion}</div>
              </div>
              <div className="flex flex-none items-center gap-2">
                <select
                  name="modo"
                  defaultValue={cat.modoSugerido}
                  className="rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="personal">Personal</option>
                  <option value="admin">Equipo</option>
                </select>
                <Button type="submit">Agregar</Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `page.tsx`**

Reemplazar todo `app/conectores/page.tsx` por:

```tsx
import Link from "next/link";
import { estadoConector, listarConfigConectores } from "../db/repository";
import { requireSession } from "../lib/session";
import { CATALOGO_CONECTORES, conectorDelCatalogo, type ModoConector } from "./catalogo.ts";
import { vistaEstado, contarEstados } from "./estado-ui.ts";
import { EstadoResumen } from "./EstadoResumen";
import { ConectorRow } from "./ConectorRow";
import { AgregarConector } from "./AgregarConector";

export default async function Conectores() {
  const sesion = await requireSession();
  const config = listarConfigConectores();

  // Cruzar config (DB) con el catalogo (codigo). Ignorar filas cuyo proveedor ya no existe
  // en el catalogo (defensivo). Para admin-mode leemos el estado GLOBAL; para personal, el
  // del usuario en sesion.
  const activos = config
    .map((c) => {
      const cat = conectorDelCatalogo(c.proveedor);
      if (!cat) return null;
      const modo = c.modo as ModoConector;
      const estado = estadoConector(c.proveedor, modo === "personal" ? sesion.id : undefined);
      return { cat, modo, estado };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const resumen = contarEstados(activos.map((a) => vistaEstado(a.estado)));

  const agregados = new Set(activos.map((a) => a.cat.id));
  const disponibles = CATALOGO_CONECTORES.filter((c) => !agregados.has(c.id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 font-[family-name:var(--ff-inter)] md:px-8">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Inicio
      </Link>

      <div className="mb-12 mt-6">
        <p className="mb-4 text-xs uppercase tracking-widest text-muted">Operación</p>
        <h1 className="mb-4 font-[family-name:var(--ff-grotesk)] text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          Conectores
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-muted">
          Las integraciones que alimentan tus follow-ups. Un vistazo basta para saber qué está vivo y qué falta por
          conectar.
        </p>
      </div>

      <EstadoResumen r={resumen} />

      {activos.length === 0 ? (
        <p className="py-9 text-sm text-muted">
          {sesion.admin
            ? "Todavía no hay conectores. Agrega el primero abajo."
            : "Todavía no hay conectores configurados. Tu admin los agrega."}
        </p>
      ) : (
        activos.map((a) => (
          <ConectorRow key={a.cat.id} cat={a.cat} estado={a.estado} modo={a.modo} esAdmin={sesion.admin} />
        ))
      )}

      {sesion.admin && <AgregarConector disponibles={disponibles} />}
    </div>
  );
}
```

- [ ] **Step 3: Agregar las fuentes en `layout.tsx`**

En `app/layout.tsx`:
1. En el import de `next/font/google` (línea 2), agregar `Space_Grotesk, Inter`:
   `import { Geist, Geist_Mono, Newsreader, Archivo_Black, Space_Mono, IBM_Plex_Sans, IBM_Plex_Mono, Space_Grotesk, Inter } from "next/font/google";`
2. Después de la línea de `monoTag` (~línea 15), agregar:

```ts
// Conectores (rediseño): Space Grotesk (titulos) + Inter (cuerpo) del pad "Conectores
// Minimal". Scopeadas via --ff-grotesk / --ff-inter, solo las usa /conectores.
const grotesk = Space_Grotesk({ variable: "--ff-grotesk", subsets: ["latin"], weight: ["500", "600"] });
const inter = Inter({ variable: "--ff-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
```

3. En el `<html className={...}>`, agregar `${grotesk.variable} ${inter.variable}` a la lista de variables.

- [ ] **Step 4: Verificar tipos y suite**

Run: `npx tsc --noEmit 2>&1 | grep conectores || echo "OK tipos conectores"` y luego `npm test`
Expected: "OK tipos conectores" y el suite completo en PASS.

- [ ] **Step 5: Verificar en el navegador (admin)**

Levantar el dev server (`preview_start` con la config del repo) y abrir `/conectores`. Con una sesión admin:
- Se ve el intro (Operación / Conectores), la fila de resumen y las filas de conectores agregados.
- Aparece "Agregar conector"; al abrirlo se ve el catálogo de disponibles con selector de modo.
- Agregar uno (ej. Apollo) → aparece en la lista con su badge de modo.
- Cambiar el modo de una fila y "Quitar" funcionan (la fila desaparece al quitar).

Verificar sin errores en consola (`preview_console_logs`) y capturar screenshot (`preview_screenshot`).

- [ ] **Step 6: Verificar la vista de miembro (autoridad real)**

Con una sesión NO-admin (o forzando `sesion.admin=false` temporalmente para inspección): en un conector admin-mode
se ve el texto "Solo un admin puede configurar esta conexión", NO el formulario, y NO aparece "Agregar conector"
ni los controles de modo/quitar. En un conector personal-mode sí se ve el formulario de credencial.

- [ ] **Step 7: Commit**

```bash
git add app/conectores/AgregarConector.tsx app/conectores/page.tsx app/layout.tsx
git commit -m "feat(conectores): pagina rediseñada + drawer de agregar + fuentes del pad"
```

---

## Self-review (cobertura del spec)

- **Rediseño visual fiel al pad** → Tasks 7-8 (resumen, filas de estado, badges, fuentes Space Grotesk/Inter,
  tokens dark ya existentes).
- **Catálogo en código** → Task 4 (`catalogo.ts`, solo adaptadores reales: granola/notion/apollo).
- **Modo/estado en DB, admin controla** → Tasks 1-3 (`conector_config` + CRUD).
- **Admin escoge modo libremente** → selector personal/admin en el drawer (Task 8) y en cambiar-modo (Task 7); sin
  restricción por `modoSugerido`.
- **Flujo "Agregar" con catálogo de disponibles** → Task 8 (`AgregarConector.tsx`).
- **Miembro solo conecta, no crea** → Task 6 (actions admin-gated) + Task 7/8 (UI condicionada por `sesion.admin`).
- **Personal vs admin mode en credenciales** → Task 5 (`decidirGuardado`) + Task 6 (scope global/personal) +
  Task 8 (page lee estado global o del usuario según modo).
- **Invariante de cifrado intacto** → no se toca `guardarCredencialConector`/`estadoConector`/`leerCredencialConector`.
- **Modo flip = credenciales dormidas** → `actualizarModoConector` solo cambia la política; las filas de `conector`
  no se tocan (Task 3, verificado en el test de "quitar deja dormido").

**Nota de handoff para Sebastián:** la migración `scripts/migrate_conectores_apply.py` (Task 2) debe correrse a mano
contra `isps.db` antes de usar la página en real: `python3 scripts/migrate_conectores_apply.py`. Hasta entonces
`conector_config` no existe en la DB real y la página mostrará "todavía no hay conectores".
```

