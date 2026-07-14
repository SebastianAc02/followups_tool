# Cola unificada con filtros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking.
>
> **Alcance: SOLO local, SOLO para `owner = "Sebastian Acosta Molina"`.** No toca el VPS. No
> cambia nada para otros owners: `AgendaHoy.tsx`/`CadenciasHoy.tsx` casi no se tocan (un único
> `export` aditivo en `AgendaHoy.tsx`, ver Task 5) y siguen renderizando exactamente igual para
> todos los demás.

**Goal:** Reemplazar, solo para Sebastián, las 3 secciones apiladas (Leads/Cierres/Reagendar) +
el bloque "Cadencias de hoy" de `/cola` por una sola lista filtrable (Etapa / Campaña / Canal /
Frescura), con los toques vencidos hace 7+ días relabeled "desactualizado" en vez de "vencido".

**Architecture:** `colaLeads`/`colaCierres`/`colaReagendar` ganan el nombre de campaña (LEFT
JOIN a `inscripcion` activa + `campana`). `agendaHoyCadencias` gana un filtro opcional por
owner y los campos que le faltan para poder mezclarse. Una función pura nueva (`unificarCola`)
combina las 4 fuentes en un solo arreglo ordenado; un componente cliente nuevo
(`ColaUnificada.tsx`) le pinta el panel de filtros y la lista, reusando piezas de `AgendaHoy.tsx`
donde ya existen (se exporta lo que hace falta, no se duplica).

**Tech Stack:** Next.js + TypeScript, Drizzle ORM sobre SQLite, `node:test` nativo, React client
components.

---

## Contexto verificado (no repetir investigación)

- `AgendaHoy.tsx` solo lo usa `app/cola/page.tsx` (`grep` confirmado) — seguro de tocar sin
  afectar otras páginas.
- `CadenciasHoy.tsx` tiene 4 tipos de fila internos: `FilaLlamada`, `FilaPrioritaria` y
  `FilaAutomatica` son en el fondo **links a `/llamada/[id]`** (igual que cualquier toque
  normal — el comentario del código lo confirma: "un manual de whatsapp/correo ya NO se aprueba
  desde una tarjetica inline... lleva al cockpit"). Solo `GrupoBatch` (pasos `esManual=1` con
  `modo='batch'`) es genuinamente distinto: edita un copy y aprueba para VARIAS empresas a la
  vez, no se puede volver una fila por empresa sin perder ese flujo. **Por eso el plan solo
  fusiona los primeros 3 tipos a la lista unificada; los `GrupoBatch` (raros hoy — ninguna
  campaña activa real de Sebastián es `batch`) se siguen mostrando aparte, reusando
  `CadenciasHoy.tsx` tal cual, sin modificarlo, alimentado solo con esos ítems.**
- `agendaHoyCadencias(hoy)` hoy no filtra por owner ni trae `estado_notion`/`ciudad`/nombre de
  campaña. Único caller: `app/cola/page.tsx` (`grep` confirmado) — seguro de extenderla.
- `columnasCola` (repository.ts:151) es el shape compartido por `colaDelDia`/`colaLeads`/
  `colaCierres`/`colaReagendar`. Se agrega un shape nuevo `columnasColaConCampana` (no se toca
  `columnasCola` ni `colaDelDia`, que no participan del split).
- `inscripcion` tiene un índice único parcial `WHERE estado='activa'` — un `LEFT JOIN` a
  inscripción activa nunca duplica filas (a lo más una inscripción activa por empresa).
- `FilaAcciones` (el menú "···" de acción rápida) es una función local no exportada en
  `AgendaHoy.tsx` — se exporta (cambio de una palabra, `function` → `export function`, cero
  riesgo de comportamiento) para reusarla en la lista nueva sin duplicar ~70 líneas.
- Comando de test dirigido: `node --experimental-strip-types --experimental-loader
  ./scripts/resolve-ts-ext.mjs --test <archivo>`. Suite completa: `npm test`. Typecheck: `npx tsc
  --noEmit`.

## File Structure

**Modificar:**
- `app/db/repository.ts` — `columnasColaConCampana`; `colaLeads`/`colaCierres`/`colaReagendar`
  lo usan + el `LEFT JOIN` nuevo; `agendaHoyCadencias` gana `owner?` + campos nuevos.
- `app/db/repository.colaSplit.test.ts` — pruebas de campaña en las 3 queries.
- `app/db/repository.agendaHoyCadencias.test.ts` (nuevo) — pruebas de owner + campos nuevos.
- `app/cola/agenda.ts` — `Bucket`, `Frescura`, `frescuraDe`, `bucketDeEtapa`, `FilaUnificada`,
  `unificarCola`, `aplicarFiltrosUnificados`; `FilaCola` gana `campana`.
- `app/cola/agenda.test.ts` — pruebas de todo lo anterior; `filaColaBase` gana `campana`.
- `app/cola/AgendaHoy.tsx` — un `export` aditivo en `FilaAcciones`.
- `app/cola/page.tsx` — cuando `splitActivo`, arma la lista unificada + separa los `GrupoBatch`,
  renderiza `ColaUnificada` en vez de las 3 secciones.

