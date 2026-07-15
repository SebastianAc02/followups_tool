# Discovery, brief y toques que se hidratan solos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la ficha de una cuenta se alimente sola del dictado (facts crudos en Discovery, narrativa en el brief, resumen por toque) y que "Cómo hacen el recaudo" desaparezca como campo.

**Architecture:** Tres columnas nuevas (`empresa.notas_discovery`, `empresa.brief`, `toque.resumen`, `toque.transcript_resumen`) destraban un motor que ya existe desconectado (`pedirBorradores()`, el puerto `SyncPort.notasDiscovery`, el mapeo del adapter). Dos funciones de core puras (`fusionarDiscovery`, `hidratarBrief`) acumulan sin pisar, siempre como borrador aprobable. La UI pasa de un checklist fijo a un panel que se densifica con el dato.

**Tech Stack:** Next.js 16 + React 19, Drizzle ORM sobre SQLite (better-sqlite3), Zod 4, node:test, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-15-discovery-brief-hidratacion-design.md`

---

## Contexto que el implementador necesita saber

**Reglas de capas (no negociables, del CLAUDE.md):**
- El core (`app/core/`) NO importa Granola, Notion, Claude ni el driver de DB. Solo puertos.
- Acceso a datos solo por el Repository (`app/db/repository.ts`). Nunca SQL crudo regado.
- La IA nunca sincroniza sin revisión humana: borrador, aprobar, outbox.

**Voz de todo texto que lea un humano:** sin emojis, sin em dashes, español directo. Aplica a
prompts, a lo que la IA genera y a los comentarios del código.

**Comandos:**
- Tests: `npm test` (corre todo con `ISPS_DB_PATH=:memory:`).
- Un test solo: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/fusionar.test.ts`
- Typecheck: `npx tsc --noEmit`
- Generar migración: `npx drizzle-kit generate`
- **NO correr `npm run dev` ni preview.** Sebastián los corre él.

**Trampa verificada:** `app/db/test-helpers.ts` duplica a mano el DDL de las tablas. Si agregas
una columna al schema y no la agregas ahí, los tests de repository fallan con "no such column".
El propio archivo lo dice en su comentario de cabecera. La Tarea 1 lo cubre.

**Segunda trampa verificada:** `npm test` corre contra `:memory:`, que Drizzle construye siempre
en sync con `schema.ts`. Un cambio de schema pasa CI y revienta en producción al primer query si
falta la migración. Pasó con `empresa.pbx_forma` el 2026-07-14 (ver el comentario en
`scripts/migrate.ts`). Por eso la Tarea 1 genera la migración, no solo el schema.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `app/db/schema.ts` | mapeo Drizzle de las tablas | modificar (4 columnas) |
| `drizzle/0007_*.sql` | la migración | crear (generada) |
| `app/db/test-helpers.ts` | DDL duplicado del harness | modificar |
| `app/core/calificacion.ts` | qué datos duros tengo/faltan | modificar (sale `recaudo`) |
| `app/core/fusionar.ts` | fusionar facts, hidratar brief | crear |
| `app/core/fusionar.test.ts` | tests de las dos | crear |
| `app/core/estructurar-toque.ts` | dictado a campos | modificar (sale `recaudo`, entra `brief`) |
| `app/core/borradores.ts` | resumen Granola a campos | modificar (converge al mismo schema) |
| `app/db/repository.ts` | persistir y leer | modificar |
| `app/db/repository.discovery.test.ts` | tests de persistencia | crear |
| `app/llamada/[id]/actions.ts` | cablear IA + repo | modificar |
| `app/llamada/[id]/CalificacionChecklist.tsx` | pinta datos duros | modificar |
| `app/llamada/[id]/PanelCuenta.tsx` | el panel único | crear |
| `app/llamada/[id]/HistorialToques.tsx` | toques expandibles | crear |
| `app/llamada/[id]/LlamadaCard.tsx` | arma la ficha | modificar |
| `app/llamada/[id]/page.tsx` | pasa props | modificar |

---

### Task 1: Las cuatro columnas y su migración

**Files:**
- Modify: `app/db/schema.ts:36` (empresa), `app/db/schema.ts:104` (toque)
- Modify: `app/db/test-helpers.ts`
- Create: `drizzle/0007_*.sql` (generada)
- Test: `app/db/schema.discovery.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/schema.discovery.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

test('empresa tiene notas_discovery y brief', () => {
  const dbPath = crearDbPrueba();
  try {
    const sqlite = new Database(dbPath);
    const cols = sqlite.prepare("SELECT name FROM pragma_table_info('empresa')").all() as { name: string }[];
    const nombres = cols.map((c) => c.name);
    sqlite.close();
    assert.ok(nombres.includes('notas_discovery'), 'falta empresa.notas_discovery');
    assert.ok(nombres.includes('brief'), 'falta empresa.brief');
  } finally {
    borrarDbPrueba(dbPath);
  }
});

test('toque tiene resumen y transcript_resumen', () => {
  const dbPath = crearDbPrueba();
  try {
    const sqlite = new Database(dbPath);
    const cols = sqlite.prepare("SELECT name FROM pragma_table_info('toque')").all() as { name: string }[];
    const nombres = cols.map((c) => c.name);
    sqlite.close();
    assert.ok(nombres.includes('resumen'), 'falta toque.resumen');
    assert.ok(nombres.includes('transcript_resumen'), 'falta toque.transcript_resumen');
  } finally {
    borrarDbPrueba(dbPath);
  }
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/schema.discovery.test.ts`
Expected: FAIL con "falta empresa.notas_discovery"

- [ ] **Step 3: Agregar las columnas a `app/db/schema.ts`**

En `export const empresa`, después de `categoria: text('categoria'),` (línea 35):

```typescript
  // Facts crudos acumulados de la cuenta (cifras, sin narracion). Espeja la propiedad
  // "Notas Discovery" de Notion. Hasta 2026-07-15 esto era escritura ciega: se encolaba
  // al outbox (repository.ts) y se mapeaba en el adapter, pero sin columna local la tool
  // no las podia leer de vuelta ni acumularlas, solo pisarlas.
  notasDiscovery: text('notas_discovery'),
  // Narrativa del estado de la cuenta, se hidrata con cada toque. Distinta de
  // notasDiscovery: eso son datos, esto es la historia.
  brief: text('brief'),
```

En `export const toque`, después de `transcriptUrl: text('transcript_url'),` (línea 104):

```typescript
  // El resumen que ESCRIBIO la tool para este toque (producto). Es lo que se ve al abrir
  // el toque en el historial. Se llena venga de Granola o del dictado.
  resumen: text('resumen'),
  // El resumen que devolvio Granola, tal cual (insumo). Solo lo llena el camino de
  // Granola; en un toque dictado queda null. Se guarda separado de `resumen` para poder
  // regenerar el producto cuando cambie el prompt, sin volver a pedirle a Granola con
  // credencial por toques viejos. Es el "resumen cacheado" que pide el CLAUDE.md: el
  // consumidor (CRO/MCP) lo lee sin credencial.
  transcriptResumen: text('transcript_resumen'),
```

- [ ] **Step 4: Agregar las columnas al DDL del harness**

En `app/db/test-helpers.ts`, en `CREATE TABLE empresa`, después de `categoria TEXT,`:

```sql
      notas_discovery TEXT,
      brief TEXT,
```

En `CREATE TABLE toque`, después de `transcript_url TEXT,`:

```sql
      resumen TEXT,
      transcript_resumen TEXT,
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/schema.discovery.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Generar la migración**

Run: `npx drizzle-kit generate`
Expected: crea `drizzle/0007_<nombre-random>.sql` con cuatro `ALTER TABLE ... ADD`.

Verificar el contenido con Read. Debe tener exactamente estas cuatro líneas (el orden puede variar):

```sql
ALTER TABLE `empresa` ADD `notas_discovery` text;
ALTER TABLE `empresa` ADD `brief` text;
ALTER TABLE `toque` ADD `resumen` text;
ALTER TABLE `toque` ADD `transcript_resumen` text;
```

Si genera algo distinto (un DROP, un recreate de tabla), PARAR y avisar: significa que
`schema.ts` se desincronizó de la DB real en otra cosa y no es alcance de este plan.

- [ ] **Step 7: Correr toda la suite**

Run: `npm test`
Expected: PASS. No debe romper ningún test existente (las columnas son nullable).

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add app/db/schema.ts app/db/test-helpers.ts app/db/schema.discovery.test.ts drizzle/
git commit -m "feat(db): columnas de discovery, brief y resumen de toque

notas_discovery y brief en empresa, resumen y transcript_resumen en toque.
Destraban pedirBorradores() y el outbox de notasDiscovery, que hasta hoy
escribian a Notion sin poder leer de vuelta."
```

---

### Task 2: Sacar el recaudo de la calificación

Esto solo cierra el pedido original de Sebastián: la tarjeta rara desaparece. Es seguro hacerlo
antes que Discovery porque `recaudo` nunca se guardó (llega hardcodeado en `null` desde
`page.tsx:106`). No se pierde ningún dato porque no había ninguno.

