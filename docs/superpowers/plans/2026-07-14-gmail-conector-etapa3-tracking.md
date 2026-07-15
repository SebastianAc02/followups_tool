# Gmail Etapa 3 — Tracking (abiertos/clics ya cubiertos, hilo/respuestas/rebotes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `GmailAdapter` (`app/adapters/gmail.ts`) pase de implementar solo `CanalEntrega` (Etapa 1) a implementar también `TrackingPoll`, y que `enviarPaso` mande el cuerpo como HTML con el pixel/link de tracking ya inyectado (reusando `app/core/tracking-links.ts`, que YA es un helper compartido — la "nota de reuso" del spec ya está resuelta, Apollo lo usa desde `sincronizarCopy`).

**Contexto de alcance — LEE ESTO ANTES DE EMPEZAR:** Hay otra sesión trabajando en paralelo en la Etapa 2 del mismo spec (`resolverAdaptadorCorreo`, agrupar `pasoInscripcionesPendientes('correo', ...)` por dueño, compuerta de aprobación Gmail). Verificado en este repo al momento de escribir este plan (`git log main`, `git log --all`): esa Etapa 2 **todavía no aterrizó en ningún branch/worktree visible**, ni tampoco existe `resolverAdaptadorCorreo`/`gmailVerificadoDe` en el código. `pasoInscripcionesPendientes('correo', ...)` (`app/db/repository.ts:3681`) sigue exigiendo `campana.proveedorCampanaId` no-nulo (id externo de Apollo) — una campaña ruteada por Gmail hoy NO produce ninguna fila para `push.ts`. Esto significa que una parte real del alcance de la Etapa 3 del spec (cablear el poll en `worker/index.ts`, persistir el `threadId` contra una fila real de `paso_inscripcion`, correlacionar el pixel/click con un envío de Gmail) **depende de decisiones que la Etapa 2 todavía no tomó** — qué valor usa como `proveedorCampanaId` para una campaña ruteada por Gmail, cómo persiste el resultado de `enviarPaso`, etc.

Este plan construye la parte de la Etapa 3 que es 100% independiente y verificable en aislamiento (el adaptador de Gmail: envío HTML con tracking inyectado, lectura de hilos, detección de rebotes) y **deja documentados, sin inventar ni stubear, los puntos de integración pendientes** al final (sección "Puntos de integración pendientes — Etapa 2"). No toca `push.ts`, `app/db/repository.ts` (`pasoInscripcionesPendientes`, `marcarPasoInscripcionEnviada`), `app/adapters/registro-envio.ts` ni `app/worker/index.ts` — son justo los archivos que la Etapa 2 está tocando o va a tocar, y donde ya hubo una colisión real entre sesiones paralelas en la Etapa 1 (ver memoria `project_gmail_conector_etapa1_colision`).

**Architecture:** `app/adapters/gmail.ts` gana: (1) HTML + inyección de pixel/link en `enviarPaso` (reusa `reescribirLinksClic`/`inyectarPixelApertura` de `app/core/tracking-links.ts`, sin duplicar lógica); (2) captura del `threadId` que devuelve `users.messages.send` y lo expone en el resultado (campo nuevo, aditivo, en el puerto `EnvioResultado`); (3) `leerEventosNuevos(threadId, desde)` y `sacarDestinatario` para satisfacer `TrackingPoll` — un hilo (`threadId`) por llamada, no una "campaña externa" (Gmail no tiene ese concepto, igual que ya aclara el design doc). Detección de respuesta: `users.threads.get` y cualquier mensaje del hilo que no venga de la cuenta conectada. Detección de rebote: `users.messages.list` filtrando remitentes de sistema (`mailer-daemon`/`postmaster`) llegados después de `desde`, correlacionados por el email del destinatario original del hilo (ver "Decisión de diseño" en Tarea 4 — se aparta del texto literal del spec sobre "citar el messageId" con una razón concreta).

**Tech Stack:** TypeScript, Node test runner (`node:test`), fetch crudo contra la API REST de Gmail (sin SDK, mismo criterio que Etapa 1), Drizzle/SQLite solo para las pruebas existentes de credenciales (sin cambios de schema en este plan).

---

## Archivos

