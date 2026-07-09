# Multi-organización real — Parte 1: aislamiento de datos

Fecha: 2026-07-09
Estado: aprobado, listo para plan de implementación

## Contexto

Objetivo final (fuera de este spec): Sebastián puede invitar gente por correo desde un
"Workspace", la persona invitada se registra, y la organización a la que queda ligada la
elige Sebastián al invitar — incluyendo crear una organización nueva y vacía solo para
ella.

Ese objetivo se parte en dos specs secuenciales porque son superficies de riesgo
distintas: este spec (Parte 1) es la base de datos/dominio (multi-organización real con
aislamiento), y un spec futuro (Parte 2) es el flujo de invitación + correo transaccional
+ pantalla de Workspace, que depende de que esta base ya exista.

Hoy `organizacion`/`organizacion_miembro` ya existen (`app/db/schema.ts`) y ya hay un
flujo de "reclamo atómico" donde un usuario nuevo reclama un `owner_canonico` libre
(`app/db/organizacion-repository.ts`). Pero ninguna tabla de negocio (`empresa`, `toque`,
`campana`) tiene `id_organizacion`, y no existe ningún filtro de visibilidad por usuario
logueado: cualquiera que entra ve todo el pool de Onepay. Este spec agrega el filtro real.

## Modelo: qué se comparte, qué se aísla

**Decisión clave (revisada tras leer `repository.ts`):** `empresa.estadoNotion`,
`owner`, `proximoFollowUpFecha`, `proximoPaso`, `proximoCanal`, `esCliente`,
`enConversacion`, `prioridadComercial` y `notionPageId` son el "estado actual" de la
relación comercial, cacheado en la MISMA fila que el catálogo del lead. Hacer que dos
organizaciones trabajen el mismo lead con estado 100% independiente exigiría partir
`empresa` en dos tablas (catálogo vs. estado de relación) — se comprobó que esos campos
se referencian 28+ veces solo en `repository.ts`, más en `app/cola/agenda.ts`,
`app/lib/session-user.ts`, `app/lib/notion-url.ts`, `app/lib/auth.ts`. Es un proyecto en
sí mismo, no cabe en esta Parte 1.

Para esta Parte 1 se elige el camino simple: **un lead lo trabaja UNA organización a la
vez**. `empresa` mantiene sus campos de estado tal cual están hoy; se agrega
`organizacion_activa_id INTEGER NOT NULL` (la organización que actualmente tiene la
relación abierta con ese lead). La independencia total (estado de relación separado por
organización sobre el mismo lead) queda anotada como mejora futura, NO bloqueando esta
parte — se retoma solo si en la práctica hace falta que dos organizaciones trabajen el
mismo lead a la vez.

**Compartido entre organizaciones** (catálogo común, sin cambio de esquema más allá de
la columna de arriba): `empresa` (agrega `organizacion_activa_id`), `contacto`,
`empresa_alias`, `empresa_usuarios`, y `cadencia` / `paso_cadencia` / `version_paso`
(son templates/playbook reutilizable, no ejecución).

**Aislado por organización** (columna nueva `id_organizacion INTEGER NOT NULL`,
FK lógica a `organizacion.id_organizacion`, mismo estilo sin `REFERENCES` física que ya
usa el resto del esquema): `toque`, `campana`, `segmento`.

**Hereda organización por join, sin columna propia** (evita duplicar la columna en seis
tablas más): `segmento_exclusion` (vía `id_segmento` → `segmento`), `inscripcion` /
`destinatario` / `paso_inscripcion` / `evento_tracking` (vía la cadena hasta
`id_campana` → `campana`).

**`conector` / `conector_config`**: agregan `id_organizacion INTEGER` nullable, mismo
patrón que `id_usuario` ya tiene para modo "personal". Deja el esquema listo para que
cada organización tenga su propio Notion (o, más adelante, otro CRM) sin romper el modo
"admin"/global que usa Onepay hoy. La UI para que un admin configure el conector de una
organización nueva queda fuera de este spec (Parte 2).

Consecuencia del modelo revisado: la cola de una organización solo muestra leads con
`organizacion_activa_id` = su organización. La reasignación de un lead de una
organización a otra (cambiar `organizacion_activa_id`) no tiene UI en esta parte —
se hace, si hace falta, directo en DB, igual que otras operaciones administrativas
puntuales de este repo.

## Migración