**Files:**
- Modify: `app/core/calificacion.ts`
- Modify: `app/core/calificacion.test.ts`
- Modify: `app/llamada/[id]/page.tsx:102-107`
- Modify: `app/llamada/[id]/CalificacionChecklist.tsx:19`

- [ ] **Step 1: Cambiar el test primero**

En `app/core/calificacion.test.ts`, reemplazar los tres tests existentes por:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { calificar, CAMPOS_CALIFICACION } from './calificacion.ts';

test('calificar marca presente el campo con valor y ausente el vacio', () => {
  const r = calificar({ usuarios: 1240, crm: 'Zoho', pasarela: null });
  const porNombre = Object.fromEntries(r.items.map((i) => [i.campo, i]));
  assert.equal(porNombre.usuarios.estado, 'tengo');
  assert.equal(porNombre.usuarios.valor, '1,240'); // coma fija: calca el mockup del Toque 1/Confirmacion
  assert.equal(porNombre.crm.estado, 'tengo');
  assert.equal(porNombre.pasarela.estado, 'preguntar');
});

test('calificar cuenta cuantos tengo sobre el total de imprescindibles', () => {
  const r = calificar({ usuarios: 10, crm: 'X', pasarela: 'Y' });
  assert.equal(r.tengo, 3);
  assert.equal(r.total, 3);
});

test('calificar deja todo en preguntar cuando no hay ningun dato', () => {
  const r = calificar({ usuarios: null, crm: null, pasarela: null });
  assert.equal(r.tengo, 0);
});

test('recaudo no es un campo de calificacion: vive en notas_discovery', () => {
  const campos = CAMPOS_CALIFICACION.map((c) => c.campo);
  assert.deepEqual(campos, ['usuarios', 'pasarela', 'crm']);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/calificacion.test.ts`
Expected: FAIL. El test de `CAMPOS_CALIFICACION` falla porque todavía trae `recaudo`.

- [ ] **Step 3: Sacar el recaudo del core**

Reemplazar el encabezado y las dos primeras declaraciones de `app/core/calificacion.ts`:

```typescript
// Dominio del Toque 1: que de los datos duros de la cuenta ya tengo y que me toca sacar
// en la llamada. Logica pura (sin DB): el server component le pasa los valores crudos y
// recibe la tabla lista para pintar.
//
// "Como hacen el recaudo" NO vive aca (2026-07-15). Es un fact dentro de notas_discovery,
// no un campo hermano de estos tres: se dicta y la IA lo extrae, no se teclea en una
// casilla. Estos tres son los imprescindibles que el protocolo del CRM nombra y los
// unicos que tienen columna propia en empresa.
export type CampoCalificacion = 'usuarios' | 'crm' | 'pasarela';

export const CAMPOS_CALIFICACION: { campo: CampoCalificacion; label: string }[] = [
  { campo: 'usuarios', label: 'Número de usuarios' },
  { campo: 'pasarela', label: 'Pasarela actual' },
  { campo: 'crm', label: 'CRM / Software' },
];
```

Y en `type Entrada`, borrar la línea `recaudo: string | null;`:

```typescript
type Entrada = {
  usuarios: number | null;
  crm: string | null;
  pasarela: string | null;
};
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/calificacion.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Quitar el argumento muerto en page.tsx**

En `app/llamada/[id]/page.tsx`, líneas 102-107, borrar la línea `recaudo: null,`:

```typescript
              calificacion={calificar({
                usuarios: ctx.emp.usuarios ?? null,
                crm: ctx.emp.crm ?? null,
                pasarela: ctx.emp.pasarela ?? null,
              })}
```

- [ ] **Step 6: Simplificar CalificacionChecklist**

`CAMPOS_CON_INPUT` existía solo para excluir `recaudo`. Ahora los tres campos son editables, así
que el Set y la rama del `else` final sobran. En `app/llamada/[id]/CalificacionChecklist.tsx`:

Borrar las líneas 12-19 (el comentario de `CAMPOS_CON_INPUT` y la constante) y reemplazar por:

```typescript
// Todos los campos de PREGUNTAR son editables inline: los tres tienen columna real (ver
// actualizarCampoCalificacion en el repository), asi que un click abre un cajon de texto
// ahi mismo, sin pasar por el formulario de Registrar toque -- este dato no depende de
// haber calificado un resultado de llamada.
```

En el JSX, quitar las dos guardas `CAMPOS_CON_INPUT.has(item.campo) &&` / `CAMPOS_CON_INPUT.has(item.campo) ?`
y borrar la rama final del ternario (líneas 121-130, el `<div>` no clickeable). El ternario
queda de tres ramas a dos:

```tsx
        {calificacion.items.map((item) =>
          item.estado === "tengo" ? (
            // ... la rama "tengo", sin cambios
          ) : editando === item.campo ? (
            // ... la rama del input abierto, sin cambios
          ) : (
            // ... la rama del boton PREGUNTAR, sin cambios
          ),
        )}
```

- [ ] **Step 7: Correr toda la suite y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, sin errores de tipo. Si `tsc` se queja de `recaudo` en algún lado, ese caller
quedó huérfano: buscar con `grep -rn "recaudo" app` y limpiarlo.

- [ ] **Step 8: Commit**

```bash
git add app/core/calificacion.ts app/core/calificacion.test.ts app/llamada/
git commit -m "fix(ficha): el recaudo deja de ser campo de calificacion

Era un item zombi: sin columna en empresa, llegaba hardcodeado en null y
siempre decia PREGUNTAR sin poderse llenar. Es un fact de notas_discovery.
De paso CAMPOS_CON_INPUT sobra: los tres campos que quedan son editables."
```

---

### Task 3: `fusionarDiscovery()` — el core del spec

**Esta tarea es de Sebastián** (modo learning del CLAUDE.md: la decisión de diseño, no el
boilerplate). El implementador deja el andamiaje, el archivo, la firma, los tests y el TODO.
**No rellena el cuerpo de la función.**

**Files:**
- Create: `app/core/fusionar.ts`
- Create: `app/core/fusionar.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `app/core/fusionar.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionarDiscovery } from './fusionar.ts';
import type { IAPort } from './ports/ia.ts';

test('fusionarDiscovery no llama a la IA cuando no hay facts nuevos', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await fusionarDiscovery('10.000 usuarios. CRM Wispro.', '   ', ia);
  assert.equal(llamado, false);
  assert.equal(r, '10.000 usuarios. CRM Wispro.');
});

test('fusionarDiscovery devuelve los facts nuevos tal cual cuando no habia notas', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await fusionarDiscovery('', 'Pasarela Epayco. 8 personas en recaudo.', ia);
  assert.equal(llamado, false);
  assert.equal(r, 'Pasarela Epayco. 8 personas en recaudo.');
});

test('fusionarDiscovery le pasa a la IA las notas actuales y los facts nuevos', async () => {
  let promptVisto = '';
  const ia: IAPort = {
    generar: async <T,>(prompt: string) => {
      promptVisto = prompt;
      return { notas: '10.000 usuarios. CRM Wispro. Pasarela Epayco.' } as T;
    },
  };
  await fusionarDiscovery('10.000 usuarios. CRM Wispro.', 'Pasarela Epayco.', ia);
  assert.match(promptVisto, /10\.000 usuarios/);
  assert.match(promptVisto, /Pasarela Epayco/);
});

test('fusionarDiscovery devuelve la fusion que entrega la IA', async () => {
  const ia: IAPort = { generar: async <T,>() => ({ notas: '10.000 usuarios. Pasarela Epayco.' } as T) };
  const r = await fusionarDiscovery('10.000 usuarios.', 'Pasarela Epayco.', ia);
  assert.equal(r, '10.000 usuarios. Pasarela Epayco.');
});

