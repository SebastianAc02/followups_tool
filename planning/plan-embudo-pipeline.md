# Embudo (Pipeline) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking.
>
> **Cap de modelo (memoria del proyecto):** máximo Sonnet; preferir Haiku para tareas mecánicas bien especificadas. Cada tarea trae un modelo sugerido.
>
> **Regla de oro (CLAUDE.md):** el core no importa DB/Notion/Claude; acceso a datos SOLO por el Repository; nada de SQL crudo regado. Voz de textos sin emojis, sin em dashes, español directo. No inventar datos de dominio.

**Goal:** Agregar un tab nuevo `Embudo` dentro de `/pipeline` (`?tab=embudo`) que pinta la silueta de embudo comercial por etapa (`estado_notion`) con conteo real y % de conversión, tarjetas de resultado (Cliente ganado / On hold) y un drawer de detalle con el timeline de etapas de la cuenta, cableado a datos reales y con el andamiaje para que "días en etapa" y el histórico se llenen hacia adelante.

**Architecture:** Hexagonal, en cuatro capas que se construyen de adentro hacia afuera. (1) **Dominio puro** (`app/db/funnel.ts`, sin DB): una función `construirEmbudo` que toma conteos por etapa y devuelve las bandas + conversión + resultados. (2) **Persistencia de escritura**: tabla nueva `empresa_estado_historial` + `actualizarEstadoNotion()` que actualiza la etapa y registra la transición en una sola transacción (patrón Outbox ligero, event-sourcing sobre un solo campo). (3) **Persistencia de lectura**: `embudoPipeline()` (conteos por etapa, scoped a la organización) y `historialEtapasEmpresa()` (timeline real). (4) **UI**: componentes server/client bajo `app/ui/pipeline/` que consumen datos ya resueltos; el drawer reusa el `DetallePanel` existente extendido con la etapa actual y el timeline.

**Tech Stack:** Next.js App Router + TypeScript, Drizzle ORM sobre SQLite (`isps.db`), Tailwind v4 (`@theme` tokens), pruebas con `node:test` nativo (`npm test`). Sin dependencias nuevas (nada de Space Grotesk ni Phosphor: se mapea a las fuentes/íconos que ya tiene la app).

---

## Contexto y decisiones (leer antes de empezar)

**Origen.** Mockup estático en `/Users/sebastianacostamolina/Arc/ISP Sales Pipeline/` (`index.html`, sección `#pipeline` líneas 395-1211). Tiene 4 paneles (pipeline, deals, actividad, equipo); **solo se porta el panel `pipeline`**. Ese panel es un split de dos partes: el canvas del embudo (izquierda) y el drawer de detalle del deal (derecha). Ambas partes están en alcance.

**Ya existe `/pipeline`.** Una sesión previa construyó `/pipeline` con un overview "por número de toque" (real) y sub-tabs `?tab=overview|reportes|ajustes` (ver `plan-pipeline-ui-redesign.md`). El embudo es un **lente distinto y ortogonal**: agrupa por *etapa comercial* (`empresa.estado_notion`), no por *paso de cadencia* (`pasoInscripcion`). No compiten. Por eso el embudo entra como **un tab más**, no reemplaza el overview.

**Decisiones cerradas con Sebastián (2026-07-13):**
- **Ubicación:** tab nuevo `?tab=embudo` dentro de `/pipeline`.
- **Datos faltantes del mockup:** ajustar a datos reales ahora, y dejar el andamiaje para que eventualmente existan. En concreto:
  - Montos `$1.24M`: **no hay columna de valor de deal**. v1 no inventa el `$`. Se usa como métrica secundaria real, cuando exista, la suma de `empresa_usuarios.usuarios_efectivos` (peso real del deal en el dominio ISP); si es null, no se muestra. El `$` real queda como Fase 5 futura (columna `monto`).
  - Días-en-etapa `4.2d`: **no hay histórico de transiciones**. Se crea la tabla `empresa_estado_historial` (Fase 2) que empieza a registrar hacia adelante; "días en etapa" se deriva de ahí y es exacto desde el deploy. Antes de acumular histórico, se muestra "—" (honesto, no inventado).
- **Alcance:** embudo + drawer con timeline de etapas de la cuenta.

**Fuente única de etapas.** `app/db/funnel.ts` (`FUNNEL_ETAPAS`) define orden, labels y colores. El embudo consume esa constante; no duplica etapas ni colores. Orden real: `lead → contacto_iniciado → reunion_agendada → oportunidad → enviar_contrato → cierre_documentacion → firma_pago`. `firma_pago` es el resultado "ganado"; `on_hold` es el resultado "perdido/parqueado"; `null` (sin etapa, 1437 empresas) queda **fuera de las bandas** (como en el Home) y se muestra como conteo aparte honesto.

**Diseño (regla de tokens, memoria `feedback_abstraer_tokens_diseno`):** se porta la **estructura y layout** del mockup (bandas con `clip-path`, split pane, drawer con timeline); los **colores y tipografía salen de los tokens existentes** (`FUNNEL_ETAPAS.colorClass`, `@theme` en `globals.css`, fuentes `--font-heading`/`--font-body`/`--font-mono` ya cargadas). Nada de hex crudo en componentes nuevos.

