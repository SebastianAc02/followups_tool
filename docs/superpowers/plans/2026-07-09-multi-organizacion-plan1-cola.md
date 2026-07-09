# Multi-organización real — Plan 1 (esquema + cola/dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar aislamiento real por organización a `empresa`/`toque` y filtrar la cola/dashboard (el núcleo de "follow-ups tool") por la organización del usuario logueado, sin tocar segmentos/campañas todavía.

**Architecture:** `empresa` gana `organizacion_activa_id` (un lead lo trabaja una organización a la vez); `toque`/`campana`/`segmento` ganan `id_organizacion` propio; `conector`/`conector_config` ganan `id_organizacion` nullable (esquema listo, sin UI). La sesión (`UsuarioSesion`/`Perfil`) carga `idOrganizacion` server-side; el Repository filtra `colaDelDia`, `registrarToque`, `getCuenta`, `getContextoToque`, `contadoresHoy`, `contarPorEstado`, `resumenHome`, `repartirFollowups`, `actualizarCampoCalificacion` por ese valor. Todo el dato existente migra a la organización "Onepay" (id real = 1), sin cambio de comportamiento visible para los 4 owners actuales.

**Tech Stack:** Next.js server components/actions, Drizzle ORM sobre SQLite (`isps.db`), Python (`sqlite3` stdlib) para el script de migración, `node:test` + `better-sqlite3` para pruebas.

**Spec:** `docs/superpowers/specs/2026-07-09-multi-organizacion-real-design.md`

---

## Contexto para quien ejecute esto

- `isps.db` vive en `/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db` (un nivel arriba del repo). Las migraciones son scripts Python idempotentes (dryrun + apply), NO Drizzle Kit — `drizzle.config.ts` es solo para introspección de tipos.
- La organización "Onepay" YA existe en `isps.db` con `id_organizacion = 1` (verificado con `sqlite3 isps.db "SELECT * FROM organizacion"`).
- Los tests de Repository usan `app/db/test-helpers.ts`, que replica a mano el DDL de `isps.db` en una DB SQLite temporal. Ese archivo es la fuente de verdad para lo que los tests ven — si no se actualiza junto con `schema.ts`, los tests nuevos no van a poder sembrar las columnas nuevas.
- `app/db/repository.ts` NO recibe `db` como parámetro (a diferencia de `organizacion-repository.ts`): usa un singleton importado de `./index`, que lee `process.env.ISPS_DB_PATH` al importarse. Por eso todos los tests de `repository.ts` hacen `process.env.ISPS_DB_PATH = dbPath` ANTES de `await import('./repository.ts')` — no se puede usar `import` estático arriba del archivo.
- Corre los tests con: `npm test` (corre todo el suite) o apuntado a un archivo: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.test.ts`.

---

### Task 1: Esquema — columnas de organización en `schema.ts`

**Files:**
- Modify: `app/db/schema.ts:5-30` (tabla `empresa`), `:53-70` (`toque`), `:96-120` (`conector`/`conector_config`), `:197-206` (`segmento`), `:222-249` (`campana`)

- [ ] **Step 1: Agregar `organizacionActivaId` a `empresa`**

En `app/db/schema.ts`, dentro de `export const empresa = sqliteTable('empresa', { ... })`, agregar después de `notionPageId`:

```ts
  notionPageId: text('notion_page_id'),
  // Multi-organización (Parte 1, 2026-07-09): la organización que ACTUALMENTE trabaja
  // este lead. Un lead compartido lo trabaja una organización a la vez (ver spec
  // 2026-07-09-multi-organizacion-real-design.md) -- NO es aislamiento de catálogo,
  // es de a quién pertenece la relación comercial ahora mismo.
  organizacionActivaId: integer('organizacion_activa_id').notNull(),
  createdAt: text('created_at'),
```

(el resto de la tabla queda igual; `organizacionActivaId` se agrega justo antes de `createdAt`).

- [ ] **Step 2: Agregar `idOrganizacion` a `toque`**

En la misma tabla `toque`, agregar después de `fuente`:

```ts
  fuente: text('fuente').notNull(),
  // Multi-organización (Parte 1): de qué organización es este toque. A diferencia de
  // empresa.organizacionActivaId (mutable, "quién tiene la relación ahora"), este campo
  // es inmutable: el toque queda para siempre de la organización que lo registró.
  idOrganizacion: integer('id_organizacion').notNull(),
  createdAt: text('created_at'),
```

- [ ] **Step 3: Agregar `idOrganizacion` a `segmento` y `campana`**

En `segmento`, después de `descripcionNatural`:

```ts
  descripcionNatural: text('descripcion_natural'),
  idOrganizacion: integer('id_organizacion').notNull(),
  createdAt: text('created_at'),
```

En `campana`, después de `owner`:

```ts
  owner: text('owner'),
  idOrganizacion: integer('id_organizacion').notNull(),
  proveedorCampanaId: text('proveedor_campana_id'),
```

- [ ] **Step 4: Agregar `idOrganizacion` nullable a `conector` y `conector_config`**

En `conector`, después de `idUsuario`:

```ts
  idUsuario: text('id_usuario'),
  // Nullable = global (igual que idUsuario). Con valor = credencial propia de esa
  // organización (ej. el Notion de una organización nueva, distinto al de Onepay).
  // Sin UI todavía (Parte 2): el esquema queda listo, ver spec.
  idOrganizacion: integer('id_organizacion'),
  credencialCiphertext: text('credencial_ciphertext'),
```

En `conector_config`, después de `proveedor` (que es la PK):

```ts
  proveedor: text('proveedor').primaryKey(),
  idOrganizacion: integer('id_organizacion'),
  modo: text('modo').notNull(),
```

- [ ] **Step 5: Verificar que el proyecto sigue compilando**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && npx tsc --noEmit`
Expected: errores en `repository.ts`/`organizacion-repository.ts` NO relacionados con esta tabla (columnas nuevas no rompen nada por sí solas, son opcionales de agregar sin uso todavía). Si aparecen errores de tipo en inserts existentes que no pasan `organizacionActivaId`/`idOrganizacion`, es esperado — se resuelven en los tasks siguientes. Anotar cuáles archivos quedan pendientes.

- [ ] **Step 6: Commit**

```bash
git add app/db/schema.ts
git commit -m "feat(schema): agregar id_organizacion/organizacion_activa_id a empresa/toque/segmento/campana/conector"
```

---

### Task 2: Migración real de `isps.db` (dryrun + apply)

**Files:**
- Create: `scripts/migrate_organizacion_datos_dryrun.py`
- Create: `scripts/migrate_organizacion_datos_apply.py`

SQLite aplica el `DEFAULT` de un `ALTER TABLE ADD COLUMN NOT NULL DEFAULT x` a TODAS las filas existentes automáticamente (no hace falta un UPDATE aparte). Se usa `DEFAULT 1` porque el id real de "Onepay" en `isps.db` es 1 (confirmado con `sqlite3 isps.db "SELECT * FROM organizacion"`).

- [ ] **Step 1: Escribir el dryrun**

