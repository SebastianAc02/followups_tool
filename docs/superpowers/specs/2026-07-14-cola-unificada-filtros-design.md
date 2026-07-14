# Cola unificada con filtros (reemplaza el split de secciones) — Design

Estado: PROPUESTO (2026-07-14). Reemplaza, solo para `owner = "Sebastian Acosta Molina"`, la
UI de 3 secciones apiladas (Leads/Cierres/Reagendar) + bloque "Cadencias de hoy" construida en
la sesión anterior. La lógica de datos (`colaLeads`/`colaCierres`/`colaReagendar`, el modelo de
no-show) no cambia — esto es la capa de presentación y un par de campos nuevos.

## Problema

Con las 3 secciones apiladas, Sebastián ve la información correcta pero fragmentada: "veo
campaña, toques y cierres, se ve como superdesorganizado". Necesita un solo lugar donde
trabajar su día completo (llamadas, correos, WhatsApp, de cualquier cadencia o etapa) y decidir
él mismo el orden ("primero todos los on_hold, luego clientes, luego leads") en vez de que la
estructura de la pantalla se lo imponga.

Además, la cola arrastra follow-ups vencidos de hace meses (bagaje pre-herramienta) mezclados
con los realmente urgentes de esta semana — verlos con el mismo rojo/urgencia de "vencido 3d" es
ruido, no señal.

## Alcance

**Solo `owner = "Sebastian Acosta Molina"`**, igual que todo lo construido hasta ahora. Cero
cambios de comportamiento para los demás owners: `AgendaHoy.tsx` y `CadenciasHoy.tsx` (los
componentes que ya existen) NO se tocan; se crean componentes nuevos que solo se renderizan
cuando `splitActivo` es cierto. Documentado abajo cómo extenderlo cuando se apruebe para todos.

## Decisiones cerradas con Sebastián (2026-07-14)

1. **Una sola lista, no secciones.** Etapa (lead/cierre/reagendar) pasa a ser UN FILTRO más
   entre varios, no una sección fija. Objetivo: poder aislar un segmento (ej. "solo Reagendar")
   y trabajarlo completo antes de cambiar de filtro, sin que la pantalla cambie de estructura.
2. **Filtros a la derecha:** Etapa, Campaña, Canal, Frescura.
3. **Vencido (1-6 días) vs Desactualizado (7+ días).** Ambos SIEMPRE visibles en la lista (no se
   ocultan); solo cambia la etiqueta/color — desactualizado usa un tono neutro, no rojo urgente.
4. **La tarjeta muestra el nombre de la campaña** cuando el toque viene de una inscripción activa.
5. **Los pasos de cadencia (correo/WhatsApp) se integran a la misma lista** ordenados y
   filtrados junto con los toques normales — pero conservan su editor propio (`CopyBox` con
   variables resaltadas + aprobar) al interactuar, no se fuerzan a la tarjeta simple de llamada.
   Deja de existir el bloque separado "Cadencias de hoy" con su propio título.

## Contexto técnico verificado

- `AgendaHoy.tsx` es usado SOLO por `app/cola/page.tsx` (`grep` confirmado) — seguro de
  refactorizar sin afectar otras páginas, y de dejar intacto para los demás owners.
- El filtro de canal ya existe (`FILTROS_ORDEN`/`filtrarPorCanal`/`conteosPorCanal` en
  `agenda.ts`), hoy como chips arriba de la lista, dentro de `AgendaHoy`. Se reusa la lógica de
  filtrado; cambia dónde vive (panel derecho) y se le suman las 3 facetas nuevas.
- `empresa.proximoCanal` (columna ya en schema) no se usa hoy para nada del split — no aplica a
  esta parte del trabajo (es de la Parte 8/Felipe, spec aparte).
