# Rediseño del Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el home (`/`) en un cockpit oscuro de dos columnas (shell con sidebar + contenido), 100% Tailwind v4, cableado con datos reales del Repository.

**Architecture:** Un `AppShell` reusable (sidebar + top bar, server components con una isla cliente para el nav activo) envuelve el home. El contenido del home (stat cards, barra de pipeline, campañas) sale de queries nuevas en `repository.ts` sobre datos reales. Los colores del diseño entran como tokens en `@theme`; nada de hex sueltos ni CSS viejo.

**Tech Stack:** Next.js (App Router, React server components), TypeScript, Tailwind v4 (`@theme` en `globals.css`), Drizzle ORM sobre SQLite, tests con `node:test` + better-sqlite3.

**Convenciones del repo (no negociable):**
- Acceso a datos SOLO por el Repository (`app/db/repository.ts`). Nada de SQL crudo en componentes.
- Tests de DB en `app/db/*.test.ts`, con `crearDbPrueba()`/`borrarDbPrueba()` de `./test-helpers.ts` y `process.env.ISPS_DB_PATH`. NUNCA tocan `isps.db` real.
- Correr tests: `npm test` (desde la raíz del worktree).
- UI se verifica visualmente en el dev server (`npm run dev`, localhost:3000), no con unit tests.
- Voz de textos para humanos: sin emojis, sin em dashes, español directo. Owner = Sebastián.

---

## Estructura de archivos

**Crear:**
- `app/db/funnel.ts` — dominio del funnel: `FUNNEL_ETAPAS`, `ESTADOS_CALIENTES`, `ESTADOS_ACTIVOS`. (Hueco de dominio del owner.)
- `app/db/funnel.test.ts` — test de las constantes del funnel.
- `app/db/repository.contarPorEstado.test.ts` — test de `contarPorEstado`.
- `app/db/repository.resumenHome.test.ts` — test de `resumenHome`.
- `app/ui/shell/icons.tsx` — íconos SVG del nav (presentacional).
- `app/ui/shell/SidebarNav.tsx` — isla cliente, resalta el nav activo (`usePathname`).
- `app/ui/shell/Sidebar.tsx` — sidebar completo (workspace switcher, nav, conectores).
- `app/ui/shell/TopBar.tsx` — buscador placeholder, "En vivo", fecha, avatar.
- `app/ui/shell/AppShell.tsx` — arma sidebar + top bar + `<main>{children}</main>`; hace su propio fetch de datos del shell.
- `app/ui/home/StatCard.tsx` — tarjeta de métrica.
- `app/ui/home/PipelineBar.tsx` — barra segmentada por etapa.
- `app/ui/home/CampaignRow.tsx` — fila de campaña con progreso.

**Modificar:**
- `app/globals.css` — agregar tokens `@theme` (accent + shell) y el `@keyframes pulseLive`.
- `app/db/repository.ts` — agregar `contarPorEstado` y `resumenHome`.
- `app/page.tsx` — reescribir: envolver en `<AppShell>` y renderizar las secciones del home.

**No tocar:** el bloque de CSS viejo de `globals.css` (`.cad-*`, `.panel-*`, `.tap-*`, `.wrap`, etc.). `app/TopNav.tsx` se mantiene (lo usa `/cola`); el home deja de importarlo.

---

## Task 1: Tokens Tailwind del diseño (globals.css)

**Files:**
- Modify: `app/globals.css` (dentro del bloque `@theme { ... }` existente, y el `@keyframes` justo después)

- [ ] **Step 1: Agregar los tokens del diseño al `@theme` existente**

Abrir `app/globals.css`. Dentro del bloque `@theme { ... }` (arranca en la línea ~3), después de los `--color-*` actuales y ANTES del cierre `}`, agregar:

```css
  /* Rediseño home (2026-07-07): acento morado + superficies del shell. */
  --color-accent: #8b7cff;
  --color-accent-soft: #a99cff;
  --color-accent-bg: #1a1730;
  --color-accent-ink: #e7e3ff;
  --color-shell: #0b0c0f;
  --color-shell-2: #0f1014;
  --color-card: #111218;
  --color-card-hover: #16171e;
  --color-line-shell: #1b1d25;
  --color-line-card: #1f212b;
```

- [ ] **Step 2: Agregar el keyframe del punto "En vivo"**

Al final de `app/globals.css`, agregar (es el único CSS no-utility que necesita el rediseño; idioma Tailwind v4, se consume con `animate-[...]`):

```css
/* Punto "En vivo" pulsante del top bar (rediseño home). Se usa con
   animate-[pulseLive_2s_ease-in-out_infinite]. No es CSS viejo: es la capa de animación
   de Tailwind, declarada una vez. */
@keyframes pulseLive {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}
```

- [ ] **Step 3: Verificar que compila y los tokens resuelven**

