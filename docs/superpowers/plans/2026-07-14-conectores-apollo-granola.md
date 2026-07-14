# Conectores: revelar credencial de Apollo + verificación real de Granola — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin puede revelar bajo demanda la credencial de un conector modo `admin` (ej.
Apollo) en vez de solo reemplazarla a ciegas. Granola deja de aceptar cualquier API key sin
verificar: al confirmar, trae la última llamada real del usuario para que la confirme antes de
quedar "Configurado"; un error interno real (no "llamada equivocada") avisa al admin por
WhatsApp.

**Architecture:** Las credenciales YA están cifradas en reposo y `leerCredencialConector` ya
las descifra — Pieza A es un server action admin-gated nuevo que expone eso bajo demanda, sin
tocar cifrado. Pieza B agrega una función de lectura nueva al adaptador de Granola (`ultimaNotaDe`,
reusa el mismo cliente HTTP que ya existe) y un server action que la llama después de guardar
la credencial tentativa. Pieza C es una función standalone reusable (`avisarAdminPorWhatsapp`)
que reusa el adaptador de Evolution que ya existe para envíos directos.

**Tech Stack:** TypeScript, Next.js server actions, node:test, fetch mockeado para Granola.

---

## Contexto real verificado

- `leerCredencialConector(proveedor, idUsuario?)` (`app/db/repository.ts:710`) ya descifra y
  devuelve el valor plano. `guardarCredencialConector` (línea 646) ya cifra al guardar. Cero
  cambios de cripto en este plan.
- `app/conectores/actions.ts` ya tiene el patrón `requireSession()` + `sesion.admin` para
  acciones admin-only (`agregarConectorAction`, `cambiarModoAction`, `quitarConectorAction`) —
  Pieza A sigue el mismo patrón exacto.
- `modoConector(proveedor)` (`app/db/repository.ts:757`) devuelve `'personal' | 'admin' | null`
  — Pieza A usa esto para rechazar revelar credenciales `personal` (son de otra persona).
- `app/adapters/granola.ts` ya tiene `llamarGranola<T>(path, apiKey)` (fetch genérico con auth
  Bearer, línea 78) y los tipos `NotaResumen`/`NotaDetalle`/`ListaNotas`. El comentario de
  `listarNotasEnVentana` (línea 113) confirma que `/v1/notes` devuelve **orden descendente por
  fecha** por default — `page_size=1` sin filtros de fecha trae la nota más reciente.
- Test de referencia para Granola: `app/adapters/granola.test.ts`, mockea `fetch` con
  `t.mock.method(globalThis, 'fetch', fetchFalso(...))`. Reusar ese patrón.
- `crearEvolutionAdapter()` (`app/adapters/evolution.ts:95`) expone `enviarPaso(referenciaProveedor,
  destinatario: DestinatarioEnvio, paso: PasoEnvio)` — ya usado para envíos directos sin
  campaña en `probarLineaAction` (`app/conectores/lineas-whatsapp-actions.ts:97`).
- `lineaWhatsappActiva()` (`app/db/repository.ts:3259`) resuelve la línea activa de pool para
  mandar la alerta — no hace falta la línea del owner (Pieza C no depende del Plan de gate de
  canal, son independientes).
- No existe hoy ninguna env var de número de admin. Se agrega `ADMIN_ALERTA_WHATSAPP_NUMERO`.

## File Structure

- Modify: `app/conectores/actions.ts` — `revelarCredencialAction`, `verificarGranolaAction`.
- Create: `app/conectores/actions.reveleryverificar.test.ts` — pruebas de las dos acciones
  nuevas (mockeando `leerCredencialConector`/`ultimaNotaDe` vía DB real de prueba, sin mockear
  `requireSession` — usar el patrón de sesión de otros tests de conectores si existe, o
  documentar el gap si las acciones de conectores no tienen tests hoy, ver Task 1 Step 1).
