# Panel: Cockpit + Constructor (tablero drag & drop) — Plan de implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox
> (`- [x]`) para tracking.

**Goal:** Reemplazar la vista estática `/panel` ("Pulso del equipo") por un cockpit ejecutivo
con dos modos — **Cockpit** (lectura) y **Constructor** ("Arma tu tablero", drag & drop) —
donde cada usuario arma su propio tablero de métricas y se persiste en DB.

**Architecture:** Hexagonal, según CLAUDE.md. El **core** define el catálogo de widgets y el
modelo del tablero (puro, sin DB/UI/DnD). Un **adaptador** de datos (Repository) persiste el
tablero por usuario y resuelve cada métrica contra datos reales que ya existen (toques, canal,
resultado, cadencias); las métricas sin fuente muestran "sin datos", nunca números inventados.
La **UI** es un client component con toggle Cockpit/Constructor; el Constructor hace drag & drop
biblioteca→lienzo + reordenar, y persiste vía server action.

**Tech Stack:** Next 16 (App Router, RSC + server actions), React 19, Drizzle/SQLite (isps.db),
Tailwind v4 (`@theme` tokens), `@dnd-kit` (ver Decisión 2).

---

## Decisiones fijadas (de la conversación con Sebastián)

1. **Datos v1 = shell visual + dato real donde ya existe.** Se porta TODO el look del mockup,
   pero cada widget muestra dato real solo si hay fuente en el Repository. Sin fuente → estado
   "sin datos" / placeholder. No se inventan métricas CRO (deals, montos, stages) que esta tool
   no tiene.
2. **Drag & drop: `@dnd-kit` (recomendado tras investigar).** Ver "Decisión 2" abajo.
3. **Persistencia: tabla nueva `panel_tablero` por usuario** (una fila por `id_user`, layout en
   JSON). Vía Repository, sin SQL crudo suelto. Sigue el patrón exacto de `preferencia_usuario` +
   `preferencias-repository.ts`.

### Decisión 2 — investigación de drag & drop

El mockup NO trae DnD (el único `<script>` es un toggle de nav móvil; `cursor-grab` es cosmético).
Hay que construirlo. Candidatos evaluados para React 19 / Next 16:

| Opción | Veredicto |
|---|---|
| **dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`) | **Recomendada.** Hooks nativos de React, `@dnd-kit/sortable` da el reordenar del lienzo casi gratis, droppable para biblioteca→lienzo, accesible por teclado out-of-the-box (importa en tool interna). Es el estándar de facto. |
| **Pragmatic drag-and-drop** (Atlassian) | Runner-up. ~5kb, framework-agnóstico (opera sobre DOM nativo, cero acoplamiento a la versión de React → ideal SSR/React 19). Pero es headless: más cableado a mano para el sortable. Es el fallback si dnd-kit da fricción de peer-deps con React 19. |
| react-grid-layout / Gridstack | Descartadas. Pesadas, modelo de coordenadas propio, soporte React 19 rezagado, y biblioteca→lienzo no es su fuerte. |
| HTML5 nativo (sin dep) | Viable y respeta "no deps", pero reorder tosco y touch pobre; más superficie de bug para poco ahorro. |

**Recomendación:** dnd-kit. Es **la única dependencia nueva** de este plan; CLAUDE.md pide
justificar deps nuevas — la justificación es que DnD accesible + sortable hecho a mano es frágil
y costoso. **Gate:** confirmar con Sebastián antes de instalar (Tarea 2). Si al instalar hay
warning de peer-deps con React 19, caer a Pragmatic DnD sin cambiar el resto del plan (el core y
la persistencia son agnósticos al motor de DnD).

Fuentes: [Puck — Top 5 DnD React 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react),
[DEV — Top 5 DnD 2026](https://dev.to/puckeditor/top-5-drag-and-drop-libraries-for-react-24lb),
[react-grid-layout](https://github.com/react-grid-layout/react-grid-layout).

---

## Mapa de la fuente (qué se porta)

Fuente: `/Users/sebastianacostamolina/Arc/Ventas Cockpit/index.html` (2.219 líneas) + `globals.css`.

- **Cockpit (lectura)** = `#executive-cockpit`, líneas **148–1147**. Sub-secciones: barra de
  filtros (175–207), Throughput 6 KPIs (209–325), Velocity/cycle time (327–474), Segmentación
  por persona (475–690), Economía del deal (691–847), Probabilidad de cierre (848–1147).
