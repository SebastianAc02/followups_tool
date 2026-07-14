# Contacto iniciado sin cadencia (toque ad-hoc + historial honesto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empresas en `contacto_iniciado` sin cadencia activa y sin `proximo_follow_up_fecha`
dejan de ser invisibles: aparecen en una sección nueva de `/cola` (para cualquier owner), se
les puede registrar un toque suelto por cualquier canal con un intervalo de próximo toque, la
ficha deja de mentir con "Sin toques previos" cuando el historial pudo empezar fuera de la
herramienta, y hay un atajo para promoverlas a una campaña real.

**Architecture:** Todo el trabajo cae en capas ya existentes, sin tocar el core del dominio
salvo por composición pura (`decidirVista`, el prefill de segmento). La query nueva sigue el
patrón `colaCierres`/`colaReagendar` del Repository. El intervalo de "próximo toque" ya tiene
mecánica completa en `registrarToque`/`registrarToqueSchema` (solo falta pasarlo por
`registrarToqueSueltoAction`); se extrae a un componente chico para no triplicar los chips
+1d/+3d/+1sem en los 3 editores de canal.

**Tech Stack:** Next.js App Router (server components + server actions), Drizzle ORM sobre
SQLite (`isps.db`), Zod para validación, `node:test` para pruebas.

---

## Spec de referencia

`docs/superpowers/specs/2026-07-14-contacto-iniciado-sin-cadencia-design.md` — decisiones
cerradas con Sebastián el 2026-07-14. Este plan implementa las Partes A-F de ese diseño, en
orden de menor a mayor dependencia.

## Notas de alcance (YAGNI, del spec original)

- No se toca `empresa.proximoCanal` ni su semántica actual.
- No se automatiza la creación/lanzamiento de campaña — el botón de Parte F solo pre-llena el
  segmento.
- No se construye multipersona en la UI.
- El banner de historial (Parte E) no reconstruye ni infiere historial, solo avisa que puede
  existir.

---

### Task 1: `colaContactoIniciadoSinSeguimiento` en el Repository

**Files:**
- Modify: `app/db/repository.ts:257` (justo después de `colaReagendar`)
- Test: `app/db/repository.colaContactoIniciadoSinSeguimiento.test.ts` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Sigue el mismo patrón de seed que `app/db/repository.colaSplit.test.ts` (mismo `seedEmpresa`,
misma `seedInscripcionActiva`).

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaContactoIniciadoSinSeguimiento } = await import('./repository.ts');

const OWNER = 'Sebastian Acosta Molina';
const OTRO_OWNER = 'Felipe Castro';

function seedEmpresa(
  id: string,
  owner: string,
  estadoNotion: string | null,
  proximoFollowUpFecha: string | null,
  idOrganizacion = 1,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
    )
    .run(id, id, id, owner, estadoNotion, proximoFollowUpFecha, idOrganizacion);
  raw.close();
}

function seedInscripcionActiva(idEmpresa: string, nombreCampana: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento) VALUES (?, 1, 1)`).run(nombreCampana);
  const idCampana = (raw.prepare(`SELECT last_insert_rowid() id`).get() as { id: number }).id;
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  raw.close();
}

test('colaContactoIniciadoSinSeguimiento: contacto_iniciado, sin fecha, sin inscripcion activa, del owner pedido', () => {
  seedEmpresa('s1', OWNER, 'contacto_iniciado', null); // cumple todo: entra
  seedEmpresa('s2', OWNER, 'contacto_iniciado', '2026-07-20'); // tiene fecha: no entra (ya la cubre la cola normal)
  seedEmpresa('s3', OWNER, 'lead', null); // otro estado: no entra
  seedEmpresa('s4', OTRO_OWNER, 'contacto_iniciado', null); // otro owner: no entra

  seedEmpresa('s5', OWNER, 'contacto_iniciado', null);
  seedInscripcionActiva('s5', 'Reactivacion express'); // inscripcion activa: no entra

  const r = colaContactoIniciadoSinSeguimiento(OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['s1']);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --experimental-strip-types --test app/db/repository.colaContactoIniciadoSinSeguimiento.test.ts`
Expected: FAIL — `colaContactoIniciadoSinSeguimiento is not a function` (o import error).

- [ ] **Step 3: Implementar la query**

Agregar en `app/db/repository.ts`, justo después del cierre de `colaReagendar` (línea 280 tras
el cambio, antes del comentario de `buscarEmpresasPorNombre`):

```typescript
// Seccion "Contacto iniciado sin seguimiento" (2026-07-14): empresas en contacto_iniciado
// que no se van a meter a ninguna cadencia por ahora y hoy son invisibles -- colaDelDia
// exige fecha, esta no la tiene. General para cualquier owner (no gateado como el split de
// /cola). Lista fija (sin filtro de fecha), mismo patron que colaCierres/colaReagendar.
export function colaContactoIniciadoSinSeguimiento(owner: string, idOrganizacion: number) {
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, 'contacto_iniciado'),
        isNull(empresa.proximoFollowUpFecha),
        notExists(
          db
            .select({ x: sql`1` })
            .from(inscripcion)
            .where(and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa'))),
        ),
      ),
    )
    .orderBy(empresa.nombreOficial)
    .all();
}
```

