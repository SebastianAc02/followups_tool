# Cockpit de Campañas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el módulo de campañas en un cockpit de creación de punta a punta: segmentar tipo Clay (wall de filtros + Copiloto de lenguaje natural), armar la cadencia, elegir destinatarios con readiness de canal, ver un preview cinemático, y lanzar.

**Architecture:** Se respeta la constitución: el core (dominio) es puro y no importa DB/Claude/Apollo; el Copiloto entra por `IAPort` (un adaptador más); el acceso a datos es solo por el Repository. Casi todo el schema y el motor (`proximoPasoDebido`, `calcularCalendario`, `elegirVersionPorPeso`) ya existen; esta feature agrega la segmentación extendida, el readiness de canal, la simulación del preview, y toda la UI. La ejecución real (envío a Apollo, tracking) queda FUERA: el preview simula, no manda.

**Tech Stack:** Next 16 (App Router + Server Actions), React 19, Drizzle + better-sqlite3 (SQLite `isps.db` un nivel arriba), Zod v4, tests con `node:test` (`npm test`), CSS plano con variables en `app/globals.css` (NO Tailwind), animación con CSS + Web Animations API (sin librería nueva, ver Decisión D1).

**Spec:** `docs/superpowers/specs/2026-07-07-cockpit-campanas-design.md`
**Mockup fuente de verdad de la UI:** `docs/superpowers/specs/2026-07-07-cockpit-campanas-mockup-completo.html`

---

## Decisiones locked antes de arrancar

- **D1 · Animación sin dependencia nueva.** El preview cinemático usa CSS transitions/keyframes + Web Animations API (`element.animate()`). No se agrega framer-motion/motion salvo que el scrub interactivo se demuestre inmanejable con WAAPI, y esa justificación se escribe antes de instalar nada (constitución: no deps nuevas sin justificar).
- **D2 · Core con TDD y código completo; UI con build + verificación en navegador.** Fases A, B y el core de E (simulación) van TDD estrictas (`node:test`), porque son deterministas. Fases C, D, E-UI y F son de UI: se construyen contra el mockup y se verifican en el navegador (contenido, estados, interacción), no con snapshots frágiles. Cada task de UI dice qué verificar.
- **D3 · Canales del dominio = `['llamada','whatsapp','correo']`** (los de `CANALES` en `app/db/validation.ts`). LinkedIn/SMS no existen como canal. WhatsApp y llamada se derivan ambos de `contacto.telefono` (no distinguimos celular de fijo); correo de `contacto.email`. Esta limitación se documenta en el código de `canalesDisponibles`.
- **D4 · Decomposición en 6 fases, cada una entrega software funcional.** Fases A y B están detalladas task-by-task con código aquí. Fases C-F traen mapa de archivos, firmas exactas de server actions/queries, dependencias y estrategia de verificación; cada una se expande a su propio plan (writing-plans) cuando se llegue, para que el código de UI no se escriba en frío contra un mockup que puede afinar.

---

## Mapa de archivos (todas las fases)

**Core (puro, TDD):**
- Create `app/core/canales-empresa.ts` — readiness de canal (Fase A).
- Create `app/core/canales-empresa.test.ts`
- Create `app/core/simulacion-campana.ts` — timeline por cuenta + cohorte día a día para el preview (Fase E).
- Create `app/core/simulacion-campana.test.ts`
- Create `app/core/render-copy.ts` — sustituye `[variables]` con datos reales (Fase E).
- Create `app/core/render-copy.test.ts`
- Modify `app/core/ports/ia.ts` — agrega `compilarSegmento` a `IAPort` (Fase B).

**Data / dominio (TDD):**
- Modify `app/db/validation.ts` — `CAMPOS_SEGMENTO` (+departamento,+rol), `CAMPOS_SEGMENTO_NUMERICOS` (+personas), operadores `mayor_que`/`menor_que`, `REGLAS_FALTANTE`, `reglaFaltante` en `campanaInputSchema` (Fase A).
- Modify `app/db/schema.ts` — columna `campana.regla_faltante` (Fase A).
- Create `scripts/migrate_campanas_p5_regla_faltante.py` (dryrun + apply) — ALTER TABLE (Fase A).
- Modify `app/db/repository.ts` — `empresasConReadiness`, `conteosReadiness`, mapeo de `departamento`/`rol`/`personas` y operadores nuevos; `regla_faltante` en `crearCampana`; `contactosPorRol`, `pulsoCampanas` (Fases A, D, F).
- Modify `app/db/validation.test.ts` y `app/db/repository.*.test.ts`

**Adapters:**
- Modify `app/adapters/claude.ts` — implementa `compilarSegmento` vía gateway (Fase B).
- Create `app/adapters/ia-fake.ts` — `IAPort` falso para tests (Fase B).

**UI (build + verify):**
- Segmentación (Fase C): `app/campanas/nueva/` (o ruta wizard). Componentes: `FiltroWall.tsx`, `TablaCuentas.tsx`, `CopilotoPanel.tsx`, `ReadinessBadge.tsx`.
- Cadencia + destinatarios (Fase D): `ConstructorCadencia.tsx` (extender), `Destinatarios.tsx`, `ResumenEnvio.tsx`, `ReglaFaltante.tsx`.
- Preview (Fase E): `PreviewCinematico.tsx`, `TimelinePorCuenta.tsx`, `DiaADia.tsx`.
- Hub (Fase F): `app/campanas/page.tsx` (rediseño 1C), `PulsoCampanas.tsx`, `app/campanas/plantillas/`.
- Modify `app/globals.css` — tokens del 2A/1C (acento violeta, serif Newsreader) (Fase C, primero).

---

## FASE A — Cimientos: filtro extendido + readiness de canal

Entrega: la segmentación soporta región, rol y "personas en la cuenta", operadores `>` y `<`, y el backend calcula readiness de canal por empresa con conteos. Todo testeado, sin UI todavía.

### Task A1: Operadores `mayor_que` / `menor_que` en el filtro

**Files:**
- Modify: `app/db/validation.ts:103-124`
- Test: `app/db/validation.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { definicionSegmentoSchema } from './validation.ts';

test('acepta operador mayor_que sobre campo numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'usuarios', op: 'mayor_que', valor: 200000 }],
  });
  assert.equal(r.success, true);
});

test('rechaza mayor_que sobre campo no numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'ciudad', op: 'mayor_que', valor: 5 }],
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test 2>&1 | grep -A3 mayor_que`
Expected: FAIL (el schema no conoce `mayor_que`).

- [ ] **Step 3: Implementar el schema de comparación**

