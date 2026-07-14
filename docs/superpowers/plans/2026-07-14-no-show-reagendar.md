# "No llegó" — no-show de reunión y redefinición de Reagendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking.
>
> **Alcance: SOLO local.** No toca el VPS. Corrige `colaCierres`/`colaReagendar` (implementadas
> en el plan anterior con una definición de Reagendar que Sebastián corrigió al revisar el
> resultado) y agrega el mecanismo de captura de "no llegó a la reunión".

**Goal:** Que "Reagendar" deje de ser `on_hold` y pase a ser lo que Sebastián pidió: cuentas en
`reunion_agendada` cuya reunión no se dio, capturado con un 5º resultado de toque (`no_llego`)
sin agregar ninguna columna nueva — se deriva del último toque de la empresa.

**Architecture:** `no_llego` se suma a `RESULTADOS` (dominio existente en `validation.ts`).
`colaCierres`/`colaReagendar` ganan una subquery correlacionada que lee el resultado del último
toque de cada empresa. La UI de captura (`CapturaLlamada.tsx`) ofrece el botón nuevo solo cuando
la empresa está en `reunion_agendada`, reusando el bloque "Próximo toque" que ya existe para
capturar la fecha de reintento — sin pantalla nueva.

**Tech Stack:** Next.js + TypeScript, Drizzle ORM sobre SQLite, `node:test` nativo.

---

## Contexto verificado (no repetir investigación)

- `RESULTADOS` vive en `app/db/validation.ts:33-38` (4 valores hoy). `RESULTADO_LABELS` es un
  `Record<Resultado, string>` (TS obliga a completarlo si se agrega un valor al union — no hay
  forma de olvidar el label). `RESULTADOS_CONTESTO` (línea ~53) decide si se busca transcript en
  Granola y si se piden datos de cuenta; **no_llego no entra ahí**.
- `registrarToqueSchema` (`resultado: z.enum(RESULTADOS)`) hereda el valor nuevo automáticamente,
  sin tocarlo. `razonPerdida` obligatoria sigue atada solo a `contesto_no`, sin cambios.
- `colaCierres`/`colaReagendar` en `app/db/repository.ts:216-251` (implementadas en el plan
  anterior). `columnasCola` (línea ~151) es el shape compartido. `toque` ya está importado en el
  archivo (se usa en `registrarToque`).
- `CapturaLlamada.tsx` (`app/llamada/[id]/CapturaLlamada.tsx`): `OUTCOMES` se arma de `RESULTADOS`
  sin filtrar por estado (línea 10). El bloque "Tu resumen" se esconde con `outcome !==
  "no_contesto"` (línea 84) — mismo patrón a extender para `no_llego`. El bloque "Próximo toque"
  (línea ~204-229, chips +1d/+3d/+1sem + date picker) ya existe y aplica a cualquier `outcome`
  no vacío — no hace falta UI nueva para "¿cuándo reagendar?".
- `CapturaLlamada` no recibe hoy el `estado` de la empresa. La cadena para pasarlo:
  `LlamadaCard.tsx` (ya tiene `emp.estado` desestructurado de `ctx`, línea ~57) →
  `RegistrarToqueToggle.tsx` (`app/llamada/[id]/RegistrarToqueToggle.tsx`) → `CapturaLlamada`.
- `app/cola/page.tsx` llama hoy `colaReagendar(owner, usuario.idOrganizacion)` (2 argumentos) y
  mapea `cierres`/`reagendar` con `filaSinVencimiento` (sin noción de vencido). Cambia a 3
  argumentos (`hoy` primero) y a la misma lógica de vencido que Leads.
- Tabla `toque`: `fuente TEXT NOT NULL`, `id_organizacion INTEGER NOT NULL DEFAULT 1` — un
  INSERT de prueba solo necesita `id_empresa`, `resultado`, `fuente`.
- Comando de test dirigido: `node --experimental-strip-types --experimental-loader
  ./scripts/resolve-ts-ext.mjs --test <archivo>`. Suite completa: `npm test`. Typecheck: `npx tsc
  --noEmit`.

## File Structure

**Modificar:**
- `app/db/validation.ts` — agregar `'no_llego'` a `RESULTADOS` + su label.
- `app/db/validation.test.ts` — pruebas del nuevo valor.
- `app/db/repository.ts` — subquery `ultimoResultadoNoLlego`; reescribir `colaReagendar`;
  ajustar `colaCierres`.
- `app/db/repository.colaSplit.test.ts` — reescribir el test de `colaReagendar`; agregar caso a
  `colaCierres`.
