# Cockpit de Campañas — Design Spec

Fecha: 2026-07-07 · Rama: fase4-cadencias · Feature: F3 (campañas y cadencias),
la mitad de "creación". La ejecución/tracking (P4/P5) queda para el spec siguiente.

Mockup de referencia: `2026-07-07-cockpit-campanas-mockup-completo.html` (flujo completo,
Claude Design; el primero `...-mockup.html` es la exploración de direcciones).
Dirección elegida: **2A para el flujo de creación + 1C para el dashboard/tarjetas.**

### Refinamientos del mockup completo (2), incorporados al plan
- **Copiloto (IA):** panel lateral en la vista de segmentación, estado BETA. "Describe tu
  segmento" -> botón "Traducir" -> chips "traducido a ..." + "editables a mano abajo". Es el
  contrato `frase -> DefinicionSegmento` (3.1) ya con nombre de producto: Copiloto.
- **Wizard, breadcrumb fijo:** Segmento › Cadencia › Reglas/Destinatarios › Preview › Lanzar.
- **Cadencia con aprobación por toque:** columna "Aprobación"; se marcan los toques a revisar
  antes de enviar (el manual-email de Tier 1, F3.5). "Tu cadencia por pasos" se genera de los
  toques de arriba.
- **Resumen de envío tipo factura:** antes de lanzar, "Vas a inscribir a N contactos ... cada
  uno recibe la cadencia X · K toques en D días. Revísalo como una factura antes de lanzar."
- **Hub con pulso (1C):** "empresas en secuencia hoy · bloqueadas esperando regla", "toques
  esta semana", "tasa de respuesta"; tabs Todas / Activas / Pausada / Borrador. Los dos
  últimos números son tracking (F4): en este spec salen de simulación o quedan como pulso
  placeholder; el dato real llega con el spec de ejecución.
- **Nav global:** Campañas · Contactos · Plantillas · Reportes. Plantillas = librería de
  cadencias reutilizables (reusa `listarCadencias()`); Reportes = tracking, spec siguiente
  (stub). Contactos existe aparte.

---

## 1. Qué es y por qué

El módulo de campañas hoy existe pero está flojo: filtros tipo dropdown, listas planas,
cero preview. Esta feature lo convierte en un cockpit real para armar y lanzar campañas de
outbound sobre la base de ISPs, con dos piezas que no existen: **segmentación tipo Clay**
(lenguaje natural + wall de filtros) y un **preview cinemático** que muestra "así se va a
ver esta campaña en acción" antes de lanzarla.

Reglas heredadas de la constitución (no se rompen): el core no importa Granola/Notion/
Claude/driver de DB; acceso a datos solo por Repository; `canal` es dato, no código;
DB -> Notion una sola vía con revisión humana; textos para humanos en voz-onepay (sin
emojis, sin em dashes, español directo).

## 2. Alcance

**Dentro (este spec):** el cockpit de creación de punta a punta.
1. Hub de campañas rediseñado (dirección 1C).
2. Segmentación: wall de filtros (Apollo) + caja de lenguaje natural (Clay), ambos sobre
   el mismo filtro estructurado; tabla rica de cuentas con incluir/excluir; readiness de
   canal por empresa; regla de faltante.
3. Carga y revisión de la cadencia (ya existe el parser; se re-viste visualmente).
4. Preview cinemático (la joya): timeline por cuenta + vista día a día.
5. Lanzar: crear campaña + inscribir (ya existe la lógica base; se conecta al flujo nuevo).

**Fuera (spec siguiente):** el motor de ejecución P4/P5 (colas por canal en la cola del
día, empuje real a Apollo, tracking de aperturas/respuestas, iteración persistente de copy).
El schema y el motor `proximoPasoDebido()` ya existen y esta feature los usa SOLO para
simular el preview, no para enviar de verdad.

## 3. Decisiones de producto (cerradas en brainstorming)

### 3.1 Segmentación: wall + lenguaje natural, un solo filtro
Dos formas de manejar el MISMO estado de filtro:
- **Wall de filtros a la izquierda** (Apollo): usuarios (rango), región (departamento/
  ciudad), categoría, estado del deal, rol del contacto, cantidad de personas en la cuenta.
- **Caja de lenguaje natural arriba** (Clay): el usuario escribe "ISPs de más de 200.000
  usuarios en el Valle del Cauca" y la IA lo **compila** al filtro estructurado; los chips
  del wall se llenan y quedan visibles y editables a mano.
