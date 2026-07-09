# Tokens de diseño — fuente única

Regla: ningún componente usa un hex o un nombre de fuente crudo. Todo pasa por un
rol semántico definido en `app/globals.css` (`@theme`). Cambiar tipografía o color
del cockpit es una línea en este archivo, nunca un `grep` por el proyecto.

Dos capas dentro de `@theme`:

## Capa 1 — Primitivos (valores crudos, se definen una vez)

```
Paleta:   --violet-500 #8b7cff · --violet-400 #a99cff
          --green #57c98a · --red #f4796b · --amber #f2b738 · --orange #e07a3f
          --blue #8fb0e0 (canal llamada) · --rose #d3a0a6 (canal correo)
Neutros:  --n-0 #0a0a0b (bg) · --n-1 #111218 (card) · --n-2 #161619 (surface)
          --n-3 #1f1f24 (surface-2) · --ink #ededee · --ink-soft #b6b6ba
          --muted #88888f · --faint #5e5e66
Familias: --ff-serif (Newsreader, títulos) · --ff-body (IBM Plex Sans, cuerpo y datos)
          --ff-mono-tag (IBM Plex Mono, única mono del cockpit)
```

**Sistema de diseño único (Fix 6, 2026-07-08):** una sola serif de títulos, una sola sans
de cuerpo, una sola mono, en toda la app — sin excepción por zona. Antes de este fix
convivían 4 familias de título (Archivo Black en el home, Newsreader en campañas/cola,
EB Garamond en toques, Space Grotesk en conectores) y 3 de mono (Geist Mono, IBM Plex
Mono, JetBrains Mono). Se retiraron todas menos Newsreader/IBM Plex Sans/IBM Plex Mono
en `app/layout.tsx`; los roles semánticos de abajo apuntan todos a esas tres.

## Capa 2 — Semánticos (lo que consume la UI; apunta a un primitivo)

```
--color-accent → --violet-500 · --color-accent-soft → --violet-400
--color-done (success) → --green · --color-overdue (danger) → --red
--color-today → --amber · --color-warn → --orange
--color-bg/--color-shell → --n-0 · --color-surface → --n-2 · --color-card → --n-1

--color-avatar-{violeta,verde,ambar,rosa} → primitivos existentes (perfil, colorAvatar)
--color-avatar-accent-{from,to} → gris de dos tonos, default del avatar antes de Fase 2
  (mapeo id→clase en app/ui/shell/avatar-colores.ts, punto único de cambio)

--font-body → --ff-body       (cuerpo de texto y datos/números grandes, todo el cockpit)
--font-serif → --ff-serif     (títulos/encabezados, toda la app)
--font-heading → --ff-serif   (alias de font-serif; home dashboard usa font-serif directo)
--font-mono → --ff-mono-tag   (mono de uso general: inputs, fechas, código)
--font-mono-tag → --ff-mono-tag (etiquetas mono chicas, eyebrow)
--font-toque-heading → --ff-serif    (alias de font-serif; cockpit de toque usa la misma serif)
--font-toque-mono → --ff-mono-tag    (alias de font-mono-tag; cockpit de toque usa la misma mono)

--color-nav-inactive → gris del ítem de sidebar sin seleccionar (SidebarNav)
--color-accent-deep / --color-accent-bright → extremos violeta oscuro/claro de los
  gradientes de avatar (Sidebar, CopilotoPanel)
--color-surface-deep → fondo casi negro del panel del Copiloto

--color-accent-llamada → --color-accent (violeta, ya existente)
--color-accent-correo → --blue
--color-accent-whatsapp → #29c98f
(cada uno con su -soft: fondo suave rgba al 12%, para tarjetas de acento por canal)
--color-check → --green (item de calificación/secuencia con dato)
--color-pending → --amber (item por preguntar; -soft: caja punteada)

```

**Números/datos grandes (StatCard y afines): `font-body font-bold tabular-nums`, nunca
`font-serif`/`font-heading`.** Decisión de Fix 6: los datos se leen como datos (escaneo
rápido, menos fatiga en pantalla oscura de uso diario); la serif se reserva para títulos
editoriales. Mismo patrón que ya usaban campañas y toques antes del fix.

**Nota (rediseño de toques, vigente tras Fix 6):** los componentes de `app/llamada/[id]/*`
consumen exclusivamente `text-accent-{llamada,correo,whatsapp}`, `bg-accent-{canal}-soft`,
`text-check`, `text-pending`, `font-toque-heading` y `font-toque-mono` — nunca un hex ni una
familia cruda. Desde Fix 6 esos dos roles son alias de `font-serif`/`font-mono-tag` (antes
apuntaban a EB Garamond/JetBrains Mono, retiradas). Punto único de cambio: este archivo +
`app/layout.tsx` (carga de `next/font`).

**Nota histórica (obsoleta desde Fix 6, 2026-07-08):** durante la Fase 0 del cockpit de
campañas, `font-heading` estaba reservado para Archivo Black (solo home dashboard) y las
vistas nuevas usaban `font-serif` para no romperlo. Fix 6 unificó ambos roles a la misma
serif (Newsreader) y retiró Archivo Black — hoy `font-heading` y `font-serif` son
intercambiables; se mantienen los dos nombres porque ya están regados por el código, no
por una diferencia real de fuente.

## Swap de familia (el punto del ejercicio)

`--font-body` pasa de Space Mono a IBM Plex Sans (calca los mockups V1-V7).
Como todo componente referencia el rol `font-body`, no la familia, este cambio
es una sola línea en `@theme` — ningún componente sabe ni le importa qué fuente
hay detrás.