- Create: `app/conectores/RevelarCredencial.tsx` — botón + estado revelado.
- Modify: `app/conectores/ConectorRow.tsx` — montar `RevelarCredencial` junto a `CredencialForm`.
- Modify: `app/adapters/granola.ts` — nueva función `ultimaNotaDe`.
- Modify: `app/adapters/granola.test.ts` — pruebas de `ultimaNotaDe`.
- Create: `app/lib/alerta-admin.ts` — `avisarAdminPorWhatsapp`.
- Create: `app/lib/alerta-admin.test.ts`.
- Create: `app/conectores/VerificarGranola.tsx` — UI del flujo de confirmación.
- Modify: `app/conectores/ConectorRow.tsx` — montar `VerificarGranola` en vez de
  `CredencialForm` cuando `cat.id === 'granola'`.
- Modify: `.env.local.example` (si existe) o documentar `ADMIN_ALERTA_WHATSAPP_NUMERO` en el
  README de deploy.

---

### Task 1: Revelar credencial (Pieza A)

**Files:**
- Modify: `app/conectores/actions.ts`
- Test: `app/conectores/actions.revelar.test.ts`

- [ ] **Step 1: Confirmar si existen tests hoy para `app/conectores/actions.ts`**

Run: `find app/conectores -iname "actions*test*"`

Si no existe ninguno, es porque estas acciones dependen de `requireSession()` (better-auth con
DB real) y no se han probado con `node:test` hasta ahora — se prueban a mano en el navegador.
Este plan sigue esa misma convención: `revelarCredencialAction` se prueba a mano (Step 4), y el
test automatizado (Step 1-3 de abajo) cubre solo la lógica que SÍ se puede aislar sin sesión:
la decisión de "qué modo de conector se puede revelar", que vive en una función pura nueva.

- [ ] **Step 2: Write the failing test — función pura de autorización**

```ts
// app/conectores/politica.test.ts (agregar al archivo existente, no crear uno nuevo)
import { puedeRevelarCredencial } from './politica.ts';

test('puedeRevelarCredencial: admin puede revelar un conector modo admin', () => {
  assert.strictEqual(puedeRevelarCredencial('admin', true), true);
});

test('puedeRevelarCredencial: no-admin nunca puede revelar, ni siquiera un conector admin', () => {
  assert.strictEqual(puedeRevelarCredencial('admin', false), false);
});

test('puedeRevelarCredencial: ni un admin puede revelar un conector modo personal (es de otra persona)', () => {
  assert.strictEqual(puedeRevelarCredencial('personal', true), false);
});
```

