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
  aperturasWhatsapp,
  embudoPipeline,
  cuentasParaReconciliar,
  empresaFueraDelPipeline,
  reasignarNit,
  reconciliarNotion,
  cambiosDesde,
  registrarToque,
  actualizarEstadoNotion,
  cambiarCadencia,
  marcarPerdida,
  buscarEmpresa,
  crearEmpresa,
  actualizarEmpresa,
  aplazarSeguimiento,
  snapshotEstados,
  editarToque,
  planearDia,
  marcarNoEjecutado,
  planEnRango,
  toquesEnRango,
  aplazosEnRango,
  colaDelDia,
  resumenHome,
  type EditarToqueResultado,
  type PlanearDiaResultado,
  type MarcarNoEjecutadoResultado,
  type LineaPlan,
  type AplazoActividad,
  type AplazarSeguimientoInput,
  type AplazarSeguimientoResultado,
  type CambiarCadenciaInput,
  type MarcarPerdidaInput,
  type MarcarPerdidaResultado,
  type MoverEstadoResultado,
  type CambiarCadenciaResultado,
  type RegistrarToqueResultado,
  type SnapshotResultado,
  type ToqueActividad,
  type BuscarEmpresaInput,
  type BuscarEmpresaResultado,
  type CrearEmpresaInput,
  type CrearEmpresaResultado,
  type ActualizarEmpresaInput,
  type EmpresaEscrita,
} from '../db/repository';
import { RESULTADOS_REUNION_OCURRIDA, type RegistrarToqueInput, type EditarToqueInput, type PlanearDiaInput, type MarcarNoEjecutadoInput } from '../db/validation';
import { calcularConversionStage } from '../core/panel/conversionStage';
import { FUNNEL_ETAPAS } from '../db/funnel';
import { probabilidadCierrePorEtapa, type ProbabilidadCierre } from '../core/probabilidadCierre';
import { calcularMrrEstimado, digitalPctConDefault } from '../core/mrr';
import { debeEncolarHaciaNotion, type OrigenCambio } from '../core/origen-cambio';
import { CLAVE_SIN_ETAPA } from '../core/embudo';
import { mapearEstadoNotion } from '../core/reconciliacion/mapeoEstados';
import type { PaginaNotion } from '../core/reconciliacion/planReconciliacion';
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

// Dos errores distintos, a proposito. Colapsarlos en uno solo es lo que hizo concluir el
// 2026-07-25 que cinco cuentas no existian cuando solo estaban excluidas del embudo.
export type DealHistoriaError = {
  idEmpresa: string;
  error: 'empresa_no_encontrada' | 'empresa_fuera_del_pipeline';
  motivo?: string;
  nombreOficial?: string;
  estadoNotion?: string | null;
  notionPageId?: string | null;
  operaBajoId?: string | null;
};

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
    // No esta en el pipeline. Antes de decir "no existe", preguntar si existe: puede estar
    // excluida por EMPRESA_VIVA (opera bajo otra) o por EN_PIPELINE (sin page_id y sin toques).
    const fuera = empresaFueraDelPipeline(input.idEmpresa, idOrganizacion);
    if (!fuera) return { idEmpresa: input.idEmpresa, error: 'empresa_no_encontrada' };

    const motivo = fuera.operaBajoId
      ? `opera bajo ${fuera.operaBajoId}: el embudo la cuenta dentro de su matriz, no aparte`
      : 'sin notion_page_id y sin toques: su estado no viene de trabajo real, asi que el embudo la deja fuera';
    return {
      idEmpresa: input.idEmpresa,
      error: 'empresa_fuera_del_pipeline',
      motivo,
      nombreOficial: fuera.nombreOficial,
      estadoNotion: fuera.estadoNotion,
      notionPageId: fuera.notionPageId,
      operaBajoId: fuera.operaBajoId,
    };
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
    plan: fila.nombrePlan,
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
      plan: f.nombrePlan,
      revenueEstimado: tienePlan
        ? calcularMrrEstimado({ usuarios, digitalPct, tarifaTxnPlan: f.tarifaTxn as number, saasMensual: f.saasMensual as number })
        : null,
    };
  });

  return { organizacion: idOrganizacion, empresas };
}

