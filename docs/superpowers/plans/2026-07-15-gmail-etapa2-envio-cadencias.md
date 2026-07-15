# Gmail Etapa 2 — envío de cadencias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nota de contexto del proyecto (CLAUDE.md):** las Tareas 6 y 7 tocan decisiones de arquitectura real (cómo se agrupa el push por adaptador, cómo se salta la secuencia de Apollo). Si se ejecutan inline con Sebastián, aplica el checkpoint de modo learning. El resto son mecánicas/wiring.
>
> **Decisiones de diseño tomadas con Sebastián (2026-07-15), que el spec original
> (`docs/superpowers/specs/2026-07-14-secuencias-correo-gmail-design.md`) dejaba abiertas:**
> 1. Si el dueño de la campaña resuelve a Gmail, `lanzarCampanaAction` NO crea/aprueba
>    ninguna secuencia externa en Apollo (cero clutter en el panel de Apollo).
> 2. El gate `readinessCanalUsuario('correo', ...)` deja de bloquear SIEMPRE — pasa a
>    estar listo SOLO si el usuario tiene Gmail verificado. Sin Gmail propio, correo
>    sigue bloqueado (evita que alguien sin Gmail lance por el buzón compartido de
>    Apollo a nombre de otra persona — el problema de confianza que motivó todo el spec).
>
> **Hallazgo de la lectura del código real (no estaba en el spec):** `campana.proveedor_campana_id`
> no es "el id de secuencia de Apollo" en sentido estricto — es el correlator que usa
> TODO el sistema de tracking (`resolverDestinatarioPorEmail` en `core/tracking.ts`
> correlaciona por `(proveedorCampanaId, email)`, sin importar el proveedor real). Si se
> salta Apollo para una campaña de Gmail, igual hace falta poblar esa columna con un
> valor propio (no de Apollo) para que el tracking siga funcionando. Este plan usa
> `gmail-camp-<idCampana>` como ese valor sintético.
>
> **Hallazgo 2:** la "compuerta de aprobación" que el spec describe como una acción UI
> separada ("Aprobar y mandar") NUNCA se construyó así para Apollo — en el código real,
> `lanzarCampanaAction` ya llama `aprobarSecuencia` automáticamente al lanzar, sin un
> botón de confirmación aparte. Este plan sigue la MISMA convención real (no la del
> spec desactualizado): `campana.aprobada_envio_gmail` se marca automáticamente dentro
> de `lanzarCampanaAction` cuando el dueño resuelve a Gmail — el click de "Lanzar hoy"
> es la aprobación explícita, igual que ya lo es hoy para Apollo. La columna igual
> existe como gate defensivo en `pasoInscripcionesPendientes`, dejando la puerta
> abierta a una UI de aprobación manual más adelante sin tocar schema otra vez.

**Goal:** El worker manda correos de cadencia reales por Gmail para las campañas cuyo
dueño tenga Gmail conectado y verificado, con Apollo como fallback para quien no lo
tenga — sin tocar `push.ts` ni `tracking.ts` (que siguen sin saber que Gmail existe),
respetando tope diario y throttle por cuenta.

**Architecture:** `app/adapters/registro-envio.ts` sigue siendo el único lugar que
resuelve "qué proveedor manda este canal" — ahí vive la función nueva
`resolverAdaptadorCorreo` y la que agrupa el trabajo pendiente por adaptador resuelto
(`agruparPendientesCorreo`). `push.ts` no cambia su contrato core (sigue recibiendo UN
adaptador por invocación) — quien itera por grupo es el worker, llamando
`pushPendientes` una vez por grupo. `pasoInscripcionesPendientes('correo', ...)` en el
repository se extiende (aditivo) para proyectar `owner`/`idOrganizacion`/
`aprobadaEnvioGmail` por fila, sin volverse "inteligente" — sigue siendo una query, la
lógica de a quién pertenece cada fila vive en `registro-envio.ts`.

**Tech Stack:** Next.js server actions, Drizzle ORM/SQLite, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-14-secuencias-correo-gmail-design.md` (sección "Etapa 2")

---

### Task 1: Columna `campana.aprobada_envio_gmail`

**Files:**
- Modify: `app/db/schema.ts` (tabla `campana`, después de `proveedorCampanaId`)
- Modify: `app/db/test-helpers.ts` (tabla `campana` en `crearDbPrueba`)

- [ ] **Step 1: Agregar la columna al schema**

En `app/db/schema.ts`, dentro de `export const campana = sqliteTable('campana', { ... })`,
justo después de `proveedorCampanaId: text('proveedor_campana_id'),`:

```ts
  // Gmail Etapa 2 (2026-07-15): compuerta de aprobacion para correo por Gmail. Se
  // marca automaticamente en lanzarCampanaAction cuando el dueno resuelve a Gmail
  // (el click de "Lanzar hoy" ES la aprobacion explicita, misma convencion real que
  // ya usa Apollo -- ver nota del plan). pasoInscripcionesPendientes la usa como gate
  // defensivo: sin esto en 1, ningun paso de correo de una campana Gmail sale.
  aprobadaEnvioGmail: integer('aprobada_envio_gmail').notNull().default(0),
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `npx drizzle-kit generate`
Expected: `drizzle/0002_*.sql` con `ALTER TABLE campana ADD COLUMN aprobada_envio_gmail integer DEFAULT 0 NOT NULL;`

Run: `npm run migrate`
Expected: `Migraciones al dia contra /Users/sebastianacostamolina/01_Documents/06_onepay/isps.db` sin errores.

- [ ] **Step 3: Agregar la columna al fixture de pruebas**

En `app/db/test-helpers.ts`, dentro del `CREATE TABLE campana (...)`, agrega la columna
justo antes del cierre `);`:

```sql
      aprobada_envio_gmail INTEGER NOT NULL DEFAULT 0
```

(Revisa la coma de la línea anterior — la última columna de la tabla no debe llevar coma
después de agregar esta.)

- [ ] **Step 4: Correr toda la suite**

Run: `npm test`
Expected: PASS, mismo conteo que hoy — columna nueva, nada la usa todavía. Anota el
conteo exacto que veas ANTES de este task para comparar en los siguientes.

- [ ] **Step 5: Commit**

```bash
git add app/db/schema.ts app/db/test-helpers.ts drizzle/
git commit -m "feat(db): columna campana.aprobada_envio_gmail (compuerta de correo por Gmail)"
```

---

### Task 2: Repository — resolución de dueño, verificación y conteo diario de Gmail

