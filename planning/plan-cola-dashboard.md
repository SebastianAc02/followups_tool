# Plan — Rediseño de `/cola` a Cockpit Comercial (dashboard) — versión Tailwind

Fecha: 2026-07-07. Owner: Sebastián.
Rama: `feat/cola-dashboard`, ramificada **desde la rama de Tailwind** (no desde `feat/cockpit-campanas`,
que aún no tiene Tailwind). Ver "Dependencia" abajo.

## Dependencia dura: la rama de Tailwind va primero

Este plan **asume que el setup de Tailwind ya está montado** (se está haciendo en paralelo en otra
rama/sesión). Antes de arrancar la Fase 1, en la rama base tienen que existir:

- Tailwind v4 instalado y funcionando (`@tailwindcss/postcss` en `postcss.config.mjs`,
  `@import "tailwindcss";` en `app/globals.css`).
- Los tokens actuales de `:root` (`--bg`, `--surface`, `--overdue`, `--today`, `--done`, etc.)
  **expuestos como utilities** vía `@theme inline` (ej. `--color-overdue: var(--overdue)`), sin
  reescribir la paleta. Los tokens siguen siendo la fuente de verdad.
- `cn` helper (clsx + tailwind-merge) y `class-variance-authority` (CVA) disponibles.
- shadcn/ui inicializado apuntando a la paleta (aunque se use selectivamente).

Si algo de eso no está cuando se vaya a ejecutar, **se para y se termina el setup primero**. No se
empieza `/cola` a medias sobre un Tailwind incompleto.

## Qué se decidió (bifurcaciones cerradas)

1. **Horarios: orden sin reloj.** `proximoFollowUpFecha` es FECHA, no hora. No se inventan horas ni se
   agrega scheduling. La columna de tiempo del mockup se reemplaza por el **orden real de la cola**
   (ya viene rankeada por calor + vencimiento desde `colaDelDia`).
2. **Reskin + preservar todo.** Se adopta el layout dashboard (header, barra "Ahora", agenda con
   chips) y se re-hospedan: owner-switch, contadores, "Repartir" y el bloque `CadenciasHoy`.
3. **"Por pedir" se elimina.** Chips finales: Todos, Llamadas, Correos, WhatsApp.
4. **Estilos: Tailwind v4 + tus tokens como `@theme` + CVA para variantes + shadcn/ui selectivo +
   CSS Modules para lo verdaderamente custom.** (Decidido tras investigar 17 opciones.)

## Principio de arquitectura (no negociable, del CLAUDE.md)

- Esto es capa de **presentación**. Acceso a datos solo por el Repository (`colaDelDia`,
  `contadoresHoy`, `agendaHoyCadencias`). **No se toca el core ni se agrega SQL crudo.** Si falta un
  dato que `colaDelDia` no trae, se agrega al `select` del Repository, nunca una query suelta en la UI.
- **Estilos con Tailwind, sin "class soup":** todo elemento recurrente (pill, dot, chip, fila, stat)
  se abstrae en un **componente con CVA**, nunca se repiten clases largas en el JSX. Esta disciplina
  es obligatoria, es lo que mantiene el markup legible.
- **Tokens = fuente de verdad.** Los colores salen de los tokens en `@theme` (`bg-surface`,
  `text-overdue`), no de hex sueltos. Los colores nuevos del mockup (canales) se agregan como tokens,
  no inline.
- **CSS Modules solo para lo que Tailwind hace mal:** detalles editoriales finos de la barra "Ahora"
  (tipografía serif, gradientes/sombras sutiles) si las utilities se vuelven ilegibles. No por defecto.
- Las funciones puras nuevas (saludo por hora, derivación de stats, filtro de agenda) se extraen y se
  **testean**. Una feature no está lista sin sus pruebas.

## Tokens nuevos a agregar en `@theme` (colores del mockup)

Además de los que ya existen, mapear como tokens los acentos del mockup:
- `--color-canal-llamada: #8fb0e0` (azul)
- `--color-canal-correo: #d3a0a6` (rosa)
- `--color-canal-whatsapp: #84c99e` (verde)
- `--color-acento: #6f9fd0` (el "Ahora")

Quedan disponibles como `bg-canal-llamada`, `text-acento`, etc.

## Mapeo mockup -> datos reales (no cambia respecto a la versión anterior)