- **Constructor** = `#builder-workbench`, líneas **1149–2082**. Biblioteca de métricas sticky
  (1174–1541, grupos: Throughput/Velocity/Segmentación/Economía/Probabilidad) + lienzo con 8
  widgets ejemplo (1543–2082, toolbar "Mi tablero / N widgets / Cargar ejemplo / Limpiar").
- **Header/footer** (69–147, 2083–2200): NO se portan; el panel vive dentro de `<AppShell>`.

## Reconciliación de tokens (mockup → repo)

El mockup usa nombres shadcn; el repo (`app/globals.css`, bloque `@theme`) usa otros. Regla de
memoria: **todo color/fuente es token central, nunca hex crudo en componentes**. Antes de portar,
mapear (Tarea 1). Tabla de equivalencias a verificar/crear:

| Clase mockup | Token repo existente | Acción |
|---|---|---|
| `bg-card`, `border-border` | `--color-card`, `--color-border*` | verificar que existan como utilidades |
| `text-primary`, `bg-primary`, `text-primary-foreground` | `--color-accent` (violeta) | mapear primary→accent o agregar `--color-primary*` |
| `text-muted-foreground`, `bg-muted` | `--color-muted` | verificar `muted-foreground` |
| `text-destructive` | (falta) | agregar `--color-destructive` (rojo semántico, reusar el "neg" existente) |
| `bg-accent`, `text-accent-foreground`, `ring` | `--color-accent*` | mapear/agregar |
| `font-heading`, `font-mono`, `font-body` | ya existen | ok |

---

## Estructura de archivos

**Core (dominio puro — sin DB/UI/DnD):**
- Crear `app/core/panel/widgets.ts` — catálogo de widgets (id, grupo, tipo, título, `dataSource`).
- Crear `app/core/panel/widgets.test.ts`
- Crear `app/core/panel/tablero.ts` — modelo del tablero (default, agregar/quitar/reordenar/validar, serializar/deserializar).
- Crear `app/core/panel/tablero.test.ts`

**Adaptador de datos:**
- Modificar `app/db/schema.ts` — tabla `panel_tablero`.
- Crear `app/db/panel-tablero-repository.ts` — `leerTablero` / `guardarTablero` (patrón preferencias).
- Crear `app/db/panel-tablero-repository.test.ts`
- Modificar `app/db/test-helpers.ts` — DDL de `panel_tablero`.
- Crear `app/core/panel/metricas.ts` — resolver dataSource→valor real | "sin datos".
- Crear `app/core/panel/metricas.test.ts`
- Crear `app/panel/actions.ts` — server actions `cargarTablero` / `guardarTablero`.

**UI:**
- Modificar `app/panel/page.tsx` — server component: gate admin, carga tablero + resuelve métricas, renderiza `<PanelClient/>`.
- Crear `app/panel/PanelClient.tsx` — toggle Cockpit/Constructor (client).
- Crear `app/panel/Cockpit.tsx` — vista de lectura (port de `#executive-cockpit`).
- Crear `app/panel/Constructor.tsx` — biblioteca + lienzo DnD.
- Crear `app/panel/widgets/Widget.tsx` — renderer por `tipo` (KPI/tendencia/barras/histograma/lista).
- Modificar `app/globals.css` — tokens faltantes (Tarea 1).

---

## FASE 0 — Fundaciones

### Task 1: Reconciliar tokens de diseño

**Files:** Modify `app/globals.css` (bloque `@theme`, ~línea 3–130)

- [x] **Step 1:** Leer el `@theme` actual y listar qué tokens del mockup faltan (ver tabla arriba).
- [x] **Step 2:** Agregar SOLO los faltantes como variables centrales. Ejemplo mínimo:

```css
/* dentro de @theme */
--color-primary: var(--color-accent);
--color-primary-foreground: #ffffff;
--color-muted-foreground: #9a9aa3;
--color-destructive: #e5484d;      /* rojo semántico "neg" ya usado en dots */
--color-accent-foreground: var(--color-accent-ink);
--color-ring: var(--color-accent);
--color-background: var(--color-card); /* o el fondo real del shell */
--color-foreground: #e7e3ff;
```

