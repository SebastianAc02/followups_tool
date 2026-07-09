# Plan de fixes UI — 2026-07-08

Cuatro fixes de UI reportados por Sebastián. Este documento es solo el plan: qué está
pasando, qué archivos toca cada uno y cómo se resolvería. No se ejecuta todavía.

---

## Fix 1 — Sidebar: flyout incómodo y conectores que "saltan"

### Qué está pasando
El sidebar tiene dos estados (`app/ui/shell/Sidebar.tsx`):

- **Fijado (pinned):** el sidebar es `relative`, vive dentro del flujo flex del shell y ocupa
  toda la altura. El panel de "Conectores" queda pegado abajo con `mt-auto`.
- **Oculto (no pinned):** el sidebar pasa a `fixed left-0 top-0 h-full` y se esconde con
  `-translate-x-full`. Aparece como flyout al pasar el mouse por una franja de borde de
  **12px** (`w-3`, línea 69).

Dos molestias concretas:

1. **La franja de disparo es muy delgada (12px).** Toca llevar el cursor casi al filo
   exacto de la pantalla para que el sidebar salga; si te pasas unos pixeles, no aparece.
   Se siente como pelear con el borde.
2. **Los conectores "suben" / se ven raros al cambiar de estado.** Como el bloque de
   conectores está anclado con `mt-auto` al fondo, entre el estado docked y el flyout
   flotante la posición vertical del bloque cambia respecto al contenido que hay debajo,
   y queda un hueco grande entre el nav de módulos y el panel de conectores. El salto se
   nota y da sensación de layout mal cuadrado. (Nota: en dev también aparece el botón
   circular de Next.js abajo a la izquierda encima del conector de Notion; eso es solo del
   entorno de desarrollo, no del diseño, pero contribuye a que se vea "sucio" en esa zona.)

### Archivos que toca
- `app/ui/shell/Sidebar.tsx` (único archivo real del fix).

### Cómo se resolvería
- **Franja de disparo:** ensanchar la zona de hover invisible de `w-3` a algo cómodo
  (`w-4`/`w-6`, ~16–24px) o separar la zona de disparo (ancha, invisible) del borde visible.
  Objetivo: que el sidebar salga sin tener que clavar el mouse en el filo.
- **Salto de conectores:** unificar cómo se ancla el bloque de conectores para que su
  posición no cambie entre docked y flyout. Revisar que en ambos estados el contenedor tenga
  la misma altura de referencia y que `mt-auto` no genere el hueco. Posible: mantener el
  panel de conectores siempre pegado al fondo del sidebar con la misma altura de columna en
  los dos estados.
- Es un fix mecánico de CSS/Tailwind, sin decisión de arquitectura.

---

## Fix 2 — Pipeline por etapa (home): segmentos "supermetidos" ilegibles

### Qué está pasando
La barra del pipeline en el home (`app/ui/home/PipelineBar.tsx`) calcula el ancho de cada
segmento como `(n / total) * 100%`. Las etapas con conteo pequeño (ej. Reunión=5,
Oportunidad, Contrato=3) quedan como franjas **muy delgadas**: el número adentro queda
apretado y el label de abajo se corta con `truncate`, quedando como "R", "Opor...", "Cie...".
Eso es lo "supermetido": segmentos tan angostos que ni el número ni el nombre se leen, y la
barra se ve rota en esa zona.

Etapas reales (de `app/db/funnel.ts`): Lead, Contactado, Reunión, Oportunidad, Contrato,
Cierre, Firma y pago. Los conteos son muy desiguales, así que siempre habrá segmentos
diminutos al lado de uno enorme.

### Archivos que toca
- `app/ui/home/PipelineBar.tsx` (principal).
- Referencia (no se modifica): `app/db/funnel.ts` para labels/colores.

### Cómo se resolvería
Opciones (elegir una al implementar):
- **A — Ancho mínimo por segmento:** darle un `min-width` a cada segmento para que ningún
  número/label quede clipeado; el ancho proporcional se mantiene por encima de ese piso.
- **B — Leyenda aparte:** dejar la barra como puras proporciones (sin texto adentro) y mover
  números + labels a una fila de leyenda debajo (chips: color + etapa + n), que nunca se corta.
