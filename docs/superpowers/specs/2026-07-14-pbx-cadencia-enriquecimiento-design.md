# Cadencia PBX (enriquecimiento del decisor) — Design

Estado: APROBADO EN CONVERSACION (2026-07-14, Sebastián). Pendiente de convertir el esqueleto
en implementación. El plan concreto vive en `planning/plan-pbx-cadencia-enriquecimiento.md`.

## Problema

Toda cadencia de hoy asume que existe un canal directo al decisor: correo, WhatsApp o teléfono
de una persona con la que se avanza el negocio. Falta el caso más común del trabajo en frío real:
la empresa no tiene un Key Decision Maker (KDM) alcanzable. Lo único que hay es un número público
de oficina (un conmutador). A eso Sebastián lo llama estado **PBX** (public phone number).

En PBX el objetivo no es avanzar el negocio, es **conseguir el dato**: el método directo del
decisor (su teléfono, su WhatsApp, su correo) o su nombre. El flujo real que Sebastián ejecuta a
mano:

1. Llama al conmutador. Normalmente le dicen "manda un correo" o "habla con X persona".
2. Manda el correo y espera un par de días.
3. Si no responden, vuelve a llamar.
4. Dos llamadas sin dato: busca el número por otra vía (referido, otra persona).
5. Cuando consigue el método directo del KDM, deja de estar en PBX y entra a la cadencia comercial
   normal.

La herramienta debe absorber ese trabajo: saber cuándo una empresa está en PBX, proponer el
próximo paso, agendarlo, contar los intentos y graduar la cuenta cuando se consigue el dato.

## Contexto verificado (código real)

- `contacto.esKeyDecisionMaker` (INTEGER, default 0) ya existe en `app/db/schema.ts:44`, junto con
  `cargo` y `cargoCategoria`. La herramienta ya sabe cuáles contactos son decisores.
- **Bug latente que valida el diseño:** `canalesDisponibles` (`app/core/canales-empresa.ts:12`)
  recorre TODOS los contactos y basta que cualquiera tenga teléfono para marcar la empresa con
  canal `llamada` + `whatsapp`. No mira si ese teléfono es del KDM o de la recepción. Por eso hoy
  una empresa que solo tiene el conmutador se ve como "lista".
- `empresa.proximoPaso` + `proximoCanal` + `proximoFollowUpFecha` ya son columnas del schema y la
  cola (`app/cola/agenda.ts`) ya las lee. El próximo paso del bucle PBX monta sobre esa
  infraestructura, no crea una cola nueva.
- `IAPort.generar<T>(prompt, schema)` (`app/core/ports/ia.ts`) es el puerto genérico de IA. Cada
  caso de uso arma su prompt + schema Zod y llama `generar()`; el puerto nunca vuelve a crecer. El
  paso de IA de PBX es una función de core más, con el mismo patrón que `estructurar-toque.ts`.
- La readiness por-empresa la consumen `inscripcion.ts`, `preview-inscripcion.ts` y
  `repository.ts`. Cambiarle la semántica afecta la inscripción de campañas: por eso la corrección
  KDM-aware entra como variante nueva usada solo por PBX (ver Fuera de alcance).

## Decisiones cerradas con Sebastián (2026-07-14)

1. **PBX es un estado derivado, no una etiqueta manual.** La herramienta lo calcula: una empresa
   está en PBX cuando no hay un contacto KDM alcanzable por su método directo
   (teléfono/WhatsApp/correo del KDM).
2. **El bucle es abierto, guiado por resultado, un paso a la vez** (no una cadencia fija tipo
   campaña). La herramienta guarda un solo dato: el próximo paso. Se cierra un toque, se describe
   qué pasó (libre), la IA propone la siguiente forma de paso + datos nuevos, Sebastián aprueba o
   sobreescribe. Patrón borrador -> aprobar de CLAUDE.md.
3. **Listo para lo imprevisto.** El resultado del toque es abierto (texto libre o resumen de
   Granola). La IA lo mapea a un vocabulario chico y estable de "formas de próximo paso"; siempre
   hay una salida "yo decido el próximo paso" en texto libre. La estructura no encierra el caso
   raro ("hable con Andrea de compras").