- Modificar: `app/core/ports/envio.ts` — campo aditivo `proveedorHiloId` en `EnvioResultado`, tipo de retorno de `crearGmailAdapter` extendido en su firma exportada.
- Modificar: `app/adapters/gmail.ts` — HTML + tracking en `enviarPaso`, nuevas funciones `leerEventosNuevos`/`sacarDestinatario`, parser de rebote.
- Modificar: `app/adapters/gmail.test.ts` — casos nuevos (HTML+pixel/link, hilo sin respuesta, hilo con respuesta, rebote detectado, rebote ignorado).
- Sin cambios: `app/db/schema.ts`, `app/db/repository.ts`, `app/core/push.ts`, `app/adapters/registro-envio.ts`, `app/worker/index.ts` (ver "Puntos de integración pendientes").

---

## Tarea 1: `EnvioResultado` gana `proveedorHiloId` (aditivo)

**Files:**
- Modify: `app/core/ports/envio.ts:78-81`
- Test: `app/adapters/apollo.test.ts` (correr para confirmar que NO se rompe nada, no se agrega caso nuevo aquí)

- [x] **Paso 1: Extiende el tipo `EnvioResultado`**

En `app/core/ports/envio.ts`, reemplaza:

```ts
export type EnvioResultado = {
  proveedor: string;
  proveedorMensajeId: string;
};
```

por:

```ts
export type EnvioResultado = {
  proveedor: string;
  proveedorMensajeId: string;
  // Etapa 3 (2026-07-14-secuencias-correo-gmail-design.md): Gmail no tiene "secuencia
  // externa" -- el threadId que devuelve users.messages.send es lo que despues permite
  // pollear respuestas/rebotes de ESE envio puntual (leerEventosNuevos de Gmail recibe
  // el threadId como si fuera su proveedorCampanaId, ver core/ports/envio.ts mas abajo).
  // Opcional y undefined para Apollo/Evolution -- ninguno de los dos lo necesita, aditivo
  // a proposito para no tocar su firma ni sus tests.
  proveedorHiloId?: string;
};
```

- [x] **Paso 2: Corre la suite de Apollo/Evolution para confirmar que el campo opcional no rompe nada**

Run: `npm test -- app/adapters/apollo.test.ts app/adapters/evolution.test.ts`
Expected: PASS (mismos resultados que antes del cambio — un campo opcional nuevo en un tipo no afecta código que no lo lee).

- [x] **Paso 3: Commit**

```bash
git add app/core/ports/envio.ts
git commit -m "feat(envio): EnvioResultado gana proveedorHiloId opcional (Etapa 3 Gmail)"
```

---

## Tarea 2: `enviarPaso` manda HTML con pixel/link inyectado y devuelve el `threadId`

**Files:**
- Modify: `app/adapters/gmail.ts:130-195`
- Test: `app/adapters/gmail.test.ts`

Hoy `armarMensajeCrudo` siempre manda `Content-Type: text/plain`. El design doc (Etapa 1, comentario en `gmail.ts:151-153`) ya dice que el HTML llega en Etapa 3. `paso.cuerpo` es HTML tal cual lo trata Apollo (`traducirVariablesApollo(paso.cuerpo)` se pasa directo a `body_html` en `apollo.ts:345`, sin pasar por ningún parser markdown->HTML) — mismo criterio acá: `paso.cuerpo` YA es HTML.

- [x] **Paso 1: Escribe el test que falla — HTML con pixel y link reescrito**

Agrega en `app/adapters/gmail.test.ts`, después del test `'enviarPaso refresca el access token...'`:

```ts
test('enviarPaso manda el cuerpo como HTML con el link reescrito y el pixel de apertura inyectados', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-7');
  let mensajeDecodificado = '';

  t.mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit = {}) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
      const cuerpo = JSON.parse(init.body as string) as { raw: string };
      mensajeDecodificado = Buffer.from(cuerpo.raw, 'base64url').toString('utf8');
      return new Response(JSON.stringify({ id: 'msg-html-1', threadId: 'thread-html-1' }), { status: 200 });
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-7');
  const resultado = await adapter.enviarPaso(
    'campana-42',
    { email: 'destino@onepay.la', telefono: null, nombre: null, empresa: null, cargo: null },
    { asunto: 'Hola', cuerpo: '<p>Hola</p><a href="https://onepay.la/x">visita</a>', canal: 'correo' },
  );

  assert.strictEqual(resultado.proveedorMensajeId, 'msg-html-1');
  assert.strictEqual(resultado.proveedorHiloId, 'thread-html-1');
  assert.match(mensajeDecodificado, /Content-Type: text\/html/);
  // OJO con este assert: tracking-links.ts arma la URL con el tag literal {{email}}
  // (asi es como Apollo lo necesita -- sube UNA plantilla compartida y deja que SU
  // PROPIO motor de merge-tags lo resuelva por destinatario). Gmail no tiene ese motor:
  // arma el HTML por destinatario en el momento del envio, y ya conoce el email real
  // (destinatario.email) -- si se deja el tag literal, /api/track/open lo descarta a
  // proposito (`email !== '{{email}}'`, ver ese route) y NUNCA se registraria un evento
  // de tracking para Gmail. Por eso el Paso 3 de implementacion sustituye el tag por el
  // email real DESPUES de llamar a los helpers compartidos -- reusa la logica de armar
  // la URL, no la sustitucion (esa la hacemos nosotros, no Apollo).
  assert.match(
    mensajeDecodificado,
    /href="https:\/\/app\.test\/api\/track\/click\?c=campana-42&e=destino@onepay\.la&u=https%3A%2F%2Fonepay\.la%2Fx"/,
  );
  assert.match(
    mensajeDecodificado,
    /<img src="https:\/\/app\.test\/api\/track\/open\?c=campana-42&e=destino@onepay\.la" width="1" height="1" alt="" style="display:none" \/>/,
  );
});
```

