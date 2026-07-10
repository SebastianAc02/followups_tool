# Prueba real multicanal (correo + WhatsApp) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lanzar 2 campañas reales (correo→WhatsApp→teléfono y WhatsApp→correo→teléfono) contra 2 contactos de prueba, mandando correos REALES personalizados por Apollo y WhatsApp REALES por Evolution, con tracking de aperturas/clics, detección de respuestas (correo por poll, WhatsApp por webhook), fast-forward de la cadencia por script, y revisión de toques en la cola.

**Architecture:** Se cierran 4 huecos reales sobre la base existente: (1) personalización a Apollo (mandar organization_name/title en bulk_create + ampliar `DestinatarioEnvio`); (2) disparo real del envío en Apollo (paso `approve`); (3) envío real de WhatsApp (cablear `crearEvolutionAdapter` al registro + resolver línea/teléfono); (4) recepción de WhatsApp (cuerpo de `procesarRespuestaEntrante`, ya con 4 tests rojos). Todo respeta la arquitectura de puertos: el core no conoce Apollo ni Evolution.

**Tech Stack:** Next.js + TypeScript, Drizzle/better-sqlite3, node:test, Apollo API, Evolution API (Docker local), ngrok (tracking).

**Datos de la prueba (confirmados 2026-07-09):**
- Empresa 1 "Viajes Andinos", Bogotá, 1200 usuarios · contacto Sebastián, sacostamolina@outlook.com, +12368895214, cargo Gerente Comercial · Campaña A: correo(d0)→whatsapp(d1)→llamada(d2)
- Empresa 2 "Tour Caribe", Medellín, 800 usuarios · contacto Isabela, sdacostam@eafit.edu.co, +573215924704, cargo Gerente Comercial · Campaña B: whatsapp(d0)→correo(d1)→llamada(d2)
- Una inscripción activa por empresa (índice `ux_inscripcion_activa`) → una empresa por campaña.

**Reglas de ejecución:** cada tarea de código va con TDD (test rojo → verde → commit). Las tareas marcadas **[RUNBOOK]** mutan la DB real / mandan de verdad / necesitan el dev server: se hacen CON Sebastián, nunca en automático. El dev server y el worker los corre Sebastián (memoria: nunca correr previews).

---

## FASE A — Correo real personalizado

### Task A1: Ampliar `DestinatarioEnvio` con empresa y cargo (core) + proyección del repo

**Por qué:** hoy el destinatario que cruza el puerto solo lleva `{email, telefono, nombre}`, así que Apollo nunca recibe la empresa ni el cargo. Ampliar el tipo de dominio (mismo criterio D3 del plan WhatsApp: un solo destinatario, cada adaptador lee lo que necesita) y proyectarlos desde la DB.

**Files:**
- Modify: `app/core/ports/envio.ts` (tipo `DestinatarioEnvio`, ~línea 61-65)
- Modify: `app/db/repository.ts` (`pasoInscripcionesPendientes`, ~línea 2740-2784)
- Test: `app/db/repository.push.test.ts` (o el que cubre `pasoInscripcionesPendientes`)

- [ ] **Step 1: Ampliar el tipo** en `app/core/ports/envio.ts`:

```ts
export type DestinatarioEnvio = {
  email: string | null;
  telefono: string | null;
  nombre: string | null;
  // Personalizacion firmografica: Apollo los proyecta a {{company_name}}/{{title}}.
  // Nullable: un canal que no los use (WhatsApp) simplemente los ignora (D3).
  empresa: string | null;
  cargo: string | null;
};
```

- [ ] **Step 2: Test rojo** — extender el test de `pasoInscripcionesPendientes` para exigir `empresa` y `cargo` en la fila proyectada (seedear empresa con `nombre_oficial` y contacto con `cargo`, esperar que la fila los traiga). Correr: `npm test` → FALLA (campos ausentes / tipo).

- [ ] **Step 3: Proyectar en el repo** — en `pasoInscripcionesPendientes` agregar el join a `empresa` (por `inscripcion.idEmpresa`) y seleccionar `empresa.nombreOficial as empresa` y `contacto.cargo as cargo`. Devolver esos campos en el objeto destinatario.

- [ ] **Step 4:** `npm test` → PASA. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** `feat(envio): DestinatarioEnvio lleva empresa y cargo para personalizacion`