4. **El número del conmutador vive como contacto de oficina (no-KDM).** Si existe -> el primer paso
   es "llamar al conmutador" con el número a la mano. Si no existe -> el primer paso es "conseguir
   el número".
5. **Escalar se sugiere, no se fuerza.** El umbral es caso a caso. Cuando el bucle se estanca
   (varios toques sin dato nuevo) la herramienta propone escalar (referido / otra vía), pero
   Sebastián decide.
6. **El estado terminal exitoso es graduarse:** conseguir el método directo del KDM, registrarlo
   como contacto KDM, y la empresa deja PBX y entra a la cadencia comercial normal.
7. **AI en el paso, sí; AI para buscar el número solo, después.** Interpretar el resultado y
   proponer el próximo paso entra en v1. Buscar el número del conmutador con IA/búsqueda queda como
   futuro.

## Diseño

### Vocabulario de "formas de próximo paso" (estable, chico)

`llamar_conmutador` · `conseguir_numero` · `enviar_correo` · `esperar` (N días; si no responden,
recae en llamar) · `hablar_con` (persona referida por el gatekeeper) · `escalar` (referido / otra
vía) · `graduar` (se consiguió el KDM -> sale a la cadencia comercial normal).

### Capas (hexagonal, de adentro hacia afuera)

1. **Core puro — derivación del estado** (`app/core/pbx.ts`): `canalesDisponiblesKDM(contactos)` y
   `estaEnPBX(...)`. Sin DB, sin IA.
2. **Core puro — máquina de estados** (`app/core/pbx.ts`): `proponerSiguientePaso(...)` (resultado
   del toque + datos de la empresa + intentos -> próximo paso propuesto) y `sugerirEscalar(...)`.
   Aquí vive la decisión de dominio (transiciones + heurística de escalar): hueco de Sebastián.
3. **Core con IA** (`app/core/pbx-interpretar.ts`): arma prompt + schema Zod, llama `IAPort`, toma
   el "qué pasó" abierto y devuelve {forma sugerida, datos extraídos (contacto/número/correo/
   nombre), próximo paso, fecha}. La IA propone; nunca escribe DB/Notion.
4. **Persistencia** (`app/db/repository.ts`): el próximo paso aprobado se guarda en las columnas
   que ya existen (`proximoPaso`/`proximoCanal`/`proximoFollowUpFecha`), más el mínimo estado del
   bucle (forma actual + conteo de intentos). Queries: `empresasEnPBX(idOrg)`, `graduarDePBX(...)`.
5. **UI** (`app/cola`, ficha de la cuenta): la cola muestra los toques PBX como un carril propio;
   la ficha muestra el bucle (forma actual, número del conmutador o "conseguir número", intentos) y
   el cierre de toque con IA + botón graduar.

### Cómo monta sobre lo que ya existe

- **Cola:** una empresa en PBX ya aparece por `proximoFollowUpFecha`. Se le agrega distinción
  visual (carril/badge PBX) y el `proximoPaso` textual sale de la forma del bucle.
- **IA:** `pbx-interpretar.ts` reusa el patrón de `estructurar-toque.ts` (prompt + schema + IAPort).
- **Toque:** cada intento PBX se registra como un `toque` normal (canal + que_paso + resultado);
  los intentos se cuentan desde ahí.

## Fuera de alcance (v1)

- **No se cambia la readiness de campañas.** La corrección KDM-aware (`canalesDisponiblesKDM`) la
  usa solo la derivación de PBX. Migrar la readiness de inscripción de campañas a KDM-aware es una
  decisión aparte, con su propio análisis de impacto (afecta `inscripcion.ts`,
  `preview-inscripcion.ts`, `repository.ts`).
- **No se construye búsqueda automática del número** del conmutador (IA/scraping). El paso
  `conseguir_numero` en v1 es una tarea manual que la herramienta agenda y recuerda.
- **No hay métricas de conversión de enriquecimiento** (cuántas empresas pasan de PBX a cadencia).
  Se deja el andamiaje (los toques quedan registrados) para medirlo después.
- **No se sincroniza el estado PBX a Notion** sin revisión (regla de CLAUDE.md).
