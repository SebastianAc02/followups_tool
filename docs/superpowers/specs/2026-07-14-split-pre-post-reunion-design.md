# Split leads/cierres/reagendar (cola de Sebastián) + limpieza de campañas de prueba — Design

Estado: v3 (2026-07-14). v1 (generador automático + split para toda la organización) y v2
(Reagendar = `on_hold`) quedaron reemplazadas tras revisar el resultado en pantalla: v3 corrige
qué es "Reagendar" (no-show de reunión, no `on_hold`) y agrega el mecanismo para capturarlo.
Partes 1-7 (v2, más abajo) YA ESTÁN IMPLEMENTADAS Y COMMITEADAS en local. La Parte 8 (no-show)
es lo nuevo de esta revisión, pendiente de implementar.

## Problema

Sebastián entra a la tool y ve toques mezclados sin poder distinguir qué es prospección real
de qué es ruido. Causa raíz verificada: `colaDelDia()` mete en la cola **cualquier empresa con
`proximo_follow_up_fecha` vencida, sin importar su etapa comercial (`estado_notion`)**. Hoy eso
le muestra 28 "toques" a Sebastián que en realidad son:

| estado_notion | # | por qué está ahí |
|---|---|---|
| contacto_iniciado | 12 | cadencia vieja, no se trabajó consistente |
| on_hold | 9 | atascadas (no llegaron a la reunión), no son "vencidas" |
| cierre_documentacion | 3 | en negociación activa, no son "vencidas" |
| lead | 3 | fecha manual puesta hace tiempo |
| firma_pago | 1 | ya es cliente ganado, tiene fecha manual puesta |

Además la DB de producción arrastra 17 campañas de prueba (creadas construyendo la feature de
campañas) que hay que limpiar, sin tocar ningún toque real.

## Contexto verificado (VPS producción, 2026-07-14, todo lectura)

- Tool desplegada y corriendo (`followups_web/worker/caddy`). Repo en `dbba14f`, al día con
  `origin/main`. La DB de producción es `/data/isps.db` en el volumen
  `followups-tool_followups_data` — es la fuente de la verdad, la del Mac ya no.
- `owner` exacto de Sebastián en la DB: `"Sebastian Acosta Molina"` (no confundir con
  `"Felipe Castro, Sebastian Acosta Molina"`, fila compartida de una cuenta ganada, fuera de
  alcance). `organizacion_activa_id = 1` para las 126 suyas.
- Ya existen en el código (no hay que construirlos):
  - `ESTADOS_CALIENTES` en `app/db/funnel.ts`: `['reunion_agendada', 'oportunidad',
    'cierre_documentacion', 'enviar_contrato']`.
  - `actualizarEstadoNotion(idEmpresa, estadoNuevo, idOrganizacion, fecha)` en
    `app/db/repository.ts:4104` — cambia la etapa y registra la transición en
    `empresa_estado_historial` en una sola transacción, no-op si no cambia.
- Buckets reales de Sebastián (owner exacto, hoy):

| estado_notion | # cuentas | # con proximo_follow_up_fecha puesta |
|---|---|---|
| on_hold | 87 | 9 |
| firma_pago | 15 | 1 |
| contacto_iniciado | 13 | 12 |
| lead | 8 | 3 |
| cierre_documentacion | 3 | 3 |

## Decisiones cerradas con Sebastián (2026-07-14)

1. **Alcance: solo sus propias cuentas** (`owner = "Sebastian Acosta Molina"`). Las cuentas de
   Felipe, Thomas y Camilo no se tocan bajo ningún concepto — ni la migración de datos ni el
   cambio de cola les aplica.
2. **Sin generador automático.** Se descarta el reparto de ~2 toques/semana de la v1. Sebastián
   sigue poniendo la próxima fecha a mano cuando decide seguir una cuenta de Cierres/Reagendar.