```python
#!/usr/bin/env python3
"""
Migracion multi-organizacion (Parte 1) DRY RUN: agrega organizacion_activa_id a
empresa, id_organizacion a toque/segmento/campana (NOT NULL DEFAULT 1 = Onepay), e
id_organizacion NULLABLE a conector/conector_config. Solo reporta el plan, no escribe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'empresa': [('organizacion_activa_id', "ALTER TABLE empresa ADD COLUMN organizacion_activa_id INTEGER NOT NULL DEFAULT 1")],
    'toque': [('id_organizacion', "ALTER TABLE toque ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'segmento': [('id_organizacion', "ALTER TABLE segmento ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'campana': [('id_organizacion', "ALTER TABLE campana ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'conector': [('id_organizacion', "ALTER TABLE conector ADD COLUMN id_organizacion INTEGER")],
    'conector_config': [('id_organizacion', "ALTER TABLE conector_config ADD COLUMN id_organizacion INTEGER")],
}


def main():
    con = sqlite3.connect(DB)
    print("=== PLAN DE MIGRACION multi-organizacion Parte 1 (dry run, no escribe) ===")
    onepay = con.execute("SELECT id_organizacion, nombre FROM organizacion WHERE nombre = 'Onepay'").fetchone()
    print(f"  organizacion Onepay: {onepay}")
    if not onepay or onepay[0] != 1:
        print("  ADVERTENCIA: el id de Onepay no es 1, revisar DEFAULT antes de aplicar.")

    for tabla, columnas in COLUMNAS.items():
        existentes = {r[1] for r in con.execute(f"PRAGMA table_info({tabla})")}
        for col, ddl in columnas:
            if col in existentes:
                print(f"  {tabla}.{col:24} ya existe, no haria nada")
            else:
                n = con.execute(f"SELECT count(*) FROM {tabla}").fetchone()[0]
                print(f"  {tabla}.{col:24} ADD COLUMN ({n} filas existentes)")
    con.close()


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Correr el dryrun contra `isps.db` real (es de solo lectura, seguro)**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && python3 scripts/migrate_organizacion_datos_dryrun.py`
Expected: lista las 6 columnas como "ADD COLUMN" con la cuenta real de filas de `empresa`/`toque`/`segmento`/`campana`, y confirma `organizacion Onepay: (1, 'Onepay')`.

- [ ] **Step 3: Escribir el apply**

```python
"""
Migracion multi-organizacion (Parte 1) APPLY: agrega organizacion_activa_id a
empresa, id_organizacion a toque/segmento/campana (NOT NULL DEFAULT 1 = Onepay, backfill
automatico de SQLite sobre las filas existentes), e id_organizacion NULLABLE a
conector/conector_config. Idempotente (PRAGMA table_info antes de cada ALTER). No
destructivo. Log en sync_cambios con corrida=migrate-organizacion-datos-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'empresa': [('organizacion_activa_id', "ALTER TABLE empresa ADD COLUMN organizacion_activa_id INTEGER NOT NULL DEFAULT 1")],
    'toque': [('id_organizacion', "ALTER TABLE toque ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'segmento': [('id_organizacion', "ALTER TABLE segmento ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'campana': [('id_organizacion', "ALTER TABLE campana ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'conector': [('id_organizacion', "ALTER TABLE conector ADD COLUMN id_organizacion INTEGER")],
    'conector_config': [('id_organizacion', "ALTER TABLE conector_config ADD COLUMN id_organizacion INTEGER")],
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-organizacion-datos-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'columnas_creadas': 0, 'columnas_ya_existian': 0}
try:
    onepay = cur.execute("SELECT id_organizacion FROM organizacion WHERE nombre = 'Onepay'").fetchone()
    if not onepay or onepay[0] != 1:
        raise RuntimeError(f"organizacion Onepay no tiene id=1 ({onepay}), abortar: el DEFAULT 1 quedaria mal")

    for tabla, columnas in COLUMNAS.items():
        existentes = {r[1] for r in cur.execute(f"PRAGMA table_info({tabla})")}
        for col, ddl in columnas:
            if col in existentes:
                st['columnas_ya_existian'] += 1
                log(f'{tabla}.{col}', 'skip', 'columna ya existia')
                continue
            cur.execute(ddl)
            st['columnas_creadas'] += 1
            log(f'{tabla}.{col}', 'create', 'ALTER TABLE ADD COLUMN')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    for tabla in COLUMNAS:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({tabla})")]
        print(f"\n  {tabla}: {cols}")
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
```

- [ ] **Step 4: Backup de `isps.db` antes de aplicar**

Run: `cp /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db.bak-pre-multiorg-$(date +%Y%m%d%H%M%S)`
Expected: archivo `.bak-...` creado junto a `isps.db`. `ALTER TABLE ADD COLUMN` es aditivo y de bajo riesgo, pero es la única escritura real a la DB compartida en este plan — vale la pena poder revertir.

- [ ] **Step 5: Aplicar**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && python3 scripts/migrate_organizacion_datos_apply.py`
Expected: `APLICADO OK`, `columnas_creadas: 6`, cada tabla listada con su columna nueva al final.

- [ ] **Step 6: Verificar a mano que ningún owner existente cambió de comportamiento**

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db "SELECT organizacion_activa_id, count(*) FROM empresa GROUP BY organizacion_activa_id;"`
Expected: una sola fila, `1|<total de empresas>` — el 100% quedó en Onepay.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate_organizacion_datos_dryrun.py scripts/migrate_organizacion_datos_apply.py
git commit -m "feat(migracion): aplicar id_organizacion/organizacion_activa_id a isps.db real (todo a Onepay)"
```

---

### Task 3: Actualizar `test-helpers.ts` para que los tests puedan sembrar organización

**Files:**
- Modify: `app/db/test-helpers.ts:19-41` (tabla `empresa`), `:58-75` (`toque`), `:94-120` (`conector`/`conector_config`), `:173-180` (`segmento`), `:190-206` (`campana`)

El `DEFAULT 1` en el DDL de prueba evita que los ~14 archivos de test que insertan en `empresa`/`toque` para funciones AJENAS a este plan (segmentos, campañas, motor de inscripciones) se rompan: siguen sin mencionar organización y siguen funcionando igual que hoy.

- [ ] **Step 1: Agregar las columnas nuevas al DDL de `crearDbPrueba()`**

En `app/db/test-helpers.ts`, dentro del `CREATE TABLE empresa`, agregar antes de `created_at`:

```ts
      notion_page_id TEXT,
      organizacion_activa_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
```

En `CREATE TABLE toque`, agregar antes de `created_at`:

```ts
      fuente TEXT NOT NULL,
      id_organizacion INTEGER NOT NULL DEFAULT 1,
      created_at TEXT
    );
```

En `CREATE TABLE segmento`, agregar antes de `created_at`:

```ts
      descripcion_natural TEXT,
      id_organizacion INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
```

En `CREATE TABLE campana`, agregar antes de `proveedor_campana_id`:

```ts
      owner TEXT,
      id_organizacion INTEGER NOT NULL DEFAULT 1,
      proveedor_campana_id TEXT,
```

En `CREATE TABLE conector`, agregar antes de `credencial_ciphertext`:

```ts
      id_usuario TEXT,
      id_organizacion INTEGER,
      credencial_ciphertext TEXT,
```

En `CREATE TABLE conector_config`, agregar después de `proveedor TEXT PRIMARY KEY,`:

```ts
      proveedor TEXT PRIMARY KEY,
      id_organizacion INTEGER,
      modo TEXT NOT NULL,
```

- [ ] **Step 2: Correr el suite completo para confirmar que nada ajeno se rompió**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && npm test 2>&1 | tail -60`
Expected: todos los tests existentes siguen en verde (el `DEFAULT 1` hace que las columnas nuevas sean invisibles para los tests que no las mencionan).

- [ ] **Step 3: Commit**

