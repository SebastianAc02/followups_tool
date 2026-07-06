# Campañas: reforma del front de cadencias

Fecha: 2026-07-06
Estado: borrador para revisión de Sebastián
Rama base: fase4-cadencias (backend de Fase 4 ya construido, sin mergear)

## Problema

La funcionalidad de cadencias que existe hoy no refleja el flujo real de trabajo.
Hoy hay: subida de cadencia (CSV/markdown), vista calendario del motor de fechas,
y un formulario de toque genérico. Pero al hacer un toque con canal correo no sale
nada: ni el copy que corresponde, ni en qué día de la cadencia va el lead. El
concepto contenedor (Campaña) no existe en la UI.

## Visión

Campaña es el contenedor de primer nivel. Una campaña pasa por 4 momentos:

```
Campaña
 1. Segmento    filtros estilo Apollo sobre la base (tiers por usuarios, on hold, etc.)
 2. Revisión    lead por lead: "esta no va" la saco, el resto continúa
 3. Cadencia    subo markdown, sale JSON: canal, copy, [corchetes], firma Apollo si/no
 4. Ejecución   el toque me dice qué canal toca, en qué día va el lead, y me muestra
                EL copy de ese día. Personalizo o no. Batch para tiers sin personalización.
```

Enfoque: front primero. El backend de segmentación y campañas ya existe y se
conecta a lo real. Se mockea solo lo que no existe (envío real por Apollo).

## Qué ya existe y se reutiliza (no se reescribe)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Filtros de segmento | `app/db/repository.ts` (empresasDeSegmento, contarSegmento, guardarSegmento) | Lista cerrada de campos filtrables validada con Zod: estado, categoria, estado_comercial, prioridad, es_cliente, ciudad, owner |
| Campaña e inscripción | `app/db/repository.ts` (crearCampana, inscribirCampana, inscripcionesBloqueadas) | Crea campaña (cadencia + segmento), inscribe empresas, bloquea las que no tienen email |
| Motor de fechas | `app/core/motor-cadencia.ts` | Calcula en qué paso va un lead desde sus toques reales (re-anclaje, días bloqueados, anti-burst). Estado derivado: no se guarda, se calcula |
| Parser de cadencia | `app/core/cadencia-parser.ts` | Markdown/CSV a pasos (orden, dia_offset, canal). Se extiende, no se reemplaza |
| Copy por paso | tabla `version_paso` (asunto, cuerpo, es_default, peso) | Ya soporta versiones de copy por paso (base para iteración/batch) |
| Toque | `app/llamada/[id]/CaptureForm.tsx` + registrarToque | Formulario de toque con 4 resultados, KDM, próximo follow-up |

## Qué es nuevo

### Parte 1: Segmento con tiers
- UI de filtros estilo Apollo: agregar condiciones desde la lista de campos
  permitidos, con conteo en vivo de cuántas empresas matchean.
- Capacidad nueva de dominio: rango numérico por cantidad de usuarios
  (ej: 3.000 a 10.000 usuarios = tier 1). Hoy la lista cerrada no filtra por
  usuarios. Se agrega un operador `entre` sobre un campo virtual `usuarios`
  respaldado por `empresa_usuarios.usuarios_estimados`, manteniendo la lista
  cerrada y validada por Zod. Nada de SQL libre.
- Guardar el segmento con nombre (ya existe guardarSegmento).
- Puerta abierta (NO en v1): Claude traduce lenguaje natural a estas mismas
  condiciones cerradas. Por eso la lista se mantiene cerrada: el filtro con IA
  produce condiciones validables, nunca SQL.

### Parte 2: Revisión de leads
- Pantalla con la lista de empresas del segmento. Cada una se puede sacar
  ("esta no va") antes de crear la campaña.
- El resultado es un set curado: las excluidas quedan registradas como
  exclusiones de esa campaña (a priori, no entran a la inscripción).
- Decisión: la revisión pasa ANTES de inscribir. inscribirCampana solo inscribe
  aprobadas. El rechazo no ensucia la campaña con inscripciones muertas.

### Parte 3: Crear campaña + cadencia con copy
- Flujo de creación: nombre de campaña, segmento curado, y subida del markdown
  de cadencia.
- Parser extendido: del markdown sale un JSON por paso con:
  - canal (correo, llamada, whatsapp)
  - dia_offset
  - asunto y cuerpo (copy)
  - variables de personalización detectadas: los `[corchetes]` del copy
  - firma Apollo: sí o no
- El JSON se muestra para revisar y corregir antes de guardar. El copy se
  persiste en `version_paso`; el flag de firma y las variables se agregan al
  modelo (columna nueva en version_paso o metadata del paso, se decide en el
  plan de la Parte 3).