3. **Tres buckets, no dos fases:**
   - **Leads** = `lead` (incluye `contacto_iniciado` reseteado ahí).
   - **Cierres** = `ESTADOS_CALIENTES` (ya existe como constante).
   - **Reagendar** = `on_hold`. **[SUPERADO por la Parte 8 — ver más abajo. `on_hold` NO es
     Reagendar; queda fuera del split. Reagendar es un caso distinto: no-show de reunión.]**
   - `firma_pago` queda fuera de toques (ya es cliente ganado).
4. **Reset de `contacto_iniciado` → `lead`:** las 13 cuentas de Sebastián en esa etapa se
   devuelven a `lead` porque la cadencia no se trabajó consistente. Es un cambio real de
   `estado_notion` (no solo visual), vía `actualizarEstadoNotion` (deja rastro en
   `empresa_estado_historial`). El historial de toques de esas cuentas se conserva intacto y
   sigue visible en la ficha (`getCuenta` ya lo trae).
5. **Limpieza de fechas sueltas:** además del reset, se limpia `proximo_follow_up_fecha` en las
   3 `lead` y la 1 `firma_pago` que hoy la tienen puesta a mano — consistente con la regla
   "un lead no aparece en toques hasta que tenga campaña". Total 16 fechas limpiadas (12 recién
   reseteadas + 3 leads + 1 firma_pago).
6. **`on_hold` y `cierre_documentacion` NO cambian de estado.** Solo cambia dónde se ven: pasan
   a secciones fijas (Cierres, Reagendar) que no dependen de la fecha ni se marcan "vencidas".
7. **Campañas de prueba:** se borran las 17 (nombres "Cadencia corta de prueba", "Prueba
   multicanal A/B/C (Viajes Andinos / Tour Caribe)", "Reactivación express" — empresas
   ficticias de test) y su andamiaje (`inscripcion` 74, `destinatario` 74, `paso_inscripcion`
   46, `evento_tracking` 5). **0 toques ligados** a esas campañas (verificado): no se borra
   ningún toque real. Requiere backup del volumen antes.
8. **Orden de entrega:** implementar y probar en local primero (contra `app/db/test-helpers.ts`
   / DB de prueba), y el deploy a producción (migración de datos + código) es un paso aparte y
   explícito después de que Sebastián lo revise.

## Diseño

### 1. Migración de datos (script puntual, una vez, contra el VPS)

No es código de la app — es un script/runbook que corre una sola vez:

1. Backup del volumen `followups-tool_followups_data` (copia de `isps.db`+WAL) antes de tocar
   nada.
2. Para cada empresa con `owner = 'Sebastian Acosta Molina' AND estado_notion =
   'contacto_iniciado'` (12): `actualizarEstadoNotion(idEmpresa, 'lead', 1, hoy)`.
3. Para las mismas 12 + las 3 `lead` con fecha + la 1 `firma_pago` con fecha (16 en total):
   `UPDATE empresa SET proximo_follow_up_fecha = NULL WHERE id_empresa = ?` (mismo owner, scoped
   por id explícito, no por condición amplia, para no arrastrar de más).
4. Verificar después: 0 cuentas de Sebastián en `contacto_iniciado`; 0 con fecha puesta salvo
   las que estén en Cierres/Reagendar con fecha manual futura que él haya puesto después.

### 2. Cola partida en 3 secciones (repository + UI)

`colaDelDia(hoy, owner, idOrganizacion)` hoy es una sola query por fecha. Se agrega, al lado
(sin romper el uso actual en otras vistas/owners):

- **`colaLeads(hoy, owner, idOrganizacion)`**: lo mismo que `colaDelDia` hoy, pero con
  `eq(empresa.estadoNotion, 'lead')` agregado a las condiciones. Vacía para Sebastián hasta que
  una cuenta tenga campaña y le ponga fecha.
- **`colaCierres(owner, idOrganizacion)`**: `estadoNotion IN ESTADOS_CALIENTES`, sin filtro de
  fecha. Ordena por fecha si la tiene (nulls al final) — no hay concepto de "vencido" aquí.
- **`colaReagendar(owner, idOrganizacion)`**: `estadoNotion = ETAPA_ONHOLD`, mismo trato que
  Cierres (lista fija, sin fecha obligatoria).

