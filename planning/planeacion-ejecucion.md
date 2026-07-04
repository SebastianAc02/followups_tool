# Planeación de ejecución · followups-tool v2

Documento vivo. Desde aquí se ejecuta. Cada vez que se cierra un paso, se marca y se anota
en la bitácora. El plan de arquitectura completo vive en plan-claude-v2.md; este es el
tablero operativo: qué sigue AHORA, en qué orden, con qué gate.

Última actualización: 2026-07-03.

---

## Próxima acción (lo único que importa ahora mismo)

> **Arrancar Fase 1 (F0, cerrar el core).** G0 ya está verde: Apollo verificado. La
> siguiente pieza es la deuda del core de la que todo cuelga.

G0 cerrado el 2026-07-03: las 5 pruebas de lectura pasaron; `usage_stats` confirmó crear
contactos/empresas, add_contact_ids, gestionar/frenar secuencias y leer tracking. Y la prueba
en vivo confirmó que CREAR secuencias por API SÍ funciona en Professional (lo que Sebastián
quería automatizar; corrige la salvedad previa). Residuo: dos borradores de prueba quedaron
archivados (el plan no tiene DELETE de secuencias); si se quieren borrar, a mano en Archived.
Detalle e incidente en experimento-apollo.md.

---

## Gates (barreras que no se cruzan sin cumplirse)

- **G0 · Apollo verificado (SOLO LECTURA). ✅ VERDE (2026-07-03).** Las 5 pruebas pasaron;
  usage_stats confirmó los endpoints de escritura habilitados sin escribir nada. Salvedad:
  sequences/create por API no habilitado (shell se crea en UI). Bloqueaba Fase 5; liberado.
- **G1 · Escritura de Apollo probada** (create-contact + add-to-sequence con contacto de
  descarte que se borra). Ocurre AL construir Fase 5, no antes. Bloquea el envío real.
- **G2 · Agent SDK headless probado.** Que el ClaudeAdapter corra sobre el plan sin sesión
  interactiva. Bloquea Fase 6; plan B es API con presupuesto chico (el puerto no cambia).

Regla: un gate rojo detiene solo lo que depende de él. Las fases independientes siguen.

---

## Secuencia de fases (marcar al cerrar; cada una cierra con demo + pruebas + /code-review)

- [x] **Fase 0 · P0 Apollo (G0). ✅** Solo lectura. Corrido 2026-07-03: G0 verde, supuesto
      sostenido. Resultados y decisión en experimento-apollo.md.
- [ ] **Fase 1 · F0 cerrar el core.** ALTER a `toque` (razon_perdida, objecion), 4 salidas
      validadas en código, KDM a `contacto`, canal real, tap WhatsApp/correo, contadores del
      día. Reflejar en schema.ts las columnas reales usadas. Migración con dry-run + apply.
      Demo: registro "contestó-no" con razón Precio y el KDM queda en contacto.
- [ ] **Fase 2 · Auth (B3).** Better Auth email+password, owner=email, flag admin, tablas en
      la misma SQLite. Demo: login de Sebastián y Felipe; sin sesión no se ve nada.
- [ ] **Fase 3 · F1 conectores + ingest Granola + outbox Notion.** Tabla `conector`
      (AES-256-GCM), tabla `outbox`, worker (B7) con heartbeat, GranolaAdapter, matcher a cola
      de revisión, idempotencia (B4), pantalla de estado de conectores. Demo: reunión real de
      Granola aparece como toque con resumen; una inventada cae en la cola.
- [ ] **Fase 4 · F3 sin envío.** Tablas grupo 1 y 2 del Anexo (cadencia/paso/version_paso/
      segmento/campana/inscripcion con índice único parcial/destinatario). Import CSV/MD,
      segmentos guardados, A/B, constructor calendario con corrimiento. Motor probado EN SECO.
      Demo: subo mi cadencia, la veo por días, inscribo "on-hold", veo los toques de mañana sin
      enviar nada, una sola inscripción activa por empresa.
- [ ] **Fase 5 · F3.5 + F4 (requiere G0 verde, y prueba G1 dentro).** Tablas grupo 3
      (paso_inscripcion, evento_tracking), EnvioAdapter con implementación Apollo, poll de
      tracking, reply detection que pausa, B6 completo. Demo: cadencia real en segmento chico;
      una respuesta pausa la inscripción sola.
- [ ] **Fase 6 · F5 + F6 IA (prueba G2 dentro).** ClaudeAdapter vía Agent SDK, extracción de
      borradores, flujo borrador -> aprobar -> outbox. Evals en evals.md antes de darla por
      lista. Demo: llega reunión y el borrador completo espera revisión.
- [ ] **Fase 7 · F2 panel admin.** KPI de follow-ups perdidos/semana, métricas de equipo,
      flag admin. Solo lee. Demo: entro como admin y veo el pulso de la semana.

---

## Reglas de ejecución (heredadas; se cumplen en cada fase)

