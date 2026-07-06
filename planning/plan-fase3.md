# Plan de ejecución · Fase 3 (F1: conectores + ingest Granola + outbox Notion)

> **Para agentes:** ejecutar tarea por tarea con checkpoints inline (preferencia de Sebastián:
> sesión a sesión, no subagent-driven). Los pasos usan checkboxes para marcar avance.
> Este plan se ejecuta en MODO LEARNING: antes de cada bloque de código hay explicación,
> y en los puntos marcados **Tu código** escribe Sebastián, no la IA.

**Objetivo:** al registrar una llamada como contestada, el sistema busca en Granola la grabación
correspondiente (por teléfono del contacto, cerca de la hora del toque) y la muestra para
confirmar antes de guardar el resumen; una llamada sin contestar nunca toca Granola; los cambios
aprobados llegan a Notion una sola vez vía outbox.

**Arquitectura:** el core define puertos (`TranscriptAdapter`, `SyncAdapter`); Granola y Notion
son adaptadores afuera. Todo acceso a datos pasa por el Repository. La búsqueda de transcript es
síncrona y bajo demanda (se dispara al marcar el toque como contestado; no hay barrido de fondo
adivinando empresas). Un worker Node aparte (`npm run worker`) corre SOLO el drenado de outbox a
Notion, con catch-up-first y heartbeat — es lo único de esta fase que de verdad necesita
reintentos async, porque depende de un servicio externo por red.

**Stack:** Next.js + TypeScript, Drizzle sobre isps.db, node:crypto (AES-256-GCM), node --test.
Sin dependencias nuevas.

---

## Cómo funciona el modo learning en esta fase

El plugin `learning-output-style` está activo (verificado en `~/.claude/settings.json`,
`enabledPlugins`). En la práctica significa tres cosas por tarea:

1. **Explicación antes del código.** Antes de tocar cada pieza, la IA explica el concepto
   (qué problema resuelve, qué alternativas había, por qué esta) con bloques `★ Insight`.
2. **Tu código.** En cada tarea con decisión de diseño real hay un slot de 5-10 líneas que
   escribe Sebastián. La IA prepara el archivo, la firma y el contexto; Sebastián decide.
   Los slots están marcados abajo. No hay slots en boilerplate (migraciones, UI).
3. **Checkpoint de cierre.** Al cerrar cada tarea, una pregunta de comprensión. Si la
   respuesta cojea, se repasa antes de seguir. Nada de avanzar con lagunas.

Conceptos que esta fase enseña, en orden: puertos y adaptadores en serio (no de dicho),
cifrado autenticado, idempotencia, patrón outbox transaccional, workers con catch-up.

## Pausas obligatorias (no negociables)

- **Antes de V3.3 paso final:** se necesita la API key real de Granola. PARAR y pedirla.
- **Antes de V3.7 paso final:** se necesita el token real de Notion. PARAR y pedirlo.
- Ninguna credencial se pega en el repo, en logs ni en el chat de una sesión que se comparta.

---

## Decisión de diseño (cerrada con Sebastián, 2026-07-04): matching on-demand, no de fondo

El diseño original de esta fase asumía un matcher de fondo que escaneaba TODAS las sesiones de
Granola y adivinaba a qué empresa pertenecían por nombre/alias, con una cola de revisión cuando
no encontraba con quién enlazar. Se descarta: hoy nadie del equipo graba *meetings* sueltas con
Granola, solo llamadas, y esas llamadas siempre nacen como toque registrado en la herramienta
primero. El algoritmo real:

- Toque con `canal=llamada` y `resultado` en `{contesto_reunion, contesto_sigue_seguimiento,
  contesto_no}` (cualquier variante de "sí hubo conversación") dispara, al guardar el toque,
  una búsqueda en Granola por el teléfono de `contacto.telefono` en una ventana de tiempo cerca
  de la fecha del toque. La empresa y el contacto ya se conocen: el único trabajo del matcher es
  decidir CUÁL grabación entre las candidatas (normalmente una sola).
- `resultado=no_contesto` nunca toca Granola. Si Sebastián dejó correo de voz, lo escribe él
  mismo como texto libre en `quePaso` — decisión tomada: sin columna nueva, no hay necesidad hoy
  de reportar correos de voz aparte, y el campo ya existe.