`isNull`, `notExists`, `sql`, `inscripcion` ya están importados en `repository.ts` (se usan en
`colaLeads`/`colaReagendar` y en la validación de segmentos).

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --experimental-strip-types --test app/db/repository.colaContactoIniciadoSinSeguimiento.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.colaContactoIniciadoSinSeguimiento.test.ts
git commit -m "feat(cola): colaContactoIniciadoSinSeguimiento para contacto_iniciado sin fecha ni cadencia"
```

---

### Task 2: `decidirVista` respeta `?vista=` explícito

**Files:**
- Modify: `app/llamada/[id]/ToqueContexto.ts:18-22`
- Modify: `package.json:10`
- Test: `app/llamada/[id]/ToqueContexto.test.ts` (nuevo)

`npm test` (`package.json:10`) enumera los globs de test explícitamente y hoy NO incluye
`app/llamada/**` — sin este cambio, los tests nuevos de esta task y de Task 3 corren bien
invocados a mano pero quedan invisibles para `npm test` (y para CI, si lo hay). Se agrega una
sola vez, aquí, porque es la primera task que mete tests bajo `app/llamada/`.

- [ ] **Step 1: Agregar el glob de `app/llamada/**` a `npm test`**

En `package.json`, línea 10, agregar `"app/llamada/**/*.test.ts"` a la lista de globs del
script `test` (después de `app/cola/*.test.ts`, por ejemplo):

```json
    "test": "ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/*.test.ts app/lib/*.test.ts app/core/*.test.ts app/core/**/*.test.ts app/adapters/*.test.ts app/worker/*.test.ts app/campanas/**/*.test.ts app/ui/*.test.ts app/cola/*.test.ts app/conectores/*.test.ts app/llamada/**/*.test.ts"
```

- [ ] **Step 2: Escribir el test que falla**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirVista } from './ToqueContexto.ts';
import type { ContextoToque, PasoSecuencia } from '../../db/repository.ts';

function ctxCon(secuencia: PasoSecuencia[]): ContextoToque {
  return {
    emp: null,
    principal: null,
    toques: [],
    secuencia,
    objetivo: null,
    idPasoInscripcionActivo: null,
    pbx: null,
  };
}

const SIN_SECUENCIA = ctxCon([]);
const CON_PASO_ACTIVO_CORREO = ctxCon([
  { idPaso: 1, orden: 1, diaOffset: 0, canal: 'correo', objetivo: null, estado: 'activo' },
]);

test('decidirVista: ?vista=confirmacion gana siempre', () => {
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'confirmacion' }), 'confirmacion');
  assert.equal(decidirVista(CON_PASO_ACTIVO_CORREO, { vista: 'confirmacion' }), 'confirmacion');
});

test('decidirVista: ?vista=correo/whatsapp/llamada explicito, sin paso activo', () => {
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'correo' }), 'correo');
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'whatsapp' }), 'whatsapp');
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'llamada' }), 'llamada');
});

test('decidirVista: sin ?vista=, sin paso activo, cae a llamada', () => {
  assert.equal(decidirVista(SIN_SECUENCIA, {}), 'llamada');
});

test('decidirVista: un paso activo real sigue ganando sobre un ?vista= que no coincide', () => {
  assert.equal(decidirVista(CON_PASO_ACTIVO_CORREO, { vista: 'whatsapp' }), 'correo');
});