| Elemento del mockup            | Fuente real                                              | Nota |
|--------------------------------|----------------------------------------------------------|------|
| "Buenos días, Sebastián"       | `usuario` (sesión) + hora del server                     | saludo por franja |
| "Martes 7 de julio · 9:02 a.m."| fecha del server (`app/lib/date-utils.ts`)               | formato es-CO |
| Stat "9 pendientes"            | `cola.length`                                            | |
| Stat "2 vencidas" (naranja)    | `cola.filter(fecha < hoy).length` (ya se computa)        | reusar `vencidos` |
| Stat "3 cerradas" (azul)       | `contadoresHoy`                                          | REGLA DE NEGOCIO abierta (ver Fase 1) |
| Barra "Ahora" (empresa top)    | `cola[0]`                                                | sin query nueva |
| Nombre, ciudad, contacto/cargo | `empresa`, `ciudad`, `contacto`, `cargo` (ya en cola)    | |
| Pill de estado                 | `estadoNotion` -> mapa `ESTADO_PILL` (ya existe)         | migrar el mapa a variantes CVA |
| Pill/dot de canal              | `canal` -> token de color de canal                       | |
| Chips Todos/Llamadas/Correos/WhatsApp | filtro cliente por `canal`                        | conteos derivados |
| Columna derecha (estado/Ahora/Vencida) | `estado` + severidad (vencido/hoy)               | |

## Arquitectura de componentes

`app/cola/page.tsx` sigue siendo server component (fetch + stats). El filtrado de los chips es cliente.

- `page.tsx` (server): sesión, `colaDelDia`, `contadoresHoy`, `agendaHoyCadencias`, cómputo de stats.
- `DashboardHeader` (server): saludo, fecha, 3 stats, owner-switch re-hospedado.
- `BarraAhora` (server): `cola[0]` como card prominente con CTA (link a `/llamada/[id]`).
- `AgendaHoy` (**client, nuevo**): estado de filtro, chips, lista filtrada.
- `CadenciasHoy` (client, existente): re-hospedado bajo la agenda.
- Form "Repartir": re-hospedado (control secundario, solo si `esPropia`).

**Primitivos de UI con CVA** (definir una vez, usar en todo el dashboard):
- `Pill` — `variant: hot | warm | cold` (estado). Migra el mapa `ESTADO_PILL` actual a estas variantes.
- `CanalTag` / `CanalDot` — `variant: llamada | correo | whatsapp` (color de canal).
- `Chip` — `active: boolean` (filtro de agenda).
- `Stat` — `tone: neutral | done | overdue` (los 3 del header).
- `SeverityText` — `variant: overdue | today` (la columna derecha).
- Botones: usar `Button` de shadcn/ui donde encaje (CTA "Llamar ahora" / "Abrir ficha"); si el diseño
  editorial no calza, componente propio. No forzar shadcn.

Las filas siguen enlazando a `/llamada/[id]`. Las tap-actions rápidas (whatsapp/correo) se preservan
como acción secundaria en cada fila (`registrarTapAction`).

---

## Fases (diffs pequeños y revisables, una por delegación)

### Fase 0 — Primitivos de UI con CVA (base del sistema visual)
- Verificar la dependencia de Tailwind (checklist de arriba). Si falta algo, parar.
- Agregar los tokens de canal/acento en `@theme`.
- Crear los primitivos CVA: `Pill`, `CanalTag`/`CanalDot`, `Chip`, `Stat`, `SeverityText`. Cada uno
  con sus variantes y usando tokens (no hex).
- Migrar el mapa `ESTADO_PILL` (estadoNotion -> variante) a un helper que alimenta `Pill`.
- **Sin cambio de comportamiento en `/cola` todavía.** Solo primitivos listos para ensamblar.
- Tests ligeros: que cada variante rinde la clase/token correcto (o al menos un smoke test de render).

### Fase 1 — Header dashboard (bloque 1a) + re-home owner-switch
- Función pura `saludoPorHora(hora): string` ("Buenos días/tardes/noches"). **Test.**
- Formato de fecha larga es-CO ("Martes 7 de julio") en `app/lib/date-utils.ts`. **Test.**
- Derivar los 3 stats con `<Stat>`: pendientes = `cola.length`, vencidas = `vencidos`,
  cerradas = de `contadoresHoy`.
- **DECISIÓN de negocio (Sebastián):** qué resultado cuenta como "cerrada". Dejar función pura
  `contarCerradas(contadores)` con `TODO` para que Sebastián defina la regla (5-10 líneas).
- Owner-switch re-hospedado en el header (mismos links `?owner=`).
- Reemplaza el `<div class="head">` actual.

### Fase 2 — Barra "Ahora" (bloque 2a)
- `BarraAhora` con `cola[0]`: label "AHORA", nombre serif, ciudad + contacto, `CanalTag` + `Pill` de
  estado, CTA (`Button` "Llamar ahora" link a `/llamada/[id]` + "Abrir ficha").