Una migración Drizzle:
1. Agrega `id_organizacion` (nullable primero) a `toque`, `campana`, `segmento`.
2. Agrega `organizacion_activa_id` (nullable primero) a `empresa`.
3. Agrega `id_organizacion` (nullable) a `conector` y `conector_config`.
4. `UPDATE` sobre todo `toque`/`campana`/`segmento`/`empresa` existente:
   `id_organizacion` / `organizacion_activa_id` = el id de la fila "Onepay" que ya
   existe en `organizacion`.
5. Vuelve `id_organizacion` `NOT NULL` en `toque`/`campana`/`segmento`, y
   `organizacion_activa_id` `NOT NULL` en `empresa` (no en `conector`/`conector_config`,
   que se quedan nullable a propósito: nullable = global, igual que hoy).

Efecto para los 4 owners actuales (Sebastián activo, Thomas/Felipe/Camilo sin reclamar):
ninguno. Siguen viendo exactamente el mismo pool, ahora con la etiqueta "Onepay".

## Filtrado

`app/lib/session-user.ts` se extiende para incluir `idOrganizacion` (hoy solo expone
`owner` y `admin`), resuelto server-side desde `organizacionDeUsuario(idUser)` (ya existe
en `app/db/organizacion-repository.ts`, solo falta que session-user.ts la use).

El Repository filtra toda lectura/escritura de `toque`/`campana`/`segmento` por su
`id_organizacion`, y de `empresa` por `organizacion_activa_id`, siempre por ese
`idOrganizacion` de sesión. Nunca se confía en un `idOrganizacion` que mande el cliente
— siempre sale de la sesión server-side.

`contacto`/`empresa_alias`/`empresa_usuarios` no cambian: sin filtro de organización,
visibles para cualquier usuario autenticado (cuelgan de una `empresa` que sí filtra por
`organizacion_activa_id`, así que ya heredan el filtro por join).

## Fuera de alcance de este spec

- Pantalla de Workspace (crear organización por UI).
- Invitación por correo + registro vía invitación.
- Selector de organización para el admin (ver la cola de cualquier equipo). El admin, en
  esta parte, sigue viendo solo su propia organización — el cross-org es Parte 2.
- UI para conectar el Notion (u otro CRM) de una organización nueva.
- Adaptador de un CRM distinto a Notion.
- UI para reasignar `organizacion_activa_id` de un lead entre organizaciones.
- Estado de relación independiente por organización sobre el mismo lead (partir
  `empresa` en catálogo + estado de relación) — mejora futura, ver "Modelo" arriba.

## Plan de implementación (fases, por tamaño real del código)

`repository.ts` tiene ~90 funciones exportadas; ~60 tocan `toque`/`segmento`/`campana` o
lo que cuelga de `campana` (motor de cadencias/inscripciones/tracking). Filtrar todo eso
de una sola vez es un diff inmanejable. Se divide en planes secuenciales, cada uno
enviable y probado por separado:

- **Plan 1 (este)**: esquema + migración + `idOrganizacion` en sesión + filtrado de
  cola/dashboard (`colaDelDia`, `registrarToque`, `contadoresHoy`, `contarPorEstado`,
  `resumenHome`, `repartirFollowups`, `getCuenta`, `actualizarCampoCalificacion`) — el
  núcleo real de "follow-ups tool".
- **Plan 2 (futuro)**: filtrado de segmentos (~13 funciones).
- **Plan 3 (futuro)**: filtrado de campañas + motor de inscripciones/tracking
  (~40 funciones) — el más grande, probablemente se parte en sub-planes también.
- **Plan 4 (futuro)**: filtrado de reporting/panel (`contarToquesEnRango`,
  `toquesPorCanal`, etc., ~8 funciones).

Riesgo real de dejar 2-4 sin filtrar todavía: ninguno en la práctica, porque hoy solo
existe la organización Onepay — no hay una segunda organización con datos hasta que
exista el flujo de invitaciones (Parte 2, spec futuro). El filtrado de campañas/segmentos
debe completarse ANTES de invitar a una segunda organización real.

## Testing

- Repository: un `toque`/`campana` creado bajo organización A es invisible al leer como
  organización B; una `empresa` con `organizacion_activa_id` = A no aparece en la cola
  de B.
- Migración: seed con datos representativos del estado actual → correr migración →
  confirmar que el 100% de `toque`/`campana`/`segmento`/`empresa` existente quedó con
  `id_organizacion`/`organizacion_activa_id` = Onepay, y que las columnas quedaron
  `NOT NULL`.
- `conector`/`conector_config` con `id_organizacion` NULL se siguen resolviendo como
  "global" (comportamiento actual de Notion no cambia).