### Task A2: `bulk_create` de Apollo manda organization_name + title + last_name

**Files:**
- Modify: `app/adapters/apollo.ts` (`resolverContacto`, línea 148-163)
- Test: `app/adapters/apollo.test.ts` (con `fetch` mockeado, patrón existente)

- [ ] **Step 1: Test rojo** — en apollo.test.ts, llamar el flujo que invoca `resolverContacto` (via `enviarPaso` con `APOLLO_MAILBOX_ID` seteado y fetch mock) y assert que el body del POST a `/contacts/bulk_create` incluye `organization_name` y `title` tomados del destinatario. Correr → FALLA.

- [ ] **Step 2: Implementar** — en `resolverContacto`, el body pasa a:

```ts
body: JSON.stringify({
  contacts: [{
    email: destinatario.email,
    first_name: destinatario.nombre ?? undefined,
    organization_name: destinatario.empresa ?? undefined,
    title: destinatario.cargo ?? undefined,
  }],
  run_dedupe: true,
}),
```

- [ ] **Step 3:** `npm test` → PASA. `npx tsc --noEmit` → 0.

- [ ] **Step 4: Commit** `feat(apollo): mandar organization_name y title en bulk_create ([empresa]/[cargo] se personalizan)`

> Nota: `[ciudad]`/`[usuarios]` quedan FUERA (Apollo no tiene merge-tag nativo; requerirían custom fields — decisión diferida). En el copy de esta prueba, usar solo `[nombre]`, `[empresa]`, `[cargo]`.

### Task A3: Disparo real del envío en Apollo (`approve`) — VERIFICAR EN VIVO PRIMERO

**Por qué:** `enviarPaso` solo hace `add_contact_ids`. El envío real lo dispara `POST /emailer_campaigns/{id}/approve` (ver `scripts/apollo_probe_envio.py`, "approve dispara el envío real"). Hay que confirmar la semántica exacta contra Apollo antes de cablearlo (no inventar el dato).

- [ ] **Step 1 [RUNBOOK]:** correr el probe para (a) listar buzones y capturar `APOLLO_MAILBOX_ID`, (b) confirmar el flujo real de envío y qué exige `approve`:

```bash
python scripts/apollo_probe_envio.py --listar-buzones
```

- [ ] **Step 2:** setear `APOLLO_MAILBOX_ID=<id de buzon>` en `.env.local`.

- [ ] **Step 3: Decidir dónde va `approve`** según lo verificado: lo más probable es una llamada única por campaña tras `sincronizarCopy`. Agregar a `MotorSecuencia` (`app/core/ports/envio.ts`) el método `aprobarSecuencia(proveedorCampanaId: string): Promise<void>` e implementarlo en apollo.ts (`POST /emailer_campaigns/{id}/approve`), llamado una vez desde `lanzarCampanaAction` (`app/campanas/[id]/lanzar/actions.ts`) después de `sincronizarCopy`. Test del adaptador con fetch mock + test de que la acción de lanzamiento lo invoca.

- [ ] **Step 4:** `npm test` → PASA. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** `feat(apollo): aprobar la secuencia al lanzar (dispara el envio real)`

---

## FASE B — WhatsApp real (envío + recepción)

### Task B1: Cuerpo de `procesarRespuestaEntrante` (recepción) — LEARNING GAP (Sebastián)

**Files:** Modify `app/core/llego-respuesta.ts` (cuerpo, ~línea 90). Test ya existe: `app/core/llego-respuesta.test.ts` (4 tests rojos: 133-136 de la suite).

- [ ] **Step 1:** Sebastián escribe el cuerpo (decisiones A/B/C ya tomadas; pistas en los comentarios del archivo). Decisión abierta: orden idempotencia-vs-efectos y aislamiento del fallo del corte Apollo.
- [ ] **Step 2:** `node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/llego-respuesta.test.ts` → 9/9 PASA.
- [ ] **Step 3: Commit** `feat(core): procesarRespuestaEntrante corta cadencia y deja toque entrante`

> Si en el handoff Sebastián delega este cuerpo, Claude lo escribe respetando las 3 decisiones y el contrato de los 4 tests.

### Task B2: Envío real de WhatsApp (cablear adaptador + resolver línea/teléfono)

