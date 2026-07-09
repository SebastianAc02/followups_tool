# Multi-organización real — Plan 2 (filtrado de segmentos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrar por organización las 13 funciones de `app/db/repository.ts` que tocan
`segmento`/`segmento_exclusion`, sin tocar nada de campañas/inscripciones/toques/reporting
(Parte 3, en paralelo). Al terminar, un segmento creado bajo la organización A es invisible
(lectura) e inmodificable (escritura) desde la organización B, aunque adivine su `idSegmento`.

**Architecture:** `segmento` ya tiene `id_organizacion` (columna real, migrada en Parte 1,
`NOT NULL DEFAULT 1`). Las funciones de solo lectura sobre `empresa` (vía `DefinicionSegmento`)
filtran por `empresa.organizacionActivaId`; las de lectura sobre `segmento` filtran por
`segmento.idOrganizacion`. Las de escritura sobre un segmento YA EXISTENTE (`actualizarSegmento`,
`excluirDeSegmento`, `incluirDeSegmento`) usan un guard silencioso (no-op si el segmento no es
tuyo) en vez de tirar excepción — ver la nota de diseño más abajo, es una decisión deliberada
distinta al guard con `throw` de `registrarToque`/`actualizarCampoCalificacion` en Parte 1.
`idOrganizacion` siempre como ÚLTIMO parámetro posicional (misma convención que Parte 1).

**Nota de diseño — por qué NO copio el guard con `throw` de Parte 1:**
`registrarToque`/`actualizarCampoCalificacion` escriben sobre `empresa`, cuyo campo
`organizacionActivaId` es MUTABLE (quién tiene la relación *ahora*) — un intento de tocar el
lead de otra organización es una condición de carrera real, digna de un error explícito que el
caller pueda capturar y mostrar. `segmento.idOrganizacion` es distinto: se fija una sola vez al
crear el segmento y nunca cambia, y las funciones de LECTURA ya establecidas en este mismo plan
(`obtenerSegmento`, `listarSegmentos`) tratan "es de otra organización" igual que "no existe"
(devuelven `null`/lista vacía, sin distinguir). Si `actualizarSegmento` tirara una excepción
distinguible para el caso "existe pero no es tuyo", eso FILTRARÍA información que
`obtenerSegmento` deliberadamente esconde (confirmaría la existencia de un `idSegmento` ajeno).
Por eso las 3 funciones de escritura sobre un segmento existente usan el mismo criterio opaco:
guard silencioso, no-op, cero filas afectadas, sin excepción.

**Fuera de mi alcance (Parte 3, en paralelo, mismo repo, rama distinta):** cualquier función de
`campana`/`inscripcion`/`destinatario`/`pasoInscripcion`/`eventoTracking` en `repository.ts`,
`app/worker/*`, `app/campanas/*`, `app/actions.ts`, `app/panel/*`. Esos archivos SÍ llaman a
varias de las 13 funciones de este plan (ej. `app/campanas/actions.ts` llama `obtenerSegmento`
y `actualizarSegmento` sin el nuevo parámetro; `repository.ts:1737` y `:2008`, dentro de
funciones de campañas, llaman `empresasParaRevision`). Es normal y esperado que
`npx tsc --noEmit` reporte errores ahí al final de este plan — son call sites de la Parte 3,
que los resuelve al threadear `idOrganizacion` por su propio código (mismo patrón que la Task 15
de Parte 1, pero esos call sites puntuales quedan fuera de mi bandera de archivos tocables).

**Tech Stack:** Next.js, Drizzle ORM sobre SQLite (`isps.db`), `node:test` + `better-sqlite3`.

**Spec:** `docs/superpowers/specs/2026-07-09-multi-organizacion-real-design.md`
**Plan de referencia (convenciones):** `docs/superpowers/plans/2026-07-09-multi-organizacion-plan1-cola.md`

---

## Contexto para quien ejecute esto

- Este plan corre en el worktree `multi-organizacion-plan2-segmentos`
  (`.claude/worktrees/multi-organizacion-plan2-segmentos`, rama
  `worktree-multi-organizacion-plan2-segmentos`), ya creado y sincronizado con `main` en
  `08ecbae` (Parte 1 ya mergeada: `empresa.organizacionActivaId`, `segmento.idOrganizacion`,
  sesión con `idOrganizacion`, todo ya disponible — no hace falta tocar schema ni migración).
- `test-helpers.ts` YA tiene `id_organizacion INTEGER NOT NULL DEFAULT 1` en `segmento`, y
  `organizacion_activa_id INTEGER NOT NULL DEFAULT 1` en `empresa` (Task 3 de Parte 1). Los ~13
  archivos de test que insertan `empresa`/`segmento` sin mencionar organización siguen
  funcionando igual (caen en el default = Onepay). NO hace falta tocar `test-helpers.ts`.
  Confirmado leyendo el archivo directamente antes de escribir este plan.
