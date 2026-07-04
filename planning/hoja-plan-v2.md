# Hoja de plan v2 · implementación de funcionalidades-v2

Esta hoja es TU plan. Lo que dice [LLENAR] lo escribes tú, sin ver el plan de la IA.
Cada decisión viva lleva: decisión + por qué (atado a un invariante o modo de fallo) +
alternativa rechazada + costo aceptado. "Uso X porque sí" no cuenta.

B1 a B4 ya los cerraste en funcionalidades-v2.md; quedan transcritos abajo. Donde tu doc
no dejó la alternativa o el costo por escrito, está marcado [FALTA] para que lo completes:
una decisión sin alternativa nombrada es familiaridad, no criterio.

---

## Bloque A · Marco [LLENAR ENTERO]

1. **Problema y para quién** (una frase; el problema de ESTE alcance v2, no el de la
   herramienta entera):

2. **Objetivo primario** (UNO solo; contra esto se mide cada fase del plan):

3. **Fuera de alcance explícito** (la constitución dice que cadencia automática está
   fuera de v1; tu doc la mete en v2. Deja escrito qué entra y qué sigue afuera, para
   que la constitución se actualice sin ambigüedad):

4. **Criterios de aceptación** (medibles, tipo "abro X y pasa Y". Uno por feature grande
   por lo menos: F0, F1, F2, F3, F4, F5):

5. **Invariantes** (qué debe ser SIEMPRE cierto en todo camino. Piensa en: correos que
   salen sin revisión, toques duplicados, Notion editado fuera de la vía única,
   credenciales en claro, empresas en dos campañas):

6. **Modos de fallo que predices** (cómo se rompe en la vida real. Dato de la base:
   estado_comercial y estado_notion tienen CHECK con lista cerrada; un estado nuevo en
   Notion rompe el reseed. ¿Qué más se rompe?):

7. **Supuesto más riesgoso** (el que, si está mal, tumba el plan entero. Candidatos que
   tu propio doc deja abiertos: lo que de verdad permite el plan Apollo Professional,
   y que el Agent SDK sobre el plan aguante el uso de F5/F6. Elige y justifica):

---

## Bloque B · Decisiones de peso

### B1 · Modelo de datos — CERRADO en lo grande, con 2 colas vivas

**Decidido (Anexo de funcionalidades-v2):** cadencia (template) / paso / version_paso
(A/B cuelga del paso) / segmento / campana / inscripcion (nivel empresa, una activa por
índice único parcial) / destinatario (nivel contacto) / paso_inscripcion (motor, materializa
en `toque`) / evento_tracking (append-only). Misma DB, tablas nuevas (F8, con por qué +
alternativa + costo ya escritos).
[FALTA] Alternativa rechazada y costo del modelo cadencia-vs-campaña como dos entidades
(¿por qué no una sola tabla con el segmento adentro?). Escríbelo en dos líneas.

**B1.a [LLENAR] · Dónde viven los datos nuevos de F0.1.** Razón de pérdida, objeción
fuerte, y el KDM que pasa el gatekeeper. Datos de la base real: `contacto` YA tiene
es_key_decision_maker, cargo_categoria y notas; `toque.resultado` es TEXT libre sin CHECK.
Decide: ¿columnas nuevas en `toque`, tabla aparte, reusar `contacto` para el KDM, o mezcla?
¿El resultado de 4 salidas se valida en DB (CHECK) o en código?
Decisión + por qué + alternativa + costo:

**B1.b [LLENAR] · Default de destinatario.** Cuando una empresa entra a campaña, ¿qué
contacto(s) reciben la cadencia por defecto? Datos: uq_contacto_principal garantiza máximo
UN es_principal=1 por empresa; hay contactos sin email; existe es_key_decision_maker.
¿Y si la empresa no tiene ningún contacto con correo: entra igual, queda bloqueada, avisa?
Decisión + por qué + alternativa + costo:

### B2 · Frontera envía-vs-registra — CERRADO (transcrito)

Decisión: la herramienta es dueña de la cadencia y EMPUJA a Apollo (correo); Apollo es solo
motor de envío. WhatsApp/llamada/LinkedIn quedan manuales en la cola del día. Tier 1 va por
paso "manual email" (revisión antes de enviar).
Por qué: Apollo solo es correo y armar cadencias ahí es enredado; acá la cadencia se sube
una vez. Alternativa rechazada: Apollo dueño de la secuencia y la herramienta solo registra.
Costo aceptado: [FALTA] (¿qué te cuesta ser el dueño? pista: si Apollo cambia su API o el
plan no expone add-to-sequence, el envío es TU problema, no de Apollo).

### B3 · Auth y credenciales — CERRADO (transcrito)

Decisión: Better Auth, email + password, sesiones en cookie HTTP-only en la misma SQLite
vía Drizzle. Identidad = email = owner. Todos los autenticados ven el pipeline compartido;
flag admin habilita el panel F2. Credenciales de conectores cifradas AES-256-GCM con llave
en variable de entorno, ciphertext en tabla `conector`.
Por qué: estándar 2026 para Next + Drizzle + SQLite, sin servicio externo, data propia.
Alternativa rechazada: Auth.js/NextAuth (modo mantenimiento). Costo aceptado: si la llave
de entorno se pierde, las credenciales guardadas no se recuperan (se re-conectan a mano).

### B4 · Modelo de fallos del INGEST — CERRADO (transcrito)