- Al confirmar: crearCampana + inscribirCampana sobre el set curado. Las
  bloqueadas (sin email) se muestran con su cola de resolución.

### Parte 4: Toque cadencia-aware
- La cola de trabajo separa por canal: "estos están para llamada, estos para
  correo", derivado del paso debido de cada inscripción (motor + pasos de la
  cadencia de su campaña).
- Al abrir el toque de un lead inscrito:
  - Se muestra en qué día de la cadencia va (paso debido) y qué días ya fueron
    tocados (historial de toques de la campaña).
  - Si el paso es correo: se renderiza EL copy de ese paso (version_paso),
    con las `[variables]` resaltadas.
  - Pregunta única: personalizar o no. Si personaliza, edita el texto para ese
    lead. Si no, va tal cual.
  - El envío real NO existe aún (Fase 5, Apollo). El toque registra el correo
    como toque (canal=correo) y deja el texto final listo; el botón de enviar
    queda mock con estado "pendiente de envío".
- Registrar el toque avanza al lead solito: el motor deriva el siguiente paso
  desde el toque recién registrado. No hay contador manual que actualizar.

### Parte 5: Batch sin personalización e iteración de copy
- Para pasos sin personalización: vista batch que dice "estos N leads reciben
  este correo mañana, quieres cambiarlo o no".
- Editar el copy ahí lo cambia para todos los leads que aún no reciben ese paso
  (nueva versión en version_paso; los ya enviados no se tocan).
- Confirmar el batch registra los toques de todos de una (envío real sigue mock).

## Decisiones de arquitectura

1. **Set curado antes de inscribir.** La revisión de leads produce exclusiones
   por campaña; inscribirCampana recibe solo aprobadas. Alternativa descartada:
   inscribir todo y marcar rechazadas (ensucia el estado de la campaña).

2. **Lista cerrada de filtros se mantiene y crece.** El filtro por usuarios
   entra como operador `entre` sobre campo virtual `usuarios`, no como SQL
   libre. Consistente con la regla de arquitectura (acceso a datos solo por
   Repository, sin SQL regado).

3. **Dos niveles de estado, tratados distinto:**
   - Ciclo de vida de la inscripción (activa, bloqueada, finalizada): hoy es
     informal (strings + updates sueltos). Se formaliza con un state machine
     ligero en el core: transiciones explícitas y validadas, un solo lugar que
     dice qué cambios de estado son legales. Aquí hay una decisión de diseño
     que escribe Sebastián (learning mode): la tabla de transiciones.
   - Posición en la cadencia (en qué día/paso va): NO se guarda como estado.
     El motor la deriva de los toques reales. Se mantiene así a propósito:
     estado derivado no se desincroniza. "Sigue solito" porque registrar el
     toque ES avanzar.

4. **El copy del día = motor + version_paso.** El toque llama a
   proximoPasoDebido(lead) para saber el paso, y trae el version_paso default
   (o el que gane por peso) como copy. Es el puente que hoy falta; no hay motor
   nuevo.

5. **Envío real fuera de alcance.** Apollo (EnvioAdapter) es Fase 5. Aquí el
   envío es mock: el toque de correo queda registrado con su texto final y
   estado pendiente. Cuando llegue el adaptador, consume eso sin rehacer el front.

## Capas (regla no negociable del proyecto)

- Core: extensión del parser (markdown a JSON con variables y firma), state
  machine de inscripción, motor sin cambios. Cero imports de DB/Next/Apollo.
- Repository: operador `entre`, exclusiones de campaña, copy con firma/variables,
  consultas de cola por canal.
- UI: páginas nuevas bajo `app/campanas/` (segmento, revisión, creación, cola,
  batch). Solo llama server actions que llaman al Repository.

## Fuera de alcance (explícito)

- Envío real por Apollo y tracking (Fase 5).
- Filtro por lenguaje natural con Claude (puerta abierta, no v1).
- Scoring, multipersona en UI, cadencia automática de fondo (constitución v1).

## Orden de ejecución

Cada parte tendrá su propio plan detallado antes de tocar código, y se revisa
con Sebastián antes de ejecutar:

1. Parte 1: Segmento con tiers (filtros + rango usuarios + conteo vivo)
2. Parte 2: Revisión de leads (set curado)
3. Parte 3: Crear campaña + parser markdown a JSON con copy
4. Parte 4: Toque cadencia-aware (colas por canal + copy del día)
5. Parte 5: Batch e iteración de copy

Cada parte cierra con sus pruebas (regla del proyecto: sin pruebas no está
lista) y un checkpoint de learning mode donde aplique decisión real de dominio
(Partes 1, 3 y 4 seguro; 2 y 5 son mayormente mecánicas).
