// Huella del request de tracking (2026-07-28): user-agent + IP del que pegó al pixel o
// al redirect de clic.
//
// El problema que resuelve: `detalle` guardaba `{"via":"pixel"}` y nada más, así que una
// apertura humana y un prefetch del proxy de imágenes de Gmail (o SafeLinks de Microsoft,
// o un escáner de seguridad corporativo) quedaban idénticas en la base. Medido en
// producción: un correo abierto DOS veces por el operador dejó TRES filas de apertura,
// dos separadas por 5 milisegundos. Sin user-agent no hay con qué probar cuál sobra.
//
// Alcance deliberado: esto SOLO captura. No deduplica, no filtra proxies, no cambia el
// conteo de aperturas ni la atribución. Primero se mira el dato crudo, después se decide
// qué descartar -- filtrar antes de ver es adivinar.

export type HuellaRequest = {
  ua: string | null;
  ip: string | null;
  // Cadena cruda de X-Forwarded-For, solo cuando trae más de un salto. Sirve para dos
  // cosas: detectar un XFF inventado por el cliente y ver si algún día aparece otro
  // proxy delante de Caddy. Cuando hay un solo salto es redundante con `ip` y se omite.
  xff?: string;
};

// De dónde sale la IP: la app corre detrás de Caddy (ver Caddyfile), que es el ÚNICO
// salto público (bindea 80/443 directo, no hay Cloudflare ni otro proxy delante). La IP
// del socket que ve Next es siempre la de Caddy en la red `onepay`, así que no sirve.
//
// Se toma el ÚLTIMO elemento de X-Forwarded-For, no el primero. Caddy APENDA el peer real
// a la cadena que ya venía en el request, y este endpoint es público: cualquiera puede
// mandar su propio `X-Forwarded-For: 1.2.3.4` y quedar de primero. El último elemento es
// el que escribió Caddy y es el único que nadie de afuera puede falsificar. Con un solo
// proxy de confianza esa es la IP real del cliente -- que para un prefetch de Gmail es la
// del proxy de Google, que es justo lo que se quiere ver.
export function ipDelRequest(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const saltos = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (saltos.length > 0) return saltos[saltos.length - 1];
  }
  // Respaldos por si algún día cambia el reverse proxy: Caddy no manda x-real-ip hoy, y
  // cf-connecting-ip solo existiría si entrara Cloudflare. Ninguno se usa en producción
  // ahora mismo; están para que un cambio de infra no deje el campo en null sin aviso.
  return headers.get('x-real-ip') || headers.get('cf-connecting-ip') || null;
}

export function huellaRequest(headers: Headers): HuellaRequest {
  const xffCrudo = headers.get('x-forwarded-for');
  const saltos = (xffCrudo ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const huella: HuellaRequest = {
    ua: headers.get('user-agent') || null,
    ip: ipDelRequest(headers),
  };
  if (saltos.length > 1) huella.xff = xffCrudo as string;
  return huella;
}
