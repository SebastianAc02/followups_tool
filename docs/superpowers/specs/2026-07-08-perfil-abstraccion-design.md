# Perfil: abstracción de identidad + presentación + preferencias

Fecha: 2026-07-08
Estado: diseño aprobado, pendiente de implementar
Owner: Sebastián

## Problema

El cockpit muestra un avatar con iniciales en la esquina superior derecha
(`app/ui/shell/TopBar.tsx`), pero no tiene perfil: el avatar es un `<span>` estático,
no hay ruta `/perfil`, no hay menú, y no hay forma de cerrar sesión desde el shell
rediseñado (el `SignOutButton` funciona pero su único consumidor, `TopNav.tsx`, es
código muerto que ya nadie importa).

Además la misma identidad se deriva en varios lugares sin una fuente única:
- `iniciales()` en `app/ui/shell/AppShell.tsx`
- `saludo()` (primer nombre) en `app/page.tsx`
- `owner` se pasa a mano por todo el árbol de componentes.

El pedido no es "una página de perfil". Es introducir una **abstracción `Perfil`**:
una fuente única de todo lo que la app sabe de la persona actual, que TopBar, el
saludo, el sidebar, el menú y la página nueva **lean** en vez de re-derivar.

## Qué existe hoy (base sobre la que se construye)

- Identidad: `UsuarioSesion = { id, email, owner, admin }` en `app/lib/session-user.ts`,
  derivada de Better Auth. `owner` es el nombre canónico de `empresa.owner`
  (ej. "Sebastian Acosta Molina"). Es la frontera del adapter de auth. No se re-envuelve.
- Sesión: `requireSession()` en `app/lib/session.ts`.
- Loader de shell: `datosSidebar()` en `app/ui/shell/AppShell.tsx` ya agrega datos
  server-side. `cargarPerfil()` será su gemelo.
- Puertos existentes como referencia de estilo: `IAPort` (`app/core/ports/ia.ts`),
  `SyncAdapter` (`app/core/ports/sync.ts`), `TranscriptAdapter`. Interfaces minúsculas,
  un método, el core define el QUÉ y el adapter el CÓMO.
- Logout: `app/SignOutButton.tsx` (client, `authClient.signOut()`), hoy huérfano.
- Panel admin: ruta `/panel`, gateada por `usuario.admin`.
- Organización: `organizacion_miembro` mapea user -> ownerCanonico -> nombreDisplay.

## Arquitectura SOLID

La arquitectura del repo ya es hexagonal (ports & adapters), que en el fondo es DIP
aplicado a todo el sistema. "Hacerlo SOLID" aquí es seguir ese patrón y separar tres
responsabilidades que hoy están mezcladas, sin abstraer de más.

### Tres unidades, tres razones de cambio (SRP)

| Unidad | Responsabilidad única | Archivo |
|---|---|---|
| `construirPerfil(identidad, prefs) -> Perfil` | Derivar presentación (iniciales, primer nombre, color, rol). Pura, sin I/O. | `app/core/perfil.ts` (NUEVO) |
| Puertos de preferencias | Contrato de qué necesita/escribe el perfil afuera | `app/core/ports/preferencias.ts` (NUEVO) |
| `cargarPerfil()` | Componer: sesión + adapter de prefs -> `construirPerfil` | `app/lib/perfil.ts` (NUEVO) |

### Contratos (core)

En `app/core/perfil.ts`:
- `type Preferencias` — datos de preferencia ya resueltos (con defaults aplicados).
- `type Perfil` — el view-model estable que todos los consumidores leen.
- `construirPerfil(identidad, preferencias): Perfil` — función pura.

En `app/core/ports/preferencias.ts` (mismo estilo que `IAPort`/`SyncAdapter`, dos
interfaces separadas por ISP):
- `interface LeerPreferencias { leer(idUser: string): Promise<Preferencias> }`
- `interface GuardarPreferencias { guardar(idUser: string, cambios: PreferenciasParciales): Promise<void> }`

### Cómo cae cada letra de SOLID

- DIP: el core define las interfaces; el **Repository las implementa**; el core nunca
  importa Drizzle. El loader inyecta el adapter concreto en el borde.
- ISP: lectura y escritura son puertos separados. La página/menú de solo lectura
  (Fase 1) depende solo de `LeerPreferencias`; nunca ve el método de escribir.
- OCP: los consumidores dependen del **tipo `Perfil`**, no de `UsuarioSesion` ni de
  shapes del repo. Agregar un campo extiende el builder + el tipo; los consumidores
  no se tocan salvo que quieran mostrarlo.
- LSP: `leer()` SIEMPRE devuelve `Preferencias` con defaults cuando no hay fila
  (nunca null, nunca throw por "no existe"). El repo real, un doble en memoria para
  tests, y el futuro adapter de Turso son sustituibles; `construirPerfil` jamás
  ramifica por "falta el dato".
- SRP: fetch, derivación y render separados (ver tabla).

### Dónde NO se abstrae (a propósito)

