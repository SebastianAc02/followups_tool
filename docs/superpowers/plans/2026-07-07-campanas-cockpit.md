# Cockpit de Campañas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado (2026-07-07, fin de sesión):** Fases 0, 1, 3, 4 implementadas y commiteadas en `feat/campanas-cockpit`. Fase 2 resultó estar mayormente ya hecha (heredada de una consolidación anterior a esta rama), falta solo la UI final. Además de lo planeado, esta sesión rehízo `/campanas/nueva` desde cero (pedido explícito de Sebastián a mitad de sesión, no estaba en el plan original) y eliminó `/campanas/segmentos` (ruta muerta). Ver **"Bitácora de ejecución"** al final del documento para el detalle completo: qué se hizo, qué se encontró, bugs corregidos, decisiones tomadas y qué sigue. Lee esa sección ANTES de retomar.

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
| 2 | V2 Segmentación · Copiloto | NL→DefinicionSegmento + loop reactivo | ⚠️ **Backend ya existía** (heredado); falta solo UI final (Task 2.3+) |
| 3 | V2.9 Importar cadencia | Parser JSON | ✅ **HECHO** (3 commits), pero no quedó wireada al flujo real hasta el rediseño fuera-de-plan |
| 4 | V3 Cadencia | (editar copy inline) | ⚠️ **UI hecha, con gap real**: faltan mutators de `pasoCadencia` en el Repository (task suelta #11 en el tracker) |
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

**HECHO, con un gap real encontrado en la ejecución.** UI construida en `app/cadencias/[id]/{page,CadenciaCockpit,actions}.tsx` — **archivo nuevo, NO in-place** sobre `ConstructorCadencia.tsx` legacy (ese hace calendario con días bloqueados/corrimiento, un concepto distinto; `/cadencias/page.tsx` además ya redirige a `/campanas` y no había ruta viva para ver una cadencia por id, así que tocar el legacy hubiera roto ese redirect). `agregarVersionPaso`/`actualizarVersionPaso` sí cubren edición de copy, pero **no existe ningún mutator para `pasoCadencia` más allá de la inserción inicial en `crearCadencia`**: falta togglear `esManual`, cambiar `diaOffset`/`canal` de un paso existente, e insertar un paso nuevo en una cadencia ya creada. Los tres controles están en la UI como estado visual local con `title="Cambio visual — falta action del repository para guardarlo"`, SIN fingir persistencia — los botones "Añadir toque"/"Añadir paso" quedaron deshabilitados. Esto es la **task #11 del tracker** ("Repository: mutators de pasoCadencia"), pendiente. Commit → `bee4384`.

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

1. ✅ **RESUELTO** — Fórmula de métricas del hub (1.1): cohorte por `idPasoInscripcion` (enviado→respondio), no ratio de conteos en la ventana.
2. ✅ **RESUELTO (sin necesidad de decidir)** — el Copiloto (2.0) ya existía completo y correcto; no hubo que elegir entre extender o reescribir.
3. ⏳ **PENDIENTE** — Separar decidir de persistir en inscripción (6.1). No se llegó a Fase 6 esta sesión.
4. ⏳ **PENDIENTE** — Modelo de goteo: ritmo, tope global vs. por campaña (8.1); lógica de distribución (8.2). No se llegó a Fase 8 esta sesión.
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

### Qué falta (siguiente sesión)

En orden sugerido (Fase 5 y el gap de Fase 4 no tienen checkpoints, son los más rápidos de arrancar):

1. **Task #11 — mutators de `pasoCadencia`** en el Repository (toggle `esManual`, cambiar `diaOffset`/`canal`, insertar paso nuevo). Desbloquea que `app/cadencias/[id]/CadenciaCockpit.tsx` sea funcional de verdad — hoy sus controles están deshabilitados.
2. **Fase 5 — Vista Reglas** (nueva, sin mockup). Sin checkpoints de core, backend ya existe (`campana.reglaFaltante`, `conteosReadiness`).
3. **Fase 2.3+ — UI final del Copiloto/Segmentación** calcada de `HTML 2 Segmentacion/index.html`. Es lo único que falta de Fase 2; el backend está 100% listo.
4. **Fase 6 — Destinatarios/Readiness.** Tiene un checkpoint real (6.1, separar decidir de persistir en inscripción) — parar y preguntar antes de construir.
5. **Fase 7 — Preview cinemático.** Portar `html5/` (proyecto Vite separado), sin checkpoints.
6. **Fase 8 — Lanzar.** Tres checkpoints de dominio seguidos (8.1 schema de goteo, 8.2 algoritmo, 8.3 enrollment escalonado) — la fase con más decisiones pendientes de Sebastián, ir despacio ahí.
7. **Fase 9 — Por revisar.** Sin checkpoints, backend completo, reusa `renderizarCopy` de Fase 7.

Antes de asumir que algo del plan original "no está hecho", verificar el código real primero (como pasó con Fase 2) — el plan se escribió antes de auditar todo lo que ya existía en el repo.
