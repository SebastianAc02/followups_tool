# Dashboard como pantalla principal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/` en un dashboard de resumen del día y mover la cola de toques actual a `/cola`, sin tocar el core ni la DB.

**Architecture:** Server components de solo lectura. El nuevo `/` compone datos que ya expone el Repository (`colaDelDia`, `contadoresHoy`, `listarCadencias`, `estadoConector`) — ningún query nuevo. La cola actual se mueve intacta a `/cola` con sus forms y su soporte `?owner=`. Un `TopNav` compartido reemplaza la línea de meta apretada de hoy.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript, Drizzle sobre SQLite. Sin dependencias nuevas.

**Nota de testing:** El repo NO tiene tests de páginas (`.test.tsx` no existe) y esta tarea no toca `app/core/` ni el Repository. La verificación es: `npm test` (la suite existente sigue verde), `npm run build` (compila) y un recorrido manual en el navegador. No se introduce un framework de test de páginas solo para esto.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `app/cola/page.tsx` | Crear | La cola de toques (movida desde `app/page.tsx`). |
| `app/TopNav.tsx` | Crear | Barra superior compartida: marca (link a `/`) + Salir. |
| `app/page.tsx` | Reescribir | El dashboard nuevo. |
| `app/globals.css` | Modificar | Clases del dashboard y del TopNav. |
| `app/cadencias/page.tsx` | Modificar | Back-link "← Cola" → "← Inicio". |
| `app/conectores/page.tsx` | Modificar | Back-link "← Cola" → "← Inicio". |
| `app/toque-independiente/page.tsx` | Modificar | Back-link "← Cola" → "← Inicio". |
| `app/llamada/[id]/page.tsx` | Modificar | Back-link `href="/"` → `href="/cola"` (2 ocurrencias). |

---

## Task 1: Mover la cola a `/cola`

Copia exacta del `app/page.tsx` actual a `app/cola/page.tsx`, ajustando los imports relativos (un nivel más profundo), el nombre del export y los hrefs del owner switch para que apunten a `/cola?owner=`. En este task `/` sigue mostrando la cola vieja; los dos conviven un momento. Todavía NO usamos TopNav (eso es Task 3).

**Files:**
- Create: `app/cola/page.tsx`

- [ ] **Step 1: Crear `app/cola/page.tsx`**

