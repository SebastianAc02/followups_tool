# Tareas (orden por riesgo) — herramienta web

La base YA está hecha (seed 2026-06-30). Granola es el grabador; la herramienta solo pesca.
Cada tarea: un cambio, con "queda lista cuando". Una por delegación a Claude Code.

## Conectar la app a la base
- [ ] T1 · Scaffold Next.js + TypeScript + Drizzle apuntando a isps.db (local).
  Lista cuando: la app arranca y lee una empresa de isps.db.
- [ ] T2 · Modelar en Drizzle las tablas que YA existen (empresa, contacto, toque, empresa_alias, sync_cambios)
  + Repository. Reflejar, NO recrear. Lista cuando: el Repository lee/escribe toque con prueba.
- [ ] T3 · Importar las fechas de "próximo paso" de Notion (74) a empresa/toque.
  Lista cuando: la cola del día tiene cuentas con follow-up vencido/hoy.

## Núcleo usable (walking skeleton — aquí ya lo usas en una llamada real)
- [ ] T4 · Cola del día: empresas con follow-up vencido o para hoy, ordenadas.
- [ ] T5 · Ficha de cuenta: contacto(s), número, 3 imprescindibles (usuarios/CRM/pasarela: sabido/falta),
  último toque, tipo (warm/reactivación/follow-up/cliente/wispro), web+ciudad (marcar si falta).
- [ ] T6 · Cerrar el toque: poner próximo follow-up (fecha + contador de carga por día); tap "no contestó"
  si no hubo sesión; en "contestó-no" capturar Razón de Pérdida; en gatekeeper capturar KDM (nombre+tel).
  Lista cuando: cierro una cuenta y aparece la siguiente, con el contador subiendo.

## Captura desde Granola (lo central)
- [ ] T7 · GranolaAdapter: leer sesiones nuevas de Granola (API/MCP).
- [ ] T8 · Ingest worker: por sesión nueva -> enlazar a empresa con el matcher (cola de revisión si no
  enlaza) -> traer resumen -> crear toque + puntero (granola/id/url/dueño-credencial) + resumen cacheado.
  Lista cuando: tras una llamada/reunión en Granola el toque aparece solo; si no hay, "sin transcript".
- [ ] T9 · Registrar toque de WhatsApp / correo (canal), un tap. Capturar objeción fuerte si la hay.

## IA y sync (background)
- [ ] T10 · Worker de IA: resumen/transcript -> borrador (Notas Discovery solo facts, qué pasó, Brief,
  propuesta de próximo paso).
- [ ] T11 · Revisión humana del borrador antes de subir (en lote).
- [ ] T12 · Outbox + sync nocturno a Notion: escribe el modelo COMPLETO de campos (Estado, Prioridad, Tier,
  Próximo Paso+Fecha, Razón de Pérdida, Intentos+1, fechas, Owner=Sebastián, sub-page de Toques con link
  al resumen). Una vía, idempotente, backoff, log en sync_cambios.

## Métricas y cierre
- [ ] T13 · Tablero del día: toques por TIPO (warm-reactivación / cold / follow-up post-reunión) +
  connection rate + reuniones agendadas + # gerentes + por canal + inbound vs outbound.
- [ ] T14 · Pace: ventanas (9:30-12, 14-16), meta diaria, checkpoint mediodía/cierre, aviso on-track.
- [ ] T15 · Reporte diario opt-in del conteo por persona (WhatsApp/correo).

## Fase 2 (no ahora)
Turso/hosting + Felipe, cadencia automática, sugerir números, multipersona en la UI, frío puro,
archivar audio a Drive, cosecha de hilos de WhatsApp, scoring.
