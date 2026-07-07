# Cockpit de Campañas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el cockpit de campañas completo (7 vistas: hub, segmentación con Copiloto, importar cadencia, cadencia, reglas, destinatarios, preview cinemático, lanzar, por revisar) sobre el backend de cadencias que ya existe en seco (Fases 4-5), rediseñando la UI con los mockups y cerrando los huecos de core que las vistas destapan.

**Architecture:** Hexagonal. El core (dominio puro, sin deps externas) ya tiene 11 tablas, parser de cadencias, motor de fechas, readiness, enrollment, envío (Apollo) y tracking. Este plan NO recrea nada de eso: agrega los huecos faltantes (parser JSON, NL→segmento, preview no destructivo, render de variables, goteo de ingreso, métricas) como funciones de core testeables, y encima construye la UI en React consumiendo el Repository y los primitivos de diseño. Antes de todo, una Fase 0 consolida los tokens de diseño en una fuente única (requisito explícito de Sebastián: cambiar tipografía y colores desde un solo lado).

**Tech Stack:** Next.js 16 (App Router, React Server Components + server actions), TypeScript, Drizzle ORM sobre SQLite (isps.db), Tailwind v4 (CSS-first `@theme`), CVA + clsx + tailwind-merge (`cn`), Zod v4, runner de tests nativo de Node (`node --test` con `--experimental-strip-types`).

---

## Cómo se ejecuta este plan

**Correr un test suelto (shorthand `TESTONE` usado abajo):**
```bash
node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test <ruta-al-test>
```
**Correr toda la suite:** `npm test`
**Levantar dev para verificar UI:** `npm run dev` (usar las herramientas de preview, no verificación manual).

**Etiquetas de tarea:**
- `[AGENTE]` — mecánica o UI con decisión ya tomada. Delegable a un agente chiquito (Haiku/Sonnet, cap Sonnet). El plan le dice qué archivo investigar y qué producir.
- `[CHECKPOINT]` — toca core/dominio o hay una decisión de arquitectura válida entre alternativas. Según la constitución (modo learning): la IA explica el trade-off, Sebastián escribe la decisión clave (5-10 líneas) antes de que el agente arme el boilerplate alrededor. No se salta.

**Workflow por vista (acordado con Sebastián):** cada fase de UI arranca leyendo el `index.html` de esa vista en `/Users/sebastianacostamolina/Arc/html vistas 1-7/`. Los mockups se leen en sitio, no se copian al repo. El inventario de componentes de cada vista está en su fase; los sub-pasos finos de cada componente se expanden al iniciar la fase, cuando el agente ya tiene el HTML de esa vista delante.

**Regla de oro de la constitución:** el core NO importa Granola/Notion/Claude/Apollo ni el driver de DB; solo los toca por puertos (`app/core/ports/`). Todo acceso a datos por el Repository (`app/db/repository.ts`), nunca SQL crudo regado. `canal` y `transcript_proveedor` son datos, no código. Textos para humanos: sin emojis, sin em dashes, español directo. Commit pequeño y revisable por tarea.

---

## Mapa de archivos

### Repo (lo que ya existe, se toca por interfaz)
- **Diseño/tokens:** `app/globals.css` (Tailwind v4 `@theme` + legacy unlayered), `app/layout.tsx` (next/font).
- **Primitivos UI:** `app/ui/{Button,Chip,Pill,CanalTag,Stat,SeverityText,Dot,Field,Seg,SectionLabel}.tsx` (+ `.variants.ts`), `app/ui/cn.ts` (o util equivalente).
- **Shell/nav:** `app/ui/shell/AppShell.tsx`, `app/ui/shell/SidebarNav.tsx`.
- **Referencia visual migrada:** `app/cola/{page,DashboardHeader,BarraAhora,AgendaHoy,CadenciasHoy}.tsx`, `app/cola/stats.ts`.
- **Datos:** `app/db/schema.ts`, `app/db/repository.ts`, `app/db/validation.ts`.
- **Core:** `app/core/cadencia-parser.ts`, `motor-cadencia.ts`, `inscripcion.ts`, `canales-empresa.ts`, `push.ts`, `tracking.ts`, `borradores.ts`, `motor-fechas.ts`; puertos en `app/core/ports/{envio,ia,sync}.ts`.
- **Adaptadores:** `app/adapters/{apollo,claude,notion}.ts`.
- **Workers:** `app/worker/index.ts` (script `npm run worker`).
- **Campañas UI existente (legacy, se rediseña):** `app/campanas/page.tsx`, `app/campanas/nueva/{page,NuevaCampanaFlujo,CrearCampana,NuevoSegmento,FiltroWall,TablaCuentas,CopilotoPanel,ReadinessBadge}.tsx`, `app/campanas/nueva/{copiloto.ts,actions.ts}`, `app/campanas/segmentos/{page,SegmentoBuilder}.tsx`, `app/cadencias/{page,ConstructorCadencia,actions}.ts(x)`.

