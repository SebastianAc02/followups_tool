# Gate de canal al armar/lanzar campañas + ruteo de WhatsApp por línea propia — Design

Estado: PROPUESTO (2026-07-14). Aprobado en conversación por Sebastián, pendiente de convertir
en plan de implementación.

## Problema

Hoy cualquier usuario puede armar y lanzar una cadencia con pasos de correo o WhatsApp sin
importar si tiene ese canal listo. Dos síntomas concretos:

1. **Correo**: sale siempre por Apollo, una sola cuenta compartida (memoria
   `reference_apollo_sender_name_seat`: 3 buzones, todos a nombre de una sola persona, no
   editable por usuario ni por API). Si Felipe lanza una cadencia de correo, el mensaje sale
   con el nombre de otra persona — un problema de confianza con el prospecto, no un bug técnico.
2. **WhatsApp**: cada usuario conecta su propio número en `/conectores` (`linea_whatsapp.
   id_usuario`), pero el envío real (`lineaWhatsappActiva()`, `app/db/repository.ts:3259`)
   resuelve **una sola línea activa para todo el sistema**, sin importar quién lanzó la
   campaña. Si Felipe no tiene línea propia conectada, su cadencia de WhatsApp de todos modos
   "funciona" — pero sale por la línea de otra persona, no la suya.

No hay ningún guardrail hoy: nada impide armar/lanzar una cadencia con canales que el usuario
que la lanza no tiene realmente disponibles a su nombre.

## Contexto verificado

- `app/core/canales-empresa.ts` ya tiene un concepto de "readiness" — pero es **por empresa**
  (¿tiene la empresa email/teléfono?), no por usuario. Este gate es un eje distinto: ¿tiene
  el usuario que lanza el canal configurado a su nombre?
- `app/conectores/catalogo.ts`: Apollo es conector modo `admin` (credencial única de equipo).
  WhatsApp también es modo `admin` para la credencial del **servidor** Evolution (el API key
  compartido), pero las **líneas** (`linea_whatsapp`) son per-usuario, gestionadas aparte
  (`app/conectores/lineas-whatsapp-actions.ts`, `lineasWhatsappDeUsuario(idUsuario)`).
- `app/campanas/[id]/lanzar/actions.ts:72` (`lanzarCampanaAction`) ya tiene el patrón de
  devolver `{ ok: false, error }` sin inscribir nada — el gate se integra ahí sin inventar un
  patrón nuevo.
- `app/db/repository.ts:3426` (`pasoInscripcionesPendientes`): para WhatsApp, resuelve
  `lineaWhatsappActiva()` **una vez por corrida completa** y la reusa para las filas de
  **todas las campañas mezcladas**. El comentario en el código lo dice explícito: "nunca
  contra campaña". Este es el punto que hay que reescribir para el ruteo por dueño.
- `campana.owner` (columna `TEXT`, ya existe en el schema) **nunca se puebla hoy** — no hay
  ningún INSERT/UPDATE que lo toque en `app/campanas/nueva/actions.ts` ni en
  `lanzarCampanaAction`.
- `organizacion_miembro` ya mapea `owner_canonico` (texto, ej. "Felipe Castro") ↔ `id_user`
  (better-auth). `user.owner` guarda el mismo `owner_canonico`. Es la misma convención que
  `empresa.owner` (memoria `project_ownership_dos_niveles`).

## Decisiones cerradas con Sebastián (2026-07-14)

1. **Correo**: bloquea siempre, sin excepción, con mensaje "habla con el admin" (no hay nada
   que conectar en `/conectores` para correo — no se manda a esa página).
2. **WhatsApp**: bloquea si el usuario que lanza no tiene ninguna línea propia con
   `estado='activa'` en `lineasWhatsappDeUsuario(sesion.id)`. Mensaje apunta a `/conectores`.
3. **Llamada**: nunca bloquea (no requiere conector).
4. **Dos puntos de gate**:
   - Al armar la cadencia (`/campanas/nueva`): aviso **no bloqueante**, mismo lugar visual que
     `ReadinessBadge.tsx` (readiness por empresa).
   - Al lanzar (`lanzarCampanaAction`): bloqueo **duro**, antes de `inscribirCampana`.
5. **Alcance ampliado, en dos piezas separadas** (evita un solo cambio grande y riesgoso):
   - Pieza A: el gate (chico, seguro, solo valida — no cambia el envío real).
   - Pieza B: ruteo real del worker por línea del dueño de la campaña (toca
     `pasoInscripcionesPendientes`/`push.ts`, que ya corren en producción).

