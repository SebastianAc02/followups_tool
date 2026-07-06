# Spec: Registro con organización y selección de identidad

Fecha: 2026-07-06
Rama: fase4-cadencias (o rama nueva a decidir en el plan)

## Problema

Hoy no existe registro self-service. Las cuentas solo se crean con
`scripts/seed_auth_users.ts`, a mano, con `owner` hardcodeado en el script
(`app/lib/auth.ts:12` tiene `disableSignUp` prendido salvo `ALLOW_SIGNUP=1`).
Solo Sebastián tiene cuenta hoy. Thomas, Felipe y Camilo no pueden entrar solos.

## Qué se construye

Una pantalla `/register` self-service real (crea cuentas de verdad, con
correo + contraseña) donde el usuario:

1. Ve arriba **Organización: Onepay** (fija, no elegible por ahora).
2. Ve abajo **Quién eres tú**: un dropdown con los nombres de esa
   organización que **todavía nadie ha reclamado**. Si Felipe ya se
   registró, su nombre desaparece de la lista para los demás.
3. Elige su nombre, pone correo y contraseña, y al enviar se crea la cuenta
   y ese nombre queda reclamado (nadie más lo puede elegir después).

Además, en la pantalla de entrar (`/login`) actual se agrega:
- Un enlace "Crear cuenta" que lleva a `/register`.
- Un checkbox "Recordar sesión" (mapea a `rememberMe` de Better Auth).

## Modelo de datos (2 tablas nuevas en isps.db, via Drizzle)

**`organizacion`**
- `id` (pk)
- `nombre` (text, ej. "Onepay")

**`organizacion_miembro`**
- `id` (pk)
- `id_organizacion` (fk -> organizacion.id)
- `owner_canonico` (text, EXACTO como está en `empresa.owner` — incluye
  mayúsculas/minúsculas reales, ej. `"Camilo fonseca"` con f minúscula)
- `nombre_display` (text, nombre bonito para mostrar, ej. "Camilo Fonseca")
- `id_user` (text, nullable, fk -> user.id; NULL = nadie lo ha reclamado)

Seed inicial (organización Onepay, 4 miembros), con los owners canónicos
confirmados hoy en isps.db vía consulta directa:

| nombre_display     | owner_canonico            | reclamado hoy      |
|---------------------|----------------------------|---------------------|
| Sebastián Acosta     | `Sebastian Acosta Molina`  | sí (ya tiene cuenta, id_user apunta a su user.id existente) |
| Thomas Schumacher    | `Thomas Schumacher`        | no |
| Felipe Castro        | `Felipe Castro`            | no |
| Camilo Fonseca       | `Camilo fonseca`           | no (ojo: f minúscula en el owner_canonico) |

Fuera de alcance: otros valores de `empresa.owner` vistos en la base
("Manuel H.", combinaciones como "Felipe Castro, Thomas Schumacher") no
entran como miembros — son casos raros de datos históricos, no personas
activas del equipo.

## Flujo de registro (seguridad del owner)

El cliente **nunca** manda el string de owner como texto libre. El
dropdown manda el `id` del `organizacion_miembro` elegido. El servidor:

1. Verifica que ese miembro exista y tenga `id_user` NULL (nadie lo tomó
   entre que cargó la pantalla y que envió el form — evitar carrera).
2. Crea el usuario vía `auth.api.signUpEmail`.
3. En la misma operación, setea `user.owner = owner_canonico` del miembro
   y `organizacion_miembro.id_user = <nuevo user.id>`.

Esto reemplaza al script de seed como única vía de escritura de `owner`,
pero mantiene el mismo invariante: el cliente nunca decide el string
directamente, solo elige de una lista que el servidor controla y valida.

## Cambios a `app/lib/auth.ts`

- `disableSignUp` pasa a `false` (registro abierto, ya no depende de
  `ALLOW_SIGNUP=1`).
- El campo `owner` sigue con `input: false` (no se puede mandar como
  string libre desde el cliente vía la API de Better Auth estándar). El
  registro real corre por un server action propio que hace el signup y
  luego setea `owner` directo en DB (mismo patrón que ya usa
  `scripts/seed_auth_users.ts`), no por el campo adicional de Better Auth.

## UI

**`/register` (nueva)**
- Página + form cliente, mismo patrón que `/login` + `LoginForm.tsx`.
- Campo fijo "Organización: Onepay" (texto, no input — no hay más orgs).
- Select "Quién eres tú" con los miembros libres (fetch server-side al
  cargar la página).
- Inputs correo + contraseña.
- Botón "Crear cuenta" (y estado "Creando...").
- Errores: correo ya registrado, miembro ya reclamado (recargar lista).

**`/login` (existente, edición)**
- Agregar link "¿No tienes cuenta? Crear cuenta" -> `/register`.
- Agregar checkbox "Recordar sesión" antes del botón, pasado a
  `authClient.signIn.email({ ..., rememberMe: checked })`.

## Fuera de alcance (v1 de este cambio)

- Multi-organización real (solo existe Onepay).
- Invitación o llave de acceso para registrarse (registro queda abierto a
  cualquiera con la URL; se puede cerrar después si la app se expone).
- Editar/administrar miembros desde la UI (se hace por seed/migración).
- Recuperar contraseña, verificación de correo.
- Los owners "raros" de la tabla `empresa` (Manuel H., combinados).

## Riesgo aceptado

Registro abierto: cualquiera con la URL puede crear una cuenta y elegir
cualquier nombre libre de la lista. Para 4 personas de un equipo interno
se acepta este riesgo por ahora (decisión explícita del owner del
proyecto, 2026-07-06).
