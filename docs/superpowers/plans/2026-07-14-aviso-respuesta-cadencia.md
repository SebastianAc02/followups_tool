# Aviso de respuesta en cadencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nota de contexto del proyecto (CLAUDE.md):** las Tareas 3 y 4 tocan `app/core/` (dominio). Si se ejecutan en sesión inline con Sebastián, aplica el checkpoint de modo learning (explicar el porqué con bloques `★ Insight` antes de escribir, dejar 5-10 líneas para que él las escriba, cerrar con que él explique el concepto de vuelta). El resto de tareas son wiring/UI mecánico y no lo necesitan.

**Goal:** Cuando un contacto responde por cualquier canal (Apollo/correo o WhatsApp), destacar la fila de esa empresa en `/cola` y `/seguimiento` hasta que Sebastián abra su ficha — sin tocar el corte de cadencia que ya existe hoy.

**Architecture:** Tabla nueva `notificacion_respuesta` (append-only, una fila por respuesta). Un único punto de notificación inyectado en los dos cores que ya pausan por respuesta (`app/core/tracking.ts`, `app/core/llego-respuesta.ts`). Una query de lectura (`empresasConRespuestaPendiente`) alimenta un badge en `/cola` y una franja nueva "Respondieron" en `/seguimiento`, separada de los grupos por etapa (que ya excluyen inscripciones pausadas). Marcar como vista ocurre al abrir la ficha de la empresa en cualquiera de las dos pantallas.

**Tech Stack:** Next.js App Router (server components + server actions), Drizzle ORM sobre SQLite (better-sqlite3), `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-14-aviso-respuesta-cadencia-design.md`

---

### Task 1: Tabla `notificacion_respuesta` (schema + migración + fixture de pruebas)

**Files:**
- Modify: `app/db/schema.ts` (agregar tabla, después de `eventoTracking`, línea ~13)
- Modify: `app/db/test-helpers.ts` (agregar `CREATE TABLE` en `crearDbPrueba`, después del bloque de `evento_tracking`, línea ~262)
- Create (generado por drizzle-kit): `drizzle/0001_*.sql`

- [ ] **Step 1: Agregar la tabla al schema de Drizzle**

En `app/db/schema.ts`, justo después del cierre de `export const eventoTracking = sqliteTable(...)` (línea 13):

```ts
// notificacion_respuesta (append-only, V6.1): una fila por CADA respuesta detectada,
// sin importar el canal (correo via Apollo tracking, whatsapp via webhook Evolution).
// vistaEn null = todavia no se abrio la ficha de esa empresa desde que llego. Alimenta
// el destaque "Respondio" de /cola y /seguimiento -- ver core/tracking.ts y
// core/llego-respuesta.ts (el unico punto de notificacion, en los dos lugares donde
// ya se pausa la inscripcion por respuesta).
export const notificacionRespuesta = sqliteTable('notificacion_respuesta', {
  idNotificacion: integer('id_notificacion').primaryKey({ autoIncrement: true }),
  idInscripcion: integer('id_inscripcion').notNull(),
  idEmpresa: text('id_empresa').notNull(),
  canal: text('canal').notNull(),
  detectadaEn: text('detectada_en').notNull(),
  vistaEn: text('vista_en'),
  createdAt: text('created_at'),
});
```

- [ ] **Step 2: Generar la migración**

Run: `npx drizzle-kit generate`
Expected: crea `drizzle/0001_<nombre-random>.sql` con `CREATE TABLE notificacion_respuesta (...)` y actualiza `drizzle/meta/_journal.json`. Revisa el SQL generado — debe tener las 6 columnas de arriba, sin índices extra.

- [ ] **Step 3: Aplicar la migración contra el isps.db real**

Run: `npm run migrate`
Expected: `Migraciones al dia contra /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db` sin errores. Es un `CREATE TABLE` puro, aditivo — no toca ninguna fila existente.

- [ ] **Step 4: Agregar la misma tabla al fixture de pruebas**

En `app/db/test-helpers.ts`, dentro de `crearDbPrueba()`, justo después del bloque `CREATE INDEX ix_evento_tracking_fecha_evento ... ON evento_tracking(fecha_evento);` (línea ~262):

```sql

    CREATE TABLE notificacion_respuesta (
      id_notificacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_inscripcion INTEGER NOT NULL,
      id_empresa TEXT NOT NULL,
      canal TEXT NOT NULL,
      detectada_en TEXT NOT NULL,
      vista_en TEXT,
      created_at TEXT
    );
```

- [ ] **Step 5: Verificar que las pruebas existentes siguen pasando (nada roto todavía)**

Run: `npm test`
Expected: PASS, mismo conteo de tests que antes de este task (la tabla nueva no tiene ningún código que la use todavía).

- [ ] **Step 6: Commit**

```bash
git add app/db/schema.ts app/db/test-helpers.ts drizzle/
git commit -m "feat(db): tabla notificacion_respuesta para el aviso de respuesta en cadencia"
```

---

### Task 2: Repository — registrar, marcar vista, consultar pendientes

**Files:**
- Modify: `app/db/repository.ts` (agregar import de `notificacionRespuesta`, 3 funciones nuevas + 1 tipo, después de `quedanDestinatariosActivos`, línea ~4020)
- Create: `app/db/repository.notificacionRespuesta.test.ts`

- [ ] **Step 1: Escribir la prueba (roja)**

Create `app/db/repository.notificacionRespuesta.test.ts`:

```ts
// V6.1: pruebas de Repository para el registro de respuestas y su consulta desde
// /cola y /seguimiento. Mismo estilo que repository.tracking.test.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarRespuestaDetectada, marcarRespuestaVista, empresasConRespuestaPendiente } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresaConContacto(id: string, nombreContacto: string, cargo: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'cat-1', 1)`,
  ).run(id, id, id.toLowerCase());
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, cargo, es_key_decision_maker, es_principal, fuente) VALUES (?, ?, ?, 0, 1, 'seed')`,
  ).run(id, nombreContacto, cargo);
  db.close();
}

seedEmpresaConContacto('e-resp-1', 'Ana Pérez', 'Gerente');
seedEmpresaConContacto('e-resp-2', 'Beto Ruiz', 'CEO');

test('registrarRespuestaDetectada inserta una fila con vista_en null', () => {
  registrarRespuestaDetectada(10, 'e-resp-1', 'correo');
  const db = raw();
  const fila = db.prepare('SELECT id_inscripcion, id_empresa, canal, vista_en FROM notificacion_respuesta WHERE id_inscripcion = 10').get() as any;
  db.close();
  assert.ok(fila);
  assert.strictEqual(fila.id_empresa, 'e-resp-1');
  assert.strictEqual(fila.canal, 'correo');
  assert.strictEqual(fila.vista_en, null);
});

test('empresasConRespuestaPendiente solo trae empresas con al menos una fila sin ver', () => {
  registrarRespuestaDetectada(20, 'e-resp-2', 'whatsapp');
  const pendientes = empresasConRespuestaPendiente(1);
  assert.ok(pendientes.some((p) => p.idEmpresa === 'e-resp-1'));
  assert.ok(pendientes.some((p) => p.idEmpresa === 'e-resp-2'));
});

test('empresasConRespuestaPendiente trae contacto/cargo/canal de la fila mas reciente', () => {
  const pendientes = empresasConRespuestaPendiente(1);
  const fila = pendientes.find((p) => p.idEmpresa === 'e-resp-2')!;
  assert.strictEqual(fila.contacto, 'Beto Ruiz');
  assert.strictEqual(fila.cargo, 'CEO');
  assert.strictEqual(fila.canal, 'whatsapp');
});

test('marcarRespuestaVista apaga el destaque de esa empresa (todas sus filas sin ver a la vez)', () => {
  registrarRespuestaDetectada(21, 'e-resp-2', 'correo'); // segunda respuesta de la misma empresa, sigue sin ver
  marcarRespuestaVista('e-resp-2');
  const pendientes = empresasConRespuestaPendiente(1);
  assert.ok(!pendientes.some((p) => p.idEmpresa === 'e-resp-2'), 'e-resp-2 ya no debe salir: ambas filas quedaron vistas');
  assert.ok(pendientes.some((p) => p.idEmpresa === 'e-resp-1'), 'e-resp-1 sigue pendiente, no se toco');
});

test('empresasConRespuestaPendiente esta scoped por organizacion', () => {
  const db = raw();
  db.prepare(`UPDATE empresa SET organizacion_activa_id = 2 WHERE id_empresa = 'e-resp-1'`).run();
  db.close();
  const pendientesOrg1 = empresasConRespuestaPendiente(1);
  const pendientesOrg2 = empresasConRespuestaPendiente(2);
  assert.ok(!pendientesOrg1.some((p) => p.idEmpresa === 'e-resp-1'));
  assert.ok(pendientesOrg2.some((p) => p.idEmpresa === 'e-resp-1'));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.notificacionRespuesta.test.ts`
Expected: FAIL — `registrarRespuestaDetectada` no existe en `./repository.ts`.

- [ ] **Step 3: Implementar las tres funciones**

En `app/db/repository.ts`, agregar `notificacionRespuesta` al import de `'./schema'` (línea 23-48, junto a `eventoTracking`):

```ts
  eventoTracking,
  notificacionRespuesta,
```

Luego, después de `quedanDestinatariosActivos` (línea ~4020, justo antes del comentario `// ── WhatsApp entrante ...`):

```ts
// ── Aviso de respuesta (V6.1): registro append-only + consulta para /cola y
// /seguimiento. Ver core/tracking.ts y core/llego-respuesta.ts para el unico
// punto de notificacion (se llama junto a pausarInscripcion, nunca solo).
export function registrarRespuestaDetectada(idInscripcion: number, idEmpresa: string, canal: string) {
  const ahora = new Date().toISOString();
  db.insert(notificacionRespuesta)
    .values({ idInscripcion, idEmpresa, canal, detectadaEn: ahora, createdAt: ahora })
    .run();
}

// Marca TODAS las filas sin ver de esa empresa a la vez (no solo la ultima) -- si
// respondio dos veces antes de que Sebastian abriera la ficha, abrir la ficha una
// vez basta para apagar el destaque.
export function marcarRespuestaVista(idEmpresa: string) {
  db.update(notificacionRespuesta)
    .set({ vistaEn: new Date().toISOString() })
    .where(and(eq(notificacionRespuesta.idEmpresa, idEmpresa), isNull(notificacionRespuesta.vistaEn)))
    .run();
}

export type FilaRespuestaPendiente = {
  idEmpresa: string;
  empresa: string;
  contacto: string | null;
  cargo: string | null;
  canal: string;
  fecha: string;
};

// Una fila por respuesta sin ver, org-wide, mas reciente primero; se dedupea a UNA
// fila por empresa en TS (nos quedamos con la primera = la mas reciente) -- mas
// simple que un correlated subquery en SQL para "el canal de la fila con MAX(fecha)".
export function empresasConRespuestaPendiente(idOrganizacion: number): FilaRespuestaPendiente[] {
  const filas = db
    .select({
      idEmpresa: notificacionRespuesta.idEmpresa,
      empresa: empresa.nombreOficial,
      contacto: contacto.nombre,
      cargo: contacto.cargo,
      canal: notificacionRespuesta.canal,
      fecha: notificacionRespuesta.detectadaEn,
    })
    .from(notificacionRespuesta)
    .innerJoin(empresa, eq(empresa.idEmpresa, notificacionRespuesta.idEmpresa))
    .leftJoin(contacto, and(eq(contacto.idEmpresa, notificacionRespuesta.idEmpresa), eq(contacto.esPrincipal, 1)))
    .where(and(isNull(notificacionRespuesta.vistaEn), eq(empresa.organizacionActivaId, idOrganizacion)))
    .orderBy(desc(notificacionRespuesta.detectadaEn))
    .all();

  const vistas = new Set<string>();
  const unicas: FilaRespuestaPendiente[] = [];
  for (const f of filas) {
    if (vistas.has(f.idEmpresa)) continue;
    vistas.add(f.idEmpresa);
    unicas.push(f);
  }
  return unicas;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.notificacionRespuesta.test.ts`
