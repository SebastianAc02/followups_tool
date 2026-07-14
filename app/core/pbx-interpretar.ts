// Convierte el "que paso" abierto de un toque PBX (texto libre o resumen de Granola)
// en el vocabulario chico de pbx.ts + datos del KDM si aparecieron. Mismo patron que
// estructurar-toque.ts: una funcion de core que arma su propio prompt + schema y llama
// a IAPort. La IA propone; nunca escribe DB/Notion (CLAUDE.md, borrador -> aprobar).
import { z } from 'zod';
import type { IAPort } from './ports/ia';

export const pbxInterpretadoSchema = z.object({
  clase: z.enum(['pidieron_correo', 'sin_respuesta', 'referido_persona', 'dato_conseguido', 'otro']),
  personaReferida: z.string().nullable(),
  kdmNombre: z.string().nullable(),
  kdmTelefono: z.string().nullable(),
  kdmEmail: z.string().nullable(),
  proximoPasoTexto: z.string(),
});
export type PbxInterpretado = z.infer<typeof pbxInterpretadoSchema>;

function construirPrompt(quePaso: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). El vendedor acaba de colgar \
un toque del bucle PBX: la empresa no tiene un decisor (KDM) alcanzable, solo un conmutador, \
y el objetivo del toque es conseguir el dato del decisor (su telefono, WhatsApp, correo o su \
nombre), no avanzar el negocio todavia.

QUE PASO EN EL TOQUE:
${quePaso}

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Mapea el resultado \
a UNA de las clases del enum. Extrae UNICAMENTE lo que aparece explicitamente en el texto; si \
un dato no aparece, deja el campo en null, nunca lo inventes ni lo asumas.

clase:
- pidieron_correo: el conmutador o alguien pidio mandar un correo.
- sin_respuesta: no contestaron o no hubo eco.
- referido_persona: dieron el nombre de otra persona con quien hablar (usa personaReferida).
- dato_conseguido: se consiguio el metodo directo del KDM (telefono, WhatsApp o correo).
- otro: cualquier otro caso que no encaje en las anteriores.

personaReferida: el nombre/cargo de la persona referida si clase es referido_persona, o null.
kdmNombre, kdmTelefono, kdmEmail: datos del KDM si se consiguieron en este toque, o null.
proximoPasoTexto: la siguiente accion en una sola oracion, legible y editable, para mostrar \
en la cola.`;
}

export async function interpretarResultadoPBX(ia: IAPort, quePaso: string): Promise<PbxInterpretado> {
  return ia.generar(construirPrompt(quePaso), pbxInterpretadoSchema);
}
