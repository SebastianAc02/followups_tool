# Embudo real, registro que no entierra gente, e identidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans, tarea por tarea.

**Goal:** (1) que nadie más quede enterrado por el registro y rescatar a los que ya lo están; (2) que el embudo de `/pipeline` diga exactamente lo que dice Notion; (3) reparar las identidades mal fundidas.

**Contexto:** sucesor del plan `2026-07-15-reparacion-lectura-datos.md` (12 tareas, ejecutado y mergeado). Este plan corrige un bug que ESE plan introdujo (Task 9 / bug D) y ataca lo que quedó abierto.

---

## Lo que se midió el 2026-07-15 (todo verificado contra `../isps.db` y el CSV real)

**El CSV de Notion es la fuente de la verdad y cuadra 100% con el conteo manual de Sebastián:**

| Estado | Notion | DB (vivas) | DB con mi filtro `atacable` (roto) |
|---|---|---|---|
| lead | 213 | 211 | 125 |
| on_hold | 139 | 139 ✅ | 125 |
| firma_pago | 87 | 95 | 93 |
| oportunidad | 22 | 19 | **4** |
| contacto_iniciado | 14 | 34 | 32 |
| cierre_documentacion | 9 (+1 Contrato Firmado) | 11 | 10 |
| enviar_contrato | 1 (+1 Firma Pendiente) | 1 ✅ | 1 |

487 filas en el CSV. `diff_notion_db.ts`: **465 de 486 alineadas**, 9 estado-derivado, 12 sin fila (N), 10 páginas gemelas (O).

### Causa raíz 1 — `atacable` es un filtro de PROSPECCIÓN, no de pipeline (bug MÍO, del plan anterior)

La Task 9 del plan anterior cableó `where atacable=1` en `embudoPipeline`. Eso tumba 15 de las 22 oportunidades (AFINIA, ENEL, CLARO, TIGO, WOM, ETB, DIRECTV, acueductos — todas de Thomas).

**El razonamiento estuvo mal.** El síntoma era "46M de usuarios en Oportunidad": eso es un problema de **sumar suscriptores eléctricos**, no de contar empresas. Se sacaron las empresas cuando había que dejar de sumarles usuarios.

**Definición correcta (Sebastián, 2026-07-15):** `atacable` = "¿salgo a cazar esta cuenta con el producto ISP en la cadencia normal?". Ejemplos suyos: *"CELSIA es telco... CELSIA Internet no es telco, sino que es una ISP corporativo grande. Y esa no la atacaría normalmente."* Un `atacable=0` **sigue siendo un deal real** y sigue contando plata. Thomas trabaja ese segmento entero.

⇒ `atacable` vive en **segmentación** (a quién prospecto). El embudo **cuenta todo** y corta por categoría, porque Sebastián necesita ver *"cuánta plata me está entrando por ESPs y cuánta por ISP"*.

### Causa raíz 2 — 44 cuentas con estado de pipeline pero fuera de Notion, con CERO toques

Ninguna de las 44 tiene un solo toque ni una fila de `empresa_estado_historial`. Su `estado_notion` viene del seed del 30-jun, no de trabajo real.

**Regla de Sebastián (2026-07-15), textual:** *"opción uno es que no se haya activado y no se haya tocado nunca la cuenta; esté por fuera de Notion, lo cual sería un lead muerto que hasta que yo no lo active, no me debería aparecer ahí. En el momento en que me aparezca, debería automáticamente irlo a registrar a Notion. Dos, de pronto es una cuenta que yo nunca subí a Notion, pero sabemos que se tocó... lo ideal sería subirlo de una vez a Notion."*

Medido: **las 44 son del caso uno. Ninguna es del caso dos** (no hay ninguna tocada fuera de Notion).

Reconciliación exacta:
- `firma_pago` 95 = **80 de Notion** + 15 clientes viejos (`es_cliente=1`) que nunca pasaron por el pipeline → de ahí "no sé de dónde sacas tantos clientes"
- `contacto_iniciado` 34 = **15 de Notion** + 19 con estado falso (nadie las contactó jamás)
- `lead` 211 = **207 de Notion** + 4

Lista completa para revisión manual: `planning/revision-44-fuera-de-notion.txt`.

### Causa raíz 3 — el registro no es atómico ⇒ cuentas zombi (ESTO ROMPE PRODUCCIÓN)