- [x] **Step 3:** Verificar que `bg-primary`, `text-muted-foreground`, `text-destructive`,
  `bg-accent`, `ring-ring` resuelven (Tailwind v4 genera utilidades desde `--color-*`).
- [x] **Step 4:** Commit — `feat(panel): tokens shadcn faltantes en @theme`.

### Task 2: Aprobar e instalar dnd-kit (GATE)

**Files:** Modify `package.json`

- [x] **Step 1:** Confirmar con Sebastián la dep nueva (ver Decisión 2). Si dice no → usar Pragmatic DnD o HTML5 nativo; el resto del plan no cambia.
- [x] **Step 2:** Instalar: `npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- [x] **Step 3:** Verificar que no hay warning de peer-deps con React 19. Si lo hay, evaluar fallback.
- [x] **Step 4:** Commit — `chore(panel): agrega dnd-kit para el constructor`.

---

## FASE 1 — Back (datos + persistencia)

> Se hace primero para que la UI tenga algo real que mostrar y persistir.
> Tareas 3, 4, 7 son **core/dominio**: aplica modo learning (narrar el porqué, checkpoint al cierre).

### Task 3: Catálogo de widgets (core, puro) — CHECKPOINT

**Files:** Create `app/core/panel/widgets.ts`, `app/core/panel/widgets.test.ts`

> **DECISIÓN DE DISEÑO PARA SEBASTIÁN (5–10 líneas).** El catálogo es el contrato entre el
> mockup visual y los datos reales. La pregunta: **¿cómo declara un widget su fuente de datos y su
> fallback?** Deja tu decisión en el header de `widgets.ts` (comentario), no en la conversación.
> Trade-offs a considerar: (a) un `dataSource: string` opaco que el resolver mapea, vs (b) un enum
> cerrado `DataSourceKey` que fuerza exhaustividad en el resolver; (c) si un widget sin fuente se
> marca `dataSource: null` (→ "sin datos") o simplemente no existe en la biblioteca. Yo dejo la
> firma y el test; tú decides la forma del `dataSource`.

- [x] **Step 1: Test que falla** — un widget del catálogo tiene id estable, grupo, tipo y título:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, widgetPorId } from './widgets.ts';

test('cada widget tiene id unico', () => {
  const ids = WIDGETS.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('widgetPorId devuelve el widget o undefined', () => {
  assert.equal(widgetPorId('deals_nuevos')?.tipo, 'kpi');
  assert.equal(widgetPorId('no_existe'), undefined);
});
```

- [x] **Step 2:** Correr y ver fallar: `npm test -- app/core/panel/widgets.test.ts` → FAIL (módulo no existe).
- [x] **Step 3: Implementación mínima.** Definir tipos + catálogo derivado del mockup. Grupos:
  Throughput, Velocity, Segmentación, Economía, Probabilidad. Tipos: `kpi | tendencia | barras |
  histograma | lista`. Marcar `dataSource` según lo que EXISTE hoy (ver Tarea 4) y `null` para lo
  que no (Weighted pipeline $, stages, etc.). Firma sugerida:

```ts
export type WidgetTipo = 'kpi' | 'tendencia' | 'barras' | 'histograma' | 'lista';
export type WidgetGrupo = 'throughput' | 'velocity' | 'segmentacion' | 'economia' | 'probabilidad';

export type Widget = {
  id: string;               // estable, ej 'toques_por_canal'
  titulo: string;
  grupo: WidgetGrupo;
  tipo: WidgetTipo;
  dataSource: string | null; // <-- forma exacta la decide Sebastián (ver bloque arriba)
  spanDefault: 1 | 2 | 3 | 4;
};

export const WIDGETS: readonly Widget[] = [ /* ... derivado del mockup ... */ ];
export function widgetPorId(id: string): Widget | undefined { /* ... */ }
```

- [x] **Step 4:** Correr test → PASS.
- [x] **Step 5:** Commit — `feat(panel): catalogo de widgets del cockpit`.
- [x] **Checkpoint:** Sebastián explica de vuelta cómo un widget declara fuente + fallback.

### Task 4: Resolver de métricas (dato real | "sin datos")

**Files:** Create `app/core/panel/metricas.ts`, `app/core/panel/metricas.test.ts`

