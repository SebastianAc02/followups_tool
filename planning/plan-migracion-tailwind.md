# Migración de CSS global a Tailwind v4 — Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking.

> **ESTADO (actualizado 2026-07-07): Tareas 0-3 HECHAS y mergeadas a `feat/cockpit-campanas`/origin.**
> Tailwind v4 está instalado, cableado y en uso en Dashboard (`/`) + `TopNav` +
> `SignOutButton`. **Tareas 4-11 (Cola, Llamada, Cadencias, Panel, Conectores,
> Toque independiente, Campañas-grupo, Login/Register) NO se van a ejecutar tal
> como están escritas.** Ver el pivote documentado justo antes de la Tarea 4:
> esas pantallas no se portan 1:1, se rediseñan de verdad y se construyen
> directo en Tailwind cuando el diseño llegue. El contenido de esas tareas
> (mapeos, Apéndices A/B) queda como REFERENCIA, no como pasos a ejecutar.

**Goal:** Reemplazar todo el CSS global plano (`app/globals.css`) por Tailwind v4 (CSS-first) + una librería pequeña de componentes React reutilizables, sin romper ninguna pantalla durante la transición.

**Architecture:** Tailwind v4 se instala AL LADO del CSS legacy (coexistencia). Los tokens semánticos de `:root` se duplican en `@theme` para volverse utilidades (`bg-surface`, `text-ink`, `font-serif`). Se migra pantalla por pantalla usando componentes de `app/ui/*` + utilidades directas. El `globals.css` legacy se borra completo solo en la última tarea, cuando ya nadie lo usa. Ninguna pantalla a medio migrar se rompe porque el CSS viejo sigue vivo hasta el final.

**Tech Stack:** Next.js 16, React 19, TypeScript, `next/font/google`, Tailwind v4 (`@tailwindcss/postcss`). Sin `clsx`/`tailwind-merge` (helper `cx()` propio para respetar la regla de no agregar dependencias).

**Nota sobre "tests":** esto es una migración de CSS/UI. No hay unit tests de className. La verificación de cada tarea es **visual + build**, vía el MCP de preview (`preview_start`, `preview_snapshot`, `preview_console_logs`, `preview_inspect`) y `npm run build` / typecheck. Cada tarea define explícitamente qué ruta abrir y qué observar. La app ya es fea a propósito: **no se busca fidelidad pixel-perfect**, se busca "misma estructura, en Tailwind, sin errores de consola".

---

## Contexto del estado actual (leer una vez)

- **Tailwind NO está instalado.** `app/globals.css` (569 líneas) es el único stylesheet vivo; lo importa `app/layout.tsx:3`.
- **`app/page.module.css` es código muerto** (nadie lo importa). Se borra en la Tarea 0.
- **`app/layout.tsx`** define 5 fuentes con `next/font/google`, cada una expone una CSS var: `--font-geist-sans`, `--font-geist-mono`, `--font-serif`, `--font-display`, `--font-mono-tag`.
- **24 archivos `.tsx`** usan `className`. El CSS es global (clases planas tipo `.row`, `.pill`, `.chip`), muchas **compartidas** entre pantallas.
- **~25 classNames dinámicos** (template literal con condicional). Ver Apéndice B para el patrón de conversión de cada uno.
- **14 archivos con `style={{}}` inline.** Los anchos de barra (`width: X%`) son dinámicos legítimos y **se quedan inline**. El resto (px sueltos en `campanas/*`) se convierte a utilidades.
- **Bloque `auth-cockpit`** (globals.css:429-568): namespaced, paleta verde propia (`#3ddc8b`), usado por login/register.

### Mapa de archivos (qué se crea / modifica)

**Se crea:**
- `postcss.config.mjs` — plugin de Tailwind.
- `app/ui/cx.ts` — helper de clases condicionales.
- `app/ui/Pill.tsx`, `Chip.tsx`, `Seg.tsx`, `Button.tsx`, `SectionLabel.tsx`, `Dot.tsx`, `Field.tsx` — componentes reutilizables.

**Se modifica:**
- `app/globals.css` — se le antepone Tailwind + `@theme` + base; el legacy se va borrando y muere en la Tarea final.
- `app/layout.tsx` — renombrar las CSS vars de `next/font` a `--ff-*` (evita colisión con las theme keys `--font-serif`/`--font-display`/`--font-mono-tag`).
- Los 24 `.tsx` con `className` — uno por tarea/grupo.
- `package.json` — devDeps de Tailwind.

**Se borra:**
- `app/page.module.css` (Tarea 0).

---

## Tarea 0: Instalar Tailwind v4 y cablearlo (coexistencia)

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `postcss.config.mjs`
- Modify: `app/globals.css` (anteponer Tailwind + `@theme` + base; NO tocar el legacy debajo)
- Modify: `app/layout.tsx` (renombrar font vars a `--ff-*`)
- Delete: `app/page.module.css`

- [x] **Step 1: Instalar Tailwind v4 y el plugin de PostCSS**

Run:
```bash
npm install -D tailwindcss @tailwindcss/postcss
```
Expected: `package.json` gana `tailwindcss` y `@tailwindcss/postcss` en devDependencies. Sin errores.

- [x] **Step 2: Crear `postcss.config.mjs`**