`app/register/actions.ts`:
```
1. auth.api.signUpEmail(...)   -> crea el usuario Y le da sesión
2. crearMiembroVisitante(...) / crearMiembroYSetOwner(...)  -> crea la membresía
```
Sin transacción, sin rollback. Si el paso 2 falla, tira, o devuelve `false` (owner ya reclamado), **el paso 1 ya ocurrió**: persona autenticada, con cookie, sin organización. `requireSession` (que corre en TODA página) lanza `Error` → 500 permanente. En prod Next.js oculta el mensaje → "A server error occurred".

No es recuperable: no puede reintentar (correo ya existe) ni entrar (todo revienta).

**Evidencia dura en la DB local: 6 usuarios, 4 membresías. Dos zombis, uno es `felipe@onepay.la`.**

### Causa raíz 4 — el candado de solo-lectura es poco fiable (`enterWith`)

Reproducido en Node (`AsyncLocalStorage`):
- **Fuera de un `run()`**: `enterWith` se filtra al contexto raíz. La request de un visitante deja `soloLectura=true` pegado; una request posterior que nunca marcó nada lo hereda → si es un registro, `ErrorSoloLectura` → zombi.
- **Dentro de un `run()`**: el valor no sobrevive al `await` → `getStore()` da `undefined` → **el candado no cierra** → un visitante podría escribir en la base real (hueco de seguridad).

`read-only.test.ts` es **100% síncrono** (marca y lee sin un solo `await`): prueba el único caso que sí funciona. El comentario *"Verificado que propaga a través del await de requireSession"* no tiene test que lo respalde.

Que la fuga sea EL disparador para visitantes es **hipótesis** (no reproducible sin el runtime de prod). Que el registro no atómico convierta cualquier fallo del paso 2 en zombi permanente está **probado**.

### Causa raíz 5 — fusiones que juntaron identidades distintas

`CELSIA` (telco/utility, página Oportunidad de Thomas) fue fundida dentro de `901715847 CELSIA INTERNET S.A.S.`. Según Sebastián son **empresas distintas**. Consecuencias:
- La fila viva quedó clasificada `utility / atacable=0`, cuando CELSIA Internet **es ISP** (corporativo grande).
- La página "CELSIA" (Oportunidad) apunta a fila fundida → aparece `on_hold` → falta una oportunidad.
- Existe además `800249860 CELSIA COLOMBIA S.A. E.S.P.` (`telco_grande`, sin página) — el padre real.

Otras fusiones con categoría distinta entre absorbida y sobreviviente (revisar, no asumir): `DIRECTV` (isp→telco_grande), `Cablenet SAS` (isp→sae_plus), `Mundo Mas` (isp→sae_plus). Esas son mismo-nombre, probablemente legítimas.

**EMCALI: confirmado por Sebastián que las dos son la misma empresa** ("una apunta a la sección de ISP y la otra a la empresa de servicio público, pero son los mismos"). Filas: `9990000005 Emcali (ISP)` (contacto_iniciado, Felipe, con page_id) y `ntn-00c5ebd352be Emcali (ISP)` (contacto_iniciado, sin owner, sin page_id).

### Causa raíz 6 — la firma de los duplicados de Notion

**150 de los 213 leads son "Lead + SIN owner + razón social formal"** — una carga masiva que le hace sombra a las páginas de trabajo reales. Los 10 pares `DUP_NOTION` comparten esa firma exacta: página de trabajo (nombre corto, con owner, estado real) vs página formal (razón social, sin owner, "Lead").

Distribución owner×estado del CSV:

| Estado | CON owner | SIN owner |
|---|---|---|
| Lead | 63 | **150** |
| On Hold | 136 | 3 |
| Firma y Pago Realizado | 46 | **41** |
| Oportunidad | 19 | 3 |

⚠️ **Sistemas Palacios / SP SISTEMAS PALACIOS LTDA** e **Intercom de nariño / INTERCOMM DE NARIÑO SAS** tienen esa firma exacta y son los dos que Sebastián refutó como distintos. Con la evidencia nueva (y con EMCALI confirmado como el mismo patrón) vale la pena que los mire de nuevo. **No tocar sin su veredicto de a uno.**

---

## Bloque 1 — Producción rota (URGENTE, va primero)

### Task 1: Registro atómico (nadie más queda zombi)
**Files:** `app/register/actions.ts`, `app/db/organizacion-repository.ts`, tests.
- Reclamar el owner ANTES de crear la cuenta, o borrar el usuario si el reclamo falla (compensación explícita, en `try/catch`).
- El caso visitante también: `crearMiembroVisitante` puede tirar y hoy nadie lo atrapa.
- Test: si el reclamo falla, NO queda `user` huérfano.

