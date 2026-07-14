# Cadencia PBX (enriquecimiento del decisor) — Implementation Plan

> **For agentic workers:** SUB-SKILL recomendada: `superpowers:subagent-driven-development` o
> `superpowers:executing-plans`, tarea por tarea. Checkbox (`- [ ]`) para tracking.
>
> **Cap de modelo (memoria):** máximo Sonnet; Haiku para lo mecánico. Cada tarea trae modelo
> sugerido.
>
> **Regla de oro (CLAUDE.md):** el core no importa DB/Notion/Claude; datos solo por el Repository;
> nada de SQL crudo regado. Voz sin emojis, sin em dashes, español directo. No inventar datos de
> dominio. Cada feature cierra con sus pruebas.
>
> **Modo learning (CLAUDE.md):** las tareas marcadas HUECO DE SEBASTIÁN dejan el andamiaje (tipos,
> test, ensamblado) y Sebastián escribe el cuerpo de la decisión de dominio (5-10 líneas). No
> rellenar el hueco para ir más rápido. Cada hueco cierra con checkpoint (Sebastián explica de
> vuelta el porqué).

**Goal:** que la herramienta detecte sola el estado **PBX** (empresa sin decisor alcanzable),
corra un bucle abierto guiado por resultado que propone el próximo paso un toque a la vez (con IA
que interpreta el resultado libre), agende y cuente los intentos, y gradúe la cuenta a la cadencia
comercial normal cuando se consigue el método directo del KDM. Diseño en
`docs/superpowers/specs/2026-07-14-pbx-cadencia-enriquecimiento-design.md`.

**Architecture:** Hexagonal. (1) Core puro: derivación del estado (`estaEnPBX`) + máquina de
estados (`proponerSiguientePaso`). (2) Core con IA: `pbx-interpretar.ts` sobre `IAPort`. (3)
Persistencia: reusa `proximoPaso`/`proximoCanal`/`proximoFollowUpFecha` + mínimo estado del bucle;
queries `empresasEnPBX`, `graduarDePBX`. (4) UI: carril PBX en la cola + bucle en la ficha.

**Tech Stack:** Next.js App Router + TypeScript, Drizzle sobre SQLite (`isps.db`), Tailwind v4
(`@theme`), pruebas `node:test` (`npm test`). Sin dependencias nuevas.

**Comandos base:**
- Test dirigido: `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/pbx.test.ts`
- Todos: `npm test`  ·  Typecheck: `npx tsc --noEmit`

---

## Contexto y decisiones (leer antes de empezar)

- **PBX es derivado.** No hay columna `es_pbx` ni la habrá. Se calcula de contactos + KDM.
- **El bucle guarda un solo dato: el próximo paso.** Reusa `empresa.proximoPaso` (texto visible en
  la cola), `proximoCanal`, `proximoFollowUpFecha`. Lo único nuevo del bucle es la **forma** actual
  (del vocabulario) y el **conteo de intentos**.
- **Decisión abierta (Task 2.1):** dónde persistir la forma. Default recomendado: una columna
  nullable `empresa.pbx_forma` (aditiva, mismo estilo que el embudo agregó columnas/tablas). Los
  intentos se cuentan desde `toque` (no se persiste contador). Alternativa: tabla
  `empresa_pbx_estado`. Sebastián confirma en Task 2.1 antes de tocar el schema.
- **No tocar la readiness de campañas.** `canalesDisponiblesKDM` es nuevo y solo lo usa PBX.
- **Vocabulario de formas:** `llamar_conmutador` · `conseguir_numero` · `enviar_correo` ·
  `esperar` · `hablar_con` · `escalar` · `graduar`. Vive en un solo lugar (`app/core/pbx.ts`).

## File Structure

**Crear:**
- `app/core/pbx.ts` — dominio puro: tipos + `canalesDisponiblesKDM` + `estaEnPBX` +
  `proponerSiguientePaso` + `sugerirEscalar`.
- `app/core/pbx.test.ts` — pruebas del dominio.
- `app/core/pbx-interpretar.ts` — el paso de IA (prompt + schema Zod + `IAPort`).
- `app/core/pbx-interpretar.test.ts` — prueba con un `IAPort` fake.
- `app/db/repository.pbx.test.ts` — pruebas de `empresasEnPBX` + `graduarDePBX`.
- Componentes UI bajo `app/cola/` y la ficha (ver Fase 4).

