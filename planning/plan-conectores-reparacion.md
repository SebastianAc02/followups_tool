# Conectores: la credencial vieja, la línea fantasma y los botones que no preguntan

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:executing-plans para
> ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** que Sebastián pueda borrar todos sus conectores y reconectarlos desde cero —
Gmail y WhatsApp — sin encontrarse un error de Evolution, un botón que no pregunta, ni una
línea que dice "Conectada" cuando no existe.

**Arquitectura:** casi nada de esto es un bug de lógica. Son dos datos podridos (una
credencial vieja y una fila fantasma) más tres huecos de UI. El código que ya existe está
bien: `estadoConexion` YA sabe mapear una instancia inexistente a `caida`, y
`useConfirm`/`ConfirmDialog` YA existen. La mayoría del trabajo es conectar piezas que ya
están, no escribirlas.

**Stack:** Next.js server actions + `useConfirm` (app/ui), Evolution API v2 vía
`app/adapters/evolution.ts`, isps.db en el VPS.

---

## Antes que nada: yo rompí algo, y hay que repararlo

Al re-sincronizar la DB a producción (2026-07-15 22:11 UTC, Parte D del plan de fechas)
traje las tablas de NEGOCIO de local y solo preservé las de IDENTIDAD. `conector`,
`conector_config` y `linea_whatsapp` son tablas de negocio: **le pasé por encima a tu
sesión de pruebas de las 22:08.**

Medido contra el backup pre-swap (`/data/prod-backup-fresh-20260715.db`):

| Fila | Prod 22:08 (tu sesión) | Prod ahora (post-swap) | |
|---|---|---|---|
| `conector_config` gmail | `updated_at` 22:08:14 | `2026-07-15T03:59:22` | revertido |
| `conector_config` whatsapp | `updated_at` 22:08:59 | `2026-07-09T20:48:56` | revertido |
| `conector` gmail | `ultimo_resultado='ok'` | `'pendiente_confirmacion'` | **regresión** |

La única pérdida real es la última fila: **Gmail estaba verificado y lo devolví a
"pendiente de confirmar"**. Lo demás quedó igual (habilitado=1 en los dos casos).

Esto cambia dos cosas del diagnóstico:

1. **"Quitar conector no hace nada" NO está probado como bug.** Los timestamps de las
   22:08:14 y 22:08:59 prueban que tus clics de quitar/agregar SÍ escribieron a la DB. Y
   entre las 22:11 y 22:13 yo tuve `followups_web` APAGADO para hacer el swap. La
   hipótesis más probable es que le diste clic contra un contenedor caído o justo cuando
   le cambié la DB por debajo. Hay que **re-probarlo** (Task B2) antes de tocar código.
2. La lección va a memoria: la lista de tablas de identidad del re-sync está incompleta.

---

## Hallazgos medidos (2026-07-15, no re-diagnosticar)

### 1. La credencial de WhatsApp en `/conectores` no es la de Evolution

```
credencial whatsapp en la DB: largo = 64
AUTHENTICATION_API_KEY global: largo = 64
>>> SON LA MISMA: false
GET /instance/fetchInstances con la de la DB -> 401
```

Es una llave vieja (de antes de que se redesplegara Evolution). **Esta sola causa explica
el 401 de "Verificar estado"** y bloquea "Agregar otro número" (`iniciarConexion` arranca
llamando a `fetchInstances`).

### 2. Evolution tiene CERO instancias: la línea 573105182997 es un fantasma

```
GET /instance/fetchInstances con la llave buena -> 200
instancias reales: []
```

`linea_whatsapp` id=1 apunta a `referencia_proveedor='prueba'` con `estado='activa'`. La
instancia `prueba` era del Fase 0 manual (2026-07-10) y ya no existe. La fila quedó
mintiendo: punto verde + "Conectada" + botón "Probar conexión", todo sobre una instancia
que Evolution no conoce. Explica los dos 404 (`logout/prueba`, `sendText/prueba`) y el
"no mandó nada".

Existe idéntica en local y en prod: **no la causó el swap**, es de verdad.

### 3. Por qué un error es 401 y el otro 404 (no son dos bugs)

Evolution resuelve la instancia ANTES de validar la apikey. Las rutas por-instancia
(`logout/prueba`, `sendText/prueba`) mueren en "no existe" (404) sin llegar a quejarse de
la llave. `fetchInstances` es global, valida la llave de una, y devuelve 401. **Un solo
par de causas (llave vieja + fila fantasma) explica los tres síntomas.**

### 4. El auto-sanado ya existe, el 401 lo tapa

`evolution.test.ts:214` ya prueba que `estadoConexion('linea-fantasma')` devuelve `'caida'`
(el `find` no encuentra la instancia → `mapearEstado(undefined)` → `caida`). O sea: con la
llave correcta, **"Verificar estado" solo ya arregla el punto verde**. Lo que falta es que
`desconectar` y `enviarPaso` hagan lo mismo en vez de dejar la fila mintiendo.

### 5. Gmail: no hay forma de re-probar una vez verificado

`GmailConector.tsx:34-40`: si `ultimoResultado === 'ok'`, el componente devuelve un `<p>`
y nada más. Los botones "Reenviar prueba" y "Sí, llegó — confirmar" solo existen en la
rama `pendiente_confirmacion`. La acción `reenviarPruebaGmailAction` YA existe y funciona:
está escrita y es inalcanzable. Eso es el "no me deja probarlo".

