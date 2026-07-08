# Rediseño de la UI de toques — Plan de implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).
>
> **Regla de verificación de este plan:** la herramienta de `preview` interna está DESCARTADA (decisión del owner, 2026-07-08). Nada se verifica arrancando el dev server desde aquí. La verificación es: `npm test` (node:test) para core/datos/adaptadores, `npm run build` (typecheck de Next) para UI, y lectura del diff. Ninguna tarea pide abrir el navegador.

**Goal:** Reemplazar la UI de `/llamada/[id]` (CSS legacy, poco útil) por un cockpit de toques por canal — Llamada (Toque 1), Correo (Toque 2), WhatsApp (Toque 3) — más una pantalla de Confirmación que muestra qué queda de cara a Notion/Granola, siguiendo los 4 mockups ya decididos.

**Architecture:** El core y el Repository no cambian de forma; se envuelven. `/llamada/[id]` deja de ser "form de llamada" y pasa a ser un **cockpit de toque consciente del canal**: server component que arma un `ToqueContexto` y despacha al editor del canal. El guardado sigue pasando por `registrarToque` (reglas de dominio intactas); el dictado se estructura con una función de core nueva sobre `IAPort` (mismo patrón que `borradores.ts`); Granola y el outbox de Notion ya existen y se reusan. Todo el color/tipografía nuevo vive como **tokens centrales** en `globals.css` (`@theme`), nunca hardcodeado en componentes.

**Tech Stack:** Next.js (App Router, server components + server actions), TypeScript, Drizzle/SQLite, Tailwind v4 (`@theme` tokens + CVA variants en `app/ui/`), Zod, `node:test`, `@anthropic-ai/sdk` vía el gateway dario (`IAPort`).

---

## Contexto: qué ya existe y se reutiliza (no reescribir)

| Necesidad de la UI | Lo que ya existe | Archivo |
| --- | --- | --- |
| Header + "La cuenta" + calificación (usuarios/CRM/pasarela) | `getCuenta(id)` | `app/db/repository.ts:163` |
| Guardar el toque (reglas de dominio: 4 salidas, razón de pérdida obligatoria) | `registrarToque` + `registrarToqueSchema` | `app/db/repository.ts:218`, `app/db/validation.ts:202` |
| Salidas y labels del toque | `RESULTADOS`, `RESULTADO_LABELS`, `RESULTADOS_CONTESTO` | `app/db/validation.ts:11` |
| Columna "Granola · ¿el correcto?" (buscar/confirmar grabación) | `buscarGrabacionAction` / `confirmarGrabacionAction` + `BuscarGrabacion` | `app/llamada/[id]/actions.ts:75`, `BuscarGrabacion.tsx` |
| Riel "SECUENCIA · N DÍAS" (solo si hay inscripción activa) | `agendaHoyCadencias`, `historialPasosDestinatario`, `pasoCadencia`/`inscripcion` | `app/db/repository.ts` |
| Editor de correo/WhatsApp (edita cuerpo, resalta `[variables]`, aprueba) | `ToqueRevisar` + `aprobarDesdeInboxAction` (patrón a promover) | `app/por-revisar/ToqueRevisar.tsx` |
| Estructurar texto → campos (dictado) | `IAPort.generar(prompt, schema)` + patrón `pedirBorradores` | `app/core/ports/ia.ts`, `app/core/borradores.ts` |
| Sync a Notion (idempotente, outbox) | `CambioNotion` + `encolarOutboxNotion` + `crearNotionAdapter` | `app/core/ports/sync.ts`, `app/adapters/notion.ts` |
| Link a Notion | `empresa.notionPageId` ya en schema | `app/db/schema.ts:27` |
| Librería de UI (Button, Chip, Pill, Stat, CanalTag, Tabs, SectionLabel, Seg, Field) + `cn` | `app/ui/*` con CVA variants | `app/ui/` |
| Shell con sidebar | `SidebarFrame` | `app/ui/shell/SidebarFrame.tsx` |

## Restricciones de dominio (fijas, de la constitución)

- **Sin micrófono.** El "dictado" es texto pegado/escrito (la salida del TTS externo del owner), nunca captura de audio en la app.
- **La IA no sincroniza sin revisión humana.** Lo estructurado es un **borrador** que el owner confirma en la pantalla de Confirmación; recién ahí entra al outbox de Notion.
- **`canal` es dato, no código.** El despacho por canal se hace por datos (el canal del toque), no por rutas separadas.
- **Fuera de v1:** scoring / % de respuesta, librería de versiones cross-usuario, cosecha de WhatsApp, escritura del campo `Estado` (tipo status) a Notion.

---

## Estrategia de tokens de diseño (transversal, hacer PRIMERO)

Los mockups traen 3 acentos por pantalla (violeta Llamada, azul Correo, verde WhatsApp) y fuentes nuevas (EB Garamond, Space Grotesk, IBM Plex/JetBrains Mono). Decisión del owner: **abstraer todo a tokens centrales** para poder cambiarlo desde un solo punto. Regla dura: **ningún componente nuevo escribe un hex o un nombre de fuente crudo.** Consumen roles (`text-accent-correo`, `font-heading`, `bg-surface`).

El acento violeta de la app (`--color-accent: #8b7cff`) ya coincide con el de la pantalla de Llamada (`#8b7dff`), así que Llamada no necesita acento nuevo.

### Tarea 0: Extender la capa de tokens central

**Files:**
- Modify: `app/globals.css` (bloque `@theme`, junto a los `--color-canal-*` existentes)
- Modify: `docs/design-tokens.md` (documentar los roles nuevos)

- [ ] **Paso 1: Añadir tokens de acento por canal y sus fondos suaves.** En `@theme`, junto a `--color-canal-*` (globals.css:39-42), añadir:

```css
  /* Acento por canal para las UIs de toque (Toque 1/2/3). El violeta de --color-accent
     ya sirve para llamada; correo y whatsapp reciben su propio rol de acento + fondo suave.
     Cambiar la identidad de un canal = tocar SOLO estas líneas. */
  --color-accent-llamada: var(--color-accent);          /* #8b7cff, ya existente */
  --color-accent-llamada-soft: rgba(139, 124, 255, 0.12);
  --color-accent-correo: var(--blue);                    /* #8fb0e0 */
  --color-accent-correo-soft: rgba(143, 176, 224, 0.12);
  --color-accent-whatsapp: #29c98f;                      /* verde del mockup WhatsApp */
  --color-accent-whatsapp-soft: rgba(41, 201, 143, 0.12);
  /* Estados de calificación / secuencia (checklist del Toque 1 y receipt de Confirmación) */
  --color-check: var(--green);                           /* item con dato = verde */
  --color-pending: var(--amber);                         /* item por preguntar = ámbar */
  --color-pending-soft: rgba(242, 183, 56, 0.07);
```

- [ ] **Paso 2: Registrar las familias tipográficas del mockup como fuentes con fallback,** sin romper las actuales. En `@theme` (junto a `--font-*`, globals.css:76-84), añadir roles nuevos que apunten a variables `--ff-*` (las `--ff-*` se definen donde se cargan las fuentes con `next/font`; ver Paso 3):

```css
  /* Roles tipográficos de las UIs de toque. Apuntan a --ff-* para que el punto único
     de cambio sea la carga de next/font, no los componentes. */
  --font-toque-heading: var(--ff-toque-heading), Georgia, serif;   /* EB Garamond / Space Grotesk */
  --font-toque-mono: var(--ff-toque-mono), ui-monospace, monospace; /* IBM Plex Mono / JetBrains Mono */
```

- [ ] **Paso 3: Cargar las fuentes nuevas con `next/font` en un solo lugar.** En `app/layout.tsx` (donde ya se cargan las `--ff-*` actuales), añadir las nuevas familias con `next/font/google` y exponer sus `.variable` como `--ff-toque-heading` / `--ff-toque-mono`. Verificar primero cómo se cargan las fuentes actuales en `app/layout.tsx` y seguir el mismo patrón (no introducir `<link>` a Google Fonts crudos: los mockups usan `<link>` pero eso es del export de la herramienta de diseño; en la app se usa `next/font` para no bloquear render ni filtrar a un CDN).

- [ ] **Paso 4: Documentar en `docs/design-tokens.md`** una fila por rol nuevo (`--color-accent-{canal}`, `--color-check`, `--color-pending`, `--font-toque-*`), con la regla "los componentes de toque consumen estos roles, no primitivos".

- [ ] **Paso 5: Commit.**

```bash
git add app/globals.css docs/design-tokens.md app/layout.tsx
git commit -m "feat(tokens): roles de acento por canal y tipografia de toques, centralizados"
```

> Nota de verificación: `npm run build` debe pasar (typecheck + que Tailwind resuelva las clases). No hay test unitario de CSS.

---

## Mapa de archivos

**Fase 1 — Llamada (Toque 1) + Confirmación**

- Modify `app/llamada/[id]/page.tsx` — de "form de llamada" a **cockpit despachador por canal**; arma `ToqueContexto`, decide vista.
- Create `app/llamada/[id]/ToqueContexto.ts` — tipo + `construirContexto()` (server-side, junta cuenta + secuencia + calificación).
- Create `app/db/repository.ts` → `getContextoToque(id)` (query nueva; reusa/compone `getCuenta` + secuencia).
- Create `app/core/calificacion.ts` — dominio: qué campos son "imprescindibles", cuáles están y cuáles faltan (la tabla "info que tengo vs info por sacar").
- Create `app/llamada/[id]/LlamadaCard.tsx` — Toque 1 (header, riel secuencia, sugerencia, La cuenta, calificación, registrar).
- Create `app/llamada/[id]/SecuenciaRail.tsx` — riel izquierdo (timeline de la cadencia; degrada elegante si no hay inscripción).
- Create `app/llamada/[id]/CalificacionChecklist.tsx` — checklist "tengo / por preguntar".
- Create `app/llamada/[id]/CapturaLlamada.tsx` — reemplazo de `CaptureForm` (salida + dictado + estructurar).
- Create `app/core/estructurar-toque.ts` — función de core: texto dictado → campos + resumen (sobre `IAPort`).
- Create `app/llamada/[id]/Confirmacion.tsx` — receipt (campos, resumen dictado, Granola, chips Notion/Granola).
- Modify `app/llamada/[id]/actions.ts` — `estructurarDictadoAction`, ajuste de `registrarToqueAction` para devolver el recibo en vez de redirigir directo.
- Modify `app/core/ports/sync.ts` + `app/adapters/notion.ts` + `app/db/repository.ts` — expandir `CambioNotion` con `fechaPrimerContacto`, `fechaUltimoContacto`, `toquesHechos`.
- Create `app/lib/notion-url.ts` — `urlNotion(pageId)` (deriva la URL desde `notionPageId`).
- Delete (al final de Fase 1) `app/llamada/[id]/CaptureForm.tsx` — sustituido por `CapturaLlamada.tsx`.

**Fase 2 — Correo (Toque 2) + WhatsApp (Toque 3)**

