# Spec — herramienta de follow-ups v1 (web, captura desde Granola)

## Objetivo y usuarios
- Usuario: Sebastián (SDR) en v1; Felipe en fase 2.
- Trabajo: ejecutar follow-ups rápido, sin que se pierda ninguno y sin parar a anotar ni a subir transcripts.
- Éxito: el humano solo llama y pone el próximo paso; toque, resumen y registro en Notion se hacen solos.
  0 follow-ups caídos, 0 escritura manual en Notion, 0 subir transcripts a mano.

## Tipos de toque (los guiones de la skill llamadas-onepay)
Cada toque se etiqueta con su tipo, para contexto y para las métricas:
- warm / reactivación (Andina Link, conocidos), follow-up post-reunión, inbound, cliente (OnePay Tools),
  wispro / on-hold. (Frío puro = fase 2.) El tipo se deriva de estado + fuente + categoría de la cuenta.

## La ficha (antes de cada toque)
Muestra: contacto(s) con cargo y número, los **3 imprescindibles** (usuarios, CRM, pasarela: lo que se
sabe vs lo que falta -> tabla "sacar en la llamada"), el último toque (qué pasó y cuándo), estado, tipo,
y web + ciudad (mínimo obligatorio por cuenta; si falta, se marca). isps.db es la única fuente.

## Captura (todo pasa por Granola)
- Llamada y reunión se hacen/graban en Granola. La herramienta no graba.
- Un worker vigila Granola, enlaza la sesión a la empresa con el matcher, trae el **resumen** (no el
  transcript literal), crea el toque + puntero (granola/id/url/dueño-credencial) + resumen cacheado.
- WhatsApp / correo: un tap los registra como toque (canal). No-contestó: un tap (no hay sesión Granola).

## Resultado y razón de pérdida
Resultado del toque: contestó-reunión / contestó-sigo follow-up / contestó-no / no contestó.
Si es "no" -> se captura **Razón de Pérdida** (para Wispro enfático en precio: Razón = Precio).
Gatekeeper: si se consiguió el número del gerente (KDM), se captura nombre + tel del KDM.

## Lo que la IA arma en background (del resumen/transcript)
Notas Discovery (solo facts), el "qué pasó" del toque (narrado humano), el Brief (estado de la cuenta),
y propone próximo paso. Todo queda en **borrador** para revisión humana antes de subir (D4).

## El modelo de Notion que el sync escribe (autollenar lo inferible)
Empresa, Industria, Tipo de Empresa (por usuarios), Usuarios, CRM/Software, Pasarela, Contacto + Cargo +
Teléfono + Email, Pág Web, Cobertura, Canal, Fuente, Estado, Prioridad, Tier, Próximo Paso + Fecha,
Fechas Primer/Último Contacto, Planes, Owner (=Sebastián), Agendado/Califica/Se presentó/Respondió,
Razón de Pérdida, Intentos de Contacto (anterior +1). Toques en sub-page (Fecha, Canal, Qué pasó,
Respondió, Transcript=link). NO se llenan: Cerrado, Score MEDDPICC, API Key, automáticos.

## Métricas / KPIs (tablero del día)
Por tipo (warm-reactivación / cold / follow-up post-reunión, separadas), connection rate (conectadas/
marcadas), reuniones agendadas (día + acumulado), # gerentes (gatekeepers que pasaron número),
desglose por canal (llamada/WhatsApp/correo) e inbound vs outbound.

## Pace (gestión de tiempo)
Ventanas 9:30-12:00 y 14:00-16:00. Meta diaria de toques. Checkpoints (mediodía / cierre) y aviso
on-track vs atrasado, sin interrumpir el ritmo. (El pace coaching puede ser ligero en v1.)

## Objeciones
Si un toque conecta y trae una objeción fuerte, se captura en el toque y alimenta el corpus de
objeciones (hoy OBJECIONES.md).

## Criterios de aceptación (cuando X, pasa Y)
- Abro la app -> veo solo las cuentas con follow-up vencido o para hoy, por fecha.
- Selecciono una cuenta -> veo contacto, número, 3 imprescindibles (sabido/falta), último toque, tipo.
- Llamo/me reúno en Granola -> el toque aparece solo con su resumen, enlazado a la cuenta correcta.
- Pongo la fecha del próximo follow-up -> veo cuántos ya tiene ese día antes de confirmar.
- Registro un toque -> el contador del día (por tipo y canal) sube sin que yo anote.
- Reviso y apruebo el borrador de la IA -> entra a la cola de sync; a la mañana, Notion refleja todo, una vez.

## Non-goals (v1)
Frío puro, cadencia automática, sugerir números alternos, multipersona en la UI, scoring, cosecha de
hilos de WhatsApp, sync de dos vías, archivar audio crudo a Drive. El modelo deja la costura para todos.

## Edge cases
- Granola no grabó -> toque queda "sin transcript", no se rompe.
- Sesión de Granola que no enlaza a ninguna cuenta -> cola de revisión (no se inventa el match).
- Borrador de IA vacío o dudoso -> marcado para revisión, no se inventa.
- Falla de red en el sync -> la fila queda pendiente en el outbox y se reintenta.

## Voz
Todo texto para humanos (qué pasó, notas, Brief, próximo paso): sin emojis, sin em dashes, español
directo (voz-onepay). Owner = Sebastián siempre.