### Decisiones abiertas para el checkpoint visual (Sebastián confirma, no bloquean el arranque)
1. **`null`/sin etapa (1437):** default = fuera de las bandas, mostrado como chip "N sin etapa comercial". ¿Se deja así o se funden en Lead? (D1 del plan viejo decía null→Lead, pero eso era para inscritas de campaña, no para toda la base; 1437 se comerían la barra).
2. **Bandas vs mockup:** el mockup pinta 4 bandas; el dominio tiene 6 etapas de banda (lead…cierre_documentacion). Default = una banda por etapa de `FUNNEL_ETAPAS` (data-driven, escala sola). ¿Se colapsan a 4 para fidelidad al mockup?
3. **Tipografía:** default = reusar fuentes del app (Newsreader/IBM Plex). El mockup usa Space Grotesk. Si Sebastián quiere ese "vibe" exacto, es agregar una fuente en `layout.tsx` (decisión suya, no default).
4. **Métrica secundaria:** default = suma de `usuarios_efectivos` cuando exista. ¿Sirve como proxy de "tamaño" o se omite hasta tener `$`?

---

## File Structure

**Crear:**
- `app/core/embudo.ts` — dominio puro: tipos `ConteoEtapa`/`Embudo` + `construirEmbudo()`. Sin imports de DB/UI.
- `app/core/embudo.test.ts` — pruebas del dominio (node:test).
- `app/db/repository.embudo.test.ts` — pruebas de `embudoPipeline` + `historialEtapasEmpresa`.
- `app/ui/pipeline/EmbudoPanel.tsx` — server component contenedor del tab.
- `app/ui/pipeline/FunnelCanvas.tsx` — client: las bandas del embudo + tarjetas de resultado + delegación de click de banda/fila.
- `app/ui/pipeline/FunnelBand.tsx` — presentacional: una banda con `clip-path`, label, conteo, conversión.
- `app/ui/pipeline/OutcomeCard.tsx` — presentacional: tarjeta Cliente ganado / On hold.
- `app/ui/pipeline/EmbudoFiltros.tsx` — client: barra de filtros (Owner, Campaña) por searchParams.

**Modificar:**
- `app/db/funnel.ts` — exportar helper de resultado (`ETAPA_GANADA`, `ETAPA_ONHOLD`) para no hardcodear strings en varios sitios.
- `app/db/schema.ts` — agregar tabla `empresaEstadoHistorial`.
- `app/db/test-helpers.ts` — agregar el DDL de `empresa_estado_historial` a la DB de prueba.
- `app/db/repository.ts` — agregar `actualizarEstadoNotion()`, `embudoPipeline()`, `historialEtapasEmpresa()`.
- `app/ui/pipeline/PipelineShell.tsx` — registrar el tab `embudo` (union + array + label).
- `app/pipeline/page.tsx` — branch `tab === 'embudo'` que renderiza `EmbudoPanel`.
- `app/pipeline/actions.ts` — server action para el timeline del drawer.
- `app/ui/pipeline/DetallePanel.tsx` — extender props para recibir etapa actual + timeline de etapas.
- `isps.db` (DB real, `/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db`) — aplicar el `CREATE TABLE` de `empresa_estado_historial` (aditivo; no recrea nada existente).