- Create `app/llamada/[id]/EditorCorreo.tsx` — Toque 2 (asunto+cuerpo con variables, versiones A/B/C).
- Create `app/llamada/[id]/EditorWhatsapp.tsx` — Toque 3 (composer + tus versiones; sin scoring).
- Create `app/core/personalizar-copy.ts` — resaltar/resolver variables `[nombre]` (promueve `conVariablesResaltadas` de `ToqueRevisar`, deduplicado).
- Modify `app/db/repository.ts` — `versionesDePaso(idPaso)` (trae A/B/C de `version_paso` para la barra de versiones).
- Modify `app/llamada/[id]/actions.ts` — `enviarToqueCanalAction` (reusa la lógica de `aprobarDesdeInboxAction`).
- Modify `app/llamada/[id]/page.tsx` — despachar a los editores de correo/WhatsApp según canal.

---

# FASE 1 — Toque 1 (Llamada) + Confirmación

## Tarea 1: Dominio de calificación ("info que tengo vs. info por sacar")

Es la tabla central del Toque 1 (mockup: checklist 3/4, con items en verde = tengo, y "PREGUNTAR" ámbar = falta). Es lógica de dominio pura y testeable: dada una cuenta, qué campos imprescindibles están llenos y cuáles faltan. TDD.

**Files:**
- Create: `app/core/calificacion.ts`
- Test: `app/core/calificacion.test.ts`

- [ ] **Paso 1: Test que falla.**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calificar, CAMPOS_CALIFICACION } from './calificacion.ts';

test('calificar marca presente el campo con valor y ausente el vacio', () => {
  const r = calificar({ usuarios: 1240, crm: 'Zoho', pasarela: null, recaudo: '' });
  const porNombre = Object.fromEntries(r.items.map((i) => [i.campo, i]));
  assert.equal(porNombre.usuarios.estado, 'tengo');
  assert.equal(porNombre.usuarios.valor, '1,240');
  assert.equal(porNombre.crm.estado, 'tengo');
  assert.equal(porNombre.pasarela.estado, 'preguntar');
  assert.equal(porNombre.recaudo.estado, 'preguntar');
});

test('calificar cuenta cuantos tengo sobre el total de imprescindibles', () => {
  const r = calificar({ usuarios: 10, crm: 'X', pasarela: 'Y', recaudo: null });
  assert.equal(r.tengo, 3);
  assert.equal(r.total, CAMPOS_CALIFICACION.length);
});

test('calificar formatea usuarios con separador de miles y deja 0 como ausente logico', () => {
  const r = calificar({ usuarios: null, crm: null, pasarela: null, recaudo: null });
  assert.equal(r.tengo, 0);
});
```

- [ ] **Paso 2: Correr y ver fallar.** `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/calificacion.test.ts` → FAIL ("Cannot find module './calificacion.ts'").

- [ ] **Paso 3: Implementación mínima.**

```ts
// app/core/calificacion.ts
// Dominio del Toque 1: qué de la calificación "imprescindible" ya tengo y qué me toca
// preguntar en la llamada. Lógica pura (sin DB): el server component le pasa los valores
// crudos de la cuenta y recibe la tabla lista para pintar. "recaudo" no es columna de
// empresa todavía (ver Tarea 2, decisión de esquema): entra como imprescindible del guion
// de frío aunque hoy siempre llegue vacío.
export type CampoCalificacion = 'usuarios' | 'crm' | 'pasarela' | 'recaudo';

export const CAMPOS_CALIFICACION: { campo: CampoCalificacion; label: string }[] = [
  { campo: 'usuarios', label: 'Número de usuarios' },
  { campo: 'pasarela', label: 'Pasarela actual' },
  { campo: 'crm', label: 'CRM / Software' },
  { campo: 'recaudo', label: 'Cómo hacen el recaudo' },
];

export type ItemCalificacion = {
  campo: CampoCalificacion;
  label: string;
  estado: 'tengo' | 'preguntar';
  valor: string | null;
};

export type Calificacion = { items: ItemCalificacion[]; tengo: number; total: number };

type Entrada = {
  usuarios: number | null;
  crm: string | null;
  pasarela: string | null;
  recaudo: string | null;
};

function formatear(campo: CampoCalificacion, valor: number | string | null): string | null {
  if (valor === null || valor === '' ) return null;
  if (campo === 'usuarios') return Math.round(Number(valor)).toLocaleString('es-CO');
  return String(valor);
}

export function calificar(entrada: Entrada): Calificacion {
  const items: ItemCalificacion[] = CAMPOS_CALIFICACION.map(({ campo, label }) => {
    const valor = formatear(campo, entrada[campo]);
    return { campo, label, estado: valor ? 'tengo' : 'preguntar', valor };
  });
  const tengo = items.filter((i) => i.estado === 'tengo').length;
  return { items, tengo, total: CAMPOS_CALIFICACION.length };
}
```

- [ ] **Paso 4: Correr y ver pasar.** Mismo comando → PASS.

- [ ] **Paso 5: Commit.**

```bash
git add app/core/calificacion.ts app/core/calificacion.test.ts
git commit -m "feat(core): dominio de calificacion (info que tengo vs por preguntar) del Toque 1"
```

> **Checkpoint de aprendizaje (constitución):** antes de seguir, Sebastián explica de vuelta por qué la calificación vive en core como función pura y no en el componente (testeable, reusable por el ingest worker, `canal`/campos como dato). Decisión de diseño abierta: ¿`recaudo` se vuelve columna real de `empresa` o se queda como campo de guion sin persistir? (Ver Tarea 2.)

## Tarea 2: Query de contexto del toque (Repository)

Junta en una llamada lo que el cockpit necesita: cuenta, contacto principal, secuencia (si hay inscripción activa), últimos toques. Reusa `getCuenta`; añade la secuencia.

**Files:**
- Modify: `app/db/repository.ts` (añadir `getContextoToque`)
- Test: `app/db/repository.contextoToque.test.ts`
- Modify: `app/db/schema.ts` **solo si** se decide persistir `recaudo` (ver checkpoint Tarea 1). Por defecto de este plan: NO se añade columna; `recaudo` llega como `null` desde el server component. Si se decide añadirla, es una migración aparte (reflejar la columna real en `isps.db`, no crear tabla).

- [ ] **Paso 1: Test que falla** (patrón de los tests de repository existentes: DB en memoria / fixture — inspeccionar `app/db/repository.*.test.ts` para el helper de setup real y seguirlo exactamente, no inventar API).

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getContextoToque } from './repository.ts';
// ... setup de DB de prueba igual que los otros repository.*.test.ts

test('getContextoToque trae cuenta, contacto principal y secuencia vacia si no hay inscripcion', () => {
  // seed: una empresa con contacto principal, sin inscripcion
  const ctx = getContextoToque('EMP_TEST');
  assert.equal(ctx.emp?.nombre, 'RedNet');
  assert.equal(ctx.principal?.nombre, 'Carla');
  assert.deepEqual(ctx.secuencia, []);      // sin cadencia => riel degradado
});

test('getContextoToque trae los pasos de la secuencia cuando hay inscripcion activa', () => {
  // seed: empresa inscrita en una campana de 4 pasos, paso 4 pendiente
  const ctx = getContextoToque('EMP_INSCRITA');
  assert.equal(ctx.secuencia.length, 4);
  assert.equal(ctx.secuencia[3].estado, 'activo');   // el pendiente de hoy
  assert.equal(ctx.secuencia[0].estado, 'hecho');
});
```