Matcher sin enlace: cola de revisión, el toque no se crea hasta enlazar. Conector caído o
token vencido: estado visible + aviso, no se cae en silencio, la corrida siguiente reintenta.
Doble ingesta: idempotencia por (transcript_proveedor + transcript_id), nunca dos toques por
sesión. Transcript sin resumen (o al revés): se guarda lo que haya, el borrador de IA se
marca para revisión. Outbox de Notion: fila en la MISMA transacción, idempotente, backoff,
log en sync_cambios.

### B5 [LLENAR] · Evolución y deuda (lo único del marco viejo que sigue sin escribir)

- ¿Qué difieres a propósito y por qué es aceptable? (LinkedIn, WhatsApp F7, multipersona
  en UI, envío automático total para Tier 1, API oficial de WhatsApp Business...)
- ¿Qué costura dejas HOY para que meter cada uno mañana no sea reescribir? (tu doc ya
  deja una para storage: eventos detrás del mismo Repository. Nombra las demás.)
Decisión + por qué + alternativa + costo:

### B6 [LLENAR] · Modelo de fallos del ENVÍO (B4 cubre ingest; el push a Apollo no)

Para cada caso, qué hace el sistema:
- El push a Apollo falla a mitad de un lote de 40 destinatarios (¿quiénes quedaron
  inscritos? ¿cómo se reanuda sin duplicar?).
- Apollo acepta el contacto pero el correo rebota o el buzón está pausado.
- Un paso "manual email" de Tier 1 lleva 3 días sin revisarse (¿la cadencia espera,
  avisa, se corre el dia_offset?).
- La respuesta llega DESPUÉS de que el toque siguiente ya salió (reply detection tardía).
- El contacto ya existía en Apollo con otro dueño/estado.
Decisión + por qué + alternativa + costo:

### B7 [LLENAR] · Dónde corre el trabajo de fondo

El ingest de Granola (F1.2), el avance diario de cadencias por dia_offset (F3), el poll de
tracking de Apollo (F4) y el outbox de Notion necesitan ejecutarse solos. Hoy la app es
Next.js corriendo local; Next no trae scheduler. Decide el mecanismo (cron del sistema,
proceso worker aparte, ruta que dispara al abrir la app, servicio siempre-vivo...) sabiendo
que tu invariante de B4 es "no se cae en silencio por días" y que la app hoy vive en tu
máquina (¿y si el laptop está apagado a la hora del envío?).
Decisión + por qué + alternativa + costo:

---

## Descartados para este plan (el test corrido; por esto no se pregunta más)

- **Rendimiento y escala**: 2-3 usuarios, ~2.900 cuentas, SQLite. evento_tracking ya quedó
  append-only e indexada en B1. Ejecución.
- **Patrones de diseño**: puertos y adaptadores ya fijados por constitución; Apollo y el
  Agent SDK caen en el molde de adaptador existente. Sin variación nueva que abstraer.
- **Seguridad**: cerrada en B3 (auth, cifrado, key de Apollo por entorno). Sin decisión nueva.
- **Consistencia y concurrencia**: los puntos reales ya viven en B4 (idempotencia) y B1
  (índice único parcial). El detalle de toques atrasados (¿se disparan juntos o se
  re-escalonan al reanudar?) queda como decisión diferida con dueño: se decide al construir
  F3.6, y tu plan debe dejarla anotada como tal, no resolverla hoy.

---

## Bloque D · El plan paso a paso (la estructura que tu plan DEBE tener) [LLENAR]

Esto es lo que pediste: todo lo que tu plan de implementación tiene que contener.

1. **Fases con orden y justificación.** Qué se construye primero y POR QUÉ ese orden
   (qué desbloquea qué, qué de-riesga qué). Dónde entra P0 (verificar Apollo en vivo,
   solo lectura) relativo a F3/F4. Tu doc ya da un orden de prioridad (F0 primero);
   el orden de CONSTRUCCIÓN es tuyo de decidir y no tiene que ser el mismo.
2. **Entregable demostrable por fase.** Al cerrar cada fase, "abro X y pasa Y". Una fase
   sin demo no es fase.
3. **Migraciones de DB por fase.** Qué tablas nuevas entran en cuál fase, cómo se aplican
   (las maestras empresa/contacto/toque NO se tocan... salvo lo que decidas en B1.a: si
   agregas columnas a `toque`, eso ES tocar una maestra y tu plan debe decir cómo).
   Incluye reflejar en schema.ts lo que uses de las columnas reales que hoy no están.
4. **Pruebas y evals por fase.** Constitución: una feature no está lista sin sus pruebas,
   y la IA (F5/F6) tiene evals propios en planning/evals.md. Qué prueba cada fase.
5. **Tareas delegables.** Cada fase partida en tareas de planning/tasks.md: una por
   delegación, diff pequeño y revisable.
6. **Riesgos por fase y plan B.** Mínimo: ¿qué haces si P0 muestra que el plan Apollo
   Professional no expone add-to-sequence o el tracking? ¿Y si el Agent SDK sobre el plan
   no sirve headless para F6?

---

## Bloque C · Predicción [LLENAR] (lo que más criterio entrena)

1. ¿En qué decisiones crees que MI plan va a diferir del tuyo, y hacia dónde?

2. ¿Dónde predigo plausible-pero-mal? (el caso feliz que olvida un modo de fallo, la
   abstracción de más, el conector que asumo trivial, el orden de fases que se ve limpio
   pero no de-riesga nada...)
