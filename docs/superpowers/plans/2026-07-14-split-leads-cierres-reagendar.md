# Split leads/cierres/reagendar (cola de Sebastián) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking.
>
> **Alcance de este plan: SOLO local.** Migración de datos en el VPS (`contacto_iniciado` →
> `lead`, limpiar fechas sueltas) y borrado de las 17 campañas de prueba son un runbook
> operacional aparte, contra producción, que se ejecuta después con confirmación explícita.
> Este plan no toca el VPS ni `isps.db` de producción.

**Goal:** Partir la cola de toques (`/cola` y el badge del nav) en tres secciones —
Leads, Cierres, Reagendar — derivadas de `estado_notion`, activas solo para
`owner = "Sebastian Acosta Molina"`; el resto de owners sigue viendo la cola de hoy sin
cambios.

**Architecture:** Tres funciones de lectura nuevas en el Repository (`colaLeads`,
`colaCierres`, `colaReagendar`), mismo patrón que `colaDelDia` ya existente. La UI
(`app/cola/page.tsx`, `app/ui/shell/AppShell.tsx`) decide cuál usar según el owner de la
sesión — el gate por persona vive en la UI, no en el dominio ni en el repository.

**Tech Stack:** Next.js + TypeScript, Drizzle ORM sobre SQLite, `node:test` nativo.

---

## Contexto verificado (no repetir investigación)

- `ESTADOS_CALIENTES` ya existe en `app/db/funnel.ts`: `['reunion_agendada',
  'oportunidad', 'cierre_documentacion', 'enviar_contrato']`.
- `ETAPA_ONHOLD = 'on_hold'` ya existe en `app/db/funnel.ts`, no importado hoy en
  `repository.ts`.
- `colaDelDia(hoy, owner, idOrganizacion)` en `app/db/repository.ts:155-182` es el patrón a
  seguir: mismo `select`, mismos joins (`contacto` principal, `empresaUsuarios`), ordenado
  por `calorDesc` (const de módulo, línea ~140).
- `app/cola/page.tsx` consume `colaDelDia` para la cola y las stat cards; `app/ui/shell/
  AppShell.tsx:32` la usa para el badge `toquesHoy` del nav — **ambos hay que actualizar**
  para que el conteo que ve Sebastián sea consistente en toda la app.
- `app/cola/agenda.ts` ya tiene `FilaAgenda`, `canalNormalizado`, `filtrarPorCanal` — se
  extiende, no se duplica.
- Convención de test de owner ya usada en el repo: `OWNER_A = 'Sebastian Acosta Molina'`
  (ver `app/db/repository.contarPorEstado.test.ts`).
- Comando de test dirigido: `node --experimental-strip-types --experimental-loader
  ./scripts/resolve-ts-ext.mjs --test <archivo>`. Suite completa: `npm test`. Typecheck:
  `npx tsc --noEmit`.

## File Structure

**Modificar:**
- `app/db/repository.ts` — factorizar columnas de cola compartidas; agregar `colaLeads`,
  `colaCierres`, `colaReagendar`; importar `ETAPA_ONHOLD`.
- `app/cola/agenda.ts` — agregar `OWNER_COLA_SPLIT`, tipo `FilaCola`, función
  `filaSinVencimiento`.
- `app/cola/page.tsx` — renderizar 3 secciones cuando el owner resuelto sea
  `OWNER_COLA_SPLIT`; sin cambios para los demás owners.
- `app/ui/shell/AppShell.tsx` — el badge `toquesHoy` usa `colaLeads` cuando el owner de la
  sesión sea `OWNER_COLA_SPLIT`.

**Crear:**
- `app/db/repository.colaSplit.test.ts` — pruebas de las 3 queries nuevas.

---

## Task 1: Factorizar columnas de cola compartidas (refactor sin cambio de comportamiento)

**Files:**
- Modify: `app/db/repository.ts:140-182`
- Test: `app/db/repository.buscarEmpresas.test.ts` (ya existe, cubre `colaDelDia`)