- [ ] **Paso 2: Ver fallar.** `... --test app/db/repository.contextoToque.test.ts` → FAIL.

- [ ] **Paso 3: Implementar `getContextoToque`.** Compone `getCuenta` (ya trae emp/contactos/toques) con una query de secuencia que, por `idEmpresa`, busca la inscripción activa y devuelve sus pasos con estado derivado (`hecho` si `pasoInscripcion.estado='enviada'`, `activo` si es el pendiente de hoy, `pendiente` el resto). Si no hay inscripción activa → `secuencia: []`. Devolver:

```ts
export type PasoSecuencia = {
  orden: number; diaOffset: number; canal: string; objetivo: string | null;
  estado: 'hecho' | 'activo' | 'pendiente';
};
export type ContextoToque = {
  emp: ReturnType<typeof getCuenta>['emp'];
  principal: { nombre: string | null; cargo: string | null; telefono: string | null; email: string | null } | null;
  toques: ReturnType<typeof getCuenta>['toques'];
  secuencia: PasoSecuencia[];
  objetivo: string | null;   // objetivo del paso activo, o null
};
export function getContextoToque(id: string): ContextoToque { /* compone getCuenta + query de secuencia */ }
```

Usar `pasoCadencia.objetivo` para "OBJETIVO / Sacar reunión". Reusar los joins de `agendaHoyCadencias`/`historialPasosDestinatario` como referencia; no duplicar SQL suelto — es una función más del Repository.

- [ ] **Paso 4: Ver pasar.** PASS.

- [ ] **Paso 5: Commit.**

```bash
git add app/db/repository.ts app/db/repository.contextoToque.test.ts
git commit -m "feat(db): getContextoToque compone cuenta + secuencia para el cockpit de toque"
```

## Tarea 3: `ToqueContexto` server-side y `urlNotion`

**Files:**
- Create: `app/llamada/[id]/ToqueContexto.ts`
- Create: `app/lib/notion-url.ts`
- Test: `app/lib/notion-url.test.ts`

- [ ] **Paso 1: Test de `urlNotion` que falla.**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { urlNotion } from './notion-url.ts';

test('urlNotion arma la url canonica quitando guiones del page id', () => {
  assert.equal(urlNotion('11112222-3333-4444-5555-666677778888'), 'https://www.notion.so/1111222233334444555566667778888'.slice(0, 0) + 'https://www.notion.so/11112222333344445555666677778888');
});
test('urlNotion devuelve null si no hay page id', () => {
  assert.equal(urlNotion(null), null);
});
```

(La primera aserción es fea a propósito para forzar el formato exacto; simplificar a la constante literal `https://www.notion.so/11112222333344445555666677778888` al implementar.)

- [ ] **Paso 2: Ver fallar.** FAIL.

- [ ] **Paso 3: Implementar.**

```ts
// app/lib/notion-url.ts
// Deriva el link a la página real de Notion desde empresa.notionPageId (ya en schema).
// Notion acepta la URL con el id sin guiones al final del path.
export function urlNotion(pageId: string | null | undefined): string | null {
  if (!pageId) return null;
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
}
```

- [ ] **Paso 4: Ver pasar.** PASS.

- [ ] **Paso 5: `ToqueContexto.ts`** (no TDD: es glue server-side). Exponer un tipo `VistaToque = 'llamada' | 'correo' | 'whatsapp' | 'confirmacion'` y una función que, dado el `ContextoToque` + `searchParams`, decide la vista (default: canal del próximo paso; `?vista=confirmacion` tras guardar). Incluir `urlNotion(emp.notionPageId)` en el contexto que se pasa a los componentes. Mantener este archivo delgado: solo decide vista y arma props, sin JSX.

- [ ] **Paso 6: Commit.**

```bash
git add app/lib/notion-url.ts app/lib/notion-url.test.ts app/llamada/[id]/ToqueContexto.ts
git commit -m "feat(toque): contexto server-side del cockpit + url de Notion derivada"
```

## Tarea 4: Componentes de presentación del Toque 1 (Llamada)

UI. No TDD (no se testea layout; preview descartado). Cada componente: archivo exacto, contrato de props, tokens a consumir. Verificación por tarea: `npm run build` (typecheck) + lectura. **Regla:** solo clases Tailwind que resuelvan a tokens (`bg-surface`, `text-accent-llamada`, `border-line`, `font-toque-heading`, `mono`), cero hex/font crudos. Reusar `app/ui/*` (Button, Pill, Stat, SectionLabel, CanalTag) donde calce.