- `app/cola/agenda.ts` — mover `diasVencido` aquí; agregar `filaConVencimiento`.
- `app/cola/agenda.test.ts` — pruebas de `filaConVencimiento`.
- `app/cola/page.tsx` — usar `diasVencido`/`filaConVencimiento` de `agenda.ts`; llamar
  `colaReagendar` con `hoy`; mapear `filasReagendar` con vencido en vez de sin-vencimiento.
- `app/llamada/[id]/LlamadaCard.tsx` — pasar `estado` a `RegistrarToqueToggle`.
- `app/llamada/[id]/RegistrarToqueToggle.tsx` — aceptar y reenviar `estado`.
- `app/llamada/[id]/CapturaLlamada.tsx` — aceptar `estado`; filtrar `OUTCOMES`; esconder el
  bloque de resumen también para `no_llego`.

---

## Task 1: `no_llego` en el dominio de resultados (TDD)

**Files:**
- Modify: `app/db/validation.ts:33-47`
- Modify: `app/db/validation.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `app/db/validation.test.ts`:

```ts
import { RESULTADOS, RESULTADO_LABELS, RESULTADOS_CONTESTO, registrarToqueSchema } from './validation.ts';

test('no_llego es un resultado valido, con label, y no dispara busqueda de transcript', () => {
  assert.ok(RESULTADOS.includes('no_llego'));
  assert.equal(RESULTADO_LABELS.no_llego, 'No llegó a la reunión');
  assert.ok(!RESULTADOS_CONTESTO.includes('no_llego'));
});

test('registrarToqueSchema acepta no_llego sin exigir razonPerdida', () => {
  const r = registrarToqueSchema.safeParse({ idEmpresa: 'e1', canal: 'llamada', resultado: 'no_llego' });
  assert.equal(r.success, true);
});
```

(El archivo ya importa `test`/`assert` arriba — agregar el import de `validation.ts` junto a los
otros dos que ya existen ahí, o reusar el que ya esté si el archivo importa desde el mismo path.)

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/validation.test.ts`
Expected: FAIL — `RESULTADO_LABELS.no_llego` es `undefined` (o error de TS si compila estricto).

- [ ] **Step 3: Agregar el valor y su label**

En `app/db/validation.ts`, cambiar:

```ts
export const RESULTADOS = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'no_contesto',
] as const;
```

por:

```ts
export const RESULTADOS = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'no_contesto',
  // No-show de una reunion ya agendada (2026-07-14): distinto a las 4 salidas de arriba,
  // que son intentos de CONTACTO. Esta es el desenlace de algo que ya estaba en el
  // calendario. A proposito NO entra a RESULTADOS_CONTESTO -- no hubo conversacion, nada
  // que buscar en Granola ni que calificar.
  'no_llego',
] as const;
```

Y en `RESULTADO_LABELS`:

```ts
export const RESULTADO_LABELS: Record<Resultado, string> = {
  contesto_reunion: 'Reunión agendada',
  contesto_sigue_seguimiento: 'Sigue en follow-up',
  contesto_no: 'No sigue',
  no_contesto: 'No contestó',
  no_llego: 'No llegó a la reunión',
};
```

