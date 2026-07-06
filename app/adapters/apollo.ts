import type {
  EnvioAdapter,
  DestinatarioEnvio,
  PasoEnvio,
  EnvioResultado,
  EventoProveedor,
} from '../core/ports/envio';
import { leerCredencialConector } from '../db/repository';

// Base y header verificados en vivo (planning/experimento-apollo.md, 2026-07-03):
// la doc dice "Bearer" pero lo que de verdad autentica es X-Api-Key contra
// api.apollo.io/api/v1 (no public-api, a diferencia de Granola).
const APOLLO_API_BASE = process.env.APOLLO_API_BASE_URL ?? 'https://api.apollo.io/api/v1';
const TIMEOUT_MS = 10_000; // un fetch colgado no puede trabar el resto del ciclo del worker

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
async function resolverContacto(apiKey: string, destinatario: DestinatarioEnvio): Promise<ContactoApollo> {
  const bulk = await llamarApollo<BulkCreateRespuesta>('/contacts/bulk_create', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      contacts: [{ email: destinatario.email, first_name: destinatario.nombre ?? undefined }],
      run_dedupe: true,
    }),
  });
  const contacto = bulk.created_contacts?.[0] ?? bulk.existing_contacts?.[0];
  if (!contacto) throw new Error(`Apollo no devolvio contacto para ${destinatario.email}`);
  return contacto;
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
      const contacto = await resolverContacto(apiKey, destinatario);

      // emailer_campaign_id va EN EL CUERPO (no solo en la URL) -- verificado en
      // vivo, es el error real que se cometio la primera vez (experimento-apollo.md).
      await llamarApollo(`/emailer_campaigns/${proveedorCampanaId}/add_contact_ids`, apiKey, {
        method: 'POST',
        body: JSON.stringify({
          emailer_campaign_id: proveedorCampanaId,
          contact_ids: [contacto.id],
          send_email_from_email_account_id: buzon,
        }),
      });

      return { proveedor: 'apollo', proveedorMensajeId: contacto.id };
    },

    async sacarDestinatario(proveedorCampanaId: string, email: string) {
      const apiKey = credencial();
      const contacto = await resolverContacto(apiKey, { email, nombre: null });

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