**Modificar:**
- `app/db/schema.ts` — (si Task 2.1 lo decide) columna `pbxForma` en `empresa`.
- `app/db/test-helpers.ts` — reflejar el cambio de schema en la DB de prueba.
- `app/db/repository.ts` — `empresasEnPBX(idOrg)`, `guardarProximoPasoPBX(...)`, `graduarDePBX(...)`.
- `isps.db` — DDL aditivo si se agrega la columna.
- `app/cola/agenda.ts` + UI de la cola — distinguir el carril PBX.
- Ficha de la cuenta — el bucle + cierre de toque con IA + botón graduar.

---

## Fase 1 — Derivación del estado PBX (core puro, TDD)

> Objetivo: que la herramienta sepa cuándo una empresa está en PBX, mirando KDM-reachability y no
> "cualquier teléfono". Modelo sugerido: **Sonnet**.

### Task 1.1: `canalesDisponiblesKDM` + `estaEnPBX` — HUECO DE SEBASTIÁN

> **Decisión de dominio:** qué cuenta como "KDM alcanzable". La versión de hoy
> (`canalesDisponibles`) cuenta el teléfono de cualquier contacto. La de PBX debe contar solo el
> método directo de un contacto con `esKeyDecisionMaker`. El matiz que decide Sebastián: ¿un KDM
> con SOLO correo (sin teléfono) saca a la empresa de PBX, o PBX es específicamente "sin
> teléfono/WhatsApp directo del KDM"? (El correo del KDM es un canal directo, pero el flujo real de
> Sebastián es telefónico; su llamada.)

**Files:** Create `app/core/pbx.ts`, `app/core/pbx.test.ts`.

- [ ] **Step 1: Tipos + vocabulario en `pbx.ts`**

```ts
// Dominio puro del estado PBX y su bucle de enriquecimiento. NO importa DB/IA/UI.
import type { Canal } from '../db/validation.ts';

export type FormaPaso =
  | 'llamar_conmutador' | 'conseguir_numero' | 'enviar_correo'
  | 'esperar' | 'hablar_con' | 'escalar' | 'graduar';

export type ContactoPBX = {
  esKeyDecisionMaker: boolean;
  telefono: string | null;
  email: string | null;
};

// Canales directos alcanzables SOLO via contactos KDM. Distinto de canalesDisponibles
// (canales-empresa.ts), que cuenta cualquier contacto: ese se queda para readiness de
// campañas; este es el eje de PBX.
export function canalesDisponiblesKDM(contactos: ContactoPBX[]): Set<Canal> {
  const dir = new Set<Canal>();
  for (const c of contactos) {
    if (!c.esKeyDecisionMaker) continue;
    if (c.email) dir.add('correo');
    if (c.telefono) { dir.add('llamada'); dir.add('whatsapp'); }
  }
  return dir;
}
```

- [ ] **Step 2: Test que falla** (`pbx.test.ts`): empresa con contacto de oficina no-KDM con
  teléfono -> `estaEnPBX === true`; empresa con un KDM con teléfono -> `false`; empresa sin
  contactos -> `true`. Correr y verlo fallar (`estaEnPBX is not a function`).

- [ ] **Step 3: Andamiaje + HUECO en `pbx.ts`**

```ts
export function estaEnPBX(contactos: ContactoPBX[]): boolean {
  // ── HUECO DE SEBASTIÁN (2-4 lineas) ────────────────────────────
  // Definir el predicado: una empresa esta en PBX cuando NO hay un KDM alcanzable
  // por su metodo directo. Decidir si el correo del KDM basta para NO estar en PBX,
  // o si PBX es especificamente "sin telefono/WhatsApp del KDM".
  // Usa canalesDisponiblesKDM(contactos). Borra el throw.
  throw new Error('estaEnPBX: pendiente');
  // ───────────────────────────────────────────────────────────────
}
```

- [ ] **Step 4:** Sebastián implementa, test en verde. **Step 5:** commit
  `feat(pbx): estaEnPBX + canalesDisponiblesKDM (dominio puro)`.

> **Checkpoint:** Sebastián explica por qué el correo del KDM sí/no saca de PBX, y qué implica para
> qué cuentas caen en el carril.

---

## Fase 2 — Máquina de estados del próximo paso (core puro, TDD)

> Objetivo: la función que, dado el resultado de un toque + datos de la empresa + intentos, propone
> la siguiente forma de paso. Es el corazón del bucle. Modelo sugerido: **Sonnet**.

