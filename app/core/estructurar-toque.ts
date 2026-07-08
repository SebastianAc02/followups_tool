// Convierte el brief dictado (texto pegado del TTS externo del owner, nunca captura de
// audio en la app) en campos de calificación + resumen, listos como borrador editable
// para el cockpit de Llamada (Toque 1). Mismo patrón que borradores.ts: una función de
// core que arma su propio prompt + schema y llama a IAPort, sin tocar Notion ni la DB.
import { z } from 'zod';
import type { IAPort } from './ports/ia';
import { RESULTADOS } from '../db/validation';

export const toqueEstructuradoSchema = z.object({
  resultado: z.enum(RESULTADOS).nullable(),
  quePaso: z.string(),
  resumen: z.string(), // el "transcript summary" narrado -> Notas Discovery
  usuarios: z.number().nullable(),
  crm: z.string().nullable(),
  pasarela: z.string().nullable(),
  recaudo: z.string().nullable(),
  proximoPaso: z.string(),
  proximoFollowUp: z.string().nullable(), // YYYY-MM-DD o null
});
export type ToqueEstructurado = z.infer<typeof toqueEstructuradoSchema>;

const VACIO: ToqueEstructurado = {
  resultado: null,
  quePaso: '',
  resumen: '',
  usuarios: null,
  crm: null,
  pasarela: null,
  recaudo: null,
  proximoPaso: '',
  proximoFollowUp: null,
};

function construirPrompt(dictado: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Recibes el dictado de un \
vendedor justo despues de colgar una llamada comercial (texto, nunca audio) y debes \
estructurarlo en los campos de calificacion de la cuenta.

DICTADO:
${dictado}

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Extrae UNICAMENTE \
lo que aparece explicitamente en el dictado. Si un dato no aparece, deja el campo en null \
(o string vacio para texto libre), nunca lo inventes ni lo asumas.

resultado: la salida de la llamada, una de las opciones validas del enum, o null si el \
dictado no la menciona con claridad.
quePaso: narracion en una o dos oraciones de lo que ocurrio en la llamada.
resumen: el resumen de la sesion, listo para pegar como Notas Discovery (solo hechos \
observables, sin interpretacion).
usuarios: numero de usuarios de la cuenta si se menciono, o null.
crm: el CRM o software que usa la cuenta si se menciono, o null.
pasarela: la pasarela de pago actual si se menciono, o null.
recaudo: como hacen el recaudo hoy si se menciono, o null.
proximoPaso: la accion concreta acordada, en una sola oracion (string vacio si no hay).
proximoFollowUp: fecha del proximo contacto en formato YYYY-MM-DD si se menciono, o null.`;
}

// Un dictado vacio no tiene nada que estructurar: no vale la pena gastar tokens del
// gateway, y el caller (CapturaLlamada) nunca deberia mostrar un borrador fantasma.
export async function estructurarToque(dictado: string, ia: IAPort): Promise<ToqueEstructurado> {
  if (!dictado.trim()) return VACIO;
  return ia.generar(construirPrompt(dictado), toqueEstructuradoSchema);
}