De la constitución: el core no importa Granola/Notion/Claude/Apollo/driver de DB (todo por
puertos); acceso a datos solo por Repository; `canal` y `transcript_proveedor` son DATOS;
DB -> Notion una sola vía con revisión humana; textos para humanos en voz-onepay; una tarea
de tasks.md por delegación, diff pequeño; una feature no está lista sin sus pruebas.

Del orquestador (stack B, JS/Next): cada fase de backend corre `api-patterns` + `database`
(nunca los de Laravel); `design-patterns` al crear cada adaptador nuevo; `qa-test-planner`
antes de escribir pruebas; `testing` genérico; `/code-review` como gate de cierre de CADA
fase. Frontend arranca con `taste-skill`; superficies nuevas grandes (el calendario de F4, el
panel de F7) suman `impeccable` + `frontend-design`. `ddd-architecture` se salta (es Vue/Nuxt;
las fronteras ya están fijadas por la constitución).

---

## Decisiones abiertas que se resuelven al llegar a su fase (no ahora)

- Toques atrasados cuando el worker no corrió un día: se re-anclan a la fecha real de envío
  (decidido en B6). Detalle fino del re-escalonado: se cierra al construir F3.6 (Fase 4).
- Segmentación por lenguaje natural (F3.1 estilo Clay): v1 es UI de filtros (Fase 4); el
  lenguaje natural llega apoyado en el ClaudeAdapter (Fase 6).
- Qué otros proveedores de transcript además de Granola: el modelo ya los admite como dato;
  no bloquea nada, se agregan cuando haya uno real.

---

## Bitácora

- 2026-07-03 · Diseñado el experimento P0 (experimento-apollo.md) y el script de sondeo
  read-only (scripts/apollo_probe.py). Verificados contra docs.apollo.io los 4 endpoints de
  lectura (email_accounts, emailer_campaigns/search, emailer_messages/search, usage_stats):
  todos master key, 0 créditos. Header real confirmado `X-Api-Key` (los docs dicen Bearer; el
  script prueba ambos).
- 2026-07-03 · Corrido P0 con la key master real. Las 5 pruebas 200. usage_stats enumera 70
  endpoints habilitados; entre ellos contacts/create, contacts/bulk_create,
  emailer_campaigns/add_contact_ids/approve/abort/archive/remove_or_stop, accounts/create,
  fields/create, tasks/create, phone_calls/create — todos cuota 2000/día, consumed 0.
  Confirmadas las escrituras de la feature SIN escribir nada. Rate limit 200/min, 400/h,
  2000/día. **Gate G0 verde.**
- 2026-07-03 · Probado en vivo que CREAR secuencias por API funciona en Professional
  (`POST /sequences` y `/emailer_campaigns` -> 200). Habilita el modelo "la herramienta sube
  el copy por API", que es lo que se quería automatizar. Incidente: el probe de cuerpo vacío
  creó 2 borradores en vez de dar 422; se archivaron (el plan no expone DELETE, solo archive);
  lista activa de vuelta en 10. Para borrarlos del todo: manual en la vista Archived de Apollo.
  Pendiente Fase 5: confirmar subida de copy por API y create-contact+add_contact_ids e2e.
- 2026-07-03 · Verificado EN VIVO todo el CRUD de cadencia por API: crear secuencia, paso,
  copy, editar copy, A/B (2 variantes en un paso), bulk_create contactos (dedup), asignar a
  secuencia (add_contact_ids exige emailer_campaign_id en cuerpo + mailbox id), y que sin
  aprobar no envía. Límites: no hay DELETE por API (solo archive/remove); identidad de envío =
  buzón vinculado (hoy solo los de Camilo, 1 seat) -> decisión buzón/seat pendiente, no bloquea.
  Consolidado en experimento-apollo.md como contrato del adaptador. G0 cerrado del todo.
  Artefactos de prueba quedan en Apollo (inactivos, no mandan); limpieza opcional.
- 2026-07-03 · Cierre de sesión. Creado planning/CONTINUAR-IMPLEMENTACION.md como punto de
  entrada para la próxima sesión (estado + qué leer en orden + próxima acción = Fase 1).
  Descubierto que los 2 contactos de la prueba son reales (Mailbox Sync desde mayo), no se
  borran. Pendientes que no bloquean: limpieza de la secuencia de prueba, decisión buzón/seat.
- 2026-07-03 · Generada planning/tasks-v2.md: la lista completa de tareas delegables a
  agentes (V1.1 a V7.3 por fase + S1/S2 sueltas), cada una con archivos, routing de skills y
  "lista cuando". Verificado contra isps.db que contacto ya tiene es_key_decision_maker y
  cargo_categoria, y que a toque le faltan razon_perdida y objecion (el ALTER de V1.1 es
  real). NINGUNA tarea ejecutada; se retoma por V1.1 cuando Sebastián dé el arranque.
