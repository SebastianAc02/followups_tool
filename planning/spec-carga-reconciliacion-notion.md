# Spec: Carga y reconciliación Notion -> DB (Spec 1)

Fecha: 2026-07-14
Rama: a decidir en el plan (rama nueva aislada, esta zona la tocó otra sesión hoy)
Origen: exploración read-only del 2026-07-14 (ver memoria `project_notion_db_sync_exploration`).

## Problema

La herramienta muestra carriers y telcos como si fueran ISP, y muestra empresas
"sin contactos" que en Notion sí los tienen (gerentes, la mayoría). El fondo es que
hay dos fuentes de verdad que nunca se reconciliaron:

- `isps.db`: amplitud. 2017 empresas seedeadas de MinTIC/NIT, incluye ISPs nuevas
  que Notion no tiene mapeadas.
- Notion (pipeline, 488 empresas): profundidad. Donde de verdad se trabaja: contactos
  gerenciales, comité de compra, bitácora de toques, estados al día, usuarios.

Cada fuente sabe cosas que la otra no y nadie las cruzó por una llave confiable. Todo
lo demás (categoría sucia, contactos faltantes, estados que se cuelan en la cola,
duplicados) son síntomas de esa reconciliación pendiente.

Números medidos hoy:
- Categoría: la app lee la columna plana `empresa.categoria` (isp/utility/otro), no la
  vista `empresa_categoria` que sí distingue carrier/telco_grande/sae_plus/etc. 166
  empresas están mal etiquetadas como isp según la clasificación de la DB, más 71 que
  solo Notion sabe que no son ISP (utilities, telcos).
- Contactos: 65 ISP genuinos con contacto (gerente) en Notion y 0 en la DB.
- page_id: 470/2017 enlazados (23%).
- Duplicados: 219 registros origen-Notion (`ntn-*`, `9990000*`) que pueden duplicar un
  registro con NIT (CELSIA INTERNET, KGB, EMCALI ya vistos).
- Estados: 22+ empresas con estado distinto entre Notion y la DB; los vocabularios no
  coinciden. Además una fuga de app en `colaDelDia` (aparte, ver más abajo).

## Qué se construye

Un proceso de **carga y reconciliación en una vía (Notion -> DB), idempotente y
re-ejecutable**. No es la máquina de sync bilateral vivo (eso es el Spec 2). Es un
paso batch que lee el export/API de Notion, cruza contra la DB por una llave confiable,
y actualiza la DB. Si algo sale mal, se corre de nuevo sin duplicar ni pisar mal.

El bajo riesgo de esta vía es a propósito: leer Notion y escribir la DB es reversible
y verificable. La complejidad real (conflictos, quién manda cuándo) vive en el Spec 2.

## Orden por dependencia

El orden no es arbitrario. Deduplicar y enlazar por page_id PRIMERO crea la llave;
recién ahí categoría, estados, contactos y usuarios se pueden cruzar sin pegarle al
registro equivocado.

```
Fase 0  Deduplicar            -> resuelve gemelos sintético <-> NIT
Fase 1  Enlazar page_id       -> llave 1-a-1 empresa <-> página Notion
Fase 2  Categoría "el no gana" -> limpia la lista de ISP
Fase 3  Estados               -> mapeo Notion<->DB + sync de la deriva
Fase 4  Enriquecer            -> contactos gerente + usuarios + campos
```

Fix separado (no depende de lo anterior): tapar la fuga de estado en `colaDelDia`.

## Fase 0: Deduplicación

**Problema:** 219 registros origen-Notion con id sintético (`ntn-*` = 100,
`9990000*` = 119) además de 1798 con NIT. Algunos son la misma empresa dos veces (uno
por NIT, uno por Notion) con nombres apenas distintos. Cruzar por nombre exacto solo
pesca 1; hay que cruzar por nombre similar.