// El test que de verdad importa: la fusion no puede destruir lo que costo llamadas.
test('fusionarDiscovery rechaza una fusion que perdio contenido y devuelve las notas actuales', async () => {
  const notasActuales = '10.000 usuarios. Pasarela Epayco, con caidas en dias de pago. 8 personas validan pagos. CRM Wispro.';
  const ia: IAPort = { generar: async <T,>() => ({ notas: 'Pasarela Epayco.' } as T) };
  const r = await fusionarDiscovery(notasActuales, 'Pasarela Epayco.', ia);
  assert.equal(r, notasActuales, 'una fusion sospechosamente corta no puede pisar las notas buenas');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/fusionar.test.ts`
Expected: FAIL con "Cannot find module './fusionar.ts'"

- [ ] **Step 3: Crear el andamiaje (el implementador hace SOLO esto)**

Crear `app/core/fusionar.ts`:

```typescript
// Acumula lo que sabemos de una cuenta sin destruir lo que ya sabiamos. Mismo patron que
// borradores.ts: funciones de core que arman su propio prompt + schema y llaman a IAPort,
// sin tocar Notion ni la DB.
//
// Es la primera vez en este repo que la IA REESCRIBE un campo con contenido previo, en vez
// de proponer uno vacio. El modo de falla no es "agrega basura", es "borra facts que
// costaron llamadas". Por eso: nunca va directo al outbox (el caller la muestra como
// borrador aprobable) y por eso hay un piso de seguridad contra fusiones que encogen.
import { z } from 'zod';
import type { IAPort } from './ports/ia';

const fusionSchema = z.object({ notas: z.string() });

// Una fusion legitima puede acortar (dedup, cifras que se consolidan), pero no a la mitad.
// Por debajo de esto asumimos que la IA se comio facts y devolvemos lo que ya teniamos:
// perder la llamada nueva es recuperable (esta en el toque), perder tres meses de discovery
// no lo es.
const PISO_ENCOGIMIENTO = 0.5;

function construirPrompt(notasActuales: string, factsNuevos: string): string {
  // TODO(Sebastián): el prompt de fusion.
  //
  // Contexto: OnePay es una fintech colombiana que le vende software de gestion de pagos a
  // ISPs. `notasActuales` son los facts que ya teniamos de la cuenta (acumulados de llamadas
  // anteriores); `factsNuevos` son los que salieron de la llamada de hoy.
  //
  // Forma del destino (ejemplo real de Notion): "10.000 usuarios. Pasarela Epayco, con
  // caidas y errores sobre todo en dias de pago. ~40-50% pagos digitales hoy. Factura el 1;
  // cortes 10, 15 y 20. 8 personas (una por zona) validan pagos. CRM Wispro."
  //
  // Lo que hay que decidir (esto es la decision de diseño, no el boilerplate):
  //   - Que hace la IA cuando un fact nuevo CONTRADICE uno viejo. "Antes 8 personas en
  //     recaudo, ahora 5": gana el nuevo? se guardan los dos con fecha? Ojo que sin fecha
  //     no se sabe cual es cual, y con fecha las notas se vuelven un log.
  //   - Que cuenta como duplicado. "CRM Wispro" y "usan Wispro" son el mismo fact escrito
  //     distinto. Que tan agresivo con el dedup?
  //   - El orden. Se respeta el de las notas viejas y lo nuevo va al final, o se reagrupa
  //     por tema (pagos, operacion, gente)? Reagrupar lee mejor pero mueve texto que
  //     Sebastián ya reviso.
  //
  // Reglas del repo que el prompt tiene que respetar: sin emojis, sin em dashes, español
  // directo (voz colombiana ejecutiva). Solo facts, cero narracion (eso es el brief).
  // Nunca inventar un dato que no este en ninguna de las dos entradas.
  throw new Error('TODO: construirPrompt sin implementar');
}

export async function fusionarDiscovery(
  notasActuales: string,
  factsNuevos: string,
  ia: IAPort,
): Promise<string> {
  // Sin facts nuevos no hay nada que fusionar: no gastar tokens del gateway.
  if (!factsNuevos.trim()) return notasActuales;
  // Sin notas previas no hay nada que destruir ni que dedupear: los facts nuevos SON las notas.
  if (!notasActuales.trim()) return factsNuevos;

  const { notas } = await ia.generar(construirPrompt(notasActuales, factsNuevos), fusionSchema);

  // Piso de seguridad: ver PISO_ENCOGIMIENTO.
  if (notas.length < notasActuales.length * PISO_ENCOGIMIENTO) return notasActuales;
  return notas;
}
```

- [ ] **Step 4: PARAR y entregarle el hueco a Sebastián**

No implementar `construirPrompt`. Reportar:

> Tarea 3 lista hasta el andamiaje. `app/core/fusionar.ts` tiene la firma, los cortocircuitos,
> el piso de encogimiento y los tests. Falta `construirPrompt`, que es la decisión de diseño:
> qué pasa cuando un fact nuevo contradice uno viejo, qué cuenta como duplicado, y si el orden
> se respeta o se reagrupa. El TODO en el archivo tiene el contexto y el ejemplo de forma.
>
> Los tests 1, 2 y 5 pasan sin el prompt (cortocircuitos y piso). Los tests 3 y 4 fallan hasta
> que exista.

- [ ] **Step 5: Cuando Sebastián lo escriba, correr los tests**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/fusionar.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add app/core/fusionar.ts app/core/fusionar.test.ts
git commit -m "feat(core): fusionarDiscovery acumula facts sin pisar

Primera funcion del repo donde la IA reescribe un campo con contenido previo.
El piso de encogimiento es el seguro: una fusion que devuelve menos de la mitad
se descarta y ganan las notas viejas."
```

---

### Task 4: `hidratarBrief()`

Misma forma que `fusionarDiscovery` pero para la narrativa. El prompt sí lo escribe el
implementador: la decisión de diseño difícil (qué hacer con lo que se contradice) ya la tomó
Sebastián en la Tarea 3 y esta la hereda.

**Files:**
- Modify: `app/core/fusionar.ts`
- Modify: `app/core/fusionar.test.ts`

- [ ] **Step 1: Agregar los tests que fallan**

Al final de `app/core/fusionar.test.ts`:

```typescript
import { hidratarBrief } from './fusionar.ts';

test('hidratarBrief no llama a la IA cuando el toque nuevo viene vacio', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await hidratarBrief('Cuenta de Andina Link.', '  ', ia);
  assert.equal(llamado, false);
  assert.equal(r, 'Cuenta de Andina Link.');
});

test('hidratarBrief arranca el brief cuando no habia', async () => {
  const ia: IAPort = { generar: async <T,>() => ({ brief: 'Cuenta que llamamos el 19-jun.' } as T) };
  const r = await hidratarBrief('', 'Llamamos a Cesar, no hay fit.', ia);
  assert.equal(r, 'Cuenta que llamamos el 19-jun.');
});

test('hidratarBrief le pasa a la IA el brief actual y el toque nuevo', async () => {
  let promptVisto = '';
  const ia: IAPort = {
    generar: async <T,>(prompt: string) => {
      promptVisto = prompt;
      return { brief: 'x' } as T;
    },
  };
  await hidratarBrief('Cuenta de Andina Link.', 'Llamamos a Cesar, no hay fit.', ia);
  assert.match(promptVisto, /Andina Link/);
  assert.match(promptVisto, /Cesar/);
});

test('hidratarBrief rechaza una hidratacion que perdio contenido', async () => {
  const briefActual = 'Cuenta que conocimos en Andina Link. Se llamo el 19-jun. Nos dijo que no maneja cartera y ya usa Wompi mas PayU. Objeto el modelo de cobro.';
  const ia: IAPort = { generar: async <T,>() => ({ brief: 'No hay fit.' } as T) };
  const r = await hidratarBrief(briefActual, 'Llamamos otra vez.', ia);
  assert.equal(r, briefActual);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/fusionar.test.ts`
Expected: FAIL con "hidratarBrief is not a function"

- [ ] **Step 3: Implementar**

Agregar al final de `app/core/fusionar.ts`:

```typescript
const briefSchema = z.object({ brief: z.string() });

function construirPromptBrief(briefActual: string, toqueNuevo: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Mantienes el brief de una \
cuenta: la narrativa de en que va, para que cualquiera entre a una reunion y entienda la \
cuenta sin contexto previo.

BRIEF ACTUAL:
${briefActual}

LO QUE PASO EN EL TOQUE NUEVO:
${toqueNuevo}

Devuelve el brief actualizado: el actual enriquecido con lo del toque nuevo. No es un \
resumen del toque, es la historia de la cuenta hasta hoy.

Conserva todo lo del brief actual que el toque nuevo no contradiga. Si lo contradice, gana \
lo nuevo, pero deja dicho que cambio. No repitas el mismo hecho dos veces. Nunca inventes \
nada que no este en ninguna de las dos entradas.

Narracion, no lista de datos (los datos sueltos van en las notas de discovery, no aca). \
Forma de ejemplo: "Cuenta que conocimos en Andina Link. Se llamo el 19-jun. Nos dijo que no \
maneja cartera y ya usa Wompi mas PayU. Objeto el modelo de cobro por plan fijo. Quedo \
reunion el 6-jul."

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Hechos primero, \
cero preambulo, cero adjetivos de relleno.`;
}

export async function hidratarBrief(
  briefActual: string,
  toqueNuevo: string,
  ia: IAPort,
): Promise<string> {
  if (!toqueNuevo.trim()) return briefActual;

  const { brief } = await ia.generar(construirPromptBrief(briefActual, toqueNuevo), briefSchema);

  if (brief.length < briefActual.length * PISO_ENCOGIMIENTO) return briefActual;
  return brief;
}
```

Nota: `hidratarBrief` NO cortocircuita cuando `briefActual` está vacío (a diferencia de
`fusionarDiscovery`). Con notas vacías, los facts nuevos ya SON las notas y no hay nada que
narrar; con brief vacío, un toque crudo no es un brief todavía: hay que narrarlo. El test
"arranca el brief cuando no habia" cubre eso.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/fusionar.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add app/core/fusionar.ts app/core/fusionar.test.ts
git commit -m "feat(core): hidratarBrief acumula la narrativa de la cuenta"
```

---

### Task 5: Los dos caminos convergen en un schema

Hoy `borradorToqueSchema` (Granola) y `toqueEstructuradoSchema` (dictado) producen ambos
`notasDiscovery` y `quePaso` con prompts que se contradicen ("dos o tres oraciones" vs "una o
dos"). Se unifican.

**Files:**
- Modify: `app/core/estructurar-toque.ts`
- Modify: `app/core/estructurar-toque.test.ts`
- Modify: `app/core/borradores.ts`
- Modify: `app/core/borradores.test.ts`

- [ ] **Step 1: Leer los dos archivos y sus tests**

Run: `cat app/core/estructurar-toque.ts app/core/estructurar-toque.test.ts app/core/borradores.ts app/core/borradores.test.ts`

Entender qué campos produce cada uno antes de tocar nada.

- [ ] **Step 2: Escribir el test que falla**

En `app/core/estructurar-toque.test.ts`, agregar:

```typescript
test('toqueEstructuradoSchema no tiene recaudo: es un fact de notas_discovery', () => {
  const forma = toqueEstructuradoSchema.parse({
    resultado: null,
    quePaso: '',
    resumen: '',
    brief: '',
    notasDiscovery: '',
    usuarios: null,
    crm: null,
    pasarela: null,
    proximoPaso: '',
    proximoFollowUp: null,
  });
  assert.ok(!('recaudo' in forma));
});
```

Asegurate de que `toqueEstructuradoSchema` esté importado en el archivo de test.

- [ ] **Step 3: Correr y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/estructurar-toque.test.ts`
Expected: FAIL. Zod rechaza el objeto porque falta `recaudo` (required) y sobran `brief`/`notasDiscovery`.

- [ ] **Step 4: Unificar el schema en `estructurar-toque.ts`**

Reemplazar el schema y el VACIO:

```typescript
export const toqueEstructuradoSchema = z.object({
  resultado: z.enum(RESULTADOS).nullable(),
  quePaso: z.string(),        // telegrafico, la fila de la tabla de toques
  resumen: z.string(),        // el resumen propio de la tool de esta llamada
  brief: z.string(),          // insumo para hidratarBrief, no se guarda tal cual
  notasDiscovery: z.string(), // facts crudos de ESTA llamada, insumo para fusionarDiscovery
  usuarios: z.number().nullable(),
  crm: z.string().nullable(),
  pasarela: z.string().nullable(),
  proximoPaso: z.string(),
  proximoFollowUp: z.string().nullable(), // YYYY-MM-DD o null
});
export type ToqueEstructurado = z.infer<typeof toqueEstructuradoSchema>;

const VACIO: ToqueEstructurado = {
  resultado: null,
  quePaso: '',
  resumen: '',
  brief: '',
  notasDiscovery: '',
  usuarios: null,
  crm: null,
  pasarela: null,
  proximoPaso: '',
  proximoFollowUp: null,
};
```

`recaudo` sale del schema. El prompt lo sigue extrayendo, pero adentro de `notasDiscovery`.

- [ ] **Step 5: Reescribir el prompt**

Reemplazar el cuerpo de `construirPrompt` en `estructurar-toque.ts`:

```typescript
function construirPrompt(dictado: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Recibes el dictado de un \
vendedor justo despues de colgar una llamada comercial (texto, nunca audio) y debes \
estructurarlo.

DICTADO:
${dictado}

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Extrae UNICAMENTE \
lo que aparece explicitamente en el dictado. Si un dato no aparece, deja el campo en null \
(o string vacio para texto libre), nunca lo inventes ni lo asumas.

resultado: la salida de la llamada, una de las opciones validas del enum, o null si el \
dictado no la menciona con claridad.

quePaso: el veredicto de la llamada, telegrafico, maximo 200 caracteres. Es la fila de una \
tabla que se escanea de un vistazo, no un resumen. Ejemplo del tono exacto: "Conecto (larga). \
No fit: sin cartera, usa Wompi+PayU, ya usa OnePay para pagar a un proveedor. Objecion: \
modelo (plan+fijo vs pago-por-uso). No agendo".

resumen: todo lo relevante que se hablo en la llamada, narrado. Aca si te extiendes: es lo \
que se lee al abrir el toque cuando alguien quiere saber que paso de verdad.

brief: en que va la cuenta segun esta llamada, narrado en dos o tres lineas (sector, tamano, \
dolor principal, donde quedo). Es insumo para actualizar el brief de la cuenta.

notasDiscovery: SOLO los facts duros que solto esta llamada, sin narracion. Datos, cifras, \
porcentajes, nombres de herramientas, como hacen el recaudo, que dias facturan y cortan, \
cuanta gente tienen en que, que porcentaje paga cuando. Ejemplo del tono exacto: "~40-50% \
pagos digitales hoy. Factura el 1; cortes 10, 15 y 20. 8 personas (una por zona) validan \
pagos. CRM Wispro."

usuarios: numero de usuarios de la cuenta si se menciono, o null.
crm: el CRM o software que usa la cuenta si se menciono, o null.
pasarela: la pasarela de pago actual si se menciono, o null.
proximoPaso: la accion concreta acordada, en una sola oracion (string vacio si no hay).
proximoFollowUp: fecha del proximo contacto en formato YYYY-MM-DD si se menciono, o null.`;
}
```

- [ ] **Step 6: Hacer que `borradores.ts` reuse el mismo schema**

`pedirBorradores` recibe el resumen de Granola en vez del dictado, pero produce lo mismo.
Reemplazar `app/core/borradores.ts` entero:

```typescript
// Toma el resumen cacheado de una sesion (ya traido por el TranscriptAdapter) y devuelve el
// MISMO borrador que estructurar-toque.ts saca de un dictado. Son dos entradas (Granola y la
// voz de Sebastián) para una sola salida: hasta 2026-07-15 eran dos schemas solapados con
// prompts que se contradecian ("dos o tres oraciones" vs "una o dos").
//
// La IA NUNCA llega a Notion sin que el owner apruebe cada borrador (outbox).
import type { IAPort } from './ports/ia';
import { toqueEstructuradoSchema, type ToqueEstructurado } from './estructurar-toque';
import { RESULTADOS } from '../db/validation';

const VACIO: ToqueEstructurado = {
  resultado: null,
  quePaso: '',
  resumen: '',
  brief: '',
  notasDiscovery: '',
  usuarios: null,
  crm: null,
  pasarela: null,
  proximoPaso: '',
  proximoFollowUp: null,
};

function construirPrompt(resumenCacheado: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Recibes el resumen de una \
sesion comercial que grabo Granola y debes estructurarlo.

RESUMEN DE LA SESION:
${resumenCacheado}

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Extrae UNICAMENTE \
lo que aparece explicitamente en el resumen. Si un dato no aparece, deja el campo en null \
(o string vacio para texto libre), nunca lo inventes ni lo asumas.

resultado: la salida de la sesion, una de estas opciones (${RESULTADOS.join(', ')}), o null \
si el resumen no la menciona con claridad.

quePaso: el veredicto de la sesion, telegrafico, maximo 200 caracteres. Es la fila de una \
tabla que se escanea de un vistazo. Ejemplo del tono exacto: "Reunion de discovery y demo \
(52 min) con Cristian, Karen y Julieta. Levantamos la operacion, mostramos el flujo por \
WhatsApp y la conciliacion, y revisamos precios. Quedan de socializar y decidir."

resumen: todo lo relevante que se hablo, narrado. Aca si te extiendes: es lo que se lee al \
abrir el toque cuando alguien quiere saber que paso de verdad.

brief: en que va la cuenta segun esta sesion, narrado en dos o tres lineas (sector, tamano, \
dolor principal, donde quedo).

notasDiscovery: SOLO los facts duros que solto la sesion, sin narracion. Datos, cifras, \
porcentajes, nombres de herramientas, como hacen el recaudo, que dias facturan y cortan. \
Ejemplo del tono exacto: "~40-50% pagos digitales hoy. Factura el 1; cortes 10, 15 y 20. 8 \
personas (una por zona) validan pagos. CRM Wispro."

usuarios: numero de usuarios de la cuenta si se menciono, o null.
crm: el CRM o software que usa la cuenta si se menciono, o null.
pasarela: la pasarela de pago actual si se menciono, o null.
proximoPaso: accion concreta acordada o sugerida, en una sola oracion (string vacio si no hay).
proximoFollowUp: fecha del proximo contacto en formato YYYY-MM-DD si se menciono, o null.`;
}

// Un resumen vacio no tiene nada que extraer: no vale la pena gastar tokens del gateway.
export async function pedirBorradores(resumenCacheado: string, ia: IAPort): Promise<ToqueEstructurado> {
  if (!resumenCacheado.trim()) return VACIO;
  return ia.generar(construirPrompt(resumenCacheado), toqueEstructuradoSchema);
}
```

- [ ] **Step 7: Arreglar `borradores.test.ts`**

Los dos tests existentes esperan la forma vieja (`{ notasDiscovery, quePaso, brief, proximoPaso }`).
Reemplazar el archivo entero:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { pedirBorradores } from './borradores.ts';
import type { ToqueEstructurado } from './estructurar-toque.ts';
import type { IAPort } from './ports/ia.ts';

test('pedirBorradores no llama a la IA cuando el resumen esta vacio', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await pedirBorradores('   ', ia);
  assert.equal(llamado, false);
  assert.equal(r.quePaso, '');
  assert.equal(r.notasDiscovery, '');
  assert.equal(r.brief, '');
  assert.equal(r.resultado, null);
});

test('pedirBorradores devuelve lo que entrega la IA cuando hay resumen', async () => {
  const esperado: ToqueEstructurado = {
    resultado: null,
    quePaso: 'Presentamos la demo. Quedan de decidir.',
    resumen: 'Reunion de 40 minutos con Carlos. Levantamos la operacion y mostramos el flujo.',
    brief: 'ISP en Medellin, 800 suscriptores. Dolor: cartera manual.',
    notasDiscovery: '800 suscriptores. CRM Wispro. Pasarela PayU.',
    usuarios: 800,
    crm: 'Wispro',
    pasarela: 'PayU',
    proximoPaso: 'Enviar propuesta el viernes.',
    proximoFollowUp: '2026-07-17',
  };
  const ia: IAPort = { generar: async <T,>() => esperado as T };
  const r = await pedirBorradores('reunion con Carlos, gerente de Fibernet...', ia);
  assert.deepEqual(r, esperado);
});

test('pedirBorradores y estructurarToque producen la misma forma', async () => {
  const ia: IAPort = { generar: async <T,>() => ({ quePaso: 'x' } as T) };
  const r = await pedirBorradores('algo', ia);
  // Si esto compila y corre, los dos caminos comparten ToqueEstructurado.
  const _tipado: ToqueEstructurado['quePaso'] = r.quePaso;
  assert.equal(_tipado, 'x');
});
```

- [ ] **Step 8: Correr toda la suite y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. `tsc` va a marcar los callers de `borrador.recaudo` en
`app/llamada/[id]/CapturaLlamada.tsx`: quitarlos (el campo ya no existe).

- [ ] **Step 9: Commit**

```bash
git add app/core/estructurar-toque.ts app/core/estructurar-toque.test.ts app/core/borradores.ts app/core/borradores.test.ts app/llamada/
git commit -m "refactor(core): Granola y el dictado convergen en un schema

Eran dos schemas solapados con prompts contradictorios (uno pedia dos o tres
oraciones para quePaso, el otro una o dos). Ahora quePaso es telegrafico en
los dos, y el texto largo vive en resumen."
```

---

### Task 6: Persistir Discovery, brief y resumen

**Files:**
- Modify: `app/db/repository.ts`
- Create: `app/db/repository.discovery.test.ts`

- [ ] **Step 1: Leer el repository para seguir su patrón**

Run: `grep -n "export function actualizarCampoCalificacion" -A 25 app/db/repository.ts`
Run: `grep -n "export function registrarToque" -A 40 app/db/repository.ts`

Fijate en cómo filtran por `idOrganizacion` y cómo abren transacción. Seguir ese patrón exacto.

- [ ] **Step 2: Escribir el test que falla**

Crear `app/db/repository.discovery.test.ts`. El arranque (DB temporal al tope del módulo,
`ISPS_DB_PATH` seteado ANTES del import dinámico del repository, `test.after` para limpiar) está
copiado de `repository.actualizarCampoCalificacion.test.ts`. El import dinámico no es cosmético:
el repository lee `ISPS_DB_PATH` al cargarse, así que un `import` estático arriba agarraría la DB
equivocada.

```typescript
// Pruebas de Repository para el discovery de la cuenta (notas, brief) y el resumen del toque.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { leerDiscovery, guardarDiscovery, guardarResumenToque } = await import('./repository.ts');

function seedEmpresa(id: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?)`,
    )
    .run(id, organizacionActivaId);
  raw.close();
}

