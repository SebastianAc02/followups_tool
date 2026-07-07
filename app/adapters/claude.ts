import Anthropic from '@anthropic-ai/sdk';
import type { IAPort, BorradorToque } from '../core/ports/ia';
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

// El sandbox de prueba corre sobre fable 5 (constante aparte: no toca el modelo
// de los borradores, que sigue afinado para sonnet).
const MODELO_PING = 'claude-fable-5';

// La config del gateway vive en un solo lugar: cualquiera que le pegue al modelo
// (el adaptador de borradores o el ping de diagnostico) pasa por aca.
function crearClient(): Anthropic {
  return new Anthropic({
    baseURL: process.env.DARIO_URL ?? 'http://localhost:3456',
    apiKey:  process.env.DARIO_KEY ?? 'dario',
  });
}

// El parseo es defensivo: si la IA devuelve algo que no tiene los cuatro campos
// esperados, se devuelven strings vacios en vez de explotar. El outbox no va a
// recibir un borrador vacio sin que el owner lo vea primero de todos modos.
function parsearRespuesta(texto: string): BorradorToque {
  const extraer = (etiqueta: string): string => {
    const regex = new RegExp(
      `<${etiqueta}>[\\s\\S]*?</${etiqueta}>`,
      'i',
    );
    const match = texto.match(regex);
    if (!match) return '';
    return match[0]
      .replace(new RegExp(`</?${etiqueta}>`, 'gi'), '')
      .trim();
  };

  return {
    notasDiscovery: extraer('notas_discovery'),
    quePaso:        extraer('que_paso'),
    brief:          extraer('brief'),
    proximoPaso:    extraer('proximo_paso'),
  };
}

function construirPrompt(resumenCacheado: string): string {
  return `Eres un asistente de ventas B2B para OnePay, una fintech colombiana que vende \
software de gestion de pagos a ISPs (proveedores de internet). Recibes el resumen de una \
reunion comercial y debes extraer cuatro borradores para el CRM.

RESUMEN DE LA SESION:
${resumenCacheado}

Extrae exactamente los cuatro campos a continuacion. Usa las etiquetas XML indicadas. \
Sin emojis, sin em-dashes, en espanol directo (voz colombiana ejecutiva). Si un dato \
no aparece en el resumen, deja el campo vacio, nunca lo inventes.

<notas_discovery>
Solo hechos observables: quienes asistieron, que se mostro, que preguntas hicieron, \
que objeciones surgieron. Sin interpretacion.
</notas_discovery>

<que_paso>
Narracion en dos o tres oraciones de lo que paso en la reunion: tono ejecutivo directo, \
primera persona plural ("presentamos", "acordamos"). Sin juicios de valor.
</que_paso>

<brief>
Contexto de la cuenta en dos o tres lineas: sector exacto, tamano aproximado (usuarios \
o empleados si se menciona), dolor o necesidad principal que expreso el prospecto.
</brief>

<proximo_paso>
Accion concreta acordada o sugerida, con responsable y fecha tentativa si se menciono. \
Una sola oracion.
</proximo_paso>`;
}

export function crearClaudeAdapter(): IAPort {
  const client = crearClient();

  return {
    async extraerBorradores(resumenCacheado) {
      if (!resumenCacheado.trim()) {
        return { notasDiscovery: '', quePaso: '', brief: '', proximoPaso: '' };
      }

      const mensaje = await client.messages.create({
        model:      MODELO,
        max_tokens: 2048,
        messages:   [{ role: 'user', content: construirPrompt(resumenCacheado) }],
      });

      const bloque = mensaje.content.find((b) => b.type === 'text');
      if (!bloque || bloque.type !== 'text') {
        return { notasDiscovery: '', quePaso: '', brief: '', proximoPaso: '' };
      }

      return parsearRespuesta(bloque.text);
    },
  };
}

// -------------------------------------------------------------------------
// Sandbox de prueba (NO es parte de IAPort). Botoncito de la UI para
// verificar que el gateway (dario) responde antes de usar el flujo real.
// El core nunca ve esto.
// -------------------------------------------------------------------------

// Eventos que el sandbox va emitiendo mientras trabaja, para pintarlos en vivo.
export type EventoPing =
  | { tipo: 'inicio'; modelo: string }
  | { tipo: 'texto';  texto: string }  // fragmento de la respuesta en streaming
  | { tipo: 'fin';    ms: number }
  | { tipo: 'error';  error: string };

// Llamada directa al gateway con streaming. Sin tools, sin loops, sin
// dependencias externas. Solo verifica que dario esta vivo y responde.
// Web search queda fuera de este sandbox por ahora — se retoma cuando
// se construya el tool-executor (ver dario/PLAN.md, fase futura).
export async function* pingClaudeStream(prompt: string): AsyncGenerator<EventoPing> {
  const inicio = Date.now();
  yield { tipo: 'inicio', modelo: MODELO_PING };
  try {
    const client = crearClient();
    const stream = client.messages.stream({
      model:     MODELO_PING,
      max_tokens: 1024,
      messages:  [{ role: 'user', content: prompt }],
    });

    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        yield { tipo: 'texto', texto: ev.delta.text };
      }
    }

    yield { tipo: 'fin', ms: Date.now() - inicio };
  } catch (e) {
    yield { tipo: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
