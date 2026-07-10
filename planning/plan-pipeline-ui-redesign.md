# Plan: rediseño Pipeline (portar mockup "Global Pipeline" a la app)

Estado: plan escrito (2026-07-10). Todas las decisiones cerradas (ubicacion, alcance,
D1, D2). PERO **la ejecucion esta congelada por una colision con una sesion concurrente**
que ya construyo /pipeline en paralelo -- ver "Colision con sesion concurrente" al final.
NO seguir construyendo /pipeline hasta que Sebastián confirme que la otra sesion terminó.

## Colision con sesion concurrente (2026-07-10) -- RECONCILIADA

Reconciliacion hecha 2026-07-10 (Sebastián confirmo que la otra sesion terminó, mtimes
quietos): borre mis 5 huerfanos (`app/pipeline/{PipelineSubNav,sample}`,
`app/ui/pipeline/{PipelineOverview,CuentaCard,EtapaRow}` -- isla cerrada que su build no
importaba), y restaure `app/pipeline/layout.tsx` a `requireSession() + AppShell` sin
subnav (sus tabs viven en PipelineShell via `?tab=`). Se conservo mi split del sidebar
(AppShell + IconPanel). `tsc` 0. Gana el diseño de ELLOS.

**Pendiente real (Fase 2/3, cablear):** su impl usa MOCK data con etapas por dia ("Entrada",
"Contacto inicial"...), NO el funnel. Al cablear hay que alinear a las decisiones:
D1 (etapas = `FUNNEL_ETAPAS`, null -> Lead) y D2 (tabla global `config_pipeline`). Ver el
mapeo mockup->dominio y las queries nuevas mas arriba.

### Detalle historico de la colision

Mientras yo arrancaba Fase 0/1, OTRA sesion (o agente) construyo /pipeline COMPLETO en
paralelo: `app/pipeline/{page,layout,PipelineSubNav,sample}.ts(x)` +
`app/ui/pipeline/{PipelineShell,PipelineSidebar,KpiRow,KpiCard,EtapaGroup,EmpresaRow,
DetallePanel,ReportesPanel,AjustesPanel,PipelineOverview,CuentaCard,EtapaRow}.tsx` +
`app/globals.css` modificado. Todo untracked (`?? app/pipeline/`, sin historia git).

Evidencia de que estaba VIVA: `page.tsx` cambio de contenido entre dos lecturas mias
(paso de importar AppShell a depender del layout), mtime 14:40:39 -- despues de mis
escrituras.

Diseño de ELLOS (el que gana, decision de Sebastián): una sola page con tabs por
`?tab=overview|reportes|ajustes` dentro de `PipelineShell` (que renderiza sus propios tabs
+ el drawer `DetallePanel` por delegacion de click en `article[data-empresa-id]`). El
funnel se pinta con `KpiRow`/`KpiCard` + `EtapaGroup`/`EmpresaRow`. `layout.tsx` = solo
`requireSession() + AppShell`.

Yo clobbee 6 archivos con nombres iguales (mi version quedo en disco, la de ellos se
perdio, sin git): `app/pipeline/{layout,PipelineSubNav,sample}` y
`app/ui/pipeline/{PipelineOverview,CuentaCard,EtapaRow}`. Mi `layout` mete un
`PipelineSubNav` con links a rutas `/pipeline/reportes` que NO existen (404) -> la pagina
muestra DOS barras de tabs, la mia rota. `tsc` igual pasa (0 errores) porque su
page/PipelineShell no importan mis 6 archivos.

Lo que SI se conserva (mi carril, fuera de /pipeline, lo necesita cualquiera para llegar a
la ruta): el split del sidebar en `app/ui/shell/AppShell.tsx` ("Panel" admin-only vs
"Pipeline" -> /pipeline) + `IconPanel` en `app/ui/shell/icons.tsx`.

### Checklist de reconciliacion (correr SOLO cuando Sebastián confirme que la otra sesion terminó)