- [x] **Paso 2: Corre el test para confirmar que falla**

Run: `npm test -- app/adapters/gmail.test.ts`
Expected: FAIL — el mensaje sigue siendo `text/plain` sin pixel/link, y `resultado.proveedorHiloId` es `undefined`.

- [x] **Paso 3: Implementa**

En `app/adapters/gmail.ts`:

1. Importa el helper de tracking (mismo que usa Apollo) y el tipo `ParamsTracking`:

```ts
import { reescribirLinksClic, inyectarPixelApertura } from '../core/tracking-links';
```

2. Agrega el helper privado de base URL (mismo patrón que `apollo.ts:19-21`, no vale la pena extraerlo a un módulo compartido por una sola línea):

```ts
function appBaseUrl(): string | undefined {
  return process.env.APP_BASE_URL;
}
```

3. Reemplaza `armarMensajeCrudo` para que arme HTML en vez de texto plano, e inyecte pixel/link cuando haya `APP_BASE_URL` configurada:

```ts
// RFC 2822 minimo (To/Subject/Content-Type + cuerpo HTML) -- Etapa 3: paso.cuerpo ya
// es HTML (mismo criterio que Apollo en sincronizarCopy, ver apollo.ts), el pixel/link
// de tracking se inyectan aca con el mismo helper compartido que usa Apollo
// (core/tracking-links.ts) -- una sola implementacion de esa logica para los dos
// proveedores, tal como pide la "Nota de reuso" del design doc.
function armarMensajeCrudo(destinatario: string, asunto: string, cuerpoHtml: string, proveedorCampanaId: string): string {
  const asuntoSeguro = codificarHeaderSiHaceFalta(sinCrlf(asunto));
  let cuerpo = cuerpoHtml;
  const base = appBaseUrl();
  if (base) {
    const params = { baseUrl: base, proveedorCampanaId };
    // reescribirLinksClic/inyectarPixelApertura dejan el tag {{email}} LITERAL a
    // proposito (asi lo necesita Apollo, ver tracking-links.ts) -- Gmail arma el HTML
    // por destinatario en el momento del envio y ya conoce el email real, asi que lo
    // sustituye el mismo (si no, /api/track/open descarta el evento a proposito por
    // email==='{{email}}', nunca se registraria nada para correo mandado por Gmail).
    cuerpo = inyectarPixelApertura(reescribirLinksClic(cuerpo, params), params).replaceAll('{{email}}', destinatario);
  }
  const mensaje = [
    `To: ${sinCrlf(destinatario)}`,
    `Subject: ${asuntoSeguro}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    cuerpo,
  ].join('\r\n');
  return base64Url(mensaje);
}
```

4. Actualiza `enviarCorreoGmail` para recibir y pasar `proveedorCampanaId`, y para leer `threadId` de la respuesta:

```ts
type GmailSendRespuesta = { id?: string; threadId?: string; error?: { message?: string } };