### 6. "Quitar conector" no borra la credencial

`quitarConfigConector` (repository.ts:1031) solo hace `habilitado = 0`. La fila de
`conector` con la credencial cifrada queda intacta. Al re-agregar, `agregarConfigConector`
revive con `habilitado = 1` y la credencial sigue ahí → Gmail vuelve **ya conectado**,
sin pasar por OAuth. Eso es el "no me deja volver a agregarlo [desde cero]".

### 7. Ningún botón destructivo pregunta

`ConectorRow.tsx:119-124` ("Quitar conector") y `LineasWhatsapp.tsx:194-204`
("Desconectar") son `<form action={...}>` planos. `useConfirm` + `ConfirmDialog` ya existen
en `app/ui/` y ya se usan en `CampanaCard.tsx:61`. Nadie los cableó acá.

### 8. Lo que NO está roto (verificado, no tocar)

- La red Docker: `evolution_api` y `followups-web` se resuelven mutuamente. El webhook
  (`http://followups-web:3000/api/webhooks/whatsapp`) puede llegar.
- El permiso de Felipe: ya lo cerraste tú ("si lo quito como administrador, a él se le
  quita"). Fuera de alcance.
- El formato del destino: `probarLineaAction` hace `.replace(/\D/g, '')`, así que `+1 236…`
  SÍ hubiera funcionado. No mandó nada por el 404, no por el formato. Igual falta el hint.

---

## Fuera de alcance

- Permisos de Felipe sobre conectores (cerrado por Sebastián: funciona como debe).
- Las 20 filas huérfanas de `foreign_key_check` (preexistentes, ver plan de fechas).
- Partes B y C del `plan-cola-invisible-y-splits.md` (owner con coma, los 4 splits).

---

# PARTE 0: reparar y destrabar (ops, sin código)

Sin esto no se puede probar nada: hoy toda llamada a Evolution muere en 401.

### Task 0.1: Devolver Gmail a "verificado" (deshacer mi regresión)

**Files:** isps.db en el VPS (prod)

- [ ] **Step 1: Confirmar que sigue en pendiente**

```bash
ssh deploy@62.238.55.238 "docker exec -w /app followups_web node -e \"
const D=require('better-sqlite3');const db=new D('/data/isps.db',{readonly:true});
console.log(db.prepare(\\\"SELECT proveedor,ultimo_resultado FROM conector WHERE proveedor='gmail'\\\").all());
\""
```

Esperado: `ultimo_resultado: 'pendiente_confirmacion'`.

- [ ] **Step 2: Restaurar el valor que había antes del swap, con su porqué en sync_cambios**

El valor correcto (`'ok'`) sale del backup pre-swap, no de una suposición.

```bash
cat > /tmp/fix-gmail.js <<'EOF'
const D = require('better-sqlite3');
const db = new D('/data/isps.db');
const antes = new D('/data/prod-backup-fresh-20260715.db', { readonly: true });
const bueno = antes.prepare("SELECT ultimo_resultado FROM conector WHERE proveedor='gmail'").get();
antes.close();
if (bueno.ultimo_resultado !== 'ok') throw new Error('El backup no dice ok: ' + JSON.stringify(bueno));
const tx = db.transaction(() => {
  db.prepare("UPDATE conector SET ultimo_resultado='ok' WHERE proveedor='gmail'").run();
  db.prepare(
    `INSERT INTO sync_cambios (corrida,fuente,entidad,id_registro,accion,detalle)
     VALUES ('reparar-gmail-post-swap','manual','conector','gmail','update',
             'restaurar ultimo_resultado=ok: el re-sync del 2026-07-15 22:11 trajo las tablas de negocio de local y revirtio la verificacion que Sebastian ya habia hecho en prod a las 22:08')`,
  ).run();
});
tx();
console.log('gmail:', db.prepare("SELECT ultimo_resultado FROM conector WHERE proveedor='gmail'").get());
db.close();
EOF
scp /tmp/fix-gmail.js deploy@62.238.55.238:/tmp/fix-gmail.js
ssh deploy@62.238.55.238 "docker cp /tmp/fix-gmail.js followups_web:/app/fix-gmail.js && docker exec -w /app followups_web node fix-gmail.js"
```

Esperado: `gmail: { ultimo_resultado: 'ok' }`.

### Task 0.2: La credencial de Evolution

**DECIDIDO (2026-07-15): pegar la llave buena.** Rotar queda para el día que haya sospecha
real de filtración.

- [ ] **Step 1: Leer la llave del contenedor**

```bash
ssh deploy@62.238.55.238 "docker inspect evolution_api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^AUTHENTICATION_API_KEY='"
```

- [ ] **Step 2: Pegarla desde la UI, no por SQL**

En `/conectores` → WhatsApp → pegar en el campo de credencial → Guardar. Va por
`guardarCredencialAction` → `cifrar()` con `FOLLOWUPS_CRYPTO_KEY`. **No escribirla por SQL:**
la columna guarda ciphertext AES-256-GCM, un valor en texto plano ahí adentro rompe
`descifrar()` para siempre.

- [ ] **Step 3: Verificar que el 401 murió**

En `/conectores` → WhatsApp → "Verificar estado" en la línea 573105182997.

Esperado: **ya no sale el 401**, y el estado pasa de "Conectada" a **"Caída"** solo — eso
es el auto-sanado del hallazgo 4 haciendo su trabajo (la instancia `prueba` no existe, así
que Evolution la reporta ausente y la fila se corrige sola). Si esto pasa, medio plan se
confirmó sin escribir una línea.

### Task 0.3: La línea fantasma

**DECIDIDO (2026-07-15): borrar la fila.** `linea_whatsapp` id=1 (573105182997 → instancia
`prueba`, inexistente) es basura del Fase 0 del 2026-07-10, sin mensajes reales colgando.
Es la única opción que deja probar de verdad el "reconectar desde cero" de la Parte B.

- [ ] **Step 1: Backup antes de escribir** (la DB está en WAL, `cp` NO sirve)

```bash
ssh deploy@62.238.55.238 "docker exec -w /app followups_web node -e \"
const D=require('better-sqlite3');const db=new D('/data/isps.db');
db.exec(\\\"VACUUM INTO '/data/pre-limpieza-lineas-20260715.db'\\\");db.close();console.log('backup ok');
\""
```

- [ ] **Step 2: Borrar la fila, en una transacción y con su porqué**

```bash
cat > /tmp/borrar-fantasma.js <<'EOF'
const D = require('better-sqlite3');
const db = new D('/data/isps.db');
const linea = db.prepare("SELECT * FROM linea_whatsapp WHERE referencia_proveedor='prueba'").get();
if (!linea) throw new Error('No hay fila prueba: ya la borraron, revisar antes de seguir');
const tx = db.transaction(() => {
  db.prepare('DELETE FROM linea_whatsapp WHERE id = ?').run(linea.id);
  db.prepare(
    `INSERT INTO sync_cambios (corrida,fuente,entidad,id_registro,accion,detalle)
     VALUES ('limpieza-linea-fantasma','manual','linea_whatsapp',?,'delete',?)`,
  ).run(String(linea.id), `borrada la linea ${linea.numero} -> instancia 'prueba': Evolution no tiene ninguna instancia (fetchInstances devuelve []), la fila decia 'activa' y mentia. Era del Fase 0 manual del 2026-07-10.`);
});
tx();
console.log('lineas restantes:', db.prepare('SELECT COUNT(*) n FROM linea_whatsapp').get().n);
db.close();
EOF
scp /tmp/borrar-fantasma.js deploy@62.238.55.238:/tmp/borrar-fantasma.js
ssh deploy@62.238.55.238 "docker cp /tmp/borrar-fantasma.js followups_web:/app/bf.js && docker exec -w /app followups_web node bf.js"
```

Esperado: `lineas restantes: 0`.

---

# PARTE A: que la UI deje de mentir (código)

### Task A1: CHECKPOINT de diseño

**Step 1 — DECIDIDO (2026-07-15): "Quitar conector" se parte en DOS acciones.**

Hoy `quitarConfigConector` solo duerme la config (`habilitado=0`) y deja la credencial
cifrada intacta; por eso Gmail vuelve ya-conectado y nunca se puede rehacer el OAuth. La
decisión:

- **"Desactivar"** — lo de hoy (`habilitado=0`, la credencial sobrevive). Toggle rápido,
  reversible, para sacar un conector de la vista del equipo sin perder nada.
- **"Quitar y borrar credencial"** — además borra el secreto (`borrarCredencialConector`,
  Task A4). Es el único camino a "reconectar desde cero" y obliga a rehacer el OAuth.

Las dos preguntan antes (Task A5). Esto define A4 y A5.

- [ ] **Step 2: ¿"La instancia no existe" es un estado del dominio?** (sigue abierta, se
  cierra al escribir la Task A3)

`EstadoLinea = 'calentando' | 'activa' | 'caida'` vive en `app/core/ports/conexion.ts` —
esto es CORE, y es la decisión de diseño de este plan. Cuando Evolution responde
`404 The "X" instance does not exist`, ¿qué es esa línea?

1. **`caida`** (reusar lo que hay). Un solo estado para "no sirve, hay que re-aparear".
   `estadoConexion` ya lo hace así (evolution.test.ts:214). Cero cambios al core.
2. **`no_existe` nuevo.** Distingue "se cayó, puede volver" de "el proveedor la olvidó,
   hay que crearla de nuevo". Más preciso, pero toca el core, el schema y toda la UI que
   pinta estados, por una diferencia que hoy no cambia lo que el usuario HACE (en los dos
   casos: re-aparear).

Recomendación: la **1** para v1 (YAGNI: nada en la UI se comportaría distinto). Pero es tu
llamada de dominio, no mía.

★ Insight ─────────────────────────────────────
El comentario en `desconectarLineaAction:109-111` dice: "Solo se marca 'caida' si Evolution
confirmó el cierre: si la llamada tronó, no sabemos en qué estado quedó la línea y mentir
en la fila es peor que no tocarla". Ese razonamiento es correcto **para un error ambiguo**
(timeout, 500): ahí de verdad no sabés. Pero un `404 instance does not exist` no es
ambigüedad, es **información definitiva**: Evolution te está diciendo que esa línea no
existe. Tratar los dos igual es lo que dejó la fila en verde. La regla buena no es "solo
escribí si hubo éxito", es "escribí cuando sepas algo cierto" — y un 404 es saber algo.
─────────────────────────────────────────────────

### Task A2: El adaptador distingue "no existe" de "tronó algo"

**Files:**
- Modify: `app/adapters/evolution.ts:48-74` (`llamarEvolution`)
- Test: `app/adapters/evolution.test.ts`

- [ ] **Step 1: Escribir el test rojo**

Agregar al final de `app/adapters/evolution.test.ts` (seguir el patrón de fetch falso que
ya usa el archivo; copiar el `stubFetch`/setup del test de arriba, no inventar otro):

```ts
test('ErrorEvolution reconoce el 404 de instancia inexistente y lo distingue de otros errores', async () => {
  const err404 = new ErrorEvolution(
    404,
    '{"status":404,"error":"Not Found","response":{"message":["The \\"prueba\\" instance does not exist"]}}',
    '/instance/logout/prueba',
  );
  assert.strictEqual(err404.instanciaNoExiste, true);
  // El mensaje no cambia: hay tests y UI que lo leen tal cual.
  assert.match(err404.message, /Evolution respondio 404 en \/instance\/logout\/prueba/);

  const err500 = new ErrorEvolution(500, 'boom', '/message/sendText/x');
  assert.strictEqual(err500.instanciaNoExiste, false);
  // Un 404 que NO es de instancia (ruta mal escrita) tampoco cuenta.
  assert.strictEqual(new ErrorEvolution(404, '{"error":"Cannot POST /nope"}', '/nope').instanciaNoExiste, false);
});
```

Agregar `ErrorEvolution` al import del archivo:

```ts
import { crearEvolutionAdapter, parsearMensajeEntrante, iniciarConexionPorQr, ErrorEvolution } from './evolution.ts';
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/evolution.test.ts
```

Esperado: FAIL — `ErrorEvolution is not a constructor` / no exportado.

- [ ] **Step 3: Implementar**

En `app/adapters/evolution.ts`, agregar ANTES de `llamarEvolution`:

```ts
// Evolution resuelve la instancia ANTES de validar la apikey: por eso una llave mala
// contra /instance/logout/X vuelve como 404 ("no existe") y no como 401. Guardar el
// status crudo deja que el que llama decida sin tener que hurgar el texto del Error.
export class ErrorEvolution extends Error {
  constructor(
    readonly status: number,
    readonly cuerpo: string,
    readonly path: string,
  ) {
    // Mensaje IDENTICO al de antes: evolution.test.ts y la UI lo leen tal cual.
    super(`Evolution respondio ${status} en ${path}: ${cuerpo}`);
    this.name = 'ErrorEvolution';
  }

  // 404 + este texto = Evolution no conoce la instancia. Es informacion definitiva
  // (no una ambiguedad como un timeout): quien llama SI puede corregir la fila.
  get instanciaNoExiste(): boolean {
    return this.status === 404 && /instance does not exist/i.test(this.cuerpo);
  }
}
```

Y cambiar el `throw` de `llamarEvolution` (línea ~71):

```ts
  if (!res.ok) {
    const cuerpo = await res.text();
    throw new ErrorEvolution(res.status, cuerpo, path);
  }
```

- [ ] **Step 4: Correr los tests**

```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/evolution.test.ts
```

Esperado: PASS, y los tests viejos (`/Evolution respondio 500/`) siguen verdes.

- [ ] **Step 5: Commit**

```bash
git add app/adapters/evolution.ts app/adapters/evolution.test.ts
git commit -m "feat(evolution): ErrorEvolution tipado, distingue instancia inexistente de error ambiguo"
```

### Task A3: Desconectar y probar corrigen la fila cuando la instancia no existe

**Files:**
- Modify: `app/conectores/lineas-whatsapp-actions.ts:95-154`
- Test: `app/conectores/lineas-whatsapp-actions.test.ts` (nuevo)

- [ ] **Step 1: Escribir el test rojo**

```ts
// A (2026-07-15): la linea 573105182997 apuntaba a la instancia 'prueba', que Evolution
// ya no tiene. desconectar tiraba 404 y dejaba la fila en 'activa' -- punto verde sobre
// una linea que no existe. Un 404 'instance does not exist' NO es ambiguo: es la prueba
// de que la linea murio, y la fila tiene que enterarse.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

test('desconectar una linea cuya instancia ya no existe la deja caida, no activa', async () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO linea_whatsapp (id, numero, tipo, id_usuario, referencia_proveedor, estado)
       VALUES (1, '573105182997', 'personal', 'u1', 'prueba', 'activa')`,
    )
    .run();
  raw.close();

  const { lineaWhatsappPorId } = await import('../db/repository.ts');
  const { marcarCaidaSiNoExiste } = await import('./lineas-whatsapp-actions.ts');
  const { ErrorEvolution } = await import('../adapters/evolution.ts');

  const err = new ErrorEvolution(
    404,
    '{"response":{"message":["The \\"prueba\\" instance does not exist"]}}',
    '/instance/logout/prueba',
  );
  const manejado = marcarCaidaSiNoExiste(1, err);

  assert.strictEqual(manejado, true, 'el 404 de instancia inexistente se maneja');
  assert.strictEqual(lineaWhatsappPorId(1)?.estado, 'caida', 'la fila deja de mentir');
});