test('decidirVista: paso activo sin ?vista= sigue derivando del canal del paso', () => {
  assert.equal(decidirVista(CON_PASO_ACTIVO_CORREO, {}), 'correo');
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --experimental-strip-types --test app/llamada/\[id\]/ToqueContexto.test.ts`
Expected: FAIL en el test de `?vista=correo/whatsapp/llamada explicito` (hoy `decidirVista`
ignora cualquier `vista` que no sea `confirmacion` y sigue el canal del paso activo o cae a
`llamada`).

- [ ] **Step 3: Implementar**

Reemplazar `decidirVista` en `app/llamada/[id]/ToqueContexto.ts`:

```typescript
// Decide la vista: `?vista=confirmacion` gana siempre (llega justo despues de guardar
// un toque). Si hay un paso activo en la secuencia, ese canal manda -- una cadencia en
// curso no se puede desviar con un ?vista= que no coincide. Sin paso activo, el
// ?vista= explicito (2026-07-14: toques sueltos desde "Contacto iniciado sin
// seguimiento") elige el editor; sin nada de eso, el cockpit por defecto es la vista
// de llamada (canal mas comun en frio).
export function decidirVista(ctx: ContextoToque, searchParams: { vista?: string }): VistaToque {
  if (searchParams.vista === 'confirmacion') return 'confirmacion';
  const pasoActivo = ctx.secuencia.find((p) => p.estado === 'activo');
  if (pasoActivo) return CANAL_A_VISTA[pasoActivo.canal] ?? 'llamada';
  if (searchParams.vista === 'correo' || searchParams.vista === 'whatsapp' || searchParams.vista === 'llamada') {
    return searchParams.vista;
  }
  return 'llamada';
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --experimental-strip-types --test app/llamada/\[id\]/ToqueContexto.test.ts`
Expected: PASS (los 5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/llamada/[id]/ToqueContexto.ts" "app/llamada/[id]/ToqueContexto.test.ts"
git commit -m "feat(toque): decidirVista respeta ?vista= explicito sin paso activo"
```

---

### Task 3: `registrarToqueSueltoAction` gana `proximoFollowUp`

**Files:**
- Modify: `app/llamada/[id]/actions.ts:285-296`
- Modify: `app/llamada/[id]/EditorWhatsapp.tsx:93`
- Modify: `app/llamada/[id]/EditorCorreo.tsx:100`
- Test: `app/llamada/[id]/actions.registrarToqueSuelto.test.ts` (nuevo)

`registrarToque`/`registrarToqueSchema` ya soportan `proximoFollowUp` (`app/db/repository.ts:434`,
`app/db/validation.ts:242`) y ya lo escriben en `toque.proximo_follow_up_fecha` y
`empresa.proximo_follow_up_fecha` (`app/db/repository.ts:433,444`). Falta solo el parámetro
en `registrarToqueSueltoAction` — no hay que tocar `registrarToque`.

`registrarToqueSueltoAction` llama `redirect()`, que en Next.js lanza una excepción especial
para cortar el render — no se puede probar de punta a punta con `node:test` sin mockear
`next/navigation`. La prueba de este task va contra `registrarToque` directo (la función real
que persiste), confirmando que el mismo input que la action arma queda guardado. Es el mismo
patrón que ya usan las pruebas de `registrarToque` existentes en el Repository.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque } = await import('../../db/repository.ts');
const { registrarToqueSchema } = await import('../../db/validation.ts');

function seedEmpresa(id: string, idOrganizacion = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', ?)`,
    )
    .run(id, id, id, idOrganizacion);
  raw.close();
}

test('registrarToqueSuelto: proximoFollowUp queda en el toque y en empresa.proximo_follow_up_fecha', () => {
  seedEmpresa('e1');

  // Mismo input que arma registrarToqueSueltoAction(idEmpresa, canal, cuerpo, proximoFollowUp).
  const parsed = registrarToqueSchema.parse({
    idEmpresa: 'e1',
    canal: 'whatsapp',
    resultado: 'no_contesto',
    quePaso: 'Le escribi por WhatsApp, sin respuesta aun',
    proximoFollowUp: '2026-07-21',
  });
  registrarToque(parsed, 1);

  const raw = new Database(dbPath);
  const toqueGuardado = raw.prepare(`SELECT proximo_follow_up_fecha FROM toque WHERE id_empresa = 'e1'`).get() as {
    proximo_follow_up_fecha: string | null;
  };
  const empresaGuardada = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'e1'`).get() as {
    proximo_follow_up_fecha: string | null;
  };
  raw.close();

  assert.equal(toqueGuardado.proximo_follow_up_fecha, '2026-07-21');
  assert.equal(empresaGuardada.proximo_follow_up_fecha, '2026-07-21');
});
```

- [ ] **Step 2: Correr el test para verificar que pasa (regresión, no falla)**

Este test documenta comportamiento que YA existe en `registrarToque` — corre en verde antes de
tocar `actions.ts`. Sirve de red de seguridad para el Step 3.

Run: `node --experimental-strip-types --test "app/llamada/[id]/actions.registrarToqueSuelto.test.ts"`
Expected: PASS

- [ ] **Step 3: Implementar el parámetro en la action**

En `app/llamada/[id]/actions.ts`, reemplazar `registrarToqueSueltoAction`:

```typescript
// registrarToqueSueltoAction -- 'no_contesto' es el resultado mas honesto disponible
// para un intento que no es una de las 4 salidas cerradas de llamada). proximoFollowUp
// (2026-07-14, seccion "Contacto iniciado sin seguimiento"): opcional, deja fijado
// "en N dias vuelvo a intentar" en el mismo toque suelto -- sin esto, la fecha se
// perdia y la cuenta volvia a quedar invisible en colaDelDia.
export async function registrarToqueSueltoAction(
  idEmpresa: string,
  canal: "correo" | "whatsapp",
  cuerpo: string,
  proximoFollowUp?: string,
) {
  const { idOrganizacion } = await requireSession();
  const parsed = registrarToqueSchema.parse({
    idEmpresa,
    canal,
    resultado: "no_contesto",
    quePaso: cuerpo || undefined,
    proximoFollowUp: proximoFollowUp || undefined,
  });
  registrarToque(parsed, idOrganizacion);
  revalidatePath(`/llamada/${idEmpresa}`);
  revalidatePath("/cola");
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}
```

(Se agrega `revalidatePath("/cola")`: un toque suelto con `proximoFollowUp` puede sacar a la
empresa de la sección "Contacto iniciado sin seguimiento" — sin esto, `/cola` seguiría
mostrando la fila vieja hasta la próxima navegación completa.)

- [ ] **Step 4: Correr el test de nuevo**

Run: `node --experimental-strip-types --test "app/llamada/[id]/actions.registrarToqueSuelto.test.ts"`
Expected: PASS (sigue en verde, no se tocó `registrarToque`)

- [ ] **Step 5: Cablear el parámetro en los dos editores (sin UI todavía — Task 4 la agrega)**

En `app/llamada/[id]/EditorWhatsapp.tsx`, la función `enviar` pasa a aceptar la fecha desde un
estado que Task 4 va a introducir. Por ahora, deja el call site listo para recibir un tercer
argumento opcional sin romper nada — no cambies la firma todavía si Task 4 es el siguiente en
la misma sesión. Si se ejecuta como task aislado, aplica este parche mínimo:

```typescript
// EditorWhatsapp.tsx, dentro de enviar():
    } else {
      await registrarToqueSueltoAction(idEmpresa, "whatsapp", cuerpo, undefined);
    }
```

```typescript
// EditorCorreo.tsx, dentro de enviar():
    } else {
      await registrarToqueSueltoAction(idEmpresa, "correo", cuerpo, undefined);
    }
```

Esto es un no-op funcional (mismo comportamiento que antes, `proximoFollowUp` llega
`undefined`); Task 4 reemplaza el `undefined` por el estado real.

- [ ] **Step 6: Commit**

```bash
git add "app/llamada/[id]/actions.ts" "app/llamada/[id]/EditorWhatsapp.tsx" "app/llamada/[id]/EditorCorreo.tsx" "app/llamada/[id]/actions.registrarToqueSuelto.test.ts"
git commit -m "feat(toque): registrarToqueSueltoAction acepta proximoFollowUp"
```

---

### Task 4: Componente compartido `ProximoToque` (chips +1d/+3d/+1sem)

**Files:**
- Create: `app/llamada/[id]/ProximoToque.tsx`
- Modify: `app/llamada/[id]/CapturaLlamada.tsx:16,214-239`
- Modify: `app/llamada/[id]/EditorWhatsapp.tsx`
- Modify: `app/llamada/[id]/EditorCorreo.tsx`

Tarea mecánica (extracción de UI ya escrita), sin infra de testing de React en este repo —
verificación manual al final (Step 5).

- [ ] **Step 1: Crear el componente compartido**

```typescript
"use client";

import { plusDias } from "../../lib/date-utils";

const CHIPS: [string, number][] = [["+1d", 1], ["+3d", 3], ["+1sem", 7]];

// Bloque "Proximo toque" (chips +1d/+3d/+1sem + date picker), extraido de
// CapturaLlamada (2026-07-14) para reusarlo en EditorWhatsapp/EditorCorreo sin
// triplicar el markup -- mismo patron visual en los 3 canales.
export function ProximoToque({
  fecha,
  onChange,
  name,
  accentClase = "border-accent-llamada bg-accent-llamada-soft text-ink",
}: {
  fecha: string;
  onChange: (fecha: string) => void;
  // Solo lo necesita CapturaLlamada: el input viaja en el FormData de
  // registrarToqueAction. EditorWhatsapp/EditorCorreo llaman la action directo con el
  // valor de estado, no necesitan name.
  name?: string;
  accentClase?: string;
}) {
  return (
    <div>
      <div className="mb-2 font-toque-mono text-[10.5px] uppercase tracking-wide text-faint">Próximo toque</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS.map(([l, d]) => (
          <button
            type="button"
            key={l}
            onClick={() => onChange(plusDias(d))}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
              fecha === plusDias(d) ? accentClase : "border-line text-muted hover:border-line-strong"
            }`}
          >
            {l}
          </button>
        ))}
        <input
          type="date"
          name={name}
          value={fecha}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-line bg-shell px-2 py-1 text-[12px] text-ink"
        />
      </div>
    </div>
  );
}

