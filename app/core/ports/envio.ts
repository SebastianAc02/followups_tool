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

// telefono (sesion 2026-07-09, WhatsApp): Apollo lee email, WhatsApp lee telefono --
// cada adaptador proyecta el campo que le sirve de correlator. Es AMPLIAR este tipo
// (email pasa a nullable), no un DestinatarioEnvio por canal: un canal futuro que
// necesite otro campo lo agrega aca sin que push.ts tenga que ramificar por canal.
export type DestinatarioEnvio = {
  email: string | null;
  telefono: string | null;
  nombre: string | null;
  // Personalizacion firmografica (sesion 2026-07-09, prueba multicanal): Apollo los
  // proyecta a {{company_name}}/{{title}}. Nullable: un canal que no los use
  // (WhatsApp) simplemente los ignora (mismo criterio D3 que telefono/email).
  empresa: string | null;
  cargo: string | null;
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

// Segregacion (sesion 2026-07-09, canal WhatsApp -- ver planning/plan-whatsapp-adapter.md
// D2): EnvioAdapter era en realidad TRES roles usados por tres consumidores distintos
// (push.ts solo entrega, tracking.ts solo lee eventos, las acciones de campana solo
// manejan el ciclo de vida de la secuencia externa). Partirlo en estas tres interfaces
// es ADITIVO: EnvioAdapter pasa a ser su interseccion, asi que Apollo (que ya
// implementaba las tres) lo sigue satisfaciendo sin cambiar una linea. WhatsApp
// implementa SOLO CanalEntrega y entra al mismo registro/loop de push.ts sin no-ops.

export interface CanalEntrega {
  // Envia UN paso a UN destinatario. Idempotencia de "nunca dos envios del mismo par
  // destinatario+paso" la garantiza el indice unico de paso_inscripcion (V5.1), no
  // este metodo.
  enviarPaso(
    proveedorCampanaId: string,
    destinatario: DestinatarioEnvio,
    paso: PasoEnvio,
  ): Promise<EnvioResultado>;
}

export interface TrackingPoll {
  // Saca al destinatario de la secuencia externa (remove_or_stop_contact_ids en
  // Apollo). No borra el contacto: isps.db es la fuente de la verdad.
  sacarDestinatario(proveedorCampanaId: string, email: string): Promise<void>;

  // Lee eventos de tracking desde una fecha (ISO). El llamador decide que hacer con
  // proveedorEventoId (insertar contra evento_tracking, el indice unico rechaza el
  // duplicado si el poll trae uno que ya se vio).
  leerEventosNuevos(proveedorCampanaId: string, desde: string): Promise<EventoProveedor[]>;
}

export interface MotorSecuencia {
  // Crea la secuencia externa una sola vez por campana; devuelve el id a guardar en
  // campana.proveedor_campana_id.
  crearCampanaExterna(nombre: string): Promise<string>;

  // Sube/actualiza en Apollo TODOS los pasos de la cadencia de una campana. Create-si-
  // falta / update-si-existe segun proveedorStepId/proveedorTemplateId de cada paso;
  // el llamador persiste los ids devueltos para que la proxima llamada actualice en
  // vez de duplicar.
  sincronizarCopy(proveedorCampanaId: string, pasos: PasoParaSincronizar[]): Promise<PasoSincronizado[]>;

  // Aprueba la secuencia (POST /emailer_campaigns/{id}/approve, verificado contra la
  // doc oficial de Apollo -- ver scripts/apollo_probe_envio.py). Sin este paso la
  // secuencia queda creada e inscrita pero Apollo NUNCA manda el correo real: approve
  // es lo que dispara el envio. Se llama UNA vez por campana, despues de
  // sincronizarCopy (tarea A3, plan-prueba-real-multicanal.md).
  aprobarSecuencia(proveedorCampanaId: string): Promise<void>;

  // Archiva la secuencia completa. Unica "limpieza" que expone la API de Apollo.
  archivarCampana(proveedorCampanaId: string): Promise<void>;
}

// EnvioAdapter sigue existiendo para quien necesita los tres roles a la vez (hoy solo
// Apollo): campanas/actions.ts y worker/index.ts (tareaTracking) lo siguen pidiendo
// completo, sin cambio de firma.
export interface EnvioAdapter extends CanalEntrega, TrackingPoll, MotorSecuencia {}
