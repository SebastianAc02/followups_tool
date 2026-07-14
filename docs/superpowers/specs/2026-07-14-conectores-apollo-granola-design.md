# Conectores: revelar credencial de Apollo + verificación real de Granola — Design

Estado: PROPUESTO (2026-07-14). Aprobado en conversación por Sebastián, pendiente de convertir
en plan de implementación.

## Problema

Dos huecos en `/conectores`:

1. **Apollo**: el formulario de credencial es de solo-escritura a propósito (`type="password"`,
   nunca muestra el valor guardado). Sebastián, como admin, no tiene forma de ver el API key
   de Apollo que ya está configurado — solo puede reemplazarlo a ciegas.
2. **Granola**: cada usuario pega su API key personal y el conector queda "Configurado" sin
   ninguna verificación real de que la key funciona ni de que trae las llamadas correctas.
   Sebastián quiere que, al confirmar, el sistema traiga la última llamada real del usuario y
   se la muestre para que él mismo confirme que es la correcta — recién ahí queda configurado
   de verdad.

## Contexto verificado

- Las credenciales de conector YA están cifradas en reposo (`cifrar`/`descifrar` en
  `app/db/repository.ts`, columna `conector.credencialCiphertext`). `leerCredencialConector(
  proveedor, idUsuario?)` ya descifra y devuelve el valor plano — no hay que construir
  ninguna pieza de cifrado nueva, solo exponerla vía un server action nuevo, admin-gated.
- `app/conectores/actions.ts` ya tiene el patrón `requireSession()` + chequeo `sesion.admin`
  para acciones admin-only (`agregarConectorAction`, `cambiarModoAction`, `quitarConectorAction`).
- `estadoConector`/`vistaEstado` (`app/conectores/estado-ui.ts`) YA muestran el status
  ("Sin configurar"/"Caído"/"Vivo"/"Configurado") a **todos los usuarios**, admin o no — esa
  parte del pedido ya está resuelta, no se toca.
- `app/adapters/granola.ts` (`crearGranolaAdapter(idUsuario)`) hoy solo implementa
  `TranscriptAdapter` (búsqueda por términos para enlazar un toque con una transcripción). No
  existe ninguna función de "traeme mis últimas N notas" — hay que agregarla.
- La API real de Granola (`public-api.granola.ai`, confirmado en comentario del adaptador) ya
  se usa con paginación (`ListaNotas { notes, hasMore, cursor }`) — la nueva función reusa el
  mismo cliente HTTP y el mismo patrón de lectura de credencial (`leerCredencialConector('granola',
  idUsuario)`), solo pide la primera página ordenada por fecha, sin buscar por términos.
- No existe hoy ningún número de WhatsApp de admin configurado en ningún lado (ni env var, ni
  columna en DB) — hace falta agregarlo.
- El envío de WhatsApp ya tiene un camino directo sin pasar por campaña/secuencia:
  `crearEvolutionAdapter().enviarPaso(referenciaProveedor, destinatario, paso)` (mismo que usa
  `probarLineaAction` en `app/conectores/lineas-whatsapp-actions.ts:97`) — se reusa tal cual
  para la alerta al admin.

## Decisiones cerradas con Sebastián (2026-07-14)

1. **Apollo**: botón "Revelar" (solo admin) junto al campo de credencial. La página NO trae el
   valor en el HTML inicial — un server action nuevo, admin-gated, lo pide bajo demanda al
   hacer clic. Se muestra en pantalla mientras el componente esté montado (no se persiste en
   ningún estado del cliente más allá de eso).
2. **Granola — flujo de verificación v1**: solo confirma sobre la última llamada YA grabada
   (no se construye la opción de "hacer una llamada de prueba en vivo ahora" — queda fuera de
   alcance, anotado abajo).
   - Guarda la credencial tentativa (mismo `guardarCredencialConector`, sin cambios).
   - Llama a Granola con esa credencial pidiendo la nota más reciente.
   - Muestra al usuario: título + fecha + fragmento del resumen de esa nota.
   - Usuario confirma "sí, es la mía" → el conector queda `Configurado` de verdad (mismo
     estado que hoy, no se agrega un tercer estado intermedio distinguible en la UI — la
     credencial ya estaba guardada desde el paso anterior).
   - Si el usuario dice que NO es la correcta: fuera de alcance de v1 (no se construye ningún
     manejo especial — la credencial queda guardada tal cual, el usuario puede repetir la
     verificación cuando quiera).
3. **Error interno durante la verificación** (la llamada a Granola falla — credencial inválida
   de forma rara, timeout, respuesta inesperada, etc. — no confusión de cuál llamada era):
   - Al usuario: mensaje "Hubo un error, ya le avisamos al admin para que lo revise."
   - Al admin (Sebastián), por WhatsApp: "`<nombre del usuario>` intentó configurar Granola y
     tuvo un error: `<detalle del error>`."
   - El número de destino sale de una env var nueva (`ADMIN_ALERTA_WHATSAPP_NUMERO`); el envío
     usa la línea de WhatsApp activa existente (mismo criterio que cualquier envío directo hoy).

## Diseño

### Pieza A — Revelar credencial de Apollo (y cualquier conector admin)

**Server action nueva** en `app/conectores/actions.ts`:

```ts
export async function revelarCredencialAction(proveedor: string): Promise<
  { ok: true; credencial: string } | { ok: false; error: string }
>
```

- `requireSession()` + `sesion.admin` obligatorio (mismo patrón que las otras acciones admin).
- Llama `leerCredencialConector(proveedor)` (sin `idUsuario`: son conectores modo `admin`,
  credencial global).
