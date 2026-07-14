# Grupos OR en segmentos de campañas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que una condición de segmento sea "campo=X o campo vacío / u otra condición sobre el mismo campo" (grupo OR de un nivel), sin tocar el comportamiento AND-only actual.

**Architecture:** `condiciones` pasa de `Array<CondicionSimple>` a `Array<CondicionSimple | GrupoOr>` donde `GrupoOr = { or: CondicionSimple[] }` (mínimo 2, sin anidar otro grupo). El compilador de queries (`compilarSegmento`) extrae la lógica de una condición simple a `compilarCondicion` para reusarla dentro del `or(...)` de drizzle. El Copiloto gana una regla de prompt para generar estos grupos. `FiltroWall` los muestra como chip de solo lectura (sin editor, sin controles para crearlos a mano).

**Tech Stack:** TypeScript, Zod, Drizzle ORM (SQLite), Next.js/React. Sigue el spec en `docs/superpowers/specs/2026-07-14-grupos-or-segmentos-design.md`.

---

### Task 1: Schema — `grupoOrSchema` en `definicionSegmentoSchema`

**Files:**
- Modify: `app/db/validation.ts:132-177`
- Test: `app/db/validation.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `app/db/validation.test.ts`:

```ts
test('acepta un grupo OR de 2 condiciones (owner=X o vacio)', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [
      { campo: 'categoria', op: 'en', valores: ['isp'] },
      { or: [
        { campo: 'owner', op: 'en', valores: ['Sebastian Acosta Molina'] },
        { campo: 'owner', op: 'es_null' },
      ] },
    ],
  });
  assert.equal(r.success, true);
});

test('rechaza un grupo OR de 1 sola condicion (redundante con la condicion suelta)', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ or: [{ campo: 'owner', op: 'es_null' }] }],
  });
  assert.equal(r.success, false);
});

test('rechaza un grupo OR anidado dentro de otro grupo OR', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [
      {
        or: [
          { campo: 'owner', op: 'es_null' },
          { or: [{ campo: 'owner', op: 'en', valores: ['X'] }, { campo: 'owner', op: 'no_null' }] },
        ],
      },
    ],
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test app/db/validation.test.ts`
Expected: los 3 tests nuevos FALLAN (el primero porque `or` no existe en el schema todavía y Zod lo rechaza; los otros dos "pasan" por casualidad ahora pero deben seguir pasando después — igual correlos para confirmar el estado base).

- [ ] **Step 3: Implementar el schema**

En `app/db/validation.ts`, reemplazar el bloque de `definicionSegmentoSchema` (líneas 167-175) por:

```ts
const condicionSimpleSchema = z.union([condicionEnSchema, condicionNullSchema, condicionEntreSchema, condicionComparaSchema]);

// Parte 6 campanas: grupo OR de un nivel, para casos tipo "owner=X o sin owner" que un
// AND plano no puede expresar. Sin anidar (un grupo OR no puede contener otro grupo OR):
// la union es sobre condicionSimpleSchema, no sobre el array completo de condiciones.
const grupoOrSchema = z.object({
  or: z.array(condicionSimpleSchema).min(2, 'un grupo OR necesita al menos 2 condiciones'),
});

export const definicionSegmentoSchema = z.object({
  condiciones: z
    .array(z.union([condicionSimpleSchema, grupoOrSchema]))
    .min(1, 'un segmento necesita al menos una condicion'),
  // Ranking + tope: "las 50 mas grandes" = orden por usuarios desc, limite 50. Ambos
  // opcionales; sin ellos el segmento es el conjunto completo que cumple condiciones.
  orden: z.object({ campo: z.enum(CAMPOS_SEGMENTO_NUMERICOS), dir: z.enum(['asc', 'desc']) }).optional(),
  limite: z.number().int().positive().optional(),
});

export type DefinicionSegmento = z.infer<typeof definicionSegmentoSchema>;
export type CondicionSimple = z.infer<typeof condicionSimpleSchema>;
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test app/db/validation.test.ts`
Expected: PASS (todos, incluidos los 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add app/db/validation.ts app/db/validation.test.ts
git commit -m "feat(segmentos): grupos OR de un nivel en definicionSegmentoSchema"
```

---

### Task 2: Repository — compilar grupos OR a SQL

**Files:**
- Modify: `app/db/repository.ts:1258-1286`
- Test: Create `app/db/repository.grupoOr.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `app/db/repository.grupoOr.test.ts` (mismo patrón de aislamiento que `repository.ordenLimite.test.ts`):

```ts
// Parte 6 campanas: grupo OR en compilarSegmento (owner=X o sin owner). DB propia y
// aislada (mismo motivo que repository.ordenLimite.test.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empresasDeSegmento } = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  const insEmpresa = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, es_cliente, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 0, ?)`,
  );
  insEmpresa.run('de-sebas', 'De Sebas', 'de-sebas', 'Sebastian Acosta Molina');
  insEmpresa.run('sin-owner', 'Sin Owner', 'sin-owner', null);
  insEmpresa.run('de-otro', 'De Otro', 'de-otro', 'Camila');
  raw.close();
}
seed();