**Qué hace:**
1. Detectar candidatos a gemelo: normalizar nombre (mayúsculas, sin tildes, sin sufijos
   legales SAS/SA/LTDA/ESP, colapsar espacios) y agrupar. Comparar además por similitud
   (distancia de edición o token overlap) para los que no matchean exacto.
2. **Revisión humana de TODOS los pares antes de fundir (decidido).** Ninguna fusión
   automática. El proceso genera la lista de candidatos a gemelo (con su score de
   similitud y los campos en conflicto) y Sebastián aprueba par por par. Esto blinda el
   arranque frágil por nombre.
3. Al fundir un par aprobado: **Notion gana en todo lo comercial y más (decidido).** El
   registro sobreviviente conserva del lado NIT solo el NIT y el nombre legal oficial;
   todo lo demás (estado, owner, ciudad comercial, contactos, usuarios, pasarela, crm) lo
   manda Notion. El `notion_page_id` se conserva.
4. Registrar el alias en `empresa_alias` (el matcher ya escribe ahí, per constitución) y
   dejar el par fusionado en `sync_cambios` para auditoría.

## Fase 1: Enlace page_id universal

**Fuente:** los nombres de archivo del export de Notion
(`~/Arc/Private & Shared 7/🔥 Sales Pipeline/*.md`) traen el page-id de 32 caracteres al
final del nombre. Es la llave confiable que el CSV no trae.

**Qué hace:** para cada empresa del pipeline de Notion, escribir su `notion_page_id` en
la fila deduplicada correspondiente de `empresa`. Meta: cobertura ~100% de lo que está
en Notion (hoy 23%).

**Por qué importa:** este id es el ancla 1-a-1 para que, en el Spec 2, cada actualización
sea página <-> fila sin ambigüedad. También es el gancho para que cada lead cuelgue sus
llamadas de Granola y sus reuniones (ambas coexisten; el matcher las liga por empresa).

## Fase 2: Categoría "el no gana"

**Regla (decidida):** una empresa sale de ISP si CUALQUIERA de los dos lados la marca
no-ISP. Nada vuelve a ISP porque el otro diga que sí. Unión de vetos.

- Vetos de la DB: ya viven en `empresa_clasificacion` (es_carrier, es_corporativo_grande,
  es_utility_no_isp, es_extranjero, es_no_isp_confirmado, alianza_sae_plus).
- Vetos de Notion: se derivan del campo Industria (ver tabla más abajo). Se materializan
  como flag en `empresa_clasificacion` con `fuente='notion'`, para que la vista
  `empresa_categoria` los recoja sin lógica nueva.

**Cambio de app (aparte del dato):** la app debe leer la categoría de la vista
`empresa_categoria` / `empresa_resumen` (que ya expone `ec.categoria` correcta), no de
la columna plana `empresa.categoria`. Puntos a cambiar: `repository.ts` (filtros de
segmento, `COLUMNA_SEGMENTO`), filtros de campaña, `DetallePanel`.

### Tabla Industria (Notion) -> veto

| Industria en Notion | ¿Veta ISP? | Flag en empresa_clasificacion |
|---|---|---|
| ISP | No | (ninguno) |
| (vacío) | No | (ninguno) |
| Agua, Energía, Gas | Sí | es_utility_no_isp |
| Utility | Sí | es_utility_no_isp |
| Telecom | Sí | es_no_isp_confirmado (telco, no ISP) |
| Otro, Educación, Pasarela | Sí | es_no_isp_confirmado |

Las 6 Telecom (ETB, CLARO, TIGO, DIRECTV, WOM, WIN) salen de ISP. Ojo: varias cruzan
con un registro isp distinto del telco_grande real (COMCEL, etc.); la Fase 0 debe
haberlas fusionado antes.

## Fase 3: Estados

**Semántica (decidida):**