En `app/db/validation.ts`, tras `condicionEntreSchema`, agregar:

```ts
// Parte 5 campanas: comparadores abiertos sobre campos numericos. La UI muestra
// "Usuarios > 200.000"; mayor_que/menor_que evitan tener que expresarlo como entre
// con un limite infinito artificial.
const condicionComparaSchema = z.object({
  campo: z.enum(CAMPOS_SEGMENTO_NUMERICOS),
  op: z.enum(['mayor_que', 'menor_que']),
  valor: z.number(),
});
```

Y sumarlo a la union en `definicionSegmentoSchema`:

```ts
export const definicionSegmentoSchema = z.object({
  condiciones: z
    .array(z.union([condicionEnSchema, condicionNullSchema, condicionEntreSchema, condicionComparaSchema]))
    .min(1, 'un segmento necesita al menos una condicion'),
});
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test 2>&1 | grep -A3 mayor_que`
Expected: PASS (ambos tests).

- [ ] **Step 5: Commit**

```bash
git add app/db/validation.ts app/db/validation.test.ts
git commit -m "feat(segmento): operadores mayor_que/menor_que sobre campos numericos"
```

### Task A2: Campos `departamento`, `rol`, `personas` en el filtro

**Files:**
- Modify: `app/db/validation.ts:78-91`
- Test: `app/db/validation.test.ts`

- [ ] **Step 1: Test que falla**

```ts
test('acepta departamento y rol (string) y personas (numerico)', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [
      { campo: 'departamento', op: 'en', valores: ['Valle del Cauca'] },
      { campo: 'rol', op: 'en', valores: ['gerente', 'dueno'] },
      { campo: 'personas', op: 'mayor_que', valor: 1 },
    ],
  });
  assert.equal(r.success, true);
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test 2>&1 | grep -A3 departamento`
Expected: FAIL (`departamento`/`rol`/`personas` no están en la whitelist).

- [ ] **Step 3: Extender las whitelists**

En `app/db/validation.ts`:

```ts
export const CAMPOS_SEGMENTO = [
  'estado',
  'categoria',
  'estado_comercial',
  'prioridad',
  'es_cliente',
  'ciudad',
  'departamento', // empresa.departamento (la "region" del wall)
  'owner',
  'usuarios',
  'rol', // contacto.cargo_categoria: la empresa tiene >=1 contacto con ese rol (EXISTS)
] as const;

// personas: cantidad de contactos de la empresa (COUNT via subconsulta). Numerico.
export const CAMPOS_SEGMENTO_NUMERICOS = ['prioridad', 'es_cliente', 'usuarios', 'personas'] as const;
```

Nota: `rol` es string (usa `en`/`no_en`) y NO va en `CAMPOS_SEGMENTO_NUMERICOS`; `personas` sí.

- [ ] **Step 4: Ver que pasa**

Run: `npm test 2>&1 | grep -A3 departamento`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/validation.ts app/db/validation.test.ts
git commit -m "feat(segmento): campos departamento, rol y personas en el filtro"
```

### Task A3: Repository interpreta los campos y operadores nuevos

**Files:**
- Modify: `app/db/repository.ts` (la función que compila `DefinicionSegmento` a SQL, hoy usada por `empresasDeSegmento`/`contarSegmento`)
- Test: `app/db/repository.segmento.test.ts` (crear si no existe; usa DB temporal de `test-helpers`)

- [ ] **Step 1: Test que falla** (DB temporal seedeada con 2 empresas: una en Valle con 2 contactos, una en Antioquia con 0)

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRepoDeArchivoTemporal } from './test-helpers.ts'; // usar el helper existente

test('filtra por departamento y por rol via EXISTS', () => {
  const repo = crearRepoDeArchivoTemporal();
  // seed: empresa A (Valle, contacto gerente), empresa B (Antioquia, sin contacto)
  repo._seedEmpresa({ idEmpresa: 'A', departamento: 'Valle del Cauca' });
  repo._seedContacto({ idEmpresa: 'A', cargoCategoria: 'gerente', email: 'g@a.co' });
  repo._seedEmpresa({ idEmpresa: 'B', departamento: 'Antioquia' });

  const soloValle = repo.empresasDeSegmento({ condiciones: [{ campo: 'departamento', op: 'en', valores: ['Valle del Cauca'] }] });
  assert.deepEqual(soloValle.map((e) => e.id), ['A']);

  const conGerente = repo.empresasDeSegmento({ condiciones: [{ campo: 'rol', op: 'en', valores: ['gerente'] }] });
  assert.deepEqual(conGerente.map((e) => e.id), ['A']);

  const dosOmas = repo.empresasDeSegmento({ condiciones: [{ campo: 'personas', op: 'mayor_que', valor: 0 }] });
  assert.deepEqual(dosOmas.map((e) => e.id), ['A']);
});
```

> Nota para el implementador: si `test-helpers` no expone `_seedEmpresa/_seedContacto`, agrégalos ahí (helpers de test, no producción) siguiendo el patrón de los otros `repository.*.test.ts`. Mira cómo `repository.cadencia.test.ts` arma su DB temporal antes de escribir esto.

- [ ] **Step 2: Ver que falla**

Run: `npm test 2>&1 | grep -A5 'departamento y por rol'`
Expected: FAIL (el compilador de filtro mapea solo columnas de empresa; `rol`/`personas` explotan o devuelven vacío).

- [ ] **Step 3: Extender el mapeo campo->SQL en el Repository**

En la función que traduce cada condición (hoy mapea `campo` a columna de `empresa`/`empresa_usuarios`), agregar los tres casos especiales. Sigue el estilo Drizzle/SQL que ya usa el archivo:
- `departamento` -> `empresa.departamento` (columna directa, igual que `ciudad`).
- `rol` -> predicado `EXISTS (SELECT 1 FROM contacto c WHERE c.id_empresa = empresa.id_empresa AND c.cargo_categoria IN (<valores>))` (y `NOT EXISTS` para `no_en`).
- `personas` -> compara el escalar `(SELECT COUNT(*) FROM contacto c WHERE c.id_empresa = empresa.id_empresa)` con `entre`/`mayor_que`/`menor_que`.
- `mayor_que`/`menor_que` sobre `usuarios`/`prioridad`/`es_cliente`/`personas`: `columna > valor` / `columna < valor`.

El test define el comportamiento exacto; implementa lo mínimo para pasarlo, respetando que TODO sigue saliendo por el Repository (nada de SQL crudo fuera de este archivo).

- [ ] **Step 4: Ver que pasa**