// --- WRITE tools (write-path del MCP, 2026-07-24, integraciones/propuesta-write-path.md) ---
//
// Adaptadores DELGADOS: cada uno envuelve una funcion de dominio del Repository tal cual
// (misma validacion Zod, misma transaccion, mismo encolado al outbox). Cero logica de negocio
// aca -- si faltaba una regla, se agrego en el dominio (marcarPerdida, cambiarCadencia), no en
// el MCP. Misma regla de arquitectura que las tools de lectura, al reves: leen/escriben SOLO
// por el Repository.
//
// idOrganizacion NO es un parametro del cliente: lo fija la sesion (route.ts lo pasa desde el
// UsuarioSesion). Un cliente no elige sobre que organizacion escribe. El resultado es un JSON
// { ok: true } minimo -- si la validacion de dominio falla, la funcion LANZA y el server lo
// traduce a un error MCP (mismo comportamiento que un .parse() de Zod que no cumple).

export type ResultadoEscritura = { ok: true };

// Devuelve el toque RELEIDO, la empresa releida y la transicion de embudo que disparo, no un
// { ok: true } (2026-07-25, regla 18 del brain: una escritura devuelve lo que quedo escrito,
// porque un "ok" no se puede verificar). Quien registra ve el idToque, el dia que quedo, y si
// la cuenta se movio de etapa sin que el lo pidiera.
export function registrarToqueTool(input: RegistrarToqueInput, idOrganizacion: number): RegistrarToqueResultado {
  return registrarToque(input, idOrganizacion);
}

// --- embudo (conteo por etapa) -------------------------------------------------------
//
// La pregunta "cuantas cuentas hay en cada etapa" costaba traerse las 476 empresas por
// `pipeline` y contarlas afuera: 142 KB de JSON para producir ocho numeros. Reconciliar
// contra Notion arranca SIEMPRE por este conteo (es el paso 1 de
// docs/reconciliacion-notion.md), asi que vale su propia tool. La funcion del Repository ya
// existia, servia al panel; aca solo se expone.
//
// sinEtapa NO es ruido: son las cuentas que existen en la base pero no estan en el embudo, y
// es justo la categoria que hizo falta el 2026-07-25 (REDVIVA existia y no aparecia en
// `pipeline` porque su estado_notion era null).

export type EmbudoInput = { idOrganizacion?: number; owner?: string };

export function embudoTool(input: EmbudoInput) {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const conteos = embudoPipeline(idOrganizacion, input.owner ? { owner: input.owner } : undefined);
  const porEtapa = conteos
    .filter((c) => c.estado !== CLAVE_SIN_ETAPA)
    .map((c) => ({ etapa: c.estado, total: c.total, usuarios: c.usuarios }))
    .sort((a, b) => b.total - a.total);
  const sinEtapa = conteos.find((c) => c.estado === CLAVE_SIN_ETAPA)?.total ?? 0;
  return {
    organizacion: idOrganizacion,
    owner: input.owner ?? null,
    porEtapa,
    totalEnEmbudo: porEtapa.reduce((s, e) => s + e.total, 0),
    sinEtapa,
  };
}

// --- cuentas (lista minima para cruzar contra Notion) ---------------------------------
//
// Seis campos por cuenta. `pipeline` trae usuarios, plan, tarifa, %digital y probabilidad para
// responder lo mismo, y pesa 142 KB. Cruzar contra Notion no necesita nada de eso: necesita el
// page_id (la llave) y los dos campos que de verdad cambian, estado y owner.

export type CuentasInput = { idOrganizacion?: number };

export function cuentasTool(input: CuentasInput) {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const filas = cuentasParaReconciliar(idOrganizacion);
  return {
    organizacion: idOrganizacion,
    total: filas.length,
    // Se reportan aparte porque son las dos poblaciones que rompen un cruce ingenuo: las que no
    // tienen page_id no se pueden cruzar por llave, y las que no tienen etapa no salen en
    // `pipeline` aunque existan.
    sinPageId: filas.filter((f) => !f.notionPageId).length,
    sinEtapa: filas.filter((f) => !f.estado).length,
    cuentas: filas,
  };
}

// --- mover_estado --------------------------------------------------------------------

export type MoverEstadoInput = {
  idEmpresa: string;
  estado: string;
  fecha?: string;
  origen?: OrigenCambio;
};

// Devuelve la empresa releida y la transicion que quedo escrita, con su origen (2026-07-25,
// regla 18). Antes devolvia { ok: true }, que no distingue "la movi" de "ya estaba ahi" de "esa
// empresa no es de esta organizacion": los tres casos respondian lo mismo.
export function moverEstadoTool(input: MoverEstadoInput, idOrganizacion: number): MoverEstadoResultado {
  // El encolado DB -> Notion ya no se decide aca: lo resuelve el core segun de donde vino el
  // cambio (app/core/origen-cambio.ts). Reconciliar contra Notion pasa origen:'notion' y el
  // cambio se queda en la DB; mover una cuenta desde el brain pasa 'herramienta' y el CRM
  // espejo se entera. fecha default hoy() para el historico de la transicion.
  // origenTransicion (2026-07-25) queda en el historico: 'reconciliacion' cuando el dato ya
  // estaba en Notion y la base se pone al dia (no es movimiento comercial), 'manual' cuando el
  // movimiento nace aca. Es el mismo `origen` del input leido para otra pregunta: uno decide si
  // viaja a Notion, el otro si cuenta para el ciclo de venta.
  return actualizarEstadoNotion(input.idEmpresa, input.estado, idOrganizacion, input.fecha ?? hoy(), {
    encolarNotion: debeEncolarHaciaNotion(input.origen),
    origenTransicion: input.origen === 'notion' ? 'reconciliacion' : 'manual',
  });
}

