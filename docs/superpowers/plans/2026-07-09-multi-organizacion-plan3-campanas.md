# Multi-organización real — Plan 3 (motor de campañas + reporting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (implementador + revisión de spec + revisión de calidad por tarea, igual que el Plan 1).
> Pausar cada 2-3 tareas completamente cerradas (implementador + ambas revisiones + commit)
> y dar un prompt de continuación autocontenido para una sesión nueva. Modelo tope: Sonnet;
> preferir Haiku para tareas mecánicas de 1-2 funciones que ya siguen un patrón establecido
> en una tarea anterior de este mismo plan.

**Goal:** Filtrar por `idOrganizacion` las ~48 funciones del motor de campañas/inscripciones y
reporting en `app/db/repository.ts`, y actualizar sus call sites (`app/campanas/*`,
`app/panel/*`, `app/cola/*`, `app/actions.ts`, `app/llamada/[id]/*`, `app/por-revisar/*`,
`app/cadencias/[id]/*`, `app/ui/shell/AppShell.tsx`, `app/page.tsx`) para pasar el
`idOrganizacion` de la sesión. Reemplaza los dos hardcodes temporales (`crearCampana`,
`aprobarPasoManual`) que dejó la Parte 1.

**Decisión de arquitectura tomada con Sebastián (2026-07-09), no negociable dentro de este
plan:** las funciones alcanzables SOLO desde `app/worker/index.ts` (cron sin sesión) o desde
`app/api/track/{click,open}/route.ts` (rutas públicas que golpea el cliente de correo del
lead, no un usuario logueado) **no reciben `idOrganizacion`**. No hay sesión de la cual
sacarlo en esos call sites, y forzar que el worker itere organización por organización hoy es
trabajo especulativo (solo existe Onepay; `conector`/`conector_config` ya dejan la puerta
abierta a credenciales por organización más adelante sin tocar esto). Cada una de esas
funciones queda con un comentario explícito citando esta decisión — ver Fase 3.3.

**Architecture:** Mismo patrón que la Parte 1 (`docs/superpowers/plans/2026-07-09-multi-organizacion-plan1-cola.md`):
`idOrganizacion: number` siempre último parámetro posicional. Lectura sobre `campana`:
`eq(campana.idOrganizacion, idOrganizacion)` en el `WHERE`. Lectura sobre
`inscripcion`/`destinatario`/`paso_inscripcion`/`evento_tracking` (sin columna propia): join
hasta `campana.id_organizacion`. Escritura sobre un recurso que puede pertenecer a otra
organización: guard `select` + `throw` si no existe + `throw` si no coincide la
organización, ANTES de cualquier escritura (idéntico a `registrarToque`).

**Tech Stack:** Next.js server components/actions, Drizzle ORM sobre SQLite (`isps.db`),
`node:test` + `better-sqlite3` para pruebas.

**Spec:** `docs/superpowers/specs/2026-07-09-multi-organizacion-real-design.md`

---

## Contexto para quien ejecute esto

- Worktree: `/Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool/.claude/worktrees/multi-organizacion-plan3-campanas`, rama `worktree-multi-organizacion-plan3-campanas`. Ya existe, está limpio, en `08ecbae` (main con la Parte 1 mergeada).
- `campana.idOrganizacion` YA es columna real `NOT NULL` en `schema.ts:261` y en `test-helpers.ts:208` (fixture con `DEFAULT 1`). NO hace falta migración ni tocar `schema.ts`/`test-helpers.ts` en este plan.
- `inscripcion`, `destinatario`, `paso_inscripcion`, `evento_tracking` NO tienen columna propia — se filtran SIEMPRE por join hasta `campana.id_organizacion`. Cadena de joins:
  - `inscripcion.idCampana → campana.idCampana`
  - `destinatario.idInscripcion → inscripcion.idInscripcion → inscripcion.idCampana`
  - `pasoInscripcion.idDestinatario → destinatario.idInscripcion → inscripcion.idCampana`
  - `eventoTracking.idPasoInscripcion → pasoInscripcion.idDestinatario → destinatario.idInscripcion → inscripcion.idCampana`
- `cadencia`/`pasoCadencia`/`versionPaso` son templates COMPARTIDOS por diseño — NUNCA se filtran por organización, ni en este plan ni en ningún otro.
- Patrón de guard de referencia — YA ESCRITO en `app/db/repository.ts`, leerlo antes de la primera tarea: `registrarToque` (líneas ~251-382, ver guard al inicio de la transacción) y `actualizarCampoCalificacion` (líneas ~384-427, guard sin transacción explícita).
- Los tests de `repository.ts` NO reciben `db` como parámetro: usan el singleton de `./index`, que lee `process.env.ISPS_DB_PATH` al importarse. Por eso todo test hace `process.env.ISPS_DB_PATH = dbPath` ANTES de `await import('./repository.ts')`.
- Corré los tests con `npm test` (todo el suite) o apuntando a un archivo: `node --experimental-strip-types --test app/db/repository.<archivo>.test.ts`.
- Las líneas citadas abajo son de la exploración hecha el 2026-07-09 sobre el HEAD actual del worktree (`08ecbae`). Si se movieron por una tarea anterior de este mismo plan, confiar en el nombre de función + `grep -n "export function <nombre>"`, no en el número de línea a ciegas.