- **Actualización 2026-07-06, verificado en vivo contra la API real de Granola (spec completo +
  3 notas reales, dos cuentas distintas):** "teléfono manda siempre" no sobrevivió al dato real.
  La API pública documentada (`GET /v1/notes`, `GET /v1/notes/{id}`) no tiene NINGÚN campo
  estructurado de teléfono (revisado el schema completo: `Note`, `NoteDetail`, `User`,
  `CalendarEvent`, `Speaker` — ninguno lo trae). El teléfono aparece a veces, como texto libre
  dentro de `summary_text` (ej. "Phone: +57 318 315 4417" en una nota de tipo "Phone call with
  X"), pero NO en todas las notas — depende del tipo de llamada y de que la IA de Granola decida
  incluir una sección de contacto. No es un campo confiable como clave principal.
  Nuevo criterio: **el nombre de la empresa (o sus alias en `empresa_alias`) manda**, buscado
  como texto dentro del título/resumen en la ventana de tiempo — consistente en los 3 casos reales
  vistos, aunque el formato del título varía por persona (`"{Empresa} - {tipo} {fecha}
  ({contacto})"` vs `"Phone call with {contacto} - {empresa}"`). El teléfono, cuando aparece en el
  texto, se usa como señal extra de confianza (no obligatoria, nunca descarta una candidata por
  su ausencia). Bloques de 15 minutos agrupan intentos del mismo día; fusión a 1 hora trata dos
  sesiones con contenido real de la misma empresa como la MISMA llamada partida por Granola en dos
  documentos (invariante: nunca dos toques por una sesión).
- Sin excepción: incluso con una sola candidata obvia, Sebastián confirma antes de que el resumen
  se guarde. Nunca se auto-escribe sin ese "sí" rápido — eso reemplaza por completo la necesidad
  de detectar "sesión vacía" (buzón de voz, pie de página de Granola) por texto: si la grabación
  que aparece no sirve, Sebastián simplemente no la confirma.
- Consecuencia en la arquitectura: no hace falta un worker de fondo ni una tabla de candidatos
  pendientes para esto. La búsqueda y la confirmación viven en una sola interacción (buscar ->
  mostrar candidatas -> confirmar), sin persistir estado intermedio; si Granola todavía no
  procesó el resumen, Sebastián reintenta con un botón más tarde. El worker (V3.5) queda dedicado
  solo al drenado de outbox hacia Notion.
- Fuera de alcance de esta fase, para el final (tarea nueva V3.9, antes del cierre): un botón
  "agregar toque" independiente de la cola del día, para dejar constancia de contacto con alguien
  que no es lead (cliente existente u otra relación).

---

### Tarea 0a · Prerrequisito: revisar y mergear `fase2-auth` — CERRADA (2026-07-05)

Fase 3 depende de que exista sesión (el owner sale de la sesión, no hardcodeado).

**Hallazgo al ejecutar esta tarea:** la rama `fase2-auth` ya no existe; Fase 2 quedó
mergeada a `main` en una sesión anterior (commit `05f9d39`, tope actual de main). Este
documento tenía el dato viejo ("SIN MERGEAR") — corregido. No hizo falta merge, solo
verificar que main está sano.

**Pasos:**

- [x] `npm test` en main: **10/10 verdes.**
- [x] `npx tsc --noEmit`: **limpio, sin salida.**
- [x] Verificación en vivo (navegador, servidor de preview): ruta protegida `/` redirige a
      `/login` (gate de sesión activo); login con credencial inválida dispara
      `POST /api/auth/sign-in/email → 401` y la UI muestra "Correo o password incorrectos".
      Flujo de auth cableado extremo a extremo. No se probó un login exitoso (requiere la
      contraseña real de Sebastián, que la IA no pide ni maneja).
- [x] Nada que mergear ni pushear: main ya estaba al día.

### Tarea 0b · Tour guiado del proyecto (solo lectura, pedido explícito de Sebastián)

Antes de escribir una línea de Fase 3, caminar el código existente para entender cómo
funciona internamente. Sin cambios de código.

**Recorrido (30-45 min, la IA guía, Sebastián pregunta):**

- [ ] `app/db/schema.ts`: por qué refleja 6 de las 21 tablas y qué pasa si el schema miente.
- [ ] `app/db/repository.ts`: el único que toca la DB. Dónde viven las validaciones Zod de
      las 4 salidas y por qué en código y no en CHECK de DB (decisión B1.a).
- [ ] Flujo completo de un toque: página -> server action -> gate de sesión -> Repository ->
      isps.db. Seguirlo con un registro real.
- [ ] Better Auth: qué tablas creó su CLI en isps.db y cómo el gate saca el owner de la sesión.
- [ ] Checkpoint: Sebastián explica de vuelta, en sus palabras, por qué el core no puede
      importar el driver de DB y qué se rompería el día que llegue Turso si lo importara.

---

### Tarea V3.1 · Migración: tablas conector y outbox

**Archivos:**
- Crear: `scripts/migrate_f1_dryrun.py`, `scripts/migrate_f1_apply.py` (mismo patrón que
  `migrate_f0_*.py` y `migrate_auth_*.py`)
- Modificar: `app/db/schema.ts` (agregar al final)

**Aprendizaje:** por qué el outbox se escribe en la MISMA transacción que el cambio (si el
proceso muere entre "cambié la DB" y "avisé a Notion", el aviso no se pierde: está en la
misma transacción o no está ninguno de los dos). Sin slot de Tu código: es migración.

**Pasos:**

- [ ] **Paso 1: dry-run script.** `migrate_f1_dryrun.py` imprime el SQL sin ejecutarlo:

```sql
CREATE TABLE IF NOT EXISTS conector (
  id_conector INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor TEXT NOT NULL UNIQUE,
  credencial_ciphertext TEXT,
  estado TEXT NOT NULL DEFAULT 'sin_credencial',
  ultima_corrida TEXT,
  ultimo_resultado TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS outbox (
  id_outbox INTEGER PRIMARY KEY AUTOINCREMENT,
  entidad TEXT NOT NULL,
  id_registro TEXT NOT NULL,
  payload TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'aprobado',
  intentos INTEGER NOT NULL DEFAULT 0,
  proximo_intento TEXT,
  created_at TEXT
);
```

  (Estados de outbox: `aprobado` -> `enviado` | `fallido`. Los cambios de IA que requieren
  revisión humana nacen en otra parte y solo entran al outbox al aprobarse; eso es Fase 6.
  Confirmar nombres exactos contra el Anexo de funcionalidades-v2.md antes de aplicar.)

- [ ] **Paso 2: correr dry-run.** `python3 scripts/migrate_f1_dryrun.py` y revisar el SQL a ojo.
- [ ] **Paso 3: apply idempotente.** `migrate_f1_apply.py` con `IF NOT EXISTS`; correrlo DOS
      veces seguidas y verificar que la segunda no truena ni duplica.
- [ ] **Paso 4: reflejar en schema.ts** (Drizzle, mismas columnas, camelCase -> snake_case
      como las tablas existentes).
- [ ] **Paso 5: verificar.** `npx tsc --noEmit` limpio y `npm test` sigue verde.
- [ ] **Paso 6: commit.** `git add scripts/migrate_f1_*.py app/db/schema.ts && git commit -m "V3.1: tablas conector y outbox con migracion dry-run/apply"`

### Tarea V3.2 · Cifrado de credenciales (AES-256-GCM)

**Archivos:**
- Crear: `app/lib/crypto.ts`, `app/lib/crypto.test.ts`
- Modificar: `app/db/repository.ts` (guardar/leer credencial de conector solo cifrada)

**Aprendizaje:** cifrado autenticado. GCM no solo esconde el dato: detecta si alguien lo
alteró (auth tag). Por qué el IV debe ser único por mensaje y por qué la llave vive en
variable de entorno y jamás en la DB.

**Tu código (5-8 líneas): `getKey()`.** Decisión: qué pasa cuando `FOLLOWUPS_CRYPTO_KEY`
falta o tiene largo inválido. Fail-fast al arrancar el proceso, o error solo al usarla.
Trade-off: fail-fast revienta el worker en launchd si la env no llegó; lazy deja arrancar
pero explota a mitad de una corrida. La IA prepara el archivo con el slot marcado.

**Pasos:**

- [ ] **Paso 1: test que falla primero.** En `app/lib/crypto.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { cifrar, descifrar } from './crypto.ts';

test('cifra y descifra ida y vuelta', () => {
  process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 7).toString('base64');
  const secreto = 'granola-api-key-123';
  const ct = cifrar(secreto);
  assert.notStrictEqual(ct, secreto);
  assert.strictEqual(descifrar(ct), secreto);
});

test('con otra llave el ciphertext no se lee', () => {
  process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 7).toString('base64');
  const ct = cifrar('secreto');
  process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 9).toString('base64');
  assert.throws(() => descifrar(ct));
});
```

- [ ] **Paso 2: correr y ver que falla.** `npm test` -> falla con módulo inexistente.
- [ ] **Paso 3: implementación.** `app/lib/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  // TU CODIGO: leer FOLLOWUPS_CRYPTO_KEY (base64, 32 bytes) y decidir manejo de ausencia/largo.
}

export function cifrar(textoPlano: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const datos = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  return [iv, datos, cipher.getAuthTag()].map((b) => b.toString('base64')).join('.');
}

export function descifrar(ciphertext: string): string {
  const [iv, datos, tag] = ciphertext.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(datos), decipher.final()]).toString('utf8');
}
```

- [ ] **Paso 4: correr tests.** `npm test` -> verdes.
- [ ] **Paso 5: Repository.** Métodos `guardarCredencialConector(proveedor, credencial)` (cifra
      antes de escribir) y `leerCredencialConector(proveedor)` (descifra al leer). Test de que
      lo que queda en la columna `credencial_ciphertext` NO contiene el texto plano.
- [ ] **Paso 6: checkpoint.** Pregunta: si alguien copia isps.db del laptop, qué ve y qué le
      falta para leer las credenciales.
- [ ] **Paso 7: commit.** `git commit -m "V3.2: cifrado AES-256-GCM de credenciales de conector"`

### Tarea V3.3 · Puerto TranscriptAdapter + GranolaAdapter

**Archivos:**
- Crear: `app/core/ports/transcript.ts` (nace `app/core/`: el dominio puro, sin imports de
  DB ni proveedores), `app/adapters/granola.ts`, `app/adapters/granola.test.ts`
- Modificar: `package.json` (agregar `app/core/*.test.ts app/adapters/*.test.ts` al glob de test)

**Aprendizaje (el central de la fase):** puertos y adaptadores de verdad. Skill
`design-patterns` primero. El core declara la interfaz que necesita; Granola es UNA
implementación. El día que llegue TLDv se escribe otro adaptador y el core ni se entera
(`transcript_proveedor` es dato, no código).

**Tu código (5-10 líneas): la interfaz del puerto.** Es LA decisión de diseño: qué le pide
el core a cualquier proveedor de transcripts. Con el algoritmo confirmado, el método central
ya NO es "listar sesiones nuevas desde cuándo" (eso era del matcher de fondo descartado) sino
"buscar sesiones por teléfono en una ventana de tiempo". La IA prepara el tipo
`SesionTranscript` y el contexto; Sebastián escribe los métodos de la interfaz (buscar por
teléfono + rango de fechas, traer resumen de una sesión puntual, qué más hace falta).
Trade-off a considerar: interfaz mínima (1-2 métodos) es fácil de mockear y de implementar
para el próximo proveedor; interfaz gorda acopla.

**Pasos:**

- [ ] **Paso 1: la IA prepara** `app/core/ports/transcript.ts`:

```ts
// El core define QUE necesita de un proveedor de transcripts, no COMO se obtiene.
export type SesionTranscript = {
  proveedor: string;
  transcriptId: string;
  titulo: string;
  fecha: string;
  resumen: string | null;
  url: string | null;
};

export interface TranscriptAdapter {
  buscarCandidatas(terminos: string[], desde: string, hasta: string): Promise<SesionTranscript[]>;
}
```

**CERRADA (2026-07-06).** Firma final distinta a la propuesta original ("buscar por
teléfono"): verificado en vivo contra el spec real de Granola (`openapi.json` completo) y 10
notas reales de dos cuentas, el teléfono NO es un campo estructurado en ningún endpoint — a
veces aparece como texto libre en `summary_text`, a veces no. El método final recibe una
lista de TERMINOS (nombre de empresa, alias, teléfono si se conoce) y el adaptador busca
cualquiera de ellos en título+resumen; el teléfono se compara solo-dígitos (formatos reales
vistos: `+57 321 636 6599`, `+573216366599`, ambos deben matchear). Base real de la API:
`https://public-api.granola.ai` (la doc no la publica directo, solo aparece en el
`openapi.json`; `api.granola.ai` da 404).

- [x] **Paso 2:** interfaz cerrada junto con Sebastián tras revisar datos reales.
- [x] **Paso 3: test con doble (mock) del puerto** en `app/core/ports/transcript.test.ts`.
- [x] **Paso 4: GranolaAdapter real** en `app/adapters/granola.ts`: encadena listar (sin
      resumen) + detalle (con `summary_text`/`web_url`) por candidata en la ventana, con
      paginación por cursor. Nunca pide `?include=transcript`.
- [x] **Paso 5: PAUSA, resuelta.** API key real probada en vivo (dos keys, workspace y
      personal — la personal es la correcta para el diseño de credencial-por-usuario de
      V3.1b). Verificado con 10 notas reales + 4 detalles: formato de título varía por
      persona (`"{Empresa} - {tipo} {fecha} ({contacto})"` vs `"Phone call with {contacto} -
      {empresa}"`), el teléfono aparece en `summary_text` sin patrón fijo. Encontrado un caso
      real de dos notas con el mismo título a 11 segundos de diferencia (Granola partiendo un
      intento fallido en dos documentos) — confirma que la fusión por proximidad de V3.4 es un
      caso real, no hipotético.
- [x] **Paso 6: checkpoint (informal, checkpoints formales en pausa por pedido de
      Sebastián).** Con TLDv: se escribe `app/adapters/tldv.ts` nuevo implementando el mismo
      `TranscriptAdapter`; no se toca `app/core/` ni el matcher (V3.4). `transcript_proveedor`
      en la fila del `toque` queda como dato.
- [ ] **Paso 7: commit.**

**Pendiente para V3.4:** el nombre de empresa en Granola viene corto/informal ("Cabletelco",
no "Cabletelco S.A.S."). El matcher debe pasar como términos el nombre oficial, el
normalizado, TODOS los `empresa_alias` de esa empresa, y el teléfono del contacto — no solo
el nombre oficial, o muchos matches reales fallarían.

### Tarea V3.4 · Matcher: candidatas por teléfono + confirmación en el toque

**Archivos:**
- Crear: `app/core/matcher.ts`, `app/core/matcher.test.ts`, acción + UI de "buscar grabación"
  / "confirmar grabación" colgadas de la pantalla de un toque ya registrado (no hay pantalla
  de cola nueva: es parte del detalle del toque que Sebastián ya usa)
- Modificar: `app/llamada/[id]/actions.ts` o donde viva el flujo post-registro del toque,
  `app/db/repository.ts` (no hace falta tabla nueva: se reutilizan `transcriptProveedor`,
  `transcriptId`, `transcriptUrl` y `quePaso` que ya existen en `toque`)

**Aprendizaje:** el modo de fallo número uno del plan sigue siendo enlazar mal, pero ya no es
"a qué empresa pertenece" (eso lo sabe Sebastián al registrar el toque) sino "cuál de las
grabaciones encontradas es la correcta, y si dos son en realidad la misma llamada partida por
Granola en dos documentos". Por eso no hay auto-enlace nunca, ni con una sola candidata: el
matcher arma la lista, Sebastián confirma.

**Tu código (5-10 líneas): el criterio de agrupar y fusionar candidatas.** Los números ya
están confirmados (bloques de 15 minutos para intentos del mismo día, fusión a 1 hora para
sesiones con contenido real que son la misma llamada partida). Lo que decide Sebastián es
CÓMO se aplican dado un listado crudo de candidatas del mismo teléfono: cuándo dos sesiones
cuentan como "la misma llamada" vs "dos intentos reales distintos", y qué se muestra cuando
hay más de una candidata que no fusiona (¿lista para elegir? ¿la más cercana en el tiempo
gana?). La IA prepara la firma:
`agruparCandidatas(candidatas: SesionTranscript[], fechaToque: string): CandidataOFusion[]`.

**Pasos:**

- [ ] **Paso 1: test que falla.** En `app/core/matcher.test.ts`:

```ts
test('dos sesiones del mismo telefono a 20 min con contenido real se fusionan en una', () => {
  const candidatas = [sesion({ fecha: '2026-07-04T10:00:00' }), sesion({ fecha: '2026-07-04T10:20:00' })];
  const resultado = agruparCandidatas(candidatas, '2026-07-04T10:15:00');
  assert.strictEqual(resultado.length, 1);
});

test('sesion de otro dia no entra como candidata', () => {
  const candidatas = [sesion({ fecha: '2026-07-01T10:00:00' })];
  const resultado = agruparCandidatas(candidatas, '2026-07-04T10:15:00');
  assert.strictEqual(resultado.length, 0);
});
```

- [x] **Paso 2: `agruparCandidatas` implementada** (`app/core/matcher.ts`). Simplificación
      respecto al borrador: primero se descartan las candidatas SIN contenido real (resumen
      vacío, no aportan nada para confirmar), y solo entre las que quedan se aplica la fusión
      a 1 hora (se queda con el resumen más largo). Ventana máxima de 12h respecto a la fecha
      del toque. Validado contra el caso real de "Janeth Socia Sas" (dos notas a 11 segundos,
      ambas sin contenido — no llegarían a esta función porque `no_contesto` nunca busca).
- [x] **Paso 3: tests verdes.** 5 tests en `matcher.test.ts`, incluido el caso real.
- [x] **Paso 4: flujo síncrono implementado**, ajustado a la UI real (la ruta `/llamada/[id]`
      es por EMPRESA, no por toque; no existe pantalla de detalle de un toque individual —
      se colgó del historial "Toques anteriores" que ya existe en esa misma página):
      - `terminosBusquedaTranscript(idToque)` (Repository): arma términos (nombre oficial,
        normalizado, todos los `empresa_alias`, teléfono del contacto) + fecha del toque.
      - `buscarGrabacionAction(idToque)`: solo lectura, ventana de ±12h, usa el
        `GranolaAdapter` con la credencial del USUARIO EN SESIÓN (no del toque).
      - `confirmarGrabacionAction(idEmpresa, idToque, candidata)`: escribe con
        `confirmarTranscript` (Repository) y revalida la página de la empresa.
      - `BuscarGrabacion.tsx` (client component): botón "Buscar grabación" solo aparece si
        `canal=llamada`, resultado en `RESULTADOS_CONTESTO` (nueva constante en
        `validation.ts`) y el toque no tiene `transcriptId` todavía.
- [ ] **Paso 5: prueba end-to-end en vivo** — PENDIENTE, requiere sesión real (mismo límite
      que el cierre de Fase 2: la IA no pide ni maneja la contraseña de Sebastián). Verificado
      hasta donde se pudo sin login: compila sin errores (`tsc` limpio), la ruta responde y
      redirige a `/login` sin crashear, 32/32 tests unitarios verdes, sin violación de capas.
- [x] **Paso 6: commit.**

### Tarea V3.5 · Worker B7 con heartbeat (solo outbox)

**Archivos:**
- Crear: `app/worker/index.ts`, `app/worker/worker.test.ts`, `docs/launchd.md` (plist
  documentado)
- Modificar: `package.json` (script `"worker"` + glob de test)

**Aprendizaje:** por qué un proceso aparte y no setInterval dentro de Next (deploy de Next
no mata el worker, y el worker no muere con el dev server). Catch-up-first: al arrancar
procesa TODO lo atrasado antes de dormir, porque el laptop pasa apagado. Con el matching de
Granola movido a on-demand (V3.4), este worker queda con UNA sola tarea real por ahora
(drenar el outbox a Notion); el `for` de tareas se deja preparado para que cadencias y
tracking se enchufen en fases 4 y 5 sin rediseñarlo.

**Tu código (5-8 líneas): política de aislamiento de errores.** Con una sola tarea hoy el
trade-off es menos dramático, pero define el patrón para cuando se sumen más: si una tarea
truena, ¿las demás corren igual o el ciclo aborta? Trade-off: aislar mantiene lo demás al
día aunque una tarea esté caída; abortar es más simple de razonar pero un fallo puntual
congela todo el ciclo. La IA prepara el loop con el slot en el `for` de tareas.

**Pasos:**

- [ ] **Paso 1: esqueleto del loop** (la IA):

```ts
const TAREAS = [tareaOutbox]; // cadencias y tracking se enchufan en fases 4 y 5

async function ciclo() {
  for (const tarea of TAREAS) {
    // TU CODIGO: manejo de error por tarea (aislar vs abortar) + heartbeat en conector
  }
}

async function main() {
  await ciclo(); // catch-up-first: primera pasada inmediata al arrancar
  setTimeout(function otra() { ciclo().finally(() => setTimeout(otra, INTERVALO_MS)); }, INTERVALO_MS);
}
```

- [x] **Paso 2: política de aislamiento implementada** (aislar, no abortar — decisión ya
      confirmada en el batch de decisiones de esta sesión). `registrarHeartbeatConector`
      nueva en el Repository (upsert, mismo patrón que `guardarCredencialConector`: SQLite no
      fusiona NULLs en el UNIQUE index, lookup explícito). Cada tarea tiene su propio
      `proveedorHeartbeat` (hoy solo `outbox` → `notion`), así que una tarea rota no pisa el
      heartbeat de otra cuando se sumen más en fases 4/5.
- [x] **Paso 3: tests del heartbeat verdes** (3 tests: éxito, error aislado, una rota no
      bloquea a las demás).
- [x] **Paso 4: prueba manual contra la DB real** (no simulada): corrí `npm run worker`,
      maté el proceso a los 2 segundos, y el heartbeat de `notion` ya estaba escrito con
      `ultimo_resultado='ok'` — confirma catch-up-first de verdad, no solo en el test. De
      paso until encontré y arreglé un bug real: el script `"worker"` en `package.json` no
      tenía el `--experimental-loader` que resuelve imports sin extensión (mismo problema que
      resuelve `scripts/resolve-ts-ext.mjs` para los tests) — sin eso, el worker no arrancaba
      nunca en producción real, solo bajo el test runner. `tareaOutbox` hoy es un no-op: no
      hay nada que drenar todavía sin `NotionAdapter` (V3.7).
- [x] **Paso 5: `docs/launchd.md` documentado** (plist, comandos, nota de que
      `FOLLOWUPS_CRYPTO_KEY` tiene que ir en `EnvironmentVariables` del plist porque launchd
      no hereda `.env.local`). Sin instalar.
- [x] **Paso 6: commit.**

### Tarea V3.6 · Confirmación repetible: qué es sagrado una vez tocado por humano

**Archivos:**
- Crear: `app/core/confirmarTranscript.ts`, `app/core/confirmarTranscript.test.ts`
- Modificar: `app/db/repository.ts` (la escritura de confirmación de V3.4 se apoya en esta
  función; no hay worker involucrado, es parte de la misma acción síncrona)

**Aprendizaje:** el problema de idempotencia cambió de tamaño (ya no hay un worker
reprocesando sesiones a ciegas) pero no desaparece: Sebastián puede volver a un toque ya
confirmado y pedir "buscar de nuevo", o hacer doble clic en confirmar. La invariante "nunca
se pisa lo que un humano ya escribió a mano" sigue viva.

**Tu código (5-8 líneas): qué se actualiza en una reconfirmación.** Si el toque ya tiene
transcript confirmado y Sebastián busca otra vez, ¿se puede reemplazar? ¿Y si ya editó
`que_paso` a mano después de la primera confirmación? Decisión de dominio: qué campos
refresca una nueva confirmación y cuáles quedan intocables una vez el humano los tocó.

**Pasos:**

- [ ] **Paso 1: test que falla primero:**

```ts
test('confirmar dos veces la misma sesion no duplica nada, solo actualiza el puntero', async () => {
  const sesion = { proveedor: 'granola', transcriptId: 't-1', titulo: 'Redes del Norte',
    fecha: '2026-07-04', resumen: 'hablamos de precios', url: null };
  await confirmarTranscript(idToque, sesion, deps);
  await confirmarTranscript(idToque, sesion, deps);
  const t = await deps.repo.toque(idToque);
  assert.strictEqual(t.transcriptId, 't-1');
});

test('que_paso editado a mano no se pisa en una reconfirmacion', async () => {
  await confirmarTranscript(idToque, sesionBase, deps);
  await deps.repo.actualizarQuePaso(idToque, 'edite esto a mano');
  await confirmarTranscript(idToque, { ...sesionBase, resumen: 'resumen nuevo de granola' }, deps);
  const t = await deps.repo.toque(idToque);
  assert.strictEqual(t.quePaso, 'edite esto a mano');
});
```

- [x] **Paso 2: política escrita por Sebastián.** Si `actual.transcriptId === sesion.transcriptId`
      (misma grabación ya confirmada antes): solo `escribirSoloPuntero` (refresca
      proveedor/id/url, `quePaso` queda intocable — territorio humano desde la primera
      confirmación). Cualquier otro caso (primera vez, o grabación distinta elegida a
      propósito): `escribirCompleto`, se reescribe todo.
- [x] **Paso 3: tests verdes + tsc limpio.** 4 tests (primera confirmación, doble
      confirmación misma sesión, edición humana preservada, grabación distinta sí
      refresca `quePaso`) + 39/39 de la suite completa.
- [x] **Paso 5: commit.** (Checkpoints formales en pausa por pedido de Sebastián — nota de
      proceso: la garantía de idempotencia del diseño viejo era un índice único
      `proveedor+transcript_id`; acá no hace falta porque no hay worker escribiendo a
      ciegas — cada escritura pasa por esta política antes de tocar la DB.)

### Tarea V3.7 · Outbox a Notion

**Archivos:**
- Crear: `app/core/ports/sync.ts` (puerto), `app/adapters/notion.ts`, `app/core/outbox.ts`,
  `app/core/outbox.test.ts`
- Modificar: `app/db/repository.ts` (escribir outbox en la misma transacción que el cambio;
  drenar), `app/worker/index.ts` (tareaOutbox real)

**Aprendizaje:** el patrón outbox completo: por qué la fila nace en la misma transacción,
por qué el drenado reintenta con backoff, y por qué `sync_cambios` guarda el rastro. Regla
de la constitución: DB -> Notion una sola vía, nadie edita Notion a mano.

**Tu código (5-8 líneas): la política de backoff.** Firma preparada:
`calcularProximoIntento(intentos: number, ahora: Date): Date`. Decisión: exponencial puro,
con tope, con cuántos intentos antes de marcar `fallido` definitivo. Trade-off: reintentos
agresivos golpean rate limits de Notion; tímidos dejan la fila pendiente días si el laptop
duerme.

**Pasos:**

- [ ] **Paso 1: test de idempotencia del drenado que falla primero:**

```ts
test('drenar dos veces manda a Notion UNA vez', async () => {
  const notion = notionFalso(); // cuenta llamadas
  await repo.conOutbox((tx) => tx.actualizarEmpresa('e1', { proximoPaso: 'llamar' }));
  await drenar(repo, notion);
  await drenar(repo, notion);
  assert.strictEqual(notion.llamadas.length, 1);
});

test('fallo de red deja la fila pendiente con reintento programado', async () => {
  const notion = notionQueFalla();
  await repo.conOutbox((tx) => tx.actualizarEmpresa('e1', { proximoPaso: 'llamar' }));
  await drenar(repo, notion);
  const fila = await repo.outboxPendientes();
  assert.strictEqual(fila[0].intentos, 1);
  assert.ok(fila[0].proximoIntento);
});
```

- [x] **Paso 2: puerto `SyncAdapter` + `NotionAdapter`** (`app/core/ports/sync.ts`,
      `app/adapters/notion.ts`). Tipos de propiedad verificados EN VIVO contra el schema real
      del "Sales Pipeline" (conector de Notion ya autorizado en esta sesión, sin tocar la key
      de producción): `Notas Discovery` y `Próximo Paso` son `text`, `Fecha Próximo Paso` es
      `date`. **`Estado` es tipo `status`** (no texto/select simple) — fuera de alcance de
      este primer corte a propósito: mapear mal un status en un CRM compartido por todo el
      equipo es más caro que no sincronizarlo todavía. Base real: `https://api.notion.com`,
      header `Notion-Version` (valor sin verificar en vivo, pendiente del Paso 5).
- [x] **Paso 3: drenado implementado** (`app/core/outbox.ts`): estado `aprobado` -> `enviado`
      o reintento programado, log en `sync_cambios` en ambos casos. Idempotente por
      construcción (una fila ya `enviado` no vuelve a aparecer en `outboxPendientes`).
- [x] **Paso 4: `calcularProximoIntento` implementada** — backoff 1min/5min/30min/2h/12h,
      tope en 12h, 5 intentos antes de `fallido` definitivo (según lo ya acordado en el batch
      de decisiones de esta sesión).
- [x] **Repository conectado:** `registrarToque` y `escribirTranscriptCompleto` encolan en
      `outbox` DENTRO de su propia transacción — pero SOLO si `empresa.notion_page_id` ya
      está enlazado; si no, se omite en silencio (nada que sincronizar todavía). `tareaOutbox`
      del worker (V3.5) ahora llama al drenado real. 8 tests nuevos de Repository + outbox,
      48/48 de la suite completa.
- [ ] **Paso 5: PAUSA — sigue pendiente, requiere a Sebastián específicamente (no es código):**
      1. El token real de Notion (integration token, no la API key de Granola). 2. **El
      enlace inicial `empresa.notion_page_id`**: nunca se construyó el script que vincula cada
      `empresa` a su página real de Notion (quedó pendiente desde V3.3/V3.4 — hay 4 nombres
      duplicados reales, no se puede automatizar sin criterio humano para esos casos). Sin
      ninguna empresa enlazada, el outbox nunca tiene a dónde escribir: el código está
      completo y probado con dobles, pero cero verificado contra Notion real todavía.
- [x] **Paso 6: commit.**

### Tarea V3.8 · Pantalla de conectores

**Archivos:**
- Crear: página de conectores (ruta según convención de app/ existente) + server actions
- Skills: `taste-skill` + `tailwindcss-development`

**Aprendizaje:** ligero. Cómo el heartbeat de V3.5 se vuelve semáforo sin mirar logs.
Sin slot de Tu código: es UI sobre datos que ya existen.

**Pasos:**

- [x] **Paso 1: `estadoConector` en el Repository** — nunca descifra, solo
      `tieneCredencial/estado/ultimaCorrida/ultimoResultado`. Semáforo en la UI: gris (sin
      configurar), ámbar (configurado, sin corridas), verde (`ok`), rojo (`ultimoResultado`
      empieza con `error`).
- [x] **Paso 2:** `app/conectores/page.tsx` + `actions.ts`. Granola: cualquier usuario ve/edita
      SU credencial (`idUsuario` de la sesión). Notion: todos ven estado + link al CRM real,
      SOLO admin ve el formulario de edición (gate doble: UI lo oculta, la action también
      revisa `sesion.admin` antes de escribir).
- [x] **Verificado EN VIVO** con sesión real de Sebastián (no simulada): login real, guardé
      la credencial personal de Granola desde el formulario real, confirmé en la DB real que
      quedó cifrada (`credencial_ciphertext` no es texto plano) y con el `id_usuario` correcto
      de Better Auth. Encontré y arreglé 3 bugs reales en el camino, ninguno visible solo con
      tests:
      1. `.env.local` nunca tuvo `FOLLOWUPS_CRYPTO_KEY` — el fail-fast de V3.2 funcionó
         exactamente como se diseñó (bloqueó el guardado con el mensaje correcto), pero
         reveló que el entorno real nunca se terminó de configurar. Agregada.
      2. Probé el flujo completo "Buscar grabación" con un toque real (temporal, borrado
         después de probar): la API de Granola respondió 400 porque `page_size` real es
         máximo 30, no 100 como asumí en V3.3 sin verificarlo contra ese parámetro puntual.
      3. El nombre de empresa real (`nombre_normalizado`) trae el sufijo legal ("digital
         coast s a s"), pero Granola solo dice "digital coast" — sin quitar el sufijo, CERO
         empresas con razón social matchearían nunca. Agregado `quitarSufijoEmpresa`.
      La UI del semáforo y el guardado cifrado quedaron confirmados en pantalla real; el
      ciclo completo botón→acción→Granola real quedó probado por el error 400 real que
      diagnostiqué y corregí (no una simulación).
- [x] **Paso 4: commit.**

### Tarea V3.9 · Toque independiente (fuera de la cola del día)

Feature nueva que salió durante el diseño del matcher, dejada para el final a propósito
(pedido explícito de Sebastián): no bloquea nada de lo anterior y no tiene relación con
Granola/Notion.

**Archivos:**
- Crear: botón + acción "agregar toque" en la ficha de una empresa (o donde tenga más
  sentido según la UI existente), reusando `registrarToqueAction`/`registrarToque` de
  Fase 1 sin duplicar lógica
- Skills: `taste-skill` + `tailwindcss-development` para la UI

**Aprendizaje:** ligero, es UI sobre una función del core que ya existe. El único matiz de
dominio: este toque es para alguien que NO es lead de la cola normal (cliente existente u
otra relación) — no debe alterar los contadores ni la cadencia de leads en seguimiento.

**Pasos:**

- [x] **Paso 1: decidido** (constraint de tiempo de Sebastián, decisión tomada directo):
      pantalla nueva `/toque-independiente` con búsqueda por nombre (`buscarEmpresasPorNombre`,
      sin filtro de owner/follow-up) que enlaza a la MISMA ficha `/llamada/[id]` que ya existe
      — no hizo falta tocar esa ficha, `getCuenta(id)` ya funcionaba para cualquier empresa,
      no solo las de la cola.
- [x] **Paso 2: cero lógica de dominio nueva.** `CaptureForm`/`registrarToqueAction`/
      `registrarToque` sin ningún cambio, reusados tal cual.
- [x] **Paso 3: verificado con test + en vivo.** Test de Repository confirma que un cliente
      sin owner/follow-up no aparece en `colaDelDia()` ni en `contadoresHoy()` de nadie.
      Verificado también en pantalla real (sesión de Sebastián): búsqueda "digital" trajo 20+
      empresas reales, clic en una (`@DIGITAL GROUP SAS`, fuera de cualquier cola hoy) abrió
      la ficha completa con el `CaptureForm` listo, igual que cualquier lead.
- [x] **Paso 4: commit.**

### Tarea V3.10 · Cierre de fase 3

- [x] **Paso 1:** 53/53 tests verdes, `npx tsc --noEmit` limpio.
- [x] **Paso 2: demo en vivo, parcial.** Verificado con sesión real de Sebastián: guardado
      cifrado de credencial (Granola personal, Notion global) confirmado contra la DB real;
      ficha `/llamada/[id]` funciona para cualquier empresa (V3.9); el ciclo
      botón→acción→Granola real quedó probado por el error 400 real que salió y se corrigió
      (page_size). Lo que NO se logró: un clic limpio en el navegador mostrando las
      candidatas en pantalla (fricción de tooling de clic remoto, no bug de la app
      identificado — ver nota en `CONTINUAR-IMPLEMENTACION.md`). Un toque `no_contesto`
      nunca ofrece el botón de buscar: confirmado por código (`RESULTADOS_CONTESTO` en
      `validation.ts` lo excluye) y por test, no por clic en vivo.
- [x] **Paso 3: `/code-review` corrido.** 7 hallazgos (0 críticos), 6 corregidos (fusión de
      cadenas de 3+ sesiones rota, timeout de Notion, truncado silencioso de rich_text, error
      oculto en `BuscarGrabacion`, concurrencia sin límite contra Granola, paginación que
      podía saltarse la ventana buscada), 1 aprovechado para limpiar un patrón de estilo
      (em dash) en los 13 archivos nuevos de la sesión, no solo el señalado. 0 descartados.
- [x] **Paso 4:** bitácora en `planeacion-ejecucion.md`, `tasks-v2.md` marcado (con nota de
      que su detalle quedó desactualizado, apunta acá), `CONTINUAR-IMPLEMENTACION.md`
      actualizado (próxima acción: Fase 4).
- [ ] **Paso 5: checkpoint final de aprendizaje — PENDIENTE.** No se hizo en esta sesión:
      Sebastián pidió explícitamente saltarse los checkpoints por un constraint de tiempo
      fuerte. Queda para retomar cuando haya espacio, o se da por asumido si no se vuelve a
      pedir.

---

## Verificación de capas (regla de cada tarea, no solo del cierre)

Al cerrar cada tarea, correr el check de aislamiento: nada en `app/core/` importa de
`app/adapters/`, `app/db/` ni `better-sqlite3`/`drizzle-orm`. Grep rápido:

```bash
grep -rn "from '.*adapters\|from '.*db/\|better-sqlite3\|drizzle" app/core/ && echo "VIOLACION" || echo "core limpio"
```