(No tocar `RESULTADOS_CONTESTO`: se queda con los 3 valores actuales.)

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add app/db/validation.ts app/db/validation.test.ts
git commit -m "feat(toque): agrega resultado no_llego (no-show de reunion agendada)"
```

---

## Task 2: `colaReagendar` deriva de no-show, no de `on_hold` (TDD)

**Files:**
- Modify: `app/db/repository.ts:151, 233-251`
- Modify: `app/db/repository.colaSplit.test.ts`

- [ ] **Step 1: Agregar el helper de seed de toque y reescribir el test que falla**

En `app/db/repository.colaSplit.test.ts`, agregar después de `seedEmpresa`:

```ts
function seedToque(idEmpresa: string, resultado: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO toque (id_empresa, resultado, fuente) VALUES (?, ?, 'cockpit')`).run(idEmpresa, resultado);
  raw.close();
}
```

Reemplazar el test `'colaReagendar: solo on_hold del owner, con y sin fecha'` completo por:

```ts
test('colaReagendar: reunion_agendada cuyo ultimo toque fue no_llego, vencido o de hoy', () => {
  seedEmpresa('r1', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r1', 'no_llego'); // vencido + no_llego: entra

  seedEmpresa('r2', OWNER, 'reunion_agendada', '2026-07-14');
  seedToque('r2', 'no_llego'); // hoy + no_llego: entra

  seedEmpresa('r3', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r3', 'contesto_reunion'); // vencido pero ultimo resultado NO es no_llego: no entra

  seedEmpresa('r4', OWNER, 'reunion_agendada', '2026-07-10'); // sin ningun toque: no entra
  seedEmpresa('r5', OWNER, 'oportunidad', '2026-07-10');
  seedToque('r5', 'no_llego'); // no_llego pero no es reunion_agendada: no entra

  seedEmpresa('r6', OWNER, 'reunion_agendada', '2026-07-20');
  seedToque('r6', 'no_llego'); // no_llego pero fecha futura: no entra

  seedEmpresa('r7', OTRO_OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r7', 'no_llego'); // otro owner: no entra

  // r8: dos toques, el mas reciente NO es no_llego -- se reagendo con exito, ya no cuenta.
  seedEmpresa('r8', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r8', 'no_llego');
  seedToque('r8', 'contesto_reunion');

  const r = colaReagendar('2026-07-14', OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['r1', 'r2']);
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: FAIL — la firma actual de `colaReagendar` toma 2 argumentos (`owner, idOrganizacion`),
no 3, y la lógica sigue siendo `on_hold`.

- [ ] **Step 3: Agregar la subquery compartida y reescribir `colaReagendar`**

En `app/db/repository.ts`, justo antes de `export function colaLeads` (después de `columnasCola`,
línea ~151), agregar:

```ts
// Deriva si el ULTIMO toque de una empresa fue "no_llego" (no-show de reunion), sin
// columna nueva -- mismo principio que el resto del split (fase derivada, nunca un flag
// que se pueda desincronizar). El COALESCE importa: una empresa sin ningun toque da NULL
// en la subquery, y "NULL = 'no_llego'" es NULL (ni true ni false) -- sin el COALESCE, un
// NOT(...) sobre eso la excluiria de colaCierres por error.
const ultimoResultadoNoLlego = sql`COALESCE((SELECT ${toque.resultado} FROM ${toque} WHERE ${toque.idEmpresa} = ${empresa.idEmpresa} ORDER BY ${toque.idToque} DESC LIMIT 1), '') = 'no_llego'`;
```

Reemplazar la función `colaReagendar` completa por:

```ts
// Bucket "Reagendar" del split de cola (2026-07-14, v3): reunion_agendada cuyo ULTIMO toque
// fue no-show (no_llego). Es un follow-up real con fecha (vencido-o-hoy), igual que
// colaLeads -- no una lista fija. on_hold NO es Reagendar (ver spec): eso queda fuera del
// split.
export function colaReagendar(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, 'reunion_agendada'),
        ultimoResultadoNoLlego,
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
      ),
    )
    .orderBy(empresa.proximoFollowUpFecha)
    .all();
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: el test de `colaReagendar` en PASS; el de `colaCierres` puede seguir en verde (todavía
no se toca en este paso) — confirmar que ningún otro test del archivo se rompió.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.colaSplit.test.ts
git commit -m "fix(cola): colaReagendar deriva de no-show (ultimo toque), no de on_hold"
```

---

## Task 3: `colaCierres` excluye la `reunion_agendada` con no-show pendiente (TDD)

**Files:**
- Modify: `app/db/repository.ts:216-231`
- Modify: `app/db/repository.colaSplit.test.ts`

- [ ] **Step 1: Agregar el caso que falla al test existente de `colaCierres`**

Reemplazar el test `'colaCierres: estados calientes del owner, con y sin fecha, sin nocion de vencido'`
por (agrega dos filas nuevas, `c6` y `c7`, y ajusta el `assert`):

```ts
test('colaCierres: estados calientes del owner, con y sin fecha, sin nocion de vencido', () => {
  seedEmpresa('c1', OWNER, 'oportunidad', '2026-07-10'); // vencido segun fecha: igual entra
  seedEmpresa('c2', OWNER, 'cierre_documentacion', null); // sin fecha: igual entra
  seedEmpresa('c3', OWNER, 'reunion_agendada', '2026-08-01'); // futuro, sin toque: igual entra
  seedEmpresa('c4', OWNER, 'lead', '2026-07-10'); // no es estado caliente: no entra
  seedEmpresa('c5', OTRO_OWNER, 'oportunidad', '2026-07-10'); // otro owner: no entra

  seedEmpresa('c6', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('c6', 'no_llego'); // no-show pendiente: se va a Reagendar, no entra aqui

  seedEmpresa('c7', OWNER, 'oportunidad', '2026-07-10');
  seedToque('c7', 'no_llego'); // no_llego pero NO es reunion_agendada: si entra (la exclusion es solo para reunion_agendada)

  const r = colaCierres(OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['c1', 'c2', 'c3', 'c7']);
});
```

(Este test usa `seedToque`, agregado en la Task 2 — ya está disponible en el archivo.)

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: FAIL en `colaCierres` — hoy incluye `c6` (todavía no excluye no-shows).

- [ ] **Step 3: Agregar la exclusión en `colaCierres`**

En `app/db/repository.ts`, dentro de `colaCierres`, cambiar el `.where(...)`:

```ts
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        eq(empresa.owner, owner),
        inArray(empresa.estadoNotion, [...ESTADOS_CALIENTES]),
      ),
    )