// Devuelve la empresa releida (con su proximo follow-up ya escrito) y sus cadencias vivas.
// Misma razon que las demas: reprogramar y devolver { ok: true } obliga a ir a mirar la base
// aparte para saber que fecha quedo.
export function cambiarCadenciaTool(input: CambiarCadenciaInput, idOrganizacion: number): CambiarCadenciaResultado {
  return cambiarCadencia(input, idOrganizacion);
}

// Misma regla que registrarToqueTool: devuelve el toque de perdida releido, la empresa releida
// (con su estado_notion ya en on_hold) y si de verdad hubo transicion -- una cuenta que ya
// estaba on_hold no genera fila de historico, y eso hay que poder verlo.
export function marcarPerdidaTool(input: MarcarPerdidaInput, idOrganizacion: number): MarcarPerdidaResultado {
  return marcarPerdida(input, idOrganizacion);
}

// --- Identidad de cuentas (2026-07-24) --------------------------------------------------
//
// Los mismos adaptadores delgados de arriba, para las tres funciones de identidad del
// dominio. A diferencia de las cuatro de escritura, estas SI devuelven dato: buscar devuelve
// candidatos y crear/actualizar devuelven la fila releida, no un { ok: true } -- quien las
// consume necesita ver que quedo escrito para decidir el siguiente paso.

// LECTURA: no exige escritura_mcp. Se registra junto a las tools de lectura en server.ts.
export function buscarEmpresaTool(input: BuscarEmpresaInput): BuscarEmpresaResultado {
  return buscarEmpresa(input);
}

export function crearEmpresaTool(input: CrearEmpresaInput, idOrganizacion: number): CrearEmpresaResultado {
  return crearEmpresa(input, idOrganizacion);
}

export function actualizarEmpresaTool(input: ActualizarEmpresaInput, idOrganizacion: number): EmpresaEscrita {
  return actualizarEmpresa(input, idOrganizacion);
}

// Corrige el id provisional de una cuenta por su NIT real. Es una escritura estructural (mueve
// la PK y arrastra las referencias), asi que devuelve el detalle de que se movio y no un
// { ok: true }: quien la corre necesita ver cuantas filas cambiaron para saber que no quedo a
// medias.
// Reconciliar en lote. El estado llega como lo escribe Notion ("Firma y Pago Realizado") y se
// traduce aca, no en el core del plan: mapearEstadoNotion lanza ante un valor desconocido, y se
// quiere que una pagina rara ensucie SOLO su fila, no que tumbe el lote entero.
export type ReconciliarNotionInput = {
  paginas: { pageId: string; estado: string; owner?: string | null; nombre?: string | null }[];
  aplicar?: boolean;
};

export function reconciliarNotionTool(input: ReconciliarNotionInput, idOrganizacion: number) {
  const traducidas: PaginaNotion[] = [];
  const sinMapeo: { pageId: string; estado: string }[] = [];
  for (const p of input.paginas) {
    try {
      traducidas.push({ ...p, estado: mapearEstadoNotion(p.estado) });
    } catch {
      sinMapeo.push({ pageId: p.pageId, estado: p.estado });
    }
  }
  // aplicar por defecto FALSE: se mira el plan antes de escribir.
  const r = reconciliarNotion(traducidas, idOrganizacion, input.aplicar === true, hoy());
  return { ...r, sinMapeo };
}

export type CambiosDesdeInput = { desde: string; idOrganizacion?: number };

export function cambiosDesdeTool(input: CambiosDesdeInput) {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const cambios = cambiosDesde(input.desde, idOrganizacion);
  return {
    desde: input.desde,
    organizacion: idOrganizacion,
    total: cambios.length,
    // Sin page_id no hay a donde subirlo: se reportan aparte para no perderlas de vista.
    sinPaginaEnNotion: cambios.filter((c) => !c.notionPageId).length,
    cambios,
  };
}