**Crear:**
- `app/cola/ColaUnificada.tsx` — panel de filtros + lista (client component).

---

## Task 1: Nombre de campaña en `colaLeads`/`colaCierres`/`colaReagendar` (TDD)

**Files:**
- Modify: `app/db/repository.ts:151-164, 200-264`
- Modify: `app/db/repository.colaSplit.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `app/db/repository.colaSplit.test.ts`, después de `seedToque`:

```ts
function seedInscripcionActiva(idEmpresa: string, nombreCampana: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento) VALUES (?, 1, 1)`).run(nombreCampana);
  const idCampana = raw.prepare(`SELECT last_insert_rowid() id`).get().id;
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  raw.close();
}
```

Y un test nuevo al final del archivo:

```ts
test('colaLeads/colaCierres/colaReagendar: campana viene poblada solo si hay inscripcion activa', () => {
  seedEmpresa('m1', OWNER, 'lead', '2026-07-10', 3);
  seedInscripcionActiva('m1', 'Reactivacion express');
  seedEmpresa('m2', OWNER, 'lead', '2026-07-10', 3); // sin inscripcion: campana null

  const r = colaLeads('2026-07-14', OWNER, 3);
  const m1 = r.find((f) => f.id === 'm1');
  const m2 = r.find((f) => f.id === 'm2');
  assert.equal(m1?.campana, 'Reactivacion express');
  assert.equal(m2?.campana, null);
});
```

(Organización 3, aislada, para no chocar con los demás tests del archivo que ya usan 1 y 2.)

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: FAIL — `campana` es `undefined` en el resultado (la columna no existe todavía en el
shape que devuelve `colaLeads`).

- [ ] **Step 3: Agregar `columnasColaConCampana` y usarlo en las 3 funciones**

En `app/db/repository.ts`, justo después del cierre de `columnasCola` (línea ~164), agregar:

```ts
// Shape de columnasCola + el nombre de la campana activa (si la hay). Solo lo usan
// colaLeads/colaCierres/colaReagendar (parte del split, 2026-07-14) -- colaDelDia sigue
// con columnasCola tal cual, sin este JOIN extra.
const columnasColaConCampana = {
  ...columnasCola,
  campana: campana.nombre,
};
```

En `colaLeads`, `colaCierres` y `colaReagendar`: cambiar `.select(columnasCola)` por
`.select(columnasColaConCampana)`, y agregar el `LEFT JOIN` después del `leftJoin` a
`empresaUsuarios` en las tres:

```ts
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
```

Ejemplo completo de cómo queda `colaLeads` (mismo patrón para las otras dos, solo cambia el
`where`):

```ts
export function colaLeads(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasColaConCampana)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
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
Expected: PASS (todos los tests del archivo).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.colaSplit.test.ts
git commit -m "feat(cola): colaLeads/colaCierres/colaReagendar traen nombre de campana"
```

---

## Task 2: `agendaHoyCadencias` gana owner + campos para fusionar (TDD)

**Files:**
- Modify: `app/db/repository.ts:3659-3711`
- Create: `app/db/repository.agendaHoyCadencias.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// app/db/repository.agendaHoyCadencias.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { agendaHoyCadencias } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedPasoPendiente(idEmpresa: string, owner: string, canal: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, ciudad_principal, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 'contacto_iniciado', 'Bogota', 1)`,
  ).run(idEmpresa, idEmpresa, idEmpresa, owner);
  db.prepare(`INSERT INTO contacto (id_empresa, nombre, email, es_principal, fuente) VALUES (?, 'Ana', 'ana@test.com', 1, 'seed')`).run(idEmpresa);
  const idContacto = db.prepare(`SELECT id_contacto id FROM contacto WHERE id_empresa = ?`).get(idEmpresa).id;

  db.prepare(`INSERT INTO cadencia (nombre) VALUES ('Cadencia test')`).run();
  const idCadencia = db.prepare(`SELECT last_insert_rowid() id`).get().id;
  db.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal, es_manual) VALUES (?, 1, 0, ?, 1)`).run(idCadencia, canal);
  const idPaso = db.prepare(`SELECT last_insert_rowid() id`).get().id;
  db.prepare(`INSERT INTO version_paso (id_paso, es_default) VALUES (?, 1)`).run(idPaso);
  const idVersion = db.prepare(`SELECT last_insert_rowid() id`).get().id;

  db.prepare(`INSERT INTO segmento (nombre, definicion, id_organizacion) VALUES ('Seg test', '{}', 1)`).run();
  const idSegmento = db.prepare(`SELECT last_insert_rowid() id`).get().id;
  db.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento, estado) VALUES ('Campana test', ?, ?, 'activa')`).run(idCadencia, idSegmento);
  const idCampana = db.prepare(`SELECT last_insert_rowid() id`).get().id;
  db.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  const idInscripcion = db.prepare(`SELECT last_insert_rowid() id`).get().id;
  db.prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`).run(idInscripcion, idContacto);
  const idDestinatario = db.prepare(`SELECT last_insert_rowid() id`).get().id;
  db.prepare(
    `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_programada) VALUES (?, ?, ?, ?, 'pendiente', '2026-07-10')`,
  ).run(idDestinatario, idPaso, idVersion, canal);
  db.close();
}

test('agendaHoyCadencias: sin owner trae todo, con owner filtra', () => {
  seedPasoPendiente('a1', 'Sebastian Acosta Molina', 'llamada');
  seedPasoPendiente('a2', 'Felipe Castro', 'llamada');

  const todos = agendaHoyCadencias('2026-07-14');
  assert.equal(todos.length, 2);

  const soloSebastian = agendaHoyCadencias('2026-07-14', 'Sebastian Acosta Molina');
  assert.equal(soloSebastian.length, 1);
  assert.equal(soloSebastian[0].idEmpresa, 'a1');
});

test('agendaHoyCadencias: trae estadoNotion, ciudad y nombreCampana', () => {
  const fila = agendaHoyCadencias('2026-07-14', 'Sebastian Acosta Molina')[0];
  assert.equal(fila.estadoNotion, 'contacto_iniciado');
  assert.equal(fila.ciudad, 'Bogota');
  assert.equal(fila.nombreCampana, 'Campana test');
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.agendaHoyCadencias.test.ts`
Expected: FAIL — `agendaHoyCadencias` no acepta un segundo argumento y no trae esos 3 campos.