- Sin `PerfilPort`: `construirPerfil` es pura con una sola forma de derivar. Interfaz
  ahí sería abstracción especulativa.
- Sin `LogoutPort`: cerrar sesión es un call sobre `authClient`. Puerto para un solo
  call es YAGNI.
- Identidad no se re-envuelve: `UsuarioSesion` + `usuarioDeSesion` ya son la frontera
  del adapter de auth. El perfil la consume.

### Flujo de datos

```
requireSession() ---------> UsuarioSesion (identidad)
                                   |
Repository (impl LeerPreferencias) |
        leer(idUser) ---> Preferencias
                                   |
                                   v
             construirPerfil(identidad, preferencias)  [core, puro]
                                   |
                                   v
                                Perfil  <---- consumido por:
                                             TopBar (avatar + PerfilMenu)
                                             saludo (page.tsx)
                                             Sidebar (ownerNombre)
                                             /perfil (hub)
```

`cargarPerfil()` en `app/lib/perfil.ts` es el único punto de composición: llama
`requireSession()`, obtiene el adapter de prefs, y devuelve `Perfil`.

## Fases

Elegiste el hub de cuenta completo. Es multi-fase; Fase 1 entrega el pedido central.

### Fase 1 — Abstracción + menú + página + logout (lo que ship-ea el pedido)

1. Core: `type Perfil`, `type Preferencias`, `construirPerfil()` puro + tests.
2. Core: `app/core/ports/preferencias.ts` con `LeerPreferencias` (y `GuardarPreferencias`
   declarada para Fase 2).
3. Adapter Fase 1: implementación de `LeerPreferencias` que devuelve **defaults**
   (todavía sin tabla; LSP garantiza que Fase 2 la reemplace sin tocar consumidores).
4. Loader: `app/lib/perfil.ts` con `cargarPerfil()`.
5. Refactor: `TopBar`, `AppShell` (saludo/sidebar) y `page.tsx` dejan de re-derivar y
   consumen `Perfil`. Se borra la duplicación de `iniciales()`/`saludo()`.
6. UI menú: avatar pasa de `<span>` a `<button>`; nueva isla cliente
   `app/ui/shell/PerfilMenu.tsx` (dropdown: nombre, email, rol, "Ver perfil",
   "Cerrar sesión" reusando `authClient.signOut()`).
7. UI página: ruta `app/perfil/page.tsx` dentro del `AppShell`, solo lectura:
   identidad, organización, estado de conectores (solo lectura), enlace a `/panel`
   si es admin.

Entregable: perfil abstracto, consumido por varias partes, con menú + página, y de
paso recupera el logout perdido.

### Fase 2 — Editable + preferencias persistidas

1. Tabla `preferencia_usuario` (una fila por user, columnas tipadas nullable):
   `id_user` (PK), `color_avatar`, `vista_inicio`, `updated_at`. Defaults en el builder.
2. Repository implementa de verdad `LeerPreferencias` + `GuardarPreferencias`
   (reemplaza el adapter de defaults de Fase 1).
3. Server actions de edición: color de avatar, vista de inicio, cambio de contraseña
   (vía Better Auth). Validación. Estos actions dependen de `GuardarPreferencias`.
4. Decisión abierta para Fase 2: editar "nombre display" toca `organizacion_miembro.nombreDisplay`
   vs `user.name` de Better Auth. Resolver al llegar, no ahora.
5. Preferencias NO van a Notion: son ajustes locales del usuario, no dato de dominio.
   El Outbox no se toca.

### Fase 3 — Admin / organización en el hub

Miembros de la organización (admin-only), probablemente enlazando al `/panel` que ya
existe en vez de reconstruirlo.

## Pruebas

- `app/core/perfil.test.ts`: builder puro. Casos: iniciales de uno y dos nombres,
  nombre con un solo token, primer nombre para el saludo, rol admin vs no, defaults
  de preferencias aplicados.
- Doble en memoria de `LeerPreferencias` para tests del loader/consumidores.
- Fase 2: tests del repo real de preferencias (leer con y sin fila, guardar parcial).

## Modo learning (constitución)

`construirPerfil()` y la forma exacta del tipo `Perfil` son core/dominio con una
decisión real de diseño. Al implementar Fase 1, la IA deja `construirPerfil` con la
firma + comentarios + un TODO, y Sebastián escribe el cuerpo (la derivación y los
campos del contrato), no la IA. El boilerplate alrededor (loader, refactor de
consumidores, menú, página) sí lo hace la IA directo. Checkpoint al cerrar Fase 1:
Sebastián explica de vuelta por qué el builder es puro y qué gana la abstracción.

## Fuera de alcance

- Sync de preferencias a Notion.
- Multipersona en la UI (sigue fuera de v1 por constitución).
- Reconstruir el panel admin (Fase 3 enlaza al existente).
- Puertos para identidad o logout (ya abstraídos / YAGNI).

## Convención de estilo

Textos visibles para humanos (labels del menú, página): voz ejecutiva, español
directo, sin emojis, sin em dashes. Owner = Sebastián.
