import { leerCredencialConector } from '../db/repository';
import type { CanalEntrega, TrackingPoll, DestinatarioEnvio, PasoEnvio, EnvioResultado, EventoProveedor } from '../core/ports/envio';
import { reescribirLinksClic, inyectarPixelApertura } from '../core/tracking-links';

// Etapa 1 (2026-07-14-secuencias-correo-gmail-design.md): OAuth de Gmail Workspace, app
// interna (@onepay.la). Fetch crudo, sin SDK `googleapis` -- decision explicita de
// Sebastian (checkpoint de arquitectura, misma sesion que escribio el plan): gmail.send/
// gmail.readonly y el refresh de token son REST simple, no justifican una dependencia
// nueva (CLAUDE.md: "no agregar dependencias nuevas sin justificar").
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_THREADS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/threads';
const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
];

export type CredencialGmail = {
  refreshToken: string;
  emailCuenta: string;
  scopes: string[];
};

function clienteOAuth(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.APP_BASE_URL;
  if (!clientId || !clientSecret || !base) {
    throw new Error('Falta GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o APP_BASE_URL (revisa .env.local)');
  }
  return { clientId, clientSecret, redirectUri: `${base}/api/conectores/gmail/callback` };
}

// Paso 1 del flujo (design doc): boton "Conectar Gmail" -> esta URL. access_type=offline +
// prompt=consent garantizan que Google emita refresh_token incluso si el usuario ya habia
// autorizado la app antes (sin prompt=consent, un re-consentimiento NO trae refresh_token).
export function construirUrlConsentimientoGmail(state: string): string {
  const { clientId, redirectUri } = clienteOAuth();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  });
  return `${OAUTH_AUTH_URL}?${query}`;
}

type TokenRespuesta = { access_token?: string; refresh_token?: string; error?: string; error_description?: string };