### 4a: `SecuenciaRail.tsx`

**Files:** Create `app/llamada/[id]/SecuenciaRail.tsx`

- [ ] **Paso 1: Componente.** Props: `{ pasos: PasoSecuencia[]; objetivo: string | null }`. Render:
  - Label "SECUENCIA · {N} DÍAS" en `font-toque-mono text-faint uppercase tracking-widest`.
  - Timeline vertical: por paso, un nodo (check verde `text-check` si `hecho`; anillo `border-line-strong` si `pendiente`; punto `bg-accent-llamada` con `animate-[pulseLive...]` si `activo`), título `Día {orden} · {canal legible}` y `objetivo`/subtítulo.
  - Al fondo: bloque "OBJETIVO" + `objetivo ?? 'Sin objetivo definido'`.
  - **Degradación sin cadencia:** si `pasos.length === 0`, en vez del timeline mostrar "Sin secuencia activa · llamada suelta" y, debajo, los últimos toques (pasarlos como prop opcional `toques`). Esto cubre el caso frecuente de llamada en frío sin inscripción — el mockup asume cadencia, la realidad no siempre la tiene.

- [ ] **Paso 2: `npm run build`** → typecheck PASS. Commit.

```bash
git add app/llamada/[id]/SecuenciaRail.tsx && git commit -m "feat(toque): riel de secuencia del Toque 1 (degrada sin cadencia)"
```

### 4b: `CalificacionChecklist.tsx`

**Files:** Create `app/llamada/[id]/CalificacionChecklist.tsx`

- [ ] **Paso 1: Componente.** Props: `{ calificacion: Calificacion }` (de Tarea 1). Header "Calificación" + `{tengo} / {total}` en `mono`. Por item: fila con icono (círculo `bg-check/15` + check si `tengo`; círculo punteado `border-pending` si `preguntar`), `label`, y a la derecha el `valor` (`tengo`) o un badge "PREGUNTAR" (`text-pending bg-pending-soft`, `mono`). Los items `preguntar` van en caja punteada `border-dashed border-pending`.

- [ ] **Paso 2: build + commit.**

```bash
git add app/llamada/[id]/CalificacionChecklist.tsx && git commit -m "feat(toque): checklist de calificacion (tengo/por preguntar)"
```

### 4c: `LlamadaCard.tsx` (ensambla el Toque 1)

**Files:** Create `app/llamada/[id]/LlamadaCard.tsx`

- [ ] **Paso 1: Componente.** Props: `{ ctx: ContextoToque; urlNotion: string | null }`. Estructura del mockup "Onepay Llamada Toque 1" (solo la specimen card, sin el header/footer/book-spine del export):
  - **Header strip:** avatar con iniciales (`bg-accent-llamada`), nombre empresa (`font-toque-heading`), sub `{ciudad} · {contacto} · {cargo}` (`mono text-muted`), badge de estado (`Pill` con el `estadoNotion`). Si `urlNotion`, un link "Ver en Notion" (`text-muted hover:text-ink`, `target="_blank" rel="noopener"`).
  - **Body en grid** `[192px_1fr]`: izquierda `<SecuenciaRail>`, derecha:
    - "El sistema sugiere para hoy": tarjeta de acción `bg-accent-llamada-soft border-accent-llamada` con "Llamar a {contacto}" + teléfono (`mono`) + "cambiar". Debajo, la nota de fallback (ej. "Si no contesta, pasa a WhatsApp") — texto derivado del canal siguiente, no hardcodeado.
    - "La cuenta": 3 `Stat` tiles (Ciudad, Estado, Último toque derivado del último `toque`) + fila "Próximo paso".
    - `<CalificacionChecklist>`.
    - Fila inferior: breadcrumb "Llamada · Registrar · Confirmar" + botón "Registrar toque" que revela `<CapturaLlamada>` (Tarea 5).

- [ ] **Paso 2: build + commit.**

```bash
git add app/llamada/[id]/LlamadaCard.tsx && git commit -m "feat(toque): tarjeta del Toque 1 (llamada) ensamblada con tokens"
```

## Tarea 5: Estructurar dictado (core) + captura de llamada

### 5a: `estructurar-toque.ts` (core, TDD)

Convierte el brief dictado (texto pegado del TTS) en campos + resumen. Mismo patrón que `borradores.ts`.

**Files:** Create `app/core/estructurar-toque.ts` + `app/core/estructurar-toque.test.ts`

- [ ] **Paso 1: Test que falla** (usa `IAFake` de `app/adapters/ia-fake.ts`).

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { estructurarToque } from './estructurar-toque.ts';
import { IAFake } from '../adapters/ia-fake.ts';

test('estructurarToque no llama a la IA si el dictado esta vacio', async () => {
  let llamado = false;
  const ia = { generar: async () => { llamado = true; return {} as never; } };
  const r = await estructurarToque('   ', ia);
  assert.equal(llamado, false);
  assert.equal(r.resumen, '');
  assert.equal(r.resultado, null);
});

test('estructurarToque devuelve campos validados por el schema', async () => {
  const esperado = {
    resultado: 'contesto_reunion', quePaso: 'Cerramos reunión jueves 4pm',
    resumen: 'Carla confirmó interés, dolor soporte Niubiz.',
    usuarios: 1240, crm: null, pasarela: 'Niubiz', recaudo: 'Manual + Excel',
    proximoPaso: 'Enviar propuesta', proximoFollowUp: '2026-07-10',
  };
  const r = await estructurarToque('me dijo que...', new IAFake(esperado));
  assert.equal(r.resultado, 'contesto_reunion');
  assert.equal(r.usuarios, 1240);
});
```

- [ ] **Paso 2: Ver fallar.** FAIL.

- [ ] **Paso 3: Implementar** (schema Zod + prompt en voz-onepay; `resultado` restringido a `RESULTADOS` o `null`; números como `number | null`; nunca inventa: campo ausente → `null`/`''`). Estructura:

```ts
import { z } from 'zod';
import type { IAPort } from './ports/ia';
import { RESULTADOS } from '../db/validation';