## Diseño

### Pieza A — Gate

**Función pura nueva** en `app/core/readiness-canal-usuario.ts` (nombre tentativo):

```ts
export type VeredictoCanal =
  | { listo: true }
  | { listo: false; motivo: string; accion: 'ir_a_conectores' | 'hablar_con_admin' };

export function readinessCanalUsuario(
  canal: Canal,
  tieneLineaWhatsappActiva: boolean,
): VeredictoCanal
```

Sin `requireSession()` ni DB adentro — coherente con "el core no importa el driver de DB"
(CLAUDE.md). Quien llama (server action) ya resolvió `tieneLineaWhatsappActiva` vía
`lineasWhatsappDeUsuario(sesion.id).some(l => l.estado === 'activa')` y se lo pasa resuelto.

Reglas:
- `canal === 'correo'` → siempre `{ listo: false, motivo: '...', accion: 'hablar_con_admin' }`.
- `canal === 'whatsapp'` → `listo: tieneLineaWhatsappActiva`, si no, `accion: 'ir_a_conectores'`.
- `canal === 'llamada'` → siempre `{ listo: true }`.

**Integración en `/campanas/nueva`**: junto al `ReadinessBadge.tsx` existente, un aviso (no
bloqueante) por cada canal presente en los pasos elegidos. Reusa el mismo patrón visual
(badge/pill), no bloquea el guardado del borrador.

**Integración en `lanzarCampanaAction`** (`app/campanas/[id]/lanzar/actions.ts:72`): antes de
`actualizarConfigLanzamiento`/`inscribirCampana`, se resuelven los canales de la cadencia
(`canalesDeCadencia`, ya importado en ese archivo) y se corre `readinessCanalUsuario` por cada
uno. Si alguno no está listo, `return { ok: false, error }` sin tocar la DB — mismo contrato
que ya usa la función para otros errores.

### Pieza B — Ruteo por línea propia

1. **Poblar `campana.owner`**: en `lanzarCampanaAction`, al lanzar, `campana.owner =
   sesion.owner` (el `owner_canonico` de quien lanza — mismo campo que ya usa `user.owner`).
2. **Reescribir `pasoInscripcionesPendientes(canal, ahora)`** para WhatsApp: en vez de resolver
   una `lineaActiva` global y aplicarla a todas las filas, agrupa las campañas pendientes por
   la línea del dueño:
   - Por cada campaña con filas pendientes de whatsapp: resolver `campana.owner` →
     `organizacion_miembro` (por `owner_canonico`) → `id_user` → `lineasWhatsappDeUsuario(id_user)`
     con `estado='activa'`.
   - Una campaña cuyo dueño no tiene línea propia activa se salta entera (mismo criterio que
     hoy: "sin línea activa, no hay a dónde mandar" — antes era global, ahora es por campaña).
   - Una campaña sin `owner` poblado (dato viejo, de antes de este cambio) cae a la línea de
     pool si existe una (`lineasWhatsappPool()`), como fallback de transición — así no se
     rompen campañas ya lanzadas antes de este cambio.
3. **`push.ts`**: en vez de una sola llamada a `enviarPaso` con la línea global fija, itera por
   grupo (línea → filas de esa línea) y llama `enviarPaso` una vez por grupo.

## Testing

- `readiness-canal-usuario.test.ts`: tabla de casos (canal × tiene-línea) → veredicto esperado.
  Puro, sin DB.
- `lanzarCampanaAction`: caso "cadencia con paso de correo → siempre bloquea"; caso "cadencia
  de whatsapp sin línea propia → bloquea"; caso "con línea propia activa → pasa".
- `pasoInscripcionesPendientes`: caso con dos campañas de whatsapp, dueños distintos, cada uno
  con su propia línea activa → cada grupo se resuelve contra SU línea, no se mezclan. Caso
  "dueño sin línea propia" → esa campaña se salta, las demás no se afectan. Caso "campaña sin
  owner (dato viejo)" → cae al fallback de pool.

## Fuera de alcance (v1)

- No se resuelve qué pasa si un usuario tiene más de una línea activa (hoy la UI ya limita a
  una por usuario en la práctica, aunque el modelo lo permite).
- No se construye ningún flujo de "pedir acceso a correo" — el bloqueo de correo es permanente
  hasta que Apollo soporte multi-buzón real (decisión de negocio, no de este cambio).
