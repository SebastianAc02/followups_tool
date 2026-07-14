# Contacto iniciado sin cadencia (toque ad-hoc + historial honesto) — Design

Estado: PROPUESTO (2026-07-14). General para cualquier owner (no gateado como el split de
`/cola`). Nace del caso de Felipe: cuentas en `contacto_iniciado` que no se van a meter a
ninguna cadencia por ahora, y hoy son invisibles porque `colaDelDia` exige fecha.

## Problema

Una empresa en `contacto_iniciado` sin inscripción activa y sin `proximo_follow_up_fecha` no
aparece en ningún lado de la herramienta — `colaDelDia` exige fecha, así que se pierde. El
dueño de esa cuenta (ej. Felipe, que no hace tanta prospección, está más enfocado en cierres)
no tiene forma de saber que existe, ni de registrar un seguimiento suelto (llamada, WhatsApp o
correo) sin crear una campaña completa. Y cuando sí la trabaja, la ficha dice "Sin toques
previos" aunque puede que ya se le haya llamado o escrito ANTES de que existiera la
herramienta — un mensaje falso que puede llevar a re-contactar mal o a asumir que no se sabe
nada de la cuenta.

## Decisiones cerradas con Sebastián (2026-07-14)

1. **General para cualquier owner**, no gateado por owner específico (a diferencia del split
   de `/cola`).
2. **Bandera de "sin seguimiento":** nueva sección en `/cola` — "Contacto iniciado sin
   seguimiento" — para `estado_notion = 'contacto_iniciado'`, sin inscripción activa, sin
   `proximo_follow_up_fecha` (null). No se mezcla con lo que ya tiene fecha (eso ya lo cubre
   la cola normal).
3. **Canales para el toque ad-hoc:** llamada, WhatsApp y correo — los 3 canales existentes.
4. **Promover a campaña:** un botón que pre-llena el asistente existente (`/campanas/nueva`)
   con el segmento ya filtrado, no solo un link en blanco.

## Contexto técnico verificado (mitad de esto ya existe)

- `registrarToqueSueltoAction(idEmpresa, canal, cuerpo)` (`app/llamada/[id]/actions.ts:285`) ya
  registra un toque suelto (sin cadencia) por correo o WhatsApp, con `resultado: 'no_contesto'`
  (el más honesto para un envío sin respuesta todavía). **Le falta**: no recibe ni fija
  `proximoFollowUp` — no hay forma de decir "en 3 días vuelvo a intentar".
- `decidirVista(ctx, searchParams)` (`app/llamada/[id]/ToqueContexto.ts`) decide qué vista
  renderizar (`llamada`/`correo`/`whatsapp`/`confirmacion`). Hoy solo respeta
  `?vista=confirmacion` explícito; para las demás vistas, deriva del canal del paso de cadencia
  ACTIVO, y sin cadencia cae siempre a `llamada`. **Le falta**: no hay forma de pedir
  explícitamente `?vista=correo` o `?vista=whatsapp` sin que haya una cadencia empujando ese
  canal — por eso hoy no se puede "elegir" canal para un toque suelto, aunque el editor que
  recibe ese click ya sabe manejarlo.
- `EditorWhatsapp.tsx`/`EditorCorreo.tsx` ya llaman `registrarToqueSueltoAction` cuando no hay
  paso de cadencia activo (`idPasoInscripcion` null) — el flujo de guardado del toque suelto ya
  funciona, solo falta el intervalo.
- `CapturaLlamada.tsx` (canal llamada) YA tiene el bloque "Próximo toque" (chips +1d/+3d/+1sem +
  date picker) funcionando — el canal llamada no necesita nada nuevo para el intervalo, solo se
  reusa ese patrón en los otros dos editores.
- `SecuenciaRail.tsx`: cuando `pasos.length === 0` ("llamada suelta"), muestra hasta 5 `toques`
  si existen; si no hay ninguno, no dice nada más — el "Sin toques previos" que ve Sebastián en
  `LlamadaCard.tsx` es ese mismo caso. No recibe `estado` de la empresa hoy.
- `empresa.proximoCanal` (columna ya en schema) hoy se llena desde `CapturaLlamada` pero
  reusando el mismo campo `canal` de la llamada actual (no es un valor elegido aparte) — no se
  toca en este plan, el intervalo/canal del toque ad-hoc vive en `proximoFollowUpFecha` +
  la elección de vista (`?vista=`), no en `proximoCanal`.
- `app/campanas/nueva/NuevoSegmento.tsx`/`NuevaCampanaFlujo.tsx` existen y usan
  `definicionSegmentoSchema` (`app/db/validation.ts`) — condiciones tipo `{campo, op, valores}`.
  `'estado'` ya es un campo válido (mapea a `estado_notion`). Hoy no soportan prefill por
  searchParams — se agrega.
- `colaDelDia`/`colaLeads` etc. viven en `app/db/repository.ts`; el patrón de columnas
  compartidas (`columnasCola`) y el filtro por owner opcional son directamente reusables para
  la query nueva.

## Diseño

### A. `colaContactoIniciadoSinSeguimiento(owner, idOrganizacion)`