export default ProximoToque;
```

- [ ] **Step 2: Usarlo en `CapturaLlamada.tsx`**

Quitar `CHIPS` (línea 16) y el bloque manual (líneas 214-239), reemplazar por:

```tsx
import { ProximoToque } from "./ProximoToque";
// ... (quitar el import de plusDias si ya no se usa en otro lado del archivo; se sigue
// usando en la linea 49 `useState(plusDias(3))`, asi que el import se queda)
```

Bloque reemplazado:

```tsx
          <ProximoToque fecha={fecha} onChange={setFecha} name="fecha" />
```

- [ ] **Step 3: Usarlo en `EditorWhatsapp.tsx`**

Agregar estado y el bloque, solo visible para toque suelto (sin cadencia activa — con
cadencia, el próximo paso ya lo gobierna la secuencia, no tiene sentido pedirlo a mano):

```tsx
import { ProximoToque } from "./ProximoToque";
import { plusDias } from "../../lib/date-utils";
```

```tsx
  const [cuerpo, setCuerpo] = useState(defaultVersion?.cuerpo ?? "");
  const [fecha, setFecha] = useState(plusDias(3));
```

```tsx
  async function enviar() {
    setEnviando(true);
    setError(null);
    if (idPasoInscripcion != null) {
      const resultado = await enviarToqueCanalAction(idEmpresa, idPasoInscripcion, cuerpo);
      if (resultado && !resultado.ok) {
        setError(resultado.error);
        setEnviando(false);
      }
    } else {
      await registrarToqueSueltoAction(idEmpresa, "whatsapp", cuerpo, fecha);
    }
  }