**Files:**
- Modify: `app/db/repository.ts`
- Create: `app/db/repository.gmailEnvio.test.ts`

- [ ] **Step 1: Escribir la prueba (roja)**

Create `app/db/repository.gmailEnvio.test.ts`:

```ts
// Gmail Etapa 2 (2026-07-15): funciones de resolucion dueno<->Gmail y conteo diario
// que usa registro-envio.ts para armar los grupos de push por adaptador.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  gmailVerificadoDe,
  idUsuarioDeOwner,
  marcarCampanaAprobadaGmail,
  enviosGmailHoy,
  crearCadencia,
  guardarSegmento,
  crearCampana,
  fijarOwnerCampana,
  crearPasoInscripcionPendiente,
  marcarPasoInscripcionEnviada,
  inscribirCampana,
  destinatariosDeInscripcion,
  historialInscripciones,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedOrganizacionMiembro(idOrganizacion: number, ownerCanonico: string, idUser: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (?, ?, ?, ?)`,
  ).run(idOrganizacion, ownerCanonico, ownerCanonico, idUser);
  db.close();
}

function seedConector(proveedor: string, idUsuario: string, ultimoResultado: string | null) {
  const db = raw();
  db.prepare(
    `INSERT INTO conector (proveedor, id_usuario, credencial_ciphertext, estado, ultimo_resultado) VALUES (?, ?, 'x', 'con_credencial', ?)`,
  ).run(proveedor, idUsuario, ultimoResultado);
  db.close();
}

seedOrganizacionMiembro(1, 'Ana Gmail', 'user-ana');
seedOrganizacionMiembro(1, 'Beto SinGmail', 'user-beto');
seedConector('gmail', 'user-ana', 'ok');
seedConector('gmail', 'user-beto', 'error: credencial invalida');

test('idUsuarioDeOwner resuelve owner_canonico -> id_user dentro de la organizacion', () => {
  assert.equal(idUsuarioDeOwner('Ana Gmail', 1), 'user-ana');
});

test('idUsuarioDeOwner con owner null devuelve null', () => {
  assert.equal(idUsuarioDeOwner(null, 1), null);
});

test('idUsuarioDeOwner con owner que no existe en esa organizacion devuelve null', () => {
  assert.equal(idUsuarioDeOwner('Ana Gmail', 2), null);
});

test('gmailVerificadoDe es true solo con credencial Y ultimo_resultado=ok', () => {
  assert.equal(gmailVerificadoDe('user-ana'), true);
  assert.equal(gmailVerificadoDe('user-beto'), false);
  assert.equal(gmailVerificadoDe('user-sin-conector'), false);
});

// -- marcarCampanaAprobadaGmail + enviosGmailHoy: necesitan una campana/inscripcion real --
const idCadencia = crearCadencia({ nombre: 'C gmail', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 'gmail-seg', definicion: { condiciones: [] } }, 1);
const idCampana = crearCampana({ nombre: 'Camp gmail', idCadencia, idSegmento }, 1);
fijarOwnerCampana(idCampana, 'Ana Gmail');

test('marcarCampanaAprobadaGmail deja la columna en 1', () => {
  marcarCampanaAprobadaGmail(idCampana);
  const db = raw();
  const fila = db.prepare('SELECT aprobada_envio_gmail FROM campana WHERE id_campana = ?').get(idCampana) as any;
  db.close();
  assert.equal(fila.aprobada_envio_gmail, 1);
});

test('enviosGmailHoy cuenta solo pasos enviados por gmail, hoy, del dueno resuelto', () => {
  const hoy = new Date().toISOString();

  assert.equal(enviosGmailHoy('user-ana', 1, hoy.slice(0, 10)), 0);

  const db = raw();
  const empresaId = 'e-gmail-conteo';
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id) VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'cat', 1)`,
  ).run(empresaId, empresaId, empresaId.toLowerCase());
  db.close();

  const idInscripcion = inscribirCampana(idCampana, 1).idsCreados[0];
  const idDestinatario = destinatariosDeInscripcion(idInscripcion)[0]?.id;
  assert.ok(idDestinatario, 'la inscripcion deberia tener al menos un destinatario');

  const idPaso1 = crearPasoInscripcionPendiente({ idDestinatario, idPaso: 1, idVersion: 1, canal: 'correo' });
  marcarPasoInscripcionEnviada(idPaso1, 'gmail', 'msg-1', hoy);

  assert.equal(enviosGmailHoy('user-ana', 1, hoy.slice(0, 10)), 1);
  assert.equal(enviosGmailHoy('user-beto', 1, hoy.slice(0, 10)), 0, 'no cuenta envios de otro dueno');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

NOTA para quien implemente: si `inscribirCampana`/`destinatariosDeInscripcion`/
`crearPasoInscripcionPendiente` no aceptan exactamente estas firmas o formas de
retorno, lee `app/db/repository.tracking.test.ts` y `app/db/repository.colaUnificada.test.ts`
(ya en el repo) para copiar el patrón exacto de seed que ya usan — no inventes una
firma nueva, usa la que ya existe. Si la campaña de esta prueba necesita un segmento
que realmente matchee la empresa sembrada (algunos helpers de `guardarSegmento`
exigen `condiciones` no vacías), copia el patrón de `guardarSegmento` que ya usa
`repository.tracking.test.ts`, no dejes `condiciones: []` si eso rompe el matching real.

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.gmailEnvio.test.ts`
Expected: FAIL — ninguna de las 4 funciones existe todavía.

- [ ] **Step 3: Implementar las cuatro funciones**

En `app/db/repository.ts`, después de `lineaWhatsappActivaDeOwner` (busca esa función,
agrega el bloque nuevo justo después de su cierre):

