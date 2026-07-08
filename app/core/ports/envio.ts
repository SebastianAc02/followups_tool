// El core define QUE necesita de un motor de envio de cadencias, no COMO se manda.
// Apollo es la primera implementacion (app/adapters/apollo.ts); el dia que se quiera
// cambiar de motor (Lemlist, Smartlead) o correr headless sin Apollo, ese adaptador
// implementa esta MISMA interfaz y el core no cambia (B5 de plan-claude-v2.md).
//
// Contrato real de Apollo verificado en vivo (planning/experimento-apollo.md), lo
// que el adaptador tiene que resolver DETRAS del puerto:
// - crear contacto: `POST /contacts/bulk_create` con `run_dedupe:true` (hasta 100,
//   devuelve created_contacts + existing_contacts) -- asi se cumple B6 (nunca
//   duplica contacto).
// - inscribir a secuencia: `POST /emailer_campaigns/{id}/add_contact_ids` exige
//   `emailer_campaign_id` EN EL CUERPO + `send_email_from_email_account_id` (el
//   buzon), no solo el id de la URL.
// - sacar de secuencia: `POST /emailer_campaigns/{id}/remove_or_stop_contact_ids`.
// - archivar secuencia: `POST /emailer_campaigns/{id}/archive`.
// - NO existe DELETE por API (ni secuencias ni contactos). isps.db es la fuente de
//   la verdad; Apollo solo inscribe y manda, la vida/muerte del dato vive en la base.
// - tracking se lee de `GET /emailer_messages/search`; cada evento se guarda en
//   evento_tracking por proveedor_evento_id (indice unico ya creado en V5.1, la
//   idempotencia del poll depende de que el adaptador devuelva ese id tal cual
//   viene de Apollo, sin inventarlo).
//
// Preguntas de diseno que te toca resolver a vos, no hay una unica respuesta
// correcta:
// 1. Granularidad: un metodo por operacion de Apollo (crear contacto, inscribir,
//    sacar, archivar, leer eventos) vs uno de mas alto nivel en lenguaje de dominio
//    ("enviar este paso a este destinatario", que el adaptador resuelve por dentro
//    como create-contact + add_contact_ids)? La segunda esconde mas vocabulario de
//    Apollo del core; la primera es mas facil de testear en aislamiento pero el
//    core empieza a pensar en "secuencias" y "buzones", que son conceptos de Apollo.
// 2. Que forma tiene el dato que cruza el puerto: le pasas el destinatario+paso tal
//    como viven en la DB (el adaptador arma el payload de Apollo) o ya algo mas
//    cercano al payload (email, nombre, asunto, cuerpo, id de campana externa)?
// 3. Como modelas "leer eventos nuevos": el puerto devuelve TODOS los eventos desde
//    una fecha (el core/worker filtra los ya vistos por proveedor_evento_id, que es
//    donde vive el indice unico) o el adaptador ya sabe cual fue el ultimo evento
//    visto? Ojo: el adaptador no deberia recibir el Repository (rompe la regla de
//    que los adaptadores no se conocen entre si), asi que la segunda opcion no
//    encaja limpio con la arquitectura actual.
//
// Diseno (escrito por Claude con deadline explicito de Sebastian, excepcion puntual
// al modo learning -- ver CLAUDE.md). Respuestas a las 3 preguntas de arriba:
// 1. Granularidad de dominio: los metodos hablan en terminos de "paso" y
//    "destinatario", nunca de "contacto" ni "secuencia" (vocabulario de Apollo). El
//    search-first + bulk_create con dedupe vive DENTRO de enviarPaso.
// 2. Los tipos son forma de dominio (email/nombre, asunto/cuerpo/canal), no el
//    payload de Apollo -- el adaptador arma ese payload.
// 3. leerEventosNuevos devuelve TODOS los eventos desde una fecha; el llamador
//    (worker de V5.5) los inserta contra evento_tracking, y el indice unico por
//    proveedor_evento_id es quien de verdad garantiza que no se duplican.
//
// proveedorCampanaId es el emailer_campaign_id de Apollo (columna nueva
// campana.proveedor_campana_id, V5.2): crearCampanaExterna la crea una sola vez:
// las llamadas siguientes (enviar, sacar, archivar, leer eventos) la reciben ya
// resuelta, nunca vuelven a crear la secuencia.