> Mapea `dataSource` → valor real usando funciones que YA existen en `app/db/repository.ts`
> (`toquesPorCanal`, `toquesPorResultado`, `contarToquesEnRango`, `leadsTocadosEnRango`,
> `campanasActivas`, `inscripcionesActivas`, `empresasPorCadencia`). Todo lo demás → `{ estado: 'sin_datos' }`.
> El resolver recibe las funciones/datos por parámetro (core no importa el Repository directo).

- [x] **Step 1: Test que falla:**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverMetrica } from './metricas.ts';

test('dataSource conocido devuelve valor real', () => {
  const r = resolverMetrica('toques_total', { toquesTotal: 42 });
  assert.deepEqual(r, { estado: 'ok', valor: 42 });
});

test('dataSource sin fuente devuelve sin_datos', () => {
  const r = resolverMetrica('weighted_pipeline', {});
  assert.equal(r.estado, 'sin_datos');
});
```

- [x] **Step 2:** Correr → FAIL.
- [x] **Step 3:** Implementar `resolverMetrica(dataSource, datos)` con un switch exhaustivo sobre
  las claves con fuente; default → `{ estado: 'sin_datos' }`.
- [x] **Step 4:** Correr → PASS.
- [x] **Step 5:** Commit — `feat(panel): resolver de metricas con fallback sin-datos`.

### Task 5: Tabla `panel_tablero` (schema + test-helpers)

**Files:** Modify `app/db/schema.ts`, `app/db/test-helpers.ts`

- [x] **Step 1:** Agregar a `schema.ts` (patrón de `preferencia_usuario`):

```ts
export const panelTablero = sqliteTable('panel_tablero', {
  idUser: text('id_user').primaryKey(),
  layout: text('layout'),          // JSON: [{ widgetId, span }, ...]
  updatedAt: text('updated_at'),
});
```

- [x] **Step 2:** Agregar el DDL equivalente en `test-helpers.ts` (donde se crea la DB de prueba):

```sql
CREATE TABLE panel_tablero (
  id_user TEXT PRIMARY KEY,
  layout TEXT,
  updated_at TEXT
);
```

- [x] **Step 3:** Aplicar a isps.db real: `npx drizzle-kit push` (o el flujo que use el repo).
  Verificar que la tabla existe sin tocar las demás (CLAUDE.md: reflejar, no recrear).
- [x] **Step 4:** Commit — `feat(panel): tabla panel_tablero por usuario`.

### Task 6: Repository del tablero (leer/guardar)

**Files:** Create `app/db/panel-tablero-repository.ts`, `app/db/panel-tablero-repository.test.ts`

- [x] **Step 1: Test que falla** (copia el estilo de `preferencias-repository.test.ts`):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import { dbDePrueba } from './organizacion-repository.ts';
import { leerTablero, guardarTablero } from './panel-tablero-repository.ts';

let dbPath: string;
test.beforeEach(() => { dbPath = crearDbPrueba(); });
test.afterEach(() => { borrarDbPrueba(dbPath); });

test('leerTablero devuelve undefined si no hay fila', () => {
  assert.equal(leerTablero('u1', dbDePrueba(dbPath)), undefined);
});

test('guardarTablero hace upsert y leerTablero lo devuelve', () => {
  const db = dbDePrueba(dbPath);
  guardarTablero('u1', '[{"widgetId":"toques_total","span":1}]', db);
  assert.match(leerTablero('u1', db)!.layout!, /toques_total/);
});
```

- [x] **Step 2:** Correr → FAIL.
- [x] **Step 3:** Implementar `leerTablero`/`guardarTablero` con `onConflictDoUpdate` (idéntico a
  `preferencias-repository.ts`, `db` inyectable con default singleton).
- [x] **Step 4:** Correr → PASS.
- [x] **Step 5:** Commit — `feat(panel): repository leer/guardar tablero`.

### Task 7: Modelo del tablero (core, puro) — CHECKPOINT

**Files:** Create `app/core/panel/tablero.ts`, `app/core/panel/tablero.test.ts`

> Operaciones puras sobre el layout: `tableroDefault()`, `agregar(layout, widgetId)`,
> `quitar(layout, idx)`, `reordenar(layout, from, to)`, `parse(json)`/`serialize(layout)`,
> `validar` (descarta widgetIds que ya no existen en el catálogo). El motor de DnD llama a estas;
> nunca muta el DOM ni la DB.

- [x] **Step 1: Test que falla:**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { agregar, quitar, reordenar, parse } from './tablero.ts';