---

## FASE 3.1 — Campaign CRUD directo (tabla `campana`)

### Task 1: `crearCampana` recibe `idOrganizacion` real (saca el hardcode)

**Files:** Modify `app/db/repository.ts:1622-1646`. Test: `app/db/repository.inscripcion.test.ts` (y de rebote todos los que siembran campañas vía `crearCampana`: `agenda`, `colaUnificada`, `copyApollo`, `goteo`, `manual`, `materializar`, `push`, `tracking`).

- [ ] **Step 1:** En `app/db/repository.inscripcion.test.ts`, agregar un test que falle:
  crear una campaña con `crearCampana({...}, 2)` y confirmar por lectura cruda
  (`SELECT id_organizacion FROM campana WHERE id_campana = ?`) que quedó `2`, no `1`.
- [ ] **Step 2:** Correr el test, confirmar que falla (tipos: `crearCampana` no acepta un
  segundo argumento, o el valor queda hardcodeado en 1).
- [ ] **Step 3:** En `app/db/repository.ts`, cambiar la firma:
  `export function crearCampana(input: CampanaInput, idOrganizacion: number): number` y
  reemplazar la línea `idOrganizacion: 1, // Hardcodeado a Onepay...` por
  `idOrganizacion,` en el `.values({...})` del INSERT. Es un INSERT (creación de un recurso
  nuevo), no necesita guard de lectura previa — solo recibe el valor de la sesión.
- [ ] **Step 4:** Correr `repository.inscripcion.test.ts`, confirmar que pasa. Después
  actualizar TODAS las llamadas a `crearCampana(input)` en los 9 archivos de test listados
  arriba para que pasen `, 1` como segundo argumento (la organización Onepay que ya siembra
  el resto de cada archivo). Correr `npm test 2>&1 | tail -80` y confirmar cero regresiones
  ajenas a este cambio.
- [ ] **Step 5:** Commit: `git add app/db/repository.ts app/db/repository.*.test.ts` y
  `git commit -m "feat(campana): crearCampana recibe idOrganizacion real, saca el hardcode"`.

### Task 2: `actualizarReglaFaltante` + `guardarProveedorCampanaId` — guard directo sobre `campana`

**Files:** Modify `app/db/repository.ts:1409-1425`. Test: `app/campanas/[id]/reglas/actions.ts` es el único caller de la primera; `app/campanas/[id]/lanzar/actions.ts` y `app/db/repository.copyApollo.test.ts`/`repository.goteo.test.ts` para la segunda. Crear o extender `app/db/repository.campana.test.ts` si no existe uno dedicado a estas mutaciones directas (revisar primero con `ls app/db/repository.campana.test.ts`; si no existe, crearlo con el mismo header/estilo que `repository.contarPorEstado.test.ts`: import de `Database` de `better-sqlite3`, `process.env.ISPS_DB_PATH` antes del `await import`, `test.after` que borra el archivo).

- [ ] **Step 1:** Escribir el test que falla para ambas funciones: sembrar una campaña con
  `idOrganizacion = 2` directo por SQL crudo (`INSERT INTO campana (...)` con
  `id_organizacion = 2`), y confirmar que `actualizarReglaFaltante(idCampana, 'segmento', 1)`
  lanza si se llama con organización 1, y no lanza (y sí actualiza) si se llama con 2. Mismo
  patrón para `guardarProveedorCampanaId`.
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Aplicar el guard de `registrarToque` a ambas. Ejemplo para
  `actualizarReglaFaltante`:
  ```ts
  export function actualizarReglaFaltante(idCampana: number, regla: ReglaFaltante, idOrganizacion: number): void {
    const camp = db.select({ idOrganizacion: campana.idOrganizacion }).from(campana).where(eq(campana.idCampana, idCampana)).get();
    if (!camp) throw new Error(`Campana ${idCampana} no existe`);
    if (camp.idOrganizacion !== idOrganizacion) throw new Error(`La campana ${idCampana} es de otra organizacion, no de ${idOrganizacion}`);
    db.update(campana).set({ reglaFaltante: regla }).where(eq(campana.idCampana, idCampana)).run();
  }
  ```
  Mismo guard para `guardarProveedorCampanaId` antes de su `UPDATE`.