### Task 2: `requireSession` rescata en vez de reventar
**Files:** `app/lib/session.ts`, ruta nueva de reclamo, tests.
- Usuario autenticado sin membresía ⇒ `redirect()` a una pantalla que le deja reclamar owner o entrar como visitante. Nunca `throw`.
- Rescata a `felipe@onepay.la` y a los zombis de producción.
- Test: sesión sin membresía redirige, no lanza.

### Task 3: Candado de solo-lectura real
**Files:** `app/lib/read-only.ts`, `app/lib/session.ts` (o middleware), `app/lib/read-only.test.ts`.
- Reemplazar `enterWith` por `run()` envolviendo la request (middleware de Next.js o wrapper explícito).
- Tests que **crucen `await`** y que corran **dos requests concurrentes** (visitante + no-visitante) verificando que no se pisan ni se filtran. Los tests actuales son síncronos y no prueban nada de esto.
- ⚠️ Decidir con Sebastián si `marcarSoloLectura` debe ir a un middleware (más limpio) o seguir en `requireSession`.

### Task 4: Limpiar cuentas de preview de la base real
**Files:** script.
- `test-preview@example.com` (Thomas), `test-preview2@example.com` (Felipe), `test-preview4@example.com` (Camilo), `preview-verify@example.com` ocupan los nombres reales. Thomas y Camilo todavía no se registran: si el nombre está tomado, les pasa lo mismo que a Felipe.
- Mismo criterio que los 58 dummies del plan anterior. Backup antes.
- ⚠️ En producción Felipe YA se registró bien (dicho por Sebastián). Confirmar el estado de prod antes de tocar: `select count(*) from user` vs `select count(*) from organizacion_miembro`.

---

## Bloque 2 — El embudo dice la verdad

### Task 5: Revertir el filtro `atacable` de `embudoPipeline`
**Files:** `app/db/repository.ts` (`embudoPipeline`), `app/db/repository.categoriaVista.test.ts`.
- Quitar el `innerJoin`+`where atacable=1` que metió la Task 9 del plan anterior.
- El test `'embudoPipeline solo cuenta las empresas atacables'` codifica el criterio EQUIVOCADO: reemplazarlo por uno que verifique que un carrier/utility SÍ cuenta como deal.
- Commit debe decir explícitamente que revierte un fix propio mal razonado.

### Task 6: El embudo corta por categoría (ISP vs ESP)
**Files:** `app/db/repository.ts`, `app/core/embudo.ts`, `app/pipeline/*`.
- `embudoPipeline` devuelve el desglose por `empresa_categoria.categoria` además del total.
- Objetivo de Sebastián: *"tendría que poder ver cuánta plata me está entrando por ESPs y cuánta plata por ISP"*.
- Los usuarios (suscriptores) se suman **por categoría**, no en un solo total — así ENEL no infla el número de ISP. Ese era el síntoma original de verdad.
- ⚠️ Decisión de UI pendiente con Sebastián (tabs, columnas, o stacked).

### Task 7: Las cuentas sin respaldo salen del pipeline
**Files:** `app/db/repository.ts` (predicado nuevo), tests.
- Predicado: `EN_PIPELINE` = está en Notion (`notion_page_id not null`) **o** tiene al menos un toque.
- Aplica al embudo, `/cola`, `/seguimiento`. Las 44 (0 toques, fuera de Notion) desaparecen del pipeline pero siguen en la base y en segmentación.
- Al activarse (primer toque) entra sola y dispara "registrar en Notion" (el auto-registro es producto nuevo, fuera de este plan; dejar el gancho).
- **Aceptación:** el embudo cuadra con el CSV: 213/139/87/22/14/9/1.

### Task 8: Invariante "el embudo cuadra con Notion"
**Files:** `scripts/verificar_invariantes.ts`.
- Check nuevo que compara el conteo por estado contra el CSV real y falla si difiere.
- Es el criterio de aceptación de Sebastián convertido en código, para que no se vuelva a desviar en silencio.

---

## Bloque 3 — Identidad (cada paso necesita veredicto humano)

