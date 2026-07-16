# Tracking antes del toque — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en cada fila de `/cola`, antes del toque, si el contacto abrió el correo anterior (cuántas veces y hace cuánto), si hizo clic y si vio el WhatsApp.

**Architecture:** El dato ya se captura en `evento_tracking` (pixel de correo + acuse de WhatsApp, ambos ya construidos en esta rama). Falta leerlo por empresa con conteo+hora, decidir la "temperatura" en un módulo core puro, y pintar un pill en la fila. Cero cambios de captura, cero migración.

**Tech Stack:** Next.js (server components), Drizzle sobre SQLite, `node --test`.

**Rama:** parte de `feat/modo-prueba-demo`. Todos los paths y números de línea de este plan son de esa rama, no de main.

---

## Contexto que el ejecutor necesita

**Ya existe y NO se toca:**
- `evento_tracking` (schema.ts:402): append-only, idempotente por `proveedor_evento_id`. Tipos: `enviado`/`abierto`/`clic`/`respondio`/`rebota`/`visto`. Cada fila trae `fechaEvento` (ISO) y `canal`.
- Captura de correo: `/api/track/open` y `/api/track/click` insertan `abierto`/`clic`.
- Captura de WhatsApp: `guardarVistoWhatsapp` (repository.ts:4256) inserta `visto`; webhook ya ruteado por `esLineaDePruebas`.
- `aperturasPorCampana` (repository.ts:4316): lectura POR CAMPAÑA, booleana. No sirve para la cola (que es por empresa y necesita conteo+hora), pero es el patrón de joins a copiar.

**La cadena de joins tracking→empresa** (idéntica en las 3 funciones existentes):
`evento_tracking.idPasoInscripcion` → `paso_inscripcion` → `destinatario` → `inscripcion.idEmpresa`.

**Cómo la cola cruza datos por empresa** (`app/cola/page.tsx:72`): construye un `Set`/`Map` con una función del repository y lo cruza contra cada fila por `id` de empresa. El pill de tracking sigue exactamente ese patrón (`respuestaPendiente` es el modelo).

**Cómo correr un test suelto** (desde la raíz del worktree):
```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/resumen-tracking.test.ts
```

---

## Task 1: Lectura por empresa (`resumenTrackingPorEmpresa`)

**Files:**
- Modify: `app/db/repository.ts` (agregar junto a `aperturasPorCampana`, ~línea 4338)
- Test: `app/db/repository.trackingEmpresa.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/repository.trackingEmpresa.test.ts`:

```ts
// resumenTrackingPorEmpresa: conteo de aperturas/clics + ultima hora + visto de WhatsApp,
// agregado por empresa, para el pill de /cola. Lee evento_tracking (ya poblado por el pixel
// y el acuse de WhatsApp) cruzando hasta inscripcion.id_empresa.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, guardarSegmento, crearCampana, inscribirCampana, resumenTrackingPorEmpresa } =
  await import('./repository.ts');

// Seed minimo: una empresa con email (inscripcion activa) y una cadencia de 1 paso de correo.
// Luego insertamos eventos de tracking a mano (el pixel/webhook ya probados aparte).
function seed() {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, ciudad_principal)
     VALUES ('e1', 'nit', 'Uno', 'uno', 'activo', 'on_hold', 'isp', 'Cali')`,
  ).run();
  raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
     VALUES ('e1', 'Ppal', 0, 1, 'p@x.com', 'seed')`,
  ).run();
  raw.close();
}
seed();

const idCadencia = crearCadencia({ nombre: 'C', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 's', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['Cali'] }] } }, 1);
const idCampana = crearCampana({ nombre: 'Camp', idCadencia, idSegmento }, 1);
inscribirCampana(idCampana, 1);

// idPasoInscripcion del unico envio de e1 (materializar no corrio; lo tomamos del destinatario).
function idPasoDeE1(): number {
  const raw = new Database(dbPath);
  // crea un paso_inscripcion 'enviada' para el destinatario de e1, para colgarle eventos.
  const dest = raw.prepare(
    `SELECT d.id_destinatario AS id FROM destinatario d
       JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion
      WHERE i.id_empresa = 'e1'`,
  ).get() as any;
  const paso = raw.prepare(`SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?`).get(idCadencia) as any;
  const r = raw.prepare(
    `INSERT INTO paso_inscripcion (id_destinatario, id_paso, canal, estado, created_at)
     VALUES (?, ?, 'correo', 'enviada', '2026-07-15T00:00:00.000Z')`,
  ).run(dest.id, paso.id_paso);
  raw.close();
  return Number(r.lastInsertRowid);
}

function insertarEvento(idPaso: number, tipo: string, fecha: string) {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento, created_at)
     VALUES (?, ?, 'correo', ?, ?, ?)`,
  ).run(idPaso, tipo, `${tipo}:${idPaso}:${fecha}`, fecha, fecha);
  raw.close();
}

