// Tracking de opens/clicks de correo (sesion 2026-07-09). Restriccion real de
// arquitectura: Apollo es quien manda cada correo individual a partir de UNA plantilla
// compartida que subimos una sola vez (sincronizarCopy) -- nosotros no generamos el
// HTML por-destinatario al momento del envio. Eso significa que la UNICA forma de saber
// a quien corresponde un open/click es que el propio Apollo sustituya el email en su
// mecanismo de merge-tags ({{email}}) antes de mandar, exactamente igual que ya hace
// con {{first_name}} (confirmado en vivo, ver apollo.ts). Si Apollo no soporta {{email}}
// como tag, el primer pixel/click real llegaria con el texto literal "{{email}}" en el
// query param -- se veria de inmediato, mismo patron de "ajustar con el primer dato
// real" que ya se uso con EmailerStepRespuesta, no un fallo silencioso.
//
// La sustitucion de Apollo es un find-and-replace de texto plano sobre el body_html
// completo (no entiende de URLs) -- por eso {{email}} tiene que quedar LITERAL, sin
// URL-encodear, dentro del href/src que se arma aca. Los demas valores (proveedorCampanaId,
// la URL de destino de un link) si se encodean normal.

export type ParamsTracking = { baseUrl: string; proveedorCampanaId: string };

const EMAIL_TAG = '{{email}}';

function urlPixel({ baseUrl, proveedorCampanaId }: ParamsTracking): string {
  return `${baseUrl}/api/track/open?c=${encodeURIComponent(proveedorCampanaId)}&e=${EMAIL_TAG}`;
}

function urlClic(params: ParamsTracking, destino: string): string {
  return `${params.baseUrl}/api/track/click?c=${encodeURIComponent(params.proveedorCampanaId)}&e=${EMAIL_TAG}&u=${encodeURIComponent(destino)}`;
}

// Solo links http(s) explicitos -- mailto:, tel: y anclas (#seccion) se dejan intactos:
// no tiene sentido medir "clic" en ellos y reescribirlos podria romperlos.
const HREF_HTTP_RE = /href="(https?:\/\/[^"]+)"/gi;

export function reescribirLinksClic(bodyHtml: string, params: ParamsTracking): string {
  if (!bodyHtml.trim()) return bodyHtml;
  return bodyHtml.replace(HREF_HTTP_RE, (_match, url: string) => `href="${urlClic(params, url)}"`);
}

// Pixel 100% invisible: 1x1, display:none, sin alt -- se agrega SIEMPRE al final del
// cuerpo (despues de reescribirLinksClic, para no interferir con esa regex de <a href>).
export function inyectarPixelApertura(bodyHtml: string, params: ParamsTracking): string {
  if (!bodyHtml.trim()) return bodyHtml; // sin copy no hay a que pegarle un pixel
  return `${bodyHtml}<img src="${urlPixel(params)}" width="1" height="1" alt="" style="display:none" />`;
}