- No genérico a "cualquier credencial de cualquier usuario" — deliberadamente solo cubre
  conectores en modo `admin` (Apollo, Notion, WhatsApp-servidor). Un conector modo `personal`
  (Granola, Apollo-si-cambiara-de-modo) nunca se revela por esta acción ni siquiera a un
  admin — es la credencial de otra persona.

**UI** (`CredencialForm.tsx` o un componente hermano nuevo, `RevelarCredencial.tsx`): botón
"Revelar" que llama la acción vía `useActionState`/transición cliente, muestra el valor
recibido en un `<code>` o input readonly. Sin polling, sin caché — cada clic vuelve a pedir el
valor descifrado.

### Pieza B — Verificación de Granola

**Nueva función en `app/adapters/granola.ts`**:

```ts
export async function ultimaNotaDe(idUsuario: string): Promise<
  { id: string; titulo: string | null; fecha: string; resumenCorto: string | null } | null
>
```

Reusa `leerCredencialConector('granola', idUsuario)` y el mismo cliente HTTP contra
`GRANOLA_API_BASE`, pidiendo la nota más reciente (primera página, sin filtro de términos).
`resumenCorto` = primeros ~200 caracteres de `summary_text` si existe.

**Server action nueva** en `app/conectores/actions.ts`:

```ts
export type ResultadoVerificacionGranola =
  | { ok: true; nota: { titulo: string | null; fecha: string; resumenCorto: string | null } }
  | { ok: false; error: 'sin_llamadas' | 'error_interno' }
```

Guarda la credencial (`guardarCredencialConector('granola', credencial, sesion.id)`), luego
llama `ultimaNotaDe(sesion.id)`:
- Nota encontrada → `{ ok: true, nota }`, la UI la muestra con botón "Sí, es la mía".
- Sin notas (cuenta nueva, cero llamadas) → `{ ok: false, error: 'sin_llamadas' }`, mensaje
  claro ("todavía no tienes llamadas grabadas en Granola").
- Excepción real (red, credencial inválida, respuesta inesperada) → `{ ok: false, error:
  'error_interno' }` **y dispara la alerta al admin** (ver Pieza C) antes de devolver el
  error a la UI.

Confirmar ("Sí, es la mía") no necesita otra acción server-side — la credencial ya quedó
guardada al llamar `ultimaNotaDe`; el estado `Configurado` sale del mismo `estadoConector` que
ya existe (credencial presente = configurado).

### Pieza C — Alerta WhatsApp al admin

**Función nueva**, reusable (no solo para Granola — cualquier error de conector personal a
futuro podría usarla): `app/lib/alerta-admin.ts`:

```ts
export async function avisarAdminPorWhatsapp(mensaje: string): Promise<void>
```

- Lee `ADMIN_ALERTA_WHATSAPP_NUMERO` de env. Si no está configurada, no lanza (el error
  original de Granola se muestra igual al usuario) — solo hace `console.error` y sigue. No se
  bloquea un flujo de usuario porque la alerta de admin no esté configurada.
- Resuelve la línea de WhatsApp activa (`lineaWhatsappActiva()`, mismo criterio que hoy) y
  llama `crearEvolutionAdapter().enviarPaso(referenciaProveedor, { telefono:
  ADMIN_ALERTA_WHATSAPP_NUMERO, email: null, nombre: null, empresa: null, cargo: null },
  { asunto: null, cuerpo: mensaje, canal: 'whatsapp' })`.
- Se llama best-effort: si el envío de la alerta en sí falla, se loguea, no se re-lanza (el
  usuario ya recibió su mensaje de "hubo un error").

## Testing

- `revelarCredencialAction`: no-admin → `ok:false`; admin sin credencial guardada → `ok:false`
  (o `credencial` vacía, a definir); admin con credencial → devuelve el valor descifrado
  correcto (mock de `leerCredencialConector`).
- `ultimaNotaDe`: mock del cliente HTTP — nota encontrada, lista vacía, error de red.
- Verificación de Granola end-to-end (con adaptador mockeado): caso feliz (nota + confirmar),
  caso sin llamadas, caso error interno → confirma que `avisarAdminPorWhatsapp` se llamó con
  el mensaje esperado.
- `avisarAdminPorWhatsapp`: sin env var configurada → no lanza, no llama al adaptador; con env
  var → llama `enviarPaso` con los argumentos correctos; si `enviarPaso` falla → no propaga.

## Fuera de alcance (v1)

- "Hacer una llamada de prueba en vivo" como alternativa a confirmar la última llamada
  grabada.
- Manejo especial cuando el usuario rechaza la nota mostrada ("esta no es mi llamada") — no
  hay un tercer estado ni un flujo de reintento guiado, solo queda como está.
- Revelar credenciales de conectores modo `personal` (Granola, etc.) — ni siquiera a un admin;
  son credenciales de otra persona.
- Panel de errores / historial de alertas al admin — la alerta es un mensaje de WhatsApp
  suelto, no queda registrada en ninguna tabla.

## Nota de contexto (colisión con otra sesión)

`docs/superpowers/specs/2026-07-14-split-pre-post-reunion-design.md` (spec de otra sesión en
paralelo, mismo día) menciona "17 campañas de prueba" pendientes de limpiar como parte de su
alcance. Esas 17 campañas YA fueron borradas en esta sesión (junto con sus `inscripcion`,
`cadencia`, `paso_cadencia` y los 5 `segmento` huérfanos que quedaban). Si esa otra sesión
sigue activa, su plan puede asumir datos que ya no existen — vale la pena confirmar con
Sebastián antes de que esa sesión continúe.
