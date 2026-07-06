# Dashboard como pantalla principal

## Problema

Hoy `/` es la cola de toques directa. El header apretuja identidad, contador vencidos,
y tres links de navegación (Agregar toque · Cadencias · Conectores) en una sola línea
de meta. No hay ningún resumen de "qué hice ayer" ni "qué me falta hoy" antes de entrar
a trabajar la cola.

## Alcance

Este spec cubre **solo** la pantalla de dashboard y el movimiento de la cola a su propia
ruta. Explícitamente NO cubre:

- Cambios al modelo de owner/signup ("Organización" + "Quién eres" al crear cuenta,
  restringir cuentas individuales a ver solo su propia cola). Es un cambio de identidad,
  no de dashboard, y queda para una fase aparte.
- El selector Sebastián/Felipe/Thomas que hoy vive en `/` (ver `OWNERS` en el page.tsx
  actual) se elimina del dashboard sin reemplazo en este spec. El dashboard siempre
  muestra los datos de `usuario.owner` (el owner de la sesión autenticada), nunca un
  `?owner=` de otra persona.

## Rutas

| Ruta | Contenido |
|---|---|
| `/` | Dashboard nuevo. Server component, solo lectura, sin `<form>` ni server actions. |
| `/cola` | La cola de toques de hoy. Es el `page.tsx` actual movido tal cual: mismo JSX, mismos forms (`repartirAction`, `registrarTapAction`), mismo soporte de `?owner=` para mirar la cola de otra persona (eso ya existía como feature de pipeline compartido y no se toca). |
| `/cadencias`, `/conectores`, `/toque-independiente` | Sin cambios. |

## Componentes nuevos

### `app/page.tsx` (dashboard)

Server component. Llama:
- `colaDelDia(hoy, usuario.owner)` — para `hoy` (length) y `vencidos` (fecha < hoy).
- `contadoresHoy(hoy, usuario.owner)` — desglose "hoy hiciste" por canal.
- `contadoresHoy(ayer, usuario.owner)` — total de ayer (mismo query, fecha distinta).
- `listarCadencias()` — cuenta activas para la tarjeta de Cadencias.
- `estadoConector(proveedor)` para cada proveedor conocido — cuenta conectados para la
  tarjeta de Conectores.

Ningún query nuevo en el Repository: todas las funciones ya existen.

Pipeline en cola (desglose "Pipeline en cola" del mockup) se calcula en memoria a partir
de `cola` (ya trae `estado` por fila vía `ESTADO_PILL`), agrupando por las mismas claves
que `ESTADO_PILL` define hoy en el page.tsx de la cola.

### `app/TopNav.tsx` (nuevo, compartido)

Extrae la identidad + botón salir que hoy está inline en el page.tsx. Lo usan `/` y
`/cola`. Reemplaza la línea de meta apretada; los links de sección (Agregar toque,
Cadencias, Conectores) YA NO viven aquí — se convierten en tarjetas de navegación
dentro del dashboard.

## Layout del dashboard

```
┌─ Follow-ups OnePay ───────────── Sebastián · Salir ─┐
│                                                      │
│   Martes 6 de julio                                  │
│                                                      │
│   ┌────────┐ ┌────────┐ ┌────────┐                  │
│   │  12    │ │   4    │ │   9    │                   │
│   │ hoy    │ │vencidos│ │ ayer   │                   │
│   └────────┘ └────────┘ └────────┘                  │
│                                                      │
│   [ ►  Entrar a los toques (12 hoy) ]  ← CTA grande  │
│                                                      │
│   Hoy hiciste          Pipeline en cola             │
│   3 llamadas           2 reuniones                  │
│   1 whatsapp           1 oportunidad                │
│   0 correos            1 cierre                      │
│                                                      │
│   ┌ Agregar toque ┐ ┌ Cadencias ┐ ┌ Conectores ┐   │
│   │  + manual     │ │  3 activas │ │  1 conectado│   │
│   └───────────────┘ └────────────┘ └─────────────┘  │
└──────────────────────────────────────────────────────┘
```

- **3 KPIs:** hoy, vencidos, ayer. Todos de `usuario.owner`, sin selector.
- **CTA primario:** único elemento con peso visual fuerte, enlaza a `/cola`.
- **Dos columnas de desglose:** "Hoy hiciste" (por canal, de `contadoresHoy`) y
  "Pipeline en cola" (estados calientes, en memoria).
- **Tres tarjetas de navegación:** Agregar toque (`/toque-independiente`), Cadencias
  (`/cadencias`, con nº activas), Conectores (`/conectores`, con nº conectado).

## Casos borde

- **Cola vacía (`cola.length === 0`):** el CTA cambia a algo como "Sin follow-ups para
  hoy" sin link forzado, igual que el `empty` state que ya existe en la cola de hoy.
- **`contadoresHoy(ayer).total === 0`:** se muestra "0 ayer" tal cual, sin ocultar la
  tarjeta (evita que un día sin actividad se sienta como un bug).
- **Cadencias/Conectores en cero:** las tarjetas se muestran igual con "0 activas" /
  "0 conectado" — son accesos de navegación, no deben desaparecer.

## Testing

- Sin lógica de dominio nueva (no toca `app/core/`): es composición de datos ya
  expuestos por el Repository, cada uno con sus propios tests. No requiere test
  unitario nuevo en el core.
- Hoy ningún page.tsx tiene test (no existe el patrón en el repo). Se mantiene así:
  el dashboard se verifica manualmente en el navegador (dev server) como parte del
  checklist de implementación, sin introducir un framework de test de páginas solo
  para esta tarea.