- [ ] **Step 4:** Correr el/los test(s), confirmar que pasan. Actualizar las llamadas en
  `app/campanas/[id]/reglas/actions.ts` y `app/campanas/[id]/lanzar/actions.ts` para pasar
  `sesion.idOrganizacion` (usar `requireSession()` si esa action no la llama todavía).
  Actualizar `repository.copyApollo.test.ts`/`repository.goteo.test.ts` con `, 1` en sus
  llamadas a `guardarProveedorCampanaId`.
- [ ] **Step 5:** `npm test 2>&1 | tail -80`, confirmar verde salvo errores de `tsc` en call
  sites todavía no tocados (esperado, se resuelven en Fase 3.5).
- [ ] **Step 6:** Commit: `feat(campana): actualizarReglaFaltante y guardarProveedorCampanaId validan organizacion`.

### Task 3: `campanaConReglas` + `campanaParaSincronizarCopy` — filtro directo de lectura

**Files:** Modify `app/db/repository.ts:1369-1440`. Callers: `app/campanas/[id]/preview/page.tsx`, `app/campanas/[id]/reglas/actions.ts`, `app/campanas/[id]/reglas/page.tsx`, `app/campanas/[id]/segmento/page.tsx`, `app/campanas/[id]/actions.ts`.

- [ ] **Step 1:** Test que falla: sembrar una campaña en organización 2, confirmar que
  `campanaConReglas(idCampana, 1)` devuelve `null` (no filtra por owner como `contarPorEstado`,
  filtra siempre) y que `campanaConReglas(idCampana, 2)` sí devuelve la campaña. Mismo caso
  para `campanaParaSincronizarCopy`.
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Agregar `idOrganizacion: number` como último parámetro a ambas, y
  `eq(campana.idOrganizacion, idOrganizacion)` al `and(...)` del `WHERE` (hoy ambas filtran
  solo por `eq(campana.idCampana, idCampana)` — agregar la condición, no reemplazarla).
- [ ] **Step 4:** Correr el test, confirmar que pasa. Actualizar los 4 callers para pasar
  `idOrganizacion` desde `requireSession()`.
- [ ] **Step 5:** `npm test`, commit: `feat(campana): campanaConReglas y campanaParaSincronizarCopy filtran por organizacion`.

### Task 4: `guardarSincronizacionCopy` — documentar por qué NO cambia

**Files:** Modify `app/db/repository.ts:1486-1495` (solo comentario, sin cambio de firma ni de lógica).

- [ ] **Step 1:** Esta función escribe sobre `pasoCadencia`/`versionPaso` (templates
  compartidos, sin `idOrganizacion`, fuera de alcance de este plan por diseño — ver spec).
  No recibe `idCampana` en su firma: opera sobre un array de `pasos` ya resuelto por el
  caller. En ambos callers (`app/campanas/[id]/actions.ts`, `app/campanas/[id]/lanzar/actions.ts`)
  ese array se construye a partir de `campanaParaSincronizarCopy(idCampana, idOrganizacion)`
  (Task 3), que ya lanza/filtra si la campaña no es de la organización de sesión. El guard
  ya ocurrió antes de que `guardarSincronizacionCopy` se ejecute — agregarle uno propio
  exigiría un join extra por cada paso solo para repetir una validación que el caller ya hizo.
  Agregar un comentario arriba de la función explicando esto (cita esta tarea, no reinventar
  la explicación en cada lectura futura).
- [ ] **Step 2:** No hay test nuevo (no cambia comportamiento). Confirmar con
  `npm test 2>&1 | tail -20` que el archivo sigue en verde tal cual.
- [ ] **Step 3:** Commit: `docs(campana): guardarSincronizacionCopy no filtra, el guard ya ocurrio en el caller`.

### Task 5: `actualizarCampanaBasico`, `pausarCampana`, `reanudarCampana`, `marcarCampanaFinalizada` — guard directo

**Files:** Modify `app/db/repository.ts:1506-1516` y `:1678-1705`. Callers: `app/campanas/nueva/actions.ts`, `app/campanas/[id]/actions.ts`.

- [ ] **Step 1:** Test que falla para las 4 (mismo patrón de Task 2: sembrar campaña en
  organización 2, confirmar `throw` desde organización 1, éxito desde organización 2).
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Aplicar el guard de Task 2 a las 4. `pausarCampana`/`reanudarCampana`/
  `marcarCampanaFinalizada` ya hacen un `select` previo para devolver `{ok:false,error}` en
  vez de tirar — el guard de organización se agrega ANTES de ese `select` de negocio (si la
  campaña ni siquiera es de la organización que llama, ni se llega a evaluar el estado).