Run: `npm test 2>&1 | grep -A5 'departamento y por rol'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts app/db/test-helpers.ts
git commit -m "feat(repo): filtro de segmento soporta departamento, rol (EXISTS) y personas (COUNT)"
```

### Task A4: Core puro — readiness de canal

**Files:**
- Create: `app/core/canales-empresa.ts`
- Test: `app/core/canales-empresa.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { canalesDisponibles, readinessEmpresa } from './canales-empresa.ts';

test('canalesDisponibles: email da correo; telefono da llamada y whatsapp', () => {
  const c = canalesDisponibles([{ email: 'a@b.co', telefono: null }, { email: null, telefono: '3001112222' }]);
  assert.deepEqual([...c].sort(), ['correo', 'llamada', 'whatsapp']);
});

test('canalesDisponibles: sin contactos no da ningun canal', () => {
  assert.equal(canalesDisponibles([]).size, 0);
});

test('readiness: tiene todos los canales requeridos -> lista', () => {
  const r = readinessEmpresa(new Set(['correo', 'llamada']), ['correo', 'llamada'], 'cola');
  assert.equal(r.estado, 'lista');
  assert.deepEqual(r.pasosSinCanal, []);
});

test('readiness: le falta el canal de un paso, regla saltar -> parcial y marca el paso', () => {
  // pasos: [correo(dia0), llamada(dia3)]; la empresa solo tiene llamada
  const requeridos = [{ orden: 1, canal: 'correo' as const }, { orden: 2, canal: 'llamada' as const }];
  const r = readinessEmpresa(new Set(['llamada']), requeridos, 'saltar');
  assert.equal(r.estado, 'parcial');
  assert.deepEqual(r.pasosSinCanal, [1]);
});

test('readiness: sin ningun canal disponible -> sin_canal sin importar la regla', () => {
  const r = readinessEmpresa(new Set(), [{ orden: 1, canal: 'correo' as const }], 'reemplazar');
  assert.equal(r.estado, 'sin_canal');
});

test('readiness: regla reemplazar y hay otro canal -> lista (el paso se reasigna)', () => {
  const r = readinessEmpresa(new Set(['llamada']), [{ orden: 1, canal: 'correo' as const }], 'reemplazar');
  assert.equal(r.estado, 'lista');
  assert.deepEqual(r.reemplazos, [{ orden: 1, de: 'correo', a: 'llamada' }]);
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test 2>&1 | grep -A3 'readiness'`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el core**

