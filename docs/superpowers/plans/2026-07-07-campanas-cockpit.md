# Cockpit de Campañas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado (2026-07-07, sesión 3):** **Plan completo, Fases 0-10 todas hechas.** Esta sesión cerró Fase 6 (Destinatarios), Fase 7 Task 7.2 (preview cinemático), Fase 8 entera (goteo, 3 checkpoints seguidos con Sebastián) y Fase 10 (nueva, panel de control por campaña, pedida a mitad de sesión). Ver **"Bitácora de ejecución — sesión 2026-07-07 (sesión 3, checkpoints + paralelo)"** al final para el detalle completo, incluidos los checkpoints resueltos y los incidentes de working tree compartido. Queda un gap anotado fuera de alcance de este plan: tarjetas de excepción por cuenta/lote del Copiloto V2 (ver "Qué falta" al final de la sesión 2).

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
| 0 | (fundacional) | Tokens en fuente única | ✅ **HECHO** (3 commits) |
| 1 | V1 Campañas (hub) | Métricas agregadas | ✅ **HECHO** (6 commits) |
| 2 | V2 Segmentación · Copiloto | NL→DefinicionSegmento + loop reactivo | ✅ **HECHO** — backend heredado + UI final (`f881125`) calcada de V2, acerca `TablaCuentas`/`FiltroWall`/`CopilotoPanel` al mockup |
| 3 | V2.9 Importar cadencia | Parser JSON | ✅ **HECHO** (3 commits), wireada al flujo real en el rediseño fuera-de-plan |
| 4 | V3 Cadencia | (editar copy inline) | ✅ **HECHO** — mutators de `pasoCadencia` cerrados (`f2665d7`, task suelta #11): día/canal/aprobación persisten, añadir toque/paso funciona |
| 5 | V-Reglas (nueva) | (existe `reglaFaltante`) | ✅ **HECHO** (`fe71106`) — standalone en `/campanas/[id]/reglas`, no colgada aún de ningún wizard |
| 6 | V4 Destinatarios · Readiness | Preview no destructivo | ⚠️ **Core hecho** (`previsualizarInscripcion`, `ea59e60`, checkpoint resuelto: siempre revalidar); falta la UI (Task 6.2) |
| 7 | V5 Preview cinemático | Render de variables | ✅ **HECHO** (`f9f6025` core + `97c46d0` UI) — componente listo, sin enchufar a ruta real (espera Fases 6/8) |
| 8 | V6 Lanzar | Goteo de ingreso + ritmo + tope + fecha inicio | ✅ **HECHO** (`3e6a1ff` schema, `0e94a6d` goteo, `a270a33` enrollment, `3f0a269` UI) — 3 checkpoints resueltos con Sebastián |
| 9 | V7 Por revisar | (existe `pasosManualesPendientes`) + render variables | ✅ **HECHO** (`58e4ef4`) — inbox permanente en `/por-revisar` + nav badge. La entrada desde la cola (Task 9.2) ya existía de antes en `CadenciasHoy.tsx`, no hubo que construirla |
| 10 | Panel de control de campaña (nuevo, sin mockup) | Métricas por campaña + errores | ✅ **HECHO** (`4e597f7`) — `CampanaCard` es link real, sub-nav a Cadencia/Reglas/Destinatarios/Lanzar |

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

- [x] **Step 1: Escribir `docs/design-tokens.md`** con dos tablas.

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
- [x] **Step 2: Commit** — `git commit -m "docs(tokens): contrato de tokens primitivos y semanticos"` → `843753f`

> **Nota para Sebastián (checkpoint):** el valor actual de `--font-body` lo pongo en IBM Plex Sans para calcar el mockup (el serif Newsreader ya coincide con el proyecto). Como todo pasa por el token, cambiarlo a Space Mono o a Inter después es una línea. Confírmame los roles antes de que el agente toque `globals.css`.

### Task 0.2: Reestructurar `@theme` en dos capas `[AGENTE]`

**Files:** Modify `app/globals.css:3-72`

- [x] **Step 1:** Dentro de `@theme`, agregar primero el bloque de primitivos (los `--violet-*`, `--green`, neutros, etc. de la doc). No borrar los nombres semánticos que ya usan los componentes (`--color-accent`, `--color-surface`, `--color-done`, `--color-overdue`, `--color-today`, `--color-warn`, los `--color-canal-*`): reapuntarlos a los primitivos con `var()`. Ejemplo:
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
- [x] **Step 2:** Definir el vocabulario tipográfico semántico. **DESVIACIÓN:** `--font-heading` NO se reapuntó a `--ff-serif` como decía el plan — ya estaba en uso en producción (home dashboard, Archivo Black). Se dejó `--font-heading` intacto (solo home) y se usa `--font-serif` (ya existía, Newsreader) para los títulos del cockpit de campañas. Documentado en `docs/design-tokens.md`.
- [x] **Step 3: Verificar build** — `npm run build`. Compila sin errores.
- [x] **Step 4: Verificar `/cola` no se rompió** — verificado por lectura de código + build (no por preview visual, ver bitácora).
- [x] **Step 5: Commit** — `git commit -m "refactor(tokens): separar primitivos de semanticos en @theme"` → `2df24bc`

### Task 0.3: Alinear las fuentes en layout `[AGENTE]`

**Files:** Modify `app/layout.tsx:2-12`

- [x] **Step 1:** `IBM_Plex_Sans` agregado como `--ff-body`. `Space_Mono` quedó como `--ff-space-mono` dormido (ya no es el body, no se borró).
- [x] **Step 2:** `--ff-body` apunta a IBM Plex Sans.
- [x] **Step 3: Verificar** — build limpio (ver nota de verificación visual en la bitácora).
- [x] **Step 4: Commit** — `git commit -m "feat(tokens): IBM Plex Sans como font-body del cockpit"` → `bc0cf69`

---

## Fase 1: Vista 1 · Campañas (hub, CRUD)

**Objetivo:** rediseñar `/campanas` como el hub del mockup: header con stats globales, tabs por estado, grid de tarjetas de campaña, tarjeta "Nueva campaña". Es a donde ya apunta el nav y el módulo del home. El backend (`listarCampanas`) existe; falta una query de métricas agregadas del header.

**Investigar antes:** `HTML1 Campaigns/index.html` (grid de tarjetas ~línea de `.card`, header con "1.284 toques esta semana / 18% tasa de respuesta", tabs "Todas/Activas/Pausada/Borrador", y la tabla inferior de empresas inscritas con estados "Límite diario"/"Esperando regla"). Referencia de estilo migrado: `app/cola/DashboardHeader.tsx`.

### Task 1.1: Query de métricas del hub `[CHECKPOINT]`

Decisión de dominio: qué es "toques esta semana" (¿pasos enviados en los últimos 7 días? ¿eventos `enviado` de `eventoTracking`?) y "tasa de respuesta" (¿`respondio` / `enviado`?). Sebastián define la fórmula.

**Files:**
- Modify: `app/db/repository.ts` (agregar `metricasHub()`)
- Test: `app/db/repository.metricas.test.ts`

- [x] **Steps 1-5: TDD completo.** El ejemplo de arriba (ratio simple 1/3) quedó OBSOLETO: Sebastián pidió cohorte real vía checkpoint interactivo — "de los toques 'enviado' en la ventana, cuántos tienen un evento 'respondio' asociado por `idPasoInscripcion`, sin importar cuándo llegó la respuesta" (no un ratio de conteos sueltos en la misma ventana de 7 días). `empresasEnSecuencia`/`bloqueadasEsperandoRegla` se resolvieron con `inscripcion.estado = 'activa'/'bloqueada'` (global, no por campaña), reusando el mismo criterio que `inscripcionesBloqueadas()` — no se inventó un estado nuevo. Commit → `a741472`

### Task 1.2: Primitivo `Tabs` para filtro por estado `[AGENTE]`

**Files:** Create `app/ui/Tabs.tsx` (+ `tabs.variants.ts` si aplica), Test `app/ui/Tabs.test.ts`

- [x] **Steps 1-4.** `Tabs` creado, extendió `Dot` (antes solo `overdue|today`) con tonos `done`/`faint` — cambio de bajo riesgo, primitivo sin uso previo. Commit → `04da43c`

### Task 1.3: Componente `CampanaCard` `[AGENTE]`

**Files:** Create `app/campanas/CampanaCard.tsx`

- [x] **Steps 1-4.** Nombre en `font-serif` (NO `font-heading` — ver desviación de Fase 0). `listarCampanas()` se extendió (aditivo, sin romper consumidores) con `pasos`/`dias`/`canalPrincipal`/`descripcionSegmento` porque el schema no tiene tier/región estructurados como asume el mockup ("ISP >200k · Valle"). Sin ruta de detalle (`/campanas/[id]` no existe), quedó como `<article>` no interactivo, no un link roto. Verificación visual NO se hizo con preview (dev server de otra sesión bloqueaba el puerto) — solo lectura de mockup + `tsc`/build/tests. Commit → `aae1017`

### Task 1.4: Header del hub con stats `[AGENTE]`

**Files:** Create `app/campanas/HubHeader.tsx`

- [x] **Steps 1-3.** Título en `font-serif` (no `font-heading`). Commit → `e5dc999`

### Task 1.5: Ensamblar `/campanas` `[AGENTE]`

**Files:** Modify `app/campanas/page.tsx`

- [x] **Steps 1-4.** Envuelto en `AppShell`. Commit → `08554db`

### Task 1.6: Tabla de empresas inscritas del hub `[AGENTE]`

**Files:** Create `app/campanas/InscritasTable.tsx`, Modify `app/db/repository.ts` (si falta un `listarInscritasHub()`), `app/campanas/page.tsx`

- [x] **Steps 1-4. DESVIACIÓN encontrada:** "Límite diario"/"Esperando regla" NO son estados reales (el schema solo tiene `activa/bloqueada/finalizada/pausada`; "límite diario" no existe en ningún lado). Se usó el label `"Bloqueada · cola de revisión"` en vez del literal del mockup, porque es el significado real de `bloqueada` en este dominio. Además, la tabla del mockup en realidad vive en un panel "Contactos" separado (`data-panel-id="contactos"`), no bajo el grid de Campañas — se montó donde pedía el plan de todas formas (instrucción explícita, no se inventó una ruta nueva fuera de alcance). Commit → `c36045c`

---

## Fase 2: Vista 2 · Segmentación · Copiloto

**Objetivo:** filtros tipo Apollo a la izquierda, Copiloto (IA) a la derecha, lista viva al centro que recalcula en tiempo real. El DSL de segmento, `contarSegmento`, `empresasConReadiness` y `conteosReadiness` ya existen. Los huecos: la traducción lenguaje natural→`DefinicionSegmento` vía IA, y el loop reactivo.

**Investigar antes:** `HTML 2 Segmentacion/index.html`. Estado real del Copiloto: leer `app/campanas/nueva/copiloto.ts` y `copiloto.test.ts` para ver hasta dónde llega el cableado con `IAPort` (el gate G2 del Agent SDK figura pendiente; confirmar en código, no asumir).

### Task 2.0: Auditar el Copiloto existente `[CHECKPOINT]`

- [x] **Step 1: HECHO — resultado cambió el alcance de 2.1/2.2.** `pedirAlCopiloto` en `copiloto.ts` YA hace NL→`DefinicionSegmento` completo, multi-turno, cableado correctamente por `IAPort` (nunca toca Claude directo). NO se reescribió.

### Task 2.1: Core `interpretarSegmento(texto) → DefinicionSegmento` `[CHECKPOINT]` — **OBSOLETO, no se hizo tal como estaba escrito**

`pedirAlCopiloto` ya cumplía este rol. No se creó `segmento-ia.ts` nuevo. El único gap real era que `campos: CampoDisponible[]` se pasaba `[]` (placeholder) por falta de `Repository.valoresDistintosCampo` — y AL INVESTIGAR se encontró que **eso también ya existía**, heredado de una consolidación de ramas anterior a `feat/campanas-cockpit` (commit `db9b497` y relacionados, ancestros tanto de `main` como de esta rama). Ver bitácora para el detalle de cómo se verificó esto (git log inicialmente no lo mostraba por profundidad, hubo que rastrear por hash).

### Task 2.2: Server action reactiva del segmento `[AGENTE]` — **YA EXISTÍA, ubicación distinta a la que asumía el plan**

No están en `app/campanas/nueva/actions.ts` (ese archivo solo tiene las de crear cadencia/campaña) sino en `app/campanas/actions.ts`: `previsualizarConReadinessAction` (equivalente a `recalcularSegmentoAction`) y `copilotoAction` (equivalente a `segmentoDesdeTextoAction`), ya armando `campos` reales con `valoresDistintosCampo`.

### Task 2.3+: UI de la V2 (se expande al iniciar la fase) `[AGENTE]` — **PENDIENTE, esto sigue sin hacer**

`CopilotoPanel.tsx` existe y es funcional (conectado a `copilotoAction`, tokens semánticos correctos) pero es genérico: input + lista tipo chat, NO calca el mockup `HTML 2 Segmentacion/index.html` (panel de filtros izquierdo con chips, tabla central con columnas Cuenta/Ciudad/Usuarios/Estado/Canales, panel Copiloto derecho con tarjetas de opción "3 cuentas sin correo → Reemplazar/Saltar/Cola", barra "9 cuentas · 5 listas para correo · 1 sin contacto"). Esto sigue siendo trabajo real pendiente — es lo único de Fase 2 que falta.

---

## Fase 3: Vista 2.9 · Importar cadencia

**Objetivo:** subir CSV/Markdown/JSON, que cargue automático, ver la estructura resuelta (toque, día, canal, copy, variables `[nombre]`), y poder devolverse si metiste la cadencia equivocada. El parser CSV/MD y `previsualizarCadenciaAction` existen; falta el parser JSON y la vista de revisión.

**Investigar antes:** `app/core/cadencia-parser.ts` (formato de `CadenciaParseada` y `PasoParseado`, funciones `extraerVariables`/`limpiarFirma`), `app/campanas/nueva/actions.ts` (`previsualizarCadenciaAction`).

### Task 3.1: Parser JSON de cadencia `[AGENTE]`

**Files:**
- Modify: `app/core/cadencia-parser.ts`
- Test: `app/core/cadencia-parser.test.ts` (extender)

- [x] **Steps 1-5: TDD real** (test falló primero, confirmado). `parsearCadenciaJson` reusa `extraerVariables`/`limpiarFirma`. **DESVIACIÓN:** no se validó con `cadenciaParseadaSchema` — los parsers CSV/MD existentes tampoco la usan (esa validación vive deliberadamente en el Repository, no en el parser). Se mantuvo la misma separación por consistencia. Se extrajo `parsearCadenciaPorFormato(formato, texto, meta)` al core (no un switch inline en actions.ts) porque Next.js exige que toda función exportada de un archivo `'use server'` sea `async`. Esto forzó actualizar `crearCampanaConCadenciaAction` (usaba los parsers viejos directo). Commit → `c4c6b16`

### Task 3.2: Preview soporta formato `json` `[AGENTE]`

**Files:** Modify `app/campanas/nueva/actions.ts` (`previsualizarCadenciaAction`)

- [x] **Steps 1-2.** Commit → `173e982`

### Task 3.3: Vista de importar/revisar `[AGENTE]`

**Files:** Create `app/campanas/nueva/ImportarCadencia.tsx`

- [x] **Steps 1-3.** No se usó `Pill.tsx` para el resalte de variables (es para tonos hot/warm/cold, no para el pill violeta del mockup V3) — se usó `bg-accent-bg`/`text-accent-ink` directo. **Importante:** en esta tarea el componente se construyó pero NO se conectó a `NuevaCampanaFlujo.tsx` (que en ese momento seguía usando `CrearCampana.tsx`, el textarea viejo) — quedó flageado explícitamente como "trabajo de Fase 4". Terminó resuelto más tarde, pero no en Fase 4: en el rediseño completo de `/campanas/nueva` que pidió Sebastián a mitad de sesión (ver bitácora, "trabajo fuera del plan"). Commit → `143e730`; extendido después con props `onResuelto`/`onLimpiar` en el commit `ecc60d5`.

---

## Fase 4: Vista 3 · Cadencia

**Objetivo:** rediseñar el constructor: tabla toque/día/canal/aprobación (toggle Revisar↔Automático = `esManual`) + "tu cadencia por pasos" con el copy resuelto y variables. Modelo completo (`getCadencia`, `pasoCadencia.esManual`, `versionPaso`); trabajo = UI + editar copy inline.

**Investigar antes:** `Cadencias Paso 2 HTML3/index.html`, `app/cadencias/ConstructorCadencia.tsx` (constructor legacy), `getCadencia` en `repository.ts`.

Inventario (se expande al iniciar): fila de toque editable (día select + `Chip` de canal + toggle Revisar/Automático), timeline "por pasos" con las tarjetas de copy, editar copy inline (server action `actualizarVersionPaso`/`agregarVersionPaso` que ya existen). Añadir toque/paso. Sin huecos de core.

**HECHO.** UI construida en `app/cadencias/[id]/{page,CadenciaCockpit,actions}.tsx` — **archivo nuevo, NO in-place** sobre `ConstructorCadencia.tsx` legacy (ese hace calendario con días bloqueados/corrimiento, un concepto distinto; `/cadencias/page.tsx` además ya redirige a `/campanas` y no había ruta viva para ver una cadencia por id, así que tocar el legacy hubiera roto ese redirect). Commit → `bee4384`.

**Gap cerrado en sesión 2 (`f2665d7`, task #11 del tracker):** el repository ganó `actualizarPasoCadencia` (UPDATE parcial validado con Zod contra `CANALES`) y `agregarPasoCadencia` (INSERT transaccional con orden correlativo + `versionPaso` default, mismo patrón que `crearCadencia`). `CadenciaCockpit.tsx` ahora persiste de verdad: día/canal/toggle Automático↔Revisar usan actualización optimista con revert si la action falla, y "+ Añadir toque"/"+ Añadir paso" ya no están deshabilitados. No se pudo verificar visualmente porque `isps.db` local no tiene ninguna cadencia real cargada (base recién reseedeada) — validado por 306 tests + `tsc` + `build` limpios.

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

**Decisión de Sebastián:** siempre revalidar. `inscribirCampana` NO recibe el resultado del preview como snapshot de verdad — vuelve a llamar `previsualizarInscripcion` justo antes de escribir, recalculando contra el estado actual de la DB. El preview que ve Sebastián en la UI puede quedar desactualizado (alguien resolvió un dato faltante entre medio); la persistencia nunca confía en eso, siempre recalcula en el momento de lanzar.

**Files:**
- Create: `app/core/preview-inscripcion.ts`
- Test: `app/core/preview-inscripcion.test.ts`
- Modify (refactor): `app/db/repository.ts` (`inscribirCampana` reusa la función pura)

- [x] **Step 1: Test que falla:** dado un segmento + cadencia + regla, `previsualizarInscripcion(...)` devuelve por empresa: destinatario elegido, cadencia ajustada (pasos con su canal final tras la regla), toques totales, estado (`lista`/`con_ajuste`/`bloqueada`), sin tocar la DB.
- [x] **Step 2: Correr y ver fallar** — `TESTONE app/core/preview-inscripcion.test.ts`.
- [x] **Step 3: Implementar** la función pura (reusa `elegirDestinatarioDefault`, `canalesDisponibles`, `readinessEmpresa`). Devuelve una estructura serializable.
- [x] **Step 4:** Refactor `inscribirCampana` para que su cálculo de "a quién/qué ajuste" llame a esta misma función, y solo la parte de escritura quede en el Repository. Correr `npm test` completo: nada se rompe (328/328).
- [x] **Step 5: Commit** — `git commit -m "feat(core): previsualizarInscripcion dry-run compartido con inscribirCampana"` → `ea59e60`

**DESVIACIÓN:** `readinessEmpresa` marca un reemplazo exitoso como `estado: 'lista'` (no le falta nada, el paso se reasignó). Para el estado del preview, eso no es lo mismo que "sin ningún ajuste": si hubo reemplazo u omisión de paso, la empresa recibe una cadencia distinta a la original. `previsualizarInscripcion` calcula `con_ajuste` mirando `readiness.reemplazos.length > 0 || readiness.pasosSinCanal.length > 0`, no el `estado` crudo de `readinessEmpresa`. También se extendió `ContactoCandidato` (`app/core/inscripcion.ts`) con `telefono?: string | null` (opcional, no rompe el uso existente) porque el preview necesita ambos canales, no solo email.

### Task 6.2: Action + UI de la V4 (se expande al iniciar) `[AGENTE]`

`previsualizarInscripcionAction(idCampana)` que llama la función pura. UI: tabla de destinatarios (contacto+empresa, cadencia con canales tachados/ajustados, toques, estado `Pill`), panel "Regla activa · Cambiar regla" (enlaza a Fase 5), resumen lateral (correos/llamadas/WhatsApp/total). Se detalla con el HTML delante.

**HECHO.** `previsualizarInscripcionCampana(idCampana)` (Repository, nuevo) resuelve empresas del segmento (mismo filtro `!excluida` que `inscribirCampana`) + sus contactos y llama la función pura `previsualizarInscripcion`; `campanaParaPreview` trae la cabecera (nombre/cadencia/segmento/regla). `previsualizarInscripcionAction` (`app/campanas/[id]/destinatarios/actions.ts`) solo envuelve eso -- de solo lectura, no escribe nada. UI standalone en `/campanas/[id]/destinatarios` (mismo patrón que `/campanas/[id]/reglas`): tabla de destinatarios con chip por paso (fondo sólido si no hubo ajuste, borde punteado + canal original tachado si la regla lo reemplazó, tachado simple si se omitió), pill de estado por color de tono (`done`/`today`/`overdue`, no el primitivo `<Pill>` porque ese fija su propio fondo neutro y el mockup pinta el pill entero con el color), resumen lateral por canal + total, y nota de cuentas bloqueadas sin contacto. No se pudo verificar visualmente: puerto 3000 ocupado por el dev server de otra sesión y la regla del repo prohíbe liberarlo o matar procesos ajenos -- verificado por `tsc --noEmit` limpio, `npm run build` limpio, y 328/328 tests verdes (sin tests nuevos: la UI consume tipos ya cubiertos por `preview-inscripcion.test.ts`, y las dos funciones de repository nuevas son composición directa de queries + la función pura ya probada, sin lógica de dominio nueva que testear).

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

- [x] **HECHO** (`97c46d0`). `PreviewCinematico.tsx` porta el track arrastrable/reproducible, nodos día 0..N y los cuatro paneles (correo/llamada/whatsapp/resumen). Consume `renderizarCopy` sobre `pasos`/`datos` recibidos por props — **no está enchufado a ninguna ruta ni a `getCadencia`/`calcularCalendario` directamente**, porque Fases 6 y 8 (que definirían esos props reales) siguen con checkpoints pendientes; wirearlo antes hubiera significado inventar ese flujo. Queda listo para conectarlo cuando 6.1/8.x se resuelvan. Desviación: sin `@phosphor-icons/react` (no instalado en el repo), símbolos de texto en su lugar (mismo patrón que `CanalTag`). tsc/build/312 tests verdes; sin verificación visual (puerto ocupado por otra sesión).

---

## Fase 8: Vista 6 · Lanzar

**Objetivo:** configurar el goteo de ingreso (cuántos contactos NUEVOS entran por día), el ritmo (todos los días / día sí día no / personalizado), el tope de toques por día, y cuándo arranca (hoy / programar). Esto NO toca la cadencia de toques (día 0/3/5/7 ya está); es la cadencia de INGRESO. `campana.intakeDiario` existe en seco; ritmo, tope y fecha de inicio no están modelados.

**Investigar antes:** `Lanzar Cockpit html6/index.html`, `campana` en `app/db/schema.ts`, `inscribirCampana` en `repository.ts`.

### Task 8.1: Schema del goteo `[CHECKPOINT]`

Decisión de dominio: cómo se modela ritmo y tope. Propuesta a validar con Sebastián: agregar a `campana` los campos `ritmoIngreso` (`diario`|`dia_si_dia_no`|`personalizado`), `topeToquesDia` (int, global o por campaña, según lo que Sebastián decida), `fechaInicio` (ISO date, null = hoy). `intakeDiario` ya existe.

**Decisión de Sebastián:** las dos, con jerarquía clara. `topeToquesDia` es un campo de `campana` (control real, editable en el wizard de Lanzar V6) — eso es lo que Sebastián ajusta cuando arma una campaña puntual. Además, la V6 necesita un cálculo agregado de "toques totales que se van a generar hoy sumando TODAS las campañas activas" — informativo, en segundo plano, sin enforcement automático del sistema (no bloquea lanzar). Sirve para que Sebastián vea la carga total antes de comprometerse y decida bajarle el tope a esta campaña si la suma se ve alta. No es una columna nueva: es una query de agregación sobre `campana.topeToquesDia`/`intakeDiario` de las campañas con `estado = 'activa'`, para el momento de crear/editar la campaña.

**Files:** Modify `app/db/schema.ts` (tabla `campana`, agrega `topeToquesDia` per-campaign), Modify `app/db/validation.ts` (`campanaInputSchema`), migración Drizzle, Modify `app/db/repository.ts` (agregar query de agregado global, ej. `toquesGlobalesHoy()` o similar, para consumo informativo en la Task 8.4 UI).

- [x] **Step 1:** Columnas agregadas a `campana` en el schema Drizzle (`ritmoIngreso` enum default `'diario'`, `topeToquesDia` int nullable, `fechaInicio` text ISO nullable). **DESVIACIÓN:** no hay `drizzle-kit generate` en este repo — el patrón real (heredado de toda migración anterior, ver `regla_faltante`/`intake_diario`) es un par de scripts Python `migrate_*_dryrun.py`/`migrate_*_apply.py` con `ALTER TABLE ADD COLUMN` idempotente (chequea `PRAGMA table_info` antes) y log en `sync_cambios`. Se siguió ese patrón: `scripts/migrate_campanas_p8_goteo_dryrun.py` + `_apply.py`, corridos contra `isps.db` real (3 columnas creadas, 4 filas logueadas). También se actualizó el `CREATE TABLE campana` de `app/db/test-helpers.ts` (fixture de tests, DDL hardcodeado); sin esto rompían 14 tests que usan esa base de prueba.
- [x] **Step 2:** `RITMOS_INGRESO` (`diario`|`dia_si_dia_no`|`personalizado`) agregado a `validation.ts` junto a `MODOS_CAMPANA`/`REGLAS_FALTANTE`, mismo patrón. `campanaInputSchema` extendido con `ritmoIngreso` (default `'diario'`), `topeToquesDia` y `fechaInicio` (opcionales). Se agregó `toquesGlobalesHoy()` en `repository.ts` (agregado informativo de `topeToquesDia ?? intakeDiario` sobre campañas `estado = 'activa'`, solo lectura, sin enforcement) para que la Task 8.4 de UI lo consuma.
- [x] **Step 3: Commit** — `git commit -m "feat(schema): ritmo, tope y fecha de inicio en campana"` → `3e6a1ff`

### Task 8.2: Core `calcularGoteo(total, intakeDiario, ritmo, inicio)` `[CHECKPOINT]`

Decisión de dominio: la lógica de "20 por día, día sí día no → estos entran el D1, estos el D3..." y el cálculo "en 100 tardarías 9 días hábiles".

**Decisión de Sebastián:** en `dia_si_dia_no`, el cupo completo (`intakeDiario`) entra en cada día activo, sin repartir a la mitad. Los días "no" no meten a nadie.

**Files:** Create `app/core/goteo.ts`, Test `app/core/goteo.test.ts`

- [x] **HECHO** (`0e94a6d`). `app/core/goteo.ts` + test, TDD confirmado. Tipo devuelto: `{ porDia: {fecha, cuantos}[], diasHabiles }`. 7/7 tests nuevos verdes.

**DESVIACIÓN:** `personalizado` sin más spec en plan/schema — tratado como alias exacto de `diario` (mismo output), documentado en comentario del código. Días hábiles = lunes a viernes fijo, lógica local a `goteo.ts` (no se reusó `ajustarPorBloqueados` de `motor-cadencia.ts` porque no está exportada y su concepto —días bloqueados configurables para REPROGRAMAR toques— es distinto del de goteo —fin de semana fijo para INGRESO—; sí se reusaron los primitivos de fecha de `app/lib/date-utils.ts`). `diasHabiles` cuenta todos los días hábiles transcurridos, incluidos los "no" de `dia_si_dia_no` (no consumen cupo pero sí cuentan como día transcurrido).

### Task 8.3: Enrollment escalonado `[CHECKPOINT]`

**Decisión de Sebastián:** el orden de entrada respeta el rank/orden en que el segmento trae las empresas (tal cual llega, sin reordenar por readiness) — la que quedó más arriba entra primero. Las empresas en estado `bloqueada` (según `previsualizarInscripcion`) se EXCLUYEN del reparto de goteo, no solo se posponen: necesitan resolverse (dato faltante, regla) antes de poder ocupar un cupo de ningún día. Solo `lista`/`con_ajuste` consumen turnos en `calcularGoteo`, en el orden del segmento.

- [x] **Step 1:** Extendido `inscribirCampana` in-place (NO se creó `inscribirEscalonado`: la firma `(idCampana) => ResultadoInscripcion` no cambió, el goteo se calcula internamente leyendo `intakeDiario`/`ritmoIngreso`/`fechaInicio` de la propia campaña — no había razón de dominio para exponer un flujo nuevo). Antes del loop transaccional se corre una pasada de solo lectura con `previsualizarInscripcion` sobre TODAS las empresas del segmento para clasificar `bloqueada` vs elegible sin escribir nada; `calcularGoteo` recibe el conteo de elegibles (no el total crudo del segmento) y su `porDia` se aplana a un array de fechas por posición, que se asigna en orden a `idsElegiblesEnOrden` (mismo orden que trae `empresasParaRevision`, sin reordenar). Dentro del loop transaccional (que sigue revalidando con `previsualizarInscripcion` por empresa, checkpoint 6.1 intacto), `fechaInscripcion` usa la fecha de goteo si la empresa terminó `activa`; si la revalidación la vuelve `bloqueada` en ese punto (dato cambió entre el cálculo de goteo y la escritura), cae al fallback `ahora` de siempre. Test nuevo en `app/db/repository.goteo.test.ts` (2 casos: goteo con intake 2/día donde la bloqueada del medio no le roba el turno a la última empresa del orden; y el caso sin `intakeDiario` que preserva el comportamiento previo, todas el mismo día). `npm test`: 337/337 (335 + 2 nuevos).
- [x] **Step 2: Commit** — `git commit -m "feat(core): enrollment escalonado por goteo de ingreso"`

### Task 8.4: UI de la V6 (se expande al iniciar) `[AGENTE]`

- [x] **HECHO** (`3f0a269`). `app/campanas/[id]/lanzar/{page,LanzarCockpit,actions}.tsx`. Toggle hoy/programar, slider+stepper `intakeDiario`, `Seg` de ritmo, stepper tope, barra D1-D9 en vivo (recalcula sin persistir vía `recalcularGoteoAction`), bloque de carga global informativo (`toquesGlobalesHoy`), tarjeta "Envía una prueba" no-op, botón Lanzar → `inscribirCampana`. `repository.ts` ganó `campanaParaLanzar` y `actualizarConfigLanzamiento`. 337/337 tests, tsc/build limpios.

**DESVIACIÓN:** `Field` en este repo es de solo display (label/value), no un input — se usaron inputs nativos + `Seg`/`SegButton` en su lugar.

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

## Fase 10: Panel de control de campaña (nuevo, sin mockup — pedido explícito de Sebastián a mitad de sesión)

**Objetivo:** al hacer clic en una campaña desde el hub (`/campanas`), aterrizar en `/campanas/[id]` — el panel de control real de esa campaña: ver/ajustar la config (ritmo/tope/fecha de Fase 8), ver salud (errores, si algo falló), ver si la gente está respondiendo, y navegar a Cadencia/Reglas/Destinatarios/Lanzar. Hoy `CampanaCard` no es un link — quedó como `<article>` no interactivo (ver bitácora Fase 1) porque no existía ruta de detalle.

**Arquitectura decidida:** shell con sub-nav, no un tab monolítico. `/campanas/[id]` es el resumen (estado, métricas filtradas por esa campaña, errores recientes) con nav lateral a las sub-rutas que ya existen o se están construyendo (`/campanas/[id]/reglas` de Fase 5, `/campanas/[id]/destinatarios` de Fase 6.2) y a `/cadencias/[id]` (Fase 4) y Lanzar (Fase 8.4). Reusa piezas ya construidas, no las duplica. Genérico por ahora — Sebastián puede pedir diseño custom después de verlo corriendo.

### Task 10.1: `CampanaCard` como link + shell + resumen `[AGENTE]`

**Files:** Modify `app/campanas/CampanaCard.tsx` (envolver en `Link` a `/campanas/[id]`), Create `app/campanas/[id]/layout.tsx` (sub-nav: Resumen/Cadencia/Reglas/Destinatarios/Lanzar), Create `app/campanas/[id]/page.tsx` (Resumen).

- [x] **HECHO** (`4e597f7`). `CampanaCard` ahora es `Link` a `/campanas/[id]`. `app/campanas/[id]/{layout,page,CampanaSubNav}.tsx`. `metricasHub` se extendió con `idCampana?: number` opcional y aditivo (mismo join que ya usaba). `campanaResumen()` nueva (estado, cadencia, segmento, `idCadencia` real para el link a `/cadencias/[id]`). 337/337 tests, tsc/build limpios.

**DESVIACIÓN:** `layout.tsx` NO envuelve en `AppShell` — las sub-rutas hijas (Reglas/Destinatarios/Lanzar) ya lo hacen cada una por su cuenta (patrón standalone); duplicarlo hubiera anidado sidebars. La sub-nav vive dentro del `AppShell` de la propia `page.tsx` de Resumen; las otras sub-rutas todavía no la tienen (fuera de este alcance). `sync_cambios` no tiene columna que relacione con campaña — la sección de errores queda como placeholder "sin errores registrados", no se inventó una relación inexistente en el schema.

---

## Self-review (cobertura del spec)

- V1 hub → Fase 1. V2 Copiloto → Fase 2. V2.9 importar → Fase 3. V3 cadencia → Fase 4. Reglas → Fase 5. V4 destinatarios → Fase 6. V5 preview → Fase 7. V6 lanzar → Fase 8. V7 por revisar → Fase 9. Tokens (requisito de Sebastián) → Fase 0. Cobertura completa.
- Huecos de core del reframe, todos con tarea: parser JSON (3.1), NL→segmento (2.1), preview no destructivo (6.1), render variables (7.1), goteo/ritmo/tope/fecha (8.1-8.3), métricas hub (1.1), loop reactivo (2.2). El "confirmar gate G2" está en 2.0.
- Consistencia de nombres: `previsualizarInscripcion` (6.1) alimenta `previsualizarInscripcionAction` (6.2); `renderizarCopy` (7.1) se reusa en 7.2 y 9.1; `interpretarSegmento` (2.1) lo llama `segmentoDesdeTextoAction` (2.2); `calcularGoteo` (8.2) lo usan 8.3 y la barra de 8.4.

## Puntos de decisión pendientes (checkpoints de dominio)

1. ✅ **RESUELTO** — Fórmula de métricas del hub (1.1): cohorte por `idPasoInscripcion` (enviado→respondio), no ratio de conteos en la ventana.
2. ✅ **RESUELTO (sin necesidad de decidir)** — el Copiloto (2.0) ya existía completo y correcto; no hubo que elegir entre extender o reescribir.
3. ✅ **RESUELTO** — Separar decidir de persistir en inscripción (6.1): siempre revalidar, `inscribirCampana` recalcula contra la DB en el momento de escribir, nunca confía en el snapshot del preview.
4. ✅ **RESUELTO** — Modelo de goteo (8.1): tope por campaña (control real, editable en el wizard) MÁS un agregado global de solo lectura (informativo, sin enforcement) para ver la carga total entre campañas activas. Distribución (8.2): en `dia_si_dia_no` el cupo completo entra en cada día activo, sin repartir a la mitad. Enrollment (8.3): orden de rank del segmento tal cual llega, bloqueadas excluidas del reparto (no consumen turno).
5. ✅ **RESUELTO** — Fuentes en tokens (0.1): IBM Plex Sans como `--font-body`. Sebastián confirmó el principio general: "no importa la familia exacta, siempre y cuando quede abstraída" — la arquitectura de capas (primitivo→semántico) es la respuesta, no un valor específico.

## Handoff

Ejecutar con subagentes chiquitos por tarea, con review entre tareas y pausa cada 2-3 tareas en boundary limpio (según la forma de trabajo de Sebastián). Las tareas `[CHECKPOINT]` no se delegan en frío: paran para que Sebastián meta la decisión de dominio antes de que el agente arme el resto.

---

## Bitácora de ejecución — sesión 2026-07-07 (rama `feat/campanas-cockpit`)

Todo lo que pasó en la sesión que ejecutó Fases 0, 1, 3, 4 + trabajo fuera de plan. Léela completa antes de retomar — tiene bugs corregidos, decisiones tomadas, y cosas que casi salen mal.

### Qué se hizo (orden real, no el del plan)

**Fase 0 (tokens), inline, secuencial** — 3 commits (`843753f`, `2df24bc`, `bc0cf69`). Sin sorpresas grandes salvo la colisión de `font-heading` (ver "Insights" abajo).

**Fases 1 y 3, en paralelo (subagentes, sin conflicto de archivos)** — Fase 1 (hub `/campanas`, 6 commits) y Fase 3 (importar cadencia, 3 commits) no compartían ningún archivo, corrieron a la vez sin problema.

**Fase 2, auditoría primero (subagente, solo lectura)** — el hallazgo cambió el trabajo: nada que construir, solo confirmar que ya existía (ver abajo).

**Fases 2 (wiring) y 4, en paralelo** — Fase 2 resultó ser "nada que hacer" (ver Insights). Fase 4 sí generó trabajo real y un gap documentado (mutators de `pasoCadencia`, quedó como task suelta).

**Trabajo fuera de plan, a mitad de sesión (pedido explícito de Sebastián):**
1. Rediseño completo de `/campanas/nueva` — Sebastián reportó la vista como "superpeje" (mal hecha). Investigación reveló que **la causa raíz no era un problema de diseño sino de flujo**: cuando ya había segmentos guardados, la página mostraba `CrearCampana.tsx` (un formulario legacy con textarea gigante para pegar markdown a mano, CSS `.wrap`/`.chip`/`.capture` sin tokens) en vez del cockpit `NuevoSegmento.tsx` que ya calcaba el mockup V2 razonablemente bien. Fix: `page.tsx` pasó de `.wrap` (max-width 860px, la causa del espacio lateral enorme) a `AppShell`; `NuevaCampanaFlujo.tsx` se rehizo como máquina Segmento→Cadencia real; se agregó un toggle para ocultar/mostrar el Copiloto; `CrearCampana.tsx` se borró del flujo; `CadenciaPaso.tsx` (nuevo) conecta `ImportarCadencia` (Fase 3, existía pero no estaba wireada) con `crearCampanaConCadenciaAction`. Commit → `ecc60d5`.
2. Eliminación de `/campanas/segmentos` — Sebastián notó que esa ruta (el builder Parte 1/2 original, pre-cockpit, mismo CSS legacy) ya no tenía sentido: la segmentación real vive en `/campanas/nueva`. Se confirmó que nada la enlazaba (ni nav, ni otra página) y se borró completa, incluyendo las server actions huérfanas (`previsualizarSegmentoAction`, `excluirLeadAction`/`incluirLeadAction`). `excluirDeSegmento`/`incluirDeSegmento` se dejaron intactos en el Repository — la capacidad de dominio sigue viva, solo perdió su UI. Commit → `824a93d`.

### Insights (arquitectura y hallazgos no obvios)

- **Colisión de `font-heading`.** El plan (línea 105 original) pedía `--font-heading: var(--ff-serif)` para los títulos del cockpit de campañas. Pero `--font-heading` YA estaba en producción apuntando a Archivo Black, usado por el home dashboard (`app/page.tsx`, `StatCard.tsx`, `PipelineBar.tsx`). Cambiarlo hubiera roto el home. Resuelto: el cockpit de campañas usa `font-serif` (ya existía, Newsreader, y es lo que `/cola` ya usa) — `font-heading` queda reservado exclusivamente al home. Documentado en `docs/design-tokens.md`.
- **La Fase 2 casi se reescribe sin necesidad.** El plan asumía que había que construir `interpretarSegmento` (NL→DSL) desde cero. La auditoría (Task 2.0) encontró que `pedirAlCopiloto` en `copiloto.ts` ya lo hacía, completo, multi-turno, cableado por `IAPort` correctamente. Lección: el plan se escribió sin auditar el código real primero en esta parte — vale la pena, en cualquier plan futuro, correr la auditoría de "qué ya existe" ANTES de escribir las tareas de construcción, no después.
- **La Fase 2 "wiring" agente reportó cero commits, y al principio pareció una alucinación.** El agente citó hashes (`3165a93`, `079d33f`, `db9b497`, `b81ef1a`) que NO aparecían en `git log --oneline -30` de la rama. Se verificó con `git merge-base --is-ancestor <hash> HEAD` y `git merge-base --is-ancestor <hash> main`: ambos true. Eran commits reales, heredados de una consolidación de ramas anterior (`feat/cockpit-campanas`, una rama vieja distinta, documentada en memoria como ya mergeada a `main` el 2026-07-07 antes de que arrancara esta rama). El agente tenía razón. **Lección para verificar reportes de agentes que dicen "esto ya existe":** no basta con `git log -30`, hay que rastrear el hash con `merge-base --is-ancestor` contra HEAD y contra main antes de descartar o aceptar el reporte.
- **`empresasEnSecuencia`/`bloqueadasEsperandoRegla` y "Límite diario"/"Esperando regla" del mockup NO son estados reales.** El schema de `inscripcion.estado` solo tiene `activa/bloqueada/finalizada/pausada`. Cualquier fase futura que lea el mockup literal para textos de estado tiene que verificar contra el schema real primero, no asumir que el mockup usa nombres que existen en la DB.

### Bugs / incidentes durante la sesión

1. **`git stash pop` de un agente chocó con el trabajo de otro agente corriendo en paralelo.** Ambos compartían el mismo working tree (sin worktree aislado). El agente de Fase 3 hizo un stash que rozó un stash preexistente de OTRA sesión (rama `feat/cockpit-campanas`), y de paso tumbó momentáneamente `metricasHub` (que el agente de Fase 1 estaba escribiendo a la vez). Se resolvió solo, sin pérdida de trabajo (verificado con `git diff HEAD` vacío y `git stash list` mostrando el stash ajeno intacto sin aplicar). Desde ese punto, todo prompt de agente en esta sesión incluyó la regla explícita: **nunca uses `git stash`** en este working tree compartido.
2. **`rm -rf .next` con un dev server ajeno vivo lo rompió (500).** Al limpiar el caché de tipos de Next.js para que `tsc --noEmit` dejara de quejarse de rutas ya borradas (`/campanas/segmentos`), se borró `.next` completo mientras el dev server de Sebastián (PID 94676, puerto 3000) seguía corriendo. El proceso quedó respondiendo 500 porque tenía en memoria referencias a chunks que ya no existían en disco. Se resolvió matando el proceso y relanzando `npm run dev` en background, con confirmación explícita de Sebastián antes de tocarlo. **Lección: nunca `rm -rf .next` con un dev server vivo en el mismo directorio.** Si `tsc` se queja de rutas fantasma, o se ignora (es cosmético, `npm run build` regenera solo) o se borra selectivamente `.next/types`, nunca el directorio completo.
3. **Next.js bloquea un segundo `next dev` en el mismo directorio aunque cambie de puerto.** Se intentó `preview_start` varias veces durante la sesión; siempre falló con "another next dev server is already running" apuntando al PID 94676, incluso cuando el nuevo proceso lograba bindear un puerto distinto (autoPort). Es un lock a nivel de directorio de proyecto, no de puerto. Mientras haya otra sesión con `npm run dev` corriendo en este mismo repo, no hay forma de levantar un segundo dev server propio — hay que usar el existente o coordinarse con quien lo tenga abierto.

### Estado de los "providers" externos (verificado, no tocado)

Sebastián confirmó que esto no bloquea nada — el core es hexagonal, solo habla por puertos (`IAPort`, `EnvioPort`, etc. en `app/core/ports/`), así que los providers se conectan cuando estén listos sin tocar lógica de negocio. Estado real verificado en `isps.db` (la de un nivel arriba del repo, `app/db/index.ts:9`) y `.env.local`:

- **Claude/Copiloto:** vía gateway propio `dario` (OAuth proxy, no API key directa — `DARIO_URL`/`DARIO_KEY` en `.env.local`, ver `app/adapters/claude.ts:7-18`). El gateway NO respondía en `localhost:3456` al momento de verificar (connection refused) — hay que arrancarlo aparte para que el Copiloto funcione en vivo.
- **Granola:** conectado (`conector.estado = 'activo'`, credencial presente).
- **Apollo:** credencial activa en DB, pero el envío real está bloqueado a propósito: `APOLLO_MAILBOX_ID` no está seteado en `.env.local`, y `app/adapters/apollo.ts:174` tira error explícito ("decisión de negocio S2 pendiente") si se intenta usar. No es un bug, es un freno intencional de una sesión anterior.
- **Notion:** sin conectar (`sin_credencial`). El sync DB→Notion no tiene a dónde escribir hasta conectar en `/conectores`.

### Qué falta (siguiente sesión) — actualizado fin de sesión 2

Todo lo que no tenía checkpoint de dominio quedó cerrado esta sesión (ver bitácora ronda 2 abajo). Lo que queda:

1. **Fase 6 — Destinatarios/Readiness.** Checkpoint real (6.1: separar "decidir a quién y con qué ajuste" — puro — de "persistir" — la transacción actual de `inscribirCampana`). Parar y preguntar a Sebastián antes de construir `previsualizarInscripcion`.
2. **Fase 7, Task 7.2 — Portar el preview cinemático.** El core (`renderizarCopy`) ya está listo y probado (`f9f6025`); falta traer los componentes de `Cinematic Sequence Preview html5/src/sections/SequencePreview.tsx` (proyecto Vite separado) a `app/campanas/nueva/PreviewCinematico.tsx`. Sin checkpoint, es `[AGENTE]` puro — se puede delegar directo.
3. **Fase 8 — Lanzar.** Tres checkpoints de dominio seguidos (8.1 schema de goteo/ritmo/tope, 8.2 algoritmo `calcularGoteo`, 8.3 enrollment escalonado) — la fase con más decisiones pendientes de Sebastián, ir despacio ahí, una a la vez.
4. **Gap de backend encontrado en Fase 2.3+ (nuevo, no estaba en el plan original):** el mockup V2 tiene tarjetas de acción tipo "3 cuentas sin correo → [Reemplazar el paso por una llamada] [Saltar el paso] [Enviar a cola]" para resolver EXCEPCIONES por cuenta/lote — distinto de la regla global de Fase 5 (`campana.reglaFaltante`, que aplica igual a toda la campaña). No hay ninguna server action ni tabla para esto. Antes de construirlo hay que decidir: ¿la excepción aplica a nivel cuenta o a nivel paso de cadencia? ¿se persiste en `toque` o en una tabla nueva? Es candidato a `[CHECKPOINT]`, no delegar en frío.

Antes de asumir que algo del plan original "no está hecho", verificar el código real primero (como pasó con Fase 2) — el plan se escribió antes de auditar todo lo que ya existía en el repo.

---

## Bitácora de ejecución — sesión 2026-07-07 (ronda 2, paralela)

Continuación de la sesión 1 (ver bitácora arriba). Objetivo: cerrar todas las tareas `[AGENTE]` sin checkpoint de dominio que quedaban pendientes, optimizando tokens con agentes en paralelo (Haiku para lo mecánico, Sonnet para el resto) y verificación manual de cada commit antes de darlo por bueno (no confiar ciegamente en el reporte del agente).

### Qué se hizo (dos rondas paralelas, 5 agentes total)

**Ronda 1 (3 agentes en paralelo, archivos sin superposición):**
1. **Task #11 — mutators de `pasoCadencia`** (Sonnet). `actualizarPasoCadencia` + `agregarPasoCadencia` en el repository (TDD, `app/db/repository.pasoCadencia.test.ts`), wireado a `CadenciaCockpit.tsx` con actualización optimista + revert en error. Commit `f2665d7`.
2. **Task 7.1 — `renderizarCopy`** (Haiku, tarea mecánica). Función pura en `app/core/render-copy.ts`, reusa la regex de `extraerVariables` del parser para consistencia. TDD, 6 casos. Commit `f9f6025`.
3. **Fase 5 — Vista Reglas** (Sonnet). Standalone en `/campanas/[id]/reglas`, a propósito no colgada de `/campanas/nueva` (otro agente trabajaba ahí en la ronda 2). Conteos de readiness recalculan en vivo al cambiar la regla, sin persistir hasta "Guardar". Commit `fe71106`.

**Ronda 2 (2 agentes en paralelo, lanzada tras verificar la ronda 1):**
4. **Fase 9, Task 9.1 — Inbox "Por revisar"** (Sonnet). Antes de delegar se auditó `app/cola/CadenciasHoy.tsx` y se encontró que la Task 9.2 del plan ("entrada desde la cola") **ya estaba hecha** de una sesión anterior — `FilaPrioritaria`/`GrupoBatch` ya editan y aprueban manuales inline. Se le pasó ese hallazgo al agente para que no la reconstruyera. Solo faltaba el inbox permanente (`pasosManualesPendientes()`, sin filtro de fecha, nunca usado en la UI hasta ahora) + el ítem de nav con badge. Commit `58e4ef4`.
5. **Fase 2.3+ — UI final Copiloto/Segmentación** (Sonnet). Rediseño de `CopilotoPanel.tsx`/`FiltroWall.tsx`/`TablaCuentas.tsx`/`ReadinessBadge.tsx` calcando `HTML 2 Segmentacion/index.html`, sin tocar las server actions que ya funcionaban. Commit `f881125`.

### Insights (hallazgos no obvios)

- **La Task 9.2 de Fase 9 resultó ser trabajo fantasma.** El plan la listaba como pendiente, pero ya estaba resuelta desde antes en `CadenciasHoy.tsx` (mismo patrón que el hallazgo de Fase 2 en la sesión 1: pedir al agente que audite antes de construir evita reconstruir algo que ya existe). Confirma la lección ya escrita arriba: verificar código real antes de asumir que un ítem del plan está pendiente.
- **El aislamiento por archivos entre agentes paralelos funcionó bien esta vez, con una excepción menor:** dos funciones nuevas de repository (`campanaConReglas`, `actualizarReglaFaltante`) que el agente de Fase 5 necesitaba quedaron mezcladas dentro del commit `f2665d7` (del agente de Task #11) porque ambos compartían el mismo working tree y ese agente commiteó primero. No hubo pérdida de código — se verificó con `git show` que las funciones sí están ahí — pero la separación de autoría entre commits no quedó perfecta. Mismo patrón ya documentado en la sesión 1 con `git stash`.
- **Un agente de la ronda 2 mató por accidente el dev server de otra sesión activa** (puerto 3000) mientras intentaba liberar el puerto para hacer `preview_start`. Lo reinició de inmediato con `npm run dev` normal (sin `rm -rf`, sin pérdida de datos — el PID cambió, el proceso es nuevo). Verificado después: servidor respondiendo 200 en `/login`. Lección reforzada de la sesión 1: **ningún agente debería intentar liberar puertos compartidos por su cuenta** — si el dev server de otra sesión bloquea el propio, hay que reportarlo y verificar solo con `tsc`/`build`/tests, nunca matar procesos ajenos para destrabarse.
- **Ninguno de los 5 agentes pudo verificar visualmente en preview.** Razón compartida: `isps.db` local no tiene campañas/cadencias/segmentos reales cargados (base recién reseedeada, solo `empresa`/`contacto`), y el working tree compartido con otro agente en curso hacía que el dev server mostrara estado roto ajeno, no el propio. Toda la verificación de esta ronda fue por tests (306/306 verdes) + `tsc --noEmit` + `npm run build`, nunca por pantalla. Antes de la próxima ronda de UI, vale la pena sembrar `isps.db` con al menos una campaña/cadencia/segmento de prueba para poder verificar de verdad.

### Gap nuevo encontrado (no estaba en el plan original)

El mockup V2 (`HTML 2 Segmentacion/index.html`) incluye tarjetas de acción del Copiloto para resolver excepciones de canal por cuenta o lote (ej. "3 cuentas sin correo → Reemplazar/Saltar/Cola"), distinto de la regla global de campaña que ya cubre la Fase 5 (`campana.reglaFaltante`, aplica igual a todos). No existe backend para esto. Queda anotado en "Qué falta" como candidato a `[CHECKPOINT]` — hay que decidir el nivel (cuenta vs. paso de cadencia) y dónde se persiste antes de construirlo.

---

## Bitácora de ejecución — sesión 2026-07-07 (sesión 3, checkpoints + paralelo)

Continuación directa de la ronda 2. Objetivo: cerrar TODO lo que quedaba pendiente (Fase 6, Fase 7 Task 7.2, Fase 8 completa) resolviendo los checkpoints de dominio en conversación con Sebastián antes de delegar cada tarea, más una fase nueva (10) pedida a mitad de sesión.

### Checkpoints resueltos con Sebastián (en orden)

1. **6.1 (revalidar vs. confiar en snapshot):** siempre revalidar. `inscribirCampana` nunca confía en un preview externo, recalcula contra la DB en el momento de escribir.
2. **8.1 (tope global vs. por campaña):** las dos, con jerarquía. `topeToquesDia` es control real por campaña (editable en el wizard); además hay un agregado global de solo lectura (`toquesGlobalesHoy`) para que Sebastián vea la carga total entre campañas activas antes de lanzar — informativo, sin enforcement automático.
3. **8.2 (reparto en `dia_si_dia_no`):** el cupo completo entra en cada día activo, sin repartir a la mitad; los días "no" no meten a nadie.
4. **8.3 (orden de entrada del goteo):** orden de rank del segmento tal cual llega (sin reordenar por readiness); las `bloqueada` se excluyen del reparto (no consumen turno, necesitan resolverse antes).

### Qué se hizo (7 agentes, con paralelismo cuando los archivos no se pisaban)

7.2 (preview cinemático, solo) → 6.1 (core preview-inscripcion, solo) → 6.2 (UI Destinatarios) + 8.1 (schema) + 8.2 (`calcularGoteo`) en paralelo → 8.3 (enrollment escalonado, solo, esperado por depender de 8.1+8.2) → 8.4 (UI Lanzar) + 10.1 (panel de control) en paralelo. Commits: `97c46d0`, `ea59e60`, `e61b9f7`, `0e94a6d`, `3e6a1ff`, `a270a33`, `3f0a269`, `4e597f7` — más `8983427` (bitácora). 337/337 tests verdes al cierre.

### Incidentes (mismo patrón que sesiones anteriores, ya documentado — no se repite el detalle)

Working tree compartido con al menos otra sesión activa (rediseño de `/conectores`) durante toda la sesión. Dos agentes violaron la regla explícita "nunca `git stash`" (uno en Task 6.2, revertido de inmediato sin pérdida; uno en Task 10.1, con `--keep-index`, diff vacío contra el estado final). Un commit (`3f0a269`) terminó absorbiendo cambios de repository.ts de otro agente en curso (mismo patrón que `f2665d7` en la ronda 2) — verificado sin pérdida de código. Ninguna verificación visual en preview (puerto ocupado por sesión ajena todo el tiempo); toda la validación fue tests + `tsc` + `build`. **Cierre:** `stash@{0}` (el duplicado inerte) se dropeó al confirmar Sebastián que el contenido ya estaba en el commit — verificado con `git diff stash@{0} -- app/db/repository.ts` vacío antes de borrarlo.

### Insights (arquitectura y hallazgos no obvios)

- **"Functional core, imperative shell" resuelve el checkpoint 6.1 sin ambigüedad una vez fijada la política de revalidación.** Separar `previsualizarInscripcion` (pura) de `inscribirCampana` (transaccional) no solo evita duplicar lógica: permite que "siempre revalidar" sea una decisión de una sola línea (llamar la función pura otra vez, justo antes de escribir) en vez de un mecanismo de invalidación de caché o versión de snapshot. La alternativa (pasar el preview ya calculado como payload de la mutación) hubiera obligado a inventar un contrato de "¿sigue vigente este preview?" — el patrón elegido lo evita por diseño.
- **`readinessEmpresa` mezclaba dos preguntas en un solo `estado`:** "¿le falta algo?" y "¿la cadencia que recibe es la original?". Un reemplazo de canal exitoso deja a la empresa `lista` (nada pendiente) pero con una cadencia distinta a la que el segmento pedía. El preview necesitaba la segunda pregunta, no la primera — se resolvió derivando `con_ajuste` de `reemplazos.length > 0 || pasosSinCanal.length > 0`, sin tocar `readinessEmpresa`. Lección: cuando un campo de estado ya existente casi sirve para un caso nuevo, vale la pena verificar qué pregunta responde exactamente antes de reusarlo tal cual.
- **El plan asumía `drizzle-kit generate` para migraciones; el repo real usa scripts Python `ALTER TABLE` idempotentes** (dry-run + apply, con log en `sync_cambios`). Ningún commit anterior de esta rama usa drizzle-kit de verdad — es la tercera vez en este plan que un supuesto del plan no calzaba con el código real (después de Fase 2 con el Copiloto y de los estados `bloqueada`/`activa` del mockup). Refuerza la lección ya escrita en la bitácora de sesión 1: auditar el patrón real antes de asumirlo de la documentación.
- **El orden de "quién entra primero" en un goteo es una decisión de negocio, no un detalle técnico.** Reordenar por readiness (listas primero) suena "más eficiente", pero cambia qué historias llegan primero a Notion y puede sesgar cualquier lectura temprana de resultados. Fijar "orden del segmento, tal cual" es más simple de razonar y auditar, aunque sea menos "óptimo" en el papel — quedó explícito que fue elección consciente, no la ausencia de una mejor idea.

### Estado final del plan

Fases 0-10 completas. El único pendiente fuera de este plan es el gap de excepciones por cuenta/lote del Copiloto (arriba), que necesita su propio checkpoint antes de construirse.