- [ ] **Step 4:** Correr, confirmar que pasan. Actualizar callers en `app/campanas/nueva/actions.ts`
  y `app/campanas/[id]/actions.ts` para pasar `idOrganizacion` de sesión.
- [ ] **Step 5:** `npm test`, commit: `feat(campana): actualizarCampanaBasico, pausar, reanudar y marcarFinalizada validan organizacion`.

### Task 6: `actualizarConfigLanzamiento` — guard directo

**Files:** Modify `app/db/repository.ts:2336-2354`. Caller: `app/campanas/[id]/lanzar/actions.ts`.

- [ ] **Step 1-5:** Mismo patrón exacto de Task 2/5 (test que falla → guard → caller →
  `npm test` → commit `feat(campana): actualizarConfigLanzamiento valida organizacion`).

### Task 7: `eliminarCampanaBorrador` — guard directo, es la más compleja de este bloque

**Files:** Modify `app/db/repository.ts:1653-1673`. Callers: `app/campanas/CampanaCard.tsx`, `app/campanas/actions.ts`, `app/campanas/nueva/actions.ts`.

- [ ] **Step 1:** Test que falla: campaña en organización 2, `eliminarCampanaBorrador(id, 1)`
  debe devolver `{ok:false, error: '...organizacion...'}` (esta función ya devuelve errores
  como valor en vez de lanzar — seguir su propia convención de retorno, NO usar `throw` aquí
  para no romper el contrato de tipo `{ok:true}|{ok:false,error:string}` que ya consume la UI).
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Agregar el guard de organización como el PRIMER chequeo (antes del check de
  `estado !== 'borrador'` y antes del check de `inscripcion` existente), devolviendo
  `{ok: false, error: 'La campaña es de otra organización'}` en vez de tirar.
- [ ] **Step 4:** Correr, confirmar que pasa. Actualizar los 3 callers.
- [ ] **Step 5:** `npm test`, commit: `feat(campana): eliminarCampanaBorrador valida organizacion antes de borrar`.

### Task 8: `campanaParaPreview`, `campanaResumen`, `campanaPorCadencia` — filtro directo de lectura

**Files:** Modify `app/db/repository.ts:1928-1980`, `:2083-2090`. Callers: `app/campanas/[id]/destinatarios/page.tsx`, `app/campanas/[id]/page.tsx`, `app/cadencias/[id]/page.tsx`.

- [ ] **Step 1-5:** Mismo patrón de Task 3 (agregar `idOrganizacion` al `WHERE`/`and`, sin
  guard porque son lectura pura que ya devuelve `null` si no matchea — igual que
  `campanaConReglas`). Un solo commit para las 3: `feat(campana): campanaParaPreview, campanaResumen y campanaPorCadencia filtran por organizacion`.

### Task 9: `listarCampanas`, `metricasHub`, `toquesGlobalesHoy`, `campanaParaLanzar` — filtro directo

**Files:** Modify `app/db/repository.ts:2149-2254`, `:2261-2270`, `:2291-2324`. Callers:
`app/campanas/page.tsx`, `app/page.tsx`, `app/ui/shell/AppShell.tsx`, `app/campanas/[id]/lanzar/actions.ts`, `app/campanas/[id]/lanzar/page.tsx`.

- [ ] **Step 1:** Test que falla en `app/db/repository.metricas.test.ts` (ya cubre
  `metricasHub`/`listarInscritasHub`) y en un test nuevo/existente para `listarCampanas`.
  `listarCampanas()` hoy no toma NINGÚN argumento — agregar `idOrganizacion` como único
  parámetro, filtrando el `WHERE`/`and` del join principal a `campana`.
  `toquesGlobalesHoy()` también sin argumentos hoy — mismo tratamiento.
  `metricasHub(idCampana?)` y `campanaParaLanzar(idCampana)` agregan `idOrganizacion` como
  último parámetro, filtrando el join a `campana`.
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Implementar los 4 filtros.
- [ ] **Step 4:** Correr, confirmar que pasan. Actualizar los 5 callers.
- [ ] **Step 5:** `npm test`, commit: `feat(campana): listarCampanas, metricasHub, toquesGlobalesHoy y campanaParaLanzar filtran por organizacion`.

### Task 10: `inscribirCampana` — guard directo, transacción grande

**Files:** Modify `app/db/repository.ts:1720-1912`. Callers: `app/campanas/[id]/destinatarios/actions.ts`, `app/campanas/[id]/destinatarios/page.tsx`, `app/campanas/[id]/lanzar/actions.ts`.