### Task 2.1: `proponerSiguientePaso` + `sugerirEscalar` — HUECO DE SEBASTIÁN

> **Decisión de dominio (la más importante del plan):** las transiciones. Dado un resultado
> ("me pidieron correo" / "no contestaron" / "conseguí el número" / "hable con X") -> qué forma
> sigue y con qué fecha sugerida. Y la heurística de `sugerirEscalar` (cuándo el bucle está
> estancado). El plan da los tipos, el test y el ensamblado; Sebastián escribe el cuerpo.

**Files:** Modify `app/core/pbx.ts`, `app/core/pbx.test.ts`.

- [ ] **Step 1: Tipos del paso + resultado**

```ts
// Resultado ABIERTO de un toque PBX. `clase` es el mapeo a vocabulario (lo pone la IA
// o Sebastian a mano); `nota` es el texto libre; `datoConseguido` marca si se obtuvo
// metodo directo del KDM (dispara graduar).
export type ResultadoPBX = {
  clase: 'pidieron_correo' | 'sin_respuesta' | 'referido_persona' | 'dato_conseguido' | 'otro';
  nota: string;
  personaReferida?: string | null;   // "hable con Andrea de compras"
};

export type PasoPropuesto = {
  forma: FormaPaso;
  canal: Canal | null;               // llamar->'llamada', correo->'correo', esperar->null
  diasSugeridos: number | null;      // offset para proximoFollowUpFecha; null = hoy
  nota: string;                      // texto que va a proximoPaso, legible en la cola
};

export type EntradaPaso = {
  resultado: ResultadoPBX | null;    // null = entrada al bucle (primer paso)
  tieneNumeroConmutador: boolean;    // hay contacto de oficina con telefono
  intentos: { llamadas: number; correos: number }; // contados desde `toque`
};
```

- [ ] **Step 2: Test que falla** (tabla de casos):
  - entrada `resultado=null`, con número -> `forma='llamar_conmutador'`.
  - entrada `resultado=null`, sin número -> `forma='conseguir_numero'`.
  - `pidieron_correo` -> `forma='enviar_correo'`, luego `esperar` ~3 días.
  - `sin_respuesta` -> `forma='llamar_conmutador'` a ~2 días (mientras no toque escalar).
  - `referido_persona` (personaReferida presente) -> `forma='hablar_con'`.
  - `dato_conseguido` -> `forma='graduar'`.
  - `sugerirEscalar({llamadas:2, correos:1})` -> `true` (default; Sebastián fija el umbral).
  Correr y verlo fallar.

- [ ] **Step 3: Andamiaje + HUECO**

```ts
export function proponerSiguientePaso(e: EntradaPaso): PasoPropuesto {
  // ── HUECO DE SEBASTIÁN (8-12 lineas) ───────────────────────────
  // Ruteo resultado -> forma + canal + diasSugeridos + nota. Casos arriba.
  // Regla de graduar: si resultado.clase === 'dato_conseguido' -> forma 'graduar'.
  // El default de sin_respuesta vuelve a llamar; escalar NO se fuerza aqui (eso lo
  // decide sugerirEscalar y la UI ofrece el boton). Borra el throw.
  throw new Error('proponerSiguientePaso: pendiente');
  // ───────────────────────────────────────────────────────────────
}

export function sugerirEscalar(intentos: { llamadas: number; correos: number }): boolean {
  // ── HUECO DE SEBASTIÁN (1-3 lineas) ────────────────────────────
  // Heuristica de "estancado" (caso a caso: se sugiere, no se fuerza).
  throw new Error('sugerirEscalar: pendiente');
  // ───────────────────────────────────────────────────────────────
}
```

- [ ] **Step 4:** Sebastián implementa, test en verde. **Step 5:** commit
  `feat(pbx): proponerSiguientePaso + sugerirEscalar (maquina de estados)`.

> **Checkpoint:** Sebastián explica las transiciones que eligió y por qué el umbral de escalar es
> el que es.

---

## Fase 3 — Persistencia del bucle (schema + queries, TDD)

> Objetivo: guardar la forma actual, contar intentos desde `toque`, listar empresas en PBX y
> graduar. Modelo sugerido: **Sonnet**.

### Task 3.1: Forma del bucle (decisión de schema — Sebastián confirma)

