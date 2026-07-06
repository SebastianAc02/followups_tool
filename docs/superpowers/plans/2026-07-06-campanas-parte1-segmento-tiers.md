# Parte 1: Segmento con tiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (ejecución inline, preferencia de Sebastián) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Builder de segmentos estilo Apollo con conteo en vivo, incluyendo rango numérico por cantidad de usuarios (tiers), conectado al Repository real.

**Architecture:** Se extiende el lenguaje cerrado de segmentación (validation.ts + repository.ts) con el campo `usuarios` (respaldado por `empresa_usuarios.usuarios_estimados` vía LEFT JOIN permanente) y el operador `entre` (solo campos numéricos). La UI nueva vive en `app/campanas/segmentos/` y solo habla con server actions que llaman al Repository. Cero SQL fuera del Repository.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle ORM sobre SQLite (better-sqlite3), Zod 4, node:test con strip-types.

**Spec:** `docs/superpowers/specs/2026-07-06-campanas-front-design.md` (Parte 1).

**Comandos del proyecto:**
- Tests: `npm test` (corre todo) o `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.segmento.test.ts` (solo segmentos)
- Types: `npx tsc --noEmit`
- Dev: `npm run dev` (lee isps.db real, solo lectura en esta parte hasta guardar segmento)

**Regla de learning mode:** la Task 1 tiene un bloque que escribe Sebastián (la extensión del lenguaje de segmentación). El ejecutor prepara la firma, escribe los tests, y SE DETIENE ahí hasta que Sebastián lo escriba. No se rellena por la IA.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `app/db/validation.ts` | Modificar | Campo `usuarios` en whitelist, subset numérico, schema del operador `entre` (lo escribe Sebastián) |
| `app/db/repository.ts` | Modificar | Columna de `usuarios`, LEFT JOIN a empresa_usuarios, case `entre`, `valoresDistintosCampo` |
| `app/db/repository.segmento.test.ts` | Modificar | Tests de `entre`, NULL fuera, validaciones, valores distintos |
| `app/campanas/actions.ts` | Crear | Server actions: previsualizar (conteo + muestra + aviso sin-dato) y guardar |
| `app/campanas/segmentos/page.tsx` | Crear | Server component: lista segmentos guardados, pasa valores distintos al builder |
| `app/campanas/segmentos/SegmentoBuilder.tsx` | Crear | Client component: filas de condiciones estilo Apollo, conteo en vivo, guardar |

---

### Task 1: Lenguaje de segmentación: campo `usuarios` + operador `entre`

**Files:**
- Modify: `app/db/validation.ts:71-96`
- Test: `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Escribir los tests que definen el contrato del operador**

Agregar al final de `app/db/repository.segmento.test.ts` (los imports y el seed ya existen; agregar el seed de usuarios justo después de `seed()` actual, dentro de una función nueva):

```ts
// Parte 1 campanas: seed de usuarios para probar el operador entre.
// e1=12000, e2=5000, e3=800; e4..e7 SIN fila (sin dato de usuarios).
function seedUsuarios() {
  const raw = new Database(dbPath);
  const ins = raw.prepare('INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados) VALUES (?, ?)');
  ins.run('e1', 12000);
  ins.run('e2', 5000);
  ins.run('e3', 800);
  raw.close();
}
seedUsuarios();

test('entre sobre usuarios: 3000..10000 devuelve solo e2', () => {
  const def = { condiciones: [{ campo: 'usuarios' as const, op: 'entre' as const, desde: 3000, hasta: 10000 }] };
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id), ['e2']);
  assert.equal(contarSegmento(def), 1);
});

test('entre excluye empresas sin dato de usuarios (NULL no matchea rango)', () => {
  // e4 es on_hold pero no tiene fila en empresa_usuarios: con entre queda fuera
  const def = {
    condiciones: [
      { campo: 'estado' as const, op: 'en' as const, valores: ['on_hold'] },
      { campo: 'usuarios' as const, op: 'entre' as const, desde: 0, hasta: 999999 },
    ],
  };
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id).sort(), ['e1', 'e2', 'e3']);
});