- [ ] **Step 1: Extraer el objeto de columnas antes de `calorDesc`**

En `app/db/repository.ts`, justo antes de la línea `// Calor de la cuenta (prioridad)...`
(línea ~139), agregar:

```ts
// Columnas compartidas por las variantes de la cola (colaDelDia, colaLeads, colaCierres,
// colaReagendar): mismo shape de fila en las cuatro, solo cambia el WHERE.
const columnasCola = {
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
};
```

- [ ] **Step 2: Usar `columnasCola` dentro de `colaDelDia`**

Reemplazar el bloque `.select({ ... })` de `colaDelDia` (líneas ~166-178) por:

```ts
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(and(...condiciones))
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();
```

(El resto de la función, la construcción de `condiciones`, no cambia.)

- [ ] **Step 3: Correr las pruebas que cubren `colaDelDia` para confirmar cero regresión**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.buscarEmpresas.test.ts`
Expected: PASS (3 tests), mismo resultado que antes del refactor.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts
git commit -m "refactor(cola): factoriza columnas compartidas de colaDelDia"
```

---

## Task 2: `colaLeads()` — cola de leads reales (TDD)

**Files:**
- Create: `app/db/repository.colaSplit.test.ts`
- Modify: `app/db/repository.ts` (después de `colaDelDia`, línea ~182)

- [ ] **Step 1: Escribir el test que falla**

```ts
// app/db/repository.colaSplit.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaLeads, colaCierres, colaReagendar } = await import('./repository.ts');

const OWNER = 'Sebastian Acosta Molina';
const OTRO_OWNER = 'Felipe Castro';

function seedEmpresa(
  id: string,
  owner: string,
  estadoNotion: string | null,
  proximoFollowUpFecha: string | null,
  idOrganizacion = 1,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
    )
    .run(id, id, id, owner, estadoNotion, proximoFollowUpFecha, idOrganizacion);
  raw.close();
}

test('colaLeads: solo estado lead, vencido o de hoy, del owner y organizacion pedidos', () => {
  seedEmpresa('l1', OWNER, 'lead', '2026-07-14'); // hoy: entra
  seedEmpresa('l2', OWNER, 'lead', '2026-07-10'); // vencido: entra
  seedEmpresa('l3', OWNER, 'lead', '2026-07-20'); // futuro: no entra
  seedEmpresa('l4', OWNER, 'lead', null); // sin fecha: no entra
  seedEmpresa('l5', OWNER, 'contacto_iniciado', '2026-07-10'); // otro estado: no entra
  seedEmpresa('l6', OTRO_OWNER, 'lead', '2026-07-10'); // otro owner: no entra

  const r = colaLeads('2026-07-14', OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['l1', 'l2']);
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: FAIL con "colaLeads is not a function" (o "colaCierres"/"colaReagendar" también,
se implementan en las tareas siguientes — este archivo cubre las tres).

- [ ] **Step 3: Implementar `colaLeads` en `repository.ts`**

Justo después del cierre de `colaDelDia` (después de la línea ~182, antes del comentario
`// V3.9: busca CUALQUIER empresa...`), agregar:

```ts
// Bucket "Leads" del split de cola (2026-07-14): mismo criterio de colaDelDia (vencido o
// de hoy) pero acotado a estado_notion = 'lead'. Los leads no aparecen en toques hasta
// tener una fecha real (de una campana o puesta a mano); si no tienen fecha, no salen aqui
// tampoco. owner es obligatorio: esta variante solo la usa la UI para un owner puntual.
export function colaLeads(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, 'lead'),
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
      ),
    )
    .orderBy(empresa.proximoFollowUpFecha)
    .all();
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: FAIL todavía en `colaCierres`/`colaReagendar` ("is not a function") — el test de
`colaLeads` ya pasa aunque el archivo entero reporte fallo por las otras dos. Confirmar
específicamente que el test `'colaLeads: solo estado lead...'` está en verde en el output.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.colaSplit.test.ts
git commit -m "feat(cola): colaLeads, bucket de leads reales del split"
```