- [ ] **Step 1:** Test que falla en `app/db/repository.inscripcion.test.ts`: campaña en
  organización 2, `inscribirCampana(idCampana, 1)` lanza; `inscribirCampana(idCampana, 2)`
  inscribe normal.
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** El guard va DENTRO de la transacción existente, como primer paso (antes de
  leer el `estado` de la campaña para la validación de negocio que ya tiene). El resto de la
  función (resolución de segmento, inserts a `inscripcion`/`destinatario`) no cambia: ya
  cuelga de `idCampana`, que ya quedó validado por el guard.
- [ ] **Step 4:** Correr, confirmar que pasa. Actualizar los 3 callers.
- [ ] **Step 5:** `npm test`, commit: `feat(campana): inscribirCampana valida organizacion antes de inscribir`.

---

## FASE 3.2 — Motor de inscripciones/materialización (joins hasta `campana`)

### Task 11: `previsualizarInscripcionCampana`, `listarInscritasHub` — filtro joined

**Files:** Modify `app/db/repository.ts:2000-2076`, `:2364-2386`. Callers: `app/campanas/[id]/destinatarios/actions.ts`, `app/campanas/[id]/destinatarios/page.tsx`, `app/campanas/[id]/lanzar/actions.ts`, `app/campanas/page.tsx`.

- [ ] **Step 1-5:** `previsualizarInscripcionCampana` recibe `idCampana` — mismo trato que
  Task 3 (agrega `idOrganizacion` al `WHERE` sobre `campana`, ya la tiene en el `select`
  inicial). `listarInscritasHub(idCampana?)` hoy hace
  `.from(inscripcion).innerJoin(empresa,...).innerJoin(campana,...)` — agregar
  `eq(campana.idOrganizacion, idOrganizacion)` al `and(...)` existente. Test que falla →
  implementar → callers → `npm test` → commit `feat(inscripcion): previsualizarInscripcionCampana y listarInscritasHub filtran por organizacion`.

### Task 12: `inscripcionesBloqueadas`, `resolverInscripcionBloqueada` — filtro/guard joined

**Files:** Modify `app/db/repository.ts:2390-2433`.

- [ ] **Step 1:** ANTES de escribir código, correr
  `grep -rn "inscripcionesBloqueadas\|resolverInscripcionBloqueada" app --include="*.tsx" --include="*.ts" | grep -v ".test.ts"`
  para confirmar si ya tienen un caller de producción (la exploración previa no encontró uno
  claro — puede que vivan detrás de una ruta de `por-revisar` no cubierta por el nombre
  exacto, o que sean código sin UI todavía). Si no hay caller, igual se filtran: son
  escrituras/lecturas sensibles sobre inscripciones bloqueadas, mejor forzar el parámetro ya
  que agregar el guard después de que exista una UI real.
- [ ] **Step 2:** Test que falla: `inscripcionesBloqueadas` hoy no toma argumentos y no
  filtra por campaña ni organización (`WHERE estado='bloqueada'` global) — agregar
  `idOrganizacion` como único parámetro, `innerJoin` hasta `campana` vía `inscripcion.idCampana`.
  `resolverInscripcionBloqueada(idInscripcion, idContacto)` es escritura — agregar guard
  (select `inscripcion` innerJoin `campana`, throw si no existe/no coincide) ANTES de la
  transacción existente.
- [ ] **Step 3:** Correr, confirmar que falla.
- [ ] **Step 4:** Implementar. Correr, confirmar que pasa. Actualizar caller si el Step 1
  encontró uno.
- [ ] **Step 5:** `npm test`, commit: `feat(inscripcion): inscripcionesBloqueadas y resolverInscripcionBloqueada filtran por organizacion`.

### Task 13: `historialInscripciones`, `destinatariosDeInscripcion` — filtro joined

**Files:** Modify `app/db/repository.ts:2437-2460`.

- [ ] **Step 1:** Igual que Task 12 Step 1: `grep -rn` para confirmar callers de producción
  reales (la exploración solo encontró tests). Si no hay, filtrar igual — son lecturas de
  historial de una organización específica, no debe quedar abierto.
  `historialInscripciones(idEmpresa)` — agregar `idOrganizacion`, `innerJoin` a `campana`.
  `destinatariosDeInscripcion(idInscripcion)` — agregar `idOrganizacion`, `innerJoin` desde
  `destinatario` hasta `campana` vía `inscripcion`.
- [ ] **Step 2-5:** Test que falla → implementar → callers (si los hay) → `npm test` →
  commit: `feat(inscripcion): historialInscripciones y destinatariosDeInscripcion filtran por organizacion`.

### Task 14: `agendaEnSeco` — filtro joined

**Files:** Modify `app/db/repository.ts:2467-2502`.