```

Y en el JSX, dentro del bloque "Composer" (`app/llamada/[id]/EditorWhatsapp.tsx:112-135`),
justo antes del `{error && ...}` final, solo si es toque suelto:

```tsx
        {idPasoInscripcion == null && (
          <div className="mt-3">
            <ProximoToque fecha={fecha} onChange={setFecha} accentClase="border-accent-whatsapp bg-accent-whatsapp-soft text-ink" />
          </div>
        )}
        {error && <p className="mt-1.5 text-[12.5px] text-overdue">{error}</p>}
```

- [ ] **Step 4: Usarlo en `EditorCorreo.tsx`**

Mismo patrón:

```tsx
import { ProximoToque } from "./ProximoToque";
import { plusDias } from "../../lib/date-utils";
```

```tsx
  const [cuerpo, setCuerpo] = useState(defaultVersion?.cuerpo ?? "");
  const [fecha, setFecha] = useState(plusDias(3));
```

```tsx
    } else {
      await registrarToqueSueltoAction(idEmpresa, "correo", cuerpo, fecha);
    }
```

En el JSX, antes del `{error && ...}` de la columna izquierda
(`app/llamada/[id]/EditorCorreo.tsx:155-157`):

```tsx
          {idPasoInscripcion == null && (
            <div className="mb-3">
              <ProximoToque fecha={fecha} onChange={setFecha} accentClase="border-accent-correo bg-accent-correo-soft text-ink" />
            </div>
          )}
          {error && <p className="mb-2 text-[12.5px] text-overdue">{error}</p>}
