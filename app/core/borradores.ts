// Toma el resumen cacheado de una sesion (ya traido por el TranscriptAdapter) y
// devuelve cuatro borradores listos para revision humana. La IA NUNCA llega a
// Notion sin que el owner apruebe cada borrador (outbox).
import { z } from 'zod';
import type { IAPort } from './ports/ia';

export const borradorToqueSchema = z.object({
  // Solo facts observables: quien estuvo, que se mostro, que preguntaron. Sin
  // interpretacion ni juicios de valor.
  notasDiscovery: z.string(),
  // Narracion de lo que paso en voz-onepay: directo, sin em-dashes, sin emojis.
  quePaso: z.string(),
  // Contexto de la cuenta en dos o tres lineas: sector, tamano, dolor principal.
  brief: z.string(),
  // Propuesta concreta de proximo paso con fecha tentativa si aplica.
  proximoPaso: z.string(),
});

export type BorradorToque = z.infer<typeof borradorToqueSchema>;

const BORRADOR_VACIO: BorradorToque = { notasDiscovery: '', quePaso: '', brief: '', proximoPaso: '' };

function construirPrompt(resumenCacheado: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Recibes el resumen de una \
reunion comercial y debes extraer cuatro borradores para el CRM.

RESUMEN DE LA SESION:
${resumenCacheado}

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Si un dato no \
aparece en el resumen, deja el campo como string vacio, nunca lo inventes.

notasDiscovery: solo hechos observables (quienes asistieron, que se mostro, que preguntas \
hicieron, que objeciones surgieron), sin interpretacion.
quePaso: narracion en dos o tres oraciones, tono ejecutivo directo, primera persona plural \
("presentamos", "acordamos"), sin juicios de valor.
brief: contexto de la cuenta en dos o tres lineas (sector exacto, tamano aproximado si se \
menciona, dolor o necesidad principal).
proximoPaso: accion concreta acordada o sugerida, con responsable y fecha tentativa si se \
menciono, en una sola oracion.`;
}

// Un resumen vacio no tiene nada que extraer: no vale la pena gastar tokens del gateway,
// y el caller (worker/outbox) nunca deberia mandar borradores vacios a revision humana
// sin saber que fue porque no habia insumo.
export async function pedirBorradores(resumenCacheado: string, ia: IAPort): Promise<BorradorToque> {
  if (!resumenCacheado.trim()) return BORRADOR_VACIO;
  return ia.generar(construirPrompt(resumenCacheado), borradorToqueSchema);
}