function seedToque(idEmpresa: string): number {
  const raw = new Database(dbPath);
  const r = raw
    .prepare(`INSERT INTO toque (id_empresa, canal, que_paso, fuente, id_organizacion) VALUES (?, 'llamada', 'Conecto.', 'herramienta', 1)`)
    .run(idEmpresa);
  raw.close();
  return Number(r.lastInsertRowid);
}

test('leerDiscovery devuelve string vacio cuando la empresa no tiene nada', () => {
  seedEmpresa('disc-1');
  assert.deepEqual(leerDiscovery('disc-1', 1), { notas: '', brief: '' });
});

test('guardarDiscovery escribe notas y brief, y leerDiscovery los devuelve', () => {
  seedEmpresa('disc-2');
  guardarDiscovery('disc-2', { notas: '10.000 usuarios. CRM Wispro.', brief: 'ISP de Cali.' }, 1);
  assert.deepEqual(leerDiscovery('disc-2', 1), { notas: '10.000 usuarios. CRM Wispro.', brief: 'ISP de Cali.' });
});

test('guardarDiscovery rechaza si la empresa esta activa en otra organizacion', () => {
  seedEmpresa('disc-3', 2);
  assert.throws(() => guardarDiscovery('disc-3', { notas: 'x', brief: 'y' }, 1), /organizacion/i);
});