### Mockups (referencia visual, leer en sitio)
Base: `/Users/sebastianacostamolina/Arc/html vistas 1-7/`
- V1 → `HTML1 Campaigns/index.html` (+ `globals.css`). Fuentes reales: Newsreader + IBM Plex Sans + IBM Plex Mono.
- V2 → `HTML 2 Segmentacion/index.html`
- V3 → `Cadencias Paso 2 HTML3/index.html`
- V4 → `Cockpit Destinatarios html4/index.html`
- V5 → `Cinematic Sequence Preview html5/` (proyecto Vite+React+TS; componentes en `src/sections/SequencePreview.tsx`, `src/components/ui`)
- V6 → `Lanzar Cockpit html6/index.html`
- V7 → `OnePay Review HTML 7/index.html`
- (V2.9 importar cadencia y V-Reglas no tienen mockup; se diseñan siguiendo la misma línea.)

---

## Roadmap

| Fase | Vista | Hueco de core | Estado del plan |
|------|-------|---------------|-----------------|
| 0 | (fundacional) | Tokens en fuente única | **Detallado, listo** |
| 1 | V1 Campañas (hub) | Métricas agregadas | **Detallado, listo** |
| 2 | V2 Segmentación · Copiloto | NL→DefinicionSegmento + loop reactivo | Core detallado; UI se expande al iniciar |
| 3 | V2.9 Importar cadencia | Parser JSON | **Detallado, listo** |
| 4 | V3 Cadencia | (editar copy inline) | Core existe; UI se expande al iniciar |
| 5 | V-Reglas (nueva) | (existe `reglaFaltante`) | UI a diseñar; se expande al iniciar |
| 6 | V4 Destinatarios · Readiness | Preview no destructivo | Core detallado; UI se expande al iniciar |
| 7 | V5 Preview cinemático | Render de variables | Core detallado; UI (port Vite) se expande |
| 8 | V6 Lanzar | Goteo de ingreso + ritmo + tope + fecha inicio | Core detallado; UI se expande al iniciar |
| 9 | V7 Por revisar | (existe `pasosManualesPendientes`) + render variables | Core existe; UI se expande al iniciar |

Cada fase produce software que corre y se testea por sí solo. Dependencias: la Fase 0 es prerequisito de toda UI. El "render de variables" de la Fase 7 lo reusa la Fase 9 (se construye una vez).

---

## Fase 0: Tokens en fuente única

**Objetivo:** que tipografía y colores se cambien desde un solo lado y que todo componente consuma tokens semánticos, nunca un hex o nombre de fuente crudo. Hoy `@theme` en `app/globals.css` ya es fuente única para lo migrado, pero mezcla el hex directo en el nombre semántico (`--color-accent: #8b7cff`) y hay duplicación (`@theme` vs `:root` legacy). Se reestructura en dos capas: **primitivos** (paleta y familias crudas) y **semánticos** (roles que apuntan a primitivos).

**Files:**
- Modify: `app/globals.css:3-72` (bloque `@theme`)
- Modify: `app/layout.tsx:2-12` (fuentes next/font)
- Create: `docs/design-tokens.md` (la doc de "cambia acá")

### Task 0.1: Documentar el contrato de tokens `[CHECKPOINT]`

Decisión de dominio de diseño: qué roles semánticos existen y a qué primitivo apunta cada uno. Sebastián confirma la lista de roles y el valor actual de las 3 familias tipográficas.

- [ ] **Step 1: Escribir `docs/design-tokens.md`** con dos tablas.

Capa 1, primitivos (valores crudos, se definen una vez):
```
Paleta:   --violet-500 #8b7cff · --violet-400 #a99cff · --green #57c98a · --red #f4796b
          --amber #f2b738 · --orange #e07a3f · --blue #8fb0e0 · --rose #d3a0a6
Neutros:  --n-0 #0a0a0b (bg) · --n-1 #111218 · --n-2 #161619 · --n-3 #1f1f24
          --ink #ededee · --ink-soft #b6b6ba · --muted #88888f · --faint #5e5e66
Familias: --ff-serif (Newsreader) · --ff-body (IBM Plex Sans) · --ff-mono (IBM Plex Mono)
```
Capa 2, semánticos (roles que consume la UI; apuntan a un primitivo):
```
--color-accent → --violet-500 · --color-accent-soft → --violet-400
--color-success → --green · --color-danger → --red · --color-today → --amber · --color-warn → --orange
--color-bg → --n-0 · --color-surface → --n-2 · --color-card → --n-1
--font-heading → --ff-serif · --font-body → --ff-body · --font-eyebrow → --ff-mono
--text-primary → --ink · --text-muted → --muted
```
- [ ] **Step 2: Commit** — `git commit -m "docs(tokens): contrato de tokens primitivos y semanticos"`

> **Nota para Sebastián (checkpoint):** el valor actual de `--font-body` lo pongo en IBM Plex Sans para calcar el mockup (el serif Newsreader ya coincide con el proyecto). Como todo pasa por el token, cambiarlo a Space Mono o a Inter después es una línea. Confírmame los roles antes de que el agente toque `globals.css`.

### Task 0.2: Reestructurar `@theme` en dos capas `[AGENTE]`

**Files:** Modify `app/globals.css:3-72`