1. `git status` + revisar mtimes de `app/pipeline/*` -- si siguen cambiando, la sesion sigue viva, NO tocar.
2. Restaurar `app/pipeline/layout.tsx` a la version neutra que su page espera: `requireSession()` + `AppShell` + `children`, SIN `PipelineSubNav` (sus tabs viven en `PipelineShell`).
3. Borrar mis huerfanos que su build no usa: `app/pipeline/PipelineSubNav.tsx`, `app/pipeline/sample.ts`, `app/ui/pipeline/PipelineOverview.tsx`, `app/ui/pipeline/CuentaCard.tsx`, `app/ui/pipeline/EtapaRow.tsx` -- OJO: confirmar antes que su version final no dependa de ninguno (grep de imports); si su impl tiene su propio PipelineOverview/CuentaCard/EtapaRow que yo pise, hay que recuperarlo de la otra sesion, no borrar.
4. Verificar que su `AppShell` (si lo tocaron) no pise mi split del sidebar; si hay conflicto, fusionar a mano.
5. `npx tsc --noEmit` (0) + Sebastián corre el preview (yo no levanto previews).
6. Alinear la nueva impl con las decisiones D1 (etapas = `FUNNEL_ETAPAS`, null -> Lead) y D2 (tabla `config_pipeline`) -- verificar que la sesion concurrente las respeto; si no, ese es el trabajo de cableado (Fase 2/3).

---

Estrategia original acordada (para cuando se retome): **portar el visual 1:1 primero con
datos de ejemplo, aprobar el look, y despues cablear al Repository** (incluyendo backend
nuevo).

## Origen

El diseño ya esta hecho: un prototipo estatico en `/Users/sebastianacostamolina/Arc/Global
Pipeline FAQ/` (`index.html` 3424 lineas + `globals.css` 1377 lineas). Es un cockpit dark
de 3 pantallas conmutadas desde el sidebar:

1. **Pipeline overview** (`#pipeline-overview`): sidebar con campañas + filtros operativos,
   fila de KPIs, pipeline por etapas con filas de empresa, y panel de detalle lateral.
2. **Reportes** (`#reportes`): 4 tarjetas de metricas (cuentas por secuencia, mezcla de
   canales, tasa de hold, finalizadas vs opt out).
3. **Ajustes** (`#ajustes`): toggles de pausas (festivos, fin de semana, respuesta
   negativa), persistencia de filtros y notificaciones.

Fuentes del mockup: Plus Jakarta Sans / Inter / IBM Plex Mono + Phosphor icons. Tokens en
HSL (`--primary: 217 100% 68%`, etc.). NO se copian tal cual: se traducen a nuestros tokens
`@theme` (regla de "un solo punto de cambio de color", ver globals.css).

## Decisiones cerradas (Sebastián, 2026-07-10)

- **Ubicación**: ruta NUEVA `/pipeline`. El ítem del sidebar hoy rotulado "Pipeline"
  apunta a `/panel` (dashboard admin) -- por eso al dar clic te saca a `/panel`. Se
  separan:
  - `/panel` (existente, admin-only) pasa a rotularse **"Panel"** en el sidebar.
  - Nuevo ítem **"Pipeline"** -> `/pipeline` (el mockup portado).
  - Ver `app/ui/shell/AppShell.tsx:51`.
- **Alcance**: las 3 pantallas, incluyendo backend nuevo donde falte.
- **Estrategia**: visual primero (fidelidad 1:1 con datos de ejemplo), cablear despues.

## Mapeo mockup -> dominio (que datos ya existen)