test('guardarDiscovery rechaza si la empresa no existe', () => {
  assert.throws(() => guardarDiscovery('no-existe', { notas: 'x', brief: 'y' }, 1), /no existe/i);
});

test('guardarResumenToque escribe resumen y transcript_resumen', () => {
  seedEmpresa('disc-4');
  const idToque = seedToque('disc-4');
  guardarResumenToque(idToque, { resumen: 'Llamada de 40 minutos con Carlos.', transcriptResumen: 'crudo de granola' });

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT resumen, transcript_resumen FROM toque WHERE id_toque = ?').get(idToque) as any;
  raw.close();
  assert.equal(fila.resumen, 'Llamada de 40 minutos con Carlos.');
  assert.equal(fila.transcript_resumen, 'crudo de granola');
});

test('guardarResumenToque no pisa transcript_resumen cuando no se lo pasan', () => {
  seedEmpresa('disc-5');
  const idToque = seedToque('disc-5');
  guardarResumenToque(idToque, { resumen: 'primero', transcriptResumen: 'de granola' });
  guardarResumenToque(idToque, { resumen: 'segundo' });

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT resumen, transcript_resumen FROM toque WHERE id_toque = ?').get(idToque) as any;
  raw.close();
  assert.equal(fila.resumen, 'segundo');
  assert.equal(fila.transcript_resumen, 'de granola', 'el insumo de Granola no se pierde al reescribir el producto');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.discovery.test.ts`
Expected: FAIL con "leerDiscovery is not a function"

- [ ] **Step 4: Implementar en `app/db/repository.ts`**

Poner estas tres funciones justo después de `actualizarCampoCalificacion` (termina cerca de la
línea 670), que es la que marca el patrón.

**Ojo con el patrón de organización.** `actualizarCampoCalificacion:648-656` **lee**
`organizacionActivaId` y **lanza** si no coincide. NO usa un `.where(and(...))` que haría un
no-op silencioso: si le pasas una empresa de otra org, tiene que explotar, no callarse. Estas
funciones copian ese patrón exacto:

```typescript
// Lee lo que ya sabemos de la cuenta, para dárselo a fusionarDiscovery/hidratarBrief como punto
// de partida. Devuelve strings vacíos (no null) porque el core trabaja con strings.
export function leerDiscovery(idEmpresa: string, idOrganizacion: number): { notas: string; brief: string } {
  const fila = db
    .select({
      notas: empresa.notasDiscovery,
      brief: empresa.brief,
      organizacionActivaId: empresa.organizacionActivaId,
    })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!fila) return { notas: '', brief: '' };
  if (fila.organizacionActivaId !== idOrganizacion) return { notas: '', brief: '' };
  return { notas: fila.notas ?? '', brief: fila.brief ?? '' };
}

// Escribe la version que Sebastián ya aprobó. NO encola al outbox: eso lo hace el caller, en la
// misma transaccion que el toque (patron Outbox, ver CLAUDE.md).
export function guardarDiscovery(
  idEmpresa: string,
  datos: { notas: string; brief: string },
  idOrganizacion: number,
): void {
  const emp = db
    .select({ organizacionActivaId: empresa.organizacionActivaId })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!emp) throw new Error(`Empresa ${idEmpresa} no existe`);
  if (emp.organizacionActivaId !== idOrganizacion) {
    throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
  }

  db.update(empresa)
    .set({ notasDiscovery: datos.notas, brief: datos.brief })
    .where(eq(empresa.idEmpresa, idEmpresa))
    .run();
}

// transcriptResumen es opcional a proposito: en un toque dictado no hay Granola, y al
// regenerar el `resumen` con un prompt nuevo no se debe perder el insumo ya cacheado.
export function guardarResumenToque(
  idToque: number,
  datos: { resumen: string; transcriptResumen?: string | null },
): void {
  db.update(toque)
    .set({
      resumen: datos.resumen,
      ...(datos.transcriptResumen !== undefined ? { transcriptResumen: datos.transcriptResumen } : {}),
    })
    .where(eq(toque.idToque, idToque))
    .run();
}
```

`leerDiscovery` devuelve vacío en vez de lanzar cuando la empresa es de otra org: es una lectura
para armar un borrador, y un throw ahí reventaría la ficha entera. `guardarDiscovery` sí lanza,
porque una escritura silenciosa a la cuenta equivocada es el bug que hay que evitar.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.discovery.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Exponer notas, brief y resumen en `getCuenta`**

Aquí es fácil equivocarse de función. `getContextoToque:4487` **no hace el select**: delega en
`getCuenta(id, idOrganizacion)` y solo reparte el resultado. Los selects viven en
`getCuenta:433`. Modificar ahí.

En el select de la empresa (`app/db/repository.ts:435-450`), después de `pbxForma: empresa.pbxForma,`:

```typescript
      notasDiscovery: empresa.notasDiscovery,
      brief: empresa.brief,
