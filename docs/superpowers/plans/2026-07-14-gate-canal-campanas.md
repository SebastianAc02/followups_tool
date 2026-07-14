# Gate de canal en campañas + ruteo de WhatsApp por línea propia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear el lanzamiento de una cadencia cuando quien la lanza no tiene el canal
(correo/WhatsApp) listo a su nombre, y hacer que el envío real de WhatsApp use la línea PROPIA
del dueño de la campaña en vez de "cualquier línea activa del sistema".

**Architecture:** Una función pura nueva en `app/core/` decide si un canal está listo para un
usuario (sin tocar DB). `lanzarCampanaAction` la usa para bloquear el lanzamiento y, si pasa,
persiste quién lanzó (`campana.owner`, columna ya existente en el schema, nunca poblada hoy).
`pasoInscripcionesPendientes` (Repository) deja de resolver una sola línea de WhatsApp global
para todas las filas: resuelve la línea activa del DUEÑO de cada campaña, fila por fila. Nada
cambia en `push.ts` — el mecanismo de resolución por-fila que ya existe (`proveedorCampanaId`
calculado en el `.map()` final de `pasoInscripcionesPendientes`) es donde vive el cambio real.

**Tech Stack:** TypeScript, Drizzle ORM, better-sqlite3, Next.js server actions, node:test.

---

## Contexto real verificado (no asumir nada de esto, ya está confirmado leyendo el código)

- `campana.owner` (columna `owner TEXT`) YA EXISTE en `app/db/schema.ts:260` y YA está en
  `campanaInputSchema` (`app/db/validation.ts:202`, opcional). `crearCampana` (`app/db/
  repository.ts:1841`) ya la persiste si se la pasan. Lo que falta es que algo la POBLE al
  lanzar — hoy nunca se llama con `owner`.
- `pasoInscripcionesPendientes(canal, ahora)` en `app/db/repository.ts:3426-3544`: para
  whatsapp, hoy resuelve UNA `lineaActiva` global (`lineaWhatsappActiva()`) antes del query, y
  el `.map()` final le asigna esa MISMA referencia a `proveedorCampanaId` en TODAS las filas
  (línea 3540: `proveedorCampanaId: (lineaActiva ? lineaActiva.referenciaProveedor : f.
  proveedorCampanaId) as string`). Este plan cambia esa línea para resolver por dueño de
  campaña en vez de una vez global.
- `evolution.ts` (`enviarPaso(referenciaProveedor, destinatario, paso)`) ya es stateless
  respecto a qué línea usa — recibe la referencia como PRIMER ARGUMENTO en cada llamada. Por
  eso el cambio de ruteo vive ENTERO en `pasoInscripcionesPendientes`: `push.ts`/`pushPendientes`
  no necesitan tocarse, ya iteran fila por fila y le pasan a `enviarPaso` el
  `proveedorCampanaId` que trae cada fila.
