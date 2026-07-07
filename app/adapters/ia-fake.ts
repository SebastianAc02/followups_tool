import type { IAPort } from '../core/ports/ia';
import type { z } from 'zod';

// Fake de pruebas: siempre "propone" la misma respuesta configurada, pero valida
// contra el schema pedido igual que el adapter real -- o devuelve datos validos, o
// lanza. Sirve para probar cualquier funcion de core que dependa de IAPort
// (borradores, copiloto, lo que siga) sin acoplarse a Claude.
export class IAFake implements IAPort {
  private respuesta: unknown;

  constructor(respuesta: unknown) {
    this.respuesta = respuesta;
  }

  async generar<T>(_prompt: string, schema: z.ZodType<T>): Promise<T> {
    const parsed = schema.safeParse(this.respuesta);
    if (!parsed.success) throw new Error(parsed.error.message);
    return parsed.data;
  }
}
