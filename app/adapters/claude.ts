import Anthropic from '@anthropic-ai/sdk';
import type { IAPort, BorradorToque } from '../core/ports/ia';

// El adaptador apunta al gateway (dario) por ANTHROPIC_BASE_URL.
// En local: http://localhost:3456  (dario proxy corriendo en el Mac)
// En prod:  http://<tailscale-ip>:3456  (dario en el VPS, accesible por Tailscale)
// El core no sabe que hay un proxy detras; solo ve el puerto IAPort.
//
// ANTHROPIC_API_KEY se manda como "dario" (placeholder): dario ignora el valor
// y usa el token OAuth real de la cuenta configurada en el gateway.
// Si la variable no esta definida el SDK lanzaria error antes de llegar aqui,
// asi que el .env de la tool debe tener ambas variables (ver README del gateway).

const MODELO = 'claude-sonnet-4-6';

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
  const client = new Anthropic({
    baseURL: process.env.ANTHROPIC_BASE_URL ?? 'http://localhost:3456',
    apiKey:  process.env.ANTHROPIC_API_KEY  ?? 'dario',
  });

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