Run: `npm run dev` y abrir http://localhost:3000 (o `npx @tailwindcss/cli -i app/globals.css -o /tmp/out.css 2>&1 | tail -5` si se prefiere sin server).
Expected: sin errores de compilación de Tailwind. (Aún no hay UI nueva que mirar; esto solo valida que el CSS es válido.)

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(home): tokens Tailwind del rediseño (accent morado + shell)"
```

---

## Task 2: Dominio del funnel (hueco del owner)

El pipeline por etapa, "deals calientes" y "cuentas activas" dependen de una decisión de
dominio: el orden real del funnel, qué etapas se muestran, y qué cuenta como activa. Este
archivo es la fuente de verdad. Trae un **default razonable** (inferido de la base real)
que hace correr la app y los tests; el owner revisa/ajusta orden, labels y definición de
"activa" en el checkpoint de esta tarea.

**Files:**
- Create: `app/db/funnel.ts`
- Test: `app/db/funnel.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/funnel.test.ts`:

```ts
// Pruebas de las constantes de dominio del funnel (rediseño home).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNNEL_ETAPAS, ESTADOS_CALIENTES, ESTADOS_ACTIVOS } from './funnel.ts';

test('FUNNEL_ETAPAS: cada etapa tiene estado, label y colorClass no vacíos', () => {
  assert.ok(FUNNEL_ETAPAS.length > 0, 'debe haber al menos una etapa');
  for (const e of FUNNEL_ETAPAS) {
    assert.ok(e.estado.length > 0, 'estado no vacío');
    assert.ok(e.label.length > 0, 'label no vacío');
    assert.ok(e.colorClass.length > 0, 'colorClass no vacío');
  }
});

test('FUNNEL_ETAPAS: los estados son únicos y ninguno es "sin estado"', () => {
  const estados = FUNNEL_ETAPAS.map((e) => e.estado);
  assert.equal(new Set(estados).size, estados.length, 'estados únicos');
  assert.ok(!estados.includes(''), 'no incluye estado vacío');
});

test('ESTADOS_CALIENTES: son las 4 salidas calientes conocidas', () => {
  assert.deepEqual(
    [...ESTADOS_CALIENTES].sort(),
    ['cierre_documentacion', 'enviar_contrato', 'oportunidad', 'reunion_agendada'],
  );
});