test('entre sobre prioridad (campo numerico ya existente) funciona', () => {
  const def = { condiciones: [{ campo: 'prioridad' as const, op: 'entre' as const, desde: 4, hasta: 6 }] };
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id).sort(), ['e2', 'e3', 'e6']);
});

test('entre con desde > hasta se rechaza en validacion', () => {
  const def = { condiciones: [{ campo: 'usuarios', op: 'entre', desde: 100, hasta: 5 }] } as never;
  assert.throws(() => empresasDeSegmento(def));
});

test('entre sobre campo de texto (ciudad) se rechaza en validacion', () => {
  const def = { condiciones: [{ campo: 'ciudad', op: 'entre', desde: 1, hasta: 2 }] } as never;
  assert.throws(() => empresasDeSegmento(def));
});

test('es_null sobre usuarios encuentra las empresas sin dato', () => {
  const def = { condiciones: [{ campo: 'usuarios' as const, op: 'es_null' as const }] };
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id).sort(), ['e4', 'e5', 'e6', 'e7']);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.segmento.test.ts`
Expected: FAIL. Los tests nuevos truenan porque `usuarios` no está en CAMPOS_SEGMENTO y `entre` no existe en el union de Zod (error de validación) y compilarSegmento no lo maneja.

- [ ] **Step 3: CHECKPOINT LEARNING — Sebastián escribe la extensión del schema**

Preparación de la IA en `app/db/validation.ts`: agregar `'usuarios'` a `CAMPOS_SEGMENTO` (con comentario `// empresa_usuarios.usuarios_estimados (via LEFT JOIN)`), y dejar este hueco preparado entre `condicionNullSchema` y `definicionSegmentoSchema`:

```ts
// Parte 1 campanas: subset de campos donde un rango numerico tiene sentido.
export const CAMPOS_SEGMENTO_NUMERICOS = ['prioridad', 'es_cliente', 'usuarios'] as const;

// TODO(Sebastián): condicionEntreSchema — la regla de dominio del operador de rango.
// Debe: (1) aceptar solo campos de CAMPOS_SEGMENTO_NUMERICOS, (2) op literal 'entre',
// (3) desde y hasta numericos, (4) rechazar desde > hasta con mensaje claro.
// Los tests de repository.segmento.test.ts definen el contrato exacto.
```

Y actualizar el union para incluirlo cuando exista:

```ts
export const definicionSegmentoSchema = z.object({
  condiciones: z
    .array(z.union([condicionEnSchema, condicionNullSchema, condicionEntreSchema]))
    .min(1, 'un segmento necesita al menos una condicion'),
});
```

**La decisión que está en juego** (para el bloque de Sebastián, 5-10 líneas de Zod): esta es la primera extensión del lenguaje cerrado de segmentación. El trade-off: validar `desde <= hasta` aquí (falla temprano, cualquier caller queda protegido: UI, futura traducción con Claude) versus dejarlo al Repository (menos schemas, pero el error llega tarde y feo). El patrón del proyecto es validar en el dominio (ver kdmSchema y registrarToqueSchema). Herramienta útil de Zod: `.refine()` para reglas entre campos.

**El ejecutor se detiene aquí y no continúa hasta que el bloque esté escrito.**

- [ ] **Step 4: Implementar el lado Repository (la IA, después del checkpoint)**

En `app/db/repository.ts`:

1. Imports: agregar `between` a los imports de `drizzle-orm` y `empresaUsuarios` a los de `./schema`.

2. En `COLUMNA_SEGMENTO` agregar:

```ts
  usuarios: { col: empresaUsuarios.usuariosEstimados, numerico: true },
```

3. En `compilarSegmento`, agregar el case al switch:

```ts
      case 'entre':
        // NULL nunca matchea un rango (semantica SQL): empresa sin dato queda fuera.
        // La UI avisa cuantas quedaron fuera; aca no se inventa un default.
        return between(col, c.desde, c.hasta);
```

4. En `empresasDeSegmento` y `contarSegmento`, agregar el join (siempre, es LEFT JOIN sobre PK, gratis) y exponer usuarios en la muestra:

```ts
export function empresasDeSegmento(def: DefinicionSegmento) {
  const val = definicionSegmentoSchema.parse(def);
  return db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      categoria: empresa.categoria,
      usuarios: empresaUsuarios.usuariosEstimados,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(compilarSegmento(val))
    .orderBy(empresa.nombreOficial)
    .all();
}

export function contarSegmento(def: DefinicionSegmento): number {
  const val = definicionSegmentoSchema.parse(def);
  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(compilarSegmento(val))
    .get();
  return fila?.n ?? 0;
}
```

- [ ] **Step 5: Correr los tests de segmento y verificar que pasan**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.segmento.test.ts`
Expected: PASS todos (los 5+ existentes y los 6 nuevos).

- [ ] **Step 6: Correr la suite completa y tsc (el join no debe romper nada)**

Run: `npm test && npx tsc --noEmit`
Expected: PASS todo, tsc limpio. Si `inscribirCampana` u otro caller de `empresasDeSegmento` truena por el campo `usuarios` nuevo en el select, es solo el tipo de retorno: ningún caller destructura exhaustivamente, no debería tronar.

- [ ] **Step 7: Commit**

```bash
git add app/db/validation.ts app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "Campanas P1: operador entre + campo usuarios en segmentacion"
```

---

### Task 2: `valoresDistintosCampo` (dropdowns estilo Apollo)

**Files:**
- Modify: `app/db/repository.ts` (después de `listarSegmentos`, ~línea 745)
- Test: `app/db/repository.segmento.test.ts`

- [ ] **Step 1: Escribir los tests**

Agregar a `app/db/repository.segmento.test.ts` (importar `valoresDistintosCampo` en el import de repository al inicio del archivo):

```ts
test('valoresDistintosCampo devuelve valores unicos ordenados sin null', () => {
  assert.deepEqual(valoresDistintosCampo('estado'), ['on_hold', 'oportunidad']);
  assert.deepEqual(valoresDistintosCampo('categoria'), ['isp', 'utility']);
});