---

## Task 3: `colaCierres()` — cola de cierres (TDD)

**Files:**
- Modify: `app/db/repository.colaSplit.test.ts`
- Modify: `app/db/repository.ts`

- [ ] **Step 1: Agregar el test que falla**

Añadir a `app/db/repository.colaSplit.test.ts`:

```ts
test('colaCierres: estados calientes del owner, con y sin fecha, sin nocion de vencido', () => {
  seedEmpresa('c1', OWNER, 'oportunidad', '2026-07-10'); // vencido segun fecha: igual entra
  seedEmpresa('c2', OWNER, 'cierre_documentacion', null); // sin fecha: igual entra
  seedEmpresa('c3', OWNER, 'reunion_agendada', '2026-08-01'); // futuro: igual entra
  seedEmpresa('c4', OWNER, 'lead', '2026-07-10'); // no es estado caliente: no entra
  seedEmpresa('c5', OTRO_OWNER, 'oportunidad', '2026-07-10'); // otro owner: no entra

  const r = colaCierres(OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['c1', 'c2', 'c3']);
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: FAIL con "colaCierres is not a function".

- [ ] **Step 3: Implementar `colaCierres` en `repository.ts`**

Después de `colaLeads`, agregar:

```ts
// Bucket "Cierres" del split de cola: estados calientes (ESTADOS_CALIENTES), sin filtro de
// fecha -- una cuenta en negociacion no es "vencida" solo porque no tiene fecha puesta.
// Ordena por fecha si la tiene; las sin fecha van al final (NULL primero en SQLite ASC, por
// eso el CASE explicito).
export function colaCierres(owner: string, idOrganizacion: number) {
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        eq(empresa.owner, owner),
        inArray(empresa.estadoNotion, [...ESTADOS_CALIENTES]),
      ),
    )
    .orderBy(sql`${empresa.proximoFollowUpFecha} IS NULL`, empresa.proximoFollowUpFecha)
    .all();
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: PASS en `colaLeads` y `colaCierres`; `colaReagendar` sigue fallando (Task 4).

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.colaSplit.test.ts
git commit -m "feat(cola): colaCierres, bucket de negociacion activa del split"
```

---

## Task 4: `colaReagendar()` — cola de on_hold (TDD)

**Files:**
- Modify: `app/db/repository.colaSplit.test.ts`
- Modify: `app/db/repository.ts`

- [ ] **Step 1: Importar `ETAPA_ONHOLD`**

En `app/db/repository.ts:61`, cambiar:

```ts
import { ESTADOS_CALIENTES, ESTADOS_ACTIVOS } from './funnel';
```

por:

```ts
import { ESTADOS_CALIENTES, ESTADOS_ACTIVOS, ETAPA_ONHOLD } from './funnel';
```

- [ ] **Step 2: Agregar el test que falla**

Añadir a `app/db/repository.colaSplit.test.ts`:

```ts
test('colaReagendar: solo on_hold del owner, con y sin fecha', () => {
  seedEmpresa('r1', OWNER, 'on_hold', '2026-07-10');
  seedEmpresa('r2', OWNER, 'on_hold', null);
  seedEmpresa('r3', OWNER, 'oportunidad', '2026-07-10'); // no es on_hold: no entra
  seedEmpresa('r4', OTRO_OWNER, 'on_hold', '2026-07-10'); // otro owner: no entra

  const r = colaReagendar(OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['r1', 'r2']);
});
```

- [ ] **Step 3: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: FAIL con "colaReagendar is not a function".

- [ ] **Step 4: Implementar `colaReagendar` en `repository.ts`**

Después de `colaCierres`, agregar:

```ts
// Bucket "Reagendar" del split de cola: cuentas on_hold del owner (se quedaron atascadas,
// ej. no llegaron a la reunion). Mismo trato que colaCierres: lista fija, no depende de
// fecha ni se marca "vencida".
export function colaReagendar(owner: string, idOrganizacion: number) {
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, ETAPA_ONHOLD),
      ),
    )
    .orderBy(sql`${empresa.proximoFollowUpFecha} IS NULL`, empresa.proximoFollowUpFecha)
    .all();
}
```

- [ ] **Step 5: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add app/db/repository.ts app/db/repository.colaSplit.test.ts
git commit -m "feat(cola): colaReagendar, bucket de on_hold del split"
```