test('agregar añade al final', () => {
  assert.deepEqual(agregar([], 'toques_total'), [{ widgetId: 'toques_total', span: 1 }]);
});
test('reordenar mueve un item', () => {
  const l = [{ widgetId: 'a', span: 1 }, { widgetId: 'b', span: 1 }];
  assert.deepEqual(reordenar(l, 0, 1).map((w) => w.widgetId), ['b', 'a']);
});
test('parse descarta widgets desconocidos', () => {
  assert.deepEqual(parse('[{"widgetId":"no_existe","span":1}]'), []);
});
```

- [x] **Step 2:** Correr → FAIL.
- [x] **Step 3:** Implementar las funciones puras. `parse` valida contra `widgetPorId`.
- [x] **Step 4:** Correr → PASS.
- [x] **Step 5:** Commit — `feat(panel): modelo puro del tablero`.
- [x] **Checkpoint:** Sebastián explica por qué las ops de tablero viven en core y no en el componente DnD.

### Task 8: Server actions

**Files:** Create `app/panel/actions.ts`

- [x] **Step 1:** `'use server'`. `cargarTablero()`: `requireSession()` → `leerTablero(user.id)` →
  `parse` → si vacío, `tableroDefault()`. `guardarTablero(layout)`: valida sesión + admin,
  `serialize`, persiste. Ambas rechazan si `!usuario.admin`.
- [x] **Step 2:** Commit — `feat(panel): server actions cargar/guardar tablero`.

---

## FASE 2 — Front UI

### Task 9: Shell del panel (toggle Cockpit/Constructor)

**Files:** Modify `app/panel/page.tsx`, Create `app/panel/PanelClient.tsx`

- [x] **Step 1:** `page.tsx` (server): mantiene el gate `if (!usuario.admin) redirect("/")`, llama
  `cargarTablero()` + resuelve las métricas reales (via Repository), pasa `tablero`, `metricas`,
  `email` a `<PanelClient/>` dentro de `<AppShell>`.
- [x] **Step 2:** `PanelClient.tsx` (`'use client'`): estado `modo: 'cockpit' | 'constructor'`,
  toggle en el header (equivalente al nav "Cockpit / Constructor" del mockup, líneas 100–130).
  Renderiza `<Cockpit/>` o `<Constructor/>`.
- [x] **Step 3:** Commit — `feat(panel): shell con toggle cockpit/constructor`.

### Task 10: Vista Cockpit (lectura)

**Files:** Create `app/panel/Cockpit.tsx`, `app/panel/widgets/Widget.tsx`

- [x] **Step 1:** `Widget.tsx`: renderer por `tipo` (kpi/tendencia/barras/histograma/lista). Recibe
  el widget + su métrica resuelta; si `estado === 'sin_datos'`, muestra el placeholder "sin datos"
  (mismo marco, valor en muted) en vez del número.
- [x] **Step 2:** `Cockpit.tsx`: portar `#executive-cockpit` (index.html 148–1147) a JSX,
  convirtiendo clases con la tabla de tokens (Tarea 1). Los 6 KPIs de Throughput y demás usan
  `<Widget/>` alimentado por `metricas`. La barra de filtros (175–207) se porta visual en esta tarea
  (el cableado real es Tarea 14).
- [x] **Step 3:** Commit — `feat(panel): vista cockpit de lectura`.

### Task 11: Constructor — biblioteca + lienzo (sin DnD todavía)

**Files:** Create `app/panel/Constructor.tsx`

- [x] **Step 1:** Portar la biblioteca sticky (index.html 1174–1541): grupos + tarjetas de métrica
  desde `WIDGETS`. Portar la toolbar (1546–1566) y el lienzo (1568–2082) renderizando el `tablero`
  actual con `<Widget/>` y el botón X por widget.
- [x] **Step 2:** Botones "Cargar ejemplo" (setea un layout demo) y "Limpiar" (`[]`).
- [x] **Step 3:** Commit — `feat(panel): constructor estatico (biblioteca + lienzo)`.

### Task 12: Cablear drag & drop + persistencia

**Files:** Modify `app/panel/Constructor.tsx`

- [x] **Step 1:** Envolver en `<DndContext>`. Biblioteca = draggables (`useDraggable`); lienzo =
  `<SortableContext>` de los widgets del tablero. `onDragEnd`: si viene de la biblioteca → `agregar`;
  si es reordenar dentro del lienzo → `reordenar`. X → `quitar`.
