# Discovery, brief y toques que se hidratan solos — Design

Estado: v1 (2026-07-15). Pendiente de implementar.

## Problema

Sebastián abre la ficha de una cuenta en cierre y el panel derecho le muestra un checklist de
calificación con "Cómo hacen el recaudo" marcado como PREGUNTAR. Eso es una pregunta de
prospección, no de cierre, y ahí estorba.

La causa no es que alguien decidiera mal. Es que la tool no tiene otra cosa que mostrar.

Diagnóstico verificado en el código (2026-07-15):

1. `CAMPOS_CALIFICACION` en `app/core/calificacion.ts:8` es una constante fija. El panel pinta
   los mismos cuatro campos en cualquier etapa.
2. `recaudo` es un item zombi. `calificar()` lo recibe hardcodeado en `null` desde
   `app/llamada/[id]/page.tsx:106` porque no hay columna en `empresa`, y
   `CalificacionChecklist` lo excluye a propósito de los campos editables
   (`app/llamada/[id]/CalificacionChecklist.tsx:19`). Siempre dice PREGUNTAR, nunca se puede
   llenar, nunca cambia de estado.
3. **Notas Discovery es escritura ciega.** El campo existe en el puerto (`app/core/ports/sync.ts:12`),
   el adapter lo mapea a la propiedad de Notion (`app/adapters/notion.ts:30`) y el repo lo encola
   al outbox (`app/db/repository.ts:1011`), pero **no hay columna `notas_discovery` en `empresa`**.
   La tool las manda a Notion y las olvida: no las puede leer de vuelta ni pintarlas.
4. Corolario: como no hay copia local, `app/adapters/notion.ts:30` manda `rich_text` completo, o
   sea **pisa** las Notas Discovery en cada sync. El protocolo del CRM dice que los facts "se le
   van agregando a medida que se sabe más". Hoy se reemplazan.
5. **El resumen de Granola no se cachea.** `toque` guarda `transcript_id` y `transcript_url` (el
   puntero) pero no el texto. Anotado como deuda en `app/llamada/[id]/page.tsx:57`. El CLAUDE.md
   lo pide explícitamente ("arma el toque + puntero + resumen cacheado") y la columna nunca se creó.
6. **`pedirBorradores()` es código muerto.** `app/core/borradores.ts:47` produce exactamente
   `notasDiscovery`, `quePaso`, `brief`, `proximoPaso`, con tests que pasan y **cero callers**.
   Está muerta porque le falta el insumo (`resumenCacheado`, columna inexistente) y el destino
   (`brief` y `notasDiscovery`, columnas inexistentes).
7. **Dos funciones solapadas.** `borradores.ts` (desde el resumen de Granola) y
   `estructurar-toque.ts` (desde el dictado) producen ambas `notasDiscovery` y `quePaso`, con
   prompts que se contradicen: una pide "dos o tres oraciones", la otra "una o dos". Se
   escribieron sin saber la una de la otra.

O sea: el motor está escrito y desconectado. Faltan las columnas y el cableado.

## El modelo (calcado de Notion)

La referencia es la página IPCOM SISTEMAS del pipeline real, leída el 2026-07-15. Tiene cuatro
niveles de detalle, cada uno en su sitio:

| Nivel | Qué es | Dónde vive en Notion |
|---|---|---|
| Notas Discovery | facts crudos, cifras, sin narración | campo de la ficha |
| Qué pasó | telegráfico, ~160 caracteres, para escanear la tabla | fila de "Toques hechos" |
| Conclusión | veredicto narrado de esa llamada | subpágina de resumen |
| Transcript | la llamada entera de Granola | subpágina de resumen |

Ejemplo real de "Qué pasó" (IPCOM, 19-jun): "Conectó (larga). No fit: sin cartera, usa
Wompi+PayU, ya usa OnePay para pagar a un proveedor. Objeción: modelo (plan+fijo vs
pago-por-uso). No agendó".

