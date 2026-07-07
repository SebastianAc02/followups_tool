import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { IAPort } from '../core/ports/ia';
// Web search disponible cuando se necesite:
// import { ejecutarBusqueda } from '../../dario/tools/web-search';

// El adaptador apunta al gateway (dario) por DARIO_URL.
// En local: http://localhost:3456  (dario proxy corriendo en el Mac)
// En prod:  http://<tailscale-ip>:3456  (dario en el VPS, accesible por Tailscale)
// El core no sabe que hay un proxy detras; solo ve el puerto IAPort.
//
// DARIO_KEY se manda como "dario" (placeholder): dario ignora el valor y usa el
// token OAuth real de la cuenta configurada en el gateway.
//
// Nombres propios del proyecto (DARIO_*) a proposito, NO los estandar del SDK
// (ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY): esos chocan con el setup global de
// Claude en la maquina de Sebastian y el dev server los heredaria, mandando el
// request a la API real en vez de al proxy. Con DARIO_* nadie mas los exporta.

const MODELO = 'claude-sonnet-4-6';

// Nombre fijo del tool forzado: la unica forma en que el modelo puede responder
// cuando se le pide un schema es llenando este tool call, asi el output SIEMPRE
// es JSON estructurado (nunca prosa a medio parsear).
const TOOL_RESPUESTA = 'responder';

// La config del gateway vive en un solo lugar: cualquiera que le pegue al modelo
// pasa por aca. Recibe un client opcional para que los tests puedan inyectar uno
// falso sin pegarle a la red.
function crearClient(): Anthropic {
  return new Anthropic({
    baseURL: process.env.DARIO_URL ?? 'http://localhost:3456',
    apiKey:  process.env.DARIO_KEY ?? 'dario',
  });
}

// Un solo intento de llamada + validacion. No reintenta aqui: el reintento vive
// en generar(), que decide que hacer si esta llamada no cumple el schema.
async function pedirUnaVez<T>(client: Anthropic, prompt: string, jsonSchema: object): Promise<unknown> {
  const mensaje = await client.messages.create({
    model:       MODELO,
    max_tokens:  2048,
    messages:    [{ role: 'user', content: prompt }],
    tools:       [{ name: TOOL_RESPUESTA, description: 'Devuelve la respuesta estructurada.', input_schema: jsonSchema as Anthropic.Tool['input_schema'] }],
    tool_choice: { type: 'tool', name: TOOL_RESPUESTA },
  });

  const bloque = mensaje.content.find((b) => b.type === 'tool_use');
  if (!bloque || bloque.type !== 'tool_use') throw new Error('El modelo no devolvio un tool_use.');
  return bloque.input;
}

export function crearClaudeAdapter(clientInyectado?: Anthropic): IAPort {
  const client = clientInyectado ?? crearClient();

  return {
    // Fuerza al modelo a responder con un tool call cuyo input cumple `schema`
    // (convertido a JSON Schema con Zod). Si la primera respuesta no valida,
    // reintenta una vez; si el reintento tampoco cumple, lanza -- nunca devuelve
    // un valor a medio validar. El llamador (una funcion de core por caso de uso)
    // decide que prompt y que schema pedir.
    async generar<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
      const jsonSchema = z.toJSONSchema(schema);

      const primerIntento = await pedirUnaVez(client, prompt, jsonSchema);
      const primero = schema.safeParse(primerIntento);
      if (primero.success) return primero.data;

      const segundoIntento = await pedirUnaVez(
        client,
        `${prompt}\n\nTu respuesta anterior no cumplio el formato esperado (${primero.error.message}). Intenta de nuevo, respetando exactamente el schema.`,
        jsonSchema,
      );
      const segundo = schema.safeParse(segundoIntento);
      if (segundo.success) return segundo.data;

      throw new Error(`El modelo no devolvio una respuesta valida tras reintentar: ${segundo.error.message}`);
    },
  };
}