async function intercambiarCodigo(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const { clientId, clientSecret, redirectUri } = clienteOAuth();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as TokenRespuesta;
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(`Google no devolvio tokens validos: ${data.error_description ?? data.error ?? res.status}`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function refrescarAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = clienteOAuth();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as TokenRespuesta;
  if (!res.ok || !data.access_token) {
    throw new Error(`Google no pudo refrescar el access token: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data.access_token;
}

async function resolverEmailCuenta(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json()) as { email?: string; error?: string; error_description?: string };
  if (!res.ok || !data.email) {
    throw new Error(`Google no devolvio el email de la cuenta conectada: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data.email;
}

// Paso 2 del flujo (design doc): llamado desde el callback OAuth. Intercambia el `code` por
// tokens, resuelve que cuenta se conecto y arma la credencial a cifrar. No guarda nada -- el
// callback la persiste via guardarCredencialConector, mismo criterio del resto de
// conectores (el adaptador nunca escribe la DB).
export async function intercambiarCodigoPorCredencial(code: string): Promise<CredencialGmail> {
  const { accessToken, refreshToken } = await intercambiarCodigo(code);
  const emailCuenta = await resolverEmailCuenta(accessToken);
  return { refreshToken, emailCuenta, scopes: [...SCOPES] };
}

function leerCredencial(idUsuario: string): CredencialGmail {
  const cruda = leerCredencialConector('gmail', idUsuario);
  if (!cruda) throw new Error(`No hay Gmail conectado para el usuario ${idUsuario}`);
  return JSON.parse(cruda) as CredencialGmail;
}

// Cuenta @onepay.la conectada, para mostrarla en /conectores. Nunca devuelve el
// refreshToken -- unico dato realmente secreto de la credencial (mismo criterio que
// estadoConector: nunca expone el secreto, ni siquiera enmascarado).
export function emailGmailConectado(idUsuario: string): string | null {
  try {
    return leerCredencial(idUsuario).emailCuenta;
  } catch {
    return null;
  }
}

function base64Url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64url');
}

// Neutraliza (no trunca) un \r o \n dentro de un valor que va a un header RFC 2822 --
// sin esto, un asunto o destinatario con un salto de linea podria inyectar un header
// nuevo (ej. un Bcc: falso) en el mensaje `raw` que Gmail manda tal cual. `asunto` viene
// de copy de campana editable en /cadencias, no es un dato de confiar a ciegas.
function sinCrlf(texto: string): string {
  return texto.replace(/[\r\n]/g, ' ');
}

// RFC 2822 exige headers en US-ASCII; un asunto con acentos/em-dash (el "Conexion de
// Gmail verificada" de mandarCorreoDePrueba, por ejemplo) tiene que ir con la sintaxis
// RFC 2047 (=?UTF-8?B?...?=), o Gmail lo recibe/mangla mal. Un asunto ya ASCII se deja
// intacto -- no hay necesidad de codificarlo.
function codificarHeaderSiHaceFalta(texto: string): string {
  if (/^[\x00-\x7f]*$/.test(texto)) return texto;
  return `=?UTF-8?B?${Buffer.from(texto, 'utf8').toString('base64')}?=`;
}

// URL publica de ESTA app (mismo criterio que apollo.ts): sin configurar, se manda sin
// pixel/link de tracking en vez de mandar URLs rotas.
function appBaseUrl(): string | undefined {
  return process.env.APP_BASE_URL;
}

// RFC 2822 minimo (To/Subject/Content-Type + cuerpo HTML) -- Etapa 3: paso.cuerpo ya es
// HTML (mismo criterio que Apollo en sincronizarCopy, ver apollo.ts -- paso.cuerpo se pasa
// directo a body_html sin pasar por ningun parser markdown->HTML). El pixel/link de
// tracking se inyectan con el MISMO helper compartido que usa Apollo (core/tracking-links.ts,
// la "nota de reuso" del design doc ya esta resuelta ahi, no hace falta duplicar nada).
function armarMensajeCrudo(destinatario: string, asunto: string, cuerpoHtml: string, proveedorCampanaId: string): string {
  const asuntoSeguro = codificarHeaderSiHaceFalta(sinCrlf(asunto));
  let cuerpo = cuerpoHtml;
  const base = appBaseUrl();
  if (!base) {
    // Sin APP_BASE_URL el correo sale SIN pixel/links de tracking, y no hay ningun error
    // ni marca en la UI que lo diga -- el envio "funciona" y evento_tracking se queda vacio
    // para siempre para ese correo, sin importar cuantas veces el destinatario lo abra
    // (medido en vivo 2026-07-16: correo mandado sin la variable, cero eventos posibles).
    // No se bloquea el envio (un correo real sin pixel es mejor que no mandarlo), pero se
    // avisa fuerte en el log del server para no repetir el diagnostico a ciegas.
    console.error('[gmail] APP_BASE_URL no esta seteada: este correo se manda SIN tracking (sin pixel de apertura, sin links de clic).');
  }
  if (base) {
    const params = { baseUrl: base, proveedorCampanaId };
    // reescribirLinksClic/inyectarPixelApertura dejan el tag {{email}} LITERAL a
    // proposito (asi lo necesita Apollo: sube UNA plantilla compartida y su PROPIO
    // motor de merge-tags lo resuelve por destinatario). Gmail arma el HTML por
    // destinatario en el momento del envio y ya conoce el email real -- lo sustituye
    // el mismo, si no /api/track/open lo descarta a proposito (email==='{{email}}')
    // y nunca se registraria un evento de tracking para correo mandado por Gmail.
    cuerpo = inyectarPixelApertura(reescribirLinksClic(cuerpo, params), params).replaceAll('{{email}}', destinatario);
  }
  const mensaje = [
    `To: ${sinCrlf(destinatario)}`,
    `Subject: ${asuntoSeguro}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    cuerpo,
  ].join('\r\n');
  return base64Url(mensaje);
}

type GmailSendRespuesta = { id?: string; threadId?: string; error?: { message?: string } };

async function enviarCorreoGmail(
  idUsuario: string,
  destinatario: string,
  asunto: string,
  cuerpo: string,
  proveedorCampanaId: string,
): Promise<{ mensajeId: string; hiloId: string | undefined }> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: armarMensajeCrudo(destinatario, asunto, cuerpo, proveedorCampanaId) }),
  });
  const data = (await res.json()) as GmailSendRespuesta;
  if (!res.ok || !data.id) throw new Error(`Gmail respondio ${res.status} al mandar: ${data.error?.message ?? 'sin detalle'}`);
  return { mensajeId: data.id, hiloId: data.threadId };
}

type GmailHeader = { name: string; value: string };
type GmailMensaje = { id: string; internalDate?: string; payload?: { headers?: GmailHeader[]; body?: { data?: string } } };
type GmailHiloRespuesta = { id?: string; messages?: GmailMensaje[]; error?: { message?: string } };
type GmailListaRespuesta = { messages?: { id: string }[]; error?: { message?: string } };

function headerDe(mensaje: GmailMensaje, nombre: string): string | null {
  const header = mensaje.payload?.headers?.find((h) => h.name.toLowerCase() === nombre.toLowerCase());
  return header?.value ?? null;
}

// El header From/To viene como "Nombre <email@dominio>" o solo "email@dominio" -- se
// extrae el email real para comparar contra la cuenta conectada / usar como correlator,
// mismo criterio que resolverEmailCuenta con el userinfo de Google.
function emailDeHeader(valor: string | null): string | null {
  if (!valor) return null;
  const match = valor.match(/[^<\s]+@[^>\s]+/);
  return match ? match[0].toLowerCase() : null;
}

async function leerHilo(idUsuario: string, threadId: string): Promise<GmailMensaje[]> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const res = await fetch(`${GMAIL_THREADS_URL}/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as GmailHiloRespuesta;
  if (!res.ok) throw new Error(`Gmail respondio ${res.status} al leer el hilo ${threadId}: ${data.error?.message ?? 'sin detalle'}`);
  return data.messages ?? [];
}

// El primer mensaje del hilo es SIEMPRE el que nosotros mandamos (threadId = id de ESE
// mensaje cuando Gmail arranca un hilo nuevo, que es siempre nuestro caso: enviarPaso
// nunca contesta un hilo existente) -- de ahi se saca el email del destinatario original.
function destinatarioOriginalDe(mensajes: GmailMensaje[], threadId: string): string | null {
  const original = mensajes.find((m) => m.id === threadId) ?? mensajes[0];
  return original ? emailDeHeader(headerDe(original, 'To')) : null;
}

function detectarRespuestas(
  threadId: string,
  mensajes: GmailMensaje[],
  cuentaConectada: string,
  desdeMs: number,
): EventoProveedor[] {
  const destinatario = destinatarioOriginalDe(mensajes, threadId);
  if (!destinatario) return [];
  return mensajes
    .filter((m) => m.id !== threadId)
    .filter((m) => emailDeHeader(headerDe(m, 'From')) !== cuentaConectada.toLowerCase())
    .filter((m) => Number(m.internalDate ?? '0') >= desdeMs)
    .map((m) => ({
      proveedorEventoId: m.id,
      tipo: 'respondio',
      canal: 'correo',
      fechaEvento: new Date(Number(m.internalDate ?? '0')).toISOString(),
      email: destinatario,
      detalle: { via: 'thread', threadId },
    }));
}

function decodificarCuerpo(mensaje: GmailMensaje): string {
  const data = mensaje.payload?.body?.data;
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

// mailer-daemon/postmaster: los remitentes de sistema que Gmail/Google Workspace usa
// para un rebote -- PENDIENTE de confirmar contra un rebote real (ver plan Etapa 3,
// "Puntos de integracion pendientes"), el mismo texto del design doc marca este parser
// como el punto mas fragil de la etapa.
const REMITENTE_SISTEMA_RE = /mailer-daemon|postmaster/i;

// Decision de diseno (se aparta del texto literal del spec, con razon -- ver plan Etapa
// 3): el spec pide correlacionar por el `messageId` citado en el rebote, pero ese
// `messageId` es el header RFC 2822 `Message-ID:` real del correo, NO el `id` que
// devuelve la API de Gmail (que es lo unico que guardamos hoy) -- son dos identificadores
// distintos. En vez de perseguir esa cita exacta, se correlaciona por el EMAIL del
// destinatario original del hilo: un DSN real siempre lo incluye en texto plano
// (Original-Recipient o en el cuerpo), mas robusto que un id que ni siquiera capturamos.
async function buscarRebote(idUsuario: string, destinatarioOriginal: string, desdeMs: number): Promise<EventoProveedor | null> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const despuesDeEpoch = Math.floor(desdeMs / 1000);
  const query = encodeURIComponent('from:(mailer-daemon OR postmaster)');
  const res = await fetch(`${GMAIL_MESSAGES_URL}?q=${query}+after:${despuesDeEpoch}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as GmailListaRespuesta;
  if (!res.ok || !data.messages?.length) return null;

  for (const ref of data.messages) {
    const msgRes = await fetch(`${GMAIL_MESSAGES_URL}/${ref.id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const msg = (await msgRes.json()) as GmailMensaje;
    if (!msgRes.ok) continue;
    if (!REMITENTE_SISTEMA_RE.test(headerDe(msg, 'From') ?? '')) continue;
    if (Number(msg.internalDate ?? '0') < desdeMs) continue;
    const cuerpo = decodificarCuerpo(msg);
    if (!cuerpo.toLowerCase().includes(destinatarioOriginal.toLowerCase())) continue;
    return {
      proveedorEventoId: msg.id,
      tipo: 'rebota',
      canal: 'correo',
      fechaEvento: new Date(Number(msg.internalDate ?? '0')).toISOString(),
      email: destinatarioOriginal,
      detalle: { via: 'bounce' },
    };
  }
  return null;
}

// proveedorCampanaId: Gmail no tiene concepto de secuencia externa (a diferencia de
// Apollo) -- lo usa solo como correlator opaco para el pixel/link de tracking
// (armarMensajeCrudo), la identidad de quien manda vive en idUsuario (cerrado sobre el
// adapter), mismo margen que Evolution ya se tomo con ese mismo parametro (evolution.ts).
//
// Etapa 3: TrackingPoll reinterpreta ese mismo parametro como threadId de Gmail (ver
// decision de diseno en el plan 2026-07-14-gmail-conector-etapa3-tracking.md) -- Gmail
// no tiene "campana externa" con muchos destinatarios, cada hilo es un destinatario.
export function crearGmailAdapter(idUsuario: string): CanalEntrega & TrackingPoll {
  return {
    async enviarPaso(proveedorCampanaId: string, destinatario: DestinatarioEnvio, paso: PasoEnvio): Promise<EnvioResultado> {
      if (!destinatario.email) throw new Error('Gmail requiere email y el destinatario no trae uno');
      const { mensajeId, hiloId } = await enviarCorreoGmail(
        idUsuario,
        destinatario.email,
        paso.asunto ?? '(sin asunto)',
        paso.cuerpo,
        proveedorCampanaId,
      );
      return { proveedor: 'gmail', proveedorMensajeId: mensajeId, proveedorHiloId: hiloId };
    },

    // Gmail no tiene secuencia externa de la que sacar a alguien (a diferencia de
    // Apollo, remove_or_stop_contact_ids) -- que un destinatario deje de recibir pasos
    // futuros lo decide pollTracking pausando la inscripcion en NUESTRA base, no un
    // side-effect en Gmail. No-op deliberado, documentado, no un TODO a medias.
    async sacarDestinatario(_threadId: string, _email: string): Promise<void> {},

    async leerEventosNuevos(threadId: string, desde: string): Promise<EventoProveedor[]> {
      const credencial = leerCredencial(idUsuario);
      const mensajes = await leerHilo(idUsuario, threadId);
      const desdeMs = new Date(desde).getTime();
      const respuestas = detectarRespuestas(threadId, mensajes, credencial.emailCuenta, desdeMs);
      const destinatario = destinatarioOriginalDe(mensajes, threadId);
      const rebote = destinatario ? await buscarRebote(idUsuario, destinatario, desdeMs) : null;
      return rebote ? [...respuestas, rebote] : respuestas;
    },
  };
}

// Verificacion del conector (Etapa 1, paso 3 del design doc): envio directo, sin pasar por
// campana/paso_inscripcion -- mismo criterio que probarLineaAction de WhatsApp
// (lineas-whatsapp-actions.ts): es una prueba manual de conectividad, no un paso real, y por
// eso reusa enviarPaso en vez de duplicar el armado del mensaje.
export async function mandarCorreoDePrueba(idUsuario: string, destinatario: string): Promise<void> {
  const fecha = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  await crearGmailAdapter(idUsuario).enviarPaso(
    'prueba',
    { email: destinatario, telefono: null, nombre: null, empresa: null, cargo: null },
    {
      asunto: `Conexión de Gmail verificada — ${fecha}`,
      cuerpo: 'Si ves este correo, tu Gmail esta conectado y mandando bien.',
      canal: 'correo',
    },
  );
}