- [ ] **Step 1:** Dentro de `@theme`, agregar primero el bloque de primitivos (los `--violet-*`, `--green`, neutros, etc. de la doc). No borrar los nombres semánticos que ya usan los componentes (`--color-accent`, `--color-surface`, `--color-done`, `--color-overdue`, `--color-today`, `--color-warn`, los `--color-canal-*`): reapuntarlos a los primitivos con `var()`. Ejemplo:
```css
@theme {
  /* Capa 1: primitivos */
  --violet-500: #8b7cff;
  --green: #57c98a;
  /* ...resto de la paleta... */

  /* Capa 2: semánticos (apuntan a primitivos) */
  --color-accent: var(--violet-500);
  --color-done: var(--green);
  /* ...resto de roles... */
}
```
- [ ] **Step 2:** Definir el vocabulario tipográfico semántico del cockpit apuntando a las familias: `--font-heading: var(--ff-serif)`, `--font-body: var(--ff-body)`, `--font-eyebrow: var(--ff-mono)`. Mantener `--font-serif/--font-mono/--font-sans` como alias para no romper lo migrado.
- [ ] **Step 3: Verificar build** — `npm run build`. Expected: compila sin errores de CSS.
- [ ] **Step 4: Verificar `/cola` no se rompió** — `npm run dev`, abrir `/cola` con preview, confirmar que colores y tipografía se ven igual que antes (los semánticos no cambiaron de valor, solo de origen).
- [ ] **Step 5: Commit** — `git commit -m "refactor(tokens): separar primitivos de semanticos en @theme"`

### Task 0.3: Alinear las fuentes en layout `[AGENTE]`

**Files:** Modify `app/layout.tsx:2-12`

- [ ] **Step 1:** Confirmar que `Newsreader` (→`--ff-serif`) e `IBM_Plex_Mono` (→`--ff-mono-tag`/`--ff-mono`) ya están importados. Agregar `IBM_Plex_Sans` como `--ff-body` si se eligió como cuerpo. Dejar `Archivo_Black`/`Space_Mono` como escape hatch dormido (no borrar; otras páginas legacy los usan).
- [ ] **Step 2:** Ajustar los alias en `@theme`: `--ff-body` apunta a la variable de IBM Plex Sans.
- [ ] **Step 3: Verificar** — `npm run dev`, abrir `/cola`, confirmar que el cuerpo cambió a IBM Plex Sans sin romper layout.
- [ ] **Step 4: Commit** — `git commit -m "feat(tokens): IBM Plex Sans como font-body del cockpit"`

---

## Fase 1: Vista 1 · Campañas (hub, CRUD)

**Objetivo:** rediseñar `/campanas` como el hub del mockup: header con stats globales, tabs por estado, grid de tarjetas de campaña, tarjeta "Nueva campaña". Es a donde ya apunta el nav y el módulo del home. El backend (`listarCampanas`) existe; falta una query de métricas agregadas del header.

**Investigar antes:** `HTML1 Campaigns/index.html` (grid de tarjetas ~línea de `.card`, header con "1.284 toques esta semana / 18% tasa de respuesta", tabs "Todas/Activas/Pausada/Borrador", y la tabla inferior de empresas inscritas con estados "Límite diario"/"Esperando regla"). Referencia de estilo migrado: `app/cola/DashboardHeader.tsx`.

### Task 1.1: Query de métricas del hub `[CHECKPOINT]`

Decisión de dominio: qué es "toques esta semana" (¿pasos enviados en los últimos 7 días? ¿eventos `enviado` de `eventoTracking`?) y "tasa de respuesta" (¿`respondio` / `enviado`?). Sebastián define la fórmula.

**Files:**
- Modify: `app/db/repository.ts` (agregar `metricasHub()`)
- Test: `app/db/repository.metricas.test.ts`

- [ ] **Step 1: Escribir el test que falla** en `app/db/repository.metricas.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { metricasHub } from "./repository.ts";
// usar el helper de DB en memoria que usan los otros repository.*.test.ts (revisar repository.cadencia.test.ts para el patrón de setup)
test("metricasHub cuenta toques de la semana y tasa de respuesta", () => {
  // seed: 3 eventos 'enviado' esta semana, 1 'respondio'
  const m = metricasHub(/* db */);
  assert.equal(m.toquesSemana, 3);
  assert.equal(m.tasaRespuesta, 0.33); // 1/3, redondeo a definir en checkpoint
});
```
- [ ] **Step 2: Correr y ver que falla** — `TESTONE app/db/repository.metricas.test.ts`. Expected: FAIL ("metricasHub is not a function").
- [ ] **Step 3: Implementar `metricasHub`** en `repository.ts` con la fórmula que Sebastián fijó (query Drizzle sobre `eventoTracking`, sin SQL crudo suelto). Devuelve `{ toquesSemana, tasaRespuesta, empresasEnSecuencia, bloqueadasEsperandoRegla }`.
- [ ] **Step 4: Correr y ver que pasa** — `TESTONE app/db/repository.metricas.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(repo): metricasHub para el header del hub de campanas"`

### Task 1.2: Primitivo `Tabs` para filtro por estado `[AGENTE]`

**Files:** Create `app/ui/Tabs.tsx` (+ `tabs.variants.ts` si aplica), Test `app/ui/Tabs.test.ts`

