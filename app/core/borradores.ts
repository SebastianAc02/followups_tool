// Toma el resumen cacheado de una sesion (ya traido por el TranscriptAdapter) y devuelve el
// MISMO borrador que estructurar-toque.ts saca de un dictado. Son dos entradas (Granola y la voz
// de Sebastián) para una sola salida: hasta 2026-07-15 eran dos schemas solapados con prompts
// que se contradecian ("dos o tres oraciones" para quePaso aca, "una o dos" alla).
//
// La IA NUNCA llega a Notion sin que el owner apruebe cada borrador (outbox).
import type { IAPort } from './ports/ia';
import { toqueEstructuradoSchema, TOQUE_ESTRUCTURADO_VACIO, type ToqueEstructurado } from './estructurar-toque';
import { RESULTADOS } from '../db/validation';

function construirPrompt(resumenCacheado: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Recibes el resumen de una \
sesion comercial que grabo Granola y debes estructurarlo.

RESUMEN DE LA SESION:
${resumenCacheado}

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Extrae UNICAMENTE \
lo que aparece explicitamente en el resumen. Si un dato no aparece, deja el campo en null \
(o string vacio para texto libre), nunca lo inventes ni lo asumas.

resultado: la salida de la sesion, una de estas opciones (${RESULTADOS.join(', ')}), o null si \
el resumen no la menciona con claridad.

quePaso: el veredicto de la sesion, telegrafico, maximo 200 caracteres. Es la fila de una tabla \
que se escanea de un vistazo. Ejemplo del tono exacto: "Reunion de discovery y demo (52 min) \
con Cristian, Karen y Julieta. Levantamos la operacion, mostramos el flujo por WhatsApp y la \
conciliacion, y revisamos precios. Quedan de socializar y decidir."

resumen: todo lo relevante que se hablo, narrado. Aca si te extiendes: es lo que se lee al abrir \
el toque cuando alguien quiere saber que paso de verdad.

brief: en que va la cuenta segun esta sesion, narrado en dos o tres lineas (sector, tamano, \
dolor principal, donde quedo).

notasDiscovery: SOLO los facts duros que solto la sesion, sin narracion. Datos, cifras, \
porcentajes, nombres de herramientas, como hacen el recaudo, que dias facturan y cortan. \
Ejemplo del tono exacto: "~40-50% pagos digitales hoy. Factura el 1; cortes 10, 15 y 20. 8 \
personas (una por zona) validan pagos. CRM Wispro."

usuarios: numero de usuarios de la cuenta si se menciono, o null.
crm: el CRM o software que usa la cuenta si se menciono, o null.
pasarela: la pasarela de pago actual si se menciono, o null.
proximoPaso: accion concreta acordada o sugerida, en una sola oracion (string vacio si no hay).
proximoFollowUp: fecha del proximo contacto en formato YYYY-MM-DD si se menciono, o null.`;
}

// Un resumen vacio no tiene nada que extraer: no vale la pena gastar tokens del gateway, y el
// caller (worker/outbox) nunca deberia mandar borradores vacios a revision humana sin saber que
// fue porque no habia insumo.
export async function pedirBorradores(resumenCacheado: string, ia: IAPort): Promise<ToqueEstructurado> {
  if (!resumenCacheado.trim()) return TOQUE_ESTRUCTURADO_VACIO;
  return ia.generar(construirPrompt(resumenCacheado), toqueEstructuradoSchema);
}