(Revisar el archivo real `app/conectores/politica.test.ts` primero — si ya usa `import test from
'node:test'` y `import assert from 'node:assert/strict'` arriba, no los dupliques.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test app/conectores/politica.test.ts`
Expected: FAIL — `puedeRevelarCredencial` no existe en `politica.ts`

- [ ] **Step 4: Implementar la función pura**

Agregar a `app/conectores/politica.ts` (junto a `decidirGuardado`):

```ts
// Simetrico a decidirGuardado pero para LECTURA: revelar una credencial modo admin
// exige ser admin (igual que guardarla); una credencial modo personal nunca se
// revela por esta via, ni a un admin -- es la credencial de otra persona, no del
// equipo (2026-07-14, pedido de Sebastian: "que aparezcan las credenciales de
// Apollo", nunca las de Granola de alguien mas).
export function puedeRevelarCredencial(modo: ModoConector, esAdmin: boolean): boolean {
  return modo === 'admin' && esAdmin;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test app/conectores/politica.test.ts`
Expected: PASS (todas las pruebas del archivo, viejas + 3 nuevas)

- [ ] **Step 6: Server action**

Agregar a `app/conectores/actions.ts`:

```ts
import { leerCredencialConector } from "../db/repository";
import { puedeRevelarCredencial } from "./politica";

export type ResultadoRevelar = { ok: true; credencial: string } | { ok: false; error: string };

// Bajo demanda: la pagina NUNCA trae el valor en el HTML inicial (page.tsx no llama
// leerCredencialConector). Solo esta accion, invocada por un clic explicito del
// admin, lo descifra y lo manda al cliente -- reduce la ventana de exposicion frente
// a mostrarlo siempre.
export async function revelarCredencialAction(proveedor: string): Promise<ResultadoRevelar> {
  const sesion = await requireSession();
  const modo = modoConector(proveedor);
  if (!modo) return { ok: false, error: "Este conector no está habilitado." };
  if (!puedeRevelarCredencial(modo, sesion.admin)) return { ok: false, error: "No podés revelar esta credencial." };

  const credencial = leerCredencialConector(proveedor);
  if (!credencial) return { ok: false, error: "No hay ninguna credencial guardada todavía." };
  return { ok: true, credencial };
}
```

- [ ] **Step 7: Componente cliente**

```tsx
// app/conectores/RevelarCredencial.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/Button";
import { revelarCredencialAction } from "./actions";

export function RevelarCredencial({ proveedor }: { proveedor: string }) {
  const [valor, setValor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  function revelar() {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await revelarCredencialAction(proveedor);
      if (resultado.ok) setValor(resultado.credencial);
      else setError(resultado.error);
    });
  }

  if (valor !== null) {
    return (
      <div className="mt-2 max-w-sm">
        <code className="block break-all rounded-lg border border-line bg-surface px-3 py-2.5 font-mono-tag text-xs text-ink">
          {valor}
        </code>
        <button type="button" onClick={() => setValor(null)} className="mt-1 text-xs text-muted underline">
          Ocultar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <Button type="button" variant="quiet" onClick={revelar} disabled={pendiente}>
        {pendiente ? "Revelando..." : "Revelar"}
      </Button>
      {error && <p className="mt-1 text-xs text-overdue">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 8: Montar en `ConectorRow.tsx`**

En `app/conectores/ConectorRow.tsx`, importar `RevelarCredencial` y montarlo justo debajo del
bloque `{puedeEditar ? <CredencialForm ... /> : ...}` (línea 66-72), solo para admin:

```tsx
import { RevelarCredencial } from "./RevelarCredencial";

// dentro del JSX, despues del bloque puedeEditar/CredencialForm existente:
{esAdmin && estado.tieneCredencial && <RevelarCredencial proveedor={cat.id} />}
```

- [ ] **Step 9: Verificación manual**

1. Loguearse como admin, ir a `/conectores`, fila de Apollo (o Notion — cualquier conector
   modo `admin` con credencial ya guardada).
2. Clic en "Revelar" → debe mostrar el valor real guardado.
3. Clic en "Ocultar" → debe desaparecer (sin volver a pedirlo hasta el próximo clic en
   "Revelar").
4. Loguearse como NO admin → no debe verse ningún botón "Revelar".
5. Probar contra un conector modo `personal` (ej. Granola de otro usuario, si lo hay) — no
   debe aparecer el botón "Revelar" ahí ni para el admin (Granola usa `VerificarGranola` en vez
   de `CredencialForm`/`RevelarCredencial`, ver Task 3).

- [ ] **Step 10: Commit**

```bash
git add app/conectores/politica.ts app/conectores/politica.test.ts app/conectores/actions.ts \
  app/conectores/RevelarCredencial.tsx app/conectores/ConectorRow.tsx
git commit -m "feat(conectores): admin puede revelar bajo demanda la credencial de un conector de equipo"
```

---

### Task 2: `ultimaNotaDe` en el adaptador de Granola

**Files:**
- Modify: `app/adapters/granola.ts`
- Modify: `app/adapters/granola.test.ts`

- [ ] **Step 1: Write the failing test**

Agregar a `app/adapters/granola.test.ts` (reusa `fetchFalso` ya definido en el archivo):

```ts
test('ultimaNotaDe: trae la nota mas reciente (page_size=1, sin filtro de fecha) con resumen recortado', async (t) => {
  const notes = [{ id: 'n-ultima', title: 'Cliente X - Llamada', created_at: '2026-07-14T09:00:00.000Z' }];
  const detalles = {
    'n-ultima': {
      id: 'n-ultima',
      title: 'Cliente X - Llamada',
      created_at: '2026-07-14T09:00:00.000Z',
      summary_text: 'a'.repeat(300),
      web_url: 'https://notes.granola.ai/d/n-ultima',
    },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  const nota = await ultimaNotaDe('user-sebastian');

  assert.ok(nota);
  assert.strictEqual(nota!.id, 'n-ultima');
  assert.strictEqual(nota!.titulo, 'Cliente X - Llamada');
  assert.strictEqual(nota!.fecha, '2026-07-14T09:00:00.000Z');
  assert.strictEqual(nota!.resumenCorto!.length, 200);
});

test('ultimaNotaDe: devuelve null si el usuario no tiene ninguna llamada grabada', async (t) => {
  t.mock.method(globalThis, 'fetch', fetchFalso([], {}));
  const nota = await ultimaNotaDe('user-sebastian');
  assert.strictEqual(nota, null);
});

test('ultimaNotaDe: lanza si no hay credencial guardada para ese usuario', async () => {
  await assert.rejects(() => ultimaNotaDe('user-sin-credencial'), /No hay credencial de Granola/);
});
```

Actualizar el import de la primera línea de imports desde `./granola.ts` para incluir
`ultimaNotaDe`:

```ts
const { crearGranolaAdapter, ultimaNotaDe } = await import('./granola.ts');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/adapters/granola.test.ts`
Expected: FAIL — `ultimaNotaDe` no es un export de `granola.ts`

- [ ] **Step 3: Write minimal implementation**

Agregar a `app/adapters/granola.ts`, después de `crearGranolaAdapter`:

```ts
// Verificacion de conector (2026-07-14): a diferencia de buscarCandidatas (busca por
// terminos dentro de una ventana), esto solo quiere "la ultima llamada, la que sea"
// para que el usuario confirme visualmente que su API key trae SUS llamadas de
// verdad. page_size=1 sin created_after/before: /v1/notes ya devuelve orden
// descendente por fecha por default (confirmado en listarNotasEnVentana arriba).
export async function ultimaNotaDe(idUsuario: string): Promise<{
  id: string;
  titulo: string | null;
  fecha: string;
  resumenCorto: string | null;
} | null> {
  const apiKey = leerCredencialConector('granola', idUsuario);
  if (!apiKey) throw new Error(`No hay credencial de Granola configurada para el usuario ${idUsuario}`);

  const lista = await llamarGranola<ListaNotas>(`/v1/notes?page_size=1`, apiKey);
  const resumen = lista.notes[0];
  if (!resumen) return null;

  const detalle = await llamarGranola<NotaDetalle>(`/v1/notes/${resumen.id}`, apiKey);
  return {
    id: detalle.id,
    titulo: detalle.title ?? null,
    fecha: detalle.created_at,
    resumenCorto: detalle.summary_text ? detalle.summary_text.slice(0, 200) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/adapters/granola.test.ts`
Expected: PASS (todas, viejas + 3 nuevas)

- [ ] **Step 5: Commit**

```bash
git add app/adapters/granola.ts app/adapters/granola.test.ts
git commit -m "feat(granola): ultimaNotaDe trae la llamada mas reciente para verificar el conector"
```

---

### Task 3: Alerta al admin por WhatsApp (Pieza C)

**Files:**
- Create: `app/lib/alerta-admin.ts`
- Create: `app/lib/alerta-admin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/alerta-admin.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('avisarAdminPorWhatsapp: sin ADMIN_ALERTA_WHATSAPP_NUMERO configurada, no lanza y no llama al adaptador', async (t) => {
  delete process.env.ADMIN_ALERTA_WHATSAPP_NUMERO;
  const { avisarAdminPorWhatsapp } = await import('./alerta-admin.ts?sin-env');
  await assert.doesNotReject(() => avisarAdminPorWhatsapp('mensaje de prueba'));
});

test('avisarAdminPorWhatsapp: con env configurada y linea activa, llama enviarPaso con el numero y mensaje correctos', async (t) => {
  process.env.ADMIN_ALERTA_WHATSAPP_NUMERO = '573001234567';
  const llamadas: unknown[] = [];

  t.mock.module('../db/repository.ts', {
    namedExports: { lineaWhatsappActiva: () => ({ referenciaProveedor: 'linea-admin-test' }) },
  });
  t.mock.module('../adapters/evolution.ts', {
    namedExports: {
      crearEvolutionAdapter: () => ({
        enviarPaso: async (referenciaProveedor: string, destinatario: unknown, paso: unknown) => {
          llamadas.push({ referenciaProveedor, destinatario, paso });
          return { proveedor: 'evolution', proveedorMensajeId: 'msg-alerta-1' };
        },
      }),
    },
  });

  const { avisarAdminPorWhatsapp } = await import('./alerta-admin.ts?con-env');
  await avisarAdminPorWhatsapp('Felipe tuvo un error configurando Granola: timeout');

  assert.strictEqual(llamadas.length, 1);
  const llamada = llamadas[0] as { referenciaProveedor: string; destinatario: { telefono: string }; paso: { cuerpo: string } };
  assert.strictEqual(llamada.referenciaProveedor, 'linea-admin-test');
  assert.strictEqual(llamada.destinatario.telefono, '573001234567');
  assert.strictEqual(llamada.paso.cuerpo, 'Felipe tuvo un error configurando Granola: timeout');
});

test('avisarAdminPorWhatsapp: si enviarPaso falla, no propaga la excepcion', async (t) => {
  process.env.ADMIN_ALERTA_WHATSAPP_NUMERO = '573001234567';
  t.mock.module('../db/repository.ts', {
    namedExports: { lineaWhatsappActiva: () => ({ referenciaProveedor: 'linea-admin-test' }) },
  });
  t.mock.module('../adapters/evolution.ts', {
    namedExports: {
      crearEvolutionAdapter: () => ({
        enviarPaso: async () => {
          throw new Error('Evolution caido');
        },
      }),
    },
  });

  const { avisarAdminPorWhatsapp } = await import('./alerta-admin.ts?enviar-falla');
  await assert.doesNotReject(() => avisarAdminPorWhatsapp('mensaje que no debe tumbar nada'));
});
```

Nota: `t.mock.module` con query strings distintas (`?sin-env`, `?con-env`, `?enviar-falla`)
fuerza a Node a tratarlos como módulos separados para que el mock de un test no contamine el
siguiente — verificar contra la versión de Node del proyecto (`node --version`) que
`--experimental-test-module-mocks` esté disponible/habilitado (revisar `package.json` →
`scripts.test`, si otros archivos del repo ya usan `t.mock.module` copiar esa configuración
exacta; si ninguno lo usa todavía, buscar cómo otros tests mockean un módulo entero — grep
`mock.module` en el repo antes de asumir que funciona sin flags).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/lib/alerta-admin.test.ts`
Expected: FAIL — el archivo `alerta-admin.ts` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lib/alerta-admin.ts
import { lineaWhatsappActiva } from '../db/repository';
import { crearEvolutionAdapter } from '../adapters/evolution';

// Reusable (2026-07-14, nacio para el flujo de verificacion de Granola): cualquier
// error interno real de un conector personal -- no "credencial invalida" (eso ya lo
// ve el usuario), sino un fallo inesperado -- avisa al admin por WhatsApp usando la
// linea activa existente. Best-effort a proposito: la alerta en si NUNCA debe tumbar
// el flujo del usuario que la disparo.
export async function avisarAdminPorWhatsapp(mensaje: string): Promise<void> {
  const numero = process.env.ADMIN_ALERTA_WHATSAPP_NUMERO;
  if (!numero) {
    console.error('avisarAdminPorWhatsapp: ADMIN_ALERTA_WHATSAPP_NUMERO no configurada, alerta no enviada:', mensaje);
    return;
  }

  const linea = lineaWhatsappActiva();
  if (!linea) {
    console.error('avisarAdminPorWhatsapp: no hay ninguna linea de WhatsApp activa, alerta no enviada:', mensaje);
    return;
  }

  try {
    const adapter = crearEvolutionAdapter();
    await adapter.enviarPaso(
      linea.referenciaProveedor,
      { telefono: numero, email: null, nombre: null, empresa: null, cargo: null },
      { asunto: null, cuerpo: mensaje, canal: 'whatsapp' },
    );
  } catch (e) {
    console.error('avisarAdminPorWhatsapp: fallo el envio de la alerta:', e instanceof Error ? e.message : e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/lib/alerta-admin.test.ts`
Expected: PASS (3 tests). Si `t.mock.module` no está disponible en la versión de Node del
proyecto, alternativa: extraer las dependencias (`lineaWhatsappActiva`, `crearEvolutionAdapter`)
como parámetros inyectables de una función interna (`avisarAdminPorWhatsappConDeps(mensaje,
deps)`) y que `avisarAdminPorWhatsapp` sea un wrapper de conveniencia — mismo patrón que
`PushDeps` en `app/core/push.ts`. Documentar cuál de las dos formas se usó al final de este
task.

- [ ] **Step 5: Commit**

```bash
git add app/lib/alerta-admin.ts app/lib/alerta-admin.test.ts
git commit -m "feat: avisarAdminPorWhatsapp, alerta reusable para errores internos de conectores"
```

---

### Task 4: Flujo de verificación de Granola (server action + UI)

**Files:**
- Modify: `app/conectores/actions.ts`
- Modify: `app/conectores/ConectorRow.tsx`
- Create: `app/conectores/VerificarGranola.tsx`

- [ ] **Step 1: Server action**

Agregar a `app/conectores/actions.ts`:

```ts
import { ultimaNotaDe } from "../adapters/granola";
import { avisarAdminPorWhatsapp } from "../lib/alerta-admin";

export type ResultadoVerificacionGranola =
  | { ok: true; nota: { titulo: string | null; fecha: string; resumenCorto: string | null } }
  | { ok: false; error: "sin_llamadas" | "error_interno" };

// Guarda la credencial (personal, del usuario en sesion) y de una trae su ultima
// llamada real para que la confirme -- a diferencia de guardarCredencialAction (que
// solo guarda a ciegas), esto es lo que Sebastian pidio para Granola especificamente
// (2026-07-14): "estas es tu ultima llamada, este es el transcript correcto".
export async function verificarGranolaAction(credencial: string): Promise<ResultadoVerificacionGranola> {
  const sesion = await requireSession();
  guardarCredencialConector("granola", credencial, sesion.id);

  try {
    const nota = await ultimaNotaDe(sesion.id);
    if (!nota) return { ok: false, error: "sin_llamadas" };
    return { ok: true, nota: { titulo: nota.titulo, fecha: nota.fecha, resumenCorto: nota.resumenCorto } };
  } catch (e) {
    await avisarAdminPorWhatsapp(
      `${sesion.owner} intentó configurar Granola y tuvo un error: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { ok: false, error: "error_interno" };
  }
}
```

- [ ] **Step 2: Componente cliente**

```tsx
// app/conectores/VerificarGranola.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/Button";
import { verificarGranolaAction, type ResultadoVerificacionGranola } from "./actions";

const MENSAJE_ERROR: Record<"sin_llamadas" | "error_interno", string> = {
  sin_llamadas: "Todavía no tienes ninguna llamada grabada en Granola. Cuando tengas una, vuelve a intentar.",
  error_interno: "Hubo un error, ya le avisamos al admin para que lo revise.",
};

export function VerificarGranola({ tieneCredencial }: { tieneCredencial: boolean }) {
  const [credencial, setCredencial] = useState("");
  const [resultado, setResultado] = useState<ResultadoVerificacionGranola | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [pendiente, iniciarTransicion] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!credencial.trim()) return;
    iniciarTransicion(async () => {
      const r = await verificarGranolaAction(credencial.trim());
      setResultado(r);
      setConfirmado(false);
    });
  }

  if (resultado?.ok && !confirmado) {
    return (
      <div className="max-w-sm rounded-lg border border-line bg-surface p-4 text-sm">
        <p className="mb-1 text-xs uppercase tracking-widest text-muted">Tu última llamada</p>
        <p className="font-medium text-ink">{resultado.nota.titulo ?? "(sin título)"}</p>
        <p className="mb-2 text-xs text-muted">{resultado.nota.fecha.slice(0, 16).replace("T", " ")}</p>
        {resultado.nota.resumenCorto && <p className="mb-3 text-muted">{resultado.nota.resumenCorto}…</p>}
        <div className="flex gap-2">
          <Button type="button" onClick={() => setConfirmado(true)}>Sí, es la mía</Button>
          <Button type="button" variant="quiet" onClick={() => setResultado(null)}>No es la mía</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm">
      <form onSubmit={enviar} className="flex items-center gap-2">
        <input
          value={credencial}
          onChange={(e) => setCredencial(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder={tieneCredencial || confirmado ? "Reemplazar credencial" : "Pega tu credencial"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 font-mono-tag text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={pendiente}>{pendiente ? "Verificando..." : "Confirmar"}</Button>
      </form>
      {resultado && !resultado.ok && <p className="mt-2 text-xs text-overdue">{MENSAJE_ERROR[resultado.error]}</p>}
      {confirmado && <p className="mt-2 text-xs text-done">Configurado.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Montar en `ConectorRow.tsx`**

Reemplazar, en `app/conectores/ConectorRow.tsx`, el bloque `{puedeEditar ? <CredencialForm .../>
: ...}` (línea 66-72) para que Granola use `VerificarGranola` en vez de `CredencialForm`:

```tsx
import { VerificarGranola } from "./VerificarGranola";

// en el JSX, reemplazando el bloque puedeEditar existente:
{cat.id === "granola" ? (
  <VerificarGranola tieneCredencial={estado.tieneCredencial} />
) : puedeEditar ? (
  <CredencialForm proveedor={cat.id} tieneCredencial={estado.tieneCredencial} />
) : cat.id !== "whatsapp" ? (
  <p className="max-w-sm rounded-lg border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
    Solo un admin puede configurar esta conexión. Si algo no llega, avísale a tu admin.
  </p>
) : null}
```

- [ ] **Step 4: Configurar la env var**

Agregar `ADMIN_ALERTA_WHATSAPP_NUMERO=` al archivo de ejemplo de env vars del proyecto (buscar
`find . -maxdepth 1 -iname ".env*example*"` — si existe, agregar la línea con un comentario;
si no existe ningún archivo de ejemplo, anotar la variable en el README de deploy o en
`planning/plan-deploy-vps.md`). En producción, setearla en el `docker-compose.production.yml`
o en el `.env` real del VPS con el número de WhatsApp de Sebastián.

- [ ] **Step 5: Verificación manual**

1. Loguearse con un usuario sin Granola configurado, ir a `/conectores`, pegar una API key
   VÁLIDA (de una cuenta con al menos una llamada grabada) → debe mostrar título/fecha/resumen
   de la última llamada real.
2. Clic "Sí, es la mía" → debe quedar "Configurado" (recargar la página y confirmar el status).
3. Pegar una API key inválida o forzar un error (ej. apagar la red un instante) → debe mostrar
   "Hubo un error..." y el número configurado en `ADMIN_ALERTA_WHATSAPP_NUMERO` debe recibir el
   WhatsApp de alerta.
4. Con una cuenta de Granola sin ninguna llamada grabada → debe mostrar el mensaje de
   `sin_llamadas`.

- [ ] **Step 6: Commit**

```bash
git add app/conectores/actions.ts app/conectores/VerificarGranola.tsx app/conectores/ConectorRow.tsx
git commit -m "feat(conectores): verificacion real de Granola contra la ultima llamada + alerta al admin"
```

---

### Task 5: Suite completa + typecheck

- [ ] **Step 1: Correr toda la suite**

Run: `npm test`
Expected: 0 fallos.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Self-Review (hecho por quien escribió este plan)

- **Cobertura del spec**: Pieza A (revelar Apollo) → Task 1. Pieza B (verificación Granola) →
  Tasks 2 y 4. Pieza C (alerta admin) → Task 3, consumida por Task 4.
- **Riesgo señalado explícitamente**: `t.mock.module` (Task 3) puede no estar disponible según
  la versión de Node del proyecto — se dejó una alternativa concreta (inyección de
  dependencias estilo `PushDeps`) en vez de asumir que el mock de módulo funciona sin
  verificar primero.
- **Fuera de alcance repetido del spec**: no se construye "llamada de prueba en vivo" ni manejo
  especial de "no es mi llamada" (el botón "No es la mía" solo limpia el resultado para
  reintentar, no hay flujo guiado ni tercer estado en el conector).
- **Sin placeholders**: todos los pasos de código tienen implementación completa.
