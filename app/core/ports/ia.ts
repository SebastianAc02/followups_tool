// El core define QUE necesita de un proveedor de IA, no COMO se procesa: un unico
// metodo generico que toma un prompt y un schema Zod, y devuelve datos que YA
// cumplen ese schema (o lanza). ClaudeAdapter es la primera implementacion
// (app/adapters/claude.ts); el dia que se quiera cambiar de modelo o proveedor,
// implementa esta MISMA interfaz y el core no cambia.
//
// Cada caso de uso (borradores de toque, el Copiloto de segmentos, el que siga) es
// una funcion de core aparte que arma su propio prompt + su propio schema y llama a
// generar() -- el puerto nunca vuelve a crecer por una feature nueva. La IA NUNCA
// llega a Notion ni a la DB sin que el llamador decida que hacer con el resultado.
import type { z } from 'zod';

export interface IAPort {
  generar<T>(prompt: string, schema: z.ZodType<T>): Promise<T>;
}