- [ ] **Step 1:** Investigar en `HTML1 Campaigns/index.html` el markup de "Todas 5 / Activas 3 / Pausada 1 / Borrador 1" (chip con dot de color y contador).
- [ ] **Step 2:** Crear `Tabs` como client component controlado (`value`, `onChange`, `items: {key,label,count,tone}[]`), consumiendo solo tokens semánticos (`text-accent`, `bg-surface`, etc.) y el patrón `cn`. Reusar `Dot` para el punto de color.
- [ ] **Step 3:** Test de render mínimo (`app/ui/Tabs.test.ts`) que verifica que marca activo el `value` dado. Correr con `TESTONE`.
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): primitivo Tabs para filtro por estado"`

### Task 1.3: Componente `CampanaCard` `[AGENTE]`

**Files:** Create `app/campanas/CampanaCard.tsx`

- [ ] **Step 1:** Investigar la tarjeta en `HTML1 Campaigns/index.html`: nombre (serif), pill de estado (Activa/Pausada/Borrador), línea "3 toques · 7 días · ISP >200k · Valle", `CanalTag` del canal principal, y los dos números grandes (INSCRITAS / BLOQ.).
- [ ] **Step 2:** Crear `CampanaCard` (server component) que recibe una fila de `listarCampanas()` y mapea: estado→`Pill`, canal→`CanalTag`, inscritas/bloqueadas→`Stat`. Solo tokens semánticos. Nombre en `font-heading`.
- [ ] **Step 3: Verificar** con preview que una tarjeta calca el mockup (usar `preview_inspect` para color/tipografía, no screenshot).
- [ ] **Step 4: Commit** — `git commit -m "feat(campanas): CampanaCard segun mockup V1"`

### Task 1.4: Header del hub con stats `[AGENTE]`

**Files:** Create `app/campanas/HubHeader.tsx`

- [ ] **Step 1:** Investigar el header del mockup ("Campañas" en serif grande + "332 empresas en secuencia hoy · 49 bloqueadas" + los dos stats a la derecha).
- [ ] **Step 2:** Crear `HubHeader` que recibe el resultado de `metricasHub()` y lo pinta con `Stat` + `SectionLabel`. Título en `font-heading`.
- [ ] **Step 3: Commit** — `git commit -m "feat(campanas): HubHeader con metricas"`

### Task 1.5: Ensamblar `/campanas` `[AGENTE]`

**Files:** Modify `app/campanas/page.tsx`

- [ ] **Step 1:** Reescribir `page.tsx` (server component) para: llamar `listarCampanas()` y `metricasHub()`, renderizar `HubHeader`, `Tabs` (filtro cliente sobre las campañas), grid de `CampanaCard`, y la tarjeta "Nueva campaña" que enlaza a `/campanas/nueva`. Envolver en el shell existente (`AppShell`).
- [ ] **Step 2:** Borrar los estilos legacy (`.wrap`, `.chip`, `.save`) que quedaban en esta página; ahora todo por Tailwind/tokens.
- [ ] **Step 3: Verificar** con preview: `/campanas` calca el mockup, tabs filtran, links funcionan, cero errores en consola.
- [ ] **Step 4: Commit** — `git commit -m "feat(campanas): hub /campanas rediseñado segun mockup V1"`

### Task 1.6: Tabla de empresas inscritas del hub `[AGENTE]`

**Files:** Create `app/campanas/InscritasTable.tsx`, Modify `app/db/repository.ts` (si falta un `listarInscritasHub()`), `app/campanas/page.tsx`

- [ ] **Step 1:** Investigar la tabla inferior del mockup (Electro Valle / Grupo Fibra / estados "Límite diario", "Esperando regla"). Confirmar en `repository.ts` si ya hay una query que devuelva empresas inscritas con su estado; si no, agregar `listarInscritasHub()` (misma lógica de `inscripcion.estado`, sin SQL crudo) con su test.
- [ ] **Step 2:** Crear `InscritasTable` (server component) consumiendo esa query, estados→`Pill`/`SeverityText`.
- [ ] **Step 3:** Montar en `page.tsx` debajo del grid.
- [ ] **Step 4: Commit** — `git commit -m "feat(campanas): tabla de empresas inscritas en el hub"`

---

## Fase 2: Vista 2 · Segmentación · Copiloto

**Objetivo:** filtros tipo Apollo a la izquierda, Copiloto (IA) a la derecha, lista viva al centro que recalcula en tiempo real. El DSL de segmento, `contarSegmento`, `empresasConReadiness` y `conteosReadiness` ya existen. Los huecos: la traducción lenguaje natural→`DefinicionSegmento` vía IA, y el loop reactivo.

**Investigar antes:** `HTML 2 Segmentacion/index.html`. Estado real del Copiloto: leer `app/campanas/nueva/copiloto.ts` y `copiloto.test.ts` para ver hasta dónde llega el cableado con `IAPort` (el gate G2 del Agent SDK figura pendiente; confirmar en código, no asumir).

### Task 2.0: Auditar el Copiloto existente `[CHECKPOINT]`

- [ ] **Step 1:** Leer `app/campanas/nueva/copiloto.ts`, `copiloto.test.ts`, `app/core/ports/ia.ts`, `app/adapters/claude.ts`. Reportar en 5-10 líneas: qué hace hoy el copiloto, si ya llama a `IAPort.generar`, y qué falta para producir un `DefinicionSegmento` válido desde texto. Sebastián decide si se extiende lo existente o se reescribe.

### Task 2.1: Core `interpretarSegmento(texto) → DefinicionSegmento` `[CHECKPOINT]`