async function enviarCorreoGmail(
  idUsuario: string,
  destinatario: string,
  asunto: string,
  cuerpo: string,
  proveedorCampanaId: string,
): Promise<{ mensajeId: string; hiloId: string | undefined }> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: armarMensajeCrudo(destinatario, asunto, cuerpo, proveedorCampanaId) }),
  });
  const data = (await res.json()) as GmailSendRespuesta;
  if (!res.ok || !data.id) throw new Error(`Gmail respondio ${res.status} al mandar: ${data.error?.message ?? 'sin detalle'}`);
  return { mensajeId: data.id, hiloId: data.threadId };
}
```

5. Actualiza `enviarPaso` dentro de `crearGmailAdapter` para pasar `proveedorCampanaId` y devolver `proveedorHiloId`:

```ts
    async enviarPaso(proveedorCampanaId: string, destinatario: DestinatarioEnvio, paso: PasoEnvio): Promise<EnvioResultado> {
      if (!destinatario.email) throw new Error('Gmail requiere email y el destinatario no trae uno');
      const { mensajeId, hiloId } = await enviarCorreoGmail(
        idUsuario,
        destinatario.email,
        paso.asunto ?? '(sin asunto)',
        paso.cuerpo,
        proveedorCampanaId,
      );
      return { proveedor: 'gmail', proveedorMensajeId: mensajeId, proveedorHiloId: hiloId };
    },
