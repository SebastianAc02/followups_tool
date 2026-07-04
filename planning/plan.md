# Plan técnico — herramienta de follow-ups (web)

## Cambios vs el plan anterior
- App 100% web (Next.js). **La herramienta NO graba.** Granola es el grabador.
- La base YA está: isps.db es la fuente de la verdad, seedeada y categorizada (seed 2026-06-30).
  Ya existen `toque` (con `id_contacto` + columnas de puntero a transcript), `sync_cambios` (log), `empresa.categoria`.
- Requisito central: **captura automática.** Todo (llamada y reunión) pasa por Granola; la herramienta
  pesca sola el transcript/resumen y arma el toque. El humano no sube nada a mano.

## Capas (puertos y adaptadores)
```
UI web  ->  casos de uso  ->  dominio (empresa, contacto, toque)
                |  (interfaces)
   Repository(isps.db/Drizzle) · NotionAdapter(salida) · ClaudeAdapter(procesar)
   Captura: GranolaAdapter(calls + reuniones) · WhatsAppLog · EmailLog
```
El core no conoce Granola/Notion/Claude. Cada canal y proveedor es un adaptador.

## Captura: todo pasa por Granola (lo central)
- La llamada Y la reunión se hacen/graban **desde Granola**. La herramienta no usa micrófono ni graba.
  Tú y Felipe ya graban en Granola; cero doble trabajo.
- Un **worker en background vigila Granola** (API/MCP): cada sesión nueva (llamada o reunión) ->
  la **enlaza a la empresa con el mismo matcher** que ya construimos (por título/asistentes, reusa
  `empresa_alias`) -> trae el **resumen** de Granola (no el transcript literal, PROCESOS §2) -> crea
  el toque + **puntero** (proveedor=granola, id, url, dueño de la credencial) + resumen cacheado ->
  IA lo procesa a discovery/brief. Sin subir nada a mano.
- **Outcome:** si hubo sesión en Granola, la IA deriva qué pasó (reunión / llamada conectada). Si no
  contestaron (no hay sesión), tú das un tap "no contestó".
- **WhatsApp / correo:** un tap los registra como toque (canal=whatsapp/correo).
- Robustez: si Granola no grabó (pasa, PROCESOS O7), el toque queda igual marcado "sin transcript".
- **Opcional (no core, para Sebas):** archivar la grabación cruda a Google Drive / otra base para
  re-escucharla y mejorar. Granola ya la guarda; esto sería solo exportarla. Fase 2.

## Modelo de datos
Ya en isps.db: empresa, contacto (multipersona), `toque` (id_empresa, id_contacto, fecha, canal,
resultado, que_paso, proximo_follow_up_fecha, transcript_proveedor/id/url, fuente), sync_cambios.
Falta: importar las fechas de "próximo paso" de Notion (74) para que la cola del día 1 no salga vacía.

## Flujo por toque (web)
cola del día -> ficha (contacto, número, 3 imprescindibles, último toque) -> llamas o te reúnes
EN Granola -> el toque + resumen **aparecen solos** (worker) -> tú solo pones el próximo follow-up
(o tap "no contestó" si no conectó) -> siguiente. La IA procesa en background; tu revisión antes de
subir; outbox -> Notion de noche.

## Patrones
Repository (aísla DB), Adapter (uno por canal/proveedor), Outbox (sync a Notion idempotente),
worker simple para el ingest de Granola y el procesamiento IA. Strategy por canal: dejar la costura.

## Fuera de v1 (dejar la costura)
Cadencia automática (sugerir el siguiente canal solo, PROCESOS §2), sugerir números alternos (§3),
scoring, cosecha de hilos de WhatsApp (§4), archivar audio a Drive. El modelo aguanta meterlos después.