- `segmento_exclusion` NO tiene columna propia de organización (hereda por join a `segmento`,
  spec Parte 1) — el filtro para `excluirDeSegmento`/`incluirDeSegmento` es un guard sobre
  `segmento`, no un WHERE directo sobre `segmento_exclusion`.
- Corré los tests con: `npm test` o apuntado a un archivo:
  `node --experimental-strip-types --test app/db/repository.segmento.test.ts`.
- 8 archivos de test AJENOS a este plan (de Parte 3: goteo, agenda, colaUnificada, copyApollo,
  materializar, push, inscripcion, tracking) usan `guardarSegmento(...)` como fixture de setup
  para sus propios tests de campañas, y `repository.inscripcion.test.ts` también llama
  `excluirDeSegmento(idSegmento, 'e-primero')`. Cambiar la firma de esas dos funciones ROMPE esos
  9 call sites en runtime (no solo tipos: `idOrganizacion` quedaría `undefined`, y el INSERT/
  UPDATE fallaría contra la columna `NOT NULL`). Este plan SÍ actualiza esos 9 call sites (son
  adiciones mecánicas de un argumento `1` al final, cero lógica de negocio) para mantener
  `npm test` en verde — no toca nada más de esos archivos. Ver Task 3 y Task 11.
- `obtenerSegmento`, `actualizarSegmento` y `muestraDestinatarioDeSegmento` HOY no tienen NINGÚN
  test unitario (solo se usan desde `app/campanas/*`, fuera de mi alcance). Sus tasks (4, 5, 13)
  escriben el primer test desde cero, no solo el caso de organización.

---

### Task 1: `empresasDeSegmento` filtra por `organizacion_activa_id`

**Files:**
- Modify: `app/db/repository.ts:1173` (función), `app/db/repository.segmento.test.ts`,
  `app/db/repository.segmentoRol.test.ts`, `app/db/repository.ordenLimite.test.ts`

- [ ] **Step 1: Agregar el caso que falla en `repository.segmento.test.ts`**

Agregar `idOrganizacion: number` como segundo parámetro. Actualizar TODAS las llamadas
existentes a `empresasDeSegmento(def)` en `repository.segmento.test.ts`,
`repository.segmentoRol.test.ts` y `repository.ordenLimite.test.ts` para que pasen `1` como
segundo argumento (la organización Onepay, que es la que sembraron esos archivos). Agregar un
test nuevo en `repository.segmento.test.ts`, antes de `test.after`:

```ts
test('empresasDeSegmento no ve empresas de otra organizacion', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES ('e-otra-org', 'nit', 'Otra Org', 'otra org', 'activo', 'on_hold', 2)`,
    )
    .run();
  raw.close();

  const def = { condiciones: [{ campo: 'estado' as const, op: 'en' as const, valores: ['on_hold'] }] };
  const desdeOrg1 = empresasDeSegmento(def, 1);
  assert.ok(!desdeOrg1.some((e) => e.id === 'e-otra-org'), 'org 1 no debe ver el lead de la org 2');

  const desdeOrg2 = empresasDeSegmento(def, 2);
  assert.deepEqual(desdeOrg2.map((e) => e.id), ['e-otra-org']);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool/.claude/worktrees/multi-organizacion-plan2-segmentos && node --experimental-strip-types --test app/db/repository.segmento.test.ts`
Expected: FAIL de tipos (`empresasDeSegmento` no acepta un segundo argumento).

- [ ] **Step 3: Implementar el filtro**

En `app/db/repository.ts`, modificar `empresasDeSegmento`:

```ts
export function empresasDeSegmento(def: DefinicionSegmento, idOrganizacion: number) {
  const val = definicionSegmentoSchema.parse(def);
  let q = db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      categoria: empresa.categoria,
      usuarios: empresaUsuarios.usuariosEstimados,
      ciudad: empresa.ciudadPrincipal,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(and(compilarSegmento(val), eq(empresa.organizacionActivaId, idOrganizacion)))
    .$dynamic();

  if (val.orden) {
    const col = columnaOrden(val.orden.campo);
    const direccion = val.orden.dir === 'desc' ? desc(col) : asc(col);
    q = q.orderBy(sql`${col} is null`, direccion);
  } else {
    q = q.orderBy(empresa.nombreOficial);
  }
  if (val.limite) q = q.limit(val.limite);

  return q.all();
}
```

- [ ] **Step 4: Correr los 3 archivos de test, confirmar que pasan**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts app/db/repository.segmentoRol.test.ts app/db/repository.ordenLimite.test.ts`
Expected: PASS. (`empresasConReadiness`/`empresasDeSegmentoGuardado`, que llaman internamente a
`empresasDeSegmento`, van a quedar con error de tipos hasta sus propias tasks — esperado.)

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts app/db/repository.segmentoRol.test.ts app/db/repository.ordenLimite.test.ts
git commit -m "feat(segmento): empresasDeSegmento filtra por organizacion"
```

---

### Task 2: `contarSegmento` filtra por `organizacion_activa_id`

**Files:**
- Modify: `app/db/repository.ts:1203`, `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Extender el test que falla**