```

6. Actualiza `mandarCorreoDePrueba` (llama a `enviarPaso` con `'prueba'` como `proveedorCampanaId`, sin cambios de firma — sigue funcionando igual, ahora el correo de verificación sale como HTML en vez de texto plano, sin `APP_BASE_URL` en producción real esto es indistinguible para el usuario).

- [x] **Paso 4: Corre el test para confirmar que pasa**

Run: `npm test -- app/adapters/gmail.test.ts`
Expected: PASS — incluyendo los tests viejos (`enviarPaso refresca...`, `neutraliza un salto de linea...`, `mandarCorreoDePrueba...`). Si alguno de los viejos falla por el cambio de `Content-Type`, revisa que ninguno afirme el valor exacto de esa línea (al escribir este plan, ninguno lo hace — solo afirman `To:`/`Subject:`/substrings del cuerpo).

- [x] **Paso 5: Commit**

```bash
git add app/adapters/gmail.ts app/adapters/gmail.test.ts
git commit -m "feat(gmail): enviarPaso manda HTML con pixel/link inyectados y devuelve threadId"
```

---

## Tarea 3: `sacarDestinatario` (no-op documentado) + `leerEventosNuevos` detecta respuestas

**Files:**
- Modify: `app/adapters/gmail.ts`
- Test: `app/adapters/gmail.test.ts`

**Decisión de diseño (para el checkpoint de aprendizaje):** `TrackingPoll.leerEventosNuevos(proveedorCampanaId, desde)` fue diseñado pensando en Apollo, donde `proveedorCampanaId` es el id de una secuencia externa con muchos destinatarios. Gmail no tiene ese concepto — cada envío es un hilo propio. Este plan reinterpreta el primer parámetro como el `threadId` de Gmail (un hilo = un destinatario = una llamada a `leerEventosNuevos`), tal como el design doc describe literalmente ("para cada `threadId` guardado... consulta `users.threads.get`"). Quien orqueste el poll (pendiente de Etapa 2, ver sección final) hace un loop por cada hilo activo y llama esta función una vez por hilo — el mismo patrón de "una fila, una decisión" que ya usa `pollTracking` en `core/tracking.ts` para los eventos de Apollo, aplicado un nivel más arriba.

- [x] **Paso 1: Escribe el test que falla — `sacarDestinatario` es no-op**

```ts
test('sacarDestinatario es un no-op documentado (Gmail no tiene secuencia externa de la que sacar a alguien)', async () => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-8');
  const adapter = crearGmailAdapter('user-8');
  await assert.doesNotReject(() => adapter.sacarDestinatario('thread-x', 'quien@sea.com'));
});
```

- [x] **Paso 2: Escribe el test que falla — hilo sin respuesta nueva devuelve `[]`**

```ts
test('leerEventosNuevos: hilo sin mensaje nuevo del destinatario devuelve []', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-9');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-solo')) {
      return new Response(
        JSON.stringify({
          id: 'thread-solo',
          messages: [
            {
              id: 'thread-solo',
              internalDate: '1000',
              payload: { headers: [{ name: 'From', value: 'sebastian@onepay.la' }, { name: 'To', value: 'prospecto@x.com' }] },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.includes('/messages?')) {
      return new Response(JSON.stringify({}), { status: 200 }); // sin rebotes
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-9');
  const eventos = await adapter.leerEventosNuevos('thread-solo', new Date(0).toISOString());
  assert.deepStrictEqual(eventos, []);
});
```

- [x] **Paso 3: Escribe el test que falla — hilo con respuesta del prospecto devuelve evento `respondio`**

```ts
test('leerEventosNuevos: mensaje nuevo en el hilo que no viene de la cuenta conectada es un evento respondio', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-10');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-resp')) {
      return new Response(
        JSON.stringify({
          id: 'thread-resp',
          messages: [
            {
              id: 'thread-resp',
              internalDate: '1000',
              payload: { headers: [{ name: 'From', value: 'sebastian@onepay.la' }, { name: 'To', value: 'prospecto@x.com' }] },
            },
            {
              id: 'msg-respuesta-1',
              internalDate: '2000',
              payload: { headers: [{ name: 'From', value: 'Prospecto <prospecto@x.com>' }] },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.includes('/messages?')) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-10');
  const eventos = await adapter.leerEventosNuevos('thread-resp', new Date(0).toISOString());
  assert.strictEqual(eventos.length, 1);
  assert.strictEqual(eventos[0].tipo, 'respondio');
  assert.strictEqual(eventos[0].proveedorEventoId, 'msg-respuesta-1');
  assert.strictEqual(eventos[0].email, 'prospecto@x.com');
  assert.strictEqual(eventos[0].canal, 'correo');
});
```

- [x] **Paso 4: Corre los tests para confirmar que fallan**

Run: `npm test -- app/adapters/gmail.test.ts`
Expected: FAIL — `adapter.sacarDestinatario`/`adapter.leerEventosNuevos` no existen todavía (`crearGmailAdapter` solo devuelve `CanalEntrega`).

- [x] **Paso 5: Implementa**

En `app/adapters/gmail.ts`, agrega tipos e importa lo que falta:

```ts
import type { CanalEntrega, TrackingPoll, DestinatarioEnvio, PasoEnvio, EnvioResultado, EventoProveedor } from '../core/ports/envio';
```

Agrega las constantes y helpers de lectura de hilo:

```ts
const GMAIL_THREADS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/threads';
const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

type GmailHeader = { name: string; value: string };
type GmailMensaje = { id: string; internalDate?: string; payload?: { headers?: GmailHeader[] } };
type GmailHiloRespuesta = { id?: string; messages?: GmailMensaje[]; error?: { message?: string } };

function headerDe(mensaje: GmailMensaje, nombre: string): string | null {
  const header = mensaje.payload?.headers?.find((h) => h.name.toLowerCase() === nombre.toLowerCase());
  return header?.value ?? null;
}

// El header From viene como "Nombre <email@dominio>" o solo "email@dominio" -- se
// extrae el email real para comparar contra la cuenta conectada / usar como
// correlator, igual que ya hace resolverEmailCuenta con el userinfo de Google.
function emailDeHeader(valor: string | null): string | null {
  if (!valor) return null;
  const match = valor.match(/[^<\s]+@[^>\s]+/);
  return match ? match[0].toLowerCase() : null;
}
```

Agrega la lectura de hilo (respuestas):

```ts
async function leerHilo(idUsuario: string, threadId: string): Promise<GmailMensaje[]> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const res = await fetch(`${GMAIL_THREADS_URL}/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as GmailHiloRespuesta;
  if (!res.ok) throw new Error(`Gmail respondio ${res.status} al leer el hilo ${threadId}: ${data.error?.message ?? 'sin detalle'}`);
  return data.messages ?? [];
}

// El primer mensaje del hilo es SIEMPRE el que nosotros mandamos (threadId = id de ESE
// mensaje, ver comentario de armarMensajeCrudo/enviarPaso) -- de ahi se saca el email
// del destinatario original, sin depender de que el llamador lo pase aparte.
function destinatarioOriginalDe(mensajes: GmailMensaje[], threadId: string): string | null {
  const original = mensajes.find((m) => m.id === threadId) ?? mensajes[0];
  return emailDeHeader(headerDe(original, 'To'));
}

async function detectarRespuestas(
  idUsuario: string,
  threadId: string,
  mensajes: GmailMensaje[],
  cuentaConectada: string,
  desdeMs: number,
): Promise<EventoProveedor[]> {
  const destinatario = destinatarioOriginalDe(mensajes, threadId);
  if (!destinatario) return [];
  return mensajes
    .filter((m) => m.id !== threadId)
    .filter((m) => emailDeHeader(headerDe(m, 'From')) !== cuentaConectada.toLowerCase())
    .filter((m) => Number(m.internalDate ?? '0') >= desdeMs)
    .map((m) => ({
      proveedorEventoId: m.id,
      tipo: 'respondio',
      canal: 'correo',
      fechaEvento: new Date(Number(m.internalDate ?? '0')).toISOString(),
      email: destinatario,
      detalle: { via: 'thread', threadId },
    }));
}
```

Agrega `sacarDestinatario` y `leerEventosNuevos` al objeto devuelto por `crearGmailAdapter`, y cambia su tipo de retorno:

```ts
export function crearGmailAdapter(idUsuario: string): CanalEntrega & TrackingPoll {
  return {
    async enviarPaso(/* ... sin cambios de Tarea 2 ... */) { /* ... */ },

    // Gmail no tiene secuencia externa de la que sacar a alguien (a diferencia de
    // Apollo, remove_or_stop_contact_ids) -- que un destinatario deje de recibir pasos
    // futuros lo decide pollTracking pausando la inscripcion en NUESTRA base, no un
    // side-effect en Gmail. No-op deliberado, documentado, no un TODO.
    async sacarDestinatario(_threadId: string, _email: string): Promise<void> {},

    // threadId (ver decision de diseno arriba del plan): un hilo = un destinatario.
    async leerEventosNuevos(threadId: string, desde: string): Promise<EventoProveedor[]> {
      const credencial = leerCredencial(idUsuario);
      const mensajes = await leerHilo(idUsuario, threadId);
      const desdeMs = new Date(desde).getTime();
      const respuestas = await detectarRespuestas(idUsuario, threadId, mensajes, credencial.emailCuenta, desdeMs);
      return respuestas; // rebotes se suman en la Tarea 4
    },
  };
}
```

- [x] **Paso 6: Corre los tests para confirmar que pasan**

Run: `npm test -- app/adapters/gmail.test.ts`
Expected: PASS.

- [x] **Paso 7: Commit**

```bash
git add app/adapters/gmail.ts app/adapters/gmail.test.ts
git commit -m "feat(gmail): TrackingPoll -- sacarDestinatario no-op + leerEventosNuevos detecta respuestas por hilo"
```

---

## Tarea 4: Detección de rebotes

**Files:**
- Modify: `app/adapters/gmail.ts`
- Test: `app/adapters/gmail.test.ts`

**Decisión de diseño (aparta del texto literal del spec, con razón):** el spec dice "correlacionado por el `messageId` original citado en el cuerpo del rebote". El `messageId` que nosotros guardamos es el `id` que devuelve la API de Gmail (`users.messages.send`), que **no** es el header RFC 2822 `Message-ID:` que de verdad viaja en el correo y que citaría un DSN (`Delivery Status Notification`) — son dos identificadores distintos y capturar el segundo requeriría un fetch extra por cada envío solo para guardarlo. En vez de perseguir esa cita exacta, el rebote se correlaciona por el **email del destinatario original del hilo** (que ya resolvemos en `destinatarioOriginalDe`) más una ventana de tiempo (`desde`) — un DSN real siempre incluye la dirección que rebotó en texto plano (`Original-Recipient:` o en el cuerpo del mensaje), así que el match por substring del email es más robusto que perseguir un id que ni siquiera estamos capturando hoy. Esto es exactamente el tipo de ajuste que el spec anticipa ("el punto mas fragil... se prueba contra un rebote real antes de confiar en el parser") — este parser se valida contra un rebote real antes de confiar en él en producción (ver "Puntos de integración pendientes").

- [x] **Paso 1: Escribe el test que falla — mensaje de mailer-daemon citando el email del destinatario es un evento rebota**

```ts
test('leerEventosNuevos: mensaje de mailer-daemon con el email del destinatario en el cuerpo es un evento rebota', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-11');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-rebote')) {
      return new Response(
        JSON.stringify({
          id: 'thread-rebote',
          messages: [
            {
              id: 'thread-rebote',
              internalDate: '1000',
              payload: { headers: [{ name: 'From', value: 'sebastian@onepay.la' }, { name: 'To', value: 'noexiste@dominio-fantasma.com' }] },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
      return new Response(JSON.stringify({ messages: [{ id: 'bounce-1', threadId: 'thread-bounce-xyz' }] }), { status: 200 });
    }
    if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/bounce-1?format=full') {
      return new Response(
        JSON.stringify({
          id: 'bounce-1',
          internalDate: '5000',
          payload: {
            headers: [{ name: 'From', value: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' }],
            body: { data: Buffer.from('Tu mensaje a noexiste@dominio-fantasma.com no pudo entregarse.', 'utf8').toString('base64url') },
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-11');
  const eventos = await adapter.leerEventosNuevos('thread-rebote', new Date(0).toISOString());
  assert.strictEqual(eventos.length, 1);
  assert.strictEqual(eventos[0].tipo, 'rebota');
  assert.strictEqual(eventos[0].proveedorEventoId, 'bounce-1');
  assert.strictEqual(eventos[0].email, 'noexiste@dominio-fantasma.com');
});
```

- [x] **Paso 2: Escribe el test que falla — mensaje de sistema que NO cita al destinatario de este hilo se ignora**

```ts
test('leerEventosNuevos: mensaje de mailer-daemon de OTRO destinatario no genera falso positivo en este hilo', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-12');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-ok')) {
      return new Response(
        JSON.stringify({
          id: 'thread-ok',
          messages: [
            {
              id: 'thread-ok',
              internalDate: '1000',
              payload: { headers: [{ name: 'From', value: 'sebastian@onepay.la' }, { name: 'To', value: 'si-existe@dominio.com' }] },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
      return new Response(JSON.stringify({ messages: [{ id: 'bounce-otro' }] }), { status: 200 });
    }
    if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/bounce-otro?format=full') {
      return new Response(
        JSON.stringify({
          id: 'bounce-otro',
          internalDate: '5000',
          payload: {
            headers: [{ name: 'From', value: 'mailer-daemon@googlemail.com' }],
            body: { data: Buffer.from('Tu mensaje a otro-cualquiera@dominio.com no pudo entregarse.', 'utf8').toString('base64url') },
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-12');
  const eventos = await adapter.leerEventosNuevos('thread-ok', new Date(0).toISOString());
  assert.deepStrictEqual(eventos, []);
});
```

- [x] **Paso 3: Corre los tests para confirmar que fallan**

Run: `npm test -- app/adapters/gmail.test.ts`
Expected: FAIL — `leerEventosNuevos` todavía no busca rebotes, solo respuestas.

- [x] **Paso 4: Implementa**

Agrega en `app/adapters/gmail.ts`:

```ts
type GmailListaRespuesta = { messages?: { id: string }[] };
type GmailMensajeCompleto = GmailMensaje & { payload?: { headers?: GmailHeader[]; body?: { data?: string } } };

function decodificarCuerpo(mensaje: GmailMensajeCompleto): string {
  const data = mensaje.payload?.body?.data;
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

// mailer-daemon/postmaster: los dos remitentes de sistema que de verdad manda Google
// para un rebote (verificado contra la documentacion de Gmail/Google Workspace,
// PENDIENTE de confirmar contra un rebote real -- ver "Puntos de integracion
// pendientes" del plan).
const REMITENTE_SISTEMA_RE = /mailer-daemon|postmaster/i;

async function buscarRebote(idUsuario: string, destinatarioOriginal: string, desdeMs: number): Promise<EventoProveedor | null> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const despuesDeEpoch = Math.floor(desdeMs / 1000);
  const query = encodeURIComponent('from:(mailer-daemon OR postmaster)');
  const res = await fetch(`${GMAIL_MESSAGES_URL}?q=${query}+after:${despuesDeEpoch}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as GmailListaRespuesta;
  if (!res.ok || !data.messages?.length) return null;

  for (const ref of data.messages) {
    const msgRes = await fetch(`${GMAIL_MESSAGES_URL}/${ref.id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const msg = (await msgRes.json()) as GmailMensajeCompleto;
    if (!msgRes.ok) continue;
    if (!REMITENTE_SISTEMA_RE.test(headerDe(msg, 'From') ?? '')) continue;
    if (Number(msg.internalDate ?? '0') < desdeMs) continue;
    const cuerpo = decodificarCuerpo(msg);
    if (!cuerpo.toLowerCase().includes(destinatarioOriginal.toLowerCase())) continue;
    return {
      proveedorEventoId: msg.id,
      tipo: 'rebota',
      canal: 'correo',
      fechaEvento: new Date(Number(msg.internalDate ?? '0')).toISOString(),
      email: destinatarioOriginal,
      detalle: { via: 'bounce' },
    };
  }
  return null;
}
```

Actualiza `leerEventosNuevos` para sumar el rebote (si aparece) a las respuestas:

```ts
    async leerEventosNuevos(threadId: string, desde: string): Promise<EventoProveedor[]> {
      const credencial = leerCredencial(idUsuario);
      const mensajes = await leerHilo(idUsuario, threadId);
      const desdeMs = new Date(desde).getTime();
      const respuestas = await detectarRespuestas(idUsuario, threadId, mensajes, credencial.emailCuenta, desdeMs);
      const destinatario = destinatarioOriginalDe(mensajes, threadId);
      const rebote = destinatario ? await buscarRebote(idUsuario, destinatario, desdeMs) : null;
      return rebote ? [...respuestas, rebote] : respuestas;
    },
```

- [x] **Paso 5: Corre los tests para confirmar que pasan**

Run: `npm test -- app/adapters/gmail.test.ts`
Expected: PASS — los 2 tests de rebote y los 2 de respuesta de la Tarea 3.

- [x] **Paso 6: Corre TODA la suite del proyecto para descartar una regresión en otro archivo**

Run: `npm test`
Expected: PASS (mismo conteo de tests que antes de este plan, más los nuevos).

- [x] **Paso 7: `tsc` sin errores**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [x] **Paso 8: Commit**

```bash
git add app/adapters/gmail.ts app/adapters/gmail.test.ts
git commit -m "feat(gmail): detecta rebotes correlacionando por email del destinatario original del hilo"
```

---

## Puntos de integración pendientes — Etapa 2 (NO construir en este plan, avisar a Sebastián)

Estos son reales huecos que quedan sin cerrar porque dependen de decisiones que la Etapa 2 (sesión paralela) todavía no tomó. No se inventaron ni se stubearon:

1. **Persistir `proveedorHiloId` contra una fila real.** `push.ts` (`marcarEnviada`) hoy solo guarda `proveedor` + `proveedorMensajeId` — no hay columna en `paso_inscripcion` para el `threadId`. Falta: migración (columna nueva o reuso de `detalle`) + que `push.ts`/`marcarPasoInscripcionEnviada` lo persistan. No se tocó `push.ts` en este plan a propósito (mismo archivo que Etapa 2 edita).

2. **Qué valor usa Etapa 2 como `proveedorCampanaId` para una campaña ruteada por Gmail.** `/api/track/open` y `/api/track/click` (`app/api/track/*/route.ts`) correlacionan hoy por `resolverDestinatarioPorEmail(proveedorCampanaId, email)`, que busca por `campana.proveedorCampanaId` (id externo de Apollo). Una campaña por Gmail no tiene ese id — Etapa 2 tiene que decidir qué correlator usar (¿`campana.idCampana` como string?) para que el pixel/click de un correo mandado por Gmail matcheen algo real. `gmail.ts` (este plan) no necesita saberlo: recibe `proveedorCampanaId` como parámetro opaco y lo usa tal cual, pero la resolución del lado de la DB (`resolverDestinatarioPorEmail`) sí depende de esa decisión.

3. **Query nueva para listar hilos Gmail activos por dueño.** Una vez el punto 1 esté resuelto, hace falta una función tipo `hilosGmailActivosDeOwner(idUsuario)` en `app/db/repository.ts` para alimentar el poll — no se construyó acá porque depende del punto 1 (no hay `threadId` que listar todavía).

4. **Cableado en `app/worker/index.ts`.** `tareaTracking` hoy solo pollea el `EnvioAdapter` completo de Apollo (`registroCompleto.correo`). Falta una tarea nueva (o generalizar la existente) que, por cada dueño con Gmail verificado y con hilos activos, llame `pollTracking` con `crearGmailAdapter(idUsuario)` una vez por hilo — depende de los puntos 1 y 3. No se tocó `worker/index.ts` en este plan.

5. **Personalización del copy para Gmail.** Apollo traduce `[nombre]`/`[empresa]`/`[cargo]` con `traducirVariablesApollo` antes de mandar (su propio motor de merge-tags). Gmail no tiene motor externo — alguien tiene que llamar `renderizarCopy` (`app/core/render-copy.ts`, ya existe y es puro) con los datos del destinatario ANTES de que el copy llegue a `enviarPaso`, o `enviarPaso` lo hace internamente. El spec de la Etapa 3 no lo menciona explícitamente pero sin esto el correo real sale con placeholders literales (`[nombre]`) — no está en el alcance textual de la Etapa 3, así que no se resolvió acá; queda para cuando Etapa 2 defina quién arma el `PasoEnvio.cuerpo` final antes de llamarle a Gmail.

6. **Prueba real end-to-end** (pixel al abrir, clic, responder, rebote a una dirección inexistente) — el criterio de éxito del spec para la Etapa 3 — solo es posible una vez los puntos 1-4 estén resueltos y una campaña de verdad mande por Gmail. El parser de rebote de la Tarea 4 en particular necesita validarse contra un rebote real (mismo texto del spec: "es el punto más frágil... se prueba contra un rebote real antes de confiar en el parser") antes de darlo por bueno en producción.

**Antes de mergear este plan a `main`:** correr `git log main` de nuevo y comparar contra el punto de partida (`1fd908c`) — si para entonces la Etapa 2 ya aterrizó y tocó `app/core/ports/envio.ts` o `app/adapters/gmail.ts`, comparar contenido a mano antes de asumir que este trabajo es el que gana (mismo precedente de `project_gmail_conector_etapa1_colision`).
