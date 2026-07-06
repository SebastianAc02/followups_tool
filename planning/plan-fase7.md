# Fase 7 · Panel de actividad (admin) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una ruta `/panel` visible solo para admin que muestra el pulso de actividad del equipo (toques ayer, promedio diario, leads tocados, campañas y cadencias corriendo) leyendo datos que ya existen, sin escribir nada.

**Architecture:** La lógica de negocio de la ventana del promedio vive en un módulo core PURO (`app/core/actividad.ts`), testeable sin DB, igual que `motor-fechas.ts`. Las agregaciones son funciones de solo lectura en el Repository (único acceso a datos). La página es un Server Component gateado por `admin` que compone core + repo y pinta números ya calculados. Nace de `fase4-cadencias` (ya tiene las tablas de cadencia); corre en paralelo a Fase 5 sin tocar sus archivos.

**Tech Stack:** Next 16 (Server Components), Drizzle sobre better-sqlite3, `node --test` con `--experimental-strip-types`, Better Auth (gate ya construido en Fase 2).

**Contexto de lectura previa:** `planning/spec-fase7-panel.md` (este plan lo implementa), `CLAUDE.md` (constitución), `app/db/repository.ts` (patrón de `contadoresHoy`, líneas 285-294), `app/core/motor-fechas.ts` (patrón de módulo core puro de fechas), `app/page.tsx` (patrón de gate `requireSession()`). Routing del orquestador: `api-patterns` + `database` en las queries; `taste-skill` + `impeccable` + `frontend-design` en la UI (V7.2); `qa-test-planner` antes de las pruebas; `/code-review` cierra la fase.

**Modo learning (CLAUDE.md):** la Tarea 1 toca dominio (la regla de la ventana). Ya fue ejecutada (V7.1a commiteada: `ventanaPromedio` implementada por Sebastián con constraint de tiempo explícito, excepción registrada). El resto (queries mecánicas, UI) va directo.

---

## Decisiones ya cerradas (del spec, no re-litigar)

- **Norte = throughput, no pérdida.** Toques ayer + promedio diario.
- **Promedio:** ventana de los últimos 7 días hábiles anteriores a hoy; denominador fijo 7; toques de fin de semana dentro del rango de calendario SUMAN al numerador (bonus), nunca diluyen. Definición completa en el spec.
- **El panel es agregado (todo el equipo), sin filtro por owner.** F2 es "ver desde arriba".
- **Se difiere de este pase el desglose por persona.** Motivo real: `toque` no tiene owner directo (se filtraría por `empresa.owner`, que el 89% de empresas no tiene). Sin un owner a nivel de toque, "por persona" sería degenerado. Se anota, no se construye.
- **Envío/tracking (Fase 5) e IA (Fase 6) quedan fuera.** Sin placeholders.

## Wrinkle de datos que el plan ya contempla (no es bug, es realidad de la base)

`toque.fecha` es datetime ISO en los toques que crea la app (Fase 1+), pero los 181 toques históricos sembrados desde Notion tienen `fecha` en formato "June 25, 2026". El repo ya resuelve esto comparando solo la parte de fecha con `substr(fecha, 1, 10)` (ver `contadoresHoy`). Consecuencia buscada: las filas históricas con formato "June 25, 2026" no matchean una ventana `YYYY-MM-DD` y quedan fuera de forma natural. Es correcto para el panel: mide actividad de la era-herramienta, no el histórico de Notion. La Tarea 2 incluye una prueba que fija este comportamiento a propósito.

---

## Estructura de archivos

- **Create** `app/core/actividad.ts` — módulo PURO: `esDiaHabil`, `restarUnDia`, `ventanaPromedio`, `promedioDiario`, constante `DIAS_HABILES`. Sin imports de DB ni de nada externo. **YA HECHO (Tarea 1, commit V7.1a).**
- **Create** `app/core/actividad.test.ts` — pruebas puras del módulo. **YA HECHO.**
- **Modify** `app/db/repository.ts` — agregar las funciones de lectura del panel al final (sección "Fase 7 (V7.1)").
- **Create** `app/db/panel.test.ts` — pruebas de las queries contra una DB temporal sembrada.
- **Create** `app/panel/page.tsx` — la ruta, gateada por admin, compone core + repo y pinta.
- **Modify** `planning/planeacion-ejecucion.md`, `planning/CONTINUAR-IMPLEMENTACION.md`, `planning/tasks-v2.md` — cierre de fase (Tarea 4).