test('un error ambiguo (500) NO toca la fila: no sabemos en que estado quedo', async () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO linea_whatsapp (id, numero, tipo, id_usuario, referencia_proveedor, estado)
       VALUES (2, '573001112222', 'personal', 'u1', 'wa-573001112222', 'activa')`,
    )
    .run();
  raw.close();

  const { lineaWhatsappPorId } = await import('../db/repository.ts');
  const { marcarCaidaSiNoExiste } = await import('./lineas-whatsapp-actions.ts');
  const { ErrorEvolution } = await import('../adapters/evolution.ts');

  const manejado = marcarCaidaSiNoExiste(2, new ErrorEvolution(500, 'boom', '/instance/logout/x'));

  assert.strictEqual(manejado, false);
  assert.strictEqual(lineaWhatsappPorId(2)?.estado, 'activa', 'un error ambiguo no cambia la fila');
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/conectores/lineas-whatsapp-actions.test.ts
```

Esperado: FAIL — `marcarCaidaSiNoExiste is not a function`.

- [ ] **Step 3: ⛔ HUECO DE SEBASTIÁN — escribir `marcarCaidaSiNoExiste`**

Esta es la decisión de la Task A1 Step 2 hecha código, y el único pedazo de dominio real
del plan. El andamio va en `app/conectores/lineas-whatsapp-actions.ts`, después de
`puedeTocarLinea`:

```ts
// Un error de Evolution al tocar una linea puede significar dos cosas MUY distintas:
//   - "la instancia no existe" (404): informacion definitiva, la linea murio.
//   - cualquier otra cosa (500, timeout): ambiguo, no sabemos en que estado quedo.
// Devuelve true si el error era del primer tipo y la fila ya se corrigio; false si el
// error era ambiguo y la fila quedo intacta a proposito.
//
// Pista: `e instanceof ErrorEvolution && e.instanciaNoExiste` (Task A2), y la escritura
// va con conEscritura(() => actualizarEstadoLineaWhatsapp(id, 'caida')) -- el candado de
// solo-lectura, mismo patron que las demas escrituras de este archivo.
export function marcarCaidaSiNoExiste(id: number, e: unknown): boolean {
  // TODO(Sebastián): 3-4 líneas.
}
```

Escribilo vos. Es corto a propósito: lo que importa no son las líneas, es que la regla
("escribí cuando sepas algo cierto, no solo cuando haya éxito") quede tuya.

- [ ] **Step 4: Cablearlo en las dos acciones** (esto sí es mecánico)

En `desconectarLineaAction`, cambiar el `catch`:

```ts
  } catch (e) {
    marcarCaidaSiNoExiste(id, e);
    revalidatePath("/conectores");
    return { ok: false, error: e instanceof Error ? e.message : "Error desconectando en Evolution." };
  }
```

En `probarLineaAction`, igual:

```ts
  } catch (e) {
    marcarCaidaSiNoExiste(id, e);
    revalidatePath("/conectores");
    return { ok: false, error: e instanceof Error ? e.message : "Error enviando el mensaje de prueba." };
  }
```

Agregar el import arriba del archivo:

```ts
import { ErrorEvolution } from "../adapters/evolution";
```

- [ ] **Step 5: Correr los tests**

```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/conectores/lineas-whatsapp-actions.test.ts
```

Esperado: PASS los dos.

- [ ] **Step 6: Commit**

```bash
git add app/conectores/lineas-whatsapp-actions.ts app/conectores/lineas-whatsapp-actions.test.ts
git commit -m "fix(conectores): un 404 de instancia inexistente corrige la fila en vez de dejarla en verde"
```

### Task A4: Poder borrar la credencial de un conector

Va PRIMERO porque la Task A5 la usa. Es la mitad que falta de la decisión de la Task A1:
`quitarConfigConector` duerme la POLÍTICA, esto borra el SECRETO.

**Files:**
- Modify: `app/db/repository.ts` (junto a `guardarCredencialConector`, ~línea 904)
- Test: `app/db/repository.conector.test.ts`

- [ ] **Step 1: Escribir el test rojo**

Agregar a `app/db/repository.conector.test.ts` (seguir el estilo del archivo):

```ts
test('borrarCredencialConector deja el conector sin credencial pero no borra la fila (conserva el historial)', () => {
  guardarCredencialConector('gmail', 'secreto-de-prueba', 'u1');
  assert.strictEqual(estadoConector('gmail', 'u1').tieneCredencial, true);

  borrarCredencialConector('gmail', 'u1');

  const estado = estadoConector('gmail', 'u1');
  assert.strictEqual(estado.tieneCredencial, false, 'la credencial se fue');
  assert.strictEqual(estado.estado, 'sin_credencial', 'y el estado lo dice');
  assert.strictEqual(leerCredencialConector('gmail', 'u1'), null);
});
```

Agregar `borrarCredencialConector` al import del archivo.

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.conector.test.ts
```

Esperado: FAIL — `borrarCredencialConector is not a function`.

- [ ] **Step 3: Implementar**

En `app/db/repository.ts`, después de `guardarCredencialConector`:

```ts
// Borra el secreto pero NO la fila: ultima_corrida/ultimo_resultado son historial del
// conector, no del secreto, y perderlos borraria la unica pista de cuando dejo de andar.
// Complemento de quitarConfigConector (que solo duerme la POLITICA): sin esto, re-agregar
// un conector lo revivia ya conectado y no habia forma de reconectar desde cero por la UI.
export function borrarCredencialConector(proveedor: string, idUsuario?: string) {
  db.update(conector)
    .set({ credencialCiphertext: null, estado: 'sin_credencial', updatedAt: new Date().toISOString() })
    .where(filtroConector(proveedor, idUsuario))
    .run();
}
```

- [ ] **Step 4: Correr el test**

Mismo comando del Step 2. Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.conector.test.ts
git commit -m "feat(conectores): borrarCredencialConector, para poder reconectar desde cero"
```

### Task A5: Desactivar / Quitar-y-borrar, las dos preguntando antes

**Files:**
- Create: `app/conectores/QuitarConector.tsx`
- Modify: `app/conectores/actions.ts:104-113`
- Modify: `app/conectores/ConectorRow.tsx:7,119-124`

`ConectorRow` es un **server component** (no tiene `"use client"`), así que el botón con
confirmación tiene que salir a su propio componente cliente. Mismo patrón que
`CampanaCard.tsx:48-68`: `useConfirm` + `startTransition` + acción que devuelve resultado.
Un `<form action={...}>` plano no puede preguntar antes de disparar.

- [ ] **Step 1: `quitarConectorAction` devuelve resultado y acepta `borrarCredencial`**

Hoy es `void` y traga los errores en silencio (`if (!sesion.admin) return;`). Reemplazar la
función entera en `app/conectores/actions.ts`:

```ts
// Quita un conector. Solo admin. Dos niveles (decision 2026-07-15):
//   borrarCredencial=false -> "Desactivar": duerme la politica, el secreto sobrevive y
//     re-agregarlo lo revive tal cual estaba. Es el comportamiento historico.
//   borrarCredencial=true  -> "Quitar y borrar credencial": ademas borra el secreto, que
//     es el UNICO camino a reconectar desde cero (antes Gmail volvia ya-conectado y no
//     habia forma de rehacer el OAuth por la UI).
export async function quitarConectorAction(
  proveedor: string,
  borrarCredencial: boolean,
): Promise<ResultadoAccionConector> {
  const sesion = await requireSession();
  if (!sesion.admin) return { ok: false, error: "Solo un admin puede quitar un conector." };
  if (!conectorDelCatalogo(proveedor)) return { ok: false, error: "Conector no reconocido." };

  // El modo se lee ANTES de quitar la config, y el orden NO es cosmetico: modoConector
  // solo mira filas con habilitado=1, asi que despues de quitarla devuelve null -- y un
  // null aca haria borrar la credencial GLOBAL en vez de la personal del usuario. El modo
  // decide de quien es el secreto (admin = fila global, personal = la del usuario en
  // sesion), mismo criterio que decidirGuardado.
  const modo = modoConector(proveedor);
  quitarConfigConector(proveedor);
  if (borrarCredencial) {
    borrarCredencialConector(proveedor, modo === "personal" ? sesion.id : undefined);
  }
  revalidatePath("/conectores");
  return { ok: true };
}
```

Agregar el tipo junto a `ResultadoGuardado`:

```ts
export type ResultadoAccionConector = { ok: true } | { ok: false; error: string };
```

Y `borrarCredencialConector` al import de `../db/repository`.

- [ ] **Step 2: El componente cliente**

Crear `app/conectores/QuitarConector.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/Button";
import { useConfirm } from "../ui/useConfirm";
import { quitarConectorAction } from "./actions";

// ConectorRow es server component: el boton con confirmacion tiene que vivir aca. Mismo
// patron que CampanaCard (useConfirm + startTransition + accion con resultado).
// Dos acciones, no una (decision 2026-07-15): "Quitar" a secas mentia -- dejaba el secreto
// en la DB, y re-agregar revivia el conector ya conectado.
export function QuitarConector({ proveedor, nombre }: { proveedor: string; nombre: string }) {
  const { confirmar, elemento: dialogo } = useConfirm();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function ejecutar(borrarCredencial: boolean) {
    const ok = await confirmar(
      borrarCredencial
        ? {
            titulo: `¿Quitar ${nombre} y borrar su credencial?`,
            mensaje: `Se borra la credencial guardada. Para volver a usar ${nombre} hay que conectarlo desde cero. No se puede deshacer.`,
            textoConfirmar: "Quitar y borrar",
          }
        : {
            titulo: `¿Desactivar ${nombre}?`,
            mensaje:
              "Deja de aparecer en /conectores para todo el equipo. La credencial se conserva: volver a agregarlo lo revive sin reconectar.",
            textoConfirmar: "Desactivar",
            destructivo: false,
          },
    );
    if (!ok) return;
    setError("");
    startTransition(async () => {
      const res = await quitarConectorAction(proveedor, borrarCredencial);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <>
      <Button type="button" variant="quiet" onClick={() => ejecutar(false)} disabled={pendiente}>
        Desactivar
      </Button>
      <Button
        type="button"
        variant="quiet"
        onClick={() => ejecutar(true)}
        disabled={pendiente}
        className="text-overdue/80 hover:text-overdue"
      >
        Quitar y borrar credencial
      </Button>
      {error && <p className="mt-1 w-full text-xs text-overdue">{error}</p>}
      {dialogo}
    </>
  );
}
```

- [ ] **Step 3: Cablearlo en `ConectorRow.tsx`**

Reemplazar el `<form action={quitarConectorAction}>` entero (líneas 119-124) por:

```tsx
            <QuitarConector proveedor={cat.id} nombre={cat.nombre} />
```

El contenedor de arriba ya es `flex flex-wrap items-center gap-1.5`, así que los dos
botones del fragmento entran sin tocar el layout.

Cambiar el import de la línea 7:

```tsx
import { cambiarModoAction } from "./actions";
import { QuitarConector } from "./QuitarConector";
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin salida.

- [ ] **Step 5: Commit**

```bash
git add app/conectores/QuitarConector.tsx app/conectores/ConectorRow.tsx app/conectores/actions.ts
git commit -m "feat(conectores): desactivar vs quitar-y-borrar, las dos preguntan antes"
```

### Task A6: "Desconectar" línea pregunta antes

**Files:** Modify `app/conectores/LineasWhatsapp.tsx:150-212`

- [ ] **Step 1: Cambiar el form plano por el patrón useConfirm**

`LineasWhatsapp.tsx` YA es `"use client"`, así que no hace falta componente nuevo. En
`LineaRow`, borrar el `useActionState` de desconectar (líneas 160-163) y su
`<form action={accionDesconectar}>` (líneas 194-204), y poner:

```tsx
  const { confirmar, elemento: dialogoDesconectar } = useConfirm();
  const [pendienteDesc, startDesconectar] = useTransition();
  const [errorDesc, setErrorDesc] = useState("");

  async function desconectar() {
    const ok = await confirmar({
      titulo: `¿Desconectar ${linea.numero}?`,
      mensaje:
        "Cierra la sesión de WhatsApp de esta línea. Para volver a usarla hay que aparearla de nuevo con un código.",
      textoConfirmar: "Desconectar",
    });
    if (!ok) return;
    setErrorDesc("");
    const fd = new FormData();
    fd.set("id", String(linea.id));
    startDesconectar(async () => {
      const res = await desconectarLineaAction(null, fd);
      if (!res.ok) setErrorDesc(res.error);
    });
  }
```

Y el botón, en el lugar del form que se borró:

```tsx
        <Button
          type="button"
          variant="quiet"
          onClick={desconectar}
          disabled={pendienteDesc}
          className="text-overdue/80 hover:text-overdue"
        >
          {pendienteDesc ? "Desconectando..." : "Desconectar"}
        </Button>
```

Cambiar el cálculo de `error` (línea 164), que hoy cruza los dos `useActionState`:

```tsx
  const error = resVerificar && !resVerificar.ok ? resVerificar.error : errorDesc;
```

Y pintarlo (reemplaza la línea 207, `{error && !error.ok && ...}`):

```tsx
      {error && <p className="mt-2 text-xs text-overdue">{error}</p>}
```

Al final del JSX de `LineaRow`, junto a `{probando && ...}`:

```tsx
      {dialogoDesconectar}
```

Actualizar los imports:

```tsx
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useConfirm } from "../ui/useConfirm";
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin salida. Ojo: `ResultadoAccion` puede quedar sin usar en el import si
`desconectarLineaAction` era su único consumidor con `useActionState` — dejarlo, lo sigue
usando `verificarEstadoLineaAction`.