Decisión de dominio: el prompt y el schema con que la IA traduce "quiero de 50k a 100k usuarios en el Valle" al DSL. El core solo depende de `IAPort` (puerto), nunca de Claude directo.

**Files:**
- Create/Modify: `app/core/segmento-ia.ts` (o extender `copiloto.ts` según el checkpoint 2.0)
- Test: `app/core/segmento-ia.test.ts` (con un `IAPort` fake que devuelve un JSON fijo)

- [ ] **Step 1: Test que falla** con un `IAPort` fake: dado texto → llama `ia.generar` con el schema `definicionSegmentoSchema` → devuelve una `DefinicionSegmento` válida que `empresasDeSegmento` puede compilar.
- [ ] **Step 2: Correr y ver fallar** — `TESTONE app/core/segmento-ia.test.ts`.
- [ ] **Step 3: Implementar** `interpretarSegmento(texto, ia: IAPort)` con el prompt que Sebastián fije, validando la salida contra `definicionSegmentoSchema`. Sin importar Claude: recibe el puerto.
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): interpretarSegmento traduce lenguaje natural al DSL"`

### Task 2.2: Server action reactiva del segmento `[AGENTE]`

**Files:** Modify `app/campanas/nueva/actions.ts`

- [ ] **Step 1:** Agregar `recalcularSegmentoAction(def: DefinicionSegmento)` que llama `empresasConReadiness` + `conteosReadiness` y devuelve `{ empresas, conteos }`. Y `segmentoDesdeTextoAction(texto)` que llama `interpretarSegmento` (con el adaptador Claude real) y luego recalcula.
- [ ] **Step 2:** Test de la action con IA fake. Correr con `TESTONE`.
- [ ] **Step 3: Commit** — `git commit -m "feat(campanas): actions de recalculo reactivo del segmento"`

### Task 2.3+: UI de la V2 (se expande al iniciar la fase) `[AGENTE]`

Inventario de componentes contra `HTML 2 Segmentacion/index.html`: panel de filtros izquierdo (`FiltroWall` rediseñado), tabla central de cuentas (`TablaCuentas` con columnas Cuenta/Ciudad/Usuarios/Estado/Canales), panel Copiloto derecho (`CopilotoPanel` con el chat + las tarjetas de opción "3 cuentas sin correo → Reemplazar/Saltar/Cola"), y la barra "9 cuentas · 5 listas para correo · 1 sin contacto". El loop reactivo: cada cambio de filtro (manual o por Copiloto) dispara `recalcularSegmentoAction` con debounce y repinta el centro. Los sub-pasos por componente se detallan aquí al arrancar la fase, con el HTML delante.

---

## Fase 3: Vista 2.9 · Importar cadencia

**Objetivo:** subir CSV/Markdown/JSON, que cargue automático, ver la estructura resuelta (toque, día, canal, copy, variables `[nombre]`), y poder devolverse si metiste la cadencia equivocada. El parser CSV/MD y `previsualizarCadenciaAction` existen; falta el parser JSON y la vista de revisión.

**Investigar antes:** `app/core/cadencia-parser.ts` (formato de `CadenciaParseada` y `PasoParseado`, funciones `extraerVariables`/`limpiarFirma`), `app/campanas/nueva/actions.ts` (`previsualizarCadenciaAction`).

### Task 3.1: Parser JSON de cadencia `[AGENTE]`

**Files:**
- Modify: `app/core/cadencia-parser.ts`
- Test: `app/core/cadencia-parser.test.ts` (extender)

- [ ] **Step 1: Test que falla** para `parsearCadenciaJson(texto)`:
```ts
test("parsearCadenciaJson lee pasos y extrae variables", () => {
  const json = JSON.stringify({
    nombre: "Pasarela ISP Valle",
    pasos: [{ diaOffset: 0, canal: "correo", asunto: "Pagos más simples para [empresa]", cuerpo: "Hola [nombre]" }],
  });
  const c = parsearCadenciaJson(json);
  assert.equal(c.nombre, "Pasarela ISP Valle");
  assert.equal(c.pasos[0].canal, "correo");
  assert.deepEqual(c.pasos[0].variables, ["empresa", "nombre"]);
});
```
- [ ] **Step 2: Correr y ver fallar** — `TESTONE app/core/cadencia-parser.test.ts`.
- [ ] **Step 3: Implementar `parsearCadenciaJson`** reusando `extraerVariables`/`limpiarFirma` (DRY con CSV/MD), auto-numerando `orden`, validando con `cadenciaParseadaSchema`.
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): parser JSON de cadencia"`

### Task 3.2: Preview soporta formato `json` `[AGENTE]`

**Files:** Modify `app/campanas/nueva/actions.ts` (`previsualizarCadenciaAction`)

- [ ] **Step 1:** Agregar `formato: "json"` al switch que ya maneja `"csv"|"md"`, llamando `parsearCadenciaJson`. Test de la action con los tres formatos. Correr con `TESTONE`.
- [ ] **Step 2: Commit** — `git commit -m "feat(campanas): previsualizar cadencia acepta json"`

### Task 3.3: Vista de importar/revisar `[AGENTE]`

**Files:** Create `app/campanas/nueva/ImportarCadencia.tsx`