| Estado | ¿Activo? |
|---|---|
| lead | No por sí solo. Es el pool. Se activa al primer toque (-> contacto_iniciado) o al entrar en cadencia. Distinguir lead en Notion (prioritario) vs fuera de Notion |
| contacto_iniciado | Sí (ya tocado) |
| reunion_agendada | Sí, esperando meeting; dispara esperar transcript/link |
| oportunidad, cierre_documentacion, enviar_contrato | Sí (en cierre; Sebastián salta enviar_contrato y va directo a pago) |
| on_hold | No. Dormido, ya dijeron que no. Solo vuelve a lead si se reactiva, con cadencia |
| firma_pago | No. Ya es cliente. No se le escribe como lead; mantener info fresca para intros |

**Vocabularios no coinciden.** El enum de la DB tiene `reunion_agendada` (ya no aparece
en Notion), y Notion tiene `CONTRATO FIRMADO` y `FIRMA PENDIENTE` sin casilla en el enum.
Se requiere una tabla de mapeo explícita antes de sincronizar (sincronizar sin mapear
rompe el CHECK de `estado_notion`). Mapeo de huérfanos (decidido):
`CONTRATO FIRMADO -> cierre_documentacion` (firmado aún no es pago hecho),
`FIRMA PENDIENTE -> cierre_documentacion`. El resto mapea uno-a-uno por nombre.

**Qué hace:** aplicar el mapeo y actualizar `estado_notion` de las 22+ empresas con
deriva, SIEMPRE por el único camino de escritura de estado que ya existe
(`repository.ts:4431`, que registra el cambio en el historial). No escribir la columna a
pelo.

## Fase 4: Enriquecimiento desde Notion

**Contactos (prioridad):** poblar los contactos que Notion tiene y la DB no. Dos fuentes:
1. Contacto Principal del CSV (1 por empresa, ~200): el que Sebastián escogió a mano,
   típicamente gerencial.
2. Buying Comittee del export por-página (290 fichas en 84 empresas): multi-contacto con
   Nombre, Cargo, Celular, Correo, LinkedIn. Mapea directo a `contacto` (que ya soporta
   multipersona: es_principal, cargo_categoria, linkedin), sin migración. `fuente='notion'`.

El cargo se clasifica a `cargo_categoria` (dueno/gerente/rep_legal/tecnico/etc.). En ISP
chicos domina "CEO / Dueño" (el dueño es el decisor).

**Usuarios y campos:** cuando Notion los tenga, escribir:

| Campo Notion | Destino DB | Nota |
|---|---|---|
| Usuarios Estimados | empresa_usuarios.usuarios_estimados (usuarios_est_fuente='notion') | usuarios_efectivos se recalcula solo (columna generada) |
| Pasarela Actual | empresa.pasarela_actual | |
| CRM / Software | empresa.crm_software | |
| Owner | empresa.owner | respetar owner canónico (mayúsc/minúsc reales) |
| Próximo Paso | empresa.proximo_paso | |
| Fecha Próximo Paso | empresa.proximo_follow_up_fecha | activa el lead (gating por fecha) |

**Política de escritura (decidido): Notion sobrescribe.** Si Notion tiene el dato, pisa
lo que haya en la DB para ese campo (Notion es la fuente más fresca de lo comercial). El
valor anterior queda en `sync_cambios` para poder revertir.

MRR potencial, Planes y SaaS Plan no tienen columna hoy. Candidatos a columna nueva o al
Spec 2.

## Fix separado: fuga de estado en colaDelDia

Independiente del sync. `colaDelDia` (`repository.ts:193`) filtra solo por
`proximo_follow_up_fecha` vencida/hoy, sin filtro de estado. Hoy muestra 63 empresas, de
las cuales 12 on_hold + 4 firma_pago = 16 (25%) son fuga: cuentas dormidas y clientes
apareciendo como trabajo del día.