- [ ] **Step 3: Commit**

```bash
git add app/conectores/LineasWhatsapp.tsx
git commit -m "feat(conectores): desconectar una linea pregunta antes"
```

### Task A7: Gmail se puede volver a probar cuando ya está verificado

**Files:** Modify `app/conectores/GmailConector.tsx:34-40`

El bug es que la rama `verificado` devuelve un `<p>` y nada más.
`reenviarPruebaGmailAction` ya existe y funciona: solo hay que hacerla alcanzable.

- [ ] **Step 1: Reemplazar la rama `verificado`**

```tsx
  if (verificado) {
    return (
      <div className="max-w-sm">
        <p className="text-sm text-muted">
          Conectado como <strong className="text-ink">{emailConectado ?? 'tu cuenta'}</strong>.
        </p>
        {/* Mismo criterio que "Probar conexion" de WhatsApp: un conector verificado hace
            meses puede estar muerto (token revocado, cuota). Poder mandarse un correo de
            prueba sin desconectar y rehacer el OAuth es la unica forma de saberlo. */}
        <div className="mt-2">
          <form action={accionReenviar}>
            <Button type="submit" variant="quiet" disabled={reenviando}>
              {reenviando ? "Enviando..." : "Enviar correo de prueba"}
            </Button>
          </form>
        </div>
        {resultadoReenvio?.ok && (
          <p className="mt-2 text-xs text-done">Mandado a {emailConectado ?? 'tu cuenta'}. Revisa tu bandeja.</p>
        )}
        {resultadoReenvio && !resultadoReenvio.ok && (
          <p className="mt-2 text-xs text-overdue">{resultadoReenvio.error}</p>
        )}
      </div>
    );
  }
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/conectores/GmailConector.tsx
git commit -m "feat(conectores): Gmail verificado se puede volver a probar sin reconectar"
```