- [ ] **Step 1:** Mismo chequeo de caller real que Task 12/13 (`grep -rn "agendaEnSeco" app`).
  Ya hace `innerJoin(campana,...).innerJoin(empresa,...)` con
  `where(and(eq(inscripcion.estado,'activa'), eq(campana.estado,'activa')))` — agregar
  `eq(campana.idOrganizacion, idOrganizacion)` al mismo `and(...)`.
- [ ] **Step 2-5:** Test que falla → implementar → caller (si lo hay) → `npm test` →
  commit: `feat(inscripcion): agendaEnSeco filtra por organizacion`.

### Task 15: `pasosManualesPendientes`, `agendaHoyCadencias`, `historialPasosDestinatario` — filtro joined

**Files:** Modify `app/db/repository.ts:2775-2814`, `:2872-2936`. Callers: `app/por-revisar/ToqueRevisar.tsx`, `app/por-revisar/page.tsx`, `app/ui/shell/AppShell.tsx`, `app/cola/page.tsx`.

- [ ] **Step 1:** Las 3 son lecturas sin argumentos hoy, con múltiples `innerJoin` que ya
  llegan hasta `campana` (`pasosManualesPendientes` y `agendaHoyCadencias`) o hasta
  `pasoCadencia` sin pasar por `campana` (`historialPasosDestinatario` — ahí hay que agregar
  el `innerJoin` hasta `campana` vía `destinatario→inscripcion`, hoy no lo tiene). Agregar
  `idOrganizacion` como único parámetro a las 3, filtrando por `campana.idOrganizacion`.
- [ ] **Step 2:** Test que falla en el archivo de test correspondiente (`repository.manual.test.ts`
  para la primera, `repository.colaUnificada.test.ts`/`repository.materializar.test.ts` para
  las otras dos).
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr, confirmar que pasan. Actualizar los 4 callers (`por-revisar/page.tsx`,
  `ToqueRevisar.tsx`, `AppShell.tsx`, `cola/page.tsx`) para pasar `idOrganizacion` de sesión.
- [ ] **Step 5:** `npm test`, commit: `feat(inscripcion): pasosManualesPendientes, agendaHoyCadencias e historialPasosDestinatario filtran por organizacion`.

### Task 16: `marcarPasoInscripcionCompletadaManual` — guard joined

**Files:** Modify `app/db/repository.ts:2757-2762`. Caller: `app/llamada/[id]/actions.ts`.

- [ ] **Step 1:** A diferencia de sus 3 funciones hermanas (`Enviando`/`Enviada`/`Fallo`, que
  son worker-only y NO se tocan en este plan — ver Fase 3.3), esta SÍ tiene un caller con
  sesión real (`app/llamada/[id]/actions.ts`). Test que falla: `pasoInscripcion` cuya
  `destinatario→inscripcion→campana` es de organización 2, `marcarPasoInscripcionCompletadaManual(id, fecha, 1)` lanza.
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Guard: `select` con `innerJoin` desde `pasoInscripcion` hasta `campana.idOrganizacion`, `throw` si no existe/no coincide, ANTES del `UPDATE` existente.
- [ ] **Step 4:** Correr, confirmar que pasa. Actualizar `app/llamada/[id]/actions.ts`.
- [ ] **Step 5:** `npm test`, commit: `feat(inscripcion): marcarPasoInscripcionCompletadaManual valida organizacion`.

### Task 17: `aprobarPasoManual` — guard joined, saca el segundo hardcode

**Files:** Modify `app/db/repository.ts:2826-2863`. Callers: `app/actions.ts`
(`aprobarPasoManualAction`, `aprobarLoteManualAction`), `app/llamada/[id]/actions.ts`,
`app/por-revisar/actions.ts`.

- [ ] **Step 1:** Test que falla en `app/db/repository.manual.test.ts`: `pasoInscripcion`
  cuya campaña es de organización 2, `aprobarPasoManual(id, fecha, cuerpo, 1)` lanza y NO
  inserta el `toque`; `aprobarPasoManual(id, fecha, cuerpo, 2)` sí aprueba, y el `toque`
  insertado queda con `id_organizacion = 2` (no el hardcode `1` actual).
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Guard con `innerJoin` desde `pasoInscripcion` hasta `campana.idOrganizacion`
  (misma cadena que Task 16), ANTES de la transacción existente. Reemplazar el
  `idOrganizacion: 1, // este toque nace del motor de cadencias, que todavia no filtra...`
  del `INSERT INTO toque` por `idOrganizacion` (el parámetro ya validado).
- [ ] **Step 4:** Correr, confirmar que pasa.
- [ ] **Step 5:** Actualizar `app/actions.ts`: `aprobarPasoManualAction` y
  `aprobarLoteManualAction` YA llaman `await requireSession()` pero descartan el resultado —
  usar la sesión para pasar `sesion.idOrganizacion` a `aprobarPasoManual`. Actualizar también
  `app/llamada/[id]/actions.ts` y `app/por-revisar/actions.ts`.