- [ ] **Step 1:** Confirmar con Sebastián: columna nullable `empresa.pbx_forma TEXT` (default
  recomendado) vs tabla `empresa_pbx_estado`. Si columna:
  - `schema.ts`: agregar `pbxForma: text('pbx_forma')` a `empresa`.
  - `isps.db`: `ALTER TABLE empresa ADD COLUMN pbx_forma TEXT;` (aditivo).
  - `test-helpers.ts`: reflejar la columna en el DDL de prueba.
  - Typecheck 0. Commit `feat(pbx): columna pbx_forma (estado del bucle)`.

### Task 3.2: `empresasEnPBX`, `guardarProximoPasoPBX`, `graduarDePBX` (TDD)

**Files:** Modify `app/db/repository.ts`, Create `app/db/repository.pbx.test.ts`.

- [ ] **Step 1: Test que falla.** Seed: empresa con solo contacto de oficina (no-KDM, con
  teléfono) -> aparece en `empresasEnPBX(1)`. Empresa con KDM con teléfono -> NO aparece.
  `graduarDePBX(id, kdm, 1)` inserta el contacto KDM, limpia `pbx_forma` y deja la empresa fuera
  de `empresasEnPBX`. Todo scoped a `organizacion_activa_id`.

- [ ] **Step 2: Implementar en `repository.ts`** (copiar el idioma de queries existentes, p.ej.
  `contarPorEstado`; JOIN a `contacto`, filtrar por `organizacion_activa_id`). `empresasEnPBX`
  trae las empresas cuyos contactos no incluyen un KDM alcanzable (la condición espejo de
  `estaEnPBX`, resuelta en SQL o resolviendo en core sobre las filas). `guardarProximoPasoPBX`
  escribe `proximoPaso`/`proximoCanal`/`proximoFollowUpFecha`/`pbx_forma` en una transacción.
  `graduarDePBX` inserta el contacto KDM + limpia `pbx_forma` en transacción.

- [ ] **Step 3:** test en verde. **Step 4:** commit
  `feat(pbx): empresasEnPBX + guardarProximoPasoPBX + graduarDePBX`.

> Nota multi-org: toda query filtra por `idOrganizacion` (patrón del repo). El conteo de intentos
> (`llamadas`/`correos`) se deriva de `toque` desde que la empresa entró a PBX; si eso se complica,
> contar todos los toques PBX y refinar después (documentar el atajo, memoria "no silent caps").

---

## Fase 4 — IA que interpreta el resultado abierto (core, TDD con fake)

> Objetivo: el "qué pasó" libre -> forma sugerida + datos extraídos + próximo paso, para que
> Sebastián apruebe. Reusa el patrón de `estructurar-toque.ts`. Modelo sugerido: **Sonnet**.

### Task 4.1: `pbx-interpretar.ts`

**Files:** Create `app/core/pbx-interpretar.ts`, `app/core/pbx-interpretar.test.ts`.

- [ ] **Step 1: Schema + firma** (mismo patrón que `toqueEstructuradoSchema`)

```ts
import { z } from 'zod';
import type { IAPort } from './ports/ia.ts';

export const pbxInterpretadoSchema = z.object({
  clase: z.enum(['pidieron_correo', 'sin_respuesta', 'referido_persona', 'dato_conseguido', 'otro']),
  personaReferida: z.string().nullable(),
  // dato del KDM extraido del texto, si lo hubo (dispara graduar tras revision):
  kdmNombre: z.string().nullable(),
  kdmTelefono: z.string().nullable(),
  kdmEmail: z.string().nullable(),
  proximoPasoTexto: z.string(), // legible, editable, para proximoPaso
});
export type PbxInterpretado = z.infer<typeof pbxInterpretadoSchema>;

export async function interpretarResultadoPBX(ia: IAPort, quePaso: string): Promise<PbxInterpretado> {
  return ia.generar(construirPrompt(quePaso), pbxInterpretadoSchema);
}
```

- [ ] **Step 2: Test con `IAPort` fake** (un objeto que devuelve un `PbxInterpretado` fijo; se
  verifica que `interpretarResultadoPBX` lo pasa tal cual y que el prompt incluye el `quePaso`).
  No pega a Claude real.

- [ ] **Step 3: `construirPrompt`** (contexto OnePay/ISPs, igual que `estructurar-toque.ts`:
  fintech colombiana, vendedor acaba de colgar; instrucción de mapear al vocabulario y extraer
  dato del KDM si aparece; nunca inventar). Voz sin emojis/em dashes.

- [ ] **Step 4:** commit `feat(pbx): interpretarResultadoPBX (IA sobre IAPort)`.