Las tres reusan las mismas columnas/joins que `colaDelDia` (contacto principal, usuarios
efectivos, etc.) — se factoriza el `select` común para no triplicar el mapeo de columnas.

**UI (`/cola` o donde viva la vista de toques):** tres secciones visibles con su label
("Leads", "Cierres", "Reagendar"), cada una alimentada por su query. Reusa los componentes de
fila que ya existen; el cambio es de agrupamiento, no de componente nuevo.

**Importante — este cambio de cola solo debe activarse para `owner = "Sebastian Acosta
Molina"`.** Los demás owners siguen viendo `colaDelDia` tal cual hoy (una sola lista por fecha),
hasta que Sebastián decida extenderlo. Forma más simple: la página de `/cola` elige qué función
llamar según el owner de la sesión.

### 3. Limpieza de campañas de prueba (runbook aparte, mismo día)

1. Backup del volumen (mismo backup del paso 1, o uno explícito si se hace en momento distinto).
2. Transacción: borrar `evento_tracking` (5) → `paso_inscripcion` (46) → `destinatario` (74) →
   `inscripcion` (74) → `campana` (17), por `id_campana IN (34,38..54)` (las 17 verificadas de
   prueba).
3. Verificar: las 5 tablas en 0 filas de esas campañas; `toque` sigue en 209 (sin cambios).
4. Apollo: esas campañas tienen `proveedor_campana_id` real pero están `archivada` (no envían).
   Borrarlas de la DB local no las borra en Apollo. Se deja anotado, limpiar Apollo es aparte y
   opcional.

## Qué NO se construye (YAGNI)

- Nada de generador automático ni tabla de "seguimiento" nueva.
- No se toca el motor de campañas/cadencia en sí (sigue igual para prospección real).
- No se cambia el comportamiento de la cola para otros owners.
- No se limpia Apollo.
- `on_hold` y `cierre_documentacion` no cambian de `estado_notion`, solo de dónde se muestran.

## Capas / arquitectura (CLAUDE.md)

- Las tres queries nuevas viven en `app/db/repository.ts`, mismo patrón que `colaDelDia`. Nada
  de SQL crudo en la UI.
- La migración de datos usa `actualizarEstadoNotion` (ya existe, ya transaccional) en vez de un
  `UPDATE` suelto — mantiene el historial consistente.
- `ESTADOS_CALIENTES` / `ETAPA_ONHOLD` siguen siendo la fuente única en `funnel.ts`; las queries
  nuevas las importan, no repiten los strings.

## Pruebas

- `repository.colaLeads.test.ts` / `colaCierres` / `colaReagendar` (o un solo archivo con los
  tres): seed con empresas en cada estado, mismo owner y otro owner, verificar que cada query
  trae solo lo suyo y que el owner ajeno no se filtra.
- Test de la migración: correrla contra una DB de prueba sembrada como la real (12
  contacto_iniciado, etc.) y verificar los conteos finales — antes de tocar el VPS.

## Riesgos / notas

- Todo el paso 1 y 3 corre contra la DB de producción del VPS. Backup obligatorio antes de
  cualquier escritura.
- El filtro por `owner = 'Sebastian Acosta Molina'` es case-sensitive y debe ser el valor exacto
  (no "sebastian", no variantes) — confirmado contra la DB real.
- Si Sebastián pone una fecha manual a una cuenta de Cierres/Reagendar después de este cambio,
  esa fecha es informativa (se puede mostrar) pero no saca la cuenta de su sección ni la vuelve
  "vencida" — sigue siendo Cierres/Reagendar hasta que cambie de `estado_notion`.

---

## Parte 8 (v3, 2026-07-14): "No llegó" — no-show de reunión y redefinición de Reagendar

Revisando el resultado de las Partes 1-7 en pantalla, Sebastián corrigió qué es "Reagendar":
**no es `on_hold`** (eso es un estado muerto de reactivación, sin relación con reagendar
reuniones — sus palabras: "si yo saco una reunión con una on hold y no llega, tocaría
reagendarla", es decir, el mecanismo de no-show aplica igual sin importar de dónde vino la
cuenta). Reagendar es específicamente: una cuenta en `reunion_agendada` cuya reunión no se dio.

