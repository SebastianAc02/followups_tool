import { z } from 'zod';
import type { IAPort } from '../../core/ports/ia';
import { definicionSegmentoSchema, type DefinicionSegmento } from '../../db/validation';

// Campo ofrecido al Copiloto: nombre de dominio + valores conocidos (para que la IA
// mapee "Valle" -> 'Valle del Cauca' sin inventar). Se arma desde el Repository
// (valoresDistintosCampo) en Fase C; el core no consulta la DB.
export type CampoDisponible = { campo: string; ejemplosValor?: string[]; numerico?: boolean };

// Una instruccion del usuario en el contexto del segmento ACTUAL (multi-turno). El
// Copiloto muta ese estado, no arranca de cero.
export type InstruccionCopiloto = {
  frase: string;
  estadoActual: DefinicionSegmento;
  seleccion?: { total: number };
};

const accionCopilotoSchema = z.object({
  estadoNuevo: definicionSegmentoSchema,
  explicacion: z.string(),
  noMapeado: z.array(z.string()),
  relleno: z.object({ eje: z.string(), motivo: z.string() }).optional(),
});

export type AccionCopiloto = z.infer<typeof accionCopilotoSchema>;

type Resultado =
  | { ok: true; estado: DefinicionSegmento; explicacion: string; noMapeado: string[]; relleno?: { eje: string; motivo: string } }
  | { ok: false; error: string };

function construirPrompt(instruccion: InstruccionCopiloto, campos: CampoDisponible[]): string {
  return `Eres el Copiloto de segmentacion de campanas de OnePay. El usuario te da una \
instruccion en lenguaje natural sobre el ESTADO ACTUAL de un segmento de empresas, y vos \
devolves el ESTADO NUEVO (no arrancas de cero, partis del actual).

ESTADO ACTUAL:
${JSON.stringify(instruccion.estadoActual)}

${instruccion.seleccion ? `CUANTAS CUENTAS TRAE AHORA: ${instruccion.seleccion.total}\n` : ''}
CAMPOS DISPONIBLES (solo podes usar estos, con estos valores conocidos):
${JSON.stringify(campos)}

INSTRUCCION DEL USUARIO:
"${instruccion.frase}"

Reglas:
- Devolve el estado nuevo completo (condiciones + orden + limite), no un diff.
- Si algo de la instruccion no cae en ningun campo disponible, listalo en noMapeado, \
nunca lo inventes como condicion.
- "las N mas grandes" -> orden {campo:'usuarios', dir:'desc'} y limite N.
- Si la instruccion pide completar a una meta y el estado actual trae menos cuentas, \
identifica el eje que domina el segmento (tamano, region, vertical) y relajalo SOLO a \
el; deja el resto igual y explica el cambio en relleno {eje, motivo}.
- Multi-turno: "quitame Bogota" quita ese valor de la condicion de region existente, no \
la borra entera si tiene mas valores.`;
}

// El estado que propone la IA SIEMPRE pasa por definicionSegmentoSchema (compuesto
// dentro de accionCopilotoSchema): generar<T> ya garantiza esa validacion o lanza, asi
// que una alucinacion nunca llega al Repository. Si lanza, se convierte en un
// resultado {ok:false} para que la UI diga "ajustalo a mano" en vez de tumbar el flujo.
export async function pedirAlCopiloto(
  instruccion: InstruccionCopiloto,
  ia: IAPort,
  campos: CampoDisponible[] = [],
): Promise<Resultado> {
  try {
    const accion = await ia.generar(construirPrompt(instruccion, campos), accionCopilotoSchema);
    return {
      ok: true,
      estado: accion.estadoNuevo,
      explicacion: accion.explicacion,
      noMapeado: accion.noMapeado,
      relleno: accion.relleno,
    };
  } catch {
    return { ok: false, error: 'El Copiloto propuso un segmento invalido. Ajustalo a mano.' };
  }
}
