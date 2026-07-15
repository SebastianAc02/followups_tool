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

// PENDIENTE DE REVISION DE SEBASTIÁN (2026-07-15). Este prompt era su hueco de diseño: lo
// escribio la IA porque el pidio no parar. Las tres decisiones que tomo, y que el puede botar:
//
//   1. Contradiccion -> gana el fact nuevo, y se dice que cambio ("bajaron de 8 a 5 personas").
//      Descartado guardar los dos con fecha: sin fecha no se sabe cual es cual, y con fecha las
//      notas dejan de ser la foto de la cuenta y se vuelven un log. Para eso ya estan los toques.
//   2. Dedup -> semantico, no literal. "CRM Wispro" y "usan Wispro" colapsan a uno.
//   3. Orden -> se respeta el de las notas viejas y lo nuevo va al final. Descartado reagrupar
//      por tema: lee mejor pero mueve texto que Sebastián ya reviso, y entonces cada fusion le
//      obliga a releer todo para encontrar que cambio.
function construirPrompt(notasActuales: string, factsNuevos: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Mantienes las notas de discovery \
de una cuenta: los facts duros que sabemos de ella, acumulados llamada tras llamada.

NOTAS ACTUALES (lo que ya sabiamos):
${notasActuales}

FACTS NUEVOS (lo que solto la llamada de hoy):
${factsNuevos}

Devuelve las notas fusionadas. Reglas, en orden de importancia:

1. NO PIERDAS NADA. Todo fact de las notas actuales que los facts nuevos no contradigan tiene \
que sobrevivir, literal. Costaron llamadas. Si dudas si algo es relevante, se queda.

2. Si un fact nuevo CONTRADICE uno viejo, gana el nuevo y decis que cambio. Ejemplo: si antes \
decia "8 personas validan pagos" y ahora son 5, escribis "5 personas validan pagos (antes 8)". \
No acumules las dos versiones sueltas como si fueran ciertas a la vez.

3. No repitas el mismo fact dos veces aunque este escrito distinto. "CRM Wispro" y "usan \
Wispro" son el mismo fact: dejalo una sola vez. Ojo con confundir facts parecidos pero \
distintos: "80% paga por Nequi" y "80% paga en efectivo en algunas sedes" NO son el mismo.

4. Respeta el orden de las notas actuales y agrega lo nuevo al final. No reordenes ni reagrupes \
lo que ya estaba: Sebastián ya lo leyo y necesita ver de un vistazo que se agrego.

5. Nunca inventes un dato que no este en ninguna de las dos entradas. No completes, no \
redondees, no interpretes.

Solo facts: datos, cifras, porcentajes, herramientas, fechas de facturacion y corte, cuanta \
gente hace que. Cero narracion, cero interpretacion, cero juicios (eso vive en el brief, no \
aca). Frases cortas separadas por punto.

Ejemplo del tono exacto del destino: "10.000 usuarios. Pasarela Epayco, con caidas y errores \
sobre todo en dias de pago. ~40-50% pagos digitales hoy. Factura el 1; cortes 10, 15 y 20. ~50% \
paga del 1 al 5; 10-15% llega a corte; ~3% no vuelve. 8 personas (una por zona) validan pagos y \
apoyan cartera. CRM Wispro (piden integrar tambien Sigo)."

Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva).`;
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
