# Aviso de respuesta en cadencia (destaque en /cola y /seguimiento)

Fecha: 2026-07-14
Pedido por: Sebastián, fuera del spec de secuencias-correo-gmail (pieza genérica por canal).

## Problema

Cuando un contacto responde por cualquier canal (Apollo/correo, WhatsApp, y pronto Gmail),
`pollTracking` (app/core/tracking.ts) o `procesarRespuestaEntrante` (app/core/llego-respuesta.ts)
pausan la inscripción en silencio. No hay ningún aviso — Sebastián solo se entera si entra a
revisar manualmente. Falta una señal proactiva de "Fulano de [empresa] te respondió", genérica
por canal (no un fix específico de Gmail).

## Decisiones tomadas con Sebastián

1. **Canal del aviso: UI, no WhatsApp.** Se descartó reusar `avisarAdminPorWhatsapp` (riesgo de
   ruido si el volumen de respuestas sube). El aviso vive dentro de la herramienta.
2. **Forma del aviso: fila destacada en /cola y /seguimiento** (no badge global de contador).
3. **Cuándo se apaga: automático al abrir la ficha de esa empresa** (no requiere un botón "visto"
   explícito, no requiere que reactive la cadencia).
4. **Persistencia: tabla separada** `notificacion_respuesta`, una fila por respuesta (historial
   completo, append-only — mismo espíritu que `evento_tracking`), no columnas in-place en
   `inscripcion`.

## Modelo de datos

Tabla nueva en `app/db/schema.ts`:

```ts
export const notificacionRespuesta = sqliteTable('notificacion_respuesta', {
  idNotificacion: integer('id_notificacion').primaryKey({ autoIncrement: true }),
  idInscripcion: integer('id_inscripcion').notNull(),
  idEmpresa: text('id_empresa').notNull(), // denormalizado: /cola y /seguimiento consultan por empresa
  canal: text('canal').notNull(),          // 'correo' | 'whatsapp' (mismo vocabulario que el resto del sistema)
  detectadaEn: text('detectada_en').notNull(),
  vistaEn: text('vista_en'),               // null = no vista todavía
  createdAt: text('created_at'),
});
```

"Destaque activo" para una empresa = existe al menos una fila con `idEmpresa` = esa y
`vistaEn IS NULL`.

Marcar como vista = `UPDATE notificacion_respuesta SET vista_en = now WHERE id_empresa = ? AND vista_en IS NULL`
(todas las filas sin ver de esa empresa a la vez, no solo la última).

## Core: un único punto de notificación

Genérico por canal, no un hook por proveedor. En los DOS lugares donde hoy se llama
`pausarInscripcion(..., 'respuesta detectada')`:

- `app/core/tracking.ts`, dentro de `pollTracking`, rama `evento.tipo === 'respondio'`.
- `app/core/llego-respuesta.ts`, dentro de `procesarRespuestaEntrante`, loop de `activas`.

Se agrega, justo al lado de la llamada existente a `pausarInscripcion`, una llamada nueva a un
dep inyectado:

```ts
registrarRespuestaDetectada: (idInscripcion: number, idEmpresa: string, canal: string) => void;
```

No cambia nada de la lógica de corte de cadencia que ya existe (`pausarInscripcion` sigue
llamándose igual, con el mismo motivo). Esto es puramente aditivo — si algo falla en el registro
de la notificación, no debe frenar el corte de cadencia (mismo criterio de aislamiento que ya usa
el resto del core: la notificación no es más crítica que el efecto que ya funciona hoy).

En `tracking.ts`, `idEmpresa` no viene directo en `DestinatarioResuelto` — hay que resolverlo
(agregar `idEmpresa` a lo que devuelve `resolverDestinatarioPorEmail`, o añadir un campo al tipo
existente). En `llego-respuesta.ts` ya está disponible como `match.idEmpresa`.

## Repository

- `registrarRespuestaDetectada(idInscripcion, idEmpresa, canal)` — insert en
  `notificacion_respuesta`.
- `marcarRespuestaVista(idEmpresa)` — update masivo descrito arriba.
- `empresasConRespuestaPendiente(idOrganizacion): Set<string>` — para pintar el destaque; join
  `notificacion_respuesta` -> `empresa` filtrando por organización y `vista_en IS NULL`.

## Wiring

- `app/worker/index.ts` (`tareaTracking`): pasa `registrarRespuestaDetectada` real al armar
  `TrackingDeps`, igual que ya pasa `pausarInscripcion`.
- `app/api/webhooks/whatsapp/route.ts`: pasa `registrarRespuestaDetectada` real al armar
  `RespuestaEntranteDeps`.

## UI

### /cola

`app/cola/ColaUnificada.tsx` ya tiene el patrón de pills condicionales junto al nombre de empresa
(`PBX`, `Cadencia`). Se agrega un pill "Respondió" cuando `fila.id` está en
`empresasConRespuestaPendiente`. La fila sigue navegando a `/llamada/[id]` como hoy
(`app/llamada/[id]/page.tsx`, server component) — ese page llama `marcarRespuestaVista(id)` antes
de renderizar.

### /seguimiento

`pipelineGlobal` (la query que alimenta los grupos por etapa) filtra `inscripcion.estado = 'activa'`
— una empresa recién pausada por respuesta cae fuera de esos grupos. Ese comportamiento no se
toca: una respuesta no es "progreso de cadencia", es un concepto distinto (bandeja de revisión
pendiente) y mezclarlo en `pipelineGlobal` confundiría dos queries con propósitos distintos.

En vez de eso, se agrega una franja nueva y separada arriba del pipeline en
`app/ui/seguimiento/SeguimientoShell.tsx`: **"Respondieron"**, alimentada por
`empresasConRespuestaPendiente`, reusando `EmpresaRow` con un acento visual propio (en vez del
badge "HOY"). Al hacer click abre el mismo `DetallePanel` de siempre (vía
`perfilPipelineEmpresaAction`), que se extiende para llamar también `marcarRespuestaVista(idEmpresa)`.

## Fuera de alcance

- Badge/contador global en el sidebar (descartado por Sebastián).
- Reactivar la cadencia desde el destaque (eso ya existe como acción aparte, no es parte de este
  aviso).
- Notificación por WhatsApp (descartada; `avisarAdminPorWhatsapp` queda intacto para lo que ya usa).
- Cambiar `pipelineGlobal` para incluir pausadas-por-respuesta (decisión explícita de mantener
  las dos queries separadas).
