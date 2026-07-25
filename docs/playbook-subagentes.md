# Delegar trabajo a subagentes en este repo

Se paraleliza por archivos disjuntos, nunca por tareas que suenan independientes. Dos agentes
editando el mismo archivo se pisan, aunque sus tareas sean conceptualmente distintas. Antes de
lanzar, se lista qué archivos va a tocar cada uno y se verifica que no se crucen.

## La regla de los archivos disjuntos

Dos agentes editando el mismo archivo se pisan, aunque sus tareas sean conceptualmente distintas.
Antes de lanzar, se lista qué archivos va a tocar cada uno y se verifica que no se crucen.

Ejemplo real del 2026-07-25 que funcionó: tres agentes en paralelo, uno sobre `app/db/schema.ts`
y las migraciones, otro creando un doc nuevo, otro actualizando otro doc. Cero colisiones. En
cambio `app/db/repository.ts`, `app/mcp/tools.ts` y `app/mcp/server.ts` los tocaba el agente
principal, y por eso ningún subagente los recibió.

En el prompt de cada agente se le prohíbe explícitamente tocar los archivos que otro está
editando, nombrándolos.

## El reporte de un subagente se verifica, no se cree

Un agente reportó "SQL limpio, solo ALTER TABLE ADD COLUMN, sin drop/recreate destructivo" y era
cierto de lo que él miró, pero había dejado dos problemas que su reporte no mencionaba: la
cadena de snapshots de Drizzle quedó encadenada al revés, y el SQL incluía un `CREATE TABLE` de
una tabla que ya existe en producción con 670 filas, lo que habría matado el deploy.

Regla: después de un subagente que escribe código, se corren los gates uno mismo (`npx tsc --noEmit`
y `npm test`) y se leen los archivos que generó. El reporte sirve para saber dónde mirar, no para
saltarse la revisión.

## Qué delegar y qué no

Va bien a un subagente: escribir un documento con contenido ya dictado, una migración mecánica,
actualizar un doc existente con puntos concretos.

No va: decisiones de diseño, lógica de dominio, y cualquier cosa donde el criterio importe más
que la ejecución.

Modelo: Haiku alcanza para trabajo mecánico bien especificado, que es la mayoría de lo
delegable. El prompt tiene que ser autocontenido, con pasos numerados y el contenido explícito,
porque el agente no tiene el contexto de la conversación.

## Qué prohibirles siempre

En el prompt de todo subagente va explícito:

- No hacer `git commit` ni `git add`. Quien orquesta decide qué entra y en qué commit.
- No aplicar migraciones a ninguna base de datos, solo generar los archivos.
- No tocar los archivos que otro agente o el principal está editando, nombrándolos uno por uno.

Y se les pide un reporte concreto: qué archivo crearon o modificaron, y el contenido literal de
lo que sea crítico revisar.