Query nueva en el Repository, mismo patrón que `colaCierres` (sin filtro de fecha, lista fija):
`estado_notion = 'contacto_iniciado' AND organizacion_activa_id = ? AND owner = ? AND
proximo_follow_up_fecha IS NULL AND NOT EXISTS (inscripción activa para esa empresa)`.

### B. Nueva sección en `/cola` (para TODOS los owners, no solo Sebastián)

Sección "Contacto iniciado sin seguimiento" en `app/cola/page.tsx`, visible para cualquier
owner (dentro y fuera del split), con las filas de la query de la Parte A. Cada fila trae 3
acciones: **Llamar** / **WhatsApp** / **Correo**, cada una un link a
`/llamada/[id]?vista=llamada|correo|whatsapp`.

### C. `decidirVista` respeta `?vista=` explícito

```ts
export function decidirVista(ctx: ContextoToque, searchParams: { vista?: string }): VistaToque {
  if (searchParams.vista === 'confirmacion') return 'confirmacion';
  if (searchParams.vista === 'correo' || searchParams.vista === 'whatsapp' || searchParams.vista === 'llamada') {
    return searchParams.vista;
  }
  const pasoActivo = ctx.secuencia.find((p) => p.estado === 'activo');
  return CANAL_A_VISTA[pasoActivo?.canal ?? ''] ?? 'llamada';
}
```

El `?vista=` explícito solo tiene sentido cuando NO hay paso activo empujando un canal
distinto (si hay cadencia, esa sigue mandando) — se documenta la precedencia en el plan con un
test que cubra ambos casos.

### D. Intervalo del próximo toque en toques sueltos

- `registrarToqueSueltoAction` gana un parámetro `proximoFollowUp?: string`, lo pasa a
  `registrarToqueSchema.parse(...)`.
- Se extrae el bloque "Próximo toque" de `CapturaLlamada.tsx` (chips +1d/+3d/+1sem + date
  picker) a un componente chico compartido, usado por `CapturaLlamada`, `EditorWhatsapp` y
  `EditorCorreo` — evita triplicar ese bloque.

### E. Banner de historial incompleto

`SecuenciaRail.tsx` gana un prop `estado: string | null`. Cuando `pasos.length === 0` y
`estado !== 'lead' && estado != null`, se muestra, ANTES de la lista de `toques`:

> "Hay historial que no se guardó en la herramienta — esta cuenta se empezó a tocar antes."

Si además hay `toques` reales, se listan debajo (ya funciona); si no hay ninguno, el banner
queda solo, honesto (no dice "Sin toques previos", que implica que sabemos que no hubo nada).
`lead` no muestra el banner: es la única etapa donde la herramienta sabe con certeza que el
ciclo de vida está completo (nunca se trabajó fuera de ella).

### F. Promover a campaña

Botón en la sección B (visible cuando hay 1+ filas) que navega a
`/campanas/nueva?estado=contacto_iniciado&owner=<owner>`. `NuevoSegmento.tsx` lee esos
searchParams al montar y si vienen, siembra la condición inicial
`{campo:'estado', op:'en', valores:['contacto_iniciado']}` (+ `{campo:'owner', op:'en',
valores:[owner]}` si vino owner) en vez de arrancar vacío. El resto del asistente (elegir
cadencia, revisar, lanzar) sigue igual — no se automatiza el lanzamiento.

## Qué NO se construye (YAGNI)

- No se toca `empresa.proximoCanal` ni su semántica actual.
- No se automatiza la creación/lanzamiento de la campaña — el botón solo pre-llena el
  segmento, Sebastián/Felipe siguen decidiendo cadencia y confirmando.
- No se construye multipersona en la UI (el owner sigue siendo 1:1 con la sesión).
- El banner de historial no intenta reconstruir o inferir el historial faltante — solo avisa
  que puede existir.

## Pruebas

- `colaContactoIniciadoSinSeguimiento`: seed con/sin inscripción activa, con/sin fecha, otro
  owner — verifica que solo trae lo que corresponde.
- `decidirVista`: los 3 casos nuevos (`?vista=correo`/`whatsapp`/`llamada` sin paso activo) +
  regresión de que un paso activo real sigue ganando sobre un `?vista=` que no coincide (o se
  documenta cuál gana, con test).
- `registrarToqueSueltoAction`: test de que `proximoFollowUp` queda guardado en el toque y en
  `empresa.proximo_follow_up_fecha`.
- Componente de banner (`SecuenciaRail`): sin infra de testing de React — verificación manual.
- Prefill de `NuevoSegmento`: test si la lógica de parseo de searchParams es una función pura
  extraíble; si no, verificación manual.

## Riesgos / notas

- La nueva sección de `/cola` es visible para TODOS los owners (a diferencia de todo lo demás
  hecho hoy) — mayor superficie de cambio; se verifica que no rompe nada para owners sin
  ninguna cuenta en ese estado (sección simplemente no aparece, `length === 0`).
- El prefill de `NuevoSegmento` es la pieza menos explorada (no hay precedente en el código) —
  el plan debe leer ese componente a fondo antes de tocarlo.
- **Verificado:** `SecuenciaRail` lo usan tanto `LlamadaCard.tsx` (llamada) como
  `ToqueShell.tsx` (correo/whatsapp) — un solo cambio en `SecuenciaRail` cubre el banner de
  historial en los 3 canales, no hace falta tocar cada vista por separado.
