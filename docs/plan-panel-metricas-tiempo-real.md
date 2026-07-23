# Plan — Panel de métricas en tiempo real + queryable por MCP

Las tres métricas de flujo del deal (tiempo entre stage, ciclo de venta, conversión stage→stage) ya están construidas con dato real y se llenan solas hacia adelante desde cada deal que se mueve. Faltan dos piezas: el MRR potencial real por deal (que ya existe modelado en Notion y calza con la fórmula que la tool ya tiene, solo falta portar el catálogo de planes y capturar el % digital), y exponer todo por un MCP server. La sincronización de datos Notion→DB la lleva otra sesión y queda fuera de este plan.

## Estado confirmado: las 5 contra código real

| # | Lo pedido | Estado | Fuente real | Falta |
|---|---|---|---|---|
| a | Tiempo entre stage y stage | Construido, dato real | `empresa_estado_historial` → `duracionPromedioPorEtapa()` (`app/db/repository.ts:5368`) | Nada. Se llena solo al mover el deal |
| b | Ciclo de venta | Construido, dato real | mismo historial, empresas que llegan a `firma_pago` → `cicloVentaPromedio()` (`repository.ts:5400`) | Nada |
| c | Conversión stage→stage | Construido, dato real (reemplazó velocity en el default) | historial + `FUNNEL_ETAPAS`, high-water-mark → `conversionStage.ts:35` | Nada |
| d | Queryable | A medias | 1 endpoint REST (`/api/panel/pipeline`) con 4 cifras; a/b/c no salen por HTTP; no hay MCP | MCP server (Fase 3) |
| e | Historia del deal (monto, MRR, % digital, probabilidad) | Placeholder | `mrr.ts` con tarifas globales vacías → 0; probabilidad heurística fija | Catálogo de planes + % digital + relación (Fase 1) |

El motor de a/b/c es una sola tabla: `empresa_estado_historial`. Cada cambio de stage pasa por `escribirTransicionEstado()` (`repository.ts:5139`), que en la misma transacción escribe la etapa y la fila de historial con timestamp. No hay forma de mover un stage sin dejar rastro. Se llena solo hacia adelante: deals viejos no tienen pasado, deals nuevos o reactivados quedan medidos desde que se mueven.

## El modelo de MRR potencial ya existe en Notion

Esto se porta, no se inventa. En la DB "🔥 Sales Pipeline" de Notion cada deal ya calcula su MRR potencial así:

- **Catálogo `Planes`** (DB aparte, `collection://29595153-c5cd-805d-9b6c-000bbe323cf1`): cada plan tiene `SaaS mensual (valor)` y `Tarifa TXN (valor)`. Ejemplo, plan Essential: SaaS 600.000 COP/mes, Tarifa TXN 2.200 COP.
- **Deal** en el pipeline:
  - `Usuarios Estimados` (número, input del discovery). MEGANET = 1.200.
  - `Planes` (relación al catálogo): qué plan puede tomar el ISP.
  - `Tarifa TXN Plan` y `SaaS Plan`: rollups que traen los dos valores del plan relacionado.
  - `Trx Potenciales / Mes`: fórmula. Hoy usa un % digital fijo de 40% (constante dentro de la fórmula; no existe campo de % en el schema).
  - `MRR potencial`: fórmula final, confirmada por triangulación contra un deal real.
  - `Probabilidad de cierre`: número manual real (0–100%), ya existe como campo, no solo la heurística.
  - `Score MEDDPICC`: número.

Fórmula resuelta:

```
MRR potencial = (Usuarios Estimados × %digital × Tarifa TXN del plan) + SaaS mensual del plan
```

Verificación con un deal real (plan Pro, 4.000 usuarios): `4.000 × 40% × 1.680 + 1.800.000 = 4.488.000`. Cuadra exacto con el MRR potencial que muestra Notion. Es idéntica a `app/core/mrr.ts`. Hoy `%digital` es la constante 40%; el objetivo es volverla un dato capturado por deal en el discovery. Nota: `app/core/mrr.ts` usa 100% por default, así que sobreestima; el arranque correcto es 40%.

Catálogo de planes de Notion (a portar, valores en COP):

| Plan | SaaS mensual | Tarifa TXN |
|---|---|---|
| Essential | 600.000 | 2.200 |
| Pro | 1.800.000 | 1.680 |
| Growth | 5.500.000 | 1.000 |
| Utilities Lanzamiento | 10.000.000 | 250 |
| Utilities Crecimiento | 15.000.000 | 220 |
| Utilities Enterprise | 20.000.000 | 200 |

Además hay planes combo promocionales (`Essential (+Growth)`, `Pro (+Growth)`, `Essential (+Pro)`): mismo SaaS del plan base con la tarifa transaccional de un plan superior. El catálogo a portar son ~9 planes (uno, `Alliance SaePlus`, sin valores).

La tool ya tiene esta misma fórmula en `app/core/mrr.ts` (`usuarios × %digital × tarifa_txn + saas_mensual`). Da 0 porque lee `tarifa_txn`/`saas_mensual` de un `configuracion_admin` global que está vacío (`repository.ts:1058`, leído en `app/panel/page.tsx:67-68`), y el `%digital` cae a 1 por default. El cambio es la fuente del dato: tarifas por plan (catálogo) en vez de tarifa global, y % digital capturado por deal.