```

por:

```ts
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        eq(empresa.owner, owner),
        inArray(empresa.estadoNotion, [...ESTADOS_CALIENTES]),
        // La reunion_agendada con no-show pendiente se muestra en Reagendar, no aqui.
        sql`NOT (${empresa.estadoNotion} = 'reunion_agendada' AND ${ultimoResultadoNoLlego})`,
      ),
    )
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.colaSplit.test.ts`
Expected: PASS (los 3 tests del archivo).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.colaSplit.test.ts
git commit -m "fix(cola): colaCierres excluye reunion_agendada con no-show pendiente"
```

---

## Task 4: `filaConVencimiento` — mover `diasVencido` a `agenda.ts` y agregar el helper (TDD)

**Files:**
- Modify: `app/cola/agenda.ts`
- Modify: `app/cola/agenda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `app/cola/agenda.test.ts` (junto al `import` existente, agregar `diasVencido,
filaConVencimiento`):

```ts
import { filtrarPorCanal, conteosPorCanal, filaSinVencimiento, diasVencido, filaConVencimiento, type FilaAgenda, type FilaCola } from './agenda.ts';
```

Y al final del archivo:

```ts
test('diasVencido: dias de diferencia entre dos fechas ISO', () => {
  assert.equal(diasVencido('2026-07-10', '2026-07-14'), 4);
  assert.equal(diasVencido('2026-07-14', '2026-07-14'), 0);
});

test('filaConVencimiento: vencida dice "vencido Nd", de hoy dice "hoy"', () => {
  const vencida = filaConVencimiento(filaColaBase('v1', '2026-07-10'), '2026-07-14', false);
  assert.equal(vencida.sev, 'overdue');
  assert.equal(vencida.severidadTexto, 'vencido 4d');

  const deHoy = filaConVencimiento(filaColaBase('v2', '2026-07-14'), '2026-07-14', true);
  assert.equal(deHoy.sev, 'today');
  assert.equal(deHoy.severidadTexto, 'hoy');
  assert.equal(deHoy.actual, true);
});
```

(Reusa `filaColaBase`, ya definida en este archivo por la Task 5 del plan anterior.)

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: FAIL — `diasVencido`/`filaConVencimiento` no existen en `agenda.ts` todavía.

- [ ] **Step 3: Implementar en `agenda.ts`**

Agregar al final de `app/cola/agenda.ts`:

```ts
// Dias de diferencia entre una fecha de follow-up y hoy (ambas ISO yyyy-mm-dd). Positivo =
// vencida, 0 = hoy. Vivia duplicada como funcion local de app/cola/page.tsx; se centraliza
// aca para que Leads y Reagendar (ambos date-driven) compartan el mismo calculo.
export function diasVencido(fechaISO: string, hoyISO: string): number {
  return Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / 86400000);
}

// Fila con noción de vencido: usada por Leads y Reagendar (ambas son follow-ups reales con
// fecha). Distinta de filaSinVencimiento (Cierres), que no tiene ese concepto.
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
    sev: dias > 0 ? 'overdue' : 'today',
    severidadTexto: dias > 0 ? `vencido ${dias}d` : 'hoy',
    actual,
  };
}
```

- [ ] **Step 4: Correr el test**

Run: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/cola/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cola/agenda.ts app/cola/agenda.test.ts
git commit -m "feat(cola): filaConVencimiento + diasVencido centralizados en agenda.ts"
```

---

## Task 5: Wire `/cola` — Reagendar con fecha real, quitar duplicado de `diasVencido`

**Files:**
- Modify: `app/cola/page.tsx`

- [ ] **Step 1: Importar lo nuevo y quitar la definición local de `diasVencido`**