export const toqueEstructuradoSchema = z.object({
  resultado: z.enum(RESULTADOS).nullable(),
  quePaso: z.string(),
  resumen: z.string(),             // el "transcript summary" narrado -> Notas Discovery
  usuarios: z.number().nullable(),
  crm: z.string().nullable(),
  pasarela: z.string().nullable(),
  recaudo: z.string().nullable(),
  proximoPaso: z.string(),
  proximoFollowUp: z.string().nullable(),  // YYYY-MM-DD o null
});
export type ToqueEstructurado = z.infer<typeof toqueEstructuradoSchema>;

const VACIO: ToqueEstructurado = { resultado: null, quePaso: '', resumen: '', usuarios: null, crm: null, pasarela: null, recaudo: null, proximoPaso: '', proximoFollowUp: null };

export async function estructurarToque(dictado: string, ia: IAPort): Promise<ToqueEstructurado> {
  if (!dictado.trim()) return VACIO;
  return ia.generar(construirPrompt(dictado), toqueEstructuradoSchema);
}
```

El prompt (función aparte, como en `borradores.ts`): explica el dominio OnePay/ISPs, pide extraer solo lo que aparece, voz colombiana ejecutiva sin emojis/em-dashes, y describe cada campo. Reutilizar el tono de `construirPrompt` de `borradores.ts`.

- [ ] **Paso 4: Ver pasar.** PASS.

- [ ] **Paso 5: Commit.**

```bash
git add app/core/estructurar-toque.ts app/core/estructurar-toque.test.ts
git commit -m "feat(core): estructurar dictado de llamada en campos + resumen (IAPort)"
```

> **Checkpoint de aprendizaje:** Sebastián explica por qué el schema restringe `resultado` a `RESULTADOS | null` y por qué "campo ausente = null, nunca inventar" es una regla de dominio y no del prompt. Espacio para su decisión de diseño (5-10 líneas) sobre qué pasa si la IA propone un `resultado` que el humano corrige antes de guardar.

### 5b: `estructurarDictadoAction` (server action)

**Files:** Modify `app/llamada/[id]/actions.ts`

- [ ] **Paso 1:** Añadir `estructurarDictadoAction(dictado: string): Promise<ToqueEstructurado>` que llama `requireSession()`, crea el adapter (`crearClaudeAdapter()`) y retorna `estructurarToque(dictado, ia)`. No escribe nada (solo propone). Commit.

### 5c: `CapturaLlamada.tsx` (client)

**Files:** Create `app/llamada/[id]/CapturaLlamada.tsx` (reemplaza `CaptureForm.tsx`)

- [ ] **Paso 1: Componente.** Flujo del owner: (1) selector de salida (`Seg`/botones con `RESULTADO_LABELS`), (2) textarea "Pega tu resumen dictado", botón "Estructurar" → `estructurarDictadoAction` → precarga los campos (usuarios/crm/pasarela/recaudo/quePaso/proximoPaso/fecha) como **borrador editable** (el owner corrige), (3) chips de fecha próximo follow-up (+1d/+3d/+1sem) como en el `CaptureForm` actual, (4) botón "Guardar y confirmar" → `registrarToqueAction`. Mantener `razonPerdida` obligatoria si `resultado='contesto_no'` (regla que ya vive en `registrarToqueSchema`). Reusar `plusDias` de `app/lib/date-utils`. Todo con tokens (`.capture` legacy queda sólo hasta borrar el viejo).

- [ ] **Paso 2: build + commit.**

## Tarea 6: Expandir sync de Notion (campos que faltan)

El owner pidieron sí o sí: **próximo paso + fecha** (ya soportados), **fecha primer contacto**, **fecha último contacto**, **tabla de toques hechos** y **resumen** (ya → `notasDiscovery`). Expandir `CambioNotion`.

**Files:**
- Modify: `app/core/ports/sync.ts`
- Modify: `app/adapters/notion.ts`
- Modify: `app/db/repository.ts` (`encolarOutboxNotion` en `registrarToque`)
- Test: `app/adapters/notion.test.ts` (ya existe; añadir casos)

- [ ] **Paso 1: Test que falla** en `notion.test.ts`: `construirPropiedades` mapea `fechaPrimerContacto`/`fechaUltimoContacto` a props `date` y `toquesHechos` (string) a `rich_text`. (Inspeccionar cómo el test actual llama a `construirPropiedades` — puede estar no exportada; exportarla o testear vía `actualizarPagina` con fetch fake, siguiendo el patrón existente del archivo.)

- [ ] **Paso 2: Ver fallar.** FAIL.

- [ ] **Paso 3: Implementar.** En `sync.ts`:

```ts
export type CambioNotion = {
  notionPageId: string;
  notasDiscovery?: string;
  proximoPaso?: string;
  fechaProximoPaso?: string;
  fechaPrimerContacto?: string;   // YYYY-MM-DD, solo si aún no estaba
  fechaUltimoContacto?: string;   // YYYY-MM-DD
  toquesHechos?: string;          // tabla en texto (una línea por toque)
};
```

En `notion.ts::construirPropiedades`, añadir los tres mapeos (verificar los **nombres exactos** de las propiedades en el "Sales Pipeline" real antes de escribir — el archivo ya deja esa nota para `Estado`; los nombres candidatos son "Fecha Primer Contacto", "Fecha Último Contacto", "Toques"; confirmar contra Notion, no adivinar). El campo `Estado` (status) sigue **fuera de alcance** (nota ya existente en `sync.ts`).

En `registrarToque` (repository), al encolar el outbox, incluir `fechaUltimoContacto = hoy`, `fechaPrimerContacto` solo si la empresa no tenía toques previos, y `toquesHechos` como el render de los toques (una función helper `render­ToquesHechos(toques)`).

- [ ] **Paso 4: Ver pasar.** PASS.

- [ ] **Paso 5: Commit.**

```bash
git add app/core/ports/sync.ts app/adapters/notion.ts app/adapters/notion.test.ts app/db/repository.ts
git commit -m "feat(sync): Notion primer/ultimo contacto + tabla de toques hechos"
```

> **Checkpoint:** Sebastián confirma los nombres reales de las propiedades en Notion (o marca cuáles crear) antes de que esto se active en prod. Sin nombres verificados, el worker fallaría el PATCH.

## Tarea 7: Pantalla de Confirmación (receipt)

**Files:** Create `app/llamada/[id]/Confirmacion.tsx`; Modify `app/llamada/[id]/actions.ts` y `page.tsx`.

- [ ] **Paso 1: Componente.** Props: `{ empresa: string; dia: number | null; duracion: string | null; campos: {label:string; valor:string}[]; resumenDictado: string; granola: { resumen: string | null; url: string | null }; sincronizado: { notion: boolean; granola: boolean } }`. Estructura del mockup "Check Received Confirmation Touch":
  - **Header de éxito** `bg-accent-whatsapp-soft` (verde): check + "Toque guardado y enlazado" + sub `{empresa} · día {dia} · {duracion}` + chips "Notion"/"Granola" (`text-check` si `sincronizado`).
  - **Grid 3 columnas:** "CAMPOS QUE LLENASTE" (lista label/valor + Resultado en `text-check`), "TU RESUMEN · DICTADO" (`text-accent-llamada` label + el `resumenDictado`), "GRANOLA · ¿EL CORRECTO?" (`granola.resumen` en caja + link "Abrir grabación en Granola" a `granola.url`). Si no hay grabación aún, reusar el flujo de `<BuscarGrabacion>` (buscar/confirmar) dentro de esta columna.
  - **Footer:** "Ver toque" + "Volver a la cola" (link a `/cola`).

- [ ] **Paso 2: Ajustar `registrarToqueAction`.** Hoy hace `redirect('/')`. Cambiar a: tras `registrarToque`, en vez de redirigir a `/`, redirigir a `/llamada/{idEmpresa}?vista=confirmacion` (o retornar estado para render inline). El `page.tsx` con `?vista=confirmacion` arma las props del receipt desde el último toque + `getContextoToque` + Granola.

- [ ] **Paso 3: build + commit.**

```bash
git add app/llamada/[id]/Confirmacion.tsx app/llamada/[id]/actions.ts app/llamada/[id]/page.tsx
git commit -m "feat(toque): pantalla de confirmacion (receipt Notion/Granola)"
```

## Tarea 8: Cablear `page.tsx` como despachador + limpiar

**Files:** Modify `app/llamada/[id]/page.tsx`; Delete `app/llamada/[id]/CaptureForm.tsx`; envolver en `SidebarFrame`.

- [ ] **Paso 1:** Reescribir `page.tsx`: `requireSession()`, `const ctx = getContextoToque(id)`, decidir `VistaToque` (Tarea 3), y renderizar dentro de `<SidebarFrame>` la vista: `confirmacion` → `<Confirmacion>`; canal `llamada` (default Fase 1) → `<LlamadaCard>`; correo/whatsapp → placeholder "Editor en camino (Fase 2)" hasta la Fase 2. Mantener el guard de "Cuenta no encontrada".

- [ ] **Paso 2:** Borrar `CaptureForm.tsx` (ya sustituido) y quitar del `globals.css` los bloques legacy que solo usaba `/llamada` (`.call-*`, `.capture`, `.outcomes*`, `.oc2`, `.field`, `.tq*`) **solo si** ninguna otra página no migrada los usa (grep antes de borrar; `.tq*` los usa `BuscarGrabacion`, así que esos se quedan o se migran con Granola).

- [ ] **Paso 3:** `npm run build` + `npm test` (todo verde). Commit.

```bash
git add -A app/llamada app/globals.css
git commit -m "feat(toque): page.tsx despacha por canal; retira CaptureForm legacy"
```

> **Verificación de Fase 1 (sin preview):** `npm test` verde (core/datos/adaptadores), `npm run build` verde (typecheck de todas las vistas nuevas), y lectura del diff del flujo llamada → estructurar → guardar → confirmación. Si se quiere prueba en vivo, la corre Sebastián en su `next dev` local (no esta sesión).

---

# FASE 2 — Toque 2 (Correo) + Toque 3 (WhatsApp)

Editores de personalización promovidos desde `por-revisar`/`CadenciasHoy` al cockpit de toque. Dependen de `version_paso` (asunto/cuerpo/variables/versiones) que ya existe.

## Tarea 9: Personalización de copy (core) + versiones

**Files:** Create `app/core/personalizar-copy.ts` + test; Modify `app/db/repository.ts` (`versionesDePaso`).

- [ ] **Paso 1: Test que falla** de `resaltarVariables` / `resolverVariables`: parte el texto en tokens `[nombre]` y aplica los datos reales de la cuenta; deja sin resolver (marcado) lo que no tenga dato. Es la lógica de `conVariablesResaltadas` de `ToqueRevisar` promovida a core y deduplicada (hoy está copiada en `ToqueRevisar.tsx` y `CadenciasHoy.tsx`).

- [ ] **Paso 2-4:** implementar (devuelve segmentos `{ texto, esVariable, resuelta }` para que la UI decida el resaltado, sin JSX en core), ver pasar, commit.

- [ ] **Paso 5:** `versionesDePaso(idPaso)` en repository: trae las `version_paso` (A/B/C) con `nombre`, `esDefault`, `fecha`, para la barra lateral de versiones. Test + commit.

## Tarea 10: `EditorCorreo.tsx` (Toque 2)

**Files:** Create `app/llamada/[id]/EditorCorreo.tsx`. Acento `text-accent-correo`.

- [ ] **Paso 1: Componente.** Mockup "OnePay Email Editor Toque 2": title bar ("Personalizar correo" + badge "DÍA N · {objetivo}"), metadata strip (empresa · ciudad · usuarios · pasarela · estado), grid `[1fr_216px]`: izquierda campos **Asunto** y **Mensaje** (editables, con variables resaltadas vía Tarea 9) + botones "Enviar correo" / "Guardar versión"; derecha barra "VERSIONES DE ESTE TOQUE" (de `versionesDePaso`) con la activa marcada y "Reusar" en las otras. Solo tokens.

- [ ] **Paso 2: build + commit.**

## Tarea 11: `EditorWhatsapp.tsx` (Toque 3, sin scoring)

**Files:** Create `app/llamada/[id]/EditorWhatsapp.tsx`. Acento `text-accent-whatsapp`.

- [ ] **Paso 1: Componente.** Mockup "Message WPP Toque 3" **recortado a v1**: title bar ("Personalizar mensaje" + "DÍA N"), composer de una línea con variables resaltadas + "Enviar", y grilla "TUS VERSIONES DE ESTE TOQUE" (solo `versionesDePaso` del paso/campaña + las propias del owner). **Diferido (no construir):** los tabs "Mejor respuesta / Recientes / Mías", el % de respuesta (72%…) y las tarjetas de otros usuarios (María Paz, Diego) — es scoring + librería cross-usuario, fuera de v1. Dejar un comentario en el componente señalando el hueco para la fase de scoring.

- [ ] **Paso 2: build + commit.**

## Tarea 12: `enviarToqueCanalAction` + despacho en `page.tsx`

**Files:** Modify `app/llamada/[id]/actions.ts` y `page.tsx`.

- [ ] **Paso 1:** `enviarToqueCanalAction(idPasoInscripcion, cuerpo?)` reusando la lógica de `aprobarDesdeInboxAction` (`app/por-revisar/actions.ts`) — extraer a un helper compartido si hace falta, sin duplicar la regla. Tras enviar, redirigir a `?vista=confirmacion`.

- [ ] **Paso 2:** En `page.tsx`, cambiar los placeholders de Fase 1 por `<EditorCorreo>` / `<EditorWhatsapp>` según canal. Decidir de dónde sale el `idPasoInscripcion` para un toque de cadencia (viene de `agendaHoyCadencias`); para un correo/WhatsApp **suelto** (sin cadencia) el editor guarda vía `registrarToque` con `canal` correspondiente, sin `pasoInscripcion`.

- [ ] **Paso 3:** `npm test` + `npm run build` verdes. Commit.

- [ ] **Paso 4 (opcional, higiene):** si `por-revisar` queda redundante con estos editores, evaluar en conversación si se retira o se mantiene como bandeja masiva. **No** borrar en este plan sin decisión explícita del owner.

---

## Fuera de alcance (diferido, con razón)

- **Scoring / % de respuesta** y **librería de versiones cross-usuario** (WhatsApp): fuera de v1 por constitución. El componente deja el hueco marcado.
- **Escritura del campo `Estado`** (tipo status) a Notion: requiere mapear los grupos de status reales; ya anotado en `sync.ts`.
- **Micrófono / captura de audio en la app:** prohibido por constitución; el dictado es texto.
- **Auto-avance de cadencia** ("si no contesta pasa a WhatsApp") como automatización real: la UI lo **muestra** como sugerencia; el motor de avance ya vive en `motor-cadencia.ts` y no se toca aquí.

## Riesgos / decisiones abiertas para el checkpoint

1. **`recaudo`**: ¿columna nueva en `empresa` (migración, reflejar en `isps.db`) o campo de guion sin persistir? (Tarea 1/2). Por defecto: no persistir.
2. **Nombres exactos de propiedades de Notion** (primer/último contacto, toques): verificar contra el "Sales Pipeline" real antes de activar (Tarea 6).
3. **Ruta**: se conserva `/llamada/[id]` (mínimo churn, todos los links de la cola apuntan ahí) aunque ya no sea solo "llamada". Renombrar a `/toque/[id]` es un cambio aparte no incluido.
4. **`por-revisar`** vs. editores nuevos (Tarea 12, paso 4): decidir consolidación con el owner.

---

## Self-review (cobertura vs. mockups)

- Toque 1 (Llamada): header, riel secuencia, sugerencia, La cuenta, calificación, registrar → Tareas 1-5, 4a-4c. ✅
- Confirmación: receipt 3 columnas + chips + Granola → Tareas 6-7. ✅
- Toque 2 (Correo): editor + versiones → Tareas 9-10. ✅
- Toque 3 (WhatsApp): composer + tus versiones (sin scoring) → Tarea 11. ✅ (scoring diferido, marcado)
- Abstracción de tokens (requisito explícito del owner) → Tarea 0, aplicada en cada componente. ✅
- Link de Notion → Tarea 3. ✅
- Dictado → estructurar (sin mic) → Tarea 5. ✅
- Notion: próximo paso/fecha (ya), primer/último contacto, toques hechos, resumen → Tarea 6. ✅