- [ ] **Step 1:** Componente con dropzone (arrastrar CSV/MD/JSON), que al soltar llama `previsualizarCadenciaAction` y pinta la `CadenciaParseada`: por paso, día + `CanalTag` + asunto + cuerpo con las variables `[nombre]` resaltadas (mismo tratamiento visual que el mockup V3 donde las llaves salen en pill). Botón "Cambiar cadencia" que limpia y vuelve al dropzone (el "devolverse" que pidió Sebastián). Estilo en la misma línea que V3.
- [ ] **Step 2: Verificar** con preview subiendo un JSON de ejemplo.
- [ ] **Step 3: Commit** — `git commit -m "feat(campanas): vista importar y revisar cadencia (V2.9)"`

---

## Fase 4: Vista 3 · Cadencia

**Objetivo:** rediseñar el constructor: tabla toque/día/canal/aprobación (toggle Revisar↔Automático = `esManual`) + "tu cadencia por pasos" con el copy resuelto y variables. Modelo completo (`getCadencia`, `pasoCadencia.esManual`, `versionPaso`); trabajo = UI + editar copy inline.

**Investigar antes:** `Cadencias Paso 2 HTML3/index.html`, `app/cadencias/ConstructorCadencia.tsx` (constructor legacy), `getCadencia` en `repository.ts`.

Inventario (se expande al iniciar): fila de toque editable (día select + `Chip` de canal + toggle Revisar/Automático), timeline "por pasos" con las tarjetas de copy, editar copy inline (server action `actualizarVersionPaso`/`agregarVersionPaso` que ya existen). Añadir toque/paso. Sin huecos de core.

---

## Fase 5: Vista Reglas (nueva, sin mockup)

**Objetivo:** pantalla propia para la regla de canal faltante (`reglaFaltante`: reemplazar/saltar/cola), entre Cadencia y Destinatarios. Sebastián la marcó como crítica y pidió que se diseñe siguiendo la línea de los mockups; si luego no le gusta, saca diseño propio. El backend existe entero (`campana.reglaFaltante`, `readinessEmpresa`, `conteosReadiness`).

**Investigar antes:** cómo aparece la regla inline en `Cockpit Destinatarios html4/index.html` ("Regla activa: cuando falta correo, reemplazo por llamada · Cambiar regla") y las opciones del Copiloto en `HTML 2 Segmentacion/index.html`, para calcar el lenguaje visual.

Inventario (se expande al iniciar): selector de las tres reglas con explicación de cada una y su efecto en vivo sobre los conteos (`conteosReadiness` recalcula "X listas / Y parciales / Z en cola" al cambiar la regla). Es UI + reuso de queries existentes; cero core nuevo. Guardar en `campana.reglaFaltante` vía action.

---

## Fase 6: Vista 4 · Destinatarios · Readiness

**Objetivo:** el "recibo": pasa de cuentas a destinatarios, muestra la cadencia que recibe cada uno (con los ajustes por regla, ej. "1 Llamada ~~correo~~"), toques totales, estado (Completa/Con ajuste), y los totales por canal. Hueco: hoy `inscribirCampana` persiste; la V4 necesita ver esto ANTES de comprometer, o sea un preview no destructivo.

**Investigar antes:** `Cockpit Destinatarios html4/index.html`, `inscribirCampana`/`elegirDestinatarioDefault`/`readinessEmpresa` en `repository.ts` y `app/core/`.

### Task 6.1: Core `previsualizarInscripcion` (dry-run) `[CHECKPOINT]`

Decisión de dominio: separar "decidir a quién y con qué ajustes" (puro, sin escribir) de "persistir" (la transacción actual). Extraer la parte pura para que preview y ejecución compartan lógica y no se dupliquen.

**Files:**
- Create: `app/core/preview-inscripcion.ts`
- Test: `app/core/preview-inscripcion.test.ts`
- Modify (refactor): `app/db/repository.ts` (`inscribirCampana` reusa la función pura)

- [ ] **Step 1: Test que falla:** dado un segmento + cadencia + regla, `previsualizarInscripcion(...)` devuelve por empresa: destinatario elegido, cadencia ajustada (pasos con su canal final tras la regla), toques totales, estado (`lista`/`con_ajuste`/`bloqueada`), sin tocar la DB.
- [ ] **Step 2: Correr y ver fallar** — `TESTONE app/core/preview-inscripcion.test.ts`.
- [ ] **Step 3: Implementar** la función pura (reusa `elegirDestinatarioDefault`, `canalesDisponibles`, `readinessEmpresa`). Devuelve una estructura serializable.
- [ ] **Step 4:** Refactor `inscribirCampana` para que su cálculo de "a quién/qué ajuste" llame a esta misma función, y solo la parte de escritura quede en el Repository. Correr `npm test` completo: nada se rompe.
- [ ] **Step 5: Commit** — `git commit -m "feat(core): previsualizarInscripcion dry-run compartido con inscribirCampana"`

### Task 6.2: Action + UI de la V4 (se expande al iniciar) `[AGENTE]`

`previsualizarInscripcionAction(idCampana)` que llama la función pura. UI: tabla de destinatarios (contacto+empresa, cadencia con canales tachados/ajustados, toques, estado `Pill`), panel "Regla activa · Cambiar regla" (enlaza a Fase 5), resumen lateral (correos/llamadas/WhatsApp/total). Se detalla con el HTML delante.

