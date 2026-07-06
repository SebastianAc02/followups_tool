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
// Nombre exacto del campo de email del destinatario: NO verificado en vivo todavia
// (experimento-apollo.md solo confirmo que el endpoint responde 200 y algunos
// nombres de campo de estado, la lista estaba vacia -- sin envios reales, nunca se
// vio una fila real). Se prueban 3 variantes plausibles en orden; esto se confirma
// de verdad en V5.3 (gate G1) contra un envio real y se ajusta aqui si difiere.
type MensajeApollo = {
  id: string;
  email?: string;
  to_email?: string;
  contact_email?: string;
  emailer_message_stat?: string;
  bounced_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  replied_at?: string | null;
  sent_at?: string | null;
};
type MensajesRespuesta = { emailer_messages?: MensajeApollo[] };

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
// NOTA (abierta, se confirma en V5.3/gate G1 contra un envio real): los nombres
// exactos de los campos de fecha/estado en la respuesta real no se han verificado
// campo por campo (solo su presencia general, experimento-apollo.md linea 96); si
// difieren, es el unico punto que hay que ajustar aqui.
function mapearAEventos(mensaje: MensajeApollo): EventoProveedor[] {
  const eventos: { tipo: string; fecha: string | null | undefined }[] = [
    { tipo: 'enviado', fecha: mensaje.sent_at },
    { tipo: 'abierto', fecha: mensaje.opened_at },
    { tipo: 'clic', fecha: mensaje.clicked_at },
    { tipo: 'respondio', fecha: mensaje.replied_at },
    { tipo: 'rebota', fecha: mensaje.bounced_at },
  ];
  const email = mensaje.email ?? mensaje.to_email ?? mensaje.contact_email;
  if (!email) return []; // sin email no hay con que resolver el destinatario; se descarta

  return eventos
    .filter((e) => e.fecha)
    .map((e) => ({
      // proveedor_evento_id tiene que ser distinto por TIPO de evento del mismo
      // mensaje (un mensaje puede abrirse Y responderse); el id de Apollo es por
      // mensaje, no por evento individual, asi que se compone con el tipo.
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

      await llamarApollo(`/emailer_campaigns/${proveedorCampanaId}/remove_or_stop_contact_ids`, apiKey, {
        method: 'POST',
        body: JSON.stringify({ emailer_campaign_id: proveedorCampanaId, contact_ids: [contacto.id] }),
      });
    },

    async archivarCampana(proveedorCampanaId: string) {
      const apiKey = credencial();
      // Unica limpieza que expone la API (no hay DELETE de secuencias, verificado en vivo).
      await llamarApollo(`/emailer_campaigns/${proveedorCampanaId}/archive`, apiKey, { method: 'POST' });
    },

    async leerEventosNuevos(proveedorCampanaId: string, desde: string): Promise<EventoProveedor[]> {
      const apiKey = credencial();
      const query = new URLSearchParams({
        per_page: '100',
        'emailer_campaign_ids[]': proveedorCampanaId,
        start_date: desde,
      });
      const data = await llamarApollo<MensajesRespuesta>(`/emailer_messages/search?${query}`, apiKey, {
        method: 'GET',
      });
      return (data.emailer_messages ?? []).flatMap(mapearAEventos);
    },
  };
}