```tsx
import Link from "next/link";
import { colaDelDia, contadoresHoy } from "../db/repository";
import { repartirAction, registrarTapAction } from "../actions";
import { RESULTADO_LABELS, CANALES, RESULTADOS } from "../db/validation";
import { requireSession } from "../lib/session";
import SignOutButton from "../SignOutButton";

const OWNERS = [
  { key: "Sebastian Acosta Molina", label: "Sebastián" },
  { key: "Felipe Castro", label: "Felipe" },
  { key: "Thomas Schumacher", label: "Thomas" },
];

const ACCION: Record<string, string> = { llamada: "Llamar", whatsapp: "WhatsApp", correo: "Correo" };
const CANAL_LABEL: Record<string, string> = { llamada: "llamadas", whatsapp: "whatsapp", correo: "correos" };
const CANALES_ORDEN = CANALES;
const RESULTADOS_ORDEN = RESULTADOS;

const ESTADO_PILL: Record<string, { l: string; c: string }> = {
  reunion_agendada: { l: "reunión", c: "hot" },
  oportunidad: { l: "oportunidad", c: "hot" },
  cierre_documentacion: { l: "cierre", c: "hot" },
  enviar_contrato: { l: "contrato", c: "hot" },
  contacto_iniciado: { l: "contactado", c: "warm" },
  lead: { l: "lead", c: "warm" },
  on_hold: { l: "on hold", c: "cold" },
};

function diasVencido(fechaISO: string, hoyISO: string) {
  return Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / 86400000);
}

export default async function Cola({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const usuario = await requireSession();
  const sp = await searchParams;
  // Pipeline compartido (B3 v1): cualquier autenticado puede MIRAR la cola de otro por
  // ?owner=, pero el default es el owner de la sesion.
  const owner = sp.owner ?? usuario.owner;
  const esPropia = owner === usuario.owner;
  const hoy = new Date().toISOString().slice(0, 10);
  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const contadores = contadoresHoy(hoy, owner);

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <div className="h-title">Toques del día</div>
          <div className="switch">
            {OWNERS.map((o) => (
              <Link key={o.key} href={`/cola?owner=${encodeURIComponent(o.key)}`} className={o.key === owner ? "on" : ""}>
                {o.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="h-meta">
          <span className="mono">{cola.length}</span> hoy · <span className="mono">{vencidos}</span> vencidos
          {" · "}
          <SignOutButton email={usuario.email} />
        </div>
      </div>

      {contadores.total > 0 && (
        <div className="counters">
          <div className="counters-row">
            {CANALES_ORDEN.map((canal) => (
              <span key={canal}>
                <span className="mono">{contadores.porCanal[canal]}</span> {CANAL_LABEL[canal]}
              </span>
            ))}
          </div>
          <div className="counters-row">
            {RESULTADOS_ORDEN.map((resultado) => (
              <span key={resultado}>
                <span className="mono">{contadores.porResultado[resultado]}</span> {RESULTADO_LABELS[resultado].toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {esPropia && (
        <form action={repartirAction} className="repartir">
          <span className="rep-label">¿Atrasado? Reparte tus follow-ups</span>
          <input name="porDia" type="number" min={1} defaultValue={10} className="pordia mono" aria-label="follow-ups por día" />
          <span className="rep-unit">por día</span>
          <button className="rep-btn">Repartir</button>
        </form>
      )}

      {cola.length === 0 ? (
        <div className="empty">Sin follow-ups para hoy. Buen trabajo.</div>
      ) : (
        cola.map((c) => {
          const dias = diasVencido(c.fecha!, hoy);
          const sev = dias > 0 ? "overdue" : "today";
          const accion = ACCION[c.canal ?? "llamada"] ?? "Llamar";
          return (
            <div className="row-wrap" key={c.id}>
              <Link className="row" href={`/llamada/${c.id}`}>
                <div>
                  <div className="l1">
                    <span className={`dot ${sev}`} aria-hidden="true" />
                    <span className="emp">{c.empresa}</span>
                    {c.estado && ESTADO_PILL[c.estado] && (
                      <span className={`pill ${ESTADO_PILL[c.estado].c}`}>{ESTADO_PILL[c.estado].l}</span>
                    )}
                    {c.contacto && (
                      <span className="contact">
                        {c.contacto}
                        {c.cargo ? ` · ${c.cargo}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="l2">
                    <span>usuarios <b className="mono">{c.usuarios != null ? Math.round(c.usuarios) : "—"}</b></span>
                    <span>CRM <b>{c.crm ?? "—"}</b></span>
                    <span>pasarela <b>{c.pasarela ?? "—"}</b></span>
                  </div>
                  {c.proximoPaso && <div className="paso">{c.proximoPaso}</div>}
                </div>
                <div className="right">
                  <div className={`when ${sev}`}>{dias > 0 ? `vencido ${dias}d` : "hoy"}</div>
                  <div className="call-cta">{accion} →</div>
                </div>
              </Link>
              <form className="tap-row" action={registrarTapAction}>
                <input type="hidden" name="idEmpresa" value={c.id} />
                <input name="objecion" placeholder="Objeción (opcional)" className="tap-objecion" />
                <button type="submit" name="canal" value="whatsapp" className="tap-btn">WhatsApp</button>
                <button type="submit" name="canal" value="correo" className="tap-btn">Correo</button>
              </form>
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Compilar**

Run: `npm run build`
Expected: compila sin errores de TypeScript. Aparece `/cola` en la lista de rutas.

- [ ] **Step 3: Commit**

```bash
git add app/cola/page.tsx
git commit -m "Dashboard: mover la cola de toques a /cola (copia intacta)"
```

---

## Task 2: Arreglar los back-links de las páginas hijas

Cuatro páginas apuntan hoy a `/` con el texto "← Cola". Al dejar `/` de ser la cola:
- `cadencias`, `conectores`, `toque-independiente` → vuelven al dashboard: texto "← Inicio", `href` sigue en `/`.
- `llamada/[id]` → vuelve a la cola: `href="/"` pasa a `href="/cola"`, el texto "← Cola" se queda.

**Files:**
- Modify: `app/cadencias/page.tsx:28`
- Modify: `app/conectores/page.tsx:43`
- Modify: `app/toque-independiente/page.tsx:17`
- Modify: `app/llamada/[id]/page.tsx:36` y `app/llamada/[id]/page.tsx:46`

- [ ] **Step 1: `app/cadencias/page.tsx`** — cambiar el texto del back-link

De:
```tsx
      <Link href="/" className="back">
        ← Cola
      </Link>
```
A:
```tsx
      <Link href="/" className="back">
        ← Inicio
      </Link>
```

- [ ] **Step 2: `app/conectores/page.tsx`** — cambiar el texto del back-link

