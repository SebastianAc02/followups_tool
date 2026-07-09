# Plan: canal WhatsApp via Evolution API

Estado: plan aprobado en conversacion (2026-07-08), pendiente de bajar a tareas
en tasks.md cuando la Fase 0 del servidor este verde.

El servidor vive en `../whatsapp-osserver/` (Evolution API + Postgres + Redis,
ver su README.md: Fase 0 local, Fase 1 VPS Hetzner). Este documento cubre SOLO
el lado de la followups-tool.

## Contexto y decisiones tomadas

- Proveedor: Evolution API self-hosted, conector Baileys. `canal = 'whatsapp'`
  ya es dato en `toque`; lo que falta es el transporte y el modelo de lineas.
- Dos niveles de lineas: la personal de Sebastian (prioritarios, todo pasa por
  borrador -> aprobar -> enviar) y 2-3 lineas de pool (consumibles) para las
  ~500-600 empresas masivas. Rotacion y techos por linea (~20-30 msg/dia).
- Requisito duro: cuando alguien responde a CUALQUIER linea, la tool se entera
  al instante (webhook), corta la cadencia local de ese contacto y encola el
  corte en Apollo (`sacarDestinatario`, ya existe). El historial completo queda
  en el Postgres de Evolution; en `toque` guardamos lo operativo.
- Destino final: la tool completa + Evolution en el mismo VPS (webhook por
  localhost, worker 24/7). Eso arrastra tres tareas de infra: dockerizar la
  app, autenticacion delante del cockpit, backup diario de isps.db.

## La diferencia clave con Apollo (leer antes de disenar)

Apollo es un MOTOR externo: le entregamos la secuencia y el manda solo
(`crearCampanaExterna`, `sincronizarCopy`). Evolution es TRANSPORTE puro: no
tiene concepto de secuencia; el motor somos nosotros (motor-cadencia + goteo
deciden que paso toca hoy y el adaptador solo entrega UN mensaje a UN numero).
Ademas los eventos llegan al reves: Apollo se lee por poll
(`leerEventosNuevos`), Evolution nos EMPUJA por webhook.

Eso abre la decision de diseno central de esta fase (es de Sebastian, no de la
IA, modo learning):

1. **Puerto**: implementar el `EnvioAdapter` existente (app/core/ports/envio.ts)
   con metodos que no aplican (crearCampanaExterna como no-op, leerEventosNuevos
   vacio porque todo entra por webhook), o definir un puerto nuevo mas chico
   (estilo `MensajeriaDirecta`: enviarMensaje(linea, numero, texto)) y que el
   core sepa que hay dos familias de canal: motor-externo y transporte-directo.
   Trade-off: reusar el puerto mantiene UN solo enchufe para el motor de
   cadencias, pero lo engorda con semantica que WhatsApp no tiene; el puerto
   nuevo es honesto pero el motor de cadencias tendria que rutear por tipo.
2. **Identidad del destinatario**: `DestinatarioEnvio` hoy es email+nombre. Para
   WhatsApp el correlator es el telefono (el `remoteJid` del webhook se matchea
   contra `contacto`). Extender el tipo vs tipo propio.
3. **Politica de ruteo y throttle**: que linea manda cada mensaje (prioritario ->
   personal, masivo -> pool round-robin?), techo diario por linea, jitter, y que
   pasa con los pendientes de una linea caida. Son las ~10 lineas de logica de
   negocio que definen el comportamiento; las escribe Sebastian.

## Modelo de datos (migracion unica, chica)

Tabla nueva `linea_whatsapp` (la linea es DATO, no codigo, misma decision que
`canal` y `transcript_proveedor`):

- id, numero (E.164 sin +), tipo (`personal` | `pool`),
  instancia_evolution (nombre de la instancia en el servidor),
  estado (`calentando` | `activa` | `caida`), techo_diario, fecha_creacion.

No se toca `toque` (ya tiene canal + id_contacto + que_paso). El texto del
mensaje entrante/saliente va en `que_paso` o campo equivalente + el historial
completo queda consultable en Evolution (patron Granola: resumen operativo aca,
fuente completa en el proveedor).

## Piezas a construir (orden propuesto, un diff por tarea)

1. **Migracion** `linea_whatsapp` + seed de las lineas cuando existan.
2. **Puerto + adaptador** `app/adapters/evolution.ts` segun la decision de
   diseno 1. Patron identico a apollo.ts: base URL y API key por env/credencial,
   timeout, cero imports del core hacia el adaptador. Con sus pruebas
   (convencion de apollo.test.ts: fetch mockeado, contratos verificados contra
   el payload real capturado en la Fase 0 del servidor).
3. **Webhook de entrada** `app/api/webhooks/evolution/route.ts`:
   - Autenticacion del webhook (token secreto en la URL o header; Evolution
     manda lo que se configure en `webhook/set`).
   - Solo `MESSAGES_UPSERT` con `fromMe: false`.
   - Traduce el payload a evento de dominio (llegoRespuestaWhatsapp(instancia,
     telefono, texto, fecha)) y delega al core. El route handler NO decide
     nada: parsea, valida, delega (misma regla que el resto de actions).
4. **Caso de uso en el core** `llego-respuesta.ts`: matchear telefono ->
   contacto -> empresa; cortar cadencia local (motor-cadencia ya sabe sacar a
   alguien); encolar corte en Apollo via outbox (patron existente, idempotente);
   crear toque entrante en borrador para revision humana (regla de la
   constitucion: la IA no escribe sin revision).
5. **Envio por goteo**: conectar el motor de cadencias con el adaptador para
   canal whatsapp, aplicando la politica de ruteo/throttle (decision 3) y
   jitter. Nivel personal: solo mensajes aprobados en la cola del dia.
6. **Infra** (tareas separadas, no colgarlas de las de dominio): Dockerfile de
   la app, compose unificado en el VPS, auth delante del cockpit, backup diario
   de isps.db, rotar las keys expuestas ANTES de subirlas al servidor.

## Fuera de alcance (no construir ahora)

- Responder conversaciones desde la tool (v1 solo manda, recibe y corta).
- Cosecha/import del historial viejo de WhatsApp (constitucion: fuera de v1).
- Multi-dispositivo por linea, grupos, media (solo texto en v1).
- Deteccion automatica de "linea a punto de caer" (v2; en v1 el estado se
  cambia a mano cuando pasa).

## Criterio de listo

Un contacto de prueba recibe un paso de cadencia por una linea del pool,
responde, y sin intervencion humana: la cadencia local queda cortada, el corte
en Apollo queda encolado en outbox, y aparece un toque borrador con su
respuesta en la cola de revision. Todo con pruebas y sin que el core importe
nada de Evolution.