test('ESTADOS_ACTIVOS: no incluye on_hold ni el estado vacío', () => {
  assert.ok(!ESTADOS_ACTIVOS.includes('on_hold'));
  assert.ok(!ESTADOS_ACTIVOS.includes(''));
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npm test 2>&1 | grep -A3 funnel`
Expected: FAIL — `Cannot find module './funnel.ts'`.

- [ ] **Step 3: Escribir `app/db/funnel.ts` (default del owner)**

```ts
// Dominio del funnel comercial (rediseño home, 2026-07-07).
//
// HUECO DE DOMINIO DEL OWNER: el orden del funnel (early -> late), qué etapas se muestran
// en la barra de pipeline, sus labels y colores, y qué cuenta como "cuenta activa" es una
// decisión comercial de Sebastián. Este default sale de la base real (2026-07-07) pero se
// revisa en el checkpoint de esta tarea. Todo lo demás (queries, UI) consume estas
// constantes; el conocimiento vive en un solo lugar.
//
// Estados reales en la base y su volumen: lead 196, on_hold 126, firma_pago 98,
// contacto_iniciado 64, oportunidad 17, cierre_documentacion 13, reunion_agendada 5,
// enviar_contrato 3, (sin estado) 1437.

export type EtapaFunnel = {
  estado: string; // valor real de empresa.estado_notion
  label: string; // texto legible en la UI
  colorClass: string; // clase Tailwind del segmento (tono morado del claro al oscuro)
};

// Orden del funnel del más frío al más caliente. "on_hold" y "sin estado" quedan FUERA de
// la barra a propósito (on_hold está parqueado; sin estado son 1437 y se comerían la barra).
export const FUNNEL_ETAPAS: EtapaFunnel[] = [
  { estado: 'lead', label: 'Lead', colorClass: 'bg-[#2d2b52]' },
  { estado: 'contacto_iniciado', label: 'Contactado', colorClass: 'bg-[#3b3670]' },
  { estado: 'reunion_agendada', label: 'Reunión', colorClass: 'bg-[#4d4795]' },
  { estado: 'oportunidad', label: 'Oportunidad', colorClass: 'bg-[#635bbf]' },
  { estado: 'enviar_contrato', label: 'Contrato', colorClass: 'bg-[#7a70e0]' },
  { estado: 'cierre_documentacion', label: 'Cierre', colorClass: 'bg-[#8b7cff]' },
  { estado: 'firma_pago', label: 'Firma y pago', colorClass: 'bg-accent-soft' },
];

// "Deals calientes": misma definición que el PIPELINE_CALIENTE que vivía en page.tsx, ahora
// aquí para que resumenHome y la UI no la dupliquen.
export const ESTADOS_CALIENTES = [
  'reunion_agendada',
  'oportunidad',
  'cierre_documentacion',
  'enviar_contrato',
] as const;

// "Cuentas activas": las que están dentro del funnel definido (excluye on_hold y sin estado).
// Default: todas las etapas de FUNNEL_ETAPAS. El owner puede estrecharlo (ej. solo las
// calientes, o incluir on_hold) en el checkpoint.
export const ESTADOS_ACTIVOS: string[] = FUNNEL_ETAPAS.map((e) => e.estado);
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npm test 2>&1 | grep -A3 funnel`
Expected: PASS (4 tests de funnel).

- [ ] **Step 5: Commit**

```bash
git add app/db/funnel.ts app/db/funnel.test.ts
git commit -m "feat(home): dominio del funnel (FUNNEL_ETAPAS + estados calientes/activos)"
```

> **CHECKPOINT OWNER:** Sebastián revisa `FUNNEL_ETAPAS` (orden, labels, qué etapas entran) y la definición de `ESTADOS_ACTIVOS`. Ajustar aquí antes de seguir si el default no calza con la realidad comercial.

---

## Task 3: Query `contarPorEstado` (Repository)

**Files:**
- Modify: `app/db/repository.ts` (agregar función; ya importa `empresa`, `eq`, `sql`)
- Test: `app/db/repository.contarPorEstado.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/repository.contarPorEstado.test.ts`:

```ts
// Pruebas de Repository para contarPorEstado (rediseño home).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { contarPorEstado } = await import('./repository.ts');

const OWNER_A = 'Sebastian Acosta Molina';
const OWNER_B = 'Felipe Castro';

function seedEmpresa(id: string, owner: string, estadoNotion: string | null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?)`,
    )
    .run(id, owner, estadoNotion);
  raw.close();
}

test('contarPorEstado agrupa por estado_notion y excluye los null', () => {
  seedEmpresa('e1', OWNER_A, 'lead');
  seedEmpresa('e2', OWNER_A, 'lead');
  seedEmpresa('e3', OWNER_A, 'oportunidad');
  seedEmpresa('e4', OWNER_A, null); // sin estado: no aparece

  const r = contarPorEstado();

  assert.equal(r.lead, 2);
  assert.equal(r.oportunidad, 1);
  assert.equal(r['null'], undefined);
  assert.equal(Object.keys(r).length, 2);
});

test('contarPorEstado con owner filtra por ese owner', () => {
  seedEmpresa('e5', OWNER_B, 'lead');
  seedEmpresa('e6', OWNER_B, 'reunion_agendada');

  const soloB = contarPorEstado(OWNER_B);
  assert.equal(soloB.lead, 1);
  assert.equal(soloB.reunion_agendada, 1);

  // Sin owner cuenta A + B juntos: lead = 2 (A) + 1 (B) = 3.
  const todos = contarPorEstado();
  assert.equal(todos.lead, 3);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npm test 2>&1 | grep -A3 contarPorEstado`
Expected: FAIL — `contarPorEstado is not a function` / no export.

- [ ] **Step 3: Implementar `contarPorEstado` en `repository.ts`**

Agregar (por ejemplo justo después de `contadoresHoy`, ~línea 345):

```ts
// Cuenta de empresas por estado_notion (rediseño home). Solo lectura. Los null (empresas
// sin etapa en el funnel) NO se incluyen: no representan una etapa. Con owner filtra a ese
// owner; sin owner cuenta toda la base. Acceso solo por el Repository (regla de arquitectura).
export function contarPorEstado(owner?: string): Record<string, number> {
  const filas = db
    .select({ estado: empresa.estadoNotion, n: sql<number>`count(*)` })
    .from(empresa)
    .where(owner ? eq(empresa.owner, owner) : undefined)
    .groupBy(empresa.estadoNotion)
    .all();

  const out: Record<string, number> = {};
  for (const f of filas) {
    if (f.estado) out[f.estado] = Number(f.n);
  }
  return out;
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npm test 2>&1 | grep -A3 contarPorEstado`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.contarPorEstado.test.ts
git commit -m "feat(home): query contarPorEstado (pipeline por etapa)"
```

---

## Task 4: Query `resumenHome` (Repository)

Agrega las 4 métricas de las stat cards. Reusa `colaDelDia` (toques de hoy / vencidos) y
`contarPorEstado` + las constantes del funnel (deals calientes / cuentas activas). DRY: no
reimplementa la cola ni la lista de estados calientes.

**Files:**
- Modify: `app/db/repository.ts` (agregar función + import de `funnel.ts`)
- Test: `app/db/repository.resumenHome.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/repository.resumenHome.test.ts`:

```ts
// Pruebas de Repository para resumenHome (rediseño home).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { resumenHome } = await import('./repository.ts');

const HOY = '2026-07-07';
const OWNER = 'Sebastian Acosta Molina';

function seedEmpresa(
  id: string,
  estadoNotion: string | null,
  proximoFollowUp: string | null,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?, ?)`,
    )
    .run(id, OWNER, estadoNotion, proximoFollowUp);
  raw.close();
}

test('resumenHome cuenta toques de hoy, vencidos, deals calientes y cuentas activas', () => {
  // Cola: 1 para hoy, 1 vencido (ayer), 1 futuro (no entra a la cola).
  seedEmpresa('c1', 'lead', HOY);
  seedEmpresa('c2', 'lead', '2026-07-06');
  seedEmpresa('c3', 'lead', '2026-07-20');

  // Calientes (deals): reunion_agendada + oportunidad = 2. Activas: todo lo del funnel.
  seedEmpresa('h1', 'reunion_agendada', null);
  seedEmpresa('h2', 'oportunidad', null);
  // on_hold NO es activa; sin estado tampoco.
  seedEmpresa('p1', 'on_hold', null);
  seedEmpresa('p2', null, null);

  const r = resumenHome(OWNER, HOY);

  assert.equal(r.toquesHoy, 2); // c1 (hoy) + c2 (vencido) están en la cola de hoy
  assert.equal(r.vencidos, 1); // solo c2
  assert.equal(r.dealsCalientes, 2); // h1 + h2
  // Activas = estados del funnel: c1,c2,c3 (lead) + h1 + h2 = 5. on_hold y sin estado fuera.
  assert.equal(r.cuentasActivas, 5);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `npm test 2>&1 | grep -A3 resumenHome`
Expected: FAIL — `resumenHome is not a function`.

- [ ] **Step 3: Implementar `resumenHome` en `repository.ts`**

Agregar el import cerca de los otros imports de dominio (arriba del archivo, junto a donde se importa `./validation`):

```ts
import { ESTADOS_CALIENTES, ESTADOS_ACTIVOS } from './funnel';
```

Agregar la función (después de `contarPorEstado`):

```ts
// Resumen del home (rediseño): las 4 métricas de las stat cards. Reusa colaDelDia (cola de
// hoy = vencidos + para hoy) y contarPorEstado sobre toda la base para deals calientes y
// cuentas activas. Solo lectura.
export function resumenHome(owner: string, hoy: string) {
  const cola = colaDelDia(hoy, owner);
  const toquesHoy = cola.length;
  const vencidos = cola.filter((c) => (c.fecha ?? '') < hoy).length;

  const porEstado = contarPorEstado();
  const dealsCalientes = ESTADOS_CALIENTES.reduce((s, e) => s + (porEstado[e] ?? 0), 0);
  const cuentasActivas = ESTADOS_ACTIVOS.reduce((s, e) => s + (porEstado[e] ?? 0), 0);

  return { toquesHoy, vencidos, dealsCalientes, cuentasActivas };
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `npm test 2>&1 | grep -A3 resumenHome`
Expected: PASS (1 test). Correr `npm test` completo para confirmar que nada más se rompió.
Expected: todos verdes (240 previos + funnel + contarPorEstado + resumenHome).

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.resumenHome.test.ts
git commit -m "feat(home): query resumenHome (stat cards)"
```

---

## Task 5: Íconos del shell

SVGs del nav como componentes chicos. Presentacional, sin test.

**Files:**
- Create: `app/ui/shell/icons.tsx`

- [ ] **Step 1: Crear `app/ui/shell/icons.tsx`**

```tsx
// Íconos del sidebar (rediseño home). SVG stroke, heredan color por `currentColor`.
// Tamaño y color se controlan con clases Tailwind desde el consumidor.

type IconProps = { className?: string };

function base(className?: string) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: className ?? 'h-[17px] w-[17px]',
  };
}

export function IconInicio({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </svg>
  );
}

export function IconCampanas({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

export function IconToques({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
    </svg>
  );
}

export function IconPipeline({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </svg>
  );
}

export function IconConectores({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 7 6 10a4 4 0 0 0 5.7 5.7M15 17l3-3a4 4 0 0 0-5.7-5.7" />
      <path d="M9 15l6-6" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/ui/shell/icons.tsx
git commit -m "feat(home): iconos SVG del sidebar"
```

---

## Task 6: `SidebarNav` (isla cliente, estado activo)

**Files:**
- Create: `app/ui/shell/SidebarNav.tsx`

- [ ] **Step 1: Crear `app/ui/shell/SidebarNav.tsx`**

```tsx
'use client';

// Isla cliente del sidebar: la única parte que necesita saber la ruta activa. Recibe los
// ítems ya armados (con su badge calculado en el server) y resalta el activo con usePathname.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from '../cx';

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: string;
  badgeTone?: 'neutral' | 'done' | 'overdue';
};

const BADGE_TONE: Record<NonNullable<NavItem['badgeTone']>, string> = {
  neutral: 'bg-surface-2 text-muted',
  done: 'bg-done/10 text-done',
  overdue: 'bg-overdue/10 text-overdue',
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const activo = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              'relative flex items-center gap-[11px] rounded-[10px] px-[11px] py-[9px] text-[13.5px] transition-colors',
              activo
                ? 'bg-accent-bg font-semibold text-accent-ink'
                : 'text-[#9ca0ab] hover:bg-card-hover hover:text-ink',
            )}
          >
            {activo && (
              <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-[3px] bg-accent" />
            )}
            <span className={cx('shrink-0', activo ? 'text-accent-soft' : 'text-current')}>
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span
                className={cx(
                  'rounded-full px-2 py-px text-[11px] font-semibold',
                  BADGE_TONE[item.badgeTone ?? 'neutral'],
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verificar typecheck del módulo**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i sidebarnav || echo "sin errores en SidebarNav"`
Expected: "sin errores en SidebarNav".

- [ ] **Step 3: Commit**

```bash
git add app/ui/shell/SidebarNav.tsx
git commit -m "feat(home): SidebarNav (isla cliente, nav activo)"
```

---

## Task 7: `Sidebar`

**Files:**
- Create: `app/ui/shell/Sidebar.tsx`

- [ ] **Step 1: Crear `app/ui/shell/Sidebar.tsx`**

```tsx
// Sidebar del shell (server). Presentacional: recibe los datos ya resueltos (nav items,
// conectores, owner) desde AppShell. La única parte interactiva es <SidebarNav>.
import { SidebarNav, type NavItem } from './SidebarNav';

export type ConectorEstado = {
  nombre: string;
  detalle: string;
  tone: 'done' | 'overdue' | 'today';
};

const DOT_TONE: Record<ConectorEstado['tone'], string> = {
  done: 'bg-done shadow-[0_0_8px_rgba(87,201,138,0.6)]',
  overdue: 'bg-overdue shadow-[0_0_8px_rgba(244,121,107,0.6)]',
  today: 'bg-today shadow-[0_0_8px_rgba(242,183,56,0.6)]',
};

export function Sidebar({
  ownerNombre,
  items,
  conectores,
}: {
  ownerNombre: string;
  items: NavItem[];
  conectores: ConectorEstado[];
}) {
  return (
    <div className="flex w-[250px] flex-none flex-col border-r border-line-shell bg-shell-2 px-3 py-4">
      {/* Workspace switcher */}
      <div className="mb-[18px] flex cursor-pointer items-center gap-2.5 rounded-[11px] px-2.5 py-2 hover:bg-card-hover">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-gradient-to-br from-accent to-[#5d4bd6] text-[14px] font-extrabold text-white shadow-[0_2px_10px_rgba(139,124,255,0.4)]">
          O
        </span>
        <div className="flex-1 leading-[1.15]">
          <div className="text-[13.5px] font-semibold text-ink">OnePay</div>
          <div className="text-[11px] text-faint">{ownerNombre}</div>
        </div>
      </div>

      <div className="mb-2 px-2.5 text-[10.5px] uppercase tracking-[0.16em] text-faint">Módulos</div>

      <SidebarNav items={items} />

      {/* Conectores mini-panel */}
      <div className="mt-auto border-t border-line-shell px-2.5 pb-1 pt-3.5">
        <div className="mb-[11px] text-[10.5px] uppercase tracking-[0.16em] text-faint">Conectores</div>
        {conectores.map((c) => (
          <div key={c.nombre} className="mb-[9px] flex items-center gap-2.5">
            <span className={`h-[7px] w-[7px] rounded-full ${DOT_TONE[c.tone]}`} />
            <span className="flex-1 text-[12.5px] text-ink-soft">{c.nombre}</span>
            <span className="text-[11px] text-faint">{c.detalle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/ui/shell/Sidebar.tsx
git commit -m "feat(home): Sidebar (workspace, nav, conectores)"
```

---

## Task 8: `TopBar`

**Files:**
- Create: `app/ui/shell/TopBar.tsx`

- [ ] **Step 1: Crear `app/ui/shell/TopBar.tsx`**

```tsx
// Top bar del shell (server). Buscador es placeholder visual (no funcional en v1). La fecha
// se pasa ya formateada desde AppShell (server) para no meter una isla cliente de reloj.
export function TopBar({ fecha, iniciales }: { fecha: string; iniciales: string }) {
  return (
    <div className="relative z-10 flex flex-none items-center gap-4 border-b border-card-hover px-[30px] py-3.5">
      <div className="flex max-w-[420px] flex-1 items-center gap-2.5 rounded-[11px] border border-line-card bg-card px-[13px] py-[9px]">
        <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="#5c606c" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="flex-1 text-[13px] text-faint">Buscar cuentas, campañas, toques…</span>
        <span className="rounded-md border border-line-card bg-surface-2 px-[7px] py-0.5 text-[11px] font-semibold text-muted">
          ⌘K
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
        <span className="h-[7px] w-[7px] rounded-full bg-done animate-[pulseLive_2s_ease-in-out_infinite]" />
        En vivo
      </div>
      <span className="text-[12.5px] text-faint">{fecha}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line-card bg-gradient-to-br from-[#3a3f4c] to-[#22252f] text-[12px] font-bold text-ink-soft">
        {iniciales}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/ui/shell/TopBar.tsx
git commit -m "feat(home): TopBar (buscador placeholder, en vivo, fecha, avatar)"
```

---

## Task 9: `AppShell`

Arma el frame y hace su propio fetch de los datos del shell (badges, conectores, owner). Es
reusable: cualquier ruta futura lo envuelve. Es un server component `async`.

**Files:**
- Create: `app/ui/shell/AppShell.tsx`

- [ ] **Step 1: Crear `app/ui/shell/AppShell.tsx`**

```tsx
// Shell reusable del cockpit (rediseño home). Server component: hace su propio fetch de los
// datos del shell y renderiza sidebar + top bar + main. Cualquier ruta lo puede envolver.
import type { ReactNode } from 'react';
import { colaDelDia, listarCampanas, estadoConector, contarPorEstado } from '../../db/repository';
import { ESTADOS_ACTIVOS } from '../../db/funnel';
import { requireSession } from '../../lib/session';
import { Sidebar, type ConectorEstado } from './Sidebar';
import { TopBar } from './TopBar';
import type { NavItem } from './SidebarNav';
import { IconInicio, IconCampanas, IconToques, IconPipeline, IconConectores } from './icons';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dia = DIAS[d.getDay()];
  const cap = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${cap} ${d.getDate()} ${MESES[d.getMonth()]} · ${hh}:${mm}`;
}

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || 'SV';
}

export async function AppShell({ children }: { children: ReactNode }) {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);

  const toquesHoy = colaDelDia(hoy, owner).length;
  const campanasActivas = listarCampanas().filter((c) => c.estado === 'activa').length;
  const porEstado = contarPorEstado();
  const cuentasFunnel = ESTADOS_ACTIVOS.reduce((s, e) => s + (porEstado[e] ?? 0), 0);

  // Conectores: Granola y Notion tienen fila real; Claude es la API (siempre activa, key
  // server-side). Total conectados / esperados para el badge del nav.
  const granola = estadoConector('granola', usuario.id);
  const notion = estadoConector('notion');
  const conectadosReales = [granola, notion].filter((e) => e.tieneCredencial).length;

  const items: NavItem[] = [
    { href: '/', label: 'Inicio', icon: <IconInicio /> },
    { href: '/campanas', label: 'Campañas', icon: <IconCampanas />, badge: String(campanasActivas) },
    { href: '/cola', label: 'Toques', icon: <IconToques />, badge: String(toquesHoy), badgeTone: toquesHoy > 0 ? 'done' : 'neutral' },
    { href: '/panel', label: 'Pipeline', icon: <IconPipeline />, badge: String(cuentasFunnel) },
    { href: '/conectores', label: 'Conectores', icon: <IconConectores />, badge: `${conectadosReales + 1}/3`, badgeTone: conectadosReales < 2 ? 'overdue' : 'neutral' },
  ];

  const conectores: ConectorEstado[] = [
    { nombre: 'Granola', detalle: granola.tieneCredencial ? 'activo' : 'sin conectar', tone: granola.tieneCredencial ? 'done' : 'overdue' },
    { nombre: 'Claude', detalle: 'activo', tone: 'done' },
    { nombre: 'Notion', detalle: notion.tieneCredencial ? 'activo' : 'sin conectar', tone: notion.tieneCredencial ? 'done' : 'overdue' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-shell font-sans text-ink">
      <Sidebar ownerNombre={owner} items={items} conectores={conectores} />
      <div className="relative flex min-w-0 flex-1 flex-col bg-shell">
        {/* glow ambiental (arbitrary Tailwind, no CSS) */}
        <div className="pointer-events-none absolute -top-[140px] left-[40%] h-[340px] w-[520px] bg-[radial-gradient(closest-side,rgba(139,124,255,0.16),transparent)]" />
        <TopBar fecha={fechaCorta(ahora)} iniciales={iniciales(owner)} />
        <div className="relative z-[1] flex-1 overflow-auto px-[30px] pb-11 pt-[30px]">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE 'appshell|shell/' || echo "sin errores en shell"`
Expected: "sin errores en shell". Firmas confirmadas contra `repository.ts`: `estadoConector(proveedor, idUsuario?)` retorna `{ tieneCredencial, estado, ultimaCorrida, ultimoResultado }`; `listarCampanas()` retorna filas con `{ id, nombre, estado, inscritas, bloqueadas }`; `requireSession()` retorna `{ id, email, owner }`.

- [ ] **Step 3: Commit**

```bash
git add app/ui/shell/AppShell.tsx
git commit -m "feat(home): AppShell (frame reusable, fetch de datos del shell)"
```

---

## Task 10: Componentes del home (StatCard, PipelineBar, CampaignRow)

**Files:**
- Create: `app/ui/home/StatCard.tsx`
- Create: `app/ui/home/PipelineBar.tsx`
- Create: `app/ui/home/CampaignRow.tsx`

- [ ] **Step 1: Crear `app/ui/home/StatCard.tsx`**

```tsx
// Tarjeta de métrica del home. tone controla el color del número y del borde.
import { cx } from '../cx';

type Tone = 'neutral' | 'overdue' | 'accent' | 'done';

const NUM_TONE: Record<Tone, string> = {
  neutral: 'text-ink',
  overdue: 'text-overdue',
  accent: 'text-accent-soft',
  done: 'text-ink',
};

const BORDER_TONE: Record<Tone, string> = {
  neutral: 'border-line-card',
  overdue: 'border-[#2a1618]',
  accent: 'border-line-card',
  done: 'border-line-card',
};

export function StatCard({
  label,
  valor,
  sub,
  tone = 'neutral',
  subTone = 'faint',
}: {
  label: string;
  valor: number | string;
  sub: string;
  tone?: Tone;
  subTone?: 'faint' | 'done' | 'overdue';
}) {
  return (
    <div className={cx('rounded-[15px] border bg-card px-5 py-[18px]', BORDER_TONE[tone])}>
      <div className={cx('mb-3 text-[12px]', tone === 'overdue' ? 'text-overdue' : 'text-muted')}>{label}</div>
      <div className={cx('text-[38px] font-extrabold leading-none tracking-[-0.02em]', NUM_TONE[tone])}>{valor}</div>
      <div
        className={cx(
          'mt-2 text-[11.5px]',
          subTone === 'done' ? 'text-done' : subTone === 'overdue' ? 'text-[#8a5c5f]' : 'text-faint',
        )}
      >
        {sub}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `app/ui/home/PipelineBar.tsx`**

```tsx
// Barra segmentada del pipeline por etapa. Recibe el conteo por estado (de contarPorEstado)
// y arma solo las etapas de FUNNEL_ETAPAS (excluye sin estado y on_hold). El ancho de cada
// segmento es % del total mostrado, calculado en runtime -> único style inline permitido.
import Link from 'next/link';
import { FUNNEL_ETAPAS } from '../../db/funnel';
import { SectionLabel } from '../SectionLabel';

export function PipelineBar({ porEstado }: { porEstado: Record<string, number> }) {
  const segmentos = FUNNEL_ETAPAS.map((e) => ({ ...e, n: porEstado[e.estado] ?? 0 })).filter((s) => s.n > 0);
  const total = segmentos.reduce((s, x) => s + x.n, 0);

  return (
    <div className="mb-9">
      <div className="mb-3.5 flex items-center justify-between">
        <SectionLabel className="mb-0">Pipeline por etapa</SectionLabel>
        <Link href="/panel" className="text-[12.5px] font-semibold text-accent-soft">
          Ver módulo →
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-[13px] text-muted">Nada en el funnel todavía.</div>
      ) : (
        <>
          <div className="flex h-[46px] gap-[3px] overflow-hidden rounded-[12px]">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className={`flex flex-col items-center justify-center ${s.colorClass}`}
                style={{ width: `${(s.n / total) * 100}%` }}
              >
                <span className="text-[14px] font-extrabold text-white">{s.n}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-[3px]">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className="overflow-hidden text-ellipsis whitespace-nowrap px-0.5 text-center"
                style={{ width: `${(s.n / total) * 100}%` }}
              >
                <span className="text-[11px] text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Crear `app/ui/home/CampaignRow.tsx`**

```tsx
// Fila de campaña activa con barra de progreso. inscritas/objetivo -> ratio + %.
import { cx } from '../cx';

export type CampaignVM = {
  id: number;
  nombre: string;
  estado: string;
  inscritas: number;
  objetivo: number;
};

export function CampaignRow({ c, primero }: { c: CampaignVM; primero: boolean }) {
  const pct = c.objetivo > 0 ? Math.round((c.inscritas / c.objetivo) * 100) : 0;
  const activa = c.estado === 'activa';

  return (
    <div
      className={cx(
        'flex cursor-pointer items-center gap-4 px-5 py-[15px] hover:bg-card-hover',
        !primero && 'border-t border-line-card',
      )}
    >
      <span
        className={cx(
          'h-2 w-2 flex-none rounded-full',
          activa ? 'bg-done shadow-[0_0_8px_rgba(87,201,138,0.5)]' : 'bg-today shadow-[0_0_8px_rgba(242,183,56,0.5)]',
        )}
      />
      <span className="w-[190px] text-[14px] font-medium text-ink">{c.nombre}</span>
      <span
        className={cx(
          'rounded-full px-[9px] py-0.5 text-[11px] font-semibold',
          activa ? 'bg-done/10 text-done' : 'bg-today/10 text-today',
        )}
      >
        {activa ? 'Activa' : 'Pausada'}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface-2">
        <div className="h-full rounded bg-gradient-to-r from-[#6d5ce0] to-accent-soft" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-24 text-right text-[12.5px] text-muted">
        {c.inscritas}/{c.objetivo} · {pct}%
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/ui/home/StatCard.tsx app/ui/home/PipelineBar.tsx app/ui/home/CampaignRow.tsx
git commit -m "feat(home): componentes StatCard, PipelineBar, CampaignRow"
```

---

## Task 11: Reescribir `app/page.tsx`

**Files:**
- Modify: `app/page.tsx` (reemplazo completo)

- [ ] **Step 1: Reemplazar el contenido de `app/page.tsx`**

```tsx
import Link from 'next/link';
import { resumenHome, contarPorEstado, listarCampanas } from './db/repository';
import { requireSession } from './lib/session';
import { AppShell } from './ui/shell/AppShell';
import { SectionLabel } from './ui/SectionLabel';
import { StatCard } from './ui/home/StatCard';
import { PipelineBar } from './ui/home/PipelineBar';
import { CampaignRow, type CampaignVM } from './ui/home/CampaignRow';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function saludo(d: Date, nombre: string) {
  const primerNombre = nombre.trim().split(/\s+/)[0] || nombre;
  return `Buen ${DIAS[d.getDay()]}, ${primerNombre}`;
}

export default async function Dashboard() {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);

  const resumen = resumenHome(owner, hoy);
  const porEstado = contarPorEstado();
  const campanas: CampaignVM[] = listarCampanas()
    .filter((c) => c.estado === 'activa' || c.estado === 'pausada')
    .slice(0, 4)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      inscritas: c.inscritas ?? 0,
      objetivo: (c.inscritas ?? 0) + (c.bloqueadas ?? 0),
    }));

  return (
    <AppShell>
      <div className="mb-[26px]">
        <div className="text-[24px] font-bold tracking-[-0.01em] text-ink">{saludo(ahora, owner)}</div>
        <div className="mt-[3px] text-[13.5px] text-muted">Esto es lo que pide tu atención hoy.</div>
      </div>

      {/* Stats */}
      <div className="mb-[34px] grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <StatCard label="Toques para hoy" valor={resumen.toquesHoy} sub={`${resumen.toquesHoy} en cola`} />
        <StatCard
          label="Vencidos"
          valor={resumen.vencidos}
          sub={resumen.vencidos > 0 ? 'Requieren acción' : 'Al día'}
          tone="overdue"
          subTone="overdue"
        />
        <StatCard label="Deals calientes" valor={resumen.dealsCalientes} sub="Cerca del cierre" tone="accent" />
        <StatCard label="Cuentas activas" valor={resumen.cuentasActivas} sub="En el funnel" tone="neutral" />
      </div>

      {/* Pipeline */}
      <PipelineBar porEstado={porEstado} />

      {/* Campañas */}
      <div className="mb-1.5 flex items-center justify-between">
        <SectionLabel className="mb-0">Campañas activas</SectionLabel>
        <Link href="/campanas" className="text-[12.5px] font-semibold text-accent-soft">
          Abrir módulo →
        </Link>
      </div>
      <div className="overflow-hidden rounded-[15px] border border-line-card bg-card">
        {campanas.length === 0 ? (
          <div className="px-5 py-[15px] text-[13px] text-muted">Sin campañas todavía.</div>
        ) : (
          campanas.map((c, i) => <CampaignRow key={c.id} c={c} primero={i === 0} />)
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Verificar typecheck y tests**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE 'page.tsx|error' | head` y `npm test 2>&1 | tail -6`
Expected: sin errores nuevos de tipo en `page.tsx`; todos los tests verdes.

Nota (confirmado): `listarCampanas()` expone `inscritas` y `bloqueadas` (subconsultas count),
así que el `.map` es correcto tal cual. El objetivo del ratio es `inscritas / (inscritas +
bloqueadas)` a propósito (no hay un "objetivo" persistido en `campana`; el total de la campaña
es el universo inscrito + bloqueado). En la base real la tabla `campana` está vacía hoy, así
que el home mostrará el empty state "Sin campañas todavía" hasta que existan campañas.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): reescribir home con AppShell + secciones (datos reales)"
```

---

## Task 12: Verificación visual contra el mockup

**Files:** (ninguno; verificación en dev server)

- [ ] **Step 1: Levantar el dev server**

Run: `npm run dev` (o vía el tooling de preview). Abrir http://localhost:3000.
Expected: el home carga como cockpit oscuro de dos columnas, sin errores en consola.

- [ ] **Step 2: Checklist visual contra `~/Arc/Home Nav Lateral.html`**

Verificar:
- Sidebar: logo morado con gradiente, "OnePay" + nombre del owner, nav con "Inicio" activo (barrita morada + fondo `accent-bg`), badges reales en Campañas/Toques/Pipeline/Conectores.
- Mini-panel de Conectores abajo con puntos de color (Granola/Claude/Notion).
- Top bar: buscador con `⌘K`, punto "En vivo" pulsante, fecha, avatar con iniciales.
- Glow morado ambiental arriba del contenido.
- 4 stat cards con los números reales (Vencidos en rojo, Deals calientes en morado).
- Barra de pipeline segmentada por etapa (sin "sin estado"), con labels debajo.
- Lista de campañas con barras de progreso moradas.

- [ ] **Step 3: Verificar navegación activa**

Navegar a `/cola` y volver a `/`. Expected: el ítem activo del sidebar cambia correctamente (isla `SidebarNav` con `usePathname`).

- [ ] **Step 4: Ajustar y commitear cualquier corrección visual**

Si algo no calza con el mockup (espaciados, tonos, tamaños), ajustar las clases Tailwind
correspondientes y commitear:

```bash
git add -A
git commit -m "fix(home): ajustes visuales contra el mockup"
```

---

## Notas de cierre

- Al terminar, el home vive en el shell nuevo; `/cola` sigue con su `TopNav` viejo hasta que
  se rediseñe (adoptará `<AppShell>` entonces). Eso es esperado, no un bug.
- El `⌘K` es visual en v1 (fuera de alcance el command palette).
- Pendiente de decisión del owner (checkpoint Task 2): orden/labels de `FUNNEL_ETAPAS` y la
  definición de "cuenta activa".
- Migración a Tailwind del home: completa. No se agregó CSS al bloque viejo de `globals.css`.