// --- snapshot_estados (ESCRITURA) ------------------------------------------------------
//
// La foto diaria de la etapa de cada cuenta, y las transiciones que salen de compararla con la
// anterior. Se corre ANTES del barrido de /dia-sales: la foto tiene que ser del estado con el
// que arranco el dia, no del que quedo despues de mover cuentas.
//
// Es la unica forma de fechar bien el tramo que se mueve a mano en Notion (cierre_documentacion
// -> firma_pago). Fecharlo con la ultima edicion de la pagina de Notion se descarto: ese
// timestamp es de la pagina entera y se mueve cuando alguien corrige un telefono, asi que
// inventaria movimiento comercial.

export type SnapshotEstadosInput = { fecha?: string };

export function snapshotEstadosTool(input: SnapshotEstadosInput, idOrganizacion: number): SnapshotResultado {
  return snapshotEstados(input.fecha ?? hoy(), idOrganizacion);
}

export type ReasignarNitInput = { idEmpresa: string; nit: string };

export function reasignarNitTool(input: ReasignarNitInput, idOrganizacion: number) {
  return reasignarNit(input.idEmpresa, input.nit, idOrganizacion);
}

// --- actividad (que se hizo y que no se hizo en un periodo) ---------------------------
//
// La tool que faltaba para responder la semana. `cambios_desde` cuenta toques por empresa y
// no dice cuando, con quien ni con que resultado; `pipeline` y `embudo` son fotos del estado
// de AHORA, no de lo que paso. Y lo que no se hizo no aparecia en ninguna: hasta que existio
// seguimiento_aplazado, correr una cuenta no dejaba rastro.
//
// Los aplazos van en una LISTA APARTE, no mezclados con los toques: un aplazo no es
// actividad, y sumarlos en el mismo arreglo dejaria "40 movimientos esta semana" donde 12
// son trabajo que no se hizo.

export type ActividadInput = {
  desde: string;
  hasta: string;
  owner?: string;
  ejecutadoPor?: string;
  idOrganizacion?: number;
};

export function actividadTool(input: ActividadInput) {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const filtros = { owner: input.owner, ejecutadoPor: input.ejecutadoPor };
  const toques = toquesEnRango(input.desde, input.hasta, idOrganizacion, filtros);
  // El filtro de persona sobre los aplazos es aplazadoPor, no ejecutadoPor: son el mismo
  // criterio (quien lo hizo) sobre dos eventos distintos.
  const aplazos = aplazosEnRango(input.desde, input.hasta, idOrganizacion, {
    owner: input.owner,
    aplazadoPor: input.ejecutadoPor,
  });

  return {
    organizacion: idOrganizacion,
    desde: input.desde,
    hasta: input.hasta,
    owner: input.owner ?? null,
    ejecutadoPor: input.ejecutadoPor ?? null,
    totalToques: toques.length,
    totalAplazos: aplazos.length,
    // Sin atribucion: la porcion del periodo de la que no se sabe quien la ejecuto. Se
    // reporta explicito para que nadie lea el reparte por persona como si fuera completo.
    toquesSinAtribuir: toques.filter((t) => !t.ejecutadoPor).length,
    // Toques que no se pueden fechar: `fecha` en prosa o vacia y sin fecha_dia. Se reporta por
    // la misma razon que toquesSinAtribuir -- son las filas de las que no se puede decir nada
    // en el tiempo, y esconderlas hace ver completo un conteo que no lo es.
    toquesSinFecha: toques.filter((t) => !t.fechaDia).length,
    conteos: conteosActividad(toques),
    // Sin tope: se devuelven TODAS las filas del rango, no hay truncado silencioso.
    truncado: false,
    toques,
    aplazos,
  };
}