En `repository.segmento.test.ts`, agregar `1` como segundo argumento a las 2 llamadas
existentes de `contarSegmento(def)`. Extender el test nuevo de Task 1 (o agregar uno junto a
él) con:

```ts
assert.equal(contarSegmento(def, 1), 0, 'org 1 no cuenta el lead de la org 2');
assert.equal(contarSegmento(def, 2), 1);
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts`

- [ ] **Step 3: Implementar el filtro**

```ts
export function contarSegmento(def: DefinicionSegmento, idOrganizacion: number): number {
  const val = definicionSegmentoSchema.parse(def);
  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(and(compilarSegmento(val), eq(empresa.organizacionActivaId, idOrganizacion)))
    .get();
  return fila?.n ?? 0;
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): contarSegmento filtra por organizacion"
```

---

### Task 3: `guardarSegmento` recibe `idOrganizacion` real (reemplaza el hardcode)

**Files:**
- Modify: `app/db/repository.ts:1216`, `app/db/repository.segmento.test.ts`
- Actualizar llamadas en: `app/db/repository.goteo.test.ts`, `app/db/repository.agenda.test.ts`,
  `app/db/repository.colaUnificada.test.ts`, `app/db/repository.copyApollo.test.ts`,
  `app/db/repository.materializar.test.ts`, `app/db/repository.push.test.ts`,
  `app/db/repository.inscripcion.test.ts`, `app/db/repository.tracking.test.ts`

- [ ] **Step 1: Extender el test que falla en `repository.segmento.test.ts`**

Agregar `1` como segundo argumento a las 4 llamadas existentes de `guardarSegmento({...})` en
ese archivo. Agregar un test nuevo antes de `test.after`:

```ts
test('guardarSegmento escribe el id_organizacion real, no el hardcode', () => {
  const id = guardarSegmento({ nombre: 'seg-org-2', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 2);
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT id_organizacion FROM segmento WHERE id_segmento = ?').get(id) as any;
  raw.close();
  assert.equal(fila.id_organizacion, 2);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts`
Expected: FAIL (tipos: `guardarSegmento` no acepta un segundo argumento; o, si igual corre, el
`id_organizacion` guardado es `1` por el hardcode, no `2`).

- [ ] **Step 3: Implementar**

```ts
export function guardarSegmento(input: { nombre: string; definicion: DefinicionSegmento; descripcionNatural?: string }, idOrganizacion: number): number {
  const val = definicionSegmentoSchema.parse(input.definicion);
  const ahora = new Date().toISOString();
  const ins = db
    .insert(segmento)
    .values({
      nombre: input.nombre,
      definicion: JSON.stringify(val),
      descripcionNatural: input.descripcionNatural ?? null,
      idOrganizacion,
      createdAt: ahora,
      updatedAt: ahora,
    })
    .run();
  return Number(ins.lastInsertRowid);
}
```

- [ ] **Step 4: Correr `repository.segmento.test.ts`, confirmar que pasa**

- [ ] **Step 5: Actualizar los 9 call sites de fixtures en archivos de Parte 3**

En cada uno de estos archivos, agregar `, 1` como segundo argumento a CADA llamada de
`guardarSegmento({...})` (son fixtures de setup, la organización siempre debe ser `1` porque
esos archivos siembran todo lo demás bajo el default Onepay):
- `repository.goteo.test.ts` (3 llamadas: líneas ~46, ~82, ~100)
- `repository.agenda.test.ts` (1 llamada: línea ~37)
- `repository.colaUnificada.test.ts` (4 llamadas: líneas ~66, ~67, ~143, ~176)
- `repository.copyApollo.test.ts` (1 llamada: línea ~31)
- `repository.materializar.test.ts` (4 llamadas: líneas ~64, ~87, ~120, ~142)
- `repository.push.test.ts` (2 llamadas: líneas ~66, ~67)
- `repository.inscripcion.test.ts` (1 llamada: línea ~60)
- `repository.tracking.test.ts` (1 llamada: línea ~66)

Las líneas exactas pueden haberse movido; usar
`grep -n "guardarSegmento(" <archivo>` en cada uno para confirmar antes de editar. NO tocar
nada más de esos archivos (son fixtures de Parte 3, fuera de mi alcance salvo esta línea).