Create `postcss.config.mjs`:
```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [x] **Step 3: Borrar el CSS muerto**

Run:
```bash
git rm app/page.module.css
```
Expected: archivo eliminado. (Confirmado sin importadores: `grep -rn "page.module" app` no devuelve nada.)

- [x] **Step 4: Renombrar las font vars en `app/layout.tsx`**

Las theme keys de Tailwind (`--font-serif`, `--font-display`, `--font-mono-tag`) colisionan con las vars que emite `next/font`. Se renombran las de origen a `--ff-*`.

Reemplazar las líneas 5-9 de `app/layout.tsx`:
```tsx
const geistSans = Geist({ variable: "--ff-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--ff-mono", subsets: ["latin"] });
const serif = Newsreader({ variable: "--ff-serif", subsets: ["latin"], weight: ["400", "500"] });
const display = Space_Grotesk({ variable: "--ff-display", subsets: ["latin"], weight: ["500", "600"] });
const monoTag = IBM_Plex_Mono({ variable: "--ff-mono-tag", subsets: ["latin"], weight: ["400", "500"] });
```
El `<html className={...}>` de la línea 22 no cambia (usa `.variable` de cada objeto, que ahora apunta a los nuevos nombres).

- [x] **Step 5: Actualizar las referencias de fuente en el legacy de `globals.css`**

El CSS legacy referencia los nombres viejos. Sincronizarlos con los `--ff-*`:
```bash
cd app && sed -i '' \
  -e 's/var(--font-geist-sans)/var(--ff-sans)/g' \
  -e 's/var(--font-geist-mono)/var(--ff-mono)/g' \
  -e 's/var(--font-serif)/var(--ff-serif)/g' \
  -e 's/var(--font-display)/var(--ff-display)/g' \
  -e 's/var(--font-mono-tag)/var(--ff-mono-tag)/g' \
  globals.css
```
Expected: `grep -c 'var(--font-geist\|var(--font-serif)\|var(--font-display)\|var(--font-mono-tag)' app/globals.css` devuelve 0.

- [x] **Step 6: Anteponer Tailwind, `@theme` y base a `globals.css`**

Insertar este bloque AL INICIO de `app/globals.css`, ANTES del `:root` existente (que se conserva intacto por ahora, para que el legacy siga funcionando):
```css
@import "tailwindcss";

@theme {
  --color-bg: #0a0a0b;
  --color-surface: #161619;
  --color-surface-2: #1f1f24;
  --color-hover: #171719;
  --color-ink: #ededee;
  --color-ink-soft: #b6b6ba;
  --color-muted: #88888f;
  --color-faint: #5e5e66;
  --color-line: rgba(255, 255, 255, 0.08);
  --color-line-strong: rgba(255, 255, 255, 0.15);
  --color-overdue: #f4796b;
  --color-overdue-bg: rgba(244, 121, 107, 0.13);
  --color-today: #f2b738;
  --color-today-bg: rgba(242, 183, 56, 0.13);
  --color-done: #57c98a;
  --color-ring: rgba(255, 255, 255, 0.12);

  --font-sans: var(--ff-sans), system-ui, sans-serif;
  --font-mono: var(--ff-mono), ui-monospace, monospace;
  --font-serif: var(--ff-serif), Georgia, serif;
  --font-display: var(--ff-display), sans-serif;
  --font-mono-tag: var(--ff-mono-tag), monospace;
}

@utility mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
@utility serif {
  font-family: var(--font-serif);
}
```

Notas:
- Los valores de color se **duplican** (viven en `:root` legacy y en `@theme`). El `:root` legacy se borra en la Tarea final. Esto es intencional para la coexistencia.
- `@utility mono` / `serif` hace que los cientos de `className="mono"`/`"serif"` existentes **sigan funcionando sin tocarlos** y sean válidos en Tailwind. Las reglas legacy `.mono`/`.serif` (globals.css línea 37-38) quedan duplicadas y se borran al final.

- [x] **Step 7: Verificar coexistencia**

```bash
npm run build
```
Expected: build OK, sin errores de PostCSS/Tailwind.

Luego arrancar el server con el MCP de preview (`preview_start`), abrir `/` y `/login`:
- `preview_console_logs` (level error): sin errores.
- `preview_snapshot`: la app se ve **idéntica** a antes (el legacy sigue mandando).
- `preview_inspect` sobre el `body`: confirmar `font-family` resuelve a Geist (var renombrada funciona).
- Verificar que Tailwind ya responde: inspeccionar cualquier elemento tras agregar temporalmente `class="bg-surface"` a un nodo por `preview_eval`, o simplemente confiar en el build. (Se ejercita de verdad en la Tarea 2.)

- [x] **Step 8: Commit**
```bash
git add -A
git commit -m "chore(tailwind): instalar Tailwind v4 en coexistencia con CSS legacy"
```

---

## Tarea 1: Helper `cx()` para clases condicionales

**Files:**
- Create: `app/ui/cx.ts`

- [x] **Step 1: Crear el helper**

Create `app/ui/cx.ts`:
```ts
// Une clases y descarta los valores falsy. Reemplaza a clsx sin agregar dependencia.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

- [x] **Step 2: Verificar typecheck**
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [x] **Step 3: Commit**
```bash
git add app/ui/cx.ts
git commit -m "feat(ui): helper cx para clases condicionales"
```

---

## Tarea 2: Librería de componentes reutilizables (`app/ui/*`)

Construye los componentes que absorben los patrones repetidos del CSS legacy. Son archivos nuevos; no tocan pantallas todavía. La verificación es typecheck + build (el uso visual llega cuando las pantallas los adoptan).

**Files:**
- Create: `app/ui/Dot.tsx`, `app/ui/Pill.tsx`, `app/ui/Chip.tsx`, `app/ui/Seg.tsx`, `app/ui/Button.tsx`, `app/ui/SectionLabel.tsx`, `app/ui/Field.tsx`

- [x] **Step 1: `Dot` (severidad de fila)**

Legacy: `.dot` (6px, redondo) + `.dot.overdue`/`.dot.today`.