**Por qué:** `crearEvolutionAdapter().enviarPaso` existe y está probado pero nada lo llama (`whatsapp: null`). Para esta prueba se manda por la vía AUTOMÁTICA (worker), igual que correo, con una sola línea (`prueba`) sin throttle/round-robin todavía (D4 completo queda para después).

**Files:**
- Modify: `app/adapters/registro-envio.ts` (línea 22, `whatsapp: null`)
- Modify: `app/db/validation.ts` (`CANALES_AUTOMATICOS`, línea 17)
- Create/Modify: `app/db/repository.ts` — `pasoInscripcionesPendientes('whatsapp')` debe traer `referenciaProveedor` de la línea que manda. Para v1 de la prueba: resolver la línea activa única.
- Test: `app/db/repository.push.test.ts` y `app/core/push.test.ts` (o nuevo test de ruteo whatsapp)

- [ ] **Step 1: Resolver la línea** — agregar en repository.ts `lineaWhatsappActiva(): { referenciaProveedor: string } | null` (primera fila de `linea_whatsapp` con `estado='activa'`). Test: seed una línea, esperar su `referencia_proveedor`.

- [ ] **Step 2:** en el flujo de push para whatsapp, pasar `referenciaProveedor` de esa línea como `proveedorCampanaId` posicional que `enviarPaso` de Evolution usa como nombre de instancia (ver `evolution.ts:88-92`). El destinatario ya trae `telefono` (Task A1 lo proyecta; verificar que `pasoInscripcionesPendientes` lo incluye para whatsapp). Test: `pushPendientes` con canal whatsapp llama `enviarPaso(referenciaProveedor, destinatario, paso)`.

- [ ] **Step 3: Prender el canal** — `registro-envio.ts:22` → `whatsapp: crearEvolutionAdapter()`; agregar `'whatsapp'` a `CANALES_AUTOMATICOS` en `validation.ts`.

- [ ] **Step 4:** `npm test` → PASA (ojo: pasos whatsapp dejan de ser manuales; ajustar cualquier test que asuma whatsapp manual). `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** `feat(whatsapp): envio automatico real por Evolution (linea unica, sin throttle)`

> Trade-off a decidir con Sebastián: automático (worker manda solo, como correo) vs por aprobación en /cola. Este plan asume automático para ver "interacción real" sin clics. El throttle/jitter/round-robin (D4) queda para después de la prueba.

### Task B3 [RUNBOOK]: Migraciones + credencial + línea en la DB REAL

- [ ] **Step 1:** aplicar migraciones (contra `../isps.db`, con backup previo):
```bash
python scripts/migrate_whatsapp_dryrun.py && python scripts/migrate_whatsapp_apply.py
python scripts/migrate_mensaje_whatsapp_dryrun.py && python scripts/migrate_mensaje_whatsapp_apply.py
```
- [ ] **Step 2:** guardar el API key de Evolution como conector `whatsapp` (desde `/conectores` o `guardarCredencialConector('whatsapp', <AUTHENTICATION_API_KEY de ../whatsapp-osserver/.env>)`).
- [ ] **Step 3:** registrar la línea `prueba` en `linea_whatsapp` (numero 573105182997, tipo pool o personal, referencia_proveedor 'prueba', estado 'activa').

### Task B4 [RUNBOOK]: Apuntar el webhook de Evolution a la tool

- [ ] **Step 1:** setear `WHATSAPP_WEBHOOK_TOKEN=<secreto>` en `.env.local`.
- [ ] **Step 2:** con el dev server corriendo (lo levanta Sebastián), apuntar el webhook de la instancia `prueba` a `http://host.docker.internal:3000/api/webhooks/whatsapp?token=<secreto>` (eventos MESSAGES_UPSERT):
```bash
curl -X POST http://localhost:8080/webhook/set/prueba -H "apikey: <key>" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"http://host.docker.internal:3000/api/webhooks/whatsapp?token=<secreto>","events":["MESSAGES_UPSERT"]}}'
```
- [ ] **Step 3:** mandarse un WhatsApp de prueba desde otro número y verificar en los logs del server que el route recibe y `procesarRespuestaEntrante` corre.

---

## FASE C — Orquestación de la prueba

### Task C1 [RUNBOOK]: Seed de las 2 empresas + 2 contactos (DB real)