- [ ] **Step 6: Correr el suite completo**

Run: `npm test 2>&1 | tail -80`
Expected: todo en verde, incluidos los 8 archivos de Parte 3 tocados en el Step 5 (van a seguir
fallando por otros motivos de tipos SOLO si Parte 3 todavía no compiló su propia rama contra
esto — pero como estamos en worktrees separados, en esta rama deben pasar limpio).

- [ ] **Step 7: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts app/db/repository.goteo.test.ts app/db/repository.agenda.test.ts app/db/repository.colaUnificada.test.ts app/db/repository.copyApollo.test.ts app/db/repository.materializar.test.ts app/db/repository.push.test.ts app/db/repository.inscripcion.test.ts app/db/repository.tracking.test.ts
git commit -m "feat(segmento): guardarSegmento recibe idOrganizacion real, ya no hardcodea Onepay"
```

---

### Task 4: `obtenerSegmento` filtra por `id_organizacion` (primer test del archivo)

**Files:**
- Modify: `app/db/repository.ts:1238`, `app/db/repository.segmento.test.ts`

`obtenerSegmento` hoy no tiene ningún test unitario (solo se usa desde `app/campanas/actions.ts`
y `app/campanas/[id]/segmento/page.tsx`, fuera de mi alcance). Este task escribe su primer test.

- [ ] **Step 1: Escribir el test que falla**

Agregar en `repository.segmento.test.ts`, antes de `test.after`:

```ts
test('obtenerSegmento devuelve el segmento completo, y null si es de otra organizacion o no existe', () => {
  const id = guardarSegmento(
    { nombre: 'obtener-1', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] }, descripcionNatural: 'los en on-hold' },
    1,
  );

  const propio = obtenerSegmento(id, 1);
  assert.ok(propio);
  assert.equal(propio!.nombre, 'obtener-1');
  assert.equal(propio!.descripcionNatural, 'los en on-hold');
  assert.deepEqual(propio!.definicion, { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] });

  assert.equal(obtenerSegmento(id, 2), null, 'la organizacion 2 no debe poder leer el segmento de la 1');
  assert.equal(obtenerSegmento(99999, 1), null);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts`
Expected: FAIL (tipos: `obtenerSegmento` no acepta un segundo argumento).

- [ ] **Step 3: Implementar el filtro**

```ts
export function obtenerSegmento(idSegmento: number, idOrganizacion: number): { id: number; nombre: string; definicion: DefinicionSegmento; descripcionNatural: string | null } | null {
  const fila = db
    .select({ nombre: segmento.nombre, definicion: segmento.definicion, descripcionNatural: segmento.descripcionNatural })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!fila) return null;
  return { id: idSegmento, nombre: fila.nombre, definicion: definicionSegmentoSchema.parse(JSON.parse(fila.definicion)), descripcionNatural: fila.descripcionNatural };
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): obtenerSegmento filtra por organizacion (primer test del archivo)"
```

---

### Task 5: `actualizarSegmento` — guard silencioso, primer test del archivo

**Files:**
- Modify: `app/db/repository.ts:1252`, `app/db/repository.segmento.test.ts`

Sin test unitario hoy (solo se usa desde `app/campanas/actions.ts`, fuera de mi alcance).

- [ ] **Step 1: Escribir el test que falla**

```ts
test('actualizarSegmento aplica el cambio solo si el segmento es de mi organizacion', () => {
  const id = guardarSegmento({ nombre: 'actualizar-1', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);

  actualizarSegmento(id, { nombre: 'actualizar-1-otra-org' }, 2);
  assert.equal(obtenerSegmento(id, 1)!.nombre, 'actualizar-1', 'un intento desde otra organizacion no debe cambiar nada');

  actualizarSegmento(id, { nombre: 'actualizar-1-renombrado' }, 1);
  assert.equal(obtenerSegmento(id, 1)!.nombre, 'actualizar-1-renombrado');
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts`
Expected: FAIL (tipos, o el rename desde la organización 2 sí pega).

- [ ] **Step 3: Implementar el guard silencioso**

```ts
export function actualizarSegmento(idSegmento: number, cambios: { nombre?: string; definicion?: DefinicionSegmento; descripcionNatural?: string }, idOrganizacion: number): void {
  const sets: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) sets.nombre = cambios.nombre;
  if (cambios.definicion !== undefined) sets.definicion = JSON.stringify(definicionSegmentoSchema.parse(cambios.definicion));
  if (cambios.descripcionNatural !== undefined) sets.descripcionNatural = cambios.descripcionNatural;
  if (Object.keys(sets).length === 0) return;
  sets.updatedAt = new Date().toISOString();
  // Multi-organizacion (Parte 2): el UPDATE solo pega si el segmento es de idOrganizacion.
  // Silencioso a proposito (no throw) -- ver nota de diseno al inicio del plan: coherente
  // con que obtenerSegmento ya trata "es de otra organizacion" igual que "no existe".
  db.update(segmento)
    .set(sets)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .run();
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): actualizarSegmento con guard silencioso por organizacion"
```

---

### Task 6: `listarSegmentos` requiere `idOrganizacion`

**Files:**
- Modify: `app/db/repository.ts:1262`, `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Extender el test que falla**

Agregar `1` a la llamada existente `listarSegmentos()` en el test de Task 1 ("guardar y correr
el segmento guardado da el mismo resultado"). Agregar un test nuevo:

```ts
test('listarSegmentos solo lista los de mi organizacion', () => {
  guardarSegmento({ nombre: 'listar-org1', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  guardarSegmento({ nombre: 'listar-org2', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 2);

  const org1 = listarSegmentos(1);
  assert.ok(org1.some((s) => s.nombre === 'listar-org1'));
  assert.ok(!org1.some((s) => s.nombre === 'listar-org2'));
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

- [ ] **Step 3: Implementar**

```ts
export function listarSegmentos(idOrganizacion: number) {
  return db
    .select({ id: segmento.idSegmento, nombre: segmento.nombre, descripcionNatural: segmento.descripcionNatural })
    .from(segmento)
    .where(eq(segmento.idOrganizacion, idOrganizacion))
    .orderBy(desc(segmento.idSegmento))
    .all();
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): listarSegmentos requiere idOrganizacion"
```

---

### Task 7: `valoresDistintosCampo` filtra por organización (incluido el camino `rol`)

**Files:**
- Modify: `app/db/repository.ts:1273`, `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Extender el test que falla**

Agregar `1` a las 4 llamadas existentes de `valoresDistintosCampo(...)`. Agregar un test nuevo:

```ts
test('valoresDistintosCampo no mezcla valores de otra organizacion', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES ('e-valores-org2', 'nit', 'Org2', 'org2', 'activo', 'solo_en_org_2', 2)`,
    )
    .run();
  raw.close();

  assert.ok(!valoresDistintosCampo('estado', 1).includes('solo_en_org_2'));
  assert.deepEqual(valoresDistintosCampo('estado', 2), ['solo_en_org_2']);
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

- [ ] **Step 3: Implementar (incluye el camino `rol`, que hoy no toca `empresa` — necesita join)**

```ts
export function valoresDistintosCampo(campo: CampoSegmento, idOrganizacion: number): string[] {
  if (campo === 'rol') {
    const filas = db
      .selectDistinct({ v: contacto.cargoCategoria })
      .from(contacto)
      .innerJoin(empresa, eq(empresa.idEmpresa, contacto.idEmpresa))
      .where(and(isNotNull(contacto.cargoCategoria), eq(empresa.organizacionActivaId, idOrganizacion)))
      .orderBy(contacto.cargoCategoria)
      .all();
    return filas.map((f) => String(f.v));
  }
  const { col, numerico } = COLUMNA_SEGMENTO[campo];
  if (numerico) {
    throw new Error(`el campo '${campo}' es numerico: se filtra por rango, no por lista de valores`);
  }
  const filas = db
    .selectDistinct({ v: col })
    .from(empresa)
    .where(and(isNotNull(col), eq(empresa.organizacionActivaId, idOrganizacion)))
    .orderBy(col)
    .all();
  return filas.map((f) => String(f.v));
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): valoresDistintosCampo filtra por organizacion (incluye camino rol)"
```

---

### Task 8: `empresasConReadiness` filtra por organización

**Files:**
- Modify: `app/db/repository.ts:1325`, `app/db/repository.readiness.test.ts`

- [ ] **Step 1: Extender el test que falla**

En `repository.readiness.test.ts`, agregar `1` como cuarto argumento a la llamada existente de
`empresasConReadiness(def, [...], 'saltar')`. Agregar un test nuevo antes de `test.after`:

```ts
test('empresasConReadiness no ve empresas de otra organizacion', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, categoria, organizacion_activa_id)
       VALUES ('D', 'nit', 'Empresa D', 'empresa-d', 'activo', 'isp', 2)`,
    )
    .run();
  raw.close();

  const filas = empresasConReadiness(def, ['correo', 'llamada'], 'saltar', 1);
  assert.ok(!filas.some((f) => f.id === 'D'));
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `node --experimental-strip-types --test app/db/repository.readiness.test.ts`

- [ ] **Step 3: Implementar (threadea el parámetro a `empresasDeSegmento`)**

```ts
export function empresasConReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante, idOrganizacion: number): FilaReadiness[] {
  const empresas = empresasDeSegmento(def, idOrganizacion);
  const contactosPorEmpresa = _contactosDe(empresas.map((e) => e.id));
  return empresas.map((e) => {
    const contactos = contactosPorEmpresa.get(e.id) ?? [];
    const disponibles = canalesDisponibles(contactos);
    return {
      id: e.id,
      nombre: e.nombre,
      ciudad: e.ciudad,
      usuarios: e.usuarios,
      estado: e.estado,
      canales: [...disponibles],
      readiness: readinessEmpresa(disponibles, canalesRequeridos, regla),
    };
  });
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.readiness.test.ts
git commit -m "feat(segmento): empresasConReadiness filtra por organizacion"
```

---

### Task 9: `conteosReadiness` requiere `idOrganizacion`

**Files:**
- Modify: `app/db/repository.ts:1343`, `app/db/repository.readiness.test.ts`

- [ ] **Step 1: Extender el test que falla**

Agregar `1` como cuarto argumento a la llamada existente `conteosReadiness(def, [...], 'saltar')`.
El caso de organización ya quedó cubierto indirectamente por el test de Task 8 (mismo dato,
misma cadena de llamada) — no hace falta un test de aislamiento nuevo aquí, solo confirmar que
el conteo total no cambia al pasar `1` explícito:

```ts
test('conteosReadiness sigue contando igual con idOrganizacion explicito', () => {
  const c = conteosReadiness(def, ['correo', 'llamada'], 'saltar', 1);
  assert.equal(c.total, 3, 'la empresa D (organizacion 2) del test anterior no debe sumar aqui');
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

- [ ] **Step 3: Implementar**

```ts
export function conteosReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante, idOrganizacion: number): ConteosReadiness {
  const filas = empresasConReadiness(def, canalesRequeridos, regla, idOrganizacion);
  return {
    total: filas.length,
    listas: filas.filter((f) => f.readiness.estado === 'lista').length,
    parciales: filas.filter((f) => f.readiness.estado === 'parcial').length,
    sinCanal: filas.filter((f) => f.readiness.estado === 'sin_canal').length,
    sinContacto: filas.filter((f) => f.canales.length === 0).length,
  };
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.readiness.test.ts
git commit -m "feat(segmento): conteosReadiness requiere idOrganizacion"
```

---

### Task 10: `empresasDeSegmentoGuardado` filtra por organización

**Files:**
- Modify: `app/db/repository.ts:1520`, `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Extender el test que falla**

Agregar `1` como segundo argumento a las 2 llamadas existentes de
`empresasDeSegmentoGuardado(id)` / `(99999)`. Agregar un test nuevo:

```ts
test('empresasDeSegmentoGuardado no corre el segmento de otra organizacion', () => {
  const id = guardarSegmento({ nombre: 'guardado-org1', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  assert.equal(empresasDeSegmentoGuardado(id, 2), null, 'la organizacion 2 no puede correr un segmento que no es suyo');
  assert.ok(empresasDeSegmentoGuardado(id, 1));
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

- [ ] **Step 3: Implementar (filtra la lectura del segmento Y threadea a `empresasDeSegmento`)**

```ts
export function empresasDeSegmentoGuardado(idSegmento: number, idOrganizacion: number) {
  const fila = db
    .select({ definicion: segmento.definicion })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!fila) return null;
  const def = definicionSegmentoSchema.parse(JSON.parse(fila.definicion));
  return empresasDeSegmento(def, idOrganizacion);
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): empresasDeSegmentoGuardado filtra por organizacion"
```

---

### Task 11: `excluirDeSegmento` — guard silencioso por organización

**Files:**
- Modify: `app/db/repository.ts:1530`, `app/db/repository.segmento.test.ts`,
  `app/db/repository.inscripcion.test.ts`

- [ ] **Step 1: Extender el test que falla en `repository.segmento.test.ts`**

Agregar `1` como tercer argumento a las 4 llamadas existentes de `excluirDeSegmento(id, 'eN')`
en ese archivo. Agregar un test nuevo:

```ts
test('excluirDeSegmento no hace nada si el segmento es de otra organizacion', () => {
  const id = guardarSegmento({ nombre: 'excluir-otra-org', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  excluirDeSegmento(id, 'e1', 2);
  const revision = empresasParaRevision(id, 1);
  assert.ok(revision);
  assert.equal(revision!.find((e) => e.id === 'e1')?.excluida, false, 'la organizacion 2 no debe poder excluir sobre un segmento ajeno');
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

- [ ] **Step 3: Implementar el guard silencioso**

```ts
export function excluirDeSegmento(idSegmento: number, idEmpresa: string, idOrganizacion: number): void {
  const esDeMiOrganizacion = db
    .select({ id: segmento.idSegmento })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!esDeMiOrganizacion) return;
  db.insert(segmentoExclusion)
    .values({ idSegmento, idEmpresa, createdAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}
```

- [ ] **Step 4: Correr `repository.segmento.test.ts`, confirmar que pasa**

- [ ] **Step 5: Actualizar el call site de fixture en `repository.inscripcion.test.ts`**

Agregar `, 1` a la llamada `excluirDeSegmento(idSegmento, 'e-primero')` (línea ~155). Solo esa
línea; no tocar el resto del archivo (es de Parte 3).

- [ ] **Step 6: Correr ambos archivos**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts app/db/repository.inscripcion.test.ts`

- [ ] **Step 7: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts app/db/repository.inscripcion.test.ts
git commit -m "feat(segmento): excluirDeSegmento con guard silencioso por organizacion"
```

---

### Task 12: `incluirDeSegmento` — guard silencioso por organización

**Files:**
- Modify: `app/db/repository.ts:1537`, `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Extender el test que falla**

Agregar `1` como tercer argumento a la llamada existente de `incluirDeSegmento(id, 'e3')`.
Agregar un test nuevo:

```ts
test('incluirDeSegmento no hace nada si el segmento es de otra organizacion', () => {
  const id = guardarSegmento({ nombre: 'incluir-otra-org', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  excluirDeSegmento(id, 'e2', 1);
  incluirDeSegmento(id, 'e2', 2);
  const revision = empresasParaRevision(id, 1);
  assert.ok(revision);
  assert.equal(revision!.find((e) => e.id === 'e2')?.excluida, true, 'la organizacion 2 no debe poder deshacer una exclusion ajena');
});
```

- [ ] **Step 2: Correr el test, confirmar que falla**

- [ ] **Step 3: Implementar el guard silencioso**

```ts
export function incluirDeSegmento(idSegmento: number, idEmpresa: string, idOrganizacion: number): void {
  const esDeMiOrganizacion = db
    .select({ id: segmento.idSegmento })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!esDeMiOrganizacion) return;
  db.delete(segmentoExclusion)
    .where(and(eq(segmentoExclusion.idSegmento, idSegmento), eq(segmentoExclusion.idEmpresa, idEmpresa)))
    .run();
}
```

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): incluirDeSegmento con guard silencioso por organizacion"
```

---

### Task 13: `empresasParaRevision` y `muestraDestinatarioDeSegmento` requieren `idOrganizacion`

**Files:**
- Modify: `app/db/repository.ts:1546` (`empresasParaRevision`), `:2106`
  (`muestraDestinatarioDeSegmento`), `app/db/repository.segmento.test.ts`

Se agrupan en un solo task porque `muestraDestinatarioDeSegmento` es un pass-through directo de
`empresasParaRevision` (sin lógica propia de organización) — separarlos en 2 commits no aporta
nada, sí duplicaría el mismo test. `empresasParaRevision` ya quedó indirectamente probado por
los tests de Tasks 11 y 12 (usan `empresasParaRevision(id, 1)`) — este task agrega el caso de
aislamiento explícito que falta, y crea el primer test de `muestraDestinatarioDeSegmento`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar `1` como segundo argumento a todas las llamadas de `empresasParaRevision(...)` que
quedaron de los tests anteriores (Tasks 11/12) si no se hizo ya ahí, y a las llamadas de los
tests originales de `empresasParaRevision` ("devuelve todas las del segmento...", "las
exclusiones de un segmento no afectan a otro segmento"). Agregar 2 tests nuevos antes de
`test.after`:

```ts
test('empresasParaRevision devuelve null si el segmento es de otra organizacion', () => {
  const id = guardarSegmento({ nombre: 'revision-otra-org', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  assert.equal(empresasParaRevision(id, 2), null);
});

test('muestraDestinatarioDeSegmento trae un contacto real del segmento, y null si es de otra organizacion', () => {
  const id = guardarSegmento({ nombre: 'muestra-1', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
  const muestra = muestraDestinatarioDeSegmento(id, 1);
  assert.ok(muestra);
  assert.ok(muestra!.nombre.length > 0);

  assert.equal(muestraDestinatarioDeSegmento(id, 2), null, 'otra organizacion no debe ver el destinatario de muestra');
});
```

(el seed de `repository.segmento.test.ts` ya tiene contactos con nombre para al menos una de las
empresas `on_hold` -- confirmar con `grep -n "insContacto\|INSERT INTO contacto" app/db/repository.segmento.test.ts`;
si el seed de ese archivo no trae contactos todavía, agregar un `INSERT INTO contacto` mínimo
para `e1` dentro de este mismo test, siguiendo el estilo de `repository.readiness.test.ts`).

- [ ] **Step 2: Correr el test, confirmar que falla**

Run: `node --experimental-strip-types --test app/db/repository.segmento.test.ts`

- [ ] **Step 3: Implementar ambas funciones**

```ts
export function empresasParaRevision(idSegmento: number, idOrganizacion: number) {
  const empresas = empresasDeSegmentoGuardado(idSegmento, idOrganizacion);
  if (!empresas) return null;
  const excluidas = new Set(
    db
      .select({ idEmpresa: segmentoExclusion.idEmpresa })
      .from(segmentoExclusion)
      .where(eq(segmentoExclusion.idSegmento, idSegmento))
      .all()
      .map((f) => f.idEmpresa),
  );
  return empresas.map((e) => ({ ...e, excluida: excluidas.has(e.id) }));
}
```

```ts
export function muestraDestinatarioDeSegmento(idSegmento: number, idOrganizacion: number): DestinatarioMuestra | null {
  const empresas = empresasParaRevision(idSegmento, idOrganizacion);
  if (!empresas) return null;
  const activas = empresas.filter((e) => !e.excluida);
  if (activas.length === 0) return null;

  const contactos = db
    .select({
      idEmpresa: contacto.idEmpresa,
      nombre: contacto.nombre,
      apellido: contacto.apellido,
      cargo: contacto.cargo,
      email: contacto.email,
      telefono: contacto.telefono,
      esPrincipal: contacto.esPrincipal,
      esKeyDecisionMaker: contacto.esKeyDecisionMaker,
    })
    .from(contacto)
    .where(inArray(contacto.idEmpresa, activas.map((e) => e.id)))
    .all();

  for (const emp of activas) {
    const suyos = contactos
      .filter((c) => c.idEmpresa === emp.id && [c.nombre, c.apellido].some(Boolean))
      .sort((a, b) => b.esPrincipal - a.esPrincipal || b.esKeyDecisionMaker - a.esKeyDecisionMaker);
    if (suyos.length === 0) continue;
    const c = suyos[0];
    return {
      nombre: [c.nombre, c.apellido].filter(Boolean).join(' '),
      cargo: c.cargo,
      empresa: emp.nombre,
      ciudad: emp.ciudad,
      telefono: c.telefono,
      email: c.email,
    };
  }
  return null;
}
```

(el cuerpo de `muestraDestinatarioDeSegmento` no cambia salvo la firma y la primera línea —
copiar el resto tal cual está hoy en `repository.ts:2106-2144` para no perder ningún detalle del
`return` final).

- [ ] **Step 4: Correr el test, confirmar que pasa**

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): empresasParaRevision y muestraDestinatarioDeSegmento requieren idOrganizacion"
```

---

### Task 14: Cierre — suite completo, tsc, documentar lo que queda para Parte 3

**Files:** ninguno (solo verificación y notas)

- [ ] **Step 1: Suite completo**

Run: `npm test 2>&1 | tail -100`
Expected: TODOS los tests en verde, incluidos los de Parte 3 (goteo, agenda, colaUnificada,
copyApollo, materializar, push, inscripcion, tracking) que solo usaban las 13 funciones como
fixture.

- [ ] **Step 2: `tsc`, y anotar qué queda pendiente (Parte 3, no mío)**

Run: `npx tsc --noEmit 2>&1 | tee /tmp/tsc-plan2-final.txt`
Expected: errores SOLO en archivos fuera de mi alcance: `app/campanas/actions.ts`,
`app/campanas/[id]/segmento/page.tsx`, `app/campanas/[id]/preview/page.tsx`,
`app/campanas/[id]/reglas/*`, `app/campanas/nueva/*`, y las 2 llamadas a
`empresasParaRevision` dentro de funciones de campaña en `repository.ts` (~líneas 1737, 2008 al
momento de escribir este plan, confirmar con `grep -n "empresasParaRevision(" app/db/repository.ts`).
Si aparece un error en un archivo que SÍ está en mi lista de alcance, es un bug de este plan —
corregirlo antes de cerrar. Si aparece un error en un archivo que no es ni mío ni reconocible
como de Parte 3 (campañas), investigar antes de descartarlo como "no es mío".

- [ ] **Step 3: No hay commit en este paso** (es solo verificación).

---

## Al terminar

Correr `superpowers:finishing-a-development-branch` para decidir la integración. Con `main` en
`08ecbae` (Parte 1 ya mergeada) y la Parte 3 corriendo en su propio worktree
(`multi-organizacion-plan3-campanas`), lo más probable es "mergear localmente a main" si para
entonces la Parte 3 ya mergeó (para que su siguiente rebase encuentre mis cambios y pueda
actualizar sus propios call sites contra la firma nueva de las 13 funciones), o "dejar la rama
lista, avisar" si Parte 3 todavía no terminó — mergear primero no bloquea a nadie, pero conviene
avisar explícitamente qué firmas cambiaron (lista de las 13 funciones + su nuevo último
parámetro) para que la otra sesión no tenga que re-descubrirlo por sí misma.