### Task 9: Deshacer la fusión CELSIA → CELSIA INTERNET
**Files:** script + `sync_cambios`.
- Son empresas distintas (Sebastián, 2026-07-15). Separar `ntn-1e376ceb9dfb` (CELSIA) de `901715847` (CELSIA INTERNET).
- Reclasificar `CELSIA INTERNET S.A.S.` como **ISP corporativo grande** (`es_corporativo_grande=1`), no `utility`.
- Verificar que `CELSIA` queda en `oportunidad` con Thomas y que las oportunidades suben a 22 con Task 5.
- ⚠️ Revisar también `DIRECTV`, `Cablenet SAS`, `Mundo Mas` (fusiones con categoría distinta) — presentar de a una.

### Task 10: Fundir los dos EMCALI
**Files:** script.
- Confirmado por Sebastián: misma empresa. `9990000005 Emcali (ISP)` (con page_id, Felipe) sobrevive; `ntn-00c5ebd352be` se absorbe.
- Escribir el alias, como Cable Cauca.

### Task 11: Los 10 pares gemelos, de a uno
**Files:** ninguno (decisión) + script de aplicación.
- Presentar cada par con su firma (quién tiene owner, qué estado, qué página) para veredicto: mismo / distinto / satélite.
- Re-preguntar Sistemas Palacios e Intercom de nariño con la evidencia nueva de la carga masiva.
- Lista en `planning/deriva-notion-db.txt` + salida de `diff_notion_db.ts`.

### Task 12: Tabla `identidad_decision`
**Files:** migración, `app/db/schema.ts`, repository.
- `(a, b, veredicto: mismo|distinto|satelite_de, decidido_por, nota)`. Complemento de `empresa_alias`: hoy se guardan los SÍ pero no los NO, y el matcher re-propone los pares refutados en cada corrida.
- `satelite_de` necesita `id_empresa_matriz` en `empresa` (distinto de `opera_bajo_id`, que significa identidad muerta).
- Propuesta completa en el plan anterior, sección "Propuesta: registro de decisiones de identidad".

### Task 13: Crear las 12 SIN_FILA (bug N)
- ClonAI, Insumos y desechables, Delta ISP CRM, GASES DEL ORIENTE, Anta, CABLE Y TELECOMUNICACIONES CABLETELCO, SuperCable BQLLA, Hola - Comunicaciones Wifi, WIRELESS COLOMBIA, Caldas Data Company, naamiku.net, Wicom.
- Con aprobación de a una. SuperCable BQLLA es satélite (ya dicho); resolverlo cierra el 19/20 de Felipe.

---

## Bloque 4 — UI y features pedidas

### Task 14: Copiloto con textarea que crece
**Files:** `app/campanas/nueva/*`.
- Hoy es una línea sola y no se lee lo que uno escribe (foto de Sebastián, 2026-07-15). Textarea que se amplía con el contenido.

### Task 15: Segmentación puede filtrar "fuera de Notion"
**Files:** `app/db/validation.ts` (campo nuevo), `app/db/repository.ts` (`compilarSegmento`).
- Campo de segmento `en_notion` (sí/no) para poder cazar leads que nunca entraron al CRM.
- Aquí es donde vive `atacable` también (filtro de prospección, ver causa raíz 1).

### Task 16: Empresas de Thomas sin traer su historial
**Files:** scripts de sync.
- Registrar qué empresas están a su nombre (owner) — eso SÍ.
- **NO** traer sus toques ni su buying committee todavía (decisión de Sebastián, 2026-07-15).

---

## Fuera de alcance (producto nuevo, requiere brainstorming)
- Auto-registro en Notion al activar una cuenta muerta (el gancho lo deja la Task 7).
- Outbox DB→Notion de dos vías y la regla de deriva bidireccional (bug P: Mundo Cams, COMFIBRA).
- H (ficha PBX), J (toques on-the-fly), K (cadencias PBX), F2 (OR real en el motor de segmentos).
- Módulo `/pruebas` (ver memoria `project_modulo_pruebas_diseno_pendiente`).

## Riesgos
1. **Task 5 revierte código propio.** No borrar el test viejo sin leerlo: codifica el criterio equivocado, hay que reemplazarlo, no solo quitarlo.
2. **Task 3 toca seguridad.** El candado hoy puede estar abierto en prod. No mergear sin tests concurrentes que crucen `await`.
3. **Bloque 3 corrompe datos si se adivina.** Ningún emparejamiento sin veredicto explícito de Sebastián, de a uno. Ya se erró 2 de 3 veces (ver memoria `feedback_verificar_contra_conteo_manual`).
4. **Las líneas se mueven.** Usar `grep -n`, no confiar en números de línea.
5. **No hay acceso a la DB de producción** desde la sesión. Los conteos de zombis de prod los tiene que dar Sebastián.
