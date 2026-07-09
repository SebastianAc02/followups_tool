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

**Compartido entre organizaciones** (catálogo común, sin cambio de esquema):
`empresa`, `contacto`, `empresa_alias`, `empresa_usuarios`, y `cadencia` /
`paso_cadencia` / `version_paso` (son templates/playbook reutilizable, no ejecución).

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

Consecuencia intencional del modelo: la MISMA `empresa` puede aparecer en la cola de dos
organizaciones distintas al mismo tiempo, cada una con su propio historial de `toque` y
su propia fecha de próximo follow-up, porque el lead es compartido pero la actividad no.

## Migración

Una migración Drizzle:
1. Agrega `id_organizacion` (nullable primero) a `toque`, `campana`, `segmento`.
2. Agrega `id_organizacion` (nullable) a `conector` y `conector_config`.
3. `UPDATE` sobre todo `toque`/`campana`/`segmento` existente: `id_organizacion` = el id
   de la fila "Onepay" que ya existe en `organizacion`.
4. Vuelve `id_organizacion` `NOT NULL` en `toque`/`campana`/`segmento` (no en
   `conector`/`conector_config`, que se quedan nullable a propósito: nullable = global,
   igual que hoy).

Efecto para los 4 owners actuales (Sebastián activo, Thomas/Felipe/Camilo sin reclamar):
ninguno. Siguen viendo exactamente el mismo pool, ahora con la etiqueta "Onepay".

## Filtrado

`app/lib/session-user.ts` se extiende para incluir `idOrganizacion` (hoy solo expone
`owner` y `admin`), resuelto server-side desde `organizacionDeUsuario(idUser)` (ya existe
en `app/db/organizacion-repository.ts`, solo falta que session-user.ts la use).

El Repository filtra toda lectura/escritura de `toque`/`campana`/`segmento` (y lo que
cuelga de ellas) por ese `idOrganizacion`. Nunca se confía en un `idOrganizacion` que
mande el cliente — siempre sale de la sesión server-side.

`empresa`/`contacto` no cambian: sin filtro de organización, visibles para cualquier
usuario autenticado, igual que hoy.

## Fuera de alcance de este spec

- Pantalla de Workspace (crear organización por UI).
- Invitación por correo + registro vía invitación.
- Selector de organización para el admin (ver la cola de cualquier equipo). El admin, en
  esta parte, sigue viendo solo su propia organización — el cross-org es Parte 2.
- UI para conectar el Notion (u otro CRM) de una organización nueva.
- Adaptador de un CRM distinto a Notion.

## Testing

- Repository: un `toque`/`campana` creado bajo organización A es invisible al leer como
  organización B, incluso sobre la misma `empresa` (el lead compartido no filtra, la
  actividad sí).
- Migración: seed con datos representativos del estado actual → correr migración →
  confirmar que el 100% de `toque`/`campana`/`segmento` existente quedó con
  `id_organizacion` = Onepay, y que la columna quedó `NOT NULL`.
- `empresa`/`contacto` siguen visibles para un usuario de cualquier organización (no se
  rompe el catálogo compartido).
- `conector`/`conector_config` con `id_organizacion` NULL se siguen resolviendo como
  "global" (comportamiento actual de Notion no cambia).
