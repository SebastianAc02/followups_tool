# Backlog post-prueba completa (2026-07-16)

Feedback de Sebastián después de correr la demo de punta a punta. Criterio suyo, textual:
"la herramienta está muy quedada, se puede salvar, no va a ser deslumbrante, hay que hacer
que funcione lo antes posible bien". No hay tiempo para rediseños grandes.

Cada sección de abajo es UNA sesión. Están ordenadas por lo que recomiendo hacer primero.
El orden lo decide Sebastián; la recomendación va con el porqué.

## Lo que YA funciona (no tocar, dicho por él)

- Personalizar correos y WhatsApp antes de mandar.
- Los manda solos (Gmail + Evolution reales).
- "Siguiente día" avanza la cadencia.

## Lo que ya está construido y él no ha visto (medido, no asumido)

Esto NO es trabajo nuevo. Cambia el tamaño de los planes de abajo:

- `actividadDeCampana(idCampana)` (repository.ts:4369): una fila por ENVIO con estado
  (enviada/pendiente/fallo) y señales cruzadas (abrio/hizoClic/vioWhatsapp/respondio/reboto).
  Es la mitad del dashboard del Plan B, sin pantalla que la pinte.
- `aperturasPorCampana(idCampana)` (repository.ts:4316): aperturas/clics/visto por inscripcion.
- Pill "Vio 2x . hace 2h" en /cola: construido y commiteado en `feat/tracking-antes-del-toque`.
  NO se ve todavia porque el dato no llega, no porque falte pantalla (ver Plan A).
- Captura del visto de WhatsApp: construida. Faltaba suscribir MESSAGES_UPDATE (arreglado hoy
  para lineas NUEVAS; la linea ya conectada necesita un paso manual, ver Plan A).
- Granola en modo prueba ya devuelve "las ultimas llamadas de la ventana, sin filtrar por
  termino" y la UI ya deja elegir cual es (BuscarGrabacion.tsx). Estaba bloqueado por la
  credencial faltante, no por diseño (ver Plan A).

---

## Plan A: Cerrar lo que ya está construido y no se ve