Expected: PASS, 5 tests verdes.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.notificacionRespuesta.test.ts
git commit -m "feat(db): registrarRespuestaDetectada, marcarRespuestaVista, empresasConRespuestaPendiente"
```

---

### Task 3: `core/tracking.ts` — punto de notificación para respuestas de correo

**Files:**
- Modify: `app/core/tracking.ts`
- Modify: `app/core/tracking.test.ts`
- Modify: `app/db/repository.ts` (`resolverDestinatarioPorEmail`, línea 3949)
- Modify: `app/db/repository.tracking.test.ts` (una aserción existente gana un campo nuevo)

★ Insight ─────────────────────────────────────
`DestinatarioResuelto` hoy no trae `idEmpresa` porque nada lo necesitaba: el join real (`resolverDestinatarioPorEmail`) ya pasa por `inscripcion`, así que agregar la columna al `select` es gratis — el dato ya está en el join, solo faltaba proyectarlo. Esto es distinto de agregar un `idOrganizacion` o cualquier dato que requiriera un join nuevo: cuando el dato ya está "de paso" en una query existente, extender el tipo de retorno es casi siempre más barato que resolverlo aparte.
─────────────────────────────────────────────────

- [ ] **Step 1: Escribir la prueba (roja) en tracking.test.ts**

En `app/core/tracking.test.ts`, modificar `depsFalsos` para aceptar y registrar la llamada nueva, y agregar `idEmpresa` a los destinatarios de prueba:

```ts
function depsFalsos(destinatarios: Record<string, DestinatarioResuelto>, activosPorInscripcion: Record<number, boolean>) {
  const eventosGuardados = new Set<string>();
  const pausadas: { idInscripcion: number; motivo: string }[] = [];
  const salidos: number[] = [];
  const notificadas: { idInscripcion: number; idEmpresa: string; canal: string }[] = [];

  const deps: TrackingDeps = {
    campanasConSecuencia: (): CampanaConSecuencia[] => [{ idCampana: 1, proveedorCampanaId: 'seq-1' }],
    resolverDestinatario: (_proveedorCampanaId, email) => destinatarios[email] ?? null,
    guardarEvento: (_id, evento) => {
      if (eventosGuardados.has(evento.proveedorEventoId)) return 'duplicado';
      eventosGuardados.add(evento.proveedorEventoId);
      return 'insertado';
    },
    pausarInscripcion: (idInscripcion, motivo) => {
      pausadas.push({ idInscripcion, motivo });
      activosPorInscripcion[idInscripcion] = false;
    },
    marcarDestinatarioSalio: (idDestinatario) => {
      salidos.push(idDestinatario);
    },
    quedanDestinatariosActivos: (idInscripcion) => activosPorInscripcion[idInscripcion] ?? false,
    registrarRespuestaDetectada: (idInscripcion, idEmpresa, canal) => {
      notificadas.push({ idInscripcion, idEmpresa, canal });
    },
  };
  return { deps, pausadas, salidos, eventosGuardados, notificadas };
}
```

Actualizar el destinatario de prueba usado en la mayoría de los tests (línea 62) para incluir `idEmpresa`:

```ts
const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10, idEmpresa: 'emp-A' } };
```

Aplicar el mismo cambio (agregar `idEmpresa: 'emp-A'`) en los tests de las líneas 74, 85, 96, 116 (todos los `destinatarios` con `'ana@empresa.com'`).

Agregar un test nuevo después de `'un reply pausa la inscripcion de inmediato'`:

```ts
test('un reply tambien registra la respuesta detectada (empresa + canal del evento)', async () => {
  const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10, idEmpresa: 'emp-A' } };
  const { deps, notificadas } = depsFalsos(destinatarios, { 10: true });
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-reply', tipo: 'respondio', canal: 'correo' })] });

  await pollTracking(deps, envio);

  assert.deepEqual(notificadas, [{ idInscripcion: 10, idEmpresa: 'emp-A', canal: 'correo' }]);
});

