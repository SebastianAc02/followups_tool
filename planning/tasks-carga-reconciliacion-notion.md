# Tareas: Carga y reconciliación Notion -> DB (Spec 1)

Spec: `planning/spec-carga-reconciliacion-notion.md`. Rama: `spec/carga-reconciliacion-notion`.

Reglas del proyecto que aplican a cada tarea:
- Un cambio por tarea, diff chico y revisable, un commit por tarea. Una por delegación.
- Hexagonal: el core (matcher, "el no gana", mapeo de estados) NO importa Notion ni el
  driver de DB. `NotionAdapter` es el puerto de lectura (hoy la fuente es el export
  por-página; mañana la API, sin tocar el core). Escritura solo por `Repository`.
- Una feature no está lista sin sus pruebas. Las tareas de core llevan TDD (test que falla
  primero). Las de UI/mecánicas pueden ir directo.
- Idempotencia obligatoria: correr el proceso dos veces no duplica ni re-registra.
- Fuente de Notion en esta fase: `~/Arc/Private & Shared 7/🔥 Sales Pipeline/` (export
  por-página + `_all.csv`). La DB real es `../isps.db` (un nivel arriba del proyecto).

Orden por dependencia: Fase 0 -> 1 -> 2 -> 3 -> 4. El fix de colaDelDia (T13) es
independiente y se puede hacer en cualquier momento (con cuidado de concurrencia).

---

## Fase 0: Deduplicación (revisión humana, Notion gana comercial)

- [x] **T1 · NotionAdapter: leer el export por-página.**
  Crear: `app/adapters/notion/notionExportAdapter.ts` (puerto de lectura).
  Test: `app/adapters/notion/notionExportAdapter.test.ts` con un fixture chico
  (2-3 `.md` + un CSV recortado en `app/adapters/notion/__fixtures__/`).
  Devuelve por empresa: `pageId` (de los últimos 32 chars del nombre de archivo),
  `nombre`, `industria`, `estado`, `contactoPrincipal`, `cargo`, `telefono`, `email`,
  `usuariosEstimados`, `pasarela`, `crm`, `owner`, `proximoPaso`, `fechaProximoPaso`, y la
  ruta de la subcarpeta si existe. Cuidado del BOM en la columna `Empresa` del CSV (leer
  con `utf-8-sig` equivalente / quitar `﻿`).
  Lista cuando: el adapter devuelve la lista parseada del fixture, con prueba.

- [ ] **T2 · Core: matcher de gemelos (función pura, sin fundir).**
  Crear: `app/core/reconciliacion/matcherGemelos.ts` + test.
  Recibe empresas Notion (T1) y empresas DB (nombre, id, tipo NIT vs sintético), devuelve
  pares candidatos con `score` (nombre normalizado exacto = 1.0; token overlap / distancia
  de edición para el resto) y los campos en conflicto. NO escribe nada.
  Lista cuando: prueba con casos reales de la exploración: `CELSIA INTERNET` (NIT
  901715847) vs su registro Notion -> par; dos empresas distintas -> no par; umbral de
  score configurable.

- [ ] **T3 · Reporte de candidatos para aprobar.**
  Crear: `scripts/dedup_reporte.ts` (orquesta T1 + T2 + Repository de solo-lectura).
  Escribe la lista de pares candidatos a `planning/dedup-candidatos.md` (o CSV):
  score, ambos ids, ambos nombres, campos en conflicto. Sin fundir nada.
  Lista cuando: corro el script y obtengo la lista de pares para que Sebastián marque
  cuáles fundir.

- [ ] **T4 · Repository: fundir un par aprobado (idempotente).**
  Modificar: `app/db/repository.ts` (nueva `fundirEmpresas(idSobrevive, idAbsorbido)`).
  Regla de fusión (decidida): sobrevive el registro NIT en identidad (conserva NIT y nombre
  legal); Notion gana en todo lo comercial (estado, owner, ciudad comercial, pasarela, crm,
  usuarios) y aporta su `notion_page_id` y sus contactos. Mueve contactos/toques al
  sobreviviente, escribe el alias en `empresa_alias`, registra el par en `sync_cambios`.
  Test: fundir dos veces no duplica alias ni contactos; el absorbido queda desreferenciado.
  Lista cuando: la prueba de idempotencia pasa y el alias + `sync_cambios` quedan.

---

## Fase 1: Enlace page_id universal

- [ ] **T5 · Repository + comando: enlazar page_id.**
  Modificar: `app/db/repository.ts` (`enlazarPageId(idEmpresa, pageId)` idempotente).
  Crear: `scripts/enlazar_page_ids.ts` que recorre las empresas Notion ya deduplicadas
  (post Fase 0) y las enlaza por el par aprobado / match exacto.
  Lista cuando: la cobertura de `notion_page_id` sube a ~100% de lo que está en Notion;
  correr dos veces no cambia filas (prueba de idempotencia sobre el repo).

---

## Fase 2: Categoría "el no gana"