> **La IA propone, Sebastián aprueba** (CLAUDE.md): el output es borrador. El wiring del borrador
> -> aprobar va en la UI (Fase 5), no aquí.

---

## Fase 5 — UI: carril PBX en la cola + bucle en la ficha

> Objetivo: que Sebastián vea las cuentas PBX, el próximo paso, y cierre el toque con IA + gradúe.
> Modelo sugerido: **Sonnet**. Cero hex crudo: tokens `@theme`.

### Task 5.1: Carril PBX en la cola

- [ ] Distinguir en `app/cola/agenda.ts` + la UI las empresas en PBX (badge/carril "PBX -
  conseguir decisor"). El `proximoPaso` textual ya viene de `guardarProximoPasoPBX`. Mostrar el
  número del conmutador cuando exista, o el chip "conseguir número" cuando no. Reusar el patrón
  visual de la cola actual (memoria `feedback_abstraer_tokens_diseno`).

### Task 5.2: El bucle en la ficha de la cuenta

- [ ] En la ficha: forma actual + intentos (llamadas/correos) + botón "cerrar toque PBX". Al
  cerrar: caja de texto libre ("qué pasó") -> server action que llama `interpretarResultadoPBX` ->
  muestra el borrador (forma sugerida, datos del KDM detectados, próximo paso editable) ->
  Sebastián aprueba -> `guardarProximoPasoPBX` (o `graduarDePBX` si la clase es `dato_conseguido`).
- [ ] Si `sugerirEscalar(intentos)` es `true`, mostrar el botón "escalar (referido / otra vía)"
  como opción visible, sin bloquear el resto.
- [ ] Botón "graduar": abre el mini-form de contacto KDM (nombre + teléfono/WhatsApp/correo) ->
  `graduarDePBX` -> la empresa sale de PBX y queda lista para cadencia comercial.

- [ ] Typecheck + tests verdes. Commit por pieza:
  `feat(pbx): carril PBX en la cola` / `feat(pbx): bucle PBX en la ficha con IA + graduar`.

> **Checkpoint visual (Sebastián levanta el preview, no la IA — memoria `feedback_never_run_previews`).**

---

## Fase 6 — Futuro (no construir ahora, documentado)

- **IA para `conseguir_numero`:** búsqueda del conmutador (web/registros) para prellenar el
  contacto de oficina, en vez de tarea manual.
- **Readiness de campañas KDM-aware:** migrar `inscripcion.ts`/`preview-inscripcion.ts` de
  `canalesDisponibles` a la lógica KDM, con su propio análisis de impacto.
- **Métricas de enriquecimiento:** tasa PBX -> cadencia comercial, tiempo promedio en PBX,
  intentos por graduación (todo derivable de `toque` + `empresa_estado_historial`).
- **Sync a Notion** del estado/notas de PBX, con revisión humana (borrador -> aprobar -> outbox).

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del diseño:** derivación PBX (Fase 1), bucle abierto guiado por resultado (Fase 2),
  persistencia + graduar (Fase 3), IA que interpreta lo imprevisto (Fase 4), cola + ficha (Fase 5).
  Cubierto.
- **Capas:** `pbx.ts`/`pbx-interpretar.ts` no importan DB/UI; repo es el único que toca SQLite; UI
  recibe datos resueltos. `canalesDisponiblesKDM` es nuevo, no le cambia la semántica a la readiness
  de campañas (fuera de alcance explícito).
- **Reuso:** próximo paso sobre `proximoPaso`/`proximoCanal`/`proximoFollowUpFecha` (cola ya
  existente); IA sobre `IAPort`/patrón `estructurar-toque`; intentos desde `toque`.
- **Huecos de learning:** el predicado de PBX (1.1), las transiciones + umbral de escalar (2.1) y
  la decisión de schema (3.1) quedan como decisiones de Sebastián, no rellenadas.

## Riesgos / notas

- **Semántica de "alcanzable":** si el correo del KDM saca o no de PBX es la decisión 1.1; cambia
  qué cuentas caen en el carril. Definir antes de la query de Fase 3.
- **Conteo de intentos desde `toque`:** depende de poder acotar "desde que entró a PBX". Si no hay
  marca temporal limpia, contar todos los toques PBX y documentar el atajo.
- **`empresasEnPBX` puede ser cara** si resuelve el predicado por empresa en JS; preferir resolver
  en SQL la condición espejo. Verificar con la base real (1400+ empresas sin etapa).
- Sin dependencias nuevas. Multi-org en toda query.