- La IA solo traduce (frase -> `DefinicionSegmento`); NUNCA toca la DB. El Repository
  ejecuta el filtro, determinístico y auditable. Si la frase pide algo que no tenemos como
  dato, la IA lo dice honesto en vez de inventar un filtro que no aplica.

### 3.2 Reality check del dato (define el wall)
- 1959 empresas (1873 ISPs), buena cobertura de usuarios (1730) y región.
- Solo 213 contactos en total; ~160 empresas tienen contacto, 131 de ellas una sola persona;
  el resto (~1800) no tiene contacto. Roles reales: dueño 75, gerente 28, técnico 15,
  rep_legal 26, financiero 3, desconocido 60; 150 KDM.
- Consecuencia: el filtro de rol y "cantidad de personas" es real pero opera sobre una
  tajada chica. El cuello de botella real es que la mayoría de empresas no tiene a quién
  escribirle todavía.

### 3.3 Readiness de canal + regla de faltante
Un solo concepto resuelve el problema de "empresas sin canal", sin marear al usuario:
- Cada empresa tiene un set de **canales alcanzables** derivado del dato: `correo` (hay
  email), `llamada` (hay teléfono/PBX), `whatsapp` (hay celular). LinkedIn no lo tenemos.
- La cadencia ya declara el canal de cada paso (`paso_cadencia.canal`).
- Al aplicar cadencia a segmento, el cockpit calcula por empresa si tiene los canales que la
  cadencia pide, y muestra un breakdown en vivo: **N listas · M parciales · K sin canal**.
- Una sola **regla de faltante** por campaña resuelve el choque cuando un paso pide un canal
  que la empresa no tiene:
  - `reemplazar`: el paso usa otro canal que la empresa sí tenga (ej. correo -> llamada).
  - `saltar`: el paso se evapora; solo corren los días de canales que sí tiene.
  - `cola`: la empresa no entra hasta conseguir el contacto (queda en cola "conseguir dato").
- Poner la regla en `cola`/`saltar` produce de facto campañas homogéneas por canal
  (email-only vs whatsapp-only) sin modelarlo aparte.

### 3.4 Destinatarios por rol
Dentro de la empresa inscrita, el usuario elige a qué contactos les corre la cadencia por
rol (solo gerente / dueño / todos / técnico sí o no). Se materializa como filas
`destinatario`. Regla ya definida: una respuesta de cualquier destinatario pausa la
inscripción de la empresa.

## 4. Flujo (wizard de 4 pasos) + Hub

### Hub de campañas (dirección 1C)
Tarjetas con título serif (Newsreader), no tabla plana. Cada campaña: nombre, cadencia,
segmento, canal principal, # inscritas, # bloqueadas, estado, y un mini-pulso. Botón grande
"Nueva campaña". Reutiliza `listarCampanas()`.

### Paso 1 · Segmentar (dirección 2A)
- Izquierda: wall de filtros. Centro: tabla rica de cuentas (checkbox incluir/excluir,
  nombre, ciudad, usuarios, estado, columna readiness de canal). Arriba: caja NL + conteo
  en vivo "N cuentas · M listas para correo · K sin contacto". Persistencia de exclusión en
  `segmento_exclusion` (ya existe).
- Guardar segmento (nombre + `descripcion_natural` = la frase original).

### Paso 2 · Cadencia
Sube Markdown/CSV (parser ya existe), se muestra como secuencia editable con el copy y las
`[variables]` resaltadas. Re-vestido visualmente al 2A.

### Paso 3 · Destinatarios y readiness
Elige roles a tocar; ve el breakdown de readiness; fija la regla de faltante.

### Paso 4 · Preview (la joya) y Lanzar
Preview cinemático (sección 5). Botón "Lanzar" -> `crearCampana()` + `inscribirCampana()`.

## 5. La joya: preview cinemático

Objetivo: que el usuario SIENTA la campaña antes de lanzarla. Dos vistas, un toggle.

### 5a · Timeline por cuenta
Se elige una empresa real del segmento. Su secuencia se ve como una línea de tiempo
horizontal interactiva ("hilito" con nodos). Cada nodo es un toque (llamada / whatsapp /
correo). Al avanzar (scrub con mouse/teclado), el toque se "abre" con una animación propia
del canal:
- correo: se despliega el copy YA personalizado con el nombre y empresa reales.
- llamada: muestra un guion corto.
- whatsapp: burbujeo de chat.
Al final, un estado "listo" sobrio y satisfactorio (verde `--done`, sin confeti). La data del
preview sale de `proximoPasoDebido()` + `calcularCalendario()` + `elegirVersionPorPeso()`
(todo puro y ya existe) y del copy en `version_paso`. Es simulación: no envía nada.