De:
```tsx
      <Link href="/" className="back">
        ← Cola
      </Link>
```
A:
```tsx
      <Link href="/" className="back">
        ← Inicio
      </Link>
```

- [ ] **Step 3: `app/toque-independiente/page.tsx`** — cambiar el texto del back-link

En la línea 17, el `<Link href="/" className="back">` cambia su texto de "← Cola" a "← Inicio". (Abrir el archivo para ver el texto exacto del hijo del Link y reemplazar solo "Cola" por "Inicio".)

- [ ] **Step 4: `app/llamada/[id]/page.tsx`** — cambiar el destino, no el texto (2 ocurrencias)

Las dos líneas:
```tsx
      <Link href="/" className="back">← Cola</Link>
```
pasan a:
```tsx
      <Link href="/cola" className="back">← Cola</Link>
```

- [ ] **Step 5: Compilar**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/cadencias/page.tsx app/conectores/page.tsx app/toque-independiente/page.tsx app/llamada/[id]/page.tsx
git commit -m "Dashboard: reapuntar back-links (hijas→Inicio, llamada→/cola)"
```

---

## Task 3: Crear el `TopNav` compartido

Barra superior mínima: marca a la izquierda (link a `/`) y "Salir" a la derecha. La usan el dashboard y `/cola`. En `/cola` reemplaza la fila de links de sección que hoy vive en `.h-meta`.

**Files:**
- Create: `app/TopNav.tsx`
- Modify: `app/cola/page.tsx`

- [ ] **Step 1: Crear `app/TopNav.tsx`**

```tsx
import Link from "next/link";
import SignOutButton from "./SignOutButton";