- `organizacionDeUsuario`/`organizacion_miembro` mapean `owner_canonico` (texto, ej. "Felipe
  Castro") ↔ `id_user`. `lineasWhatsappDeUsuario(idUsuario)` (`app/db/repository.ts:3286`) ya
  filtra por usuario.
- `UsuarioSesion.owner` (`app/lib/session-user.ts`) ya trae el `owner_canonico` de quien está
  logueado — no hay que resolverlo de nuevo en `lanzarCampanaAction`.
- Test de referencia para todo lo de `pasoInscripcionesPendientes`: `app/db/
  repository.push.test.ts` (helpers `seedLineaWhatsapp`, `fijarEstadoLineaWhatsapp`, `raw()`
  para INSERT directo). `app/db/test-helpers.ts` ya crea las tablas `organizacion_miembro` y
  `linea_whatsapp` completas — no hace falta tocar el helper.

## File Structure

- Create: `app/core/readiness-canal-usuario.ts` — función pura del gate.
- Create: `app/core/readiness-canal-usuario.test.ts` — sus pruebas.
- Modify: `app/db/repository.ts` — nueva función `fijarOwnerCampana`, nueva función
  `lineaWhatsappActivaDeOwner`, reescribir `pasoInscripcionesPendientes` para whatsapp.
- Modify: `app/db/repository.push.test.ts` — pruebas del nuevo ruteo por dueño.
- Create: `app/db/repository.ownerCampana.test.ts` — pruebas de `fijarOwnerCampana` y
  `lineaWhatsappActivaDeOwner`.
- Modify: `app/campanas/[id]/lanzar/actions.ts` — integrar el gate + persistir owner en
  `lanzarCampanaAction`.
- Create: `app/campanas/[id]/lanzar/actions.test.ts` — si no existe ya, pruebas del gate en la
  action (ver Task 5, incluye chequeo de existencia primero).
- Create: `app/campanas/nueva/AvisoCanalUsuario.tsx` — banner de aviso no bloqueante.
- Modify: `app/campanas/nueva/page.tsx` — montar el banner.

---

### Task 1: Gate puro — `readinessCanalUsuario`

**Files:**
- Create: `app/core/readiness-canal-usuario.ts`
- Test: `app/core/readiness-canal-usuario.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/core/readiness-canal-usuario.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessCanalUsuario } from './readiness-canal-usuario.ts';

test('correo siempre bloquea, sin importar si el usuario tiene linea de whatsapp', () => {
  const veredicto = readinessCanalUsuario('correo', true);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'El correo sale por una sola cuenta compartida de equipo. Habla con tu admin antes de lanzar una cadencia de correo.',
    accion: 'hablar_con_admin',
  });
});

test('llamada nunca bloquea', () => {
  assert.deepEqual(readinessCanalUsuario('llamada', false), { listo: true });
});

test('whatsapp bloquea si el usuario no tiene linea activa propia', () => {
  const veredicto = readinessCanalUsuario('whatsapp', false);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.',
    accion: 'ir_a_conectores',
  });
});

test('whatsapp pasa si el usuario tiene linea activa propia', () => {
  assert.deepEqual(readinessCanalUsuario('whatsapp', true), { listo: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/core/readiness-canal-usuario.test.ts`
Expected: FAIL — `Cannot find module './readiness-canal-usuario.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// app/core/readiness-canal-usuario.ts
import type { Canal } from '../db/validation.ts';

// Gate de "este usuario tiene el canal listo A SU NOMBRE" -- eje distinto de
// canales-empresa.ts (que responde si la EMPRESA destino tiene el dato de contacto).
// Puro: quien llama (server action) ya resolvio tieneLineaWhatsappActiva contra la DB
// y lo pasa resuelto -- el core no importa el driver de DB (CLAUDE.md).
export type VeredictoCanal =
  | { listo: true }
  | { listo: false; motivo: string; accion: 'ir_a_conectores' | 'hablar_con_admin' };

const MOTIVO_CORREO =
  'El correo sale por una sola cuenta compartida de equipo. Habla con tu admin antes de lanzar una cadencia de correo.';
const MOTIVO_WHATSAPP =
  'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.';

export function readinessCanalUsuario(canal: Canal, tieneLineaWhatsappActiva: boolean): VeredictoCanal {
  if (canal === 'correo') return { listo: false, motivo: MOTIVO_CORREO, accion: 'hablar_con_admin' };
  if (canal === 'llamada') return { listo: true };
  // whatsapp
  return tieneLineaWhatsappActiva ? { listo: true } : { listo: false, motivo: MOTIVO_WHATSAPP, accion: 'ir_a_conectores' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/core/readiness-canal-usuario.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/core/readiness-canal-usuario.ts app/core/readiness-canal-usuario.test.ts
git commit -m "feat(core): gate puro de readiness de canal por usuario"
```

---

### Task 2: Repository — `fijarOwnerCampana` y `lineaWhatsappActivaDeOwner`

**Files:**
- Modify: `app/db/repository.ts`
- Create: `app/db/repository.ownerCampana.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/db/repository.ownerCampana.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  fijarOwnerCampana,
  lineaWhatsappActivaDeOwner,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.close();
}

function seedMiembroConLinea(ownerCanonico: string, idUser: string, referenciaProveedor: string, estado: string) {
  const db = raw();
  db.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, ?, ?, ?)`)
    .run(ownerCanonico, ownerCanonico, idUser);
  db.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000001', 'personal', ?, ?, ?)`)
    .run(idUser, referenciaProveedor, estado);
  db.close();
}

function seedLineaPool(referenciaProveedor: string, estado: string) {
  const db = raw();
  db.prepare(`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor, estado) VALUES ('573000000002', 'pool', ?, ?)`)
    .run(referenciaProveedor, estado);
  db.close();
}