```ts
// Gmail Etapa 2 (2026-07-15): mismo mapeo owner_canonico -> id_user que ya usa
// lineaWhatsappActivaDeOwner para whatsapp, generalizado para correo. Funcion propia
// (no reusa la de whatsapp) para no tocar codigo de whatsapp ya aprobado -- la
// duplicacion es 6 lineas, el riesgo de romper whatsapp no vale la pena ahorrarselas.
export function idUsuarioDeOwner(owner: string | null, idOrganizacion: number): string | null {
  if (!owner) return null;
  const miembro = db
    .select({ idUser: organizacionMiembro.idUser })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.ownerCanonico, owner), eq(organizacionMiembro.idOrganizacion, idOrganizacion)))
    .get();
  return miembro?.idUser ?? null;
}

// "Verdadero-Configurado" (spec Etapa 2): tiene credencial Y la ultima verificacion
// real dio 'ok'. Mismo criterio que ya usa GmailConector.tsx en la UI
// (estado.ultimoResultado === 'ok') -- no un estado nuevo, solo lo expone al backend.
export function gmailVerificadoDe(idUsuario: string): boolean {
  const e = estadoConector('gmail', idUsuario);
  return e.tieneCredencial && e.ultimoResultado === 'ok';
}

export function marcarCampanaAprobadaGmail(idCampana: number): void {
  db.update(campana).set({ aprobadaEnvioGmail: 1, updatedAt: new Date().toISOString() }).where(eq(campana.idCampana, idCampana)).run();
}

// Tope diario por CUENTA de Gmail (no por campana -- una cuenta puede mandar correo
// de varias campanas del mismo dueno el mismo dia, el limite es de la cuenta real).
// Cuenta pasos 'enviada' con proveedor='gmail' de campanas cuyo owner resuelve a este
// idUsuario, con fecha_enviada de hoy. hoy en formato YYYY-MM-DD (mismo criterio que
// el resto del repository, ver kpisPipeline.entrandoHoy).
export function enviosGmailHoy(idUsuario: string, idOrganizacion: number, hoy: string): number {
  const miembro = db
    .select({ owner: organizacionMiembro.ownerCanonico })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idUser, idUsuario), eq(organizacionMiembro.idOrganizacion, idOrganizacion)))
    .get();
  if (!miembro?.owner) return 0;

  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(pasoInscripcion.proveedor, 'gmail'),
        eq(pasoInscripcion.estado, 'enviada'),
        eq(campana.owner, miembro.owner),
        sql`substr(${pasoInscripcion.fechaEnviada}, 1, 10) = ${hoy}`,
      ),
    )
    .get();
  return fila?.n ?? 0;
}
```

Todas las tablas/operadores usados (`organizacionMiembro`, `campana`, `pasoInscripcion`,
`destinatario`, `inscripcion`, `and`, `eq`, `sql`) ya están importados en este archivo —
no agregues imports nuevos.

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.gmailEnvio.test.ts`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.gmailEnvio.test.ts
git commit -m "feat(db): idUsuarioDeOwner, gmailVerificadoDe, marcarCampanaAprobadaGmail, enviosGmailHoy"
```

---

### Task 3: Gate de correo condicional a Gmail verificado

**Files:**
- Modify: `app/core/readiness-canal-usuario.ts`
- Modify: `app/core/readiness-canal-usuario.test.ts`

- [ ] **Step 1: Escribir la prueba (roja)**

Reemplaza TODO el contenido de `app/core/readiness-canal-usuario.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessCanalUsuario } from './readiness-canal-usuario.ts';

test('correo bloquea si el usuario no tiene Gmail verificado', () => {
  const veredicto = readinessCanalUsuario('correo', true, false);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'Conecta tu Gmail en Conectores antes de lanzar una cadencia de correo (o pide que alguien con Gmail conectado la lance).',
    accion: 'ir_a_conectores',
  });
});

test('correo pasa si el usuario tiene Gmail verificado', () => {
  assert.deepEqual(readinessCanalUsuario('correo', false, true), { listo: true });
});

test('llamada nunca bloquea', () => {
  assert.deepEqual(readinessCanalUsuario('llamada', false, false), { listo: true });
});

test('whatsapp bloquea si el usuario no tiene linea activa propia', () => {
  const veredicto = readinessCanalUsuario('whatsapp', false, false);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.',
    accion: 'ir_a_conectores',
  });
});

test('whatsapp pasa si el usuario tiene linea activa propia', () => {
  assert.deepEqual(readinessCanalUsuario('whatsapp', true, false), { listo: true });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/readiness-canal-usuario.test.ts`
Expected: FAIL — `readinessCanalUsuario` toma 2 argumentos hoy, no 3; y el motivo de
correo cambió.

- [ ] **Step 3: Implementar**

Reemplaza TODO el contenido de `app/core/readiness-canal-usuario.ts`:

```ts
import type { Canal } from '../db/validation.ts';

// Gate de "este usuario tiene el canal listo A SU NOMBRE" -- eje distinto de
// canales-empresa.ts (que responde si la EMPRESA destino tiene el dato de contacto).
// Puro: quien llama (server action) ya resolvio tieneLineaWhatsappActiva/
// tieneGmailVerificado contra la DB y lo pasa resuelto -- el core no importa el
// driver de DB (CLAUDE.md).
export type VeredictoCanal =
  | { listo: true }
  | { listo: false; motivo: string; accion: 'ir_a_conectores' | 'hablar_con_admin' };

// Gmail Etapa 2 (2026-07-15): antes esto bloqueaba correo SIEMPRE (el buzon
// compartido de Apollo a nombre de otra persona era el unico camino -- problema de
// confianza con el prospecto). Ahora que cada usuario puede conectar su propio Gmail,
// el gate se abre SOLO para quien lo tiene verificado -- sin Gmail propio, sigue
// bloqueado (decision explicita de Sebastian, 2026-07-15): abrirlo sin excepcion
// reabriria el mismo problema de confianza que motivo separar Gmail de Apollo.
const MOTIVO_CORREO =
  'Conecta tu Gmail en Conectores antes de lanzar una cadencia de correo (o pide que alguien con Gmail conectado la lance).';
const MOTIVO_WHATSAPP =
  'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.';

export function readinessCanalUsuario(canal: Canal, tieneLineaWhatsappActiva: boolean, tieneGmailVerificado: boolean): VeredictoCanal {
  if (canal === 'correo') return tieneGmailVerificado ? { listo: true } : { listo: false, motivo: MOTIVO_CORREO, accion: 'ir_a_conectores' };
  if (canal === 'llamada') return { listo: true };
  // whatsapp
  return tieneLineaWhatsappActiva ? { listo: true } : { listo: false, motivo: MOTIVO_WHATSAPP, accion: 'ir_a_conectores' };
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/readiness-canal-usuario.test.ts`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite (el call site real en lanzarCampanaAction queda roto hasta el Task 7 — esperado)**

Run: `npx tsc --noEmit`
Expected: UN error, en `app/campanas/[id]/lanzar/actions.ts` (llamada a
`readinessCanalUsuario` con solo 2 argumentos). Es el gap esperado que cierra el Task 7.
Confirma que no hay OTROS errores.

- [ ] **Step 6: Commit**

```bash
git add app/core/readiness-canal-usuario.ts app/core/readiness-canal-usuario.test.ts
git commit -m "feat(readiness): correo listo solo con Gmail verificado (antes bloqueaba siempre)"
```