### Decisión: sin migración de esquema

Se deriva del **último toque de la empresa**, no de una columna nueva. Mismo principio que el
resto del diseño (fase derivada de `estado_notion`, nunca un flag que se pueda desincronizar):
si el resultado del toque más reciente de una cuenta es `no_llego`, está pendiente de reagendar;
en cuanto se registre cualquier otro resultado (o se reagende con éxito), sale solo del bucket.

### Mecanismo

1. **`no_llego`**: 5º valor en `RESULTADOS` (`app/db/validation.ts`). Label: "No llegó a la
   reunión". **No** se agrega a `RESULTADOS_CONTESTO` — así hereda gratis el mismo tratamiento
   que ya tiene `no_contesto` hoy: sin búsqueda de transcript en Granola (no hubo conversación,
   nada que buscar), sin pedir "Qué pasó" ni datos de cuenta (usuarios/CRM/pasarela).
2. **Dónde se ofrece:** en `CapturaLlamada.tsx`, el botón "No llegó a la reunión" solo aparece
   cuando la empresa que se está trabajando tiene `estado === 'reunion_agendada'`. Para el resto
   de empresas, los botones siguen siendo los 4 de siempre. Requiere pasar `estado` como prop
   nuevo: `LlamadaCard.tsx` (tiene `ctx.emp.estado` vía `ContextoToque`) → `RegistrarToqueToggle`
   → `CapturaLlamada`.
3. **Qué pasa al elegirlo:** el formulario reusa el bloque "Próximo toque" que YA existe (chips
   +1d/+3d/+1sem + date picker) — esa fecha ES la respuesta a "¿cuándo le hago follow-up para
   reagendar?" que pidió Sebastián. No hace falta UI nueva para eso, ya está construido.
4. **`colaCierres`:** excluye una `reunion_agendada` solo si su último toque fue `no_llego` (se
   va a Reagendar en su lugar). El resto de `ESTADOS_CALIENTES` no cambia.
5. **`colaReagendar(hoy, owner, idOrganizacion)`**: cambia de firma (gana `hoy`). Ya no es
   `estado_notion = on_hold` (fijo, sin fecha) — ahora es `estado_notion = 'reunion_agendada'
   AND último toque = 'no_llego'`, filtrado por fecha vencida-o-hoy **igual que `colaLeads`**
   (es un follow-up real con fecha, no una lista fija). Las filas se renderizan con la misma
   lógica de "vencido Nd"/"hoy" que Leads, no con `filaSinVencimiento`.
6. **`on_hold` queda fuera del split**, confirmado. Su reactivación es un problema aparte, no se
   construye ahora (consistente con "fuera de v1: frío puro, cadencia automática" de CLAUDE.md).

### SQL: derivar el último resultado sin columna nueva

Subquery correlacionada, reusada por `colaCierres` y `colaReagendar`:

```sql
COALESCE(
  (SELECT resultado FROM toque WHERE toque.id_empresa = empresa.id_empresa
   ORDER BY toque.id_toque DESC LIMIT 1),
  ''
) = 'no_llego'
```

El `COALESCE` importa: sin él, una empresa sin ningún toque evaluaría `NULL = 'no_llego'` →
`NULL` (ni true ni false en SQL), lo que la sacaría incorrectamente de `colaCierres` por una
comparación `NOT (...)` sobre `NULL`.

### Fuera de alcance de la Parte 8

- No se toca `RESULTADOS_CONTESTO`, `razonPerdida` (sigue solo para `contesto_no`), ni el
  historial de toques existente.
- No hay UI dedicada nueva ("zona de reuniones" separada): se confirmó reusar la pantalla de
  captura que ya existe (`/llamada/[id]`), contextualizada por `estado`.
- El badge del nav (`AppShell.tsx`) sigue contando solo `colaLeads`; no se le suma Reagendar en
  esta entrega (no se pidió, evita expandir alcance sin confirmación).
