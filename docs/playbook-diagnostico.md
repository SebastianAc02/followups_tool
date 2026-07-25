# Diagnosticar sin quemar el contexto

El costo no está en los datos que se piden, está en los que se imprimen.

## Por qué traer más puede costar menos

Cuando la respuesta de una tool excede el límite, el harness la guarda en un archivo y no entra al contexto. Se procesa con python o grep y solo se ve el resultado. Entonces:

- 5 llamadas al MCP de Notion en modo vista, 750 KB en total, costaron cerca de 0 tokens de contexto.
- La tool `pipeline` devolviendo 142 KB también costó cerca de 0.
- Una consulta con `group_concat` que devolvía 35 KB en una sola celda habría costado unos 9.000 tokens, porque cabía y entraba directo.

La conclusión es contraintuitiva y hay que tenerla presente: optimizar por número de llamadas puede salir más caro que optimizar por lo que entra al contexto.

## El error que de verdad cuesta

Imprimir listas completas. El 2026-07-25 imprimir las 326 líneas de un cruce fallido (166 de un lado, 160 del otro) costó unos 8.000 tokens y era puro ruido: el cruce estaba mal hecho.

Regla: de un procesamiento se imprime el conteo y las diferencias, nunca la lista entera. Si el resultado tiene más de 20 líneas, es señal de que hay que resumirlo antes de imprimirlo.

## El orden correcto para diagnosticar

1. Empezar por el conteo, no por la lista. La tool `embudo` da ocho números en una llamada; `pipeline` obliga a traerse 476 registros para producir los mismos ocho.
2. Bajar listas solo de lo que no cuadre.
3. Cruzar siempre por `notion_page_id`, nunca por nombre. Medido el 2026-07-25: por nombre dio 326 falsas diferencias, por page_id dio 9.
4. Verificar contra el conteo manual de Sebastián antes de declarar un hallazgo. Sus números son el criterio.

## No confundir las bases

El MCP lee la base de producción. La isps.db local es otra cosa y sus conteos difieren de verdad: el 2026-07-24 la local decía 141 on_hold y 102 firma_pago mientras producción tenía 125 y 87. Para estado y existencia se le pregunta al MCP. Para identidad (page_id, NIT, nombres) la local sirve, es el mismo dato. Detalle completo en `docs/base-de-produccion.md`.

## Una respuesta de tool puede engañar

`deal_historia` respondía `empresa_no_encontrada` tanto si la cuenta no existía como si existía pero estaba fuera del embudo. Eso hizo concluir que cinco cuentas había que crearlas cuando solo había que enlazarlas, y crear una cuenta que ya existe es fabricar un duplicado. Se arregló el 2026-07-25: ahora distingue los dos casos y dice el motivo.

La lección general: antes de concluir "no existe" a partir de un error, confirmarlo por otra vía. `buscar_empresa` cruza cuatro frentes y es la que responde de verdad esa pregunta.