---

## Fase 7: Vista 5 · Preview cinemático

**Objetivo:** animación de la secuencia por destinatario (timeline día 0..7), cada nodo muestra el correo/mensaje con las variables ya sustituidas (`[nombre]`→Hidaly, `[empresa]`→Giganav). `calcularCalendario` y `getCadencia` existen; falta el render de variables. La V5 ya viene como proyecto React en `html5/` (portar, no reescribir desde cero).

### Task 7.1: Core `renderizarCopy(texto, datos)` `[AGENTE]`

**Files:** Create `app/core/render-copy.ts`, Test `app/core/render-copy.test.ts`

- [ ] **Step 1: Test que falla:**
```ts
test("renderizarCopy sustituye variables y marca faltantes", () => {
  const r = renderizarCopy("Hola [nombre] de [empresa]", { nombre: "Hidaly", empresa: "Giganav" });
  assert.equal(r.texto, "Hola Hidaly de Giganav");
  assert.deepEqual(r.faltantes, []);
});
test("renderizarCopy reporta variable sin dato", () => {
  const r = renderizarCopy("Hola [nombre]", {});
  assert.deepEqual(r.faltantes, ["nombre"]);
});
```
- [ ] **Step 2: Correr y ver fallar** — `TESTONE app/core/render-copy.test.ts`.
- [ ] **Step 3: Implementar** `renderizarCopy(texto, datos)` (función pura; misma sintaxis `[var]` que `extraerVariables`, DRY con el parser). Devuelve `{ texto, faltantes }`.
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): renderizarCopy sustituye variables de personalizacion"`

### Task 7.2: Portar el preview cinemático (se expande al iniciar) `[AGENTE]`

Traer los componentes de `Cinematic Sequence Preview html5/src/sections/SequencePreview.tsx` a `app/campanas/nueva/PreviewCinematico.tsx`, cambiando sus tokens/utilidades por los del proyecto (Tailwind v4 + semánticos), alimentándolo con `calcularCalendario` + `getCadencia` + `renderizarCopy` sobre un destinatario real. La animación es frontend puro.

---

## Fase 8: Vista 6 · Lanzar

**Objetivo:** configurar el goteo de ingreso (cuántos contactos NUEVOS entran por día), el ritmo (todos los días / día sí día no / personalizado), el tope de toques por día, y cuándo arranca (hoy / programar). Esto NO toca la cadencia de toques (día 0/3/5/7 ya está); es la cadencia de INGRESO. `campana.intakeDiario` existe en seco; ritmo, tope y fecha de inicio no están modelados.

**Investigar antes:** `Lanzar Cockpit html6/index.html`, `campana` en `app/db/schema.ts`, `inscribirCampana` en `repository.ts`.

### Task 8.1: Schema del goteo `[CHECKPOINT]`

Decisión de dominio: cómo se modela ritmo y tope. Propuesta a validar con Sebastián: agregar a `campana` los campos `ritmoIngreso` (`diario`|`dia_si_dia_no`|`personalizado`), `topeToquesDia` (int, global o por campaña, según lo que Sebastián decida), `fechaInicio` (ISO date, null = hoy). `intakeDiario` ya existe.

**Files:** Modify `app/db/schema.ts` (tabla `campana`), Modify `app/db/validation.ts` (`campanaInputSchema`), migración Drizzle.

- [ ] **Step 1:** Con la decisión de Sebastián, agregar las columnas a `campana` (reflejar en el schema Drizzle; recordar que isps.db no usa FKs, la lógica va en el Repository). Generar migración con drizzle-kit.
- [ ] **Step 2:** Extender `campanaInputSchema` con los enums nuevos (`RITMOS_INGRESO` en `validation.ts`, junto a `MODOS_CAMPANA`/`REGLAS_FALTANTE`).
- [ ] **Step 3: Commit** — `git commit -m "feat(schema): ritmo, tope y fecha de inicio en campana"`

### Task 8.2: Core `calcularGoteo(total, intakeDiario, ritmo, inicio)` `[CHECKPOINT]`

Decisión de dominio: la lógica de "20 por día, día sí día no → estos entran el D1, estos el D3..." y el cálculo "en 100 tardarías 9 días hábiles".

**Files:** Create `app/core/goteo.ts`, Test `app/core/goteo.test.ts`

- [ ] **Step 1: Test que falla:** dado total=4, intakeDiario=20, ritmo=`dia_si_dia_no`, inicio=hoy → los 4 entran hoy (D1), y en un segmento de 100 el cálculo devuelve 9 días hábiles. Casos: ritmo diario vs día sí día no, respetar días hábiles.
- [ ] **Step 2: Correr y ver fallar** — `TESTONE app/core/goteo.test.ts`.
- [ ] **Step 3: Implementar** `calcularGoteo(...)` puro: devuelve `{ porDia: {fecha, cuantos}[], diasHabiles }`. Reusar el manejo de días bloqueados de `motor-cadencia.ts` si aplica (DRY).
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): calcularGoteo distribuye el ingreso a la cadencia"`

### Task 8.3: Enrollment escalonado `[CHECKPOINT]`

