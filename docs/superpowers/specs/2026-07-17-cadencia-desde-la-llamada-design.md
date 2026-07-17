# Control de cadencia desde la llamada

Fecha: 2026-07-17
Owner: Sebastián

## El problema

Después de llamar, Sebastián no tiene forma de sacar a una cuenta de la cadencia sin irse a
la pantalla de Destinatarios de la campaña. La decisión ("esta ya no, sáquenla" vs "que siga")
se toma colgando el teléfono, no navegando.

"Seguir en la cadencia" **ya funciona y no lleva código**: `registrarToqueAction` marca el paso
activo como `enviada` y el motor re-ancla el siguiente paso con la fecha real. Lo que falta es
la salida, y la vuelta.

## Alcance

- Botón "Sacar de la cadencia" en el riel de la secuencia, dentro de la llamada. Suelto: no
  obliga a registrar el toque primero.
- Botón "Volver a meter", solo cuando la baja fue **manual**.
- Fuera: reinscribir en Apollo (hoy no se usa), motivo escrito a mano, sacar en lote.

## La decisión de fondo: el motivo es prosa, el origen es dato

`pausarInscripcion` colapsa hechos distintos en un mismo `estado='pausada'`. Hoy el único
discriminador es `motivo_fin`, texto libre:

| Quién pausa | motivo_fin | origen |
|---|---|---|
| `core/tracking.ts:50` (respuesta Apollo) | `respuesta detectada` | `respuesta` |
| `core/tracking.ts:55` (rebote) | `todos los destinatarios salieron (rebote)` | `rebote` |
| `core/llego-respuesta.ts:106` (respuesta WA) | `respuesta detectada (whatsapp)` | `respuesta` |
| `sacarInscripcionDeCampana` (Destinatarios) | `baja manual desde destinatarios` | `manual` |
| NUEVO: desde la llamada | `baja manual desde la llamada` | `manual` |

Mientras pausar tuvo una sola vía, daba igual. Apenas entra "volver a meter", el botón tiene
que decidir a quién se le ofrece, y decidirlo comparando `motivo_fin === 'respuesta detectada
(whatsapp)'` sería comportamiento colgando de un string en prosa: lo mismo que la constitución
prohíbe cuando dice que `canal` y `transcript_proveedor` son datos, no código.

**Decisión (Sebastián, 2026-07-17):** columna `origen_fin` con valores cerrados
`respuesta` | `manual` | `rebote`. Solo `manual` es reversible.

`rebote` es su propio valor y no "fin natural": el correo no existe, devolverlo a la cadencia
no tiene sentido, pero tampoco es una respuesta ni una decisión humana.

**El parámetro va en la FIRMA, no con un default.** `pausarInscripcion(id, motivo, origen)`
obliga a los 4 sitios a declarar de qué tipo es su pausa. Sin eso, una quinta vía de pausa que
alguien agregue mañana heredaría el default y el botón de reversa se la ofrecería en silencio.
El compilador para eso.

## Arquitectura

- **Migración:** `inscripcion.origen_fin TEXT` nullable. Aditiva: una inscripción activa no
  tiene fin, y las pausadas que ya existen quedan en NULL (ver "Datos viejos" abajo).
- **Core:** `app/core/reinscripcion.ts`, función PURA sin DB, decide si una inscripción admite
  reversa. **La escribe Sebastián** (es negocio, no boilerplate).
- **Puerto:** `PushDeps.pausarInscripcion` y `RespuestaEntranteDeps.pausarInscripcion` suman el
  tercer parámetro. El core sigue sin conocer la DB.
- **Repository:** `reactivarInscripcion(id)` limpia `estado`/`motivo_fin`/`fecha_fin`/`origen_fin`.
- **Lectura:** `ContextoToque` suma `inscripcionActiva: { idInscripcion, idCampana, estado,
  origenFin } | null`. Hoy expone `secuencia` e `idPasoInscripcionActivo` pero no el id, que es
  justo lo que falta para saber a quién sacar.
- **UI:** los dos botones en `SecuenciaRail.tsx`, que ya dibuja la cadencia en la llamada.

## Datos viejos

Las inscripciones pausadas de antes de la migración quedan con `origen_fin = NULL`. NULL **no
es reversible**: no sabemos por qué se pausaron, y ofrecer la reversa sobre una que se cortó por
respuesta es el error que este diseño existe para evitar. En prod hoy hay 0 inscripciones, así
que el caso es teórico, pero la regla queda escrita.

## Apollo

`sacarContactoDeCampanaAction` ya llama a Apollo solo `if (datos?.proveedorCampanaId &&
datos.email)`. Sin secuencia externa, `proveedorCampanaId` es NULL y se lo salta. No hay que
tocar nada para el caso "sin Apollo": la pausa local siempre ocurre y Apollo solo se toca si de
verdad hay algo allá que cortar. Mismo aislamiento que `llego-respuesta.ts`: si Apollo falla, el
corte local no se revierte.

## Pruebas

- Core: la regla de reversa (la de Sebastián) con su tabla de casos.
- Repository: `reactivarInscripcion` deja la inscripción `activa` y limpia los campos de fin;
  `pausarInscripcion` graba el `origen_fin` que le pasan.
- Los 4 sitios existentes siguen verdes con el parámetro nuevo.