| Elemento del mockup | Fuente en el dominio | Estado |
|---|---|---|
| KPI "En secuencia" (248) | `inscripcionesActivas()` | existe |
| KPI "Entrando hoy / Día 0" (34) | inscritas con fecha de inscripcion = hoy | falta query |
| KPI "Toques de hoy" (61) | `agendaHoyCadencias()` (ya alimenta badge de /cola) | existe |
| KPI "On Hold" (29) | inscripciones con estado `pausada` (`pausarInscripcion`) | existe (falta conteo) |
| KPI "Cerradas / Opt Out" (43) | destinatarios que salieron (`marcarDestinatarioSalio`) | existe (falta conteo) |
| Sidebar: campañas (Reactivación Suministro, etc.) | `listarCampanas()` (filtrar activas) | existe |
| Sidebar: filtros operativos (En secuencia / Toques de hoy / On Hold / Cerradas) | derivados de los KPIs de arriba | falta cablear |
| Filas de empresa (EBSA Tunja, etc.) | inscritas de la campaña (`listarInscritasHub`) | existe |
| Columna "Campaña" | `campana.nombre` | existe |
| Columna "Paso actual" | `inscripcion.paso_actual` + version del paso | existe |
| Columna "Día de secuencia" | dias desde inscripcion / paso agendado | falta calculo |
| Columna "Canal" | canal del paso (ya hay `CanalTag`) | existe |
| Etapas (Contacto inicial / Seguimiento / Cierre) | **DECISIÓN ABIERTA** (ver abajo) | por definir |
| Panel de detalle (historial de toques, ventanas de contacto, proximo toque) | `historialPasosDestinatario`, `getContextoToque` | existe |
| Reportes: mezcla de canales LL/WA/CO | `toquesPorCanal(desde, hasta)` (ya en /panel) | existe |
| Reportes: cuentas por secuencia | `empresasPorCadencia()` (ya en /panel) | existe |
| Reportes: finalizadas vs opt out | conteos de inscripcion por estado | falta query |
| Reportes: tasa de hold | On Hold / total activas + tendencia | falta serie temporal |
| Ajustes: toggles | **DECISIÓN ABIERTA** (persistencia) | por definir |

## Decisiones cerradas (dominio)

### D1. Que es una "etapa" del pipeline -> RESUELTA: reusar el funnel de Notion

Sebastián (2026-07-10): **reusar `estado_notion`**. Las etapas del pipeline SON las de
`FUNNEL_ETAPAS` (`app/db/funnel.ts`): Lead, Contactado, Reunión, Oportunidad, Contrato,
Cierre, Firma y pago. Un solo lugar define etapas, labels y colores -> Home y Pipeline
quedan sincronizados.

Matiz clave: **empresa sin estado en Notion (null) cuenta como Lead**. Esto difiere del
Home, donde `FUNNEL_ETAPAS` excluye los null a proposito (son 1437 y se comerian la barra).
En el Pipeline SI se muestran, fundidos en la etapa Lead. La query `pipelineGlobal` hace
`COALESCE(estado_notion, 'lead')` o equivalente, sin tocar la constante compartida.

### D2. Persistencia de los toggles de Ajustes -> RESUELTA: tabla global nueva

Sebastián (2026-07-10): **tabla nueva `config_pipeline`, global** (una fila por
organizacion, no por campaña). Migracion Drizzle nueva; el Repository expone
`leerConfigPipeline(idOrganizacion)` y `actualizarConfigPipeline(...)`. Los toggles que no
tengan efecto real todavia se persisten igual pero se marcan "proximamente" en la UI hasta
cablear su comportamiento (no inventar que ya hacen algo).

## Arquitectura de la implementacion

Regla no negociable (CLAUDE.md): el core no importa DB/Notion/Claude; acceso a datos SOLO
por el Repository; nada de SQL crudo regado. Todo componente nuevo es server-component que
recibe datos ya resueltos, o client-component para interaccion (filtros, panel de detalle).

### Componentes (app/ui/pipeline/ nuevo)

- `PipelineShell` -- layout de la pantalla dentro de `AppShell` (o su propio sub-shell si el
  sidebar de campañas es distinto al global). Decidir en Tarea 1 si reusa `AppShell` o abre
  una segunda columna de filtros.
- `PipelineSidebar` -- lista de campañas + filtros operativos (client, maneja el filtro
  activo por estado en URL/searchParams).
- `KpiRow` + `KpiCard` -- la fila de 5 KPIs (En secuencia / Entrando hoy / Toques de hoy /
  On Hold / Cerradas·Opt Out).
- `EtapaGroup` -- cabecera de etapa colapsable + sus filas.
- `EmpresaRow` -- fila de empresa (Campaña, Paso actual, Día de secuencia, Canal). Reusa
  `CanalTag` existente.