### Task A8: Decir el formato del número

**Files:** Modify `app/conectores/LineasWhatsapp.tsx:44-55`

No es la causa de que no llegara nada (eso fue el 404), pero el campo no dice qué espera.
El de "Agregar" ya trae `ej. 57...`; el de "Probar" no.

- [ ] **Step 1: Placeholder + nota, en `PasoEnviar`**

```tsx
      <form action={accion} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          name="destino"
          type="tel"
          placeholder="573001234567"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3.5 py-2.5 font-mono-tag text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Enviando..." : "Enviar prueba"}
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-faint">
        Código de país + número, sin + ni espacios (Colombia 57, Estados Unidos 1).
      </p>
```

- [ ] **Step 2: Commit**

```bash
git add app/conectores/LineasWhatsapp.tsx
git commit -m "feat(conectores): decir el formato del numero en la prueba de WhatsApp"
```

---

# PARTE B: la prueba de verdad — reconectar todo desde cero

### Task B1: Gates

- [ ] **Step 1: Correr todo**

```bash
npx tsc --noEmit && npm test
```

Esperado: 0 errores de tipos, todos los tests verdes (eran 855 + los nuevos).

- [ ] **Step 2: Pushear (el código sale solo con git push, ver plan de deploy)**

```bash
git push origin main
```

