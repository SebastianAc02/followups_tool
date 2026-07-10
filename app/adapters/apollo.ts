import type {
  EnvioAdapter,
  DestinatarioEnvio,
  PasoEnvio,
  EnvioResultado,
  EventoProveedor,
  PasoParaSincronizar,
  PasoSincronizado,
} from '../core/ports/envio';
import { leerCredencialConector } from '../db/repository';
import { calcularWaitApollo } from '../core/motor-cadencia';
import { reescribirLinksClic, inyectarPixelApertura } from '../core/tracking-links';

// URL publica de ESTA app (sesion 2026-07-09, tracking de opens/clicks): sin configurar,
// sincronizarCopy sube el copy tal cual, sin pixel ni reescritura de links -- correo
// sigue funcionando igual que antes, el tracking es un opt-in que se activa el dia que
// exista un deploy publico y esta variable apunte a el (Gmail/Outlook no pueden tocar
// localhost). Mismo patron que APOLLO_MAILBOX_ID: se lee en cada llamada, no congelada.
function appBaseUrl(): string | undefined {
  return process.env.APP_BASE_URL;
}

// Base y header verificados en vivo (planning/experimento-apollo.md, 2026-07-03):
// la doc dice "Bearer" pero lo que de verdad autentica es X-Api-Key contra
// api.apollo.io/api/v1 (no public-api, a diferencia de Granola).
const APOLLO_API_BASE = process.env.APOLLO_API_BASE_URL ?? 'https://api.apollo.io/api/v1';
const TIMEOUT_MS = 10_000; // un fetch colgado no puede trabar el resto del ciclo del worker

// Traduce [variable] (vocabulario neutral de render-copy.ts) a los merge-tags nativos de
// Apollo antes de subir el copy. Solo lo que este mapa reconoce se traduce; toda variable
// sin entrada pasa igual (el autor puede escribir el {{tag}} de Apollo directo si lo
// necesita). Misma regex de deteccion que render-copy.ts, para consistencia.
//
// nombre -> {{first_name}} confirmado contra la API real (planning/experimento-apollo.md,
// gate G1). empresa -> {{company_name}} y cargo -> {{title}} son los tags que Apollo
// documenta como estandar, pero AUN NO confirmados contra la cuenta real -- Sebastian los
// prueba en vivo el (2026-07-09) antes de confiar en ellos en produccion. El resto
// (ciudad, telefono, email, remitente, remitenteEmail) sigue afuera del mapa: no hay tag
// nativo de Apollo para eso, pasan sin traducir.
const VARIABLES_A_TAGS_APOLLO: Record<string, string> = {
  nombre: '{{first_name}}',
  empresa: '{{company_name}}',
  cargo: '{{title}}',
};

function traducirVariablesApollo(texto: string): string {
  return texto.replace(/\[([^[\]]+)\]/g, (match, nombreVariable) => {
    const tag = VARIABLES_A_TAGS_APOLLO[nombreVariable.trim()];
    return tag ?? match;
  });
}