- **C — Número dentro solo si cabe, label en hover/tooltip:** ocultar el label bajo segmentos
  angostos y mostrarlo en hover.

**Decidido (2026-07-08): opción B — leyenda de chips.** La barra queda como puras
proporciones (sin texto adentro) y números + etapas van en una fila de chips debajo que nunca
se corta. Es la que mejor escala con conteos desiguales y la más consistente con el resto de
la app.

---

## Fix 3 — /cola: rediseño para alinearla con el resto de la app + modo foco

### Qué está pasando
La /cola usa **otro sistema visual** que el resto de la app. Todo lo demás entra por
`AppShell` (sidebar + `TopBar` + tarjetas `bg-card`, mismo lenguaje de campañas y "Llamar
ahora"). En cambio `/cola` (`app/cola/page.tsx`) entra por `SidebarFrame` (sin TopBar) y
monta su propio `DashboardHeader` — una traducción literal de un mockup viejo (Arc) con
tipografía **serif** grande. Síntomas puntuales que reportó Sebastián:

1. **Saludo redundante y "raro".** `DashboardHeader` pone un `saludoPorHora` serif enorme
   ("Buenas tardes, Sebastián"). El home ya saluda ("Buen miércoles, Sebastián") y el TopBar
   ya muestra fecha/hora. Es un tercer saludo con voz distinta.
2. **"Tu agenda de hoy" se ve raro.** El bloque `AgendaHoy` con su header serif y el nav
   ancla ("Ahora" / "Tu agenda de hoy") no calza con el resto.
3. **La tarjeta grande (BarraAhora) no comunica que es el próximo paso.** Hoy dice "Ahora"
   pero visualmente no queda claro que ESA es la siguiente acción; se lee como una tarjeta más.
4. **Falta un modo foco.** Sebastián quiere un toggle para: (a) hacer blur del resto y
   enfocarse solo en el próximo paso, o (b) ver toda la agenda.
5. **El form de tap en hover se ve mal.** Al pasar el mouse sobre una fila de la agenda
   aparece un formulario inline ("Objeción (opcional)" + botones WhatsApp / Correo,
   `app/cola/AgendaHoy.tsx` líneas 88–104). Es un tap rápido real: llama a `registrarTapAction`
   para registrar un toque sin abrir la ficha. Pero visualmente se ve improvisado y estorba.
6. **Filas sin separación.** Las filas de la agenda están en un `flex flex-col` sin divisores
   ni espacio entre ellas (líneas 49–108). Se funden, y al ir a entrar a una cuenta no queda
   claro a cuál vas a entrar (falta feedback claro de fila-objetivo).

### Archivos que toca
- `app/cola/page.tsx` — cambiar `SidebarFrame` por `AppShell` (para heredar TopBar y el shell
  común), reordenar la composición.
- `app/cola/DashboardHeader.tsx` — retirar o reducir fuerte: quitar el saludo serif y el nav
  ancla; conservar solo lo útil (stats pendientes/cerradas/vencidas) como una fila de stats al
  estilo del home (`StatCard`), o eliminarlo si el TopBar + un encabezado corto bastan.
- `app/cola/BarraAhora.tsx` — reestilizar al lenguaje de tarjetas de la app (`bg-card`,
  bordes `line-card`, botones `button.variants`) y marcarla claramente como "Próximo paso"
  (etiqueta + jerarquía visual, no serif suelto).
- `app/cola/AgendaHoy.tsx` — alinear header y filas al sistema de tarjetas del home; aquí
  vive el nuevo toggle de modo foco.
- Referencia de estilo a imitar (no se modifican): `app/ui/home/StatCard.tsx`,
  `app/ui/home/CampaignRow.tsx`, `app/page.tsx`, `app/ui/shell/TopBar.tsx`.

### Propuesta de la nueva /cola
Estructura, de arriba a abajo, dentro de `AppShell` (con TopBar del sistema):

1. **Encabezado corto** (no serif, estilo home): un título tipo "Toques de hoy" + subtítulo
   corto. Sin re-saludar (el home ya saluda; el TopBar ya da fecha). Elimina el choque #1.
2. **Fila de stats** reusando `StatCard` (Pendientes / Cerradas / Vencidas), igual que el
   metric strip del home, en vez de los `Stat` inline serif del DashboardHeader actual.
3. **Tarjeta "Próximo paso"** (BarraAhora reestilizada): borde de acento + etiqueta explícita
   "PRÓXIMO PASO", empresa, contacto, canal y los CTA ("Llamar ahora" / "Abrir ficha") con el
   mismo `button.variants` del resto. Que se lea sin duda como LA siguiente acción.
4. **Toggle de modo foco** (arriba de la agenda): dos estados —
   - **Foco:** se resalta el próximo paso; **solo la lista de la agenda se atenúa** (blur +
     opacidad reducida, `pointer-events` off). Las stats y la tarjeta del próximo paso quedan
     nítidas.
   - **Agenda completa:** todo nítido, la lista completa visible.
   Estado guardado en `localStorage` (mismo patrón que el pin del sidebar).
   **Default (decidido 2026-07-08): arranca en modo Foco.**
5. **Agenda del día** (`AgendaHoy`) con filas al estilo tarjeta del home; chips de filtro por
   canal se conservan (funcionan bien). Dos mejoras concretas de esta lista:
   - **Separación entre cuentas:** dar a cada fila su propia afordancia de tarjeta (fondo
     `bg-card`, borde `line-card`, espacio entre filas) o divisores claros, para que se lea sin
     duda cuál es cada cuenta y a cuál vas a entrar. En hover, resaltar la fila-objetivo con
     borde/fondo de acento (mismo lenguaje que `CampaignRow` del home).
   - **Tap rápido rediseñado (decidido 2026-07-08): menú de acciones "···" por fila.** Cada
     fila lleva un botón de acciones (···) que abre las opciones (WhatsApp / Correo / objeción)
     en un menú on-design, en vez del form suelto que aparece en hover. Nada se despliega al
     pasar el mouse; el tap rápido es explícito. Se conserva la función real
     (`registrarTapAction`).

### Decisiones de diseño
- **Default del toggle:** modo **Foco** (decidido 2026-07-08).
- **Alcance del blur:** **solo la lista** de la agenda; stats y próximo paso quedan visibles
  (decidido 2026-07-08).
- **Destino de las stats (pendiente menor):** fila de `StatCard` como el home vs. algo más
  compacto. Se resuelve al implementar; no bloquea.

---

## Fix 4 — Navegación: sidebar en conectores + back-link fuera de diseño

### Qué está pasando
Dos restos del diseño viejo relacionados con navegar entre vistas:

1. **Conectores no tiene sidebar.** `app/conectores/page.tsx` no se envuelve en ningún shell
   (ni `AppShell` ni `SidebarFrame`): es una página suelta `mx-auto max-w-3xl` con un link de
   texto "← Inicio" arriba (línea 34). Por eso ahí desaparece el sidebar y toca volver con ese
   link.
2. **El "pad" de volver no va con el diseño.** En la llamada (`app/llamada/[id]/page.tsx`) el
   botón de volver es `<Link href="/cola" className="back">← Cola</Link>` — se repite en las 5
   ramas de render. Esa clase `.back` es CSS legacy (`app/globals.css:300`): solo texto gris,
   sin la forma/afordancia del resto de la app. Lo mismo el "← Inicio" de conectores. Se
   sienten pegados de otra época del diseño.

### Archivos que toca
- `app/conectores/page.tsx` — envolver en el shell para heredar el sidebar; quitar el
  `max-w-3xl` suelto y adaptarlo al layout del shell.
- `app/llamada/[id]/page.tsx` — reemplazar los 5 `<Link className="back">← Cola</Link>`.
- `app/globals.css` — retirar la clase legacy `.back` (líneas 300–301) una vez nadie la use.
- Nuevo: un componente de back on-design reutilizable (ej. `app/ui/BackLink.tsx`) para no
  repetir estilos en cada vista.

### Cómo se resolvería
- **Sidebar en conectores:** envolver la página en `SidebarFrame` (mismo patrón liviano que
  /cola y /llamada: solo sidebar, sin TopBar) o en `AppShell` si se quiere también el TopBar.
  Con el sidebar presente, el "← Inicio" deja de ser la única forma de salir.
- **Back-link on-design:** crear un `BackLink` que use el lenguaje visual de la app (icono +
  texto en una afordancia con hover, tokens del tema, no la clase `.back`). Usarlo en llamada
  ("← Cola") y donde haga falta. Consistente con botones/pills existentes.
- Decisión menor a confirmar: en conectores, ¿`SidebarFrame` (solo sidebar) o `AppShell`
  (sidebar + TopBar)? Recomiendo `AppShell` para que quede idéntico al resto salvo /cola y
  /llamada que ya tienen su propio header.

---

## Fix 5 — Campañas: quitar la "✕" y pasar a un modo edición estilo iPhone

### Qué está pasando
En el grid de campañas, las tarjetas en estado **borrador** muestran una "✕" fija arriba a la
derecha para eliminar (`app/campanas/CampanaCard.tsx`, líneas 86–96, `absolute right-3 top-3`).
Se ve fea y siempre presente. Sebastián quiere el patrón de "editar" tipo iPhone: normalmente
no se ve nada; al entrar en **modo edición** aparece un afordante de remover (el "cosito" de
menos, arriba a la izquierda de la tarjeta), y al salir del modo desaparece.

### Archivos que toca
- `app/campanas/CampanasGrid.tsx` (client) — dueño del estado `editando`; agrega el botón
  "Editar / Listo" en la barra de tabs y pasa `editando` a cada tarjeta.
- `app/campanas/CampanaCard.tsx` — quitar la ✕ fija; mostrar el afordante de remover (badge
  de menos, esquina superior izquierda) solo cuando `editando && esBorrador`. Se conserva el
  `useConfirm` para confirmar antes de eliminar.
- `app/campanas/HubHeader.tsx` — opcional, si se prefiere el botón "Editar" en el header en vez
  de junto a los tabs (HubHeader es server; el botón, al ser interactivo, vive mejor en el grid
  client — recomiendo dejarlo en `CampanasGrid`).

### Cómo se resolvería
- **Toggle de edición:** un botón "Editar" en la fila de tabs de `CampanasGrid`; al activarlo,
  cambia a "Listo" y prende `editando`.
- **Afordante de remover:** badge circular de menos (−) arriba a la izquierda de las tarjetas
  eliminables (borrador), visible solo en modo edición, con la animación suave típica del
  patrón iPhone. Al hacer click, dispara el mismo `confirmar()` + `eliminarCampanaBorradorAction`
  que ya existe.
- Decisión menor a confirmar: en modo edición, ¿el afordante aparece solo en borradores (únicos
  eliminables hoy) o queremos también dejar espacio para otras acciones futuras (ej. pausar)? Por
  ahora, solo remover en borradores, que es lo que la acción del repository permite.

---

## Fix 6 — Sistema de diseño único: una sola línea de fuentes y colores

### Qué está pasando
La app siente que "no es de una sola pieza" porque hay **4 sistemas tipográficos de títulos**
conviviendo (verificado por grep):

| Zona | Fuente de títulos | Rol / uso |
|------|-------------------|-----------|
| Home dashboard | **Archivo Black** (pesado, display) | `font-heading` — `page.tsx`, `StatCard`, `PipelineBar`, `perfil/page.tsx` |
| Campañas + /cola + por-revisar + cadencias | **Newsreader** (serif) | `font-serif` — 16 archivos |
| Toques (`llamada/[id]/*`) | **EB Garamond** (otra serif) + JetBrains Mono | `font-toque-heading` / `font-toque-mono` — 7 archivos |
| Conectores | **Space Grotesk** + Inter | crudo `font-[family-name:var(--ff-grotesk)]` / `var(--ff-inter)` — 3 archivos, **sin rol semántico** |

El cuerpo (`font-body` = IBM Plex Sans) sí es consistente. El problema es que hay cuatro
familias de encabezado y dos de mono. Los favoritos de Sebastián (campañas y toques) ya se
parecen porque ambos usan serif elegante; los que rompen la unidad son el **home** (Archivo
Black, muy pesado) y **conectores** (Space Grotesk, geométrica, y encima sin abstraer).

En **color** la abstracción ya está casi completa (`@theme` en `app/globals.css` es exhaustivo,
ver `docs/design-tokens.md`). Solo quedan 4 hexes crudos en componentes:
`text-[#9ca0ab]` (`SidebarNav.tsx`), `to-[#5d4bd6]` (`Sidebar.tsx`), `to-[#6e5cff]` y
`bg-[#0c0d10]` (`campanas/nueva/CopilotoPanel.tsx`). Los `colorClass` del funnel
(`app/db/funnel.ts`) también son hex crudos, pero viven en un archivo de datos, no en un
componente.

### Norte
El diseño de **campañas (creación) + toques (cómo se ven al hacerlos)** es el que gana. Todo
lo demás se alinea a esa línea: una sola familia serif para títulos, una sola sans para cuerpo,
una sola mono, todas como rol semántico en `@theme` (nunca familia cruda en componentes).

### Archivos que toca
- `app/globals.css` (`@theme`) — punto único: consolidar los roles de fuente; hacer que
  `--font-heading` y los roles de toque apunten a la familia serif elegida; retirar los roles
  divergentes que queden sin uso.
- `app/layout.tsx` — dejar de cargar las familias que se retiren (Archivo Black, Space Grotesk,
  Inter, y una de las dos mono / una de las dos serif según decisión). Menos `next/font` = más
  liviano.
- `app/conectores/*` (`page.tsx`, `ConectorRow.tsx`, `CredencialForm.tsx`) — cambiar el
  `font-[family-name:var(--ff-grotesk)]` y `font-[family-name:var(--ff-inter)]` crudos por los
  roles `font-serif` / `font-body`.
- `app/page.tsx`, `app/ui/home/StatCard.tsx`, `app/ui/home/PipelineBar.tsx`,
  `app/perfil/page.tsx` — migrar `font-heading` (Archivo Black) a la serif unificada (ver
  decisión sobre los números gigantes del home).
- `app/llamada/[id]/*` — si se unifica la serif, `font-toque-heading` pasa a apuntar a la misma
  familia (idealmente sin tocar cada componente, solo el rol en `@theme`).
- `app/ui/shell/SidebarNav.tsx`, `app/ui/shell/Sidebar.tsx`,
  `app/campanas/nueva/CopilotoPanel.tsx` — mover los 4 hexes crudos a tokens de `@theme`.
- `docs/design-tokens.md` — actualizar la doc de tokens al nuevo sistema unificado.

### Cómo se resolvería
1. **Una serif de títulos.** Elegir Newsreader (campañas, ya en 16 archivos) o EB Garamond
   (toques). Hacer que `--font-serif`, `--font-heading` y `--font-toque-heading` apunten todos a
   esa familia. Como los componentes consumen el rol y no la familia, el cambio es
   concentrado en `@theme` + retirar la carga de la sobrante en `layout.tsx`. **(Decisión
   pendiente — ver abajo.)**
2. **Home sin Archivo Black.** Los números gigantes del metric strip (`StatCard`) usan Archivo
   Black; al unificar, pasan a la serif. Decidir si los números grandes mantienen algún peso
   distintivo o se ven con la serif como el resto. **(Decisión pendiente.)**
3. **Conectores dentro del sistema.** Reemplazar el font crudo por `font-serif`/`font-body`;
   retirar `--ff-grotesk` y `--ff-inter` de `layout.tsx`.
4. **Una sola mono.** Consolidar Geist Mono / IBM Plex Mono / JetBrains Mono a una. **(Decisión
   pendiente, menor.)**
5. **Colores crudos → tokens.** Crear tokens para los 4 hexes sueltos y usarlos.

### Decisiones de diseño (cerradas 2026-07-08 — Sebastián delegó el criterio de diseñador)
Constraint rector: herramienta de trabajo de uso diario, minimizar fatiga visual en pantalla
oscura. No "la más bonita en abstracto", sino la que menos cansa.

- **Serif única de títulos: Newsreader.** Diseñada para lectura en pantalla (x-height alta,
  trazos que aguantan en dark mode a tamaños de UI); EB Garamond es más frágil y cansa más en
  pantalla. Newsreader ya domina (16 archivos). `--font-serif`, `--font-heading` y
  `--font-toque-heading` apuntan todos a Newsreader.
- **Cuerpo: IBM Plex Sans** (`--font-body`), sin cambios: hecha para UI, ya consistente.
- **Números/datos grandes: IBM Plex Sans bold tabular**, NO serif ni Archivo Black. Los datos
  se leen como datos (escaneo rápido, menos fatiga); serif se reserva para títulos editoriales.
  Mismo patrón que ya usan campañas y toques. Se retira Archivo Black.
- **Mono única: IBM Plex Mono** (`--font-mono` y `--font-toque-mono` apuntan aquí). Empareja
  con el cuerpo Plex; reemplaza Geist Mono y JetBrains Mono.
- **Familias a retirar de `layout.tsx`:** Archivo Black, EB Garamond, Space Grotesk, Inter,
  Geist / Geist Mono, JetBrains Mono, Space Mono (las que queden sin uso tras la unificación).

**Cortesía de ejecución:** antes de aplicar el swap global, montar un specimen lado a lado
(título real + número real en las opciones) para que Sebastián confirme por ojo. No bloquea la
decisión ya tomada, es un check visual.

---

## Fix 7 — Nav activo: quitar el amarillo chillón

### Qué está pasando
El ítem activo del sidebar se pinta con un relleno **ámbar sólido** (`bg-nav` = `--color-nav`
`#f2b738`, con `text-nav-ink` oscuro) en `app/ui/shell/SidebarNav.tsx` (líneas 37–39). Es muy
llamativo y a Sebastián no le gusta: cuando entra a "Toques" o "Campañas" ese bloque amarillo
choca. Además hay ya una barrita de acento violeta a la izquierda del activo (línea 43), así que
el ámbar compite con el sistema de acento real (violeta = datos).

### Archivos que toca
- `app/ui/shell/SidebarNav.tsx` (principal) — tratamiento del estado activo.
- `app/globals.css` — posiblemente retirar `--color-nav` / `--color-nav-ink` si dejan de usarse.

### Cómo se resolvería (decidido 2026-07-08 — Sebastián delegó)
Activo con **tinte de acento violeta suave** (`bg-accent/10`, texto `ink`, `font-semibold`)
apoyado en la barrita de acento violeta que ya existe (línea 43). El violeta ya es EL acento de
la app, así que el activo queda coherente con el sistema en vez de competir (como hacía el
ámbar) o desconectarse (como haría un neutro). Se retira `--color-nav` / `--color-nav-ink` de
`@theme` si quedan sin uso.

---

## Fix 8 — Creación de campaña: el botón "Continuar a Destinatarios" desaparece al volver a Cadencia

### Qué está pasando (bug)
El paso "Cadencia" del flujo de creación se renderiza con **dos componentes distintos** según
cómo se llega:

- En la sesión viva de `/campanas/nueva` → `app/campanas/nueva/CadenciaPaso.tsx`: **tiene** el
  botón que avanza (`continuarADestinatarios()`, línea 83, hace `router.push` a
  `/campanas/[id]/destinatarios`).
- Al volver después por el breadcrumb/wizard → se cae en `/cadencias/[id]` →
  `app/cadencias/[id]/CadenciaCockpit.tsx`: es el editor standalone y **no tiene** ningún botón
  de "Continuar a Destinatarios".

Entonces, la secuencia que reportó Sebastián (Cadencia → continuar a Destinatarios → volver a
Cadencia) lo deja en la vista standalone, que no ofrece el avance. El botón "desaparece" porque
literalmente es otro componente. Los demás pasos borrador sí traen su CTA de avance
(`DestinatariosCockpit` → "Continuar a Preview", `PreviewCockpit` → "Continuar a Lanzar"); a la
vista standalone de Cadencia le falta el equivalente.

### Archivos que toca
- `app/cadencias/[id]/CadenciaCockpit.tsx` — agregar el CTA de avance "Continuar a
  Destinatarios" cuando la cadencia pertenece a una campaña en `borrador`.
- `app/cadencias/[id]/page.tsx` — ya calcula `esBorrador` y `camp.idCampana`; pasarle al
  cockpit lo necesario (id de campaña + flag borrador) para renderizar el CTA solo en ese caso.
- Referencia de patrón (no se modifican): `DestinatariosCockpit.tsx` (línea 199) y
  `PreviewCockpit.tsx` (línea 64), que ya hacen exactamente esto en sus pasos.

### Cómo se resolvería
Cuando `/cadencias/[id]` corresponde a una campaña en borrador, mostrar un botón "Continuar a
Destinatarios" (mismo estilo y posición que los CTA de avance de los otros pasos) que navegue a
`/campanas/[idCampana]/destinatarios`. Así el paso Cadencia se comporta igual sin importar por
dónde se entró. Es un fix acotado: no unifica los dos componentes (decisión mayor aparte), solo
le da a la vista standalone la salida que le falta.

---

## Fix 9 — Sidebar: no seleccionar "Campañas" durante el flujo de creación

### Qué está pasando (bug)
`app/ui/shell/SidebarNav.tsx` marca el ítem activo con `pathname.startsWith(item.href)` (línea
30). El flujo de creación cruza dos árboles de ruta:

- `/campanas/[id]/segmento`, `/destinatarios`, `/preview`, `/lanzar` → empiezan con `/campanas`
  → **prenden "Campañas"** en el sidebar.
- El paso Cadencia vive en `/cadencias/[id]` → no empieza con `/campanas` → **no prende nada**.

Resultado: "Campañas" parpadea encendido/apagado según el paso, cosa que a Sebastián no le
gusta. Quiere que durante todo el flujo el sidebar **no seleccione nada** (el flujo ya tiene su
propia orientación con `PasosWizard` / `CampanaSubNav`).

### Archivos que toca
- `app/ui/shell/SidebarNav.tsx` (principal) — lógica de `activo`.
- Posiblemente `app/ui/shell/AppShell.tsx` — si se decide dar control por-ítem del match
  (ej. un flag `exact` o un predicado `activeWhen` en `NavItem`).

### Cómo se resolvería
Regla propuesta: el ítem "Campañas" se marca activo **solo en el hub** (`pathname ===
'/campanas'`), no en las sub-rutas por-campaña. Así, todo el workspace de una campaña
(`/campanas/nueva`, `/campanas/[id]/**`) y el paso Cadencia (`/cadencias/[id]`) quedan **sin
selección** en el sidebar principal, de forma consistente — la orientación la da el subnav del
flujo. Para no romper otros ítems que sí quieren `startsWith`, se puede: (a) hacer "Campañas"
match exacto puntual, o (b) agregar a `NavItem` un modo de match opcional. Recomiendo (b) por
ser explícito y reutilizable.

### Decisión menor a confirmar
- Una campaña **ya lanzada** (no borrador) también quedaría sin resaltar "Campañas" al ver su
  detalle. ¿OK (consistente, el detalle tiene su propio subnav) o querés que el detalle de una
  campaña lanzada sí resalte "Campañas"? Recomiendo dejarlo sin resaltar por simplicidad y
  consistencia con el paso Cadencia.

---

## Orden sugerido de ejecución
1. **Fix 6** (sistema de diseño único) — **primero**: define la línea de fuentes/colores sobre
   la que se construye todo lo demás. Cerrar sus decisiones antes de tocar nada más de UI.
2. **Fix 7** (nav activo sin amarillo) — pequeño, va con el trabajo de tokens del Fix 6.
3. **Fix 1** (sidebar flyout) — mecánico, rápido, alto retorno de comodidad.
4. **Fix 2** (pipeline) — aislado a un componente, decisión ya cerrada (leyenda de chips).
5. **Fix 4** (navegación) — sidebar en conectores + `BackLink` reutilizable.
6. **Fix 9** (sidebar sin select en el flujo) — mismo archivo que Fix 4/Fix 7 tocan (SidebarNav);
   conviene hacerlos juntos.
7. **Fix 8** (botón continuar en cadencia) — bug acotado del flujo de creación.
8. **Fix 5** (campañas edit mode) — aislado a 2 componentes de campañas.
9. **Fix 3** (cola) — el más grande; decisiones ya cerradas, se apoya en el sistema unificado
   (Fix 6) y en el `BackLink` (Fix 4).