---

## Tarea 1: Módulo core puro de la ventana de actividad — YA COMPLETADA

Commit `e1d3c0a` en la rama `fase7-panel`: `app/core/actividad.ts` + `app/core/actividad.test.ts`, 6/6 tests pasando. No repetir este trabajo.

---

## Tarea 2: Queries de lectura del panel en el Repository

**Files:**
- Modify: `app/db/repository.ts` (agregar sección al final)
- Test: `app/db/panel.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan (incluye el harness de DB temporal)**

Es el primer test que siembra una DB propia (no hay `app/db/*.test.ts` todavía). El harness crea un sqlite temporal, apunta `ISPS_DB_PATH` a él ANTES de importar el repo, crea solo las tablas que las queries tocan y siembra filas de resultado conocido.

```ts
// app/db/panel.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 1) DB temporal ANTES de importar el repo (el singleton lee ISPS_DB_PATH al importar).
const tmp = join(mkdtempSync(join(tmpdir(), 'panel-')), 'test.db');
process.env.ISPS_DB_PATH = tmp;

const raw = new Database(tmp);
raw.exec(`
  CREATE TABLE toque (
    id_toque INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empresa TEXT NOT NULL,
    canal TEXT, resultado TEXT, fecha TEXT, fuente TEXT NOT NULL DEFAULT 'test'
  );
  CREATE TABLE cadencia (id_cadencia INTEGER PRIMARY KEY, nombre TEXT NOT NULL, activa INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE campana (id_campana INTEGER PRIMARY KEY, nombre TEXT NOT NULL, id_cadencia INTEGER NOT NULL, id_segmento INTEGER NOT NULL DEFAULT 1, estado TEXT NOT NULL DEFAULT 'borrador');
  CREATE TABLE inscripcion (id_inscripcion INTEGER PRIMARY KEY, id_campana INTEGER NOT NULL, id_empresa TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'activa');
`);
// Ventana de prueba: usaremos hoy='2026-01-15' -> rango [2026-01-06, 2026-01-14].
// Sembramos toques ISO dentro del rango, uno en fin de semana (2026-01-10 sabado),
// uno historico con formato Notion ("June 25, 2026") que NO debe contar, y uno fuera.
raw.exec(`
  INSERT INTO toque (id_empresa, canal, resultado, fecha) VALUES
    ('e1','llamada','contesto_reunion','2026-01-06T09:00:00.000Z'),
    ('e1','llamada','no_contesto','2026-01-07T09:00:00.000Z'),
    ('e2','whatsapp','contesto_no','2026-01-08T09:00:00.000Z'),
    ('e2','correo','contesto_sigue_seguimiento','2026-01-10T11:00:00.000Z'),
    ('e3','llamada','contesto_reunion','2026-01-14T16:00:00.000Z'),
    ('e3','llamada','no_contesto','June 25, 2026'),
    ('e4','llamada','no_contesto','2026-01-20T09:00:00.000Z');
  INSERT INTO cadencia (id_cadencia, nombre) VALUES (1,'Outbound T1'), (2,'On-hold');
  INSERT INTO campana (id_campana, nombre, id_cadencia, estado) VALUES (10,'T1 Q1',1,'borrador'), (20,'Reactivacion',2,'borrador');
  INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES
    (10,'e1','activa'), (10,'e2','activa'), (10,'e3','bloqueada'),
    (20,'e4','activa'), (20,'e5','finalizada');
`);
raw.close();

const repo = await import('./repository.ts');

test('contarToquesEnRango cuenta ISO en rango, incluye fin de semana, excluye historico y fuera', () => {
  // En [2026-01-06, 2026-01-14]: e1x2, e2x2 (uno sabado), e3x1 = 5. El "June 25, 2026"
  // no matchea el rango YYYY-MM-DD y queda fuera; el 2026-01-20 esta fuera del rango.
  assert.equal(repo.contarToquesEnRango('2026-01-06', '2026-01-14'), 5);
});

test('contarToquesEnDia cuenta solo ayer', () => {
  // ayer de hoy=2026-01-15 es 2026-01-14: solo e3 -> 1.
  assert.equal(repo.contarToquesEnDia('2026-01-15'), 1);
});

test('leadsTocadosEnRango cuenta empresas distintas', () => {
  // En el rango tocamos e1, e2, e3 -> 3 empresas distintas.
  assert.equal(repo.leadsTocadosEnRango('2026-01-06', '2026-01-14'), 3);
});

test('toquesPorCanal agrupa por canal dentro del rango', () => {
  const m = repo.toquesPorCanal('2026-01-06', '2026-01-14');
  assert.equal(m.llamada, 3);
  assert.equal(m.whatsapp, 1);
  assert.equal(m.correo, 1);
});

test('toquesPorResultado agrupa por resultado dentro del rango', () => {
  const m = repo.toquesPorResultado('2026-01-06', '2026-01-14');
  assert.equal(m.contesto_reunion, 2);
  assert.equal(m.contesto_sigue_seguimiento, 1);
  assert.equal(m.contesto_no, 1);
  assert.equal(m.no_contesto, 1);
});

test('campanasActivas cuenta campanas con al menos una inscripcion activa', () => {
  // campana 10 (e1,e2 activas) y 20 (e4 activa) -> 2.
  assert.equal(repo.campanasActivas(), 2);
});

test('inscripcionesActivas cuenta solo estado activa', () => {
  // activas: e1,e2 (camp10), e4 (camp20) = 3. bloqueada y finalizada no cuentan.
  assert.equal(repo.inscripcionesActivas(), 3);
});

test('empresasPorCadencia agrupa inscripciones activas por nombre de cadencia', () => {
  const filas = repo.empresasPorCadencia();
  const porNombre = Object.fromEntries(filas.map((f) => [f.cadencia, f.empresas]));
  assert.equal(porNombre['Outbound T1'], 2); // e1, e2 (e3 bloqueada no cuenta)
  assert.equal(porNombre['On-hold'], 1);      // e4 (e5 finalizada no cuenta)
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL (las funciones `contarToquesEnRango`, etc. no existen).

- [ ] **Step 3: Implementar las queries en el Repository**

Agregar al final de `app/db/repository.ts`. Reutiliza el patrón `substr(fecha,1,10)` de `contadoresHoy` (líneas 285-294). Ninguna filtra por owner: el panel es agregado.

```ts
// ---------------------------------------------------------------------------
// Fase 7 (V7.1): agregaciones de SOLO LECTURA para el panel de actividad.
// Ninguna escribe ni filtra por owner (el panel ve a todo el equipo). La regla
// de la ventana del promedio vive en app/core/actividad.ts, no aqui ni en la UI.
// `toque.fecha` puede ser ISO (app) o legado formato Notion ("June 25, 2026"); se
// compara solo substr(fecha,1,10), asi el legado no-ISO cae fuera de las ventanas.
import { restarUnDia } from '../core/actividad';

const enRango = (desde: string, hasta: string): SQL =>
  sql`substr(${toque.fecha}, 1, 10) >= ${desde} AND substr(${toque.fecha}, 1, 10) <= ${hasta}`;

export function contarToquesEnRango(desde: string, hasta: string): number {
  const r = db.select({ n: sql<number>`count(*)` }).from(toque).where(enRango(desde, hasta)).get();
  return r?.n ?? 0;
}

export function contarToquesEnDia(hoy: string): number {
  const ayer = restarUnDia(hoy);
  return contarToquesEnRango(ayer, ayer);
}

export function leadsTocadosEnRango(desde: string, hasta: string): number {
  const r = db.select({ n: sql<number>`count(distinct ${toque.idEmpresa})` }).from(toque).where(enRango(desde, hasta)).get();
  return r?.n ?? 0;
}

export function toquesPorCanal(desde: string, hasta: string): Record<Canal, number> {
  const filas = db.select({ canal: toque.canal, n: sql<number>`count(*)` }).from(toque)
    .where(enRango(desde, hasta)).groupBy(toque.canal).all();
  const out = Object.fromEntries(CANALES.map((c) => [c, 0])) as Record<Canal, number>;
  for (const f of filas) if (f.canal && f.canal in out) out[f.canal as Canal] = f.n;
  return out;
}

export function toquesPorResultado(desde: string, hasta: string): Record<Resultado, number> {
  const filas = db.select({ resultado: toque.resultado, n: sql<number>`count(*)` }).from(toque)
    .where(enRango(desde, hasta)).groupBy(toque.resultado).all();
  const out = Object.fromEntries(RESULTADOS.map((r) => [r, 0])) as Record<Resultado, number>;
  for (const f of filas) if (f.resultado && f.resultado in out) out[f.resultado as Resultado] = f.n;
  return out;
}

export function campanasActivas(): number {
  const r = db.select({ n: sql<number>`count(distinct ${inscripcion.idCampana})` })
    .from(inscripcion).where(eq(inscripcion.estado, 'activa')).get();
  return r?.n ?? 0;
}

export function inscripcionesActivas(): number {
  const r = db.select({ n: sql<number>`count(*)` }).from(inscripcion).where(eq(inscripcion.estado, 'activa')).get();
  return r?.n ?? 0;
}

export function empresasPorCadencia(): { cadencia: string; empresas: number }[] {
  return db.select({ cadencia: cadencia.nombre, empresas: sql<number>`count(distinct ${inscripcion.idEmpresa})` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(cadencia, eq(cadencia.idCadencia, campana.idCadencia))
    .where(eq(inscripcion.estado, 'activa'))
    .groupBy(cadencia.nombre)
    .all();
}
```

Nota: si `SQL` o `gte`/`sql` no están ya importados con ese nombre en el head del archivo, ajustar el import de la línea 1 (`sql`, `SQL`, `eq` ya están; `type SQL` ya viene de drizzle-orm en el import actual).

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS (todas las de `panel.test.ts`) y el resto de la suite sigue verde.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/panel.test.ts
git commit -m "V7.1b: queries de solo lectura del panel (toques, leads, canal, resultado, cadencias)"
```

---

## Tarea 3: La ruta `/panel` (gate admin + UI)

**Files:**
- Create: `app/panel/page.tsx`

Antes de escribir la UI, invocar `taste-skill` + `impeccable` + `frontend-design` (regla del orquestador para paneles nuevos). Lo de abajo fija el gate y el cableado de datos; el diseño visual se refina con esas skills.

- [ ] **Step 1: Gate de admin + composición de datos + render**

```tsx
// app/panel/page.tsx
import { redirect } from 'next/navigation';
import { requireSession } from '../lib/session';
import { ventanaPromedio, promedioDiario } from '../core/actividad';
import {
  contarToquesEnDia, contarToquesEnRango, leadsTocadosEnRango,
  toquesPorCanal, toquesPorResultado,
  campanasActivas, inscripcionesActivas, empresasPorCadencia,
} from '../db/repository';
import { CANALES, RESULTADOS, RESULTADO_LABELS } from '../db/validation';

export default async function Panel() {
  const usuario = await requireSession();
  if (!usuario.admin) redirect('/'); // sin flag admin, la ruta no existe para el usuario

  const hoy = new Date().toISOString().slice(0, 10);
  const { desde, hasta } = ventanaPromedio(hoy);

  const toquesAyer = contarToquesEnDia(hoy);
  const promedio = promedioDiario(contarToquesEnRango(desde, hasta));
  const leads = leadsTocadosEnRango(desde, hasta);
  const porCanal = toquesPorCanal(desde, hasta);
  const porResultado = toquesPorResultado(desde, hasta);
  const campanas = campanasActivas();
  const inscripciones = inscripcionesActivas();
  const cadencias = empresasPorCadencia();

  const fmt = (n: number) => n.toFixed(1);

  return (
    <main>
      <h1>Pulso de la semana</h1>

      <section aria-label="norte">
        <div>
          <span>Toques ayer</span>
          <strong>{toquesAyer}</strong>
        </div>
        <div>
          <span>Promedio diario (7 días hábiles)</span>
          <strong>{fmt(promedio)}</strong>
        </div>
      </section>

      <section aria-label="actividad">
        <div><span>Leads tocados</span><strong>{leads}</strong></div>
        <div>
          <span>Por canal</span>
          <ul>{CANALES.map((c) => <li key={c}>{c}: {porCanal[c]}</li>)}</ul>
        </div>
        <div>
          <span>Por resultado</span>
          <ul>{RESULTADOS.map((r) => <li key={r}>{RESULTADO_LABELS[r]}: {porResultado[r]}</li>)}</ul>
        </div>
      </section>

      <section aria-label="cadencias">
        <div><span>Campañas activas</span><strong>{campanas}</strong></div>
        <div><span>Inscripciones corriendo</span><strong>{inscripciones}</strong></div>
        <div>
          <span>Empresas por cadencia</span>
          <ul>{cadencias.map((c) => <li key={c.cadencia}>{c.cadencia}: {c.empresas}</li>)}</ul>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verificar el gate y el render en el navegador (preview)**

Levantar el dev server y verificar: entrando como Sebastián (admin=1) `/panel` renderiza los números; un usuario sin admin es redirigido a `/`. Confirmar que la ventana del promedio muestra un número coherente con los toques reales de la semana. (Usar los `preview_*`: snapshot para estructura, screenshot como prueba visual.)

- [ ] **Step 3: Commit**

```bash
git add app/panel/page.tsx
git commit -m "V7.2: ruta /panel gateada por admin, pulso de actividad del equipo"
```

---

## Tarea 4: Cierre de Fase 7 (y del alcance v2)

**Files:**
- Modify: `planning/planeacion-ejecucion.md` (marcar Fase 7, bitácora), `planning/CONTINUAR-IMPLEMENTACION.md` (estado + próxima acción), `planning/tasks-v2.md` (marcar V7.1-V7.3)

- [ ] **Step 1: Suite completa verde + tsc limpio**

Run: `npm test` y `npx tsc --noEmit`
Expected: toda la suite pasa; sin errores de tipos.

- [ ] **Step 2: `/code-review` como gate de cierre (patrón de las fases anteriores)**

Correr `/code-review`, resolver o descartar con razón cada hallazgo, commit de los fixes.

- [ ] **Step 3: Demo de cierre**

Entro como admin y veo el pulso: toques de ayer contra mi promedio, leads tocados, por canal y resultado, y las campañas/cadencias corriendo. Sin el flag admin, `/panel` redirige.

- [ ] **Step 4: Bitácora + marcar la fase + commit + merge**

Actualizar los tres docs de `planning/`, marcar Fase 7 y V7.1-V7.3 como cerradas, anotar que cierra el alcance v2.

```bash
git add planning/
git commit -m "Cierre de Fase 7: panel de actividad admin. Cierra alcance v2"
```

Luego el merge a `main` según el patrón del proyecto (ff-only desde la rama de la fase), cuando Fase 4 ya esté en main o coordinando el orden de merges.

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura del spec:** norte (T1 promedio + T2 contarToquesEnDia), actividad/leads/canal/resultado (T2), cadencias/campañas (T2), gate admin + UI (T3), solo-lee (ninguna función escribe), pruebas sembradas (T2), paralelismo (rama desde fase4), cierre (T4). El desglose por persona queda documentado como diferido con su razón. Cubierto.
- **Placeholders:** ninguno pendiente (el único que existía, el cuerpo de `ventanaPromedio`, ya se resolvió en la Tarea 1).
- **Consistencia de tipos:** `ventanaPromedio` devuelve `{desde, hasta}` y así lo consumen T2 y T3; `Record<Canal,number>` / `Record<Resultado,number>` consistentes con `CANALES`/`RESULTADOS` de validation.ts; `empresasPorCadencia` devuelve `{cadencia, empresas}[]` y así lo lee T3.
