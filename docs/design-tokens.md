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
Familias: --ff-serif (Newsreader) · --ff-body (IBM Plex Sans) · --ff-mono (Geist Mono)
          --ff-display (Archivo Black, dormido) · --ff-mono-tag (IBM Plex Mono, dormido)
```

## Capa 2 — Semánticos (lo que consume la UI; apunta a un primitivo)

```
--color-accent → --violet-500 · --color-accent-soft → --violet-400
--color-done (success) → --green · --color-overdue (danger) → --red
--color-today → --amber · --color-warn → --orange
--color-bg/--color-shell → --n-0 · --color-surface → --n-2 · --color-card → --n-1

--color-avatar-{violeta,verde,ambar,rosa} → primitivos existentes (perfil, colorAvatar)
--color-avatar-accent-{from,to} → gris de dos tonos, default del avatar antes de Fase 2
  (mapeo id→clase en app/ui/shell/avatar-colores.ts, punto único de cambio)

--font-body → --ff-body       (cuerpo de texto, todo el cockpit)
--font-serif → --ff-serif     (títulos/encabezados del cockpit de campañas y /cola)
--font-heading → --ff-display (SOLO home dashboard: page.tsx, StatCard, PipelineBar — Archivo Black)
--font-mono-tag → --ff-mono-tag (etiquetas mono chicas, eyebrow)

--color-accent-llamada → --color-accent (violeta, ya existente)
--color-accent-correo → --blue
--color-accent-whatsapp → #29c98f
(cada uno con su -soft: fondo suave rgba al 12%, para tarjetas de acento por canal)
--color-check → --green (item de calificación/secuencia con dato)
--color-pending → --amber (item por preguntar; -soft: caja punteada)

--font-toque-heading → --ff-toque-heading (EB Garamond) — títulos del cockpit de toque (Toque 1/2/3)
--font-toque-mono → --ff-toque-mono (JetBrains Mono) — eyebrows/labels mono del cockpit de toque
```

**Nota (Tarea 0, rediseño de toques 2026-07-08):** los componentes de `app/llamada/[id]/*`
consumen exclusivamente `text-accent-{llamada,correo,whatsapp}`, `bg-accent-{canal}-soft`,
`text-check`, `text-pending`, `font-toque-heading` y `font-toque-mono` — nunca un hex ni
`EB Garamond`/`JetBrains Mono` crudos. Punto único de cambio: este archivo + `app/layout.tsx`
(carga de `next/font`).

**Nota de convención (no en el plan original, resuelta al ejecutar Fase 0):**
el plan hablaba de "font-heading" para los títulos serif de la Vista 1. Pero
`--font-heading` ya está en uso en producción para Archivo Black (home dashboard).
`/cola` y la UI de campañas ya migrada usan `font-serif` (Newsreader) para sus
títulos. Para no romper el home dashboard, las vistas nuevas del cockpit de
campañas (Fases 1-9) usan **`font-serif`**, no `font-heading`. `font-heading`
queda reservado para el home dashboard únicamente.

## Swap de familia (el punto del ejercicio)

`--font-body` pasa de Space Mono a IBM Plex Sans (calca los mockups V1-V7).
Como todo componente referencia el rol `font-body`, no la familia, este cambio
es una sola línea en `@theme` — ningún componente sabe ni le importa qué fuente
hay detrás.
