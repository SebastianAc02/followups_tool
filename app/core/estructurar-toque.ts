// Convierte el brief dictado (texto pegado del TTS externo del owner, nunca captura de
// audio en la app) en campos de calificación + resumen, listos como borrador editable
// para el cockpit de Llamada (Toque 1). Mismo patrón que borradores.ts: una función de
// core que arma su propio prompt + schema y llama a IAPort, sin tocar Notion ni la DB.
import { z } from 'zod';
import type { IAPort } from './ports/ia';
import { RESULTADOS } from '../db/validation';

// La forma UNICA del borrador de un toque, venga del dictado (esta funcion) o del resumen de
// Granola (borradores.ts). Hasta 2026-07-15 eran dos schemas solapados con prompts que se
// contradecian: uno pedia "dos o tres oraciones" para quePaso y el otro "una o dos".
//
// `recaudo` NO es un campo (2026-07-15): es uno de los facts que viven dentro de notasDiscovery,
// no un hermano de usuarios/crm/pasarela. El prompt lo sigue extrayendo, adentro de los facts.
export const toqueEstructuradoSchema = z.object({
  resultado: z.enum(RESULTADOS).nullable(),
  quePaso: z.string(), // telegrafico, la fila de la tabla de toques
  resumen: z.string(), // el resumen propio de la tool de esta llamada -> toque.resumen
  brief: z.string(), // insumo para hidratarBrief, no se guarda tal cual
  notasDiscovery: z.string(), // facts crudos de ESTA llamada, insumo para fusionarDiscovery
  usuarios: z.number().nullable(),
  crm: z.string().nullable(),
  pasarela: z.string().nullable(),
  proximoPaso: z.string(),
  proximoFollowUp: z.string().nullable(), // YYYY-MM-DD o null
});
export type ToqueEstructurado = z.infer<typeof toqueEstructuradoSchema>;

export const TOQUE_ESTRUCTURADO_VACIO: ToqueEstructurado = {
  resultado: null,
  quePaso: '',
  resumen: '',
  brief: '',
  notasDiscovery: '',
  usuarios: null,
  crm: null,
  pasarela: null,
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

quePaso: el veredicto de la llamada, telegrafico, maximo 200 caracteres. Es la fila de una \
tabla que se escanea de un vistazo, no un resumen. Ejemplo del tono exacto: "Conecto (larga). \
No fit: sin cartera, usa Wompi+PayU, ya usa OnePay para pagar a un proveedor. Objecion: \
modelo (plan+fijo vs pago-por-uso). No agendo".

resumen: todo lo relevante que se hablo en la llamada, narrado. Aca si te extiendes: es lo que \
se lee al abrir el toque cuando alguien quiere saber que paso de verdad.

brief: en que va la cuenta segun esta llamada, narrado en dos o tres lineas (sector, tamano, \
dolor principal, donde quedo). Es insumo para actualizar el brief de la cuenta.

notasDiscovery: SOLO los facts duros que solto esta llamada, sin narracion. Datos, cifras, \
porcentajes, nombres de herramientas, como hacen el recaudo, que dias facturan y cortan, \
cuanta gente tienen en que, que porcentaje paga cuando. Ejemplo del tono exacto: "~40-50% \
pagos digitales hoy. Factura el 1; cortes 10, 15 y 20. 8 personas (una por zona) validan \
pagos. CRM Wispro."

usuarios: numero de usuarios de la cuenta si se menciono, o null.
crm: el CRM o software que usa la cuenta si se menciono, o null.
pasarela: la pasarela de pago actual si se menciono, o null.
proximoPaso: la accion concreta acordada, en una sola oracion (string vacio si no hay).
proximoFollowUp: fecha del proximo contacto en formato YYYY-MM-DD si se menciono, o null.`;
}

// Un dictado vacio no tiene nada que estructurar: no vale la pena gastar tokens del
// gateway, y el caller (CapturaLlamada) nunca deberia mostrar un borrador fantasma.
export async function estructurarToque(dictado: string, ia: IAPort): Promise<ToqueEstructurado> {
  if (!dictado.trim()) return TOQUE_ESTRUCTURADO_VACIO;
  return ia.generar(construirPrompt(dictado), toqueEstructuradoSchema);
}