Cambiar:

```ts
import { canalNormalizado, filaSinVencimiento, OWNER_COLA_SPLIT, type FilaAgenda } from "./agenda.ts";
```

por:

```ts
import { filaSinVencimiento, filaConVencimiento, diasVencido, OWNER_COLA_SPLIT, type FilaAgenda } from "./agenda.ts";
```

(`canalNormalizado` ya no se usa directo en `page.tsx` — lo usan internamente `filaSinVencimiento`
y `filaConVencimiento` en `agenda.ts`. Si `page.tsx` no lo usa en ningún otro lado, quitarlo del
import; si algún otro bloque del archivo lo sigue usando, dejarlo.)

Borrar la función local:

```ts
function diasVencido(fechaISO: string, hoyISO: string) {
  return Math.round((Date.parse(hoyISO) - Date.parse(fechaISO)) / 86400000);
}
```

- [ ] **Step 2: Llamar `colaReagendar` con `hoy`**

Cambiar:

```ts
  const reagendar = splitActivo ? colaReagendar(owner, usuario.idOrganizacion) : [];
```

por:

```ts
  const reagendar = splitActivo ? colaReagendar(hoy, owner, usuario.idOrganizacion) : [];
```

- [ ] **Step 3: Mapear `filas` y `filasReagendar` con vencido; `filasCierres` sigue sin vencido**

Cambiar:

```ts
  const filas: FilaAgenda[] = cola.map((c, i) => {
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
      actual: i === 0,
    };
  });
```

por:

```ts
  const filas: FilaAgenda[] = cola.map((c, i) => filaConVencimiento(c, hoy, i === 0));
```

Y cambiar:

```ts
  const filasCierres: FilaAgenda[] = cierres.map((c) => filaSinVencimiento(c));
  const filasReagendar: FilaAgenda[] = reagendar.map((c) => filaSinVencimiento(c));
```

por:

```ts
  const filasCierres: FilaAgenda[] = cierres.map((c) => filaSinVencimiento(c));
  const filasReagendar: FilaAgenda[] = reagendar.map((c) => filaConVencimiento(c, hoy, false));
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si `canalNormalizado` quedó importado sin uso, tsc no falla por import no
usado (el proyecto no tiene `noUnusedLocals`), pero limpiarlo igual si sobra.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add app/cola/page.tsx
git commit -m "fix(cola): Reagendar usa fecha real (vencido/hoy) igual que Leads"
```

---

## Task 6: Botón "No llegó a la reunión" contextual en la captura

**Files:**
- Modify: `app/llamada/[id]/LlamadaCard.tsx`
- Modify: `app/llamada/[id]/RegistrarToqueToggle.tsx`
- Modify: `app/llamada/[id]/CapturaLlamada.tsx`

> Sin test dedicado (componente cliente, sin infra de testing de React en el repo). Se verifica
> con typecheck + revisión manual de Sebastián en el navegador.

- [ ] **Step 1: `LlamadaCard.tsx` pasa `estado`**

Cambiar la línea (~141):

```tsx
              <RegistrarToqueToggle idEmpresa={emp?.id ?? ""} idPasoInscripcion={idPasoInscripcion} calificacion={calificacion} />
```

por:

```tsx
              <RegistrarToqueToggle idEmpresa={emp?.id ?? ""} estado={emp?.estado ?? null} idPasoInscripcion={idPasoInscripcion} calificacion={calificacion} />
```

- [ ] **Step 2: `RegistrarToqueToggle.tsx` acepta y reenvía `estado`**

Cambiar:

```tsx
export function RegistrarToqueToggle({
  idEmpresa,
  idPasoInscripcion,
  calificacion,
}: {
  idEmpresa: string;
  idPasoInscripcion: number | null;
  calificacion: Calificacion;
}) {
  const { abierto, abrir } = usePreguntar();

  if (abierto) {
    return <CapturaLlamada idEmpresa={idEmpresa} idPasoInscripcion={idPasoInscripcion} calificacion={calificacion} />;
  }
```

por:

```tsx
export function RegistrarToqueToggle({
  idEmpresa,
  estado,
  idPasoInscripcion,
  calificacion,
}: {
  idEmpresa: string;
  estado: string | null;
  idPasoInscripcion: number | null;
  calificacion: Calificacion;
}) {
  const { abierto, abrir } = usePreguntar();

  if (abierto) {
    return <CapturaLlamada idEmpresa={idEmpresa} estado={estado} idPasoInscripcion={idPasoInscripcion} calificacion={calificacion} />;
  }
```