// Los cortes que se le piden a `actividad` apenas la devuelve. Se calculan aca (composicion
// pura sobre las filas que ya vinieron) y no con otra query: son las mismas filas.
//
// reuniones es el par que responde el NO-SHOW RATE: agendadas = las que tenian fecha propuesta
// en el periodo, ocurridas = las que de verdad pasaron, noShow = las que se cayeron. La tasa se
// saca afuera (noShow / agendadas) para no fijar aca un denominador que despues no se pueda
// discutir.
function conteosActividad(toques: ToqueActividad[]) {
  const contar = <T extends string>(valores: (T | null)[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const v of valores) {
      const k = v ?? 'sin_valor';
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };

  const conFechaPropuesta = toques.filter((t) => t.reunionFechaPropuesta);
  const ocurridas = toques.filter(
    (t) => t.reunionFechaOcurrida || (t.resultado && RESULTADOS_REUNION_OCURRIDA.includes(t.resultado as never)),
  );
  const noShow = toques.filter((t) => t.resultado === 'no_llego');

  return {
    porCanal: contar(toques.map((t) => t.canal)),
    porResultado: contar(toques.map((t) => t.resultado)),
    porEjecutor: contar(toques.map((t) => t.ejecutadoPor)),
    // Segundos totales de lo que SI trae duracion, y cuantos toques no la traen. Un promedio
    // calculado sobre los que la traen y presentado como si fuera de todos seria falso.
    duracion: {
      toquesConDuracion: toques.filter((t) => t.duracionSegundos != null).length,
      toquesSinDuracion: toques.filter((t) => t.duracionSegundos == null).length,
      segundosTotales: toques.reduce((s, t) => s + (t.duracionSegundos ?? 0), 0),
    },
    reuniones: {
      conFechaPropuesta: conFechaPropuesta.length,
      ocurridas: ocurridas.length,
      noShow: noShow.length,
    },
  };
}

// --- cola (que vence hoy y que esta vencido) ------------------------------------------
//
// Lo que la ruta web ya mostraba y el MCP no podia ver. Reusa colaDelDia y resumenHome tal
// cual (las mismas funciones que alimentan /cola y el home), no una query nueva: si la regla
// de que entra a la cola cambia, cambia en un solo lugar.

export type ColaInput = { fecha?: string; owner?: string; idOrganizacion?: number };

// Dias de atraso contra la fecha de corte. UTC en las dos puntas para que el resultado no
// dependa del huso del proceso (mismo criterio que app/core/actividad.ts).
function diasDeAtraso(programada: string | null, corte: string): number {
  if (!programada) return 0;
  const dia = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((dia(corte) - dia(programada)) / 86_400_000);
  return diff > 0 ? diff : 0;
}

export function colaTool(input: ColaInput = {}) {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const fecha = input.fecha ?? hoy();
  const filas = colaDelDia(fecha, input.owner, idOrganizacion).map((f) => ({
    idEmpresa: f.id,
    empresa: f.empresa,
    estado: f.estado,
    fechaProgramada: f.fecha,
    diasAtraso: diasDeAtraso(f.fecha, fecha),
    canal: f.canal,
    proximoPaso: f.proximoPaso,
    contacto: f.contacto,
    usuarios: f.usuarios,
  }));

  // colaDelDia ya trae vencidos + de hoy juntos (fecha <= corte); se parten aca por la misma
  // regla que usa resumenHome para contar vencidos (fecha < corte).
  const vencidos = filas.filter((f) => (f.fechaProgramada ?? '') < fecha);
  const venceHoy = filas.filter((f) => (f.fechaProgramada ?? '') >= fecha);

  return {
    organizacion: idOrganizacion,
    fecha,
    owner: input.owner ?? null,
    resumen: resumenHome(input.owner, fecha, idOrganizacion),
    totalVenceHoy: venceHoy.length,
    totalVencidos: vencidos.length,
    venceHoy,
    vencidos,
  };
}

// --- aplazar_seguimiento (ESCRITURA) ---------------------------------------------------
//
// Adaptador delgado, igual que las demas de escritura. Devuelve la empresa RELEIDA mas el
// evento insertado, no un { ok: true }: quien aplaza necesita ver que fecha quedo y que
// fecha se incumplio, que es justo el dato que antes se perdia.

export function aplazarSeguimientoTool(
  input: AplazarSeguimientoInput,
  idOrganizacion: number,
): AplazarSeguimientoResultado {
  return aplazarSeguimiento(input, idOrganizacion);
}

// --- editar_toque (ESCRITURA, 2026-07-26) ----------------------------------------------
//
// Adaptador delgado sobre editarToque(). Cierra el hueco de que registrar_toque creaba y nada
// corregia: un dato que llega despues (la duracion que sale de tl;dv horas mas tarde) o un
// dictado con un campo incompleto no tenian arreglo por el MCP, y la unica salida era un
// UPDATE a mano contra produccion.
//
// Devuelve el toque RELEIDO mas la lista de campos que se movieron, con antes y despues. Los
// dos, no solo la fila: la fila sola no dice si el parche hizo algo, y sinCambios distingue
// "se corrigio" de "ya estaba asi".

export function editarToqueTool(input: EditarToqueInput, idOrganizacion: number): EditarToqueResultado {
  return editarToque(input, idOrganizacion);
}

// --- planear_dia (ESCRITURA, 2026-07-26) -----------------------------------------------
//
// Persiste el plan del dia: que cuentas se va a tocar, con que canal y de donde salio cada
// una. Es lo que convierte el plan de archivo de texto a dato consultable, y sin el
// plan_vs_ejecutado no tiene contra que comparar.
//
// Idempotente por (fecha, empresa): replanear el mismo dia corrige la linea en vez de
// duplicarla. Nunca borra: una cuenta que se planeo y despues se saco de la lista se lee como
// no ejecutada, que es la verdad, en vez de desaparecer del conteo de lo planeado.

export function planearDiaTool(input: PlanearDiaInput, idOrganizacion: number): PlanearDiaResultado {
  return planearDia(input, idOrganizacion);
}

// --- marcar_no_ejecutado (ESCRITURA, 2026-07-26) ---------------------------------------
//
// El cierre del dia. Cierra el hueco que dejaba plan_vs_ejecutado: el motivo de lo no hecho
// solo existia si ademas se corria un aplazo, y "no lo hice porque el dia se atraveso" no
// siempre mueve una fecha. Sin esto, la cuenta que no se toco y cuyo follow-up sigue donde
// estaba no tenia forma de tener motivo, y su silencio se leia igual que el de una cuenta que
// nadie planeo.
//
// No mueve ninguna fecha y no crea el aplazo: correr un seguimiento es otra decision y tiene su
// propia accion. Lo que si hace es enlazar el aplazo que ya exista de esa cuenta ese dia.

export function marcarNoEjecutadoTool(
  input: MarcarNoEjecutadoInput,
  idOrganizacion: number,
): MarcarNoEjecutadoResultado {
  return marcarNoEjecutado(input, idOrganizacion);
}

// --- plan_vs_ejecutado (LECTURA, 2026-07-26) -------------------------------------------
//
// Lo planeado contra lo hecho, por dia y por rango. Tres poblaciones, separadas a proposito:
//   ejecutados          - estaba en el plan y se toco.
//   noEjecutados        - estaba en el plan y no se toco. Con su tipo y su motivo.
//   ejecutadosFueraDelPlan - se toco y no estaba en el plan. No es ruido: es la porcion del dia
//                       que se va en cuentas que nadie penso tocar, y sin listarla el
//                       cumplimiento se lee como si el dia hubiera sido solo el plan.
//
// El estado no sale de una columna: se DERIVA. Ejecutado = hay un toque de esa empresa ese
// mismo dia; el motivo de lo no ejecutado sale del aplazo de esa empresa con la fecha
// incumplida de ese dia. Un toque cuenta como ejecutado aunque el canal no coincida con el
// planeado (se planeo llamada y se mando WhatsApp): el toque se hizo. La diferencia se reporta
// en coincideCanal en vez de castigarla, porque cambiar de canal sobre la marcha es una
// decision, no un incumplimiento.
//
// La tasa de cumplimiento NO se calcula aca. Se devuelven los conteos y el denominador se
// elige afuera, mismo criterio que el no-show rate en `actividad`: fijar aca un cociente es
// fijar una discusion que despues no se puede reabrir.

export type PlanVsEjecutadoInput = {
  desde: string;
  hasta?: string;
  owner?: string;
  ejecutadoPor?: string;
  idOrganizacion?: number;
};

// El dia de un toque, con el mismo respaldo que usa toquesEnRango: fecha_dia si la tiene, y
// los 10 primeros caracteres de `fecha` para las filas viejas que no la tienen.
function diaDelToque(t: ToqueActividad): string | null {
  return t.fechaDia ?? (t.fecha ? t.fecha.slice(0, 10) : null);
}

export function planVsEjecutadoTool(input: PlanVsEjecutadoInput) {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  // Un solo dia es el caso normal ("como me fue hoy"): sin `hasta`, el rango es el dia de
  // `desde`. No se asume hoy() como cierre, que convertiria una consulta de un dia pasado en
  // un rango de semanas sin que nadie lo pidiera.
  const hasta = input.hasta ?? input.desde;

  const plan = planEnRango(input.desde, hasta, idOrganizacion, {
    owner: input.owner,
    // Quien PLANEO, el mismo criterio de persona que ejecutadoPor sobre los toques. Son dos
    // eventos distintos con la misma pregunta detras: de quien es esta fila.
    planeadoPor: input.ejecutadoPor,
  });
  const toques = toquesEnRango(input.desde, hasta, idOrganizacion, {
    owner: input.owner,
    ejecutadoPor: input.ejecutadoPor,
  });
  const aplazos = aplazosEnRango(input.desde, hasta, idOrganizacion, {
    owner: input.owner,
    aplazadoPor: input.ejecutadoPor,
  });

  // Dos formas de saber si una linea del plan se ejecuto, en este orden:
  //   1. el enlace explicito (toque_planeado.id_toque). Es exacto y es el unico que distingue
  //      dos lineas planeadas para la misma cuenta el mismo dia por canales distintos.
  //   2. el cruce por (empresa, dia). Cubre el toque que se hizo por fuera del plan o que se
  //      registro dictandole al brain sin pasar por la fila planeada, que hoy son la mayoria.
  // Sin el segundo, la medicion diria "planeado y no hecho" sobre toques que si se hicieron.
  const llave = (fecha: string, idEmpresa: string) => `${fecha}|${idEmpresa}`;
  const toquesPorId = new Map<number, ToqueActividad>();
  const toquesPorLlave = new Map<string, ToqueActividad[]>();
  for (const t of toques) {
    toquesPorId.set(t.idToque, t);
    const dia = diaDelToque(t);
    if (!dia) continue; // sin dia no se puede cruzar contra un plan que es por dia
    const k = llave(dia, t.idEmpresa);
    const lista = toquesPorLlave.get(k);
    if (lista) lista.push(t);
    else toquesPorLlave.set(k, [t]);
  }
  const aplazosPorLlave = new Map<string, AplazoActividad>();
  for (const a of aplazos) {
    const k = llave(a.fechaIncumplida.slice(0, 10), a.idEmpresa);
    if (!aplazosPorLlave.has(k)) aplazosPorLlave.set(k, a);
  }

  const ejecutados: {
    fecha: string;
    idEmpresa: string;
    empresa: string;
    tipo: string;
    origen: string;
    canalPlaneado: string | null;
    canalEjecutado: string | null;
    // null cuando el plan no fijo canal: no hubo decision que comparar. false es otra cosa (se
    // planeo llamada y se mando WhatsApp), y colapsar las dos en false seria inventar un
    // incumplimiento.
    coincideCanal: boolean | null;
    resultado: string | null;
    idToque: number;
    // Como se supo que se ejecuto: por el enlace explicito o por el cruce de empresa y dia.
    cruce: 'enlace' | 'empresa_dia';
  }[] = [];
  const noEjecutados: {
    fecha: string;
    idEmpresa: string;
    empresa: string;
    estado: string | null;
    tipo: string;
    origen: string;
    canalPlaneado: string | null;
    // Por que no se hizo, uno de MOTIVOS_APLAZO. null = nadie lo dijo, y null NO significa que
    // no hubiera motivo.
    motivo: string | null;
    // De donde salio el motivo: de la fila del plan (fuente primaria) o del aplazo de esa
    // cuenta ese dia (respaldo). Se dice para que nadie lea un motivo prestado como si lo
    // hubieran escrito sobre el plan.
    motivoFuente: 'plan' | 'aplazo' | null;
    notaMotivo: string | null;
    aplazadoA: string | null;
  }[] = [];

  // DOS PASADAS, no una. Los enlaces explicitos se resuelven PRIMERO y se quedan con su toque;
  // solo despues el fallback reparte lo que sobra. En una sola pasada, la linea sin enlace que
  // aparece de primera en el orden del plan le roba por (empresa, dia) el toque que otra linea
  // reclamaba explicitamente, y el mismo toque termina contado dos veces.
  const cubiertas = new Set<number>();
  const enlacePorLinea = new Map<number, ToqueActividad>();
  for (const p of plan) {
    if (p.idToque == null) continue;
    const t = toquesPorId.get(p.idToque);
    if (!t) continue; // el enlace apunta fuera del rango o del filtro: cae al fallback
    enlacePorLinea.set(p.idToquePlaneado, t);
    cubiertas.add(t.idToque);
  }

  for (const p of plan) {
    const k = llave(p.fechaDia, p.idEmpresa);
    const enlazado = enlacePorLinea.get(p.idToquePlaneado);
    const porDia = enlazado ? undefined : toquesPorLlave.get(k)?.find((t) => !cubiertas.has(t.idToque));
    const t = enlazado ?? porDia;
    if (t) {
      cubiertas.add(t.idToque);
      ejecutados.push({
        fecha: p.fechaDia,
        idEmpresa: p.idEmpresa,
        empresa: p.empresa,
        tipo: p.tipo,
        origen: p.origen,
        canalPlaneado: p.canal,
        canalEjecutado: t.canal,
        coincideCanal: p.canal === null ? null : t.canal === p.canal,
        resultado: t.resultado,
        idToque: t.idToque,
        cruce: enlazado ? 'enlace' : 'empresa_dia',
      });
      continue;
    }
    const aplazo = aplazosPorLlave.get(k);
    const motivo = p.motivoNoEjecutado ?? aplazo?.motivo ?? null;
    noEjecutados.push({
      fecha: p.fechaDia,
      idEmpresa: p.idEmpresa,
      empresa: p.empresa,
      estado: p.estado,
      tipo: p.tipo,
      origen: p.origen,
      canalPlaneado: p.canal,
      motivo,
      motivoFuente: motivo === null ? null : p.motivoNoEjecutado ? 'plan' : 'aplazo',
      notaMotivo: p.motivoNoEjecutado ? p.nota : (aplazo?.nota ?? null),
      aplazadoA: aplazo?.fechaNueva ?? null,
    });
  }

  const fueraDelPlan = toques
    .filter((t) => !cubiertas.has(t.idToque) && diaDelToque(t) !== null)
    .map((t) => ({
      fecha: diaDelToque(t) as string,
      idEmpresa: t.idEmpresa,
      empresa: t.empresa,
      canal: t.canal,
      resultado: t.resultado,
      idToque: t.idToque,
    }));

  // El corte por dia. Solo aparecen los dias que tienen plan o toques: un dia vacio en medio
  // del rango no se inventa como fila de ceros.
  const dias = new Map<string, { fecha: string; planeados: number; ejecutados: number; noEjecutados: number; ejecutadosFueraDelPlan: number }>();
  const dia = (fecha: string) => {
    let d = dias.get(fecha);
    if (!d) {
      d = { fecha, planeados: 0, ejecutados: 0, noEjecutados: 0, ejecutadosFueraDelPlan: 0 };
      dias.set(fecha, d);
    }
    return d;
  };
  for (const p of plan) dia(p.fechaDia).planeados += 1;
  for (const e of ejecutados) dia(e.fecha).ejecutados += 1;
  for (const n of noEjecutados) dia(n.fecha).noEjecutados += 1;
  for (const f of fueraDelPlan) dia(f.fecha).ejecutadosFueraDelPlan += 1;

  return {
    organizacion: idOrganizacion,
    desde: input.desde,
    hasta,
    owner: input.owner ?? null,
    ejecutadoPor: input.ejecutadoPor ?? null,
    total: {
      planeados: plan.length,
      ejecutados: ejecutados.length,
      noEjecutados: noEjecutados.length,
      ejecutadosFueraDelPlan: fueraDelPlan.length,
      // Toques que no se pueden fechar: quedan fuera del cruce porque el plan es por dia. Se
      // reporta explicito, igual que en `actividad`, para que nadie lea el cruce como completo.
      toquesSinFecha: toques.filter((t) => diaDelToque(t) === null).length,
    },
    // Distingue "planeo cero" de "nadie escribio el plan". Sin esto, un rango sin plan se lee
    // como un incumplimiento del 100% al reves: todo ejecutado fuera del plan.
    sinPlanEnElRango: plan.length === 0,
    porDia: [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    noEjecutados,
    ejecutados,
    fueraDelPlan,
  };
}

// --- aperturas_whatsapp (el copy con el que se abre una cuenta) -----------------------
//
// Existe para una pregunta que hasta hoy no se podia contestar: que copy hace que la
// conversacion se mueva. El mensaje de apertura es el equivalente escrito del guion de la
// llamada -- se redacta antes, se compara entre cuentas, y de ahi sale la plantilla. Lo que
// viene despues es reaccion y no se compara con nada.
//
// El dato no existia por captura, no por analisis: el adaptador de Evolution descartaba todo
// lo que salia (key.fromMe), asi que la base tenia las respuestas y ninguna de las preguntas.
//
// Va con `respondio`/`fechaRespuesta` al lado y no como dos listas: siete textos sueltos no
// responden nada. Lo que se compara es el copy CONTRA su resultado.
//
// Solo lectura, como todo este archivo. Y solo trae aperturas de cuentas conocidas: un
// saliente a un numero que no es contacto de ninguna empresa no se guarda (la linea del
// operador es personal y de trabajo a la vez), asi que aca nunca puede aparecer.

export type AperturasWhatsappInput = {
  desde?: string;
  hasta?: string;
};

export function aperturasWhatsappTool(input: AperturasWhatsappInput = {}) {
  const aperturas = aperturasWhatsapp({ desde: input.desde, hasta: input.hasta });
  const conRespuesta = aperturas.filter((a) => a.respondio).length;

  return {
    desde: input.desde ?? null,
    hasta: input.hasta ?? null,
    total: aperturas.length,
    conRespuesta,
    // Sin respuesta todavia. Se reporta explicito en vez de dejar que se reste: una apertura de
    // hoy sin respuesta no es lo mismo que una de hace un mes sin respuesta, y el que lee tiene
    // que ver las dos mitades antes de sacar una tasa.
    sinRespuesta: aperturas.length - conRespuesta,
    // Sin tope: se devuelven TODAS las del rango, no hay truncado silencioso (mismo criterio
    // que `actividad`).
    truncado: false,
    aperturas,
  };
}