```

En el select de los toques (`app/db/repository.ts:471-488`), después de `transcriptId: toque.transcriptId,`:

```typescript
      transcriptUrl: toque.transcriptUrl,
      resumen: toque.resumen,
```

`transcriptUrl` no estaba: el comentario de `page.tsx:57` ("getCuenta().toques no expone
transcriptUrl") decía la verdad. `HistorialToques` lo necesita para el link a Granola.

- [ ] **Step 7: Decidir el límite del historial**

`getCuenta` tiene `.limit(5)` en los toques (línea 487). Con el historial expandible eso pasa a
ser visible: la ficha mostraría solo los últimos 5 toques, sin decir que hay más.

Subirlo a 20 y dejar dicho por qué:

```typescript
    // Limite 20 (antes 5, subido con el historial expandible de 2026-07-15): 5 alcanzaba
    // cuando la ficha solo pintaba "ultimo toque", pero el historial completo con 5 filas
    // mentiria en una cuenta trabajada. 20 cubre las cuentas reales mas tocadas sin traer
    // el historial entero a memoria en cada render.
    .limit(20)
```

Si algún test asserta 5 toques, ajustarlo. Correr `npm test` para saber.

- [ ] **Step 8: Correr toda la suite y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. `repository.contextoToque.test.ts` puede necesitar ajuste si asserta la forma
exacta del objeto.

- [ ] **Step 9: Commit**

```bash
git add app/db/repository.ts app/db/repository.discovery.test.ts
git commit -m "feat(db): leer y guardar discovery, brief y resumen de toque

Con chequeo de organizacion que LANZA en la escritura, como
actualizarCampoCalificacion: una escritura silenciosa a la cuenta de otra org
es justo el bug que hay que evitar (ver listarCampanas, 2026-07-15).
De paso getCuenta expone transcriptUrl, que nunca expuso, y sube el limite
de toques de 5 a 20 para que el historial no mienta."
```

---

### Task 7: Cablear la cadena en la action

Aquí es donde `pedirBorradores()` deja de ser código muerto y donde fusionar/hidratar corren en
paralelo.

**Files:**
- Modify: `app/llamada/[id]/actions.ts:148-152`

- [ ] **Step 1: Leer la action actual**

Run: `sed -n '140,160p' "app/llamada/[id]/actions.ts"`

- [ ] **Step 2: Reemplazar `estructurarDictadoAction`**

```typescript
// Tarea 5b: solo PROPONE un borrador estructurado a partir del dictado (texto pegado, nunca
// audio). No escribe nada -- el owner corrige el borrador en CapturaLlamada y recien
// registrarToqueAction (submit del form) persiste.
//
// Tres pasos con la IA, no uno: extraer, fusionar los facts con lo que ya sabiamos, e
// hidratar el brief. Un solo prompt que hiciera las tres cosas las haria las tres mal, y no
// se podria testear la fusion sin testear la extraccion. Fusionar e hidratar solo dependen
// de extraer, no la una de la otra, asi que van en paralelo: la latencia es
// extraer + max(fusionar, hidratar), no la suma.
export async function estructurarDictadoAction(
  idEmpresa: string,
  dictado: string,
): Promise<ToqueEstructurado & { notasFusionadas: string; briefHidratado: string }> {
  const { idOrganizacion } = await requireEscritura();
  const ia = crearClaudeAdapter();

  const estructurado = await estructurarToque(dictado, ia);
  const actual = leerDiscovery(idEmpresa, idOrganizacion);

  const [notasFusionadas, briefHidratado] = await Promise.all([
    fusionarDiscovery(actual.notas, estructurado.notasDiscovery, ia),
    hidratarBrief(actual.brief, estructurado.brief, ia),
  ]);

  return { ...estructurado, notasFusionadas, briefHidratado };
}
```

Agregar los imports que falten arriba del archivo:

```typescript
import { fusionarDiscovery, hidratarBrief } from "../../core/fusionar";
import { leerDiscovery, guardarDiscovery, guardarResumenToque } from "../../db/repository";
```

`requireEscritura()` hoy no devuelve la sesión. Verificar con:

Run: `grep -n "export async function requireEscritura" -A 10 app/lib/session.ts`

Si devuelve `void`, usar `await requireSession()` como hace el resto del archivo (línea 100) y
llamar a `requireEscritura()` aparte.

- [ ] **Step 3: Actualizar el caller en CapturaLlamada**

`estructurarDictadoAction` ahora toma dos argumentos. En
`app/llamada/[id]/CapturaLlamada.tsx:70`:

```typescript
      const r = await estructurarDictadoAction(idEmpresa, dictado);
```

Verificar que `idEmpresa` esté en las props del componente:

Run: `grep -n "idEmpresa" "app/llamada/[id]/CapturaLlamada.tsx" | head -5`

Si no está, agregarlo a las props y pasarlo desde `RegistrarToqueToggle`.

- [ ] **Step 4: Mostrar la fusión como borrador editable**

En el form de `CapturaLlamada.tsx`, agregar dos textareas después del de `quePaso` (línea ~201):

```tsx
              <label className="mt-3 block text-xs font-semibold text-ink-soft">
                Discovery (facts de la cuenta)
              </label>
              <textarea
                name="notasDiscovery"
                rows={5}
                defaultValue={borrador?.notasFusionadas ?? ""}
                placeholder="Los facts que sabemos de la cuenta…"
                className={inputClase}
              />
              <p className="mt-1 text-[10.5px] text-muted">
                Esto reemplaza las notas de la cuenta. Revísalo antes de guardar.
              </p>

              <label className="mt-3 block text-xs font-semibold text-ink-soft">Brief</label>
              <textarea
                name="brief"
                rows={4}
                defaultValue={borrador?.briefHidratado ?? ""}
                placeholder="En qué va la cuenta…"
                className={inputClase}
              />
```

El tipo del state `borrador` cambia: pasa de `ToqueEstructurado` a
`ToqueEstructurado & { notasFusionadas: string; briefHidratado: string }`. Actualizar la
declaración del `useState` en la línea 52.

- [ ] **Step 5: Guardar en `registrarToqueAction`**

Buscar la action:

Run: `grep -n "export async function registrarToqueAction" -A 40 "app/llamada/[id]/actions.ts"`

Leer del FormData los dos campos nuevos y guardarlos junto al toque:

```typescript
  const notasDiscovery = String(form.get("notasDiscovery") ?? "");
  const brief = String(form.get("brief") ?? "");
  if (notasDiscovery || brief) {
    guardarDiscovery(idEmpresa, { notas: notasDiscovery, brief }, idOrganizacion);
  }
```

Y el resumen del toque, con el `idToque` que devuelva `registrarToque`:

```typescript
  const resumen = String(form.get("resumen") ?? "");
  if (resumen && idToque) guardarResumenToque(idToque, { resumen });
```

Si `registrarToque` no devuelve el `idToque`, mirar cómo lo obtiene el resto del archivo antes
de cambiarle la firma.

- [ ] **Step 6: Correr toda la suite y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/llamada/ app/core/
git commit -m "feat(llamada): el dictado llena discovery y brief solos

pedirBorradores() deja de ser codigo muerto. Fusionar e hidratar corren en
paralelo: solo dependen de extraer, no la una de la otra."
```

---

### Task 7b: Cablear el camino de Granola (matar el código muerto)

Sin esta tarea, `pedirBorradores()` sigue muerta y el criterio de aceptación 8 del spec no se
cumple: la Tarea 5 le arregló el schema pero nadie la llama. El camino del dictado (Tarea 7) ya
funciona; este es el otro.

El insumo ya existe después de la Tarea 8: `toque.transcript_resumen` guarda lo que devolvió
Granola. Esta action lo lee y propone el mismo borrador que el dictado.

**Files:**
- Modify: `app/llamada/[id]/actions.ts`
- Modify: `app/llamada/[id]/Confirmacion.tsx`

**Depende de la Tarea 8** (que es la que llena `transcript_resumen`). Hacerla después.

- [ ] **Step 1: Agregar el lector al repository**

En `app/db/repository.ts`, junto a las de la Tarea 6:

```typescript
// El insumo cacheado de Granola para este toque, o vacio si el toque fue dictado (sin
// grabacion) o si la grabacion no se ha confirmado todavia.
export function leerTranscriptResumen(idToque: number): string {
  const fila = db
    .select({ transcriptResumen: toque.transcriptResumen })
    .from(toque)
    .where(eq(toque.idToque, idToque))
    .get();
  return fila?.transcriptResumen ?? '';
}
```

- [ ] **Step 2: Escribir el test que falla**

En `app/db/repository.discovery.test.ts`, agregar antes del `test.after`:

```typescript
test('leerTranscriptResumen devuelve vacio para un toque dictado sin grabacion', () => {
  seedEmpresa('disc-6');
  const idToque = seedToque('disc-6');
  assert.equal(leerTranscriptResumen(idToque), '');
});

test('leerTranscriptResumen devuelve el insumo cacheado de Granola', () => {
  seedEmpresa('disc-7');
  const idToque = seedToque('disc-7');
  guardarResumenToque(idToque, { resumen: 'producto', transcriptResumen: 'insumo de granola' });
  assert.equal(leerTranscriptResumen(idToque), 'insumo de granola');
});
```

Agregar `leerTranscriptResumen` al import dinámico del tope del archivo.

- [ ] **Step 3: Correr y verificar que falla, luego que pasa**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.discovery.test.ts`
Expected: FAIL primero ("leerTranscriptResumen is not a function"), PASS después del Step 1.

- [ ] **Step 4: La action que revive `pedirBorradores`**

En `app/llamada/[id]/actions.ts`:

```typescript
// El gemelo de estructurarDictadoAction para el camino de Granola: mismo borrador, misma
// fusion, mismo schema. La diferencia es de donde sale el insumo (el resumen cacheado de la
// grabacion en vez del dictado de Sebastián).
//
// Esta action es la que revive pedirBorradores(), que estuvo escrita y sin llamar desde que se
// creo: le faltaban el insumo (transcript_resumen) y el destino (notas_discovery/brief).
export async function borradorDesdeGrabacionAction(
  idEmpresa: string,
  idToque: number,
): Promise<(ToqueEstructurado & { notasFusionadas: string; briefHidratado: string }) | null> {
  await requireEscritura();
  const { idOrganizacion } = await requireSession();

  const resumenCacheado = leerTranscriptResumen(idToque);
  if (!resumenCacheado.trim()) return null; // toque dictado o grabacion sin confirmar

  const ia = crearClaudeAdapter();
  const estructurado = await pedirBorradores(resumenCacheado, ia);
  const actual = leerDiscovery(idEmpresa, idOrganizacion);

  const [notasFusionadas, briefHidratado] = await Promise.all([
    fusionarDiscovery(actual.notas, estructurado.notasDiscovery, ia),
    hidratarBrief(actual.brief, estructurado.brief, ia),
  ]);

  return { ...estructurado, notasFusionadas, briefHidratado };
}
```

Agregar a los imports:

```typescript
import { pedirBorradores } from "../../core/borradores";
import { leerTranscriptResumen } from "../../db/repository";
```

- [ ] **Step 5: Verificar que ya no hay código muerto**

Run: `grep -rn "pedirBorradores" --include="*.ts" --include="*.tsx" app | grep -v "core/borradores"`
Expected: al menos un hit en `app/llamada/[id]/actions.ts`. Si sale vacío, la action no quedó
cableada y el criterio de aceptación 8 sigue sin cumplirse.

- [ ] **Step 6: Correr toda la suite y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/llamada/ app/db/
git commit -m "feat(granola): borradorDesdeGrabacionAction revive pedirBorradores

Estaba escrita y sin llamar desde que se creo: le faltaban el insumo
(transcript_resumen) y el destino (notas_discovery, brief). Ahora el camino de
Granola y el del dictado producen el mismo borrador aprobable."
```

**Nota para quien ejecute:** esta tarea deja la action lista pero NO la conecta a un botón en
`Confirmacion.tsx`. Conectarla es UI y depende de dónde quiera Sebastián el botón ("proponer
borrador desde la grabación"). Preguntarle antes de inventar el sitio.

---

### Task 8: El outbox manda la fusión, no el pisón

**Files:**
- Modify: `app/llamada/[id]/actions.ts` (encolar)
- Modify: `app/db/repository.ts:1001-1011`
- Test: `app/db/repository.outbox.test.ts`

- [ ] **Step 1: Leer el encolado actual**

Run: `sed -n '995,1015p' app/db/repository.ts`
Run: `cat app/db/repository.outbox.test.ts`

Hoy `escribirTranscriptCompleto` encola `{ notasDiscovery: sesion.resumen }`: manda el resumen
crudo de Granola como si fueran facts, y pisa lo que hubiera en Notion.

- [ ] **Step 2: Reemplazar el test que codifica el bug**

El test de la línea 77 ("escribirTranscriptCompleto encola notasDiscovery en outbox") **asserta
el comportamiento que estamos arreglando**: hay que reemplazarlo, no agregarle otro al lado.
Borrarlo entero y poner en su lugar:

```typescript
test('escribirTranscriptCompleto cachea el resumen de Granola como transcript_resumen', () => {
  seedEmpresa('emp-transcript', 'page-transcript');
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO toque (id_toque, id_empresa, fecha, canal, resultado, fuente) VALUES (100, 'emp-transcript', '2026-07-04T10:00:00.000Z', 'llamada', 'contesto_reunion', 'cockpit')`)
    .run();
  raw.close();

  escribirTranscriptCompleto(100, {
    proveedor: 'granola',
    transcriptId: 't-x',
    titulo: 'x',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'resumen de la llamada',
    url: null,
  });

  const raw2 = new Database(dbPath);
  const fila = raw2.prepare('SELECT transcript_resumen FROM toque WHERE id_toque = 100').get() as any;
  raw2.close();
  assert.strictEqual(fila.transcript_resumen, 'resumen de la llamada');
});