---

### Task 4: `push.ts` — throttle opcional entre envíos

**Files:**
- Modify: `app/core/push.ts`
- Modify: `app/core/push.test.ts`

- [ ] **Step 1: Escribir la prueba (roja)**

En `app/core/push.test.ts`, agrega al final del archivo (antes de cualquier
`test.after` si lo hay):

```ts
test('con throttleMs>0, espera entre envios consecutivos (no rafaga)', async () => {
  const iniciales = [filaBase(1, 'ana@empresa.com'), filaBase(2, 'beto@empresa.com')];
  const { deps } = depsFalsos(iniciales);
  const envio = envioFalso(() => true);

  const inicio = Date.now();
  await pushPendientes(deps, envio, new Date(), 50);
  const duracion = Date.now() - inicio;

  assert.equal(envio.llamadas.length, 2);
  assert.ok(duracion >= 50, `deberia tardar al menos 50ms por el throttle entre los 2 envios, tardo ${duracion}ms`);
});

test('sin throttleMs (default), no espera entre envios', async () => {
  const iniciales = [filaBase(1, 'ana@empresa.com'), filaBase(2, 'beto@empresa.com')];
  const { deps } = depsFalsos(iniciales);
  const envio = envioFalso(() => true);

  const inicio = Date.now();
  await pushPendientes(deps, envio);
  const duracion = Date.now() - inicio;

  assert.ok(duracion < 50, `sin throttle no deberia tardar casi nada, tardo ${duracion}ms`);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/push.test.ts`
Expected: FAIL en el primer test nuevo (hoy `pushPendientes` no espera nada entre
envíos, así que `duracion >= 50` falla).

- [ ] **Step 3: Implementar**

En `app/core/push.ts`, agrega un helper de espera y el parámetro nuevo a
`pushPendientes`:

```ts
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pushPendientes(deps: PushDeps, envio: CanalEntrega, ahora: Date = new Date(), throttleMs: number = 0): Promise<void> {
  let primero = true;
  for (const fila of deps.pendientes()) {
    if (!primero && throttleMs > 0) await esperar(throttleMs);
    primero = false;
    try {
      deps.marcarEnviando(fila.idPasoInscripcion);
      const resultado = await envio.enviarPaso(fila.proveedorCampanaId, fila.destinatario, fila.paso);
      deps.marcarEnviada(fila.idPasoInscripcion, resultado.proveedor, resultado.proveedorMensajeId, ahora.toISOString());
    } catch (e) {
      console.error(`push falló para paso_inscripcion ${fila.idPasoInscripcion}:`, e instanceof Error ? e.message : e);
      const intentos = fila.intentos + 1;
      const agotado = intentos >= MAX_INTENTOS;
      deps.marcarFallo(
        fila.idPasoInscripcion,
        intentos,
        agotado ? null : calcularProximoIntentoPush(intentos, ahora).toISOString(),
      );
    }
  }
}
```