seedEmpresa('e-owner-1', 'owner-cat-1');
const idCadencia = crearCadencia({ nombre: 'C owner', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'hola' }] });
const idSegmento = guardarSegmento({ nombre: 'owner-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['owner-cat-1'] }] } }, 1);

test('fijarOwnerCampana persiste el owner de la campana', () => {
  const idCampana = crearCampana({ nombre: 'Camp sin owner', idCadencia, idSegmento }, 1);
  fijarOwnerCampana(idCampana, 'Felipe Castro');

  const db = raw();
  const fila = db.prepare('SELECT owner FROM campana WHERE id_campana = ?').get(idCampana) as { owner: string };
  db.close();
  assert.strictEqual(fila.owner, 'Felipe Castro');
});

test('lineaWhatsappActivaDeOwner devuelve la linea PROPIA del dueno, no cualquier linea activa', () => {
  seedMiembroConLinea('Felipe Castro', 'user-felipe', 'linea-felipe', 'activa');
  seedMiembroConLinea('Thomas Schumacher', 'user-thomas', 'linea-thomas', 'activa');

  const deFelipe = lineaWhatsappActivaDeOwner('Felipe Castro');
  const deThomas = lineaWhatsappActivaDeOwner('Thomas Schumacher');

  assert.deepEqual(deFelipe, { referenciaProveedor: 'linea-felipe' });
  assert.deepEqual(deThomas, { referenciaProveedor: 'linea-thomas' });
});

test('lineaWhatsappActivaDeOwner devuelve null si el dueno no tiene linea activa', () => {
  seedMiembroConLinea('Camilo fonseca', 'user-camilo', 'linea-camilo', 'caida');
  assert.strictEqual(lineaWhatsappActivaDeOwner('Camilo fonseca'), null);
});

test('lineaWhatsappActivaDeOwner devuelve null si el owner no existe como miembro', () => {
  assert.strictEqual(lineaWhatsappActivaDeOwner('Nadie Real'), null);
});

test('lineaWhatsappActivaDeOwner(null) cae al fallback de la linea de pool (campana vieja sin owner)', () => {
  seedLineaPool('linea-pool', 'activa');
  assert.deepEqual(lineaWhatsappActivaDeOwner(null), { referenciaProveedor: 'linea-pool' });
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/db/repository.ownerCampana.test.ts`
Expected: FAIL — `fijarOwnerCampana`/`lineaWhatsappActivaDeOwner` no son exports de `repository.ts`

- [ ] **Step 3: Write minimal implementation**

Agregar en `app/db/repository.ts`, cerca de `lineaWhatsappActiva` (línea 3259):

```ts
// Gate de canal (2026-07-14): persiste quien lanzo la campana -- lo necesita
// lineaWhatsappActivaDeOwner para resolver la linea PROPIA de ese dueno en vez de
// "cualquier linea activa del sistema" (ver pasoInscripcionesPendientes mas abajo).
export function fijarOwnerCampana(idCampana: number, owner: string): void {
  db.update(campana).set({ owner, updatedAt: new Date().toISOString() }).where(eq(campana.idCampana, idCampana)).run();
}

// Resuelve la linea de whatsapp ACTIVA del dueno de una campana (owner_canonico ->
// organizacion_miembro -> id_user -> linea_whatsapp), no la primera activa del sistema.
// owner null = campana vieja, lanzada antes de que este campo se poblara: cae al
// fallback de la linea de POOL (mismo comportamiento que el sistema tenia antes de
// este cambio), para no romper campanas ya lanzadas.
export function lineaWhatsappActivaDeOwner(owner: string | null): { referenciaProveedor: string } | null {
  if (!owner) {
    const pool = db
      .select({ referenciaProveedor: lineaWhatsapp.referenciaProveedor })
      .from(lineaWhatsapp)
      .where(and(isNull(lineaWhatsapp.idUsuario), eq(lineaWhatsapp.estado, 'activa')))
      .get();
    return pool?.referenciaProveedor ? { referenciaProveedor: pool.referenciaProveedor } : null;
  }

  const miembro = db
    .select({ idUser: organizacionMiembro.idUser })
    .from(organizacionMiembro)
    .where(eq(organizacionMiembro.ownerCanonico, owner))
    .get();
  if (!miembro?.idUser) return null;

  const linea = db
    .select({ referenciaProveedor: lineaWhatsapp.referenciaProveedor })
    .from(lineaWhatsapp)
    .where(and(eq(lineaWhatsapp.idUsuario, miembro.idUser), eq(lineaWhatsapp.estado, 'activa')))
    .get();
  return linea?.referenciaProveedor ? { referenciaProveedor: linea.referenciaProveedor } : null;
}
```

Verificar que `organizacionMiembro` ya está importado en `repository.ts` (buscar `organizacionMiembro` — si no está, agregar el import desde `./schema.ts` junto a los demás imports de tablas).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/db/repository.ownerCampana.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.ownerCampana.test.ts
git commit -m "feat(db): fijarOwnerCampana y lineaWhatsappActivaDeOwner"
```

---

### Task 3: Ruteo por dueño en `pasoInscripcionesPendientes`

**Files:**
- Modify: `app/db/repository.ts:3426-3544`
- Modify: `app/db/repository.push.test.ts`

- [ ] **Step 1: Write the failing test**

Agregar al final de `app/db/repository.push.test.ts` (antes de `test.after`):

```ts
// Gate de canal (2026-07-14): dos campanas de whatsapp con duenos DISTINTOS, cada uno
// con su propia linea activa -- cada una debe resolver proveedorCampanaId a SU PROPIA
// linea, nunca a la del otro ni a una linea global compartida.
test('pasoInscripcionesPendientes: whatsapp rutea por la linea PROPIA del dueno de cada campana', () => {
  const db1 = raw();
  db1.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, 'Owner Uno', 'Owner Uno', 'user-owner-1')`).run();
  db1.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, 'Owner Dos', 'Owner Dos', 'user-owner-2')`).run();
  db1.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000010', 'personal', 'user-owner-1', 'linea-owner-1', 'activa')`).run();
  db1.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000011', 'personal', 'user-owner-2', 'linea-owner-2', 'activa')`).run();
  db1.close();

  seedEmpresa('e-owner-a', 'a@empresa.com', 'owner-cat-a');
  seedEmpresa('e-owner-b', 'b@empresa.com', 'owner-cat-b');

  const idCadOwners = crearCadencia({ nombre: 'C owners', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'hola' }] });
  const idSegA = guardarSegmento({ nombre: 'owner-seg-a', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['owner-cat-a'] }] } }, 1);
  const idSegB = guardarSegmento({ nombre: 'owner-seg-b', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['owner-cat-b'] }] } }, 1);

  const idCampA = crearCampana({ nombre: 'Camp Owner Uno', idCadencia: idCadOwners, idSegmento: idSegA, owner: 'Owner Uno' }, 1);
  inscribirCampana(idCampA, 1);
  const idCampB = crearCampana({ nombre: 'Camp Owner Dos', idCadencia: idCadOwners, idSegmento: idSegB, owner: 'Owner Dos' }, 1);
  inscribirCampana(idCampB, 1);

  const { idPaso: idPasoOwners, idVersion: idVersionOwners } = idsPasoYVersion(idCadOwners);
  const idDestA = idDestinatarioDe('e-owner-a');
  const idDestB = idDestinatarioDe('e-owner-b');
  const idPasoInsA = crearPasoInscripcionPendiente({ idDestinatario: idDestA, idPaso: idPasoOwners, idVersion: idVersionOwners, canal: 'whatsapp' });
  const idPasoInsB = crearPasoInscripcionPendiente({ idDestinatario: idDestB, idPaso: idPasoOwners, idVersion: idVersionOwners, canal: 'whatsapp' });

  const pendientes = pasoInscripcionesPendientes('whatsapp');
  const filaA = pendientes.find((f) => f.idPasoInscripcion === idPasoInsA);
  const filaB = pendientes.find((f) => f.idPasoInscripcion === idPasoInsB);

  assert.ok(filaA, 'la fila del dueno Uno aparece en pendientes');
  assert.ok(filaB, 'la fila del dueno Dos aparece en pendientes');
  assert.strictEqual(filaA!.proveedorCampanaId, 'linea-owner-1');
  assert.strictEqual(filaB!.proveedorCampanaId, 'linea-owner-2');
});