- [ ] **Step 3: Extender `agendaHoyCadencias`**

En `app/db/repository.ts:3659`, cambiar la firma y el select:

```ts
export function agendaHoyCadencias(hoy: string, owner?: string) {
  const filas = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idDestinatario: pasoInscripcion.idDestinatario,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      canal: pasoInscripcion.canal,
      esManual: pasoCadencia.esManual,
      orden: pasoCadencia.orden,
      diaOffset: pasoCadencia.diaOffset,
      email: contacto.email,
      nombre: contacto.nombre,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      firmaApollo: versionPaso.firmaApollo,
      variables: versionPaso.variables,
      idCampana: campana.idCampana,
      modo: campana.modo,
      idEmpresa: empresa.idEmpresa,
      empresaNombre: empresa.nombreOficial,
      // Campos nuevos (2026-07-14) para poder fusionar estas filas a la lista unificada
      // de /cola sin una segunda consulta.
      estadoNotion: empresa.estadoNotion,
      ciudad: empresa.ciudadPrincipal,
      nombreCampana: campana.nombre,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(
      and(
        inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
        sql`date(${pasoInscripcion.fechaProgramada}) <= date(${hoy})`,
        eq(campana.estado, 'activa'),
        eq(inscripcion.estado, 'activa'),
        owner ? eq(empresa.owner, owner) : undefined,
      ),
    )
    .orderBy(pasoInscripcion.fechaProgramada)
    .all();

  return filas.map((f) => ({
    ...f,
    firmaApollo: f.firmaApollo === 1,
    variables: f.variables ? (JSON.parse(f.variables) as string[]) : [],
  }));
}
```

(El único cambio real en el `where` es la última línea: `and()` de Drizzle ignora los
`undefined`, así que sin `owner` el filtro no se aplica — mismo patrón que `colaDelDia`.)

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.agendaHoyCadencias.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + suite completa**

Run: `npx tsc --noEmit && npm test`
Expected: 0 errores, todo en verde (confirma que `app/cola/page.tsx` sigue llamando
`agendaHoyCadencias(hoy)` con un solo argumento sin romperse — `owner` es opcional).

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.agendaHoyCadencias.test.ts
git commit -m "feat(cola): agendaHoyCadencias filtra por owner opcional y trae mas campos"
```

---

## Task 3: `Bucket`, `Frescura` y sus helpers puros (TDD)

**Files:**
- Modify: `app/cola/agenda.ts`
- Modify: `app/cola/agenda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `app/cola/agenda.test.ts` (junto a los imports existentes, agregar `frescuraDe,
bucketDeEtapa`):

```ts
import { filtrarPorCanal, conteosPorCanal, filaSinVencimiento, diasVencido, filaConVencimiento, frescuraDe, bucketDeEtapa, type FilaAgenda, type FilaCola } from './agenda.ts';
```

Y al final del archivo:

```ts
test('frescuraDe: sin fecha, vigente (0-6 dias), desactualizado (7+ dias)', () => {
  assert.equal(frescuraDe(null, '2026-07-14'), 'sin_fecha');
  assert.equal(frescuraDe('2026-07-14', '2026-07-14'), 'vigente'); // hoy: 0 dias
  assert.equal(frescuraDe('2026-07-08', '2026-07-14'), 'vigente'); // 6 dias
  assert.equal(frescuraDe('2026-07-07', '2026-07-14'), 'desactualizado'); // 7 dias
  assert.equal(frescuraDe('2026-06-01', '2026-07-14'), 'desactualizado');
});

test('bucketDeEtapa: estados calientes son cierre, el resto es lead', () => {
  assert.equal(bucketDeEtapa('oportunidad'), 'cierre');
  assert.equal(bucketDeEtapa('reunion_agendada'), 'cierre');
  assert.equal(bucketDeEtapa('lead'), 'lead');
  assert.equal(bucketDeEtapa('contacto_iniciado'), 'lead');
  assert.equal(bucketDeEtapa('on_hold'), 'lead');
  assert.equal(bucketDeEtapa(null), 'lead');
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: FAIL — `frescuraDe`/`bucketDeEtapa` no existen.

- [ ] **Step 3: Implementar en `agenda.ts`**

Agregar el import de `ESTADOS_CALIENTES` al inicio del archivo:

```ts
import { ESTADOS_CALIENTES } from '../db/funnel';
```

Y al final del archivo:

```ts
export type Bucket = 'lead' | 'cierre' | 'reagendar';
export type Frescura = 'vigente' | 'desactualizado' | 'sin_fecha';

// 7+ dias vencido deja de sentirse "urgente" y pasa a ser bagaje viejo que hay que
// limpiar, no un toque real de hoy (decision 2026-07-14).
const UMBRAL_DESACTUALIZADO_DIAS = 7;

export function frescuraDe(fecha: string | null, hoy: string): Frescura {
  if (!fecha) return 'sin_fecha';
  return diasVencido(fecha, hoy) >= UMBRAL_DESACTUALIZADO_DIAS ? 'desactualizado' : 'vigente';
}