test('valoresDistintosCampo rechaza campos numericos (rango, no dropdown)', () => {
  assert.throws(() => valoresDistintosCampo('usuarios'));
  assert.throws(() => valoresDistintosCampo('prioridad'));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.segmento.test.ts`
Expected: FAIL con "valoresDistintosCampo is not a function" (o no exportada).

- [ ] **Step 3: Implementar**

En `app/db/repository.ts`, después de `listarSegmentos`:

```ts
// Parte 1 campanas: valores unicos de un campo de texto para poblar el dropdown del
// builder (estilo Apollo). Solo campos de texto: los numericos se filtran por rango,
// no por lista, y ademas usuarios vive en otra tabla.
export function valoresDistintosCampo(campo: CampoSegmento): string[] {
  const { col, numerico } = COLUMNA_SEGMENTO[campo];
  if (numerico) {
    throw new Error(`el campo '${campo}' es numerico: se filtra por rango, no por lista de valores`);
  }
  const filas = db.selectDistinct({ v: col }).from(empresa).where(isNotNull(col)).orderBy(col).all();
  return filas.map((f) => String(f.v));
}
```

- [ ] **Step 4: Correr tests y tsc**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.segmento.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.segmento.test.ts
git commit -m "Campanas P1: valoresDistintosCampo para dropdowns del builder"
```

---

### Task 3: Server actions de previsualizar y guardar

**Files:**
- Create: `app/campanas/actions.ts`

Sin test unitario propio: son cáscaras finas sobre funciones ya probadas (patrón del proyecto, ver `app/cadencias/actions.ts`). La verificación es tsc + el flujo manual de la Task 5.

- [ ] **Step 1: Crear el archivo completo**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { empresasDeSegmento, guardarSegmento } from '../db/repository';
import { definicionSegmentoSchema, type DefinicionSegmento } from '../db/validation';
import { requireSession } from '../lib/session';

// Parte 1 campanas: el builder manda la definicion completa en cada cambio y recibe
// conteo + muestra. Todo pasa por Zod en el Repository; aca solo se atrapa el error
// para que la UI lo pinte en vez de tumbar la pagina.
export type PreviewSegmento =
  | {
      ok: true;
      total: number;
      muestra: { id: string; nombre: string | null; estado: string | null; categoria: string | null; usuarios: number | null }[];
      // Cuantas empresas cumplen el resto de condiciones pero NO tienen dato de
      // usuarios (un rango nunca matchea NULL). Solo se calcula si hay condicion
      // entre sobre usuarios; si no, null.
      sinDatoUsuarios: number | null;
    }
  | { ok: false; error: string };

export async function previsualizarSegmentoAction(def: DefinicionSegmento): Promise<PreviewSegmento> {
  await requireSession();
  try {
    const val = definicionSegmentoSchema.parse(def);
    const empresas = empresasDeSegmento(val);

    let sinDatoUsuarios: number | null = null;
    const tieneRangoUsuarios = val.condiciones.some((c) => c.campo === 'usuarios' && c.op === 'entre');
    if (tieneRangoUsuarios) {
      // Mismas condiciones, pero el rango de usuarios se reemplaza por es_null:
      // "las que se te escaparon por no tener dato". Reusa el mismo motor, cero SQL nuevo.
      const resto = val.condiciones.filter((c) => !(c.campo === 'usuarios' && c.op === 'entre'));
      const defNull: DefinicionSegmento = {
        condiciones: [...resto, { campo: 'usuarios', op: 'es_null' }],
      };
      sinDatoUsuarios = empresasDeSegmento(defNull).length;
    }

    return { ok: true, total: empresas.length, muestra: empresas.slice(0, 20), sinDatoUsuarios };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'definicion de segmento invalida' };
  }
}

export type GuardarSegmentoResultado = { ok: true; idSegmento: number } | { ok: false; error: string };

export async function guardarSegmentoAction(nombre: string, def: DefinicionSegmento): Promise<GuardarSegmentoResultado> {
  await requireSession();
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: 'El segmento necesita un nombre' };
  try {
    const idSegmento = guardarSegmento({ nombre: limpio, definicion: def });
    revalidatePath('/campanas/segmentos');
    return { ok: true, idSegmento };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el segmento' };
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpio. Ojo: el literal `{ campo: 'usuarios', op: 'es_null' }` debe tipar contra el union; si TS se queja, anotar `as DefinicionSegmento['condiciones'][number]`.

- [ ] **Step 3: Commit**

```bash
git add app/campanas/actions.ts
git commit -m "Campanas P1: server actions de previsualizar y guardar segmento"
```

---

### Task 4: UI del builder (página + client component)

**Files:**
- Create: `app/campanas/segmentos/page.tsx`
- Create: `app/campanas/segmentos/SegmentoBuilder.tsx`

Verificación manual (patrón del proyecto para UI: no hay tests de componentes; tsc + dev server).

- [ ] **Step 1: Crear `app/campanas/segmentos/page.tsx`**

```tsx
import Link from 'next/link';
import { listarSegmentos, valoresDistintosCampo } from '../../db/repository';
import { requireSession } from '../../lib/session';
import SegmentoBuilder from './SegmentoBuilder';

// Parte 1 campanas: pantalla de segmentacion. El server component precarga los valores
// unicos de los campos de texto (dropdowns) y la lista de segmentos guardados; el
// builder client-side arma condiciones y pide conteo en vivo por server action.
export default async function Segmentos() {
  await requireSession();

  const segmentos = listarSegmentos();
  const opciones = {
    estado: valoresDistintosCampo('estado'),
    categoria: valoresDistintosCampo('categoria'),
    estado_comercial: valoresDistintosCampo('estado_comercial'),
    ciudad: valoresDistintosCampo('ciudad'),
    owner: valoresDistintosCampo('owner'),
  };

  return (
    <div className="wrap">
      <Link href="/" className="back">
        ← Cola
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Segmentos
      </div>

      <div className="section-label">Armar un segmento</div>
      <p className="conector-desc">
        Filtra la base como en Apollo: agrega condiciones y mira el conteo en vivo. Los campos numéricos
        (usuarios, prioridad) filtran por rango; el resto por lista de valores.
      </p>
      <SegmentoBuilder opciones={opciones} />

      <div className="section-label" style={{ marginTop: 32 }}>
        Segmentos guardados
      </div>
      {segmentos.length === 0 ? (
        <p className="conector-desc">Todavía no hay segmentos. Arma el primero arriba.</p>
      ) : (
        <div className="cad-list">
          {segmentos.map((s) => (
            <div key={s.id} className="cad-item">
              <span className="cad-item-nombre">{s.nombre}</span>
              {s.descripcionNatural && <span className="cad-item-meta">{s.descripcionNatural}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear `app/campanas/segmentos/SegmentoBuilder.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import type { DefinicionSegmento } from '../../db/validation';
import { previsualizarSegmentoAction, guardarSegmentoAction, type PreviewSegmento } from '../actions';

type Condicion = DefinicionSegmento['condiciones'][number];

// Campos de texto -> dropdown de valores; numericos -> rango desde/hasta.
const CAMPOS_TEXTO = ['estado', 'categoria', 'estado_comercial', 'ciudad', 'owner'] as const;
const CAMPOS_RANGO = ['usuarios', 'prioridad'] as const;

const LABELS: Record<string, string> = {
  estado: 'Estado (Notion)',
  categoria: 'Categoría',
  estado_comercial: 'Estado comercial',
  ciudad: 'Ciudad',
  owner: 'Owner',
  usuarios: 'Usuarios',
  prioridad: 'Prioridad (tier)',
};

type Props = { opciones: Record<(typeof CAMPOS_TEXTO)[number], string[]> };

export default function SegmentoBuilder({ opciones }: Props) {
  const [condiciones, setCondiciones] = useState<Condicion[]>([]);
  const [preview, setPreview] = useState<PreviewSegmento | null>(null);
  const [nombre, setNombre] = useState('');
  const [guardado, setGuardado] = useState('');
  const [pending, startTransition] = useTransition();

  function refrescar(nuevas: Condicion[]) {
    setCondiciones(nuevas);
    setGuardado('');
    if (nuevas.length === 0) {
      setPreview(null);
      return;
    }
    startTransition(async () => {
      setPreview(await previsualizarSegmentoAction({ condiciones: nuevas }));
    });
  }

  function agregarTexto(campo: (typeof CAMPOS_TEXTO)[number]) {
    refrescar([...condiciones, { campo, op: 'en', valores: [opciones[campo][0] ?? ''] }]);
  }
  function agregarRango(campo: (typeof CAMPOS_RANGO)[number]) {
    refrescar([...condiciones, { campo, op: 'entre', desde: 0, hasta: campo === 'usuarios' ? 10000 : 9 }]);
  }
  function actualizar(i: number, c: Condicion) {
    refrescar(condiciones.map((prev, j) => (j === i ? c : prev)));
  }
  function quitar(i: number) {
    refrescar(condiciones.filter((_, j) => j !== i));
  }

  async function guardar() {
    const r = await guardarSegmentoAction(nombre, { condiciones });
    setGuardado(r.ok ? `Guardado (#${r.idSegmento})` : r.error);
  }

  return (
    <div className="capture">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {CAMPOS_TEXTO.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => agregarTexto(c)}>
            + {LABELS[c]}
          </button>
        ))}
        {CAMPOS_RANGO.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => agregarRango(c)}>
            + {LABELS[c]} (rango)
          </button>
        ))}
      </div>

      {condiciones.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span className="mono" style={{ minWidth: 140 }}>{LABELS[c.campo]}</span>
          {c.op === 'entre' ? (
            <>
              <input
                type="number"
                value={c.desde}
                onChange={(e) => actualizar(i, { ...c, desde: Number(e.target.value) })}
                style={{ width: 100 }}
              />
              <span>a</span>
              <input
                type="number"
                value={c.hasta}
                onChange={(e) => actualizar(i, { ...c, hasta: Number(e.target.value) })}
                style={{ width: 100 }}
              />
            </>
          ) : c.op === 'en' || c.op === 'no_en' ? (
            <>
              <select value={c.op} onChange={(e) => actualizar(i, { ...c, op: e.target.value as 'en' | 'no_en' })}>
                <option value="en">es</option>
                <option value="no_en">no es</option>
              </select>
              <select
                multiple
                value={c.valores}
                onChange={(e) =>
                  actualizar(i, { ...c, valores: Array.from(e.target.selectedOptions, (o) => o.value) })
                }
              >
                {(opciones[c.campo as (typeof CAMPOS_TEXTO)[number]] ?? []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="conector-desc">{c.op === 'es_null' ? 'sin valor' : 'con valor'}</span>
          )}
          <button type="button" className="chip" onClick={() => quitar(i)}>
            quitar
          </button>
        </div>
      ))}

      {preview && (
        <div style={{ marginTop: 16 }}>
          {preview.ok ? (
            <>
              <div className="section-label">
                {pending ? 'Contando...' : `${preview.total} empresas caen en el segmento`}
              </div>
              {preview.sinDatoUsuarios !== null && preview.sinDatoUsuarios > 0 && (
                <p className="conector-desc">
                  {preview.sinDatoUsuarios} empresas cumplen el resto de filtros pero no tienen dato de
                  usuarios y quedaron fuera del rango.
                </p>
              )}
              <div className="cad-list">
                {preview.muestra.map((e) => (
                  <div key={e.id} className="cad-item">
                    <span className="cad-item-nombre">{e.nombre}</span>
                    <span className="cad-item-meta mono">
                      {e.estado ?? 'sin estado'} · {e.categoria ?? 'sin categoria'} ·{' '}
                      {e.usuarios != null ? `${e.usuarios} usuarios` : 'sin dato'}
                    </span>
                  </div>
                ))}
                {preview.total > preview.muestra.length && (
                  <p className="conector-desc">Mostrando 20 de {preview.total}.</p>
                )}
              </div>
            </>
          ) : (
            <p className="login-error">{preview.error}</p>
          )}
        </div>
      )}

      {condiciones.length > 0 && preview?.ok && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input placeholder="Nombre del segmento (ej. Tier 1 ISP)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <button type="button" className="save" onClick={guardar}>
            Guardar segmento
          </button>
          {guardado && <span className="conector-desc">{guardado}</span>}
        </div>
      )}
    </div>
  );
}
```

Nota: si la clase `chip` no existe en `globals.css`, usar la clase que usan los chips de fecha del CaptureForm (verificar en `app/globals.css` y reutilizar; no inventar CSS nuevo si ya hay un patrón).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 4: Verificación manual en dev**

Run: `npm run dev` y abrir `http://localhost:3000/campanas/segmentos`.
Checklist:
1. Agregar condición Estado = on_hold: el conteo en vivo debe dar ~126 (el número verificado en Fase 4).
2. Agregar rango Usuarios 3000 a 10000: el conteo baja y aparece el aviso de "sin dato de usuarios quedaron fuera".
3. Guardar como "Tier 1 prueba": aparece en la lista de guardados al recargar.
4. desde > hasta (ej. 100 a 5): la UI pinta el error de validación, no truena la página.

