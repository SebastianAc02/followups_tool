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
import { calcularHorarioEscalonado } from '../core/horario-escalonado';
import {
  dominiosConAvisoNoMedible,
  type EnvioParaAvisoProveedor,
  type EstadoMedibilidad,
  type Clasificacion,
} from '../core/clasificar-evento-tracking';
import { detectarClicEscaner, type VeredictoEscaner } from '../core/detectar-clic-escaner';
import {
  cruzarAperturaClic,
  type EventoParaCruce,
  type EstadoCruce,
  type Lectura,
  type MetodoConfirmacion,
  type CausaMedibilidad,
} from '../core/cruzar-apertura-clic';
import {
  acumularMatrizClientes,
  MATRIZ_SEMILLA,
  UMBRAL_N_ENVIOS_CELDA,
  type EnvioParaMatriz,
  type EventoClasificadoParaMatriz,
} from '../core/matriz-clientes-correo';
import { EJECUTOR_POR_DEFECTO } from '../db/validation';
import {
  duracionPromedioPorEtapa,
  cicloVentaPromedio,
  mrrEstimadoTotal,
  empresasParaConversionStage,
  historialEtapasEmpresa,
  pipelineParaEndpoint,
  aperturasWhatsapp,
  aprobarYProgramarPaso,
  enviosProgramadosDelDia,
  type EnvioProgramado,
  campanaParaLanzar,
  previsualizarInscripcionCampana,
  canalesDeCadencia,
  pasosParaSincronizarCopy,
  lineasWhatsappDeUsuario,
  actualizarEstadoLineaWhatsapp,
  gmailVerificadoDe,
  fijarOwnerCampana,
  actualizarConfigLanzamiento,
  inscribirCampana,
  guardarProveedorCampanaId,
  marcarCampanaAprobadaGmail,
  estadoLanzamientoCampana,
  pasoInscripcionesPendientes,
  crearCadenciaConCampana,
  campanaCompleta,
  estadoEnvioCorreo,
  trackingCorreo,
  type ConfigLanzamientoInput,
  type EstadoLanzamientoCampana,
  type ResultadoInscripcion,
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
  marcarAliado,
  type MarcarAliadoInput,
  type MarcarAliadoResultado,
  marcarDescarte,
  type MarcarDescarteInput,
  type MarcarDescarteResultado,
  buscarEmpresa,
  crearEmpresa,
  actualizarEmpresa,
  aplazarSeguimiento,
  estadoCadencia,
  sacarDeCadencia,
  correrCadencia,
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
  type EstadoCadenciaInput,
  type EstadoCadenciaResultado,
  type SacarDeCadenciaInput,
  type SacarDeCadenciaResultado,
  type CorrerCadenciaInput,
  type CorrerCadenciaResultado,
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
  candidatosEmpujon,
  adelantarEnvios,
  inscripcionesEmpujables,
  pasoInscripcionesPendientesDe,
  selectorVacio,
  type SelectorEmpujon,
  type CandidatoEmpujon,
  type ResultadoAdelanto,
  crearContacto,
  actualizarContacto,
  type CrearContactoInput,
  type CrearContactoResultado,
  type ActualizarContactoInput,
  type ActualizarContactoResultado,
  type ContactoEscrito,
} from '../db/repository';
import {
  RESULTADOS_REUNION_OCURRIDA,
  type RegistrarToqueInput,
  type EditarToqueInput,
  type PlanearDiaInput,
  type MarcarNoEjecutadoInput,
  type Canal,
  type RitmoIngresoInput,
  type DefinicionSegmento,
} from '../db/validation';
import { readinessCanalUsuario } from '../core/readiness-canal-usuario';
import { motivosNoSale } from '../core/empujon';
import { MAX_INTENTOS } from '../core/push';
// La MISMA funcion pura que corre inscribirEmpresaEnCadencia por dentro (via
// previsualizarInscripcion). No es una copia de la regla: es la regla.
import { elegirDestinatarioDefault } from '../core/inscripcion';
import { calcularConversionStage } from '../core/panel/conversionStage';
import { FUNNEL_ETAPAS } from '../db/funnel';
import { probabilidadCierrePorEtapa, type ProbabilidadCierre } from '../core/probabilidadCierre';
// El mismo parser que usa el wizard web (app/campanas/nueva/actions.ts). Ver la nota en
// crearCadenciaTool: es donde vive la extraccion de [variables] y la directiva [[firma]].
import { parsearCadenciaJson } from '../core/cadencia-parser';
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

export type CuentasInput = { idOrganizacion?: number; conAliado?: boolean };