test('empresasDeSegmento con grupo OR trae owner=X o sin owner, no el resto', () => {
  const def = {
    condiciones: [
      {
        or: [
          { campo: 'owner' as const, op: 'en' as const, valores: ['Sebastian Acosta Molina'] },
          { campo: 'owner' as const, op: 'es_null' as const },
        ],
      },
    ],
  };
  const r = empresasDeSegmento(def, 1);
  assert.deepEqual(
    r.map((e) => e.id).sort(),
    ['de-sebas', 'sin-owner'],
  );
});

test('empresasDeSegmento combina grupo OR con una condicion AND normal', () => {
  const def = {
    condiciones: [
      { campo: 'estado_comercial' as const, op: 'en' as const, valores: ['activo'] },
      {
        or: [
          { campo: 'owner' as const, op: 'en' as const, valores: ['Sebastian Acosta Molina'] },
          { campo: 'owner' as const, op: 'es_null' as const },
        ],
      },
    ],
  };
  const r = empresasDeSegmento(def, 1);
  assert.deepEqual(
    r.map((e) => e.id).sort(),
    ['de-sebas', 'sin-owner'],
  );
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test app/db/repository.grupoOr.test.ts`
Expected: FAIL — `compilarSegmento` no reconoce `{or: [...]}` y explota o lo trata como condición simple (TS ya marcaría error de tipos en `def.condiciones.map` antes de esto; en runtime con `.ts` vía `tsx`/`node --test` con transformación de tipos borrados, el error real será que `c.campo` es `undefined` y el `switch` no matchea ningún case — revisar el mensaje exacto al correrlo).

- [ ] **Step 3: Implementar `compilarCondicion` y el caso OR en `compilarSegmento`**

En `app/db/repository.ts`, reemplazar el bloque de `compilarSegmento` (líneas 1258-1286) por:

```ts
// Traduce UNA condicion simple (no un grupo OR) a SQL. Extraida de compilarSegmento
// para poder reusarla tanto en el AND top-level como dentro de un grupo OR.
function compilarCondicion(c: CondicionSimple): SQL {
  if (c.campo === 'rol') return condicionRol(c);
  if (c.campo === 'personas') return condicionPersonas(c);
  const { col, numerico } = COLUMNA_SEGMENTO[c.campo];
  switch (c.op) {
    case 'es_null':
      return isNull(col);
    case 'no_null':
      return isNotNull(col);
    case 'en':
      return inArray(col, coercer(c.valores, numerico, c.campo));
    case 'no_en':
      return notInArray(col, coercer(c.valores, numerico, c.campo));
    case 'entre':
      // NULL nunca matchea un rango (semantica SQL): empresa sin dato queda fuera.
      // La UI avisa cuantas quedaron fuera; aca no se inventa un default.
      return between(col, c.desde, c.hasta);
    case 'mayor_que':
      return gt(col, c.valor);
    case 'menor_que':
      return lt(col, c.valor);
  }
}

// Traduce una definicion YA validada a un WHERE de drizzle. Las condiciones del array
// top-level se ANDean; un item {or: [...]} (Parte 6 campanas: "owner=X o sin owner", que
// un AND plano no puede expresar) se resuelve con compilarCondicion y se envuelve en
// or(...) -- condicionRol/condicionPersonas son subconsultas EXISTS/COUNT, funcionan
// igual dentro de un or() porque son SQL compuesto como cualquier otro.
function compilarSegmento(def: DefinicionSegmento): SQL | undefined {
  const conds = def.condiciones.map((c): SQL => {
    if ('or' in c) return or(...c.or.map(compilarCondicion))!;
    return compilarCondicion(c);
  });
  return and(...conds);
}
```

Agregar `CondicionSimple` al import de tipos desde `./validation.ts` (junto a `DefinicionSegmento`, ver línea 71) y confirmar que `or` ya está importado de `drizzle-orm` (buscar el import existente de `and`/`eq`/etc en la cabecera del archivo; si `or` no está, agregarlo a esa misma línea de import).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test app/db/repository.grupoOr.test.ts`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite de repository para confirmar que no rompió nada**

Run: `node --test app/db/repository.ordenLimite.test.ts app/db/repository.segmentoRol.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.grupoOr.test.ts
git commit -m "feat(segmentos): compilar grupos OR a SQL en compilarSegmento"
```

---

### Task 3: Copiloto — regla de prompt para grupos OR

**Files:**
- Modify: `app/campanas/nueva/copiloto.ts:42-72`
- Test: `app/campanas/nueva/copiloto.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `app/campanas/nueva/copiloto.test.ts`:

```ts
test('construirPrompt incluye una regla explicita para grupos OR ("X o sin X")', () => {
  const prompt = construirPrompt({ frase: 'owner Sebastian o sin owner', estadoActual: estadoVacio }, [
    { campo: 'owner', ejemplosValor: ['Sebastian Acosta Molina', 'Camila'] },
  ]);
  assert.match(prompt, /\bor\b/);
  assert.match(prompt, /grupo/i);
});

test('pedirAlCopiloto acepta un estadoNuevo con grupo OR', async () => {
  const ia = new IAFake({
    estadoNuevo: {
      condiciones: [
        { campo: 'categoria', op: 'en', valores: ['isp'] },
        {
          or: [
            { campo: 'owner', op: 'en', valores: ['Sebastian Acosta Molina'] },
            { campo: 'owner', op: 'es_null' },
          ],
        },
      ],
    },
    explicacion: 'ISP, owner Sebastian o sin owner',
    noMapeado: [],
  });
  const r = await pedirAlCopiloto({ frase: 'ISP de Sebastian o sin owner', estadoActual: estadoVacio }, ia);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal('or' in r.estado.condiciones[1], true);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test app/campanas/nueva/copiloto.test.ts`
Expected: el primer test nuevo FALLA (el prompt actual no menciona `or` ni "grupo"); el segundo puede pasar ya si el schema del Task 1 ya está mergeado (valida igual) — si pasa, está bien, no bloquea.

- [ ] **Step 3: Agregar la regla al prompt**

En `app/campanas/nueva/copiloto.ts`, dentro de `construirPrompt`, agregar una regla nueva al final de la lista de `Reglas:` (después de la regla de multi-turno, línea ~71):

```ts
- "X o sin X" / "X o vacio" (una condicion sobre un campo, unida con OTRA condicion sobre \
el MISMO campo por "o") -> arma un grupo {or: [condicionA, condicionB]} en vez de listarlo \
en noMapeado. Un grupo OR nunca contiene otro grupo OR adentro, y cada condicion del grupo \
sigue las mismas reglas de arriba (ej. "sin X" adentro del grupo sigue siendo es_null).
```

Actualizar también el comentario de "Bug real 2026-07-14" (líneas 35-41) para dejar constancia de que ese caso puntual (owner=X o sin owner) ya tiene representación en el schema vía grupo OR, no solo `noMapeado`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test app/campanas/nueva/copiloto.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add app/campanas/nueva/copiloto.ts app/campanas/nueva/copiloto.test.ts
git commit -m "feat(copiloto): genera grupos OR para 'X o sin X' en vez de noMapeado"
```

---

### Task 4: FiltroWall — mostrar grupos OR como chip de solo lectura

**Files:**
- Modify: `app/campanas/nueva/FiltroWall.tsx`

No hay test automatizado para este componente en el repo (no existe `FiltroWall.test.tsx`); la verificación es manual/visual, así que este task no sigue TDD estricto — se implementa directo y se verifica corriendo `tsc` (el union nuevo debe forzar un error de tipos en los sitios que hay que tocar) y una revisión visual si hay preview disponible.

- [ ] **Step 1: Confirmar los errores de tipos que dispara el union nuevo**

Run: `npx tsc --noEmit -p .` (o el comando de typecheck que use el repo — revisar `package.json` si `tsc --noEmit` no es directo)
Expected: errores en `app/campanas/nueva/FiltroWall.tsx` en `valorTexto(c)`, `camposUsados` (línea con `condiciones.map((c) => c.campo)`) y el JSX que usa `c.campo`/`c.op` — porque `c` ahora puede ser `{or: CondicionSimple[]}` sin esas propiedades.

- [ ] **Step 2: Implementar la rama de grupo OR**

En `app/campanas/nueva/FiltroWall.tsx`:

1. Cambiar el alias de tipo (línea 8):

```ts
type Condicion = DefinicionSegmento['condiciones'][number];
type CondicionSimple = Exclude<Condicion, { or: unknown }>;
```

2. Ajustar `valorTexto` para que reciba `CondicionSimple` (no `Condicion`) — su firma no cambia de comportamiento, solo el tipo del parámetro:

```ts
function valorTexto(c: CondicionSimple): string {
  // ... (cuerpo sin cambios)
}
```

3. Agregar un helper para el texto del grupo, justo debajo de `valorTexto`:

```ts
function valorTextoGrupoOr(grupo: Extract<Condicion, { or: unknown }>): string {
  return grupo.or.map((c) => `${LABELS[c.campo]}: ${valorTexto(c)}`).join(' o ');
}
```

4. Corregir `camposUsados` (línea 92) para que ignore los grupos OR (un grupo no bloquea que se agregue otra condición suelta sobre el mismo campo desde los desplegables):

```ts
const camposUsados = new Set(condiciones.filter((c): c is CondicionSimple => !('or' in c)).map((c) => c.campo));
```

5. En el `condiciones.map` del render (línea 147), separar el chip de grupo OR del chip normal:

```tsx
{condiciones.map((c, i) =>
  'or' in c ? (
    <div key={i} className="rounded-[9px] border border-accent/30 bg-accent/10 px-[11px] py-[9px]">
      <div className="flex items-center gap-2">
        <span className="ml-auto truncate text-[12px] font-semibold text-ink">{valorTextoGrupoOr(c)}</span>
      </div>
      <button type="button" className="mt-1 text-[11px] text-faint hover:text-ink" onClick={() => quitar(i)}>
        quitar
      </button>
    </div>
  ) : (
    <div
      key={i}
      className="rounded-[9px] border border-accent/30 bg-accent/10 px-[11px] py-[9px] transition-all duration-150 hover:-translate-y-px hover:border-accent/50 hover:bg-accent/[.18]"
    >
      {/* ... contenido existente sin cambios, ya tipado como CondicionSimple ... */}
    </div>
  ),
)}
```

(Mover el bloque existente del chip editable — líneas 148-206 actuales — tal cual dentro de la rama `else` de arriba; no cambia su lógica interna, solo queda anidado en el ternario.)

- [ ] **Step 3: Confirmar que el typecheck pasa**

Run: `npx tsc --noEmit -p .`
Expected: 0 errores relacionados a `FiltroWall.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/campanas/nueva/FiltroWall.tsx
git commit -m "feat(filtro-wall): muestra grupos OR como chip de solo lectura"
```

---

### Task 5: Verificación final de la suite completa

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Correr toda la suite de tests del proyecto**

Run: `node --test $(find app -name '*.test.ts')` (o el script `npm test` si el repo ya tiene uno — revisar `package.json`)
Expected: PASS, 0 fallos.

- [ ] **Step 2: Correr typecheck completo**

Run: `npx tsc --noEmit -p .`
Expected: 0 errores.

- [ ] **Step 3: Confirmar en git log que las 4 tareas quedaron como commits separados**

Run: `git log --oneline -5`
Expected: ver los 4 commits de las Tasks 1-4 (schema, repository, copiloto, FiltroWall).