- [ ] **Step 1:** script `scripts/seed_prueba_multicanal.ts` (guard: exige `ISPS_DB_PATH`; para la prueba real apunta a `../isps.db` con backup) que inserta:
  - empresa `prueba-viajes-andinos` (Viajes Andinos, Bogotá, categoria 'agencia_viajes', org 1) + `empresa_usuarios` 1200 + contacto Sebastián (nombre, cargo 'Gerente Comercial', email, telefono +12368895214, es_principal 1).
  - empresa `prueba-tour-caribe` (Tour Caribe, Medellín, categoria 'agencia_viajes', org 1) + `empresa_usuarios` 800 + contacto Isabela (email, telefono +573215924704, cargo 'Gerente Comercial', es_principal 1).

### Task C2 [RUNBOOK]: Construir y lanzar las 2 campañas

- [ ] **Step 1:** script `scripts/lanzar_prueba_multicanal.ts` que, por cada campaña:
  - `crearCadencia` con 3 pasos (orden/diaOffset 0/1/2) en el orden de canales de cada campaña; copy con `[nombre]`, `[empresa]`, `[cargo]` (asunto+cuerpo).
  - `guardarSegmento` con condición `categoria en ['agencia_viajes']` filtrada a la empresa correspondiente (o por id de empresa).
  - `crearCampana` + `inscribirCampana`.
  - Replicar el bloque de `lanzarCampanaAction`: `crearCampanaExterna` → `guardarProveedorCampanaId` → `pasosParaSincronizarCopy` → `sincronizarCopy` → `guardarSincronizacionCopy` → **`aprobarSecuencia`** (Task A3).
- [ ] **Step 2:** verificar en Apollo que ambas secuencias existen con su copy y quedaron aprobadas.

### Task C3 [RUNBOOK]: Fast-forward por script

- [ ] **Step 1:** script `scripts/fast_forward_cadencia.ts` (arg: idInscripcion o idCampana, y nº de días) que: retrocede `inscripcion.fecha_inscripcion` N días y/o marca los pasos intermedios como `enviada` con `fecha_enviada` retroactiva, de modo que el gate `date(fechaProgramada) <= date(hoy)` deje debido el siguiente paso. Correr el worker después para materializarlo.

### Task C4 [RUNBOOK]: Correr la prueba end-to-end y revisar

- [ ] **Step 1:** `npm run worker` (Sebastián) → materializa el paso d0 de cada campaña. Correo A y WhatsApp B salen de verdad.
- [ ] **Step 2:** revisar en `/cola` los toques del día (correo automático informativo, WhatsApp, llamada manual). Verificar personalización real en la bandeja (outlook/eafit) y en Apollo.
- [ ] **Step 3:** responder un correo y un WhatsApp → verificar que el poll (correo) y el webhook (WhatsApp) cortan la cadencia y dejan toque; ver el corte reflejado en Apollo.
- [ ] **Step 4:** click en un link del correo → verificar evento `clic`/`abierto` en `evento_tracking`. (Tracking de link por WhatsApp: no soportado en esta prueba — pendiente, ver fuera de alcance.)
- [ ] **Step 5:** fast-forward (C3) para avanzar a d1/d2 y repetir la revisión de toques.

---

## Fuera de alcance de esta prueba (pendientes reales)
- Personalización de `[ciudad]`/`[usuarios]` en Apollo (custom fields).
- Panel UI de tasa de apertura/clic (hoy los eventos se guardan pero no hay pantalla).
- Tracking de apertura de link por WhatsApp (correlador por teléfono + canal parametrizado).
- D4 completo de WhatsApp: round-robin de líneas, throttle 25/día, jitter 60-180s, línea personal por borrador.
- Fast-forward como botón de UI (esta prueba usa script).

## Criterio de listo
Los 2 correos llegan a las bandejas REALES personalizados con nombre/empresa/cargo; los 2 WhatsApp llegan de verdad; responder a uno de cada canal corta su cadencia (correo por poll, WhatsApp por webhook) y deja un toque de revisión; un clic en link de correo queda registrado; el fast-forward avanza los pasos sin esperar días; y la cola muestra los toques del día por canal. Todo con `npx tsc --noEmit` en 0 y la suite verde (salvo lo que dependa del worker/servicios en vivo).