**Comandos base:**
- Tests: `npm test` (corre todos) o dirigido: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/embudo.test.ts`
- Typecheck: `npx tsc --noEmit`

---

## Fase 0 — Registrar el tab (mecánico)

> Objetivo: que `?tab=embudo` renderice un placeholder dentro de `/pipeline`, sin lógica todavía. Modelo sugerido: **Haiku**.

### Task 0.1: Registrar el tab `embudo`

**Files:**
- Modify: `app/ui/pipeline/PipelineShell.tsx` (líneas ~12, ~50, ~61-63)
- Modify: `app/pipeline/page.tsx` (líneas ~46-52)
- Create: `app/ui/pipeline/EmbudoPanel.tsx`

- [ ] **Step 1: Crear el placeholder `EmbudoPanel`**

```tsx
// app/ui/pipeline/EmbudoPanel.tsx
// Contenedor del tab Embudo. Fase 0: placeholder. Se cablea en Fase 4.
export function EmbudoPanel() {
  return <div className="text-sm text-muted px-2">Embudo (en construccion).</div>;
}
```

- [ ] **Step 2: Agregar `embudo` al union y al array de tabs en `PipelineShell.tsx`**

En la línea del type union (~12), agregar `| 'embudo'`:

```tsx
type PipelineTab = 'overview' | 'reportes' | 'ajustes' | 'embudo';
```

En el array de tabs (~50) agregar `'embudo'`, y en el conditional de labels (~61-63) su label:

```tsx
{['overview', 'embudo', 'reportes', 'ajustes'].map((t) => (
  // ...
  {t === 'overview' ? 'Resumen' : t === 'embudo' ? 'Embudo' : t === 'reportes' ? 'Reportes' : 'Ajustes'}
```

(Ajustar a la sintaxis exacta que ya tiene el archivo; no cambiar el estilo del `.map`.)

- [ ] **Step 3: Agregar el branch en `page.tsx` `PipelineContent`**

En `PipelineContent` (~46), antes del branch de `reportes`:

```tsx
import { EmbudoPanel } from '../ui/pipeline/EmbudoPanel';
// ...
if (tab === 'embudo') {
  return <EmbudoPanel />;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add app/ui/pipeline/EmbudoPanel.tsx app/ui/pipeline/PipelineShell.tsx app/pipeline/page.tsx
git commit -m "feat(pipeline): registra tab embudo (placeholder)"
```

---

## Fase 1 — Dominio del embudo (core puro, TDD)

> Objetivo: la lógica que convierte conteos por etapa en bandas + conversión + resultados, sin tocar DB. Modelo sugerido: **Sonnet**.

### Task 1.1: Tipos y helper de etapas de resultado

**Files:**
- Modify: `app/db/funnel.ts`
- Create: `app/core/embudo.ts`

- [ ] **Step 1: Exportar en `funnel.ts` las etapas de resultado (single source of truth)**

Al final de `app/db/funnel.ts`:

```ts
// Etapas que NO son banda del embudo: firma_pago es el resultado "ganado",
// on_hold el resultado "parqueado/perdido". Se nombran aqui para que la UI y las
// queries no hardcodeen los strings.
export const ETAPA_GANADA = 'firma_pago';
export const ETAPA_ONHOLD = 'on_hold';

// Bandas del embudo = FUNNEL_ETAPAS sin la etapa ganada (que va como tarjeta de resultado).
export const BANDAS_EMBUDO: EtapaFunnel[] = FUNNEL_ETAPAS.filter((e) => e.estado !== ETAPA_GANADA);
```

- [ ] **Step 2: Crear los tipos del dominio en `app/core/embudo.ts`**

```ts
// Dominio puro del embudo comercial. NO importa DB, Notion, Claude ni UI.
// Toma conteos por etapa (ya resueltos por el Repository) y arma la forma que la
// UI pinta: bandas ordenadas frio->caliente con % de conversion, y las dos tarjetas
// de resultado (ganado / on hold). "sin etapa" (null) se reporta aparte, fuera de
// las bandas (misma decision que el Home: 1437 nulls se comerian la barra).
import { BANDAS_EMBUDO, ETAPA_GANADA, ETAPA_ONHOLD, FUNNEL_ETAPAS } from '../db/funnel.ts';

export type ConteoEtapa = {
  estado: string; // valor de estado_notion, o '__sin_etapa__' para null
  total: number;
  usuarios: number | null; // suma de usuarios_efectivos, null si no hay dato
};

export type BandaEmbudo = {
  estado: string;
  label: string;
  colorClass: string;
  total: number;
  usuarios: number | null;
  conversionDesdeAnterior: number | null; // % vs la banda anterior; null en la primera
};

export type ResultadoEmbudo = {
  estado: string;
  label: string;
  total: number;
  usuarios: number | null;
};

export type Embudo = {
  bandas: BandaEmbudo[];
  ganado: ResultadoEmbudo;
  onHold: ResultadoEmbudo;
  sinEtapa: number;
};

export const CLAVE_SIN_ETAPA = '__sin_etapa__';
```

- [ ] **Step 3: Commit**

```bash
git add app/db/funnel.ts app/core/embudo.ts
git commit -m "feat(embudo): tipos de dominio + etapas de resultado en funnel.ts"
```

### Task 1.2: `construirEmbudo` (TDD) — CONTRIBUCIÓN DE SEBASTIÁN

> **Modo learning (CLAUDE.md).** Esta es la decisión de dominio de la tarea: cómo se calcula la conversión entre etapas y cómo se separan ganado/on-hold/sin-etapa de las bandas. El plan deja el andamiaje (tipos, test, ensamblado de bandas) y **Sebastián escribe el cuerpo de `construirEmbudo`** (5-10 líneas: la fórmula de `conversionDesdeAnterior` y el ruteo de cada conteo a su bucket). Trade-off a decidir: ¿conversión de cada banda vs la anterior, o vs la primera (top of funnel)? ¿La conversión usa `total`, o incluye a los que ya avanzaron más? El default sugerido abajo es "vs banda inmediatamente anterior con total crudo", pero es su llamada.

**Files:**
- Create: `app/core/embudo.test.ts`
- Modify: `app/core/embudo.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// app/core/embudo.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirEmbudo, CLAVE_SIN_ETAPA } from './embudo.ts';

test('construirEmbudo: ordena bandas frio->caliente y calcula conversion vs anterior', () => {
  const embudo = construirEmbudo([
    { estado: 'lead', total: 100, usuarios: 1000 },
    { estado: 'contacto_iniciado', total: 50, usuarios: 400 },
    { estado: 'reunion_agendada', total: 25, usuarios: null },
    { estado: 'firma_pago', total: 10, usuarios: 200 },
    { estado: 'on_hold', total: 30, usuarios: null },
    { estado: CLAVE_SIN_ETAPA, total: 1437, usuarios: null },
  ]);

  assert.equal(embudo.bandas[0].estado, 'lead');
  assert.equal(embudo.bandas[0].conversionDesdeAnterior, null); // primera banda
  assert.equal(embudo.bandas[1].estado, 'contacto_iniciado');
  assert.equal(embudo.bandas[1].conversionDesdeAnterior, 50); // 50/100
  assert.equal(embudo.bandas[1].usuarios, 400);
  assert.equal(embudo.ganado.total, 10);
  assert.equal(embudo.onHold.total, 30);
  assert.equal(embudo.sinEtapa, 1437);
  // firma_pago y on_hold NO son bandas
  assert.ok(!embudo.bandas.some((b) => b.estado === 'firma_pago'));
  assert.ok(!embudo.bandas.some((b) => b.estado === 'on_hold'));
});

test('construirEmbudo: etapa sin conteo cae en 0, no desaparece', () => {
  const embudo = construirEmbudo([{ estado: 'lead', total: 5, usuarios: null }]);
  const reunion = embudo.bandas.find((b) => b.estado === 'reunion_agendada');
  assert.equal(reunion?.total, 0);
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/embudo.test.ts`
Expected: FAIL con "construirEmbudo is not a function".

- [ ] **Step 3: Andamiaje + hueco de Sebastián en `embudo.ts`**

Agregar a `app/core/embudo.ts`:

```ts
export function construirEmbudo(conteos: ConteoEtapa[]): Embudo {
  const porEstado = new Map(conteos.map((c) => [c.estado, c]));
  const get = (estado: string) => porEstado.get(estado) ?? { estado, total: 0, usuarios: null };

  // ── HUECO DE SEBASTIAN (5-10 lineas) ─────────────────────────────
  // Construir `bandas` recorriendo BANDAS_EMBUDO en orden, y para cada una:
  //   - total y usuarios desde get(etapa.estado)
  //   - conversionDesdeAnterior: null en la primera; si no, redondear
  //     (total_actual / total_anterior) * 100. Decidir el denominador.
  // Luego armar ganado = get(ETAPA_GANADA), onHold = get(ETAPA_ONHOLD),
  // sinEtapa = get(CLAVE_SIN_ETAPA).total.
  // TODO(sebastian): escribir aqui. Borrar el throw.
  throw new Error('construirEmbudo: pendiente de implementar');
  // ─────────────────────────────────────────────────────────────────
}
```

- [ ] **Step 4: (Sebastián) implementar el cuerpo, luego correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/embudo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/core/embudo.ts app/core/embudo.test.ts
git commit -m "feat(embudo): construirEmbudo (dominio puro) con pruebas"
```

> **Checkpoint de learning (CLAUDE.md):** antes de seguir, Sebastián explica de vuelta por qué eligió ese denominador de conversión y qué implica para leer el embudo.

---

## Fase 2 — Andamiaje del histórico de etapas (schema + escritura, TDD)

> Objetivo: crear la tabla que registra transiciones de `estado_notion` y el método que la alimenta, para que "días en etapa" y el timeline del drawer sean reales hacia adelante. **Nota clave:** hoy NINGÚN código del app escribe `estado_notion` (se sembró de Notion). Este método es el camino de escritura futuro; queda expuesto y listo para engancharse al sync de Notion cuando aterrice. Modelo sugerido: **Sonnet**.

### Task 2.1: Tabla `empresa_estado_historial`

**Files:**
- Modify: `app/db/schema.ts`
- Modify: `app/db/test-helpers.ts`
- Modify: `isps.db` (DB real)

- [ ] **Step 1: Declarar la tabla en `schema.ts`**

Después de `syncCambios` (~línea 90), agregar:

```ts
// Histórico de transiciones de etapa comercial (estado_notion). Una fila por cambio.
// No existia: se crea para poder derivar "dias en etapa" y el timeline del drawer.
// Se llena hacia adelante (actualizarEstadoNotion); el pasado pre-deploy es desconocido.
export const empresaEstadoHistorial = sqliteTable('empresa_estado_historial', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  estadoAnterior: text('estado_anterior'), // null si es el primer registro
  estadoNuevo: text('estado_nuevo').notNull(),
  fecha: text('fecha').notNull(), // ISO, cuando ocurrio la transicion
  idOrganizacion: integer('id_organizacion').notNull().default(1),
});
```

- [ ] **Step 2: Aplicar el DDL a la DB real (`isps.db`)**

Correr (aditivo, no recrea nada):

```bash
sqlite3 /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db "CREATE TABLE IF NOT EXISTS empresa_estado_historial (id INTEGER PRIMARY KEY AUTOINCREMENT, id_empresa TEXT NOT NULL, estado_anterior TEXT, estado_nuevo TEXT NOT NULL, fecha TEXT NOT NULL, id_organizacion INTEGER NOT NULL DEFAULT 1); CREATE INDEX IF NOT EXISTS idx_estado_hist_empresa ON empresa_estado_historial (id_empresa);"
```

Expected: sin salida (éxito).

- [ ] **Step 3: Agregar el mismo DDL a `test-helpers.ts`**

Dentro del `sqlite.exec(\`...\`)` de `crearDbPrueba`, agregar la tabla al bloque de `CREATE TABLE`:

```sql
CREATE TABLE empresa_estado_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa TEXT NOT NULL,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  id_organizacion INTEGER NOT NULL DEFAULT 1
);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add app/db/schema.ts app/db/test-helpers.ts
git commit -m "feat(embudo): tabla empresa_estado_historial (schema + test DDL)"
```

### Task 2.2: `actualizarEstadoNotion()` (TDD)

**Files:**
- Modify: `app/db/repository.ts`
- Create: `app/db/repository.embudo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// app/db/repository.embudo.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actualizarEstadoNotion, historialEtapasEmpresa } = await import('./repository.ts');

function seedEmpresa(id: string, estado: string | null) {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1)`,
  ).run(id, id, id, estado);
  raw.close();
}

test('actualizarEstadoNotion: cambia la etapa y registra la transicion', () => {
  seedEmpresa('e1', 'lead');
  actualizarEstadoNotion('e1', 'contacto_iniciado', 1, '2026-07-13');

  const raw = new Database(dbPath);
  const emp = raw.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = 'e1'`).get() as { estado_notion: string };
  const hist = raw.prepare(`SELECT estado_anterior, estado_nuevo FROM empresa_estado_historial WHERE id_empresa = 'e1'`).get() as { estado_anterior: string; estado_nuevo: string };
  raw.close();

  assert.equal(emp.estado_notion, 'contacto_iniciado');
  assert.equal(hist.estado_anterior, 'lead');
  assert.equal(hist.estado_nuevo, 'contacto_iniciado');
});

test('actualizarEstadoNotion: no registra si la etapa no cambia', () => {
  seedEmpresa('e2', 'lead');
  actualizarEstadoNotion('e2', 'lead', 1, '2026-07-13');
  const raw = new Database(dbPath);
  const n = raw.prepare(`SELECT count(*) c FROM empresa_estado_historial WHERE id_empresa = 'e2'`).get() as { c: number };
  raw.close();
  assert.equal(n.c, 0);
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.embudo.test.ts`
Expected: FAIL con "actualizarEstadoNotion is not a function".

- [ ] **Step 3: Implementar en `repository.ts`**

> Abrir `repository.ts`, mirar cómo `registrarToque`/`pausarInscripcion` abren la conexión y ejecutan (`better-sqlite3` con transacción). Copiar ese idioma exacto (nombre del handle, helper de `db`). El cuerpo:

```ts
// Cambia la etapa comercial de una empresa y registra la transicion en el historico,
// en una sola transaccion (patron Outbox ligero). Si la etapa no cambia, no registra.
// Este es el UNICO camino de escritura de estado_notion: el sync de Notion debe llamarlo
// (no un UPDATE suelto), asi el historico nunca se pierde una transicion.
export function actualizarEstadoNotion(
  idEmpresa: string,
  estadoNuevo: string,
  idOrganizacion: number,
  fecha: string,
): void {
  const db = abrirDb(); // <- usar el mismo helper que el resto de repository.ts
  const tx = db.transaction(() => {
    const actual = db
      .prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = ? AND organizacion_activa_id = ?`)
      .get(idEmpresa, idOrganizacion) as { estado_notion: string | null } | undefined;
    if (!actual) return;
    if (actual.estado_notion === estadoNuevo) return; // no-op, no registra
    db.prepare(`UPDATE empresa SET estado_notion = ?, updated_at = ? WHERE id_empresa = ? AND organizacion_activa_id = ?`)
      .run(estadoNuevo, fecha, idEmpresa, idOrganizacion);
    db.prepare(
      `INSERT INTO empresa_estado_historial (id_empresa, estado_anterior, estado_nuevo, fecha, id_organizacion)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(idEmpresa, actual.estado_notion, estadoNuevo, fecha, idOrganizacion);
  });
  tx();
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.embudo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.embudo.test.ts
git commit -m "feat(embudo): actualizarEstadoNotion escribe etapa + historico en tx"
```

---

## Fase 3 — Persistencia de lectura (TDD)

> Objetivo: las dos queries que alimentan la UI. Modelo sugerido: **Sonnet**.

### Task 3.1: `embudoPipeline()` — conteos por etapa

**Files:**
- Modify: `app/db/repository.ts`
- Modify: `app/db/repository.embudo.test.ts`

- [ ] **Step 1: Agregar el test que falla**

```ts
// añadir a app/db/repository.embudo.test.ts
const { embudoPipeline } = await import('./repository.ts');

test('embudoPipeline: agrupa por estado_notion, scoped a la organizacion, null aparte', () => {
  const raw = new Database(dbPath);
  const ins = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, ?)`,
  );
  ins.run('c1', 'c1', 'c1', 'lead', 1);
  ins.run('c2', 'c2', 'c2', 'lead', 1);
  ins.run('c3', 'c3', 'c3', 'on_hold', 1);
  ins.run('c4', 'c4', 'c4', null, 1);
  ins.run('c5', 'c5', 'c5', 'lead', 2); // otra organizacion: NO debe contar
  raw.close();

  const conteos = embudoPipeline(1);
  const byEstado = Object.fromEntries(conteos.map((c) => [c.estado, c.total]));
  assert.equal(byEstado['lead'], 2);
  assert.equal(byEstado['on_hold'], 1);
  assert.equal(byEstado['__sin_etapa__'], 1);
  assert.equal(byEstado['lead'] !== 3, true); // la org 2 no se colo
});
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.embudo.test.ts`
Expected: FAIL con "embudoPipeline is not a function".

- [ ] **Step 3: Implementar en `repository.ts`**

> Copiar el idioma de `contarPorEstado` (repository.ts ~482-498): `SELECT estado_notion, count(*) ... GROUP BY`. La diferencia: NO dropear nulls (mapearlos a `__sin_etapa__`) y traer la suma opcional de `usuarios_efectivos`.

```ts
import { CLAVE_SIN_ETAPA, type ConteoEtapa } from '../core/embudo.ts';

// Conteo de empresas por etapa comercial (estado_notion), scoped a la organizacion.
// null -> '__sin_etapa__' (no se dropea, se reporta aparte). usuarios = suma de
// usuarios_efectivos de la empresa (proxy de tamano), null si ninguna lo tiene.
export function embudoPipeline(idOrganizacion: number): ConteoEtapa[] {
  const db = abrirDb();
  const filas = db
    .prepare(
      `SELECT COALESCE(e.estado_notion, '${CLAVE_SIN_ETAPA}') AS estado,
              count(*) AS total,
              SUM(eu.usuarios_efectivos) AS usuarios
       FROM empresa e
       LEFT JOIN empresa_usuarios eu ON eu.id_empresa = e.id_empresa
       WHERE e.organizacion_activa_id = ?
       GROUP BY COALESCE(e.estado_notion, '${CLAVE_SIN_ETAPA}')`,
    )
    .all(idOrganizacion) as { estado: string; total: number; usuarios: number | null }[];
  return filas.map((f) => ({ estado: f.estado, total: f.total, usuarios: f.usuarios ?? null }));
}
```

> Nota: si `empresa_usuarios` tiene varias filas por empresa, el `count(*)` se infla por el JOIN. Verificar cardinalidad; si es 1:N, contar sobre un subquery de empresa y traer `usuarios` con un `SUM` separado por subconsulta correlacionada. El test de arriba (sin filas en `empresa_usuarios`) no cubre ese caso: agregar un test con `empresa_usuarios` si la tabla es 1:N.

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.embudo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.embudo.test.ts
git commit -m "feat(embudo): embudoPipeline conteos por etapa scoped a organizacion"
```

### Task 3.2: `historialEtapasEmpresa()` — timeline del drawer

**Files:**
- Modify: `app/db/repository.ts`
- Modify: `app/db/repository.embudo.test.ts`

- [ ] **Step 1: Agregar el test que falla**

```ts
// añadir a app/db/repository.embudo.test.ts
const { historialEtapasEmpresaFn } = await import('./repository.ts'); // ver nombre real en step 3

test('historialEtapasEmpresa: devuelve etapa actual + transiciones ordenadas', () => {
  seedEmpresa('h1', 'reunion_agendada');
  actualizarEstadoNotion('h1', 'oportunidad', 1, '2026-07-10');
  actualizarEstadoNotion('h1', 'cierre_documentacion', 1, '2026-07-12');

  const r = historialEtapasEmpresa('h1', 1);
  assert.equal(r.etapaActual, 'cierre_documentacion');
  assert.equal(r.transiciones.length, 2);
  assert.equal(r.transiciones[0].estado, 'oportunidad'); // mas antigua primero
  assert.equal(r.transiciones[0].fecha, '2026-07-10');
  assert.equal(r.transiciones[1].estado, 'cierre_documentacion');
});
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.embudo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar en `repository.ts`**

```ts
export type HistorialEtapas = {
  etapaActual: string | null;
  transiciones: { estado: string; fecha: string }[]; // orden ascendente por fecha
};

// Timeline de etapas de una cuenta: etapa actual (empresa.estado_notion) + las
// transiciones registradas en empresa_estado_historial. El pasado pre-deploy es
// desconocido a proposito (no se inventa): la lista empieza cuando el sync llama a
// actualizarEstadoNotion. Scoped a la organizacion.
export function historialEtapasEmpresa(idEmpresa: string, idOrganizacion: number): HistorialEtapas {
  const db = abrirDb();
  const emp = db
    .prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = ? AND organizacion_activa_id = ?`)
    .get(idEmpresa, idOrganizacion) as { estado_notion: string | null } | undefined;
  const transiciones = db
    .prepare(
      `SELECT estado_nuevo AS estado, fecha FROM empresa_estado_historial
       WHERE id_empresa = ? AND id_organizacion = ? ORDER BY fecha ASC, id ASC`,
    )
    .all(idEmpresa, idOrganizacion) as { estado: string; fecha: string }[];
  return { etapaActual: emp?.estado_notion ?? null, transiciones };
}
```

> Renombrar el import del test (`historialEtapasEmpresaFn`) al nombre real `historialEtapasEmpresa`.

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.embudo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.embudo.test.ts
git commit -m "feat(embudo): historialEtapasEmpresa timeline real de etapas"
```

---

## Fase 4 — UI del embudo (cablear + drawer)

> Objetivo: pintar la silueta del mockup con datos reales y el drawer con el timeline. Modelo sugerido: **Sonnet**. Cero hex crudo: colores desde `FUNNEL_ETAPAS.colorClass` y tokens `@theme`.

### Task 4.1: `FunnelBand` y `OutcomeCard` (presentacionales)

**Files:**
- Create: `app/ui/pipeline/FunnelBand.tsx`
- Create: `app/ui/pipeline/OutcomeCard.tsx`

- [ ] **Step 1: `FunnelBand.tsx`**

Una banda: `clip-path` trapezoidal (ancho decreciente por índice), color de `colorClass`, label, conteo (fuente mono), y el pill de conversión. Recibe `{ banda: BandaEmbudo; indice: number; totalBandas: number; onClick?: () => void }`. El `clip-path` se calcula del índice (más angosto conforme baja), igual que el mockup (`polygon(0 0, 100% 0, 92% 100%, 8% 100%)` estrechándose). Números con la utilidad `mono`. Conversión: si `conversionDesdeAnterior !== null`, pill arriba de la banda.

```tsx
// app/ui/pipeline/FunnelBand.tsx
import type { BandaEmbudo } from '../../core/embudo';
import { cn } from '../cn';

export function FunnelBand({
  banda,
  indice,
  totalBandas,
  onClick,
}: {
  banda: BandaEmbudo;
  indice: number;
  totalBandas: number;
  onClick?: () => void;
}) {
  // Estrechamiento progresivo: la banda 0 ocupa todo el ancho, cada una se mete un poco.
  const inset = 8 + indice * 6; // % por lado
  const insetNext = 8 + (indice + 1) * 6;
  const clip = `polygon(${inset}% 0, ${100 - inset}% 0, ${100 - insetNext}% 100%, ${insetNext}% 100%)`;
  return (
    <div className="flex flex-col">
      {banda.conversionDesdeAnterior !== null && (
        <div className="flex justify-center -my-1.5 relative z-10">
          <span className="mono text-[11px] px-2.5 py-0.5 rounded-full bg-shell border border-line text-check">
            {banda.conversionDesdeAnterior}% ↓
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        className={cn('funnel-band flex items-center justify-center text-center', banda.colorClass)}
        style={{ clipPath: clip, height: `${Math.max(72, 100 - indice * 4)}px` }}
      >
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-shell">{banda.label}</div>
          <div className="mono text-[28px] leading-none text-shell my-1">{banda.total}</div>
          {banda.usuarios !== null && (
            <div className="mono text-[11px] text-shell/70">{banda.usuarios.toLocaleString('es-CO')} usuarios</div>
          )}
        </div>
      </button>
    </div>
  );
}
```

> `.funnel-band` ya está en el mockup como clase local; agregar al `globals.css` (o inline) `display:flex;align-items:center;justify-content:center`. Verificar que `text-shell` da buen contraste sobre los tonos violeta de `FUNNEL_ETAPAS`; si no, usar un token de texto claro.

- [ ] **Step 2: `OutcomeCard.tsx`**

```tsx
// app/ui/pipeline/OutcomeCard.tsx
import type { ResultadoEmbudo } from '../../core/embudo';
import { cn } from '../cn';

export function OutcomeCard({ resultado, tono }: { resultado: ResultadoEmbudo; tono: 'ganado' | 'onhold' }) {
  return (
    <div
      className={cn(
        'flex-1 rounded-xl p-4 border',
        tono === 'ganado' ? 'border-check bg-done-bg' : 'border-overdue bg-overdue-bg',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('w-2 h-2 rounded-full', tono === 'ganado' ? 'bg-check' : 'bg-overdue')} />
        <span className="text-[12px] font-semibold">{resultado.label}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="mono text-[36px] leading-none">{resultado.total}</span>
        {resultado.usuarios !== null && (
          <span className="mono text-[14px] text-muted">{resultado.usuarios.toLocaleString('es-CO')} usuarios</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add app/ui/pipeline/FunnelBand.tsx app/ui/pipeline/OutcomeCard.tsx
git commit -m "feat(embudo): componentes presentacionales FunnelBand y OutcomeCard"
```

### Task 4.2: `FunnelCanvas` + `EmbudoPanel` cableado

**Files:**
- Create: `app/ui/pipeline/FunnelCanvas.tsx`
- Modify: `app/ui/pipeline/EmbudoPanel.tsx`

- [ ] **Step 1: `FunnelCanvas.tsx` (client, delegación de click)**

Recibe el `Embudo` ya resuelto. Pinta el header con leyenda (de `FUNNEL_ETAPAS`), las bandas (`FunnelBand`), las dos `OutcomeCard`, y maneja el click de banda para abrir el drawer (por ahora, un click abre el drawer de una empresa de esa etapa; en v1 el drawer se abre desde una fila/empresa, ver Task 4.4). Header + leyenda de colores desde `FUNNEL_ETAPAS`. El chip de "sin etapa" muestra `embudo.sinEtapa`.

```tsx
'use client';
import type { Embudo } from '../../core/embudo';
import { FUNNEL_ETAPAS } from '../../db/funnel';
import { FunnelBand } from './FunnelBand';
import { OutcomeCard } from './OutcomeCard';

export function FunnelCanvas({ embudo }: { embudo: Embudo }) {
  return (
    <div className="rounded-2xl border border-line-card bg-pipeline-card overflow-hidden">
      {/* leyenda */}
      <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-line">
        {FUNNEL_ETAPAS.map((e) => (
          <span key={e.estado} className="flex items-center gap-1.5 text-[12px] text-muted">
            <span className={`w-2.5 h-2.5 rounded-sm ${e.colorClass}`} />
            {e.label}
          </span>
        ))}
      </div>
      {/* canvas */}
      <div className="max-w-xl mx-auto px-6 py-8">
        <div className="flex flex-col">
          {embudo.bandas.map((b, i) => (
            <FunnelBand key={b.estado} banda={b} indice={i} totalBandas={embudo.bandas.length} />
          ))}
        </div>
        <div className="flex gap-3.5 mt-2">
          <OutcomeCard resultado={embudo.ganado} tono="ganado" />
          <OutcomeCard resultado={embudo.onHold} tono="onhold" />
        </div>
        {embudo.sinEtapa > 0 && (
          <p className="mono text-[11px] text-faint mt-4">{embudo.sinEtapa} empresas sin etapa comercial (fuera del embudo)</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `EmbudoPanel.tsx` server component cableado**

```tsx
// app/ui/pipeline/EmbudoPanel.tsx
import { requireSession } from '../../lib/session';
import { embudoPipeline } from '../../db/repository';
import { construirEmbudo } from '../../core/embudo';
import { FunnelCanvas } from './FunnelCanvas';

export async function EmbudoPanel() {
  const usuario = await requireSession();
  const conteos = embudoPipeline(usuario.idOrganizacion);
  const embudo = construirEmbudo(conteos);
  return <FunnelCanvas embudo={embudo} />;
}
```

> `EmbudoPanel` ahora es async: verificar que `page.tsx` lo await/renderiza igual que los otros paneles (el branch de Fase 0 puede necesitar `await` o quedar como `return <EmbudoPanel />` si Next lo resuelve como RSC).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add app/ui/pipeline/FunnelCanvas.tsx app/ui/pipeline/EmbudoPanel.tsx
git commit -m "feat(embudo): FunnelCanvas + EmbudoPanel cableados a datos reales"
```

> **Checkpoint visual (Sebastián levanta el preview, no la IA — memoria `feedback_never_run_previews`).** Revisar contra el mockup y cerrar las 4 decisiones abiertas de arriba (null, bandas 4-vs-6, tipografía, métrica secundaria). Ajustar antes de seguir al drawer.

### Task 4.3: Drawer con timeline de etapas

**Files:**
- Modify: `app/pipeline/actions.ts`
- Modify: `app/ui/pipeline/DetallePanel.tsx`
- Modify: `app/ui/pipeline/FunnelCanvas.tsx` (abrir el drawer al clicar banda)

- [ ] **Step 1: Server action del timeline en `actions.ts`**

```ts
// añadir a app/pipeline/actions.ts
import { historialEtapasEmpresa, type HistorialEtapas } from '../db/repository';

export async function historialEtapasAction(idEmpresa: string): Promise<HistorialEtapas> {
  const usuario = await requireSession();
  return historialEtapasEmpresa(idEmpresa, usuario.idOrganizacion);
}
```

- [ ] **Step 2: Extender `DetallePanel` para pintar el timeline de etapas**

Agregar a los props `timelineEtapas?: HistorialEtapas`. Renderizar, cuando exista, una sección "Recorrido por etapas" con un timeline vertical (nodo por transición, color desde `FUNNEL_ETAPAS`, fecha en mono, y "N dias en etapa" calculado entre transiciones consecutivas / hasta hoy para la actual). Si `transiciones` está vacío, mostrar la etapa actual + nota "sin transiciones registradas aun" (honesto). Reusar el patrón de timeline que ya tiene `DetallePanel` para la cadencia.

> El cálculo de "días en etapa" es UI puro (diferencia de fechas): `Math.round((fechaSiguiente - fecha) / dia)`. Para la etapa actual, contra `hoy`.

- [ ] **Step 3: Abrir el drawer desde `FunnelCanvas`**

Al clicar una banda, abrir el `DetallePanel`. En v1, como el embudo es agregado (no lista empresas), el click de banda puede: (a) no abrir nada todavía, o (b) mostrar la primera empresa de esa etapa. **Decisión de alcance:** el drawer del mockup es por-deal; el embudo es por-conteo. Para conectar los dos hace falta una lista de empresas por etapa. Si eso excede esta entrega, dejar el click de banda como no-op y abrir el drawer desde el overview por-toque existente (que ya lista empresas y ya abre `DetallePanel`). Confirmar con Sebastián en el checkpoint.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add app/pipeline/actions.ts app/ui/pipeline/DetallePanel.tsx app/ui/pipeline/FunnelCanvas.tsx
git commit -m "feat(embudo): drawer con timeline de etapas de la cuenta"
```

### Task 4.4: Barra de filtros (Owner, Campaña) — real por searchParams

**Files:**
- Create: `app/ui/pipeline/EmbudoFiltros.tsx`
- Modify: `app/db/repository.ts` (`embudoPipeline` acepta filtros)
- Modify: `app/ui/pipeline/EmbudoPanel.tsx`

- [ ] **Step 1: Extender `embudoPipeline(idOrganizacion, filtros?)`**

Agregar `filtros?: { owner?: string; idCampana?: string }`. Filtrar por `empresa.owner` y, si hay `idCampana`, por empresas inscritas en esa campaña (JOIN con `inscripcion`). Test nuevo en `repository.embudo.test.ts` que verifica el filtro por owner. (Mismo patrón TDD: test que falla → implementar → pasa.)

- [ ] **Step 2: `EmbudoFiltros.tsx` (client)**

Chips de filtro que escriben searchParams (`?tab=embudo&owner=...&campana=...`), reusando el patrón de `PipelineSidebar` (que ya maneja `?filter=`). Solo Owner y Campaña se cablean (datos reales via `empresa.owner` y `listarCampanas()`); los demás chips del mockup (SDR/Closer, trimestre, segmento) se marcan "proximamente" o se omiten en v1 (no inventar comportamiento).

- [ ] **Step 3: Leer los filtros en `EmbudoPanel` desde searchParams y pasarlos a `embudoPipeline`.**

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.embudo.test.ts`
Expected: 0 errores, tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/ui/pipeline/EmbudoFiltros.tsx app/db/repository.ts app/ui/pipeline/EmbudoPanel.tsx app/db/repository.embudo.test.ts
git commit -m "feat(embudo): filtros reales por owner y campana"
```

---

## Fase 5 — Futuro (no construir ahora, documentado)

- **Montos `$` reales:** agregar columna `monto`/`valor_deal` en `empresa` (nullable) + su escritura desde el sync/edición manual; cambiar la métrica secundaria de "usuarios" a "$" donde exista. Reemplaza el proxy de `usuarios_efectivos`.
- **Lista de empresas por etapa:** query `empresasDeEtapa(estado, idOrganizacion, filtros)` para que el click de banda abra el drawer del deal correcto (cierra el gap de Task 4.3 Step 3).
- **Backfill del histórico:** cuando el sync de Notion empiece a llamar `actualizarEstadoNotion`, el histórico crece solo; no hay backfill del pasado (desconocido, no se inventa).

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** embudo por etapa (Fase 3+4), conversión % (Fase 1), tarjetas Cliente/On hold (Task 4.1-4.2), drawer con timeline de etapas (Fase 2 histórico + Task 4.3), datos reales sin inventar (proxy usuarios + histórico hacia adelante), tab nuevo `?tab=embudo` (Fase 0). Cubierto.
- **Placeholders:** cada paso de código trae código real; los pasos con "verificar/decidir" son checkpoints explícitos de Sebastián, no TODOs de implementación escondidos.
- **Consistencia de tipos:** `ConteoEtapa` (embudo.ts) es el contrato entre `embudoPipeline` (repo) y `construirEmbudo` (core). `HistorialEtapas` entre `historialEtapasEmpresa` (repo) y el action/drawer. `Embudo`/`BandaEmbudo`/`ResultadoEmbudo` entre core y UI. `CLAVE_SIN_ETAPA` y `ETAPA_GANADA`/`ETAPA_ONHOLD` viven en un solo lugar cada uno.
- **Capas (memoria `feedback_best_practices_layering`):** core (`embudo.ts`) no importa DB/UI; repo es el único que toca SQLite; UI recibe datos resueltos. `funnel.ts` sigue siendo la fuente única de etapas.

## Riesgos / notas
- `estado_notion` no tiene escritor vivo hoy: el histórico arranca vacío hasta que el sync llame `actualizarEstadoNotion`. El drawer y "días en etapa" muestran "—"/nota honesta hasta entonces. Es esperado, no un bug.
- Cardinalidad de `empresa_usuarios` (1:1 vs 1:N) afecta el `count(*)` de `embudoPipeline` (ver nota en Task 3.1 Step 3). Verificar antes de confiar en el conteo.
- Multi-org: toda query nueva filtra por `idOrganizacion` (patrón del repo).
- No agregar dependencias (Space Grotesk, Phosphor). Si Sebastián quiere la tipografía del mockup, es decisión suya en el checkpoint.
