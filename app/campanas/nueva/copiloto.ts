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

// Exportada solo para test (copiloto.test.ts verifica que la regla de ausencia este
// en el prompt): construirPrompt es la unica fuente de verdad de como interpretamos
// lenguaje natural, asi que un test que la ignore no protege nada.
//
// Bug real (2026-07-14): "las 50 ISPs mas grandes que no tienen owner" no se armaba.
// CAMPOS DISPONIBLES para owner solo trae valores NO nulos (valoresDistintosCampo filtra
// isNotNull en actions.ts), asi que sin una regla explicita el modelo nunca ve "ausencia"
// representada y termina inventando un no_en con la lista de valores conocidos -- que en
// SQL no trae las filas con la columna NULL (semantica de NOT IN), justo lo contrario de
// lo pedido. La regla de abajo lo cubre; 'rol' queda afuera porque vive en otra tabla y
// Zod ya rechaza es_null/no_null ahi (ver CAMPOS_SEGMENTO_NULEABLES en validation.ts).
export function construirPrompt(instruccion: InstruccionCopiloto, campos: CampoDisponible[]): string {
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
- "sin X" / "que no tiene X" / "sin asignar" -> {campo:'X', op:'es_null'}; "con X" / "que \
tiene X" -> {campo:'X', op:'no_null'}. Nunca inventes un no_en con la lista de valores \
conocidos para expresar ausencia (en SQL no trae las filas sin dato, es lo contrario de \
lo pedido). Excepcion: 'rol' no soporta es_null/no_null (vive en otra tabla) -- si la \
instruccion es sobre rol ausente, listalo en noMapeado.
- Si la instruccion pide completar a una meta y el estado actual trae menos cuentas, \
identifica el eje que domina el segmento (tamano, region, vertical) y relajalo SOLO a \
el; deja el resto igual y explica el cambio en relleno {eje, motivo}.
- Multi-turno: "quitame Bogota" quita ese valor de la condicion de region existente, no \
la borra entera si tiene mas valores.
- El motor SOLO sabe hacer Y (todas las condiciones se cumplen a la vez). NO sabe hacer \
O. Si la instruccion necesita un O ("Sebastian en owner O sin owner", "Cali O Medellin" \
sobre campos distintos), NO armes el segmento con las condiciones que si podes: devolve \
las condiciones que ya estaban y explica en noMapeado que hace falta un O, con las dos \
alternativas concretas para que el usuario elija una. Descartar la condicion y seguir con \
las otras da un resultado que se ve bien y esta mal -- es el peor resultado posible.
- Si la instruccion es ambigua sobre el universo (dice "ISPs" pero hay carriers, telcos \
grandes y utilities en la base), NO decidas vos: armas el segmento con la lectura mas \
estrecha (solo ISP) y en explicacion decis explicitamente que dejaste fuera y preguntas \
si quiere incluirlos.`;
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