- [ ] **T6 · Core: Industria Notion -> veto (función pura).**
  Crear: `app/core/reconciliacion/vetoCategoria.ts` + test.
  Mapea: ISP/vacío -> sin veto; Agua/Energía/Gas/Utility -> `es_utility_no_isp`;
  Telecom/Otro/Educación/Pasarela -> `es_no_isp_confirmado`.
  Lista cuando: prueba cubre las tres ramas (ISP, utility, telco).

- [ ] **T7 · Repository: escribir el veto de Notion en empresa_clasificacion.**
  Modificar: `app/db/repository.ts` (`marcarVetoNotion(idEmpresa, flag)`).
  Escribe el flag con `fuente='notion'`, sin borrar vetos DB existentes (unión, "el no
  gana"). Idempotente.
  Lista cuando: prueba que ENEL (Energía) queda `es_utility_no_isp` y la vista
  `empresa_categoria` la reporta fuera de `isp`.

- [ ] **T8 · App: leer categoría de la vista, no de la columna plana.**
  Modificar: `app/db/repository.ts` (segmento/`COLUMNA_SEGMENTO` líneas ~1288/1394),
  filtros de campaña (`app/campanas/**`), `app/ui/seguimiento/DetallePanel.tsx`.
  Cambiar el origen de `categoria` de `empresa.categoria` a la de `empresa_categoria` /
  `empresa_resumen` (`ec.categoria`).
  Lista cuando: un carrier (VERIZON) ya no sale como `isp` en la segmentación; `tsc` en 0;
  tests verdes.

---

## Fase 3: Estados (mapeo + sync de la deriva)

- [ ] **T9 · Core: mapeo estado Notion -> enum DB (función pura).**
  Crear: `app/core/reconciliacion/mapeoEstados.ts` + test.
  Uno-a-uno por nombre; huérfanos (decidido): `CONTRATO FIRMADO -> cierre_documentacion`,
  `FIRMA PENDIENTE -> cierre_documentacion`. Un estado desconocido lanza error (no rompe el
  CHECK silenciosamente).
  Lista cuando: prueba cubre ON HOLD, FIRMA Y PAGO REALIZADO, los dos huérfanos y un
  desconocido (que debe fallar).

- [ ] **T10 · Sync de la deriva por el camino auditado.**
  Crear: `scripts/sync_estados_notion.ts` (usa T9 + `cambiarEstadoNotion` de
  `repository.ts:4431`, NO escribe la columna a pelo).
  Notion sobrescribe (decidido). Solo toca las empresas con estado distinto.
  Lista cuando: las 22+ derivas quedan alineadas, el historial de etapas registra cada
  cambio, correr dos veces no vuelve a registrar (idempotente).

---

## Fase 4: Enriquecimiento desde Notion (Notion sobrescribe)

- [ ] **T11 · Contactos: Contacto Principal + Buying Comittee -> contacto.**
  Modificar: `app/db/repository.ts` (`upsertContactoNotion`). Usa T1 (incluye leer las
  fichas del comité de las subcarpetas).
  Mapea Nombre/Cargo/Celular/Correo/LinkedIn -> `contacto` con `fuente='notion'`,
  `cargo_categoria` clasificado (dueno/gerente/tecnico/...), `es_principal=1` para el
  Contacto Principal. Idempotente por (id_empresa, nombre normalizado) o teléfono.
  Lista cuando: Jigartel queda con Nayris (313 7933653); correr dos veces no duplica; los
  ~65 ISP genuinos quedan con contacto.

- [ ] **T12 · Campos de empresa + usuarios (Notion sobrescribe, guarda anterior).**
  Modificar: `app/db/repository.ts` (`enriquecerDesdeNotion`).
  Sobrescribe `pasarela_actual`, `crm_software`, `owner` (respetar owner canónico),
  `proximo_paso`, `proximo_follow_up_fecha`; y `empresa_usuarios.usuarios_estimados` con
  `usuarios_est_fuente='notion'` (usuarios_efectivos se recalcula solo). Guarda el valor
  anterior en `sync_cambios`.
  Lista cuando: prueba que sobrescribe un campo y que el valor anterior queda en
  `sync_cambios`.

---

## Fix separado (independiente): fuga de estado en la cola

- [ ] **T13 · colaDelDia deja de mostrar on_hold y firma_pago.**
  Modificar: `app/db/repository.ts` (`colaDelDia`, ~línea 193) agregando
  `sql\`COALESCE(estado_notion,'') NOT IN ('on_hold','firma_pago')\``; revisar
  `app/cola/agenda.ts` (`bucketDeEtapa` mapea on_hold -> 'lead').
  ANTES de editar: `git log`/`git status` de esta zona (la tocó otra sesión hoy con el
  split de cola); aislar el hunk propio, no especular.
  Lista cuando: colaDelDia deja de mostrar las 16 cuentas (12 on_hold + 4 firma_pago); test
  que cubre el filtro; el resto del split de cola sigue verde.