## Fase 1 — Historia del deal con dato real (core/dominio)

Objetivo: que `mrr_estimado` y la ficha del deal muestren MRR potencial real, calculado del plan del deal y el % digital, no de una config vacía.

1. **Tabla `plan` (catálogo).** Reflejar en `app/db/schema.ts` una tabla `plan` (id, nombre, saas_mensual, tarifa_txn). Seed desde el catálogo `Planes` de Notion. Acceso solo por Repository, como el resto. Nota de layering: el core no importa el driver; la tabla se toca por el puerto Repository.
2. **Relación deal → plan y % digital.** Agregar a `empresa` (o tabla satélite): `id_plan` (qué plan puede tomar) y `pct_digital` (0–1, capturado en discovery). `usuarios_estimados` ya vive en `empresaUsuarios` (`schema.ts:82`). Migración Drizzle propia, no colada dentro de una tarea de UI.
3. **Reescribir el cálculo de MRR.** `calcularMrrEstimado()` (`app/core/mrr.ts:24`) lee `tarifa_txn`/`saas_mensual` del plan del deal (no de config global) y `pct_digital` del deal. `mrrEstimadoTotal()` (`repository.ts:5442`) suma sobre el pipeline. Función pura en el core, alimentada por el Repository. Sin datos de plan → "sin datos", nunca 0 falso.
4. **Captura en la tool.** Campos en la ficha del deal para plan, % digital, usuarios. Decisión de Sebastián: la fuente de verdad de estos tres es la tool (Notion los tiene muertos en el CSV). El sync que los reconcilie con Notion es de la otra sesión.
5. **Probabilidad de cierre.** Decidir entre sincronizar el campo manual real de Notion (`Probabilidad de cierre`) o mantener la heurística por etapa (`app/core/probabilidadCierre.ts`). Ver decisiones abiertas.

## Fase 2 — Cablear la historia real al panel y a la ficha

1. **Widget `mrr_estimado`** pasa a leer del cálculo por plan. Con datos, deja de ser 0.
2. **Historia del deal en el drawer / endpoint.** El drawer del deal ya tiene el timeline de etapas (`historialEtapasEmpresa()`, `repository.ts:5312`). Sumar la cara financiera: plan, MRR potencial, % digital, probabilidad, usuarios. El endpoint `/api/panel/pipeline` (`route.ts:41-45`) ya expone 4 cifras por deal, ajustar a las reales del plan.
3. **a/b/c ya están.** No se tocan salvo verificar que siguen verdes.

## Fase 3 — Queryable por MCP server (en el repo)

Objetivo: preguntar las métricas y la historia de deals en lenguaje natural desde Claude, o consultarlas desde una herramienta externa, sin abrir la UI.

1. **MCP server nuevo en el repo.** Agregar `@modelcontextprotocol/sdk` (no está hoy en `package.json`). Server que importa las funciones ya puras del Repository y las expone como tools de solo lectura.
2. **Tools mínimas:**
   - `panel_metricas` — tiempo en etapa, ciclo de venta, conversión stage→stage, velocity, MRR total, en un rango/owner. JSON.
   - `deal_historia` — por empresa: stage actual, transiciones con fecha, plan, MRR potencial, % digital, probabilidad, usuarios.
   - `pipeline` — lista de deals con sus cifras (lo que hoy da el endpoint REST).
3. **Lectura, no escritura.** El MCP solo lee. Ninguna tool muta la DB ni sincroniza a Notion. Respeta la regla de la constitución: el consumidor CRO/MCP lee, no escribe.
4. **Transporte y auth.** Decisión abierta: stdio local (te conectas desde tu Claude, lee la DB de prod o una réplica) vs HTTP con token headless. Recomendado stdio primero.
5. **Input del panel.** El campo "Pregunta libre vía MCP" del cockpit (`Cockpit.tsx:47`, hoy deshabilitado) queda previsto para colgar de este server en una iteración posterior.

## Fuera de scope (otra sesión)

Automatizar la sincronización Notion→DB (el spec `docs/spec-sync-diario-notion.md`, sin implementar). Hoy el stage se mueve corriendo `scripts/sync_estados_notion.ts` a mano contra un export de Notion. Que la captura sea de verdad en tiempo real depende de ese sync, y lo lleva la otra sesión. Este plan asume que el stage y los campos del deal llegan a la DB por ese camino.

## Decisiones abiertas

1. **Fórmula: resuelta.** `MRR = (Usuarios × %digital × Tarifa TXN plan) + SaaS mensual plan`, verificada contra un deal real. Pendiente menor de Sebastián: confirmar que el 40% es el default correcto cuando el discovery aún no capturó el % real, y qué % se asume para deals sin discovery.
2. **Probabilidad de cierre: real vs heurística.** Notion ya tiene el campo manual `Probabilidad de cierre`. Opción A: sincronizarlo (dato real que pone el comercial). Opción B: mantener la heurística por etapa. A da un número honesto pero depende de disciplina de captura; B es automático pero es un supuesto. Sebastián decide.
3. **% digital: dónde se captura.** Nueva columna en el deal, llenada en la ficha durante el discovery, default 40% mientras no haya dato. Confirmar el nombre y el rango (0–1 interno, 0–100 en UI).
4. **MCP: transporte.** stdio local vs HTTP con token. Recomendado stdio para arrancar.