test('escribirTranscriptCompleto NO encola notasDiscovery: el resumen crudo no son facts', () => {
  seedEmpresa('emp-transcript-2', 'page-transcript-2');
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO toque (id_toque, id_empresa, fecha, canal, resultado, fuente) VALUES (101, 'emp-transcript-2', '2026-07-04T10:00:00.000Z', 'llamada', 'contesto_reunion', 'cockpit')`)
    .run();
  raw.close();

  escribirTranscriptCompleto(101, {
    proveedor: 'granola',
    transcriptId: 't-y',
    titulo: 'y',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'resumen de la llamada',
    url: null,
  });

  const pendientes = outboxPendientes().filter((p) => p.payload.notionPageId === 'page-transcript-2');
  const conNotas = pendientes.filter((p) => p.payload.notasDiscovery !== undefined);
  assert.strictEqual(
    conNotas.length,
    0,
    'las Notas Discovery solo salen de la fusion que Sebastián aprueba, nunca del resumen crudo',
  );
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.outbox.test.ts`
Expected: FAIL

- [ ] **Step 4: Cambiar `escribirTranscriptCompleto`**

En `app/db/repository.ts`, alrededor de la línea 1001:

```typescript
        quePaso: sesion.resumen,
```

El resumen de Granola no es el `quePaso` telegráfico: es el insumo. Cambiar por
`transcriptResumen: sesion.resumen` y dejar `quePaso` como esté.

Y borrar el encolado de la línea 1011:

```typescript
    if (sesion.resumen) {
      const t = ...;
      if (t) encolarOutboxNotion(tx, t.idEmpresa, { notasDiscovery: sesion.resumen });
    }
```

Las Notas Discovery ya no salen de aquí. Salen de `registrarToqueAction`, que encola la versión
fusionada que Sebastián aprobó. Reemplazar por un comentario que lo diga:

```typescript
    // Las Notas Discovery NO se encolan aca (2026-07-15). El resumen crudo de Granola no son
    // facts: es el insumo. Los facts salen de la fusion que Sebastián aprueba en
    // registrarToqueAction, y esa es la unica que llega al outbox.
```

- [ ] **Step 5: Encolar la fusión aprobada**

En `registrarToqueAction`, donde llamas a `guardarDiscovery`, encolar en la MISMA transacción
(patrón Outbox del CLAUDE.md: la fila a sincronizar se escribe en la misma transacción que el
dato). Mirar cómo lo hace `encolarOutboxNotion` en el resto del repository y seguir ese patrón.

- [ ] **Step 6: Correr toda la suite y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/db/repository.ts app/db/repository.outbox.test.ts app/llamada/
git commit -m "fix(sync): a Notion va la fusion aprobada, no el resumen crudo

escribirTranscriptCompleto encolaba el resumen de Granola como notasDiscovery:
mandaba narracion donde van facts, y pisaba lo que hubiera. El resumen crudo
ahora cae en transcript_resumen, que es lo que es."
```

---

### Task 9: El panel único

**Files:**
- Create: `app/llamada/[id]/PanelCuenta.tsx`
- Modify: `app/llamada/[id]/LlamadaCard.tsx:130`
- Modify: `app/llamada/[id]/page.tsx`

- [ ] **Step 1: Crear `PanelCuenta.tsx`**

```tsx
import { CalificacionChecklist } from "./CalificacionChecklist";
import { HistorialToques, type ToqueHistorial } from "./HistorialToques";
import type { Calificacion } from "../../core/calificacion";

// El panel derecho de la ficha. Un solo panel para lead y para cierre: se densifica con el
// dato, no se ramifica por estado_notion. En un lead recien llamado Discovery esta vacio
// porque no hay data, no porque una regla lo esconda; en un cierre esta denso porque la hay.
//
// Antes de 2026-07-15 esto era un checklist fijo de calificacion que pintaba lo mismo en
// cualquier etapa, y por eso una cuenta en cierre mostraba "Como hacen el recaudo" con un
// PREGUNTAR que nadie podia llenar.
export function PanelCuenta({
  idEmpresa,
  calificacion,
  notasDiscovery,
  toques,
}: {
  idEmpresa: string;
  calificacion: Calificacion;
  notasDiscovery: string | null;
  toques: ToqueHistorial[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <CalificacionChecklist idEmpresa={idEmpresa} calificacion={calificacion} />

      {notasDiscovery ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-soft">Discovery</div>
          <p className="whitespace-pre-wrap rounded-lg border border-line bg-shell p-3 text-[12px] leading-relaxed text-ink-soft">
            {notasDiscovery}
          </p>
        </div>
      ) : null}

      {toques.length > 0 ? <HistorialToques toques={toques} /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Cablearlo en LlamadaCard**

En `app/llamada/[id]/LlamadaCard.tsx`, reemplazar la línea 130:

```tsx
            <CalificacionChecklist idEmpresa={emp?.id ?? ""} calificacion={calificacion} />
```

por:

```tsx
            <PanelCuenta
              idEmpresa={emp?.id ?? ""}
              calificacion={calificacion}
              notasDiscovery={emp?.notasDiscovery ?? null}
              toques={toques}
            />
```

Cambiar el import de `CalificacionChecklist` por `PanelCuenta`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: falla en `HistorialToques` (no existe todavía). Es esperado: lo crea la Tarea 10.
Si falla en `emp.notasDiscovery`, el select de `getContextoToque` de la Tarea 6 quedó incompleto.

- [ ] **Step 4: Commit (después de la Tarea 10)**

Esta tarea y la 10 se commitean juntas: `PanelCuenta` no compila sin `HistorialToques`.

---

### Task 10: Toques expandibles

**Files:**
- Create: `app/llamada/[id]/formato.ts`
- Create: `app/llamada/[id]/HistorialToques.tsx`
- Modify: `app/llamada/[id]/LlamadaCard.tsx:36`

- [ ] **Step 1: Extraer `fechaCorta` a un archivo compartido**

`fechaCorta` está copiada **tres veces** como función local privada: `LlamadaCard.tsx:36`,
`ToqueShell.tsx:36`, `EditorWhatsapp.tsx:28`. `HistorialToques` la necesita y sería la cuarta.
Peor: `LlamadaCard` es un server component, así que un client component no puede importar de ahí.

Leer la implementación actual:

Run: `sed -n '36,45p' "app/llamada/[id]/LlamadaCard.tsx"`

Crear `app/llamada/[id]/formato.ts` con **exactamente** esa implementación (no reescribirla:
cualquier cambio de formato es un cambio de UI que nadie pidió), exportada:

```typescript
// Formato de fecha corta de la ficha. Extraida de LlamadaCard el 2026-07-15 porque
// HistorialToques la necesita y es un client component (no puede importar de un server
// component). Estaba copiada en LlamadaCard, ToqueShell y EditorWhatsapp; aca se unifican
// las dos primeras. EditorWhatsapp se deja como esta: no es alcance de este plan.
export function fechaCorta(fecha: string | null): string {
  // ... el cuerpo EXACTO de LlamadaCard.tsx:36, copiado sin tocar
}
```

En `LlamadaCard.tsx`, borrar la función local y importarla:

```typescript
import { fechaCorta } from "./formato";
```

No tocar `ToqueShell.tsx` ni `EditorWhatsapp.tsx`: no son archivos de este plan.

- [ ] **Step 2: Crear el componente**

```tsx
"use client";

import { useState } from "react";
import { fechaCorta } from "./formato";

export type ToqueHistorial = {
  idToque: number;
  fecha: string | null;
  canal: string | null;
  quePaso: string | null;
  resumen: string | null;
  transcriptUrl: string | null;
};

// La tabla de toques de la ficha, calcada de la subpagina "Toques hechos" de Notion: la fila
// es telegrafica para escanear de un vistazo, y al abrirla sale el resumen largo que escribio
// la tool. Los dos niveles de detalle son a proposito: que_paso corto es lo que hace la lista
// legible, y meterle el texto largo la volveria ilegible.
export function HistorialToques({ toques }: { toques: ToqueHistorial[] }) {
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-ink-soft">Toques</div>
      <div className="flex flex-col gap-1">
        {toques.map((t) => {
          const estaAbierto = abierto === t.idToque;
          const tieneDetalle = Boolean(t.resumen);
          return (
            <div key={t.idToque} className="rounded-lg border border-line bg-shell">
              <button
                type="button"
                onClick={() => setAbierto(estaAbierto ? null : t.idToque)}
                disabled={!tieneDetalle}
                aria-expanded={estaAbierto}
                className="flex w-full items-start gap-2 p-2 text-left disabled:cursor-default"
              >
                <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">
                  {t.fecha ? fechaCorta(t.fecha) : "—"}
                </span>
                <span className="flex-1 text-[11.5px] leading-snug text-ink-soft">
                  {t.quePaso ?? t.canal ?? "Sin nota"}
                </span>
                {tieneDetalle ? (
                  <span className="shrink-0 font-toque-mono text-[9px] text-muted">
                    {estaAbierto ? "CERRAR" : "VER"}
                  </span>
                ) : null}
              </button>
              {estaAbierto && t.resumen ? (
                <div className="border-t border-line px-2 py-2">
                  <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
                    {t.resumen}
                  </p>
                  {t.transcriptUrl ? (
                    <a
                      href={t.transcriptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block font-toque-mono text-[9.5px] text-accent-llamada hover:underline"
                    >
                      VER EN GRANOLA
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que `getCuenta` trae `resumen` y `transcriptUrl`**

Run: `grep -n "transcriptUrl: toque.transcriptUrl\|resumen: toque.resumen" app/db/repository.ts`
Expected: los dos aparecen (los agregó la Tarea 6, Step 6). Si no, esa tarea quedó incompleta y
`HistorialToques` no compila.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/llamada/
git commit -m "feat(ficha): panel unico con discovery e historial expandible

Un solo panel para lead y para cierre: se densifica con el dato, no se
ramifica por estado. La fila del toque es telegrafica (escaneable) y al
abrirla sale el resumen largo, como la subpagina Toques de Notion.
fechaCorta sale a formato.ts: estaba duplicada 3 veces y un client component
no puede importarla de LlamadaCard (server)."
```

---

## Verificación de que el plan cubre el spec

Chequeo tarea por tarea contra los criterios de aceptación del spec:

| # | Criterio | Tarea |
|---|---|---|
| 1 | Una cuenta en cierre no muestra "Cómo hacen el recaudo" | 2 |
| 2 | Dictar el recaudo lo hace aparecer en Discovery sin teclear | 5, 7 |
| 3 | Un segundo toque no borra los facts del primero | 3 (piso de encogimiento) |
| 4 | Un segundo toque hidrata el brief sin perder lo que decía | 4 |
| 5 | Ni fusión ni hidratación escriben sin aprobación | 7 (borrador editable en el form) |
| 6 | Abrir un toque muestra el resumen de esa llamada | 6, 10 |
| 7 | Lead y cierre usan el mismo panel | 9 |
| 8 | `pedirBorradores()` tiene callers o se borra | 7b |
| 9 | Al outbox va la fusión aprobada, no un pisón | 8 |

---

### Task 11: Verificación en el navegador

**NO correr el dev server.** Sebastián lo corre él (preferencia registrada).

- [ ] **Step 1: Reportarle a Sebastián qué probar**

> Todo verde en tests y tsc. Para probar en el navegador, levanta el dev y revisa:
>
> 1. Una cuenta en cierre (`estado_notion = 'cierre_documentacion'`): no debe aparecer
>    "Cómo hacen el recaudo" en ninguna parte.
> 2. Un lead sin discovery: el panel se ve corto, sin bloque Discovery vacío.
> 3. Dictar un toque que mencione el recaudo: debe caer en el textarea de Discovery del
>    borrador, no en un campo aparte.
> 4. Registrar un segundo toque en la misma cuenta: los facts del primero deben seguir ahí.
> 5. Abrir un toque del historial: debe mostrar el resumen largo.

- [ ] **Step 2: Migrar producción cuando Sebastián dé el visto bueno**

La DB de producción es `/data/isps.db` en el VPS, no la del Mac (ver
`docs/superpowers/specs/2026-07-14-split-pre-post-reunion-design.md`). La migración corre sola
en el deploy (`.github/workflows/deploy.yml` llama a `npm run migrate`). No correrla a mano
contra producción sin que Sebastián lo pida.

Antes de migrar, reverificar los conteos del spec contra la DB real (el spec los marca como
pendientes de verificar: salieron de la DB del Mac).

---

## Notas de cierre

**Lo que este plan NO hace** (fuera de alcance del spec):
- Alargar `que_paso`. Se queda telegráfico a propósito.
- Cachear el transcript literal de Granola. Solo el resumen.
- Brief por toque. Es por cuenta.
- Backfill de `notas_discovery` para las cuentas que ya tienen Notas Discovery en Notion. Las
  columnas arrancan vacías y se llenan con el próximo toque de cada cuenta. Si Sebastián quiere
  el backfill, es un script aparte que lee Notion, y otro plan.