---

## Task 5: `filaSinVencimiento` — helper puro para filas sin fecha obligatoria (TDD)

**Files:**
- Modify: `app/cola/agenda.ts`
- Modify: `app/cola/agenda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añadir a `app/cola/agenda.test.ts`:

```ts
import { filaSinVencimiento, type FilaCola } from './agenda.ts';

function filaColaBase(id: string, fecha: string | null): FilaCola {
  return { id, empresa: `Empresa ${id}`, ciudad: null, contacto: null, cargo: null, canal: null, estado: 'on_hold', fecha };
}

test('filaSinVencimiento: con fecha la muestra tal cual, sin fecha dice "sin fecha"', () => {
  const conFecha = filaSinVencimiento(filaColaBase('c1', '2026-07-20'));
  assert.equal(conFecha.sev, 'today');
  assert.equal(conFecha.severidadTexto, '2026-07-20');

  const sinFecha = filaSinVencimiento(filaColaBase('c2', null));
  assert.equal(sinFecha.severidadTexto, 'sin fecha');
});
```

(Agregar el `import` de `filaSinVencimiento`/`FilaCola` junto al `import` existente de
`filtrarPorCanal, conteosPorCanal, type FilaAgenda`.)

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: FAIL con "filaSinVencimiento is not a function" (o de tipos, "FilaCola").

- [ ] **Step 3: Implementar en `app/cola/agenda.ts`**

Agregar al final del archivo:

```ts
// Owner cuyo cola.page.tsx usa el split leads/cierres/reagendar (2026-07-14). Solo
// Sebastian: los demas owners siguen viendo colaDelDia sin cambios.
export const OWNER_COLA_SPLIT = 'Sebastian Acosta Molina';

// Shape minimo compartido por colaLeads/colaCierres/colaReagendar (repository.ts), lo que
// necesita el mapeo a FilaAgenda.
export type FilaCola = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
  canal: string | null;
  estado: string | null;
  fecha: string | null;
};