// A que bucket pertenece una empresa por su estado_notion. Usado para las filas que NO
// vienen ya taggeadas (los pasos de cadencia, que pueden ser de cualquier estado). El
// bucket 'reagendar' NUNCA sale de aqui -- ese lo asigna el caller explicitamente (viene
// de colaReagendar, se deriva del ULTIMO TOQUE, no del estado_notion solo).
export function bucketDeEtapa(estado: string | null): 'lead' | 'cierre' {
  return estado != null && (ESTADOS_CALIENTES as readonly string[]).includes(estado) ? 'cierre' : 'lead';
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cola/agenda.ts app/cola/agenda.test.ts
git commit -m "feat(cola): Bucket/Frescura + frescuraDe/bucketDeEtapa"
```

---

## Task 4: `unificarCola` + `aplicarFiltrosUnificados` (TDD)

**Files:**
- Modify: `app/cola/agenda.ts`
- Modify: `app/cola/agenda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `app/cola/agenda.test.ts` (extender el `import` con `unificarCola,
aplicarFiltrosUnificados, type FilaColaConBucket, type FiltrosUnificados`) y actualizar
`filaColaBase` para incluir `campana`:

```ts
function filaColaBase(id: string, fecha: string | null): FilaCola {
  return { id, empresa: `Empresa ${id}`, ciudad: null, contacto: null, cargo: null, canal: null, estado: 'on_hold', fecha, campana: null };
}

function filaConBucket(id: string, fecha: string | null, bucket: Bucket, campana: string | null = null): FilaColaConBucket {
  return { ...filaColaBase(id, fecha), campana, bucket };
}
```

(Agregar también `import { ... type Bucket } from './agenda.ts';` si `Bucket` no está ya
importado como tipo.)

Y al final del archivo:

```ts
test('unificarCola: ordena vigente < sin_fecha < desactualizado, y dentro de cada grupo por fecha ascendente', () => {
  const filas: FilaColaConBucket[] = [
    filaConBucket('viejo', '2026-06-01', 'lead'), // desactualizado (43 dias)
    filaConBucket('hoy', '2026-07-14', 'lead'), // vigente
    filaConBucket('sinfecha', null, 'cierre'),
    filaConBucket('vencido3d', '2026-07-11', 'reagendar'), // vigente
  ];

  const r = unificarCola(filas, '2026-07-14');
  assert.deepEqual(r.map((f) => f.id), ['vencido3d', 'hoy', 'sinfecha', 'viejo']);
  assert.equal(r[0].actual, true); // el primero de la lista ordenada es "AHORA"
  assert.equal(r[1].actual, false);
  assert.equal(r.find((f) => f.id === 'viejo')?.frescura, 'desactualizado');
});

test('unificarCola: cierre usa filaSinVencimiento (sin severidad de vencido), lead/reagendar usan vencido', () => {
  const filas: FilaColaConBucket[] = [
    filaConBucket('c1', '2026-06-01', 'cierre'), // muy vencido, pero es cierre: no dice "vencido"
    filaConBucket('l1', '2026-06-01', 'lead'), // muy vencido y es lead: si dice "vencido"
  ];
  const r = unificarCola(filas, '2026-07-14');
  const c1 = r.find((f) => f.id === 'c1')!;
  const l1 = r.find((f) => f.id === 'l1')!;
  assert.equal(c1.severidadTexto, '2026-06-01'); // filaSinVencimiento: la fecha tal cual
  assert.equal(l1.severidadTexto.startsWith('vencido'), true);
});

test('aplicarFiltrosUnificados: sin filtros trae todo; cada filtro corta por su campo', () => {
  const filas: FilaColaConBucket[] = [
    filaConBucket('a', '2026-07-14', 'lead', 'Campana A'),
    filaConBucket('b', '2026-07-14', 'cierre', 'Campana B'),
  ];
  const unificadas = unificarCola(filas, '2026-07-14').map((f, i) => ({ ...f, canal: i === 0 ? 'llamada' : 'correo' }) as const);

  const sinFiltro: FiltrosUnificados = { bucket: 'todos', campana: 'todas', canal: 'todos', frescura: 'todas' };
  assert.equal(aplicarFiltrosUnificados(unificadas, sinFiltro).length, 2);

  const soloLead = aplicarFiltrosUnificados(unificadas, { ...sinFiltro, bucket: 'lead' });
  assert.deepEqual(soloLead.map((f) => f.id), ['a']);

  const soloCampanaB = aplicarFiltrosUnificados(unificadas, { ...sinFiltro, campana: 'Campana B' });
  assert.deepEqual(soloCampanaB.map((f) => f.id), ['b']);
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: FAIL — `unificarCola`/`aplicarFiltrosUnificados`/`FilaColaConBucket`/
`FiltrosUnificados` no existen.

- [ ] **Step 3: Implementar en `agenda.ts`**

Agregar al final del archivo:

```ts
export type FilaColaConBucket = FilaCola & { bucket: Bucket };

export type FilaUnificada = FilaAgenda & {
  bucket: Bucket;
  campana: string | null;
  frescura: Frescura;
};

function filaUnificada(c: FilaColaConBucket, hoy: string, actual: boolean): FilaUnificada {
  const base = c.bucket === 'cierre' ? filaSinVencimiento(c) : filaConVencimiento(c, hoy, actual);
  return { ...base, bucket: c.bucket, campana: c.campana, frescura: frescuraDe(c.fecha, hoy) };
}

// Mezcla las filas de las 4 fuentes (Leads/Cierres/Reagendar/pasos de cadencia, ya
// taggeadas con su bucket por el caller) en una sola lista ordenada: primero lo vigente,
// luego lo sin fecha, al final lo desactualizado -- dentro de cada grupo, la fecha mas
// vieja primero (mas urgente arriba). El primero de la lista resultante es "actual"
// (el que pinta la barra "AHORA").
export function unificarCola(filas: FilaColaConBucket[], hoy: string): FilaUnificada[] {
  const pesoFrescura: Record<Frescura, number> = { vigente: 0, sin_fecha: 1, desactualizado: 2 };
  const ordenadas = [...filas].sort((a, b) => {
    const pa = pesoFrescura[frescuraDe(a.fecha, hoy)];
    const pb = pesoFrescura[frescuraDe(b.fecha, hoy)];
    if (pa !== pb) return pa - pb;
    return (a.fecha ?? '9999-99-99').localeCompare(b.fecha ?? '9999-99-99');
  });
  return ordenadas.map((c, i) => filaUnificada(c, hoy, i === 0));
}

export type FiltrosUnificados = {
  bucket: Bucket | 'todos';
  campana: string | 'todas';
  canal: FiltroCanal;
  frescura: Frescura | 'todas';
};

export function aplicarFiltrosUnificados(filas: FilaUnificada[], f: FiltrosUnificados): FilaUnificada[] {
  return filas.filter(
    (r) =>
      (f.bucket === 'todos' || r.bucket === f.bucket) &&
      (f.campana === 'todas' || r.campana === f.campana) &&
      (f.canal === 'todos' || r.canal === f.canal) &&
      (f.frescura === 'todas' || r.frescura === f.frescura),
  );
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Actualizar `FilaCola` para incluir `campana`**

En `app/cola/agenda.ts`, cambiar el tipo `FilaCola` (ya existente):

```ts
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
```

por:

```ts
export type FilaCola = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
  canal: string | null;
  estado: string | null;
  fecha: string | null;
  campana: string | null;
};
```

- [ ] **Step 6: Correr toda la suite de agenda + repository (por el cambio de tipo)**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts app/db/repository.colaSplit.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: 0 errores (`filaColaBase` ya se actualizó en el Step 1 de esta tarea; si algún otro
sitio construye un `FilaCola` a mano, el error de tsc lo señala — arreglar agregando
`campana: null` ahí también).

- [ ] **Step 8: Commit**

```bash
git add app/cola/agenda.ts app/cola/agenda.test.ts
git commit -m "feat(cola): unificarCola + aplicarFiltrosUnificados"
```

---

## Task 5: Exportar `FilaAcciones` de `AgendaHoy.tsx` (mecánico, cero riesgo)

**Files:**
- Modify: `app/cola/AgendaHoy.tsx:140`

- [ ] **Step 1: Agregar `export`**

Cambiar:

```tsx
function FilaAcciones({
```

por:

```tsx
export function FilaAcciones({
```

(Nada más cambia en el archivo. `AgendaHoy` sigue usándolo igual, para los demás owners no hay
ninguna diferencia observable.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add app/cola/AgendaHoy.tsx
git commit -m "refactor(cola): exporta FilaAcciones para reusar en la lista unificada"
```

---

## Task 6: `ColaUnificada.tsx` — panel de filtros + lista (client component)

**Files:**
- Create: `app/cola/ColaUnificada.tsx`

> Sin test dedicado (componente cliente, sin infra de testing de React en el repo — mismo
> criterio que el resto de la UI de este proyecto). Se verifica con typecheck + revisión manual.

- [ ] **Step 1: Crear el componente**

```tsx
// app/cola/ColaUnificada.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '../ui/cn';
import { Chip } from '../ui/Chip';
import { CanalDot } from '../ui/CanalTag';
import { CANAL_DOT_HALO } from '../ui/canal-tag.variants.ts';
import { pillParaEstado } from '../ui/pill.variants.ts';
import { SeverityText } from '../ui/SeverityText';
import { FilaAcciones } from './AgendaHoy';
import {
  aplicarFiltrosUnificados,
  type FilaUnificada,
  type FiltrosUnificados,
  type Bucket,
  type Frescura,
} from './agenda.ts';

const BUCKET_LABEL: Record<Bucket, string> = { lead: 'Lead', cierre: 'Cierre', reagendar: 'Reagendar' };
const FRESCURA_LABEL: Record<Frescura, string> = { vigente: 'Vigente', desactualizado: 'Desactualizado', sin_fecha: 'Sin fecha' };

const FILTROS_INICIALES: FiltrosUnificados = { bucket: 'todos', campana: 'todas', canal: 'todos', frescura: 'todas' };

export function ColaUnificada({
  filas,
  registrarTapAction,
}: {
  filas: FilaUnificada[];
  registrarTapAction: (formData: FormData) => void | Promise<void>;
}) {
  const [filtros, setFiltros] = useState<FiltrosUnificados>(FILTROS_INICIALES);
  const visibles = aplicarFiltrosUnificados(filas, filtros);
  const campanas = [...new Set(filas.map((f) => f.campana).filter((c): c is string => c != null))].sort();

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex-1 overflow-hidden rounded-xl border border-line-card bg-card">
        <div className="flex items-center justify-between gap-3 px-7 pt-6 pb-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-faint">Tus toques</span>
          <span className="text-xs text-faint">
            {visibles.length} de {filas.length}
          </span>
        </div>

        <div className="mx-7 h-px bg-line-card" />

        {visibles.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-muted">Nada con estos filtros.</div>
        ) : (
          <div className="flex flex-col gap-2 px-4 py-4">
            {visibles.map((fila, i) => {
              const pill = pillParaEstado(fila.estado);
              return (
                <div
                  key={fila.id}
                  className={cn(
                    'group relative flex items-center gap-1 rounded-xl border border-line-card bg-surface-2 transition-colors duration-150 hover:border-accent-soft hover:bg-card-hover',
                    fila.actual && 'border-border-accent bg-surface-hi hover:bg-surface-hi',
                  )}
                >
                  <Link href={`/llamada/${fila.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-3 py-3.5">
                    <div className={cn('w-8 flex-shrink-0 text-sm tabular-nums', fila.actual ? 'font-serif text-base leading-none text-ink' : 'text-muted')}>
                      {i + 1}
                    </div>
                    <CanalDot canal={fila.canal} className={cn(fila.actual && CANAL_DOT_HALO[fila.canal])} />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className={cn('truncate text-sm', fila.actual ? 'font-semibold text-ink' : 'font-medium text-ink-soft')}>
                        {fila.empresa}
                      </span>
                      {(pill || fila.ciudad || fila.campana) && (
                        <span className="shrink-0 truncate text-xs text-faint">
                          · {[pill?.label, fila.ciudad, fila.campana].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    {fila.actual ? (
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-acento">Ahora</span>
                    ) : fila.frescura === 'desactualizado' ? (
                      <span className="shrink-0 text-xs text-faint">desactualizado</span>
                    ) : (
                      <SeverityText variant={fila.sev} className="shrink-0 text-xs">
                        {fila.severidadTexto}
                      </SeverityText>
                    )}
                  </Link>
                  <FilaAcciones idEmpresa={fila.id} registrarTapAction={registrarTapAction} />
                </div>
              );
            })}
          </div>
        )}

        <div className="pb-4" />
      </div>

      <div className="w-full shrink-0 space-y-5 lg:w-64">
        <FiltroGrupo
          titulo="Etapa"
          opciones={[{ v: 'todos' as const, l: 'Todos' }, ...(['lead', 'cierre', 'reagendar'] as Bucket[]).map((b) => ({ v: b, l: BUCKET_LABEL[b] }))]}
          valor={filtros.bucket}
          onChange={(bucket) => setFiltros((f) => ({ ...f, bucket }))}
        />
        {campanas.length > 0 && (
          <FiltroGrupo
            titulo="Campaña"
            opciones={[{ v: 'todas' as const, l: 'Todas' }, ...campanas.map((c) => ({ v: c, l: c }))]}
            valor={filtros.campana}
            onChange={(campana) => setFiltros((f) => ({ ...f, campana }))}
          />
        )}
        <FiltroGrupo
          titulo="Canal"
          opciones={[
            { v: 'todos' as const, l: 'Todos' },
            { v: 'llamada' as const, l: 'Llamadas' },
            { v: 'correo' as const, l: 'Correos' },
            { v: 'whatsapp' as const, l: 'WhatsApp' },
          ]}
          valor={filtros.canal}
          onChange={(canal) => setFiltros((f) => ({ ...f, canal }))}
        />
        <FiltroGrupo
          titulo="Frescura"
          opciones={[{ v: 'todas' as const, l: 'Todas' }, ...(['vigente', 'desactualizado'] as Frescura[]).map((fr) => ({ v: fr, l: FRESCURA_LABEL[fr] }))]}
          valor={filtros.frescura}
          onChange={(frescura) => setFiltros((f) => ({ ...f, frescura }))}
        />
      </div>
    </div>
  );
}

function FiltroGrupo<T extends string>({
  titulo,
  opciones,
  valor,
  onChange,
}: {
  titulo: string;
  opciones: { v: T; l: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">{titulo}</div>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <Chip key={o.v} tone="accent" on={valor === o.v} onClick={() => onChange(o.v)}>
            {o.l}
          </Chip>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add app/cola/ColaUnificada.tsx
git commit -m "feat(cola): componente ColaUnificada (panel de filtros + lista)"
```

---

## Task 7: Wire `/cola` — usar la lista unificada cuando `splitActivo`

**Files:**
- Modify: `app/cola/page.tsx`

- [ ] **Step 1: Importar lo nuevo**

Cambiar:

```ts
import { colaDelDia, colaLeads, colaCierres, colaReagendar, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
```

por:

```ts
import { colaDelDia, colaLeads, colaCierres, colaReagendar, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
import { unificarCola, bucketDeEtapa, type FilaColaConBucket } from "./agenda.ts";
```

Y agregar el import del componente nuevo junto a `import CadenciasHoy from "./CadenciasHoy";`:

```ts
import { ColaUnificada } from "./ColaUnificada";
```

- [ ] **Step 2: Armar la lista unificada cuando `splitActivo`**

Después del bloque que arma `cadenciasHoy` (después de `});` que cierra ese `.map`), agregar:

```ts
  // Lista unificada (2026-07-14): solo para Sebastian. GrupoBatch (esManual=1 + modo=batch)
  // queda fuera -- ese flujo aprueba varias empresas a la vez con un solo copy, no cabe en
  // una fila por empresa; se sigue mostrando aparte reusando CadenciasHoy tal cual.
  const cadenciasParaCadenciasHoy = splitActivo ? cadenciasHoy.filter((t) => t.esManual === 1 && t.modo === 'batch') : cadenciasHoy;
  const cadenciasParaUnificar = splitActivo ? cadenciasHoy.filter((t) => !(t.esManual === 1 && t.modo === 'batch')) : [];

  const filasParaUnificar: FilaColaConBucket[] = splitActivo
    ? [
        ...cola.map((c): FilaColaConBucket => ({ ...c, bucket: 'lead' })),
        ...cierres.map((c): FilaColaConBucket => ({ ...c, bucket: 'cierre' })),
        ...reagendar.map((c): FilaColaConBucket => ({ ...c, bucket: 'reagendar' })),
        ...cadenciasParaUnificar.map(
          (t): FilaColaConBucket => ({
            id: t.idEmpresa,
            empresa: t.empresaNombre,
            ciudad: t.ciudad,
            contacto: t.nombre,
            cargo: null,
            canal: t.canal,
            estado: t.estadoNotion,
            fecha: t.fechaProgramada ? t.fechaProgramada.slice(0, 10) : null,
            campana: t.nombreCampana,
            bucket: bucketDeEtapa(t.estadoNotion),
          }),
        ),
      ]
    : [];

  const filasUnificadas = splitActivo ? unificarCola(filasParaUnificar, hoy) : [];
```

- [ ] **Step 3: Renderizar `ColaUnificada` en vez de las 3 secciones cuando `splitActivo`**

Reemplazar el `<section id="today-agenda">` completo:

```tsx
      <section id="today-agenda">
        {filas.length === 0 ? (
          <div className="rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
            Sin follow-ups para hoy. Buen trabajo.
          </div>
        ) : (
          <AgendaHoy filas={filas} registrarTapAction={registrarTapAction} />
        )}

        {cadenciasHoy.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-line-card bg-card px-7 py-6">
            <CadenciasHoy items={cadenciasHoy} hoy={hoy} />
          </div>
        )}

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
      </section>
```

por:

```tsx
      <section id="today-agenda">
        {splitActivo ? (
          <>
            {filasUnificadas.length === 0 ? (
              <div className="rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
                Sin follow-ups pendientes. Buen trabajo.
              </div>
            ) : (
              <ColaUnificada filas={filasUnificadas} registrarTapAction={registrarTapAction} />
            )}

            {cadenciasParaCadenciasHoy.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-line-card bg-card px-7 py-6">
                <CadenciasHoy items={cadenciasParaCadenciasHoy} hoy={hoy} />
              </div>
            )}
          </>
        ) : (
          <>
            {filas.length === 0 ? (
              <div className="rounded-xl border border-line-card bg-card py-8 text-center text-[13px] text-muted">
                Sin follow-ups para hoy. Buen trabajo.
              </div>
            ) : (
              <AgendaHoy filas={filas} registrarTapAction={registrarTapAction} />
            )}

            {cadenciasHoy.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-line-card bg-card px-7 py-6">
                <CadenciasHoy items={cadenciasHoy} hoy={hoy} />
              </div>
            )}
          </>
        )}
      </section>
```

(`filasCierres`/`filasReagendar` -- que ya no se usan en el JSX -- se pueden dejar declaradas
si `tsc` no se queja por variable sin usar; si el proyecto tuviera `noUnusedLocals` activado,
borrarlas junto con su cálculo. Verificar en el Step 4.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si `filasCierres`/`filasReagendar` quedaron sin uso y no generan error
(el proyecto no tiene `noUnusedLocals`), déjalas: siguen siendo necesarias para la rama
`!splitActivo`... **espera**, no: revisar que efectivamente ya no se usan en ningún lado del
archivo tras el reemplazo del Step 3 (la rama `!splitActivo` no las usa, usa `filas`). Si
`tsc --noEmit` pasa limpio, no hace falta tocarlas; si el linter del proyecto (`npm run lint`,
si existe) marca no-unused-vars, borrar esas dos líneas (`const filasCierres = ...` y
`const filasReagendar = ...`) junto con `cierres`/`reagendar` si tampoco se usan ya fuera de
`filasParaUnificar`.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add app/cola/page.tsx
git commit -m "feat(cola): /cola usa la lista unificada con filtros para Sebastian"
```

---

## Task 8: Verificación final local

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: 0 fallos.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Pedir a Sebastián que revise en el navegador**

La IA no levanta el dev server. Pedirle:
1. `npm run dev`, entrar a `/cola` con su sesión.
2. Confirmar que ve UNA lista (no 3 secciones), con el panel de filtros a la derecha
   (Etapa/Campaña/Canal/Frescura).
3. Probar cada filtro y confirmar que corta la lista como se espera.
4. Si tiene algún toque vencido 7+ días en su data real, confirmar que dice "desactualizado"
   en vez de "vencido Nd".
5. Confirmar que ya NO aparece el bloque grande "Cadencias de hoy" con todo mezclado (solo
   aparecería, chico, si tiene alguna campaña en modo batch — improbable con su data actual).
6. Confirmar que para otro owner (o `?owner=Felipe Castro`, si su sesión puede verla) la
   pantalla se ve exactamente igual que antes de este plan (3 secciones no aplican porque
   nunca se activaron para Felipe; la vista de Felipe usa el camino `colaDelDia` original,
   sin cambios).

---

## Fuera de este plan

- El tema de `contacto_iniciado` sin cadencia (Felipe) — spec aparte, no entra aquí.
- Extender esto a otros owners — el gate es un solo `if (splitActivo)`; documentado en el
  spec cómo ampliarlo cuando se apruebe.
- Migración de datos y borrado de campañas de prueba en el VPS — sigue pendiente, aparte.

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** lista única con filtros (Task 6-7), umbral 7 días (Task 3),
  nombre de campaña en la tarjeta (Task 1-2, Task 6), cadencias integradas sin perder su
  editor (Task 7, con la exclusión explícita de `GrupoBatch` documentada y justificada en el
  contexto). Todo cubierto.
- **Placeholders:** cada step trae código completo.
- **Consistencia de tipos:** `FilaCola` (con `campana`) es el contrato entre las queries
  (Task 1-2) y `agenda.ts` (Task 3-4). `FilaColaConBucket` es el contrato entre `page.tsx`
  (Task 7, arma las 4 fuentes) y `unificarCola` (Task 4). `FilaUnificada` es el contrato entre
  `unificarCola`/`aplicarFiltrosUnificados` (Task 4) y `ColaUnificada.tsx` (Task 6). Mismos
  nombres en todas las tareas que los usan.
- **Capas:** la mezcla de fuentes (`unificarCola`) vive en `agenda.ts` (dominio de la UI de
  cola, puro, sin DB). El repository sigue siendo el único que toca SQL. `ColaUnificada.tsx`
  reusa `FilaAcciones` en vez de duplicar lógica de acción rápida.