- CTA depende del canal. Si no hay cola, ocultar la barra (estado vacío).
- Aquí es donde más probable se necesite CSS Module para el detalle editorial (serif grande, divisor).
  Evaluar: si Tailwind lo resuelve legible, quedarse en utilities.

### Fase 3 — Agenda con chips (bloque 2b) — el corazón del cambio
- **NUEVO** `app/cola/AgendaHoy.tsx` (client): recibe `cola` serializada (props planas, fechas como
  string), mantiene `filter` en estado, renderiza `Chip`s (Todos/Llamadas/Correos/WhatsApp) con
  conteos y la lista filtrada.
- Funciones puras `filtrarPorCanal(cola, filtro)` + `conteosPorCanal(cola)`. **Test.**
- Cada fila: **posición/orden** (no hora) · `CanalDot` · nombre · canal · ciudad · `Pill` de estado ·
  `SeverityText` a la derecha. Click abre `/llamada/[id]`.
- Tap-actions rápidas (whatsapp/correo) preservadas como acción secundaria (hover o fila expandible).
- `cola[0]` (el de la barra "Ahora"): resaltarlo como fila "actual", no excluirlo (recomendado).

### Fase 4 — Re-home de contadores, "Repartir" y cadencias
- Contadores por canal: ya viven en los chips (Fase 3). El desglose por resultado: línea secundaria
  bajo el header o plegado. Decidir con `taste-skill` para no recargar.
- Form "Repartir": control discreto (solo si `esPropia`), bajo la agenda.
- `CadenciasHoy`: re-hospedar; migrar su markup a los mismos primitivos (Pill/CanalTag) para
  consistencia visual con la agenda nueva.

### Fase 5 — Pulido, motion y auditoría
- `emil-design-eng` (motion): transición de chip activo, hover de filas, entrada de barra "Ahora".
- Responsive: header y barra "Ahora" colapsan en angosto (aprovechar breakpoints de Tailwind).
- `impeccable` auditoría final + `taste-skill` para que no quede genérico.
- `/code-review` como gate de cierre.

---

## Skills por fase (ruteo del orquestador, ahora CON Tailwind)

| Fase | Skills |
|------|--------|
| 0 Primitivos CVA | `taste-skill` + `tailwindcss-development` + `tailwind-css-patterns` |
| 1 Header | `frontend-design` + `tailwindcss-development`; tests con `testing` |
| 2 Barra Ahora | `frontend-design` + `tailwindcss-development` |
| 3 Agenda/chips | `frontend-design` + `taste-skill` + `tailwindcss-development`; tests con `testing` |
| 4 Re-home | `taste-skill` + `tailwind-css-patterns` |
| 5 Pulido | `emil-design-eng` -> `impeccable` -> `/code-review` |

`impeccable` también entra al **inicio** de Fase 1 para fijar dirección visual del sistema completo.

## Tests (una feature sin pruebas no está lista)
- `saludoPorHora` — franjas horarias + bordes.
- formato fecha larga es-CO.
- `contarCerradas` — una vez que Sebastián defina la regla.
- `filtrarPorCanal` y `conteosPorCanal` — Todos vs cada canal, cola vacía.
- Smoke de primitivos CVA (variante -> clase correcta).
- Verificación manual: `/cola` con datos reales, owner-switch, filtros, links a `/llamada/[id]`.

## Riesgos / cosas a vigilar
- **Dependencia de la rama Tailwind:** no arrancar Fase 1 sin el setup completo. Es la primera
  verificación de la Fase 0.
- **"Class soup":** si aparecen className largas repetidas, es señal de que falta un primitivo CVA.
  Abstraer, no copiar clases.
- **Serialización server->client:** `AgendaHoy` es client; `cola` como props planas (fechas string).
- **`cola[0]` duplicado** entre barra "Ahora" y lista: resaltar, no excluir.
- **"Cerradas" es regla de negocio abierta:** que Sebastián la defina (Fase 1), no adivinar.
- **No romper `/llamada/[id]`:** las filas siguen siendo el punto de entrada a la ficha.
- **Layering:** cero imports de adapters en componentes; cero SQL nuevo.
- **shadcn selectivo:** no meter shadcn donde el diseño editorial custom no encaje; es acelerador, no
  camisa de fuerza.

## Checkpoint de aprendizaje (CLAUDE.md, modo learning)
Al cerrar Fase 3, Sebastián explica de vuelta: por qué el filtro vive en el cliente y el fetch en el
server, y por qué los primitivos CVA (definir la variante una vez) evitan la "class soup" de Tailwind.
Ahí decide la regla de "cerradas" (5-10 líneas) antes de seguir a la Fase 4.
