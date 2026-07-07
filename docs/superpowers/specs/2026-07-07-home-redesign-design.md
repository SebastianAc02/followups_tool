# Rediseño del Home (dashboard) — diseño

Fecha: 2026-07-07
Rama: `feat/home-redesign` (worktree `.claude/worktrees/feat+home-redesign`, base origin/main)
Origen del diseño: `~/Arc/Home Nav Lateral.html` (cockpit oscuro con sidebar y acento morado)

## Qué es y por qué

El home actual (`app/page.tsx`, la ruta `/`) ya está en Tailwind pero su layout no gusta:
es una columna angosta (`max-w-[860px]`) con un `TopNav` horizontal, sin navegación
lateral. El nuevo diseño lo convierte en un **cockpit de dos columnas**: un **shell con
sidebar** (navegación + estado de conectores en vivo) y un **home** con stat cards, barra
de pipeline por etapa y lista de campañas activas.

Este es el siguiente módulo de la migración a Tailwind. El home ya es Tailwind inline, así
que no hay CSS viejo del home que borrar; lo que se construye (shell + secciones) nace
100% Tailwind v4.

## Decisiones tomadas (con el owner)

1. **Shell reusable, home primero.** El sidebar + top bar se construyen como un componente
   `AppShell` reusable, pero se aplica **solo al home** en esta entrega. Las demás rutas
   (cola, cadencias, panel) lo adoptarán cuando les toque su rediseño. No se toca
   `app/layout.tsx` global todavía, para no meter páginas con CSS viejo dentro del shell
   nuevo y desalinearlas. Diff pequeño y reversible.

2. **Datos reales, incluyendo queries nuevas.** Todo lo que el diseño muestra se cablea con
   el Repository. Lo que hoy no tiene consulta (pipeline por etapa sobre toda la base,
   conteo de cuentas activas) se construye como query nueva en `repository.ts`. Nada de mocks.

3. **Fiel al diseño.** Se adopta la paleta del mockup: acento morado (`#8b7cff`/`#a99cff`),
   superficies del shell (`#0b0c0f`/`#0f1014`/`#111218`), sans de sistema en el home. Los
   colores nuevos entran como tokens en `@theme`; ningún hex suelto en componentes.

4. **Todo Tailwind, cero CSS viejo.** Cada `style=""` inline del mockup se traduce a clases
   utility + `cx()`. Único inline sobreviviente: valores calculados en runtime (ej. el
   ancho `%` de cada segmento del pipeline, que sale de los datos). No se toca el bloque de
   CSS viejo de `globals.css` (`.cad-*`, `.panel-*`, `.tap-*`, etc. de otras rutas).

## Realidad de los datos (base real, 2026-07-07)

`empresa` tiene **1959 filas**. `estado_notion` (el funnel):

| estado_notion         | n    |
|-----------------------|------|
| (sin estado)          | 1437 |
| lead                  | 196  |
| on_hold               | 126  |
| firma_pago            | 98   |
| contacto_iniciado     | 64   |
| oportunidad           | 17   |
| cierre_documentacion  | 13   |
| reunion_agendada      | 5    |
| enviar_contrato       | 3    |

- **73% (1437) está "sin estado".** Si la barra de pipeline incluyera ese segmento se comería
  la barra entera y no comunicaría nada. Por eso la barra muestra **solo las etapas del
  funnel definidas en `FUNNEL_ETAPAS`** y excluye "sin estado" (o lo colapsa a un contador
  aparte, decisión de dominio del owner).
- **93 clientes** (`es_cliente=1`), 1873 ISPs, 68 utility, 18 otro.
- **"Deals calientes"** ya está definido en el código (`PIPELINE_CALIENTE` en `app/page.tsx`):
  `reunion_agendada + oportunidad + cierre_documentacion + enviar_contrato` = **38** sobre
  toda la base. Hoy se cuenta solo sobre la cola del día; el diseño lo quiere sobre toda la base.

## Arquitectura

### Tokens nuevos en `globals.css` (`@theme`)

Se agregan al `@theme` existente, sin tocar los tokens actuales (`--color-overdue`, etc.):

- `--color-accent: #8b7cff`, `--color-accent-soft: #a99cff`, `--color-accent-bg: #1a1730`,
  `--color-accent-ink: #e7e3ff`.
- Superficies del shell: `--color-shell: #0b0c0f` (app), `--color-shell-2: #0f1014` (sidebar),
  `--color-card: #111218`, `--color-card-hover: #16171e`, líneas `--color-line-shell: #1b1d25`
  / `#1f212b`.
- El único CSS "no-utility" permitido (idioma Tailwind v4, no CSS viejo): el `@keyframes`
  del punto "En vivo" pulsante y el glow radial ambiental, declarados una vez como
  `@utility`/`@keyframes` y consumidos con `animate-[...]` / una clase utility. Se documenta
  como tal en el commit para no confundir con CSS modules.

### Shell reusable — `app/ui/shell/`

Server components salvo una isla cliente para el estado activo del nav:

- **`AppShell.tsx`** (server): hace su propio fetch de los datos del shell (badges de nav,
  estado de conectores, usuario) y renderiza `<Sidebar>` + `<TopBar>` + `<main>{children}</main>`.
  Reusable por cualquier ruta después. Recibe `children`.
- **`Sidebar.tsx`** (server): workspace switcher (logo morado con gradiente + owner),
  sección "Módulos" con los ítems de nav y sus badges reales, y abajo el mini-panel de
  **Conectores** (Granola / Claude / Notion) con punto de color según estado.
- **`SidebarNav.tsx`** (`"use client"`): la única isla cliente. Recibe la lista de ítems
  (label, href, icono, badge) como props y resalta el activo con `usePathname()`.
- **`TopBar.tsx`** (server, con reloj como sub-isla cliente opcional): buscador `⌘K`
  (placeholder visual, no funcional en v1), indicador "En vivo" pulsante, fecha, avatar con
  iniciales del owner.

### Contenido del home — `app/page.tsx` + `app/ui/home/`

`app/page.tsx` se reescribe: hace el fetch de datos del home, envuelve todo en `<AppShell>`
y renderiza las secciones. Componentes presentacionales nuevos:

- **`StatCard.tsx`**: tarjeta de métrica (label, número grande, sub-línea). Variante de tono
  (neutral / rojo / morado / verde). Se usan 4: Toques para hoy, Vencidos, Deals calientes,
  Cuentas activas.
- **`PipelineBar.tsx`**: barra segmentada por etapa del funnel. Consume `FUNNEL_ETAPAS`
  (orden + label + color) y el conteo real; el ancho de cada segmento es `%` calculado en
  runtime (único `style` inline permitido).
- **`CampaignRow.tsx`**: fila de campaña activa con punto de estado, chip, barra de progreso
  (inscritas/total) y ratio.

### Queries nuevas — `app/db/repository.ts`

- **`contarPorEstado(owner?)`**: agrupa `empresa` por `estado_notion` con conteo. Alimenta
  `PipelineBar`. Acceso solo por el Repository (regla de arquitectura); nada de SQL crudo en
  la página.
- **`resumenHome(owner, hoy)`**: retorna `{ toquesHoy, vencidos, dealsCalientes, cuentasActivas }`.
  `dealsCalientes` reusa la lista `PIPELINE_CALIENTE` pero sobre toda la base.
- Los badges del sidebar (Campañas, Toques, Pipeline, Conectores) reusan funciones que ya
  existen (`listarCampanas`, `colaDelDia`/`contadoresHoy`, `estadoConector`) más
  `contarPorEstado` para el total de pipeline.

### Hueco de dominio (lo escribe el owner)

En la capa de dominio (junto a validation/repository, no en un componente) se define:

```ts
// FUNNEL_ETAPAS: el orden real del funnel comercial, qué etapas se muestran en la barra
// de pipeline, su label legible y su color. Decisión de dominio del owner: cuáles entran,
// en qué orden (early -> late), y si "sin estado" se excluye o se muestra aparte.
// Además: la definición de "cuenta activa" (¿en funnel? ¿no on_hold? ¿clientes?).
export const FUNNEL_ETAPAS = [
  // { estado: 'lead',              label: 'Lead',        color: '...' },
  // { estado: 'contacto_iniciado', label: 'Contactado',  color: '...' },
  // ... (8-10 líneas, el owner decide orden/labels/qué incluye)
];
```

`contarPorEstado` devuelve todos los estados; la UI y `resumenHome` filtran/ordenan según
`FUNNEL_ETAPAS`. Así el conocimiento comercial vive en un solo lugar de dominio.

### Mapeo de navegación (diseño → rutas reales)

El mockup usa labels aspiracionales. Mapeo a rutas existentes:

| Label sidebar | Ruta real            | Badge (dato real)                     |
|---------------|----------------------|---------------------------------------|
| Inicio        | `/`                  | — (activo)                            |
| Campañas      | `/campanas`          | nº de campañas activas                |
| Toques        | `/cola`              | nº de follow-ups de hoy               |
| Pipeline      | `/panel`             | total de cuentas en funnel            |
| Conectores    | `/conectores`        | conectados / total (ej. 2/3)          |

Nota: no se crea ninguna ruta nueva. "Pipeline" apunta a `/panel` (el panel de actividad).
Si el owner prefiere otra cosa, se ajusta en el plan.

## Fuera de alcance (v1)

- Buscador funcional / command palette (el `⌘K` es visual).
- Rediseñar cola / llamada / cadencias / panel / campañas.
- Aplicar el shell global en `app/layout.tsx` (se hará cuando más rutas estén rediseñadas).
- Sincronización de badges en tiempo real (se calculan en el render del server).
- Multipersona, scoring, colas pesadas (ya fuera de v1 por constitución).

## Pruebas

- Las queries nuevas del Repository (`contarPorEstado`, `resumenHome`) llevan test propio en
  `app/db/*.test.ts`, siguiendo el patrón de los tests existentes (una feature no está lista
  sin sus pruebas, por constitución).
- La UI (shell + home) se verifica visualmente en el dev server (localhost:3000) contra el
  mockup: sidebar, stat cards, pipeline bar, campañas, estados de conectores.