Create `app/ui/Dot.tsx`:
```tsx
import { cx } from "./cx";

const SEV = {
  overdue: "bg-overdue",
  today: "bg-today",
} as const;

export function Dot({ sev }: { sev: keyof typeof SEV }) {
  return <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", SEV[sev])} aria-hidden="true" />;
}
```

- [x] **Step 2: `Pill` (estado hot/warm/cold)**

Legacy: `.pill` + `.pill.hot`/`.warm`/`.cold`.

Create `app/ui/Pill.tsx`:
```tsx
import type { ReactNode } from "react";
import { cx } from "./cx";

const TONE = {
  hot: "bg-today-bg text-today",
  warm: "bg-surface-2 text-ink-soft",
  cold: "bg-surface-2 text-muted",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className={cx("rounded-[7px] px-[9px] py-0.5 text-[11px] font-medium", TONE[tone])}>
      {children}
    </span>
  );
}
```

- [x] **Step 3: `Chip` (toggle on/off)**

Legacy: `.chip` + `.chip.on`.

Create `app/ui/Chip.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type ChipProps = { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Chip({ on, children, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer rounded-full border px-[15px] py-2 text-[12px]",
        on ? "border-white bg-white text-[#0a0a0b]" : "border-line-strong bg-surface text-ink-soft",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [x] **Step 4: `Seg` + `SegButton` (segmented control)**

Legacy: `.seg` (contenedor) + `.seg-btn` + `.seg-btn.on`.

Create `app/ui/Seg.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Seg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3.5 inline-flex gap-[3px] rounded-[11px] border border-line bg-surface p-[3px]", className)}>
      {children}
    </div>
  );
}

