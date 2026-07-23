// Tools del MCP server (Fase 3, docs/plan-panel-metricas-tiempo-real.md). Funciones puras
// de composicion: reciben un input ya validado (el zod schema vive en server.ts, junto al
// registerTool que lo declara) y arman el JSON de salida llamando SOLO al Repository
// (app/db/repository.ts) y a formulas puras del core (conversionStage.ts, mrr.ts,
// probabilidadCierre.ts). Cero SQL crudo aca: cada dato sale de una funcion que YA existia
// para el panel/endpoint REST (mismo principio que route.ts en app/api/panel/pipeline).
//
// Solo lectura, punto: ninguna funcion de este archivo llama una escritura del Repository
// ni un adaptador de Notion/Granola/Claude. Es la misma regla de la constitucion del repo
// (el consumidor CRO/MCP lee, nunca sincroniza) aplicada al MCP.
//
// Testeable sin servidor HTTP ni cliente MCP: cada funcion es (input) -> objeto JSON,
// se prueba igual que un repository.*.test.ts (crearDbPrueba + seeds). Ver tools.test.ts.
import {
  duracionPromedioPorEtapa,
  cicloVentaPromedio,
  mrrEstimadoTotal,
  empresasParaConversionStage,
  historialEtapasEmpresa,
  pipelineParaEndpoint,
} from '../db/repository';
import { calcularConversionStage } from '../core/panel/conversionStage';
import { FUNNEL_ETAPAS } from '../db/funnel';
import { probabilidadCierrePorEtapa, type ProbabilidadCierre } from '../core/probabilidadCierre';
import { calcularMrrEstimado, digitalPctConDefault } from '../core/mrr';
import { hoy } from '../lib/reloj';

// Unica organizacion real hoy (scripts/seed_organizacion.ts crea "Onepay" como la primera
// fila de `organizacion`, autoincrement arranca en 1; el resto del repo ya asume este
// mismo default -- ver el `.default(1)` de organizacion_activa_id en varias tablas de
// schema.ts). El MCP no tiene sesion de usuario (no hay requireSession: el cliente se
// autentica por token, no por login), asi que no hay de donde mas sacar el id -- se deja
// como parametro explicito para el dia en que exista una segunda organizacion real.
const ORGANIZACION_DEFAULT = 1;

function resolverOrganizacion(idOrganizacion: number | undefined): number {
  return idOrganizacion ?? ORGANIZACION_DEFAULT;
}

// --- panel_metricas ----------------------------------------------------------------

export type PanelMetricasInput = {
  idOrganizacion?: number;
  owner?: string;
  ahora?: string; // ISO yyyy-mm-dd, default hoy() -- pensado para tests/reproducir un corte pasado
};

export type PanelMetricasOutput = {
  organizacion: number;
  tiempoPromedioPorEtapa: Record<string, number>;
  cicloVentaPromedio: number | null;
  conversionStage: Record<string, number>;
  mrrEstimadoTotal: number;
};

// owner SOLO filtra conversionStage. Las otras tres (tiempoPromedioPorEtapa,
// cicloVentaPromedio, mrrEstimadoTotal) son vistas del CRO sobre TODA la organizacion --
// no toman owner en el Repository (ver los comentarios junto a duracionPromedioPorEtapa/
// cicloVentaPromedio/mrrEstimadoTotal en repository.ts). No se inventa un filtro que el
// dato real no soporta: pasar owner y ver que solo mueve conversionStage es el
// comportamiento correcto, no un bug a medias.
export function panelMetricas(input: PanelMetricasInput = {}): PanelMetricasOutput {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const ahora = input.ahora ?? hoy();

  return {
    organizacion: idOrganizacion,
    tiempoPromedioPorEtapa: duracionPromedioPorEtapa(idOrganizacion, ahora),
    cicloVentaPromedio: cicloVentaPromedio(idOrganizacion, ahora),
    conversionStage: calcularConversionStage(
      empresasParaConversionStage(idOrganizacion, input.owner),
      FUNNEL_ETAPAS.map((e) => e.estado),
    ),
    mrrEstimadoTotal: mrrEstimadoTotal(idOrganizacion),
  };
}

// --- deal_historia -------------------------------------------------------------------

export type DealHistoriaInput = {
  idEmpresa: string;
  idOrganizacion?: number;
};

export type DealHistoriaOk = {
  idEmpresa: string;
  nombre: string;
  etapaActual: string | null;
  transiciones: { estado: string; fecha: string }[];
  plan: string | null;
  mrrPotencial: number | null; // null = sin plan asignado, no se inventa una tarifa
  digitalPct: number;
  probabilidadCierre: number;
  metodoProbabilidad: ProbabilidadCierre['metodo'];
  usuariosEfectivos: number | null;
};

export type DealHistoriaError = { idEmpresa: string; error: 'empresa_no_encontrada' };