(Solo cambia la firma de la función y agrega el `if (!primero && throttleMs > 0) await esperar(throttleMs); primero = false;`
al inicio del loop, más el helper `esperar` arriba de la función. El resto del cuerpo
del `for` queda idéntico.)

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/push.test.ts`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS (todos los callers existentes de `pushPendientes` siguen funcionando —
`throttleMs` es opcional con default 0, cero comportamiento nuevo para whatsapp/Apollo).

- [ ] **Step 6: Commit**

```bash
git add app/core/push.ts app/core/push.test.ts
git commit -m "feat(push): throttleMs opcional entre envios consecutivos (para Gmail)"
```

---

### Task 5: `pasoInscripcionesPendientes('correo')` proyecta owner/organización/aprobación

**Files:**
- Modify: `app/core/push.ts` (tipo `FilaPasoInscripcion`)
- Modify: `app/db/repository.ts` (`pasoInscripcionesPendientes`)
- Create: `app/db/repository.pasoInscripcionesPendientesCorreo.test.ts` — busca primero
  con `grep -rn "pasoInscripcionesPendientes" app/db/*.test.ts` si ya hay un archivo
  que la cubre; si lo hay, agrega ahí en vez de crear uno nuevo.

- [ ] **Step 1: Extender el tipo (aditivo, campos opcionales)**

En `app/core/push.ts`, cambia:

```ts
export type FilaPasoInscripcion = {
  idPasoInscripcion: number;
  proveedorCampanaId: string;
  destinatario: DestinatarioEnvio;
  paso: PasoEnvio;
  intentos: number;
};
```

por:

```ts
export type FilaPasoInscripcion = {
  idPasoInscripcion: number;
  proveedorCampanaId: string;
  destinatario: DestinatarioEnvio;
  paso: PasoEnvio;
  intentos: number;
  // Gmail Etapa 2 (2026-07-15): opcionales, solo poblados por
  // pasoInscripcionesPendientes('correo', ...) -- whatsapp/llamada no los necesitan.
  // Los usa registro-envio.ts (agruparPendientesCorreo) para resolver el adaptador de
  // CADA fila sin que push.ts tenga que saber que Gmail existe.
  owner?: string | null;
  idOrganizacion?: number;
  aprobadaEnvioGmail?: boolean;
};
```

- [ ] **Step 2: Escribir la prueba (roja) para el repository**

Create `app/db/repository.pasoInscripcionesPendientesCorreo.test.ts` (o agrega a un
archivo existente si el grep del Step anterior encontró uno):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  pasoInscripcionesPendientes,
  crearCadencia,
  guardarSegmento,
  crearCampana,
  fijarOwnerCampana,
  guardarProveedorCampanaId,
  inscribirCampana,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string, email: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, organizacion_activa_id) VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, 1)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES (?, 'Contacto', 0, 1, ?, 'seed')`,
  ).run(id, email);
  db.close();
}

seedEmpresa('e-pend-1', 'pend-cat-1', 'ana@empresa.com');

const idCadencia = crearCadencia({ nombre: 'C pend', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 'pend-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['pend-cat-1'] }] } }, 1);
const idCampana = crearCampana({ nombre: 'Camp pend', idCadencia, idSegmento }, 1);
fijarOwnerCampana(idCampana, 'Ana Gmail');
guardarProveedorCampanaId(idCampana, 'gmail-camp-1', 1);
inscribirCampana(idCampana, 1);

test('pasoInscripcionesPendientes(correo) proyecta owner, idOrganizacion y aprobadaEnvioGmail', () => {
  const filas = pasoInscripcionesPendientes('correo');
  assert.ok(filas.length > 0, 'deberia haber al menos una fila pendiente');
  const fila = filas[0];
  assert.equal(fila.owner, 'Ana Gmail');
  assert.equal(fila.idOrganizacion, 1);
  assert.equal(fila.aprobadaEnvioGmail, false, 'aprobada_envio_gmail default es 0 -- sin marcar todavia');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 3: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.pasoInscripcionesPendientesCorreo.test.ts`
Expected: FAIL — `fila.owner`/`fila.idOrganizacion`/`fila.aprobadaEnvioGmail` son
`undefined`.

- [ ] **Step 4: Implementar**

En `app/db/repository.ts`, dentro de `pasoInscripcionesPendientes`, agrega
`aprobadaEnvioGmail: campana.aprobadaEnvioGmail` al `select` (junto a `owner` e
`idOrganizacion`, que YA se seleccionan hoy):

```ts
  const filas = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      intentos: pasoInscripcion.intentos,
      canal: pasoInscripcion.canal,
      email: contacto.email,
      telefono: contacto.telefono,
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      empresaNombre: empresa.nombreOficial,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      proveedorCampanaId: campana.proveedorCampanaId,
      owner: campana.owner,
      idOrganizacion: campana.idOrganizacion,
      aprobadaEnvioGmail: campana.aprobadaEnvioGmail,
    })
    .from(pasoInscripcion)
```

Y en el `return` para `canal !== 'whatsapp'` (el bloque que arma `FilaPasoInscripcion[]`
directo), agrega los tres campos:

```ts
  if (canal !== 'whatsapp') {
    return filas.map((f) => ({
      idPasoInscripcion: f.idPasoInscripcion,
      proveedorCampanaId: f.proveedorCampanaId as string,
      destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
      paso: { asunto: f.asunto, cuerpo: f.cuerpo ?? '', canal: f.canal },
      intentos: f.intentos,
      owner: f.owner,
      idOrganizacion: f.idOrganizacion,
      aprobadaEnvioGmail: f.aprobadaEnvioGmail === 1,
    }));
  }
```

No toques el branch de `whatsapp` (el `for` que resuelve `lineaWhatsappActivaDeOwner`)
— esos campos son opcionales, whatsapp puede seguir sin poblarlos.

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.pasoInscripcionesPendientesCorreo.test.ts`
Expected: PASS.

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/core/push.ts app/db/repository.ts app/db/repository.pasoInscripcionesPendientesCorreo.test.ts
git commit -m "feat(db): pasoInscripcionesPendientes(correo) proyecta owner/organizacion/aprobacion"
```

---

### Task 6: `registro-envio.ts` — resolución y agrupación por adaptador de correo

**Files:**
- Modify: `app/adapters/registro-envio.ts`
- Modify: `app/adapters/registro-envio.test.ts`

★ Insight ─────────────────────────────────────
Esta es la pieza que de verdad generaliza el patrón: `crearRegistroEnvio()` (arriba en
el mismo archivo) sigue devolviendo Apollo fijo para quien necesita el `EnvioAdapter`
completo (campañas/tracking) — eso NO cambia. `resolverAdaptadorCorreo` es una función
NUEVA y aparte, que solo entiende `CanalEntrega` (enviar), porque es lo único que
`push.ts` necesita. Mantenerlas separadas es lo que evita que Gmail (que no tiene
`MotorSecuencia`) tenga que fingir que sí lo tiene.
─────────────────────────────────────────────────

- [ ] **Step 1: Escribir la prueba (roja)**

En `app/adapters/registro-envio.test.ts`, agrega al import existente de
`crearRegistroEnvio, CANALES_AUTOMATICOS` los dos nombres nuevos (no crees un segundo
bloque de imports):

```ts
import { crearRegistroEnvio, CANALES_AUTOMATICOS, resolverAdaptadorCorreo, agruparPendientesCorreo } from './registro-envio.ts';
```

Agrega al final del archivo:

```ts
test('resolverAdaptadorCorreo: sin idUsuario (dueno viejo, null) cae a Apollo', () => {
  const adapter = resolverAdaptadorCorreo(null);
  assert.equal(typeof adapter.enviarPaso, 'function');
});

test('agruparPendientesCorreo agrupa por adaptador resuelto: gmail aprobado, apollo fallback, gmail sin aprobar se excluye', () => {
  const filas = [
    { idPasoInscripcion: 1, proveedorCampanaId: 'gmail-camp-1', destinatario: { email: 'a@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Ana Gmail', idOrganizacion: 1, aprobadaEnvioGmail: true },
    { idPasoInscripcion: 2, proveedorCampanaId: 'gmail-camp-1', destinatario: { email: 'b@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Ana Gmail', idOrganizacion: 1, aprobadaEnvioGmail: true },
    { idPasoInscripcion: 3, proveedorCampanaId: 'seq-apollo-1', destinatario: { email: 'c@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Beto SinGmail', idOrganizacion: 1, aprobadaEnvioGmail: false },
    { idPasoInscripcion: 4, proveedorCampanaId: 'gmail-camp-2', destinatario: { email: 'd@x.com', telefono: null, nombre: null, empresa: null, cargo: null }, paso: { asunto: 'x', cuerpo: 'x', canal: 'correo' }, intentos: 0, owner: 'Cami SinAprobar', idOrganizacion: 1, aprobadaEnvioGmail: false },
  ];

  const grupos = agruparPendientesCorreo(new Date().toISOString(), {
    pendientes: () => filas,
    idUsuarioDeOwner: (owner) => (owner === 'Ana Gmail' ? 'user-ana' : owner === 'Cami SinAprobar' ? 'user-cami' : null),
    gmailVerificado: (idUsuario) => idUsuario === 'user-ana' || idUsuario === 'user-cami',
    crearGmail: (idUsuario) => ({ enviarPaso: async () => ({ proveedor: 'gmail', proveedorMensajeId: `msg-${idUsuario}` }) }),
    crearApollo: () => ({ enviarPaso: async () => ({ proveedor: 'apollo', proveedorMensajeId: 'msg-apollo' }) }),
  });

  const todasLasFilas = grupos.flatMap((g) => g.filas.map((f) => f.idPasoInscripcion));
  assert.deepEqual(todasLasFilas.sort(), [1, 2, 3]);

  const grupoAna = grupos.find((g) => g.filas.some((f) => f.idPasoInscripcion === 1));
  assert.equal(grupoAna?.filas.length, 2, 'las 2 filas de Ana van al mismo grupo (mismo adaptador)');

  const grupoBeto = grupos.find((g) => g.filas.some((f) => f.idPasoInscripcion === 3));
  assert.equal(grupoBeto?.filas.length, 1);
  assert.notEqual(grupoBeto, grupoAna, 'Beto (Apollo, sin Gmail) va en un grupo distinto al de Ana (Gmail)');
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/registro-envio.test.ts`
Expected: FAIL — `resolverAdaptadorCorreo`/`agruparPendientesCorreo` no existen.

- [ ] **Step 3: Implementar**

En `app/adapters/registro-envio.ts`, revisa primero los imports actuales del archivo
(léelo completo) para no duplicar ninguno. Agrega los que falten y las dos funciones
al final del archivo:

```ts
import { crearGmailAdapter } from './gmail';
import { gmailVerificadoDe, idUsuarioDeOwner, pasoInscripcionesPendientes } from '../db/repository';
import type { FilaPasoInscripcion } from '../core/push';
```

```ts
// Gmail Etapa 2 (2026-07-15): resuelve el adaptador de CORREO para un dueno puntual.
// Gmail verificado -> Gmail propio; sin Gmail o dueno null (campana vieja) -> Apollo,
// mismo fallback que ya describe el spec. Solo CanalEntrega (enviar) -- push.ts nunca
// necesita crearCampanaExterna/sincronizarCopy/aprobarSecuencia de correo, eso lo
// sigue resolviendo crearRegistroEnvio() (arriba) para quien de verdad lo necesita
// (campanas/actions.ts, tareaTracking).
export function resolverAdaptadorCorreo(idUsuarioDueno: string | null): CanalEntrega {
  if (idUsuarioDueno && gmailVerificadoDe(idUsuarioDueno)) return crearGmailAdapter(idUsuarioDueno);
  return crearApolloAdapter();
}

export type GrupoPendientesCorreo = { adaptador: CanalEntrega; idUsuarioGmail: string | null; filas: FilaPasoInscripcion[] };

export type DepsAgruparCorreo = {
  pendientes: (ahora: string) => FilaPasoInscripcion[];
  idUsuarioDeOwner: (owner: string | null, idOrganizacion: number) => string | null;
  gmailVerificado: (idUsuario: string) => boolean;
  crearGmail: (idUsuario: string) => CanalEntrega;
  crearApollo: () => CanalEntrega;
};

const depsAgruparCorreoReales: DepsAgruparCorreo = {
  pendientes: (ahora) => pasoInscripcionesPendientes('correo', ahora),
  idUsuarioDeOwner,
  gmailVerificado: gmailVerificadoDe,
  crearGmail: crearGmailAdapter,
  crearApollo: crearApolloAdapter,
};

// Agrupa las filas de correo pendientes por ADAPTADOR RESUELTO (una entrada por Gmail
// de un dueno distinto + una entrada "apollo" que junta a todos los que caen a
// fallback), no por campana -- dos campanas del mismo dueno con Gmail comparten un
// solo grupo/una sola llamada a pushPendientes. El gate de aprobacion (piece 4 del
// spec) vive aca: una fila cuyo dueno resuelve a Gmail pero aprobadaEnvioGmail=false
// se descarta ENTERA (no sale, ni por Gmail ni por Apollo -- si el dueno tiene Gmail,
// Apollo no es un fallback valido para SU secuencia, ver decision del plan).
export function agruparPendientesCorreo(ahora: string = new Date().toISOString(), deps: DepsAgruparCorreo = depsAgruparCorreoReales): GrupoPendientesCorreo[] {
  const filas = deps.pendientes(ahora);
  const grupos = new Map<string, GrupoPendientesCorreo>();

  for (const f of filas) {
    const idUsuario = deps.idUsuarioDeOwner(f.owner ?? null, f.idOrganizacion ?? 0);
    const esGmail = idUsuario ? deps.gmailVerificado(idUsuario) : false;

    if (esGmail && !f.aprobadaEnvioGmail) continue; // gate: sin aprobar, esta fila no sale

    const key = esGmail ? `gmail:${idUsuario}` : 'apollo';
    if (!grupos.has(key)) {
      grupos.set(key, {
        adaptador: esGmail ? deps.crearGmail(idUsuario!) : deps.crearApollo(),
        idUsuarioGmail: esGmail ? idUsuario! : null,
        filas: [],
      });
    }
    grupos.get(key)!.filas.push(f);
  }

  return [...grupos.values()];
}
```

`CanalEntrega` y `crearApolloAdapter` ya están importados en el archivo (los usa
`crearRegistroEnvio`) — no los dupliques.

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/registro-envio.test.ts`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/adapters/registro-envio.ts app/adapters/registro-envio.test.ts
git commit -m "feat(registro-envio): resolverAdaptadorCorreo + agruparPendientesCorreo (Gmail/Apollo por dueno)"
```

---

### Task 7: `lanzarCampanaAction` — saltar Apollo si el dueño tiene Gmail, marcar aprobación

**Files:**
- Modify: `app/campanas/[id]/lanzar/actions.ts`

★ Insight ─────────────────────────────────────
El punto delicado de esta tarea: `campana.proveedor_campana_id` no es "el id de Apollo",
es el correlator que usa TODO el tracking (`resolverDestinatarioPorEmail` en
`core/tracking.ts` correlaciona por `(proveedorCampanaId, email)` sin preguntar quién
lo generó). Saltarse Apollo para Gmail no puede significar "dejar esa columna en
null" — el pixel/link de tracking y el poll de respuestas dejarían de correlacionar
nada. Por eso el valor sintético (`gmail-camp-<id>`) no es un detalle cosmético, es lo
que mantiene el tracking funcionando igual para los dos proveedores.
─────────────────────────────────────────────────

- [ ] **Step 1: Leer el archivo primero, luego modificar el gate de readiness**

Lee `app/campanas/[id]/lanzar/actions.ts` completo antes de editar. Agrega
`gmailVerificadoDe` y `marcarCampanaAprobadaGmail` al import existente de
`'../../../db/repository'` (junto a `fijarOwnerCampana` etc.), y cambia el bloque del
gate:

```ts
    const canales = canalesDeCadencia(camp.idCadencia);
    const tieneLineaWhatsapp = lineasWhatsappDeUsuario(sesion.id).some((l) => l.estado === 'activa');
    const tieneGmailVerificado = gmailVerificadoDe(sesion.id);
    for (const canal of canales) {
      const veredicto = readinessCanalUsuario(canal, tieneLineaWhatsapp, tieneGmailVerificado);
      if (!veredicto.listo) return { ok: false, error: veredicto.motivo };
    }
```

- [ ] **Step 2: Bifurcar el bloque de secuencia externa**

Reemplaza el bloque `try { ... } catch (e) { avisoSecuenciaExterna = ... }` que crea la
secuencia de Apollo (busca `const adapter = crearRegistroEnvio().correo;`) por:

```ts
    // La campana YA quedo inscrita en la DB local en este punto (fuente de la verdad).
    let avisoSecuenciaExterna: string | undefined;
    try {
      const camp = campanaParaLanzar(idCampana, sesion.idOrganizacion);
      const pasos = camp ? pasosParaSincronizarCopy(camp.idCadencia) : [];

      if (camp && pasos.length > 0) {
        if (tieneGmailVerificado) {
          // Gmail Etapa 2: no hay secuencia externa que crear (Gmail no implementa
          // MotorSecuencia). El id sintetico sigue siendo el correlator que necesita
          // el tracking (pixel/link/respuestas), aunque no venga de Apollo. El click
          // de "Lanzar hoy" ES la aprobacion explicita -- misma convencion real que ya
          // usa Apollo (aprobarSecuencia se llama automatico aca mismo, sin un boton
          // separado), no la de un spec que describia un flujo que nunca se construyo.
          guardarProveedorCampanaId(idCampana, `gmail-camp-${idCampana}`, sesion.idOrganizacion);
          marcarCampanaAprobadaGmail(idCampana);
        } else {
          // Sesion 2026-07-09: la secuencia externa es, por definicion, el track de
          // correo de la cadencia -- se resuelve por el registro (registro-envio.ts), no
          // por Apollo directo. Si "correo" no tiene proveedor registrado (no deberia
          // pasar hoy, es el unico canal automatico), se avisa igual que cualquier otro
          // fallo en vez de asumir que Apollo siempre esta ahi.
          const adapter = crearRegistroEnvio().correo;
          if (adapter) {
            const proveedorCampanaId = await adapter.crearCampanaExterna(camp.nombre);
            guardarProveedorCampanaId(idCampana, proveedorCampanaId, sesion.idOrganizacion);

            // Subir el copy aqui mismo es lo que hace que abrir la secuencia en Apollo ya
            // muestre los pasos reales de la cadencia, no una secuencia en blanco.
            const sincronizados = await adapter.sincronizarCopy(proveedorCampanaId, pasos);
            guardarSincronizacionCopy(sincronizados);

            // Sin approve la secuencia queda creada y con copy pero Apollo NUNCA manda el
            // correo real -- approve es lo que dispara el envio (idempotente del lado de Apollo).
            await adapter.aprobarSecuencia(proveedorCampanaId);
          }
        }
      }
    } catch (e) {
      avisoSecuenciaExterna = `la campaña se lanzó pero no se pudo crear/sincronizar la secuencia en Apollo: ${
        e instanceof Error ? e.message : String(e)
      }`;
    }
```

Todo lo demás en `lanzarCampanaAction` (el bloque de `materializarYEmpujarAhora` que
sigue después, el `revalidatePath`, el `return`) queda exactamente igual.

- [ ] **Step 3: Correr toda la suite**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: zero errors (esto cierra el gap de tipo que quedó abierto desde el Task 3).

- [ ] **Step 4: Verificación manual (no hay tests de server actions con DB real para este archivo)**

Revisa `app/campanas` en busca de un `.test.ts` para `lanzarCampanaAction` — si existe
uno ya, agrega un caso: dueño con Gmail verificado → NO se crea `proveedorCampanaId`
de Apollo, sí queda `aprobada_envio_gmail=1` y `proveedor_campana_id='gmail-camp-<id>'`.
Si no existe ese archivo de pruebas de server action, documenta en tu reporte que la
verificación quedó manual/por inspección, consistente con el resto de
`campanas/[id]/lanzar/actions.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/campanas/\[id\]/lanzar/actions.ts
git commit -m "feat(campanas): lanzar salta Apollo y aprueba Gmail automatico cuando el dueno tiene Gmail"
```

---

### Task 8: Worker — push de correo por grupo, con tope diario y throttle

**Files:**
- Modify: `app/worker/index.ts`

- [ ] **Step 1: Leer el archivo primero**

Antes de editar, lee `app/worker/index.ts` completo (o al menos desde el import hasta
`tareaPush` y el arreglo de tareas al final) para confirmar los nombres exactos de
import y el punto donde `tareaPush('correo', ...)` se agrega al arreglo de tareas del
worker — el plan asume la forma que se leyó durante el diseño de este plan, pero
verifica antes de editar a ciegas.

- [ ] **Step 2: Agregar imports nuevos**

Agrega al import existente de `'../db/repository'`:

```ts
  leerConfiguracionAdmin,
  enviosGmailHoy,
```

Agrega un import nuevo:

```ts
import { agruparPendientesCorreo } from '../adapters/registro-envio';
```

- [ ] **Step 3: Escribir `tareaPushCorreo`**

Agrega esta función nueva, cerca de `tareaPush` (después de su definición):

```ts
// Gmail Etapa 2 (2026-07-15): correo YA NO es "un proveedor, una llamada a
// pushPendientes" (a diferencia de whatsapp/llamada, que siguen usando tareaPush tal
// cual) -- puede haber un grupo por cada dueno con Gmail propio + un grupo Apollo que
// junta a todos los que caen a fallback. agruparPendientesCorreo ya resolvio y agrupo;
// esta funcion solo itera, aplicando tope diario + throttle SOLO a los grupos Gmail
// (Apollo no tiene esos limites, los maneja Apollo del otro lado).
const GMAIL_TOPE_DIARIO_DEFAULT = 300; // conservador a proposito, no el limite oficial de Workspace (~2000)
const GMAIL_THROTTLE_MS_DEFAULT = 3000;

function configGmailNumero(clave: string, porDefecto: number): number {
  const val = leerConfiguracionAdmin(clave);
  const n = val ? Number(val) : NaN;
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

async function tareaPushCorreo(): Promise<void> {
  const ahora = new Date();
  const topeDiario = configGmailNumero('gmail_tope_diario', GMAIL_TOPE_DIARIO_DEFAULT);
  const throttleMs = configGmailNumero('gmail_throttle_ms', GMAIL_THROTTLE_MS_DEFAULT);

  for (const grupo of agruparPendientesCorreo(ahora.toISOString())) {
    let filas = grupo.filas;
    let throttle = 0;

    if (grupo.idUsuarioGmail) {
      // Tope diario es POR CUENTA de Gmail (no por campana): si ya mando 250 de un
      // tope de 300, le quedan 50 en este ciclo -- no es todo-o-nada, las filas que
      // no alcanzan quedan 'pendiente' para el siguiente ciclo del worker (mismo
      // mecanismo de reintento que ya existe, no se pierden ni marcan fallo).
      const yaEnviados = enviosGmailHoy(grupo.idUsuarioGmail, filas[0]?.idOrganizacion ?? 0, ahora.toISOString().slice(0, 10));
      const restante = topeDiario - yaEnviados;
      if (restante <= 0) continue; // tope alcanzado, este grupo no manda nada este ciclo
      filas = filas.slice(0, restante);
      throttle = throttleMs;
    }

    await pushPendientes(
      {
        pendientes: () => filas,
        marcarEnviando: marcarPasoInscripcionEnviando,
        marcarEnviada: marcarPasoInscripcionEnviada,
        marcarFallo: marcarPasoInscripcionFallo,
      },
      grupo.adaptador,
      ahora,
      throttle,
    );
  }
}
```

- [ ] **Step 4: Reemplazar el registro de la tarea de correo**

Busca dónde el arreglo de tareas del worker arma la entrada de correo (algo como
`{ nombre: \`push:correo\`, ..., ejecutar: () => tareaPush('correo', crearRegistroEntrega().correo) }`
dentro del loop que arma `{ nombre: \`push:${canal}\`, ... }` para cada canal de
`CANALES_AUTOMATICOS`). Sepáralo del loop genérico: 'whatsapp' sigue usando
`tareaPush` tal cual dentro del loop; 'correo' se saca del loop y se agrega como
entrada propia usando `tareaPushCorreo`.

Si el loop genérico hoy itera `CANALES_AUTOMATICOS` (`['correo', 'whatsapp']`) y arma
una entrada por canal automáticamente, cambia esa construcción para que solo itere
sobre `['whatsapp']` (o filtre `canal !== 'correo'`) y agrega una entrada manual
aparte:

```ts
    { nombre: 'push:correo', proveedorHeartbeat: 'push', ejecutar: tareaPushCorreo },
```

(Usa el mismo `proveedorHeartbeat` que ya usan las demás entradas de `push:${canal}`
— revisa el valor real en el archivo, no asumas `'push'` si el código usa otra
convención.)

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS. Revisa en particular `app/worker/worker.test.ts` — si prueba el
arreglo de tareas por nombre/heartbeat, puede necesitar un ajuste menor para reflejar
que 'push:correo' ahora es una entrada manual en vez de salir del loop genérico (mismo
heartbeat esperado, mismo nombre, así que no debería romper si el test solo verifica
comportamiento de heartbeat, no la forma interna del arreglo).

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add app/worker/index.ts
git commit -m "feat(worker): push de correo por grupo (Gmail por dueno + Apollo fallback), tope diario y throttle"
```

---

### Task 9: Checkpoint — colisión con otras sesiones tocando los mismos archivos

Antes de dar este plan por cerrado (mismo criterio ya usado en el plan del aviso de
respuesta, precedente real: `project_gmail_conector_etapa1_colision.md`,
`project_pipeline_colision_sesion_concurrente.md`):

- [ ] **Step 1:** `git fetch origin main` y `git log origin/main --oneline -15` —
      revisar si algún commit nuevo (posterior al punto donde arrancó este plan) toca
      `app/adapters/registro-envio.ts`, `app/db/repository.ts`, `app/core/push.ts`,
      `app/campanas/[id]/lanzar/actions.ts` o `app/worker/index.ts`.
- [ ] **Step 2:** Si hay overlap real, comparar contenido con `git diff` antes de
      mergear — no asumir que un lado gana por defecto.
- [ ] **Step 3:** Si no hay overlap, seguir normal.

---

## Self-Review

- **Cobertura del spec (Etapa 2, 4 piezas + compuerta + límites):**
  - Pieza 1 (poblar `campana.owner`): YA estaba resuelta antes de este plan
    (`fijarOwnerCampana` ya se llama en `lanzarCampanaAction`, verificado leyendo el
    código real) — el plan no repite trabajo ya hecho.
  - Pieza 2 (`resolverAdaptadorCorreo`): Task 6.
  - Pieza 3 (`pasoInscripcionesPendientes('correo')` agrupado por dueño): Task 5
    (proyección) + Task 6 (agrupación real, en `registro-envio.ts` para no romper la
    regla de capas — repository.ts nunca importa adaptadores).
  - Pieza 4 (`push.ts` itera por grupo): Task 8 — deliberadamente en `worker/index.ts`,
    no dentro de `push.ts` (que sigue sin saber que existe más de un adaptador de
    correo; itera quien ya iteraba adaptadores, el worker).
  - Compuerta de aprobación: Task 1 (columna) + Task 7 (se marca automático al lanzar,
    siguiendo la convención REAL del código, no la de un spec que describía una UI que
    nunca se construyó — desviación documentada explícitamente arriba).
  - Límites de cuenta (tope diario + throttle): Task 8, configurable vía
    `configuracion_admin` (mismo mecanismo ya usado para el buzón de Apollo), sin UI
    nueva de administración en v1 (YAGNI — se puede ajustar por SQL/consola hasta que
    haga falta una pantalla).
  - Gate de readiness: Task 3, decisión explícita de Sebastián documentada.
  - Prueba real end-to-end: Task 9 (renumerada como checkpoint de colisión) — la
    prueba real manual queda documentada en el criterio de éxito del spec original,
    sección "Etapa 2", y se ejecuta después de que Sebastián revise este plan.
- **Placeholders:** ninguno — cada step tiene código completo.
- **Consistencia de tipos:** `resolverAdaptadorCorreo(idUsuarioDueno: string | null): CanalEntrega`
  y `agruparPendientesCorreo`'s `DepsAgruparCorreo` coinciden en firma con
  `gmailVerificadoDe`/`idUsuarioDeOwner` tal como quedan definidas en el Task 2.
- **Riesgo real señalado explícitamente:** el hallazgo del `proveedorCampanaId`
  sintético (Task 7) — sin él, el tracking de Gmail se rompe en silencio para toda
  campaña Gmail.
- **Nota de proceso:** este plan se escribió originalmente por error en la rama
  `spec/carga-reconciliacion-notion` (branch de otra feature) y tuvo que recrearse
  aquí, en un worktree aislado desde `main` — ver la conversación para el detalle del
  incidente y su resolución (nada se perdió, el commit accidental se revirtió limpio).