```

- [ ] **Step 5: Verificación manual**

Pedirle a Sebastián que confirme visualmente: los 3 chips + date picker se ven igual en
llamada (sin cambios), y aparecen en correo/whatsapp SOLO cuando no hay cadencia activa
(toque suelto). `npx tsc --noEmit` debe seguir en 0 errores.

- [ ] **Step 6: Commit**

```bash
git add "app/llamada/[id]/ProximoToque.tsx" "app/llamada/[id]/CapturaLlamada.tsx" "app/llamada/[id]/EditorWhatsapp.tsx" "app/llamada/[id]/EditorCorreo.tsx"
git commit -m "feat(toque): componente ProximoToque compartido, correo/whatsapp sueltos piden intervalo"
```

---

### Task 5: Banner de historial incompleto en `SecuenciaRail`

**Files:**
- Modify: `app/llamada/[id]/SecuenciaRail.tsx:47-56,63-75`
- Modify: `app/llamada/[id]/LlamadaCard.tsx:96`
- Modify: `app/llamada/[id]/ToqueShell.tsx:96`

Sin infra de testing de React — verificación manual.

- [ ] **Step 1: Agregar el prop `estado` y el banner**

En `app/llamada/[id]/SecuenciaRail.tsx`, cambiar la firma:

```typescript
export function SecuenciaRail({
  pasos,
  objetivo,
  toques,
  estado,
}: {
  pasos: PasoSecuencia[];
  objetivo: string | null;
  toques?: ContextoToque["toques"];
  // Estado de la empresa (empresa.estado_notion): decide si se muestra el banner de
  // "historial incompleto" cuando no hay secuencia activa (2026-07-14). 'lead' es la
  // unica etapa donde la herramienta sabe con certeza que el ciclo de vida esta
  // completo (nunca se trabajo fuera de ella) -- ahi no se muestra.
  estado?: string | null;
}) {
```

Y dentro de la rama `pasos.length === 0` (líneas 63-75), agregar el banner ANTES de la lista
de `toques`:

```tsx
        {pasos.length === 0 ? (
          <div className="pl-1">
            <p className="text-xs text-muted">Sin secuencia activa · llamada suelta</p>
            {estado != null && estado !== "lead" && (
              <p className="mt-2 rounded-lg border border-line bg-shell-2 px-2.5 py-2 text-[11px] leading-snug text-faint">
                Hay historial que no se guardó en la herramienta — esta cuenta se empezó a
                tocar antes.
              </p>
            )}
            {toques && toques.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
```

(El resto de la lista de `toques` queda igual; solo cambia lo que hay justo encima.)

- [ ] **Step 2: Pasar `estado` desde los dos callers**

En `app/llamada/[id]/LlamadaCard.tsx:96`:

```tsx
        <SecuenciaRail pasos={secuencia} objetivo={objetivo} toques={toques} estado={emp?.estado} />
```

En `app/llamada/[id]/ToqueShell.tsx:96`:

```tsx
        <SecuenciaRail pasos={secuencia} objetivo={objetivo} toques={toques} estado={emp?.estado} />
```

- [ ] **Step 3: `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: 0 errores (ambos `emp?.estado` ya son `string | null | undefined`, compatible con
el nuevo prop opcional).

- [ ] **Step 4: Verificación manual**

Pedirle a Sebastián que abra una ficha con `estado_notion = 'contacto_iniciado'` (o cualquier
estado ≠ `lead`) sin secuencia activa y confirme que ve el banner; y una ficha en `lead` sin
secuencia y confirme que NO lo ve (el "Sin secuencia activa · llamada suelta" sigue igual en
ambos casos).

- [ ] **Step 5: Commit**

```bash
git add "app/llamada/[id]/SecuenciaRail.tsx" "app/llamada/[id]/LlamadaCard.tsx" "app/llamada/[id]/ToqueShell.tsx"
git commit -m "feat(toque): banner de historial incompleto cuando no hay secuencia ni es lead"
```

---

### Task 6: Sección "Contacto iniciado sin seguimiento" en `/cola`

**Files:**
- Create: `app/cola/ContactoIniciadoSinSeguimiento.tsx`
- Modify: `app/cola/page.tsx`

Sin infra de testing de React para el componente — verificación manual. La query
(`colaContactoIniciadoSinSeguimiento`) ya tiene su prueba en Task 1.

- [ ] **Step 1: Crear el componente**

```tsx
import Link from "next/link";

type FilaSinSeguimiento = {
  id: string;
  empresa: string;
  ciudad: string | null;
  contacto: string | null;
  cargo: string | null;
};

// Seccion "Contacto iniciado sin seguimiento" (2026-07-14): visible para CUALQUIER owner
// (a diferencia del resto de /cola, que gatea el split por OWNER_COLA_SPLIT). Cada fila
// trae 3 acciones a los 3 canales -- decidirVista (ToqueContexto.ts) ya sabe respetar el
// ?vista= explicito de estos links cuando no hay cadencia activa empujando otro canal.
export function ContactoIniciadoSinSeguimiento({ filas, owner }: { filas: FilaSinSeguimiento[]; owner: string }) {
  if (filas.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-serif text-lg text-ink">Contacto iniciado sin seguimiento</h3>
          <p className="mt-0.5 text-xs text-muted">Se les habló, pero no quedaron en ninguna cadencia ni con fecha de vuelta.</p>
        </div>
        <Link
          href={`/campanas/nueva?estado=contacto_iniciado&owner=${encodeURIComponent(owner)}`}
          className="flex-none rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
        >
          Promover a campaña
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-line-card bg-card">
        <ul className="divide-y divide-line">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-ink">{f.empresa}</div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {[f.ciudad, f.contacto, f.cargo].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                <Link
                  href={`/llamada/${f.id}?vista=llamada`}
                  className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
                >
                  Llamar
                </Link>
                <Link
                  href={`/llamada/${f.id}?vista=whatsapp`}
                  className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
                >
                  WhatsApp
                </Link>
                <Link
                  href={`/llamada/${f.id}?vista=correo`}
                  className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
                >
                  Correo
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ContactoIniciadoSinSeguimiento;
```

- [ ] **Step 2: Wirear en `app/cola/page.tsx`**

Agregar el import:

```typescript
import { colaDelDia, colaLeads, colaCierres, colaReagendar, colaContactoIniciadoSinSeguimiento, contadoresHoy, agendaHoyCadencias, historialPasosDestinatario } from "../db/repository";
import { ContactoIniciadoSinSeguimiento } from "./ContactoIniciadoSinSeguimiento";
```

Después de la línea que calcula `reagendar` (`app/cola/page.tsx:33`), agregar:

```typescript
  // Seccion "Contacto iniciado sin seguimiento" (2026-07-14): para CUALQUIER owner, no
  // solo el split de Sebastian. Sin owner (visitante viendo TODA la organizacion) no hay
  // un owner concreto contra el que filtrar -- la seccion simplemente no se muestra.
  const sinSeguimiento = owner ? colaContactoIniciadoSinSeguimiento(owner, usuario.idOrganizacion) : [];
```

Y al final del JSX, justo después del `</section>` que cierra `id="today-agenda"`
(`app/cola/page.tsx:152`), antes del `</AppShell>`:

```tsx
      {owner && <ContactoIniciadoSinSeguimiento filas={sinSeguimiento} owner={owner} />}
```

- [ ] **Step 3: `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Verificación manual**

Pedirle a Sebastián que:
1. Confirme que un owner sin ninguna cuenta en `contacto_iniciado` sin fecha no ve la
   sección (no rompe el resto de `/cola`).
2. Con al menos una cuenta así, confirme que ve la sección con los 3 botones y que cada uno
   abre la ficha en el editor correcto (llamada/whatsapp/correo).
3. Confirme que "Promover a campaña" abre `/campanas/nueva` con el segmento pre-filtrado
   (depende de Task 7 — puede verificarse junto con esa tarea).

- [ ] **Step 5: Commit**

```bash
git add app/cola/page.tsx app/cola/ContactoIniciadoSinSeguimiento.tsx
git commit -m "feat(cola): seccion Contacto iniciado sin seguimiento para cualquier owner"
```

---

### Task 7: Prefill de `NuevoSegmento` desde `/campanas/nueva?estado=&owner=`

**Files:**
- Create: `app/campanas/nueva/prefill.ts`
- Test: `app/campanas/nueva/prefill.test.ts`
- Modify: `app/campanas/nueva/page.tsx`
- Modify: `app/campanas/nueva/NuevaCampanaFlujo.tsx`
- Modify: `app/campanas/nueva/NuevoSegmento.tsx:19,47-48`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { prefillSegmentoDesdeQuery } from './prefill.ts';

test('prefillSegmentoDesdeQuery: sin estado, no arma nada', () => {
  assert.equal(prefillSegmentoDesdeQuery({}), undefined);
  assert.equal(prefillSegmentoDesdeQuery({ owner: 'Felipe Castro' }), undefined);
});

test('prefillSegmentoDesdeQuery: con estado, arma la condicion de estado', () => {
  const def = prefillSegmentoDesdeQuery({ estado: 'contacto_iniciado' });
  assert.deepEqual(def, { condiciones: [{ campo: 'estado', op: 'en', valores: ['contacto_iniciado'] }] });
});

test('prefillSegmentoDesdeQuery: con estado y owner, arma ambas condiciones', () => {
  const def = prefillSegmentoDesdeQuery({ estado: 'contacto_iniciado', owner: 'Felipe Castro' });
  assert.deepEqual(def, {
    condiciones: [
      { campo: 'estado', op: 'en', valores: ['contacto_iniciado'] },
      { campo: 'owner', op: 'en', valores: ['Felipe Castro'] },
    ],
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --experimental-strip-types --test app/campanas/nueva/prefill.test.ts`
Expected: FAIL — módulo `./prefill.ts` no existe.

- [ ] **Step 3: Implementar la función pura**

```typescript
import type { DefinicionSegmento } from '../../db/validation';

// Prefill del segmento desde searchParams (2026-07-14, boton "Promover a campana" de
// /cola): funcion pura y extraida a proposito para poder probarla sin montar React --
// NuevoSegmento no soportaba prefill por searchParams antes de esto, solo reanudar un
// segmento YA guardado (reanudarDesde, via ?segmento=<id>). Este es un caso distinto:
// arranca una definicion NUEVA, sin id, a partir de un estado (y opcionalmente un owner).
export function prefillSegmentoDesdeQuery(query: { estado?: string; owner?: string }): DefinicionSegmento | undefined {
  if (!query.estado) return undefined;
  const condiciones: DefinicionSegmento['condiciones'] = [{ campo: 'estado', op: 'en', valores: [query.estado] }];
  if (query.owner) condiciones.push({ campo: 'owner', op: 'en', valores: [query.owner] });
  return { condiciones };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --experimental-strip-types --test app/campanas/nueva/prefill.test.ts`
Expected: PASS

- [ ] **Step 5: Cablear en `page.tsx`**

```typescript
import { listarSegmentos, valoresDistintosCampo } from '../../db/repository';
import { requireSession } from '../../lib/session';
import { AppShell } from '../../ui/shell/AppShell';
import { NuevaCampanaFlujo } from './NuevaCampanaFlujo';
import { prefillSegmentoDesdeQuery } from './prefill';

export default async function NuevaCampana({
  searchParams,
}: {
  searchParams: Promise<{ segmento?: string; estado?: string; owner?: string }>;
}) {
  const sesion = await requireSession();
  const segmentos = listarSegmentos(sesion.idOrganizacion);
  const opciones = {
    estado: valoresDistintosCampo('estado', sesion.idOrganizacion),
    categoria: valoresDistintosCampo('categoria', sesion.idOrganizacion),
    estado_comercial: valoresDistintosCampo('estado_comercial', sesion.idOrganizacion),
    ciudad: valoresDistintosCampo('ciudad', sesion.idOrganizacion),
    departamento: valoresDistintosCampo('departamento', sesion.idOrganizacion),
    owner: valoresDistintosCampo('owner', sesion.idOrganizacion),
    rol: valoresDistintosCampo('rol', sesion.idOrganizacion),
  };

  const { segmento: segmentoParam, estado: estadoParam, owner: ownerParam } = await searchParams;
  const idSegmentoInicial = segmentoParam ? Number(segmentoParam) : NaN;
  const segmentoInicial = Number.isInteger(idSegmentoInicial) ? (segmentos.find((s) => s.id === idSegmentoInicial) ?? null) : null;
  const prefillSegmento = prefillSegmentoDesdeQuery({ estado: estadoParam, owner: ownerParam });

  return (
    <AppShell>
      <NuevaCampanaFlujo
        segmentosIniciales={segmentos}
        opciones={opciones}
        segmentoInicial={segmentoInicial}
        prefillSegmento={prefillSegmento}
      />
    </AppShell>
  );
}
```

- [ ] **Step 6: Cablear en `NuevaCampanaFlujo.tsx`**

```typescript
import { useState } from 'react';
import { NuevoSegmento } from './NuevoSegmento';
import { CadenciaPaso } from './CadenciaPaso';
import type { DefinicionSegmento } from '../../db/validation';

export type Segmento = { id: number; nombre: string; descripcionNatural: string | null };
export type Opciones = Record<'estado' | 'categoria' | 'estado_comercial' | 'ciudad' | 'departamento' | 'owner' | 'rol', string[]>;

export function NuevaCampanaFlujo({
  segmentosIniciales,
  opciones,
  segmentoInicial,
  prefillSegmento,
}: {
  segmentosIniciales: Segmento[];
  opciones: Opciones;
  segmentoInicial?: Segmento | null;
  prefillSegmento?: DefinicionSegmento;
}) {
  const [segmentos, setSegmentos] = useState(segmentosIniciales);
  const [segmentoElegido, setSegmentoElegido] = useState<Segmento | null>(null);
  const [ultimoSegmento, setUltimoSegmento] = useState<Segmento | null>(segmentoInicial ?? null);

  if (!segmentoElegido) {
    return (
      <NuevoSegmento
        opciones={opciones}
        segmentosGuardados={segmentos}
        reanudarDesde={ultimoSegmento}
        prefill={prefillSegmento}
        onGuardado={(s) => {
          setSegmentos((prev) => (prev.some((p) => p.id === s.id) ? prev : [s, ...prev]));
          setUltimoSegmento(s);
          setSegmentoElegido(s);
        }}
      />
    );
  }

  return <CadenciaPaso segmento={segmentoElegido} onVolver={() => setSegmentoElegido(null)} />;
}
```

- [ ] **Step 7: Cablear en `NuevoSegmento.tsx`**

Agregar el prop `prefill` y usarlo como estado inicial (línea 19 y firma en 47-53):

```typescript
type Props = {
  opciones: Opciones;
  segmentosGuardados: Segmento[];
  reanudarDesde?: Segmento | null;
  // Prefill de una definicion NUEVA (2026-07-14, boton "Promover a campana" de /cola) --
  // distinto de reanudarDesde (que retoma un segmento YA guardado por id). Solo aplica
  // como estado inicial: si tambien llega reanudarDesde, ese gana (useEffect de
  // cargarSegmentoGuardado corre despues y sobreescribe `def`).
  prefill?: DefinicionSegmento;
  onGuardado: (s: Segmento) => void;
};

export function NuevoSegmento({ opciones, segmentosGuardados, reanudarDesde, prefill, onGuardado }: Props) {
  const [def, setDef] = useState<DefinicionSegmento>(prefill ?? VACIO);
```

- [ ] **Step 8: `npx tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 9: Verificación manual**

Pedirle a Sebastián que abra `/campanas/nueva?estado=contacto_iniciado&owner=Felipe%20Castro`
directo y confirme que `NuevoSegmento` arranca con el filtro de estado + owner ya puesto (no
vacío), y que sigue pudiendo agregar/quitar condiciones desde ahí con normalidad.

- [ ] **Step 10: Commit**

```bash
git add app/campanas/nueva/prefill.ts app/campanas/nueva/prefill.test.ts app/campanas/nueva/page.tsx app/campanas/nueva/NuevaCampanaFlujo.tsx app/campanas/nueva/NuevoSegmento.tsx
git commit -m "feat(campanas): prefill de segmento desde /campanas/nueva?estado=&owner="
```

---

## Orden de ejecución y dependencias

1. Task 1 (query) — independiente.
2. Task 2 (decidirVista) — independiente.
3. Task 3 (proximoFollowUp en la action) — independiente.
4. Task 4 (ProximoToque compartido) — depende de Task 3 (usa el cuarto parámetro que Task 3
   agrega).
5. Task 5 (banner SecuenciaRail) — independiente.
6. Task 6 (sección en /cola) — depende de Task 1 (la query) y Task 2 (los links `?vista=`
   solo eligen el editor correcto una vez que Task 2 está mergeada).
7. Task 7 (prefill NuevoSegmento) — depende de Task 6 solo para la verificación manual del
   botón "Promover a campaña" (el código en sí es independiente).

Cada task es un diff pequeño y revisable por separado, con su propio commit — encaja con el
patrón "una tarea por delegación" del proyecto.

## Verificación final (después de las 7 tasks)

```bash
npx tsc --noEmit
node --experimental-strip-types --test app/db/repository.colaContactoIniciadoSinSeguimiento.test.ts
node --experimental-strip-types --test "app/llamada/[id]/ToqueContexto.test.ts"
node --experimental-strip-types --test "app/llamada/[id]/actions.registrarToqueSuelto.test.ts"
node --experimental-strip-types --test app/campanas/nueva/prefill.test.ts
```

Si el repo tiene un script único para correr toda la suite (revisar `package.json`), correrlo
también antes de dar por cerrado el plan.