export type DealHistoriaOutput = DealHistoriaOk | DealHistoriaError;

// Reusa historialEtapasEmpresa (timeline) + pipelineParaEndpoint (financiero: plan,
// usuarios, %digital) -- las dos funciones que ya alimentan el drawer del deal y el
// endpoint REST, respectivamente. No se escribe una query nueva para "una sola empresa":
// pipelineParaEndpoint ya trae la organizacion completa y se filtra en memoria, mismo
// costo que pagaria una query dedicada (la tabla no tiene volumen que lo justifique, ver
// el comentario de historialPorEmpresaOrg en repository.ts).
//
// OJO alcance: pipelineParaEndpoint exige EMPRESA_VIVA (no es una satelite/alias) y
// EN_PIPELINE (tiene notion_page_id O al menos un toque) -- en la practica cubre
// practicamente toda empresa real trackeada (on_hold incluido, casi siempre con
// notion_page_id), pero un lead crudo sin toque y sin pagina de Notion no apareceria aca
// aunque historialEtapasEmpresa si lo encuentre. Se documenta el hueco en vez de
// escribir una query nueva solo para cerrarlo -- no hay evidencia de que exista ese caso
// en produccion hoy.
export function dealHistoria(input: DealHistoriaInput): DealHistoriaOutput {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);

  const fila = pipelineParaEndpoint(idOrganizacion).find((f) => f.idEmpresa === input.idEmpresa);
  if (!fila) {
    return { idEmpresa: input.idEmpresa, error: 'empresa_no_encontrada' };
  }

  const historial = historialEtapasEmpresa(input.idEmpresa, idOrganizacion);
  const usuarios = fila.usuariosEfectivos ?? 0;
  const digitalPct = digitalPctConDefault(fila.pctDigital);
  const probabilidad = probabilidadCierrePorEtapa(historial.etapaActual);
  const tienePlan = fila.tarifaTxn !== null && fila.saasMensual !== null;

  return {
    idEmpresa: fila.idEmpresa,
    nombre: fila.nombre,
    etapaActual: historial.etapaActual,
    transiciones: historial.transiciones,
    plan: fila.planNombre,
    mrrPotencial: tienePlan
      ? calcularMrrEstimado({ usuarios, digitalPct, tarifaTxnPlan: fila.tarifaTxn as number, saasMensual: fila.saasMensual as number })
      : null,
    digitalPct,
    probabilidadCierre: probabilidad.valor,
    metodoProbabilidad: probabilidad.metodo,
    usuariosEfectivos: fila.usuariosEfectivos,
  };
}

// --- pipeline --------------------------------------------------------------------------

export type PipelineInput = {
  idOrganizacion?: number;
};

export type PipelineDeal = {
  idEmpresa: string;
  nombre: string;
  etapa: string | null;
  dealSize: number | null; // proxy: usuarios_efectivos, mismo proxy que embudoPipeline
  probabilidadCierre: number;
  metodoProbabilidad: ProbabilidadCierre['metodo'];
  digitalPct: number;
  plan: string | null;
  revenueEstimado: number | null; // null = sin plan asignado
};

export type PipelineOutput = {
  organizacion: number;
  empresas: PipelineDeal[];
};

// Misma composicion que app/api/panel/pipeline/route.ts (deal size, probabilidad
// heuristica, %digital, revenue estimado) mas el nombre del plan -- se repite aca en vez
// de importar route.ts porque un route de Next no es una funcion reusable de libreria (trae
// el modulo entero de next/server); es la misma decision de "no fabricar un import raro"
// que ya se ve en otros pares route+core del repo. La QUERY no se duplica (pipelineParaEndpoint
// es la unica fuente), solo la composicion de las ~10 lineas que arman cada fila.
export function pipeline(input: PipelineInput = {}): PipelineOutput {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const filas = pipelineParaEndpoint(idOrganizacion);

  const empresas: PipelineDeal[] = filas.map((f) => {
    const usuarios = f.usuariosEfectivos ?? 0;
    const probabilidad = probabilidadCierrePorEtapa(f.estado);
    const digitalPct = digitalPctConDefault(f.pctDigital);
    const tienePlan = f.tarifaTxn !== null && f.saasMensual !== null;
    return {
      idEmpresa: f.idEmpresa,
      nombre: f.nombre,
      etapa: f.estado,
      dealSize: f.usuariosEfectivos,
      probabilidadCierre: probabilidad.valor,
      metodoProbabilidad: probabilidad.metodo,
      digitalPct,
      plan: f.planNombre,
      revenueEstimado: tienePlan
        ? calcularMrrEstimado({ usuarios, digitalPct, tarifaTxnPlan: f.tarifaTxn as number, saasMensual: f.saasMensual as number })
        : null,
    };
  });

  return { organizacion: idOrganizacion, empresas };
}
