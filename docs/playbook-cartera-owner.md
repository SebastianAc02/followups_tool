# Auditar la cartera de una persona

Se responde con una sola llamada, `embudo` con el parámetro `owner`, y se compara contra lo que esa persona ve en Notion.

## Cómo se hace

Una sola llamada a la tool `embudo` del MCP pasando `owner` con el nombre tal como está escrito en el pipeline. Devuelve el conteo por etapa y los usuarios de cada una. No hace falta traerse el pipeline entero ni contar a mano.

## Los nombres exactos de owner

`empresa.owner` es texto libre, no una llave a la tabla de usuarios, así que el filtro es por igualdad exacta y el nombre tiene que estar escrito igual. Los valores reales en la base, medidos el 2026-07-25:

| Owner | Cuentas |
|---|---|
| Sebastian Acosta Molina | 132 |
| Felipe Castro | 82 |
| Thomas Schumacher | 79 |
| Camilo fonseca | 12 |
| Manuel H. | 1 |
| Sin owner | 222 |

Advertencia: hay dos filas con owner compartido, "Felipe Castro, Thomas Schumacher" y "Felipe Castro, Sebastian Acosta Molina". Esas NO entran por igualdad exacta. Es un límite conocido, no un bug: contarlas en las dos carteras haría que una misma cuenta apareciera dos veces. Si algún día se quiere incluirlas, es cambiar el filtro a LIKE, y hay que saber que eso duplica.

## Qué comparar, y qué NO

Al comparar contra Notion hay que separar el pipeline activo de los clientes ya cerrados. Ejemplo real del 2026-07-25 con la cartera de Felipe: los seis números del pipeline activo cuadraron exacto entre Notion y la herramienta (41 on hold, 6 lead, 11 contacto iniciado, 3 oportunidad, 5 cierre, 1 firma pendiente, o sea 67 en total), y el total de la herramienta daba 84. La diferencia de 17 eran cuentas en firma_pago, o sea clientes ya cerrados que no se cuentan en el pipeline activo. No era un descuadre.

Regla: antes de declarar un descuadre, verificar si la diferencia es exactamente firma_pago.

## Qué ve cada quien en la pantalla

En `/seguimiento` cada persona ve solo su propia cartera: los KPIs, las cadencias, las respuestas y las cuentas sin cadencia se filtran por su owner. La única excepción es el permiso `verTodoPipeline` (modo CRO), que muestra todo.

Esto se arregló el 2026-07-25: antes tres de las cuatro consultas de esa pantalla ignoraban el owner, así que a Felipe le salían cuentas de Sebastián.

## La traducción de etapas

Los nombres de Notion no son los slugs de la base. "Firma Pendiente" y "Contrato Firmado" en Notion mapean los dos a `enviar_contrato`; "Firma y Pago Realizado" mapea a `firma_pago`. Está en `app/core/reconciliacion/mapeoEstados.ts`.