// Barra superior compartida por el dashboard (/) y la cola (/cola). La marca vuelve
// siempre al dashboard; Salir cierra sesion. Los links de seccion (Cadencias,
// Conectores, Agregar toque) NO viven aqui: son tarjetas del dashboard.
export default function TopNav({ email }: { email: string }) {
  return (
    <div className="topnav">
      <Link href="/" className="topnav-brand">Follow-ups OnePay</Link>
      <SignOutButton email={email} />
    </div>
  );
}
```

- [ ] **Step 2: Usar `TopNav` en `app/cola/page.tsx`**

Quitar el import de `SignOutButton` y agregar el de `TopNav`:
```tsx
import { requireSession } from "../lib/session";
import TopNav from "../TopNav";
```
(La línea `import SignOutButton from "../SignOutButton";` se elimina.)

Reemplazar el bloque `<div className="head">…</div>` completo por:
```tsx
      <TopNav email={usuario.email} />
      <div className="head">
        <div>
          <div className="h-title">Toques del día</div>
          <div className="switch">
            {OWNERS.map((o) => (
              <Link key={o.key} href={`/cola?owner=${encodeURIComponent(o.key)}`} className={o.key === owner ? "on" : ""}>
                {o.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="h-meta">
          <span className="mono">{cola.length}</span> hoy · <span className="mono">{vencidos}</span> vencidos
        </div>
      </div>
```

- [ ] **Step 3: Compilar**

Run: `npm run build`
Expected: compila. `/cola` ya no importa `SignOutButton` directamente.

- [ ] **Step 4: Commit**

```bash
git add app/TopNav.tsx app/cola/page.tsx
git commit -m "Dashboard: TopNav compartido; la cola suelta los links de seccion"
```

---

## Task 4: Reescribir `app/page.tsx` como dashboard

El nuevo `/`. Solo lectura, sin forms, sin `?owner=`: siempre la sesión. Compone datos ya existentes.

**Files:**
- Modify: `app/page.tsx` (reescritura completa)

- [ ] **Step 1: Reemplazar TODO el contenido de `app/page.tsx`**

```tsx
import Link from "next/link";
import { colaDelDia, contadoresHoy, listarCadencias, estadoConector } from "./db/repository";
import { CANALES } from "./db/validation";
import { requireSession } from "./lib/session";
import TopNav from "./TopNav";

const CANAL_LABEL: Record<string, string> = { llamada: "llamadas", whatsapp: "whatsapp", correo: "correos" };

// Estados "calientes" del pipeline. Mismas claves que ESTADO_PILL en /cola; se cuentan
// en memoria sobre la cola del dia, sin query nueva.
const PIPELINE_CALIENTE: { estado: string; label: string }[] = [
  { estado: "reunion_agendada", label: "reuniones" },
  { estado: "oportunidad", label: "oportunidades" },
  { estado: "cierre_documentacion", label: "cierres" },
  { estado: "enviar_contrato", label: "contratos" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function fechaLarga(d: Date) {
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default async function Dashboard() {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);
  const ayerDate = new Date(ahora);
  ayerDate.setDate(ayerDate.getDate() - 1);
  const ayer = ayerDate.toISOString().slice(0, 10);

  const cola = colaDelDia(hoy, owner);
  const vencidos = cola.filter((c) => (c.fecha ?? "") < hoy).length;
  const hechoHoy = contadoresHoy(hoy, owner);
  const hechoAyer = contadoresHoy(ayer, owner);

  const pipeline = PIPELINE_CALIENTE.map((p) => ({
    ...p,
    n: cola.filter((c) => c.estado === p.estado).length,
  })).filter((p) => p.n > 0);

  const cadenciasActivas = listarCadencias().filter((c) => c.activa).length;
  const conectados = [estadoConector("granola", usuario.id), estadoConector("notion")].filter(
    (e) => e.tieneCredencial,
  ).length;

  return (
    <div className="wrap">
      <TopNav email={usuario.email} />

      <div className="dash-date">{fechaLarga(ahora)}</div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-num mono">{cola.length}</div>
          <div className="kpi-label">hoy</div>
        </div>
        <div className="kpi">
          <div className="kpi-num mono">{vencidos}</div>
          <div className="kpi-label">vencidos</div>
        </div>
        <div className="kpi">
          <div className="kpi-num mono">{hechoAyer.total}</div>
          <div className="kpi-label">ayer</div>
        </div>
      </div>

      {cola.length > 0 ? (
        <Link href="/cola" className="cta-primary">
          Entrar a los toques ({cola.length} hoy) →
        </Link>
      ) : (
        <div className="cta-empty">Sin follow-ups para hoy. Buen trabajo.</div>
      )}

      <div className="dash-cols">
        <div className="dash-col">
          <div className="section-label">Hoy hiciste</div>
          {hechoHoy.total === 0 ? (
            <div className="dash-muted">Nada todavía.</div>
          ) : (
            CANALES.map((canal) => (
              <div key={canal} className="dash-line">
                <span className="mono">{hechoHoy.porCanal[canal]}</span> {CANAL_LABEL[canal]}
              </div>
            ))
          )}
        </div>
        <div className="dash-col">
          <div className="section-label">Pipeline en cola</div>
          {pipeline.length === 0 ? (
            <div className="dash-muted">Nada caliente en cola.</div>
          ) : (
            pipeline.map((p) => (
              <div key={p.estado} className="dash-line">
                <span className="mono">{p.n}</span> {p.label}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="nav-cards">
        <Link href="/toque-independiente" className="nav-card">
          <span className="nav-card-title">Agregar toque</span>
          <span className="nav-card-meta">manual</span>
        </Link>
        <Link href="/cadencias" className="nav-card">
          <span className="nav-card-title">Cadencias</span>
          <span className="nav-card-meta mono">{cadenciasActivas} activas</span>
        </Link>
        <Link href="/conectores" className="nav-card">
          <span className="nav-card-title">Conectores</span>
          <span className="nav-card-meta mono">{conectados} conectados</span>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Compilar**

Run: `npm run build`
Expected: compila. `/` queda como el dashboard.

- [ ] **Step 3: Commit** (el estilo llega en Task 5; el dashboard ya funciona sin estilo)

```bash
git add app/page.tsx
git commit -m "Dashboard: reemplazar / con el panel de resumen del dia"
```

---

## Task 5: Estilos del dashboard y del TopNav

Añadir las clases nuevas a `app/globals.css`, reutilizando los tokens de color que ya existen (`--surface`, `--line`, `--muted`, `--ink`, `--white`). Se agregan AL FINAL del archivo.

**Files:**
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Agregar al final de `app/globals.css`**

```css
/* --- Dashboard (/) y TopNav --- */
.topnav {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 18px; margin-bottom: 20px; border-bottom: 1px solid var(--line);
}
.topnav-brand {
  font-family: var(--font-serif), Georgia, serif; font-size: 18px; font-weight: 500;
  color: var(--ink); text-decoration: none; letter-spacing: -0.01em;
}
.topnav-brand:hover { color: var(--white); }

.dash-date { font-size: 14px; color: var(--muted); margin-bottom: 22px; text-transform: capitalize; }

.kpi-row { display: flex; gap: 12px; margin-bottom: 24px; }
.kpi {
  flex: 1; background: var(--surface); border: 1px solid var(--line);
  border-radius: 14px; padding: 20px 18px; text-align: center;
}
.kpi-num { font-size: 34px; font-weight: 500; color: var(--ink); line-height: 1; }
.kpi-label { font-size: 12.5px; color: var(--muted); margin-top: 8px; }

.cta-primary {
  display: block; text-align: center; text-decoration: none;
  background: var(--white); color: #0a0a0b; font-size: 15px; font-weight: 500;
  border-radius: 999px; padding: 15px 20px; margin-bottom: 26px; transition: opacity .14s;
}
.cta-primary:hover { opacity: .88; }
.cta-empty {
  text-align: center; color: var(--muted); font-size: 14px;
  border: 1px dashed var(--line-strong); border-radius: 14px; padding: 22px; margin-bottom: 26px;
}

.dash-cols { display: flex; gap: 12px; margin-bottom: 26px; }
.dash-col {
  flex: 1; background: var(--surface); border: 1px solid var(--line);
  border-radius: 14px; padding: 16px 18px;
}
.dash-line { font-size: 13.5px; color: var(--ink-soft); padding: 3px 0; }
.dash-line .mono { color: var(--ink); }
.dash-muted { font-size: 13px; color: var(--muted); padding: 3px 0; }

.nav-cards { display: flex; gap: 12px; }
.nav-card {
  flex: 1; display: flex; flex-direction: column; gap: 4px; text-decoration: none;
  background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
  padding: 16px 18px; transition: background .14s, border-color .14s;
}
.nav-card:hover { background: var(--surface-2); border-color: var(--muted); }
.nav-card-title { font-size: 14px; color: var(--ink); }
.nav-card-meta { font-size: 12.5px; color: var(--muted); }

@media (max-width: 560px) {
  .kpi-row, .dash-cols, .nav-cards { flex-direction: column; }
}
```

- [ ] **Step 2: Compilar**

Run: `npm run build`
Expected: compila.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "Dashboard: estilos (KPIs, CTA, columnas, tarjetas de navegacion)"
```

---

## Task 6: Verificación final

- [ ] **Step 1: Suite existente sigue verde**

Run: `npm test`
Expected: todos los tests pasan (no tocamos core ni DB, deben seguir igual).

- [ ] **Step 2: Build limpio**

Run: `npm run build`
Expected: compila sin errores ni warnings de tipos.

- [ ] **Step 3: Recorrido manual en el navegador**

Con una sesión ya iniciada (Sebastián), levantar el dev server (`preview_start` con `npm run dev`) y verificar:
- `/` muestra el dashboard: fecha, 3 KPIs, CTA "Entrar a los toques (N hoy)", columnas "Hoy hiciste" / "Pipeline en cola", tres tarjetas.
- Clic en el CTA → `/cola` con la cola completa (forms de repartir y tap presentes).
- El owner switch en `/cola` cambia entre Sebastián/Felipe/Thomas sin salir de `/cola`.
- Clic en una fila → `/llamada/[id]`; el back-link "← Cola" vuelve a `/cola`.
- Desde el dashboard, tarjeta "Cadencias" → `/cadencias`; back-link "← Inicio" vuelve a `/`.
- Igual para "Conectores" y "Agregar toque".
- Cola vacía (owner sin follow-ups): el dashboard muestra "Sin follow-ups para hoy" en vez del CTA.

- [ ] **Step 4: Commit final (si hubo ajustes de la verificación)**

```bash
git add -A
git commit -m "Dashboard: ajustes de verificacion"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** rutas (`/` dashboard, `/cola`) → Tasks 1 y 4. KPIs hoy/vencidos/ayer → Task 4. Desglose "Hoy hiciste" + "Pipeline en cola" → Task 4. Tarjetas de navegación → Task 4. TopNav → Task 3. Sin `?owner=` en dashboard → Task 4 (no recibe searchParams). Casos borde (cola vacía, ayer=0, cadencias/conectores en cero) → cubiertos en el JSX de Task 4. Owner/signup fuera de alcance → respetado (no hay task de auth).
- **Ripple no previsto en el spec pero necesario:** back-links de 4 páginas (Task 2) y hrefs del owner switch (`/cola?owner=`, Task 1). Añadidos como tasks explícitos.
- **Consistencia de nombres:** `colaDelDia`, `contadoresHoy`, `listarCadencias`, `estadoConector`, `CANALES` — todos verificados contra `app/db/repository.ts` y `app/db/validation.ts`. `estadoConector(proveedor, idUsuario?)` y `.tieneCredencial` verificados contra `app/conectores/page.tsx`. `listarCadencias().activa` verificado contra el Repository.
- **Sin placeholders:** cada step trae el código o comando completo.