Ejemplo real de Notas Discovery (dictado por Sebastián como referencia de forma): "10.000
usuarios. Pasarela Epayco, con caídas y errores sobre todo en días de pago. ~40-50% pagos
digitales hoy. Factura el 1; cortes 10, 15 y 20. ~50% paga del 1 al 5; 10-15% llega a corte;
~3% no vuelve. 8 personas (una por zona) validan pagos y apoyan cartera; 1 lleva la
trazabilidad. Cartera ~20% en un municipio, ~200 personas, se repite cada mes. ~80% en algunas
sedes paga en efectivo. CRM Wispro (piden integrar también Sigo). Sin herramienta de mensajería
activa. Karen (contadora) pide conciliación bancaria automática en tiempo real. Referidos por
directores de WeHop. Pidieron cobro de prueba."

**El recaudo está adentro de las Notas Discovery.** No es hermano de usuarios/CRM/pasarela: es
uno de los facts. Ese es el error de categoría que produce la tarjeta rara.

## Decisiones cerradas con Sebastián (2026-07-15)

1. **No hay dos modos.** Calificación y discovery son lo mismo: un proceso continuo de
   acumulación. "A veces saco un montón, otras veces solo lo mínimo. Depende." El panel es uno
   solo y se densifica conforme el deal avanza.
2. **La etapa no decide nada. Decide el dato.** En un lead el panel es corto porque no hay data,
   no porque una regla lo esconda. No se ramifica por `estado_notion`.
3. **El recaudo desaparece como campo.** Es un fact dentro de Discovery. No queda casilla, ni
   PREGUNTAR, ni línea de guion. Se dicta y cae solo.
4. **`que_paso` se queda telegráfico.** No se alarga. Es lo que hace escaneable la tabla.
5. **Brief: uno por cuenta, que se hidrata cada vez más.** No es por toque y no se pisa: crece.
6. **Notas Discovery: la IA fusiona, Sebastián aprueba.** Lee las notas actuales más los facts
   nuevos y propone la versión fusionada (agrega lo nuevo, actualiza cifras que cambiaron, no
   duplica), como borrador editable antes de guardar.
7. **La tool es donde se lee.** El historial expandible vive en el cockpit. Notion sigue
   recibiendo por outbox.

## Diseño

### Los dos caminos convergen

```
Granola (resumen cacheado)  ─┐
                             ├─→ un solo borrador aprobable ─→ Sebastián corrige ─→ guarda
Dictado de Sebastián        ─┘
```

Hoy son dos schemas distintos (`borradorToqueSchema` y `toqueEstructuradoSchema`) que se
solapan. Se unifican en uno. Entra Granola o entra la voz, sale lo mismo.

### Dónde cae cada campo

| Campo | Destino | Estado |
|---|---|---|
| `transcriptResumen` | `toque.transcript_resumen` | columna nueva (la que pide el CLAUDE.md) |
| `resumen` | `toque.resumen` | columna nueva, el resumen propio de la tool de esa llamada |
| `quePaso` | `toque.que_paso` | existe, telegráfico, sin tocar |
| `notasDiscovery` | `empresa.notas_discovery` | columna nueva, fusionada |
| `brief` | `empresa.brief` | columna nueva, hidratada |
| `proximoPaso` | `empresa.proximo_paso` | existe |

**Por qué dos columnas de texto en `toque` y no una.** `transcript_resumen` es el **insumo**: lo
que devolvió Granola, guardado tal cual. `resumen` es el **producto**: lo que la tool escribió a
partir de ese insumo. Se separan por dos razones concretas:

- Sin el insumo no se puede regenerar el producto. Cuando el prompt cambie (y va a cambiar: hoy
  mismo hay dos prompts contradictorios), regenerar los resúmenes viejos exige tener de qué. Si
  solo se guarda el producto, hay que volver a pedirle a Granola con credencial, para toques de
  hace meses que quizá ya no estén.
- Es lo que pide el CLAUDE.md: "la key vive server-side; el consumidor (CRO/MCP) lee el cacheado
  sin credencial". El consumidor lee `transcript_resumen` sin tocar Granola.

En un toque dictado (sin grabación) `transcript_resumen` queda null y `resumen` se arma del
dictado. Los dos caminos llenan `resumen`; solo Granola llena `transcript_resumen`.

### Dos registros por cuenta que acumulan

La diferencia entre ellos es de naturaleza, no de alcance:

- **`notas_discovery`**: facts crudos, cifras, cero narración.
- **`brief`**: la narrativa del estado de la cuenta.

Los dos crecen con cada llamada. Los dos tienen contenido previo que se puede destruir, así que
los dos van por fusión con aprobación. Son dos prompts distintos con la misma forma:
`(actual, insumo, ia) => propuesta`.

### El core

Funciones puras, sin DB ni Notion, testeables solas:

- `fusionarDiscovery(notasActuales, factsNuevos, ia): Promise<string>` — agrega lo nuevo,
  actualiza cifras contradichas, no duplica.
- `hidratarBrief(briefActual, toqueNuevo, ia): Promise<string>` — enriquece la narrativa.

Ninguna de las dos escribe. Devuelven una propuesta que la UI muestra como borrador editable.

### La UI

Un panel "La cuenta", mismo en lead y en cierre:

- **Datos duros** — usuarios, CRM, pasarela. Fila compacta. Los que faltan se ven apagados, sin
  el teatro de PREGUNTAR. Siguen editables inline como hoy.
- **Discovery** — los facts acumulados. Vacío en un lead recién llamado, denso en un cierre.
- **Toques** — la tabla telegráfica. Cada fila se abre y muestra el resumen de esa llamada más
  el link a Granola si lo hay.

`CAMPOS_CALIFICACION` pierde `recaudo` y queda en los tres imprescindibles que el protocolo del
CRM ya nombra: usuarios, CRM/Software, pasarela actual.

## Riesgos

**La fusión es la única parte con riesgo real.** Es la primera vez en este repo que la IA
reescribe un campo que ya tenía contenido, en vez de proponer uno vacío. Si alucina, no agrega
basura: **borra facts que costaron llamadas**.

Mitigaciones:
- Nunca va directo al outbox. Borrador aprobable, siempre.
- El core es puro y el test que importa es "los facts viejos que no se contradicen sobreviven".
- La fusión no puede devolver algo más corto que lo que entró sin que la UI lo marque.

**Segundo riesgo: la constitución contradice la práctica.** El CLAUDE.md dice "trae el RESUMEN
(no el transcript literal)". IPCOM tiene el transcript literal completo pegado. Este spec cachea
un resumen propio de la tool, no el literal, así que respeta el CLAUDE.md. Si Sebastián quiere
el literal después, es otro spec y hay que corregir el CLAUDE.md primero.

## Verificación pendiente antes de implementar

Los conteos de este análisis (204 de 234 toques con `que_paso` de menos de 80 caracteres) salen
de la DB del Mac. Según `2026-07-14-split-pre-post-reunion-design.md`, **la fuente de la verdad
es `/data/isps.db` en el VPS**, no la del Mac. El diagnóstico se sostiene porque la causa es
código (el prompt pide "una o dos oraciones", igual en las dos DBs), pero **los números hay que
reverificarlos contra producción antes de migrar**.

## Fuera de alcance

- Cambiar `que_paso` a texto largo. Se queda telegráfico.
- Cachear el transcript literal de Granola.
- Brief por toque. Es por cuenta.
- Sync de dos vías. Nadie edita Notion a mano; sigue siendo DB hacia Notion.
- Tocar la lógica de la cola (`colaDelDia`). Eso es el spec del 14-jul.
- Ramificar la ficha por `estado_notion`.

## Criterio de aceptación

1. Abrir una cuenta en cierre no muestra "Cómo hacen el recaudo" en ninguna parte.
2. Dictar un toque que menciona el recaudo hace que ese fact aparezca en Discovery sin que
   Sebastián teclee en un campo aparte.
3. Un segundo toque con facts nuevos no borra los del primero.
4. Un segundo toque hidrata el brief de la cuenta sin perder lo que ya decía.
5. Ni la fusión ni la hidratación escriben sin que Sebastián apruebe el borrador.
6. Abrir un toque del historial muestra el resumen de esa llamada.
7. Un lead recién llamado y una cuenta en cierre usan el mismo panel: cambia la densidad, no la
   estructura.
8. `pedirBorradores()` tiene callers, o se borra.
9. Las Notas Discovery que salen al outbox son la versión fusionada aprobada, no un pisón.