- [x] **Step 2:** Cada cambio actualiza el estado local y llama `guardarTablero(serialize(layout))`
  (debounce ~500ms para no spamear). Optimista: la UI no espera al server.
- [x] **Step 3:** Verificar reorder, agregar desde biblioteca, quitar con X, y que recargar la
  página trae el tablero persistido (lo prueba Sebastián en navegador — no levantar preview).
- [x] **Step 4:** Commit — `feat(panel): drag & drop + persistencia del tablero`.

### Task 13: Arreglar el layout de "Arma tu tablero"

**Files:** Modify `app/panel/Constructor.tsx`

> El changelog del mockup registra 3 intentos fallidos de este side-by-side (biblioteca izquierda /
> lienzo derecha). La causa raíz suele ser mezclar `flex` (`flex-1` en el canvas) dentro de un
> `grid` de columnas — se pisan. Fijar UN sistema.

- [x] **Step 1:** Contenedor `grid grid-cols-1 lg:grid-cols-4 gap-6 items-start`. Biblioteca:
  `lg:col-span-1` (sin ancho fijo). Lienzo: `lg:col-span-3 min-w-0` (NO `flex-1`). Quitar cualquier
  `lg:col-span-3` colado en tarjetas de la biblioteca (bug presente en index.html:1203).
- [x] **Step 2:** Grid interno del lienzo: `grid grid-cols-2 md:grid-cols-4 gap-3 auto-rows-min`;
  cada widget respeta su `span` (`col-span-{1..4}`).
- [x] **Step 3:** Verificar responsive (móvil = 1 col apilada; `lg` = side-by-side real). Sebastián valida en navegador.
- [x] **Step 4:** Commit — `fix(panel): layout side-by-side del constructor`.

---

## FASE 3 — Filtros + verificación

### Task 14: Barra de filtros (Pregunta + chips)

**Files:** Modify `app/panel/Cockpit.tsx` (+ resolver por owner en `metricas.ts` si aplica)

- [x] **Step 1:** Cablear los filtros que SÍ tienen dato real: **owner** (existe `empresa.owner`),
  **fecha/ventana** (ya se usa `ventanaPromedio`). `stage`/`segmento`/`monto` → chips visuales
  deshabilitados o "próximamente" (no hay fuente). El input "Pregunta" (MCP) queda visual en v1.
- [x] **Step 2:** Al cambiar owner/fecha, re-resolver métricas (server action o re-fetch).
- [x] **Step 3:** Commit — `feat(panel): filtros de owner y fecha en el cockpit`.

### Task 15: Verificación final

- [x] **Step 1:** `npm test` — toda la suite de panel verde (widgets, metricas, tablero, repository).
- [x] **Step 2:** `npx tsc --noEmit` — 0 errores (regla de memoria: correr tsc al verificar).
- [x] **Step 3:** Verificar aislamiento de capas: `grep` que `app/core/panel/*` NO importa Repository,
  dnd-kit, ni React. (Regla de memoria: verificar layering activamente.)
- [x] **Step 4:** Sebastián prueba en navegador (`http://localhost:3000/panel`): toggle, DnD,
  persistencia al recargar, "sin datos" donde corresponde, responsive.
- [x] **Step 5:** Commit final + actualizar `planning/tasks.md`.

---

## Self-review (cobertura vs spec)

- ✅ Dos partes (Cockpit lectura + Constructor edit) → Tareas 9–13.
- ✅ Drag & drop real (mockup no lo trae) → Tarea 12, motor decidido en Decisión 2.
- ✅ Constructor a la izquierda (biblioteca) / lienzo a la derecha, mover libremente → Tareas 11–13.
- ✅ Layout "Arma tu tablero" roto → Tarea 13 (con causa raíz del changelog).
- ✅ Varios filtros → Tarea 14 (reales donde hay dato, visuales donde no).
- ✅ Front UI + back → Fase 1 (back: tabla + repository + resolver + actions) / Fase 2 (front).
- ✅ Va en `/panel` reemplazando lo actual, gate admin conservado → Tarea 9.
- ✅ "Componentes ya creados, solo traerlo" → sí para el look (Tareas 10–11 portan el mockup);
  DnB, datos y persistencia NO venían en el mockup y son el grueso real del trabajo.
```
