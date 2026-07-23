// Auth de token para el MCP HTTP server (Fase 3, docs/plan-panel-metricas-tiempo-real.md).
//
// Decision del owner (fija, no se cambia sin que el pida lo contrario): transporte HTTP,
// desplegado en el VPS al lado de followups-tool, para que cualquiera se conecte por red
// sin instalar nada. Justo por eso el gate es obligatorio sin excepcion -- distinto del
// webhook de WhatsApp (app/api/webhooks/whatsapp/route.ts), que deja pasar sin token
// cuando WHATSAPP_WEBHOOK_TOKEN no esta seteada (conveniencia de dev local, ese endpoint
// nace detras de Evolution). Este server no tiene ese caso de uso: sin MCP_TOKEN
// configurado, tokenValido() SIEMPRE devuelve false. No hay modo "abierto" posible.
//
// Dos formas de mandar el token (pedido explicito del owner, "bearer o header"):
//   Authorization: Bearer <token>
//   X-MCP-Token: <token>
// Cualquiera de las dos que traiga el valor correcto pasa. Header, no query string: un
// token en la URL queda en logs de acceso y en el historial del navegador -- innecesario
// aca porque el cliente MCP (Claude Desktop, Claude Code, un curl) siempre puede mandar
// headers custom.

export const MCP_TOKEN_ENV = 'MCP_TOKEN';

type ValorHeader = string | string[] | undefined;

function primerValor(valor: ValorHeader): string | null {
  const s = Array.isArray(valor) ? valor[0] : valor;
  return s && s.length > 0 ? s : null;
}

export function extraerBearer(valorAuthorization: ValorHeader): string | null {
  const s = primerValor(valorAuthorization);
  if (!s) return null;
  const m = /^Bearer\s+(.+)$/i.exec(s.trim());
  return m ? m[1] : null;
}

// Headers de Node (IncomingMessage.headers) llegan en minuscula siempre, sea cual sea el
// casing que mando el cliente -- por eso las llaves de este tipo son literales en
// minuscula, no una convencion elegida a mano.
export type HeadersConToken = {
  authorization?: ValorHeader;
  'x-mcp-token'?: ValorHeader;
};

export function tokenDeHeaders(headers: HeadersConToken): string | null {
  return extraerBearer(headers.authorization) ?? primerValor(headers['x-mcp-token']);
}

// esperado default = process.env.MCP_TOKEN (se puede pasar explicito en tests, sin tocar
// el entorno del proceso).
export function tokenValido(recibido: string | null, esperado: string | undefined = process.env[MCP_TOKEN_ENV]): boolean {
  if (!esperado) return false; // sin secreto configurado, nadie pasa -- nunca "modo abierto"
  return recibido !== null && recibido === esperado;
}
