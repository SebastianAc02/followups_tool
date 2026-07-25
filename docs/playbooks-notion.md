# Playbooks de operación entre Notion y la herramienta

Cada operación tiene un procedimiento fijo y un punto exacto donde se para a preguntar. Escrito
para que la operación no dependa de acordarse, y para no preguntarle a Sebastián lo mismo dos
veces. Si un caso nuevo aparece y se resuelve a mano, se agrega acá.

## Quién manda sobre qué

No hay merge ni "cuál es más reciente": cada campo tiene un solo dueño, y por eso no hay
conflicto posible.

| Campo | Manda | Por qué |
|---|---|---|
| Estado | Notion | Ahí lo mueve el equipo |
| Owner | Notion | Ahí se asigna |
| Toques, brief, reunión | La herramienta | Nacen ahí, Notion nunca los genera |
| Empresa nueva | Notion | La herramienta todavía no crea empresas |

Notion es de solo lectura. Escribir en Notion requiere aprobación explícita de Sebastián, cada
vez. El sync hacia Notion no es automático y hoy no debe serlo: se dispara a través de Claude.

### El owner está disparejo a propósito desde el 2026-07-25

Ese día se reasignaron **42 owners y 5 categorías desde el cockpit web**, en lote, sobre cuentas en
`firma_pago` (clientes). Esos cambios viven **solo en la base**: Notion conserva los owners
anteriores. Decisión de Sebastián: se deja así, no se sube a Notion y no se revierte la base.

Lo que hay que saber al operar: **`reconciliar_notion` va a proponer alinear esos owners a lo que
dice Notion, y esa propuesta se ignora.** Notion ahí no está más al día, está más viejo. Alinear
seria revertir un cambio deliberado.

Cómo reconocerlos: son cuentas en `firma_pago` cuyo owner cambió el 2026-07-25 entre las 20:06 y
las 20:07. Quedan en `sync_cambios` con `fuente = 'cockpit'` y `detalle = 'campos: owner'`.

El estado NO tiene este problema: cuadra al 100% entre los dos lados. Este es un caso de un solo
campo.

## Playbook 1: apareció una página nueva en Notion

**Paso 1. Traerse la página entera de una vez.** Una sola lectura, no tres. Estado, owner,
industria, teléfono, web, contacto principal, notas de discovery y prioridad. El Owner viene
como id de usuario de Notion: se resuelve a nombre con la tool de usuarios, no se adivina. Si la
página tiene subpáginas (tabla de toques, brief, reunión), mirarlas también en esta pasada.

Felipe normalmente no llena sus páginas, así que es esperable que venga casi vacía. Eso no es un
error, es el caso normal.

**Paso 2. Preguntarle a producción si ya existe.** Una sola llamada a `buscar_empresa` con todo
lo que se sacó en el paso 1: nombre, dominio, teléfono y NIT. Cruza cuatro frentes a la vez
(empresa, alias, prospección y contactos) y devuelve cada candidato con su confianza.

**Paso 3. Llegar con la propuesta hecha y pedir confirmación.**

Siempre se confirma con Sebastián antes de escribir. Lo que cambia entre casos no es SI se
pregunta, es **qué se le pone enfrente**: nunca se le pregunta cómo se hace, se le muestra lo
que se encontró y qué se va a hacer, para que responda con una palabra.

| Lo que devolvió `buscar_empresa` | Qué se le presenta |
|---|---|
| Nada se parece | "No existe nada parecido por nombre, dominio, teléfono ni NIT. La creo como ISP, etapa X, owner Y, enlazada a esta página. ¿Dale?" |
| Confianza **alta** por NIT, dominio o teléfono | "Es esta cuenta: coincide el NIT / el dominio / el teléfono. La enlazo a la página y le pongo la etapa de Notion. ¿Dale?" Con la evidencia concreta, no "se parece" |
| Solo se parece el **nombre** | Los candidatos con la evidencia de cada uno, y qué falta para decidir. **Una cuenta por turno**, nunca varias juntas |

La diferencia entre la fila 2 y la 3 es objetiva, no de criterio: NIT, dominio o teléfono
coincidiendo es evidencia dura. Un nombre parecido no lo es, por alto que sea el puntaje. Cruzar
482 páginas contra 476 cuentas por nombre dio 166 falsos positivos de un lado y 160 del otro.

Lo que **no** se hace nunca: llegar a preguntar sin haber corrido los pasos 1 y 2. Si la
pregunta se puede responder mirando la página o corriendo `buscar_empresa`, no es una pregunta,
es trabajo sin hacer.

**Enlazar no es fusionar.** Enlazar es página ↔ cuenta, uno a uno, y es mecánico. Fusionar es
afirmar que dos cuentas son la misma empresa, y esa decisión nunca la toma una tool: ya metió a
Fibermax, que era cliente, dentro de Fibermat, que era prospecto. Si Notion tiene dos páginas de
lo que parece la misma empresa, se enlazan a dos cuentas y la relación se expresa con
`opera_bajo_id`, sin destruir nada.

Si la cuenta se crea sin NIT y el NIT aparece después, se corrige con `reasignar_nit`. No se
crea otra cuenta ni se toca la base a mano.

## Playbook 2: cambió el estado o el owner en Notion

Se alinea la base sin preguntar, porque Notion manda en los dos campos.

- Estado: `mover_estado` con **`origen: 'notion'`**. Ese parámetro es lo que evita el rebote
  Notion → base → Notion, que escribiría sobre el CRM de otra persona un valor que ya tenía.
- Owner: `actualizar_empresa`.

## Playbook 3: desapareció una página de Notion

**No se hace nada.** No se recrea la página y no se borra la cuenta, nunca. Si alguien la
eliminó, fue por algo.

La cuenta se queda en la base con su historia. Vuelve a aparecer en Notion cuando se le registre
un toque, que es el momento en que vuelve a ser trabajo real. Caso vivo: TELNET ISP S.A.S.
(`900858516`), que está en el embudo y cuya página ya no existe entre las de Notion.

## Playbook 4: se registró un toque de una empresa que no está en Notion

Se detecta y se reporta con el nombre, el id y lo que se sepa de ella. **Crear la página en
Notion requiere aprobación explícita**, porque es escribir en el CRM.

## Playbook 5: subir a Notion lo que nació en la herramienta

Los toques, el brief y las reuniones se generan en la herramienta y hay que llevarlos a Notion.
No es automático y no debe serlo mientras no se conozcan todos los casos: lo dispara Sebastián a
través de Claude, una vez al día o por evento.

Para saber **qué** subir no hace falta revisar el pipeline entero: la base sabe qué se tocó
(`empresa.updated_at` tiene trigger, `toque` tiene fecha, y está el outbox).

## Cómo cuadrar el pipeline completo

Ver `docs/reconciliacion-notion.md`. En corto: se empieza por `embudo` (ocho números en una
llamada), se compara contra Notion, y solo donde no cuadre se bajan las listas. **Se cruza
siempre por `notion_page_id`, nunca por nombre.**

Y el criterio de éxito no es que los totales empaten: es que toda página de Notion tenga su
cuenta enlazada. Un delta pequeño es correcto y esperable, porque el embudo cuenta empresas
económicas (una filial se cuenta dentro de su matriz) y Notion cuenta páginas. Ver
`docs/base-de-produccion.md`.
