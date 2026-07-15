// Acumula lo que sabemos de una cuenta sin destruir lo que ya sabiamos. Mismo patron que
// borradores.ts: funciones de core que arman su propio prompt + schema y llaman a IAPort, sin
// tocar Notion ni la DB.
//
// Es la primera vez en este repo que la IA REESCRIBE un campo con contenido previo, en vez de
// proponer uno vacio. El modo de falla no es "agrega basura", es "borra facts que costaron
// llamadas". Por eso: nunca va directo al outbox (el caller la muestra como borrador aprobable)
// y por eso hay un piso de seguridad contra fusiones que encogen.
import { z } from 'zod';
import type { IAPort } from './ports/ia';

const fusionSchema = z.object({ notas: z.string() });

// Una fusion legitima puede acortar (dedup, cifras que se consolidan), pero no a la mitad. Por
// debajo de esto asumimos que la IA se comio facts y devolvemos lo que ya teniamos: perder la
// llamada nueva es recuperable (esta en el toque), perder tres meses de discovery no lo es.
const PISO_ENCOGIMIENTO = 0.5;

function construirPrompt(notasActuales: string, factsNuevos: string): string {
  // TODO(Sebastián): el prompt de fusion.
  //
  // Contexto: OnePay es una fintech colombiana que le vende software de gestion de pagos a ISPs.
  // `notasActuales` son los facts que ya teniamos de la cuenta (acumulados de llamadas
  // anteriores); `factsNuevos` son los que salieron de la llamada de hoy.
  //
  // Forma del destino (ejemplo real de Notion): "10.000 usuarios. Pasarela Epayco, con caidas y
  // errores sobre todo en dias de pago. ~40-50% pagos digitales hoy. Factura el 1; cortes 10, 15
  // y 20. 8 personas (una por zona) validan pagos. CRM Wispro."
  //
  // Lo que hay que decidir (esto es la decision de diseño, no el boilerplate):
  //   - Que hace la IA cuando un fact nuevo CONTRADICE uno viejo. "Antes 8 personas en recaudo,
  //     ahora 5": gana el nuevo? se guardan los dos con fecha? Ojo que sin fecha no se sabe cual
  //     es cual, y con fecha las notas se vuelven un log.
  //   - Que cuenta como duplicado. "CRM Wispro" y "usan Wispro" son el mismo fact escrito
  //     distinto. Que tan agresivo con el dedup?
  //   - El orden. Se respeta el de las notas viejas y lo nuevo va al final, o se reagrupa por
  //     tema (pagos, operacion, gente)? Reagrupar lee mejor pero mueve texto que Sebastián ya
  //     reviso.
  //
  // Reglas del repo que el prompt tiene que respetar: sin emojis, sin em dashes, español directo
  // (voz colombiana ejecutiva). Solo facts, cero narracion (eso es el brief). Nunca inventar un
  // dato que no este en ninguna de las dos entradas.
  //
  // El schema de salida ya esta: devolver { notas: string }.
  throw new Error('TODO: construirPrompt sin implementar');
}

export async function fusionarDiscovery(
  notasActuales: string,
  factsNuevos: string,
  ia: IAPort,
): Promise<string> {
  // Sin facts nuevos no hay nada que fusionar: no gastar tokens del gateway.
  if (!factsNuevos.trim()) return notasActuales;
  // Sin notas previas no hay nada que destruir ni que dedupear: los facts nuevos SON las notas.
  if (!notasActuales.trim()) return factsNuevos;

  const { notas } = await ia.generar(construirPrompt(notasActuales, factsNuevos), fusionSchema);

  // Piso de seguridad: ver PISO_ENCOGIMIENTO.
  if (notas.length < notasActuales.length * PISO_ENCOGIMIENTO) return notasActuales;
  return notas;
}

const briefSchema = z.object({ brief: z.string() });

function construirPromptBrief(briefActual: string, toqueNuevo: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Mantienes el brief de una \
cuenta: la narrativa de en que va, para que cualquiera entre a una reunion y entienda la \
cuenta sin contexto previo.

BRIEF ACTUAL:
${briefActual}

LO QUE PASO EN EL TOQUE NUEVO:
${toqueNuevo}

Devuelve el brief actualizado: el actual enriquecido con lo del toque nuevo. No es un resumen \
del toque, es la historia de la cuenta hasta hoy.

Conserva todo lo del brief actual que el toque nuevo no contradiga. Si lo contradice, gana lo \
nuevo, pero deja dicho que cambio. No repitas el mismo hecho dos veces. Nunca inventes nada \
que no este en ninguna de las dos entradas.

Narracion, no lista de datos (los datos sueltos van en las notas de discovery, no aca). Forma \
de ejemplo: "Cuenta que conocimos en Andina Link. Se llamo el 19-jun. Nos dijo que no maneja \
cartera y ya usa Wompi mas PayU. Objeto el modelo de cobro por plan fijo. Quedo reunion el \
6-jul."

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Hechos primero, cero \
preambulo, cero adjetivos de relleno.`;
}

// A diferencia de fusionarDiscovery, esta NO cortocircuita con briefActual vacio: con notas
// vacias los facts nuevos YA SON las notas (mismo formato), pero un toque crudo todavia no es
// un brief, hay que narrarlo.
export async function hidratarBrief(
  briefActual: string,
  toqueNuevo: string,
  ia: IAPort,
): Promise<string> {
  if (!toqueNuevo.trim()) return briefActual;

  const { brief } = await ia.generar(construirPromptBrief(briefActual, toqueNuevo), briefSchema);

  if (brief.length < briefActual.length * PISO_ENCOGIMIENTO) return briefActual;
  return brief;
}
