# Spec Fase 7 · Panel de actividad (admin, solo lee)

Diseño validado con Sebastián el 2026-07-06. Refina F2 de `funcionalidades-v2.md` con el
norte real (throughput, no pérdida). Esta es la fase que cierra el alcance v2. El insumo
completo (QUÉ) sigue siendo F2; este doc fija el CÓMO y cierra las decisiones abiertas.

## Qué es

Una ruta nueva (`/panel`) visible solo con `session.admin === true`. Muestra el pulso de
actividad del equipo desde datos que YA existen en `isps.db`. No agrega tablas, no escribe,
no toca el core de dominio. Es la unica fase que solo lee.

Diferencia de altura respecto a la cola del dia: la cola es para el que opera una llamada;
el panel es para ver si el motor comercial esta andando, desde arriba.

## El norte (reformulado)

El KPI original de F2 era defensivo: follow-ups perdidos por semana. Sebastian lo reformulo
a ofensivo: **estamos tocando suficiente**. Mide actividad, no fuga.

- **Toques hechos ayer.** Conteo de `toque` con `fecha` = ayer.
- **Promedio diario de toques (forecast del ritmo).** Definicion cerrada abajo.

La comparacion ayer-vs-promedio de un vistazo es el pulso: si ayer estuvo por encima del
promedio, el ritmo sube; por debajo, baja.

### Definicion cerrada de `promedioDiarioToques()`

Decidida por Sebastian. No es un promedio movil de calendario; es esfuerzo real sobre un
denominador fijo:

1. **Ventana** = los ultimos 7 dias habiles (lunes a viernes) anteriores a hoy. Se retrocede
   en el calendario saltando fines de semana al contar los 7 dias habiles, asi que si hay un
   sabado/domingo en medio la ventana se estira en fechas pero sigue siendo 7 dias habiles.
2. **Numerador** = todos los toques registrados dentro de ese rango de fechas, incluidos los
   de sabado/domingo si los hay. El fin de semana es bonus: suma, nunca diluye.
3. **Denominador** = 7, fijo, siempre.

Por que asi y no calendario puro: si el fin de semana contara como dia en el denominador, un
sabado sin trabajar (normal, no un fallo) bajaria el promedio como si fuera un mal dia. Esta
regla mide esfuerzo, no penaliza descanso. Trabajar un fin de semana solo puede subir el
numero.

Ejemplo (hoy martes): ventana = lunes de ayer hasta el lunes de la semana pasada (incluye el
fin de semana entre medio). Si trabajaste el sabado, esos toques entran al numerador sin
agregar un octavo dia al denominador.

## Alcance

### Entra ahora (data ya existe)

Todo sale de tablas que Fases 1 a 4 ya dejaron pobladas.

- **Norte:** toques ayer, promedio diario (definicion de arriba).
- **Actividad:** leads distintos tocados por dia (empresas distintas con `toque`), toques por
  canal, toques por tipo.
- **Cadencias/campanas:** campanas activas (`campana.estado`), inscripciones corriendo
  (`inscripcion.estado='activa'`), empresas por cadencia.

### Se difiere de verdad (marcado, sin UI muerta)

Solo esto queda fuera, y el spec anota donde enchufa para no reconstruir:

- **Envio/tracking real y reply-rate** (Fase 5: `paso_inscripcion`, `evento_tracking`).
- **Metricas de IA** (Fase 6: borradores, aprobaciones).

No se construyen placeholders vacios. Cuando esas fases cierren, se agregan sus tiles como
cambio aditivo.

## Arquitectura

- **Las agregaciones viven en el Repository.** Cada KPI es un metodo de lectura nuevo en
  `app/db/repository.ts`, con su definicion de negocio encapsulada. La constitucion se cumple
  sin esfuerzo porque solo lee: no mete dependencias externas hacia el core, y el acceso a
  datos sigue pasando solo por el Repository (nada de SQL regado por la UI).
- **La regla de negocio no vive en la UI.** La tentacion es meter "que cuenta como toque de
  ayer" o el calculo del promedio en el Server Component. Eso lo haria intesteable y regaria
  dominio en la capa de presentacion. En cambio, la UI consume numeros ya calculados. Asi
  V7.1 (queries con prueba) y V7.2 (UI) quedan como el desglose original ya anticipaba.
- **Gate por pagina, patron de Fase 2.** La ruta valida `session.admin` en la pagina (y en el
  layout por si acaso), sin middleware. Sin el flag, la ruta no existe (404/redirect, mismo
  criterio que el resto del gate de sesion).
- **Server Component que llama al Repository y pinta.** Sin estado cliente salvo lo minimo
  para interaccion (si la hay). Fetch en el servidor, render directo.

## La superficie (UI)

Dashboard de una pantalla:

- Arriba y grande: toques ayer junto al promedio diario (el pulso de un vistazo).
- Fila de actividad: leads tocados por dia, toques por canal, toques por tipo.
- Fila de cadencias: campanas activas, inscripciones corriendo, empresas por cadencia.

Superficie nueva grande, asi que al construir V7.2 se suma `taste-skill` + `impeccable` +
`frontend-design` (regla del orquestador para paneles nuevos).

## Pruebas

Cada query con prueba contra datos sembrados de resultado conocido (lo que V7.1 ya pedia). El
filo esta en las definiciones exactas: para sembrar un caso y afirmar el numero, la ventana
del promedio y el corte de "ayer" tienen que ser deterministas. La prueba del promedio siembra
toques en dias habiles y en un fin de semana dentro de la ventana, y afirma que el denominador
sigue siendo 7 y que el fin de semana sumo al numerador.

## Paralelismo (como corre junto a Fase 5)

- **Nace de `fase4-cadencias`, no de `main` pelado.** El panel lee tablas de cadencia/campana
  que Fase 4 creo; esa rama ya esta cerrada (V4.8). Rama nueva `fase7-panel` desde ahi.
- **Cero conflicto con Fase 5.** Fase 5 escribe envio/tracking (`paso_inscripcion`,
  `evento_tracking`, `EnvioAdapter`); el panel no toca nada de eso. El unico solape posible es
  `planning/`, que se resuelve trivial. Se construye, prueba y mergea independiente del avance
  de Fase 5.

## Invariantes que respeta

- Solo lee: ninguna escritura, ningun outbox, ninguna tabla nueva.
- El core nunca importa adaptadores (aqui ni siquiera hay adaptador nuevo).
- Acceso a datos solo por Repository.
- Gate de sesion: sin `admin`, no hay ruta.

## Demo de cierre

Entro como admin y veo el pulso de la semana: cuantos toques hice ayer contra mi promedio,
cuantos leads toque, por que canal, y que campanas estan corriendo. Sin el flag admin, la
ruta no existe.