test('un bounce NO registra respuesta detectada (no es una respuesta)', async () => {
  const destinatarios = { 'ana@empresa.com': { idPasoInscripcion: 1, idDestinatario: 1, idInscripcion: 10, idEmpresa: 'emp-A' } };
  const { deps, notificadas } = depsFalsos(destinatarios, { 10: true });
  const envio = envioFalso({ 'seq-1': [evento({ proveedorEventoId: 'evt-bounce', tipo: 'rebota' })] });

  await pollTracking(deps, envio);

  assert.deepEqual(notificadas, []);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/tracking.test.ts`
Expected: FAIL — error de tipo, `registrarRespuestaDetectada` no existe en `TrackingDeps`, y `idEmpresa` no existe en `DestinatarioResuelto`.

- [ ] **Step 3: Extender el tipo y el dep en tracking.ts**

En `app/core/tracking.ts`:

```ts
export type DestinatarioResuelto = { idPasoInscripcion: number; idDestinatario: number; idInscripcion: number; idEmpresa: string };
```

```ts
export type TrackingDeps = {
  campanasConSecuencia: () => CampanaConSecuencia[];
  resolverDestinatario: (proveedorCampanaId: string, email: string) => DestinatarioResuelto | null;
  guardarEvento: (idPasoInscripcion: number, evento: EventoProveedor) => 'insertado' | 'duplicado';
  pausarInscripcion: (idInscripcion: number, motivo: string) => void;
  marcarDestinatarioSalio: (idDestinatario: number) => void;
  quedanDestinatariosActivos: (idInscripcion: number) => boolean;
  // Aviso de respuesta (V6.1): se llama SIEMPRE junto a pausarInscripcion cuando el
  // evento es 'respondio', nunca por separado -- es aditivo, no reemplaza el corte
  // de cadencia que pausarInscripcion ya hace.
  registrarRespuestaDetectada: (idInscripcion: number, idEmpresa: string, canal: string) => void;
};
```

Y en la rama `respondio` de `pollTracking`:

```ts
      if (evento.tipo === 'respondio') {
        // Reply de CUALQUIER destinatario pausa la inscripcion de inmediato (B6):
        // ningun paso futuro sale, sin importar si otros destinatarios siguen activos.
        deps.pausarInscripcion(destinatario.idInscripcion, 'respuesta detectada');
        deps.registrarRespuestaDetectada(destinatario.idInscripcion, destinatario.idEmpresa, evento.canal);
      } else if (evento.tipo === 'rebota') {
```

- [ ] **Step 4: Extender `resolverDestinatarioPorEmail` en repository.ts para proyectar `idEmpresa`**

En `app/db/repository.ts:3949`, el select ya hace join con `inscripcion` — solo falta proyectar la columna:

```ts
export function resolverDestinatarioPorEmail(proveedorCampanaId: string, email: string): DestinatarioResuelto | null {
  const fila = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idDestinatario: pasoInscripcion.idDestinatario,
      idInscripcion: destinatario.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
    })
    .from(pasoInscripcion)
```

(El resto de la función queda igual.)

- [ ] **Step 5: Actualizar `repository.tracking.test.ts` con la aserción nueva**

En `app/db/repository.tracking.test.ts`, dentro de `test('resolverDestinatarioPorEmail encuentra el destinatario por (proveedorCampanaId, email)', ...)` (línea 84), agregar:

```ts
  assert.strictEqual(resuelto!.idEmpresa, 'e-track-1');
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/tracking.test.ts app/db/repository.tracking.test.ts`
Expected: PASS.

- [ ] **Step 7: Correr toda la suite**

Run: `npm test`
Expected: PASS — esto también va a marcar como roto `app/worker/index.ts` (le falta el dep nuevo en `TrackingDeps`) hasta el Task 5. Si `npm test` corre `tsc` o el loader falla por tipos en `worker/index.ts`, es esperado en este punto; confirmar que los tests de `app/core/*` y `app/db/*` sí pasan y seguir al Task 5 antes de dar este task por cerrado en CI.

- [ ] **Step 8: Commit**

```bash
git add app/core/tracking.ts app/core/tracking.test.ts app/db/repository.ts app/db/repository.tracking.test.ts
git commit -m "feat(tracking): registrar respuesta detectada junto al corte de cadencia (correo)"
```

---

### Task 4: `core/llego-respuesta.ts` — punto de notificación para respuestas de WhatsApp

**Files:**
- Modify: `app/core/llego-respuesta.ts`
- Modify: `app/core/llego-respuesta.test.ts`

★ Insight ─────────────────────────────────────
Acá NO hace falta resolver nada nuevo: `match.idEmpresa` ya viene del matcheo por teléfono (`resolverPorUltimos10`), y el canal es siempre `'whatsapp'` — a diferencia de `tracking.ts`, donde el canal venía del evento de Apollo (podía ser cualquier cosa que Apollo reportara), acá es un literal fijo porque este caso de uso ES el de WhatsApp. Mismo dep inyectado (`registrarRespuestaDetectada`), pero la llamada es más simple porque el contexto ya la restringe.
─────────────────────────────────────────────────

- [ ] **Step 1: Escribir la prueba (roja)**

En `app/core/llego-respuesta.test.ts`, extender `fakes()` para registrar la llamada:

```ts
function fakes() {
  const calls = {
    registrarEntrante: [] as { m: MensajeEntrante; match: ContactoMatch | null }[],
    pausar: [] as number[],
    sacar: [] as { seq: string; email: string }[],
    toque: [] as { match: ContactoMatch; texto: string }[],
    notificar: [] as { idInscripcion: number; idEmpresa: string; canal: string }[],
  };
  let matchResult: ContactoMatch | null = null;
  let activas: InscripcionActiva[] = [];
  let dup = false;

  const deps: RespuestaEntranteDeps = {
    registrarEntrante: (m, match) => {
      calls.registrarEntrante.push({ m, match });
      return dup ? 'duplicado' : 'insertado';
    },
    matchearContacto: () => matchResult,
    inscripcionesActivas: () => activas,
    pausarInscripcion: (id) => calls.pausar.push(id),
    registrarToqueEntrante: (match, texto) => calls.toque.push({ match, texto }),
    registrarRespuestaDetectada: (idInscripcion, idEmpresa, canal) => calls.notificar.push({ idInscripcion, idEmpresa, canal }),
  };
  const envio: TrackingPoll = {
    sacarDestinatario: async (seq, email) => {
      calls.sacar.push({ seq, email });
    },
    leerEventosNuevos: async (): Promise<EventoProveedor[]> => [],
  };
  return {
    calls,
    envio,
    deps,
    set: (o: { match?: ContactoMatch | null; activas?: InscripcionActiva[]; dup?: boolean }) => {
      if ('match' in o) matchResult = o.match ?? null;
      if (o.activas) activas = o.activas;
      if (o.dup !== undefined) dup = o.dup;
    },
  };
}
```

Agregar un test nuevo después de `'reply con match + inscripcion Apollo: pausa local, corta Apollo y deja toque'`:

```ts
test('reply con match registra la respuesta detectada por whatsapp para cada inscripcion activa', async () => {
  const f = fakes();
  f.set({ match, activas: [{ idInscripcion: 42, proveedorCampanaId: 'seq-1', email: 'ana@x.com' }] });
  await procesarRespuestaEntrante(f.deps, f.envio, mensaje);
  assert.deepEqual(f.calls.notificar, [{ idInscripcion: 42, idEmpresa: 'emp-A', canal: 'whatsapp' }]);
});

test('idempotencia: un mensaje duplicado no notifica de nuevo', async () => {
  const f = fakes();
  f.set({ match, activas: [{ idInscripcion: 42, proveedorCampanaId: 'seq-1', email: 'ana@x.com' }], dup: true });
  await procesarRespuestaEntrante(f.deps, f.envio, mensaje);
  assert.deepEqual(f.calls.notificar, []);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/llego-respuesta.test.ts`
Expected: FAIL — `registrarRespuestaDetectada` no existe en `RespuestaEntranteDeps`.

- [ ] **Step 3: Extender el tipo y el caso de uso**

En `app/core/llego-respuesta.ts`, agregar al tipo `RespuestaEntranteDeps` (después de `registrarToqueEntrante`):

```ts
  registrarToqueEntrante: (match: ContactoMatch, texto: string, fecha: string) => void;
  // Aviso de respuesta (V6.1): mismo dep que core/tracking.ts, se llama SIEMPRE junto
  // a pausarInscripcion, nunca por separado. Canal fijo 'whatsapp' -- este caso de uso
  // ES el de WhatsApp, a diferencia de tracking.ts donde el canal viene del evento.
  registrarRespuestaDetectada: (idInscripcion: number, idEmpresa: string, canal: string) => void;
```

Y dentro del loop de `activas` en `procesarRespuestaEntrante`:

```ts
  for (const activa of activas) {
    // Corte local siempre, incondicional: es lo minimo que garantiza que el motor
    // deja de mandar el siguiente paso, sin depender de que Apollo responda.
    deps.pausarInscripcion(activa.idInscripcion, 'respuesta detectada (whatsapp)');
    deps.registrarRespuestaDetectada(activa.idInscripcion, match.idEmpresa, 'whatsapp');

    if (activa.proveedorCampanaId && activa.email) {
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/llego-respuesta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/core/llego-respuesta.ts app/core/llego-respuesta.test.ts
git commit -m "feat(llego-respuesta): registrar respuesta detectada junto al corte de cadencia (whatsapp)"
```

---

### Task 5: Wiring — worker y webhook de WhatsApp

**Files:**
- Modify: `app/worker/index.ts` (`tareaTracking`, línea ~110)
- Modify: `app/api/webhooks/whatsapp/route.ts` (línea ~51)

- [ ] **Step 1: Cablear `tareaTracking` en el worker**

En `app/worker/index.ts`, agregar `registrarRespuestaDetectada` al import de `'../db/repository'` (junto a `pausarInscripcion` etc.) y al objeto de deps:

```ts
async function tareaTracking(envioCorreo: ReturnType<typeof crearRegistroEnvio>['correo']): Promise<void> {
  if (!envioCorreo) return;
  await pollTracking(
    {
      campanasConSecuencia,
      resolverDestinatario: resolverDestinatarioPorEmail,
      guardarEvento: guardarEventoTracking,
      pausarInscripcion,
      marcarDestinatarioSalio,
      quedanDestinatariosActivos,
      registrarRespuestaDetectada,
    },
    envioCorreo,
  );
}
```

- [ ] **Step 2: Cablear el webhook de WhatsApp**

En `app/api/webhooks/whatsapp/route.ts`, agregar `registrarRespuestaDetectada` al import de `'../../../db/repository'` y al objeto `deps`:

```ts
    const deps: RespuestaEntranteDeps = {
      registrarEntrante: (m, match) => guardarMensajeEntrante(m, match ? match.idContacto : null),
      matchearContacto: (telefono) => resolverPorUltimos10(candidatosContactoConTelefono(), telefono),
      inscripcionesActivas: inscripcionesActivasDeEmpresa,
      pausarInscripcion,
      registrarToqueEntrante,
      registrarRespuestaDetectada,
    };
```

- [ ] **Step 3: Correr toda la suite (aquí es donde los errores de tipo pendientes del Task 3 se cierran)**

Run: `npm test`
Expected: PASS, sin errores de tipo.

- [ ] **Step 4: Commit**

```bash
git add app/worker/index.ts app/api/webhooks/whatsapp/route.ts
git commit -m "feat(wiring): cablear registrarRespuestaDetectada en worker y webhook whatsapp"
```

---

### Task 6: `/cola` — badge "Respondió" en la fila

**Files:**
- Modify: `app/cola/agenda.ts` (`FilaCola`, `FilaAgenda`, `filaSinVencimiento`, `filaConVencimiento`)
- Modify: `app/cola/agenda.test.ts`
- Modify: `app/cola/ColaUnificada.tsx`
- Modify: `app/cola/page.tsx`

- [ ] **Step 1: Escribir la prueba (roja) en agenda.test.ts**

En `app/cola/agenda.test.ts`, agregar después del bloque de imports un test nuevo (junto a los tests de `filaConVencimiento` existentes, buscar con `grep -n "filaConVencimiento" app/cola/agenda.test.ts` si hay tests previos de esa función; si no los hay, agregar al final del archivo antes de cualquier `test.after`):

```ts
test('filaConVencimiento propaga respuestaPendiente cuando la fila lo trae', () => {
  const c: FilaCola = {
    id: 'e-1',
    empresa: 'Empresa 1',
    ciudad: null,
    contacto: null,
    cargo: null,
    canal: 'correo',
    estado: null,
    fecha: '2026-07-10',
    respuestaPendiente: true,
  };
  const f = filaConVencimiento(c, '2026-07-14', false);
  assert.strictEqual(f.respuestaPendiente, true);
});

test('filaConVencimiento sin respuestaPendiente en el origen lo deja undefined', () => {
  const c: FilaCola = {
    id: 'e-2',
    empresa: 'Empresa 2',
    ciudad: null,
    contacto: null,
    cargo: null,
    canal: 'correo',
    estado: null,
    fecha: '2026-07-10',
  };
  const f = filaConVencimiento(c, '2026-07-14', false);
  assert.strictEqual(f.respuestaPendiente, undefined);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: FAIL — error de tipo, `respuestaPendiente` no existe en `FilaCola`.

- [ ] **Step 3: Agregar el campo a los tipos y a los constructores de fila**

En `app/cola/agenda.ts`, agregar `respuestaPendiente?: boolean;` a `FilaAgenda` (después de `pbxForma?: string | null;`) y a `FilaCola` (después de `pbxForma?: string | null;`):

```ts
export type FilaAgenda = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
  canal: Canal;
  estado: string | null;
  sev: Severity;
  severidadTexto: string;
  actual: boolean;
  pbxForma?: string | null;
  // Aviso de respuesta (V6.1): true = esta empresa tiene una respuesta sin ver.
  respuestaPendiente?: boolean;
};
```

```ts
export type FilaCola = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
  canal: string | null;
  estado: string | null;
  fecha: string | null;
  campana?: string | null;
  pbxForma?: string | null;
  respuestaPendiente?: boolean;
};
```

Y propagarlo en `filaSinVencimiento` y `filaConVencimiento`:

```ts
export function filaSinVencimiento(c: FilaCola): FilaAgenda {
  return {
    id: c.id,
    empresa: c.empresa,
    ciudad: c.ciudad,
    contacto: c.contacto,
    cargo: c.cargo,
    canal: canalNormalizado(c.canal),
    estado: c.estado,
    sev: "today",
    severidadTexto: c.fecha ?? "sin fecha",
    actual: false,
    pbxForma: c.pbxForma ?? null,
    respuestaPendiente: c.respuestaPendiente,
  };
}
```

```ts
export function filaConVencimiento(c: FilaCola, hoy: string, actual: boolean): FilaAgenda {
  const dias = diasVencido(c.fecha!, hoy);
  return {
    id: c.id,
    empresa: c.empresa,
    ciudad: c.ciudad,
    contacto: c.contacto,
    cargo: c.cargo,
    canal: canalNormalizado(c.canal),
    estado: c.estado,
    sev: dias > 0 ? "overdue" : "today",
    severidadTexto: dias > 0 ? `vencido ${dias}d` : "hoy",
    actual,
    pbxForma: c.pbxForma ?? null,
    respuestaPendiente: c.respuestaPendiente,
  };
}
```

(`filaUnificada` ya hace `{ ...base, ... }`, así que `respuestaPendiente` llega solo hasta `FilaUnificada` sin tocar esa función.)

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Pintar el badge en ColaUnificada.tsx**

En `app/cola/ColaUnificada.tsx`, agregar el pill nuevo justo después del bloque `{fila.origen === 'cadencia' && (...Cadencia...)}` (línea ~87):

```tsx
                      {fila.origen === 'cadencia' && (
                        <span
                          className="shrink-0 rounded-[6px] border border-accent-soft bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-acento"
                          title="Paso de cadencia (Apollo/manual), no un lead nuevo"
                        >
                          Cadencia
                        </span>
                      )}
                      {fila.respuestaPendiente && (
                        <span
                          className="shrink-0 rounded-[6px] border border-done/40 bg-done-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-done"
                          title="Respondió y todavía no has abierto su ficha"
                        >
                          Respondió
                        </span>
                      )}
```

- [ ] **Step 6: Cablear el Set de empresas pendientes en page.tsx**

En `app/cola/page.tsx`, importar `empresasConRespuestaPendiente` (junto a los demás imports de `'../db/repository'`, línea 1-10) y construir el set justo antes de `filasParaUnificar` (línea ~70):

```ts
  const respuestasPendientes = new Set(empresasConRespuestaPendiente(usuario.idOrganizacion).map((f) => f.idEmpresa));

  const filasParaUnificar: FilaColaConBucket[] = splitActivo
    ? [
        ...cola.map((c): FilaColaConBucket => ({ ...c, bucket: 'lead', respuestaPendiente: respuestasPendientes.has(c.id) })),
        ...cierres.map((c): FilaColaConBucket => ({ ...c, bucket: 'cierre', respuestaPendiente: respuestasPendientes.has(c.id) })),
        ...reagendar.map((c): FilaColaConBucket => ({ ...c, bucket: 'reagendar', respuestaPendiente: respuestasPendientes.has(c.id) })),
        ...cadenciasParaUnificar.map(
          (t): FilaColaConBucket => ({
            id: t.idEmpresa,
            empresa: t.empresaNombre,
            ciudad: t.ciudad,
            contacto: t.nombre,
            cargo: null,
            canal: t.canal,
            estado: t.estadoNotion,
            fecha: t.fechaProgramada ? t.fechaProgramada.slice(0, 10) : null,
            campana: t.nombreCampana,
            bucket: bucketDeEtapa(t.estadoNotion),
            origen: 'cadencia',
            respuestaPendiente: respuestasPendientes.has(t.idEmpresa),
          }),
        ),
      ]
    : [];
```

- [ ] **Step 7: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/cola/agenda.ts app/cola/agenda.test.ts app/cola/ColaUnificada.tsx app/cola/page.tsx
git commit -m "feat(cola): badge Respondió en la fila cuando hay una respuesta sin ver"
```

---

### Task 7: `/llamada/[id]` — marcar como vista al abrir la ficha

**Files:**
- Modify: `app/llamada/[id]/page.tsx`

- [ ] **Step 1: Llamar `marcarRespuestaVista` al entrar a la ficha**

En `app/llamada/[id]/page.tsx`, agregar `marcarRespuestaVista` al import de `'../../db/repository'` (línea 1) y llamarlo justo después de resolver `ctx` (línea ~34, antes del `if (!ctx.emp)`):

```ts
import { getContextoToque, versionesDePaso, marcarRespuestaVista } from "../../db/repository";
```

```ts
  const usuario = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const ctx = getContextoToque(id, usuario.idOrganizacion);

  // Aviso de respuesta (V6.1): abrir la ficha de la empresa es la señal de "ya lo vi"
  // -- apaga el destaque de /cola y /seguimiento sin que Sebastián tenga que hacer un
  // click aparte. No-op si esta empresa no tenía ninguna respuesta pendiente.
  marcarRespuestaVista(id);

  if (!ctx.emp) {
```

- [ ] **Step 2: Verificación manual**

No hay harness de pruebas de componentes React en este repo (ni para este archivo ni para ninguna otra página server component similar) — coherente con el resto de `/llamada`, que tampoco tiene tests. Verificar a mano: abrir `/llamada/<id>` de una empresa con una fila en `notificacion_respuesta` sin `vista_en`, confirmar que `vista_en` queda seteado después de cargar la página.

- [ ] **Step 3: Correr toda la suite (nada debería romperse, es un cambio aditivo)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/llamada/\[id\]/page.tsx
git commit -m "feat(llamada): marcar la respuesta como vista al abrir la ficha de la empresa"
```

---

### Task 8: `/seguimiento` — franja "Respondieron"

**Files:**
- Modify: `app/ui/seguimiento/EmpresaRow.tsx`
- Modify: `app/seguimiento/page.tsx`
- Modify: `app/seguimiento/actions.ts`

- [ ] **Step 1: Agregar la variante visual `respondio` a EmpresaRow**

En `app/ui/seguimiento/EmpresaRow.tsx`, agregar `respondio?: boolean;` a `EmpresaRowData` (después de `esHoy?: boolean;`):

```ts
export interface EmpresaRowData {
  id: string;
  nombre: string;
  contacto: string;
  cargo: string;
  pasoActual: string;
  diaSecuencia: number;
  cadencia: string;
  objetivo: string | null;
  canal: Canal;
  esHoy?: boolean;
  // Aviso de respuesta (V6.1): fila de la franja "Respondieron", acento visual propio
  // (no reusa el badge "HOY" -- son dos conceptos distintos).
  respondio?: boolean;
}
```

Cambiar el `className` del `<article>` para que `respondio` tenga su propio acento (verde, tokens `done` ya usados en el resto de la app) y el badge inferior para mostrar "RESPONDIÓ" en vez de "HOY" cuando aplique:

```tsx
      className={cn(
        'border rounded-xl p-3 flex flex-col gap-1.5',
        'transition-all duration-150 cursor-pointer',
        'hover:-translate-y-0.5 hover:shadow-md',
        data.esHoy
          ? 'bg-pipeline-card-today border-amber-400/30 hover:border-amber-400/55'
          : data.respondio
          ? 'bg-done-bg border-done/30 hover:border-done/55'
          : 'bg-pipeline-card border-line-card hover:border-line-card'
      )}
```

```tsx
        {data.esHoy ? (
          <span className="flex items-center gap-1 text-xs font-bold tracking-wide text-amber-400">
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(242,183,56,0.22)]"
              aria-hidden="true"
            />
            HOY
          </span>
        ) : data.respondio ? (
          <span className="flex items-center gap-1 text-xs font-bold tracking-wide text-done">
            <span className="w-1.5 h-1.5 rounded-full bg-done shadow-[0_0_0_3px_rgba(87,201,138,0.22)]" aria-hidden="true" />
            RESPONDIÓ
          </span>
        ) : null}
```

- [ ] **Step 2: Construir la franja en page.tsx**

En `app/seguimiento/page.tsx`, importar `empresasConRespuestaPendiente` (junto a `kpisPipeline, pipelineGlobal, pipelineSinCadencia`, línea 6) y construir el grupo justo antes de `grupoSinCadencia` (línea ~123):

```ts
import { kpisPipeline, pipelineGlobal, pipelineSinCadencia, empresasConRespuestaPendiente } from '../db/repository';
```

```ts
  // Franja "Respondieron" (2026-07-14): empresas con una respuesta sin ver. Separada de
  // los grupos "Toque N" a propósito -- pipelineGlobal solo trae inscripcion.estado =
  // 'activa', y una empresa recién pausada por respuesta cae fuera de esos grupos. No se
  // toca pipelineGlobal: una respuesta es "bandeja de revisión pendiente", no "progreso
  // de cadencia", son conceptos distintos aunque ambos vivan en /seguimiento.
  const respondieron = empresasConRespuestaPendiente(usuario.idOrganizacion);
  const grupoRespondieron = (() => {
    if (respondieron.length === 0) return null;
    const empresas: EmpresaRowData[] = respondieron.map((f) => ({
      id: f.idEmpresa,
      nombre: f.empresa,
      contacto: f.contacto ?? 'Sin contacto activo',
      cargo: f.cargo ?? '',
      pasoActual: 'Respondió',
      diaSecuencia: 0,
      cadencia: 'Nueva respuesta',
      objetivo: null,
      canal: canalNormalizado(f.canal),
      respondio: true,
    }));

    const data: EtapaGroupData = {
      estado: 'respondieron',
      label: 'Respondieron',
      total: respondieron.length,
    };

    return { data, empresas };
  })();

  const filasSinCadencia = pipelineSinCadencia(usuario.idOrganizacion, hoy);
```

Y ajustar el ensamblado final para que "Respondieron" vaya primero:

```ts
  const todosLosGrupos = [
    ...(grupoRespondieron ? [grupoRespondieron] : []),
    ...grupos,
    ...(grupoSinCadencia ? [grupoSinCadencia] : []),
  ];
```

(Esto reemplaza la línea existente `const todosLosGrupos = grupoSinCadencia ? [...grupos, grupoSinCadencia] : grupos;`.)

- [ ] **Step 3: Marcar como vista al abrir la ficha desde /seguimiento**

En `app/seguimiento/actions.ts`, importar `marcarRespuestaVista` y llamarlo dentro de `perfilPipelineEmpresaAction`:

```ts
export async function perfilPipelineEmpresaAction(idEmpresa: string): Promise<DetallePanelData | null> {
  const usuario = await requireSession();
  const perfil = perfilPipelineEmpresa(idEmpresa, usuario.idOrganizacion);
  if (!perfil) return null;

  // Aviso de respuesta (V6.1): abrir la ficha es la señal de "ya lo vi", igual que en
  // /llamada/[id]. No-op si esta empresa no tenía ninguna respuesta pendiente.
  marcarRespuestaVista(idEmpresa);

  return {
```

- [ ] **Step 4: Verificación manual**

No hay harness de pruebas de componentes/páginas de `/seguimiento` en este repo (ni `EmpresaRow.tsx`, ni `EtapaGroup.tsx`, ni `page.tsx` tienen tests hoy). Verificar a mano: con una empresa en `notificacion_respuesta` sin ver, entrar a `/seguimiento` y confirmar que aparece la franja "Respondieron" arriba de todo, con acento verde; hacer click en la fila, confirmar que abre el `DetallePanel` y que `vista_en` queda seteado (recargar la página y confirmar que la franja ya no la muestra).

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/ui/seguimiento/EmpresaRow.tsx app/seguimiento/page.tsx app/seguimiento/actions.ts
git commit -m "feat(seguimiento): franja Respondieron, separada de los grupos por etapa"
```

---

### Task 9: Verificación de colisión con la sesión paralela (Etapa 3 / tracking Gmail)

Este task es un checkpoint, no código. Sebastián avisó que otra sesión está trabajando EN PARALELO en la Etapa 3 del spec de Gmail (tracking: abiertos/clics/respuestas/rebotes), tocando principalmente `gmail.ts`. Este plan toca `app/core/tracking.ts` (la rama `respondio` de `pollTracking`) — mismo archivo que la Etapa 3 probablemente también necesita tocar (agregar soporte de tracking para Gmail ahí mismo). Ya pasó antes (ver `project_gmail_conector_etapa1_colision.md` en memoria): dos sesiones construyendo en el mismo archivo sin saberlo.

- [ ] **Step 1: Antes de dar este plan por cerrado, comparar contra main**

Run: `git log main --oneline -20`
Expected: revisar si algún commit nuevo (posterior al punto donde arrancó este plan) toca `app/core/tracking.ts`, `app/db/schema.ts` o `app/db/repository.ts`. Si los toca, NO mergear a ciegas.

- [ ] **Step 2: Si hay overlap real en `tracking.ts`, comparar contenido**

Run: `git diff main -- app/core/tracking.ts`
Si la otra sesión agregó código a la rama `respondio` (o cerca), decidir con Sebastián cómo reconciliar — igual que la vez pasada con el conector Gmail (portar a mano lo que falte, no asumir que un lado gana por defecto).

- [ ] **Step 3: Si no hay overlap, seguir normal**

Nada que hacer — el plan puede mergearse/cerrarse como cualquier otro.

---

## Self-Review (hecho por quien escribió el plan)

- **Cobertura del spec:** modelo de datos (Task 1), core/único punto de notificación (Tasks 3-4), repository (Task 2), wiring (Task 5), `/cola` (Task 6), `/llamada/[id]` marca vista (Task 7), `/seguimiento` franja + marca vista (Task 8). Fuera de alcance del spec (badge global, WhatsApp, cambiar `pipelineGlobal`) no tiene tareas — correcto, no debía tenerlas.
- **Placeholders:** ninguno — cada step tiene código completo, comandos exactos y el resultado esperado.
- **Consistencia de tipos:** `registrarRespuestaDetectada(idInscripcion: number, idEmpresa: string, canal: string): void` es idéntico en `TrackingDeps` (Task 3), `RespuestaEntranteDeps` (Task 4), la firma real en `repository.ts` (Task 2) y las dos llamadas de wiring (Task 5) — verificado que coincide en los cuatro lugares.
- **Riesgo real identificado:** Task 9 (colisión con la sesión paralela de Gmail Etapa 3), explícito por pedido directo de Sebastián.