**Por qué primero:** es el mas barato de todos y apaga tres quejas de la lista de un solo
golpe ("no se donde se ve si abrio el correo", "WhatsApp no me dice si abrio", "Granola no lo
esta cogiendo bien"). Casi todo es configuracion y verificacion, no codigo nuevo.

**Pasos manuales (Sebastián, no la IA):**
1. Conectar Granola DENTRO del modo prueba (`/conectores` con el banner naranja puesto).
   Medido: `pruebas.db` tiene 0 filas de conector granola, `isps.db` si tiene la credencial.
   Es conector que conmuta por base.
2. Reconectar el webhook de la linea ya existente para que mande acuses de lectura:
   ```
   curl -X POST http://100.71.80.117:8080/webhook/set/wa-12368895214 \
     -H "apikey: <AUTHENTICATION_API_KEY>" -H "Content-Type: application/json" \
     -d '{"webhook":{"url":"<WHATSAPP_WEBHOOK_URL con ?token=>","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT","MESSAGES_UPDATE"]}}'
   ```
3. Relanzar la demo con `APP_BASE_URL` confirmada y mandar un correo NUEVO. El correo viejo
   salio sin pixel y nunca va a reportar nada.

**Trabajo de IA:**
- Verificar que `evento_tracking` recibe filas de los dos canales.
- Mostrar el tracking tambien en la pantalla del toque, no solo en la fila de /cola (hoy solo
  esta en /cola; su queja "no se donde se ve" es tambien de ubicacion).
- Mergear `feat/tracking-antes-del-toque`.

**Decisión pendiente:** la regla de temperatura actual (estilo MailSuite: primera apertura se
descarta, la segunda ya es real) la escribio la IA por falta de tiempo. Sebastián la revisa y
ajusta si no le cuadra. Vive en `app/core/resumen-tracking.ts`, una sola funcion.

**Tamaño:** chico. Media sesion.

---

## Plan B: Dashboard de campañas -- YA ESTA CONSTRUIDO (2026-07-16)

**Queja textual:** "en campañas no hay un dashboard. Necesitaría ver mi panel de control de
todo lo que está pasando: si los correos se están mandando, si el WhatsApp se está mandando,
si no se ha mandado".

**Medido al ir a ejecutarlo: ya existe.** `/campanas/[id]/page.tsx` tiene hoy:
- Estado de la campaña + controles de ciclo de vida (pausar/reanudar/cancelar).
- Stats: toques esta semana, tasa de respuesta, empresas en secuencia, bloqueadas.
- `TablaActividad`: una fila por ENVIO con Enviado / Pendiente / Falló / Enviando, el canal,
  el proveedor real que lo mando, la fecha, y chips de Abrió / Clic / Visto / Respondió /
  Rebotó. Es exactamente "que se mando, que se va a mandar, que se cayo".
- Nota al pie honesta sobre por que "sin señal" no significa "no lo vio" (pixel bloqueado,
  confirmaciones de lectura apagadas).

**Por que Sebastián no lo vio:** viene del commit `238622b`, el MAS RECIENTE de
`feat/modo-prueba-demo`. Su demo corre una version vieja de la rama. Es el mismo motivo por
el que no vio el tracking, el visto de WhatsApp, ni Granola eligiendo entre las ultimas
llamadas.

**Lo unico que falta aca:** correr la rama al dia y hacer los 3 pasos manuales del Plan A.
Sin esos pasos, los chips de señales de la tabla salen TODOS vacios y se vuelve a leer como
"no funciona".

**Lo que si podria faltar despues de verlo funcionando** (no planear a ciegas, mirar primero):
contadores por canal arriba (hoy los stats son globales de la campaña, no separan correo de
WhatsApp), y el bloque de "errores recientes" esta vacio a proposito porque `sync_cambios` no
tiene relacion con campaña en el schema.

**Tamaño:** cero hasta verlo corriendo. Despues, chico.

---

## Plan C: Scheduling de envíos (anti-ban) -- EJECUTADO 2026-07-16

**Hecho.** Commit `e491085` en `feat/tracking-antes-del-toque`. 923 tests, tsc limpio.

- `app/core/ventana-envio.ts` (puro, 11 tests): ventana 8am-6pm L-V Colombia (UTC-5 fijo, sin
  DST ni libreria de timezones) + jitter 45-90s entre WhatsApps.
- El worker respeta la ventana en su ciclo automatico; lo que no alcanza queda 'pendiente'
  para el proximo ciclo (mismo mecanismo del tope diario de Gmail, no se pierde nada).
- Decision tomada por la IA por falta de tiempo: la ventana NO aplica al empuje manual
  ("Lanzar hoy" / "Siguiente dia"). Si Sebastián lanza a las 11pm sabe que son las 11pm, y
  bloquearlo en silencio romperia la demo. El jitter en manual es corto (3s) porque hay un
  request esperando -- 30 empresas x 60s serian 30 minutos colgado.

**Falta que Sebastián ajuste** (constantes en un solo archivo, `core/ventana-envio.ts`):
rango horario, dias bloqueados, y el rango del jitter. Los defaults los eligio la IA.

---

## Plan C (original, para referencia): Scheduling de envíos (anti-ban)

**Queja textual:** "el lanzamiento está superflojo, ni siquiera logra el schedule. Me gustaría
un schedule de los toques de WhatsApp, para no mandar 30 toques automáticos en un solo minuto
y que te baneen la cuenta. Decir cuál es el mejor rango de horas o cuáles evitar. Por ejemplo,
no lo mandes a las 2:00 a.m."

**Por qué importa mas de lo que parece:** es el unico item de la lista con riesgo real de
negocio. Si WhatsApp banea la linea, se cae el canal entero. Hoy el worker empuja todo lo
debido de una, sin espaciar ni mirar la hora.

**Alcance:**
- Ventana horaria por campaña (hora de inicio / hora de fin). Nada se manda fuera de ahi.
- Espaciado minimo entre mensajes de WhatsApp de la misma linea (con jitter, no un intervalo
  fijo que se vea robotico).
- El worker respeta las dos cosas: lo que no toca todavia queda pendiente para el proximo ciclo.

**Decisiones pendientes (son de negocio, las toma Sebastián):**
- Rango horario por defecto. Sugerencia a validar: 8am-6pm hora Colombia, dias habiles.
- Espaciado entre WhatsApps. Sugerencia a validar: 45-90 segundos aleatorio.
- Si el tope es por linea o por campaña (si un dia hay 2 lineas, cambia el calculo).

**Ojo:** esto toca el motor (worker + materializador), que es lo mas delicado del sistema. No
mezclarlo con nada mas en la misma sesion.

**Tamaño:** mediana-grande. Una sesion completa, sola.

---

## Plan D: Continuar cadencia después de una llamada

**Queja textual:** "están en una cadencia y yo hago una llamada, y literalmente no me deja la
opción de continuar cadencia. Solo si está en una cadencia debería dejarme: ey, ¿quieres
continuar la cadencia? De pronto no te contestó, o de pronto sí te contestó pero igual le vas
a seguir mandando un correo".

**Por qué:** es un hueco de flujo real que lo bloquea operativamente, y esta bien acotado.

**Contexto tecnico:** registrar una llamada hoy pausa/corta el hilo. Existe
`marcarPasoInscripcionCompletadaManual` (cierra el paso de llamada y re-ancla el siguiente),
asi que la plomeria esta; falta la pregunta explicita en la UI y respetar la respuesta.

**Alcance:** despues de registrar el toque de una empresa QUE ESTA en cadencia activa, ofrecer
"continuar la cadencia" o "pararla aca". Solo aparece si hay inscripcion activa.

**Decisión pendiente:** si "respondió" deberia cambiar el default de la pregunta. Hoy una
respuesta corta la cadencia automaticamente (por diseño). El dice que a veces quiere seguir
mandando correo aunque haya contestado. Eso choca con el corte automatico por respuesta:
definir cual gana.

**Tamaño:** chico-mediano. Media sesion.

---

## Plan E: UI del toque

**Queja textual:** "la UI del toque siento que está demasiado desordenada, hay demasiada
información y no me terminó de gustar". Ademas: "lo de PBX tampoco me gustó, da mucho".

**Problema:** es la queja mas vaga de la lista y la mas cara de ejecutar mal. "Desordenada" no
es accionable todavia.

**Antes de escribir codigo hace falta que Sebastián diga:**
- Que informacion del toque usa de verdad y cual es ruido.
- Que quiere decir con que PBX "da mucho" (ocupa mucho espacio, aparece demasiado seguido, o
  no deberia estar ahi).

**Recomendacion:** no ejecutar esto hasta tener esas respuestas. Una sesion de rediseño a
ciegas es exactamente el tipo de trabajo que no se puede pagar ahora.

**Tamaño:** grande e indefinido hasta acotarlo.

---

## Plan F: Granola, historial y toques pasados

**Queja textual:** "cómo me está poniendo la información de los toques, sobre todo de las
historias pasadas, no me deja mucha claridad".

**Ojo:** parte de esto puede ser el Plan A (Granola no traia nada por la credencial faltante,
asi que el historial se veia vacio o pobre por una causa distinta a la del diseño). Correr el
Plan A primero y volver a mirar antes de planear nada aca.

**Tamaño:** desconocido hasta re-medir despues del Plan A.

---

## Orden recomendado (actualizado 2026-07-16, despues de ejecutar)

1. ~~**Plan C** (scheduling anti-ban)~~ **HECHO**, commit `e491085`.
2. ~~**Plan B** (dashboard)~~ **YA ESTABA CONSTRUIDO** (commit `238622b`, sin correr).
3. **Plan A** (cerrar lo construido) - AHORA ES EL CUELLO DE BOTELLA DE TODO. Son 3 pasos
   manuales de Sebastián, la IA no los puede hacer (credenciales + navegador).
4. **Plan D** (continuar cadencia) - hueco de flujo real, chico. Tiene una decision de
   negocio sin resolver (ver el plan).
5. **Plan F** (Granola) - re-medir despues de A.
6. **Plan E** (UI del toque) - solo cuando este acotado.

## El hallazgo que importa mas que cualquier plan de esta lista

Cuatro de las quejas de la prueba (tracking de correo, visto de WhatsApp, Granola trayendo
las ultimas llamadas, dashboard de campañas) ya estaban construidas cuando Sebastián dijo que
faltaban. No es que la herramienta este quedada en features: **la demo corre una version
vieja de la rama**, con 20+ commits sin mergear encima.

La distancia entre lo que existe y lo que el ve es el problema real, y no se cierra
escribiendo mas codigo. Se cierra con:
1. Correr `feat/tracking-antes-del-toque` (tiene la rama demo debajo).
2. Los 3 pasos manuales del Plan A.

Sin eso, cualquier plan nuevo de esta lista se ejecuta a ciegas y probablemente reconstruye
algo que ya existe.