- [ ] **Step 3: `CapturaLlamada.tsx` acepta `estado`, filtra `OUTCOMES` y esconde el resumen para `no_llego`**

Cambiar la firma de props:

```tsx
export default function CapturaLlamada({
  idEmpresa,
  idPasoInscripcion,
  calificacion,
}: {
  idEmpresa: string;
  idPasoInscripcion: number | null;
  calificacion?: Calificacion;
}) {
```

por:

```tsx
export default function CapturaLlamada({
  idEmpresa,
  estado,
  idPasoInscripcion,
  calificacion,
}: {
  idEmpresa: string;
  // Solo se ofrece "No llego a la reunion" cuando la empresa esta en reunion_agendada
  // (2026-07-14) -- no tiene sentido para el resto de estados.
  estado: string | null;
  idPasoInscripcion: number | null;
  calificacion?: Calificacion;
}) {
```

Cambiar la constante de módulo (arriba del componente):

```ts
const OUTCOMES: { v: Resultado; l: string }[] = RESULTADOS.map((v) => ({ v, l: RESULTADO_LABELS[v] }));
```

por una función (ya no puede ser constante de módulo: depende de `estado`, que solo se conoce en
render):

```ts
function outcomesPara(estado: string | null): { v: Resultado; l: string }[] {
  const disponibles = estado === 'reunion_agendada' ? RESULTADOS : RESULTADOS.filter((v) => v !== 'no_llego');
  return disponibles.map((v) => ({ v, l: RESULTADO_LABELS[v] }));
}
```

Dentro del componente, después de los `useState` (línea ~43), agregar:

```ts
  const OUTCOMES = outcomesPara(estado);
```

Cambiar la condición que esconde el bloque "Tu resumen" (línea ~84):

```tsx
      {outcome !== "no_contesto" && (
```

por:

```tsx
      {outcome !== "no_contesto" && outcome !== "no_llego" && (
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add app/llamada/\[id\]/LlamadaCard.tsx app/llamada/\[id\]/RegistrarToqueToggle.tsx app/llamada/\[id\]/CapturaLlamada.tsx
git commit -m "feat(llamada): boton No llego a la reunion, contextual a reunion_agendada"
```

---

## Task 7: Verificación final local

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: 0 fallos.

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Pedir a Sebastián que revise en el navegador**

La IA no levanta el dev server. Pedirle:
1. `npm run dev`, entrar a `/cola` — Reagendar ahora debe mostrar "vencido Nd"/"hoy" igual que
   Leads (no una lista fija).
2. Abrir la ficha de una cuenta en `reunion_agendada` (`/llamada/[id]`) y confirmar que aparece
   el botón "No llegó a la reunión" entre los resultados, y que para una cuenta en otro estado
   (ej. un lead) NO aparece.
3. Registrar un "No llegó a la reunión" de prueba con una fecha de reintento vencida/de hoy, y
   confirmar que la cuenta aparece en la sección Reagendar de `/cola`.

---

## Fuera de este plan (sin cambios)

- `on_hold` sigue fuera del split — no se construye reactivación en esta entrega.
- El badge del nav (`AppShell.tsx`) sigue contando solo `colaLeads`.
- Migración de datos en el VPS y borrado de campañas de prueba: sin cambios, siguen pendientes de
  aprobación explícita como runbook aparte (ver spec).

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec (Parte 8):** `no_llego` en el dominio (Task 1), exclusión en `colaCierres`
  y redefinición de `colaReagendar` (Tasks 2-3), UI contextual reusando el bloque existente de
  "Próximo toque" (Task 6), Reagendar date-driven igual que Leads (Tasks 4-5). Todo cubierto.
- **Placeholders:** cada step trae código completo.
- **Consistencia de tipos:** `ultimoResultadoNoLlego` se define una sola vez y la reusan
  `colaCierres` y `colaReagendar` (Task 2 la crea, Task 3 la reusa sin redefinirla).
  `filaConVencimiento`/`diasVencido` se definen una vez en `agenda.ts` (Task 4) y los consume
  `page.tsx` (Task 5) sin duplicar el cálculo. `estado: string | null` es el mismo tipo en las
  tres capas de la Task 6 (`LlamadaCard` → `RegistrarToqueToggle` → `CapturaLlamada`).
- **Capas:** la derivación de no-show vive en el Repository (SQL), no en el core ni en la UI; la
  UI solo decide CUÁNDO ofrecer el botón (por estado), no cómo se deriva Reagendar.