test('cuenta aperturas y clics, y guarda la ultima apertura', () => {
  const idPaso = idPasoDeE1();
  insertarEvento(idPaso, 'abierto', '2026-07-15T10:00:00.000Z');
  insertarEvento(idPaso, 'abierto', '2026-07-15T14:00:00.000Z');
  insertarEvento(idPaso, 'clic', '2026-07-15T14:05:00.000Z');

  const mapa = resumenTrackingPorEmpresa(['e1']);
  const r = mapa.get('e1');
  assert.ok(r, 'e1 debe estar en el mapa');
  assert.equal(r.aperturas, 2);
  assert.equal(r.clics, 1);
  assert.equal(r.ultimaApertura, '2026-07-15T14:00:00.000Z');
  assert.equal(r.vioWhatsapp, false);
});

test('marca vioWhatsapp con un evento visto', () => {
  const idPaso = idPasoDeE1();
  insertarEvento(idPaso, 'visto', '2026-07-15T09:00:00.000Z');
  const r = resumenTrackingPorEmpresa(['e1']).get('e1');
  assert.equal(r?.vioWhatsapp, true);
});

test('una empresa sin eventos no aparece en el mapa', () => {
  assert.equal(resumenTrackingPorEmpresa(['e-inexistente']).has('e-inexistente'), false);
});