- `DetallePanel` -- drawer lateral (historial de toques, ventanas de contacto, proximo
  toque). Client, se abre al clicar una fila.
- `Reportes*` -- 4 tarjetas (reusar la logica de /panel: `toquesPorCanal`,
  `empresasPorCadencia`, `toquesPorResultado`).
- `Ajustes*` -- lista de toggles (reusar patron de switch si existe; si no, uno nuevo en
  app/ui/).

### Backend nuevo (todo via Repository)

Queries a agregar en `app/db/repository.ts` (solo lectura salvo Ajustes):

- `kpisPipeline(idOrganizacion)` -> { enSecuencia, entrandoHoy, toquesHoy, onHold,
  cerradasOptOut }.
- `pipelineGlobal(filtros)` -> filas de inscritas agrupadas por etapa (segun D1), con
  campaña, paso actual, dia de secuencia, canal.
- `detalleInscrita(idInscripcion)` -> historial + proximo toque (compone
  `historialPasosDestinatario` + `getContextoToque`).
- `reporteFinalizadasVsOptOut(rango)`, `serieHold(rango)` -> para Reportes.
- (D2) lectura/escritura de `config_pipeline` si se aprueba tabla nueva -> migracion Drizzle
  reflejando la tabla (nunca recrear el schema existente).

## Fases y tareas

**Fase 0 -- fix del sidebar (mecanico, sin decision)**
- T0.1: en `AppShell.tsx` renombrar el ítem `/panel` a label "Panel"; agregar ítem nuevo
  "Pipeline" -> `/pipeline` (nuevo icono o reusar `IconPipeline`). Crear `app/pipeline/page.tsx`
  placeholder que ya renderice dentro de `AppShell`.

**Fase 1 -- portar visual con datos de ejemplo (fidelidad 1:1)**
- T1.1: extraer tokens del mockup y mapearlos a `@theme` en globals.css (fuentes, acento,
  bordes). Nada de hex crudo en componentes.
- T1.2: `PipelineShell` + `PipelineSidebar` + `KpiRow` con datos mock hardcodeados.
- T1.3: `EtapaGroup` + `EmpresaRow` con datos mock.
- T1.4: `DetallePanel` (drawer) con datos mock.
- T1.5: pantallas `Reportes` y `Ajustes` con datos mock.
- Checkpoint: Sebastián revisa el pixel-match contra el mockup antes de cablear.
  (No corro previews yo -- se los paso a Sebastián para que los levante, ver memoria
  "Nunca correr previews").

**Fase 2 -- cablear al dominio (necesita D1)**
- T2.1: `kpisPipeline` + cablear `KpiRow`.
- T2.2: `pipelineGlobal` (implementa la decision D1) + cablear etapas y filas.
- T2.3: `detalleInscrita` + cablear `DetallePanel`.
- T2.4: filtros operativos del sidebar (searchParams) sobre `pipelineGlobal`.
- Cada query con su test (una feature no esta lista sin sus pruebas, CLAUDE.md).

**Fase 3 -- Reportes y Ajustes con backend (necesita D2)**
- T3.1: cablear Reportes reusando queries de /panel + las nuevas.
- T3.2: (D2) migracion `config_pipeline` si aplica + lectura/escritura de toggles;
  marcar como "proximamente" los que no se cableen.

## Fuera de alcance / riesgos

- El `/panel` admin actual NO se toca salvo el rename en el sidebar. Reportes del mockup
  puede solaparse con /panel; NO fusionar los dos en este plan (evitar el hueco de "dos
  dashboards que compiten"). Si se decide fusionar, es plan aparte.
- Phosphor icons: no agregar dependencia nueva sin justificar (CLAUDE.md). Mapear los iconos
  del mockup a los iconos que ya tiene la app (`app/ui/shell/icons.tsx`) o SVGs inline.
- La serie temporal de "tasa de hold" (Reportes) necesita historico que quiza no exista;
  si no hay datos, la tarjeta se cablea a lo que haya y se anota el hueco (no inventar el
  dato -- regla del proyecto).
- Multi-org: toda query nueva filtra por `idOrganizacion` (ver `contarPorEstado`), como el
  resto del repo.