// Cierres y Reagendar no tienen nocion de "vencido": una cuenta en negociacion o atascada
// no se marca overdue solo por no tener proximo_follow_up_fecha. Si tiene fecha, se muestra
// como texto informativo; si no, "sin fecha".
export function filaSinVencimiento(c: FilaCola): FilaAgenda {
  return {
    id: c.id,
    empresa: c.empresa,
    ciudad: c.ciudad,
    contacto: c.contacto,
    cargo: c.cargo,
    canal: canalNormalizado(c.canal),
    estado: c.estado,
    sev: 'today',
    severidadTexto: c.fecha ?? 'sin fecha',
    actual: false,
  };
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cola/agenda.ts app/cola/agenda.test.ts
git commit -m "feat(cola): filaSinVencimiento + OWNER_COLA_SPLIT"
```

---

## Task 6: Wire `/cola` — tres secciones para Sebastián

**Files:**
- Modify: `app/cola/page.tsx`

> Sin test dedicado (composición de UI/server component); se verifica con typecheck +
> revisión manual de Sebastián en el navegador (la IA no levanta el dev server, memoria
> `feedback_never_run_previews`).

- [ ] **Step 1: Importar lo nuevo**

En `app/cola/page.tsx`, cambiar:

```ts
import { colaDelDia, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
```

por:

```ts
import { colaDelDia, colaLeads, colaCierres, colaReagendar, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
```

y:

```ts
import { canalNormalizado, type FilaAgenda } from "./agenda.ts";
```

por:

```ts
import { canalNormalizado, filaSinVencimiento, OWNER_COLA_SPLIT, type FilaAgenda } from "./agenda.ts";
```

- [ ] **Step 2: Calcular la cola según si aplica el split**

Reemplazar el bloque:

```ts
  const hoy = new Date().toISOString().slice(0, 10);
  const cola = colaDelDia(hoy, owner, usuario.idOrganizacion);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
```

por:

```ts
  const hoy = new Date().toISOString().slice(0, 10);
  const splitActivo = owner === OWNER_COLA_SPLIT;
  const cola = splitActivo ? colaLeads(hoy, owner, usuario.idOrganizacion) : colaDelDia(hoy, owner, usuario.idOrganizacion);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const cierres = splitActivo ? colaCierres(owner, usuario.idOrganizacion) : [];
  const reagendar = splitActivo ? colaReagendar(owner, usuario.idOrganizacion) : [];
```

(`owner` ya viene resuelto arriba en la función, línea ~22: `sp.owner ?? (usuario.soloLectura
? undefined : usuario.owner)`. Cuando es `undefined` — modo visitante — `splitActivo` da
`false` sin más chequeo, correcto.)

- [ ] **Step 3: Mapear `cierres`/`reagendar` a filas y renderizarlas**

Después del bloque `const filas: FilaAgenda[] = cola.map(...)` (línea ~38-52), agregar:

```ts
  const filasCierres: FilaAgenda[] = cierres.map((c) => filaSinVencimiento(c));
  const filasReagendar: FilaAgenda[] = reagendar.map((c) => filaSinVencimiento(c));
```

Dentro del `<section id="today-agenda">`, después del bloque de `cadenciasHoy` (antes del
cierre `</section>`), agregar:

```tsx
        {splitActivo && filasCierres.length > 0 && (
          <div className="mt-8">
            <h3 className="font-serif text-lg text-ink mb-3">Cierres</h3>
            <AgendaHoy filas={filasCierres} registrarTapAction={registrarTapAction} />
          </div>
        )}

        {splitActivo && filasReagendar.length > 0 && (
          <div className="mt-8">
            <h3 className="font-serif text-lg text-ink mb-3">Reagendar</h3>
            <AgendaHoy filas={filasReagendar} registrarTapAction={registrarTapAction} />
          </div>
        )}
```

- [ ] **Step 4: Actualizar el título de la sección principal cuando el split está activo**

Cambiar:

```tsx
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">Toques de hoy</h2>
        <p className="mt-1 text-sm text-muted">Tu cola de follow-ups pendientes.</p>
```

por:

```tsx
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{splitActivo ? "Leads" : "Toques de hoy"}</h2>
        <p className="mt-1 text-sm text-muted">{splitActivo ? "Leads con follow-up vencido o de hoy." : "Tu cola de follow-ups pendientes."}</p>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: todos los tests en verde (incluidos los nuevos de Tasks 2-5, y sin regresión en
el resto).

- [ ] **Step 7: Commit**

```bash
git add app/cola/page.tsx
git commit -m "feat(cola): tres secciones (Leads/Cierres/Reagendar) para Sebastian"
```

---

## Task 7: Badge del nav consistente (`AppShell`)

**Files:**
- Modify: `app/ui/shell/AppShell.tsx`

- [ ] **Step 1: Importar `colaLeads` y `OWNER_COLA_SPLIT`**

En `app/ui/shell/AppShell.tsx:4`, cambiar:

```ts
import { colaDelDia, listarCampanas, estadoConector, contarPorEstado, inscripcionesBloqueadas } from '../../db/repository';
```

por:

```ts
import { colaDelDia, colaLeads, listarCampanas, estadoConector, contarPorEstado, inscripcionesBloqueadas } from '../../db/repository';
```

y agregar, junto a los demás imports:

```ts
import { OWNER_COLA_SPLIT } from '../../cola/agenda.ts';
```

- [ ] **Step 2: Usar `colaLeads` para el badge cuando el owner sea Sebastián**

Cambiar (línea ~32):

```ts
  const toquesHoy = colaDelDia(hoy, owner, usuario.idOrganizacion).length;
```

por:

```ts
  const toquesHoy = (owner === OWNER_COLA_SPLIT ? colaLeads(hoy, owner, usuario.idOrganizacion) : colaDelDia(hoy, owner, usuario.idOrganizacion)).length;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add app/ui/shell/AppShell.tsx
git commit -m "fix(nav): badge de toques usa colaLeads para Sebastian (consistente con /cola)"
```

---

## Task 8: Verificación final local

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: 0 fallos.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Pedir a Sebastián que levante el dev server y revise visualmente**

La IA no levanta el dev server (memoria `feedback_never_run_previews`). Pedirle a Sebastián:
1. Correr `npm run dev`.
2. Entrar a `/cola` con su sesión — debe ver "Leads" arriba (probablemente vacío o con
   pocas filas, ya que hoy sus leads no tienen fecha puesta salvo las 3 que la migración de
   producción todavía no limpió — normal en local si la DB de dev no está sembrada igual).
3. Confirmar que ve secciones "Cierres" y "Reagendar" cuando hay datos de esos estados en
   la DB con la que esté probando.
4. Confirmar que el badge del nav coincide con lo que muestra "Leads" en `/cola`.

> Nota: la DB local de desarrollo puede no tener los mismos datos que producción (la
> memoria del proyecto indica que la DB dentro del repo puede estar vacía/huérfana). Si es
> el caso, sembrar un par de empresas con `owner = 'Sebastian Acosta Molina'` en distintos
> estados_notion para ver las 3 secciones pobladas, o probar directamente contra los tests
> (que sí cubren los tres buckets con datos reales de forma aislada).

---

## Fuera de este plan (runbook de producción, aparte)

No se ejecuta aquí. Referencia: sección "Diseño" puntos 1 y 3 del spec
(`docs/superpowers/specs/2026-07-14-split-pre-post-reunion-design.md`):

1. Backup del volumen `followups-tool_followups_data` en el VPS.
2. Migración de datos: `contacto_iniciado → lead` (12 cuentas de Sebastián) vía
   `actualizarEstadoNotion`, y limpiar `proximo_follow_up_fecha` en esas 12 + las 3 `lead`
   + la 1 `firma_pago` que hoy la tienen puesta.
3. Borrado de las 17 campañas de prueba y su andamiaje (`inscripcion`, `destinatario`,
   `paso_inscripcion`, `evento_tracking`) — verificado 0 toques ligados.
4. Deploy del código de este plan al VPS (git pull + rebuild, mismo mecanismo que ya usa
   el proyecto).

Se ejecuta después de que Sebastián apruebe el resultado local, con confirmación explícita
antes de tocar el VPS.

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** los 3 buckets (Task 2-4), el gate por owner (Task 5-7), la
  consistencia badge/página (Task 7) están cubiertos. La migración de datos y el borrado de
  campañas quedan fuera a propósito (pedido explícito: "local primero").
- **Placeholders:** cada step trae código completo, sin TODOs.
- **Consistencia de tipos:** `FilaCola` (Task 5) es el contrato entre las 3 queries del
  repository (Task 2-4, que devuelven filas con ese shape vía `columnasCola`) y
  `filaSinVencimiento`. `OWNER_COLA_SPLIT` se define una sola vez (`agenda.ts`) y se importa
  en `page.tsx` y `AppShell.tsx`, no se repite el string literal.
- **Capas:** el gate por persona (`OWNER_COLA_SPLIT`) vive en la UI (`agenda.ts`, consumido
  por los dos server components), no en `repository.ts` — las queries nuevas son genéricas
  por owner, reusables para cualquier owner el día que Sebastián decida extender el split.