- `agendaHoyCadencias(hoy)` no filtra por owner hoy (comentario explícito en el código: "no son
  por owner todavia... se muestran a cualquier sesion"). Único caller: `app/cola/page.tsx`. Se
  le agrega un parámetro `owner` opcional (mismo patrón que `colaDelDia`) — sin owner, mismo
  comportamiento actual (todos); con owner, filtra por `empresa.owner`. No requiere `estadoNotion`
  hoy en el select; se agrega para poder derivar la Etapa de una fila de cadencia.
- `colaLeads`/`colaCierres`/`colaReagendar` son funciones NUEVAS de la sesión anterior, sin otros
  consumidores fuera del split — seguro extender su shape de columnas sin tocar `colaDelDia`
  (que sigue usando el `columnasCola` original, sin campaña).

## Diseño

### 1. Modelo de fila unificada

Nuevo tipo en `app/cola/agenda.ts`:

```ts
export type Bucket = 'lead' | 'cierre' | 'reagendar';
export type Frescura = 'vigente' | 'desactualizado' | 'sin_fecha';

export type FilaUnificada = FilaAgenda & {
  bucket: Bucket;
  campana: string | null;
  frescura: Frescura;
  // Si viene de un paso de cadencia (correo/whatsapp pendiente de aprobar), trae el
  // payload completo para abrir su editor en vez de ir a /llamada/[id].
  pasoCadencia: ItemCadenciaHoy | null;
};
```

`frescura` se deriva client-side de `fila.fecha` + `hoy` con el mismo umbral que ya se usa para
`sev`/`severidadTexto` (7 días), no se persiste ni se consulta a la DB.

### 2. Datos: campaña en la fila, owner en cadencias

- `colaLeads`/`colaCierres`/`colaReagendar`: agregan un `LEFT JOIN` a `inscripcion` (estado
  `'activa'`) → `campana`, seleccionando `campana.nombre` como `nombreCampana` (null si no hay
  inscripción activa). Se define un `columnasColaConCampana` nuevo (columnasCola + ese campo),
  usado solo por estas tres funciones — `colaDelDia` no se toca.
- `agendaHoyCadencias(hoy, owner?)`: agrega el filtro `eq(empresa.owner, owner)` cuando se pasa
  owner (igual patrón que `colaDelDia`), y agrega `empresa.estadoNotion` al select (para poder
  derivar `bucket` del lado del cliente).

### 3. Armado de la lista unificada (client-side merge, sin query nueva)

Nueva función pura en `app/cola/agenda.ts`:

```ts
export function unificarCola(
  leads: ColaRow[], cierres: ColaRow[], reagendar: ColaRow[],
  cadencias: ItemCadenciaHoy[], hoy: string,
): FilaUnificada[]
```

Mapea cada fuente a `FilaUnificada` (leads/reagendar usan `filaConVencimiento`, cierres usa
`filaSinVencimiento`, cadencias arma su propia fila con `pasoCadencia` poblado y `bucket`
derivado de `estadoNotion` vía `faseDeEtapaSplit` — helper chico que replica el mapeo que ya usan
`ESTADOS_CALIENTES`/`ETAPA_ONHOLD`/`'lead'`), calcula `frescura`, y devuelve todo en un solo
arreglo ordenado por `calor` (mismo criterio que ya usa `colaDelDia`, aproximado con el orden de
bucket: reagendar/cierre primero, lead después — a definir el detalle en el plan) y luego por
fecha.

### 4. UI: panel de filtros + lista

**Nuevos componentes** (no tocan `AgendaHoy.tsx`/`CadenciasHoy.tsx` existentes):

- `app/cola/FiltrosColaUnificada.tsx` (client): panel derecho con 4 grupos de chips/checkboxes
  — Etapa (Lead/Cierre/Reagendar), Campaña (dinámico, de las campañas presentes en la lista de
  hoy), Canal (Llamada/Correo/WhatsApp), Frescura (Vigente/Desactualizado — "sin fecha" siempre
  visible, no es un toggle). Estado en `useState` local (mismo patrón que el filtro de canal
  actual), no en la URL — es una herramienta de trabajo momentánea, no un estado que valga la
  pena compartir por link.
- `app/cola/ColaUnificadaLista.tsx` (client): la lista en sí. Reusa la tarjeta de fila visual de
  `AgendaHoy` (se extrae el JSX de una fila a un componente `FilaCard` compartido para no
  duplicar ~40 líneas, usado por `AgendaHoy` viejo y por este nuevo — refactor mecánico, sin
  cambio de comportamiento para `AgendaHoy`). Al hacer click: si `pasoCadencia` es null, navega a
  `/llamada/[id]` (como hoy); si `pasoCadencia` existe y el canal es correo/whatsapp, abre inline
  el mismo `CopyBox`/flujo de aprobación que usa `CadenciasHoy.tsx` hoy (se reusa ese
  sub-componente, no se reescribe).
- `app/cola/page.tsx`: cuando `splitActivo`, arma `unificarCola(...)` y renderiza
  `<FiltrosColaUnificada>` + `<ColaUnificadaLista>` en vez de las 3 secciones + `CadenciasHoy`.
  Cuando no, sigue exactamente como hoy (`AgendaHoy` + `CadenciasHoy` + secciones).

### 5. Qué NO se construye ahora

- Nada de esto se activa para otros owners — queda documentado (este spec + comentarios en el
  código) para cuando se apruebe extenderlo: el gate es un solo `if (splitActivo)` en
  `page.tsx`, ampliarlo es cambiar esa condición, no reescribir componentes.
- No se persiste la selección de filtros (sin URL params, sin preferencia guardada por usuario)
  — se puede agregar después si hace falta recordar el último filtro usado.
- No se toca el modelo de datos de `no_llego`/Reagendar de la sesión anterior.
- El tema de `contacto_iniciado` sin cadencia (Felipe) es un spec aparte, no entra aquí.

## Pruebas

- `unificarCola`: pruebas puras (node:test) — mezcla correcta de las 4 fuentes, cálculo de
  `frescura` en los umbrales (6 vs 7 días), orden resultante, `bucket` derivado correctamente
  para filas de cadencia.
- `agendaHoyCadencias(hoy, owner)`: test nuevo que confirma que con owner filtra, y que sin
  owner mantiene el comportamiento actual (no rompe nada existente).
- `colaLeads`/`colaCierres`/`colaReagendar` con campaña: test que confirma `nombreCampana` null
  sin inscripción activa, y con nombre cuando sí la hay.
- Componentes nuevos (`FiltrosColaUnificada`, `ColaUnificadaLista`, `FilaCard`): sin test
  automatizado (no hay infra de testing de React en el repo, mismo criterio que el resto de la
  UI de este proyecto) — verificación manual de Sebastián en el navegador.

## Riesgos / notas

- El refactor de extraer `FilaCard` de `AgendaHoy.tsx` toca el componente que SÍ ven los demás
  owners — aunque es mecánico (mover JSX, no cambiar lógica), se verifica manualmente que
  `AgendaHoy` se ve y comporta idéntico después del refactor, antes de dar por cerrada esa tarea.
- `unificarCola` mezclando 4 fuentes con distinto shape de origen es la pieza de más riesgo de
  bugs de mapeo (perder un campo al normalizar) — por eso lleva pruebas puras dedicadas.
- El criterio exacto de "orden por calor" del unificado (cómo se intercalan bucket vs fecha vs
  campaña) se afina en el plan de implementación con ejemplos concretos, no se fija en detalle
  aquí para no sobre-especificar antes de ver cómo se siente en la práctica.