- [ ] **Step 3: Esperar el deploy y verificar desde afuera**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://followupsonepay.duckdns.org/api/health
```

Esperado: `200`.

### Task B2: Re-probar "Quitar conector" (el síntoma sin causa probada)

Esto va PRIMERO y solo: si vuelve a "no hacer nada" con los contenedores arriba y sin nadie
tocando la DB, entonces sí hay un bug que este plan no encontró, y hay que parar a mirarlo.

- [ ] **Step 1: Sebastián, en `/conectores`, quita un conector y confirma en el diálogo**
- [ ] **Step 2: Verificar que la DB se enteró**

```bash
ssh deploy@62.238.55.238 "docker exec -w /app followups_web node -e \"
const D=require('better-sqlite3');const db=new D('/data/isps.db',{readonly:true});
console.log(db.prepare('SELECT proveedor,habilitado,updated_at FROM conector_config').all());
\""
```

Esperado: el conector que quitaste con `habilitado: 0` y un `updated_at` de hace segundos.
**Si el `updated_at` no se movió, parar el plan y diagnosticar de verdad.**

### Task B3: WhatsApp desde cero

- [ ] **Step 1:** `/conectores` → WhatsApp → "Agregar otro número" → tu número → "Conectar número"

Esperado: un pairing-code de 8 caracteres. Si sale un 401, la Task 0.2 no se completó.

- [ ] **Step 2:** En el teléfono: WhatsApp → Dispositivos vinculados → Vincular un
  dispositivo → "Vincular con número de teléfono" → escribir el código.

  (Vincular SIEMPRE con código, nunca QR: el QR está bloqueado desde el crackdown de
  WhatsApp de junio 2026.)

- [ ] **Step 3:** "Verificar estado" → esperado: **Conectada** (verde), y ahora es verdad.
- [ ] **Step 4:** "Probar conexión" → mandar a otro número → esperado: **llega el mensaje**.
- [ ] **Step 5:** Que alguien le escriba a la línea → "Ya me escribió, verificar" →
  esperado: sale el texto real. Esto prueba que el webhook llega (`followups-web` resuelve
  desde `evolution_api`, ya verificado).
- [ ] **Step 6:** "Desconectar" → esperado: **pregunta primero**, y al confirmar la línea
  queda "Caída" sin ningún 404.

### Task B4: Gmail desde cero

- [ ] **Step 1:** "Enviar correo de prueba" sobre el Gmail ya conectado → esperado: llega.
  (Esto es lo que hoy es imposible: prueba la Task A7.)

- [ ] **Step 2: Probar los DOS niveles, en orden.** Primero el reversible:

"Desactivar" → esperado: pregunta (diálogo NO destructivo, botón azul) → Gmail desaparece
de la lista → re-agregarlo desde "Agregar conector" → vuelve **ya conectado** como
`felipe@…`, sin pasar por OAuth. Eso es correcto: "Desactivar" conserva la credencial a
propósito.

- [ ] **Step 3: Ahora el de verdad:** "Quitar y borrar credencial"

Esperado: pregunta con diálogo **destructivo** (botón rojo, "No se puede deshacer") → al
confirmar, Gmail desaparece.

- [ ] **Step 4:** Re-agregarlo desde "Agregar conector"

Esperado: vuelve mostrando **"Conectar Gmail"** (no "Conectado como…"). **Ese es el "desde
cero" que pediste** y lo que hoy es imposible.

- [ ] **Step 5:** Completar el OAuth → esperado: llega el correo de prueba → "Sí, llegó —
  confirmar" → el conector queda **Vivo** (verde).

### Task B5: Cerrar

- [ ] **Step 1: Que ningún dato de prueba quede colgando**

```bash
ssh deploy@62.238.55.238 "docker exec -w /app followups_web node -e \"
const D=require('better-sqlite3');const db=new D('/data/isps.db',{readonly:true});
console.log('lineas:', db.prepare('SELECT id,numero,referencia_proveedor,estado FROM linea_whatsapp').all());
console.log('conectores:', db.prepare('SELECT proveedor,habilitado FROM conector_config').all());
db.close();
\""
```

- [ ] **Step 2:** Borrar los scripts sueltos del contenedor

```bash
ssh deploy@62.238.55.238 "docker exec followups_web sh -c 'rm -f /app/fix-gmail.js /app/bf.js /app/d*.js /app/diag-*.js /app/verificar-prod.js /app/merge-prod-identity.js'"
```

---

## Criterio de aceptación

- Sebastián borra sus conectores y los reconecta desde cero, solo, sin SSH.
- Ningún botón destructivo dispara sin preguntar.
- Ninguna línea dice "Conectada" sobre una instancia que no existe.
- Cero 401 y cero 404 de Evolution en la UI.
- Gmail se puede probar sin desconectarlo.
- `npx tsc --noEmit && npm test` verdes.