test('set vacio devuelve mapa vacio sin tocar la DB', () => {
  assert.equal(resumenTrackingPorEmpresa([]).size, 0);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.trackingEmpresa.test.ts
```
Expected: FAIL — `resumenTrackingPorEmpresa is not a function`.

- [ ] **Step 3: Implementar la función**

En `app/db/repository.ts`, justo después de `aperturasPorCampana` (termina ~línea 4338), agregar:

```ts
export type ResumenTrackingEmpresa = {
  aperturas: number;
  clics: number;
  ultimaApertura: string | null; // ISO del evento 'abierto' mas reciente
  vioWhatsapp: boolean;
};

// Tracking agregado POR EMPRESA para el pill de /cola: conteo de aperturas/clics, la hora de
// la ultima apertura y si vio el WhatsApp. Gemela de aperturasPorCampana (mismos joins), pero
// filtrada por empresa y con CONTEO en vez de booleanos -- la cola es por empresa y necesita
// "3x . hace 2h", no un si/no. Una query para toda la cola + cruce en TS (mismo criterio que
// aperturasPorCampana/actividadDeCampana: a la escala de una cola son decenas de filas).
export function resumenTrackingPorEmpresa(idsEmpresa: string[]): Map<string, ResumenTrackingEmpresa> {
  const resultado = new Map<string, ResumenTrackingEmpresa>();
  if (idsEmpresa.length === 0) return resultado;

  const filas = db
    .select({
      idEmpresa: inscripcion.idEmpresa,
      tipo: eventoTracking.tipo,
      fecha: eventoTracking.fechaEvento,
    })
    .from(eventoTracking)
    .innerJoin(pasoInscripcion, eq(pasoInscripcion.idPasoInscripcion, eventoTracking.idPasoInscripcion))
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .where(and(inArray(inscripcion.idEmpresa, idsEmpresa), inArray(eventoTracking.tipo, ['abierto', 'clic', 'visto'])))
    .all();

  for (const f of filas) {
    const prev = resultado.get(f.idEmpresa) ?? { aperturas: 0, clics: 0, ultimaApertura: null, vioWhatsapp: false };
    if (f.tipo === 'abierto') {
      prev.aperturas += 1;
      if (f.fecha && (prev.ultimaApertura === null || f.fecha > prev.ultimaApertura)) prev.ultimaApertura = f.fecha;
    } else if (f.tipo === 'clic') {
      prev.clics += 1;
    } else if (f.tipo === 'visto') {
      prev.vioWhatsapp = true;
    }
    resultado.set(f.idEmpresa, prev);
  }
  return resultado;
}
```

Nota: `eventoTracking`, `pasoInscripcion`, `destinatario`, `inscripcion`, `eq`, `and`, `inArray` ya están importados en repository.ts (los usan las funciones vecinas). No agregar imports.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run el mismo comando del Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.trackingEmpresa.test.ts
git commit -m "feat(tracking): lectura de aperturas/clics/visto por empresa para la cola"
```

---

## Task 2: Core `resumen-tracking.ts` (con el hueco de Sebastián)

**Files:**
- Create: `app/core/resumen-tracking.ts`
- Test: `app/core/resumen-tracking.test.ts`

**Nota de modo learning:** el módulo trae TODO el boilerplate resuelto (formateo "hace 2h", armado del texto). El único hueco es `temperaturaDe` — la regla de negocio. Ese hueco lo llena Sebastián. Por eso este task se ejecuta INLINE, no por subagente: un subagente rellenaría la decisión que es de él.

- [ ] **Step 1: Escribir el módulo con el hueco marcado**

Crear `app/core/resumen-tracking.ts`:

```ts
// Core puro (constitucion): del tracking crudo de una empresa arma lo que muestra el pill de
// /cola. No importa DB ni adaptadores; recibe `ahora` inyectado (patron de pollTracking) para
// ser determinista en test.
//
// Caveat de dominio: una apertura por pixel NO prueba que un humano leyo. Gmail carga
// imagenes por proxy y Apple Mail precarga -- veras "abierto" a los 2 segundos del envio sin
// que nadie lo mire. Por eso el conteo importa (1 apertura = ruido probable; 3 = interes real)
// y por eso la regla de temperatura es una DECISION, no una formula obvia.

export type SeñalTracking = {
  aperturas: number;
  clics: number;
  ultimaApertura: string | null; // ISO
  vioWhatsapp: boolean;
};

export type Temperatura = 'ninguna' | 'frio' | 'tibio' | 'caliente';

export type ResumenTracking = {
  texto: string;        // lo que se lee en el pill, p.ej. "Abrió 3× · hace 2h"
  title: string;        // tooltip
  temperatura: Temperatura; // decide el color del pill; 'ninguna' = no pintar pill
};

// Boilerplate (lo provee la IA): "hace cuanto" en granularidad gruesa, suficiente para un pill.
export function haceCuanto(iso: string, ahora: Date): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HUECO PARA SEBASTIÁN (modo learning). La regla de negocio: dada la señal, ¿qué
// tan "caliente" está este contacto antes de que lo llame?
//
// Contexto para decidir (5-10 líneas):
//  - clic > apertura: el proxy de Gmail no hace clic. Un clic es señal fuerte.
//  - vioWhatsapp: el check azul no lo infla ningún proxy. Señal fuerte también.
//  - aperturas: 1 sola apertura puede ser el proxy. Varias, repartidas, es interés real.
//  - 0 de todo: 'frio' (nunca abrió = casi seguro no lo vio, la señal más confiable).
//  - señal completamente vacía (sin correo enviado siquiera): 'ninguna' → no se pinta pill.
//
// Devuelve la Temperatura. El texto lo arma resumirTracking usando esto.
export function temperaturaDe(s: SeñalTracking, ahora: Date): Temperatura {
  throw new Error('sin implementar'); // ← Sebastián
}
// ─────────────────────────────────────────────────────────────────────────────

// Boilerplate (lo provee la IA): arma el texto del pill a partir de la señal + temperatura.
export function resumirTracking(s: SeñalTracking, ahora: Date): ResumenTracking {
  const temperatura = temperaturaDe(s, ahora);

  const partes: string[] = [];
  if (s.aperturas > 0) partes.push(s.aperturas === 1 ? 'Abrió' : `Abrió ${s.aperturas}×`);
  if (s.clics > 0) partes.push('hizo clic');
  if (s.vioWhatsapp) partes.push('vio WA');
  if (partes.length === 0) partes.push('Sin abrir');

  const cuando = s.ultimaApertura ? ` · ${haceCuanto(s.ultimaApertura, ahora)}` : '';
  const texto = `${partes.join(' · ')}${cuando}`;

  const title = s.aperturas === 0 && !s.vioWhatsapp
    ? 'No hay señal de que lo haya visto todavía'
    : `Aperturas: ${s.aperturas} · Clics: ${s.clics}${s.vioWhatsapp ? ' · Vio el WhatsApp' : ''}${s.ultimaApertura ? ` · Última: ${haceCuanto(s.ultimaApertura, ahora)}` : ''}`;

  return { texto, title, temperatura };
}
```

- [ ] **Step 2: Escribir el test (falla porque `temperaturaDe` tira)**

Crear `app/core/resumen-tracking.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { haceCuanto, resumirTracking, temperaturaDe, type SeñalTracking } from './resumen-tracking.ts';

const AHORA = new Date('2026-07-15T16:00:00.000Z');
const vacia: SeñalTracking = { aperturas: 0, clics: 0, ultimaApertura: null, vioWhatsapp: false };

// haceCuanto es boilerplate determinista: se prueba entero.
test('haceCuanto: minutos, horas, dias', () => {
  assert.equal(haceCuanto('2026-07-15T15:59:40.000Z', AHORA), 'recién');
  assert.equal(haceCuanto('2026-07-15T15:30:00.000Z', AHORA), 'hace 30m');
  assert.equal(haceCuanto('2026-07-15T14:00:00.000Z', AHORA), 'hace 2h');
  assert.equal(haceCuanto('2026-07-13T16:00:00.000Z', AHORA), 'hace 2d');
});

// resumirTracking arma el texto (boilerplate). No depende de la regla de temperatura para
// el texto, asi que se prueba stubeando temperaturaDe via una señal cualquiera.
test('resumirTracking: 3 aperturas + clic', () => {
  const s: SeñalTracking = { aperturas: 3, clics: 1, ultimaApertura: '2026-07-15T14:00:00.000Z', vioWhatsapp: false };
  const r = resumirTracking(s, AHORA);
  assert.equal(r.texto, 'Abrió 3× · hizo clic · hace 2h');
});

test('resumirTracking: sin nada abre "Sin abrir"', () => {
  assert.equal(resumirTracking(vacia, AHORA).texto, 'Sin abrir');
});

// ── La regla de Sebastián. Estos asserts los AJUSTA Sebastián a SU regla cuando la escriba.
// El plan los deja como esqueleto: al implementar temperaturaDe, adaptar los esperados.
test('temperaturaDe: la regla de negocio (ajustar a la de Sebastián)', () => {
  assert.equal(temperaturaDe(vacia, AHORA), 'frio');
  assert.equal(temperaturaDe({ aperturas: 1, clics: 0, ultimaApertura: '2026-07-15T15:59:00.000Z', vioWhatsapp: false }, AHORA), 'tibio');
  assert.equal(temperaturaDe({ aperturas: 0, clics: 1, ultimaApertura: null, vioWhatsapp: false }, AHORA), 'caliente');
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/resumen-tracking.test.ts
```
Expected: los tests de `haceCuanto` y `resumirTracking` PASAN; los de `temperaturaDe` FALLAN con "sin implementar".

- [ ] **Step 4: CHECKPOINT — Sebastián escribe `temperaturaDe`**

PARAR. Este es el hueco de modo learning. Sebastián reemplaza el cuerpo de `temperaturaDe` (las ~5-10 líneas) con su regla, y ajusta los 3 esperados del último test para que reflejen su decisión. No lo rellena la IA.

- [ ] **Step 5: Correr el test completo y verificar que pasa**

Run el mismo comando del Step 3. Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add app/core/resumen-tracking.ts app/core/resumen-tracking.test.ts
git commit -m "feat(tracking): resumen-tracking core (regla de temperatura + pill)"
```

---

## Task 3: Cablear el pill en la cola

**Files:**
- Modify: `app/cola/agenda.ts` (agregar campo `tracking?` a `FilaUnificada`, ~línea 154)
- Modify: `app/cola/page.tsx` (llenar el campo cruzando por empresa, ~línea 72-96)
- Modify: `app/cola/ColaUnificada.tsx` (pintar el pill, ~línea 88)

- [ ] **Step 1: Agregar el campo al tipo `FilaUnificada`**

En `app/cola/agenda.ts`, importar el tipo del resumen arriba del archivo:

```ts
import type { ResumenTracking } from '../core/resumen-tracking.ts';
```

Y agregar el campo opcional a `FilaUnificada` (línea 154):

```ts
export type FilaUnificada = FilaAgenda & {
  bucket: Bucket;
  campana: string | null;
  frescura: Frescura;
  origen?: "cadencia";
  tracking?: ResumenTracking; // pill de "abrió/vio/clic"; ausente = no hubo envío que trackear
};
```

`filaUnificada` (línea 161) reensambla desde `FilaColaConBucket`. Propagá el campo: en `FilaColaConBucket` (línea 152) agregá `tracking?` también, y en `filaUnificada` sumá `tracking: c.tracking` al objeto devuelto:

```ts
export type FilaColaConBucket = FilaCola & { bucket: Bucket; origen?: "cadencia"; tracking?: ResumenTracking };
```
```ts
function filaUnificada(c: FilaColaConBucket, hoy: string, actual: boolean): FilaUnificada {
  const base = c.bucket === "cierre" ? filaSinVencimiento(c) : filaConVencimiento(c, hoy, actual);
  return { ...base, bucket: c.bucket, campana: c.campana ?? null, frescura: frescuraDe(c.fecha, hoy), origen: c.origen, tracking: c.tracking };
}
```

- [ ] **Step 2: Llenar el campo en `page.tsx`**

En `app/cola/page.tsx`, agregar el import a la lista del repository (línea 1-11):

```ts
  resumenTrackingPorEmpresa,
```
Y el import del core, junto a los otros de `./agenda.ts` no — va aparte:
```ts
import { resumirTracking } from "../core/resumen-tracking.ts";
```

`filasParaUnificar` (línea 74) ya trae las 4 fuentes cruzadas por empresa. En vez de tocar sus 4 ramas, adjuntá el tracking en una pasada extra justo antes de `unificarCola`, y reemplazá la línea 98.

Reemplazar la línea 98 (`const filasUnificadas = splitActivo ? unificarCola(filasParaUnificar, hoy) : [];`) por:

```ts
  // Tracking por empresa para el pill "abrió/vio/clic" (2026-07-15). Un solo query para toda
  // la cola; el core (resumirTracking) decide texto y temperatura. El reloj de demo (hoyDemo)
  // NO aplica: la hora de "hace 2h" es tiempo real de reloj, no la fecha de negocio, por eso
  // ahora = new Date() y no hoyDemo().
  const trackingPorEmpresa = resumenTrackingPorEmpresa(filasParaUnificar.map((f) => f.id));
  const ahora = new Date();
  const filasConTracking: FilaColaConBucket[] = filasParaUnificar.map((f) => {
    const s = trackingPorEmpresa.get(f.id);
    return s ? { ...f, tracking: resumirTracking(s, ahora) } : f;
  });

  const filasUnificadas = splitActivo ? unificarCola(filasConTracking, hoy) : [];
```

`resumenTrackingPorEmpresa([])` devuelve un Map vacío, así que fuera del split (donde `filasParaUnificar` es `[]`) no toca la DB.

- [ ] **Step 3: Pintar el pill en `ColaUnificada.tsx`**

En `app/cola/ColaUnificada.tsx`, después del bloque de `fila.respuestaPendiente` (termina línea 95), agregar:

```tsx
                      {fila.tracking && fila.tracking.temperatura !== 'ninguna' && (
                        <span
                          className={cn(
                            'shrink-0 rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            fila.tracking.temperatura === 'caliente' && 'border-done/40 bg-done-bg text-done',
                            fila.tracking.temperatura === 'tibio' && 'border-accent-soft bg-surface-2 text-acento',
                            fila.tracking.temperatura === 'frio' && 'border-line-card bg-surface-2 text-faint',
                          )}
                          title={fila.tracking.title}
                        >
                          {fila.tracking.texto}
                        </span>
                      )}
```

`cn` ya está importado en el archivo. Las clases de color (`done`/`acento`/`faint`) son tokens del tema ya usados en las pills vecinas.

- [ ] **Step 4: Verificar tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Verificar en el navegador (Sebastián)**

Levantar la demo (build+start, NO dev — ver `project_demo_modo_prueba_estado`) y abrir `/cola` en modo split. Confirmar que una empresa con aperturas muestra el pill "Abrió N× · hace Xh" con el color de su temperatura, y una sin envío no muestra pill. (Sebastián corre los previews, la IA no.)

- [ ] **Step 6: Commit**

```bash
git add app/cola/agenda.ts app/cola/page.tsx app/cola/ColaUnificada.tsx
git commit -m "feat(cola): pill de tracking (abrió/vio/clic) antes del toque"
```

---

## Notas de cierre

- **Solo `ColaUnificada` (cola de Sebastián en split).** `AgendaHoy` (los demás owners) queda sin pill a propósito: el pedido es de Sebastián para su cola. Extenderlo a `AgendaHoy` es el mismo patrón si algún día se quiere.
- **El reloj de demo NO aplica al "hace 2h".** La fecha de negocio (`hoyDemo`) mueve la cadencia; la hora de la última apertura es tiempo real de reloj. Por eso `page.tsx` usa `new Date()`, no `hoyDemo()`, para `ahora`.
- **No pushear.** La rama no se mergea a main hasta que se revisen los 19 commits de la demo (push a main despliega al VPS).
