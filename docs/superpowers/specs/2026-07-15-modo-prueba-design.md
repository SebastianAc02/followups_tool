# Modo prueba: pruebas.db al lado de isps.db — Design

**Fecha:** 2026-07-15
**Estado:** diseño aprobado por secciones, pendiente review final de Sebastián

## Problema

Probar cadencias, envíos y contactos de punta a punta sin tocar `isps.db`. La corrida del
2026-07-10 se hizo sobre la base real (org 1): funcionó, pero al terminar hubo que archivar 15
campañas y borrar las empresas de prueba a mano, y el estado quedó a medio limpiar (cadencias y
segmentos huérfanos). Peor: una campaña mal segmentada sobre la base real le manda correo a un ISP
de verdad.

**Objetivo:** la misma app, la misma estructura, un toggle. Cuando está en modo prueba, todo lo que
navegues (`/cola`, `/seguimiento`, `/cadencias`) lee y escribe `pruebas.db`, y no hay forma de que
una escritura se escape a la real.

## Decisiones tomadas

| Decisión | Elegido | Descartado (y por qué) |
|---|---|---|
| Aislamiento | Toggle en UI por sesión, misma app | Proceso aparte (no da la UX pedida); ruta `/pruebas` (obliga a construir pantallas nuevas en vez de reusar las que hay) |
| Envíos | **Reales** por Apollo y Evolution | Simulado (solo prueba tu idea de la API, no la API); mixto |
| Datos | Base vacía + seed de 4 contactos | Copia con correos NULeados (un email sobreviviente = correo a un ISP real); copia completa (riesgo máximo) |
| Default del ALS | **Throw si no está declarado** | `?? false` / `?? true`: los dos fallan en silencio |

## Arquitectura

El corte es **identidad siempre real, negocio conmutable**. Salió de los datos, no de la teoría: los
6 importadores de `db` caen a un lado o al otro sin ambigüedad.

```
dbReal (isps.db, fija)          db (Proxy conmutable por request)
├── auth.ts                     └── repository.ts   <- el ÚNICO que conmuta
├── organizacion-repository.ts
├── preferencias-repository.ts
├── preferencias-db.ts
└── panel-tablero-repository.ts
```

Lo que NO cambia: las 5374 líneas de `repository.ts`, las ~50 acciones, y todas las páginas. No
tienen ni un `if (esModoPrueba())`. No pueden olvidarse de chequear porque nunca chequean: la
decisión ocurre en el `get` del Proxy, una capa más abajo. Es el mismo patrón del candado
solo-lectura, que ya demostró cubrir 50 acciones sin gatear ninguna.

### Archivos

- `app/lib/modo-prueba.ts` — **YA ESCRITO.** ALS gemelo de `read-only.ts`. `marcarModoPrueba()` /
  `esModoPrueba()`. Sin default: lanza si nadie declaró el modo.
- `app/db/index.ts` — abre dos conexiones; exporta `dbReal` y `db` (Proxy que compone dos
  responsabilidades: resolver la base por `esModoPrueba()` y aplicar el candado por `esSoloLectura()`).
- `app/lib/session.ts` — `requireSession()` lee la cookie de modo y llama `marcarModoPrueba()`
  **justo después de `getSession`**, antes de cualquier acceso a `db`.
- `app/lib/auth.ts` y los otros 4 de identidad — `db` → `dbReal`. Una línea cada uno.
- `scripts/*.ts` (9 archivos) — `marcarModoPrueba(false)` al arrancar.
- `scripts/seed_pruebas.ts` — NUEVO. Siembra empresas ficticias + contactos + la línea de WhatsApp.

### Por qué el modo va en cookie y no en la base

Una cookie de sesión muere al cerrar el navegador: el modo prueba no se puede quedar pegado sin que
te des cuenta. Mismo bug que ya pasó con `BETTER_AUTH_URL` en `.env.local` el 2026-07-14.

## Datos de prueba (seed)

`pruebas.db` vive al lado de `isps.db` (un nivel arriba del proyecto), con el esquema **replicado
desde `isps.db`** (`.schema | sqlite3 pruebas.db`) y cero filas de negocio. Es imposible mandarle
correo a un ISP real: no existe ninguno.

**No se crea con `npm run migrate`** (verificado 2026-07-15): una base construida desde el journal
tiene 31 tablas y `isps.db` tiene 50 — faltan 19, incluida `cliente`, que `repository.ts` usa 6
veces. `isps.db` se seedeó desde Notion y muchas tablas nunca pasaron por Drizzle, así que el
baseline solo modela lo que está en `schema.ts`. Replicar el esquema real es además lo que manda la
constitución: "NO recrear tablas: reflejar las que hay".

| Persona | WhatsApp | Correo |
|---|---|---|
| Isabela | 3215924704 | sdacostam@eafit.edu.co |
| Felipe | 3112469262 | felipe@onepay.la |
| Camilo | 3102186819 | sacostamolin@gmail.com |
| Sebastián | +12368895214 | sacostamolina@outlook.com |

Las empresas ficticias llevan `empresa.organizacion_activa_id = 1` (columna real, NOT NULL con
default 1) como entero suelto. No hace falta sembrar `organizacion` ni `organizacion_miembro`: la
membresía sale de `dbReal`, y de todos modos `organizacion_miembro.id_user` es texto plano sin
`REFERENCES` y SQLite tiene `foreign_keys = 0`.

## Lo que NO aísla (a propósito)

- **Los envíos salen de verdad.** Apollo manda correo real, Evolution manda WhatsApp real. Es el
  punto de la prueba.
- **La línea de WhatsApp es la misma** (`573105182997`, tu número personal). Se siembra en
  `pruebas.db` apuntando a la misma instancia real de Evolution. No hay aislamiento posible ahí.
- **`requireEscritura()`** ya cubre las acciones que envían sin tocar la DB (el Proxy no las atrapa).

## Testing

1. **Regression del ALS bajo concurrencia.** `read-only.test.ts` ya tiene el patrón: un test que
   cruza un `await` real y otro con dos requests de delays cruzados. Replicarlo para modo prueba:
   dos requests concurrentes (una en prueba, una normal) deben escribir cada una en SU base.
2. **El throw.** Acceder a `db` sin modo declarado lanza.
3. **Identidad no conmuta.** En modo prueba, `auth` y `organizacionDeUsuario` siguen leyendo
   `isps.db`.
4. **Invariante duro:** en modo prueba, `isps.db` no recibe ni una escritura.

## Riesgo cerrado durante el diseño

La memoria decía "candado solo-lectura roto por `enterWith`" (fuga al contexto raíz, pérdida tras el
`await`). **Es falso, verificado el 2026-07-15:** `read-only.test.ts` corrió 6/6 en verde, incluidos
el test que cruza `await` y el de dos requests concurrentes con delays cruzados asertando contra el
Proxy del db. El modo prueba se para sobre este mismo ALS con esa evidencia, no con un supuesto.
Memoria corregida. La señal real para migrar a `run()` sería que esos tests fallen.

## Fuera de alcance

- Ver prueba y real lado a lado en la misma pantalla.
- Copiar volumen realista de empresas a `pruebas.db`.
- Aislar la línea de WhatsApp o el buzón de Apollo.
