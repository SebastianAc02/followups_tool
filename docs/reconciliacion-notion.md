# Reconciliar el pipeline contra Notion

Alinear el estado y el owner de `isps.db` contra Notion cuando los dos sistemas divergen. La regla es simple: Notion manda, la base sigue.

## La regla de oro

Notion es la fuente de la verdad del Estado. `isps.db` se alinea a Notion, nunca al revés.

En este proceso Notion es SOLO LECTURA: no se edita ni a mano ni por API desde la herramienta. El sync hacia Notion no es automático hoy y no debe serlo: se dispara a través de Claude, una vez al día o por evento puntual.

Por qué: el pipeline comercial se maneja en Notion. Mover una empresa de etapa es un clic en Notion, y ese cambio solo baja a `isps.db` cuando alguien lo sincroniza. No hay webhook, no hay polling, no hay API call en tiempo real. Cambiar la dirección (DB → Notion del estado) requeriría mapear contra los grupos de status reales de Notion antes de escribirlo con seguridad. Hoy no está hecho.

## El flujo de 3 llamadas

**Llamada 1: traer el pipeline de Notion en una consulta.**

Usar `group_concat` para colapsar las ~482 filas de la tabla pipeline en una sola celda. El modo vista de Notion devuelve todas las propiedades (46 columnas, incluidas notas largas), unos 150 KB por página de 100 filas, y son 5 páginas. El modo SQL tiene tope de 100 filas y no expone cursor, pero `group_concat` devuelve una sola fila con todo, unos 35 KB.

```sql
SELECT group_concat(Empresa || '§' || Estado || '§' || coalesce(Owner,''), '¶') 
FROM "collection://73a2e0fa-0116-4894-abab-733efb4c6cd7"
```

**Advertencia:** el modo SQL de Notion tiene límite de 5 consultas por hora en el plan actual. Contarlas antes de gastar.

**Llamada 2: pedir la lista compacta de cuentas de isps.db.**

Usar la tool `cuentas` del MCP de la herramienta. Devuelve: `idEmpresa`, `nombre`, `nombreNotion`, `estado`, `owner`, `notionPageId`.

**Llamada 3: pasar el diff a la reconciliación.**

Usar la tool `reconciliar_notion` del MCP.

## Cómo se cruza: por página, no por nombre

Se cruza por `notion_page_id`, nunca por nombre normalizado.

Dato medido el 2026-07-24: cruzar 482 páginas contra 476 cuentas por nombre normalizado dio 166 falsos positivos de un lado y 160 del otro. La razón es simple. Notion guarda la marca comercial ("Atlantel", "REDVIVA"). La base guarda la razón social del RUES ("ATLANTEL S.A.S"). Son el mismo cliente, pero la string plana no los empareja confiable. La columna `nombre_notion` existe justamente para no repetir ese error: guarda el nombre de Notion así el matcher tiene dos direcciones de verdad.

## Qué se aplica solo y qué necesita aprobación de Sebastián

**Se aplica sin preguntar:** cuando las dos fuentes apuntan a la misma página de Notion (mismo `notion_page_id`) y difieren el estado o el owner. Se alinea `isps.db` a Notion.

**Necesita aprobación de Sebastián, una cuenta por vez (nunca en bloque):**
- Decidir que dos nombres distintos son la misma empresa.
- Crear una cuenta nueva.

La razón: no hay llave única entre Notion e `isps.db`, y hay duplicados en ambos lados. Ya pasó que una fusión errónea metió a un cliente (Fibermax) dentro de un prospecto (Fibermat). No automatizar eso.

**Nunca se hace:** borrar una cuenta. Si una cuenta de `isps.db` no tiene página en Notion, se lista y ya. Luego se decide a mano qué hacer.

## Cuentas de otras personas

Si el owner de la página en Notion es otra persona (por ejemplo Felipe Castro), **no se toca su Notion en absoluto**. La base sí se alinea (si el estado o el owner local difieren).

El owner se lee de la propiedad `Owner` de la página, que es un id de usuario de Notion. Se resuelve con la tool de usuarios del MCP de Notion, no se adivina ni se asume.

## Trampas conocidas

**La tool `deal_historia` del MCP responde `empresa_no_encontrada` en dos casos distintos:**
- La empresa no existe.
- Existe pero sin `estado_notion`.

No los distingue. Para saber cuál es, usar `buscar_empresa`.

**El MCP lee la base de PRODUCCIÓN, no la `isps.db` local.**

Los conteos difieren de verdad (local no se sincroniza con prod automático). No diagnosticar contra la local. Medir justo antes de reconciliar.

**Hay páginas en Notion con el título vacío.**

No son cuentas. Se reportan aparte.