// Dueno sin linea propia activa: su campana se salta entera (no gasta un intento
// fallido), las de otros duenos con linea si aparecen -- confirma que el filtro es
// POR CAMPANA, no un gate global como antes.
test('pasoInscripcionesPendientes: campana cuyo dueno NO tiene linea activa se salta entera', () => {
  const db1 = raw();
  db1.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, 'Owner Sin Linea', 'Owner Sin Linea', 'user-owner-sin-linea')`).run();
  db1.close();

  seedEmpresa('e-sin-linea', 'sinlinea@empresa.com', 'owner-cat-sin-linea');
  const idCadSinLinea = crearCadencia({ nombre: 'C sin linea', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'hola' }] });
  const idSegSinLinea = guardarSegmento({ nombre: 'owner-seg-sin-linea', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['owner-cat-sin-linea'] }] } }, 1);
  const idCampSinLinea = crearCampana({ nombre: 'Camp sin linea', idCadencia: idCadSinLinea, idSegmento: idSegSinLinea, owner: 'Owner Sin Linea' }, 1);
  inscribirCampana(idCampSinLinea, 1);

  const { idPaso: idPasoSinLinea, idVersion: idVersionSinLinea } = idsPasoYVersion(idCadSinLinea);
  const idDestSinLinea = idDestinatarioDe('e-sin-linea');
  const idPasoInsSinLinea = crearPasoInscripcionPendiente({ idDestinatario: idDestSinLinea, idPaso: idPasoSinLinea, idVersion: idVersionSinLinea, canal: 'whatsapp' });

  const pendientes = pasoInscripcionesPendientes('whatsapp');
  assert.ok(!pendientes.some((f) => f.idPasoInscripcion === idPasoInsSinLinea), 'sin linea propia activa, la campana no aparece');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/db/repository.push.test.ts`
Expected: FAIL — con el código actual, `crearCampana` no acepta `owner` como parte del test (sí lo acepta ya, ver Task 2 contexto) pero `pasoInscripcionesPendientes` todavía resuelve la línea global única, así que `filaA!.proveedorCampanaId` y `filaB!.proveedorCampanaId` van a ser AMBOS la línea global (o ninguna, si no hay ninguna línea "de pool" activa en este test file) — el assert de igualdad a `'linea-owner-1'`/`'linea-owner-2'` falla.

- [ ] **Step 3: Write minimal implementation**

Reemplazar en `app/db/repository.ts` la función `pasoInscripcionesPendientes` completa (líneas
3426-3544) por:

```ts
export function pasoInscripcionesPendientes(canal: Canal, ahora: string = new Date().toISOString()): FilaPasoInscripcion[] {
  const condiciones = [
    eq(pasoInscripcion.canal, canal),
    inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
    eq(pasoCadencia.esManual, 0),
    eq(campana.estado, 'activa'),
    sql`${pasoInscripcion.intentos} < ${MAX_INTENTOS}`,
    sql`(${pasoInscripcion.proximoIntento} IS NULL OR ${pasoInscripcion.proximoIntento} <= ${ahora})`,
  ];
  if (canal !== 'whatsapp') condiciones.push(isNotNull(campana.proveedorCampanaId));

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
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(and(...condiciones))
    .all();

  if (canal !== 'whatsapp') {
    return filas.map((f) => ({
      idPasoInscripcion: f.idPasoInscripcion,
      proveedorCampanaId: f.proveedorCampanaId as string,
      destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
      paso: { asunto: f.asunto, cuerpo: f.cuerpo ?? '', canal: f.canal },
      intentos: f.intentos,
    }));
  }

  // whatsapp: cada campana rutea por la linea ACTIVA de SU DUENO (fijarOwnerCampana),
  // nunca "cualquier linea activa del sistema" (ver comentario historico mas arriba en
  // el archivo, task de gate de canal 2026-07-14). Cache por owner dentro de esta
  // corrida: varias filas de la misma campana comparten el mismo owner, no vale la
  // pena repetir el JOIN de organizacion_miembro por cada una.
  const cacheLinea = new Map<string | null, { referenciaProveedor: string } | null>();
  const resultado: FilaPasoInscripcion[] = [];
  for (const f of filas) {
    const owner = f.owner ?? null;
    if (!cacheLinea.has(owner)) cacheLinea.set(owner, lineaWhatsappActivaDeOwner(owner));
    const linea = cacheLinea.get(owner) ?? null;
    if (!linea) continue; // sin linea activa del dueno (ni fallback de pool si owner=null), se salta la fila

    resultado.push({
      idPasoInscripcion: f.idPasoInscripcion,
      proveedorCampanaId: linea.referenciaProveedor,
      destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
      paso: { asunto: f.asunto, cuerpo: f.cuerpo ?? '', canal: f.canal },
      intentos: f.intentos,
    });
  }
  return resultado;
}
```

Nota: la prueba vieja `'pasoInscripcionesPendientes solo trae filas del canal pedido, y
whatsapp resuelve el proveedor por la linea activa'` (línea ~193 del archivo, usa
`seedLineaWhatsapp`/`fijarEstadoLineaWhatsapp` que crean líneas de **pool**, sin owner) sigue
pasando tal cual: esas campañas no tienen `owner` seteado (null), así que caen al fallback de
pool que `lineaWhatsappActivaDeOwner(null)` ya cubre.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/db/repository.push.test.ts`
Expected: PASS (todas las pruebas del archivo, viejas + las 2 nuevas de Task 3)

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.push.test.ts
git commit -m "feat(db): pasoInscripcionesPendientes rutea whatsapp por linea del dueno de la campana"
```

---

### Task 4: Integrar el gate en `lanzarCampanaAction`

**Files:**
- Modify: `app/campanas/[id]/lanzar/actions.ts:72-136`

- [ ] **Step 1: Write the failing test**

Buscar primero si existe un archivo de pruebas para esta action:

Run: `find app/campanas -iname "*lanzar*test*"`

Si NO existe, crear `app/campanas/[id]/lanzar/actions.test.ts`. Si SÍ existe, agregar los
casos de abajo a ese archivo (adaptando los imports/seeds al patrón que ya use). Este plan
asume que no existe (caso más probable dado que `lanzarCampanaAction` llama
`requireSession`/`requireEscritura`, que necesitan sesión real — las pruebas de esta capa hoy
viven a nivel de Repository, no de server action). Por eso este test cubre el gate a nivel de
`canalesDeCadencia` + `readinessCanalUsuario` combinados, que es la lógica nueva real, sin
mockear `requireSession`:

```ts
// app/campanas/[id]/lanzar/actions.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessCanalUsuario } from '../../../core/readiness-canal-usuario.ts';

// La integracion real de gate + requireSession vive en lanzarCampanaAction y se
// verifica manualmente (requiere sesion de better-auth, fuera de alcance de node:test
// unitario). Esta prueba fija el CONTRATO que esa integracion tiene que cumplir: dado
// un set de canales de una cadencia + si el usuario tiene linea de whatsapp, cual es
// el primer canal que bloquea (si alguno).
function primerCanalBloqueado(canales: ('correo' | 'whatsapp' | 'llamada')[], tieneLineaWhatsapp: boolean) {
  for (const canal of canales) {
    const veredicto = readinessCanalUsuario(canal, tieneLineaWhatsapp);
    if (!veredicto.listo) return { canal, veredicto };
  }
  return null;
}

test('cadencia con paso de correo bloquea siempre, sin importar whatsapp', () => {
  const bloqueo = primerCanalBloqueado(['whatsapp', 'correo'], true);
  assert.ok(bloqueo);
  assert.strictEqual(bloqueo!.canal, 'correo');
  assert.strictEqual(bloqueo!.veredicto.listo, false);
});

test('cadencia solo de whatsapp sin linea propia bloquea', () => {
  const bloqueo = primerCanalBloqueado(['whatsapp'], false);
  assert.ok(bloqueo);
  assert.strictEqual(bloqueo!.canal, 'whatsapp');
});

test('cadencia de whatsapp con linea propia activa no bloquea', () => {
  assert.strictEqual(primerCanalBloqueado(['whatsapp'], true), null);
});

test('cadencia solo de llamada nunca bloquea', () => {
  assert.strictEqual(primerCanalBloqueado(['llamada'], false), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test "app/campanas/[id]/lanzar/actions.test.ts"`
Expected: PASS ya (usa solo `readinessCanalUsuario`, ya implementado en Task 1) — este test es
de contrato, no de la integración en sí. Si falla, revisar el import relativo.

- [ ] **Step 3: Integrar el gate real en la action**

Modificar `app/campanas/[id]/lanzar/actions.ts`. Import nuevo arriba del archivo (junto a los
demás imports de `../../../db/repository` y `../../../core/goteo`):

```ts
import { readinessCanalUsuario } from '../../../core/readiness-canal-usuario';
```

Y `lineasWhatsappDeUsuario` al import existente de `../../../db/repository` (agregar al
listado que ya trae `campanaParaLanzar`, `actualizarConfigLanzamiento`, etc.):

```ts
  lineasWhatsappDeUsuario,
  fijarOwnerCampana,
```

Reemplazar el cuerpo de `lanzarCampanaAction` (línea 72) agregando el gate justo después de
`requireEscritura()` y antes de `actualizarConfigLanzamiento`:

```ts
export async function lanzarCampanaAction(idCampana: number, config: ConfigLanzamientoInput): Promise<LanzarCampanaResultado> {
  const sesion = await requireEscritura();
  try {
    const camp = campanaParaLanzar(idCampana, sesion.idOrganizacion);
    if (!camp) return { ok: false, error: 'La campaña no existe' };

    // Gate de canal (2026-07-14): antes de tocar la DB, confirmar que quien lanza
    // tiene listos TODOS los canales que la cadencia usa. Bloqueo duro -- si algo no
    // esta listo, no se inscribe nada.
    const canales = canalesDeCadencia(camp.idCadencia);
    const tieneLineaWhatsapp = lineasWhatsappDeUsuario(sesion.id).some((l) => l.estado === 'activa');
    for (const canal of canales) {
      const veredicto = readinessCanalUsuario(canal, tieneLineaWhatsapp);
      if (!veredicto.listo) return { ok: false, error: veredicto.motivo };
    }

    fijarOwnerCampana(idCampana, sesion.owner);
    actualizarConfigLanzamiento(idCampana, config);
    const resultado = inscribirCampana(idCampana, sesion.idOrganizacion);
```

El resto de la función (bloque de Apollo, `materializarYEmpujarAhora`, `revalidatePath`) queda
igual — solo se agregó el gate al inicio y se movió `campanaParaLanzar`/`actualizarConfigLanzamiento`
después del gate en vez de antes (el gate necesita `camp.idCadencia` para saber los canales,
así que `campanaParaLanzar` se llama primero ahora en vez de solo dentro del bloque de Apollo
más abajo — el segundo `campanaParaLanzar` que ya existía más abajo, dentro del `try` del
bloque de Apollo, se puede dejar tal cual, es una re-lectura post-inscripción, no es
redundante).

- [ ] **Step 4: Verificación manual (no hay test automatizado de la action completa)**

Esto requiere sesión real, así que se verifica a mano en el navegador:

1. Correr el dev server, loguearse como un usuario SIN línea de WhatsApp propia.
2. Armar y lanzar una cadencia con un paso de correo → debe bloquear con el mensaje de
   `MOTIVO_CORREO`.
3. Armar y lanzar una cadencia solo de whatsapp, sin línea conectada → debe bloquear con
   `MOTIVO_WHATSAPP`.
4. Ir a `/conectores`, conectar una línea de WhatsApp propia, verificar que quede `activa`.
5. Repetir el lanzamiento de la cadencia de whatsapp → debe pasar, y `campana.owner` debe
   quedar seteado (verificar con `sqlite3 isps.db "SELECT owner FROM campana WHERE id_campana
   = <id>"`).

- [ ] **Step 5: Commit**

```bash
git add "app/campanas/[id]/lanzar/actions.ts" "app/campanas/[id]/lanzar/actions.test.ts"
git commit -m "feat(campanas): gate de canal bloquea el lanzamiento sin canal listo, persiste owner"
```

---

### Task 5: Aviso no bloqueante al armar la cadencia

**Files:**
- Create: `app/campanas/nueva/AvisoCanalUsuario.tsx`
- Modify: `app/campanas/nueva/page.tsx`

Decisión de alcance (v1): el aviso es un banner a nivel de PÁGINA (server-rendered, calculado
una vez con los canales que el usuario tiene listos), no un aviso por-paso dentro del wizard
cliente (`CadenciaPaso.tsx`/`NuevaCampanaFlujo.tsx`). Cablear el gate dentro del estado del
wizard cliente es un cambio más grande y no es lo que bloquea nada (el bloqueo real está en el
lanzamiento, Task 4) — este banner es solo un aviso temprano de contexto general.

- [ ] **Step 1: Crear el componente**

```tsx
// app/campanas/nueva/AvisoCanalUsuario.tsx
import { readinessCanalUsuario } from '../../core/readiness-canal-usuario';
import { CANALES, type Canal } from '../../db/validation';

const NOMBRE_CANAL: Record<Canal, string> = { correo: 'Correo', whatsapp: 'WhatsApp', llamada: 'Llamada' };

export function AvisoCanalUsuario({ tieneLineaWhatsappActiva }: { tieneLineaWhatsappActiva: boolean }) {
  const bloqueados = CANALES.map((canal) => ({ canal, veredicto: readinessCanalUsuario(canal, tieneLineaWhatsappActiva) })).filter(
    (x) => !x.veredicto.listo,
  );
  if (bloqueados.length === 0) return null;

  return (
    <div className="mb-6 max-w-prose rounded-lg border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
      <p className="mb-1 font-semibold text-ink">Antes de lanzar, ten en cuenta:</p>
      <ul className="list-inside list-disc">
        {bloqueados.map(({ canal, veredicto }) => (
          <li key={canal}>
            <span className="font-medium">{NOMBRE_CANAL[canal]}:</span> {veredicto.listo === false ? veredicto.motivo : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Montarlo en la página**

En `app/campanas/nueva/page.tsx`, importar `requireSession`, `lineasWhatsappDeUsuario` (si no
están ya importados) y `AvisoCanalUsuario`, y renderizarlo antes del flujo de creación:

```tsx
import { requireSession } from '../../lib/session';
import { lineasWhatsappDeUsuario } from '../../db/repository';
import { AvisoCanalUsuario } from './AvisoCanalUsuario';

// dentro del componente de página (server component), antes de <NuevaCampanaFlujo ... />:
const sesion = await requireSession();
const tieneLineaWhatsappActiva = lineasWhatsappDeUsuario(sesion.id).some((l) => l.estado === 'activa');

// en el JSX:
<AvisoCanalUsuario tieneLineaWhatsappActiva={tieneLineaWhatsappActiva} />
```

(Ajustar el nombre exacto de la variable de sesión/import al patrón real del archivo — revisar
`app/campanas/nueva/page.tsx` antes de editar, puede que `requireSession` ya se llame ahí con
otro nombre.)

- [ ] **Step 3: Verificación manual**

1. Loguearse sin línea de WhatsApp → entrar a `/campanas/nueva` → debe verse el banner listando
   correo y whatsapp como no listos.
2. Conectar una línea de WhatsApp propia y recargar → el banner solo debe listar correo.

- [ ] **Step 4: Commit**

```bash
git add app/campanas/nueva/AvisoCanalUsuario.tsx app/campanas/nueva/page.tsx
git commit -m "feat(campanas): aviso no bloqueante de canal sin configurar al armar la cadencia"
```

---

### Task 6: Suite completa + typecheck

- [ ] **Step 1: Correr toda la suite**

Run: `npm test` (o el comando real del `package.json` — revisar `scripts.test`)
Expected: 0 fallos, incluye los archivos nuevos de este plan.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit final si algo quedó suelto**

```bash
git status
# si hay cambios sin commitear de los pasos anteriores, commitearlos aca
```

## Self-Review (hecho por quien escribió este plan)

- **Cobertura del spec**: Pieza A (gate en creación + lanzamiento) → Tasks 1, 4, 5. Pieza B
  (ruteo por línea propia) → Tasks 2, 3. Fallback de campañas viejas sin owner → cubierto en
  `lineaWhatsappActivaDeOwner(null)` (Task 2) y probado en Task 3.
- **Corrección respecto al spec original**: el spec (`docs/superpowers/specs/2026-07-14-gate-
  canal-campanas-design.md`) proponía reescribir `push.ts` para agrupar por línea. Verificando
  el código real, eso no hace falta: `enviarPaso` ya es stateless por referencia (recibe la
  línea como argumento en cada llamada), así que el cambio completo vive en
  `pasoInscripcionesPendientes` — más chico y más seguro que lo que decía el spec. Vale la
  pena que quien ejecute este plan lo sepa, para no sorprenderse de que Task 3 no toque
  `push.ts`.
- **Sin placeholders**: todos los pasos de código tienen implementación completa, no hay TBD.