### 5b · Día a día (cohorte)
Calendario NO tradicional. El usuario desliza día por día y ve el volumen y tipo de toque de
toda la campaña: "Día 1: entran 50 cuentas, 50 correos del paso 1". "Día 3: 50 llamadas del
paso 2". Deriva del mismo motor sobre todas las inscripciones simuladas.

## 6. Dirección de diseño (del mockup elegido)

Extiende `app/globals.css` (dark cálido, ya existe). Se agregan variables, no se reescribe.
- Base: `#0a0b0c`/`#14171c`/`#1b1a17`, texto crema `#edeff2`/`#fffdfa`.
- Acento primario (nuevo): violeta `--accent: #8b7cff` (claro `#c4b5fd`, glow
  `rgba(139,124,255,.35)`), para acción/selección/foco.
- Funcionales: verde éxito `#2fa36b` (ya hay `--done`), naranja `#e07a3f`, azul `#2549d4`.
- Tipografía: IBM Plex Mono (datos), grotesca UI (IBM Plex/Hanken/Public Sans), Newsreader
  serif en títulos de tarjeta (1C).
- Formas: pills 999px, tarjetas 12-18px, glows violeta sutiles en foco.

## 7. Modelo de datos

Casi todo existe (schema Fase 4 completo). Cambios nuevos, mínimos:
- `campana.regla_faltante` (text: `reemplazar`|`saltar`|`cola`; default `cola`). NUEVO.
- Derivación de canales alcanzables: función PURA en core, no columna (se calcula de
  `contacto.email`/`telefono`). Si el cómputo pesa, se cachea después; no ahora.
- `DefinicionSegmento`: extender `CAMPOS_SEGMENTO` con `departamento` y rol de contacto, y el
  operador `mayor_que`/`menor_que` (hoy solo `entre`). Validado en `app/db/validation.ts`.
- Sin tablas nuevas. `segmento`, `campana`, `inscripcion`, `destinatario`, `version_paso`,
  `paso_inscripcion`, `evento_tracking` ya están.

## 8. Arquitectura y capas

- **Core (puro):** readiness de canales, compilación de la simulación del preview, y el
  contrato `frase -> DefinicionSegmento` como TIPO (no la llamada a IA). Testeable con
  node:test, determinista.
- **IAPort:** se extiende con `compilarSegmento(frase, camposDisponibles): DefinicionSegmento`.
  El core define la interfaz; `ClaudeAdapter` la implementa vía el gateway (F6 ya resuelto).
  El core NO importa Claude.
- **Repository:** nuevas queries de solo lectura para el wall/tabla (empresas + readiness +
  conteos por canal) y para poblar el preview. Nada de SQL fuera del Repository.
- **UI:** Next 16 App Router + Server Actions (patrón ya usado en campanas/nueva). CSS plano
  con variables (sin Tailwind). Componentes de cliente para el wall reactivo y el preview
  animado.

## 9. Riesgos y decisiones abiertas

- **Librería de animación.** El preview cinemático necesita motion fino. Opciones:
  (a) CSS + Web Animations API, cero dependencias (favorece la constitución); (b) agregar
  `motion`/framer-motion. Recomendación: intentar (a) primero para el scrub y las
  transiciones; solo justificar (b) si el scrub interactivo se vuelve inmanejable. DECIDIR en
  el plan.
- **Confiabilidad del NL.** La IA debe mapear solo a campos que existen y declararse honesta
  cuando no puede. El filtro compilado siempre es visible y editable, así que un error de la
  IA nunca es silencioso.
- **Dato de contacto delgado.** El preview personalizado y el envío real dependen de empresas
  con contacto; el readiness lo hace explícito en vez de esconderlo.

## 10. Testing

- Core (readiness, simulación del preview, extensiones del filtro): node:test, casos
  deterministas, incluyendo bordes (empresa sin canal, cadencia multicanal, regla de
  faltante en sus 3 modos).
- Repository: DB temporal (test-helpers), nunca isps.db real.
- Contrato IAPort: se testea con un adaptador falso que devuelve una `DefinicionSegmento`
  fija; la llamada real a Claude no entra en el test.
- UI: verificación en el preview del navegador (no snapshot pesado).