export type DestinatarioEnvio = {
  email: string;
  nombre: string | null;
};

export type PasoEnvio = {
  asunto: string | null;
  cuerpo: string;
  canal: string;
};

export type EnvioResultado = {
  proveedor: string;
  proveedorMensajeId: string;
};

// sincronizarCopy (sesion 2026-07-08): sube/actualiza el copy de TODA la cadencia de
// una vez, sin depender de un destinatario -- por eso es un metodo aparte de
// enviarPaso (que si necesita un destinatario real y solo sube el paso que le toca A
// ESE destinatario, no la cadencia completa). Sirve para dos cosas: (1) que la
// secuencia recien creada por crearCampanaExterna deje de estar vacia, y (2) volver a
// llamarlo despues de editar un paso en /cadencias re-sube ese mismo paso (idempotente
// via proveedorStepId/proveedorTemplateId, nunca duplica un step en Apollo).
export type PasoParaSincronizar = {
  idPaso: number;
  idVersion: number;
  orden: number;
  diaOffset: number;
  asunto: string | null;
  cuerpo: string;
  proveedorStepId: string | null;
  proveedorTemplateId: string | null;
};

export type PasoSincronizado = {
  idPaso: number;
  idVersion: number;
  proveedorStepId: string;
  proveedorTemplateId: string;
};

// email (V5.5): a quien le paso este evento. Necesario para resolver el destinatario
// de dominio -- el id de mensaje de Apollo NO es lo mismo que proveedorMensajeId
// guardado por enviarPaso (ese es el id del CONTACTO, resuelto en add_contact_ids;
// el id del MENSAJE real solo existe una vez Apollo efectivamente lo manda, y no se
// conoce en el momento de enviarPaso). El email es el unico correlator estable entre
// "lo que enviamos" y "lo que Apollo reporta en tracking".
export type EventoProveedor = {
  proveedorEventoId: string;
  tipo: string;
  canal: string;
  fechaEvento: string;
  email: string;
  detalle: unknown;
};

export interface EnvioAdapter {
  // Crea la secuencia externa una sola vez por campana; devuelve el id a guardar
  // en campana.proveedor_campana_id.
  crearCampanaExterna(nombre: string): Promise<string>;

  // Envia UN paso a UN destinatario dentro de la campana externa ya creada.
  // Internamente: search-first/bulk_create con dedupe (nunca duplica contacto),
  // luego add_contact_ids con el buzon configurado. Idempotencia de "nunca dos
  // envios del mismo par destinatario+paso" la garantiza el indice unico de
  // paso_inscripcion (V5.1), no este metodo.
  enviarPaso(
    proveedorCampanaId: string,
    destinatario: DestinatarioEnvio,
    paso: PasoEnvio,
  ): Promise<EnvioResultado>;

  // Sube/actualiza en Apollo TODOS los pasos de la cadencia de una campana (POST
  // /emailer_steps + PUT /emailer_templates/{id}), sin tocar destinatarios. Create-si-
  // falta / update-si-existe segun proveedorStepId/proveedorTemplateId de cada paso;
  // el llamador persiste los ids devueltos para que la proxima llamada actualice en
  // vez de duplicar.
  sincronizarCopy(proveedorCampanaId: string, pasos: PasoParaSincronizar[]): Promise<PasoSincronizado[]>;

  // Saca al destinatario de la secuencia externa (remove_or_stop_contact_ids).
  // No borra el contacto: Apollo no tiene DELETE por API y no hace falta, isps.db
  // es la fuente de la verdad.
  sacarDestinatario(proveedorCampanaId: string, email: string): Promise<void>;

  // Archiva la secuencia completa. Unica "limpieza" que expone la API de Apollo.
  archivarCampana(proveedorCampanaId: string): Promise<void>;

  // Lee eventos de tracking desde una fecha (ISO). El llamador decide que hacer
  // con proveedorEventoId (insertar contra evento_tracking, el indice unico
  // rechaza el duplicado si el poll trae uno que ya se vio).
  leerEventosNuevos(proveedorCampanaId: string, desde: string): Promise<EventoProveedor[]>;
}