```bash
git add app/db/test-helpers.ts
git commit -m "test: agregar id_organizacion/organizacion_activa_id al fixture de test-helpers (default Onepay)"
```

---

### Task 4: `organizacionDeUsuario` expone `idOrganizacion`

**Files:**
- Modify: `app/db/organizacion-repository.ts:25-36`
- Test: `app/db/organizacion-repository.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `app/db/organizacion-repository.test.ts`, agregar (después del test de `reclamarMiembroYSetOwner no toca...`, antes del cierre del archivo):

```ts
test('organizacionDeUsuario incluye idOrganizacion, no solo el nombre', () => {
  const db = dbDePrueba(dbPath);
  const org = organizacionDeUsuario('user-sebastian', db);
  assert.equal(org?.idOrganizacion, 1);
  assert.equal(org?.nombreOrganizacion, 'Onepay');
});
```

Y agregar `organizacionDeUsuario` al import de arriba:

```ts
import {
  miembrosLibres,
  miembroLibrePorId,
  reclamarMiembro,
  setOwnerDeUsuario,
  reclamarMiembroYSetOwner,
  organizacionDeUsuario,
  dbDePrueba,
} from './organizacion-repository.ts';
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/organizacion-repository.test.ts`
Expected: FAIL, `org?.idOrganizacion` es `undefined`.

- [ ] **Step 3: Agregar `idOrganizacion` al select**

En `app/db/organizacion-repository.ts`, modificar `organizacionDeUsuario`:

```ts
export function organizacionDeUsuario(idUser: string, db: DbInstancia = dbSingleton) {
  return db
    .select({
      idOrganizacion: organizacion.idOrganizacion,
      nombreOrganizacion: organizacion.nombre,
      nombreDisplay: organizacionMiembro.nombreDisplay,
      ownerCanonico: organizacionMiembro.ownerCanonico,
    })
    .from(organizacionMiembro)
    .innerJoin(organizacion, eq(organizacion.idOrganizacion, organizacionMiembro.idOrganizacion))
    .where(eq(organizacionMiembro.idUser, idUser))
    .get();
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/organizacion-repository.test.ts`
Expected: PASS, todos los tests del archivo en verde.

- [ ] **Step 5: Commit**

```bash
git add app/db/organizacion-repository.ts app/db/organizacion-repository.test.ts
git commit -m "feat(organizacion): organizacionDeUsuario expone idOrganizacion"
```

---

### Task 5: `idOrganizacion` en la sesión (`UsuarioSesion` + `requireSession`)

**Files:**
- Modify: `app/lib/session-user.ts`
- Modify: `app/lib/session.ts`
- Test: `app/lib/session-user.test.ts` (crear si no existe)

- [ ] **Step 1: Escribir el test que falla**

Crear `app/lib/session-user.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { usuarioDeSesion } from './session-user.ts';

test('usuarioDeSesion incluye idOrganizacion tal cual se lo pasan', () => {
  const sesion = usuarioDeSesion(
    { id: 'u1', email: 'a@b.com', name: 'Ana', owner: 'Ana Owner', admin: false },
    7,
  );
  assert.equal(sesion.idOrganizacion, 7);
});

test('usuarioDeSesion sigue mapeando owner con fallback a name', () => {
  const sesion = usuarioDeSesion(
    { id: 'u1', email: 'a@b.com', name: 'Ana', owner: null, admin: true },
    1,
  );
  assert.equal(sesion.owner, 'Ana');
  assert.equal(sesion.admin, true);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/lib/session-user.test.ts`
Expected: FAIL, `usuarioDeSesion` no acepta un segundo argumento (o `sesion.idOrganizacion` es `undefined`), y falla de tipos.

- [ ] **Step 3: Agregar `idOrganizacion` a `UsuarioSesion` y `usuarioDeSesion`**

En `app/lib/session-user.ts`, reemplazar todo el archivo:

```ts
// Mapeo puro del usuario de Better Auth (+ su organizacion, resuelta aparte por quien
// llama) a lo unico que la app necesita saber de la identidad. El resto del codigo
// (paginas, actions) consume ESTE tipo, nunca el objeto de better-auth: la frontera
// del adaptador queda aqui.
export type UsuarioSesion = { id: string; email: string; owner: string; admin: boolean; idOrganizacion: number };

export function usuarioDeSesion(
  user: {
    id: string;
    email: string;
    name: string;
    owner?: string | null;
    admin?: boolean | null;
  },
  idOrganizacion: number,
): UsuarioSesion {
  return {
    id: user.id,
    email: user.email,
    // owner mapea a empresa.owner (nombres, no emails; B1.c en plan-claude-v2.md).
    // Fallback al name para un usuario nuevo sin mapear: ve una cola vacia, no la de otro.
    owner: user.owner ?? user.name,
    admin: Boolean(user.admin),
    idOrganizacion,
  };
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/lib/session-user.test.ts`
Expected: PASS.

- [ ] **Step 5: `requireSession()` resuelve `idOrganizacion` desde `organizacionDeUsuario`**

En `app/lib/session.ts`, reemplazar todo el archivo:

```ts
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';
import { organizacionDeUsuario } from '../db/organizacion-repository';

// Gate de sesion (V2.2): toda pagina y todo server action lo llaman primero.
// Sin sesion valida no se ve ni se escribe nada.
export async function requireSession(): Promise<UsuarioSesion> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  // Multi-organizacion (Parte 1): todo usuario que completo el registro (reclamo un
  // owner_canonico) tiene una fila en organizacion_miembro. Si no la tiene, es un
  // estado inconsistente (usuario autenticado sin organizacion) -- falla fuerte en vez
  // de asignar una organizacion por defecto en silencio.
  const membresia = organizacionDeUsuario(session.user.id);
  if (!membresia) {
    throw new Error(`Usuario ${session.user.id} autenticado sin organizacion asignada`);
  }

  return usuarioDeSesion(session.user as Parameters<typeof usuarioDeSesion>[0], membresia.idOrganizacion);
}
```

- [ ] **Step 6: Correr el suite completo**

Run: `npm test 2>&1 | tail -60`
Expected: sigue todo en verde (nada más usa `usuarioDeSesion`/`requireSession` en tests directamente todavía).

- [ ] **Step 7: Commit**

```bash
git add app/lib/session-user.ts app/lib/session.ts app/lib/session-user.test.ts
git commit -m "feat(sesion): idOrganizacion resuelto server-side en UsuarioSesion"
```

---

### Task 6: `idOrganizacion` en `Perfil`

**Files:**
- Modify: `app/core/perfil.ts`
- Test: `app/core/perfil.test.ts` (crear si no existe; verificar primero con `ls app/core/perfil.test.ts`)

- [ ] **Step 1: Escribir el test que falla**

Crear (o extender si ya existe) `app/core/perfil.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirPerfil, PREFERENCIAS_DEFAULT } from './perfil.ts';

test('construirPerfil pasa idOrganizacion de la identidad tal cual', () => {
  const perfil = construirPerfil(
    { id: 'u1', email: 'a@b.com', owner: 'Ana Owner', admin: false, idOrganizacion: 3 },
    PREFERENCIAS_DEFAULT,
  );
  assert.equal(perfil.idOrganizacion, 3);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/core/perfil.test.ts`
Expected: FAIL (tipo `Perfil` no tiene `idOrganizacion`).

- [ ] **Step 3: Agregar `idOrganizacion` a `Perfil` y `construirPerfil`**

En `app/core/perfil.ts`, modificar el tipo `Perfil` (agregar después de `admin: boolean;`):

```ts
export type Perfil = {
  id: string;
  email: string;
  nombre: string;
  primerNombre: string;
  iniciales: string;
  rol: string;
  admin: boolean;
  idOrganizacion: number;
  colorAvatar: string;
  vistaInicio: string;
  cargo: string;
  telefono: string;
};
```

Y en `construirPerfil`, agregar `idOrganizacion: identidad.idOrganizacion,` al objeto devuelto (después de `admin: identidad.admin,`):

```ts
  return {
    id: identidad.id,
    email: identidad.email,
    nombre: identidad.owner,
    primerNombre,
    iniciales: inic,
    rol: identidad.admin ? 'Administrador' : 'Vendedor',
    admin: identidad.admin,
    idOrganizacion: identidad.idOrganizacion,
    colorAvatar: preferencias.colorAvatar,
    vistaInicio: preferencias.vistaInicio,
    cargo: preferencias.cargo,
    telefono: preferencias.telefono,
  };
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/core/perfil.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/core/perfil.ts app/core/perfil.test.ts
git commit -m "feat(perfil): Perfil expone idOrganizacion"
```

---

### Task 7: `colaDelDia` filtra por `organizacion_activa_id`

**Files:**
- Modify: `app/db/repository.ts:145-173`
- Test: `app/db/repository.buscarEmpresas.test.ts`

- [ ] **Step 1: Extender el test que falla**

En `app/db/repository.buscarEmpresas.test.ts`, ubicar el seed de empresas (usa `seedEmpresa` o inserts directos con `owner: 'Sebastian Acosta Molina'`) y el llamado en la línea 45 (`colaDelDia(hoy, 'Sebastian Acosta Molina')`). Agregar un test nuevo al final del archivo, antes de `test.after`:

```ts
test('colaDelDia no muestra un lead de otra organizacion aunque el owner coincida', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES ('emp-otra-org', 'nit', 'De Otra Organizacion', 'de otra organizacion', 'lead', 'Sebastian Acosta Molina', ?, 2)`,
    )
    .run(hoy);
  raw.close();

  const colaOrg1 = colaDelDia(hoy, 'Sebastian Acosta Molina', 1);
  assert.ok(!colaOrg1.some((c) => c.id === 'emp-otra-org'), 'un lead de organizacion 2 no debe aparecer en la cola de organizacion 1');

  const colaOrg2 = colaDelDia(hoy, 'Sebastian Acosta Molina', 2);
  assert.ok(colaOrg2.some((c) => c.id === 'emp-otra-org'), 'el mismo lead SI debe verse desde su propia organizacion');
});
```

Revisar el nombre exacto de la variable `dbPath`/`hoy` ya declaradas arriba en el archivo y reusarlas (no redeclarar). Ajustar las llamadas EXISTENTES a `colaDelDia(hoy, owner)` en ese mismo archivo para que pasen `1` como tercer argumento (la organización Onepay, que es la que sembró el resto del archivo).

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.buscarEmpresas.test.ts`
Expected: FAIL de tipos (`colaDelDia` no acepta un tercer argumento) o, si TypeScript no bloquea la corrida, falla porque `emp-otra-org` aparece en `colaOrg1`.

- [ ] **Step 3: Implementar el filtro**

En `app/db/repository.ts`, modificar `colaDelDia`:

```ts
// Cola del día de un owner DENTRO de una organización: vencidos o para hoy, ordenados
// por calor y luego antigüedad. idOrganizacion viene de la sesión (Parte 1, multi-org):
// un lead compartido solo aparece en la cola de quien lo tiene activo ahora mismo.
export function colaDelDia(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select({
      id: empresa.idEmpresa,
      empresa: empresa.nombreOficial,
      ciudad: empresa.ciudadPrincipal,
      estado: empresa.estadoNotion,
      crm: empresa.crmSoftware,
      pasarela: empresa.pasarelaActual,
      proximoPaso: empresa.proximoPaso,
      canal: empresa.proximoCanal,
      fecha: empresa.proximoFollowUpFecha,
      contacto: contacto.nombre,
      cargo: contacto.cargo,
      usuarios: empresaUsuarios.usuariosEfectivos,
    })
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.owner, owner),
        eq(empresa.organizacionActivaId, idOrganizacion),
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
      ),
    )
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.buscarEmpresas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.buscarEmpresas.test.ts
git commit -m "feat(cola): colaDelDia filtra por organizacion_activa_id"
```

---

### Task 8: `registrarToque` escribe `idOrganizacion` y valida contra la organización activa del lead

**Files:**
- Modify: `app/db/repository.ts:247-362`
- Test: `app/db/repository.test.ts`, `app/db/repository.manual.test.ts`, `app/db/repository.outbox.test.ts`

- [ ] **Step 1: Extender `repository.test.ts` con el caso nuevo**

En `app/db/repository.test.ts`, modificar `seedEmpresa` para aceptar `organizacionActivaId` (default 1, no rompe los casos existentes):

```ts
function seedEmpresa(idEmpresa: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?)`,
    )
    .run(idEmpresa, organizacionActivaId);
  raw.close();
}
```

Agregar `1` como segundo argumento a `registrarToque({...}, 1)` en cada uno de los 5 `test(...)` existentes del archivo (`registrarToque` pasa a pedir `idOrganizacion` obligatorio).

Agregar un test nuevo al final, antes de `test.after`:

```ts
test('caso 6: registrarToque escribe id_organizacion en el toque y rechaza si el lead es de otra organizacion', () => {
  seedEmpresa('emp-6', 2); // el lead esta activo en la organizacion 2

  assert.throws(
    () => registrarToque({ idEmpresa: 'emp-6', canal: 'llamada', resultado: 'no_contesto' }, 1),
    /organizacion/i,
    'registrar un toque desde la organizacion 1 sobre un lead activo en la 2 debe fallar',
  );

  registrarToque({ idEmpresa: 'emp-6', canal: 'llamada', resultado: 'no_contesto' }, 2);
  const raw = leerRaw();
  const toqueRow = raw.prepare('SELECT id_organizacion FROM toque WHERE id_empresa = ?').get('emp-6') as any;
  assert.equal(toqueRow.id_organizacion, 2);
  raw.close();
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.test.ts`
Expected: FAIL (tipos: `registrarToque` no acepta un segundo argumento todavía).

- [ ] **Step 3: Implementar en `registrarToque`**

En `app/db/repository.ts`, modificar la firma y el cuerpo de `registrarToque`:

```ts
export function registrarToque(input: RegistrarToqueInput, idOrganizacion: number) {
  const parsed = registrarToqueSchema.parse(input);
  const ahora = new Date().toISOString();

  db.transaction((tx) => {
    // Guard de organizacion (Parte 1): un toque solo se registra sobre un lead cuya
    // organizacion_activa_id coincide con la del que llama. Evita que dos organizaciones
    // se pisen el estado de un lead compartido por error (ver spec 2026-07-09).
    const emp = tx
      .select({ organizacionActivaId: empresa.organizacionActivaId })
      .from(empresa)
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${parsed.idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(
        `La empresa ${parsed.idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`,
      );
    }

    let idContacto: number | null = null;
    if (parsed.kdm) {
      const { nombre, telefono } = parsed.kdm;
      const existente = telefono
        ? tx
            .select({ idContacto: contacto.idContacto })
            .from(contacto)
            .where(and(eq(contacto.idEmpresa, parsed.idEmpresa), eq(contacto.telefono, telefono)))
            .get()
        : undefined;

      if (existente) {
        idContacto = existente.idContacto;
        const sets: Record<string, unknown> = { esKeyDecisionMaker: 1 };
        if (nombre) sets.nombre = nombre;
        tx.update(contacto).set(sets).where(eq(contacto.idContacto, idContacto)).run();
      } else {
        const inserted = tx
          .insert(contacto)
          .values({
            idEmpresa: parsed.idEmpresa,
            nombre,
            telefono: telefono ?? null,
            esKeyDecisionMaker: 1,
            esPrincipal: 0,
            fuente: 'cockpit',
          })
          .run();
        idContacto = Number(inserted.lastInsertRowid);
      }
    }

    const previos = tx
      .select({ n: sql<number>`count(*)` })
      .from(toque)
      .where(eq(toque.idEmpresa, parsed.idEmpresa))
      .get();
    const esPrimerToque = (previos?.n ?? 0) === 0;

    tx.insert(toque)
      .values({
        idEmpresa: parsed.idEmpresa,
        idContacto,
        fecha: ahora,
        canal: parsed.canal,
        resultado: parsed.resultado,
        quePaso: parsed.quePaso ?? null,
        proximoFollowUpFecha: parsed.proximoFollowUp ?? null,
        razonPerdida: parsed.razonPerdida ?? null,
        objecion: parsed.objecion ?? null,
        fuente: 'cockpit',
        idOrganizacion,
        createdAt: ahora,
      })
      .run();

    const sets: Record<string, unknown> = { updatedAt: sql`datetime('now')` };
    if (parsed.proximoFollowUp) sets.proximoFollowUpFecha = parsed.proximoFollowUp;
    if (parsed.proximoCanal) sets.proximoCanal = parsed.proximoCanal;
    if (parsed.crm) sets.crmSoftware = parsed.crm;
    if (parsed.pasarela) sets.pasarelaActual = parsed.pasarela;
    tx.update(empresa).set(sets).where(eq(empresa.idEmpresa, parsed.idEmpresa)).run();

    const todosLosToques = tx
      .select({ fecha: toque.fecha, canal: toque.canal, resultado: toque.resultado })
      .from(toque)
      .where(eq(toque.idEmpresa, parsed.idEmpresa))
      .orderBy(desc(toque.idToque))
      .all();

    encolarOutboxNotion(tx, parsed.idEmpresa, {
      proximoPaso: parsed.quePaso,
      fechaProximoPaso: parsed.proximoFollowUp,
      fechaUltimoContacto: ahora.slice(0, 10),
      ...(esPrimerToque ? { fechaPrimerContacto: ahora.slice(0, 10) } : {}),
      toquesHechos: renderToquesHechos(todosLosToques),
    });

    if (parsed.usuarios != null && !Number.isNaN(parsed.usuarios)) {
      tx.insert(empresaUsuarios)
        .values({ idEmpresa: parsed.idEmpresa, usuariosEstimados: parsed.usuarios })
        .onConflictDoUpdate({ target: empresaUsuarios.idEmpresa, set: { usuariosEstimados: parsed.usuarios } })
        .run();
    }

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'toque',
        idRegistro: parsed.idEmpresa,
        accion: 'insert',
        detalle: `${parsed.resultado} -> next ${parsed.proximoFollowUp ?? '-'}`,
      })
      .run();
  });
}
```

- [ ] **Step 4: Correr `repository.test.ts`, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.test.ts`
Expected: PASS, los 6 casos en verde.

- [ ] **Step 5: Actualizar `repository.manual.test.ts` y `repository.outbox.test.ts`**

En `app/db/repository.manual.test.ts:100`, cambiar la llamada a:

```ts
registrarToque({ idEmpresa: 'e-manual-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'Hablamos de precio' }, 1);
```

Revisar cómo ese archivo siembra `e-manual-1` en `empresa` (buscar el `INSERT INTO empresa` correspondiente) y confirmar que use `organizacion_activa_id` = 1 o que dependa del `DEFAULT 1` del Task 3 (no hace falta tocarlo si ya cae en el default).

En `app/db/repository.outbox.test.ts`, agregar `, 1` como segundo argumento a las 4 llamadas de `registrarToque` (líneas 29, 39, 49, 62), y revisar que las empresas `emp-con-notion`/`emp-sin-notion`/`emp-enviar`/`emp-fallo` sembradas en ese archivo usen `organizacion_activa_id = 1` (o dependan del default).

- [ ] **Step 6: Correr ambos archivos**

Run: `node --experimental-strip-types --test app/db/repository.manual.test.ts app/db/repository.outbox.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/db/repository.ts app/db/repository.test.ts app/db/repository.manual.test.ts app/db/repository.outbox.test.ts
git commit -m "feat(toque): registrarToque escribe id_organizacion y valida organizacion_activa_id del lead"
```

---

### Task 9: `getCuenta`/`getContextoToque` solo muestran toques de la organización que consulta

**Files:**
- Modify: `app/db/repository.ts:191-241` (`getCuenta`), `:3054-3128` (`getContextoToque`)
- Test: `app/db/repository.contextoToque.test.ts`

- [ ] **Step 1: Agregar el caso que falla**

`app/db/repository.contextoToque.test.ts` ya siembra una empresa `'EMP_TEST'` (sin `organizacion_activa_id`, así que cae en el `DEFAULT 1` del Task 3) en su primer test. Al final del archivo, antes de `test.after`, agregar:

```ts
test('getContextoToque solo trae toques de la organizacion que consulta, aunque el lead sea compartido', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO toque (id_empresa, fecha, canal, resultado, fuente, id_organizacion)
       VALUES ('EMP_TEST', '2026-07-01T00:00:00.000Z', 'llamada', 'contesto_no', 'test', 2)`,
    )
    .run();
  raw.close();

  const ctxOrg1 = getContextoToque('EMP_TEST', 1);
  assert.ok(!ctxOrg1.toques.some((t) => t.canal === 'llamada' && t.resultado === 'contesto_no'), 'no debe ver el toque de la organizacion 2');

  const ctxOrg2 = getContextoToque('EMP_TEST', 2);
  assert.ok(ctxOrg2.toques.some((t) => t.canal === 'llamada' && t.resultado === 'contesto_no'), 'si debe ver su propio toque');
});
```

El archivo ya importa `Database` desde `better-sqlite3` en su header, no hace falta agregar nada.

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.contextoToque.test.ts`
Expected: FAIL (`getContextoToque` no acepta segundo argumento, o el toque de la organización 2 se ve desde la 1).

- [ ] **Step 3: Implementar el filtro en `getCuenta` y pasarlo desde `getContextoToque`**

En `app/db/repository.ts`, modificar `getCuenta`:

```ts
export function getCuenta(id: string, idOrganizacion: number) {
  const emp = db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      ciudad: empresa.ciudadPrincipal,
      departamento: empresa.departamento,
      estado: empresa.estadoNotion,
      crm: empresa.crmSoftware,
      pasarela: empresa.pasarelaActual,
      owner: empresa.owner,
      categoria: empresa.categoria,
      proximoPaso: empresa.proximoPaso,
      fecha: empresa.proximoFollowUpFecha,
      usuarios: empresaUsuarios.usuariosEfectivos,
      notionPageId: empresa.notionPageId,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(eq(empresa.idEmpresa, id))
    .get();

  const contactos = db
    .select({
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      telefono: contacto.telefono,
      email: contacto.email,
      esPrincipal: contacto.esPrincipal,
    })
    .from(contacto)
    .where(eq(contacto.idEmpresa, id))
    .all();

  // Solo los toques de MI organizacion: el lead es compartido, el historial de contacto no.
  const toques = db
    .select({
      idToque: toque.idToque,
      fecha: toque.fecha,
      canal: toque.canal,
      resultado: toque.resultado,
      quePaso: toque.quePaso,
      transcriptId: toque.transcriptId,
    })
    .from(toque)
    .where(and(eq(toque.idEmpresa, id), eq(toque.idOrganizacion, idOrganizacion)))
    .orderBy(desc(toque.idToque))
    .limit(5)
    .all();

  return { emp, contactos, toques };
}
```

Y `getContextoToque` (solo cambia la firma y la primera línea del cuerpo; el resto de la función queda igual):

```ts
export function getContextoToque(id: string, idOrganizacion: number): ContextoToque {
  const { emp, contactos, toques } = getCuenta(id, idOrganizacion);
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.contextoToque.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.contextoToque.test.ts
git commit -m "feat(toque): getCuenta/getContextoToque filtran los toques por organizacion"
```

---

### Task 10: `contadoresHoy` filtra por organización

**Files:**
- Modify: `app/db/repository.ts:404-432`
- Test: `app/db/repository.contadoresHoy.test.ts`, `app/db/repository.buscarEmpresas.test.ts`

- [ ] **Step 1: Extender el test que falla**

En `app/db/repository.contadoresHoy.test.ts`, actualizar `seedEmpresa` para sembrar `organizacion_activa_id` (default 1):

```ts
function seedEmpresa(idEmpresa: string, owner: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?)`,
    )
    .run(idEmpresa, owner, organizacionActivaId);
  raw.close();
}
```

Y actualizar `seedToque` para aceptar `idOrganizacion` (default 1):

```ts
function seedToque(idEmpresa: string, fechaISO: string, canal: string, resultado: string, idOrganizacion = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO toque (id_empresa, fecha, canal, resultado, fuente, id_organizacion)
       VALUES (?, ?, ?, ?, 'test', ?)`,
    )
    .run(idEmpresa, fechaISO, canal, resultado, idOrganizacion);
  raw.close();
}
```

Agregar `1` como tercer argumento a las 3 llamadas existentes de `contadoresHoy(HOY, OWNER_X)`. Agregar un test nuevo al final, antes de `test.after`:

```ts
test('contadoresHoy no cuenta un toque de otra organizacion aunque el owner coincida', () => {
  seedEmpresa('emp-e1', OWNER_A);
  seedToque('emp-e1', `${HOY}T09:00:00.000Z`, 'llamada', 'contesto_reunion', 2);

  const resultado = contadoresHoy(HOY, OWNER_A, 1);
  assert.equal(resultado.total, 0, 'el toque es de la organizacion 2, no debe contar en la 1');

  const resultadoOrg2 = contadoresHoy(HOY, OWNER_A, 2);
  assert.equal(resultadoOrg2.total, 1, 'desde la organizacion 2 si debe contar');
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.contadoresHoy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el filtro**

En `app/db/repository.ts`, modificar `contadoresHoy`:

```ts
export function contadoresHoy(hoy: string, owner: string, idOrganizacion: number): ContadoresHoy {
  const filas = db
    .select({ canal: toque.canal, resultado: toque.resultado })
    .from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(
      and(
        eq(empresa.owner, owner),
        eq(toque.idOrganizacion, idOrganizacion),
        sql`substr(${toque.fecha}, 1, 10) = ${hoy}`,
      ),
    )
    .all();

  const porCanal = Object.fromEntries(CANALES.map((c) => [c, 0])) as Record<Canal, number>;
  const porResultado = Object.fromEntries(RESULTADOS.map((r) => [r, 0])) as Record<Resultado, number>;

  for (const fila of filas) {
    if (fila.canal && (CANALES as readonly string[]).includes(fila.canal)) {
      porCanal[fila.canal as Canal] += 1;
    }
    if (fila.resultado && (RESULTADOS as readonly string[]).includes(fila.resultado)) {
      porResultado[fila.resultado as Resultado] += 1;
    }
  }

  return { porCanal, porResultado, total: filas.length };
}
```

(el comentario original arriba de la función se mantiene, solo agregar una línea notando que ahora también filtra por `idOrganizacion`).

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.contadoresHoy.test.ts`
Expected: PASS.

- [ ] **Step 5: Actualizar `repository.buscarEmpresas.test.ts`**

En la línea 48 de ese archivo, agregar `1` como tercer argumento: `contadoresHoy(hoy, 'Sebastian Acosta Molina', 1)`.

Run: `node --experimental-strip-types --test app/db/repository.buscarEmpresas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.contadoresHoy.test.ts app/db/repository.buscarEmpresas.test.ts
git commit -m "feat(cola): contadoresHoy filtra por organizacion"
```

---

### Task 11: `contarPorEstado` requiere `idOrganizacion`

**Files:**
- Modify: `app/db/repository.ts:437-450`
- Test: `app/db/repository.contarPorEstado.test.ts`

- [ ] **Step 1: Extender el test que falla**

En `app/db/repository.contarPorEstado.test.ts`, actualizar `seedEmpresa` para aceptar `organizacionActivaId` (default 1):

```ts
function seedEmpresa(id: string, owner: string, estadoNotion: string | null, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?, ?)`,
    )
    .run(id, owner, estadoNotion, organizacionActivaId);
  raw.close();
}
```

Cambiar las llamadas existentes: `contarPorEstado()` → `contarPorEstado(undefined, 1)`, y `contarPorEstado(OWNER_B)` → `contarPorEstado(OWNER_B, 1)`. Agregar un test nuevo al final, antes de `test.after`:

```ts
test('contarPorEstado no mezcla organizaciones aunque no se filtre por owner', () => {
  seedEmpresa('e7', OWNER_A, 'lead', 2);

  const soloOrg1 = contarPorEstado(undefined, 1);
  assert.equal(soloOrg1.lead, 2, 'e1 y e2 (organizacion 1), e7 (organizacion 2) no debe sumar aqui');

  const soloOrg2 = contarPorEstado(undefined, 2);
  assert.equal(soloOrg2.lead, 1, 'solo e7');
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.contarPorEstado.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el filtro**

En `app/db/repository.ts`, modificar `contarPorEstado`:

```ts
// Cuenta de empresas por estado_notion (rediseño home), SIEMPRE dentro de una
// organización (Parte 1, multi-org). Los null (empresas sin etapa en el funnel) NO se
// incluyen: no representan una etapa. Con owner filtra ademas a ese owner; sin owner
// cuenta toda la organización. Acceso solo por el Repository (regla de arquitectura).
export function contarPorEstado(owner: string | undefined, idOrganizacion: number): Record<string, number> {
  const condiciones = [eq(empresa.organizacionActivaId, idOrganizacion)];
  if (owner) condiciones.push(eq(empresa.owner, owner));

  const filas = db
    .select({ estado: empresa.estadoNotion, n: sql<number>`count(*)` })
    .from(empresa)
    .where(and(...condiciones))
    .groupBy(empresa.estadoNotion)
    .all();

  const out: Record<string, number> = {};
  for (const f of filas) {
    if (f.estado) out[f.estado] = Number(f.n);
  }
  return out;
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.contarPorEstado.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.contarPorEstado.test.ts
git commit -m "feat(home): contarPorEstado requiere idOrganizacion, owner sigue opcional"
```

---

### Task 12: `resumenHome` pasa `idOrganizacion` a `colaDelDia`/`contarPorEstado`

**Files:**
- Modify: `app/db/repository.ts:455-465`
- Test: `app/db/repository.resumenHome.test.ts`

- [ ] **Step 1: Extender el test que falla**

En `app/db/repository.resumenHome.test.ts`, actualizar `seedEmpresa` para incluir `organizacion_activa_id` (default 1, agregar parámetro con default):

```ts
function seedEmpresa(
  id: string,
  estadoNotion: string | null,
  proximoFollowUp: string | null,
  organizacionActivaId = 1,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?, ?, ?)`,
    )
    .run(id, OWNER, estadoNotion, proximoFollowUp, organizacionActivaId);
  raw.close();
}
```

Cambiar `resumenHome(OWNER, HOY)` a `resumenHome(OWNER, HOY, 1)`. Agregar un test nuevo antes de `test.after`:

```ts
test('resumenHome no mezcla organizaciones', () => {
  seedEmpresa('otra-org-1', 'reunion_agendada', null, 2);

  const r = resumenHome(OWNER, HOY, 1);
  assert.equal(r.dealsCalientes, 2, 'h1+h2 de la organizacion 1, otra-org-1 (organizacion 2) no debe sumar');

  const r2 = resumenHome(OWNER, HOY, 2);
  assert.equal(r2.dealsCalientes, 1, 'solo otra-org-1');
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.resumenHome.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `app/db/repository.ts`, modificar `resumenHome`:

```ts
export function resumenHome(owner: string, hoy: string, idOrganizacion: number) {
  const cola = colaDelDia(hoy, owner, idOrganizacion);
  const toquesHoy = cola.length;
  const vencidos = cola.filter((c) => (c.fecha ?? '') < hoy).length;

  const porEstado = contarPorEstado(undefined, idOrganizacion);
  const dealsCalientes = ESTADOS_CALIENTES.reduce((s, e) => s + (porEstado[e] ?? 0), 0);
  const cuentasActivas = ESTADOS_ACTIVOS.reduce((s, e) => s + (porEstado[e] ?? 0), 0);

  return { toquesHoy, vencidos, dealsCalientes, cuentasActivas };
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.resumenHome.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.resumenHome.test.ts
git commit -m "feat(home): resumenHome propaga idOrganizacion a colaDelDia/contarPorEstado"
```

---

### Task 13: `repartirFollowups` respeta la organización

**Files:**
- Modify: `app/db/repository.ts:468-507`
- Test: crear `app/db/repository.repartirFollowups.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/repository.repartirFollowups.test.ts`:

```ts
// Pruebas de Repository para repartirFollowups (Parte 1 multi-organizacion: antes sin
// test dedicado).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { repartirFollowups } = await import('./repository.ts');

const OWNER = 'Sebastian Acosta Molina';

function seedEmpresa(id: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, '2026-01-01', ?)`,
    )
    .run(id, OWNER, organizacionActivaId);
  raw.close();
}

test('repartirFollowups solo reparte los leads de la organizacion que llama', () => {
  seedEmpresa('r1');
  seedEmpresa('r2');
  seedEmpresa('r-otra-org', 2);

  const resultado = repartirFollowups(OWNER, 10, 1);
  assert.equal(resultado.total, 2, 'r1+r2 son de la organizacion 1, r-otra-org no debe contarse');

  const raw = new Database(dbPath);
  const otra = raw.prepare('SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = ?').get('r-otra-org') as any;
  assert.equal(otra.proximo_follow_up_fecha, '2026-01-01', 'no debe tocarse, es de otra organizacion');
  raw.close();
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.repartirFollowups.test.ts`
Expected: FAIL (`repartirFollowups` no acepta tercer argumento; `resultado.total` sería 3, no 2).

- [ ] **Step 3: Implementar el filtro**

En `app/db/repository.ts`, modificar `repartirFollowups`:

```ts
// Repartir el backlog de follow-ups de un owner DENTRO de su organización: N por día
// hábil, lo más caliente primero.
export function repartirFollowups(owner: string, porDia: number, idOrganizacion: number) {
  const rows = db
    .select({ id: empresa.idEmpresa })
    .from(empresa)
    .where(
      and(
        eq(empresa.owner, owner),
        eq(empresa.organizacionActivaId, idOrganizacion),
        isNotNull(empresa.proximoFollowUpFecha),
      ),
    )
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();

  const necesarios = Math.ceil(rows.length / porDia) || 0;
  const dias: string[] = [];
  const d = new Date();
  while (dias.length < necesarios) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dias.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  db.transaction((tx) => {
    rows.forEach((r, i) => {
      const fecha = dias[Math.floor(i / porDia)];
      tx.update(empresa)
        .set({ proximoFollowUpFecha: fecha, updatedAt: sql`datetime('now')` })
        .where(eq(empresa.idEmpresa, r.id))
        .run();
    });
    tx.insert(syncCambios)
      .values({
        fecha: new Date().toISOString(),
        corrida: 'repartir',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: owner,
        accion: 'update',
        detalle: `repartir ${rows.length} follow-ups a ${porDia}/dia`,
      })
      .run();
  });

  return { total: rows.length, porDia, hasta: dias[dias.length - 1] ?? null };
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.repartirFollowups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.repartirFollowups.test.ts
git commit -m "feat(cola): repartirFollowups filtra por organizacion"
```

---

### Task 14: `actualizarCampoCalificacion` valida la organización del lead

**Files:**
- Modify: `app/db/repository.ts:364-392`
- Test: crear `app/db/repository.actualizarCampoCalificacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/repository.actualizarCampoCalificacion.test.ts`:

```ts
// Pruebas de Repository para actualizarCampoCalificacion (Parte 1 multi-organizacion:
// antes sin test dedicado).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actualizarCampoCalificacion } = await import('./repository.ts');

function seedEmpresa(id: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?)`,
    )
    .run(id, organizacionActivaId);
  raw.close();
}

test('actualizarCampoCalificacion escribe el campo cuando el lead es de la organizacion que llama', () => {
  seedEmpresa('cal-1');
  actualizarCampoCalificacion('cal-1', 'crm', 'HubSpot', 1);

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT crm_software FROM empresa WHERE id_empresa = ?').get('cal-1') as any;
  assert.equal(fila.crm_software, 'HubSpot');
  raw.close();
});

test('actualizarCampoCalificacion rechaza si el lead esta activo en otra organizacion', () => {
  seedEmpresa('cal-2', 2);
  assert.throws(() => actualizarCampoCalificacion('cal-2', 'crm', 'HubSpot', 1), /organizacion/i);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && node --experimental-strip-types --test app/db/repository.actualizarCampoCalificacion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el guard**

En `app/db/repository.ts`, modificar `actualizarCampoCalificacion`:

```ts
export function actualizarCampoCalificacion(
  idEmpresa: string,
  campo: CampoCalificacion,
  valorCrudo: string,
  idOrganizacion: number,
): void {
  const val = actualizarCampoCalificacionSchema.parse({ campo, valor: valorCrudo });

  const emp = db
    .select({ organizacionActivaId: empresa.organizacionActivaId })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!emp) throw new Error(`Empresa ${idEmpresa} no existe`);
  if (emp.organizacionActivaId !== idOrganizacion) {
    throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
  }

  if (val.campo === 'usuarios') {
    const usuarios = Number(val.valor);
    if (!Number.isFinite(usuarios)) throw new Error('Usuarios debe ser un número');
    db.insert(empresaUsuarios)
      .values({ idEmpresa, usuariosEstimados: usuarios })
      .onConflictDoUpdate({ target: empresaUsuarios.idEmpresa, set: { usuariosEstimados: usuarios } })
      .run();
    return;
  }

  const sets = val.campo === 'crm' ? { crmSoftware: val.valor } : { pasarelaActual: val.valor };
  db.update(empresa)
    .set({ ...sets, updatedAt: sql`datetime('now')` })
    .where(eq(empresa.idEmpresa, idEmpresa))
    .run();
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.actualizarCampoCalificacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.actualizarCampoCalificacion.test.ts
git commit -m "feat(calificacion): actualizarCampoCalificacion valida organizacion_activa_id"
```

---

### Task 15: Actualizar los call sites reales

**Files:**
- Modify: `app/page.tsx:23-24`
- Modify: `app/cola/page.tsx:21-25`
- Modify: `app/actions.ts:9-38`
- Modify: `app/ui/shell/AppShell.tsx:26-34`
- Modify: `app/llamada/[id]/actions.ts:24-100,178-189`
- Modify: `app/llamada/[id]/page.tsx:30-33`

Ningún call site tiene test dedicado (son server components/actions); este task se verifica corriendo la app (Step final) en vez de con `node --test`.

- [ ] **Step 1: `app/page.tsx`**

```tsx
export default async function Dashboard() {
  const perfil = await cargarPerfil();
  const owner = perfil.nombre;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);

  const resumen = resumenHome(owner, hoy, perfil.idOrganizacion);
  const porEstado = contarPorEstado(undefined, perfil.idOrganizacion);
```

(el resto del archivo queda igual).

- [ ] **Step 2: `app/cola/page.tsx`**

```tsx
export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  const owner = sp.owner ?? usuario.owner;
  const hoy = new Date().toISOString().slice(0, 10);
  const cola = colaDelDia(hoy, owner, usuario.idOrganizacion);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const contadores = contadoresHoy(hoy, owner, usuario.idOrganizacion);
```

(el resto del archivo queda igual).

- [ ] **Step 3: `app/actions.ts`**

```ts
export async function repartirAction(formData: FormData) {
  // El owner viene de la sesion (V2.2): nadie reparte los follow-ups de otro.
  const { owner, idOrganizacion } = await requireSession();
  const porDia = Math.max(1, Math.round(Number(formData.get("porDia") ?? 10)) || 10);

  repartirFollowups(owner, porDia, idOrganizacion);

  revalidatePath("/");
  redirect("/");
}
```

```ts
export async function registrarTapAction(formData: FormData) {
  const { idOrganizacion } = await requireSession();
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const canal = String(formData.get("canal") ?? "");
  if (!idEmpresa) return;
  if (canal !== "whatsapp" && canal !== "correo") return;

  const objecion = String(formData.get("objecion") ?? "").trim() || undefined;

  const proximoFollowUp = plusDias(1);

  registrarToque({ idEmpresa, canal, resultado: "no_contesto", proximoFollowUp, objecion }, idOrganizacion);

  revalidatePath("/");
}
```

(`aprobarPasoManualAction`/`aprobarLoteManualAction` quedan igual: tocan `paso_inscripcion`, motor de campañas, fuera de este plan).

- [ ] **Step 4: `app/ui/shell/AppShell.tsx`**

```tsx
export async function datosSidebar() {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const hoy = new Date().toISOString().slice(0, 10);

  const toquesHoy = colaDelDia(hoy, owner, usuario.idOrganizacion).length;
  const campanasActivas = listarCampanas().filter((c) => c.estado === 'activa').length;
  const porEstado = contarPorEstado(undefined, usuario.idOrganizacion);
```

(el resto del archivo queda igual).

- [ ] **Step 5: `app/llamada/[id]/actions.ts`**

En `registrarToqueAction`, cambiar la primera línea y la llamada a `registrarToque`:

```ts
export async function registrarToqueAction(formData: FormData) {
  const { idOrganizacion } = await requireSession();
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
```

... (el resto de la función queda igual hasta) ...

```ts
  registrarToque(parsed, idOrganizacion);
```

En `actualizarCampoCalificacionAction`:

```ts
export async function actualizarCampoCalificacionAction(
  idEmpresa: string,
  campo: CampoCalificacion,
  valor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { idOrganizacion } = await requireSession();
  try {
    actualizarCampoCalificacion(idEmpresa, campo, valor, idOrganizacion);
    revalidatePath(`/llamada/${idEmpresa}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}
```

En `registrarToqueSueltoAction`:

```ts
export async function registrarToqueSueltoAction(idEmpresa: string, canal: "correo" | "whatsapp", cuerpo: string) {
  const { idOrganizacion } = await requireSession();
  const parsed = registrarToqueSchema.parse({
    idEmpresa,
    canal,
    resultado: "no_contesto",
    quePaso: cuerpo || undefined,
  });
  registrarToque(parsed, idOrganizacion);
  revalidatePath(`/llamada/${idEmpresa}?vista=confirmacion`);
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}
```

(`buscarGrabacionAction`, `confirmarGrabacionAction`, `estructurarDictadoAction`, `enviarToqueCanalAction` quedan igual: no tocan `toque`/`empresa` directamente por organización).

- [ ] **Step 6: `app/llamada/[id]/page.tsx`**

```tsx
export default async function Llamada({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const usuario = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const ctx = getContextoToque(id, usuario.idOrganizacion);
```

(el resto del archivo queda igual).

- [ ] **Step 7: Verificar que compila**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool && npx tsc --noEmit`
Expected: sin errores (todos los call sites de `colaDelDia`/`registrarToque`/`contadoresHoy`/`contarPorEstado`/`resumenHome`/`repartirFollowups`/`actualizarCampoCalificacion`/`getContextoToque` ahora pasan `idOrganizacion`).

- [ ] **Step 8: Correr el suite completo**

Run: `npm test 2>&1 | tail -80`
Expected: todo en verde.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx app/cola/page.tsx app/actions.ts app/ui/shell/AppShell.tsx app/llamada/[id]/actions.ts app/llamada/[id]/page.tsx
git commit -m "feat: propagar idOrganizacion de la sesion a cola, home, sidebar y ficha de toque"
```

---

### Task 16: Verificación manual en el navegador

**Files:** ninguno (solo verificación, sin cambios de código)

- [ ] **Step 1: Levantar el servidor de desarrollo**

Usar `preview_start` (o el flujo de arranque habitual del proyecto) para levantar `npm run dev`.

- [ ] **Step 2: Loguearse como Sebastián y confirmar que la cola/home se ven igual que antes**

Navegar a `/` y `/cola`. Expected: mismos leads, mismos contadores que antes de este plan (organización Onepay, sin regresión visible).

- [ ] **Step 3: Registrar un toque real de prueba desde `/llamada/[id]`**

Abrir un lead cualquiera desde la cola, registrar un toque de prueba. Expected: se guarda sin error, la ficha muestra el toque nuevo.

- [ ] **Step 4: Confirmar en `isps.db` que el toque quedó con `id_organizacion = 1`**

Run: `sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db "SELECT id_toque, id_empresa, id_organizacion FROM toque ORDER BY id_toque DESC LIMIT 1;"`
Expected: el toque recién creado tiene `id_organizacion = 1`.

---

## Fuera de alcance de este plan (recordatorio)

Segmentos, campañas, motor de inscripciones/tracking, pantalla de Workspace, invitaciones por correo, selector de organización para admin, UI de conectores por organización — ver la sección "Plan de implementación (fases)" del spec. No hay riesgo real de dejarlos así todavía porque solo existe la organización Onepay.