- [ ] **Step 6:** `npm test`, commit: `feat(inscripcion): aprobarPasoManual valida organizacion y saca el hardcode de Onepay`.

---

## FASE 3.3 — Cluster worker-only: documentar la decisión, sin cambio de firma

### Task 18: Comentario de decisión en las 12 funciones alcanzables solo desde el worker o rutas públicas de tracking

**Files:** Modify `app/db/repository.ts` (solo comentarios, cero cambio de comportamiento ni
de firma): `materializarPasosDebidos` (:2531), `crearPasoInscripcionPendiente` (:2648),
`pasoInscripcionesPendientes` (:2688), `marcarPasoInscripcionEnviando` (:2738),
`marcarPasoInscripcionEnviada` (:2744), `marcarPasoInscripcionFallo` (:2764),
`campanasConSecuencia` (:2939), `resolverDestinatarioPorEmail` (:2951),
`guardarEventoTracking` (:2978), `pausarInscripcion` (:3003), `marcarDestinatarioSalio` (:3011),
`quedanDestinatariosActivos` (:3015).

- [ ] **Step 1:** ANTES de tocar nada, confirmar con `grep -rn "<nombreFuncion>(" app --include="*.ts" --include="*.tsx" | grep -v ".test.ts"` que cada una de las 12 SOLO aparece en `app/worker/index.ts`, `app/core/tracking.ts` (que a su vez solo lo llama `app/worker/index.ts`), o `app/api/track/{click,open}/route.ts`. Si alguna aparece en un caller con sesión que la exploración inicial no detectó, sacarla de esta tarea y tratarla como Task 16 (guard joined) — parar y avisar en el commit de esta tarea cuál se movió y por qué.
- [ ] **Step 2:** Agregar UNA línea de comentario arriba de cada función (no reescribir el
  comentario existente si ya hay uno, agregar debajo):
  ```ts
  // Multi-organizacion (Parte 3, 2026-07-09): NO filtra por organizacion a proposito. Solo
  // la alcanza app/worker/index.ts (cron sin sesion) o una ruta publica de tracking sin
  // usuario logueado -- no hay idOrganizacion disponible en ese contexto. Decision
  // confirmada con Sebastian: procesa el pool completo cross-organizacion por diseno.
  ```
- [ ] **Step 3:** `npm test 2>&1 | tail -40`, confirmar cero cambio de comportamiento (no
  hay test nuevo, es solo documentación).
- [ ] **Step 4:** Commit: `docs(inscripcion): documentar por que el cluster worker-only no filtra por organizacion`.

---

## FASE 3.4 — Reporting/panel

### Task 19: `contarToquesEnRango`, `contarToquesEnDia`, `leadsTocadosEnRango` — filtro directo sobre `toque.idOrganizacion`

**Files:** Modify `app/db/repository.ts:3034-3047`. Caller: `app/panel/page.tsx`. Test: `app/db/panel.test.ts`.

- [ ] **Step 1:** Test que falla: `toque` con `id_organizacion = 2` sembrado además de los de
  organización 1, confirmar que `contarToquesEnRango(desde, hasta, 1)` no lo cuenta y
  `contarToquesEnRango(desde, hasta, 2)` sí. `toque` YA tiene columna propia `idOrganizacion`
  (Parte 1) — es el filtro más simple del plan, sin join.
- [ ] **Step 2:** Correr, confirmar que falla.
- [ ] **Step 3:** Agregar `idOrganizacion: number` como último parámetro a las 3 (
  `contarToquesEnDia` es wrapper de `contarToquesEnRango`, propaga el parámetro), y
  `eq(toque.idOrganizacion, idOrganizacion)` al `and(...)` del `WHERE`.
- [ ] **Step 4:** Correr, confirmar que pasa. Actualizar `app/panel/page.tsx`.
- [ ] **Step 5:** `npm test`, commit: `feat(panel): contarToquesEnRango, contarToquesEnDia y leadsTocadosEnRango filtran por organizacion`.

### Task 20: `toquesPorCanal`, `toquesPorResultado` — filtro directo

**Files:** Modify `app/db/repository.ts:3049-3063`. Caller: `app/panel/page.tsx`. Test: `app/db/panel.test.ts`.

- [ ] **Step 1-5:** Mismo patrón exacto de Task 19 (`toque.idOrganizacion` directo, sin
  join). Commit: `feat(panel): toquesPorCanal y toquesPorResultado filtran por organizacion`.

### Task 21: `campanasActivas`, `inscripcionesActivas` — filtro joined (hoy no pasan por `campana`)