`pipelineSinCadencia` (`repository.ts:354`) YA excluye on_hold/firma_pago con la nota
"decision de Sebastian 2026-07-14"; colaDelDia nunca recibió ese filtro. Fix: agregar
`estado_notion NOT IN ('on_hold','firma_pago')` a colaDelDia, y revisar `bucketDeEtapa`
(`agenda.ts`) que mapea on_hold -> bucket 'lead'.

CUIDADO: esta zona (split de cola) la tocó otra sesión hoy. Verificar el diff actual de
`git log`/`git status` antes de editar; no especular. Aislar el hunk propio.

## Arquitectura

Respeta la constitución (hexagonal):
- El core de reconciliación (decidir gemelo, aplicar "el no gana", mapear estado) NO
  importa Notion ni el driver de DB. Recibe datos y devuelve decisiones.
- `NotionAdapter`: lee la fuente (export por-página + CSV en esta fase; API en el Spec 2).
  Es un puerto; hoy la fuente es el export, mañana la API, sin reescribir el core.
- Escritura solo por el `Repository`. Nada de SQL crudo regado. El estado se escribe por
  el único camino existente (`cambiarEstadoNotion`).
- Auditoría en `sync_cambios` (patrón ya usado por el matcher).

Forma probable: un script batch (`scripts/`) que orquesta adapter + core + repository,
re-ejecutable. Los tests cubren el core de reconciliación con datos de ejemplo (una feature
no está lista sin sus pruebas).

## Modelo de datos

No requiere tablas nuevas. Se tocan tablas que ya existen:
- `empresa`: notion_page_id, pasarela_actual, crm_software, owner, proximo_paso,
  proximo_follow_up_fecha, estado_notion (por su camino).
- `empresa_clasificacion`: flags de veto con fuente='notion'.
- `empresa_alias`: aliases del dedup.
- `contacto`: contactos nuevos con fuente='notion'.
- `empresa_usuarios`: usuarios_estimados.
- `sync_cambios`: log de auditoría.

## Fuera de alcance (Spec 2)

- Sync bilateral vivo: qué pasa cuando agregas una empresa en Notion (ingesta automática),
  modelo por-campo (quién manda en qué), resolución de conflictos.
- Destino para los briefs/enrichment de Notion (90 empresas los tienen; la DB no tiene
  tabla para docs).
- Columnas nuevas para MRR/Planes si se deciden.
- Actualizar el CLAUDE.md: la regla "una sola vía DB->Notion" y "sync de dos vías fuera de
  v1" cambian con el bilateral. Se documenta en el Spec 2.

## Riesgos

- **Cruce frágil por nombre.** Antes de tener page_id universal, el matching depende de
  nombres. La Fase 0/1 lo blindan, pero el arranque necesita revisión humana de los
  candidatos dudosos.
- **Concurrencia.** El área de cola/estados la tocó otra sesión hoy. Rama aislada, verificar
  diff, aislar hunks (ver memoria `feedback_concurrent_session_git_hygiene`).
- **Idempotencia.** Correr dos veces no debe duplicar contactos ni aliases. Cada escritura
  chequea existencia por llave natural (page_id, nombre+empresa del contacto).

## Decisiones cerradas (2026-07-14)

1. **Fusión del dedup:** Notion gana en todo lo comercial y más. El registro conserva del
   lado NIT solo el NIT y el nombre legal; lo demás lo manda Notion.
2. **Dedup:** revisión humana de todos los pares antes de fundir. Sin fusión automática.
3. **Estados huérfanos:** `CONTRATO FIRMADO -> cierre_documentacion`,
   `FIRMA PENDIENTE -> cierre_documentacion`.
4. **Enriquecimiento:** Notion sobrescribe (con valor anterior guardado en `sync_cambios`).
5. **Regla de categoría "el no gana":** unión de vetos DB + Notion; Telecom veta ISP.
6. **Modelo de estados:** lead no es activo por sí solo; on_hold y firma_pago fuera de la
   cola activa.
7. **Corte:** Spec 1 = una vía Notion -> DB idempotente; el bilateral vivo es el Spec 2.