```ts
import type { Canal } from '../db/validation.ts';

export type ReglaFaltante = 'reemplazar' | 'saltar' | 'cola';

type ContactoCanal = { email: string | null; telefono: string | null };
type PasoRequerido = { orden: number; canal: Canal };

// D3: correo <- email; llamada y whatsapp <- telefono (no distinguimos celular de fijo).
export function canalesDisponibles(contactos: ContactoCanal[]): Set<Canal> {
  const s = new Set<Canal>();
  for (const c of contactos) {
    if (c.email) s.add('correo');
    if (c.telefono) {
      s.add('llamada');
      s.add('whatsapp');
    }
  }
  return s;
}

export type Readiness = {
  estado: 'lista' | 'parcial' | 'sin_canal';
  pasosSinCanal: number[]; // ordenes de pasos que la empresa no puede hacer
  reemplazos: { orden: number; de: Canal; a: Canal }[];
};

// Si la empresa no tiene NINGUN canal -> sin_canal (ni la regla la salva).
// Con al menos un canal, la regla resuelve los pasos que faltan:
//  - reemplazar: el paso usa cualquier canal disponible (queda 'lista' con reemplazos).
//  - saltar: el paso se marca en pasosSinCanal y la empresa queda 'parcial'.
//  - cola: igual que saltar para el conteo (la empresa entra a cola aparte); 'parcial'.
export function readinessEmpresa(
  disponibles: Set<Canal>,
  requeridos: PasoRequerido[] | Canal[],
  regla: ReglaFaltante,
): Readiness {
  const pasos: PasoRequerido[] = normalizar(requeridos);
  if (disponibles.size === 0) return { estado: 'sin_canal', pasosSinCanal: pasos.map((p) => p.orden), reemplazos: [] };

  const pasosSinCanal: number[] = [];
  const reemplazos: Readiness['reemplazos'] = [];
  for (const p of pasos) {
    if (disponibles.has(p.canal)) continue;
    if (regla === 'reemplazar') {
      const alterno = [...disponibles][0];
      reemplazos.push({ orden: p.orden, de: p.canal, a: alterno });
    } else {
      pasosSinCanal.push(p.orden);
    }
  }
  const estado = pasosSinCanal.length > 0 ? 'parcial' : 'lista';
  return { estado, pasosSinCanal, reemplazos };
}

function normalizar(r: PasoRequerido[] | Canal[]): PasoRequerido[] {
  if (r.length === 0) return [];
  if (typeof r[0] === 'string') return (r as Canal[]).map((canal, i) => ({ orden: i + 1, canal }));
  return r as PasoRequerido[];
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npm test 2>&1 | grep -A3 'readiness'`
Expected: PASS (los 6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/core/canales-empresa.ts app/core/canales-empresa.test.ts
git commit -m "feat(core): readiness de canal por empresa con regla de faltante (puro)"
```

### Task A5: Migración + columna `campana.regla_faltante`

**Files:**
- Modify: `app/db/schema.ts:199-214`
- Modify: `app/db/validation.ts` (`REGLAS_FALTANTE`, `reglaFaltante` en `campanaInputSchema`)
- Create: `scripts/migrate_campanas_p5_regla_faltante.py` (dryrun + apply, patrón de los `migrate_campanas_p*` existentes)
- Test: `app/db/validation.test.ts`

- [ ] **Step 1: Test que falla (dominio primero)**

```ts
import { campanaInputSchema, REGLAS_FALTANTE } from './validation.ts';

test('campanaInputSchema default reglaFaltante = cola', () => {
  const r = campanaInputSchema.parse({ nombre: 'X', idCadencia: 1, idSegmento: 1 });
  assert.equal(r.reglaFaltante, 'cola');
});
test('campanaInputSchema rechaza regla desconocida', () => {
  const r = campanaInputSchema.safeParse({ nombre: 'X', idCadencia: 1, idSegmento: 1, reglaFaltante: 'inventada' });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test 2>&1 | grep -A3 reglaFaltante`
Expected: FAIL.

- [ ] **Step 3: Dominio + schema Drizzle**

En `app/db/validation.ts`:

```ts
export const REGLAS_FALTANTE = ['reemplazar', 'saltar', 'cola'] as const;
export type ReglaFaltanteInput = (typeof REGLAS_FALTANTE)[number];
```

Agregar a `campanaInputSchema` (junto a `modo`):

```ts
  reglaFaltante: z.enum(REGLAS_FALTANTE).optional().default('cola'),
```

En `app/db/schema.ts`, dentro de `campana`, tras `modo`:

```ts
  reglaFaltante: text('regla_faltante').notNull().default('cola'),
```

- [ ] **Step 4: Ver que pasa (dominio)**

Run: `npm test 2>&1 | grep -A3 reglaFaltante`
Expected: PASS.

- [ ] **Step 5: Script de migración (dryrun primero, NUNCA toca isps.db sin dryrun)**

Crear `scripts/migrate_campanas_p5_regla_faltante.py` copiando la estructura de `scripts/migrate_campanas_p4_dryrun.py`/`_apply.py`. El SQL:

```sql
ALTER TABLE campana ADD COLUMN regla_faltante TEXT NOT NULL DEFAULT 'cola';
```

- [ ] **Step 6: Correr dryrun y revisar**

Run: `python3 scripts/migrate_campanas_p5_regla_faltante.py --dryrun`
Expected: imprime el ALTER y el estado, sin escribir. Revisar a ojo. Luego `--apply` cuando esté OK.

- [ ] **Step 7: `crearCampana` persiste `regla_faltante`**

En `app/db/repository.ts`, en `crearCampana`, incluir `reglaFaltante` en el insert (leyendo del input ya parseado). Agregar test en `app/db/repository.test.ts` que crea una campaña con `reglaFaltante: 'saltar'` y la lee de vuelta.

- [ ] **Step 8: Commit**

```bash
git add app/db/schema.ts app/db/validation.ts app/db/validation.test.ts app/db/repository.ts app/db/repository.test.ts scripts/migrate_campanas_p5_regla_faltante.py
git commit -m "feat(campana): regla_faltante (reemplazar/saltar/cola) en dominio, schema y migracion"
```

### Task A6: Repository — empresas con readiness + conteos

**Files:**
- Modify: `app/db/repository.ts`
- Test: `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Test que falla**

```ts
test('empresasConReadiness clasifica lista/parcial/sin_canal y conteos', () => {
  const repo = crearRepoDeArchivoTemporal();
  repo._seedEmpresa({ idEmpresa: 'A' });
  repo._seedContacto({ idEmpresa: 'A', email: 'a@a.co', telefono: '3001', cargoCategoria: 'gerente' }); // correo+llamada
  repo._seedEmpresa({ idEmpresa: 'B' });
  repo._seedContacto({ idEmpresa: 'B', email: null, telefono: '3002', cargoCategoria: 'tecnico' }); // solo llamada
  repo._seedEmpresa({ idEmpresa: 'C' }); // sin contacto

  const def = { condiciones: [{ campo: 'usuarios', op: 'es_null' as const }] }; // trae las 3 (sin filtrar de verdad; ajustar seed)
  const filas = repo.empresasConReadiness(def, ['correo', 'llamada'], 'saltar');
  const byId = Object.fromEntries(filas.map((f) => [f.id, f.readiness.estado]));
  assert.equal(byId['A'], 'lista');
  assert.equal(byId['B'], 'parcial'); // le falta correo
  assert.equal(byId['C'], 'sin_canal');

  const c = repo.conteosReadiness(def, ['correo', 'llamada'], 'saltar');
  assert.deepEqual(c, { total: 3, listas: 1, parciales: 1, sinCanal: 1, sinContacto: 1 });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test 2>&1 | grep -A5 empresasConReadiness`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `app/db/repository.ts`, agregar:

```ts
// Trae las empresas del segmento con sus contactos (email/telefono/rol) y calcula
// readiness con el core puro. La query es solo lectura; el calculo vive en core.
empresasConReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante): FilaReadiness[] {
  const empresas = this.empresasDeSegmento(def); // ya existe
  const contactosPorEmpresa = this._contactosDe(empresas.map((e) => e.id)); // Map<idEmpresa, ContactoCanal[]>
  return empresas.map((e) => {
    const contactos = contactosPorEmpresa.get(e.id) ?? [];
    const disp = canalesDisponibles(contactos);
    return { ...e, canales: [...disp], readiness: readinessEmpresa(disp, canalesRequeridos, regla) };
  });
}

conteosReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante): ConteosReadiness {
  const filas = this.empresasConReadiness(def, canalesRequeridos, regla);
  return {
    total: filas.length,
    listas: filas.filter((f) => f.readiness.estado === 'lista').length,
    parciales: filas.filter((f) => f.readiness.estado === 'parcial').length,
    sinCanal: filas.filter((f) => f.readiness.estado === 'sin_canal').length,
    sinContacto: filas.filter((f) => f.canales.length === 0).length,
  };
}
```

Definir los tipos `FilaReadiness`, `ConteosReadiness` y el helper privado `_contactosDe` (una query `SELECT id_empresa, email, telefono, cargo_categoria FROM contacto WHERE id_empresa IN (...)`). Importar `canalesDisponibles`, `readinessEmpresa` del core y `Canal`, `ReglaFaltante` de sus módulos.

- [ ] **Step 4: Ver que pasa**

Run: `npm test 2>&1 | grep -A5 empresasConReadiness`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(repo): empresasConReadiness y conteosReadiness (core puro + query de lectura)"
```

### Task A7: Orden + límite en el segmento ("las 50 más grandes")

**Files:**
- Modify: `app/db/validation.ts` (`definicionSegmentoSchema` gana `orden` + `limite`)
- Modify: `app/db/repository.ts` (`empresasDeSegmento` honra orden + límite)
- Test: `app/db/validation.test.ts`, `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Test de dominio que falla**

```ts
test('definicionSegmento acepta orden y limite opcionales', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }],
    orden: { campo: 'usuarios', dir: 'desc' },
    limite: 50,
  });
  assert.equal(r.success, true);
});
test('rechaza orden sobre campo no numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }],
    orden: { campo: 'ciudad', dir: 'desc' },
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test 2>&1 | grep -A3 'orden y limite'`
Expected: FAIL.

- [ ] **Step 3: Extender el schema**

En `app/db/validation.ts`, dentro de `definicionSegmentoSchema`:

```ts
export const definicionSegmentoSchema = z.object({
  condiciones: z
    .array(z.union([condicionEnSchema, condicionNullSchema, condicionEntreSchema, condicionComparaSchema]))
    .min(1, 'un segmento necesita al menos una condicion'),
  // Ranking + tope: "las 50 mas grandes" = orden por usuarios desc, limite 50. Ambos
  // opcionales; sin ellos el segmento es el conjunto completo que cumple condiciones.
  orden: z.object({ campo: z.enum(CAMPOS_SEGMENTO_NUMERICOS), dir: z.enum(['asc', 'desc']) }).optional(),
  limite: z.number().int().positive().optional(),
});
```

- [ ] **Step 4: Test de repository que falla** (nulos al final, límite aplicado)

```ts
test('empresasDeSegmento ordena por usuarios desc, nulos al final, respeta limite', () => {
  const repo = crearRepoDeArchivoTemporal();
  repo._seedEmpresa({ idEmpresa: 'grande' }); repo._seedUsuarios('grande', 300000);
  repo._seedEmpresa({ idEmpresa: 'media' });  repo._seedUsuarios('media', 100000);
  repo._seedEmpresa({ idEmpresa: 'nula' });   // sin usuarios
  const def = { condiciones: [{ campo: 'es_cliente', op: 'entre' as const, desde: 0, hasta: 1 }], orden: { campo: 'usuarios' as const, dir: 'desc' as const }, limite: 2 };
  const r = repo.empresasDeSegmento(def);
  assert.deepEqual(r.map((e) => e.id), ['grande', 'media']); // nula queda fuera por el limite, y nunca antes que las que tienen dato
});
```

- [ ] **Step 5: Ver que falla, implementar orden/límite en el Repository**

Añadir al final de la construcción de la query en `empresasDeSegmento`: si `def.orden`, `ORDER BY <columna> <dir> NULLS LAST` (en SQLite: `ORDER BY <col> IS NULL, <col> <dir>`); si `def.limite`, `LIMIT <n>`. Mantener todo dentro del Repository.

- [ ] **Step 6: Ver que pasa**

Run: `npm test 2>&1 | grep -A3 'ordena por usuarios'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/db/validation.ts app/db/validation.test.ts app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "feat(segmento): orden (ranking) + limite, nulos al final"
```

**Fin Fase A.** El backend ya segmenta por región/rol/personas, con `>`/`<`, con ranking y tope, y calcula readiness + conteos. Corre `npm test`: todo verde.

---

## FASE B — El Copiloto conversacional (la pieza más importante)

Entrega: un Copiloto multi-turno que edita el ESTADO del segmento (condiciones + orden +
límite), con cantidad objetivo, ranking, relleno a la meta por el eje de la intención, y
honestidad sobre lo que no mapea. El core define el contrato; ClaudeAdapter lo implementa; un
fake lo testea. El estado propuesto SIEMPRE pasa por `definicionSegmentoSchema`, así que una
alucinación se rechaza antes de tocar la DB. La IA solo PROPONE estado estructurado; el
Repository ejecuta.

### Task B1: Extender `IAPort` con `copiloto` conversacional

**Files:**
- Modify: `app/core/ports/ia.ts`
- Test: (contrato) se prueba en B2 con el fake.

- [ ] **Step 1: Definir tipos y método en el puerto**

En `app/core/ports/ia.ts`:

```ts
import type { DefinicionSegmento } from '../../db/validation.ts';

// Campo ofrecido al Copiloto: nombre de dominio + valores conocidos (para que la IA
// mapee "Valle" -> 'Valle del Cauca' sin inventar). El core arma esta lista desde el
// Repository (valoresDistintosCampo) y se la pasa; la IA NO consulta la DB.
export type CampoDisponible = { campo: string; ejemplosValor?: string[]; numerico?: boolean };

// Una instruccion del usuario en el contexto del segmento ACTUAL (multi-turno). El
// Copiloto muta ese estado, no arranca de cero. `seleccion` le da cuantas cuentas cayeron
// ya, para razonar el relleno ("faltan 10 para 50").
export type InstruccionCopiloto = {
  frase: string;
  estadoActual: DefinicionSegmento; // condiciones + orden + limite de este momento
  seleccion?: { total: number };    // cuantas trae el estado actual ahora mismo
};

// La IA devuelve el ESTADO NUEVO del segmento + que hizo (para mostrarlo) + lo que no
// supo mapear. `relleno` aparece cuando la instruccion fue "completar a la meta": dice
// por que eje relajo, para que la UI marque las cuentas que entran por ahi.
export type AccionCopiloto = {
  estadoNuevo: DefinicionSegmento;
  explicacion: string; // "baje el umbral de usuarios de 200k a 150k para completar 10"
  noMapeado: string[];
  relleno?: { eje: string; motivo: string };
};

export interface IAPort {
  extraerBorradores(resumenCacheado: string): Promise<BorradorToque>;
  // Toma la instruccion + estado actual y devuelve el estado nuevo. Solo mapea a `campos`;
  // lo que no cabe va en noMapeado. El llamador SIEMPRE re-valida estadoNuevo con Zod.
  copiloto(instruccion: InstruccionCopiloto, campos: CampoDisponible[]): Promise<AccionCopiloto>;
}
```

- [ ] **Step 2: Commit** (compila aunque el adapter aún no implemente; se arregla en B3)

```bash
git add app/core/ports/ia.ts
git commit -m "feat(ia): contrato compilarSegmento en IAPort (frase -> DefinicionSegmento)"
```

### Task B2: Fake `IAPort` + función `pedirAlCopiloto` con re-validación

**Files:**
- Create: `app/adapters/ia-fake.ts`
- Create: `app/campanas/nueva/copiloto.ts`
- Test: `app/campanas/nueva/copiloto.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pedirAlCopiloto } from './copiloto.ts';
import { IAFake } from '../../adapters/ia-fake.ts';

const estadoVacio = { condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }] } as const;

test('pedirAlCopiloto devuelve el estado validado cuando la IA responde bien', async () => {
  const ia = new IAFake({
    estadoNuevo: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }, { campo: 'usuarios', op: 'mayor_que', valor: 200000 }], orden: { campo: 'usuarios', dir: 'desc' }, limite: 50 },
    explicacion: 'ISP, mas de 200k usuarios, las 50 mas grandes',
    noMapeado: [],
  });
  const r = await pedirAlCopiloto({ frase: 'tráeme las 50 ISP mas grandes de mas de 200k', estadoActual: estadoVacio }, ia);
  assert.equal(r.ok, true);
  assert.equal(r.estado.limite, 50);
  assert.equal(r.explicacion.length > 0, true);
});

test('pedirAlCopiloto rechaza un estado invalido de la IA (campo inventado)', async () => {
  const ia = new IAFake({ estadoNuevo: { condiciones: [{ campo: 'inventado', op: 'en', valores: ['x'] }] } as any, explicacion: '', noMapeado: [] });
  const r = await pedirAlCopiloto({ frase: 'lo que sea', estadoActual: estadoVacio }, ia);
  assert.equal(r.ok, false); // Zod lo tumba antes de tocar DB
});
```

- [ ] **Step 2: Ver que falla**

Run: `npm test 2>&1 | grep -A3 pedirAlCopiloto`
Expected: FAIL.

- [ ] **Step 3: Implementar fake + función**

`app/adapters/ia-fake.ts`:

```ts
import type { IAPort, AccionCopiloto, InstruccionCopiloto, CampoDisponible, BorradorToque } from '../core/ports/ia.ts';

export class IAFake implements IAPort {
  constructor(private respuesta: AccionCopiloto) {}
  async copiloto(_i: InstruccionCopiloto, _campos: CampoDisponible[]): Promise<AccionCopiloto> {
    return this.respuesta;
  }
  async extraerBorradores(): Promise<BorradorToque> {
    throw new Error('IAFake no implementa extraerBorradores');
  }
}
```

`app/campanas/nueva/copiloto.ts` (parte pura, sin `'use server'` para poder testear; el server action que la envuelve va en Fase C):

```ts
import type { IAPort, InstruccionCopiloto } from '../../core/ports/ia.ts';
import { definicionSegmentoSchema, type DefinicionSegmento } from '../../db/validation.ts';

type Resultado =
  | { ok: true; estado: DefinicionSegmento; explicacion: string; noMapeado: string[]; relleno?: { eje: string; motivo: string } }
  | { ok: false; error: string };

// Re-valida SIEMPRE el estado que propone la IA con Zod: la IA nunca es la fuente de
// verdad del segmento, el schema sí. Un campo/operador/orden inventado no llega al Repository.
export async function pedirAlCopiloto(instruccion: InstruccionCopiloto, ia: IAPort, campos = CAMPOS_COPILOTO): Promise<Resultado> {
  const bruto = await ia.copiloto(instruccion, campos);
  const parsed = definicionSegmentoSchema.safeParse(bruto.estadoNuevo);
  if (!parsed.success) return { ok: false, error: 'El Copiloto propuso un segmento invalido. Ajustalo a mano.' };
  return { ok: true, estado: parsed.data, explicacion: bruto.explicacion, noMapeado: bruto.noMapeado, relleno: bruto.relleno };
}
```

(`CAMPOS_COPILOTO`: lista `CampoDisponible[]` desde `CAMPOS_SEGMENTO`; en Fase C se enriquece con `valoresDistintosCampo` del Repository para las regiones/estados reales.)

- [ ] **Step 4: Ver que pasa**

Run: `npm test 2>&1 | grep -A3 pedirAlCopiloto`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/adapters/ia-fake.ts app/campanas/nueva/copiloto.ts app/campanas/nueva/copiloto.test.ts
git commit -m "feat(copiloto): pedirAlCopiloto conversacional con re-validacion Zod + IAFake"
```

### Task B3: `ClaudeAdapter.copiloto` (implementación real)

**Files:**
- Modify: `app/adapters/claude.ts`
- Test: se cubre con el fake (B2); la llamada real a Claude no entra en `npm test`.

- [ ] **Step 1: Implementar el método vía el gateway** (mismo patrón que `extraerBorradores`)

El prompt le pasa: la instrucción (frase), el ESTADO ACTUAL del segmento (condiciones + orden + límite), cuántas cuentas trae ahora (`seleccion.total`), y la lista cerrada de campos con sus valores conocidos (para mapear "Cali" -> ciudad, "Valle" -> departamento). Reglas del prompt:
- Devuelve SOLO JSON `{ estadoNuevo: {condiciones, orden?, limite?}, explicacion, noMapeado, relleno? }`.
- Usa solo estos campos/operadores; si algo no cae en ningún campo, va a `noMapeado`, no lo inventes.
- "las N más grandes" -> setea `orden: {campo:'usuarios', dir:'desc'}` y `limite: N`.
- **Relleno a la meta:** si la instrucción es completar a `limite` y el estado actual trae menos, identifica el EJE de la intención (tamaño / región / vertical / etc., mira qué condición domina el segmento) y relaja SOLO ese eje (baja el umbral, suma departamentos vecinos, amplía la vertical), deja el resto igual, y explica el cambio en `explicacion` + `relleno {eje, motivo}`.
- Multi-turno: parte del `estadoActual`, no de cero ("quítame Bogotá" quita ese valor de la condición de región existente).

Parsear la respuesta; si el JSON viene sucio, devolver `{ estadoNuevo: instruccion.estadoActual, explicacion: 'No entendí, ajústalo a mano', noMapeado: [instruccion.frase] }` (nunca revienta el flujo; la re-validación de B2 lo maneja).

- [ ] **Step 2: Verificación manual** (no unit test): con el gateway corriendo, correr la secuencia real "tráeme las 50 ISP más grandes" -> luego "quítame las de Bogotá" -> luego "complétame a 50 parecidas" y confirmar que el estado evoluciona y el relleno relaja por tamaño. Documentar en el PR.

- [ ] **Step 3: Commit**

```bash
git add app/adapters/claude.ts
git commit -m "feat(copiloto): ClaudeAdapter.copiloto conversacional (ranking + relleno por eje) via gateway"
```

### Task B4: Relleno a la meta — marcar las cuentas "relajadas"

Cuando el Copiloto relaja para completar, la UI tiene que distinguir las que entraron por el filtro estricto de las que entraron por el relleno. El diff es determinista y vive en el core (no en la IA).

**Files:**
- Modify: `app/core/canales-empresa.ts` (o nuevo `app/core/relleno-segmento.ts`)
- Test: `app/core/relleno-segmento.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarRelajadas } from './relleno-segmento.ts';

test('marca como relajadas las que estan en el relajado pero no en el estricto', () => {
  const estrictas = ['A', 'B', 'C'];               // 3 del filtro duro
  const relajadas = ['A', 'B', 'C', 'D', 'E'];     // 5 tras relajar
  const r = marcarRelajadas(estrictas, relajadas);
  assert.deepEqual(r, [
    { id: 'A', relajada: false }, { id: 'B', relajada: false }, { id: 'C', relajada: false },
    { id: 'D', relajada: true }, { id: 'E', relajada: true },
  ]);
});
```

- [ ] **Step 2: Ver que falla, implementar**

```ts
// Diff puro: las que aparecen en el conjunto relajado pero no en el estricto entraron
// por el relleno. La UI las pinta distinto para que se revisen con mas ojo.
export function marcarRelajadas(idsEstrictas: string[], idsRelajadas: string[]): { id: string; relajada: boolean }[] {
  const duras = new Set(idsEstrictas);
  return idsRelajadas.map((id) => ({ id, relajada: !duras.has(id) }));
}
```

- [ ] **Step 3: Ver que pasa**

Run: `npm test 2>&1 | grep -A3 relajadas`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/core/relleno-segmento.ts app/core/relleno-segmento.test.ts
git commit -m "feat(copiloto): marcar cuentas 'relajadas' del relleno a la meta (diff puro)"
```

> En Fase C, el flujo de relleno es: correr el estado estricto (empresasDeSegmento) -> guardar sus ids -> aplicar el estadoNuevo del Copiloto (relajado, con limite) -> `marcarRelajadas(idsEstrictas, idsRelajadas)` -> la tabla pinta las relajadas con un badge y la revisión (P2) las trata aparte.

**Fin Fase B.** El Copiloto es conversacional, rankea, completa a la meta relajando por el eje de la intención, es honesto, y el estado siempre se valida. `npm test` verde.

---

## FASE C — UI de Segmentación (dirección 2A) · build + verify

Entrega: la vista 2 del wizard funcional: wall de filtros a la izquierda, tabla de cuentas al centro con readiness y checkbox incluir/excluir, Copiloto a la derecha con "Traducir", conteos en vivo, y el selector de regla de faltante. Verificación en navegador contra el mockup.

> **Expandir a su propio plan (writing-plans) al llegar aquí.** Abajo, el mapa y los contratos ya cerrados para que ese plan se escriba directo.

**Primero: tokens de diseño.** Modify `app/globals.css` — agregar sobre los `:root` existentes:
```css
  --accent: #8b7cff;         /* violeta 2A: accion/seleccion/foco */
  --accent-soft: #c4b5fd;
  --accent-glow: rgba(139,124,255,.35);
  --warn: #e07a3f;           /* naranja: alerta/energia */
  /* --done ya existe (#57c98a) para el estado listo */
```
Fuentes: cargar IBM Plex Mono (datos), IBM Plex Sans (UI) y Newsreader (títulos de tarjeta 1C) por `next/font` en el layout. Verify: `preview_inspect` sobre un chip de filtro confirma `color: rgb(139,124,255)`.

**Componentes (client) y su responsabilidad única:**
- `FiltroWall.tsx` — chips de filtro por campo (usuarios rango, región, categoría, estado, rol, personas) + control de orden y límite ("las N más grandes"). Estado = una `DefinicionSegmento`. Emite cambios hacia arriba. "Añadir filtro manual" agrega condiciones.
- `CopilotoPanel.tsx` — **conversacional (multi-turno), estado BETA visible.** Hilo de instrucciones; cada una llama al server action `copiloto` con el ESTADO ACTUAL -> aplica `estadoNuevo` al `FiltroWall`, muestra `explicacion` ("bajé el umbral a 150k para completar 10") y `noMapeado` como aviso honesto. Soporta cantidad objetivo, ranking y "complétame a N parecidas".
- `TablaCuentas.tsx` — filas de `empresasConReadiness`, columnas Cuenta/Ciudad/Usuarios/Estado/Readiness, checkbox incluir/excluir (persistir con `excluirDeSegmento`/`incluirDeSegmento` existentes). Header con conteos de `conteosReadiness`. Las filas que entran por relleno (`marcarRelajadas`, B4) llevan un badge "relajada".
- `ReadinessBadge.tsx` — pinta lista (verde `--done`) / parcial (naranja `--warn`) / sin canal (gris), con tooltip de qué falta.

**Server actions (Fase C):** en `app/campanas/nueva/actions.ts` (o donde vivan las de la ruta):
- `copiloto(instruccion): Promise<Resultado>` — `'use server'` que arma `CAMPOS_COPILOTO` con `repo.valoresDistintosCampo` y delega en `pedirAlCopiloto` (B2) con el `ClaudeAdapter` real. Recibe el estado actual, devuelve el nuevo + explicación + relleno.
- `previsualizar(def, canalesRequeridos, regla): { filas, conteos }` — delega en `empresasConReadiness`/`conteosReadiness`. Para relleno, corre estricto vs relajado y aplica `marcarRelajadas`. `canalesRequeridos` se deriva de la cadencia (o todos si aún no hay).
- `guardar(nombre, def, frase)` — `guardarSegmento` (existe), guardando `descripcion_natural = frase`. `def` ya incluye orden/límite.

**Verify (navegador):** pedir "las 50 ISP más grandes de Valle" y ver chips + orden + límite llenarse; pedir "quítame Bogotá" y ver el estado mutar sin reiniciar; pedir "complétame a 50 parecidas" cuando hay 40 y ver 10 filas con badge "relajada" + la explicación del eje; togglear un filtro y ver el conteo cambiar; una empresa sin correo muestra badge parcial/sin-canal. `preview_console_logs` sin errores.

---

## FASE D — Cadencia (aprobación por toque) + Destinatarios/Reglas + Resumen · build + verify

Entrega: vista 3 (cadencia editable con columna Aprobación, reusa parser existente) y vista 4 (destinatarios por rol + regla de faltante + resumen de envío tipo factura), y el botón Lanzar que crea la campaña e inscribe.

> **Expandir a su propio plan al llegar.** Contratos:

- **Cadencia:** reusar `ConstructorCadencia.tsx` y el parser (`parsearCadenciaMarkdown`/`Csv`). Agregar columna "Aprobación" que setea `esManual` por paso (ya existe en `pasoParseadoSchema`). "Tu cadencia por pasos" se genera de la tabla de toques.
- **Destinatarios por rol:** nuevo `contactosPorRol(idsEmpresa, roles): Map<idEmpresa, Contacto[]>` en el Repository (query de lectura). UI: chips de rol (gerente/dueño/técnico/todos) que filtran a quién se inscribe.
- **Regla de faltante:** `ReglaFaltante.tsx` con las 3 opciones (texto exacto del mockup: "Reemplazar por llamada" / "Saltar el paso" / "Cola de contacto"). El valor va a `crearCampana` (columna ya creada en A5).
- **Resumen de envío (factura):** `ResumenEnvio.tsx` — "Vas a inscribir a N contactos ... cadencia X · K toques en D días". N/K/D salen de `conteosReadiness` + la cadencia. Botón "Lanzar" -> server action que llama `crearCampana` (con `reglaFaltante`) + `inscribirCampana` (existe). Las empresas `sin_canal`/`cola` quedan como inscripción `bloqueada` (el schema ya lo contempla: índice parcial solo cuenta `activa`).

**Verify:** crear una cadencia de 4 toques, marcar el toque 1 como manual, elegir solo gerentes, poner regla "saltar", lanzar; confirmar en DB temporal/dev que la campaña quedó con `regla_faltante='saltar'` y las inscripciones en el estado correcto.

---

## FASE E — Preview cinemático (core TDD + UI build/verify) · la joya

Entrega: el toggle Preview con timeline por cuenta (scrub + animación por canal, copy personalizado, cierre "listo") y vista día a día (cohorte). El motor de simulación es puro y TDD; la UI se verifica en navegador.

### Core (TDD):

- **`app/core/render-copy.ts`** — `renderCopy(plantilla: string, datos: Record<string,string>): string` sustituye `[nombre]`, `[empresa]`, etc. Tests: sustituye variables conocidas; deja intacta una variable sin dato y la reporta (para no mandar "[nombre]" en un correo real). Reusa la extracción de `variables` que ya hace el parser.
- **`app/core/simulacion-campana.ts`** — `simularTimeline(empresa, contactos, cadencia, regla, anchor): NodoTimeline[]` y `simularCohorte(inscripciones, cadencia, config, rango): DiaCohorte[]`. Se apoya en `calcularCalendario`/`proximoPasoDebido`/`elegirVersionPorPeso` (ya existen) + `readinessEmpresa` (A4) + `renderCopy`. Tipos:
  ```ts
  type NodoTimeline = { orden: number; dia: number; canal: Canal; asunto?: string; cuerpo: string; estado: 'ok' | 'reemplazado' | 'saltado' };
  type DiaCohorte = { dia: number; porCanal: Record<Canal, number>; nuevasCuentas: number };
  ```
  Tests deterministas: una cadencia [correo d0, llamada d3, correo d7] sobre una empresa sin correo con regla `saltar` produce nodos con el paso de correo `saltado`; con `reemplazar`, `reemplazado` a llamada. El copy sale personalizado con el nombre real del contacto. La cohorte suma bien por día.

### UI (build + verify, WAAPI):

- `TimelinePorCuenta.tsx` — línea horizontal con nodos de `simularTimeline`. Scrub con mouse/teclado; al enfocar un nodo, `element.animate()` despliega el detalle según canal (correo: se abre mostrando `cuerpo` ya personalizado; llamada: guion; whatsapp: burbujeo). Nodo `saltado` se ve tenue; `reemplazado` muestra el canal nuevo. Al final, estado "listo" en `--done`, sobrio.
- `DiaADia.tsx` — control de día (slider) sobre `simularCohorte`; por día muestra volumen y tipo de toque. Calendario NO tradicional (timeline de días, no grid de mes).
- `PreviewCinematico.tsx` — toggle entre las dos vistas; selector de empresa para 4a.

**Verify:** raspar la timeline y ver las animaciones; un nodo de correo muestra el nombre real; cambiar la regla y ver el nodo pasar de saltado a reemplazado; la cohorte cuadra con los conteos. Si el scrub tartamudea con WAAPI, ahí (y solo ahí) se evalúa framer-motion con justificación escrita (D1).

---

## FASE F — Hub rediseñado (1C) + nav + Plantillas · build + verify

Entrega: la vista 1 (hub) con tarjetas serif (1C), pulso de campañas, tabs de estado, y nav global (Campañas/Contactos/Plantillas/Reportes). Plantillas reusa cadencias; Reportes es stub.

> **Expandir a su propio plan al llegar.** Contratos:
- `pulsoCampanas(): { enSecuenciaHoy, bloqueadasEsperandoRegla, toquesSemana, tasaRespuesta }` en el Repository. En este spec `toquesSemana`/`tasaRespuesta` salen de la simulación o quedan como placeholder marcado (el dato real es del spec de ejecución/tracking).
- `app/campanas/page.tsx` — rediseño a tarjetas 1C (título Newsreader), tabs Todas/Activas/Pausada/Borrador (filtra `listarCampanas`), botón "Nueva campaña".
- `app/campanas/plantillas/page.tsx` — lista `listarCadencias()` como plantillas reutilizables.
- Reportes: ruta stub con "Disponible con el tracking" (spec siguiente).

**Verify:** el hub muestra las campañas seed como tarjetas; los tabs filtran; el pulso pinta números; Plantillas lista las cadencias.

---

## Orden de ejecución y checkpoints

1. **Fase A** (backend, TDD) -> `npm test` verde. Checkpoint: Sebastián revisa el modelo de readiness.
2. **Fase B** (Copiloto, TDD) -> `npm test` verde. Checkpoint: probar `compilarSegmento` real con una frase.
3. **Fase C** (UI segmentación) -> verificación navegador. Checkpoint visual.
4. **Fase D** (cadencia/destinatarios/lanzar).
5. **Fase E** (preview cinemático) -> la joya.
6. **Fase F** (hub) -> cierre.

Cada fase de UI (C, D, E-UI, F) se expande a su propio `docs/superpowers/plans/` con writing-plans al empezarla, usando el mockup como fuente de verdad. A y B están listas para ejecutar tal cual desde este documento.

## Self-review (cobertura del spec)

- 3.1 segmentación wall + Copiloto conversacional -> Fase A (campos/ops + A7 orden/límite) + Fase B (B1-B3 Copiloto multi-turno con ranking + B4 relleno por eje) + Fase C (UI hilo + badge relajada). ✓
- 3.2 reality check del dato -> informa A4/A6 (readiness) y los conteos "sin contacto". ✓
- 3.3 readiness + regla de faltante -> A4 (core), A5 (columna), A6 (conteos), C/D (UI). ✓
- 3.4 destinatarios por rol -> A2/A3 (filtro rol) + D (contactosPorRol + UI). ✓
- 4 wizard + hub -> C (seg), D (cadencia/dest), E (preview), F (hub). ✓
- 5 preview cinemático (timeline + día a día) -> Fase E (simulacion-campana + UI). ✓
- 6 dirección de diseño -> Fase C (tokens globals.css + fuentes). ✓
- 7 modelo de datos (regla_faltante, campos/ops nuevos, sin tablas nuevas) -> A. ✓
- Refinamientos mockup (2): Copiloto BETA (B/C), aprobación por toque (D), resumen factura (D), pulso hub (F), nav Plantillas/Reportes (F). ✓
- Fuera de alcance (ejecución/tracking real) -> explícitamente diferido; pulso usa simulación/placeholder. ✓