export function cuentasTool(input: CuentasInput) {
  const idOrganizacion = resolverOrganizacion(input.idOrganizacion);
  const filas = cuentasParaReconciliar(idOrganizacion, { conAliado: input.conAliado });
  return {
    organizacion: idOrganizacion,
    total: filas.length,
    // Solo cuando se pidio la clasificacion. Es el tamano del hueco, y sin el numero arriba hay
    // que recorrer 476 filas para saber si la lista se puede usar o si medio pipeline esta sin
    // mirar. Las sin verificar NO se restan del total: entran a la lista, marcadas.
    ...(input.conAliado
      ? { sinVerificarAliado: filas.filter((f) => f.aliado && !f.aliado.verificado).length }
      : {}),
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

// De quien es la cuenta. Devuelve la clasificacion RELEIDA, no un ok: quien marca necesita ver
// que quedo escrito y con que procedencia, que es el dato que hace auditable la lista despues.
export function marcarAliadoTool(input: MarcarAliadoInput, idOrganizacion: number): MarcarAliadoResultado {
  return marcarAliado(input, idOrganizacion);
}

// Por que la cuenta no entra a la lista. Devuelve la clasificacion releida, que ya trae resuelto
// si el descarte esta vigente: una congelada con fecha pasada vuelve sola y la respuesta lo dice.
export function marcarDescarteTool(input: MarcarDescarteInput, idOrganizacion: number): MarcarDescarteResultado {
  return marcarDescarte(input, idOrganizacion);
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

// --- crear_contacto / actualizar_contacto (2026-07-28) ---------------------------------
//
// El movimiento que faltaba: cargar A QUIEN se le manda. crear_empresa monta la cuenta y
// crear_cadencia monta la secuencia, pero entre las dos no habia forma de darle un correo a
// nadie: el unico camino que escribia `contacto` era el bloque `kdm` de registrar_toque, que
// acepta nombre y telefono y nada mas. Sin email no hay destinatario y lanzar_campana responde
// "empresas sin destinatario utilizable".
//
// Las dos tools no devuelven solo el contacto: devuelven ademas quien seria el DESTINATARIO de
// una inscripcion hecha hoy, calculado con elegirDestinatarioDefault, la misma funcion pura que
// corre inscribirEmpresaEnCadencia por dentro (via previsualizarInscripcion). Es la unica forma
// de que quien llama vea el efecto real de lo que acaba de escribir, porque la eleccion NO es
// "el que acabo de marcar principal": el orden es KDM, despues principal, despues el primero con
// email por id. Un contacto nuevo marcado principal en una empresa que ya tenia un KDM con email
// NO se lleva la cadencia, y eso se dice explicito en vez de dejar que se descubra con el correo
// mandado al que no era.

export type DestinatarioDeLaCadencia = { idContacto: number; nombre: string | null; email: string | null; porQue: string } | null;

function destinatarioQueElegiriaLaCadencia(contactos: ContactoEscrito[]): DestinatarioDeLaCadencia {
  const idElegido = elegirDestinatarioDefault(
    contactos.map((c) => ({
      idContacto: c.idContacto,
      esKeyDecisionMaker: c.esKeyDecisionMaker,
      esPrincipal: c.esPrincipal,
      email: c.email,
      telefono: c.telefono,
    })),
  );
  if (idElegido == null) return null;
  const elegido = contactos.find((c) => c.idContacto === idElegido)!;
  const porQue = elegido.esKeyDecisionMaker
    ? 'es el KDM con email (el KDM gana sobre el principal)'
    : elegido.esPrincipal
      ? 'es el contacto principal con email'
      : 'es el primero con email por id (no hay KDM ni principal con email)';
  return { idContacto: elegido.idContacto, nombre: elegido.nombre, email: elegido.email, porQue };
}

// Advertencias que salen de leer el estado FINAL de la empresa, no del input. Cada una es un
// caso en que la escritura quedo bien pero el correo igual no sale, o sale al que no era.
function advertenciasDeContacto(
  contactos: ContactoEscrito[],
  destinatario: DestinatarioDeLaCadencia,
  tocado: ContactoEscrito,
  principalAnterior: ContactoEscrito | null,
): string[] {
  const advertencias: string[] = [];
  if (principalAnterior) {
    advertencias.push(
      `#${principalAnterior.idContacto} (${principalAnterior.nombre ?? 'sin nombre'}) dejó de ser el principal de ` +
        `${tocado.idEmpresa}: es_principal es exclusivo por empresa (índice único uq_contacto_principal en isps.db), ` +
        'así que marcar uno degrada al anterior en la misma transacción.',
    );
  }
  if (destinatario === null) {
    advertencias.push(
      `${tocado.idEmpresa} sigue SIN destinatario: ningún contacto suyo tiene email, así que una inscripción nacería ` +
        "'bloqueada' y lanzar_campana la contaría como \"empresa sin destinatario utilizable\".",
    );
  } else if (destinatario.idContacto !== tocado.idContacto) {
    advertencias.push(
      `el correo de esta cadencia NO le va a llegar a #${tocado.idContacto} sino a #${destinatario.idContacto} ` +
        `(${destinatario.nombre ?? 'sin nombre'}, ${destinatario.email}), porque ${destinatario.porQue}. ` +
        'Para que sea el que acabas de tocar: márcalo esKdm:true, o quítale el KDM al otro con actualizar_contacto.',
    );
  }
  const kdmsConEmail = contactos.filter((c) => c.esKeyDecisionMaker && c.email);
  if (kdmsConEmail.length > 1) {
    advertencias.push(
      `${tocado.idEmpresa} tiene ${kdmsConEmail.length} contactos marcados KDM con email (#${kdmsConEmail.map((c) => c.idContacto).join(', #')}). ` +
        'es_key_decision_maker NO es exclusivo en la base, y elegirDestinatarioDefault se queda con el de menor id: ' +
        `hoy sería #${kdmsConEmail[0].idContacto}.`,
    );
  }
  if (!tocado.nombre) {
    advertencias.push(
      `#${tocado.idContacto} quedó sin nombre. El copy de las cadencias usa [variables] como [nombre]: un paso que ` +
        'la use va a salir con el hueco vacío.',
    );
  }
  return advertencias;
}

export type CrearContactoTooResultado =
  | (Extract<CrearContactoResultado, { creado: true }> & { destinatarioDeLaCadencia: DestinatarioDeLaCadencia; advertencias: string[] })
  | Extract<CrearContactoResultado, { creado: false }>;

export function crearContactoTool(input: CrearContactoInput, idOrganizacion: number): CrearContactoTooResultado {
  const r = crearContacto(input, idOrganizacion);
  if (!r.creado) return r;
  const destinatarioDeLaCadencia = destinatarioQueElegiriaLaCadencia(r.contactosEmpresa);
  return {
    ...r,
    destinatarioDeLaCadencia,
    advertencias: advertenciasDeContacto(r.contactosEmpresa, destinatarioDeLaCadencia, r.contacto, r.principalAnterior),
  };
}

export type ActualizarContactoTooResultado =
  | (Extract<ActualizarContactoResultado, { actualizado: true }> & {
      destinatarioDeLaCadencia: DestinatarioDeLaCadencia;
      advertencias: string[];
    })
  | Extract<ActualizarContactoResultado, { actualizado: false }>;

export function actualizarContactoTool(input: ActualizarContactoInput, idOrganizacion: number): ActualizarContactoTooResultado {
  const r = actualizarContacto(input, idOrganizacion);
  if (!r.actualizado) return r;
  const destinatarioDeLaCadencia = destinatarioQueElegiriaLaCadencia(r.contactosEmpresa);
  return {
    ...r,
    destinatarioDeLaCadencia,
    advertencias: advertenciasDeContacto(r.contactosEmpresa, destinatarioDeLaCadencia, r.contacto, r.principalAnterior),
  };
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

  // fuente='whatsapp_entrante' (2026-07-27): el webhook de WhatsApp deja un toque por cada
  // mensaje ENTRANTE del ISP, sin ejecutor y sin resultado. Antes de este fix esas filas
  // subian totalToques igual que un toque real -- 42 mensajes de un solo hilo se leian como
  // 42 movimientos del dia con cero trabajo del operador. `toques` sigue trayendo TODAS las
  // filas del rango (nada se oculta, cada una trae su `fuente`); los totales y `conteos` de
  // aca abajo se calculan solo sobre lo EJECUTADO. totalToques no se renombra -- ya
  // significaba "lo que se hizo"; se agrega toquesEntrantes aparte, mismo patron que
  // totalAplazos/aplazos (lo que no cuenta como toque va separado, nunca sumado).
  const ejecutados = toques.filter((t) => t.fuente !== 'whatsapp_entrante');
  const entrantes = toques.length - ejecutados.length;

  return {
    organizacion: idOrganizacion,
    desde: input.desde,
    hasta: input.hasta,
    owner: input.owner ?? null,
    ejecutadoPor: input.ejecutadoPor ?? null,
    totalToques: ejecutados.length,
    // Mensajes entrantes del ISP en el rango (fuente='whatsapp_entrante'), aparte de
    // totalToques por la misma razon que totalAplazos va aparte de totalToques: no es
    // trabajo que hizo el operador.
    toquesEntrantes: entrantes,
    totalAplazos: aplazos.length,
    // Sin atribucion: la porcion del periodo de la que no se sabe quien la ejecuto. Se
    // reporta explicito para que nadie lea el reparte por persona como si fuera completo.
    // Solo sobre lo ejecutado -- un entrante nunca tiene ejecutadoPor y no es "sin atribuir",
    // es "no es del operador".
    toquesSinAtribuir: ejecutados.filter((t) => !t.ejecutadoPor).length,
    // Toques que no se pueden fechar: `fecha` en prosa o vacia y sin fecha_dia. Se reporta por
    // la misma razon que toquesSinAtribuir -- son las filas de las que no se puede decir nada
    // en el tiempo, y esconderlas hace ver completo un conteo que no lo es.
    toquesSinFecha: ejecutados.filter((t) => !t.fechaDia).length,
    conteos: conteosActividad(ejecutados),
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
    // El mix por TIPO, con la misma forma que el bloque de duracion de abajo y por la misma
    // razon: porTipo cuenta solo lo que alguien dijo, y cuantos se quedaron mudos va aparte, en
    // su propia llave. Presentar el mix de los 30 que traen tipo como si fuera el de los 96
    // toques del periodo es la lectura falsa que este corte tiene que hacer imposible.
    //
    // Los mudos NO se reparten ni se rellenan mirando la etapa de la cuenta: derivar es lo que
    // contamino el mix que este bloque viene a reemplazar (ver TIPOS_TOQUE en validation.ts).
    tipo: {
      porTipo: contar(toques.map((t) => t.tipoToque).filter((t): t is string => t != null)),
      toquesConTipo: toques.filter((t) => t.tipoToque != null).length,
      toquesSinTipo: toques.filter((t) => t.tipoToque == null).length,
    },
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

// --- estado_cadencia (LECTURA, 2026-08-03) ---------------------------------------------
//
// La lectura que le faltaba al MCP: como esta la cadencia de una cuenta o de un owner.
// `cola` no puede darla porque excluye 'lead' por regla de dominio, y cambiar_cadencia
// devuelve las cadencias vivas pero exige idCampana o un campo de reprogramacion, asi que
// preguntarle "como esta esto" responde con un error de validacion en vez de con un estado.
//
// Adaptador delgado: el filtro y el corte viven en estadoCadencia() del dominio. Aca solo se
// resuelve la organizacion, igual que las demas de lectura.

export type EstadoCadenciaToolInput = EstadoCadenciaInput & { idOrganizacion?: number };

export function estadoCadenciaTool(input: EstadoCadenciaToolInput): EstadoCadenciaResultado {
  const { idOrganizacion, ...filtro } = input;
  return estadoCadencia(filtro, resolverOrganizacion(idOrganizacion));
}

// --- sacar_de_cadencia (ESCRITURA, 2026-08-03) -----------------------------------------
//
// Adaptador delgado sobre sacarDeCadencia(). La accion que faltaba para bajar una cuenta de
// la cola sin mentir: aplazar_seguimiento escribe un evento de incumplimiento, y una cuenta
// que todavia no esta para toque no incumplio nada. Lo unico que se podia hacer hoy era
// escribirle una fecha a ciegas con actualizar_empresa, que ademas no acepta vaciarla.
//
// Devuelve una fila por cada cuenta pedida, en `cuentas` o en `rechazos`, nunca en ninguna de
// las dos: el descarte silencioso es el modo de falla que esta accion tiene prohibido.

export function sacarDeCadenciaTool(input: SacarDeCadenciaInput, idOrganizacion: number): SacarDeCadenciaResultado {
  return sacarDeCadencia(input, idOrganizacion);
}

// --- correr_cadencia (ESCRITURA, 2026-08-03) -------------------------------------------
//
// Adaptador delgado sobre correrCadencia(). Es el movimiento en BLOQUE que faltaba: agarrar
// el pedazo vencido de una cadencia y correrlo N dias sin bajar la cuenta de la secuencia y
// sin registrar un incumplimiento. sacar_de_cadencia baja la cuenta; esta la deja corriendo.

export function correrCadenciaTool(input: CorrerCadenciaInput, idOrganizacion: number): CorrerCadenciaResultado {
  return correrCadencia(input, idOrganizacion);
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

// --- programar_envios / envios_programados -------------------------------------------
//
// El gesto de la manana: el operador revisa los copys de apertura entre 8:00 y 8:30 y los deja
// programados para las 11:00, uno cada dos minutos. Despues de las 8:30 no le da enviar a nada.
//
// Por que ES UNA sola accion y no dos: para el son un movimiento ("este texto va, a las 11").
// Partirlo en guardar-copy + aprobar deja el estado a medias cuando la segunda falla, con el
// texto nuevo sin aprobar o la aprobacion sobre el texto viejo. El repository lo resuelve en
// una transaccion por paso.
//
// PROGRAMA, NO MANDA. Quien manda es el worker, cuando llega la hora. Y no manda nada que no
// tenga aprobado_en: el gate vive en pasoInscripcionesPendientes, no en esta tool, porque una
// regla que se cumple solo si pasas por la puerta correcta no es una regla.

export type PasoAProgramar = { idPasoInscripcion: number; cuerpo: string };

export type ProgramarEnviosInput = {
  pasos: PasoAProgramar[];
  horaInicio: string;
  espaciadoMinutos?: number;
  aprobadoPor?: string;
};

const ESPACIADO_PROGRAMACION_DEFAULT_MIN = 2;

export function programarEnviosTool(input: ProgramarEnviosInput) {
  const espaciadoMinutos = input.espaciadoMinutos ?? ESPACIADO_PROGRAMACION_DEFAULT_MIN;
  const horario = calcularHorarioEscalonado(input.horaInicio, input.pasos.length, espaciadoMinutos * 60_000);
  const aprobadoPor = input.aprobadoPor ?? EJECUTOR_POR_DEFECTO;

  const programados: EnvioProgramado[] = [];
  const rechazados: { idPasoInscripcion: number; motivo: string }[] = [];

  // Uno por uno y sin transaccion que los envuelva a todos: un paso que ya salio no puede
  // tumbar los otros seis. Es el mismo criterio del push (cada destinatario es independiente)
  // y lo que pidio el encargo: rechazar lo que no cuadre sin tumbar el lote.
  input.pasos.forEach((paso, i) => {
    const r = aprobarYProgramarPaso(paso.idPasoInscripcion, paso.cuerpo, horario[i].fechaProgramada, aprobadoPor);
    if (r.ok) programados.push(r.envio);
    else rechazados.push({ idPasoInscripcion: r.idPasoInscripcion, motivo: r.motivo });
  });

  return {
    horaInicio: input.horaInicio,
    espaciadoMinutos,
    aprobadoPor,
    totalPedidos: input.pasos.length,
    totalProgramados: programados.length,
    totalRechazados: rechazados.length,
    // Lo que quedo ESCRITO, releido de la base fila por fila. No es el eco del input: si algo
    // no se guardo como se pidio, se ve aca.
    programados,
    rechazados,
    // El ritmo real lo pone el worker, no estas horas. Se dice en la respuesta y no solo en la
    // documentacion, porque quien programa a las 8:15 no va a ir a leer un comentario.
    nota:
      `Las horas son el piso desde el que cada mensaje queda ELEGIBLE, no el instante exacto de salida. ` +
      `El worker corre cada 5 minutos y separa los de una misma pasada con whatsapp_espaciado_min_ms/max_ms: ` +
      `para que el ritmo real sea de ${espaciadoMinutos} minutos, esas dos claves tienen que valer ${espaciadoMinutos * 60_000}.`,
  };
}

// --- lanzar_campana -------------------------------------------------------------------
//
// Lanzar una campana solo se podia apretando el boton de /campanas/[id]/lanzar. Esta tool es
// ese mismo movimiento sin la web: fija el owner, persiste la config de goteo, inscribe el
// segmento curado, deja la campana lista para Gmail y empuja de una lo que ya vencio.
//
// DOS PASADAS, y la primera es el default: sin `confirmar: true` no se escribe NADA. Se
// devuelve a quien le llegaria, por que canal y a que direccion, mas todo lo que impediria
// lanzar. Un lanzamiento no se deshace (el mensaje ya salio), asi que el default tenia que ser
// el que no manda.
//
// Lo que NO hace, a proposito:
//  - no salta el gate de revision humana de WhatsApp. Los pasos de whatsapp se materializan
//    igual, pero pasoInscripcionesPendientes('whatsapp') exige aprobado_en, asi que ninguno
//    sale de aca: hay que aprobarlos uno por uno con programar_envios. Se reportan aparte
//    (esperandoRevisionHumana) para que quede claro que quedaron parados a proposito.
//  - no crea ni sincroniza una secuencia en Apollo. El unico camino de correo vivo es Gmail
//    (readinessCanalUsuario bloquea 'correo' sin Gmail verificado antes de escribir nada), y
//    ahi el proveedor_campana_id es sintetico, igual que en la web.
//  - no lanza una campana que no este en 'borrador'. Re-inscribir una campana ya activa es un
//    movimiento distinto (sumar empresas nuevas del segmento) y no se hace por accidente
//    desde una tool.
//
// ADVERTENCIA que no vive en ningun comentario del worker: el empujon de esta tool es 'manual'
// (materializarYEmpujarAhora), y el modo manual NO respeta la ventana de 8 a 18 hora Bogota ni
// el espaciado de 45-90s. Un lanzamiento a las 11pm manda a las 11pm.

export type LanzarCampanaInput = {
  idCampana: number;
  confirmar?: boolean;
  intakeDiario?: number | null;
  ritmoIngreso?: RitmoIngresoInput;
  topeToquesDia?: number | null;
  fechaInicio?: string | null;
};

// Quien lanza. No sale del input del cliente MCP a proposito: el owner que queda en la campana
// y el usuario contra el que se resuelven Gmail y la linea de WhatsApp son los de la SESION
// autenticada (app/api/mcp/route.ts), igual que requireEscritura() en la web. Un cliente que
// pudiera elegir el owner podria mandar por la linea de otra persona.
export type SesionLanzamiento = { idUsuario: string; owner: string };

export type LanzarCampanaDeps = {
  // El empujon real. Inyectable para poder probar el fallo del proveedor sin proveedor, y
  // cargado por import dinamico para que el resto del MCP (todo lectura) no arrastre los
  // adaptadores del worker solo por importar este archivo.
  empujarAhora: () => Promise<void>;
};

const DEPS_LANZAR_DEFAULT: LanzarCampanaDeps = {
  empujarAhora: async () => {
    const { materializarYEmpujarAhora } = await import('../worker/index');
    await materializarYEmpujarAhora();
  },
};

// Estados de paso_inscripcion que, en un canal automatico, significan "no salio". 'enviando' es
// transitorio: si quedo ahi despues del push, el proceso se cayo entre marcar y recibir la
// respuesta del proveedor.
const ESTADOS_NO_SALIO = ['pendiente', 'fallo', 'enviando'];

export type LanzarCampanaResultado = {
  idCampana: number;
  confirmado: boolean;
  puedeLanzar: boolean;
  bloqueos: string[];
  advertencias: string[];
  campana: ReturnType<typeof campanaParaLanzar>;
  canales: Canal[];
  readiness: { canal: Canal; listo: boolean; motivo: string | null }[];
  destinatarios: { empresa: string; idEmpresa: string; contacto: string | null; email: string | null; telefono: string | null; canales: string[]; toques: number }[];
  bloqueadas: { empresa: string; idEmpresa: string; motivo: string }[];
  // Lo que el empujon mandaria ADEMAS de esta campana: materializarYEmpujarAhora barre TODAS
  // las campanas activas, no solo esta. Se dice antes de confirmar, no despues.
  colateral: { idPasoInscripcion: number; canal: string; empresa: string | null }[];
  colateralNota: string;
  inscripcion: ResultadoInscripcion | null;
  estadoTrasLanzar: EstadoLanzamientoCampana | null;
  esperandoRevisionHumana: { idPasoInscripcion: number; canal: string; empresa: string }[];
  problemas: string[];
  logDelPush: string[];
  nota: string;
};

export async function lanzarCampanaTool(
  input: LanzarCampanaInput,
  idOrganizacion: number,
  sesion: SesionLanzamiento,
  deps: LanzarCampanaDeps = DEPS_LANZAR_DEFAULT,
): Promise<LanzarCampanaResultado> {
  const camp = campanaParaLanzar(input.idCampana, idOrganizacion);
  // Sin campana no hay nada que previsualizar ni que lanzar: revienta en los dos modos.
  if (!camp) throw new Error(`lanzar_campana: la campaña ${input.idCampana} no existe en la organización ${idOrganizacion}`);

  const canales = canalesDeCadencia(camp.idCadencia);
  const tieneLineaWhatsapp = lineasWhatsappDeUsuario(sesion.idUsuario).some((l) => l.estado === 'activa');
  const tieneGmailVerificado = gmailVerificadoDe(sesion.idUsuario);
  const readiness = canales.map((canal) => {
    const v = readinessCanalUsuario(canal, tieneLineaWhatsapp, tieneGmailVerificado);
    return { canal, listo: v.listo, motivo: v.listo ? null : v.motivo };
  });

  const filas = previsualizarInscripcionCampana(input.idCampana, idOrganizacion) ?? [];
  const elegibles = filas.filter((f) => f.idContacto != null);
  const bloqueadas = filas.filter((f) => f.idContacto == null);

  const bloqueos: string[] = [];
  const advertencias: string[] = [];

  if (camp.estado !== 'borrador') {
    // El puntero a empujar_envios no es cortesía (2026-07-28): este bloqueo era un callejón sin
    // salida. La primera inscripción por cambiar_cadencia ya pone la campaña en 'activa', así
    // que quien inscribe cuenta por cuenta llegaba acá sin ninguna otra puerta y sin saber que
    // la había cerrado él mismo.
    bloqueos.push(
      `la campaña está en estado '${camp.estado}', no en 'borrador'. Esta tool solo lanza campañas que nunca se lanzaron; ` +
        `sumar empresas nuevas a una campaña ya activa es otro movimiento y no se hace desde acá. ` +
        `Para EMPUJAR AHORA lo que esa campaña ya tiene inscrito y pendiente, sin esperar la ventana de 8:00-18:00: empujar_envios`,
    );
  }
  if (!sesion.owner.trim()) bloqueos.push('la sesión no tiene owner mapeado: no hay a nombre de quién lanzar');
  if (!sesion.idUsuario.trim()) bloqueos.push('la sesión no tiene usuario: no se puede resolver el Gmail ni la línea de WhatsApp de quien lanza');
  for (const r of readiness) if (!r.listo) bloqueos.push(`canal ${r.canal}: ${r.motivo}`);
  // El mensaje decía "no hay ni un destinatario elegible: no hay a quién mandarle" en los dos
  // casos, y eso era falso en el que importa (2026-07-28): con dos inscripciones activas, con su
  // destinatario y su correo listo, la campaña 58 recibió esa frase. Lo que la lista vacía
  // describe es el SEGMENTO, que es de dónde salen las empresas POR INSCRIBIR; no dice nada sobre
  // lo que la campaña ya tiene adentro. Un mensaje que dice lo contrario de la realidad manda a
  // buscar el problema donde no está, que es lo que pasó.
  if (elegibles.length === 0) {
    bloqueos.push(
      filas.length === 0
        ? 'el segmento de la campaña no matchea ninguna empresa hoy: no hay a quién INSCRIBIR. Esto no dice nada sobre las inscripciones que la campaña ya tenga: para ver y empujar ésas, empujar_envios'
        : `las ${filas.length} empresa(s) del segmento no tienen contacto con email ni teléfono utilizable: no hay a quién inscribir`,
    );
  }
  if (bloqueadas.length > 0) {
    // Mas estricto que el boton de la web, que inscribe las bloqueadas a la cola de revision y
    // sigue. Desde el MCP no se ve esa cola, asi que una bloqueada seria una empresa que se da
    // por lanzada y nunca recibe nada.
    bloqueos.push(
      `hay ${bloqueadas.length} empresa(s) sin destinatario utilizable (${bloqueadas.map((b) => b.nombreEmpresa).join(', ')}). ` +
        `Se resuelven en la cola de revisión antes de lanzar desde acá`,
    );
  }
  if (canales.includes('correo') && pasosParaSincronizarCopy(camp.idCadencia).length === 0) {
    bloqueos.push('la cadencia tiene un paso de correo pero ninguna versión de copy por default: no hay texto que mandar');
  }

  const pasosWhatsapp = canales.includes('whatsapp');
  if (pasosWhatsapp) {
    advertencias.push(
      'la cadencia tiene pasos de WhatsApp: se materializan pero NO salen. Cada uno exige revisión humana ' +
        '(programar_envios) antes de que el worker lo empuje.',
    );
  }
  if (canales.includes('correo')) {
    advertencias.push('el correo sale por Gmail con el id de campaña sintético gmail-camp-N; no se crea ninguna secuencia en Apollo.');
  }
  advertencias.push(
    'el empujón es modo manual: NO respeta la ventana de 8:00-18:00 Bogotá ni el espaciado de 45-90s del worker. ' +
      'Lo que se lance a las 11pm sale a las 11pm.',
  );

  // Lo que el push mandaria ademas de esta campana, leido ANTES de tocar nada. Antes de
  // inscribir, esta campana no tiene ningun paso_inscripcion, asi que todo lo que salga aca es
  // de otras campanas.
  const colateral = ([...pasoInscripcionesPendientes('correo'), ...pasoInscripcionesPendientes('whatsapp')]).map((f) => ({
    idPasoInscripcion: f.idPasoInscripcion,
    canal: f.paso.canal,
    empresa: f.destinatario.empresa,
  }));

  const base = {
    idCampana: input.idCampana,
    puedeLanzar: bloqueos.length === 0,
    bloqueos,
    advertencias,
    campana: camp,
    canales,
    readiness,
    destinatarios: elegibles.map((f) => ({
      empresa: f.nombreEmpresa,
      idEmpresa: f.idEmpresa,
      contacto: f.nombreContacto,
      email: f.email,
      telefono: f.telefono,
      canales: f.pasosAjustados.map((p) => p.canal),
      toques: f.toquesTotales,
    })),
    bloqueadas: bloqueadas.map((f) => ({ empresa: f.nombreEmpresa, idEmpresa: f.idEmpresa, motivo: 'sin contacto con email ni teléfono utilizable' })),
    colateral,
    colateralNota:
      'Son los pasos YA materializados de otras campañas que este mismo empujón sacaría. No incluye los que ' +
      'se materialicen durante esta corrida (el worker corre cada 5 minutos, así que en la práctica ya están).',
  };

  if (input.confirmar !== true) {
    return {
      ...base,
      confirmado: false,
      inscripcion: null,
      estadoTrasLanzar: estadoLanzamientoCampana(input.idCampana, idOrganizacion),
      esperandoRevisionHumana: [],
      problemas: [],
      logDelPush: [],
      nota: 'En seco: no se escribió nada. Para lanzar de verdad hay que mandar confirmar: true.',
    };
  }

  if (bloqueos.length > 0) {
    throw new Error(`lanzar_campana: la campaña ${input.idCampana} no se puede lanzar. ${bloqueos.join(' | ')}`);
  }

  fijarOwnerCampana(input.idCampana, sesion.owner);
  const config: ConfigLanzamientoInput = {};
  if ('intakeDiario' in input) config.intakeDiario = input.intakeDiario ?? null;
  if (input.ritmoIngreso != null) config.ritmoIngreso = input.ritmoIngreso;
  if ('topeToquesDia' in input) config.topeToquesDia = input.topeToquesDia ?? null;
  if ('fechaInicio' in input) config.fechaInicio = input.fechaInicio ?? null;
  if (Object.keys(config).length > 0) actualizarConfigLanzamiento(input.idCampana, config);

  // La escritura fuerte: inscribirCampana corre en UNA transaccion (cierra la activa anterior
  // de cada empresa y abre la nueva juntas) y deja la campana en 'activa'.
  const inscripcion = inscribirCampana(input.idCampana, idOrganizacion);

  // Correo: el id sintetico es el correlator del tracking y aprobada_envio_gmail es la
  // compuerta que mira pasoInscripcionesPendientes. Sin estos dos, el paso se materializa y
  // nunca sale -- exactamente el mismo par que escribe el boton de la web.
  if (canales.includes('correo')) {
    guardarProveedorCampanaId(input.idCampana, `gmail-camp-${input.idCampana}`, idOrganizacion);
    marcarCampanaAprobadaGmail(input.idCampana);
  }

  // push.ts se traga el fallo del proveedor: lo loguea con console.error y deja la fila en
  // 'fallo'. Sin capturar esa linea, la unica pista del "por que" se pierde y esta tool
  // reportaria un estado sin causa -- el mismo agujero por el que ya pasaron el heartbeat de
  // apollo-tracking y gmailVerificadoDe. Se COPIA, no se silencia: cada linea se sigue
  // imprimiendo igual.
  const logDelPush: string[] = [];
  const errorOriginal = console.error;
  console.error = (...args: unknown[]) => {
    logDelPush.push(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    errorOriginal(...args);
  };
  try {
    await deps.empujarAhora();
  } finally {
    console.error = errorOriginal;
  }

  const estadoTrasLanzar = estadoLanzamientoCampana(input.idCampana, idOrganizacion);
  if (!estadoTrasLanzar) {
    throw new Error(`lanzar_campana: se inscribió la campaña ${input.idCampana} pero no se pudo releer su estado. Verificar a mano antes de reintentar.`);
  }

  // Un paso de whatsapp sin aprobar NO es un fallo: es el gate funcionando. Se separa de los
  // problemas reales para que ninguno de los dos se lea como el otro.
  const esperandoRevisionHumana = estadoTrasLanzar.pasos
    .filter((p) => p.canal === 'whatsapp' && p.aprobadoEn === null && p.estado === 'pendiente')
    .map((p) => ({ idPasoInscripcion: p.idPasoInscripcion, canal: p.canal, empresa: p.empresa }));

  const problemas: string[] = [];
  for (const p of estadoTrasLanzar.pasos) {
    if (p.canal === 'whatsapp' && p.aprobadoEn === null) continue; // ya contado arriba
    if (p.canal === 'llamada') continue; // no tiene proveedor automatico: se hace a mano y por eso queda pendiente
    if (ESTADOS_NO_SALIO.includes(p.estado)) {
      problemas.push(
        `paso_inscripcion ${p.idPasoInscripcion} (${p.canal}, ${p.empresa}) quedó en '${p.estado}' con ${p.intentos} intento(s): no salió`,
      );
    }
  }

  const resultado: LanzarCampanaResultado = {
    ...base,
    confirmado: true,
    inscripcion,
    estadoTrasLanzar,
    esperandoRevisionHumana,
    problemas,
    logDelPush,
    nota:
      `La campaña quedó '${estadoTrasLanzar.campana.estado}'. Los pasos con estado 'enviada' y proveedor_mensaje_id ` +
      `son los que de verdad salieron; los demás no. Lo que no se materializó hoy (el goteo reparte por día) lo empuja el worker.`,
  };

  // Falla ruidosa: la escritura ya ocurrio, asi que el estado releido viaja igual dentro del
  // error. Un lanzamiento con un paso caido NO puede devolverse como exito.
  if (problemas.length > 0) {
    throw new Error(
      `lanzar_campana: la campaña ${input.idCampana} se inscribió pero ${problemas.length} paso(s) no salieron. ` +
        `${problemas.join(' | ')}${logDelPush.length > 0 ? ` || log del push: ${logDelPush.join(' ; ')}` : ''}\n` +
        JSON.stringify(resultado, null, 2),
    );
  }

  return resultado;
}

// --- crear_cadencia -------------------------------------------------------------------
//
// El movimiento que le faltaba al MCP y que no tenia rodeo barato: montar una cadencia. Hasta
// hoy crearCadencia y crearCampana tenian un solo caller, la Server Action del wizard web
// (app/campanas/nueva/actions.ts), detras de la sesion del navegador. Sin tool, un agente al
// que se le pidiera "arma una cadencia de 5 correos" quedaba bloqueado o terminaba insertando
// a mano en seis tablas.
//
// UNA tool y no dos (crear_cadencia + crear_campana), por tres razones que salen del esquema:
//   - campana.id_cadencia y campana.id_segmento son NOT NULL. Una cadencia sin campana no la
//     consume nada: no se puede inscribir a nadie en ella, no sale en ninguna lista, no la ve
//     ninguna pantalla. La unica forma de usarla es crear la campana, asi que separarlas solo
//     agrega un estado intermedio invalido.
//   - Ese estado intermedio ya mordio una vez: el wizard creaba la cadencia y la campana en
//     dos pasos y dejaba zombies en 'borrador' cada vez que el usuario cambiaba de archivo;
//     hubo que agregar abandonarBorradorAction para limpiarlos. Con una tool no puede pasar,
//     porque las tres filas caen en una sola transaccion.
//   - Un cliente MCP no tiene forma de deshacer a medias. Si crear_campana falla despues de
//     crear_cadencia, el agente se queda con un id de cadencia que no puede usar ni borrar.
//
// Reusa las MISMAS funciones de dominio que la web (insertarCadenciaEnTx, el insert de campana
// y definicionSegmentoSchema), no una copia: si manana cambia como nace un paso, cambia para
// los dos caminos a la vez.
//
// Nace en 'borrador' a proposito: crear no es lanzar. Poner la campana a correr es otro acto
// explicito (lanzar_campana para el segmento entero, cambiar_cadencia para una empresa suelta).
export type CrearCadenciaInput = {
  nombre: string;
  descripcion?: string;
  pasos: {
    orden: number;
    diaOffset: number;
    canal: string;
    asunto?: string;
    cuerpo?: string;
    objetivo?: string;
    esManual?: boolean;
  }[];
  idSegmento?: number;
  segmento?: { nombre: string; definicion: unknown; descripcionNatural?: string };
  nombreCampana?: string;
  modo?: 'prioritaria' | 'batch';
  reglaFaltante?: 'reemplazar' | 'saltar' | 'cola';
  intakeDiario?: number;
  ritmoIngreso?: RitmoIngresoInput;
  topeToquesDia?: number;
  fechaInicio?: string;
};

export type CrearCadenciaResultado = {
  idCadencia: number;
  idCampana: number;
  idSegmento: number;
  campana: NonNullable<ReturnType<typeof campanaCompleta>>;
  envioCorreo: ReturnType<typeof estadoEnvioCorreo>;
  advertencias: string[];
  nota: string;
};

export function crearCadenciaTool(input: CrearCadenciaInput, idOrganizacion: number, sesion: SesionLanzamiento): CrearCadenciaResultado {
  // owner sale de la SESION, nunca del input: es de quien salen los mensajes, y con el se
  // resuelven el Gmail y la linea de WhatsApp. Un cliente que pudiera elegirlo podria montar
  // una cadencia que sale por la cuenta de otra persona.
  if (!sesion.owner.trim()) {
    throw new Error(
      'crear_cadencia: esta sesión no trae owner mapeado. La campaña quedaría con owner NULL, y una campaña sin owner ' +
        'manda el correo por Apollo (fallback de resolverAdaptadorCorreo) en vez de por el Gmail de nadie.',
    );
  }
  if (input.idSegmento == null && input.segmento == null) {
    throw new Error(
      'crear_cadencia: hace falta idSegmento (reusar uno guardado) o segmento (crear uno nuevo con su definición). ' +
        'campana.id_segmento es NOT NULL: no existe una campaña sin segmento.',
    );
  }
  if (input.idSegmento != null && input.segmento != null) {
    throw new Error('crear_cadencia: llegaron idSegmento y segmento a la vez. Es uno o el otro, no los dos.');
  }

  // Se pasa por el MISMO parser que el wizard (parsearCadenciaJson, el formato 'json' de
  // parsearCadenciaPorFormato) en vez de mandar el input crudo al repositorio. No es
  // ceremonia: ahi vive procesarCopy, que extrae las [variables] del asunto y del cuerpo y
  // saca la directiva [[firma]] del texto. Sin esto, una cadencia creada por MCP quedaria con
  // version_paso.variables en NULL y el [[firma]] pegado dentro del copy, mientras la misma
  // cadencia creada por la web queda bien: dos caminos escribiendo distinto para el mismo
  // texto de entrada.
  const parseada = parsearCadenciaJson(JSON.stringify({ nombre: input.nombre, descripcion: input.descripcion, pasos: input.pasos }));
  // parsearCadenciaJson no lee esManual: ningun formato de import (CSV/Markdown/JSON) tiene
  // columna para declararlo. Se re-adjunta desde el input, por posicion sobre el mismo array
  // que el parser acaba de recorrer en orden.
  const pasosConManual = parseada.pasos.map((p, i) => ({ ...p, esManual: input.pasos[i]?.esManual }));

  const { idCadencia, idCampana, idSegmento } = crearCadenciaConCampana(
    {
      cadencia: { ...parseada, pasos: pasosConManual },
      segmento:
        input.idSegmento != null
          ? { idSegmento: input.idSegmento }
          : {
              nombre: input.segmento!.nombre,
              // El parse duro lo hace definicionSegmentoSchema dentro de crearCadenciaConCampana.
              // Aca solo se pasa: validar dos veces con dos schemas distintos es como se
              // desincronizan.
              definicion: input.segmento!.definicion as DefinicionSegmento,
              descripcionNatural: input.segmento!.descripcionNatural,
            },
      owner: sesion.owner,
      nombreCampana: input.nombreCampana,
      modo: input.modo,
      reglaFaltante: input.reglaFaltante,
      intakeDiario: input.intakeDiario,
      ritmoIngreso: input.ritmoIngreso,
      topeToquesDia: input.topeToquesDia,
      fechaInicio: input.fechaInicio,
    },
    idOrganizacion,
  );

  // Relectura, no eco del input: lo que se devuelve sale de la base despues de escribir. Si la
  // relectura no encuentra la campana que se acaba de crear, se dice; no se devuelve el input
  // haciendose pasar por resultado.
  const campana = campanaCompleta(idCampana, idOrganizacion);
  if (!campana) {
    throw new Error(
      `crear_cadencia: se creó la campaña ${idCampana} (cadencia ${idCadencia}, segmento ${idSegmento}) pero la relectura ` +
        'no la encuentra. Verificar a mano antes de reintentar: reintentar crearía una segunda.',
    );
  }

  const advertencias: string[] = [];
  const pasosCorreoManuales = campana.pasos.filter((p) => p.canal === 'correo' && p.esManual);
  if (pasosCorreoManuales.length > 0) {
    advertencias.push(
      `${pasosCorreoManuales.length} paso(s) de correo quedaron con esManual=true: cada envío exige que un humano lo ` +
        'apruebe uno por uno (programar_envios) antes de salir. Una cadencia que se deja corriendo sola los quiere en false.',
    );
  }
  const sinCopy = campana.pasos.filter((p) => p.canal === 'correo' && !p.cuerpo);
  if (sinCopy.length > 0) {
    advertencias.push(`los pasos de correo ${sinCopy.map((p) => p.orden).join(', ')} no tienen cuerpo: no hay texto que mandar.`);
  }
  const pasosWhatsapp = campana.pasos.filter((p) => p.canal === 'whatsapp');
  if (pasosWhatsapp.length > 0) {
    advertencias.push(
      `${pasosWhatsapp.length} paso(s) de WhatsApp: se materializan pero NO salen solos. WhatsApp exige revisión humana ` +
        'por envío (programar_envios), sin excepción.',
    );
  }
  if (campana.segmento.empresasQueCaen === 0) {
    advertencias.push('el segmento no matchea ninguna empresa hoy: lanzar_campana no tendría a quién inscribir.');
  }

  return {
    idCadencia,
    idCampana,
    idSegmento,
    campana,
    envioCorreo: estadoEnvioCorreo(idCampana, idOrganizacion),
    advertencias,
    nota:
      `La campaña ${idCampana} quedó en 'borrador': crear no es lanzar, todavía no se le mandó nada a nadie. ` +
      'Para ponerla a correr sobre el segmento entero: lanzar_campana. Para meter una empresa suelta: cambiar_cadencia ' +
      `con idCampana ${idCampana}. envioCorreo dice si el correo va a salir de verdad o qué compuerta lo está frenando.`,
  };
}

// --- enviar_whatsapp_directo (ESCRITURA, 2026-07-28) -----------------------------------
//
// El movimiento que le faltaba al MCP para validar una línea de punta a punta sin pasar por
// campaña, cadencia ni goteo: mandar UN mensaje a UN número, ya. Mismo camino que ya usa
// probarLineaAction (app/conectores/lineas-whatsapp-actions.ts): CanalEntrega.enviarPaso
// directo, SIN pasar por outbox/paso_inscripcion, así que no cuenta contra techo_diario ni
// deja fila en toque. Es la segunda tool (después de lanzar_campana) que le manda algo a
// alguien real desde el MCP, y la única pensada para UN destinatario suelto en vez de un
// segmento completo -- por eso es la herramienta correcta para "probemos que el brain puede
// mandar" y no una desviación de crear_cadencia + lanzar_campana para un caso de uno.
//
// No escribe mensaje_whatsapp: esa tabla exige id_contacto NOT NULL para 'saliente' A
// PROPÓSITO (ver su comentario en schema.ts) -- filtra por privacidad a que el destinatario
// sea un contacto real de una empresa, y un envío ad-hoc a un número cualquiera (probando la
// propia línea, por ejemplo) no lo es. La auditoría de "qué se mandó, a qué número, por qué
// instancia" es el log de servidor de abajo más el resultado RELEÍDO de Evolution que
// devuelve la tool -- nunca un {ok:true} ciego.
export type EnviarWhatsappDirectoInput = {
  telefono: string;
  cuerpo: string;
  // Si no viene, se resuelve la línea ACTIVA del owner de la sesión (misma fuente que ya usa
  // lanzar_campana/crear_cadencia para decidir "por dónde sale WhatsApp de esta persona":
  // lineasWhatsappDeUsuario(sesion.idUsuario)). Si viene, tiene que ser una línea DE ESE
  // usuario -- no se manda por la línea de otra persona ni por la de pool a ciegas desde acá.
  instancia?: string;
};

export type EnviarWhatsappDirectoResultado = {
  telefono: string;
  cuerpo: string;
  instancia: string;
  proveedor: 'evolution';
  proveedorMensajeId: string;
  estadoProveedor: string | null;
  owner: string;
  enviadoEn: string;
};

export type EnviarWhatsappDirectoDeps = {
  // El envío real contra Evolution, más el efecto colateral de marcar la línea 'caida' si el
  // proveedor confirma que la instancia no existe (mismo criterio que
  // marcarCaidaSiNoExiste/recuperacion-linea.ts, reusado tal cual). Inyectable y cargado por
  // import dinámico -- mismo patrón que LanzarCampanaDeps.empujarAhora: se puede probar sin
  // red, y el resto de este archivo (todo lectura salvo estas dos tools) no arrastra el
  // adaptador de Evolution solo por importarse.
  enviar: (
    referenciaProveedor: string,
    telefono: string,
    cuerpo: string,
    idLinea: number | null,
  ) => Promise<{ proveedorMensajeId: string; estadoProveedor: string | null }>;
};

const DEPS_ENVIAR_WHATSAPP_DIRECTO_DEFAULT: EnviarWhatsappDirectoDeps = {
  enviar: async (referenciaProveedor, telefono, cuerpo, idLinea) => {
    const { crearEvolutionAdapter } = await import('../adapters/evolution');
    try {
      const r = await crearEvolutionAdapter().enviarPaso(
        referenciaProveedor,
        { telefono, email: null, nombre: null, empresa: null, cargo: null },
        { asunto: null, cuerpo, canal: 'whatsapp' },
      );
      return { proveedorMensajeId: r.proveedorMensajeId, estadoProveedor: r.estadoProveedor ?? null };
    } catch (e) {
      if (idLinea !== null) {
        const { marcarCaidaSiNoExiste } = await import('../conectores/recuperacion-linea');
        marcarCaidaSiNoExiste(idLinea, e);
      }
      throw e;
    }
  },
};

export async function enviarWhatsappDirectoTool(
  input: EnviarWhatsappDirectoInput,
  sesion: SesionLanzamiento,
  deps: EnviarWhatsappDirectoDeps = DEPS_ENVIAR_WHATSAPP_DIRECTO_DEFAULT,
): Promise<EnviarWhatsappDirectoResultado> {
  // owner/idUsuario de la SESION, nunca del input -- mismo criterio que lanzar_campana y
  // crear_cadencia: un cliente no elige por la línea de quién manda.
  if (!sesion.owner.trim() || !sesion.idUsuario.trim()) {
    throw new Error(
      'enviar_whatsapp_directo: esta sesión no trae usuario ni owner (el server standalone por token no los tiene). ' +
        'Solo se puede mandar desde el MCP autenticado por OAuth, donde la sesión dice a nombre de quién sale el mensaje.',
    );
  }

  const telefono = input.telefono.replace(/\D/g, '');
  if (!telefono) throw new Error('enviar_whatsapp_directo: telefono vacío después de quitar todo lo que no es dígito');
  if (!input.cuerpo.trim()) throw new Error('enviar_whatsapp_directo: cuerpo vacío, no hay qué mandar');

  const lineas = lineasWhatsappDeUsuario(sesion.idUsuario);
  let instancia = input.instancia?.trim();
  let idLinea: number | null = null;

  if (instancia) {
    const propia = lineas.find((l) => l.referenciaProveedor === instancia);
    if (!propia) {
      throw new Error(
        `enviar_whatsapp_directo: '${instancia}' no es una línea de ${sesion.owner}. Pasá una instancia propia ` +
          '(la que devuelve /conectores) o dejá el campo vacío para que se resuelva sola.',
      );
    }
    idLinea = propia.id;
  } else {
    const activa = lineas.find((l) => l.estado === 'activa' && l.referenciaProveedor);
    if (!activa?.referenciaProveedor) {
      throw new Error(
        `enviar_whatsapp_directo: ${sesion.owner} no tiene una línea de WhatsApp activa (linea_whatsapp.estado='activa'). ` +
          'Conectala en /conectores antes de mandar.',
      );
    }
    instancia = activa.referenciaProveedor;
    idLinea = activa.id;
  }

  const enviadoEn = new Date().toISOString();
  const { proveedorMensajeId, estadoProveedor } = await deps.enviar(instancia, telefono, input.cuerpo, idLinea);

  // Auditoría mínima: server log con quién, por dónde y a qué número, porque esta tool NO deja
  // fila en mensaje_whatsapp (ver nota de arriba). No es la fuente de verdad -- la fuente es lo
  // que la tool devuelve, releído del proveedor, no un eco del input.
  console.log(
    `[mcp] enviar_whatsapp_directo owner=${sesion.owner} instancia=${instancia} telefono=${telefono} ` +
      `proveedorMensajeId=${proveedorMensajeId} estadoProveedor=${estadoProveedor ?? 'desconocido'} en=${enviadoEn}`,
  );

  return {
    telefono,
    cuerpo: input.cuerpo,
    instancia,
    proveedor: 'evolution',
    proveedorMensajeId,
    estadoProveedor,
    owner: sesion.owner,
    enviadoEn,
  };
}

// --- tracking_correo ------------------------------------------------------------------
//
// Lectura y CLASIFICACION de evento_tracking (canal correo). No existia forma de ver una
// apertura o un clic desde el MCP: TOOLS_LECTURA no lo exponia y aperturas_whatsapp es otra
// cosa (mensajes de apertura de conversacion de WhatsApp, no eventos de open de correo). La
// unica via era SSH mas node contra el volumen.
//
// Cada evento sale con su veredicto (clasificacion/razon/senal/confianza, de clasificarEvento
// en core/clasificar-evento-tracking.ts) y su grupo de dedup (grupoDedupId/esRepresentanteGrupo,
// de agruparDuplicados en core/dedup-eventos-tracking.ts). NINGUNA fila se borra ni se filtra:
// el crudo completo sigue en `eventos`, las dos funciones son puras y reclasificar/reagrupar es
// correrlas de nuevo sobre el mismo dato. `conteos` separa crudo de deduplicado (sumar por
// grupoDedupId distinto, no por fila) y humano de maquina. Cada evento 'clic' trae ademas
// `escaner` (detectarClicEscaner, core/detectar-clic-escaner.ts): probable_escaner/
// sin_evidencia_de_escaner con su confianza, null para 'abierto'/'visto'.
//
// `medibilidad.porEnvio` sale de cruzarAperturaClic (core/cruzar-apertura-clic.ts), que separa
// las dos causas que el viejo estadoMedibilidadEnvio (2026-07-29, primera version) fundia bajo
// 'pixel_bloqueado_confirmado': el pixel nunca se disparo (Outlook, causaMedibilidad
// 'pixel_nunca_salio') vs el pixel se disparo pero solo lo pidio un proxy (Gmail, causaMedibilidad
// 'solo_apertura_de_maquina'). Un clic que clasificarEvento marca 'humano' pero que
// detectarClicEscaner marca 'probable_escaner' NO cuenta como prueba de lectura humana en este
// cruce (se degrada a 'desconocido' solo para este calculo puntual; el veredicto original de
// clasificarEvento en `eventos` no se toca). `avisosProveedor` sigue nombrando un dominio cuando
// el patron se sostiene en 3+ envios sin un solo caso confirmado (umbral en CONTEO, nunca en %),
// ahora sobre el estado colapsado del cruce.
//
// `matrizClientes` (acumularMatrizClientes, core/matriz-clientes-correo.ts) agrupa los mismos
// envios por (dominio del destinatario x superficie de comportamiento observada) y marca cada
// celda `inferida_fuente_externa` (lo que dice `matrizSemilla`, la investigacion externa) o
// `medida_datos_propios` (30+ envios propios en esa celda). Se recalcula al vuelo sobre los
// envios de esta respuesta, no hay tabla ni cache.
//
// Lo que esta tool NUNCA hace, a proposito: no calcula ni muestra una tasa de apertura (open
// rate) en ningun %, no resuelve Apple Private Relay en vivo (R5 existe documentada pero
// inerte, campo siempre null, ver core/clasificar-evento-tracking.ts seccion 5 de la spec), no
// afirma que un clic ES de un escaner (solo 'probable', con confianza declarada: la senal de
// ip datacenter no esta implementada, ver senalIpDatacenterNoImplementada), y no cruza tracking
// con conversion para ningun accuracy o probabilidad de cierre.
export type TrackingCorreoInput = {
  idEmpresa?: string;
  idCampana?: number;
  tipo?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
};

function dominioDeEmail(email: string | null): string | null {
  if (!email) return null;
  const arroba = email.lastIndexOf('@');
  if (arroba < 0 || arroba === email.length - 1) return null;
  return email.slice(arroba + 1).toLowerCase();
}

function contarPorClasificacion(eventos: { clasificacion: string; excluirDeMetricas: boolean }[]) {
  // excluir_de_metricas (trafico de prueba interno, R1) nunca entra en un conteo: es la razon
  // de ser del campo (spec seccion 1).
  const conteo = { humano: 0, maquina: 0, desconocido: 0 };
  for (const e of eventos) {
    if (e.excluirDeMetricas) continue;
    conteo[e.clasificacion as 'humano' | 'maquina' | 'desconocido']++;
  }
  return conteo;
}

// Un clic que clasificarEvento marco 'humano' (por UA de navegador completo) pero que
// detectarClicEscaner marco 'probable_escaner' no puede seguir contando como prueba de lectura
// humana en cruzarAperturaClic (instruccion del operador, 2026-07-29). Se degrada a
// 'desconocido', no a 'maquina': el detector nunca afirma que SI fue un escaner, solo que hay
// evidencia de que pudo serlo, y 'maquina' seria una certeza que no existe. Este ajuste vive
// solo en el input del cruce -- el campo `clasificacion` de cada evento en `eventos` sigue
// siendo el veredicto original de clasificarEvento, sin tocar.
function clasificacionEfectivaParaCruce(
  tipo: string,
  clasificacion: Clasificacion,
  veredictoEscaner: VeredictoEscaner | null,
): Clasificacion {
  if (tipo === 'clic' && clasificacion === 'humano' && veredictoEscaner?.clasificacion === 'probable_escaner') {
    return 'desconocido';
  }
  return clasificacion;
}

// dominiosConAvisoNoMedible (clasificar-evento-tracking.ts) sigue esperando los 3 estados
// viejos: se colapsan los 7 del cruce de vuelta a esos 3 solo para alimentar esa funcion ya
// testeada, sin reimplementar su umbral de 3+ casos aca.
function estadoCruceComoEstadoLegado(estado: EstadoCruce): EstadoMedibilidad {
  if (estado === 'lectura_confirmada_apertura_humana') return 'apertura_humana_confirmada';
  if (estado.startsWith('lectura_confirmada_clic_')) return 'pixel_bloqueado_confirmado';
  return 'sin_senal_humana_de_apertura';
}

export function trackingCorreoTool(input: TrackingCorreoInput, idOrganizacion: number) {
  const crudos = trackingCorreo(input, idOrganizacion);

  // Deteccion de escaner (core/detectar-clic-escaner.ts) corre sobre cada 'clic'. Nunca decide
  // 'humano'/'maquina' -- eso sigue siendo trabajo exclusivo de clasificarEvento -- solo marca
  // si hay evidencia de escaner corporativo (latencia bajo piso, url reescrita, ua vacio) con su
  // confianza declarada.
  const veredictosEscaner = new Map<number, VeredictoEscaner>();
  for (const e of crudos) {
    if (e.tipo === 'clic') {
      veredictosEscaner.set(
        e.idEvento,
        detectarClicEscaner({
          fechaEvento: e.fechaEvento ?? e.createdAt ?? '',
          fechaEnvio: e.fechaEnviada,
          detalle: { url: e.url, ua: e.userAgent },
        }),
      );
    }
  }
  const eventos = crudos.map((e) => ({
    ...e,
    escaner: e.tipo === 'clic' ? (veredictosEscaner.get(e.idEvento) ?? null) : null,
  }));

  const porTipo: Record<string, number> = {};
  for (const e of eventos) porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1;

  // Sospecha de duplicado, medida y no inferida: dos eventos del mismo tipo, sobre el mismo
  // paso_inscripcion, a menos de 10 segundos. Heuristica previa a la deduplicacion formal
  // (grupoDedupId en cada evento) -- se conserva porque sigue sirviendo de diagnostico rapido
  // con una ventana mas ancha (10s) que la de agruparDuplicados (2s).
  const posiblesDuplicados: { idEventoA: number; idEventoB: number; tipo: string; segundos: number }[] = [];
  const porPaso = new Map<string, typeof eventos>();
  for (const e of eventos) {
    const k = `${e.idPasoInscripcion}:${e.tipo}`;
    porPaso.set(k, [...(porPaso.get(k) ?? []), e]);
  }
  for (const lista of porPaso.values()) {
    const ord = [...lista].sort((a, b) => (a.fechaEvento ?? '').localeCompare(b.fechaEvento ?? ''));
    for (let i = 1; i < ord.length; i++) {
      const t0 = Date.parse(ord[i - 1].fechaEvento ?? ord[i - 1].createdAt ?? '');
      const t1 = Date.parse(ord[i].fechaEvento ?? ord[i].createdAt ?? '');
      if (Number.isNaN(t0) || Number.isNaN(t1)) continue;
      const segundos = Math.abs(t1 - t0) / 1000;
      if (segundos <= 10) posiblesDuplicados.push({ idEventoA: ord[i - 1].idEvento, idEventoB: ord[i].idEvento, tipo: ord[i].tipo, segundos });
    }
  }

  const conHuella = eventos.filter((e) => e.userAgent != null).length;

  // Deduplicado = una fila por grupoDedupId distinto (el representante mas temprano de cada
  // grupo). Las filas de atras del mismo grupo siguen en `eventos`, solo no se cuentan dos
  // veces aca.
  const representantes = eventos.filter((e) => e.esRepresentanteGrupo);
  const porTipoDedup: Record<string, number> = {};
  for (const e of representantes) porTipoDedup[e.tipo] = (porTipoDedup[e.tipo] ?? 0) + 1;

  const conteos = {
    crudo: { total: eventos.length, porTipo, porClasificacion: contarPorClasificacion(eventos) },
    deduplicado: { total: representantes.length, porTipo: porTipoDedup, porClasificacion: contarPorClasificacion(representantes) },
  };

  // Medibilidad por envio (cruzarAperturaClic, core/cruzar-apertura-clic.ts). Se calcula sobre
  // `eventos` tal como salieron de trackingCorreo -- si el llamador filtro por `tipo`, un envio
  // puede faltarle la mitad de la evidencia (por ejemplo el clic que confirmaria la lectura), y
  // eso queda dicho en `advertencias`, no escondido. El mismo agrupamiento por envio arma el
  // input de matrizClientes mas abajo, para no leer `eventos` dos veces con dos criterios.
  const porEnvio = new Map<
    number,
    { dominio: string | null; fechaEnvio: string | null; eventosCruce: EventoParaCruce[]; eventosMatriz: EventoClasificadoParaMatriz[] }
  >();
  for (const e of eventos) {
    const prev = porEnvio.get(e.idPasoInscripcion) ?? {
      dominio: dominioDeEmail(e.email),
      fechaEnvio: e.fechaEnviada,
      eventosCruce: [] as EventoParaCruce[],
      eventosMatriz: [] as EventoClasificadoParaMatriz[],
    };
    // excluirDeMetricas (R1, trafico_prueba_interno) nunca entra al cruce de medibilidad: no es
    // trafico real de ningun tipo, ni humano ni maquina genuina, y contaminaria causaMedibilidad
    // con una causa que no ocurrio (ver matriz-clientes-correo.ts, mismo filtro en eventosValidos).
    if (!e.excluirDeMetricas) {
      prev.eventosCruce.push({
        tipo: e.tipo as EventoParaCruce['tipo'],
        clasificacion: clasificacionEfectivaParaCruce(e.tipo, e.clasificacion, e.escaner),
      });
    }
    prev.eventosMatriz.push({
      idEvento: e.idEvento,
      tipo: e.tipo as EventoClasificadoParaMatriz['tipo'],
      fechaEvento: e.fechaEvento ?? e.createdAt ?? '',
      ua: e.userAgent,
      clasificacion: e.clasificacion,
      razon: e.razon,
      excluirDeMetricas: e.excluirDeMetricas,
      grupoDedupId: e.grupoDedupId,
      esRepresentanteGrupo: e.esRepresentanteGrupo,
    });
    porEnvio.set(e.idPasoInscripcion, prev);
  }

  const medibilidadPorEnvio: {
    idPasoInscripcion: number;
    dominio: string | null;
    estado: EstadoCruce;
    lectura: Lectura;
    metodoConfirmacion: MetodoConfirmacion;
    causaMedibilidad: CausaMedibilidad;
    pixelSeDisparo: boolean;
    aperturaSubeDeRango: boolean;
    clienteNoMediblePorPixel: boolean;
    explicacion: string;
  }[] = [];
  for (const [idPasoInscripcion, info] of porEnvio) {
    const veredicto = cruzarAperturaClic(info.eventosCruce);
    medibilidadPorEnvio.push({
      idPasoInscripcion,
      dominio: info.dominio,
      estado: veredicto.estado,
      lectura: veredicto.lectura,
      metodoConfirmacion: veredicto.metodo_confirmacion,
      causaMedibilidad: veredicto.causa_medibilidad,
      pixelSeDisparo: veredicto.pixel_se_disparo,
      aperturaSubeDeRango: veredicto.apertura_sube_de_rango,
      clienteNoMediblePorPixel: veredicto.cliente_no_medible_por_pixel,
      explicacion: veredicto.explicacion,
    });
  }
  const enviosConDominio: EnvioParaAvisoProveedor[] = medibilidadPorEnvio
    .filter((e): e is typeof e & { dominio: string } => e.dominio !== null)
    .map((e) => ({ dominio: e.dominio, estado: estadoCruceComoEstadoLegado(e.estado) }));
  const avisosProveedor = dominiosConAvisoNoMedible(enviosConDominio);

  // Matriz por cliente de correo (acumularMatrizClientes, core/matriz-clientes-correo.ts): solo
  // envios con dominio resoluble (email valido) entran, mismo criterio que avisosProveedor.
  const enviosParaMatriz: EnvioParaMatriz[] = [];
  for (const [idPasoInscripcion, info] of porEnvio) {
    if (info.dominio === null) continue;
    enviosParaMatriz.push({
      idPasoInscripcion,
      dominio: info.dominio,
      fechaEnvio: info.fechaEnvio,
      eventos: info.eventosMatriz,
    });
  }
  const matrizClientes = acumularMatrizClientes(enviosParaMatriz);

  const advertencias = [
    'Deduplicado por ventana encadenada de 2000ms (mismo id_paso_inscripcion y mismo tipo, desempatado por ip cuando ' +
      'existe): grupoDedupId identifica el grupo y esRepresentanteGrupo marca la fila mas temprana de cada uno. Ninguna ' +
      'fila se borra: conteos.crudo cuenta todas, conteos.deduplicado cuenta una por grupo. posiblesDuplicados usa una ' +
      'ventana mas ancha (10s) y es un diagnostico aparte, previo a la deduplicacion formal.',
    'Cada evento trae clasificacion (humano/maquina/desconocido) con su razon y su senal (clasificarEvento). ' +
      'excluirDeMetricas es true solo para trafico de prueba interno (razon trafico_prueba_interno) y ya sale fuera de ' +
      'conteos.crudo/conteos.deduplicado.',
    'Cada evento tipo clic trae ademas `escaner` (detectarClicEscaner): probable_escaner o sin_evidencia_de_escaner, ' +
      'con senales y confianza declarada (nunca alta si dispara sola la señal de latencia o la de url reescrita; alta ' +
      'solo cuando las dos coinciden). Un clic humano probable_escaner no cuenta como prueba de lectura en ' +
      'medibilidad.porEnvio, pero su `clasificacion` (clasificarEvento) sigue viajando sin tocar en `eventos`.',
    'medibilidad.porEnvio (cruzarAperturaClic) separa por que un envio no tiene lectura confirmada por pixel: ' +
      "causaMedibilidad 'pixel_nunca_salio' es Outlook (cero eventos abierto), 'solo_apertura_de_maquina' es Gmail " +
      "(el pixel se disparo pero solo lo pidio el proxy), 'apertura_sin_huella_capturada' es un abierto sin UA " +
      "capturado. lectura='confirmada' cuando hubo apertura humana o un clic humano (aperturaSubeDeRango=true cuando " +
      "ese clic sube una apertura de maquina o sin huella a confirmada); lectura='no_se_puede_saber' NUNCA se lee " +
      "como \"no lo abrio\". medibilidad.avisosProveedor solo nombra un dominio con 3+ envios sin lectura confirmada " +
      'por clic y cero confirmados por apertura humana (umbral en CONTEO, nunca en %).',
    input.tipo
      ? `Filtraste por tipo='${input.tipo}': medibilidad.porEnvio y matrizClientes pierden evidencia (por ejemplo el ` +
        'clic que confirmaria la lectura si solo pediste abierto) porque solo ven los eventos de ese tipo. Sin filtro ' +
        'de tipo, ven abierto y clic juntos.'
      : 'userAgent e ip solo existen desde el 2026-07-28. Un evento anterior los trae en null porque no se capturaron, ' +
        'no porque hayan venido vacíos -- razon sin_huella_capturada lo marca desconocido, no maquina ni humano.',
    'medibilidad.porEnvio y matrizClientes solo incluyen envios que tienen AL MENOS UNA fila en evento_tracking: si el ' +
      'pixel de Outlook nunca se disparó ni una vez, ese envío no tiene fila que leer y sencillamente no aparece acá ' +
      '(no genera un estado explícito). Para saber qué se envió y comparar contra lo que sí generó algún evento, cruza ' +
      'con estado_envio_correo o campana_completa.',
    'pasoOrden puede estar mal atribuido. resolverDestinatarioPorEmail acredita el evento al paso_inscripcion ' +
      "'enviada' MÁS RECIENTE de esa campaña y ese email, no al correo que de verdad se abrió: en una cadencia de " +
      'varios pasos, una apertura del correo 1 se le acredita al último enviado. Muerde desde el paso 2. Fuera de alcance.',
    'No hay tasa de apertura en ningún %, en ningún campo, ni en medibilidad ni en matrizClientes. R5 (Apple Private ' +
      'Relay) existe documentada pero está inerte: el chequeo contra el CSV vivo de Apple no está construido, así que ' +
      'ipEnRangoApplePrivateRelay siempre viaja null y esos casos caen en R7/R8. `escaner` NUNCA afirma que un clic ES ' +
      'de un escáner (solo "probable", con confianza declarada): no hay UA público de ningún vendor, la señal de ip de ' +
      'datacenter no está implementada, y el umbral de latencia (30s) es provisional, sin calibrar con datos propios.',
    'matrizClientes agrupa por (dominio del destinatario x superficie de comportamiento observada), no por "cliente de ' +
      'correo" literal: no hay dato en la huella que diga qué software leyó el correo. Cada celda trae origen ' +
      "'inferida_fuente_externa' (lo que dice matrizSemilla, investigación externa citada con su fuente) o " +
      "'medida_datos_propios' (30+ envíos propios en esa celda exacta). divergencia solo se llena cuando el patrón " +
      'observado contradice una expectativa dura de la semilla (hoy solo Gmail), y no espera el umbral para reportarse.',
    'Solo canal correo. Las aperturas de conversación de WhatsApp son otra cosa y viven en aperturas_whatsapp.',
  ];

  return {
    total: eventos.length,
    porTipo,
    conHuella,
    sinHuella: eventos.length - conHuella,
    posiblesDuplicados,
    conteos,
    medibilidad: { porEnvio: medibilidadPorEnvio, avisosProveedor },
    matrizClientes,
    matrizSemilla: MATRIZ_SEMILLA,
    umbralNEnviosCeldaMatriz: UMBRAL_N_ENVIOS_CELDA,
    eventos,
    advertencias,
  };
}

export type EnviosProgramadosInput = { fecha: string; canal?: string };

export function enviosProgramadosTool(input: EnviosProgramadosInput) {
  const envios = enviosProgramadosDelDia(input.fecha, input.canal);
  const listos = envios.filter((e) => e.listo);

  return {
    fecha: input.fecha,
    canal: input.canal ?? null,
    total: envios.length,
    // El corte que importa a las 8:30: cuantas quedaron listas y cuantas siguen esperando
    // revision. Las que faltan NO van a salir, y por eso se cuentan aparte en vez de sumarse.
    totalListos: listos.length,
    totalSinAprobar: envios.length - listos.length,
    truncado: false,
    envios,
  };
}

// --- empujar_envios -------------------------------------------------------------------
//
// "Esto que ya está inscrito y pendiente, mandalo AHORA." El movimiento que faltaba, y faltaba
// justo en el camino que el operador usa de verdad.
//
// EL BUG QUE CIERRA (medido en producción el 2026-07-28, campaña 58). Había dos caminos para
// inscribir y se pisaban en silencio:
//   - lanzar_campana inscribe el segmento entero y empuja en modo manual, saltándose la ventana
//     de 8:00-18:00. Exige estado 'borrador'.
//   - cambiar_cadencia inscribe UNA empresa, y al hacerlo pone la campaña en 'activa'
//     (inscribirEmpresaEnCadencia lo hace siempre, no es opcional).
// O sea que inscribir cuenta por cuenta -- que es lo que toca cuando el segmento devuelve cero, o
// cuando se quiere apuntar a dos cuentas y no a un segmento -- mataba para siempre el empujón
// manual, y nada lo avisaba antes de elegir el camino. El operador quedaba obligado a esperar la
// ventana del día siguiente.
//
// POR QUÉ UNA TOOL NUEVA Y NO UN FLAG EN lanzar_campana. lanzar_campana hace cinco cosas que sólo
// tienen sentido la primera vez: fija el owner, persiste la config de goteo, inscribe el segmento,
// arma Gmail y empuja. Las cuatro primeras no aplican a una campaña que ya está corriendo, así que
// un `permitirActiva: true` haría que el mismo nombre hiciera dos cosas distintas según un
// booleano. Y el default peligroso es distinto: lanzar_campana confirmada le manda a un segmento
// que se calcula en el momento; ésta le manda a una lista que se puede leer entera antes.
//
// LO QUE ESTA TOOL NO HACE, y es lo que la vuelve usable para dos cuentas sueltas: NO barre.
// lanzar_campana empuja con materializarYEmpujarAhora, que materializa la base entera y manda todo
// lo pendiente de todas las campañas activas (por eso tiene que cantar `colateral`). Acá el blanco
// lo pone quien llama y lo que no está en la lista de ids no se toca: el colateral es cero por
// construcción, y `noIncluidos` dice qué quedó afuera para que eso sea verificable y no una
// promesa.
//
// LOS TRES GATES QUE SIGUEN VIVOS: revisión humana de WhatsApp (aprobado_en), es_manual del paso,
// y el tope diario de Gmail. Esta tool se salta la HORA, y nada más.

export type EmpujarEnviosInput = {
  idCampana?: number;
  idsInscripcion?: number[];
  idsEmpresa?: string[];
  adelantar?: boolean;
  confirmar?: boolean;
};

export type EmpujarEnviosDeps = {
  // El push real vive en el worker y habla con Gmail/Evolution. Inyectable para poder probar el
  // proveedor caído sin proveedor, y por import dinámico para que el resto del MCP no arrastre
  // los adaptadores sólo por importar este archivo (mismo criterio que lanzar_campana).
  empujar: (ids: number[]) => Promise<void>;
};

const DEPS_EMPUJAR_DEFAULT: EmpujarEnviosDeps = {
  empujar: async (ids) => {
    const { empujarPasosAhora } = await import('../worker/empujon-manual');
    await empujarPasosAhora(ids);
  },
};

export type PasoEmpujable = {
  idPasoInscripcion: number;
  idCampana: number;
  campana: string | null;
  idInscripcion: number;
  idEmpresa: string;
  empresa: string | null;
  contacto: string | null;
  destino: string | null;
  canal: string;
  orden: number;
  estado: string;
  intentos: number;
  fechaProgramada: string | null;
  saldra: boolean;
  motivos: string[];
};

export type EmpujarEnviosResultado = {
  confirmado: boolean;
  blanco: SelectorEmpujon;
  ahora: string;
  // Las inscripciones que el blanco alcanza, con cuántos pasos tienen materializados. Una con
  // pasosMaterializados en 0 es gente inscrita que no aparece en `pasos` porque su fila todavía
  // no existe: sin esta lista, el seco diría "no hay nada que empujar" y sería falso.
  inscripciones: ReturnType<typeof inscripcionesEmpujables>;
  // Todo lo que el blanco toca, salga o no. El que no sale trae su motivo: eso es lo que no
  // existía en ningún lado, porque el descarte de la cola es un `continue` sin rastro.
  pasos: PasoEmpujable[];
  saldrian: number;
  // Lo que otro empujón (el del worker, o lanzar_campana) sacaría y éste NO va a tocar.
  noIncluidos: { idPasoInscripcion: number; idCampana: number; empresa: string | null; canal: string; destino: string | null }[];
  esperandoRevisionHumana: { idPasoInscripcion: number; canal: string; empresa: string | null; motivo: string }[];
  advertencias: string[];
  adelanto: ResultadoAdelanto | null;
  // Releído de la base DESPUÉS del push.
  estadoTrasEmpujar: PasoEmpujable[];
  salieron: { idPasoInscripcion: number; empresa: string | null; canal: string; proveedor: string | null; proveedorMensajeId: string | null; fechaEnviada: string | null }[];
  problemas: string[];
  logDelPush: string[];
  nota: string;
};

function aPasoEmpujable(c: CandidatoEmpujon, elegibles: Set<number>, ahora: string): PasoEmpujable {
  const saldra = elegibles.has(c.idPasoInscripcion);
  const motivos = saldra ? [] : motivosNoSale(c, ahora, MAX_INTENTOS);
  return {
    idPasoInscripcion: c.idPasoInscripcion,
    idCampana: c.idCampana,
    campana: c.campana,
    idInscripcion: c.idInscripcion,
    idEmpresa: c.idEmpresa,
    empresa: c.empresa,
    contacto: c.contacto,
    destino: c.canal === 'correo' ? c.email : c.canal === 'whatsapp' ? c.telefono : null,
    canal: c.canal,
    orden: c.orden,
    estado: c.estadoPaso,
    intentos: c.intentos,
    fechaProgramada: c.fechaProgramada,
    saldra,
    // Si la cola real dice que no sale y el diagnóstico no encuentra motivo, se dice eso. Inventar
    // una explicación manda a buscar donde no está, que es el error que esta tool viene a cerrar.
    motivos: saldra
      ? []
      : motivos.length > 0
        ? motivos
        : ['la cola real no lo toma y el diagnóstico no encontró la razón: hay que mirar pasoInscripcionesPendientes a mano para este id'],
  };
}

// Los ids que la cola REAL toma, dentro de un set dado. Es la fuente de verdad de "sale o no
// sale"; motivosNoSale sólo explica el no. Dos implementaciones de la misma regla se
// desincronizan, así que la que decide es una sola y es la del worker.
function elegiblesDe(ids: number[], ahora: string): Set<number> {
  const elegibles = new Set<number>();
  for (const canal of ['correo', 'whatsapp'] as Canal[]) {
    for (const f of pasoInscripcionesPendientesDe(canal, ids, ahora)) elegibles.add(f.idPasoInscripcion);
  }
  return elegibles;
}

export async function empujarEnviosTool(
  input: EmpujarEnviosInput,
  idOrganizacion: number,
  deps: EmpujarEnviosDeps = DEPS_EMPUJAR_DEFAULT,
): Promise<EmpujarEnviosResultado> {
  const blanco: SelectorEmpujon = {
    ...(input.idCampana !== undefined ? { idCampana: input.idCampana } : {}),
    ...(input.idsInscripcion !== undefined && input.idsInscripcion.length > 0 ? { idsInscripcion: input.idsInscripcion } : {}),
    ...(input.idsEmpresa !== undefined && input.idsEmpresa.length > 0 ? { idsEmpresa: input.idsEmpresa } : {}),
  };
  // Sin blanco no se empuja. NO existe un modo "todo lo pendiente", a propósito: un empujón sin
  // blanco es la forma de mandarle a gente que nadie miró, y eso no se deshace.
  if (selectorVacio(blanco)) {
    throw new Error(
      'empujar_envios: hace falta decir QUÉ se empuja (idCampana, idsInscripcion o idsEmpresa). No existe un modo "todo lo pendiente": un empujón sin blanco es la forma de mandarle a alguien que nadie miró.',
    );
  }

  const inscripciones = inscripcionesEmpujables(blanco, idOrganizacion);
  if (inscripciones.length === 0) {
    // "El blanco no existe" y "no hay nada pendiente" son dos diagnósticos distintos, y
    // confundirlos manda a buscar el problema donde no está. Se separan acá, no en un mensaje.
    throw new Error(
      `empujar_envios: el blanco no alcanza ninguna inscripción en la organización ${idOrganizacion} (${JSON.stringify(blanco)}). No es que no haya nada pendiente: es que no hay nadie inscrito ahí.`,
    );
  }

  const ahoraPreview = new Date().toISOString();
  const candidatosPreview = candidatosEmpujon(blanco, idOrganizacion);
  const elegiblesPreview = elegiblesDe(candidatosPreview.map((c) => c.idPasoInscripcion), ahoraPreview);
  const pasosPreview = candidatosPreview.map((c) => aPasoEmpujable(c, elegiblesPreview, ahoraPreview));

  const advertencias: string[] = [
    'el empujón corre en modo manual: NO respeta la ventana de 8:00-18:00 Bogotá ni el espaciado de 45-90s del worker. Lo que se empuje a las 11pm sale a las 11pm.',
    'acotado al blanco: no materializa ni empuja nada de otras campañas. Lo que otro empujón sí sacaría viaja en noIncluidos.',
  ];

  const programadosAdelante = pasosPreview.filter((p) => !p.saldra && p.fechaProgramada !== null && p.fechaProgramada > ahoraPreview);
  const sinMaterializar = inscripciones.filter((i) => i.estadoInscripcion === 'activa' && i.estadoCampana === 'activa' && i.pasosVivos === 0 && i.pasosCadencia > 0);
  if (input.adelantar !== true) {
    if (programadosAdelante.length > 0) {
      advertencias.push(
        `${programadosAdelante.length} paso(s) están programados para más adelante y por eso no saldrían. Con adelantar: true se les baja la fecha a ahora y salen en este mismo empujón.`,
      );
    }
    if (sinMaterializar.length > 0) {
      advertencias.push(
        `${sinMaterializar.length} inscripción(es) activas no tienen ningún paso vivo materializado (${sinMaterializar.map((i) => i.idInscripcion).join(', ')}): el calendario todavía no las dio por debidas. Con adelantar: true se materializa el paso que les toca con fecha de ahora y sale en este empujón.`,
      );
    }
  }

  const esperandoRevisionHumana = pasosPreview
    .filter((p) => !p.saldra && p.motivos.some((m) => m.includes('revisión humana')))
    .map((p) => ({ idPasoInscripcion: p.idPasoInscripcion, canal: p.canal, empresa: p.empresa, motivo: p.motivos.find((m) => m.includes('revisión humana'))! }));
  if (esperandoRevisionHumana.length > 0) {
    advertencias.push(
      `${esperandoRevisionHumana.length} paso(s) esperan revisión humana y este empujón NO se salta ese gate: se aprueban uno por uno con programar_envios.`,
    );
  }

  // Lo que la cola global sí tomaría y este empujón deja afuera. Es la contraparte honesta del
  // `colateral` de lanzar_campana: allá el número es lo que sale de más, acá es lo que NO sale.
  const idsBlanco = new Set(candidatosPreview.map((c) => c.idPasoInscripcion));
  const todos = candidatosEmpujon({}, idOrganizacion);
  const elegiblesGlobal = elegiblesDe(todos.map((c) => c.idPasoInscripcion), ahoraPreview);
  const noIncluidos = todos
    .filter((c) => !idsBlanco.has(c.idPasoInscripcion) && elegiblesGlobal.has(c.idPasoInscripcion))
    .map((c) => ({
      idPasoInscripcion: c.idPasoInscripcion,
      idCampana: c.idCampana,
      empresa: c.empresa,
      canal: c.canal,
      destino: c.canal === 'correo' ? c.email : c.telefono,
    }));

  const base = {
    blanco,
    inscripciones,
    pasos: pasosPreview,
    saldrian: pasosPreview.filter((p) => p.saldra).length,
    noIncluidos,
    esperandoRevisionHumana,
    advertencias,
  };

  if (input.confirmar !== true) {
    return {
      ...base,
      confirmado: false,
      ahora: ahoraPreview,
      adelanto: null,
      estadoTrasEmpujar: [],
      salieron: [],
      problemas: [],
      logDelPush: [],
      nota:
        input.adelantar === true
          ? 'En seco: no se escribió ni se mandó nada. Con confirmar: true se adelanta lo que haga falta y sale.'
          : 'En seco: no se escribió ni se mandó nada. Con confirmar: true sale lo que aparece con saldra: true.',
    };
  }

  const ahora = new Date().toISOString();
  const adelanto = input.adelantar === true ? adelantarEnvios(blanco, idOrganizacion, ahora) : null;

  // Se releen los candidatos DESPUÉS del adelanto: el paso que se acaba de materializar no existía
  // cuando se armó el preview, y es justo el que hay que empujar.
  const candidatos = candidatosEmpujon(blanco, idOrganizacion);
  const idsCampana = new Set<number>(candidatos.map((c) => c.idCampana));
  for (const i of inscripciones) idsCampana.add(i.idCampana);
  const elegibles = elegiblesDe(candidatos.map((c) => c.idPasoInscripcion), ahora);
  const aEmpujar = [...elegibles];

  // push.ts se traga el fallo del proveedor con un console.error y deja la fila en 'fallo'. Sin
  // copiar esa línea el único "por qué" se pierde. Se COPIA, no se silencia: sigue imprimiéndose.
  const logDelPush: string[] = [];
  const errorOriginal = console.error;
  console.error = (...args: unknown[]) => {
    logDelPush.push(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    errorOriginal(...args);
  };
  try {
    if (aEmpujar.length > 0) await deps.empujar(aEmpujar);
  } finally {
    console.error = errorOriginal;
  }

  // Relectura: lo que quedó escrito, no el eco de lo que se pidió.
  const trasEmpujar = candidatosEmpujon(blanco, idOrganizacion);
  const idsIntentados = new Set(aEmpujar);
  const estadoTrasEmpujar = trasEmpujar.map((c) => aPasoEmpujable(c, elegiblesDe(trasEmpujar.map((x) => x.idPasoInscripcion), ahora), ahora));
  const salieron = leerSalidas([...idsCampana], idOrganizacion, idsIntentados);

  // Un paso que se intentó empujar y sigue vivo (pendiente/fallo/enviando) NO salió. Se reporta
  // como problema aunque el resto haya salido: un empujón parcial devuelto como éxito es la forma
  // de creer que un correo se mandó cuando no.
  const problemas = trasEmpujar
    .filter((c) => idsIntentados.has(c.idPasoInscripcion))
    .map((c) => `paso_inscripcion ${c.idPasoInscripcion} (${c.canal}, ${c.empresa ?? c.idEmpresa}) quedó en '${c.estadoPaso}' con ${c.intentos} intento(s): no salió`);

  const resultado: EmpujarEnviosResultado = {
    ...base,
    confirmado: true,
    ahora,
    adelanto,
    estadoTrasEmpujar,
    salieron,
    problemas,
    logDelPush,
    nota:
      aEmpujar.length === 0
        ? 'No había ni un paso elegible: no se mandó nada. El motivo de cada uno está en pasos[].motivos.'
        : `Se intentaron ${aEmpujar.length} paso(s) y salieron ${salieron.length}. Los que salieron son los que quedaron 'enviada' con proveedorMensajeId; los demás no.`,
  };

  // Falla ruidosa, con el estado releído adentro del error: la escritura ya ocurrió.
  if (problemas.length > 0) {
    throw new Error(
      `empujar_envios: ${problemas.length} paso(s) no salieron. ${problemas.join(' | ')}` +
        `${logDelPush.length > 0 ? ` || log del push: ${logDelPush.join(' ; ')}` : ''}\n` +
        JSON.stringify(resultado, null, 2),
    );
  }

  return resultado;
}

// El acuse del proveedor, releído. candidatosEmpujon no lo puede dar porque sólo lista lo que
// TODAVÍA puede salir (una fila 'enviada' ya no es candidata de nada): la prueba de que salió hay
// que ir a buscarla al estado de la campaña.
function leerSalidas(idsCampana: number[], idOrganizacion: number, ids: Set<number>): EmpujarEnviosResultado['salieron'] {
  if (ids.size === 0) return [];
  const salidas: EmpujarEnviosResultado['salieron'] = [];
  for (const idCampana of idsCampana) {
    const estado = estadoLanzamientoCampana(idCampana, idOrganizacion);
    if (!estado) continue;
    for (const p of estado.pasos) {
      if (!ids.has(p.idPasoInscripcion) || p.estado !== 'enviada') continue;
      salidas.push({
        idPasoInscripcion: p.idPasoInscripcion,
        empresa: p.empresa,
        canal: p.canal,
        proveedor: p.proveedor,
        proveedorMensajeId: p.proveedorMensajeId,
        fechaEnviada: p.fechaEnviada,
      });
    }
  }
  return salidas;
}
