import { leerCredencialConector } from '../db/repository';
import type { CanalEntrega, DestinatarioEnvio, PasoEnvio, EnvioResultado } from '../core/ports/envio';

// Etapa 1 (2026-07-14-secuencias-correo-gmail-design.md): OAuth de Gmail Workspace, app
// interna (@onepay.la). Fetch crudo, sin SDK `googleapis` -- decision explicita de
// Sebastian (checkpoint de arquitectura, misma sesion que escribio el plan): gmail.send/
// gmail.readonly y el refresh de token son REST simple, no justifican una dependencia
// nueva (CLAUDE.md: "no agregar dependencias nuevas sin justificar").
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
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

// RFC 2822 minimo (To/Subject/Content-Type + cuerpo texto plano) -- Gmail acepta el mensaje
// completo en `raw`, base64url. v1 no manda HTML (eso llega en Etapa 3 junto con el
// pixel/link de tracking, ver nota de reuso del design doc).
function armarMensajeCrudo(destinatario: string, asunto: string, cuerpo: string): string {
  const asuntoSeguro = codificarHeaderSiHaceFalta(sinCrlf(asunto));
  const mensaje = [
    `To: ${sinCrlf(destinatario)}`,
    `Subject: ${asuntoSeguro}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    cuerpo,
  ].join('\r\n');
  return base64Url(mensaje);
}

type GmailSendRespuesta = { id?: string; error?: { message?: string } };

async function enviarCorreoGmail(idUsuario: string, destinatario: string, asunto: string, cuerpo: string): Promise<string> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: armarMensajeCrudo(destinatario, asunto, cuerpo) }),
  });
  const data = (await res.json()) as GmailSendRespuesta;
  if (!res.ok || !data.id) throw new Error(`Gmail respondio ${res.status} al mandar: ${data.error?.message ?? 'sin detalle'}`);
  return data.id;
}

// CanalEntrega solamente (Etapa 1): TrackingPoll (leerEventosNuevos/sacarDestinatario) llega
// en Etapa 3, cuando de verdad hay hilos que pollear -- declarar esos metodos ahora como
// stubs que tiran seria el "half-finished implementation" que CLAUDE.md prohibe.
// `proveedorCampanaId` queda sin usar a proposito: Gmail no tiene concepto de secuencia
// externa, la identidad de quien manda vive en idUsuario (cerrado sobre el adapter) -- mismo
// margen que Evolution ya se tomo con ese mismo parametro posicional (ver evolution.ts).
export function crearGmailAdapter(idUsuario: string): CanalEntrega {
  return {
    async enviarPaso(_proveedorCampanaId: string, destinatario: DestinatarioEnvio, paso: PasoEnvio): Promise<EnvioResultado> {
      if (!destinatario.email) throw new Error('Gmail requiere email y el destinatario no trae uno');
      const mensajeId = await enviarCorreoGmail(idUsuario, destinatario.email, paso.asunto ?? '(sin asunto)', paso.cuerpo);
      return { proveedor: 'gmail', proveedorMensajeId: mensajeId };
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