- [ ] **Step 1:** Extender `inscribirCampana` (o un `inscribirEscalonado`) para que use `calcularGoteo` y programe la `fechaInscripcion`/`fechaProgramada` de cada empresa según el goteo, en vez de meter a todos el día 1. Test que verifica que con goteo, la fecha programada del contacto N respeta el ritmo. Correr `npm test`.
- [ ] **Step 2: Commit** — `git commit -m "feat(core): enrollment escalonado por goteo de ingreso"`

### Task 8.4: UI de la V6 (se expande al iniciar) `[AGENTE]`

Inventario contra `Lanzar Cockpit html6/index.html`: toggle "Lanzar hoy / Programar", slider "contactos por día" (`intakeDiario`), `Seg` para ritmo, stepper "máximo de toques por día", la barra "así se distribuye" (D1..D9, alimentada por `calcularGoteo`), tarjeta "Envía una prueba", botón "Lanzar hoy". Sin core nuevo aquí.

---

## Fase 9: Vista 7 · Por revisar

**Objetivo:** inbox de toques manuales (los marcados "Revisar" = `esManual`), ya personalizados con datos reales, que no salen hasta que Sebastián aprueba. Es superficie operativa permanente (nav "Por revisar · 2"), NO paso del wizard. Se surtir en dos puertas: el inbox y desde la cola del día (mismo componente). Backend completo: `pasosManualesPendientes`, `aprobarPasoManual(idPasoInscripcion, fecha, cuerpoFinal?)` (ya soporta editar antes de aprobar). Reusa `renderizarCopy` de la Fase 7.

**Investigar antes:** `OnePay Review HTML 7/index.html`, `pasosManualesPendientes`/`aprobarPasoManual` en `repository.ts`.

### Task 9.1: Ruta + inbox `[AGENTE]`

**Files:** Create `app/por-revisar/page.tsx`, Create `app/por-revisar/ToqueRevisar.tsx`, Modify `app/ui/shell/SidebarNav.tsx` (item "Por revisar" con badge = conteo de `pasosManualesPendientes`)

- [ ] **Step 1:** `page.tsx` (server) llama `pasosManualesPendientes()`, pinta el header "N toques esperan tu aprobación" + lista de `ToqueRevisar`.
- [ ] **Step 2:** `ToqueRevisar`: `CanalTag`, contacto+empresa, copy renderizado con `renderizarCopy` (variables resaltadas), pill de estado (Pendiente/Aprobado), botones "Editar" (edita `cuerpoFinal`) y "Aprobar y programar" (server action → `aprobarPasoManual`).
- [ ] **Step 3:** Agregar el item al nav con badge.
- [ ] **Step 4: Verificar** con preview: aprobar mueve el toque a "Aprobado".
- [ ] **Step 5: Commit** — `git commit -m "feat(por-revisar): inbox de toques manuales (V7)"`

### Task 9.2: Entrada desde la cola `[AGENTE]`

- [ ] **Step 1:** En `app/cola/` (donde se listan los pasos de hoy), hacer que un toque manual abra el mismo `ToqueRevisar` (reuso, no duplicar). Investigar `CadenciasHoy.tsx`.
- [ ] **Step 2: Commit** — `git commit -m "feat(cola): abrir revision de toque manual desde la agenda"`

---

## Self-review (cobertura del spec)

- V1 hub → Fase 1. V2 Copiloto → Fase 2. V2.9 importar → Fase 3. V3 cadencia → Fase 4. Reglas → Fase 5. V4 destinatarios → Fase 6. V5 preview → Fase 7. V6 lanzar → Fase 8. V7 por revisar → Fase 9. Tokens (requisito de Sebastián) → Fase 0. Cobertura completa.
- Huecos de core del reframe, todos con tarea: parser JSON (3.1), NL→segmento (2.1), preview no destructivo (6.1), render variables (7.1), goteo/ritmo/tope/fecha (8.1-8.3), métricas hub (1.1), loop reactivo (2.2). El "confirmar gate G2" está en 2.0.
- Consistencia de nombres: `previsualizarInscripcion` (6.1) alimenta `previsualizarInscripcionAction` (6.2); `renderizarCopy` (7.1) se reusa en 7.2 y 9.1; `interpretarSegmento` (2.1) lo llama `segmentoDesdeTextoAction` (2.2); `calcularGoteo` (8.2) lo usan 8.3 y la barra de 8.4.

## Puntos de decisión pendientes (checkpoints de dominio)

1. **Fórmula de métricas** del hub (1.1): qué cuenta "toques semana" y "tasa de respuesta".
2. **Prompt/schema del Copiloto** (2.1) y si se extiende `copiloto.ts` o se reescribe (2.0).
3. **Separar decidir de persistir** en inscripción (6.1).
4. **Modelo de goteo:** ritmo, y si el tope de toques/día es global o por campaña (8.1); la lógica de distribución (8.2).
5. **Fuentes actuales** en tokens (0.1): IBM Plex Sans como cuerpo, todo swappable.

## Handoff

Ejecutar con subagentes chiquitos por tarea, con review entre tareas y pausa cada 2-3 tareas en boundary limpio (según la forma de trabajo de Sebastián). Las tareas `[CHECKPOINT]` no se delegan en frío: paran para que Sebastián meta la decisión de dominio antes de que el agente arme el resto.