// Apollo es un conector GLOBAL (una sola cuenta de OnePay), como Notion: sin idUsuario.
async function llamarApollo<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${APOLLO_API_BASE}${path}`, {
      ...init,
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Apollo no respondio en ${TIMEOUT_MS}ms en ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    throw new Error(`Apollo respondio ${res.status} en ${path}`);
  }
  return res.json() as Promise<T>;
}

type ContactoApollo = { id: string; email: string };
type BulkCreateRespuesta = { created_contacts?: ContactoApollo[]; existing_contacts?: ContactoApollo[] };
type CampanaRespuesta = { emailer_campaign?: { id: string }; id?: string };
// Verificado en vivo (sesion 2026-07-09, cuenta real, paso orden=2): la respuesta de
// POST /emailer_steps NO anida emailer_touches (plural) dentro de emailer_step como se
// habia adivinado -- trae emailer_touch (SINGULAR) y emailer_template como hermanos de
// emailer_step, todos a nivel raiz del objeto (mas emailer_steps[], el listado completo
// de la secuencia, y team{}, que no se usan aca). El id del step esta en
// emailer_step.id; el id del template auto-creado esta en emailer_template.id a nivel
// raiz (tambien disponible como emailer_touch.emailer_template.id / .emailer_template_id,
// se usan como respaldo por si el raiz llegara a faltar).
type EmailerStepRespuesta = {
  emailer_step?: { id?: string };
  emailer_template?: { id?: string };
  emailer_touch?: { emailer_template_id?: string; emailer_template?: { id?: string } };
};
// Campos verificados en vivo contra la cuenta real (V5.3, gate G1, 2026-07-06) --
// NO son los que se habian supuesto antes de probar. emailer_messages NO tiene
// opened_at/clicked_at/replied_at/bounced_at/sent_at: solo status ('completed'
// cuando se envio, 'failed' cuando fallo/rebota), replied (booleano, SIN fecha
// propia) y bounce (booleano, SIN fecha propia). to_email es el campo de email
// real (confirmado, no email/contact_email como se habia adivinado).
type MensajeApollo = {
  id: string;
  to_email?: string;
  status?: string;
  replied?: boolean | null;
  bounce?: boolean | null;
  created_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
};
type MensajesRespuesta = { emailer_messages?: MensajeApollo[] };

// Sin pagination.total_entries en la respuesta de este endpoint (verificado en
// vivo: la clave "pagination" no viene, solo emailer_messages/emailer_steps/
// num_fetch_result). Se para cuando una pagina trae menos de per_page (senal de
// que ya no hay mas), con un tope de seguridad -- mismo patron que el adaptador
// de Granola (MAX_PAGINAS), para no pollear sin limite si una campana tiene
// miles de mensajes historicos.
const PER_PAGE_MENSAJES = 100;
const MAX_PAGINAS_MENSAJES = 10;

async function traerMensajesDeCampana(proveedorCampanaId: string, apiKey: string): Promise<MensajeApollo[]> {
  const resultado: MensajeApollo[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_MENSAJES; pagina++) {
    const query = new URLSearchParams({
      per_page: String(PER_PAGE_MENSAJES),
      page: String(pagina),
      'emailer_campaign_ids[]': proveedorCampanaId,
    });
    const data = await llamarApollo<MensajesRespuesta>(`/emailer_messages/search?${query}`, apiKey);
    const mensajes = data.emailer_messages ?? [];
    resultado.push(...mensajes);
    if (mensajes.length < PER_PAGE_MENSAJES) break;
  }
  return resultado;
}

// Identidad de envio (que buzon manda): decision de negocio S2 pendiente con Camilo
// (hoy solo hay 2 buzones, ambos de el). No bloquea construir el adaptador, si bloquea
// que enviarPaso corra sin esta variable configurada. Se lee en cada llamada (no
// congelada en un const de modulo) para que un cambio en tiempo de ejecucion aplique.
function buzonEnvioId(): string | undefined {
  return process.env.APOLLO_MAILBOX_ID;
}

// Un solo INSERT por email: bulk_create con run_dedupe:true nunca duplica un contacto
// que ya existe (B6). Se reusa para "encontrar el contacto de este email" en
// sacarDestinatario, ya que el plan no documenta un endpoint separado de busqueda.
// actualizarSiDedup: solo el camino de ENVIO (enviarPaso) necesita que, si el contacto
// ya existia, se sobreescriban sus datos de personalizacion con los nuestros. El camino
// de SACAR (sacarDestinatario) solo necesita el id para removerlo de la secuencia -- no
// va a mandar nada, actualizarle los datos ahi seria una llamada inutil.
async function resolverContacto(
  apiKey: string,
  destinatario: DestinatarioEnvio,
  actualizarSiDedup = false,
): Promise<ContactoApollo> {
  // email nullable (sesion 2026-07-09, DestinatarioEnvio.telefono para WhatsApp): Apollo
  // es EXCLUSIVAMENTE el proveedor de canal=correo, siempre con email real -- si esto
  // truena es un bug de quien llama (goteo enrutando mal), no un caso a manejar en silencio.
  if (!destinatario.email) throw new Error('Apollo requiere email y el destinatario no trae uno');
  // Los campos de personalizacion, en un solo lugar: se mandan al crear Y (si el
  // contacto ya existia) al actualizar, para que digan lo mismo.
  const datosPersonalizacion = {
    first_name: destinatario.nombre ?? undefined,
    organization_name: destinatario.empresa ?? undefined,
    title: destinatario.cargo ?? undefined,
  };
  const bulk = await llamarApollo<BulkCreateRespuesta>('/contacts/bulk_create', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      contacts: [{ email: destinatario.email, ...datosPersonalizacion }],
      run_dedupe: true,
    }),
  });
  const creado = bulk.created_contacts?.[0];
  const existente = bulk.existing_contacts?.[0];
  const contacto = creado ?? existente;
  if (!contacto) throw new Error(`Apollo no devolvio contacto para ${destinatario.email}`);

  // Descubierto en vivo (2026-07-10, prueba multicanal real): bulk_create con dedupe,
  // cuando el contacto YA existe, lo reusa SIN aplicar los campos de arriba -- se
  // queda con los datos viejos que Apollo tenia (nombre/empresa/cargo de una prueba
  // anterior, o de la propia base de Apollo). Un correo salio con datos basura y otro
  // fallo por company_name vacio. Solo el camino deduplicado necesita el PUT: un
  // created_contacts ya nace con nuestros datos, no hace falta la llamada extra.
  if (actualizarSiDedup && !creado && existente) {
    await llamarApollo(`/contacts/${existente.id}`, apiKey, {
      method: 'PUT',
      body: JSON.stringify(datosPersonalizacion),
    });
  }
  return contacto;
}

// Inscribe un contacto en una secuencia. Devuelve la razon del skip (Apollo lo
// reporta con HTTP 200 en skipped_contact_ids, nunca como error HTTP) o undefined si
// quedo inscrito de verdad.
async function inscribirContacto(apiKey: string, proveedorCampanaId: string, contactoId: string, buzon: string): Promise<string | undefined> {
  const respuesta = await llamarApollo<{ skipped_contact_ids?: Record<string, string> }>(
    `/emailer_campaigns/${proveedorCampanaId}/add_contact_ids`,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({ emailer_campaign_id: proveedorCampanaId, contact_ids: [contactoId], send_email_from_email_account_id: buzon }),
    },
  );
  return respuesta.skipped_contact_ids?.[contactoId];
}

// Auto-sanado (decision de Sebastian, 2026-07-10): saca al contacto SOLO de las
// secuencias ARCHIVADAS donde esta atascado (una campana que cancelamos deja al
// contacto 'finished' ahi, y Apollo bloquea re-inscribirlo en otra). Frontera de
// seguridad: una secuencia ACTIVA no se toca -- ese "finished" es una proteccion real
// contra doble-toque. Devuelve los ids de las que de verdad libero.
async function liberarDeSecuenciasArchivadas(apiKey: string, contactoId: string): Promise<string[]> {
  const c = await llamarApollo<{ contact?: { emailer_campaign_ids?: string[] } }>(`/contacts/${contactoId}`, apiKey);
  const secuencias = c.contact?.emailer_campaign_ids ?? [];
  const archivadas: string[] = [];
  for (const seqId of secuencias) {
    const camp = await llamarApollo<{ emailer_campaign?: { archived?: boolean } }>(`/emailer_campaigns/${seqId}`, apiKey);
    if (camp.emailer_campaign?.archived) archivadas.push(seqId);
  }
  if (archivadas.length > 0) {
    await llamarApollo('/emailer_campaigns/remove_or_stop_contact_ids', apiKey, {
      method: 'POST',
      body: JSON.stringify({ emailer_campaign_ids: archivadas, contact_ids: [contactoId], mode: 'remove' }),
    });
  }
  return archivadas;
}

// Mapeo de campos de emailer_messages a nuestro vocabulario de evento_tracking.
// Verificado en vivo (V5.3): NO hay opened/clicked como eventos con fecha propia en
// este endpoint (Apollo los usa solo como FILTRO de busqueda, emailer_message_stats[],
// no los devuelve en el objeto). replied y bounce tampoco traen su propia fecha --
// son booleanos sin timestamp; completed_at/failed_at son la mejor aproximacion
// disponible. Por eso 'abierto'/'clic' se DESCARTARON del mapeo (dato que no existe
// no se inventa): solo 'enviado', 'respondio' y 'rebota' son reales.
function mapearAEventos(mensaje: MensajeApollo): EventoProveedor[] {
  const email = mensaje.to_email;
  if (!email) return []; // sin email no hay con que resolver el destinatario; se descarta

  const eventos: { tipo: string; fecha: string | null | undefined }[] = [];
  if (mensaje.status === 'completed') {
    eventos.push({ tipo: 'enviado', fecha: mensaje.completed_at ?? mensaje.created_at });
  }
  if (mensaje.bounce) {
    eventos.push({ tipo: 'rebota', fecha: mensaje.failed_at ?? mensaje.completed_at });
  }
  if (mensaje.replied) {
    eventos.push({ tipo: 'respondio', fecha: mensaje.completed_at });
  }

  return eventos
    .filter((e) => e.fecha)
    .map((e) => ({
      // proveedor_evento_id distinto por TIPO de evento del mismo mensaje (un
      // mensaje puede enviarse Y responderse); el id de Apollo es por mensaje,
      // no por evento individual, asi que se compone con el tipo.
      proveedorEventoId: `${mensaje.id}:${e.tipo}`,
      tipo: e.tipo,
      canal: 'correo',
      fechaEvento: e.fecha as string,
      email,
      detalle: mensaje,
    }));
}

export function crearApolloAdapter(): EnvioAdapter {
  function credencial(): string {
    const key = leerCredencialConector('apollo');
    if (!key) throw new Error('No hay credencial de Apollo configurada');
    return key;
  }

  return {
    async crearCampanaExterna(nombre: string) {
      const apiKey = credencial();
      const data = await llamarApollo<CampanaRespuesta>('/emailer_campaigns', apiKey, {
        method: 'POST',
        body: JSON.stringify({ name: nombre }),
      });
      const id = data.emailer_campaign?.id ?? data.id;
      if (!id) throw new Error('Apollo no devolvio id de secuencia al crearla');
      return id;
    },

    async sincronizarCopy(proveedorCampanaId: string, pasos: PasoParaSincronizar[]): Promise<PasoSincronizado[]> {
      const apiKey = credencial();
      const ordenados = [...pasos].sort((a, b) => a.orden - b.orden);
      // Perezoso a proposito: calcularWaitApollo tira mientras este pendiente de
      // implementar (ver motor-cadencia.ts), pero re-sincronizar copy de pasos que YA
      // tienen step+template en Apollo (el caso "editar") no necesita el wait -- solo
      // hace falta al CREAR un step nuevo. Que editar funcione hoy sin esperar a esa
      // pieza, y que crear siga bloqueado hasta que este lista, es intencional.
      let waitsCache: ReturnType<typeof calcularWaitApollo> | null = null;
      function waits() {
        if (!waitsCache) waitsCache = calcularWaitApollo(ordenados.map((p) => ({ orden: p.orden, diaOffset: p.diaOffset })));
        return waitsCache;
      }

      const resultado: PasoSincronizado[] = [];
      for (const [posicion, paso] of ordenados.entries()) {
        let stepId = paso.proveedorStepId;
        let templateId = paso.proveedorTemplateId;

        if (!stepId || !templateId) {
          const wait = waits().find((w) => w.orden === paso.orden);
          if (!wait) throw new Error(`calcularWaitApollo no devolvio wait para el paso orden=${paso.orden}`);
          const data = await llamarApollo<EmailerStepRespuesta>('/emailer_steps', apiKey, {
            method: 'POST',
            body: JSON.stringify({
              emailer_campaign_id: proveedorCampanaId,
              position: posicion + 1,
              type: 'auto_email',
              wait_mode: wait.waitMode,
              wait_time: wait.waitTime,
            }),
          });
          stepId = data.emailer_step?.id ?? null;
          templateId = data.emailer_template?.id ?? data.emailer_touch?.emailer_template_id ?? data.emailer_touch?.emailer_template?.id ?? null;
          if (!stepId || !templateId) {
            // Se incluye la respuesta cruda EN EL MENSAJE (no solo en un log que se
            // pierde): asi, si Apollo alguna vez cambia esta forma de nuevo, queda
            // visible de una en la UI (ver avisoSecuenciaExterna en
            // app/campanas/[id]/lanzar/actions.ts) sin tener que adivinar a ciegas.
            throw new Error(
              `Apollo no devolvio step/template al crear el paso orden=${paso.orden} (forma de respuesta ya verificada en vivo, ver comentario de EmailerStepRespuesta -- esto significa que Apollo cambio la forma de nuevo). Respuesta cruda de Apollo: ${JSON.stringify(data)}`,
            );
          }
        }

        const base = appBaseUrl();
        // {{email}} como correlator NO esta confirmado en vivo todavia (a diferencia de
        // {{first_name}}) -- de hecho el mapa VARIABLES_A_TAGS_APOLLO de arriba deja
        // "email" explicitamente afuera porque no hay tag nativo documentado para eso.
        // Si Apollo no lo soporta, el primer pixel/click real llegaria con el texto
        // literal "{{email}}" en el query param (se veria de inmediato, no un fallo
        // silencioso) -- PRIMERA COSA que verificar en vivo antes de confiar en esto:
        // mandarse un correo de prueba y mirar si el link/pixel trae el email real.
        // sincronizarCopy solo recibe pasos de canal 'correo' (pasosParaSincronizarCopy
        // ya filtra por eso, ver app/db/repository.ts) -- no hace falta re-chequear el
        // canal aca, el pixel/reescritura de links solo tiene sentido para HTML de correo.
        let bodyHtml = traducirVariablesApollo(paso.cuerpo);
        if (base) {
          const params = { baseUrl: base, proveedorCampanaId };
          bodyHtml = inyectarPixelApertura(reescribirLinksClic(bodyHtml, params), params);
        }

        await llamarApollo(`/emailer_templates/${templateId}`, apiKey, {
          method: 'PUT',
          body: JSON.stringify({
            subject: traducirVariablesApollo(paso.asunto ?? ''),
            body_html: bodyHtml,
          }),
        });

        resultado.push({ idPaso: paso.idPaso, idVersion: paso.idVersion, proveedorStepId: stepId, proveedorTemplateId: templateId });
      }
      return resultado;
    },

    async enviarPaso(
      proveedorCampanaId: string,
      destinatario: DestinatarioEnvio,
      _paso: PasoEnvio,
    ): Promise<EnvioResultado> {
      const buzon = buzonEnvioId();
      if (!buzon) {
        throw new Error('APOLLO_MAILBOX_ID no configurado (decision de negocio S2 pendiente)');
      }
      const apiKey = credencial();
      const contacto = await resolverContacto(apiKey, destinatario, true);

      // emailer_campaign_id va EN EL CUERPO (no solo en la URL) -- verificado en vivo.
      // Un HTTP 200 aca NO garantiza que quedo inscrito: Apollo puede saltarlo en
      // silencio (skipped_contact_ids), nunca como error HTTP.
      let razonSalteado = await inscribirContacto(apiKey, proveedorCampanaId, contacto.id, buzon);

      // Auto-sanado: si esta atascado 'finished' en secuencias ARCHIVADAS (típico de
      // una campana que cancelamos y relanzamos), lo libera de esas y reintenta UNA vez.
      // Si el skip es por otra razon (unsubscribed, bounced) o la secuencia que lo tiene
      // sigue ACTIVA, no auto-sana -- se respeta esa proteccion y se propaga el error.
      if (razonSalteado === 'contacts_finished_in_other_campaigns') {
        const liberadas = await liberarDeSecuenciasArchivadas(apiKey, contacto.id);
        if (liberadas.length > 0) {
          razonSalteado = await inscribirContacto(apiKey, proveedorCampanaId, contacto.id, buzon);
        }
      }

      if (razonSalteado) {
        throw new Error(`Apollo salteo el contacto ${contacto.id} al inscribirlo (${razonSalteado})`);
      }

      return { proveedor: 'apollo', proveedorMensajeId: contacto.id };
    },

    async sacarDestinatario(proveedorCampanaId: string, email: string) {
      const apiKey = credencial();
      const contacto = await resolverContacto(apiKey, { email, telefono: null, nombre: null, empresa: null, cargo: null });

      // Verificado en vivo (V5.3): el endpoint NO va anidado con el id en la URL
      // (esa forma da 404, a pesar de que asi lo tenia documentado
      // experimento-apollo.md antes de probarlo). Es plano, `/emailer_campaigns/
      // remove_or_stop_contact_ids`, con emailer_campaign_ids en PLURAL (array) y
      // exige ademas un `mode` (probado "remove", el que mejor calza con "sacar
      // de secuencia" -- Apollo no documenta los valores validos de mode).
      await llamarApollo('/emailer_campaigns/remove_or_stop_contact_ids', apiKey, {
        method: 'POST',
        body: JSON.stringify({
          emailer_campaign_ids: [proveedorCampanaId],
          contact_ids: [contacto.id],
          mode: 'remove',
        }),
      });
    },

    async aprobarSecuencia(proveedorCampanaId: string) {
      const apiKey = credencial();
      // Descubierto en vivo (2026-07-10, prueba multicanal real): aprobar la secuencia
      // (active:true) NO aprueba los touches (cada paso/template nace 'to_be_reviewed'
      // y Apollo no manda nada mientras siga asi). Hay que aprobar CADA touch de CADA
      // step aparte -- ninguna llamada existente devuelve ambos ids juntos, toca
      // listarlos: GET /emailer_campaigns/{id} trae los steps, GET /emailer_touches
      // ?emailer_step_id=... trae los touches de cada uno.
      const camp = await llamarApollo<{ emailer_campaign?: { emailer_steps?: { id?: string }[] } }>(
        `/emailer_campaigns/${proveedorCampanaId}`,
        apiKey,
      );
      const stepIds = (camp.emailer_campaign?.emailer_steps ?? []).map((s) => s.id).filter((id): id is string => !!id);

      for (const stepId of stepIds) {
        const data = await llamarApollo<{ emailer_touches?: { id?: string }[] }>(
          `/emailer_touches?emailer_step_id=${stepId}`,
          apiKey,
        );
        const touchIds = (data.emailer_touches ?? []).map((t) => t.id).filter((id): id is string => !!id);
        for (const touchId of touchIds) {
          await llamarApollo(`/emailer_touches/${touchId}/approve`, apiKey, { method: 'POST' });
        }
      }

      // approve de la secuencia AL FINAL: es lo que dispara el envio real (verificado
      // contra la doc oficial de Apollo, ver scripts/apollo_probe_envio.py). Sin esto
      // la secuencia queda creada e inscrita pero Apollo nunca manda el correo.
      await llamarApollo(`/emailer_campaigns/${proveedorCampanaId}/approve`, apiKey, { method: 'POST' });
    },

    async archivarCampana(proveedorCampanaId: string) {
      const apiKey = credencial();
      // Unica limpieza que expone la API (no hay DELETE de secuencias, verificado en vivo).
      await llamarApollo(`/emailer_campaigns/${proveedorCampanaId}/archive`, apiKey, { method: 'POST' });
    },

    async leerEventosNuevos(proveedorCampanaId: string, desde: string): Promise<EventoProveedor[]> {
      const apiKey = credencial();
      // Verificado en vivo (V5.3): ningun nombre de parametro de rango de fecha
      // (probados: created_after, start_date, since, date_from, created_since,
      // due_at_after, completed_after) filtra de verdad -- Apollo ignora en
      // silencio los parametros que no reconoce y devuelve 200 igual, asi que un
      // parametro mal escrito nunca se habria notado por el status code. El filtro
      // real que SI funciona es emailer_campaign_ids[] (confirmado); la fecha se
      // filtra del lado del cliente sobre created_at.
      const mensajes = await traerMensajesDeCampana(proveedorCampanaId, apiKey);
      return mensajes
        .filter((m) => (m.created_at ?? '') >= desde)
        .flatMap(mapearAEventos);
    },
  };
}