- [ ] **Step 5: Commit**

```bash
git add app/campanas/segmentos/page.tsx app/campanas/segmentos/SegmentoBuilder.tsx
git commit -m "Campanas P1: builder de segmentos con conteo en vivo"
```

---

### Task 5: Verificación integral y cierre

- [ ] **Step 1: Suite completa + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde (115 tests previos + ~8 nuevos), tsc limpio.

- [ ] **Step 2: Verificar aislamiento de capas (regla del proyecto)**

Run: `grep -rn "from '../db\|from \"../db" app/core/ | grep -v test`
Expected: vacío (el core no importa DB; esta parte no tocó el core salvo nada).
Run: `grep -rn "better-sqlite3\|drizzle" app/campanas/`
Expected: vacío (la UI solo habla con actions que hablan con el Repository).

- [ ] **Step 3: Checkpoint de learning mode**

Sebastián explica de vuelta antes de seguir a la Parte 2: por qué `entre` valida `desde <= hasta` en el schema de dominio y no en el Repository, y por qué una empresa sin dato de usuarios queda fuera del rango en vez de adentro.

- [ ] **Step 4: Commit final si quedó algo suelto y actualizar bitácora**

```bash
git status
git add -A docs/
git commit -m "Campanas P1: cierre de parte 1 (segmento con tiers)"
```

---

## Fuera de alcance de esta parte (recordatorio)

- Revisión lead por lead (Parte 2), creación de campaña (Parte 3).
- Traducción de lenguaje natural a condiciones con Claude (post v1; la lista cerrada queda lista para eso).
- Editar o borrar segmentos guardados (YAGNI hasta que duela).