**Files:** Modify `app/db/repository.ts:3065-3074`. Caller: `app/panel/page.tsx`,
`app/campanas/[id]/lanzar/LanzarCockpit.tsx`, `app/campanas/[id]/lanzar/actions.ts`,
`app/ui/shell/AppShell.tsx`. Test: `app/db/panel.test.ts`.

- [ ] **Step 1:** Ojo: `campanasActivas` hoy cuenta
  `SELECT count(DISTINCT idCampana) FROM inscripcion WHERE estado='activa'` — NO hace join a
  `campana` en absoluto. Hace falta agregar `innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))`
  para poder filtrar por `campana.idOrganizacion`. `inscripcionesActivas` cuenta
  `SELECT count(*) FROM inscripcion WHERE estado='activa'` — mismo problema, mismo fix.
- [ ] **Step 2:** Test que falla: inscripción activa colgando de una campaña de organización
  2, confirmar que no cuenta desde organización 1.
- [ ] **Step 3:** Correr, confirmar que falla.
- [ ] **Step 4:** Implementar el join + filtro en ambas.
- [ ] **Step 5:** Correr, confirmar que pasa. Actualizar los 4 callers.
- [ ] **Step 6:** `npm test`, commit: `feat(panel): campanasActivas e inscripcionesActivas filtran por organizacion via join a campana`.

### Task 22: `empresasPorCadencia` — filtro joined (ya pasa por `campana`)

**Files:** Modify `app/db/repository.ts:3076-3084`. Caller: `app/panel/page.tsx`. Test: `app/db/panel.test.ts`.

- [ ] **Step 1-5:** Ya hace `innerJoin(campana,...).innerJoin(cadencia,...)` — agregar
  `eq(campana.idOrganizacion, idOrganizacion)` al `and(...)` del `WHERE` existente (o
  agregarlo si hoy no tiene `where` explícito, solo `groupBy`). Test que falla → implementar
  → caller → `npm test` → commit: `feat(panel): empresasPorCadencia filtra por organizacion`.

---

## FASE 3.5 — Barrido final de tipos y verificación

### Task 23: `npx tsc --noEmit` en cero

**Files:** Ninguno específico — barrido de todo lo que quedó pendiente de las 22 tareas
anteriores (llamadas a estas funciones que todavía no reciben `idOrganizacion` en algún
archivo no cubierto explícitamente arriba).

Callers conocidos pendientes desde ya (detectados durante la revisión de calidad del Task 1,
no esperar a este task para descubrirlos de cero): `app/campanas/nueva/actions.ts:63`
(`crearCampana`) y `scripts/demo_fase4.ts:58,67` (`crearCampana`, script de demo manual — no
lo corre `npm test` pero sí lo marca `tsc --noEmit`).

- [ ] **Step 1:** Correr `npx tsc --noEmit`, listar TODOS los errores restantes.
- [ ] **Step 2:** Por cada error, es una llamada a una de las 39 funciones filtradas/con
  guard de este plan que todavía no pasa `idOrganizacion` — agregar `requireSession()` (si
  el archivo no la tiene ya) y pasar `sesion.idOrganizacion`. NO tocar ninguna llamada a las
  13 funciones de segmentos (Parte 2, fuera de este plan) ni a las 12 del cluster worker-only
  (Fase 3.3, a propósito sin cambio de firma).
- [ ] **Step 3:** Repetir hasta `npx tsc --noEmit` en cero.
- [ ] **Step 4:** `npm test 2>&1 | tail -100`, confirmar el suite completo en verde.
- [ ] **Step 5:** Commit: `fix(campana): actualizar call sites restantes para pasar idOrganizacion (tsc en cero)`.

### Task 24: Verificación manual en preview (opcional si el tiempo lo permite, no bloquea el merge)

- [ ] **Step 1:** `preview_start`, navegar a `/campanas`, `/panel`, `/cola`, `/por-revisar`
  logueado como el usuario de Onepay (organización 1). Confirmar que todo se ve igual que
  antes del plan (cero regresión visible, esta es la garantía real de "ningún owner actual
  cambia de comportamiento" del spec).
- [ ] **Step 2:** No hay una segunda organización con datos reales todavía (Parte 2 de
  invitaciones no ha corrido) — no es posible probar en preview el caso "no veo los datos de
  otra organización" end-to-end. Queda cubierto solo por los tests de Repository de las
  Fases 3.1-3.4, que sí siembran una segunda organización directo por SQL.

---

## Cierre

Al terminar las 23-24 tareas: `npm test` y `npx tsc --noEmit` en cero, y usar
`superpowers:finishing-a-development-branch` para decidir integración — probablemente
"mergear localmente a main" si para entonces la Parte 2 (segmentos) ya mergeó, o "dejar la
rama como está" si todavía no.