type SegButtonProps = { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

export function SegButton({ on, children, className, ...props }: SegButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer rounded-lg px-[17px] py-2 text-[13px] font-medium",
        on ? "bg-surface-2 text-ink" : "bg-transparent text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [x] **Step 5: `Button` (primario blanco: variantes block/pill)**

Legacy: `.save` (block), `.cta-primary`/`.rep-btn` (pill).

Create `app/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

const VARIANT = {
  block: "w-full rounded-[13px] py-4 text-[15px] font-semibold",
  pill: "rounded-full px-[18px] py-2 text-[13px] font-medium",
} as const;

type ButtonProps = { variant?: keyof typeof VARIANT } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "pill", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer bg-white text-[#0a0a0b] transition-opacity hover:opacity-90 disabled:opacity-55",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
```
(`type="button"` evita que, dentro de un `<form>`, el botón herede `type="submit"` por default — mismo patrón que ya usan `Chip` y `SegButton`.)

- [x] **Step 6: `SectionLabel`**

Legacy: `.section-label`/`.panel-section-label`/`.cad-config-label` (uppercase, tracking, faint).

Create `app/ui/SectionLabel.tsx`:
```tsx
import type { ReactNode } from "react";
import { cx } from "./cx";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("text-[11px] font-medium uppercase tracking-[0.09em] text-faint", className)}>
      {children}
    </div>
  );
}
```

- [x] **Step 7: `Field` (ficha de llamada: has/miss)**

Legacy: `.field` + `.field.has .f-value` / `.field.miss .f-value` + `.f-label`.

Create `app/ui/Field.tsx`:
```tsx
import type { ReactNode } from "react";
import { cx } from "./cx";

export function Field({ label, value, missing }: { label: string; value: ReactNode; missing?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between border-b border-line py-3")}>
      <span className={cx("text-muted")}>{label}</span>
      {missing ? (
        <span className={cx("rounded-full bg-overdue-bg px-[11px] py-[3px] text-[12px] font-medium text-overdue")}>{value}</span>
      ) : (
        <span className={cx("font-medium")}>{value}</span>
      )}
    </div>
  );
}
```
(Usa `cx()` aunque hoy no haya condicionales, por consistencia con el resto de la librería.)

- [x] **Step 8: Verificar typecheck + build**
```bash
npx tsc --noEmit && npm run build
```
Expected: sin errores.

- [x] **Step 9: Commit**
```bash
git add app/ui/
git commit -m "feat(ui): librería base de componentes Tailwind (Dot, Pill, Chip, Seg, Button, SectionLabel, Field)"
```

---

## Tareas 3-11: Migración por pantalla

**Reglas comunes para TODAS las tareas de pantalla (leer una vez):**
1. Importar los componentes de `app/ui/*` donde apliquen; el resto con utilidades directas.
2. Traducir cada className legacy con el **Apéndice A** (tabla clase → utilidades). Traducir cada className **dinámico** con el **Apéndice B** (patrón `cx()`).
3. Los `style={{ width: \`...%\` }}` dinámicos se **quedan inline**. Los `style={{}}` estáticos (px, flex) se convierten a utilidades.
4. **NO borrar reglas de `globals.css` todavía.** Solo dejar de usarlas. El legacy muere en la Tarea 12.
5. Verificación de cada tarea: `preview_start`, abrir la ruta, `preview_console_logs` (sin errores), `preview_snapshot` (estructura intacta), `preview_screenshot` como prueba. Fidelidad aproximada es suficiente.
6. Commit al cerrar cada pantalla.

---

### Tarea 3: Dashboard `/` + navegación

**Files:**
- Modify: `app/page.tsx` (32 classNames), `app/TopNav.tsx` (2), `app/SignOutButton.tsx` (1)

- [x] **Step 1: Migrar `TopNav.tsx`** — `.topnav`, `.topnav-brand`. Ver Apéndice A.
- [x] **Step 2: Migrar `SignOutButton.tsx`** — `.signout` (botón texto, opacity .5→1 hover). Ver Apéndice A.
- [x] **Step 3: Migrar `page.tsx`** — `.wrap`, `.dash-masthead`, `.dash-brief` (+ `.dash-brief-num` dinámico overdue/done → Apéndice B), `.cta-primary` (usar `<Button variant="pill">` como link o `Link` con las utilidades pill), `.dash-cols`/`.dash-col-quiet`, `.dash-campanas` (tarjeta), `.nav-cad-*` (timeline de dots con `data-canal` → convertir a color por prop/cx), `.dash-utility`, `.section-label` → `<SectionLabel>`. Ver Apéndice A y B.
- [x] **Step 4: Verificar** ruta `/` en preview (snapshot + console + screenshot).
- [x] **Step 5: Commit** `feat(tailwind): migrar dashboard y navegación`

---

## Pivote (2026-07-07): Tareas 4-11 pausadas — rediseño real, no port mecánico

**Qué cambió:** después de migrar Dashboard + nav (Tarea 3), Sebastián decidió
que portar 1:1 el CSS feo actual de Cola, Llamada, Cadencias, Panel admin,
Conectores, Toque independiente, Campañas (grupo) y Login/Register era trabajo
perdido — esas pantallas se van a rediseñar de verdad pronto (el diseño ya
existe o está por llegar, pantalla por pantalla).

**Qué NO hacer:** no ejecutar las Tareas 4-11 tal como están escritas abajo
(son una traducción clase-por-clase del CSS legacy actual a utilidades
Tailwind equivalentes, sin cambiar el look). Ese trabajo se descartó.

**Qué hacer en su lugar, pantalla por pantalla, cuando Sebastián traiga el
diseño real de una de ellas:**
1. Confirmar cuál pantalla y pedir/leer el diseño (mockup, spec, o descripción).
2. Construir la UI **directo en Tailwind v4**, reusando `app/ui/{Dot,Pill,Chip,Seg,Button,SectionLabel,Field}.tsx` y `cx()` donde el patrón encaje; extender esa librería con componentes nuevos si el diseño lo pide, siguiendo el mismo estilo (props tipo `sev`/`tone`/`on`/`missing`/`variant`, `type="button"` en botones).
3. Verificar en navegador con el MCP de preview (`preview_start`, `preview_snapshot`, `preview_console_logs`, `preview_screenshot`) — sin errores de consola, la pantalla se ve como el diseño nuevo.
4. El bloque de CSS legacy de ESA pantalla en `app/globals.css` queda muerto una vez nada lo importa — no se borra ahora (no tocar el CSS legacy de las demás pantallas que siguen pendientes), se puede limpiar cuando se confirme que ya no tiene consumidores (mismo guard de la Tarea 12).
5. Commit por pantalla, mismo patrón `feat(tailwind): rediseñar <pantalla>` (o `feat(<pantalla>): rediseño <lo que sea>` si el cambio es más que solo CSS).

**Las Tareas 4-11 de abajo y los Apéndices A/B quedan como REFERENCIA** — útiles
para saber cuántos classNames tiene cada archivo y qué reglas legacy traduce
cada clase, pero NO son la fuente de verdad del look nuevo (eso lo define el
diseño real que traiga Sebastián). Cada tarea de abajo lleva la etiqueta
**⏸ PAUSADA** en su título.

La **Tarea 12 (teardown del CSS legacy)** queda bloqueada hasta que las 8
pantallas de abajo tengan su rediseño real hecho — su propio guard (Step 1)
ya revienta si alguna clase legacy sigue en uso, así que no hay riesgo de
borrar CSS que alguien todavía necesita.

---

### Tarea 4 ⏸ PAUSADA (ver pivote arriba): Cola `/cola`

**Files:**
- Modify: `app/cola/page.tsx` (36), `app/cola/CadenciasHoy.tsx` (35)

- [ ] **Step 1: Migrar `page.tsx`** — `.head`/`.h-title`/`.h-meta`, `.switch`/`.switch a`/`.switch a.on` (link activo dinámico → Apéndice B), `.counters`/`.counters-row`, `.repartir`/`.rep-label`/`.pordia`/`.rep-btn` (usar `<Button variant="pill">`), filas: `.row-wrap`/`.row`, `.tap-row`/`.tap-objecion`/`.tap-btn`, `.l1`/`.emp`/`.contact`/`.l2`/`.paso`, `.dot` → `<Dot>` (dinámico), `.pill` → `<Pill>` (dinámico), `.right`/`.when`/`.call-cta` (`.when` dinámico overdue/today → Apéndice B), `.empty`. Ver Apéndices.
- [ ] **Step 2: Migrar `CadenciasHoy.tsx`** — reutiliza `.row`, `.dot` (`<Dot>`), `.pill` (`<Pill>` con `c.estado==='activa'?'hot':'warm'`), `.when` dinámico, `.seg-btn` (`<SegButton>` con `corrimiento`), `.cadencias-hoy`. Ver Apéndices.
- [ ] **Step 3: Verificar** `/cola` (incluir estados vencido/hoy) en preview.
- [ ] **Step 4: Commit** `feat(tailwind): migrar cola del día`

---

### Tarea 5 ⏸ PAUSADA (ver pivote arriba): Pantalla de llamada `/llamada/[id]`

**Files:**
- Modify: `app/llamada/[id]/page.tsx` (19), `app/llamada/[id]/CaptureForm.tsx` (19), `app/llamada/[id]/BuscarGrabacion.tsx` (16)

- [ ] **Step 1: Migrar `page.tsx`** — `.back`, `.call-head`/`.call-title`/`.call-sub`, `.section-label` → `<SectionLabel>`, `.field` → `<Field>` (has/miss dinámico → prop `missing`), `.tq`/`.tq-res`/`.tq-txt`/`.tq-date` (`.tq-res` dinámico pos/neg → Apéndice B). Ver Apéndices.
- [ ] **Step 2: Migrar `CaptureForm.tsx`** — `.capture` (+ `label`/`label.full`, `input`/`textarea`), `.outcomes2`/`.outcomes4`/`.oc2` (dinámico on → Apéndice B), `.reveal`, `.grid3`/`.kdm-grid`, `.seg`/`.seg-btn` (`<Seg>`/`<SegButton>` para canal), `.chips`/`.chip` (`<Chip>` con fecha), `.save` → `<Button variant="block">`. Ver Apéndices.
- [ ] **Step 3: Migrar `BuscarGrabacion.tsx`** — `.tq-buscar`/`.tq-confirmar`, `.tq-transcript-ok`, `.tq-candidatas`/`.tq-candidata`/`.tq-candidata-*`, `.tq-vacio`/`.tq-error`. Ver Apéndice A.
- [ ] **Step 4: Verificar** una ruta `/llamada/<id>` real en preview.
- [ ] **Step 5: Commit** `feat(tailwind): migrar pantalla de llamada y captura`

---

### Tarea 6 ⏸ PAUSADA (ver pivote arriba): Cadencias `/cadencias`

**Files:**
- Modify: `app/cadencias/page.tsx`, `app/cadencias/ConstructorCadencia.tsx` (26)

- [ ] **Step 1: Migrar** `.cad-import*`, `.cad-formato`, `.cad-list`/`.cad-item` (dinámico on → Apéndice B), `.cad-constructor`, `.cad-config*` (`.cad-config-label` → `<SectionLabel>`), `.cad-preview-head`, `.cad-timeline`/`.cad-day*`/`.cad-touch*`, `.cad-canal` + `.cad-canal-${canal}` dinámico (correo/whatsapp/llamada → Apéndice B), `.chip` → `<Chip>`, `.save` → `<Button variant="block">`. Ver Apéndices.
- [ ] **Step 2: Verificar** `/cadencias` (construir una cadencia, ver el timeline).
- [ ] **Step 3: Commit** `feat(tailwind): migrar constructor de cadencias`

---

### Tarea 7 ⏸ PAUSADA (ver pivote arriba): Panel admin `/panel`

**Files:**
- Modify: `app/panel/page.tsx` (54 classNames — el más grande)

- [ ] **Step 1: Migrar** `.panel-sub`, `.panel-section-label` → `<SectionLabel>`, `.panel-norte`/`.panel-norte-item`/`.panel-norte-divider`/`.panel-big`/`.panel-delta` (dinámico pos/neg → Apéndice B), `.panel-row`/`.panel-col`/`.panel-col-wide`/`.panel-label`/`.panel-mid`/`.panel-vacio`, `.panel-bars`/`.panel-bar-row`/`.panel-bar-label`/`.panel-bar-track`/`.panel-bar-fill` (+ `panel-bar-${tono}` dinámico → Apéndice B; el `style={{ width: X% }}` **se queda inline**). Ver Apéndices.
- [ ] **Step 2: Verificar** `/panel` (barras con anchos correctos, deltas coloreados).
- [ ] **Step 3: Commit** `feat(tailwind): migrar panel de actividad`

---

### Tarea 8 ⏸ PAUSADA (ver pivote arriba): Conectores `/conectores`

**Files:**
- Modify: `app/conectores/page.tsx` (15)

- [ ] **Step 1: Migrar** `.conector-desc`(+ `.conector-solo-admin`, `a`), `.conector-estado`, `.conector-dot` + `.conector-dot.${color}` dinámico (verde/amarillo/rojo/gris → Apéndice B), `.conector-texto`/`.conector-meta`/`.conector-resultado`, `.conector-form` (+ `input`/`button`; el button usar `<Button variant="pill">` o utilidades). Ver Apéndices.
- [ ] **Step 2: Verificar** `/conectores` en preview.
- [ ] **Step 3: Commit** `feat(tailwind): migrar pantalla de conectores`

---

### Tarea 9 ⏸ PAUSADA (ver pivote arriba): Toque independiente `/toque-independiente`

**Files:**
- Modify: `app/toque-independiente/page.tsx` (12)

- [ ] **Step 1: Migrar** reutiliza `.wrap`, `.back`, `.call-head`/`.call-title`, `.capture`, `.seg`/`.seg-btn` (`<Seg>`/`<SegButton>`), `.pill` (`<Pill>` con `c.estado==='activa'?'hot':'warm'`), `.dot` (`<Dot>`), `.save` (`<Button variant="block">`), `.chips`/`.chip` (`<Chip>`). Convertir sus `style={{}}` estáticos a utilidades. Ver Apéndices.
- [ ] **Step 2: Verificar** `/toque-independiente`.
- [ ] **Step 3: Commit** `feat(tailwind): migrar toque independiente`

---

### Tarea 10 ⏸ PAUSADA (ver pivote arriba): Campañas (grupo) `/campanas`

Estas pantallas se construyeron con `style={{}}` inline crudo (px sueltos, flex), casi sin clases globales. Convertir los inline estáticos a utilidades; dejar inline solo lo dinámico.

**Files:**
- Modify: `app/campanas/page.tsx` (12), `app/campanas/nueva/page.tsx` (5), `app/campanas/nueva/CrearCampana.tsx` (20), `app/campanas/segmentos/page.tsx` (11), `app/campanas/segmentos/SegmentoBuilder.tsx` (16), `app/campanas/segmentos/[id]/revision/page.tsx` (5), `app/campanas/segmentos/[id]/revision/RevisionLeads.tsx` (7)

- [ ] **Step 1: Migrar `campanas/page.tsx`** — `.cad-item` reutilizado + inline flex/gap. Ver Apéndice A + regla de inline.
- [ ] **Step 2: Migrar `nueva/page.tsx` + `CrearCampana.tsx`** — inline styles → utilidades; botones → `<Button>`, chips → `<Chip>` donde aplique.
- [ ] **Step 3: Migrar `segmentos/page.tsx` + `SegmentoBuilder.tsx`** — inline (`display:flex`, `gap`, `minWidth:140`, `width:100`) → utilidades (`flex`, `gap-2`, `min-w-[140px]`, `w-[100px]`); `.mono` se queda.
- [ ] **Step 4: Migrar `revision/page.tsx` + `RevisionLeads.tsx`** — inline → utilidades.
- [ ] **Step 5: Verificar** `/campanas`, `/campanas/nueva`, `/campanas/segmentos`, y una `/revision` real en preview.
- [ ] **Step 6: Commit** `feat(tailwind): migrar pantallas de campañas`

---

### Tarea 11 ⏸ PAUSADA (ver pivote arriba): Auth `/login` + `/register` (auth-cockpit)

El bloque `auth-cockpit` (globals.css:429-568) usa una paleta verde propia hardcodeada. Como es un look aislado y de una sola pantalla, se migra con **valores arbitrarios** (`bg-[#3ddc8b]`, `text-[#e7ecef]`, etc.) — no vale la pena meter esos hex al `@theme`. La animación `@keyframes ac-breathe` (focus-within) se puede: (a) conservar como un único `@utility ac-breathe` en el bloque Tailwind de `globals.css`, o (b) omitir (el usuario dijo que no importa perder detalle). Recomendado: (a) conservarla como `@utility` para no perder el "respiro" del input.

**Files:**
- Modify: `app/login/LoginForm.tsx` (17), `app/login/page.tsx` (1), `app/register/RegisterForm.tsx` (37), `app/register/page.tsx` (1)

- [ ] **Step 1: (Opcional) Mover la animación** — si se conserva el "respiro": mover `@keyframes ac-breathe` al bloque superior de `globals.css` y exponerla como `@utility ac-breathe { animation: ac-breathe 3.2s ease-in-out infinite; }`. Aplicarla con `focus-within:` en el campo.
- [ ] **Step 2: Migrar `LoginForm.tsx`** — `.auth-cockpit`, `.ac-card`(+`.ac-login`), `.ac-inner`, `.ac-brand*`, `.ac-progress`/`.ac-seg`(dinámico on → `cx`), `.ac-step`, `.ac-h`(big/med), `.ac-sub`, `.ac-field`(+`.ac-select`), `.ac-orgchip*`, `.ac-remember`, `.ac-btn` , `.ac-error`, `.ac-foot`, `.ac-back`, `.ac-login-body`. Todo con valores arbitrarios de la paleta cockpit. Ver globals.css:437-568 como fuente de verdad de cada valor.
- [ ] **Step 3: Migrar `RegisterForm.tsx`** (37 classNames, mismo vocabulario `ac-*` + `.ac-orgchip`, `.ac-select`).
- [ ] **Step 4: Migrar `login/page.tsx` y `register/page.tsx`** (1 className cada uno).
- [ ] **Step 5: Verificar** `/login` y `/register` en preview (incluir el focus-within del campo si se conservó la animación).
- [ ] **Step 6: Commit** `feat(tailwind): migrar login y register (auth-cockpit)`

---

## Tarea 12 🚫 BLOQUEADA (hasta cerrar Tareas 4-11): Teardown del CSS legacy

Con las 24 pantallas migradas, `globals.css` ya no debería tener consumidores de las clases legacy. Se borra todo el cuerpo legacy, dejando solo el bloque Tailwind.

**Files:**
- Modify: `app/globals.css` (dejar solo `@import` + `@theme` + base + `@utility`)

- [ ] **Step 1: Confirmar que ninguna clase legacy sigue en uso**

Correr este guard sobre una lista de clases legacy representativas:
```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool
for c in wrap head switch counters repartir row tap-btn pill chip seg-btn oc2 save cad-item cad-day panel-norte panel-bar conector-dot ac-card ac-field dash-campanas cta-primary section-label field tq-candidata; do
  n=$(grep -rlE "className=[\"\`][^\"\`]*\\b$c\\b" app --include="*.tsx" | wc -l | tr -d ' ')
  [ "$n" != "0" ] && echo "TODAVÍA EN USO: .$c ($n archivos)"
done
echo "guard terminado"
```
Expected: solo `guard terminado` (ninguna clase reportada en uso). Si alguna aparece, esa pantalla quedó a medio migrar: volver a su tarea antes de borrar.

- [ ] **Step 2: Reescribir `globals.css` a su forma final**

`app/globals.css` queda exactamente así (todo el legacy borrado):
```css
@import "tailwindcss";

@theme {
  --color-bg: #0a0a0b;
  --color-surface: #161619;
  --color-surface-2: #1f1f24;
  --color-hover: #171719;
  --color-ink: #ededee;
  --color-ink-soft: #b6b6ba;
  --color-muted: #88888f;
  --color-faint: #5e5e66;
  --color-line: rgba(255, 255, 255, 0.08);
  --color-line-strong: rgba(255, 255, 255, 0.15);
  --color-overdue: #f4796b;
  --color-overdue-bg: rgba(244, 121, 107, 0.13);
  --color-today: #f2b738;
  --color-today-bg: rgba(242, 183, 56, 0.13);
  --color-done: #57c98a;
  --color-ring: rgba(255, 255, 255, 0.12);

  --font-sans: var(--ff-sans), system-ui, sans-serif;
  --font-mono: var(--ff-mono), ui-monospace, monospace;
  --font-serif: var(--ff-serif), Georgia, serif;
  --font-display: var(--ff-display), sans-serif;
  --font-mono-tag: var(--ff-mono-tag), monospace;
}

:root {
  color-scheme: dark;
}

@layer base {
  body {
    color: var(--color-ink);
    background: var(--color-bg);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-size: 14px;
    line-height: 1.45;
    letter-spacing: -0.003em;
  }
  html,
  body {
    max-width: 100vw;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
}

@utility mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
@utility serif {
  font-family: var(--font-serif);
}
```
(Si en la Tarea 11 se conservó `ac-breathe`, incluir aquí su `@keyframes` + `@utility`.)

- [ ] **Step 3: Verificación final completa**
```bash
npx tsc --noEmit && npm run build
```
Expected: sin errores.

Luego en preview, recorrer TODAS las rutas y confirmar sin errores de consola ni regresiones estructurales graves: `/`, `/cola`, `/llamada/<id>`, `/cadencias`, `/panel`, `/conectores`, `/toque-independiente`, `/campanas`, `/campanas/nueva`, `/campanas/segmentos`, `/campanas/segmentos/<id>/revision`, `/login`, `/register`. Screenshot de 3-4 pantallas clave como prueba.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "chore(tailwind): borrar CSS legacy, globals.css solo Tailwind"
```

---

## Apéndice A: Tabla de traducción (clase legacy → utilidades Tailwind)

Recetas para las clases estáticas más usadas. Fuente de verdad: `app/globals.css`. Colores → utilidades de token (`text-ink`, `bg-surface`, `border-line`, etc.). `12.5px`/`13.5px` → `text-[12.5px]` (valor arbitrario) o redondear a `text-xs`/`text-[13px]` (fidelidad aproximada permitida).

| Legacy | Utilidades Tailwind |
|---|---|
| `.wrap` | `mx-auto max-w-[860px] px-6 pt-10 pb-[110px]` |
| `.head` | `flex items-start justify-between pb-5 mb-3` |
| `.h-title` | `font-serif text-[30px] font-medium tracking-[-0.01em]` |
| `.h-meta` | `pt-3 text-[13px] text-muted` |
| `.switch` | `mt-4 flex gap-1.5` |
| `.switch a` | `rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:bg-surface` |
| `.switch a.on` | `bg-white text-[#0a0a0b] border-white` (condicional → Apéndice B) |
| `.counters` | `mb-[22px] flex flex-col gap-1` |
| `.counters-row` | `flex flex-wrap gap-3.5 text-[12.5px] text-muted` |
| `.repartir` | `mb-[22px] flex flex-wrap items-center gap-2 rounded-[14px] border border-line bg-surface px-[15px] py-3 text-[13px] text-muted` |
| `.pordia` | `w-[52px] rounded-lg border border-line-strong bg-bg p-1.5 text-center text-[14px] text-ink focus:outline-none focus:border-ink-soft focus:ring-[3px] focus:ring-ring` |
| `.row-wrap` | `border-b border-line` |
| `.row` | `grid grid-cols-[1fr_auto] items-start gap-4 rounded-xl px-3.5 py-4 transition-colors hover:bg-hover` |
| `.tap-row` | `flex flex-wrap items-center gap-2 px-3.5 pb-3.5` |
| `.tap-objecion` | `min-w-[140px] flex-1 rounded-lg border border-line-strong bg-surface px-[11px] py-[7px] text-[12.5px] text-ink placeholder:text-faint focus:outline-none focus:border-ink-soft focus:ring-[3px] focus:ring-ring` |
| `.tap-btn` | `rounded-full border border-line-strong bg-surface px-3.5 py-[7px] text-[12px] font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink hover:border-muted cursor-pointer` |
| `.l1` | `flex flex-wrap items-center gap-[9px]` |
| `.emp` | `text-[15px] font-medium tracking-[-0.01em]` |
| `.contact` | `text-[13px] text-muted` |
| `.l2` | `mt-1.5 flex flex-wrap gap-[18px] text-[12.5px] text-faint` (su `b` → `text-ink-soft font-medium`) |
| `.paso` | `mt-1.5 text-[13px] text-ink-soft` |
| `.right` | `whitespace-nowrap text-right` |
| `.when` | `text-[12px] font-semibold tracking-[-0.01em]` (color overdue/today condicional → Apéndice B) |
| `.call-cta` | `mt-2.5 text-[12px] font-semibold text-ink-soft` (hover de fila → envolver con `group`/`group-hover:text-ink`) |
| `.empty` | `py-20 text-center text-muted` |
| `.back` | `text-[13px] text-muted hover:text-ink` |
| `.call-head` | `mt-[22px] mb-[26px]` |
| `.call-title` | `font-serif text-[36px] font-medium leading-[1.1] tracking-[-0.015em]` |
| `.call-sub` | `mt-2.5 text-muted` |
| `.tq` | `grid grid-cols-[auto_1fr_auto] items-baseline gap-3 border-b border-line py-2.5 text-[13px]` |
| `.tq-txt` | `text-ink-soft` · `.tq-date` | `text-[12px] text-faint` |
| `.tq-candidata` | `rounded-[10px] border border-line bg-surface p-3` |
| `.topnav` | `mb-5 flex items-center justify-between border-b border-line pb-[18px]` |
| `.topnav-brand` | `font-serif text-[18px] font-medium tracking-[-0.01em] text-ink hover:text-white` |
| `.dash-masthead` | `mb-5 font-serif text-[28px] font-medium tracking-[-0.01em]` |
| `.dash-brief` | `mb-5 max-w-[60ch] text-[17px] leading-[1.5] text-ink-soft` |
| `.cta-primary` | `mb-[26px] block rounded-full bg-white px-5 py-[15px] text-center text-[15px] font-medium text-[#0a0a0b] transition hover:opacity-90` |
| `.dash-cols` | `mb-[30px] flex gap-8` (responsive `max-[560px]:flex-col` → `max-md:` custom o `sm:`) |
| `.dash-campanas` | `mb-[18px] block rounded-[14px] border border-line bg-surface px-[22px] py-5 transition hover:bg-surface-2 hover:border-muted` |
| `.dash-utility` | `flex flex-wrap gap-6 pt-1` (sus `a` → `text-[13px] text-muted hover:text-ink transition-colors`) |
| `.signout` | `cursor-pointer text-[13px] text-ink opacity-50 hover:opacity-100` |
| `.capture label` | `flex flex-col gap-1.5 text-[12px] text-muted` |
| `.capture input/textarea` | `w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-ink-soft focus:ring-[3px] focus:ring-ring` |
| `.outcomes2` | `grid grid-cols-2 gap-3` |
| `.grid3` | `grid grid-cols-3 gap-2.5` |
| `.reveal` | `mt-5` |
| `.panel-norte` | `flex items-stretch border-b border-line pt-[22px] pb-[26px]` |
| `.panel-big` | `font-serif text-[44px] font-medium leading-[1.1] tracking-[-0.01em]` |
| `.panel-bar-track` | `h-1.5 overflow-hidden rounded-full bg-surface` |
| `.panel-bar-fill` | `block h-full rounded-full bg-ink-soft` (tono condicional → Apéndice B; width → inline) |
| `.conector-estado` | `flex flex-wrap items-center gap-2 py-2.5` |
| `.conector-form input` | `flex-1 rounded-[10px] border border-line-strong bg-surface px-3.5 py-2.5 text-[13px] text-ink` |

> Para cualquier clase no listada, abrir `app/globals.css`, leer la regla, y traducir propiedad por propiedad. Colores siempre a token utility.

---

## Apéndice B: Patrones para classNames dinámicos (usar `cx()`)

Cada template-literal condicional se convierte con `cx()` o con un componente que ya encapsula el condicional. Referencia por tipo:

| Legacy dinámico | Conversión |
|---|---|
| `` `dot ${sev}` `` / `` `dot ${atrasado?'overdue':'today'}` `` | `<Dot sev={atrasado ? "overdue" : "today"} />` |
| `` `pill ${tono}` `` / `` `pill ${estado==='activa'?'hot':'warm'}` `` | `<Pill tone={estado === "activa" ? "hot" : "warm"}>` |
| `` `when ${atrasado?'overdue':'today'}` `` | `cx("text-[12px] font-semibold tracking-[-0.01em]", atrasado ? "text-overdue" : "text-today")` |
| `` `seg-btn ${x===v?'on':''}` `` | `<SegButton on={x === v}>` |
| `` `chip ${cond?'on':''}` `` | `<Chip on={cond}>` |
| `` `oc2 ${outcome===v?'on':''}` `` | `cx("... base oc2 ...", on ? "border-white bg-white text-[#0a0a0b]" : "border-line-strong bg-surface text-ink")` |
| `` `field ${has?'has':'miss'}` `` | `<Field missing={!has} ... />` |
| `` `tq-res ${pos?'pos':'neg'}` `` | `cx("text-[12px] font-semibold", pos ? "text-done" : "text-muted")` |
| `` `panel-delta ${v>=0?'pos':'neg'}` `` | `cx("text-[12.5px]", v >= 0 ? "text-done" : "text-overdue")` |
| `` `panel-bar-fill panel-bar-${tono}` `` | `cx("block h-full rounded-full", { pos:"bg-done", mid:"bg-today", neg:"bg-faint" }[tono] ?? "bg-ink-soft")` |
| `` `conector-dot ${color}` `` | `cx("inline-block h-2 w-2 rounded-full", { verde:"bg-done", amarillo:"bg-today", rojo:"bg-overdue", gris:"bg-faint" }[color])` |
| `` `cad-canal cad-canal-${canal}` `` | `cx("rounded-[7px] px-2.5 py-[3px] text-[11px] font-medium lowercase", { correo:"bg-today-bg text-today", whatsapp:"bg-[rgba(87,201,138,0.13)] text-done", llamada:"bg-surface-2 text-ink-soft" }[canal] ?? "bg-surface-2 text-ink-soft")` |
| `` `ac-seg ${paso===2?'on':''}` `` | `cx("h-[3px] flex-1 rounded-[2px]", on ? "bg-[#3ddc8b]" : "bg-[#232a31]")` |
| `switch a` con `key===owner?'on':''` (dashboard/cola) | `cx("rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors", on ? "border-white bg-white text-[#0a0a0b]" : "border-line-strong text-ink-soft hover:bg-surface")` |
| `nav-cad-dot[data-canal=...]` | `cx("h-[7px] w-[7px] rounded-full border", { correo:"bg-today border-today", whatsapp:"bg-done border-done", llamada:"bg-ink-soft border-ink-soft" }[canal] ?? "bg-surface-2 border-line-strong")` |

---

## Self-review (hecho)

- **Cobertura:** cada archivo `.tsx` con className cae en una tarea (3-11). El setup y el teardown están cubiertos (0 y 12). `page.module.css` muerto se borra (0).
- **Orden/seguridad:** el legacy sobrevive hasta la Tarea 12 → ninguna pantalla a medio migrar se rompe. El guard del Step 1 de la Tarea 12 impide borrar con consumidores vivos.
- **Colisión de fuentes:** resuelta renombrando `next/font` a `--ff-*` y sincronizando el legacy (Tarea 0, Steps 4-5).
- **Dinámicos:** los ~25 classNames condicionales tienen patrón explícito (Apéndice B).
- **Inline styles:** regla clara — dinámico (width %) se queda, estático se convierte.
- **Consistencia de tipos:** los componentes exponen props consistentes (`sev`, `tone`, `on`, `missing`, `variant`) usadas igual en las tareas de pantalla y en el Apéndice B.
