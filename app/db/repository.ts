import { estadosDeCanales } from './canal-estado.ts';
import type { CuentaParaTanda } from '../core/tandas.ts';
import type { ToqueParaAgotamiento } from '../core/agotamiento.ts';
import {
  and,
  or,
  eq,
  ne,
  lte,
  gt,
  lt,
  isNotNull,
  isNull,
  inArray,
  notInArray,
  between,
  exists,
  notExists,
  asc,
  desc,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
// dbReal ademas de db: organizacion_miembro es IDENTIDAD y NO conmuta con el modo prueba
// (spec: "identidad siempre real, negocio conmutable"). Este archivo conmuta entero, asi que
// las pocas lecturas de identidad que viven aca piden dbReal explicito -- ver
// identidad-en-prueba.test.ts para el bug que causo trazar la frontera por archivo y no por
// tabla. El resto del archivo sigue usando `db` (el Proxy) sin cambios.
import { db, dbReal } from './index';
import {
  empresa,
  contacto,
  empresaUsuarios,
  toque,
  syncCambios,
  conector,
  conectorConfig,
  configuracionAdmin,
  empresaAlias,
  outbox,
  cadencia,
  pasoCadencia,
  versionPaso,
  segmento,
  segmentoExclusion,
  campana,
  inscripcion,
  destinatario,
  pasoInscripcion,
  eventoTracking,
  notificacionRespuesta,
  mensajeWhatsapp,
  lineaWhatsapp,
  empresaEstadoHistorial,
  empresaEstadoSnapshot,
  seguimientoAplazado,
  toquePlaneado,
  organizacionMiembro,
  empresaClasificacion,
  empresaCategoriaView,
  identidadDecision,
  plan,
  prospeccion,
} from './schema';
import type { OrigenFin } from '../core/reinscripcion';
import type { CambioNotion } from '../core/ports/sync';
import type { FilaOutbox } from '../core/outbox';
import type { CadenciaParseada } from '../core/cadencia-parser';
import { previsualizarInscripcion, type PasoRequerido, type PasoAjustado, type EstadoPreviewInscripcion } from '../core/preview-inscripcion';
import { calcularGoteo, type RitmoIngreso } from '../core/goteo';
import { proximoPasoDebido, type ConfigCalendario } from '../core/motor-cadencia';
import { MAX_INTENTOS, type FilaPasoInscripcion } from '../core/push';
import { renderizarCopy } from '../core/render-copy';
import type { CampanaConSecuencia, DestinatarioResuelto } from '../core/tracking';
import {
  normalizarTelefono,
  type MensajeEntrante,
  type MensajeSaliente,
  type ContactoMatch,
  type InscripcionActiva,
} from '../core/llego-respuesta';
import type { EventoProveedor, PasoParaSincronizar, PasoSincronizado } from '../core/ports/envio';
import { restarUnDia } from '../core/actividad';
import { normalizarFechaToque } from '../core/fecha-toque';
import { estadoDestinoPorToque, ESTADO_ON_HOLD } from '../core/transicion-estado';
import { canalesDisponibles, readinessEmpresa, type Readiness, type ReglaFaltante } from '../core/canales-empresa';
import { aplicaBuclePBX, estaEnPBX, sugerirEscalar, type ContactoPBX, type PasoPropuesto } from '../core/pbx';
import { calcularDuracionPorEtapa, calcularCicloVenta, type TransicionEtapa } from '../core/tiempoEnEtapa';
import type { EmpresaFunnelInput } from '../core/panel/conversionStage';
import { calcularMrrEstimado, digitalPctConDefault } from '../core/mrr';
import { contarToquesAntesDeFecha } from '../core/panel/toquesAntesCerrar';
import { clasificarEvento, type Clasificacion, type Razon, type Confianza } from '../core/clasificar-evento-tracking';
import { agruparDuplicados, type EventoParaDedup } from '../core/dedup-eventos-tracking';
import { cifrar, descifrar } from '../lib/crypto';
import { fechaBogotaISO, sumarDias, diaSemana, diaBogotaDeGuardado } from '../lib/date-utils';
import type { SesionTranscript } from '../core/ports/transcript';
import { ESTADOS_CALIENTES, ESTADOS_ACTIVOS } from './funnel';
import type { CampoCalificacion } from '../core/calificacion';
import { CLAVE_SIN_ETAPA, type ConteoEtapa } from '../core/embudo';
import { clasificarCargo } from '../core/reconciliacion/clasificarCargo';
import { esKdmDesdeNotion } from '../core/reconciliacion/kdmNotion';
import { normalizarRazonSocial } from '../core/reconciliacion/normalizarRazonSocial';
import { scoreRazonSocial, UMBRAL_MINIMO_CANDIDATO } from '../core/reconciliacion/matcherGemelos';
import { ESTADOS_NOTION } from '../core/reconciliacion/mapeoEstados';
import {
  CATEGORIAS_EMPRESA,
  CATEGORIAS_ESCRIBIBLES,
  ESTADO_COMERCIAL_POR_ETAPA,
  dominioDe,
  esNitValido,
  esIdSintetico,
  idEmpresaSintetico,
  telefonoNormalizado,
} from '../core/empresa-identidad';
import {
  planReconciliacion,
  type PaginaNotion,
  type PlanReconciliacion,
} from '../core/reconciliacion/planReconciliacion';
import type { AccionImportacionToque, ToqueDbExistente } from '../core/reconciliacion/toquesNotion';
import {
  registrarToqueSchema,
  type RegistrarToqueInput,
  editarToqueSchema,
  type EditarToqueInput,
  invariantesToque,
  planearDiaSchema,
  type PlanearDiaInput,
  marcarNoEjecutadoSchema,
  type MarcarNoEjecutadoInput,
  cadenciaParseadaSchema,
  definicionSegmentoSchema,
  type DefinicionSegmento,
  type CampoSegmento,
  type CampoSegmentoNumerico,
  versionPasoInputSchema,
  type VersionPasoInput,
  campanaInputSchema,
  type CampanaInput,
  MODOS_CAMPANA,
  type ModoCampana,
  CANALES,
  CANALES_TOQUE,
  RESULTADOS,
  RESULTADO_LABELS,
  MOTIVOS_APLAZO,
  RAZONES_PERDIDA,
  RAZON_PERDIDA_LABELS,
  OBJECIONES,
  ACCIONES_CLIENTE,
  TIPOS_TOQUE,
  ALIADOS,
  ALIADOS_CONFIRMADOS,
  MOTIVOS_DESCARTE,
  FUENTES_LEAD,
  type FuenteLead,
  MOTIVO_DESCARTE_CON_RETORNO,
  type MotivoDescarte,
  ADVERTENCIA_SIN_VERIFICAR,
  type Aliado,
  EJECUTOR_POR_DEFECTO,
  fechaDiaSchema,
  type Canal,
  type CanalToque,
  type Resultado,
  type OrigenTransicion,
  RITMOS_INGRESO,
  type RitmoIngresoInput,
  REGLAS_FALTANTE,
  type ReglaFaltanteInput,
  validarCanalAutomatico,
  CANALES_AUTOMATICOS,
} from './validation';

// Único punto de acceso a datos. El resto de la app no toca SQL ni la DB directo.

// Tipo de la transaccion en curso (lo que drizzle pasa dentro de db.transaction()),
// distinto del tipo de `db`: usarlo explicito evita que un insert "se escape" a una
// conexion fuera de la transaccion del caller.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// V3.7: encola un cambio a Notion DENTRO de la misma transaccion que lo origino
// (patron outbox: si el proceso muere entre "cambie la DB" y "avise a Notion", el
// aviso no se pierde, esta en la misma transaccion o no esta ninguno de los dos).
// Compuerta del ENCOLADO hacia Notion (2026-07-26), apagada por default. Distinta de
// OUTBOX_NOTION_ENABLED, que ya existe y apaga el DRENADO en el worker: apagar solo el
// drenado deja la cola creciendo con filas que nadie va a entregar (19 en dos dias), y esa
// cola vieja es peor que no tener ninguna, porque el dia que se encienda el drenado sale de
// golpe un lote de cambios viejos como si fueran de hoy.
//
// Apagado no quita el camino: registrarToque, marcarPerdida, cambiarCadencia y
// aplazarSeguimiento siguen llamando aca igual, y lo unico que cambia es que no se escribe la
// fila. Encender es una sola clave, sin desplegar nada, porque el dia que alguien del equipo
// use la herramienta el encolado tiene que volver sin tocar codigo.
//
// Vive en configuracion_admin y no en una variable de entorno, a diferencia del gate del
// worker: el encolado ocurre en el proceso web Y en el MCP, y una variable habria que ponerla
// en los dos y acordarse de los dos. La clave esta en la base, que es una sola.
//
// Se lee con `tx` y no con `db`: estamos dentro de la transaccion del cambio, y leer la
// compuerta por fuera de ella es abrir la puerta a decidir con un valor de otro instante.
// Ausente, vacia o cualquier otro valor es APAGADO. Solo 'true' o '1' encienden.
export const CLAVE_ENCOLADO_NOTION = 'outbox_notion_encolado';

function encoladoNotionHabilitado(tx: Tx): boolean {
  const fila = tx
    .select({ valor: configuracionAdmin.valor })
    .from(configuracionAdmin)
    .where(eq(configuracionAdmin.clave, CLAVE_ENCOLADO_NOTION))
    .get();
  const valor = (fila?.valor ?? '').trim().toLowerCase();
  return valor === 'true' || valor === '1';
}

function encolarOutboxNotion(tx: Tx, idEmpresa: string, cambio: Omit<CambioNotion, 'notionPageId'>) {
  if (!encoladoNotionHabilitado(tx)) return; // compuerta apagada: el cambio queda en la base y no viaja
  const emp = tx.select({ notionPageId: empresa.notionPageId }).from(empresa).where(eq(empresa.idEmpresa, idEmpresa)).get();
  if (!emp?.notionPageId) return; // sin pagina de Notion enlazada todavia, nada que sincronizar

  const payload: CambioNotion = { notionPageId: emp.notionPageId, ...cambio };
  tx.insert(outbox)
    .values({
      entidad: 'empresa',
      idRegistro: idEmpresa,
      payload: JSON.stringify(payload),
      estado: 'aprobado',
      intentos: 0,
      createdAt: new Date().toISOString(),
    })
    .run();
}

// Nombres de canal legibles para el render de "Toques" (Tarea 6). CANALES en validation.ts
// vive en minuscula porque es un valor de dominio (enum de Zod), esto es solo texto de
// presentacion para Notion, no se reusa como valor de negocio en otro lado.
const CANAL_LEGIBLE: Record<CanalToque, string> = {
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  correo: 'Correo',
  reunion: 'Reunión',
};

// Tarea 6: arma la tabla en texto plano de "toques hechos" que se manda a Notion (una
// linea por toque, mas reciente primero). RESULTADO_LABELS ya es el mapeo compartido con
// la UI (page.tsx), reusarlo aqui evita un segundo lugar con el mismo texto duplicado.
function renderToquesHechos(filas: { fecha: string | null; canal: string | null; resultado: string | null }[]): string {
  return filas
    .map((f) => {
      const fecha = f.fecha ? f.fecha.slice(0, 10) : '?';
      const canal = f.canal && f.canal in CANAL_LEGIBLE ? CANAL_LEGIBLE[f.canal as CanalToque] : (f.canal ?? '?');
      const resultado = f.resultado && f.resultado in RESULTADO_LABELS ? RESULTADO_LABELS[f.resultado as Resultado] : (f.resultado ?? '?');
      return `${fecha} · ${canal} · ${resultado}`;
    })
    .join('\n');
}

// Calor de la cuenta (prioridad): lo más cerca del cierre, primero.
const calorDesc = sql`(CASE ${empresa.estadoNotion}
  WHEN 'cierre_documentacion' THEN 5
  WHEN 'enviar_contrato' THEN 5
  WHEN 'reunion_agendada' THEN 4
  WHEN 'oportunidad' THEN 4
  WHEN 'contacto_iniciado' THEN 2
  WHEN 'on_hold' THEN 0
  ELSE 1 END) DESC`;

// Columnas compartidas por las variantes de la cola (colaDelDia, colaLeads, colaCierres,
// colaReagendar): mismo shape de fila en las cuatro, solo cambia el WHERE.
const columnasCola = {
  id: empresa.idEmpresa,
  empresa: empresa.nombreOficial,
  ciudad: empresa.ciudadPrincipal,
  estado: empresa.estadoNotion,
  crm: empresa.crmSoftware,
  pasarela: empresa.pasarelaActual,
  proximoPaso: empresa.proximoPaso,
  canal: empresa.proximoCanal,
  fecha: empresa.proximoFollowUpFecha,
  contacto: contacto.nombre,
  cargo: contacto.cargo,
  usuarios: empresaUsuarios.usuariosEfectivos,
  // Bucle PBX (Fase 5): no-null = la fila viene del bucle de enriquecimiento del
  // decisor, la cola le pone un badge en vez de tratarla como cadencia comercial.
  pbxForma: empresa.pbxForma,
};

// Shape de columnasCola + el nombre de la campana activa (si la hay). Solo lo usan
// colaLeads/colaCierres/colaReagendar (parte del split, 2026-07-14) -- colaDelDia sigue
// con columnasCola tal cual, sin este JOIN extra.
const columnasColaConCampana = {
  ...columnasCola,
  campana: campana.nombre,
};

// Deriva si el ULTIMO toque de una empresa fue "no_llego" (no-show de reunion), sin
// columna nueva -- mismo principio que el resto del split (fase derivada, nunca un flag
// que se pueda desincronizar). El COALESCE importa: una empresa sin ningun toque da NULL
// en la subquery, y "NULL = 'no_llego'" es NULL (ni true ni false) -- sin el COALESCE, un
// NOT(...) sobre eso la excluiria de colaCierres por error.
const ultimoResultadoNoLlego = sql`COALESCE((SELECT ${toque.resultado} FROM ${toque} WHERE ${toque.idEmpresa} = ${empresa.idEmpresa} ORDER BY ${toque.idToque} DESC LIMIT 1), '') = 'no_llego'`;

// Cola del día de un owner DENTRO de una organización: vencidos o para hoy, ordenados
// por calor y luego antigüedad. idOrganizacion viene de la sesión (Parte 1, multi-org):
// un lead compartido solo aparece en la cola de quien lo tiene activo ahora mismo.
// owner opcional (2026-07-14, modo visitante): con owner filtra la cola de ese owner;
// sin owner (undefined) trae la cola de TODA la organizacion (todos los owners), que es
// lo que ve un visitante. Mismo patron que contarPorEstado.
// Predicado transversal (A, 2026-07-15): una empresa "viva" es la que NO fue absorbida
// por una fusion de duplicados. fundirEmpresas (T4) marca la absorbida con
// opera_bajo_id apuntando al sobreviviente en vez de borrarla, a proposito: preserva la
// auditoria y los alias. Pero para TODA vista de la app esa fila es una identidad
// muerta -- duplica al sobreviviente con el mismo nombre y estado, pero sin contactos ni
// toques (T4 ya los movio). Cualquier query que liste o cuente empresas debe incluir
// este predicado; no hacerlo fue el bug de 'Global IP' duplicado.
const EMPRESA_VIVA = isNull(empresa.operaBajoId);

// EN_PIPELINE (Task 7, plan 2026-07-15-embudo-real-y-registro): una empresa esta en el
// pipeline si de verdad se trabajo -- llego por Notion (notion_page_id) o tiene al menos
// un toque. Sin esto, 44 cuentas con estado_notion pero CERO toques y fuera de Notion
// (su estado viene del seed del 30-jun, no de trabajo real) inflaban el embudo: 95
// firma_pago en vez de 80, 34 contacto_iniciado en vez de 15. Al primer toque entran
// solas (el EXISTS se vuelve true), sin backfill manual.
const EN_PIPELINE = sql`(${empresa.notionPageId} IS NOT NULL OR EXISTS (SELECT 1 FROM ${toque} WHERE ${toque.idEmpresa} = ${empresa.idEmpresa}))`;

export function colaDelDia(hoy: string, owner: string | undefined, idOrganizacion: number) {
  const condiciones = [
    eq(empresa.organizacionActivaId, idOrganizacion),
    EMPRESA_VIVA,
    isNotNull(empresa.proximoFollowUpFecha),
    lte(empresa.proximoFollowUpFecha, hoy),
    // Estados que NO son trabajo del dia: on_hold (durmiente, "dijeron que no"), firma_pago
    // (ya cliente) y lead. El COALESCE(...,'') importa: estado_notion puede ser NULL, y
    // "NULL NOT IN (...)" es NULL (ni true) en SQL -- sin el, una empresa con estado null
    // quedaria excluida por error.
    //
    // 'lead' entro aca el 2026-07-15 (regla de Sebastian): un lead es un contacto DORMIDO,
    // exactamente como on_hold. Que tenga toques previos no lo despierta -- un on_hold
    // reactivado tambien los tiene y tampoco cuenta. Un lead solo es trabajo cuando esta en
    // una secuencia, y ahi sale por el bucket de cadencias (agendaHoyCadencias), que es su
    // superficie propia; o cuando avanza a contacto_iniciado, y ahi ya no es lead.
    //
    // Nadie lo habia notado porque un bug lo tapaba: hasta el fix de fechas (c9dc96d) los
    // leads traian la fecha en formato humano de Notion ('June 12, 2026') y lte() compara
    // TEXTO -- 'J' > '2' en ASCII, asi que jamas entraban. Al normalizarlas se destaparon.
    sql`COALESCE(${empresa.estadoNotion}, '') NOT IN ('on_hold', 'firma_pago', 'lead')`,
  ];
  if (owner) condiciones.push(eq(empresa.owner, owner));
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(and(...condiciones))
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();
}

// Bucket "Leads" del split de cola (2026-07-14): estado_notion = 'lead', vencido o de hoy,
// del owner pedido. owner es obligatorio: esta variante solo la usa la UI para un owner
// puntual.
//
// REGLA (Sebastian, 2026-07-15): 'lead' NO es un estado activo. Ademas de la fecha, exige
// una inscripcion ACTIVA -- un lead entra a Toques solo si esta en una secuencia.
//
// La fecha sola no alcanza y eso es el corazon del asunto: proximo_follow_up_fecha se llena
// desde el seed de Notion y desde enriquecerDesdeNotion, no solo desde trabajo real, asi que
// "tiene fecha vencida" no significa "la estoy trabajando". De los 15 leads que le salian a
// Sebastian, 13 solo tenian historial importado de Notion y CERO trabajo hecho en la
// herramienta.
//
// Esta regla no existia y nadie lo noto porque un bug la simulaba: hasta el fix de fechas
// (c9dc96d, 2026-07-15) estos leads tenian la fecha en formato humano ('June 12, 2026') y
// lte() compara TEXTO -- 'J' > '2' en ASCII, asi que jamas entraban. Al normalizar las
// fechas se destaparon y la cola paso de 4 a 15. Estaba bien por accidente.
//
// El leftJoin de inscripcion ya estaba (trae el nombre de campana para columnasColaConCampana);
// pedirle isNotNull lo vuelve un inner join de hecho, sin tocar el resto de la query. Un lead
// que avanza a contacto_iniciado deja de ser lead y lo levanta colaContactoIniciadoSinSeguimiento.
export function colaLeads(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasColaConCampana)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, 'lead'),
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
        // El join de arriba ya filtra estado='activa': si no matcheo, no hay secuencia viva.
        // Una inscripcion 'pausada' (respuesta detectada, B6) tampoco lo revive.
        isNotNull(inscripcion.idInscripcion),
      ),
    )
    .orderBy(empresa.proximoFollowUpFecha)
    .all();
}

// Bucket "Cierres" del split de cola: estados calientes (ESTADOS_CALIENTES) con proximo paso
// VENCIDO O DE HOY.
//
// Hasta el 2026-08-03 no tenia filtro de fecha, con el argumento de que una cuenta en
// negociacion no esta "vencida" solo por no tener fecha puesta. Como criterio de pipeline se
// sostiene; el problema es que alimentaba una pantalla que se llama Toques y un contador que
// el operador lee como "lo que tengo que hacer hoy". Medido ese dia en produccion: 39 cuentas
// org-wide que aparecian todos los dias y no bajaban nunca, y un contador que no podia llegar
// a cero.
//
// Lo que salio de aca no se perdio, tiene su propia consulta y su propia seccion:
//   - fecha futura -> colaProgramadas
//   - sin fecha    -> colaSinProximoPaso ("falta decidir el siguiente movimiento")
// La particion de las cuatro consultas la verifica repository.colaPorFecha.test.ts.
export function colaCierres(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasColaConCampana)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        inArray(empresa.estadoNotion, [...ESTADOS_CALIENTES]),
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
        // La reunion_agendada con no-show pendiente se muestra en Reagendar, no aqui.
        sql`NOT (${empresa.estadoNotion} = 'reunion_agendada' AND ${ultimoResultadoNoLlego})`,
      ),
    )
    .orderBy(empresa.proximoFollowUpFecha)
    .all();
}

// Seccion "Sin proximo paso decidido" (2026-08-03): los deals calientes SIN fecha. Es la
// mitad que se cae de colaCierres al ponerle filtro de fecha, y sale a su propia seccion
// justamente porque no puede desaparecer: un deal caliente sin fecha no es un deal tranquilo,
// es un deal sin siguiente movimiento decidido, que es como se pudren.
//
// A diferencia de colaCierres, aca NO se excluye la reunion_agendada con no-show: si nadie la
// reagendo, no tiene fecha, y colaReagendar exige fecha vencida-o-hoy. Sin esta puerta ese
// caso no salia por ningun lado.
export function colaSinProximoPaso(owner: string, idOrganizacion: number) {
  return db
    .select(columnasColaConCampana)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        inArray(empresa.estadoNotion, [...ESTADOS_CALIENTES]),
        isNull(empresa.proximoFollowUpFecha),
      ),
    )
    .orderBy(empresa.nombreOficial)
    .all();
}

// Seccion "Programadas" (2026-08-03): lo que tiene fecha y TODAVIA NO llega. La otra mitad
// que se cae de colaCierres, y la respuesta a "¿que viene despues de hoy?" sin meterlo en el
// contador del dia.
//
// Incluye contacto_iniciado con fecha futura y sin cadencia activa, que hasta hoy no salia en
// ninguna vista: colaContactoIniciadoConSeguimiento exige fecha vencida-o-hoy y
// colaContactoIniciadoSinSeguimiento exige fecha NULL. Con cadencia activa se deja fuera
// porque su paso ya sale por el bucket de cadencias cuando le toque.
//
// 'lead' queda fuera (dormido, regla del 2026-07-15) y on_hold/firma_pago tambien
// (ESTADOS_FUERA_DE_TOQUES).
export function colaProgramadas(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasColaConCampana)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        gt(empresa.proximoFollowUpFecha, hoy),
        or(
          inArray(empresa.estadoNotion, [...ESTADOS_CALIENTES]),
          and(eq(empresa.estadoNotion, 'contacto_iniciado'), isNull(inscripcion.idInscripcion)),
        ),
      ),
    )
    .orderBy(empresa.proximoFollowUpFecha)
    .all();
}

// Bucket "Reagendar" del split de cola (2026-07-14, v3): reunion_agendada cuyo ULTIMO toque
// fue no-show (no_llego). Es un follow-up real con fecha (vencido-o-hoy), igual que
// colaLeads -- no una lista fija. on_hold NO es Reagendar (ver spec): eso queda fuera del
// split.
export function colaReagendar(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasColaConCampana)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, 'reunion_agendada'),
        ultimoResultadoNoLlego,
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
      ),
    )
    .orderBy(empresa.proximoFollowUpFecha)
    .all();
}

// Bucket "Contacto iniciado con seguimiento" del split de cola (2026-07-23): una empresa en
// contacto_iniciado con proximo_follow_up_fecha vencida o de hoy y SIN cadencia activa
// quedaba invisible en la cola de Sebastian -- no es 'lead' (no entra a colaLeads), no es
// estado caliente (no entra a colaCierres), tiene fecha (no entra a colaContactoIniciadoSin
// Seguimiento, que exige fecha NULL) y no tiene inscripcion (no la levanta
// agendaHoyCadencias). Pasa con toda cuenta reactivada que se trabaja a mano (Wicom, Intel
// Go). El leftJoin de inscripcion + isNull(inscripcion.idInscripcion) evita duplicar con el
// bucket de cadencias: si hay secuencia activa, ese toque ya sale por su propio bucket.
export function colaContactoIniciadoConSeguimiento(hoy: string, owner: string, idOrganizacion: number) {
  return db
    .select(columnasColaConCampana)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(inscripcion, and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa')))
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, 'contacto_iniciado'),
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
        isNull(inscripcion.idInscripcion),
      ),
    )
    .orderBy(empresa.proximoFollowUpFecha)
    .all();
}

// Seccion "Contacto iniciado sin seguimiento" (2026-07-14): empresas en contacto_iniciado
// que no se van a meter a ninguna cadencia por ahora y hoy son invisibles -- colaDelDia
// exige fecha, esta no la tiene. General para cualquier owner (no gateado como el split de
// /cola). Lista fija (sin filtro de fecha), mismo patron que colaCierres/colaReagendar.
// owner opcional (Fase 3 CRO, 2026-07-21): mismo patron que colaDelDia -- con owner filtra
// a ese owner, sin owner (undefined) trae la seccion de TODA la organizacion. El caller
// (pagina) decide si ese "todo" es apropiado (CRO) o si prefiere no mostrar la seccion
// (visitante, decision anterior de Sebastian).
export function colaContactoIniciadoSinSeguimiento(owner: string | undefined, idOrganizacion: number) {
  const condiciones = [
    eq(empresa.organizacionActivaId, idOrganizacion),
    EMPRESA_VIVA,
    eq(empresa.estadoNotion, 'contacto_iniciado'),
    isNull(empresa.proximoFollowUpFecha),
    notExists(
      db
        .select({ x: sql`1` })
        .from(inscripcion)
        .where(and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa'))),
    ),
  ];
  if (owner) condiciones.push(eq(empresa.owner, owner));
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(and(...condiciones))
    .orderBy(empresa.nombreOficial)
    .all();
}

export type FilaPipelineSinCadencia = {
  idEmpresa: string;
  empresa: string;
  contacto: string | null;
  cargo: string | null;
  canal: string | null;
  fecha: string | null;
  estado: string | null;
  esHoy: boolean;
  esVencido: boolean;
};

// Franja "Sin cadencia" de /seguimiento: los deals ACTIVOS del owner que no estan en
// ninguna cadencia. Complemento de pipelineGlobal (que solo trae los inscritos).
//
// B (2026-07-15): antes era org-wide y Sebastian veia las cuentas de Thomas. Ahora el
// owner es obligatorio: cada quien ve lo suyo (decision de Sebastian).
//
// L (2026-07-15): antes exigia proximo_follow_up_fecha NOT NULL y <= hoy, lo que
// ocultaba ~90% de los deals activos (Felipe: 24 activas, 3 visibles). Un deal vivo SIN
// fecha es justamente el que hay que ver para ponerle una -- esconderlo lo vuelve
// invisible para siempre. La urgencia ahora se comunica con esHoy/esVencido, no
// dejando la fila fuera.
//
// Lo que SIGUE fuera: on_hold (dormido) y firma_pago (ya cliente) -- no son trabajo
// activo. COALESCE para que estado null no caiga por el NULL NOT IN (que da NULL).
//
// owner opcional (Fase 3 CRO, 2026-07-21): la B de 2026-07-15 (mas arriba) lo volvio
// obligatorio para que "cada quien vea lo suyo" -- eso sigue valiendo para Felipe y
// Sebastian sin cambios. undefined es la excepcion deliberada para el rol CRO (ve
// Felipe + Sebastian a la vez), nunca el default de un vendedor normal.
export function pipelineSinCadencia(
  idOrganizacion: number,
  hoy: string,
  owner: string | undefined,
): FilaPipelineSinCadencia[] {
  const condiciones = [
    eq(empresa.organizacionActivaId, idOrganizacion),
    EMPRESA_VIVA,
    // 'lead' excluido (Sebastián 2026-07-22): "Sin cadencia" debe mostrar solo los deals
    // avanzados que uno supervisa a mano (cierre, contacto_iniciado, oportunidad, etc.), no
    // las decenas de leads dormidos con fecha vieja/nula que ensucian la vista. on_hold ya
    // sale por su cadencia; firma_pago es un deal ganado (cerrado), no un follow-up abierto.
    sql`COALESCE(${empresa.estadoNotion}, '') NOT IN ('on_hold', 'firma_pago', 'lead')`,
    notExists(
      db
        .select({ x: sql`1` })
        .from(inscripcion)
        .where(and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa'))),
    ),
  ];
  if (owner) condiciones.push(eq(empresa.owner, owner));
  const filas = db
    .select({
      idEmpresa: empresa.idEmpresa,
      empresa: empresa.nombreOficial,
      contacto: contacto.nombre,
      cargo: contacto.cargo,
      canal: empresa.proximoCanal,
      fecha: empresa.proximoFollowUpFecha,
      estado: empresa.estadoNotion,
    })
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .where(and(...condiciones))
    // Primero lo vencido, despues lo de hoy, despues lo agendado a futuro, y de ultimo
    // lo que no tiene fecha (NULLS LAST explicito: en SQLite NULL ordena primero).
    .orderBy(sql`CASE WHEN ${empresa.proximoFollowUpFecha} IS NULL THEN 1 ELSE 0 END`, empresa.proximoFollowUpFecha)
    .all();

  return filas.map((f) => ({
    ...f,
    esHoy: f.fecha === hoy,
    esVencido: f.fecha != null && f.fecha < hoy,
  }));
}

// V3.9: busca CUALQUIER empresa por nombre, sin restringir por owner ni por
// proximoFollowUpFecha, a diferencia de colaDelDia(), que solo trae leads propios
// y vencidos. Sirve para registrar un toque con alguien que no es lead de la cola
// (cliente existente u otra relacion): la ficha en /llamada/[id] ya funciona para
// cualquier empresa, solo faltaba una forma de encontrarla fuera de la cola.
export function buscarEmpresasPorNombre(query: string) {
  const termino = `%${query.trim()}%`;
  return db
    .select({ id: empresa.idEmpresa, nombre: empresa.nombreOficial, ciudad: empresa.ciudadPrincipal, esCliente: empresa.esCliente })
    .from(empresa)
    .where(sql`${empresa.nombreOficial} LIKE ${termino} COLLATE NOCASE`)
    .orderBy(empresa.nombreOficial)
    .limit(20)
    .all();
}

export function getCuenta(id: string, idOrganizacion: number) {
  const emp = db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      ciudad: empresa.ciudadPrincipal,
      departamento: empresa.departamento,
      estado: empresa.estadoNotion,
      crm: empresa.crmSoftware,
      pasarela: empresa.pasarelaActual,
      owner: empresa.owner,
      categoria: empresaCategoriaView.categoria,
      proximoPaso: empresa.proximoPaso,
      fecha: empresa.proximoFollowUpFecha,
      usuarios: empresaUsuarios.usuariosEfectivos,
      notionPageId: empresa.notionPageId,
      pbxForma: empresa.pbxForma,
      notasDiscovery: empresa.notasDiscovery,
      brief: empresa.brief,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(empresaCategoriaView, eq(empresaCategoriaView.idEmpresa, empresa.idEmpresa))
    .where(eq(empresa.idEmpresa, id))
    .get();

  const contactos = db
    .select({
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      telefono: contacto.telefono,
      email: contacto.email,
      esPrincipal: contacto.esPrincipal,
      esKeyDecisionMaker: contacto.esKeyDecisionMaker,
    })
    .from(contacto)
    .where(eq(contacto.idEmpresa, id))
    .all();

  // Solo los toques de MI organizacion: el lead es compartido, el historial de contacto no.
  const toques = db
    .select({
      idToque: toque.idToque,
      fecha: toque.fecha,
      canal: toque.canal,
      resultado: toque.resultado,
      quePaso: toque.quePaso,
      transcriptId: toque.transcriptId,
      transcriptUrl: toque.transcriptUrl,
      resumen: toque.resumen,
      // La UI separa historial importado de Notion vs toques hechos EN la herramienta
      // (esToqueDeLaHerramienta en core/fecha-toque.ts). Es la columna, no el formato
      // de la fecha, la que sabe de donde salio cada toque.
      fuente: toque.fuente,
    })
    .from(toque)
    .where(and(eq(toque.idEmpresa, id), eq(toque.idOrganizacion, idOrganizacion)))
    .orderBy(desc(toque.idToque))
    // Limite 20 (antes 5, subido con el historial expandible de 2026-07-15): 5 alcanzaba cuando
    // la ficha solo pintaba "ultimo toque", pero un historial completo que corta en 5 sin decirlo
    // mentiria en una cuenta trabajada. 20 cubre las cuentas reales mas tocadas sin traer el
    // historial entero a memoria en cada render.
    .limit(20)
    .all();

  return { emp, contactos, toques };
}

// Lo que quedó escrito de un toque, releído de la tabla. Es lo que devuelve registrarToque:
// un { ok: true } no es verificable, y quien registra necesita ver el id, el día que quedó y
// los campos acotados tal como los guardó la base, no como los mandó.
export type ToqueEscrito = {
  idToque: number;
  idEmpresa: string;
  fecha: string | null;
  fechaDia: string | null;
  canal: string | null;
  tipoToque: string | null;
  resultado: string | null;
  duracionSegundos: number | null;
  quePaso: string | null;
  proximoFollowUpFecha: string | null;
  razonPerdida: string | null;
  razonPerdidaNota: string | null;
  objecion: string | null;
  objecionNota: string | null;
  accionCliente: string | null;
  transcriptProveedor: string | null;
  transcriptId: string | null;
  transcriptUrl: string | null;
  reunionFechaPropuesta: string | null;
  reunionFechaOcurrida: string | null;
  ejecutadoPor: string | null;
  idContacto: number | null;
  idOrganizacion: number;
  createdAt: string | null;
};

export type RegistrarToqueResultado = {
  toque: ToqueEscrito;
  empresa: EmpresaEscrita;
  // La transición de embudo que ESTE toque disparó, si disparó alguna. null = la cuenta se
  // quedó donde estaba. Se devuelve porque es el efecto menos evidente de registrar un toque.
  transicion: { de: string | null; a: string } | null;
};

// Sobrecarga (2026-07-26): el camino normal es "lo acabo de escribir, tiene que estar" y
// lanza si no aparece. editarToque necesita el otro: preguntar si el toque existe ANTES de
// tocarlo, y responder "no existe" con su propio mensaje en vez de "no quedo escrito", que
// diria otra cosa.
function leerToqueEscrito(lector: typeof db | Tx, idToque: number): ToqueEscrito;
function leerToqueEscrito(lector: typeof db | Tx, idToque: number, opts: { permitirNoExiste: true }): ToqueEscrito | null;
function leerToqueEscrito(
  lector: typeof db | Tx,
  idToque: number,
  opts?: { permitirNoExiste: true },
): ToqueEscrito | null {
  const fila = lector
    .select({
      idToque: toque.idToque,
      idEmpresa: toque.idEmpresa,
      fecha: toque.fecha,
      fechaDia: toque.fechaDia,
      canal: toque.canal,
      tipoToque: toque.tipoToque,
      resultado: toque.resultado,
      duracionSegundos: toque.duracionSegundos,
      quePaso: toque.quePaso,
      proximoFollowUpFecha: toque.proximoFollowUpFecha,
      razonPerdida: toque.razonPerdida,
      razonPerdidaNota: toque.razonPerdidaNota,
      objecion: toque.objecion,
      objecionNota: toque.objecionNota,
      accionCliente: toque.accionCliente,
      transcriptProveedor: toque.transcriptProveedor,
      transcriptId: toque.transcriptId,
      transcriptUrl: toque.transcriptUrl,
      reunionFechaPropuesta: toque.reunionFechaPropuesta,
      reunionFechaOcurrida: toque.reunionFechaOcurrida,
      ejecutadoPor: toque.ejecutadoPor,
      idContacto: toque.idContacto,
      idOrganizacion: toque.idOrganizacion,
      createdAt: toque.createdAt,
    })
    .from(toque)
    .where(eq(toque.idToque, idToque))
    .get();
  if (!fila) {
    if (opts?.permitirNoExiste) return null;
    throw new Error(`El toque ${idToque} no quedo escrito`);
  }
  return fila;
}

// Registrar un toque: escribe el evento (toque) y actualiza el estado actual (empresa). Atómico.
// La regla de negocio (el enum de resultados, razonPerdida obligatoria en los resultados de
// pérdida, la fecha propuesta obligatoria en un no-show) es de DOMINIO y se enforza aquí con
// Zod, no en la UI: cualquier caller futuro (ingest worker, EnvioAdapter) pasa por esta misma
// garantía. `.parse()` lanza si el input no cumple.
//
// Devuelve el toque RELEÍDO más la empresa releída (2026-07-25). Antes devolvía void y el MCP
// respondía { ok: true }: eso obliga a creerle a la escritura en vez de verificarla, y no
// muestra el efecto colateral que más importa (si el toque movió la etapa).
export function registrarToque(input: RegistrarToqueInput, idOrganizacion: number): RegistrarToqueResultado {
  const parsed = registrarToqueSchema.parse(input);
  const instante = new Date();
  const ahora = instante.toISOString();
  // El día del toque: el que mandó el caller (un toque de ayer dictado hoy) o el de este
  // instante. `fecha` guarda el timestamp completo y `fecha_dia` el día sobre el que se cuenta;
  // cuando el caller fija el día, el timestamp se ancla a ese día para que las dos no se
  // contradigan.
  //
  // fechaBogotaISO y no `ahora.slice(0, 10)` (2026-07-28): recortar el ISO devuelve el día UTC,
  // que entre las 19:00 y la medianoche de Colombia ya es MAÑANA. Un toque dictado a las 8pm sin
  // fecha explícita quedaba contado en el día siguiente, y fecha_dia es justo la columna sobre la
  // que se mide la actividad diaria. Medido en producción: los toques 193 y 196 quedaron fechados
  // 2026-07-09 y 2026-07-10 cuando ocurrieron el 08 y el 09. El timestamp `fecha` sigue en UTC a
  // propósito: eso es un instante, no un día de calendario, y ahí UTC es correcto.
  const fechaDia = parsed.fecha ?? fechaBogotaISO(instante);
  const fechaCompleta = parsed.fecha ? `${parsed.fecha}T12:00:00.000Z` : ahora;

  return db.transaction((tx) => {
    // Guard de organizacion (Parte 1): un toque solo se registra sobre un lead cuya
    // organizacion_activa_id coincide con la del que llama. Evita que dos organizaciones
    // se pisen el estado de un lead compartido por error (ver spec 2026-07-09).
    const emp = tx
      .select({ organizacionActivaId: empresa.organizacionActivaId, estadoNotion: empresa.estadoNotion })
      .from(empresa)
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${parsed.idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(
        `La empresa ${parsed.idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`,
      );
    }

    // A QUE PERSONA se toco. Dos caminos y solo uno por toque (el schema ya rechaza los dos
    // juntos):
    //   idContacto -> el contacto YA existe en la base y se enlaza tal cual. Es el camino que
    //                 faltaba: hasta el 2026-07-26 la unica forma de llenar toque.id_contacto
    //                 desde aca era crear un contacto nuevo con kdm, asi que quien ya lo tenia
    //                 registrado no tenia como decirlo y la columna se quedaba en NULL.
    //   kdm        -> upsert del contacto ANTES del insert del toque.
    let idContacto: number | null = null;
    if (parsed.idContacto != null) {
      // Tiene que existir Y ser de ESTA empresa. Enlazar un toque al contacto de otra cuenta es
      // peor que dejarlo vacio: mezcla dos historias y nada avisa. Se falla explicito en vez de
      // caer a null en silencio, que dejaria creer que el enlace quedo hecho.
      const existente = tx
        .select({ idContacto: contacto.idContacto })
        .from(contacto)
        .where(and(eq(contacto.idContacto, parsed.idContacto), eq(contacto.idEmpresa, parsed.idEmpresa)))
        .get();
      if (!existente) {
        throw new Error(
          `El contacto ${parsed.idContacto} no existe o no pertenece a la empresa ${parsed.idEmpresa}`,
        );
      }
      idContacto = existente.idContacto;
    } else if (parsed.kdm) {
      // Matching: mismo idEmpresa + mismo telefono exacto si viene telefono; si no hay
      // telefono, no hay match posible (el nombre no es clave confiable) -> insertar.
      const { nombre, telefono } = parsed.kdm;
      const existente = telefono
        ? tx
            .select({ idContacto: contacto.idContacto })
            .from(contacto)
            .where(and(eq(contacto.idEmpresa, parsed.idEmpresa), eq(contacto.telefono, telefono)))
            .get()
        : undefined;

      if (existente) {
        idContacto = existente.idContacto;
        const sets: Record<string, unknown> = { esKeyDecisionMaker: 1 };
        if (nombre) sets.nombre = nombre;
        tx.update(contacto).set(sets).where(eq(contacto.idContacto, idContacto)).run();
      } else {
        const inserted = tx
          .insert(contacto)
          .values({
            idEmpresa: parsed.idEmpresa,
            nombre,
            telefono: telefono ?? null,
            esKeyDecisionMaker: 1,
            esPrincipal: 0,
            fuente: 'cockpit',
          })
          .run();
        idContacto = Number(inserted.lastInsertRowid);
      }
    }

    // Tarea 6: fechaPrimerContacto solo se manda la primera vez (empresa sin toques
    // previos a este). Se cuenta ANTES del insert de abajo, dentro de la misma
    // transaccion, para que la respuesta no dependa de una condicion de carrera con
    // otro toque escribiendose al mismo tiempo.
    const previos = tx
      .select({ n: sql<number>`count(*)` })
      .from(toque)
      .where(eq(toque.idEmpresa, parsed.idEmpresa))
      .get();
    const esPrimerToque = (previos?.n ?? 0) === 0;

    const insertado = tx
      .insert(toque)
      .values({
        idEmpresa: parsed.idEmpresa,
        idContacto,
        fecha: fechaCompleta,
        // El día canónico, siempre lleno en todo toque que nazca aquí. fecha_texto se queda en
        // null: solo se llena hacia atrás, para el historial importado que no se pudo parsear.
        fechaDia,
        canal: parsed.canal,
        // NULL cuando el caller no lo dijo. No se deriva de emp.estadoNotion (que esta a la
        // mano unas lineas arriba) ni del canal: derivarlo es exactamente lo que contamino el
        // mix que esta columna viene a arreglar.
        tipoToque: parsed.tipoToque ?? null,
        resultado: parsed.resultado,
        duracionSegundos: parsed.duracionSegundos ?? null,
        quePaso: parsed.quePaso ?? null,
        proximoFollowUpFecha: parsed.proximoFollowUp ?? null,
        razonPerdida: parsed.razonPerdida ?? null,
        razonPerdidaNota: parsed.razonPerdidaNota ?? null,
        objecion: parsed.objecion ?? null,
        objecionNota: parsed.objecionNota ?? null,
        accionCliente: parsed.accionCliente ?? null,
        transcriptProveedor: parsed.transcriptProveedor ?? null,
        transcriptId: parsed.transcriptId ?? null,
        transcriptUrl: parsed.transcriptUrl ?? null,
        reunionFechaPropuesta: parsed.reunionFechaPropuesta ?? null,
        reunionFechaOcurrida: parsed.reunionFechaOcurrida ?? null,
        // Con default de dominio desde el 2026-07-25 (EJECUTOR_POR_DEFECTO): el schema ya lo
        // resolvió, aquí nunca llega vacío.
        ejecutadoPor: parsed.ejecutadoPor,
        fuente: 'cockpit',
        idOrganizacion,
        createdAt: ahora,
      })
      .run();

    const sets: Record<string, unknown> = { updatedAt: sql`datetime('now')` };
    if (parsed.proximoFollowUp) sets.proximoFollowUpFecha = parsed.proximoFollowUp;
    if (parsed.proximoCanal) sets.proximoCanal = parsed.proximoCanal;
    if (parsed.crm) sets.crmSoftware = parsed.crm;
    if (parsed.pasarela) sets.pasarelaActual = parsed.pasarela;
    tx.update(empresa).set(sets).where(eq(empresa.idEmpresa, parsed.idEmpresa)).run();

    // Fase 5 (plan-produccion-cro-campana.md): un toque real puede graduar la etapa
    // comercial (on_hold -> contacto_iniciado, on_hold|contacto_iniciado -> reunion_agendada
    // si el resultado fue 'contesto_reunion'). La regla vive en el core
    // (transicion-estado.ts), aca solo se ejecuta si aplica -- estadoDestinoPorToque ya
    // devuelve null para cualquier estado de origen que no este en su lista blanca, asi
    // que un toque sobre una cuenta ya avanzada (oportunidad, cierre_documentacion...) o
    // sobre un lead dormido no toca estado_notion.
    const estadoDestino = estadoDestinoPorToque(emp.estadoNotion, parsed.resultado);
    if (estadoDestino) {
      // origen 'toque': la escribio un toque real, cuenta para el ciclo de venta. Es lo que la
      // distingue de un backfill o de un cuadre contra Notion (ORIGENES_TRANSICION).
      escribirTransicionEstado(tx, parsed.idEmpresa, emp.estadoNotion, estadoDestino, idOrganizacion, fechaCompleta, 'toque');
    }

    // V3.7: outbox en la MISMA transaccion que el cambio (patron outbox). Si la empresa
    // no tiene notion_page_id todavia (nadie la enlazo a mano, ver nota en V3.1b/V3.7)
    // no hay a donde sincronizar, se omite en silencio, no es un error.
    //
    // Tarea 6: a diferencia de proximoPaso/fechaProximoPaso (que dependen de que el
    // cockpit haya llenado esos campos), fechaUltimoContacto y toquesHechos se mandan
    // SIEMPRE que se registra un toque, porque un toque acaba de ocurrir.
    const todosLosToques = tx
      .select({ fecha: toque.fecha, canal: toque.canal, resultado: toque.resultado })
      .from(toque)
      .where(eq(toque.idEmpresa, parsed.idEmpresa))
      .orderBy(desc(toque.idToque))
      .all();

    encolarOutboxNotion(tx, parsed.idEmpresa, {
      proximoPaso: parsed.quePaso,
      fechaProximoPaso: parsed.proximoFollowUp,
      fechaUltimoContacto: fechaDia,
      ...(esPrimerToque ? { fechaPrimerContacto: fechaDia } : {}),
      toquesHechos: renderToquesHechos(todosLosToques),
      // write-path del MCP (2026-07-24): si el toque graduo la etapa, ese cambio de estado
      // tambien viaja DB -> Notion (su emision esta gateada en el adaptador). Sin transicion,
      // estado queda undefined y no se manda -- no se toca la etapa que Notion ya tenga.
      ...(estadoDestino ? { estado: estadoDestino } : {}),
    });

    if (parsed.usuarios != null && !Number.isNaN(parsed.usuarios)) {
      tx.insert(empresaUsuarios)
        .values({ idEmpresa: parsed.idEmpresa, usuariosEstimados: parsed.usuarios, actualizadoEn: ahora })
        .onConflictDoUpdate({ target: empresaUsuarios.idEmpresa, set: { usuariosEstimados: parsed.usuarios, actualizadoEn: ahora } })
        .run();
    }

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'toque',
        idRegistro: parsed.idEmpresa,
        accion: 'insert',
        detalle: `${parsed.resultado} -> next ${parsed.proximoFollowUp ?? '-'}`,
      })
      .run();

    // Relectura DENTRO de la transaccion: lo que se devuelve es lo que quedo en la base, no un
    // eco del input.
    return {
      toque: leerToqueEscrito(tx, Number(insertado.lastInsertRowid)),
      empresa: leerEmpresaEscrita(tx, parsed.idEmpresa),
      transicion: estadoDestino ? { de: emp.estadoNotion, a: estadoDestino } : null,
    };
  });
}

// --- editarToque (2026-07-26) -----------------------------------------------------------
//
// Corrige campos puntuales de un toque que YA se escribio. Hasta hoy registrarToque creaba y
// nada corregia: tres reuniones con duracion conocida (55, 71 y 50 minutos, de tl;dv) y un
// texto de procedencia incompleto se quedaron sin arreglo, porque la unica salida era un
// UPDATE a mano contra produccion, que no valida nada y no deja rastro.
//
// Tres garantias, en este orden:
//   1. Solo escribe lo que de verdad cambia. Un campo que llega con el mismo valor que ya tenia
//      no entra al UPDATE ni a la bitacora: "se edito" tiene que significar que algo se movio.
//   2. Reimpone las invariantes sobre la fila MEZCLADA (lo de la base + el parche), no sobre el
//      parche suelto. Cambiar el resultado a 'no_llego' sin fecha propuesta falla aunque el
//      parche no nombre la fecha.
//   3. Deja rastro: una fila en sync_cambios con el motivo (obligatorio) y el antes -> despues
//      de cada campo.
//
// Lo que NO hace, a proposito:
//   - No encola nada hacia Notion. Notion tiene un solo escritor y es el brain; el outbox de
//     esta base no drena (la tarea del worker esta apagada por default, ver
//     app/worker/index.ts). Encolar aqui seria dejar basura en una cola que nadie vacia.
//   - No mueve la etapa del embudo. Corregir la duracion de una reunion no gradua una cuenta;
//     si un toque se registro con el resultado equivocado y eso movio la etapa, la etapa se
//     corrige aparte con mover_estado, que deja su propia fila en el historial.
//   - No toca fecha_texto. Esa columna guarda el original que no se pudo parsear ("~inicios
//     jun"); es el unico rastro de dos toques reales y no se pisa al fechar bien la fila.

// Un campo que cambio, con su antes y su despues. Es lo que hace verificable la edicion: sin
// esto, "se actualizo el toque 214" no dice si movio uno o siete campos.
export type CampoEditado = { campo: string; antes: unknown; despues: unknown };

export type EditarToqueResultado = {
  toque: ToqueEscrito;
  cambios: CampoEditado[];
  motivo: string;
  // true cuando el parche traia solo valores que la fila YA tenia. No es un error (mandar dos
  // veces la misma correccion es normal), pero tampoco es una edicion, y decirlo evita que
  // alguien lea la respuesta como si hubiera escrito algo.
  sinCambios: boolean;
};

// Las invariantes de un toque aplicadas a la fila mezclada. Se arma como schema aparte (y no
// se reusa registrarToqueSchema) porque aqui no hay input de usuario que validar: los tipos ya
// los valido editarToqueSchema, lo unico que falta es la coherencia ENTRE campos.
const toqueMezcladoSchema = z
  .object({
    canal: z.string().nullable(),
    resultado: z.string().nullable(),
    razonPerdida: z.string().nullable(),
    reunionFechaPropuesta: z.string().nullable(),
    reunionFechaOcurrida: z.string().nullable(),
  })
  .superRefine(invariantesToque);

export function editarToque(input: EditarToqueInput, idOrganizacion: number): EditarToqueResultado {
  const parsed = editarToqueSchema.parse(input);
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    const actual = leerToqueEscrito(tx, parsed.idToque, { permitirNoExiste: true });
    if (!actual) throw new Error(`El toque ${parsed.idToque} no existe`);
    // Guard de organizacion, el mismo de registrarToque: un toque de otra organizacion no se
    // edita ni se reporta como inexistente a medias -- se dice que no es de esta.
    if (actual.idOrganizacion !== idOrganizacion) {
      throw new Error(`El toque ${parsed.idToque} es de otra organizacion, no de ${idOrganizacion}`);
    }

    // idContacto: mismas dos condiciones que en registrarToque (existe Y es de esta empresa).
    // null es un valor legitimo del parche: desenlaza el contacto equivocado.
    if (parsed.idContacto != null) {
      const existente = tx
        .select({ idContacto: contacto.idContacto })
        .from(contacto)
        .where(and(eq(contacto.idContacto, parsed.idContacto), eq(contacto.idEmpresa, actual.idEmpresa)))
        .get();
      if (!existente) {
        throw new Error(
          `El contacto ${parsed.idContacto} no existe o no pertenece a la empresa ${actual.idEmpresa} del toque ${parsed.idToque}`,
        );
      }
    }

    // El parche, campo por campo. `undefined` = no vino, `null` = borrar. La distincion es lo
    // que permite vaciar un campo mal escrito sin un valor centinela.
    const patch: Partial<Record<keyof ToqueEscrito, unknown>> = {};
    const tomar = <K extends keyof ToqueEscrito>(campo: K, valor: unknown) => {
      if (valor !== undefined) patch[campo] = valor;
    };
    tomar('canal', parsed.canal);
    tomar('tipoToque', parsed.tipoToque);
    tomar('resultado', parsed.resultado);
    tomar('duracionSegundos', parsed.duracionSegundos);
    tomar('quePaso', parsed.quePaso);
    tomar('razonPerdida', parsed.razonPerdida);
    tomar('razonPerdidaNota', parsed.razonPerdidaNota);
    tomar('objecion', parsed.objecion);
    tomar('objecionNota', parsed.objecionNota);
    tomar('accionCliente', parsed.accionCliente);
    tomar('reunionFechaPropuesta', parsed.reunionFechaPropuesta);
    tomar('reunionFechaOcurrida', parsed.reunionFechaOcurrida);
    tomar('transcriptProveedor', parsed.transcriptProveedor);
    tomar('transcriptId', parsed.transcriptId);
    tomar('transcriptUrl', parsed.transcriptUrl);
    tomar('ejecutadoPor', parsed.ejecutadoPor);
    tomar('idContacto', parsed.idContacto);
    // Corregir el DIA mueve las dos columnas juntas: fecha_dia es sobre la que se cuenta y
    // `fecha` es el timestamp. Si el timestamp ya cae en ese mismo dia se respeta su hora (era
    // buena, solo estaba mal el dia canonico); si no, se ancla al mediodia UTC, el mismo
    // criterio que usa registrarToque cuando el caller fija el dia.
    if (parsed.fecha !== undefined) {
      patch.fechaDia = parsed.fecha;
      patch.fecha = actual.fecha?.slice(0, 10) === parsed.fecha ? actual.fecha : `${parsed.fecha}T12:00:00.000Z`;
    }

    // La fila como quedaria. Se valida ANTES de escribir nada.
    const mezclado = { ...actual, ...patch } as ToqueEscrito;
    toqueMezcladoSchema.parse({
      canal: mezclado.canal,
      resultado: mezclado.resultado,
      razonPerdida: mezclado.razonPerdida,
      reunionFechaPropuesta: mezclado.reunionFechaPropuesta,
      reunionFechaOcurrida: mezclado.reunionFechaOcurrida,
    });

    const cambios: CampoEditado[] = [];
    for (const [campo, despues] of Object.entries(patch)) {
      const antes = actual[campo as keyof ToqueEscrito];
      // undefined nunca llega aca (tomar lo filtra); null vs null y valor igual no son cambio.
      if (antes === despues) continue;
      cambios.push({ campo, antes, despues });
    }

    if (cambios.length === 0) {
      return { toque: actual, cambios, motivo: parsed.motivo, sinCambios: true };
    }

    const sets: Record<string, unknown> = {};
    for (const { campo, despues } of cambios) sets[campo] = despues;
    tx.update(toque).set(sets).where(eq(toque.idToque, parsed.idToque)).run();

    // El rastro. entidad 'toque' + idRegistro = el id DEL TOQUE (registrarToque escribe ahi el
    // id de la empresa, que sirve para "que paso con esta cuenta" pero no para "que le paso a
    // esta fila"): una edicion se busca por el toque que se edito. La empresa va en el detalle,
    // que ademas lleva el motivo y el antes -> despues de cada campo.
    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'toque',
        idRegistro: String(parsed.idToque),
        accion: 'update',
        detalle:
          `${actual.idEmpresa} | ${parsed.motivo} | ` +
          cambios.map((c) => `${c.campo}: ${c.antes ?? '-'} -> ${c.despues ?? '-'}`).join('; '),
      })
      .run();

    // Relectura DENTRO de la transaccion: se devuelve la fila de la base, no la mezcla que se
    // calculo en memoria.
    return { toque: leerToqueEscrito(tx, parsed.idToque), cambios, motivo: parsed.motivo, sinCambios: false };
  });
}

// write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md). marcarPerdida es
// el camino de dominio para "parquear/perder" una cuenta: registra un toque de perdida
// (resultado 'contesto_no' + razon_perdida) y mueve estado_notion a on_hold. Antes esto no
// tenia camino limpio (docs/operar-data.md Recetas 2 y 4: razon_perdida se quedaba local y
// on_hold solo se seteaba a mano en Notion).
//
// Diferencia clave con registrarToque: una perdida NO pasa por estadoDestinoPorToque a
// proposito. Esa transicion "solo avanza" (on_hold -> contacto_iniciado) graduaria la cuenta
// justo al reves de lo que una perdida quiere. Aca el destino es on_hold, explicito, escrito
// por escribirTransicionEstado igual que el sync de Notion.
const marcarPerdidaSchema = z.object({
  idEmpresa: z.string().min(1),
  canal: z.enum(CANALES_TOQUE),
  // En que clase de toque se cayo la cuenta. Perder en un cierre y perder en un frio son dos
  // problemas distintos: el primero dice que el proceso llego y no cerro, el segundo que ni
  // siquiera arranco. Opcional y NULL cuando no se dijo, igual que en registrarToque.
  tipoToque: z.enum(TIPOS_TOQUE).optional(),
  // Cerrada en los siete valores del negocio (2026-07-25). Era texto libre y produjo UNA fila
  // en 285 toques, en prosa: no se podia agrupar nada. La prosa sigue entrando, en la nota.
  razonPerdida: z.enum(RAZONES_PERDIDA),
  razonPerdidaNota: z.string().min(1).optional(),
  quePaso: z.string().min(1).optional(),
  objecion: z.enum(OBJECIONES).optional(),
  objecionNota: z.string().min(1).optional(),
  // Una cuenta que se pierde tambien tiene un ultimo nivel de compromiso, y es justo el dato
  // que responde donde se frena el embudo: el nivel al que llego antes de caerse.
  accionCliente: z.enum(ACCIONES_CLIENTE).optional(),
  fecha: fechaDiaSchema.optional(),
  ejecutadoPor: z.string().min(1).optional().default(EJECUTOR_POR_DEFECTO),
});
export type MarcarPerdidaInput = z.input<typeof marcarPerdidaSchema>;

export type MarcarPerdidaResultado = {
  toque: ToqueEscrito;
  empresa: EmpresaEscrita;
  transicion: { de: string | null; a: string } | null;
};

export function marcarPerdida(input: MarcarPerdidaInput, idOrganizacion: number): MarcarPerdidaResultado {
  const parsed = marcarPerdidaSchema.parse(input);
  const instante = new Date();
  const ahora = instante.toISOString();
  // Mismo día de calendario en Bogotá que registrarToque, por la misma razón (ver allá).
  const fechaDia = parsed.fecha ?? fechaBogotaISO(instante);
  const fechaCompleta = parsed.fecha ? `${parsed.fecha}T12:00:00.000Z` : ahora;

  return db.transaction((tx) => {
    const emp = tx
      .select({ organizacionActivaId: empresa.organizacionActivaId, estadoNotion: empresa.estadoNotion })
      .from(empresa)
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${parsed.idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(`La empresa ${parsed.idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
    }

    const insertado = tx
      .insert(toque)
      .values({
        idEmpresa: parsed.idEmpresa,
        fecha: fechaCompleta,
        fechaDia,
        canal: parsed.canal,
        tipoToque: parsed.tipoToque ?? null,
        // 'perdido' desde el 2026-07-25: con la taxonomia ampliada, "la cuenta no va" tiene su
        // propio valor. 'contesto_no' (el que escribia antes) sigue siendo valido y sigue
        // significando lo mismo; se deja de escribir aca porque perdido es mas preciso.
        resultado: 'perdido',
        quePaso: parsed.quePaso ?? null,
        razonPerdida: parsed.razonPerdida,
        razonPerdidaNota: parsed.razonPerdidaNota ?? null,
        objecion: parsed.objecion ?? null,
        objecionNota: parsed.objecionNota ?? null,
        accionCliente: parsed.accionCliente ?? null,
        ejecutadoPor: parsed.ejecutadoPor,
        fuente: 'cockpit',
        idOrganizacion,
        createdAt: ahora,
      })
      .run();

    // on_hold es el destino de una perdida; solo se registra la transicion si de verdad
    // cambia (una cuenta ya on_hold no genera una fila de historico redundante).
    const huboTransicion = emp.estadoNotion !== ESTADO_ON_HOLD;
    if (huboTransicion) {
      escribirTransicionEstado(tx, parsed.idEmpresa, emp.estadoNotion, ESTADO_ON_HOLD, idOrganizacion, fechaCompleta, 'perdida');
    }

    const todosLosToques = tx
      .select({ fecha: toque.fecha, canal: toque.canal, resultado: toque.resultado })
      .from(toque)
      .where(eq(toque.idEmpresa, parsed.idEmpresa))
      .orderBy(desc(toque.idToque))
      .all();

    encolarOutboxNotion(tx, parsed.idEmpresa, {
      estado: ESTADO_ON_HOLD,
      // A Notion viaja la ETIQUETA ("Ya tiene pasarela"), no el slug: el slug es la llave para
      // contar adentro, la etiqueta es como se escribe el campo en el pipeline.
      razonPerdida: RAZON_PERDIDA_LABELS[parsed.razonPerdida],
      fechaUltimoContacto: fechaDia,
      toquesHechos: renderToquesHechos(todosLosToques),
    });

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle: `perdida on_hold: ${parsed.razonPerdida}`,
      })
      .run();

    return {
      toque: leerToqueEscrito(tx, Number(insertado.lastInsertRowid)),
      empresa: leerEmpresaEscrita(tx, parsed.idEmpresa),
      transicion: huboTransicion ? { de: emp.estadoNotion, a: ESTADO_ON_HOLD } : null,
    };
  });
}

// --- aliado (de quien es la cuenta) ---------------------------------------------------
//
// La evidencia con la que viaja CUALQUIER clasificacion que salga de aca. Es el requisito que
// hizo falta el 2026-08-04: nueve tandas sobre 95 cuentas costaron diez consultas y cuatro
// correcciones, y cada correccion obligo a rehacer la lista entera porque no habia forma de ver
// que regla habia clasificado a cada cuenta ni con que valor. Una lista que no se puede auditar
// se rehace a mano, que es el trabajo que todo esto viene a quitar.
export type Evidencia = {
  campo: string;
  // El valor que disparo la regla. null cuando la regla se disparo por la AUSENCIA del valor,
  // que es un caso distinto y tiene que poder distinguirse a simple vista.
  valor: string | null;
  fuente: string | null;
  fecha: string | null;
  quien: string | null;
};

export type ClasificacionAliado = {
  aliado: Aliado;
  // false SOLO cuando nadie miro. ninguno_verificado es verificado:true, y esa es la diferencia
  // que costo dos cuentas en una lista de llamadas.
  verificado: boolean;
  // Texto visible cuando la cuenta entra sin verificar. null cuando hay dato. Existe para que la
  // advertencia viaje con la fila y no dependa de que quien pinte la lista se acuerde de mirar
  // el booleano de al lado.
  advertencia: string | null;
  // El id de la cuenta HERMANA de la que salio el valor, cuando no salio de esta cuenta. null
  // cuando el dato es propio.
  heredadoDe: string | null;
  evidencia: Evidencia;
};

const EVIDENCIA_VACIA: Evidencia = { campo: 'aliado', valor: null, fuente: null, fecha: null, quien: null };

function clasificacionSinVerificar(): ClasificacionAliado {
  return {
    aliado: 'sin_verificar',
    verificado: false,
    advertencia: ADVERTENCIA_SIN_VERIFICAR,
    heredadoDe: null,
    evidencia: { ...EVIDENCIA_VACIA },
  };
}

type FilaAliado = {
  idEmpresa: string;
  aliado: string | null;
  aliadoFuente: string | null;
  aliadoFecha: string | null;
  aliadoQuien: string | null;
  idEmpresaMatriz: string | null;
};

function leerFilaAliado(lector: typeof db | Tx, idEmpresa: string, idOrganizacion: number): FilaAliado | undefined {
  return lector
    .select({
      idEmpresa: empresa.idEmpresa,
      aliado: empresa.aliado,
      aliadoFuente: empresa.aliadoFuente,
      aliadoFecha: empresa.aliadoFecha,
      aliadoQuien: empresa.aliadoQuien,
      idEmpresaMatriz: empresa.idEmpresaMatriz,
    })
    .from(empresa)
    .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
    .get();
}

function evidenciaDe(fila: FilaAliado): Evidencia {
  return {
    campo: 'aliado',
    valor: fila.aliado,
    fuente: fila.aliadoFuente,
    fecha: fila.aliadoFecha,
    quien: fila.aliadoQuien,
  };
}

// La regla, sin base de datos. Se separa de la lectura porque corre en dos sitios con formas
// distintas de traer los datos: una cuenta suelta (dos queries) y una lista de 476 (dos queries
// para TODAS, ver cuentasParaReconciliar). Si la regla viviera dentro del acceso a datos, la
// version de lista tendria que reimplementarla y las dos se desincronizarian, que es como se
// producen dos respuestas distintas a la misma pregunta.
//
// `hermanaConfirmada` es la cuenta del mismo grupo que SI tiene un aliado confirmado, o null. El
// que la busca decide como; aca solo se decide que hacer con ella.
export function clasificarAliadoDeFila(fila: FilaAliado | undefined, hermanaConfirmada: FilaAliado | null): ClasificacionAliado {
  // Una cuenta que no existe (o que es de otra organizacion) tampoco se descarta a ciegas: se
  // reporta como no verificada, que es la verdad, en vez de lanzar y dejar la lista sin la fila.
  if (!fila) return clasificacionSinVerificar();

  if (fila.aliado) {
    return {
      aliado: fila.aliado as Aliado,
      verificado: true,
      advertencia: null,
      heredadoDe: null,
      evidencia: evidenciaDe(fila),
    };
  }

  if (hermanaConfirmada) {
    return {
      aliado: hermanaConfirmada.aliado as Aliado,
      verificado: true,
      advertencia: null,
      heredadoDe: hermanaConfirmada.idEmpresa,
      evidencia: evidenciaDe(hermanaConfirmada),
    };
  }

  return clasificacionSinVerificar();
}

// Las cuentas del grupo que SI tienen un aliado confirmado, indexadas por matriz.
//
// Solo CONFIRMADOS. Un ninguno_verificado de la hermana no se propaga: dice que la hermana no es
// de un aliado, no dice nada de esta cuenta, y heredarlo fabricaria el dato negativo que toda
// esta columna existe para impedir.
function hermanasConfirmadas(lector: typeof db | Tx, matrices: string[]): Map<string, FilaAliado> {
  const mapa = new Map<string, FilaAliado>();
  if (matrices.length === 0) return mapa;

  const filas = lector
    .select({
      idEmpresa: empresa.idEmpresa,
      aliado: empresa.aliado,
      aliadoFuente: empresa.aliadoFuente,
      aliadoFecha: empresa.aliadoFecha,
      aliadoQuien: empresa.aliadoQuien,
      idEmpresaMatriz: empresa.idEmpresaMatriz,
    })
    .from(empresa)
    .where(and(inArray(empresa.idEmpresaMatriz, matrices), inArray(empresa.aliado, [...ALIADOS_CONFIRMADOS])))
    .orderBy(asc(empresa.idEmpresa))
    .all();

  // La primera por id gana, para que la respuesta sea la misma en dos corridas seguidas. Un grupo
  // con dos aliados distintos es un dato contradictorio y se resuelve marcando la cuenta, no
  // eligiendo al azar en cada lectura.
  for (const f of filas) {
    if (f.idEmpresaMatriz && !mapa.has(f.idEmpresaMatriz)) mapa.set(f.idEmpresaMatriz, f);
  }
  return mapa;
}

// De quien es una cuenta, con la evidencia de por que se dice eso.
//
// LEE, NO ESCRIBE, ni siquiera cuando hereda. Escribir el valor heredado dejaria sobre la cuenta
// un dato que nadie afirmo sobre ella, y al dia siguiente nadie podria distinguirlo de uno
// verificado: la herencia se recalcula en cada lectura y por eso siempre dice de donde salio.
export function clasificarAliado(idEmpresa: string, idOrganizacion: number): ClasificacionAliado {
  const fila = leerFilaAliado(db, idEmpresa, idOrganizacion);
  if (!fila) return clasificacionSinVerificar();
  if (fila.aliado || !fila.idEmpresaMatriz) return clasificarAliadoDeFila(fila, null);

  const hermana = hermanasConfirmadas(db, [fila.idEmpresaMatriz]).get(fila.idEmpresaMatriz) ?? null;
  // La cuenta no se hereda a si misma: sin esto, una cuenta ya marcada que ademas es la primera
  // de su grupo se reportaria como heredada de ella misma.
  return clasificarAliadoDeFila(fila, hermana && hermana.idEmpresa !== idEmpresa ? hermana : null);
}

// fuente y quien son OBLIGATORIOS, no un extra. Es la regla de procedencia del brain: un dato
// sensible entra con su fuente o no entra. Un aliado sin quien lo dijo es justo el dato que
// nadie puede auditar despues, y esta columna nace de un error de auditoria.
const marcarAliadoSchema = z.object({
  idEmpresa: z.string().min(1),
  aliado: z.enum(ALIADOS),
  fuente: z.string().min(1),
  quien: z.string().min(1),
  // El dia en que se verifico. Default hoy; se manda explicito cuando el dato se verifico antes
  // y se esta registrando despues.
  fecha: fechaDiaSchema.optional(),
  nota: z.string().min(1).optional(),
});
export type MarcarAliadoInput = z.input<typeof marcarAliadoSchema>;

export type MarcarAliadoResultado = {
  idEmpresa: string;
  clasificacion: ClasificacionAliado;
};

export function marcarAliado(input: MarcarAliadoInput, idOrganizacion: number): MarcarAliadoResultado {
  const parsed = marcarAliadoSchema.parse(input);
  const instante = new Date();
  const fecha = parsed.fecha ?? fechaBogotaISO(instante);

  return db.transaction((tx) => {
    const fila = leerFilaAliado(tx, parsed.idEmpresa, idOrganizacion);
    if (!fila) throw new Error(`Empresa ${parsed.idEmpresa} no existe o no esta activa en la organizacion ${idOrganizacion}`);

    tx.update(empresa)
      .set({
        aliado: parsed.aliado,
        aliadoFuente: parsed.fuente,
        aliadoFecha: fecha,
        aliadoQuien: parsed.quien,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .run();

    // El rastro, con el valor ANTERIOR: una cuenta que pasa de sae_plus a ninguno_verificado es
    // un cambio que alguien va a querer poder discutir, y sin el antes no se puede.
    tx.insert(syncCambios)
      .values({
        fecha: instante.toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle:
          `aliado: ${fila.aliado ?? 'sin_verificar'} -> ${parsed.aliado} | fuente ${parsed.fuente} | ` +
          `lo dijo ${parsed.quien}${parsed.nota ? ` | ${parsed.nota}` : ''}`,
      })
      .run();

    // Relectura desde la fila escrita, no desde el input. Se reusa la traduccion de
    // clasificarAliado para que la escritura y la lectura no puedan divergir.
    const escrita = leerFilaAliado(tx, parsed.idEmpresa, idOrganizacion)!;
    return {
      idEmpresa: parsed.idEmpresa,
      clasificacion: {
        aliado: escrita.aliado as Aliado,
        verificado: true,
        advertencia: null,
        heredadoDe: null,
        evidencia: evidenciaDe(escrita),
      },
    };
  });
}

// --- descarte (por que la cuenta no entra a la lista) ---------------------------------

export type ClasificacionDescarte = {
  // true cuando la cuenta NO entra a la lista hoy. Una congelada vencida da false aunque tenga
  // motivo escrito: el motivo dice que paso, `descartada` dice que pasa hoy.
  descartada: boolean;
  motivo: MotivoDescarte | null;
  nota: string | null;
  // Solo la congelada la tiene. null en los demas motivos, que no vencen.
  fechaRetorno: string | null;
  // Si el descarte sigue en pie. Para los motivos sin reloj es igual a `descartada`; para la
  // congelada es lo que cambia solo el dia del retorno.
  vigente: boolean;
  evidencia: Evidencia;
};

type FilaDescarte = {
  motivoDescarte: string | null;
  motivoDescarteNota: string | null;
  descarteFecha: string | null;
  descarteQuien: string | null;
  fechaRetorno: string | null;
};

function leerFilaDescarte(lector: typeof db | Tx, idEmpresa: string, idOrganizacion: number): FilaDescarte | undefined {
  return lector
    .select({
      motivoDescarte: empresa.motivoDescarte,
      motivoDescarteNota: empresa.motivoDescarteNota,
      descarteFecha: empresa.descarteFecha,
      descarteQuien: empresa.descarteQuien,
      fechaRetorno: empresa.fechaRetorno,
    })
    .from(empresa)
    .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
    .get();
}

const SIN_DESCARTE: ClasificacionDescarte = {
  descartada: false,
  motivo: null,
  nota: null,
  fechaRetorno: null,
  vigente: false,
  evidencia: { campo: 'motivo_descarte', valor: null, fuente: null, fecha: null, quien: null },
};

// La regla, sin base de datos, para que la lectura de una cuenta y la de una lista de 476 no
// puedan divergir. Mismo criterio que clasificarAliadoDeFila.
//
// `hoy` entra como parametro y no se lee de un reloj adentro: una funcion que consulta la hora es
// una funcion que no se puede probar en dos dias distintos, y probar los dos lados del
// vencimiento es justo lo que hace util a esta columna.
export function clasificarDescarteDeFila(fila: FilaDescarte | undefined, hoy: string): ClasificacionDescarte {
  if (!fila?.motivoDescarte) return { ...SIN_DESCARTE, evidencia: { ...SIN_DESCARTE.evidencia } };

  const motivo = fila.motivoDescarte as MotivoDescarte;
  // El vencimiento se evalua al LEER, no con un barrido nocturno que alguien tenga que acordarse
  // de correr. Comparacion de strings ISO, que en YYYY-MM-DD ordena igual que las fechas.
  const vencida = motivo === MOTIVO_DESCARTE_CON_RETORNO && fila.fechaRetorno != null && hoy >= fila.fechaRetorno;

  return {
    // El motivo NO se borra al vencer: la cuenta vuelve a la lista y el historial sigue diciendo
    // que estuvo congelada y hasta cuando. Sin eso, una cuenta reaparece sin explicacion.
    descartada: !vencida,
    motivo,
    nota: fila.motivoDescarteNota,
    fechaRetorno: fila.fechaRetorno,
    vigente: !vencida,
    evidencia: {
      campo: 'motivo_descarte',
      valor: motivo,
      fuente: 'herramienta',
      fecha: fila.descarteFecha,
      quien: fila.descarteQuien,
    },
  };
}

export function clasificarDescarte(idEmpresa: string, idOrganizacion: number, hoy: string): ClasificacionDescarte {
  return clasificarDescarteDeFila(leerFilaDescarte(db, idEmpresa, idOrganizacion), hoy);
}

// motivo NULLABLE a proposito: es como se LEVANTA un descarte mal puesto. Sin eso, una cuenta
// sacada de la lista por error se queda afuera para siempre o hay que corregirla por SQL.
const marcarDescarteSchema = z
  .object({
    idEmpresa: z.string().min(1),
    motivo: z.enum(MOTIVOS_DESCARTE).nullable(),
    nota: z.string().min(1).optional(),
    fechaRetorno: fechaDiaSchema.optional(),
    fuente: z.string().min(1),
    quien: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    // El invariante que hace util a la fecha. Una congelada sin fecha es una cuenta que sale de la
    // lista y no tiene nada que la devuelva: exactamente el hold que cae al fondo de la columna y
    // que nadie vuelve a abrir.
    if (data.motivo === MOTIVO_DESCARTE_CON_RETORNO && !data.fechaRetorno) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaRetorno'],
        message: "fechaRetorno es obligatoria cuando el motivo es 'congelada': sin fecha la cuenta sale de la lista y nada la devuelve",
      });
    }
    // Al reves tambien: una fecha de retorno sobre un motivo que no vence promete un regreso que
    // nunca va a ocurrir, porque nadie la va a mirar.
    if (data.fechaRetorno && data.motivo !== MOTIVO_DESCARTE_CON_RETORNO) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaRetorno'],
        message: `fechaRetorno solo aplica con motivo '${MOTIVO_DESCARTE_CON_RETORNO}': los demas motivos no vencen`,
      });
    }
  });
export type MarcarDescarteInput = z.input<typeof marcarDescarteSchema>;

export type MarcarDescarteResultado = {
  idEmpresa: string;
  clasificacion: ClasificacionDescarte;
};

export function marcarDescarte(input: MarcarDescarteInput, idOrganizacion: number): MarcarDescarteResultado {
  const parsed = marcarDescarteSchema.parse(input);
  const instante = new Date();
  const hoy = fechaBogotaISO(instante);

  return db.transaction((tx) => {
    const antes = leerFilaDescarte(tx, parsed.idEmpresa, idOrganizacion);
    if (!antes) throw new Error(`Empresa ${parsed.idEmpresa} no existe o no esta activa en la organizacion ${idOrganizacion}`);

    // Levantar un descarte limpia las cinco columnas: dejar la nota o el quien de un descarte que
    // ya no existe deja evidencia colgando de nada. Lo que queda del levantamiento es la fila de
    // sync_cambios de abajo, con el antes y el motivo del cambio.
    tx.update(empresa)
      .set({
        motivoDescarte: parsed.motivo,
        motivoDescarteNota: parsed.nota ?? null,
        descarteFecha: parsed.motivo ? hoy : null,
        descarteQuien: parsed.motivo ? parsed.quien : null,
        fechaRetorno: parsed.motivo ? (parsed.fechaRetorno ?? null) : null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .run();

    tx.insert(syncCambios)
      .values({
        fecha: instante.toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle:
          `descarte: ${antes.motivoDescarte ?? 'ninguno'} -> ${parsed.motivo ?? 'levantado'}` +
          `${parsed.fechaRetorno ? ` | vuelve ${parsed.fechaRetorno}` : ''} | fuente ${parsed.fuente} | ` +
          `lo dijo ${parsed.quien}${parsed.nota ? ` | ${parsed.nota}` : ''}`,
      })
      .run();

    return {
      idEmpresa: parsed.idEmpresa,
      clasificacion: clasificarDescarteDeFila(leerFilaDescarte(tx, parsed.idEmpresa, idOrganizacion), hoy),
    };
  });
}

// La tarea del operador que tiene quieta a la cuenta. tarea NULLABLE = se destrabo.
//
// Existe por la misma razon que cada write path de este proyecto: una columna sin accion que la
// escriba es una columna que se queda vacia para siempre. Las tres de transcript vivieron meses asi.
const marcarTareaBloqueanteSchema = z.object({
  idEmpresa: z.string().min(1),
  tarea: z.string().min(1).nullable(),
  quien: z.string().min(1),
  // Desde cuando esta quieta. Default hoy. Se manda explicito cuando el bloqueo empezo antes y se
  // esta registrando ahora, que es el caso normal al descubrirlo: lo que duele no es que este
  // bloqueada, es que lleve dos semanas asi.
  desde: fechaDiaSchema.optional(),
});
export type MarcarTareaBloqueanteInput = z.input<typeof marcarTareaBloqueanteSchema>;

export function marcarTareaBloqueante(input: MarcarTareaBloqueanteInput, idOrganizacion: number) {
  const parsed = marcarTareaBloqueanteSchema.parse(input);
  const instante = new Date();
  const hoy = fechaBogotaISO(instante);

  return db.transaction((tx) => {
    const antes = tx
      .select({ tareaBloqueante: empresa.tareaBloqueante, tareaBloqueanteDesde: empresa.tareaBloqueanteDesde })
      .from(empresa)
      .where(and(eq(empresa.idEmpresa, parsed.idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
      .get();
    if (!antes) throw new Error(`Empresa ${parsed.idEmpresa} no existe o no esta activa en la organizacion ${idOrganizacion}`);

    // Si YA estaba bloqueada por lo mismo, la fecha NO se mueve. Reescribirla cada vez que alguien
    // vuelve a marcar el bloqueo borraria el dato que importa: cuanto lleva quieta.
    const mismaTarea = parsed.tarea != null && parsed.tarea === antes.tareaBloqueante;
    const desde = parsed.tarea == null ? null : mismaTarea ? (antes.tareaBloqueanteDesde ?? parsed.desde ?? hoy) : (parsed.desde ?? hoy);

    tx.update(empresa)
      .set({
        tareaBloqueante: parsed.tarea,
        tareaBloqueanteDesde: desde,
        tareaBloqueanteQuien: parsed.tarea ? parsed.quien : null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .run();

    tx.insert(syncCambios)
      .values({
        fecha: instante.toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle: `tarea bloqueante: ${antes.tareaBloqueante ?? 'ninguna'} -> ${parsed.tarea ?? 'destrabada'} | lo dijo ${parsed.quien}`,
      })
      .run();

    const escrita = tx
      .select({
        tareaBloqueante: empresa.tareaBloqueante,
        tareaBloqueanteDesde: empresa.tareaBloqueanteDesde,
        tareaBloqueanteQuien: empresa.tareaBloqueanteQuien,
      })
      .from(empresa)
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .get()!;

    return {
      idEmpresa: parsed.idEmpresa,
      bloqueada: escrita.tareaBloqueante != null,
      tarea: escrita.tareaBloqueante,
      // Cuantos dias lleva quieta, que es la mitad del dato y la razon de que la fecha no se mueva.
      desde: escrita.tareaBloqueanteDesde,
      diasBloqueada:
        escrita.tareaBloqueanteDesde == null
          ? null
          : Math.floor((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${escrita.tareaBloqueanteDesde}T00:00:00Z`)) / 86400000),
      quien: escrita.tareaBloqueanteQuien,
    };
  });
}

// --- tandas (armar la lista del dia) ---------------------------------------------------
//
// Trae TODO lo que la clasificacion necesita en CINCO queries para las ~1.965 cuentas, no una por
// cuenta. Es la diferencia entre una accion y las diez consultas distintas que costo armar esto a
// mano el 2026-08-04.
//
// La regla no vive aca: vive en app/core/tandas.ts, pura y probada aparte. Este bloque solo lee y
// arma. Mezclarlas obligaria a montar una base para probar el orden de las reglas, que es
// justamente lo que hay que poder cambiar sin miedo.
// `hoy` entra por parametro y no se lee de un reloj adentro. La app tiene un reloj de demo por
// request (app/lib/reloj.ts) que corre la fecha en modo prueba; si esta funcion consultara la fecha
// real por su cuenta, en modo prueba el vencimiento de una congelada se evaluaria contra un dia y la
// tanda contra otro, y las dos mitades de la misma pantalla se contradirian.
export function cuentasParaTandas(idOrganizacion: number, hoy: string): CuentaParaTanda[] {
  const filas = db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      owner: empresa.owner,
      estadoNotion: empresa.estadoNotion,
      aliadoCol: empresa.aliado,
      aliadoFuente: empresa.aliadoFuente,
      aliadoFecha: empresa.aliadoFecha,
      aliadoQuien: empresa.aliadoQuien,
      idEmpresaMatriz: empresa.idEmpresaMatriz,
      motivoDescarte: empresa.motivoDescarte,
      motivoDescarteNota: empresa.motivoDescarteNota,
      descarteFecha: empresa.descarteFecha,
      descarteQuien: empresa.descarteQuien,
      fechaRetorno: empresa.fechaRetorno,
      tareaBloqueante: empresa.tareaBloqueante,
      tareaBloqueanteDesde: empresa.tareaBloqueanteDesde,
      proximoCanal: empresa.proximoCanal,
      usuarios: empresaUsuarios.usuariosEfectivos,
      // De donde salio el tamano. Se prefiere la fuente de los REALES cuando hay reales; si no, la
      // de los estimados. usuarios_efectivos es COALESCE(reales, estimados), asi que la fuente
      // tiene que seguir el mismo orden o diria de donde salio un numero que no es el que viaja.
      usuariosRealesFuente: empresaUsuarios.usuariosRealesFuente,
      usuariosReales: empresaUsuarios.usuariosReales,
      usuariosEstFuente: empresaUsuarios.usuariosEstFuente,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    // empresa_viva: una filial absorbida (opera_bajo_id) no es una cuenta que se llame aparte de su
    // matriz. Aca SI aplica el filtro, al reves que en cuentasParaReconciliar: esto arma una lista
    // de llamadas, no un cruce contra Notion.
    .where(and(eq(empresa.organizacionActivaId, idOrganizacion), isNull(empresa.operaBajoId)))
    .orderBy(asc(empresa.nombreOficial))
    .all();

  const ids = filas.map((f) => f.idEmpresa);
  // Que cuentas tienen ALGUN canal marcado como muerto. Una sola query para todas. Solo 'muerto'
  // saca a la cuenta: 'sin_dato' es que nadie verifico la linea, y eso no es motivo para dejar de
  // llamar (misma regla que aliado, la ausencia no es un dato negativo).
  const canalesMuertos = new Set<string>();
  if (ids.length > 0) {
    for (const [idEmpresa, porCanal] of estadosDeCanales(ids, idOrganizacion)) {
      for (const c of porCanal.values()) {
        if (c.estado === 'muerto') { canalesMuertos.add(idEmpresa); break; }
      }
    }
  }
  const matrices = [...new Set(filas.map((f) => f.idEmpresaMatriz).filter((m): m is string => m != null))];
  const hermanas = hermanasConfirmadas(db, matrices);

  // Los toques de TODAS las cuentas de un golpe, agrupados en memoria. Incluye los entrantes de
  // WhatsApp: el contador de racha los necesita para saber que la racha se reinicio.
  const porEmpresa = new Map<string, ToqueParaAgotamiento[]>();
  const ultimoReal = new Map<string, string>();
  if (ids.length > 0) {
    for (const t of db
      .select({
        idEmpresa: toque.idEmpresa,
        resultado: toque.resultado,
        fuente: toque.fuente,
        fechaDia: toque.fechaDia,
        fecha: toque.fecha,
      })
      .from(toque)
      .where(and(inArray(toque.idEmpresa, ids), eq(toque.idOrganizacion, idOrganizacion)))
      .all()) {
      const lista = porEmpresa.get(t.idEmpresa) ?? [];
      lista.push({ resultado: t.resultado as never, fuente: t.fuente, fechaDia: t.fechaDia, fecha: t.fecha });
      porEmpresa.set(t.idEmpresa, lista);
      // El ultimo toque REAL, que responde otra pregunta que la racha: si ya se trabajo la cuenta
      // hoy. Un entrante no cuenta, porque no lo hizo el operador.
      if (t.fuente !== 'whatsapp_entrante') {
        const dia = t.fechaDia ?? t.fecha?.slice(0, 10) ?? '';
        if (dia && dia > (ultimoReal.get(t.idEmpresa) ?? '')) ultimoReal.set(t.idEmpresa, dia);
      }
    }
  }

  // Quien esta en una cadencia VIVA. Una inscripcion terminada no cuenta: la cuenta volvio a estar
  // sola, que es justo lo que la tanda sin_campana quiere ver.
  const conCadencia = new Set(
    ids.length === 0
      ? []
      : db
          .select({ idEmpresa: inscripcion.idEmpresa })
          .from(inscripcion)
          .where(and(inArray(inscripcion.idEmpresa, ids), eq(inscripcion.estado, 'activa')))
          .all()
          .map((r) => r.idEmpresa),
  );

  return filas.map((f) => {
    const propia: FilaAliado = {
      idEmpresa: f.idEmpresa,
      aliado: f.aliadoCol,
      aliadoFuente: f.aliadoFuente,
      aliadoFecha: f.aliadoFecha,
      aliadoQuien: f.aliadoQuien,
      idEmpresaMatriz: f.idEmpresaMatriz,
    };
    const hermana = f.idEmpresaMatriz ? (hermanas.get(f.idEmpresaMatriz) ?? null) : null;
    return {
      idEmpresa: f.idEmpresa,
      nombre: f.nombre,
      owner: f.owner,
      estadoNotion: f.estadoNotion,
      usuarios: f.usuarios,
      usuariosFuente: f.usuariosReales != null ? f.usuariosRealesFuente : f.usuariosEstFuente,
      aliado: clasificarAliadoDeFila(propia, hermana && hermana.idEmpresa !== f.idEmpresa ? hermana : null),
      descarte: clasificarDescarteDeFila(f, hoy),
      tareaBloqueante: f.tareaBloqueante,
      tareaBloqueanteDesde: f.tareaBloqueanteDesde,
      proximoCanal: f.proximoCanal,
      tieneCadencia: conCadencia.has(f.idEmpresa),
      canalMuerto: canalesMuertos.has(f.idEmpresa),
      toques: porEmpresa.get(f.idEmpresa) ?? [],
      ultimoToqueDia: ultimoReal.get(f.idEmpresa) ?? null,
    };
  });
}

// write-path del MCP (2026-07-24). cambiarCadencia reprograma el seguimiento de UNA empresa
// (proximo_follow_up_fecha / proximo_canal / proximo_paso) y, opcionalmente, la mueve a otra
// cadencia (inscribirEmpresaEnCadencia, que ya existe pero no tenia caller de app -- ver
// docs/operar-data.md Receta 3). Reusa el dominio existente, no duplica SQL de inscripcion.
//
// La inscripcion (si se pide idCampana) corre en su propia transaccion adentro de
// inscribirEmpresaEnCadencia; la reprogramacion + outbox van en una segunda transaccion. Son
// dos operaciones (mismo criterio que sacar/inscribir en la Receta 3): si la inscripcion
// falla, lanza y no se reprograma; si la reprogramacion falla despues de inscribir, la
// inscripcion ya quedo (caso raro, un UPDATE simple). Se documenta por si un humano lo revisa.
const cambiarCadenciaSchema = z
  .object({
    idEmpresa: z.string().min(1),
    idCampana: z.number().int().positive().optional(),
    proximoFollowUp: z.string().min(1).optional(),
    proximoCanal: z.string().min(1).optional(),
    proximoPaso: z.string().min(1).optional(),
    // Opt-in explicito para armar el envio de correo de la campana al inscribir. Ver la nota
    // larga en cambiarCadencia: sin esto, inscribir en una campana con pasos de correo produce
    // correos que no salen nunca y nada avisa. Es opt-in y no default porque
    // aprobada_envio_gmail es de la CAMPANA, no de la empresa: prenderla tambien desbloquea a
    // todos los que ya estaban inscritos ahi.
    armarEnvioCorreo: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.idCampana === undefined && !data.proximoFollowUp && !data.proximoCanal && !data.proximoPaso) {
      ctx.addIssue({
        code: 'custom',
        message: 'cambiarCadencia requiere al menos idCampana o un campo de reprogramacion (proximoFollowUp/proximoCanal/proximoPaso)',
      });
    }
  });
export type CambiarCadenciaInput = z.infer<typeof cambiarCadenciaSchema>;

export type CambiarCadenciaResultado = {
  empresa: EmpresaEscrita;
  // Las cadencias VIVAS de la empresa despues del cambio, releidas. Es la mitad del resultado
  // que la empresa sola no muestra: reprogramar la fecha y moverla de cadencia son dos efectos
  // distintos, y devolver solo la fila de empresa esconde el segundo.
  cadencias: { idInscripcion: number; idCampana: number; campana: string | null; estado: string; pasoActual: number | null }[];
  // Lo que devolvio inscribirEmpresaEnCadencia cuando se pidio mover de cadencia. null cuando
  // solo se reprogramo. Se expone porque puede decir 'ya_inscrita' y eso no es un error, pero
  // tampoco es un cambio: sin esto, "no pasó nada" y "ya estaba" se ven igual.
  inscripcion: ResultadoInscripcionEmpresa | null;
  // El diagnostico de si el correo de esa campana va a salir, RELEIDO despues de escribir.
  // null cuando no se inscribio en ninguna campana. Viaja siempre, incluso cuando todo esta
  // bien: el modo de falla que cierra es "se inscribio, se ve exitoso, y el correo esta muerto".
  envioCorreo: EstadoEnvioCorreo | null;
  // Lo que esta llamada cambio SIN que nadie lo pidiera (2026-07-28). Hoy tiene un solo caso y
  // es el que costo una noche: inscribir pone la campana en 'activa' (linea fija de
  // inscribirEmpresaEnCadencia), y con eso lanzar_campana deja de tomarla para siempre, porque
  // solo lanza borradores. Quien inscribia cuenta por cuenta cerraba esa puerta el mismo y se
  // enteraba despues, cuando ya no habia forma de empujar a mano y solo quedaba esperar la
  // ventana del dia siguiente. El aviso no cambia el comportamiento: cambia que se sepa antes.
  advertencias: string[];
};

function leerCadenciasVivas(idEmpresa: string): CambiarCadenciaResultado['cadencias'] {
  return db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      idCampana: inscripcion.idCampana,
      campana: campana.nombre,
      estado: inscripcion.estado,
      pasoActual: inscripcion.pasoActual,
    })
    .from(inscripcion)
    .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(inscripcion.idEmpresa, idEmpresa), isNull(inscripcion.fechaFin)))
    .orderBy(desc(inscripcion.idInscripcion))
    .all();
}

// Devuelve la empresa RELEIDA con su proximo follow-up y sus cadencias vivas (2026-07-25,
// regla 18: una escritura devuelve lo que quedo escrito). Antes devolvia void y el MCP
// respondia { ok: true }, o sea que reprogramar una cuenta no dejaba forma de comprobar la
// fecha que quedo sin ir a mirar la base aparte.
export function cambiarCadencia(input: CambiarCadenciaInput, idOrganizacion: number): CambiarCadenciaResultado {
  const parsed = cambiarCadenciaSchema.parse(input);

  const emp = db
    .select({ organizacionActivaId: empresa.organizacionActivaId })
    .from(empresa)
    .where(eq(empresa.idEmpresa, parsed.idEmpresa))
    .get();
  if (!emp) throw new Error(`Empresa ${parsed.idEmpresa} no existe`);
  if (emp.organizacionActivaId !== idOrganizacion) {
    throw new Error(`La empresa ${parsed.idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
  }

  // GATE DE CORREO MUERTO (2026-07-28). Inscribir una empresa en una campana con pasos de
  // correo materializaba filas que no salian NUNCA y nadie se enteraba: el descarte vive en
  // agruparPendientesCorreo como un `continue` pelado, sin error, sin marcar la fila 'fallo',
  // y la fila se queda 'pendiente' para siempre. La compuerta (aprobada_envio_gmail) solo la
  // prende marcarCampanaAprobadaGmail, que llaman lanzar_campana (bulk sobre un segmento
  // entero) y el boton "Lanzar hoy" de la web. cambiarCadencia no la tocaba.
  //
  // Se chequea ANTES de inscribir y se lanza en vez de escribir a medias: una inscripcion cuyo
  // correo esta muerto es peor que no inscribir, porque se ve igual que una que funciona. El
  // error dice las tres compuertas por su nombre y cuantas otras inscripciones se
  // desbloquearian al armar, para que el opt-in sea informado y no a ciegas.
  if (parsed.idCampana !== undefined) {
    const previo = estadoEnvioCorreo(parsed.idCampana, idOrganizacion);
    if (!previo) throw new Error(`La campana ${parsed.idCampana} no existe en la organizacion ${idOrganizacion}`);
    if (previo.tieneCorreo && !previo.saldra && parsed.armarEnvioCorreo !== true) {
      // 'estado' no se cuenta como bloqueo aca: una campana en 'borrador' pasa a 'activa' en
      // el mismo inscribirEmpresaEnCadencia de abajo, asi que exigirlo antes seria pedir algo
      // que esta llamada misma va a arreglar.
      const reales = previo.bloqueos.filter((b) => !b.includes("esta en estado 'borrador'"));
      if (reales.length > 0) {
        const otras = db
          .select({ n: sql<number>`count(*)` })
          .from(inscripcion)
          .where(and(eq(inscripcion.idCampana, parsed.idCampana), inArray(inscripcion.estado, ['activa', 'bloqueada'])))
          .get()?.n ?? 0;
        throw new Error(
          `cambiarCadencia: la campana ${parsed.idCampana} tiene ${previo.pasosCorreo} paso(s) de correo que NO van a salir. ` +
            `No se inscribio a ${parsed.idEmpresa}: una inscripcion con el correo muerto se ve igual que una que funciona. ` +
            `Bloqueos: ${reales.join(' | ')}. ` +
            `Para armarla y seguir, repetir con armarEnvioCorreo: true -- eso escribe proveedor_campana_id y ` +
            `aprobada_envio_gmail=1 en la CAMPANA, asi que tambien desbloquea a las ${otras} inscripcion(es) que ya tiene.` +
            (previo.bloqueos.some((b) => b.includes('es_manual=1'))
              ? ' Ojo: armarEnvioCorreo NO toca es_manual. Los pasos marcados manuales seguiran esperando aprobacion uno por uno.'
              : ''),
        );
      }
    }
  }

  // Se lee ANTES de inscribir: despues ya no se puede saber si la transicion la causo esta
  // llamada o si la campana ya estaba activa.
  const estadoCampanaPrevio =
    parsed.idCampana !== undefined
      ? (db.select({ estado: campana.estado }).from(campana).where(eq(campana.idCampana, parsed.idCampana)).get()?.estado ?? null)
      : null;

  let inscripcionResultado: ResultadoInscripcionEmpresa | null = null;
  if (parsed.idCampana !== undefined) {
    inscripcionResultado = inscribirEmpresaEnCadencia(parsed.idEmpresa, parsed.idCampana);
    // Armar DESPUES de inscribir, no antes: si la inscripcion falla, la campana queda como
    // estaba y no se le abre el envio a nadie. Al reves, una campana armada con una
    // inscripcion que reventó empezaria a mandarle a los que ya estaban.
    if (parsed.armarEnvioCorreo === true && inscripcionResultado.ok) {
      const ahora = new Date().toISOString();
      const idCampana = parsed.idCampana;
      db.transaction((tx) => armarEnvioCorreoEnTx(tx, idCampana, ahora));
    }
  }

  const envioCorreo = parsed.idCampana !== undefined ? estadoEnvioCorreo(parsed.idCampana, idOrganizacion) : null;

  const advertencias: string[] = [];
  if (estadoCampanaPrevio === 'borrador' && inscripcionResultado?.ok) {
    advertencias.push(
      `la campana ${parsed.idCampana} paso de 'borrador' a 'activa' al inscribir. Consecuencia que no avisaba nadie: ` +
        'lanzar_campana ya NO la toma (solo lanza campanas que nunca se lanzaron), asi que el empujon en modo manual ' +
        'del boton "Lanzar hoy" deja de estar disponible por ese camino. Para que lo inscrito salga YA, sin esperar la ' +
        `ventana de 8:00-18:00: empujar_envios con idCampana ${parsed.idCampana} (o con idsEmpresa para apuntar solo a ` +
        'esta cuenta). Si se queria lanzar el segmento entero en modo manual, ese orden era al reves: primero ' +
        'lanzar_campana, despues las inscripciones sueltas.',
    );
  }

  // Sin reprogramacion (solo se pidio mover de cadencia): no hay nada mas que escribir, pero se
  // relee igual -- el resultado tiene que mostrar como quedo la cuenta, no solo si se escribio.
  if (!parsed.proximoFollowUp && !parsed.proximoCanal && !parsed.proximoPaso) {
    return {
      empresa: leerEmpresaEscrita(db, parsed.idEmpresa),
      cadencias: leerCadenciasVivas(parsed.idEmpresa),
      inscripcion: inscripcionResultado,
      envioCorreo,
      advertencias,
    };
  }

  db.transaction((tx) => {
    const sets: Record<string, unknown> = { updatedAt: sql`datetime('now')` };
    if (parsed.proximoFollowUp) sets.proximoFollowUpFecha = parsed.proximoFollowUp;
    if (parsed.proximoCanal) sets.proximoCanal = parsed.proximoCanal;
    if (parsed.proximoPaso) sets.proximoPaso = parsed.proximoPaso;
    tx.update(empresa).set(sets).where(eq(empresa.idEmpresa, parsed.idEmpresa)).run();

    encolarOutboxNotion(tx, parsed.idEmpresa, {
      ...(parsed.proximoFollowUp ? { fechaProximoPaso: parsed.proximoFollowUp } : {}),
      ...(parsed.proximoPaso ? { proximoPaso: parsed.proximoPaso } : {}),
    });

    tx.insert(syncCambios)
      .values({
        fecha: new Date().toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle: `reprograma seguimiento -> ${parsed.proximoFollowUp ?? '-'} / ${parsed.proximoCanal ?? '-'}`,
      })
      .run();
  });

  return {
    empresa: leerEmpresaEscrita(db, parsed.idEmpresa),
    cadencias: leerCadenciasVivas(parsed.idEmpresa),
    inscripcion: inscripcionResultado,
    // Se relee DESPUES del update de empresa: el diagnostico que viaja es el estado final, no
    // el que se leyo a mitad de camino.
    envioCorreo: parsed.idCampana !== undefined ? estadoEnvioCorreo(parsed.idCampana, idOrganizacion) : envioCorreo,
    advertencias,
  };
}

// --- Aplazar un seguimiento (lo que NO se hizo) ---------------------------------------
//
// cambiarCadencia reprograma y PISA proximo_follow_up_fecha: la fecha incumplida se pierde y
// la cuenta se ve igual de sana que una que nunca se corrio. aplazarSeguimiento escribe el
// evento ANTES de mover la fecha, en la misma transaccion, asi que correr una cuenta cinco
// veces deja cinco filas y se puede contar.
//
// NO registra un toque, a proposito: aplazar no es actividad. Meterlo como toque inflaria el
// conteo de trabajo hecho con trabajo que justamente no se hizo.
//
// Sin follow-up programado no hay aplazo posible: se lanza en vez de inventar la fecha
// incumplida (poner hoy, o null, seria fabricar el dato que da sentido a la fila).
const aplazarSeguimientoSchema = z.object({
  idEmpresa: z.string().min(1),
  fechaNueva: z.string().min(1),
  // Motivo cerrado en cuatro valores (MOTIVOS_APLAZO). Un texto libre no se puede contar:
  // la pregunta que esto responde es "de las 12 veces que se corrio algo esta semana,
  // cuantas fueron por plan irreal y cuantas por evitar una cuenta". El detalle en prosa
  // va en `nota`, que no lo reemplaza.
  motivo: z.enum(MOTIVOS_APLAZO).optional(),
  nota: z.string().min(1).optional(),
  // Mismo default que ejecutadoPor en un toque (2026-07-25, orden del operador): hoy el unico
  // que aplaza dictando es el, y un campo que nunca se llena no protege nada. Se sigue pudiendo
  // pasar explicito cuando aplace otra persona.
  aplazadoPor: z.string().min(1).optional().default(EJECUTOR_POR_DEFECTO),
});
// z.input: aplazadoPor tiene default, asi que el caller no esta obligado a mandarlo.
export type AplazarSeguimientoInput = z.input<typeof aplazarSeguimientoSchema>;

export type AplazoEscrito = {
  id: number;
  idEmpresa: string;
  fechaIncumplida: string;
  fechaNueva: string;
  motivo: string | null;
  nota: string | null;
  aplazadoPor: string | null;
  idOrganizacion: number;
  createdAt: string | null;
};

export type AplazarSeguimientoResultado = {
  empresa: EmpresaEscrita;
  aplazo: AplazoEscrito;
};

export function aplazarSeguimiento(
  input: AplazarSeguimientoInput,
  idOrganizacion: number,
): AplazarSeguimientoResultado {
  const parsed = aplazarSeguimientoSchema.parse(input);
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    const emp = tx
      .select({
        organizacionActivaId: empresa.organizacionActivaId,
        proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      })
      .from(empresa)
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${parsed.idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(`La empresa ${parsed.idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
    }
    if (!emp.proximoFollowUpFecha) {
      throw new Error(
        `La empresa ${parsed.idEmpresa} no tiene follow-up programado: no hay fecha incumplida que registrar. ` +
          'Para ponerle una fecha por primera vez, usa cambiar_cadencia.',
      );
    }

    const insertado = tx
      .insert(seguimientoAplazado)
      .values({
        idEmpresa: parsed.idEmpresa,
        fechaIncumplida: emp.proximoFollowUpFecha,
        fechaNueva: parsed.fechaNueva,
        // null = no lo dijo. Nunca se rellena con un motivo por defecto ni se deduce.
        motivo: parsed.motivo ?? null,
        nota: parsed.nota ?? null,
        // El schema ya resolvio el default: aca nunca llega vacio.
        aplazadoPor: parsed.aplazadoPor,
        idOrganizacion,
        createdAt: ahora,
      })
      .run();

    tx.update(empresa)
      .set({ proximoFollowUpFecha: parsed.fechaNueva, updatedAt: sql`datetime('now')` })
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .run();

    // Lo mismo que encola cambiarCadencia para la fecha del proximo paso: para Notion esto ES
    // una reprogramacion, la fecha que ve tiene que ser la nueva. El motivo del aplazo NO
    // viaja (no existe en el contrato CambioNotion) y queda solo en la base.
    encolarOutboxNotion(tx, parsed.idEmpresa, { fechaProximoPaso: parsed.fechaNueva });

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle: `aplaza seguimiento ${emp.proximoFollowUpFecha} -> ${parsed.fechaNueva}${parsed.motivo ? `: ${parsed.motivo}` : ''}`,
      })
      .run();

    const aplazo = tx
      .select()
      .from(seguimientoAplazado)
      .where(eq(seguimientoAplazado.id, Number(insertado.lastInsertRowid)))
      .get();
    if (!aplazo) throw new Error(`El aplazo de ${parsed.idEmpresa} no quedo escrito`);

    return { empresa: leerEmpresaEscrita(tx, parsed.idEmpresa), aplazo };
  });
}

// --- Estado de cadencia: lo que la cola no deja ver (2026-08-03) -----------------------
//
// colaDelDia excluye 'lead' por regla del operador (2026-07-15, ver el comentario largo de
// esa funcion) y esa regla sigue siendo correcta: un lead es un contacto dormido y no es
// trabajo del dia. El efecto colateral que nadie habia cerrado es que dejaba los leads
// INVISIBLES: no habia por donde leer su proximo_follow_up_fecha ni saber si tenian una
// secuencia corriendo. Medido el 2026-08-03: 9 cuentas en 'lead' con owner, sin un solo
// toque, sumando 77.434 usuarios, y ninguna forma de mirarlas desde el MCP.
//
// cambiarCadencia devuelve cadencias vivas, pero exige idCampana o un campo de
// reprogramacion, asi que no sirve como lectura: preguntarle "como esta esta cuenta"
// responde con un error de validacion. Esta funcion es la lectura pura que faltaba.
//
// Tres diferencias con leerCadenciasVivas, que es lo unico parecido que habia:
//   - NO filtra por fechaFin: devuelve tambien pausadas y terminadas, que es como se
//     distingue "nunca estuvo en cadencia" de "la sacaron el martes".
//   - baja a nivel de PASO (paso_inscripcion), que es donde vive la fecha programada real.
//   - filtra por owner o por estado, no solo por una empresa suelta.
//
// Sin tope y sin truncar: una lectura que corta en N convierte "no hay mas" en "no te
// mostre mas", y esas dos no se distinguen desde el otro lado.

// Los estados de paso_inscripcion que TODAVIA pueden salir. Mismo criterio que
// ESTADOS_CANDIDATOS_EMPUJON; 'enviada' y 'omitida' son terminales, y 'cancelada' la
// escribe sacarDeCadencia (ver abajo) justamente para que deje de estar aca.
const ESTADOS_PASO_VIVOS = ['pendiente', 'fallo', 'enviando'];

export type PasoDeCadencia = {
  idPasoInscripcion: number;
  idPaso: number;
  orden: number;
  diaOffset: number;
  canal: string;
  estado: string;
  esManual: boolean;
  // El gate de revision humana de WhatsApp: null = nadie leyo el texto, y entonces ese paso
  // NO sale por mas que su fecha ya haya llegado (pasoInscripcionesPendientes).
  aprobadoEn: string | null;
  fechaProgramada: string | null;
  fechaEnviada: string | null;
};

export type InscripcionDeCadencia = {
  idInscripcion: number;
  idCampana: number;
  campana: string | null;
  estadoCampana: string | null;
  estado: string; // activa | pausada | bloqueada | finalizada
  // fechaFin IS NULL. Es el mismo corte que usa leerCadenciasVivas, expuesto como dato para
  // que el consumidor no tenga que deducirlo del estado.
  viva: boolean;
  pasoActual: number | null;
  fechaInscripcion: string | null;
  fechaFin: string | null;
  motivoFin: string | null;
  origenFin: string | null;
  // El primer paso que todavia puede salir, con su fecha programada. null = no queda ninguno
  // (cadencia terminada, o todavia sin materializar).
  proximoPaso: PasoDeCadencia | null;
  pasos: PasoDeCadencia[];
};

export type CadenciaDeEmpresa = {
  idEmpresa: string;
  nombre: string;
  estadoNotion: string | null;
  owner: string | null;
  proximoFollowUpFecha: string | null;
  proximoCanal: string | null;
  proximoPaso: string | null;
  // true si tiene al menos una inscripcion 'activa'. Es la pregunta que dispara la lectura
  // ("esta cuenta esta corriendo una secuencia ahora mismo?") y se responde una sola vez.
  enCadenciaActiva: boolean;
  inscripciones: InscripcionDeCadencia[];
};

const estadoCadenciaSchema = z
  .object({
    idEmpresa: z.string().trim().min(1).optional(),
    owner: z.string().trim().min(1).optional(),
    // estado_notion. 'lead' es el caso que motivo la funcion, pero no se cablea: el filtro es
    // el valor que venga.
    estado: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.idEmpresa && !data.owner && !data.estado) {
      ctx.addIssue({
        code: 'custom',
        message:
          'estadoCadencia requiere al menos idEmpresa, owner o estado. Sin filtro devolveria la organizacion entera, ' +
          'que no es una pregunta sino un volcado.',
      });
    }
  });
export type EstadoCadenciaInput = z.infer<typeof estadoCadenciaSchema>;

export type EstadoCadenciaResultado = {
  organizacion: number;
  filtro: { idEmpresa: string | null; owner: string | null; estado: string | null };
  total: number;
  conCadenciaActiva: number;
  sinNingunaInscripcion: number;
  cuentas: CadenciaDeEmpresa[];
};

export function estadoCadencia(input: EstadoCadenciaInput, idOrganizacion: number): EstadoCadenciaResultado {
  const parsed = estadoCadenciaSchema.parse(input);

  const condiciones = [eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA];
  if (parsed.idEmpresa) condiciones.push(eq(empresa.idEmpresa, parsed.idEmpresa));
  if (parsed.owner) condiciones.push(eq(empresa.owner, parsed.owner));
  if (parsed.estado) condiciones.push(eq(empresa.estadoNotion, parsed.estado));

  const empresas = db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estadoNotion: empresa.estadoNotion,
      owner: empresa.owner,
      proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      proximoCanal: empresa.proximoCanal,
      proximoPaso: empresa.proximoPaso,
    })
    .from(empresa)
    .where(and(...condiciones))
    .orderBy(empresa.nombreOficial)
    .all();

  // Pedir una empresa concreta que no existe es un error, no una lista vacia: "no tiene
  // cadencia" y "no esta en la base" son diagnosticos distintos y responder lo mismo a los dos
  // manda al consumidor a inscribir una cuenta que no existe.
  if (parsed.idEmpresa && empresas.length === 0) {
    throw new Error(
      `estadoCadencia: la empresa ${parsed.idEmpresa} no existe en la organizacion ${idOrganizacion}, o fue absorbida por una fusion de duplicados. ` +
        'Para resolver cual de los dos es, buscar_empresa.',
    );
  }

  const idsEmpresa = empresas.map((e) => e.idEmpresa);
  const inscripciones =
    idsEmpresa.length === 0
      ? []
      : db
          .select({
            idInscripcion: inscripcion.idInscripcion,
            idEmpresa: inscripcion.idEmpresa,
            idCampana: inscripcion.idCampana,
            campana: campana.nombre,
            estadoCampana: campana.estado,
            estado: inscripcion.estado,
            pasoActual: inscripcion.pasoActual,
            fechaInscripcion: inscripcion.fechaInscripcion,
            fechaFin: inscripcion.fechaFin,
            motivoFin: inscripcion.motivoFin,
            origenFin: inscripcion.origenFin,
          })
          .from(inscripcion)
          .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
          .where(inArray(inscripcion.idEmpresa, idsEmpresa))
          .orderBy(desc(inscripcion.idInscripcion))
          .all();

  const idsInscripcion = inscripciones.map((i) => i.idInscripcion);
  const filasPaso =
    idsInscripcion.length === 0
      ? []
      : db
          .select({
            idInscripcion: destinatario.idInscripcion,
            idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
            idPaso: pasoInscripcion.idPaso,
            orden: pasoCadencia.orden,
            diaOffset: pasoCadencia.diaOffset,
            esManual: pasoCadencia.esManual,
            canal: pasoInscripcion.canal,
            estado: pasoInscripcion.estado,
            aprobadoEn: pasoInscripcion.aprobadoEn,
            fechaProgramada: pasoInscripcion.fechaProgramada,
            fechaEnviada: pasoInscripcion.fechaEnviada,
          })
          .from(pasoInscripcion)
          .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
          .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
          .where(inArray(destinatario.idInscripcion, idsInscripcion))
          .orderBy(pasoCadencia.orden, pasoInscripcion.idPasoInscripcion)
          .all();

  const pasosPorInscripcion = new Map<number, PasoDeCadencia[]>();
  for (const f of filasPaso) {
    const lista = pasosPorInscripcion.get(f.idInscripcion) ?? [];
    lista.push({
      idPasoInscripcion: f.idPasoInscripcion,
      idPaso: f.idPaso,
      orden: f.orden,
      diaOffset: f.diaOffset,
      canal: f.canal,
      estado: f.estado,
      esManual: f.esManual === 1,
      aprobadoEn: f.aprobadoEn,
      fechaProgramada: f.fechaProgramada,
      fechaEnviada: f.fechaEnviada,
    });
    pasosPorInscripcion.set(f.idInscripcion, lista);
  }

  const inscripcionesPorEmpresa = new Map<string, InscripcionDeCadencia[]>();
  for (const i of inscripciones) {
    const pasos = pasosPorInscripcion.get(i.idInscripcion) ?? [];
    const lista = inscripcionesPorEmpresa.get(i.idEmpresa) ?? [];
    lista.push({
      idInscripcion: i.idInscripcion,
      idCampana: i.idCampana,
      campana: i.campana,
      estadoCampana: i.estadoCampana,
      estado: i.estado,
      viva: i.fechaFin === null,
      pasoActual: i.pasoActual,
      fechaInscripcion: i.fechaInscripcion,
      fechaFin: i.fechaFin,
      motivoFin: i.motivoFin,
      origenFin: i.origenFin,
      proximoPaso: pasos.find((p) => ESTADOS_PASO_VIVOS.includes(p.estado)) ?? null,
      pasos,
    });
    inscripcionesPorEmpresa.set(i.idEmpresa, lista);
  }

  const cuentas: CadenciaDeEmpresa[] = empresas.map((e) => {
    const suyas = inscripcionesPorEmpresa.get(e.idEmpresa) ?? [];
    return { ...e, enCadenciaActiva: suyas.some((i) => i.estado === 'activa'), inscripciones: suyas };
  });

  return {
    organizacion: idOrganizacion,
    filtro: { idEmpresa: parsed.idEmpresa ?? null, owner: parsed.owner ?? null, estado: parsed.estado ?? null },
    total: cuentas.length,
    conCadenciaActiva: cuentas.filter((c) => c.enCadenciaActiva).length,
    sinNingunaInscripcion: cuentas.filter((c) => c.inscripciones.length === 0).length,
    cuentas,
  };
}

// --- Sacar de la cadencia SIN registrar incumplimiento (2026-08-03) --------------------
//
// aplazarSeguimiento escribe una fila en seguimiento_aplazado, que es un evento de "el paso
// no se hizo". Para las cuentas que TODAVIA no estan para toque eso miente al reves: nunca
// hubo un paso que incumplir, la fecha la puso el seed de Notion o un enriquecimiento, no
// trabajo real. Orden del operador el 2026-08-03: "esto ni siquiera deberia contar como un
// que no se hizo el paso, simplemente ponmelas para atras".
//
// Por eso es una funcion aparte y no un flag de aplazarSeguimiento: un booleano que apaga el
// evento convierte la tabla de incumplimientos en algo que a veces cuenta y a veces no, y
// deja de poder responder "cuantas veces se corrio algo esta semana".
//
// Lo que hace, y no hace:
//   - NO escribe seguimiento_aplazado. Nunca. Es el punto entero de la funcion.
//   - NO escribe un toque: sacar una cuenta de la cadencia no es actividad.
//   - NO encola a Notion. La herramienta no le escribe a Notion (esa decision esta cerrada:
//     el unico escritor de Notion es el brain), y ademas el contrato CambioNotion no sabe
//     representar "esta fecha se borro", asi que encolar un vaciado mandaria un valor que
//     nadie pidio.
//   - SI puede dejar proximo_follow_up_fecha en NULL, que es lo que actualizarEmpresa no
//     permite (su campo es .trim().min(1), asi que un string vacio es error de entrada y no
//     hay forma de vaciar la fecha).
//   - SI corta lo que ya estaba materializado. Pausar la inscripcion NO alcanza:
//     pasoInscripcionesPendientes no mira inscripcion.estado (su unica defensa en
//     profundidad es campana.estado), asi que un paso ya materializado como 'pendiente'
//     saldria igual despues de la baja. Se marcan 'cancelada', un estado terminal que
//     ninguna consulta cuenta como pendiente ni como trabajo hecho ('enviada'/'omitida' si
//     cuentan, y por eso no se reusa 'omitida': inflaria toquesHechos con trabajo que
//     justamente no se hizo).
//
// Una cuenta a la vez, cada una en su propia transaccion (runbook de produccion). Una cuenta
// que no se puede procesar se RECHAZA con su motivo y viaja en `rechazos`; jamas se salta en
// silencio -- ese fue el modo de falla del `continue` pelado de agruparPendientesCorreo, que
// dejo correos sin salir para siempre sin error y sin marcar la fila.

// Formato de fecha de calendario. Se valida aca y no se confia en el caller: la columna es
// TEXT y compara como texto, asi que una fecha en otro formato no revienta, solo deja de
// ordenar bien y se descubre semanas despues.
const RE_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const sacarDeCadenciaSchema = z
  .object({
    idsEmpresa: z.array(z.string().trim().min(1)).min(1),
    // Corta las inscripciones vivas y cancela los envios ya materializados que no salieron.
    pausarInscripciones: z.boolean().optional(),
    // Corre la fecha del proximo follow-up. Excluyente con limpiarFecha.
    nuevaFecha: z.string().trim().regex(RE_FECHA_ISO, 'nuevaFecha va en formato YYYY-MM-DD').optional(),
    // Deja proximo_follow_up_fecha en NULL. Es un acto EXPLICITO y no el default de "no mande
    // fecha": borrar una fecha por omision es exactamente como se pierde un follow-up.
    limpiarFecha: z.boolean().optional(),
    // Prosa para la bitacora. Opcional y nunca inferido: si el operador no dijo por que, queda
    // vacio en vez de inventarse un motivo.
    motivo: z.string().trim().min(1).optional(),
    sacadoPor: z.string().trim().min(1).optional().default(EJECUTOR_POR_DEFECTO),
  })
  .superRefine((data, ctx) => {
    if (data.nuevaFecha && data.limpiarFecha === true) {
      ctx.addIssue({
        code: 'custom',
        message: 'sacarDeCadencia: nuevaFecha y limpiarFecha se contradicen. Una corre la fecha, la otra la borra: hay que elegir una.',
      });
    }
    if (data.pausarInscripciones !== true && !data.nuevaFecha && data.limpiarFecha !== true) {
      ctx.addIssue({
        code: 'custom',
        message:
          'sacarDeCadencia requiere al menos una accion: pausarInscripciones, nuevaFecha o limpiarFecha. Sin ninguna seria un no-op que reporta exito.',
      });
    }
    const vistos = new Set<string>();
    const repetidos = data.idsEmpresa.filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)));
    if (repetidos.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `sacarDeCadencia: idsEmpresa trae repetidos (${[...new Set(repetidos)].join(', ')}). Cada cuenta se procesa una vez y el resultado tiene una fila por cuenta pedida.`,
      });
    }
  });
export type SacarDeCadenciaInput = z.input<typeof sacarDeCadenciaSchema>;

export type InscripcionPausada = {
  idInscripcion: number;
  idCampana: number;
  campana: string | null;
  estadoAntes: string;
  estadoAhora: string;
};

export type EnvioCancelado = {
  idPasoInscripcion: number;
  idInscripcion: number;
  canal: string;
  estadoAntes: string;
  fechaProgramada: string | null;
};

export type CuentaSacada = {
  idEmpresa: string;
  // RELEIDA de la base despues de escribir, no el eco del input.
  empresa: EmpresaEscrita;
  fechaAntes: string | null;
  fechaAhora: string | null;
  inscripcionesPausadas: InscripcionPausada[];
  enviosCancelados: EnvioCancelado[];
  // El estado completo de la cadencia despues del cambio, releido. Es la prueba de que no
  // quedo nada corriendo: sin esto, "la saque" y "creo que la saque" se ven igual.
  cadenciaDespues: CadenciaDeEmpresa;
};

export type RechazoSacar = {
  idEmpresa: string;
  motivo: 'empresa_no_existe' | 'otra_organizacion' | 'identidad_absorbida';
  detalle: string;
};

export type SacarDeCadenciaResultado = {
  pedidas: number;
  aplicadas: number;
  rechazadas: number;
  // Constante, y esta en el contrato a proposito: quien lea este resultado tiene que poder
  // comprobar sin leer codigo que aca NO se escribio un incumplimiento.
  cuentaComoIncumplimiento: false;
  cuentas: CuentaSacada[];
  rechazos: RechazoSacar[];
};

export function sacarDeCadencia(input: SacarDeCadenciaInput, idOrganizacion: number): SacarDeCadenciaResultado {
  const parsed = sacarDeCadenciaSchema.parse(input);
  const ahora = new Date().toISOString();
  const nota = parsed.motivo ? `: ${parsed.motivo}` : '';

  const cuentas: CuentaSacada[] = [];
  const rechazos: RechazoSacar[] = [];

  for (const idEmpresa of parsed.idsEmpresa) {
    const emp = db
      .select({
        organizacionActivaId: empresa.organizacionActivaId,
        operaBajoId: empresa.operaBajoId,
        proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      })
      .from(empresa)
      .where(eq(empresa.idEmpresa, idEmpresa))
      .get();

    if (!emp) {
      rechazos.push({
        idEmpresa,
        motivo: 'empresa_no_existe',
        detalle: `No hay ninguna cuenta con id_empresa ${idEmpresa}. Para resolver si existe con otro nombre o con otro id: buscar_empresa.`,
      });
      continue;
    }
    if (emp.organizacionActivaId !== idOrganizacion) {
      rechazos.push({
        idEmpresa,
        motivo: 'otra_organizacion',
        detalle: `La cuenta ${idEmpresa} esta activa en la organizacion ${emp.organizacionActivaId}, no en ${idOrganizacion}.`,
      });
      continue;
    }
    if (emp.operaBajoId) {
      rechazos.push({
        idEmpresa,
        motivo: 'identidad_absorbida',
        detalle:
          `La cuenta ${idEmpresa} fue absorbida por ${emp.operaBajoId} en una fusion de duplicados: es una identidad muerta. ` +
          `Sacar de la cadencia a ${emp.operaBajoId}, que es la que de verdad corre.`,
      });
      continue;
    }

    const fechaAntes = emp.proximoFollowUpFecha;
    const escrito = db.transaction((tx) => {
      const pausadas: InscripcionPausada[] = [];
      const cancelados: EnvioCancelado[] = [];

      if (parsed.pausarInscripciones === true) {
        // Vivas = sin fecha_fin. Una ya terminada no se vuelve a cerrar: pisarle motivo_fin y
        // origen_fin borraria POR QUE se corto, y de ese dato depende quien puede volver a
        // la cadencia (puedeVolverAInscribirse).
        const vivas = tx
          .select({
            idInscripcion: inscripcion.idInscripcion,
            idCampana: inscripcion.idCampana,
            campana: campana.nombre,
            estado: inscripcion.estado,
          })
          .from(inscripcion)
          .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
          .where(and(eq(inscripcion.idEmpresa, idEmpresa), isNull(inscripcion.fechaFin)))
          .orderBy(inscripcion.idInscripcion)
          .all();

        for (const v of vivas) {
          tx.update(inscripcion)
            .set({
              estado: 'pausada',
              // origen_fin 'manual' es el DATO del que depende la reversa: es el unico origen
              // que puedeVolverAInscribirse admite. Sacarla asi la deja recuperable.
              motivoFin: `baja manual desde el MCP (sacar_de_cadencia, no es aplazo)${nota}`,
              origenFin: 'manual',
              fechaFin: ahora,
              updatedAt: ahora,
            })
            .where(eq(inscripcion.idInscripcion, v.idInscripcion))
            .run();
          pausadas.push({
            idInscripcion: v.idInscripcion,
            idCampana: v.idCampana,
            campana: v.campana,
            estadoAntes: v.estado,
            estadoAhora: 'pausada',
          });

          const vivos = tx
            .select({
              idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
              canal: pasoInscripcion.canal,
              estado: pasoInscripcion.estado,
              fechaProgramada: pasoInscripcion.fechaProgramada,
            })
            .from(pasoInscripcion)
            .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
            .where(and(eq(destinatario.idInscripcion, v.idInscripcion), inArray(pasoInscripcion.estado, ESTADOS_PASO_VIVOS)))
            .all();

          for (const p of vivos) {
            tx.update(pasoInscripcion)
              .set({ estado: 'cancelada' })
              .where(eq(pasoInscripcion.idPasoInscripcion, p.idPasoInscripcion))
              .run();
            cancelados.push({
              idPasoInscripcion: p.idPasoInscripcion,
              idInscripcion: v.idInscripcion,
              canal: p.canal,
              estadoAntes: p.estado,
              fechaProgramada: p.fechaProgramada,
            });
          }
        }
      }

      if (parsed.limpiarFecha === true || parsed.nuevaFecha) {
        tx.update(empresa)
          .set({ proximoFollowUpFecha: parsed.limpiarFecha === true ? null : parsed.nuevaFecha!, updatedAt: ahora })
          .where(eq(empresa.idEmpresa, idEmpresa))
          .run();
      }

      const queCambio = [
        parsed.pausarInscripciones === true ? `inscripciones pausadas: ${pausadas.length}, envios cancelados: ${cancelados.length}` : null,
        parsed.limpiarFecha === true ? `fecha ${fechaAntes ?? '-'} -> NULL` : null,
        parsed.nuevaFecha ? `fecha ${fechaAntes ?? '-'} -> ${parsed.nuevaFecha}` : null,
      ]
        .filter(Boolean)
        .join('; ');

      tx.insert(syncCambios)
        .values({
          fecha: ahora,
          corrida: 'cockpit',
          fuente: 'cockpit',
          entidad: 'empresa',
          idRegistro: idEmpresa,
          accion: 'update',
          // El texto dice explicito que NO es un aplazo: quien audite sync_cambios despues no
          // tiene por que saber que existe una tabla aparte para los incumplimientos.
          detalle: `sacar de cadencia (NO es aplazo, no cuenta como paso incumplido) por ${parsed.sacadoPor}${nota}. ${queCambio}`,
        })
        .run();

      return { empresa: leerEmpresaEscrita(tx, idEmpresa), pausadas, cancelados };
    });

    cuentas.push({
      idEmpresa,
      empresa: escrito.empresa,
      fechaAntes,
      fechaAhora: escrito.empresa.proximoFollowUpFecha,
      inscripcionesPausadas: escrito.pausadas,
      enviosCancelados: escrito.cancelados,
      cadenciaDespues: estadoCadencia({ idEmpresa }, idOrganizacion).cuentas[0],
    });
  }

  return {
    pedidas: parsed.idsEmpresa.length,
    aplicadas: cuentas.length,
    rechazadas: rechazos.length,
    cuentaComoIncumplimiento: false,
    cuentas,
    rechazos,
  };
}

// --- correrCadencia: mover un pedazo de la secuencia en bloque (2026-08-03) --------------
//
// Hermana de sacarDeCadencia, y la diferencia es el punto: sacarDeCadencia BAJA la cuenta de
// la secuencia (pausa la inscripcion, cancela los envios); correrCadencia la deja corriendo y
// solo corre las fechas. La primera es "esta cuenta no va"; la segunda, "esta cuenta va, pero
// no hoy".
//
// La pidio el operador el 2026-08-03, el mismo dia que su cola abrio con 43 pasos vencidos de
// cuentas en hold: agarrar un pedazo de la cadencia y correrlo N dias en bloque, sin que eso
// cuente como paso incumplido. Hasta hoy eso se hacia cuenta por cuenta o no se hacia.
//
// Que NO hace, y es la mitad del valor: no toca el estado de los pasos, no escribe
// seguimiento_aplazado y no encola nada a Notion. Correr una fecha no es incumplir un paso.
// El resultado lo dice en el contrato (cuentaComoIncumplimiento: false) para que se pueda
// comprobar sin leer este codigo.
//
// El pedazo se elige con idCampana (una campana de las que corre la cuenta) y con hasta (solo
// los pasos programados hasta esa fecha, o sea "corre lo vencido y deja quieto lo que viene").
// Sin ninguno de los dos, corre todo lo que todavia puede salir.
const correrCadenciaSchema = z
  .object({
    idsEmpresa: z.array(z.string().trim().min(1)).min(1),
    // Positivo aplaza, negativo adelanta. El tope existe para que un error de tipeo no mande
    // una cadencia al 2029 sin que nadie lo note.
    dias: z.number().int().min(-365).max(365),
    idCampana: z.number().int().positive().optional(),
    // Corte por fecha programada (YYYY-MM-DD), inclusive.
    hasta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    // Mueve tambien empresa.proximo_follow_up_fecha los mismos dias. Default false: correr la
    // cadencia y correr el seguimiento de la cuenta son dos decisiones distintas.
    correrSeguimiento: z.boolean().optional().default(false),
    motivo: z.string().trim().min(1).optional(),
    corridoPor: z.string().trim().min(1).optional().default(EJECUTOR_POR_DEFECTO),
  })
  .superRefine((data, ctx) => {
    if (data.dias === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'correrCadencia: dias en 0 no mueve nada. Seria un no-op que reporta exito.',
      });
    }
    const vistos = new Set<string>();
    const repetidos = data.idsEmpresa.filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)));
    if (repetidos.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `correrCadencia: idsEmpresa trae repetidos (${[...new Set(repetidos)].join(', ')}). Cada cuenta se corre una vez.`,
      });
    }
  });
export type CorrerCadenciaInput = z.input<typeof correrCadenciaSchema>;

export type PasoCorrido = {
  idPasoInscripcion: number;
  idInscripcion: number;
  idCampana: number;
  campana: string | null;
  canal: string;
  estado: string;
  fechaAntes: string | null;
  fechaAhora: string | null;
};

export type CuentaCorrida = {
  idEmpresa: string;
  empresa: EmpresaEscrita;
  fechaSeguimientoAntes: string | null;
  fechaSeguimientoAhora: string | null;
  pasosCorridos: PasoCorrido[];
  // Los pasos que calificaban por estado pero no tienen fecha programada: no se les puede
  // sumar dias a una fecha que no existe. Salen listados en vez de desaparecer.
  pasosSinFecha: number[];
  cadenciaDespues: CadenciaDeEmpresa;
};

export type RechazoCorrer = {
  idEmpresa: string;
  motivo: 'empresa_no_existe' | 'otra_organizacion' | 'identidad_absorbida';
  detalle: string;
};

export type CorrerCadenciaResultado = {
  pedidas: number;
  aplicadas: number;
  rechazadas: number;
  pasosCorridos: number;
  cuentaComoIncumplimiento: false;
  cuentas: CuentaCorrida[];
  rechazos: RechazoCorrer[];
};

export function correrCadencia(input: CorrerCadenciaInput, idOrganizacion: number): CorrerCadenciaResultado {
  const parsed = correrCadenciaSchema.parse(input);
  const ahora = new Date().toISOString();
  const nota = parsed.motivo ? `: ${parsed.motivo}` : '';

  const cuentas: CuentaCorrida[] = [];
  const rechazos: RechazoCorrer[] = [];

  for (const idEmpresa of parsed.idsEmpresa) {
    const emp = db
      .select({
        organizacionActivaId: empresa.organizacionActivaId,
        operaBajoId: empresa.operaBajoId,
        proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      })
      .from(empresa)
      .where(eq(empresa.idEmpresa, idEmpresa))
      .get();

    if (!emp) {
      rechazos.push({
        idEmpresa,
        motivo: 'empresa_no_existe',
        detalle: `No hay ninguna cuenta con id_empresa ${idEmpresa}. Para resolver si existe con otro nombre o con otro id: buscar_empresa.`,
      });
      continue;
    }
    if (emp.organizacionActivaId !== idOrganizacion) {
      rechazos.push({
        idEmpresa,
        motivo: 'otra_organizacion',
        detalle: `La cuenta ${idEmpresa} esta activa en la organizacion ${emp.organizacionActivaId}, no en ${idOrganizacion}.`,
      });
      continue;
    }
    if (emp.operaBajoId) {
      rechazos.push({
        idEmpresa,
        motivo: 'identidad_absorbida',
        detalle:
          `La cuenta ${idEmpresa} fue absorbida por ${emp.operaBajoId} en una fusion de duplicados: es una identidad muerta. ` +
          `Correr la cadencia de ${emp.operaBajoId}, que es la que de verdad corre.`,
      });
      continue;
    }

    const fechaSeguimientoAntes = emp.proximoFollowUpFecha;
    const escrito = db.transaction((tx) => {
      const condiciones = [
        eq(inscripcion.idEmpresa, idEmpresa),
        // Solo lo que todavia puede salir: 'enviada' y 'omitida' son historia, 'cancelada' la
        // escribio sacarDeCadencia justamente para que no vuelva.
        inArray(pasoInscripcion.estado, ESTADOS_PASO_VIVOS),
      ];
      if (parsed.idCampana) condiciones.push(eq(inscripcion.idCampana, parsed.idCampana));

      const candidatos = tx
        .select({
          idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
          idInscripcion: inscripcion.idInscripcion,
          idCampana: inscripcion.idCampana,
          campana: campana.nombre,
          canal: pasoInscripcion.canal,
          estado: pasoInscripcion.estado,
          fechaProgramada: pasoInscripcion.fechaProgramada,
        })
        .from(pasoInscripcion)
        .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
        .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
        .leftJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
        .where(and(...condiciones))
        .orderBy(pasoInscripcion.idPasoInscripcion)
        .all();

      const corridos: PasoCorrido[] = [];
      const sinFecha: number[] = [];

      for (const c of candidatos) {
        if (!c.fechaProgramada) {
          sinFecha.push(c.idPasoInscripcion);
          continue;
        }
        // El dia de calendario en Bogota, no el recorte del ISO: hay filas guardadas como
        // fecha pelada y otras como instante, y las dos tienen que correrse igual.
        const dia = diaBogotaDeGuardado(c.fechaProgramada);
        if (parsed.hasta && dia > parsed.hasta) continue;
        const fechaAhora = sumarDias(dia, parsed.dias);
        tx.update(pasoInscripcion)
          .set({ fechaProgramada: fechaAhora })
          .where(eq(pasoInscripcion.idPasoInscripcion, c.idPasoInscripcion))
          .run();
        corridos.push({
          idPasoInscripcion: c.idPasoInscripcion,
          idInscripcion: c.idInscripcion,
          idCampana: c.idCampana,
          campana: c.campana,
          canal: c.canal,
          estado: c.estado,
          fechaAntes: c.fechaProgramada,
          fechaAhora,
        });
      }

      let fechaSeguimientoAhora = fechaSeguimientoAntes;
      if (parsed.correrSeguimiento && fechaSeguimientoAntes) {
        fechaSeguimientoAhora = sumarDias(diaBogotaDeGuardado(fechaSeguimientoAntes), parsed.dias);
        tx.update(empresa)
          .set({ proximoFollowUpFecha: fechaSeguimientoAhora, updatedAt: ahora })
          .where(eq(empresa.idEmpresa, idEmpresa))
          .run();
      }

      const alcance = [
        parsed.idCampana ? `campana ${parsed.idCampana}` : 'todas sus campanas',
        parsed.hasta ? `pasos hasta ${parsed.hasta}` : 'todos los pasos vivos',
      ].join(', ');

      tx.insert(syncCambios)
        .values({
          fecha: ahora,
          corrida: 'cockpit',
          fuente: 'cockpit',
          entidad: 'empresa',
          idRegistro: idEmpresa,
          accion: 'update',
          // Igual que sacarDeCadencia: el texto dice explicito que esto NO es un incumplimiento,
          // para que quien audite sync_cambios no tenga que deducirlo.
          detalle:
            `correr cadencia ${parsed.dias > 0 ? '+' : ''}${parsed.dias}d (NO es aplazo, no cuenta como paso incumplido) ` +
            `por ${parsed.corridoPor}${nota}. ${alcance}; pasos corridos: ${corridos.length}` +
            (sinFecha.length > 0 ? `; sin fecha programada (no se movieron): ${sinFecha.length}` : '') +
            (parsed.correrSeguimiento && fechaSeguimientoAntes ? `; seguimiento ${fechaSeguimientoAntes} -> ${fechaSeguimientoAhora}` : ''),
        })
        .run();

      return { empresa: leerEmpresaEscrita(tx, idEmpresa), corridos, sinFecha, fechaSeguimientoAhora };
    });

    cuentas.push({
      idEmpresa,
      empresa: escrito.empresa,
      fechaSeguimientoAntes,
      fechaSeguimientoAhora: escrito.empresa.proximoFollowUpFecha,
      pasosCorridos: escrito.corridos,
      pasosSinFecha: escrito.sinFecha,
      // Releida de la base despues de escribir: la prueba de donde quedaron las fechas, no un "ok".
      cadenciaDespues: estadoCadencia({ idEmpresa }, idOrganizacion).cuentas[0],
    });
  }

  return {
    pedidas: parsed.idsEmpresa.length,
    aplicadas: cuentas.length,
    rechazadas: rechazos.length,
    pasosCorridos: cuentas.reduce((n, c) => n + c.pasosCorridos.length, 0),
    cuentaComoIncumplimiento: false,
    cuentas,
    rechazos,
  };
}

// --- Identidad de cuentas: buscar / crear / actualizar (2026-07-24) --------------------
//
// Resuelven el caso "hay una pagina de Notion que no tiene cuenta en la base": primero se
// busca si ya existe con otro nombre (buscarEmpresa), y segun la respuesta se enlaza
// (actualizarEmpresa con notionPageId) o se crea (crearEmpresa). Hasta ahora eso solo se
// podia hacer con SQL crudo por SSH.
//
// Las tres viven aca, en el dominio, y no en la tool del MCP: la regla de "que cuenta ya
// existe" y "que id le toca a una nueva" tiene que valer para CUALQUIER caller, igual que
// registrarToque/marcarPerdida. El MCP solo las envuelve.

export type FrenteBusqueda = 'empresa' | 'alias' | 'prospeccion' | 'contacto';
export type ConfianzaCandidato = 'alta' | 'media' | 'baja';
export type MotivoCandidato = 'nit' | 'nombre_exacto' | 'nombre_parecido' | 'telefono' | 'dominio';

// De donde salio UN candidato. Sin esto el consumidor no puede juzgar: "coincide el nombre
// normalizado" y "coincide un telefono" pesan distinto, y "sale de la lista de prospeccion"
// no es lo mismo que "sale de la cuenta misma".
export type HitBusqueda = {
  frente: FrenteBusqueda;
  motivo: MotivoCandidato;
  confianza: ConfianzaCandidato;
  score: number; // 0..1. Identificador exacto (nit/telefono/dominio) = 1.
  coincidencia: string; // el texto concreto que matcheo: el alias, el telefono, el dominio, el nombre crudo
};

export type CandidatoEmpresa = {
  idEmpresa: string;
  nombreOficial: string;
  categoria: string | null;
  estadoNotion: string | null;
  owner: string | null;
  notionPageId: string | null;
  // Marca de fusion: si viene con valor, esta fila es una identidad ABSORBIDA por otra
  // (ver empresa.operaBajoId en schema.ts). Se devuelve en vez de filtrarse porque enlazar
  // una pagina de Notion a una identidad muerta es exactamente el error que hay que ver.
  operaBajoId: string | null;
  confianza: ConfianzaCandidato; // la mas alta de sus hits
  score: number; // el mas alto de sus hits
  hits: HitBusqueda[]; // todos los frentes por los que salio, del mas fuerte al mas debil
};

export type BuscarEmpresaInput = {
  nombre: string;
  telefono?: string;
  dominio?: string;
  nit?: string;
};

export type BuscarEmpresaResultado = {
  raiz: string; // la raiz normalizada con la que se busco (sin sufijos legales)
  total: number;
  candidatos: CandidatoEmpresa[];
};

const buscarEmpresaSchema = z.object({
  nombre: z.string().trim().min(1),
  telefono: z.string().trim().optional(),
  dominio: z.string().trim().optional(),
  nit: z.string().trim().optional(),
});

const MAX_CANDIDATOS = 20;
// Por encima de esto, dos nombres distintos se consideran "casi el mismo" (typo o palabra
// suelta de diferencia) y el candidato sube a confianza media. Debajo, baja.
const UMBRAL_CONFIANZA_MEDIA = 0.8;
const ORDEN_CONFIANZA: Record<ConfianzaCandidato, number> = { alta: 0, media: 1, baja: 2 };

function confianzaPorScore(score: number): ConfianzaCandidato {
  if (score >= 1) return 'alta';
  if (score >= UMBRAL_CONFIANZA_MEDIA) return 'media';
  return 'baja';
}

// Busca una cuenta por los CUATRO frentes, siempre los cuatro. No es opcional cual se corre:
// una cuenta que ya existe se encuentra por su nombre oficial, por un alias viejo, por el
// nombre crudo con el que entro a la lista de prospeccion, o por el telefono/dominio de un
// contacto -- y cual de los cuatro la encuentra depende de por donde entro a la base, que el
// que busca no sabe. Correr solo el primero es como fabricar duplicados (Conexa Tech).
//
// El criterio de parecido de nombres NO se implementa aca: sale de scoreRazonSocial
// (app/core/reconciliacion/matcherGemelos.ts), el mismo que usa el matcher de gemelos. Si el
// brain viera duplicados con otro umbral que el matcher, las dos capas se contradirian.
//
// Costo: se leen las 4 tablas enteras a memoria (~6.300 filas hoy) y se puntua cada una. Son
// ~50ms y el volumen no crece rapido; una prefiltrada en SQL por token perderia recall, que
// es justo lo que esta funcion no puede permitirse.
export function buscarEmpresa(input: BuscarEmpresaInput): BuscarEmpresaResultado {
  const parsed = buscarEmpresaSchema.parse(input);
  const raiz = normalizarRazonSocial(parsed.nombre);
  const telefonoBuscado = parsed.telefono ? telefonoNormalizado(parsed.telefono) : '';
  const dominioBuscado = parsed.dominio ? dominioDe(parsed.dominio) : '';
  const nitBuscado = parsed.nit ?? '';

  // Acumulador por cuenta: una misma empresa puede salir por varios frentes y se reporta
  // UNA vez, con todos sus hits.
  const hitsPorEmpresa = new Map<string, HitBusqueda[]>();
  function anotar(idEmpresa: string | null, hit: HitBusqueda): void {
    if (!idEmpresa) return;
    const previos = hitsPorEmpresa.get(idEmpresa);
    if (previos) previos.push(hit);
    else hitsPorEmpresa.set(idEmpresa, [hit]);
  }

  function anotarPorNombre(
    idEmpresa: string | null,
    frente: FrenteBusqueda,
    textoCandidato: string | null,
  ): void {
    if (!idEmpresa || !textoCandidato) return;
    const score = scoreRazonSocial(parsed.nombre, textoCandidato);
    if (score < UMBRAL_MINIMO_CANDIDATO) return;
    anotar(idEmpresa, {
      frente,
      motivo: score >= 1 ? 'nombre_exacto' : 'nombre_parecido',
      confianza: confianzaPorScore(score),
      score,
      coincidencia: textoCandidato,
    });
  }

  // Frente 0 (solo si viene NIT): el id_empresa ES el NIT para las 1.740 cuentas de tipo
  // 'nit'. Match exacto, la señal mas fuerte que existe.
  if (nitBuscado !== '') {
    const porNit = db
      .select({ idEmpresa: empresa.idEmpresa })
      .from(empresa)
      .where(eq(empresa.idEmpresa, nitBuscado))
      .get();
    if (porNit) {
      anotar(porNit.idEmpresa, { frente: 'empresa', motivo: 'nit', confianza: 'alta', score: 1, coincidencia: nitBuscado });
    }
  }

  // Frente 1: empresa, por nombre_oficial Y por nombre_normalizado. Los dos, no uno: la
  // columna nombre_normalizado de isps.db NO es esta normalizacion (1.233 de 1.956 filas
  // vienen de un normalizador viejo que no quitaba sufijos legales), asi que puede aportar
  // una coincidencia que el nombre oficial no da, y al reves.
  const empresas = db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombreOficial: empresa.nombreOficial,
      nombreNormalizado: empresa.nombreNormalizado,
    })
    .from(empresa)
    .all();
  for (const e of empresas) {
    anotarPorNombre(e.idEmpresa, 'empresa', e.nombreOficial);
    if (e.nombreNormalizado !== e.nombreOficial) anotarPorNombre(e.idEmpresa, 'empresa', e.nombreNormalizado);
  }

  // Frente 2: empresa_alias. 3.267 filas: es donde vive el nombre con el que la cuenta entro
  // por otra fuente (master, metabase, Notion) y que ya no es el nombre_oficial de hoy.
  for (const a of db.select({ idEmpresa: empresaAlias.idEmpresa, alias: empresaAlias.alias }).from(empresaAlias).all()) {
    anotarPorNombre(a.idEmpresa, 'alias', a.alias);
  }

  // Frente 3: prospeccion, por nombre crudo, website y telefonos. telefonos_raw es un texto
  // con varios numeros separados por " | ", se parte aca.
  const prospecciones = db
    .select({
      idEmpresa: prospeccion.idEmpresa,
      empresaNombreRaw: prospeccion.empresaNombreRaw,
      website: prospeccion.website,
      telefonosRaw: prospeccion.telefonosRaw,
    })
    .from(prospeccion)
    .all();
  for (const p of prospecciones) {
    anotarPorNombre(p.idEmpresa, 'prospeccion', p.empresaNombreRaw);
    if (dominioBuscado !== '' && p.website) {
      const dominioFila = dominioDe(p.website);
      if (dominioFila !== '' && dominioFila === dominioBuscado) {
        anotar(p.idEmpresa, { frente: 'prospeccion', motivo: 'dominio', confianza: 'alta', score: 1, coincidencia: dominioFila });
      }
    }
    if (telefonoBuscado !== '' && p.telefonosRaw) {
      for (const crudo of p.telefonosRaw.split('|')) {
        const tel = telefonoNormalizado(crudo);
        if (tel !== '' && tel === telefonoBuscado) {
          anotar(p.idEmpresa, { frente: 'prospeccion', motivo: 'telefono', confianza: 'alta', score: 1, coincidencia: tel });
          break;
        }
      }
    }
  }

  // Frente 4: contacto, por telefono o por dominio del email. El nombre de un contacto es de
  // PERSONA, no de empresa: no entra al match de razon social (normalizarRazonSocial no es
  // para nombres de persona, ver su cabecera).
  if (telefonoBuscado !== '' || dominioBuscado !== '') {
    const contactos = db
      .select({ idEmpresa: contacto.idEmpresa, telefono: contacto.telefono, email: contacto.email })
      .from(contacto)
      .all();
    for (const c of contactos) {
      if (telefonoBuscado !== '' && c.telefono) {
        const tel = telefonoNormalizado(c.telefono);
        if (tel !== '' && tel === telefonoBuscado) {
          anotar(c.idEmpresa, { frente: 'contacto', motivo: 'telefono', confianza: 'alta', score: 1, coincidencia: tel });
        }
      }
      if (dominioBuscado !== '' && c.email) {
        const dominioFila = dominioDe(c.email);
        if (dominioFila !== '' && dominioFila === dominioBuscado) {
          anotar(c.idEmpresa, { frente: 'contacto', motivo: 'dominio', confianza: 'alta', score: 1, coincidencia: dominioFila });
        }
      }
    }
  }

  if (hitsPorEmpresa.size === 0) return { raiz, total: 0, candidatos: [] };

  // Los datos de cabecera de la cuenta salen de UNA query por lote, no de una por candidato.
  const ids = [...hitsPorEmpresa.keys()];
  const cabeceras = db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombreOficial: empresa.nombreOficial,
      categoria: empresa.categoria,
      estadoNotion: empresa.estadoNotion,
      owner: empresa.owner,
      notionPageId: empresa.notionPageId,
      operaBajoId: empresa.operaBajoId,
    })
    .from(empresa)
    .where(inArray(empresa.idEmpresa, ids))
    .all();

  const candidatos: CandidatoEmpresa[] = [];
  for (const cab of cabeceras) {
    // Un hit por frente+motivo, quedandose con el mas fuerte de cada par: un nombre que
    // matchea por nombre_oficial y por nombre_normalizado es UN hit, no dos.
    const mejorPorClave = new Map<string, HitBusqueda>();
    for (const h of hitsPorEmpresa.get(cab.idEmpresa) ?? []) {
      const clave = `${h.frente}:${h.motivo}`;
      const previo = mejorPorClave.get(clave);
      if (!previo || h.score > previo.score) mejorPorClave.set(clave, h);
    }
    const hits = [...mejorPorClave.values()].sort((a, b) => b.score - a.score);
    const mejor = hits[0];
    candidatos.push({ ...cab, confianza: mejor.confianza, score: mejor.score, hits });
  }

  candidatos.sort(
    (a, b) =>
      ORDEN_CONFIANZA[a.confianza] - ORDEN_CONFIANZA[b.confianza] ||
      b.score - a.score ||
      a.nombreOficial.localeCompare(b.nombreOficial),
  );

  return { raiz, total: candidatos.length, candidatos: candidatos.slice(0, MAX_CANDIDATOS) };
}

// --- crearEmpresa ---------------------------------------------------------------------

const crearEmpresaSchema = z.object({
  nombreOficial: z.string().trim().min(1),
  // CATEGORIAS_ESCRIBIBLES y no CATEGORIAS_EMPRESA: suma 'test', la marca de una cuenta
  // sembrada para probar (ver app/core/empresa-identidad.ts). El MCP sigue ofreciendo solo las
  // tres reales. Quien decide si 'test' es aceptable es la puerta por la que entra la escritura
  // (categoriaAceptada, mismo archivo), nunca esta funcion: el repository no sabe en que modo
  // corre, y ese desconocimiento es justo lo que hace imposible que se equivoque de base.
  categoria: z.enum(CATEGORIAS_ESCRIBIBLES),
  estadoNotion: z.enum(ESTADOS_NOTION),
  owner: z.string().trim().min(1),
  // La ciudad entra en el ALTA y no en un update posterior: es uno de los campos por los que
  // segmenta el wizard de campanas (COLUMNA_SEGMENTO.ciudad), asi que una cuenta creada sin
  // ella no cae en ningun segmento que filtre por ciudad. Vacio se trata como ausente, para no
  // escribir '' donde la segmentacion lo leeria como un valor mas.
  ciudad: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  notionPageId: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  nit: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || esNitValido(v), {
      message: 'El NIT tiene que ser 8 a 10 digitos, sin puntos ni digito de verificacion',
    }),
  // Unica salida cuando la salvaguarda de duplicados encuentra un candidato de confianza
  // alta. Explicito y por llamada: no hay forma de apagarla de fabrica.
  forzar: z.boolean().optional(),
});
export type CrearEmpresaInput = z.input<typeof crearEmpresaSchema>;

export type EmpresaEscrita = {
  idEmpresa: string;
  tipoId: string;
  nombreOficial: string;
  nombreNormalizado: string;
  categoria: string | null;
  estadoNotion: string | null;
  estadoComercial: string;
  owner: string | null;
  notionPageId: string | null;
  proximoPaso: string | null;
  proximoFollowUpFecha: string | null;
  proximoCanal: string | null;
  organizacionActivaId: number;
};

export type CrearEmpresaResultado =
  // candidatosCercanos: lo que la busqueda encontro y NO alcanzo a bloquear (confianza media
  // o baja). Se crea igual -- bloquear en media haria que la herramienta se niegue a crear
  // cuentas legitimamente nuevas que comparten tokens con otra -- pero no se esconde: quien
  // llama ve con que rozo y puede fundir despues si era la misma.
  | { creada: true; empresa: EmpresaEscrita; candidatosCercanos: CandidatoEmpresa[] }
  | { creada: false; motivo: 'duplicado_probable'; mensaje: string; candidatos: CandidatoEmpresa[] };

function leerEmpresaEscrita(lector: typeof db | Tx, idEmpresa: string): EmpresaEscrita {
  const fila = lector
    .select({
      idEmpresa: empresa.idEmpresa,
      tipoId: empresa.tipoId,
      nombreOficial: empresa.nombreOficial,
      nombreNormalizado: empresa.nombreNormalizado,
      categoria: empresa.categoria,
      estadoNotion: empresa.estadoNotion,
      estadoComercial: empresa.estadoComercial,
      owner: empresa.owner,
      notionPageId: empresa.notionPageId,
      proximoPaso: empresa.proximoPaso,
      proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      proximoCanal: empresa.proximoCanal,
      organizacionActivaId: empresa.organizacionActivaId,
    })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!fila) throw new Error(`La cuenta ${idEmpresa} no quedo escrita`);
  return fila;
}

// Falla claro y temprano si el notion_page_id ya esta tomado. isps.db tiene un indice UNICO
// parcial (ux_empresa_notion_page_id, WHERE notion_page_id IS NOT NULL) que lo garantiza,
// pero su error crudo es "UNIQUE constraint failed: empresa.notion_page_id" -- no dice cual
// cuenta lo tiene, que es lo unico que el que llama necesita para resolverlo.
function verificarPageIdLibre(lector: typeof db | Tx, notionPageId: string, idEmpresaPropia?: string): void {
  const duena = lector
    .select({ idEmpresa: empresa.idEmpresa, nombreOficial: empresa.nombreOficial })
    .from(empresa)
    .where(eq(empresa.notionPageId, notionPageId))
    .get();
  if (!duena || duena.idEmpresa === idEmpresaPropia) return;
  throw new Error(
    `El notion_page_id ${notionPageId} ya esta tomado por la cuenta ${duena.idEmpresa} (${duena.nombreOficial}). ` +
      'Enlaza esa cuenta con actualizar_empresa en vez de crear otra.',
  );
}

// Crea una cuenta nueva. Antes de insertar corre la MISMA busqueda de buscarEmpresa y se
// niega si aparece un candidato de confianza alta: la base ya tiene duplicados vivos
// (Conexa Tech, dos filas para la misma empresa) por haberse saltado ese paso, y una
// herramienta que crea en un segundo puede fabricar mas en un segundo. La salida es
// devolver el candidato para enlazarlo, o `forzar: true` explicito.
//
// El id no se inventa: con NIT, el id ES el NIT (tipo_id 'nit'); sin NIT, sale de
// idEmpresaSintetico (tipo_id 'interno'), la convencion medida sobre las 97 filas `ntn-`
// que ya existen. Ver app/core/empresa-identidad.ts.
export function crearEmpresa(input: CrearEmpresaInput, idOrganizacion: number): CrearEmpresaResultado {
  const parsed = crearEmpresaSchema.parse(input);

  const busqueda = buscarEmpresa({
    nombre: parsed.nombreOficial,
    ...(parsed.nit ? { nit: parsed.nit } : {}),
  });
  const altos = busqueda.candidatos.filter((c) => c.confianza === 'alta');
  if (altos.length > 0 && !parsed.forzar) {
    return {
      creada: false,
      motivo: 'duplicado_probable',
      mensaje:
        `No se creo: ya hay ${altos.length} cuenta(s) que coinciden con alta confianza (${altos
          .map((c) => `${c.idEmpresa} ${c.nombreOficial}`)
          .join('; ')}). Enlaza una de esas con actualizar_empresa, o repite con forzar:true si de verdad es otra empresa.`,
      candidatos: altos,
    };
  }

  const idEmpresa = parsed.nit ?? idEmpresaSintetico(parsed.nombreOficial);
  const tipoId = parsed.nit ? 'nit' : 'interno';
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    const yaExiste = tx
      .select({ nombreOficial: empresa.nombreOficial })
      .from(empresa)
      .where(eq(empresa.idEmpresa, idEmpresa))
      .get();
    if (yaExiste) {
      throw new Error(
        `Ya existe una cuenta con id_empresa ${idEmpresa} (${yaExiste.nombreOficial}). ` +
          'Usa actualizar_empresa sobre esa cuenta en vez de crear otra.',
      );
    }
    if (parsed.notionPageId) verificarPageIdLibre(tx, parsed.notionPageId);

    tx.insert(empresa)
      .values({
        idEmpresa,
        tipoId,
        nombreOficial: parsed.nombreOficial,
        nombreNormalizado: normalizarRazonSocial(parsed.nombreOficial),
        // estado_comercial es NOT NULL con su propio CHECK; se deriva de la etapa del embudo
        // con la moda real de la base (ver ESTADO_COMERCIAL_POR_ETAPA).
        estadoComercial: ESTADO_COMERCIAL_POR_ETAPA[parsed.estadoNotion],
        estadoNotion: parsed.estadoNotion,
        categoria: parsed.categoria,
        ciudadPrincipal: parsed.ciudad ?? null,
        owner: parsed.owner,
        notionPageId: parsed.notionPageId ?? null,
        organizacionActivaId: idOrganizacion,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();

    // La etapa inicial entra al historico como cualquier otra transicion (desde null): sin
    // esto, el ciclo de venta de una cuenta creada aca arrancaria en su primer movimiento y
    // no en su nacimiento.
    tx.insert(empresaEstadoHistorial)
      .values({ idEmpresa, estadoAnterior: null, estadoNuevo: parsed.estadoNotion, fecha: ahora, idOrganizacion })
      .run();

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: idEmpresa,
        accion: 'insert',
        detalle: `alta de cuenta: ${parsed.nombreOficial} (${parsed.categoria}, ${parsed.estadoNotion})`,
      })
      .run();

    // Relectura, no un eco del input: lo que se devuelve es lo que QUEDO en la base
    // (incluidos los campos derivados, id y estado_comercial).
    return {
      creada: true as const,
      empresa: leerEmpresaEscrita(tx, idEmpresa),
      candidatosCercanos: busqueda.candidatos.filter((c) => c.confianza !== 'alta'),
    };
  });
}

// --- actualizarEmpresa ----------------------------------------------------------------

const actualizarEmpresaSchema = z
  .object({
    idEmpresa: z.string().trim().min(1),
    owner: z.string().trim().min(1).optional(),
    categoria: z.enum(CATEGORIAS_EMPRESA).optional(),
    notionPageId: z.string().trim().min(1).optional(),
    proximoPaso: z.string().trim().min(1).optional(),
    proximoFollowUpFecha: z.string().trim().min(1).optional(),
    proximoCanal: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const { idEmpresa: _id, ...campos } = data;
    if (Object.values(campos).every((v) => v === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'actualizar_empresa requiere al menos un campo a cambiar (owner, categoria, notionPageId, proximoPaso, proximoFollowUpFecha, proximoCanal)',
      });
    }
  });
export type ActualizarEmpresaInput = z.input<typeof actualizarEmpresaSchema>;

// Cambia campos puntuales de una cuenta que ya existe. Solo se escribe lo que VINO: un campo
// ausente no se toca, y `.trim().min(1)` hace que un string vacio sea un error de entrada y
// no un borrado silencioso de lo que la base ya tenia.
//
// estado_notion NO esta aca a proposito: esa etapa se mueve con mover_estado, que ademas
// escribe la transicion en empresa_estado_historial. Un UPDATE suelto de estado_notion
// perderia el historico -- por eso escribirTransicionEstado es el unico camino.
//
// Tampoco encola al outbox de Notion. Esta funcion es para cuadrar la base contra lo que
// Notion YA dice (enlazar un page id, corregir un owner o una categoria); rebotar eso de
// vuelta a Notion seria escribirle lo que el mismo acaba de decir. Lo que si tiene que viajar
// a Notion (proximo paso con fecha, como parte de una reprogramacion real) sale por
// cambiarCadencia, que si encola.
export function actualizarEmpresa(input: ActualizarEmpresaInput, idOrganizacion: number): EmpresaEscrita {
  const parsed = actualizarEmpresaSchema.parse(input);

  return db.transaction((tx) => {
    const emp = tx
      .select({ organizacionActivaId: empresa.organizacionActivaId })
      .from(empresa)
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${parsed.idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(`La empresa ${parsed.idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
    }
    if (parsed.notionPageId) verificarPageIdLibre(tx, parsed.notionPageId, parsed.idEmpresa);

    const sets: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (parsed.owner !== undefined) sets.owner = parsed.owner;
    if (parsed.categoria !== undefined) sets.categoria = parsed.categoria;
    if (parsed.notionPageId !== undefined) sets.notionPageId = parsed.notionPageId;
    if (parsed.proximoPaso !== undefined) sets.proximoPaso = parsed.proximoPaso;
    if (parsed.proximoFollowUpFecha !== undefined) sets.proximoFollowUpFecha = parsed.proximoFollowUpFecha;
    if (parsed.proximoCanal !== undefined) sets.proximoCanal = parsed.proximoCanal;

    tx.update(empresa).set(sets).where(eq(empresa.idEmpresa, parsed.idEmpresa)).run();

    tx.insert(syncCambios)
      .values({
        fecha: new Date().toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle: `campos: ${Object.keys(sets).filter((k) => k !== 'updatedAt').join(', ')}`,
      })
      .run();

    return leerEmpresaEscrita(tx, parsed.idEmpresa);
  });
}

// --- crearContacto / actualizarContacto -----------------------------------------------
//
// El movimiento que le faltaba al MCP: cargar A QUIEN se le manda. Hasta 2026-07-28 el UNICO
// camino que escribia `contacto` desde el MCP era el bloque `kdm` de registrarToque, que solo
// acepta nombre y telefono -- sin email. Y sin email no hay destinatario: elegirDestinatarioDefault
// (app/core/inscripcion.ts) filtra por email y devuelve null si NINGUN contacto lo tiene, con lo
// que inscribirEmpresaEnCadencia abre la inscripcion en 'bloqueada' y lanzar_campana responde
// "empresas sin destinatario utilizable". Medido en produccion el 2026-07-28: 248 de 415
// contactos no tienen email, o sea que el caso dominante NO es crear un contacto nuevo sino
// completarle el correo a uno que ya existe. Por eso son DOS funciones y no una: crear se niega
// a duplicar, y completar es un acto explicito sobre un id concreto.

export type ContactoEscrito = {
  idContacto: number;
  idEmpresa: string;
  nombre: string | null;
  apellido: string | null;
  cargo: string | null;
  cargoCategoria: string | null;
  email: string | null;
  telefono: string | null;
  linkedin: string | null;
  notas: string | null;
  esPrincipal: boolean;
  esKeyDecisionMaker: boolean;
  fuente: string;
};

function filaAContactoEscrito(f: {
  idContacto: number;
  idEmpresa: string;
  nombre: string | null;
  apellido: string | null;
  cargo: string | null;
  cargoCategoria: string | null;
  email: string | null;
  telefono: string | null;
  linkedin: string | null;
  notas: string | null;
  esPrincipal: number;
  esKeyDecisionMaker: number;
  fuente: string;
}): ContactoEscrito {
  return { ...f, esPrincipal: f.esPrincipal === 1, esKeyDecisionMaker: f.esKeyDecisionMaker === 1 };
}

const COLUMNAS_CONTACTO_ESCRITO = {
  idContacto: contacto.idContacto,
  idEmpresa: contacto.idEmpresa,
  nombre: contacto.nombre,
  apellido: contacto.apellido,
  cargo: contacto.cargo,
  cargoCategoria: contacto.cargoCategoria,
  email: contacto.email,
  telefono: contacto.telefono,
  linkedin: contacto.linkedin,
  notas: contacto.notas,
  esPrincipal: contacto.esPrincipal,
  esKeyDecisionMaker: contacto.esKeyDecisionMaker,
  fuente: contacto.fuente,
};

// Todos los contactos de la empresa, releidos. Es lo que devuelven crearContacto y
// actualizarContacto ademas del contacto tocado: quien llama necesita ver el resto para saber
// a quien le va a caer la cadencia (elegirDestinatarioDefault decide sobre el conjunto, no
// sobre el que se acaba de escribir).
export function contactosDeEmpresa(idEmpresa: string, lector: typeof db | Tx = db): ContactoEscrito[] {
  return lector
    .select(COLUMNAS_CONTACTO_ESCRITO)
    .from(contacto)
    .where(eq(contacto.idEmpresa, idEmpresa))
    .orderBy(contacto.idContacto)
    .all()
    .map(filaAContactoEscrito);
}

function leerContactoEscrito(lector: typeof db | Tx, idContacto: number): ContactoEscrito {
  const fila = lector.select(COLUMNAS_CONTACTO_ESCRITO).from(contacto).where(eq(contacto.idContacto, idContacto)).get();
  if (!fila) throw new Error(`El contacto ${idContacto} no quedo escrito`);
  return filaAContactoEscrito(fila);
}

function empresaDeLaOrganizacion(lector: typeof db | Tx, idEmpresa: string, idOrganizacion: number): void {
  const emp = lector
    .select({ organizacionActivaId: empresa.organizacionActivaId })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!emp) throw new Error(`Empresa ${idEmpresa} no existe. Créala con crear_empresa antes de cargarle un contacto.`);
  if (emp.organizacionActivaId !== idOrganizacion) {
    throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
  }
}

// Antidupe. Mismo idioma que buscarEmpresa: se busca ANTES de escribir y se devuelve el que ya
// existe, en vez de dejar dos filas de la misma persona. Un contacto duplicado no es cosmetico:
// las dos filas entran a contactosDeEmpresa, y si un dia la de menor id es la que tiene el
// telefono viejo, la cadencia le escribe a esa.
//   - email: exacto, sin distinguir mayusculas ni espacios de sobra.
//   - telefono: por los ULTIMOS 10 DIGITOS, el mismo criterio que ya usa resolverPorUltimos10
//     para cruzar un WhatsApp entrante contra un contacto (+57, 57 y separadores absorbidos).
function contactosQueChocan(
  existentes: ContactoEscrito[],
  email: string | undefined,
  telefono: string | undefined,
  idPropio?: number,
): ContactoEscrito[] {
  const emailBuscado = email?.trim().toLowerCase();
  const telBuscado = telefono ? normalizarTelefono(telefono).slice(-10) : undefined;
  return existentes.filter((c) => {
    if (c.idContacto === idPropio) return false;
    if (emailBuscado && c.email && c.email.trim().toLowerCase() === emailBuscado) return true;
    if (telBuscado && telBuscado.length === 10 && c.telefono && normalizarTelefono(c.telefono).slice(-10) === telBuscado) return true;
    return false;
  });
}

// es_principal es EXCLUSIVO por empresa y no por convencion: isps.db tiene el indice unico
// parcial `uq_contacto_principal ON contacto(id_empresa) WHERE es_principal = 1` (verificado en
// produccion el 2026-07-28). Dos principales es un estado que la base no deja existir, asi que
// rechazar la escritura solo trasladaria el problema a quien llama sin ganar nada: se DEGRADA el
// anterior dentro de la MISMA transaccion y se devuelve cual era, para que el cambio quede visible
// y no silencioso. Degradar primero e insertar despues, en ese orden: SQLite valida el indice por
// sentencia, no al cerrar la transaccion.
function degradarPrincipalAnterior(tx: Tx, idEmpresa: string, idNuevo?: number): ContactoEscrito | null {
  const anteriores = tx
    .select(COLUMNAS_CONTACTO_ESCRITO)
    .from(contacto)
    .where(and(eq(contacto.idEmpresa, idEmpresa), eq(contacto.esPrincipal, 1)))
    .all()
    .map(filaAContactoEscrito)
    .filter((c) => c.idContacto !== idNuevo);
  if (anteriores.length === 0) return null;
  for (const a of anteriores) {
    tx.update(contacto).set({ esPrincipal: 0 }).where(eq(contacto.idContacto, a.idContacto)).run();
  }
  return anteriores[0];
}

const crearContactoSchema = z
  .object({
    idEmpresa: z.string().trim().min(1),
    nombre: z.string().trim().min(1).optional(),
    apellido: z.string().trim().min(1).optional(),
    cargo: z.string().trim().min(1).optional(),
    email: z.string().trim().email('email inválido').optional(),
    telefono: z.string().trim().min(1).optional(),
    linkedin: z.string().trim().min(1).optional(),
    notas: z.string().trim().min(1).optional(),
    esPrincipal: z.boolean().optional(),
    esKdm: z.boolean().optional(),
    fuente: z.string().trim().min(1).optional(),
    forzar: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.telefono) {
      ctx.addIssue({
        code: 'custom',
        message:
          'crear_contacto exige email o telefono (o los dos). Un contacto sin ninguno de los dos no puede recibir ' +
          'nada por cadencia y ademas no tiene con que compararse contra los que ya existen.',
      });
    }
  });
export type CrearContactoInput = z.input<typeof crearContactoSchema>;

export type CrearContactoResultado =
  | {
      creado: true;
      contacto: ContactoEscrito;
      // Quien perdio el es_principal al marcar este, null si no habia otro.
      principalAnterior: ContactoEscrito | null;
      contactosEmpresa: ContactoEscrito[];
    }
  | {
      creado: false;
      motivo: 'duplicado_probable';
      mensaje: string;
      candidatos: ContactoEscrito[];
      contactosEmpresa: ContactoEscrito[];
    };

export function crearContacto(input: CrearContactoInput, idOrganizacion: number): CrearContactoResultado {
  const parsed = crearContactoSchema.parse(input);

  return db.transaction((tx) => {
    empresaDeLaOrganizacion(tx, parsed.idEmpresa, idOrganizacion);

    const existentes = contactosDeEmpresa(parsed.idEmpresa, tx);
    const choques = contactosQueChocan(existentes, parsed.email, parsed.telefono);
    if (choques.length > 0 && !parsed.forzar) {
      return {
        creado: false as const,
        motivo: 'duplicado_probable' as const,
        mensaje:
          `No se creó: ${parsed.idEmpresa} ya tiene ${choques.length} contacto(s) con ese mismo email o teléfono ` +
          `(${choques.map((c) => `#${c.idContacto} ${c.nombre ?? 'sin nombre'} ${c.email ?? 'sin email'} ${c.telefono ?? 'sin teléfono'}`).join('; ')}). ` +
          'Complétale los campos que le faltan con actualizar_contacto usando ese idContacto, o repite con forzar:true ' +
          'si de verdad son dos personas distintas.',
        candidatos: choques,
        contactosEmpresa: existentes,
      };
    }

    const principalAnterior = parsed.esPrincipal ? degradarPrincipalAnterior(tx, parsed.idEmpresa) : null;

    const ins = tx
      .insert(contacto)
      .values({
        idEmpresa: parsed.idEmpresa,
        nombre: parsed.nombre ?? null,
        apellido: parsed.apellido ?? null,
        cargo: parsed.cargo ?? null,
        // La categoria NO se recibe: se deriva del cargo con el mismo clasificador que usa la
        // reconciliacion de Notion. cargo_categoria tiene un CHECK de 10 valores en isps.db, y
        // dejar que el cliente MCP escriba texto libre ahi es fabricar un error de constraint.
        cargoCategoria: parsed.cargo ? clasificarCargo(parsed.cargo) : null,
        email: parsed.email ?? null,
        telefono: parsed.telefono ?? null,
        linkedin: parsed.linkedin ?? null,
        notas: parsed.notas ?? null,
        esPrincipal: parsed.esPrincipal ? 1 : 0,
        esKeyDecisionMaker: parsed.esKdm ? 1 : 0,
        fuente: parsed.fuente ?? 'mcp',
      })
      .run();

    const idContacto = Number(ins.lastInsertRowid);

    tx.insert(syncCambios)
      .values({
        fecha: new Date().toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'contacto',
        idRegistro: String(idContacto),
        accion: 'insert',
        detalle: `alta de contacto en ${parsed.idEmpresa}: ${parsed.nombre ?? 'sin nombre'} (${parsed.email ?? 'sin email'})`,
      })
      .run();

    // Relectura, no eco del input: lo que sale es lo que quedo en la base, incluida la
    // cargo_categoria derivada y el id que asigno SQLite.
    return {
      creado: true as const,
      contacto: leerContactoEscrito(tx, idContacto),
      principalAnterior,
      contactosEmpresa: contactosDeEmpresa(parsed.idEmpresa, tx),
    };
  });
}

const actualizarContactoSchema = z
  .object({
    idContacto: z.number().int().positive(),
    nombre: z.string().trim().min(1).optional(),
    apellido: z.string().trim().min(1).optional(),
    cargo: z.string().trim().min(1).optional(),
    email: z.string().trim().email('email inválido').optional(),
    telefono: z.string().trim().min(1).optional(),
    linkedin: z.string().trim().min(1).optional(),
    notas: z.string().trim().min(1).optional(),
    esPrincipal: z.boolean().optional(),
    esKdm: z.boolean().optional(),
    forzar: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const { idContacto: _id, forzar: _f, ...campos } = data;
    if (Object.values(campos).every((v) => v === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'actualizar_contacto requiere al menos un campo a cambiar (nombre, apellido, cargo, email, telefono, ' +
          'linkedin, notas, esPrincipal, esKdm)',
      });
    }
  });
export type ActualizarContactoInput = z.input<typeof actualizarContactoSchema>;

export type ActualizarContactoResultado =
  | { actualizado: true; contacto: ContactoEscrito; principalAnterior: ContactoEscrito | null; contactosEmpresa: ContactoEscrito[] }
  | { actualizado: false; motivo: 'duplicado_probable'; mensaje: string; candidatos: ContactoEscrito[]; contactosEmpresa: ContactoEscrito[] };

// Cambia campos puntuales de un contacto que ya existe. Solo se escribe lo que VINO: un campo
// ausente no se toca, y `.trim().min(1)` hace que un string vacio sea un error de entrada y no
// un borrado silencioso. Es el camino para el caso dominante (248 de 415 contactos de produccion
// sin email): completarle el correo al contacto que registrar_toque creo con solo nombre y
// telefono, para que la empresa deje de estar sin destinatario.
export function actualizarContacto(input: ActualizarContactoInput, idOrganizacion: number): ActualizarContactoResultado {
  const parsed = actualizarContactoSchema.parse(input);

  return db.transaction((tx) => {
    const actual = tx
      .select({ idEmpresa: contacto.idEmpresa })
      .from(contacto)
      .where(eq(contacto.idContacto, parsed.idContacto))
      .get();
    if (!actual) throw new Error(`El contacto ${parsed.idContacto} no existe`);
    empresaDeLaOrganizacion(tx, actual.idEmpresa, idOrganizacion);

    const existentes = contactosDeEmpresa(actual.idEmpresa, tx);
    // Mismo antidupe que al crear, pero excluyendose a si mismo: poner un email que OTRO
    // contacto de la empresa ya tiene fabrica el duplicado por la puerta de atras.
    const choques = contactosQueChocan(existentes, parsed.email, parsed.telefono, parsed.idContacto);
    if (choques.length > 0 && !parsed.forzar) {
      return {
        actualizado: false as const,
        motivo: 'duplicado_probable' as const,
        mensaje:
          `No se actualizó: ese email o teléfono ya lo tiene otro contacto de ${actual.idEmpresa} ` +
          `(${choques.map((c) => `#${c.idContacto} ${c.nombre ?? 'sin nombre'} ${c.email ?? 'sin email'} ${c.telefono ?? 'sin teléfono'}`).join('; ')}). ` +
          'Edita ese contacto, o repite con forzar:true si de verdad son dos personas distintas.',
        candidatos: choques,
        contactosEmpresa: existentes,
      };
    }

    const principalAnterior = parsed.esPrincipal === true ? degradarPrincipalAnterior(tx, actual.idEmpresa, parsed.idContacto) : null;

    const sets: Record<string, unknown> = {};
    if (parsed.nombre !== undefined) sets.nombre = parsed.nombre;
    if (parsed.apellido !== undefined) sets.apellido = parsed.apellido;
    if (parsed.cargo !== undefined) {
      sets.cargo = parsed.cargo;
      sets.cargoCategoria = clasificarCargo(parsed.cargo);
    }
    if (parsed.email !== undefined) sets.email = parsed.email;
    if (parsed.telefono !== undefined) sets.telefono = parsed.telefono;
    if (parsed.linkedin !== undefined) sets.linkedin = parsed.linkedin;
    if (parsed.notas !== undefined) sets.notas = parsed.notas;
    if (parsed.esPrincipal !== undefined) sets.esPrincipal = parsed.esPrincipal ? 1 : 0;
    if (parsed.esKdm !== undefined) sets.esKeyDecisionMaker = parsed.esKdm ? 1 : 0;

    tx.update(contacto).set(sets).where(eq(contacto.idContacto, parsed.idContacto)).run();

    tx.insert(syncCambios)
      .values({
        fecha: new Date().toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'contacto',
        idRegistro: String(parsed.idContacto),
        accion: 'update',
        detalle: `campos: ${Object.keys(sets).join(', ')}`,
      })
      .run();

    return {
      actualizado: true as const,
      contacto: leerContactoEscrito(tx, parsed.idContacto),
      principalAnterior,
      contactosEmpresa: contactosDeEmpresa(actual.idEmpresa, tx),
    };
  });
}

const actualizarCampoCalificacionSchema = z.object({
  campo: z.enum(['usuarios', 'crm', 'pasarela']),
  valor: z.string().trim().min(1),
});

// Edicion inline del checklist de calificacion (Toque 1): guarda UN campo de la cuenta
// sin pasar por registrarToque -- no hay canal ni resultado que calificar aca, solo un
// dato que ya se sabe (click en el item "PREGUNTAR" -> cajon de texto -> guardar).
// "recaudo" se queda afuera a proposito: no tiene columna en empresa todavia (ver
// core/calificacion.ts).
export function actualizarCampoCalificacion(
  idEmpresa: string,
  campo: CampoCalificacion,
  valorCrudo: string,
  idOrganizacion: number,
): void {
  const val = actualizarCampoCalificacionSchema.parse({ campo, valor: valorCrudo });

  const emp = db
    .select({ organizacionActivaId: empresa.organizacionActivaId })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!emp) throw new Error(`Empresa ${idEmpresa} no existe`);
  if (emp.organizacionActivaId !== idOrganizacion) {
    throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
  }

  if (val.campo === 'usuarios') {
    const usuarios = Number(val.valor);
    if (!Number.isFinite(usuarios)) throw new Error('Usuarios debe ser un número');
    // actualizadoEn explicito: sin marcarlo, este Drizzle incluye la columna en el INSERT
    // con NULL y pisa el DEFAULT (datetime('now')) de la tabla real -> NOT NULL constraint.
    // ISO string para igualar el unico sitio que ya maneja bien esta columna
    // (enriquecerDesdeNotion mas abajo, actualizadoEn: ahora).
    const ahora = new Date().toISOString();
    db.insert(empresaUsuarios)
      .values({ idEmpresa, usuariosEstimados: usuarios, actualizadoEn: ahora })
      .onConflictDoUpdate({ target: empresaUsuarios.idEmpresa, set: { usuariosEstimados: usuarios, actualizadoEn: ahora } })
      .run();
    return;
  }

  const sets = val.campo === 'crm' ? { crmSoftware: val.valor } : { pasarelaActual: val.valor };
  db.update(empresa)
    .set({ ...sets, updatedAt: sql`datetime('now')` })
    .where(eq(empresa.idEmpresa, idEmpresa))
    .run();
}

// Lo que ya sabemos de la cuenta, para darselo a fusionarDiscovery/hidratarBrief como punto de
// partida. Devuelve strings vacios (no null) porque el core trabaja con strings.
//
// A diferencia de guardarDiscovery, esta NO lanza cuando la empresa es de otra organizacion:
// devuelve vacio. Es una lectura para armar un borrador, y un throw aca reventaria la ficha
// entera; devolver vacio no filtra el dato ajeno y deja la UI en pie.
export function leerDiscovery(idEmpresa: string, idOrganizacion: number): { notas: string; brief: string } {
  const fila = db
    .select({
      notas: empresa.notasDiscovery,
      brief: empresa.brief,
      organizacionActivaId: empresa.organizacionActivaId,
    })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!fila || fila.organizacionActivaId !== idOrganizacion) return { notas: '', brief: '' };
  return { notas: fila.notas ?? '', brief: fila.brief ?? '' };
}

// Escribe la version que el owner ya aprobo. NO encola al outbox: eso lo hace el caller, en la
// misma transaccion que el toque (patron Outbox, ver CLAUDE.md).
//
// Chequea organizacion y LANZA, igual que actualizarCampoCalificacion: una escritura silenciosa
// a la cuenta de otra organizacion es justo el bug que hay que evitar.
export function guardarDiscovery(
  idEmpresa: string,
  datos: { notas: string; brief: string },
  idOrganizacion: number,
): void {
  const emp = db
    .select({ organizacionActivaId: empresa.organizacionActivaId })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!emp) throw new Error(`Empresa ${idEmpresa} no existe`);
  if (emp.organizacionActivaId !== idOrganizacion) {
    throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
  }

  db.update(empresa)
    .set({ notasDiscovery: datos.notas, brief: datos.brief, updatedAt: sql`datetime('now')` })
    .where(eq(empresa.idEmpresa, idEmpresa))
    .run();
}

// transcriptResumen es opcional a proposito: en un toque dictado no hay Granola, y al regenerar
// el `resumen` con un prompt nuevo no se debe perder el insumo ya cacheado.
export function guardarResumenToque(
  idToque: number,
  datos: { resumen: string; transcriptResumen?: string | null },
): void {
  db.update(toque)
    .set({
      resumen: datos.resumen,
      ...(datos.transcriptResumen !== undefined ? { transcriptResumen: datos.transcriptResumen } : {}),
    })
    .where(eq(toque.idToque, idToque))
    .run();
}

// El insumo cacheado de Granola para este toque, o vacio si el toque fue dictado (sin grabacion)
// o si la grabacion no se ha confirmado todavia.
export function leerTranscriptResumen(idToque: number): string {
  const fila = db
    .select({ transcriptResumen: toque.transcriptResumen })
    .from(toque)
    .where(eq(toque.idToque, idToque))
    .get();
  return fila?.transcriptResumen ?? '';
}

export type ContadoresHoy = {
  // CanalToque, no Canal (2026-07-25): la reunion es un toque y tiene que caer en un bucket. Con
  // los tres canales de cadencia, los 115 toques de reunion de produccion subian el total y no
  // aparecian en ningun canal.
  porCanal: Record<CanalToque, number>;
  porResultado: Record<Resultado, number>;
  // Solo actividad EJECUTADA por el owner (excluye fuente='whatsapp_entrante', ver 2026-07-27
  // abajo). Antes de esta fecha `total` sumaba tambien las respuestas del ISP.
  total: number;
  // Mensajes entrantes del dia que el webhook dejo como toque (fuente='whatsapp_entrante').
  // Aparte de `total` a proposito: un reply del cliente es trabajo suyo, no del operador, y
  // mezclarlo infla "toques de hoy" sin que el operador haya tocado nada. Caso real 2026-07-27:
  // un solo hilo de una sola empresa mando 42 mensajes en el dia, el contador viejo (que sumaba
  // TODAS las filas de hoy sin filtrar fuente) marco 42 "cerradas" con cero toques del operador.
  entrantes: number;
};

// Contadores del día (F0.3 mínimo): toques de HOY de un owner, por canal y por resultado.
// Solo lectura. El toque no tiene owner directo, se filtra vía JOIN a empresa.owner (mismo
// filtro que colaDelDia).
//
// `toque.fecha` esta CANONIZADA a 'YYYY-MM-DD' o ISO completo, asi que substr(fecha, 1, 10)
// es seguro. No siempre lo fue: hasta el 2026-07-15 convivian 5 formatos (incluido
// 'June 18, 2026' y '24-jun 2026' del import de Notion) y este substr no los entendia --
// no lanzaba, solo no contaba, y 67 toques de historial importado nunca aparecieron en los
// contadores. Se canonizo el dato con scripts/normalizar-fechas-toque.ts. Todo escritor
// nuevo DEBE mantener la invariante: ver app/core/fecha-toque.ts.
export function contadoresHoy(hoy: string, owner: string | undefined, idOrganizacion: number): ContadoresHoy {
  const condiciones = [
    eq(toque.idOrganizacion, idOrganizacion),
    sql`substr(${toque.fecha}, 1, 10) = ${hoy}`,
  ];
  if (owner) condiciones.push(eq(empresa.owner, owner));
  const filas = db
    .select({ canal: toque.canal, resultado: toque.resultado, fuente: toque.fuente })
    .from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(and(...condiciones))
    .all();

  const porCanal = Object.fromEntries(CANALES_TOQUE.map((c) => [c, 0])) as Record<CanalToque, number>;
  const porResultado = Object.fromEntries(RESULTADOS.map((r) => [r, 0])) as Record<Resultado, number>;

  // Decisión a propósito: `total` cuenta TODOS los toques EJECUTADOS de hoy del owner,
  // incluyendo cualquier valor legado de canal/resultado que no esté en el enum actual (ej.
  // el "contesto" viejo pre-V1.2 visto en V1.3). Los buckets de porCanal/porResultado solo
  // cuentan los valores reconocidos del enum actual, así que un toque con valor legado
  // sube el total pero no incrementa ningún bucket. Esto puede verse como un descuadre
  // (total > suma de buckets), pero es intencional: perder de vista un toque real del día
  // (no contarlo en total) sería peor que un descuadre visible entre el total y sus buckets.
  //
  // "Ejecutado" excluye fuente='whatsapp_entrante' (2026-07-27): el webhook de WhatsApp
  // inserta un toque por cada mensaje ENTRANTE del ISP (registrarToqueEntrante, sin
  // ejecutor y sin resultado), y antes de este fix ese toque sumaba a `total` igual que uno
  // hecho por el operador. Caso real: 42 mensajes de un solo hilo de una sola empresa
  // marcaron 42 "cerradas" en el dashboard con cero toques reales del operador ese día. Se
  // cuentan aparte en `entrantes`, nunca se descartan (siguen en el historial de la cuenta).
  let entrantes = 0;
  for (const fila of filas) {
    if (fila.fuente === 'whatsapp_entrante') {
      entrantes += 1;
      continue;
    }
    if (fila.canal && (CANALES_TOQUE as readonly string[]).includes(fila.canal)) {
      porCanal[fila.canal as CanalToque] += 1;
    }
    if (fila.resultado && (RESULTADOS as readonly string[]).includes(fila.resultado)) {
      porResultado[fila.resultado as Resultado] += 1;
    }
  }

  const total = filas.length - entrantes;
  return { porCanal, porResultado, total, entrantes };
}

// Cuenta de empresas por estado_notion (rediseño home), SIEMPRE dentro de una
// organización (Parte 1, multi-org). Los null (empresas sin etapa en el funnel) NO se
// incluyen: no representan una etapa. Con owner filtra ademas a ese owner; sin owner
// cuenta toda la organización. Acceso solo por el Repository (regla de arquitectura).
export function contarPorEstado(owner: string | undefined, idOrganizacion: number): Record<string, number> {
  const condiciones = [eq(empresa.organizacionActivaId, idOrganizacion)];
  if (owner) condiciones.push(eq(empresa.owner, owner));

  const filas = db
    .select({ estado: empresa.estadoNotion, n: sql<number>`count(*)` })
    .from(empresa)
    .where(and(...condiciones))
    .groupBy(empresa.estadoNotion)
    .all();

  const out: Record<string, number> = {};
  for (const f of filas) {
    if (f.estado) out[f.estado] = Number(f.n);
  }
  return out;
}

// Resumen del home (rediseño): las 4 métricas de las stat cards. Reusa colaDelDia (cola de
// hoy = vencidos + para hoy) y contarPorEstado sobre toda la base para deals calientes y
// cuentas activas. Solo lectura.
export function resumenHome(owner: string | undefined, hoy: string, idOrganizacion: number) {
  const cola = colaDelDia(hoy, owner, idOrganizacion);
  const toquesHoy = cola.length;
  const vencidos = cola.filter((c) => (c.fecha ?? '') < hoy).length;

  const porEstado = contarPorEstado(undefined, idOrganizacion);
  const dealsCalientes = ESTADOS_CALIENTES.reduce((s, e) => s + (porEstado[e] ?? 0), 0);
  const cuentasActivas = ESTADOS_ACTIVOS.reduce((s, e) => s + (porEstado[e] ?? 0), 0);

  return { toquesHoy, vencidos, dealsCalientes, cuentasActivas };
}

// Repartir el backlog de follow-ups de un owner DENTRO de su organización: N por día
// hábil, lo más caliente primero.
export function repartirFollowups(owner: string, porDia: number, idOrganizacion: number) {
  const rows = db
    .select({ id: empresa.idEmpresa })
    .from(empresa)
    .where(
      and(
        eq(empresa.owner, owner),
        eq(empresa.organizacionActivaId, idOrganizacion),
        isNotNull(empresa.proximoFollowUpFecha),
      ),
    )
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();

  const necesarios = Math.ceil(rows.length / porDia) || 0;
  // Un solo huso de punta a punta. Antes mezclaba getDay() (local del proceso) con
  // toISOString() (UTC): con TZ=America/Bogota en el contenedor esos dos dejan de coincidir
  // de noche y el reparto salta un dia habil.
  const dias: string[] = [];
  let cursor = fechaBogotaISO();
  while (dias.length < necesarios) {
    const dow = diaSemana(cursor);
    if (dow !== 0 && dow !== 6) dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }

  db.transaction((tx) => {
    rows.forEach((r, i) => {
      const fecha = dias[Math.floor(i / porDia)];
      tx.update(empresa)
        .set({ proximoFollowUpFecha: fecha, updatedAt: sql`datetime('now')` })
        .where(eq(empresa.idEmpresa, r.id))
        .run();
    });
    tx.insert(syncCambios)
      .values({
        fecha: new Date().toISOString(),
        corrida: 'repartir',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: owner,
        accion: 'update',
        detalle: `repartir ${rows.length} follow-ups a ${porDia}/dia`,
      })
      .run();
  });

  return { total: rows.length, porDia, hasta: dias[dias.length - 1] ?? null };
}

// V3.2 + V3.1b: la credencial SIEMPRE se cifra antes de tocar disco y se descifra
// solo al leerla server-side. idUsuario ausente = conector GLOBAL (Notion: un solo
// CRM para todos, solo admin lo toca); idUsuario presente = conector PERSONAL
// (Granola: cada usuario conecta su propia cuenta). No se usa onConflictDoUpdate
// sobre (proveedor, idUsuario): SQLite trata cada NULL como distinto dentro de un
// UNIQUE index, asi que dos filas globales del mismo proveedor NO chocarian solas;
// el lookup explicito con isNull/eq de abajo es la garantia real de una sola fila.
function filtroConector(proveedor: string, idUsuario?: string) {
  return and(eq(conector.proveedor, proveedor), idUsuario ? eq(conector.idUsuario, idUsuario) : isNull(conector.idUsuario));
}

export function guardarCredencialConector(proveedor: string, credencial: string, idUsuario?: string) {
  const credencialCiphertext = cifrar(credencial);
  const ahora = new Date().toISOString();
  const existente = db.select({ idConector: conector.idConector }).from(conector).where(filtroConector(proveedor, idUsuario)).get();

  if (existente) {
    db.update(conector)
      .set({ credencialCiphertext, estado: 'activo', updatedAt: ahora })
      .where(eq(conector.idConector, existente.idConector))
      .run();
  } else {
    db.insert(conector)
      .values({ proveedor, idUsuario: idUsuario ?? null, credencialCiphertext, estado: 'activo', createdAt: ahora, updatedAt: ahora })
      .run();
  }
}

// A (2026-07-15): borra el secreto pero NO la fila -- ultima_corrida/ultimo_resultado son
// historial del conector, no del secreto, y perderlos borraria la unica pista de cuando
// dejo de andar. Complemento de quitarConfigConector (que solo duerme la POLITICA): sin
// esto, re-agregar un conector lo revivia ya conectado y no habia forma de reconectar
// desde cero por la UI (decision: "Quitar" se parte en Desactivar vs Quitar-y-borrar).
export function borrarCredencialConector(proveedor: string, idUsuario?: string) {
  db.update(conector)
    .set({ credencialCiphertext: null, estado: 'sin_credencial', updatedAt: new Date().toISOString() })
    .where(filtroConector(proveedor, idUsuario))
    .run();
}

// V3.5: heartbeat del worker por tarea. Upsert igual que guardarCredencialConector
// (mismo motivo: SQLite no fusiona NULLs en un UNIQUE index, el lookup explicito es
// la garantia real). No toca credencialCiphertext, si la fila no existia, nace con
// estado 'sin_credencial' porque el heartbeat no implica que haya credencial cargada.
export function registrarHeartbeatConector(proveedor: string, resultado: string, idUsuario?: string) {
  const ahora = new Date().toISOString();
  const existente = db.select({ idConector: conector.idConector }).from(conector).where(filtroConector(proveedor, idUsuario)).get();

  if (existente) {
    db.update(conector).set({ ultimaCorrida: ahora, ultimoResultado: resultado }).where(eq(conector.idConector, existente.idConector)).run();
  } else {
    db.insert(conector)
      .values({ proveedor, idUsuario: idUsuario ?? null, estado: 'sin_credencial', ultimaCorrida: ahora, ultimoResultado: resultado, createdAt: ahora, updatedAt: ahora })
      .run();
  }
}

export type EstadoConector = {
  tieneCredencial: boolean;
  estado: string;
  ultimaCorrida: string | null;
  ultimoResultado: string | null;
};

// V3.8: lectura SOLO de estado, para la pantalla de conectores. Nunca descifra ni
// devuelve la credencial, ni siquiera enmascarada. "Hay credencial: si/no" es todo
// lo que el cliente necesita ver.
export function estadoConector(proveedor: string, idUsuario?: string): EstadoConector {
  const fila = db
    .select({
      credencialCiphertext: conector.credencialCiphertext,
      estado: conector.estado,
      ultimaCorrida: conector.ultimaCorrida,
      ultimoResultado: conector.ultimoResultado,
    })
    .from(conector)
    .where(filtroConector(proveedor, idUsuario))
    .get();

  return {
    tieneCredencial: Boolean(fila?.credencialCiphertext),
    estado: fila?.estado ?? 'sin_credencial',
    ultimaCorrida: fila?.ultimaCorrida ?? null,
    ultimoResultado: fila?.ultimoResultado ?? null,
  };
}

export function leerCredencialConector(proveedor: string, idUsuario?: string): string | null {
  const fila = db
    .select({ credencialCiphertext: conector.credencialCiphertext })
    .from(conector)
    .where(filtroConector(proveedor, idUsuario))
    .get();
  if (!fila?.credencialCiphertext) return null;
  return descifrar(fila.credencialCiphertext);
}

// Config de negocio no secreta, editable por admin desde /conectores (2026-07-14): no
// pasa por cifrar/descifrar como conector.credencialCiphertext porque no es un
// secreto (buzon de envio de Apollo, etc.), solo un valor operativo. Mismo patron de
// upsert explicito que guardarCredencialConector (una sola fila por clave).
export function leerConfiguracionAdmin(clave: string): string | null {
  const fila = db.select({ valor: configuracionAdmin.valor }).from(configuracionAdmin).where(eq(configuracionAdmin.clave, clave)).get();
  return fila?.valor ?? null;
}

export function guardarConfiguracionAdmin(clave: string, valor: string, idUsuario?: string) {
  const ahora = new Date().toISOString();
  const existente = db.select({ clave: configuracionAdmin.clave }).from(configuracionAdmin).where(eq(configuracionAdmin.clave, clave)).get();

  if (existente) {
    db.update(configuracionAdmin).set({ valor, actualizadoPor: idUsuario ?? null, updatedAt: ahora }).where(eq(configuracionAdmin.clave, clave)).run();
  } else {
    db.insert(configuracionAdmin).values({ clave, valor, actualizadoPor: idUsuario ?? null, updatedAt: ahora }).run();
  }
}

// Rediseño conectores: CRUD de la POLITICA (conector_config), separado de los secretos.
// El modo aqui decide, server-side, si una credencial es global (admin) o por usuario
// (personal). listar solo devuelve habilitados; quitar deja la fila dormida (habilitado=0)
// para no perder credenciales asociadas: re-agregar la revive.
export type ConfigConector = { proveedor: string; modo: 'personal' | 'admin'; habilitado: boolean };

export function listarConfigConectores(): ConfigConector[] {
  return db
    .select({ proveedor: conectorConfig.proveedor, modo: conectorConfig.modo, habilitado: conectorConfig.habilitado })
    .from(conectorConfig)
    .where(eq(conectorConfig.habilitado, 1))
    .all()
    .map((f) => ({ proveedor: f.proveedor, modo: f.modo as 'personal' | 'admin', habilitado: Boolean(f.habilitado) }));
}

export function agregarConfigConector(proveedor: string, modo: 'personal' | 'admin', agregadoPor: string) {
  const ahora = new Date().toISOString();
  const existente = db
    .select({ proveedor: conectorConfig.proveedor })
    .from(conectorConfig)
    .where(eq(conectorConfig.proveedor, proveedor))
    .get();
  if (existente) {
    db.update(conectorConfig).set({ modo, habilitado: 1, updatedAt: ahora }).where(eq(conectorConfig.proveedor, proveedor)).run();
  } else {
    db.insert(conectorConfig).values({ proveedor, modo, habilitado: 1, agregadoPor, createdAt: ahora, updatedAt: ahora }).run();
  }
}

export function actualizarModoConector(proveedor: string, modo: 'personal' | 'admin') {
  db.update(conectorConfig).set({ modo, updatedAt: new Date().toISOString() }).where(eq(conectorConfig.proveedor, proveedor)).run();
}

export function quitarConfigConector(proveedor: string) {
  db.update(conectorConfig).set({ habilitado: 0, updatedAt: new Date().toISOString() }).where(eq(conectorConfig.proveedor, proveedor)).run();
}

export function modoConector(proveedor: string): 'personal' | 'admin' | null {
  const f = db
    .select({ modo: conectorConfig.modo })
    .from(conectorConfig)
    .where(and(eq(conectorConfig.proveedor, proveedor), eq(conectorConfig.habilitado, 1)))
    .get();
  return (f?.modo as 'personal' | 'admin' | undefined) ?? null;
}

// V3.4: arma los terminos de busqueda para el matcher (nombre oficial, normalizado y
// TODOS los alias de la empresa, Granola trae el nombre corto/informal, no el legal
// completo, mas el telefono del contacto si el toque quedo enlazado a uno) y la
// fecha del toque como centro de la ventana de tiempo.
export function terminosBusquedaTranscript(idToque: number): { terminos: string[]; fecha: string } | null {
  const t = db
    .select({ idEmpresa: toque.idEmpresa, idContacto: toque.idContacto, fecha: toque.fecha })
    .from(toque)
    .where(eq(toque.idToque, idToque))
    .get();
  if (!t || !t.fecha) return null;

  const emp = db
    .select({ nombreOficial: empresa.nombreOficial, nombreNormalizado: empresa.nombreNormalizado })
    .from(empresa)
    .where(eq(empresa.idEmpresa, t.idEmpresa))
    .get();

  const alias = db.select({ alias: empresaAlias.alias }).from(empresaAlias).where(eq(empresaAlias.idEmpresa, t.idEmpresa)).all();

  const contactoFila = t.idContacto
    ? db.select({ telefono: contacto.telefono }).from(contacto).where(eq(contacto.idContacto, t.idContacto)).get()
    : undefined;

  const terminos = [emp?.nombreOficial, emp?.nombreNormalizado, ...alias.map((a) => a.alias), contactoFila?.telefono].filter(
    (v): v is string => Boolean(v && v.trim()),
  );

  return { terminos: [...new Set(terminos)], fecha: t.fecha };
}

// V3.6: primitivas de bajo nivel para la politica de reconfirmacion (app/core/confirmarTranscript.ts).
// El core decide CUAL de las dos escrituras usar; estas solo saben ESCRIBIR.
export function leerToqueTranscript(idToque: number): { transcriptId: string | null } | undefined {
  return db.select({ transcriptId: toque.transcriptId }).from(toque).where(eq(toque.idToque, idToque)).get();
}

export function escribirTranscriptCompleto(idToque: number, sesion: SesionTranscript) {
  db.transaction((tx) => {
    tx.update(toque)
      .set({
        transcriptProveedor: sesion.proveedor,
        transcriptId: sesion.transcriptId,
        transcriptUrl: sesion.url,
        quePaso: sesion.resumen,
        // El insumo crudo de Granola, cacheado (2026-07-15). Es lo que pide el CLAUDE.md
        // ("arma el toque + puntero + resumen cacheado") y lo que le da de comer a
        // pedirBorradores sin volver a pegarle a Granola con credencial.
        transcriptResumen: sesion.resumen,
      })
      .where(eq(toque.idToque, idToque))
      .run();

    // Las Notas Discovery NO se encolan aca (2026-07-15). Antes esto mandaba `sesion.resumen`
    // como notasDiscovery: narracion de Granola metida donde van facts crudos, y ademas pisando
    // lo que hubiera en Notion, porque sin columna local no habia con que acumular.
    //
    // Los facts salen ahora de la fusion que el owner aprueba (fusionarDiscovery -> borrador ->
    // registrarToqueAction), y esa es la unica que llega al outbox.
  });
}

export function escribirTranscriptSoloPuntero(idToque: number, sesion: SesionTranscript) {
  db.update(toque)
    .set({
      transcriptProveedor: sesion.proveedor,
      transcriptId: sesion.transcriptId,
      transcriptUrl: sesion.url,
    })
    .where(eq(toque.idToque, idToque))
    .run();
}

// V3.7: primitivas de drenado del outbox, usadas por app/core/outbox.ts (deps
// inyectadas, el core no importa drizzle/better-sqlite3 directo).
export function outboxPendientes(ahora: string = new Date().toISOString()): FilaOutbox[] {
  const filas = db
    .select({ idOutbox: outbox.idOutbox, payload: outbox.payload, intentos: outbox.intentos })
    .from(outbox)
    .where(
      and(
        eq(outbox.estado, 'aprobado'),
        sql`(${outbox.proximoIntento} IS NULL OR ${outbox.proximoIntento} <= ${ahora})`,
      ),
    )
    .all();

  return filas.map((f) => ({ idOutbox: f.idOutbox, intentos: f.intentos, payload: JSON.parse(f.payload) as CambioNotion }));
}

export function marcarOutboxEnviado(idOutbox: number) {
  const ahora = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(outbox).set({ estado: 'enviado' }).where(eq(outbox.idOutbox, idOutbox)).run();
    tx.insert(syncCambios)
      .values({ fecha: ahora, corrida: 'worker', fuente: 'notion-outbox', entidad: 'outbox', idRegistro: String(idOutbox), accion: 'enviado', detalle: 'drenado OK' })
      .run();
  });
}

export function marcarOutboxFallido(idOutbox: number, intentos: number, proximoIntento: string | null) {
  const ahora = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(outbox)
      .set({ estado: proximoIntento ? 'aprobado' : 'fallido', intentos, proximoIntento })
      .where(eq(outbox.idOutbox, idOutbox))
      .run();
    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'worker',
        fuente: 'notion-outbox',
        entidad: 'outbox',
        idRegistro: String(idOutbox),
        accion: proximoIntento ? 'reintento-programado' : 'fallido-definitivo',
        detalle: `intento ${intentos}`,
      })
      .run();
  });
}

// V4.2: crea una cadencia template desde una estructura ya parseada (CSV o Markdown, ver
// app/core/cadencia-parser.ts). Valida con Zod ANTES de escribir (misma garantia de
// dominio que registrarToque: canal cerrado, offsets enteros, al menos un paso). Por cada
// paso crea su version_paso default, que es donde vive el copy (asunto/cuerpo): el paso
// solo guarda orden/dia/canal/objetivo. Todo en una transaccion; devuelve id_cadencia.
export function crearCadencia(parseada: CadenciaParseada): number {
  const val = cadenciaParseadaSchema.parse(parseada);
  const ahora = new Date().toISOString();

  return db.transaction((tx) => insertarCadenciaEnTx(tx, val, ahora));
}

// El cuerpo de crearCadencia, sin abrir transaccion propia. Existe para que crear una
// cadencia Y su campana caiga en UNA sola transaccion (crearCadenciaConCampana, la tool
// crear_cadencia del MCP) en vez de dos consecutivas: con dos, un fallo al insertar la
// campana deja la cadencia huerfana viva para siempre -- el mismo zombie que el wizard
// tuvo que tapar despues con abandonarBorradorAction. Recibe la estructura YA validada
// por cadenciaParseadaSchema: el unico validador sigue siendo crearCadencia/el caller,
// no se valida dos veces ni se confia en que alguien lo hizo.
type TxRepo = Parameters<Parameters<typeof db.transaction>[0]>[0];

function insertarCadenciaEnTx(tx: TxRepo, val: z.output<typeof cadenciaParseadaSchema>, ahora: string): number {
  {
    const insCad = tx
      .insert(cadencia)
      .values({ nombre: val.nombre, descripcion: val.descripcion ?? null, activa: 1, createdAt: ahora, updatedAt: ahora })
      .run();
    const idCadencia = Number(insCad.lastInsertRowid);

    for (const paso of val.pasos) {
      // Sesion 2026-07-09: ningun formato de import (CSV/Markdown/JSON, ver
      // app/core/cadencia-parser.ts) trae una columna para marcar un paso manual, asi
      // que el parser siempre entrega esManual=false por default de Zod. En vez de
      // rechazar el import (validarCanalAutomatico tiraria aca para whatsapp/llamada),
      // se autocorrige: un paso en un canal SIN proveedor automatico hoy
      // (CANALES_AUTOMATICOS) queda manual sin pedirselo al importador. Es la misma
      // regla de validarCanalAutomatico pero aplicada como default en vez de rechazo --
      // valido especificamente aca (import bulk) porque hoy no hay forma de que el
      // importador declare la intencion explicitamente. agregarPasoCadencia y
      // actualizarPasoCadencia (edicion manual en el cockpit) siguen rechazando en vez
      // de autocorregir: ahi el usuario SI tiene un control explicito para elegir, y
      // corregir en silencio seria sorpresivo.
      const esManualFinal = paso.esManual || !CANALES_AUTOMATICOS.includes(paso.canal);
      const insPaso = tx
        .insert(pasoCadencia)
        .values({
          idCadencia,
          orden: paso.orden,
          diaOffset: paso.diaOffset,
          canal: paso.canal,
          objetivo: paso.objetivo ?? null,
          esManual: esManualFinal ? 1 : 0,
          createdAt: ahora,
        })
        .run();
      const idPaso = Number(insPaso.lastInsertRowid);

      tx.insert(versionPaso)
        .values({
          idPaso,
          nombre: 'default',
          asunto: paso.asunto ?? null,
          cuerpo: paso.cuerpo ?? null,
          esDefault: 1,
          activa: 1,
          peso: 1,
          firmaApollo: paso.firmaApollo ? 1 : 0,
          variables: paso.variables.length > 0 ? JSON.stringify(paso.variables) : null,
          createdAt: ahora,
          updatedAt: ahora,
        })
        .run();
    }

    return idCadencia;
  }
}

// Fase 4 (cockpit de cadencia): cambios de un paso existente (dia/canal/aprobacion).
// UPDATE parcial: solo toca las columnas que vienen en `cambios`, las demas quedan
// como estaban (a diferencia de crearCadencia, que siempre escribe la fila completa
// porque nace de cero). canal se valida contra el mismo enum de dominio que usa el
// resto del repository (CANALES), asi el mutator no puede dejar un canal invalido
// aunque la UI se salte el chip cerrado que hoy lo restringe.
const actualizarPasoCadenciaSchema = z.object({
  diaOffset: z.number().int().nonnegative().optional(),
  canal: z.enum(CANALES).optional(),
  esManual: z.boolean().optional(),
  // objetivo (Fase 7): unico campo channel-agnostic a nivel de paso, ademas de
  // asunto/cuerpo en version_paso -- vive aca (no en version_paso) porque no se
  // versiona, es una nota de proposito ("agenda la llamada de 15 min"), no copy enviado.
  objetivo: z.string().nullable().optional(),
});

export function actualizarPasoCadencia(
  idPaso: number,
  cambios: { diaOffset?: number; canal?: Canal; esManual?: boolean; objetivo?: string | null },
): void {
  const val = actualizarPasoCadenciaSchema.parse(cambios);

  // Sesion 2026-07-09: si el update toca canal o esManual, hay que validar el estado
  // FINAL (no solo lo que llega en `cambios`) contra CANALES_AUTOMATICOS -- es un UPDATE
  // parcial, asi que un caller que solo manda { canal: 'whatsapp' } sin tocar esManual
  // deja el esManual que ya tenia la fila, y ese es el que hay que chequear.
  if (val.canal !== undefined || val.esManual !== undefined) {
    const actual = db
      .select({ canal: pasoCadencia.canal, esManual: pasoCadencia.esManual })
      .from(pasoCadencia)
      .where(eq(pasoCadencia.idPaso, idPaso))
      .get();
    if (actual) {
      const canalFinal = val.canal ?? (actual.canal as Canal);
      const esManualFinal = val.esManual ?? actual.esManual === 1;
      validarCanalAutomatico(canalFinal, esManualFinal);
    }
  }

  const set: Partial<typeof pasoCadencia.$inferInsert> = {};
  if (val.diaOffset !== undefined) set.diaOffset = val.diaOffset;
  if (val.canal !== undefined) set.canal = val.canal;
  if (val.esManual !== undefined) set.esManual = val.esManual ? 1 : 0;
  if (val.objetivo !== undefined) set.objetivo = val.objetivo?.trim() || null;

  if (Object.keys(set).length === 0) return; // nada que cambiar, no pega un UPDATE vacio

  db.update(pasoCadencia).set(set).where(eq(pasoCadencia.idPaso, idPaso)).run();
}

// Fase 7 (editor de cadencia): borra un paso y su(s) version_paso. Dos guardas: no
// deja una cadencia sin pasos (rompe todo lo que asume al menos 1), y no borra un
// paso que YA tiene historia real de envio (paso_inscripcion) -- eso corrompe el
// registro de lo que de verdad se mando a una cuenta.
export function eliminarPasoCadencia(idPaso: number): { ok: true } | { ok: false; error: string } {
  const paso = db.select({ idCadencia: pasoCadencia.idCadencia }).from(pasoCadencia).where(eq(pasoCadencia.idPaso, idPaso)).get();
  if (!paso) return { ok: false, error: 'El paso no existe' };

  const totalPasos = db.select({ n: sql<number>`count(*)` }).from(pasoCadencia).where(eq(pasoCadencia.idCadencia, paso.idCadencia)).get();
  if ((totalPasos?.n ?? 0) <= 1) return { ok: false, error: 'Una cadencia necesita al menos un paso' };

  const conHistoria = db.select({ n: sql<number>`count(*)` }).from(pasoInscripcion).where(eq(pasoInscripcion.idPaso, idPaso)).get();
  if ((conHistoria?.n ?? 0) > 0) return { ok: false, error: 'Este paso ya se le envió a alguna cuenta, no se puede eliminar' };

  db.transaction((tx) => {
    tx.delete(versionPaso).where(eq(versionPaso.idPaso, idPaso)).run();
    tx.delete(pasoCadencia).where(eq(pasoCadencia.idPaso, idPaso)).run();
  });
  return { ok: true };
}

// Fase 4 (cockpit de cadencia): agrega un paso nuevo a una cadencia YA creada (el
// boton "+ Añadir paso"/"+ Añadir toque" de la UI). Mismo patron que el loop de
// crearCadencia (paso + su version_paso default) pero para un solo paso, dentro de
// su propia transaccion. orden es el siguiente correlativo: no lo elige el caller,
// asi nunca hay huecos ni duplicados aunque la UI mande varios clics rapido.
const agregarPasoCadenciaSchema = z.object({
  diaOffset: z.number().int().nonnegative(),
  canal: z.enum(CANALES),
  objetivo: z.string().min(1).optional(),
  esManual: z.boolean().optional().default(false),
  asunto: z.string().min(1).optional(),
  cuerpo: z.string().min(1).optional(),
});

export function agregarPasoCadencia(
  idCadencia: number,
  paso: { diaOffset: number; canal: Canal; objetivo?: string; esManual?: boolean; asunto?: string; cuerpo?: string },
): number {
  const val = agregarPasoCadenciaSchema.parse(paso);
  validarCanalAutomatico(val.canal, val.esManual);
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    const maxOrden = tx
      .select({ maxOrden: sql<number | null>`max(${pasoCadencia.orden})` })
      .from(pasoCadencia)
      .where(eq(pasoCadencia.idCadencia, idCadencia))
      .get();
    const orden = (maxOrden?.maxOrden ?? 0) + 1;

    const insPaso = tx
      .insert(pasoCadencia)
      .values({
        idCadencia,
        orden,
        diaOffset: val.diaOffset,
        canal: val.canal,
        objetivo: val.objetivo ?? null,
        esManual: val.esManual ? 1 : 0,
        createdAt: ahora,
      })
      .run();
    const idPaso = Number(insPaso.lastInsertRowid);

    tx.insert(versionPaso)
      .values({
        idPaso,
        nombre: 'default',
        asunto: val.asunto ?? null,
        cuerpo: val.cuerpo ?? null,
        esDefault: 1,
        activa: 1,
        peso: 1,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();

    return idPaso;
  });
}

// V4.2: lista las cadencias como templates, con el conteo de pasos de cada una. Para la
// pantalla de "mis cadencias" (V4.7) y para elegir cadencia al armar una campana (V4.5).
export function listarCadencias() {
  return db
    .select({
      id: cadencia.idCadencia,
      nombre: cadencia.nombre,
      descripcion: cadencia.descripcion,
      activa: cadencia.activa,
      pasos: sql<number>`count(${pasoCadencia.idPaso})`,
    })
    .from(cadencia)
    .leftJoin(pasoCadencia, eq(pasoCadencia.idCadencia, cadencia.idCadencia))
    .groupBy(cadencia.idCadencia)
    .orderBy(desc(cadencia.idCadencia))
    .all();
}

// V4.2: la cadencia como template consultable: cabecera + pasos en orden, cada uno con
// su copy default (asunto/cuerpo de la version es_default). Un LEFT JOIN por si algun
// paso quedara sin version default (no deberia pasar por crearCadencia, pero no revienta).
export function getCadencia(idCadencia: number) {
  const cab = db.select().from(cadencia).where(eq(cadencia.idCadencia, idCadencia)).get();
  if (!cab) return null;

  const filas = db
    .select({
      idPaso: pasoCadencia.idPaso,
      orden: pasoCadencia.orden,
      diaOffset: pasoCadencia.diaOffset,
      canal: pasoCadencia.canal,
      objetivo: pasoCadencia.objetivo,
      esManual: pasoCadencia.esManual,
      idVersion: versionPaso.idVersion,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      firmaApollo: versionPaso.firmaApollo,
      variables: versionPaso.variables,
    })
    .from(pasoCadencia)
    .leftJoin(versionPaso, and(eq(versionPaso.idPaso, pasoCadencia.idPaso), eq(versionPaso.esDefault, 1)))
    .where(eq(pasoCadencia.idCadencia, idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();

  // Parte 3 campanas: variables viaja como JSON en la columna; se parsea de vuelta a
  // array aca (unico punto de lectura), asi el caller nunca toca JSON.parse directo.
  const pasos = filas.map((f) => ({
    ...f,
    esManual: f.esManual === 1,
    firmaApollo: f.firmaApollo === 1,
    variables: f.variables ? (JSON.parse(f.variables) as string[]) : [],
  }));

  return { cadencia: cab, pasos };
}

// V4.3: whitelist campo de dominio -> columna real. numerico marca las columnas
// enteras: sus valores llegan como string (JSON) y se coercen a numero para que el
// IN compare bien contra la afinidad INTEGER de la columna. Este mapa es la unica
// puerta: un campo que no este aca ni siquiera llega (Zod lo rechaza antes), pero el
// mapa garantiza que solo columnas conocidas entran a la consulta.
// rol no tiene columna propia (vive en contacto, 1-a-muchos): se resuelve aparte
// en condicionRol, nunca por este mapa.
const COLUMNA_SEGMENTO: Record<Exclude<CampoSegmento, 'rol'>, { col: SQLiteColumn; numerico: boolean }> = {
  estado: { col: empresa.estadoNotion, numerico: false },
  categoria: { col: empresaCategoriaView.categoria, numerico: false },
  estado_comercial: { col: empresa.estadoComercial, numerico: false },
  prioridad: { col: empresa.prioridadComercial, numerico: true },
  es_cliente: { col: empresa.esCliente, numerico: true },
  ciudad: { col: empresa.ciudadPrincipal, numerico: false },
  departamento: { col: empresa.departamento, numerico: false },
  owner: { col: empresa.owner, numerico: false },
  usuarios: { col: empresaUsuarios.usuariosEstimados, numerico: true },
  en_notion: { col: empresa.notionPageId, numerico: false },
  // La PK. Unico campo pensado para una lista de ids puntuales (ver validation.ts), no
  // para un valor humano: el caller ya sabe exactamente que empresas quiere.
  id_empresa: { col: empresa.idEmpresa, numerico: false },
};

// Coerce los valores de una condicion a numero cuando el campo es numerico (prioridad,
// es_cliente). Un valor no numerico (ej. prioridad='alta' por un typo) se volveria NaN y
// el IN no matchearia nada en silencio; mejor fallar explicito.
function coercer(valores: string[], numerico: boolean, campo: string): string[] | number[] {
  if (!numerico) return valores;
  const nums = valores.map(Number);
  if (nums.some((n) => Number.isNaN(n))) {
    throw new Error(`el campo '${campo}' es numerico: sus valores deben ser numeros, llego [${valores.join(', ')}]`);
  }
  return nums;
}

// Parte 5 campanas: rol vive en contacto (1-a-muchos), no en empresa. Se resuelve
// con un EXISTS/NOT EXISTS correlacionado (subconsulta autocontenida), nunca con un
// join en la consulta principal: un join duplicaria filas de empresa y arruinaria
// el COUNT de personas si las dos condiciones aparecen juntas (ver condicionPersonas).
// Solo en/no_en tienen sentido sobre una relacion 1-a-muchos; es_null/no_null se
// rechazan explicitos en vez de inventar una semantica ambigua.
type CondRol = { op: 'en' | 'no_en'; valores: string[] } | { op: 'es_null' | 'no_null' };
function condicionRol(c: CondRol): SQL {
  if (c.op !== 'en' && c.op !== 'no_en') {
    throw new Error(`el campo 'rol' solo soporta los operadores en/no_en, llego '${c.op}'`);
  }
  const sub = db
    .select({ uno: sql`1` })
    .from(contacto)
    .where(and(eq(contacto.idEmpresa, empresa.idEmpresa), inArray(contacto.cargoCategoria, c.valores)));
  return c.op === 'en' ? exists(sub) : notExists(sub);
}

// Parte 5 campanas: personas = cantidad de contactos de la empresa. Subconsulta
// escalar correlacionada (COUNT), mismo motivo que condicionRol: no se puede volver
// un join sin arruinar el resto de condiciones ANDeadas.
type CondPersonas = { op: 'entre'; desde: number; hasta: number } | { op: 'mayor_que' | 'menor_que'; valor: number };
function condicionPersonas(c: CondPersonas): SQL {
  const cantidad = sql<number>`(SELECT COUNT(*) FROM ${contacto} WHERE ${contacto.idEmpresa} = ${empresa.idEmpresa})`;
  switch (c.op) {
    case 'entre':
      return between(cantidad, c.desde, c.hasta);
    case 'mayor_que':
      return gt(cantidad, c.valor);
    case 'menor_que':
      return lt(cantidad, c.valor);
  }
}

// Traduce una definicion YA validada a un WHERE de drizzle. Las condiciones se ANDean.
// El switch (no ifs sueltos) deja que TS estreche cada rama: en 'en'/'no_en' sabe que
// existe c.valores; en 'es_null'/'no_null' que no.
function compilarSegmento(def: DefinicionSegmento): SQL | undefined {
  const conds = def.condiciones.map((c): SQL => {
    if (c.campo === 'rol') return condicionRol(c);
    if (c.campo === 'personas') return condicionPersonas(c);
    const { col, numerico } = COLUMNA_SEGMENTO[c.campo];
    switch (c.op) {
      case 'es_null':
        return isNull(col);
      case 'no_null':
        return isNotNull(col);
      case 'en':
        return inArray(col, coercer(c.valores, numerico, c.campo));
      case 'no_en':
        return notInArray(col, coercer(c.valores, numerico, c.campo));
      case 'entre':
        // NULL nunca matchea un rango (semantica SQL): empresa sin dato queda fuera.
        // La UI avisa cuantas quedaron fuera; aca no se inventa un default.
        return between(col, c.desde, c.hasta);
      case 'mayor_que':
        return gt(col, c.valor);
      case 'menor_que':
        return lt(col, c.valor);
    }
  });
  return and(...conds);
}

// V4.3: corre un filtro (aun sin guardar) y devuelve las empresas que caen. Valida la
// definicion primero: un filtro corrupto no consulta nada. LEFT JOIN a empresa_usuarios
// Parte 5 campanas: columna (o subconsulta escalar, para personas) usada por el
// ranking "las N mas grandes". Mismo motivo que condicionPersonas: personas no tiene
// columna propia.
function columnaOrden(campo: CampoSegmentoNumerico): SQLiteColumn | SQL<number> {
  if (campo === 'personas') {
    return sql<number>`(SELECT COUNT(*) FROM ${contacto} WHERE ${contacto.idEmpresa} = ${empresa.idEmpresa})`;
  }
  return COLUMNA_SEGMENTO[campo].col;
}

// es gratis (join sobre PK) y necesario para el campo 'usuarios' del segmento.
export function empresasDeSegmento(def: DefinicionSegmento, idOrganizacion: number) {
  const val = definicionSegmentoSchema.parse(def);
  let q = db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      categoria: empresaCategoriaView.categoria,
      usuarios: empresaUsuarios.usuariosEstimados,
      ciudad: empresa.ciudadPrincipal,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(empresaCategoriaView, eq(empresaCategoriaView.idEmpresa, empresa.idEmpresa))
    .where(and(compilarSegmento(val), eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA))
    .$dynamic();

  if (val.orden) {
    const col = columnaOrden(val.orden.campo);
    // SQLite no tiene NULLS LAST nativo: ordenar primero por "es null" (0/1) empuja
    // los nulos al final sin importar asc/desc, y despues ordena por el valor real.
    const direccion = val.orden.dir === 'desc' ? desc(col) : asc(col);
    q = q.orderBy(sql`${col} is null`, direccion);
  } else {
    q = q.orderBy(empresa.nombreOficial);
  }
  if (val.limite) q = q.limit(val.limite);

  return q.all();
}

export function contarSegmento(def: DefinicionSegmento, idOrganizacion: number): number {
  const val = definicionSegmentoSchema.parse(def);
  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(empresaCategoriaView, eq(empresaCategoriaView.idEmpresa, empresa.idEmpresa))
    .where(and(compilarSegmento(val), eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA))
    .get();
  return fila?.n ?? 0;
}

export type DiagnosticoSegmento = {
  total: number;
  // Cuantas empresas caen con CADA condicion sola. Las condiciones se ANDean, asi que una
  // sola en 0 explica el total en 0 por si misma.
  porCondicion: { indice: number; condicion: string; empresas: number }[];
};

// Por que un segmento devuelve 0. Corre cada condicion POR SEPARADO contra la misma base
// (misma organizacion, mismo EMPRESA_VIVA) para senalar cual mata el conjunto.
//
// El dominio cerrado ya lo ataja Zod antes (DOMINIO_SEGMENTO): un valor imposible ni
// siquiera llega aca. Esto cubre el resto del mismo problema, que Zod no puede ver: valores
// perfectamente validos que juntos no matchean a nadie (owner que existe + estado que
// existe, pero ninguna empresa con los dos). "0 empresas" a secas no dice nada; "la
// condicion 3 sola ya da 0" dice exactamente donde mirar.
export function diagnosticoSegmento(def: DefinicionSegmento, idOrganizacion: number): DiagnosticoSegmento {
  const val = definicionSegmentoSchema.parse(def);
  return {
    total: contarSegmento(val, idOrganizacion),
    porCondicion: val.condiciones.map((c, i) => ({
      indice: i,
      condicion: JSON.stringify(c),
      empresas: contarSegmento({ condiciones: [c] }, idOrganizacion),
    })),
  };
}

// V4.3: guarda el filtro compilado como JSON en segmento.definicion. descripcionNatural
// es opcional (el lenguaje natural lo llena Fase 6, aca solo se persiste si viene).
export function guardarSegmento(input: { nombre: string; definicion: DefinicionSegmento; descripcionNatural?: string }, idOrganizacion: number): number {
  const val = definicionSegmentoSchema.parse(input.definicion);
  const ahora = new Date().toISOString();
  const ins = db
    .insert(segmento)
    .values({
      nombre: input.nombre,
      definicion: JSON.stringify(val),
      descripcionNatural: input.descripcionNatural ?? null,
      idOrganizacion,
      createdAt: ahora,
      updatedAt: ahora,
    })
    .run();
  return Number(ins.lastInsertRowid);
}

// Fase 7 (volver a Segmento sin perder el progreso): la definicion completa de un
// segmento guardado, para reabrir NuevoSegmento pre-cargado en vez de vacio. El
// dropdown "Usar un segmento guardado..." salta directo a Cadencia con listarSegmentos
// (solo metadata); esto es para el caso de VOLVER sobre el que ya se estaba armando.
export function obtenerSegmento(idSegmento: number, idOrganizacion: number): { id: number; nombre: string; definicion: DefinicionSegmento; descripcionNatural: string | null } | null {
  const fila = db
    .select({ nombre: segmento.nombre, definicion: segmento.definicion, descripcionNatural: segmento.descripcionNatural })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!fila) return null;
  return { id: idSegmento, nombre: fila.nombre, definicion: definicionSegmentoSchema.parse(JSON.parse(fila.definicion)), descripcionNatural: fila.descripcionNatural };
}

// Fase 7 (autosave de segmento): actualiza un segmento YA guardado (por el autosave
// silencioso de NuevoSegmento) en vez de crear uno nuevo por cada ajuste de filtro --
// si no, cada tecla dejaria un segmento huerfano distinto en "Usar un segmento
// guardado...".
export function actualizarSegmento(idSegmento: number, cambios: { nombre?: string; definicion?: DefinicionSegmento; descripcionNatural?: string }, idOrganizacion: number): void {
  const sets: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) sets.nombre = cambios.nombre;
  if (cambios.definicion !== undefined) sets.definicion = JSON.stringify(definicionSegmentoSchema.parse(cambios.definicion));
  if (cambios.descripcionNatural !== undefined) sets.descripcionNatural = cambios.descripcionNatural;
  if (Object.keys(sets).length === 0) return;
  sets.updatedAt = new Date().toISOString();
  // Multi-organizacion (Parte 2): el UPDATE solo pega si el segmento es de idOrganizacion.
  // Silencioso a proposito (no throw) -- ver nota de diseno al inicio del plan: coherente
  // con que obtenerSegmento ya trata "es de otra organizacion" igual que "no existe".
  db.update(segmento)
    .set(sets)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .run();
}

export function listarSegmentos(idOrganizacion: number) {
  return db
    .select({ id: segmento.idSegmento, nombre: segmento.nombre, descripcionNatural: segmento.descripcionNatural })
    .from(segmento)
    .where(eq(segmento.idOrganizacion, idOrganizacion))
    .orderBy(desc(segmento.idSegmento))
    .all();
}

// Hub /campanas (sesion 2026-07-10, pedido de Sebastian): campana.id_cadencia es
// NOT NULL -- no existe una fila 'borrador' hasta que el wizard llega al paso
// Cadencia y esa cadencia parsea (ver crearBorradorDesdeCadenciaAction). Si alguien
// termina el paso Segmento y se va antes de pegar la cadencia, el segmento SI quedo
// guardado (autosave de NuevoSegmento) pero no hay ninguna campana que mostrar en el
// hub -- por diseno, no por bug. Esta funcion es lo que hace visible ese trabajo:
// cualquier segmento de la organizacion que ninguna campana (de NINGUN estado,
// incluida archivada) referencia todavia. Una vez un segmento aparece en una
// campana, sale de esta lista para siempre, aunque esa campana se cancele despues.
export function segmentosSinCampana(idOrganizacion: number): { id: number; nombre: string; descripcionNatural: string | null; createdAt: string | null }[] {
  return db
    .select({ id: segmento.idSegmento, nombre: segmento.nombre, descripcionNatural: segmento.descripcionNatural, createdAt: segmento.createdAt })
    .from(segmento)
    .where(
      and(
        eq(segmento.idOrganizacion, idOrganizacion),
        notExists(db.select({ x: sql`1` }).from(campana).where(eq(campana.idSegmento, segmento.idSegmento))),
      ),
    )
    .orderBy(desc(segmento.idSegmento))
    .all();
}

// Parte 1 campanas: valores unicos de un campo de texto para poblar el dropdown del
// builder (estilo Apollo). Solo campos de texto: los numericos se filtran por rango,
// no por lista, y ademas usuarios vive en otra tabla.
export function valoresDistintosCampo(campo: CampoSegmento, idOrganizacion: number): string[] {
  // rol vive en contacto, no en empresa (mismo motivo que en compilarSegmento):
  // el dropdown de roles sale de cargo_categoria, no de COLUMNA_SEGMENTO.
  if (campo === 'rol') {
    const filas = db
      .selectDistinct({ v: contacto.cargoCategoria })
      .from(contacto)
      .innerJoin(empresa, eq(empresa.idEmpresa, contacto.idEmpresa))
      .where(and(isNotNull(contacto.cargoCategoria), eq(empresa.organizacionActivaId, idOrganizacion)))
      .orderBy(contacto.cargoCategoria)
      .all();
    return filas.map((f) => String(f.v));
  }
  const { col, numerico } = COLUMNA_SEGMENTO[campo];
  if (numerico) {
    throw new Error(`el campo '${campo}' es numerico: se filtra por rango, no por lista de valores`);
  }
  const filas = db
    .selectDistinct({ v: col })
    .from(empresa)
    .leftJoin(empresaCategoriaView, eq(empresaCategoriaView.idEmpresa, empresa.idEmpresa))
    .where(and(isNotNull(col), eq(empresa.organizacionActivaId, idOrganizacion)))
    .orderBy(col)
    .all();
  return filas.map((f) => String(f.v));
}

export type FilaReadiness = {
  id: string;
  nombre: string;
  ciudad: string | null;
  usuarios: number | null;
  estado: string | null;
  canales: Canal[];
  readiness: Readiness;
};
export type ConteosReadiness = { total: number; listas: number; parciales: number; sinCanal: number; sinContacto: number };

// Parte 5 campanas: contactos (email/telefono) de un lote de empresas, agrupados por
// id_empresa. Query de solo lectura; el calculo de readiness lo hace el core puro.
function _contactosDe(idsEmpresa: string[]): Map<string, { email: string | null; telefono: string | null }[]> {
  const mapa = new Map<string, { email: string | null; telefono: string | null }[]>();
  if (idsEmpresa.length === 0) return mapa;
  const filas = db
    .select({ idEmpresa: contacto.idEmpresa, email: contacto.email, telefono: contacto.telefono })
    .from(contacto)
    .where(inArray(contacto.idEmpresa, idsEmpresa))
    .all();
  for (const f of filas) {
    const lista = mapa.get(f.idEmpresa) ?? [];
    lista.push({ email: f.email, telefono: f.telefono });
    mapa.set(f.idEmpresa, lista);
  }
  return mapa;
}

// Parte 5 campanas: trae las empresas del segmento con su readiness de canal segun la
// cadencia (canalesRequeridos) y la regla de faltante. La query es solo lectura; el
// calculo (canalesDisponibles/readinessEmpresa) vive en core, puro y testeado aparte.
export function empresasConReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante, idOrganizacion: number): FilaReadiness[] {
  const empresas = empresasDeSegmento(def, idOrganizacion);
  const contactosPorEmpresa = _contactosDe(empresas.map((e) => e.id));
  return empresas.map((e) => {
    const contactos = contactosPorEmpresa.get(e.id) ?? [];
    const disponibles = canalesDisponibles(contactos);
    return {
      id: e.id,
      nombre: e.nombre,
      ciudad: e.ciudad,
      usuarios: e.usuarios,
      estado: e.estado,
      canales: [...disponibles],
      readiness: readinessEmpresa(disponibles, canalesRequeridos, regla),
    };
  });
}

export function conteosReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante, idOrganizacion: number): ConteosReadiness {
  const filas = empresasConReadiness(def, canalesRequeridos, regla, idOrganizacion);
  return {
    total: filas.length,
    listas: filas.filter((f) => f.readiness.estado === 'lista').length,
    parciales: filas.filter((f) => f.readiness.estado === 'parcial').length,
    sinCanal: filas.filter((f) => f.readiness.estado === 'sin_canal').length,
    sinContacto: filas.filter((f) => f.canales.length === 0).length,
  };
}

// Fase 5 (vista Reglas): trae lo que la pantalla /campanas/[id]/reglas necesita para
// calcular readiness — cabecera de la campana, los canales que pide su cadencia (en
// orden, para reemplazar/saltar) y la definicion del segmento (para volver a correr
// conteosReadiness live cuando el usuario cambia de regla sin guardar todavia).
export type CampanaConReglas = {
  idCampana: number;
  nombre: string;
  reglaFaltante: ReglaFaltante;
  idSegmento: number;
  idCadencia: number;
  estado: string;
  definicionSegmento: DefinicionSegmento;
  canalesRequeridos: Canal[];
};

export function campanaConReglas(idCampana: number, idOrganizacion: number): CampanaConReglas | null {
  const camp = db
    .select({
      idCampana: campana.idCampana,
      nombre: campana.nombre,
      reglaFaltante: campana.reglaFaltante,
      idCadencia: campana.idCadencia,
      idSegmento: campana.idSegmento,
      estado: campana.estado,
    })
    .from(campana)
    .where(and(eq(campana.idCampana, idCampana), eq(campana.idOrganizacion, idOrganizacion)))
    .get();
  if (!camp) return null;

  const seg = db.select({ definicion: segmento.definicion }).from(segmento).where(eq(segmento.idSegmento, camp.idSegmento)).get();
  if (!seg) return null;

  const pasos = db
    .select({ canal: pasoCadencia.canal })
    .from(pasoCadencia)
    .where(eq(pasoCadencia.idCadencia, camp.idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();

  return {
    idCampana: camp.idCampana,
    nombre: camp.nombre,
    reglaFaltante: camp.reglaFaltante as ReglaFaltante,
    idSegmento: camp.idSegmento,
    idCadencia: camp.idCadencia,
    estado: camp.estado,
    definicionSegmento: definicionSegmentoSchema.parse(JSON.parse(seg.definicion)),
    canalesRequeridos: pasos.map((p) => p.canal as Canal),
  };
}

// Fase 5 (vista Reglas): UPDATE simple del campo. La revision humana pasa antes de
// llamar esto — la pantalla solo persiste cuando el usuario confirma "Guardar regla",
// nunca al tocar las opciones (eso solo recalcula conteos en memoria).
export function actualizarReglaFaltante(idCampana: number, regla: ReglaFaltante, idOrganizacion: number): void {
  const camp = db.select({ idOrganizacion: campana.idOrganizacion }).from(campana).where(eq(campana.idCampana, idCampana)).get();
  if (!camp) throw new Error(`Campana ${idCampana} no existe`);
  if (camp.idOrganizacion !== idOrganizacion) {
    throw new Error(`La campana ${idCampana} es de otra organizacion, no de ${idOrganizacion}`);
  }

  db.update(campana)
    .set({ reglaFaltante: regla, updatedAt: new Date().toISOString() })
    .where(eq(campana.idCampana, idCampana))
    .run();
}

// Lanzar (nuevo, pedido puntual de Sebastian): guarda el id de la secuencia externa que
// devuelve EnvioAdapter.crearCampanaExterna. UPDATE simple de un solo campo, mismo patron
// que actualizarReglaFaltante -- se llama una sola vez, justo despues de crear la secuencia
// en Apollo al lanzar la campana.
export function guardarProveedorCampanaId(idCampana: number, proveedorCampanaId: string, idOrganizacion: number): void {
  const camp = db.select({ idOrganizacion: campana.idOrganizacion }).from(campana).where(eq(campana.idCampana, idCampana)).get();
  if (!camp) throw new Error(`Campana ${idCampana} no existe`);
  if (camp.idOrganizacion !== idOrganizacion) {
    throw new Error(`La campana ${idCampana} es de otra organizacion, no de ${idOrganizacion}`);
  }

  db.update(campana)
    .set({ proveedorCampanaId, updatedAt: new Date().toISOString() })
    .where(eq(campana.idCampana, idCampana))
    .run();
}

// Subir/editar copy en Apollo (sesion 2026-07-08): lo minimo que el boton de la ficha
// de campana necesita para llamar EnvioAdapter.sincronizarCopy -- la secuencia externa
// (proveedorCampanaId) y la cadencia (idCadencia) para traer sus pasos. null si la
// campana no existe o todavia no tiene secuencia externa creada (crearCampanaExterna
// no ha corrido, nada que sincronizar).
export function campanaParaSincronizarCopy(
  idCampana: number,
  idOrganizacion: number,
): { idCadencia: number; proveedorCampanaId: string } | null {
  const camp = db
    .select({ idCadencia: campana.idCadencia, proveedorCampanaId: campana.proveedorCampanaId })
    .from(campana)
    .where(and(eq(campana.idCampana, idCampana), eq(campana.idOrganizacion, idOrganizacion)))
    .get();
  if (!camp || !camp.proveedorCampanaId) return null;
  return { idCadencia: camp.idCadencia, proveedorCampanaId: camp.proveedorCampanaId };
}

// Pasos de una cadencia en la forma que pide el puerto EnvioAdapter.sincronizarCopy.
// Mismo join que getCadencia (solo la version DEFAULT de cada paso, V4.3) -- las
// variantes A/B no suben a Apollo en esta primera pasada (quedaria como mejora
// futura via POST /emailer_touches, ver experimento-apollo.md); subir/editar el copy
// principal es lo que se pidio hoy.
//
// FIX (sesion 2026-07-09): filtra a canal='correo'. Sin esto se intentaba subir TAMBIEN
// los pasos de llamada/whatsapp de la cadencia como si fueran emailer_steps de Apollo --
// bug real, encontrado al construir el registro de proveedor por canal (esta funcion
// es, por definicion, la vista de Apollo/correo de la cadencia, no toda la cadencia).
export function pasosParaSincronizarCopy(idCadencia: number): PasoParaSincronizar[] {
  const filas = db
    .select({
      idPaso: pasoCadencia.idPaso,
      orden: pasoCadencia.orden,
      diaOffset: pasoCadencia.diaOffset,
      proveedorStepId: pasoCadencia.proveedorStepId,
      idVersion: versionPaso.idVersion,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      proveedorTemplateId: versionPaso.proveedorTemplateId,
    })
    .from(pasoCadencia)
    .innerJoin(versionPaso, and(eq(versionPaso.idPaso, pasoCadencia.idPaso), eq(versionPaso.esDefault, 1)))
    .where(and(eq(pasoCadencia.idCadencia, idCadencia), eq(pasoCadencia.canal, 'correo')))
    .orderBy(pasoCadencia.orden)
    .all();

  return filas.map((f) => ({
    idPaso: f.idPaso,
    idVersion: f.idVersion,
    orden: f.orden,
    diaOffset: f.diaOffset,
    asunto: f.asunto,
    cuerpo: f.cuerpo ?? '',
    proveedorStepId: f.proveedorStepId,
    proveedorTemplateId: f.proveedorTemplateId,
  }));
}

// Canales que de verdad tiene esta cadencia (distinct de paso_cadencia.canal), en el
// orden en que aparecen (orden de paso_cadencia.orden) -- para "Enviar una prueba"
// (LanzarCockpit): el selector de canal solo debe ofrecer los que existen, nunca los
// tres fijos (una cadencia sin whatsapp no debe poder "probar" whatsapp).
export function canalesDeCadencia(idCadencia: number): Canal[] {
  const filas = db
    .selectDistinct({ canal: pasoCadencia.canal, orden: pasoCadencia.orden })
    .from(pasoCadencia)
    .where(eq(pasoCadencia.idCadencia, idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();
  const vistos = new Set<Canal>();
  const resultado: Canal[] = [];
  for (const f of filas) {
    const canal = f.canal as Canal;
    if (!vistos.has(canal)) {
      vistos.add(canal);
      resultado.push(canal);
    }
  }
  return resultado;
}

// El primer paso (orden mas bajo) de un canal dado, en la forma que pide
// EnvioAdapter.sincronizarCopy/enviarPaso -- para "Enviar una prueba": la prueba manda
// SOLO este paso, nunca la cadencia completa (decision de Sebastian, 2026-07-10: ver
// una prueba de una vez es mas util que esperar dias de goteo por el resto).
export function primerPasoDeCadencia(idCadencia: number, canal: Canal): PasoParaSincronizar | null {
  const fila = db
    .select({
      idPaso: pasoCadencia.idPaso,
      orden: pasoCadencia.orden,
      diaOffset: pasoCadencia.diaOffset,
      proveedorStepId: pasoCadencia.proveedorStepId,
      idVersion: versionPaso.idVersion,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      proveedorTemplateId: versionPaso.proveedorTemplateId,
    })
    .from(pasoCadencia)
    .innerJoin(versionPaso, and(eq(versionPaso.idPaso, pasoCadencia.idPaso), eq(versionPaso.esDefault, 1)))
    .where(and(eq(pasoCadencia.idCadencia, idCadencia), eq(pasoCadencia.canal, canal)))
    .orderBy(pasoCadencia.orden)
    .get();
  if (!fila) return null;
  return {
    idPaso: fila.idPaso,
    idVersion: fila.idVersion,
    orden: fila.orden,
    diaOffset: fila.diaOffset,
    asunto: fila.asunto,
    cuerpo: fila.cuerpo ?? '',
    proveedorStepId: fila.proveedorStepId,
    proveedorTemplateId: fila.proveedorTemplateId,
  };
}

// Persiste lo que devolvio sincronizarCopy: proveedorStepId vive en paso_cadencia
// (uno por paso), proveedorTemplateId en version_paso (uno por version). Dos UPDATEs
// por fila porque son dos tablas distintas -- mismo motivo que separan pasoCadencia de
// versionPaso en el schema (el A/B cuelga del paso, no es un campo mas del paso).
export function guardarSincronizacionCopy(pasos: PasoSincronizado[]): void {
  const ahora = new Date().toISOString();
  for (const p of pasos) {
    db.update(pasoCadencia).set({ proveedorStepId: p.proveedorStepId }).where(eq(pasoCadencia.idPaso, p.idPaso)).run();
    db.update(versionPaso)
      .set({ proveedorTemplateId: p.proveedorTemplateId, updatedAt: ahora })
      .where(eq(versionPaso.idVersion, p.idVersion))
      .run();
  }
}

// Draft persistente (creacion de campana): UPDATE parcial para los dos campos que
// el paso de Cadencia deja editar mientras la campana sigue en 'borrador' (nombre y
// modo). Mismo patron que actualizarReglaFaltante: valida con el enum de dominio y
// solo escribe las columnas presentes en `cambios`, nunca pega un UPDATE vacio.
const actualizarCampanaBasicoSchema = z.object({
  nombre: z.string().min(1).optional(),
  modo: z.enum(MODOS_CAMPANA).optional(),
});

export function actualizarCampanaBasico(idCampana: number, cambios: { nombre?: string; modo?: ModoCampana }): void {
  const val = actualizarCampanaBasicoSchema.parse(cambios);

  const sets: Record<string, unknown> = {};
  if (val.nombre !== undefined) sets.nombre = val.nombre;
  if (val.modo !== undefined) sets.modo = val.modo;
  if (Object.keys(sets).length === 0) return;

  sets.updatedAt = new Date().toISOString();
  db.update(campana).set(sets).where(eq(campana.idCampana, idCampana)).run();
}

// V4.3: corre un segmento YA guardado (lee su definicion de la DB y la ejecuta). Es el
// puente que V4.5 usa para inscribir "todas las empresas de este segmento".
export function empresasDeSegmentoGuardado(idSegmento: number, idOrganizacion: number) {
  const fila = db
    .select({ definicion: segmento.definicion })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!fila) return null;
  const def = definicionSegmentoSchema.parse(JSON.parse(fila.definicion));
  return empresasDeSegmento(def, idOrganizacion);
}

// Parte 2 campanas: excluir/incluir es un toggle idempotente sobre la fila unica
// (id_segmento, id_empresa). Excluir dos veces no duplica (ON CONFLICT DO NOTHING);
// incluir de vuelta borra la fila si existe (no truena si ya estaba incluida).
export function excluirDeSegmento(idSegmento: number, idEmpresa: string, idOrganizacion: number): void {
  // Multi-organizacion (Parte 2): guard silencioso, misma logica que actualizarSegmento --
  // segmento_exclusion no tiene columna propia de organizacion (hereda por join a segmento),
  // asi que se valida la propiedad del segmento antes de escribir.
  const esDeMiOrganizacion = db
    .select({ id: segmento.idSegmento })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!esDeMiOrganizacion) return;
  db.insert(segmentoExclusion)
    .values({ idSegmento, idEmpresa, createdAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}

export function incluirDeSegmento(idSegmento: number, idEmpresa: string, idOrganizacion: number): void {
  const esDeMiOrganizacion = db
    .select({ id: segmento.idSegmento })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!esDeMiOrganizacion) return;
  db.delete(segmentoExclusion)
    .where(and(eq(segmentoExclusion.idSegmento, idSegmento), eq(segmentoExclusion.idEmpresa, idEmpresa)))
    .run();
}

// Parte 2 campanas: solo los ids ya excluidos de un segmento, sin re-correr la query
// del segmento entero (empresasParaRevision hace eso). La tabla del wizard ya tiene
// las filas del preview; solo necesita saber cuales pintar destildadas. Mismo guard
// silencioso por organizacion: si el segmento no es tuyo, set vacio.
export function idsExcluidosDeSegmento(idSegmento: number, idOrganizacion: number): string[] {
  const esDeMiOrganizacion = db
    .select({ id: segmento.idSegmento })
    .from(segmento)
    .where(and(eq(segmento.idSegmento, idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
    .get();
  if (!esDeMiOrganizacion) return [];
  return db
    .select({ idEmpresa: segmentoExclusion.idEmpresa })
    .from(segmentoExclusion)
    .where(eq(segmentoExclusion.idSegmento, idSegmento))
    .all()
    .map((f) => f.idEmpresa);
}

// Parte 2 campanas: la pantalla de revision necesita TODAS las empresas del segmento,
// cada una marcada si ya esta excluida (para pintar el toggle en su estado real). No
// filtra las excluidas: las deja ver para poder des-excluirlas antes de "continuar".
export function empresasParaRevision(idSegmento: number, idOrganizacion: number) {
  const empresas = empresasDeSegmentoGuardado(idSegmento, idOrganizacion);
  if (!empresas) return null;
  const excluidas = new Set(
    db
      .select({ idEmpresa: segmentoExclusion.idEmpresa })
      .from(segmentoExclusion)
      .where(eq(segmentoExclusion.idSegmento, idSegmento))
      .all()
      .map((f) => f.idEmpresa),
  );
  return empresas.map((e) => ({ ...e, excluida: excluidas.has(e.id) }));
}

// V4.4: cuelga una version A/B nueva de un paso existente. Si nace default, apaga el
// default anterior de ese paso EN LA MISMA TRANSACCION (un paso tiene a lo sumo un
// default). No hay "editar version": iterar copy es agregar, no reescribir la enviada.
export function agregarVersionPaso(idPaso: number, input: VersionPasoInput): number {
  const val = versionPasoInputSchema.parse(input);
  const ahora = new Date().toISOString();
  return db.transaction((tx) => {
    if (val.esDefault) {
      tx.update(versionPaso).set({ esDefault: 0, updatedAt: ahora }).where(eq(versionPaso.idPaso, idPaso)).run();
    }
    const ins = tx
      .insert(versionPaso)
      .values({
        idPaso,
        nombre: val.nombre,
        asunto: val.asunto ?? null,
        cuerpo: val.cuerpo ?? null,
        esDefault: val.esDefault ? 1 : 0,
        activa: 1,
        peso: val.peso,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();
    return Number(ins.lastInsertRowid);
  });
}

// V4.4: versiones activas de un paso, lo que el motor en seco reparte por peso.
export function versionesActivasDePaso(idPaso: number) {
  return db
    .select({
      id: versionPaso.idVersion,
      nombre: versionPaso.nombre,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      peso: versionPaso.peso,
      esDefault: versionPaso.esDefault,
    })
    .from(versionPaso)
    .where(and(eq(versionPaso.idPaso, idPaso), eq(versionPaso.activa, 1)))
    .orderBy(versionPaso.idVersion)
    .all();
}

// V4.4: ajustar peso o apagar/prender una version (peso 0 o activa 0 la sacan del
// reparto). No toca el copy: para cambiar copy se agrega otra version.
export function actualizarVersionPaso(idVersion: number, cambios: { peso?: number; activa?: boolean }) {
  // peso alimenta el reparto A/B (elegirVersionPorPeso); un negativo o NaN lo romperia.
  // 0 SI se permite: es la forma de apagar una version sin borrarla (misma semantica que
  // activa=false, deja la fila para historial).
  if (cambios.peso != null && (!Number.isInteger(cambios.peso) || cambios.peso < 0)) {
    throw new Error('peso debe ser un entero >= 0');
  }
  const sets: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (cambios.peso != null) sets.peso = cambios.peso;
  if (cambios.activa != null) sets.activa = cambios.activa ? 1 : 0;
  db.update(versionPaso).set(sets).where(eq(versionPaso.idVersion, idVersion)).run();
}

// V4.5: una campana = cadencia aplicada a un segmento. Nace en 'borrador'; inscribir la
// pone a correr.
export function crearCampana(input: CampanaInput, idOrganizacion: number): number {
  const val = campanaInputSchema.parse(input);
  const ahora = new Date().toISOString();
  const ins = db
    .insert(campana)
    .values({
      nombre: val.nombre,
      idCadencia: val.idCadencia,
      idSegmento: val.idSegmento,
      estado: 'borrador',
      modo: val.modo,
      reglaFaltante: val.reglaFaltante,
      intakeDiario: val.intakeDiario ?? null,
      ritmoIngreso: val.ritmoIngreso,
      topeToquesDia: val.topeToquesDia ?? null,
      fechaInicio: val.fechaInicio ?? null,
      owner: val.owner ?? null,
      idOrganizacion,
      createdAt: ahora,
      updatedAt: ahora,
    })
    .run();
  return Number(ins.lastInsertRowid);
}

// --- crear una cadencia entera de una (tool crear_cadencia del MCP) --------------------
//
// Hasta hoy montar una cadencia solo se podia por el wizard web: crearCadencia y crearCampana
// tenian UN solo caller, app/campanas/nueva/actions.ts, una Server Action detras de la sesion
// del navegador. Un agente al que se le pidiera armar una cadencia quedaba sin camino, o
// terminaba insertando a mano en cadencia + paso_cadencia + version_paso + segmento + campana,
// que es exactamente el rodeo que no se paga una vez sino cada vez.
//
// UNA transaccion para las tres filas, no tres seguidas. campana.id_cadencia y
// campana.id_segmento son NOT NULL: si la campana falla despues de insertar la cadencia, esa
// cadencia queda huerfana y viva para siempre, sin ninguna campana que la referencie y sin
// forma de llegar a ella desde ninguna pantalla. El wizard ya se comio ese zombie y tuvo que
// agregar abandonarBorradorAction para limpiarlo a mano; aca no puede pasar porque no existe
// el estado intermedio.
//
// La cadencia NACE con su campana a proposito (no hay una funcion para crear una cadencia
// suelta desde el MCP): una cadencia sin campana no la consume nada, no se puede inscribir
// nadie en ella y no aparece en ninguna lista. Poder crearla suelta solo agrega una forma de
// dejar basura.
export type CrearCadenciaConCampanaInput = {
  cadencia: CadenciaParseada;
  // Reusar un segmento ya guardado, o crear uno nuevo con su definicion. No hay tercera
  // opcion "sin segmento": campana.id_segmento es NOT NULL, y definicionSegmentoSchema exige
  // al menos una condicion justamente para que nadie cree una campana que matchea la base
  // entera.
  segmento: { idSegmento: number } | { nombre: string; definicion: DefinicionSegmento; descripcionNatural?: string };
  // owner es obligatorio, sin default. Es de quien sale el mensaje: idUsuarioDeOwner lo usa
  // para resolver el Gmail y la linea de WhatsApp con los que se manda. Una campana con owner
  // null cae a Apollo en silencio (resolverAdaptadorCorreo), asi que dejarlo vacio no es un
  // dato faltante, es mandar por otro proveedor sin decirlo.
  owner: string;
  nombreCampana?: string;
  modo?: ModoCampana;
  reglaFaltante?: ReglaFaltanteInput;
  intakeDiario?: number;
  ritmoIngreso?: RitmoIngresoInput;
  topeToquesDia?: number;
  fechaInicio?: string;
};

const crearCadenciaConCampanaSchema = z.object({
  owner: z.string().min(1, 'owner es obligatorio: es de quien sale el mensaje'),
  nombreCampana: z.string().min(1).optional(),
  modo: z.enum(MODOS_CAMPANA).optional(),
  reglaFaltante: z.enum(REGLAS_FALTANTE).optional(),
  intakeDiario: z.number().int().positive().optional(),
  ritmoIngreso: z.enum(RITMOS_INGRESO).optional(),
  topeToquesDia: z.number().int().positive().optional(),
  fechaInicio: z.string().min(1).optional(),
});

export function crearCadenciaConCampana(
  input: CrearCadenciaConCampanaInput,
  idOrganizacion: number,
): { idCadencia: number; idCampana: number; idSegmento: number } {
  // Los tres validadores corren ANTES de abrir la transaccion: una definicion invalida no
  // debe llegar a escribir la cadencia y despues hacer rollback, debe no empezar.
  const meta = crearCadenciaConCampanaSchema.parse(input);
  const cad = cadenciaParseadaSchema.parse(input.cadencia);
  const segNuevo = 'idSegmento' in input.segmento ? null : definicionSegmentoSchema.parse(input.segmento.definicion);

  // Un segmento reusado se verifica contra la organizacion ANTES de escribir nada: sin esto se
  // podria colgar una campana de esta organizacion de un segmento de otra.
  if ('idSegmento' in input.segmento) {
    const existe = db
      .select({ id: segmento.idSegmento })
      .from(segmento)
      .where(and(eq(segmento.idSegmento, input.segmento.idSegmento), eq(segmento.idOrganizacion, idOrganizacion)))
      .get();
    if (!existe) throw new Error(`El segmento ${input.segmento.idSegmento} no existe en la organizacion ${idOrganizacion}`);
  }

  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    let idSegmento: number;
    if ('idSegmento' in input.segmento) {
      idSegmento = input.segmento.idSegmento;
    } else {
      const insSeg = tx
        .insert(segmento)
        .values({
          nombre: input.segmento.nombre,
          definicion: JSON.stringify(segNuevo),
          descripcionNatural: input.segmento.descripcionNatural ?? null,
          idOrganizacion,
          createdAt: ahora,
          updatedAt: ahora,
        })
        .run();
      idSegmento = Number(insSeg.lastInsertRowid);
    }

    const idCadencia = insertarCadenciaEnTx(tx, cad, ahora);

    const insCamp = tx
      .insert(campana)
      .values({
        nombre: meta.nombreCampana ?? cad.nombre,
        idCadencia,
        idSegmento,
        // Nace en 'borrador', igual que crearCampana: crear no es lanzar. Quien la pone a
        // correr es inscribirCampana (lanzar_campana) o inscribirEmpresaEnCadencia
        // (cambiar_cadencia), y esos dos son los que la pasan a 'activa'.
        estado: 'borrador',
        modo: meta.modo ?? 'prioritaria',
        reglaFaltante: meta.reglaFaltante ?? 'cola',
        intakeDiario: meta.intakeDiario ?? null,
        ritmoIngreso: meta.ritmoIngreso ?? 'diario',
        topeToquesDia: meta.topeToquesDia ?? null,
        fechaInicio: meta.fechaInicio ?? null,
        owner: meta.owner,
        idOrganizacion,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();

    return { idCadencia, idCampana: Number(insCamp.lastInsertRowid), idSegmento };
  });
}

// Lectura minima, reusada por prepararEnvioCorreoDirecto y por el preview en seco de
// enviarCorreoDirectoTool (que no puede llamar a prepararEnvioCorreoDirecto porque esa
// escribe). null si la empresa no existe -- ese es el unico bloqueo que este helper reporta,
// el resto (formato de email, Gmail conectado) lo valida quien llama.
export function empresaNombrePorId(idEmpresa: string): string | null {
  const f = db.select({ nombreOficial: empresa.nombreOficial }).from(empresa).where(eq(empresa.idEmpresa, idEmpresa)).get();
  return f?.nombreOficial ?? null;
}

// --- enviar_correo_directo (ESCRITURA, MCP, 2026-09-01) --------------------------------
//
// El movimiento que le faltaba a correo, simetrico a enviar_whatsapp_directo (2026-07-28): UN
// correo a UNA cuenta, YA, sin que el operador tenga que armar una cadencia/campana a mano para
// mandar un texto que el ya redacto. La diferencia con WhatsApp es deliberada: WhatsApp
// bypasea paso_inscripcion por completo porque no hay pixel de apertura equivalente para ese
// canal (ver la nota larga en tools.ts, enviarWhatsappDirectoTool). Correo SI tiene pixel
// (core/tracking-links.ts) y el operador lo pidio explicito, asi que esta funcion NO puede
// tomar el mismo atajo: tiene que dejar la MISMA fila que resolverDestinatarioPorEmail y
// trackingCorreo ya saben leer (paso_inscripcion -> destinatario -> contacto,
// destinatario -> inscripcion -> empresa, inscripcion -> campana -> proveedor_campana_id), o
// el pixel sale al aire sin nada que lo enganche a la empresa -- exactamente el "pixel
// paralelo que tracking_correo no sabe leer" que el operador pidio no construir.
//
// Arma el mismo andamiaje minimo que crearCadenciaConCampana (cadencia+paso+version+segmento+
// campana), pero de UN solo paso, para UNA sola empresa -- el segmento usa la condicion
// campo:'id_empresa' que ya existe para este mismo proposito ("apuntar una lista puntual de
// empresas", commit 8d1bcf2, crear_cadencia) reducida a una lista de una. Crea ademas la
// inscripcion+destinatario+contacto de esa empresa a mano, en vez de pasar por inscribirCampana
// (que calcula goteo/fechas para un segmento completo, pensado para una campana con muchas
// empresas, no para "mandalo ya a esta").
//
// Todo en UNA transaccion, y el envio real de Gmail queda AFUERA a proposito (mismo patron que
// push.ts: marcarPasoInscripcionEnviando/enviar de verdad/marcarPasoInscripcionEnviada) porque
// la conexion de esta DB es sincrona y un await de red no puede vivir dentro de un
// db.transaction. El caller (tools.ts) manda de verdad ENTRE prepararEnvioCorreoDirecto y
// registrarPasoEnviadoConToque.
//
// Por que el paso_inscripcion que queda 'pendiente' durante esa ventana no se lo puede llevar el
// worker: pasoInscripcionesPendientes exige, para cualquier canal, `esManual=0 OR
// aprobadoEn IS NOT NULL` -- este paso nace con esManual=1 y aprobadoEn nunca se toca, asi que
// esa condicion es SIEMPRE falsa para el. No hace falta ademas dejar la campana en 'borrador'
// ni el proveedor_campana_id en NULL (aunque de todas formas ayudan, y por eso van seteados
// desde ya: correo exige proveedor_campana_id no nulo para salir, otra puerta cerrada).
export type PrepararEnvioCorreoDirectoInput = {
  idEmpresa: string;
  // El primero es el correlator del pixel (el mismo email que queda en contacto.email, contra
  // el que resolverDestinatarioPorEmail busca). Los siguientes, si vienen, son mas "To" sin
  // pixel propio -- este mecanismo solo sabe correlacionar UN email por envio.
  destinatarios: string[];
  cc: string[];
  asunto: string;
  cuerpoHtml: string;
  owner: string;
};

export type PrepararEnvioCorreoDirectoResultado = {
  idCampana: number;
  proveedorCampanaId: string;
  idPasoInscripcion: number;
  idContacto: number;
  contactoCreado: boolean;
  idEmpresa: string;
  empresaNombre: string;
};

export function prepararEnvioCorreoDirecto(
  input: PrepararEnvioCorreoDirectoInput,
  idOrganizacion: number,
): PrepararEnvioCorreoDirectoResultado {
  if (input.destinatarios.length === 0) {
    throw new Error('enviar_correo_directo: hace falta al menos un destinatario');
  }
  if (!input.owner.trim()) {
    throw new Error('enviar_correo_directo: owner vacío, es de quién sale el correo');
  }
  const empresaNombre = empresaNombrePorId(input.idEmpresa);
  if (!empresaNombre) throw new Error(`enviar_correo_directo: la empresa ${input.idEmpresa} no existe`);

  const emailPrincipal = input.destinatarios[0].trim().toLowerCase();
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    // Find-or-create del contacto que correlaciona el pixel. No pasa por crearContacto: su
    // chequeo de duplicado_probable existe para un humano cargando la libreta de contactos a
    // mano, y aca el email YA ES la instruccion explicita de a quien mandarle -- no hay
    // ambiguedad que resolver, solo un dato que reusar si ya existe o crear si no.
    const existentes = contactosDeEmpresa(input.idEmpresa, tx);
    const yaExiste = existentes.find((c) => c.email?.trim().toLowerCase() === emailPrincipal);
    let idContacto: number;
    let contactoCreado = false;
    if (yaExiste) {
      idContacto = yaExiste.idContacto;
    } else {
      const insContacto = tx
        .insert(contacto)
        .values({
          idEmpresa: input.idEmpresa,
          email: input.destinatarios[0].trim(),
          esPrincipal: 0,
          esKeyDecisionMaker: 0,
          fuente: 'mcp_correo_directo',
        })
        .run();
      idContacto = Number(insContacto.lastInsertRowid);
      contactoCreado = true;
    }

    const insCadencia = tx
      .insert(cadencia)
      .values({
        nombre: `Correo directo: ${input.asunto}`,
        descripcion: `Envío puntual a ${input.idEmpresa}, de ${input.owner}`,
        activa: 1,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();
    const idCadencia = Number(insCadencia.lastInsertRowid);

    const insPaso = tx
      .insert(pasoCadencia)
      .values({ idCadencia, orden: 1, diaOffset: 0, canal: 'correo', esManual: 1, createdAt: ahora })
      .run();
    const idPaso = Number(insPaso.lastInsertRowid);

    const insVersion = tx
      .insert(versionPaso)
      .values({
        idPaso,
        nombre: 'default',
        asunto: input.asunto,
        cuerpo: input.cuerpoHtml,
        esDefault: 1,
        activa: 1,
        peso: 1,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();
    const idVersion = Number(insVersion.lastInsertRowid);

    // Segmento de una sola empresa: misma condicion campo:'id_empresa' de crear_cadencia
    // (commit 8d1bcf2), aca con una lista de un elemento. Nadie vuelve a evaluar este segmento
    // (no se pasa por inscribirCampana), pero su definicion queda valida por si algo lo lee.
    const definicion: DefinicionSegmento = { condiciones: [{ campo: 'id_empresa', op: 'en', valores: [input.idEmpresa] }] };
    const insSegmento = tx
      .insert(segmento)
      .values({
        nombre: `Correo directo: ${input.idEmpresa}`,
        definicion: JSON.stringify(definicion),
        idOrganizacion,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();
    const idSegmento = Number(insSegmento.lastInsertRowid);

    const insCampana = tx
      .insert(campana)
      .values({
        nombre: `Correo directo: ${input.asunto}`,
        idCadencia,
        idSegmento,
        estado: 'activa',
        modo: 'prioritaria',
        reglaFaltante: 'cola',
        ritmoIngreso: 'diario',
        owner: input.owner,
        idOrganizacion,
        createdAt: ahora,
        updatedAt: ahora,
      })
      .run();
    const idCampana = Number(insCampana.lastInsertRowid);

    // Gmail no tiene secuencia externa (no implementa MotorSecuencia, ver core/ports/envio.ts):
    // el id sintetico es el mismo patron que ya usa lanzarCampanaAction para una campana de
    // cadencia real (`gmail-camp-${idCampana}`), aca con su propio prefijo para que no
    // colisione ni se confunda con una campana lanzada por la web.
    const proveedorCampanaId = `gmail-directo-${idCampana}`;
    tx.update(campana).set({ proveedorCampanaId, updatedAt: ahora }).where(eq(campana.idCampana, idCampana)).run();

    const insInscripcion = tx
      .insert(inscripcion)
      .values({ idCampana, idEmpresa: input.idEmpresa, estado: 'activa', pasoActual: 1, fechaInscripcion: ahora, createdAt: ahora, updatedAt: ahora })
      .run();
    const idInscripcion = Number(insInscripcion.lastInsertRowid);

    const insDestinatario = tx.insert(destinatario).values({ idInscripcion, idContacto, estado: 'activo', createdAt: ahora }).run();
    const idDestinatario = Number(insDestinatario.lastInsertRowid);

    const insPasoInscripcion = tx
      .insert(pasoInscripcion)
      .values({ idDestinatario, idPaso, idVersion, canal: 'correo', estado: 'pendiente', fechaProgramada: ahora, createdAt: ahora })
      .run();
    const idPasoInscripcion = Number(insPasoInscripcion.lastInsertRowid);

    return { idCampana, proveedorCampanaId, idPasoInscripcion, idContacto, contactoCreado, idEmpresa: input.idEmpresa, empresaNombre };
  });
}

// Releido POST-envio para enviar_correo_directo: lo que la tool devuelve al confirmar no es el
// eco del input, es esto -- estado real de paso_inscripcion (para probar que de verdad quedo
// 'enviada' y no 'fallo'), el proveedor_mensaje_id/hilo que Gmail devolvio, y el
// proveedor_campana_id que quedo horneado en el pixel del correo que salio (para poder cruzarlo
// a mano contra tracking_correo si hace falta). null solo si idPasoInscripcion no existe, que no
// deberia pasar nunca porque lo devuelve la misma transaccion que lo crea.
export type EnvioCorreoDirectoLeido = {
  idPasoInscripcion: number;
  idCampana: number;
  proveedorCampanaId: string | null;
  idEmpresa: string;
  empresaNombre: string;
  idContacto: number;
  contactoEmail: string | null;
  estado: string;
  proveedor: string | null;
  proveedorMensajeId: string | null;
  proveedorHiloId: string | null;
  fechaEnviada: string | null;
  asunto: string | null;
  cuerpo: string | null;
};

export function envioCorreoDirectoLeido(idPasoInscripcion: number): EnvioCorreoDirectoLeido | null {
  const f = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idCampana: campana.idCampana,
      proveedorCampanaId: campana.proveedorCampanaId,
      idEmpresa: inscripcion.idEmpresa,
      empresaNombre: empresa.nombreOficial,
      idContacto: contacto.idContacto,
      contactoEmail: contacto.email,
      estado: pasoInscripcion.estado,
      proveedor: pasoInscripcion.proveedor,
      proveedorMensajeId: pasoInscripcion.proveedorMensajeId,
      proveedorHiloId: pasoInscripcion.proveedorHiloId,
      fechaEnviada: pasoInscripcion.fechaEnviada,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .get();
  return f ?? null;
}

// --- releer una campana entera --------------------------------------------------------
//
// La relectura que exige la regla del write-path: una tool de escritura devuelve lo que quedo
// EN LA BASE, no el eco del input. Trae la campana, su cadencia paso por paso con el copy de
// la version default (que es lo que de verdad se va a mandar), el segmento con cuantas
// empresas caen hoy, y el diagnostico de si el correo va a salir o no.
export type PasoDeCadenciaLeido = {
  idPaso: number;
  orden: number;
  canal: string;
  diaOffset: number;
  esManual: boolean;
  objetivo: string | null;
  idVersion: number | null;
  asunto: string | null;
  cuerpo: string | null;
  variables: string[];
};

export type CampanaCompleta = {
  campana: {
    idCampana: number;
    nombre: string;
    estado: string;
    modo: string;
    reglaFaltante: string;
    owner: string | null;
    idOrganizacion: number;
    proveedorCampanaId: string | null;
    aprobadaEnvioGmail: boolean;
    intakeDiario: number | null;
    ritmoIngreso: string | null;
    topeToquesDia: number | null;
    fechaInicio: string | null;
    createdAt: string | null;
  };
  cadencia: { idCadencia: number; nombre: string; descripcion: string | null; activa: boolean };
  pasos: PasoDeCadenciaLeido[];
  segmento: {
    idSegmento: number;
    nombre: string;
    definicion: DefinicionSegmento | null;
    empresasQueCaen: number | null;
    // Por que la definicion no se pudo leer (definicion queda en null). Antes ese null salia
    // pelado y no habia forma de distinguir "el segmento se borro" de "su definicion tiene un
    // valor que ningun campo acepta".
    problema: string | null;
    // Solo cuando caen 0 empresas: cuenta CADA condicion por separado para decir cual es la
    // que vacia el conjunto. Un "0" sin esto no se puede depurar sin abrir la base a mano.
    porQueCero: DiagnosticoSegmento | null;
  };
  inscripciones: { estado: string; n: number }[];
};

export function campanaCompleta(idCampana: number, idOrganizacion: number): CampanaCompleta | null {
  const camp = db
    .select()
    .from(campana)
    .where(and(eq(campana.idCampana, idCampana), eq(campana.idOrganizacion, idOrganizacion)))
    .get();
  if (!camp) return null;

  const cad = db.select().from(cadencia).where(eq(cadencia.idCadencia, camp.idCadencia)).get();
  if (!cad) throw new Error(`La campana ${idCampana} apunta a la cadencia ${camp.idCadencia}, que no existe`);

  // LEFT JOIN a la version default: un paso sin version default es un paso sin copy, y hay que
  // poder VERLO en la relectura (es justo lo que impide que el correo salga), no esconderlo
  // detras de un inner join que lo desaparece de la lista.
  const pasos = db
    .select({
      idPaso: pasoCadencia.idPaso,
      orden: pasoCadencia.orden,
      canal: pasoCadencia.canal,
      diaOffset: pasoCadencia.diaOffset,
      esManual: pasoCadencia.esManual,
      objetivo: pasoCadencia.objetivo,
      idVersion: versionPaso.idVersion,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      variables: versionPaso.variables,
    })
    .from(pasoCadencia)
    .leftJoin(versionPaso, and(eq(versionPaso.idPaso, pasoCadencia.idPaso), eq(versionPaso.esDefault, 1)))
    .where(eq(pasoCadencia.idCadencia, camp.idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();

  const seg = db.select().from(segmento).where(eq(segmento.idSegmento, camp.idSegmento)).get();
  let definicion: DefinicionSegmento | null = null;
  let empresasQueCaen: number | null = null;
  let problema: string | null = null;
  let porQueCero: DiagnosticoSegmento | null = null;
  if (seg) {
    // Un segmento con una definicion corrupta no debe tumbar la relectura entera de una
    // escritura que YA ocurrio: se reporta como null y la campana se sigue viendo. El motivo
    // SI se guarda (problema): tragarselo dejaba un null sin explicacion, que es la misma
    // clase de falla silenciosa que el "0 empresas" de abajo.
    try {
      definicion = definicionSegmentoSchema.parse(JSON.parse(seg.definicion));
      empresasQueCaen = contarSegmento(definicion, idOrganizacion);
      if (empresasQueCaen === 0) porQueCero = diagnosticoSegmento(definicion, idOrganizacion);
    } catch (e) {
      definicion = null;
      problema = e instanceof Error ? e.message : String(e);
    }
  } else {
    problema = `el segmento ${camp.idSegmento} que referencia esta campana ya no existe`;
  }

  const inscripciones = db
    .select({ estado: inscripcion.estado, n: sql<number>`count(*)` })
    .from(inscripcion)
    .where(eq(inscripcion.idCampana, idCampana))
    .groupBy(inscripcion.estado)
    .all();

  return {
    campana: {
      idCampana: camp.idCampana,
      nombre: camp.nombre,
      estado: camp.estado,
      modo: camp.modo,
      reglaFaltante: camp.reglaFaltante,
      owner: camp.owner,
      idOrganizacion: camp.idOrganizacion,
      proveedorCampanaId: camp.proveedorCampanaId,
      aprobadaEnvioGmail: camp.aprobadaEnvioGmail === 1,
      intakeDiario: camp.intakeDiario,
      ritmoIngreso: camp.ritmoIngreso,
      topeToquesDia: camp.topeToquesDia,
      fechaInicio: camp.fechaInicio,
      createdAt: camp.createdAt,
    },
    cadencia: { idCadencia: cad.idCadencia, nombre: cad.nombre, descripcion: cad.descripcion, activa: cad.activa === 1 },
    pasos: pasos.map((p) => ({
      idPaso: p.idPaso,
      orden: p.orden,
      canal: p.canal,
      diaOffset: p.diaOffset,
      esManual: p.esManual === 1,
      objetivo: p.objetivo,
      idVersion: p.idVersion,
      asunto: p.asunto,
      cuerpo: p.cuerpo,
      variables: p.variables ? (JSON.parse(p.variables) as string[]) : [],
    })),
    segmento: { idSegmento: camp.idSegmento, nombre: seg?.nombre ?? '(segmento borrado)', definicion, empresasQueCaen, problema, porQueCero },
    inscripciones,
  };
}

// --- por que un correo de esta campana no va a salir ----------------------------------
//
// El bug que esto existe para hacer visible: inscribir una empresa en una campana con pasos de
// correo produce filas de paso_inscripcion que NUNCA salen y nadie avisa. Son tres compuertas
// distintas, en tres archivos distintos, y ninguna deja rastro cuando corta:
//
//  1. pasoInscripcionesPendientes (repository) exige campana.proveedor_campana_id NOT NULL.
//     Una campana con NULL simplemente no aparece en la consulta: sus filas quedan 'pendiente'
//     para siempre y ningun log lo dice.
//  2. agruparPendientesCorreo (adapters/registro-envio.ts) descarta la fila entera cuando el
//     dueno resuelve a Gmail y aprobada_envio_gmail=0. Era un `continue` pelado.
//  3. pasoInscripcionesPendientes exige es_manual=0 O aprobado_en NOT NULL. Un paso de correo
//     marcado manual espera revision humana igual que uno de WhatsApp.
//
// Medido en produccion el 2026-07-28: las dos campanas vivas (55 y 56) tienen las TRES
// compuertas cerradas a la vez -- proveedor_campana_id NULL, aprobada_envio_gmail 0, y los 5
// pasos de correo de cada una con es_manual=1.
//
// Esta funcion las lee juntas y dice cual esta cerrada. No arregla nada por su cuenta: es el
// dato que las tools devuelven para que un envio muerto sea imposible de no ver.
export type EstadoEnvioCorreo = {
  idCampana: number;
  tieneCorreo: boolean;
  pasosCorreo: number;
  saldra: boolean;
  bloqueos: string[];
  proveedorCampanaId: string | null;
  aprobadaEnvioGmail: boolean;
  owner: string | null;
  idUsuarioDelOwner: string | null;
  proveedorQueMandaria: 'gmail' | 'apollo' | null;
  pasosManualesSinAprobar: number;
};

export function estadoEnvioCorreo(idCampana: number, idOrganizacion: number): EstadoEnvioCorreo | null {
  const camp = db
    .select({
      idCadencia: campana.idCadencia,
      estado: campana.estado,
      owner: campana.owner,
      proveedorCampanaId: campana.proveedorCampanaId,
      aprobadaEnvioGmail: campana.aprobadaEnvioGmail,
    })
    .from(campana)
    .where(and(eq(campana.idCampana, idCampana), eq(campana.idOrganizacion, idOrganizacion)))
    .get();
  if (!camp) return null;

  const pasosCorreo = db
    .select({ idPaso: pasoCadencia.idPaso, esManual: pasoCadencia.esManual })
    .from(pasoCadencia)
    .where(and(eq(pasoCadencia.idCadencia, camp.idCadencia), eq(pasoCadencia.canal, 'correo')))
    .all();

  const idUsuario = idUsuarioDeOwner(camp.owner, idOrganizacion);
  const esGmail = idUsuario ? gmailVerificadoDe(idUsuario) : false;

  // Cuenta las filas YA materializadas que estan paradas por el gate de revision humana. Es
  // distinto de "la cadencia tiene pasos manuales": lo primero ya bloquea envios reales.
  const manualesSinAprobar =
    pasosCorreo.length === 0
      ? 0
      : (db
          .select({ n: sql<number>`count(*)` })
          .from(pasoInscripcion)
          .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
          .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
          .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
          .where(
            and(
              eq(inscripcion.idCampana, idCampana),
              eq(pasoInscripcion.canal, 'correo'),
              inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
              eq(pasoCadencia.esManual, 1),
              isNull(pasoInscripcion.aprobadoEn),
            ),
          )
          .get()?.n ?? 0);

  const bloqueos: string[] = [];
  if (pasosCorreo.length > 0) {
    if (camp.proveedorCampanaId === null) {
      bloqueos.push(
        'campana.proveedor_campana_id esta en NULL: pasoInscripcionesPendientes exige que NO lo este para el canal correo, ' +
          'asi que ningun paso de correo de esta campana entra siquiera a la cola del worker',
      );
    }
    if (esGmail && camp.aprobadaEnvioGmail !== 1) {
      bloqueos.push(
        `el owner '${camp.owner}' manda por Gmail y campana.aprobada_envio_gmail esta en 0: agruparPendientesCorreo ` +
          'descarta la fila entera, sin error y sin marcarla fallo, y se queda pendiente para siempre',
      );
    }
    if (!camp.owner) {
      bloqueos.push('la campana no tiene owner: el correo caeria a Apollo por fallback en vez de salir del Gmail de nadie');
    } else if (!idUsuario) {
      bloqueos.push(`el owner '${camp.owner}' no resuelve a ningun usuario: el correo caeria a Apollo por fallback`);
    }
    const manuales = pasosCorreo.filter((p) => p.esManual === 1).length;
    if (manuales > 0) {
      bloqueos.push(
        `${manuales} de los ${pasosCorreo.length} pasos de correo tienen es_manual=1: cada envio de esos pasos exige que ` +
          'un humano lo apruebe uno por uno (programar_envios) antes de salir. Una cadencia que se deja corriendo sola ' +
          'los quiere en es_manual=0',
      );
    }
    if (camp.estado !== 'activa') {
      bloqueos.push(`la campana esta en estado '${camp.estado}': pasoInscripcionesPendientes solo mira campanas 'activa'`);
    }
  }

  return {
    idCampana,
    tieneCorreo: pasosCorreo.length > 0,
    pasosCorreo: pasosCorreo.length,
    saldra: pasosCorreo.length > 0 && bloqueos.length === 0,
    bloqueos,
    proveedorCampanaId: camp.proveedorCampanaId,
    aprobadaEnvioGmail: camp.aprobadaEnvioGmail === 1,
    owner: camp.owner,
    idUsuarioDelOwner: idUsuario,
    proveedorQueMandaria: pasosCorreo.length === 0 ? null : esGmail ? 'gmail' : 'apollo',
    pasosManualesSinAprobar: manualesSinAprobar,
  };
}

// Arma una campana para que su correo pueda salir: el par (proveedor_campana_id sintetico,
// aprobada_envio_gmail=1) que escribe el boton "Lanzar hoy" de la web. Se llama DENTRO de la
// transaccion de quien inscribe, para que "esta empresa entra" y "el correo puede salir" sean
// un solo hecho y no dos que se pueden desincronizar a la mitad.
//
// NO toca es_manual: si la cadencia pide revision humana por paso, esa decision se respeta. Y
// no crea nada en Apollo -- el id es sintetico, es el correlator del pixel de tracking, igual
// que en la web.
export function armarEnvioCorreoEnTx(tx: TxRepo, idCampana: number, ahora: string): void {
  tx.update(campana)
    .set({
      proveedorCampanaId: sql`coalesce(${campana.proveedorCampanaId}, ${'gmail-camp-' + idCampana})`,
      aprobadaEnvioGmail: 1,
      updatedAt: ahora,
    })
    .where(eq(campana.idCampana, idCampana))
    .run();
}

// Un borrador que nunca corrio inscribirCampana no tiene inscripciones -- se puede
// borrar limpio. Nunca toca 'activa'/'pausada'/'archivada': esas ya tienen historia
// real (inscripciones, toques) que no es seguro eliminar desde aca. paso_cadencia y
// version_paso no tienen ON DELETE CASCADE en este schema, asi que el borrado es
// manual y en orden: versiones -> pasos -> campana -> cadencia.
export function eliminarCampanaBorrador(idCampana: number): { ok: true } | { ok: false; error: string } {
  const camp = db.select({ estado: campana.estado, idCadencia: campana.idCadencia }).from(campana).where(eq(campana.idCampana, idCampana)).get();
  if (!camp) return { ok: false, error: 'La campaña no existe' };
  if (camp.estado !== 'borrador') return { ok: false, error: 'Solo se pueden eliminar campañas en borrador' };

  const conInscripciones = db.select({ n: sql<number>`count(*)` }).from(inscripcion).where(eq(inscripcion.idCampana, idCampana)).get();
  if ((conInscripciones?.n ?? 0) > 0) return { ok: false, error: 'Esta campaña ya tiene inscripciones, no se puede eliminar' };

  db.transaction((tx) => {
    const pasos = tx.select({ idPaso: pasoCadencia.idPaso }).from(pasoCadencia).where(eq(pasoCadencia.idCadencia, camp.idCadencia)).all();
    if (pasos.length > 0) {
      tx.delete(versionPaso)
        .where(inArray(versionPaso.idPaso, pasos.map((p) => p.idPaso)))
        .run();
    }
    tx.delete(pasoCadencia).where(eq(pasoCadencia.idCadencia, camp.idCadencia)).run();
    tx.delete(campana).where(eq(campana.idCampana, idCampana)).run();
    tx.delete(cadencia).where(eq(cadencia.idCadencia, camp.idCadencia)).run();
  });
  return { ok: true };
}

// Fase 7 (pausar/reanudar): reversible y PURAMENTE interno -- no toca Apollo. La
// guarda real esta en agendaEnSeco/pasoInscripcionesPendientes/pasosManualesPendientes
// (todas exigen campana.estado='activa' ahora); esta funcion solo mueve el estado.
export function pausarCampana(idCampana: number): { ok: true } | { ok: false; error: string } {
  const camp = db.select({ estado: campana.estado }).from(campana).where(eq(campana.idCampana, idCampana)).get();
  if (!camp) return { ok: false, error: 'La campaña no existe' };
  if (camp.estado !== 'activa') return { ok: false, error: 'Solo se puede pausar una campaña activa' };
  db.update(campana).set({ estado: 'pausada', updatedAt: new Date().toISOString() }).where(eq(campana.idCampana, idCampana)).run();
  return { ok: true };
}

export function reanudarCampana(idCampana: number): { ok: true } | { ok: false; error: string } {
  const camp = db.select({ estado: campana.estado }).from(campana).where(eq(campana.idCampana, idCampana)).get();
  if (!camp) return { ok: false, error: 'La campaña no existe' };
  if (camp.estado !== 'pausada') return { ok: false, error: 'Solo se puede reanudar una campaña pausada' };
  db.update(campana).set({ estado: 'activa', updatedAt: new Date().toISOString() }).where(eq(campana.idCampana, idCampana)).run();
  return { ok: true };
}

// Cancelar SI toca Apollo (archivarCampana), y el repository no conoce adaptadores
// externos (regla de capas de CLAUDE.md: el core/DB no importa Apollo). Por eso esta
// funcion solo marca 'archivada' y devuelve el proveedorCampanaId -- quien orquesta
// (la server action) es quien de verdad archiva la secuencia. Ver cancelarCampanaAction.
//
// Sesion 2026-07-10 (pedido de Sebastian): unificado con el auto-archivo por cadencia
// agotada (campanasParaArchivar/archivarCampanasCompletadas, mas abajo) -- las dos vias
// para terminar una campana (cancelar a mano, o que se agote sola) llegan al MISMO
// estado 'archivada'. Antes cancelar dejaba 'finalizada', un estado terminal aparte que
// no aparecia en el tab "Archivadas" de /campanas. El guard de abajo tambien cubre "ya
// esta archivada por el otro camino": no tiene sentido cancelar algo que ya termino.
export function marcarCampanaFinalizada(idCampana: number): { ok: true; proveedorCampanaId: string | null } | { ok: false; error: string } {
  const camp = db.select({ estado: campana.estado, proveedorCampanaId: campana.proveedorCampanaId }).from(campana).where(eq(campana.idCampana, idCampana)).get();
  if (!camp) return { ok: false, error: 'La campaña no existe' };
  if (camp.estado === 'archivada') return { ok: false, error: 'Esta campaña ya está archivada' };
  if (camp.estado === 'borrador') return { ok: false, error: 'Un borrador se elimina, no se cancela' };
  const ahora = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(campana).set({ estado: 'archivada', updatedAt: ahora }).where(eq(campana.idCampana, idCampana)).run();
    // Sesion 2026-07-10 (huerfano real, encontrado 3 veces seguidas en la prueba
    // multicanal): sin esto, las inscripciones que quedaron 'activa' bajo esta
    // campana nunca se cerraban -- una campana finalizada con una inscripcion
    // "activa" colgando debajo, que ademas bloqueaba re-inscribir esa empresa en
    // otra campana hasta que alguien la limpiara a mano.
    //
    // 2026-07-15: cierra los DOS estados vivos, no solo 'activa'. Una 'bloqueada'
    // (sin destinatario, esperando la cola de revision) sobrevivia a la cancelacion:
    // el indice unico parcial solo cubre WHERE estado='activa', asi que no violaba
    // nada y quedaba invisible, pero la cola la seguia ofreciendo y resolverla la
    // promovia a 'activa' debajo de una campana ya archivada.
    tx.update(inscripcion)
      .set({ estado: 'finalizada', motivoFin: 'campana cancelada', fechaFin: ahora, updatedAt: ahora })
      .where(and(eq(inscripcion.idCampana, idCampana), inArray(inscripcion.estado, ['activa', 'bloqueada'])))
      .run();
  });
  return { ok: true, proveedorCampanaId: camp.proveedorCampanaId };
}

// Auto-archivo (worker, tareaArchivarCampanas): distinto de marcarCampanaFinalizada
// (esa es "Cancelar", a mano, antes de tiempo). Aca la campana llego al final SOLA --
// ya no queda nada por materializar ni empujar. Las 'bloqueada' (sin canal, cola de
// revision) se ignoran a proposito: una cuenta atascada no debe dejar la campana
// activa para siempre (decision de Sebastian, sesion 2026-07-10).
export function campanasParaArchivar(): { idCampana: number; proveedorCampanaId: string | null }[] {
  const activas = db
    .select({ idCampana: campana.idCampana, proveedorCampanaId: campana.proveedorCampanaId, idCadencia: campana.idCadencia })
    .from(campana)
    .where(eq(campana.estado, 'activa'))
    .all();
  return activas.filter((c) => campanaEstaAgotada(c.idCampana, c.idCadencia));
}

function campanaEstaAgotada(idCampana: number, idCadencia: number): boolean {
  const totalInscripciones = db.select({ id: inscripcion.idInscripcion }).from(inscripcion).where(eq(inscripcion.idCampana, idCampana)).all().length;
  if (totalInscripciones === 0) return false; // recien lanzada, sin nadie inscrito: no archivar todavia

  const activas = db
    .select({ idInscripcion: inscripcion.idInscripcion })
    .from(inscripcion)
    .where(and(eq(inscripcion.idCampana, idCampana), eq(inscripcion.estado, 'activa')))
    .all();

  return activas.every((insc) => inscripcionEstaAgotada(insc.idInscripcion, idCadencia));
}

// Una inscripcion 'activa' esta "agotada" cuando ya no le queda ningun paso de la
// cadencia por materializar ni por empujar -- cada paso_cadencia de idCadencia ya
// tiene un paso_inscripcion terminal ('enviada' u 'omitida') para el destinatario
// activo de esta inscripcion. Conteo por filas (mismo estilo que el resto del
// archivo, dos queries chicas): a la escala de hoy (decenas de campanas) es simple y
// suficiente; si algun dia pesa, se cambia por un COUNT(*) en SQL crudo sin tocar la
// firma de la funcion.
function inscripcionEstaAgotada(idInscripcion: number, idCadencia: number): boolean {
  const dest = db
    .select({ id: destinatario.idDestinatario })
    .from(destinatario)
    .where(and(eq(destinatario.idInscripcion, idInscripcion), eq(destinatario.estado, 'activo')))
    .get();
  if (!dest) return false; // sin destinatario activo: caso raro, no el camino feliz

  const totalPasos = db.select({ id: pasoCadencia.idPaso }).from(pasoCadencia).where(eq(pasoCadencia.idCadencia, idCadencia)).all().length;
  const terminados = db
    .select({ id: pasoInscripcion.idPasoInscripcion })
    .from(pasoInscripcion)
    .where(and(eq(pasoInscripcion.idDestinatario, dest.id), inArray(pasoInscripcion.estado, ['enviada', 'omitida'])))
    .all().length;

  return totalPasos > 0 && terminados >= totalPasos;
}

export function archivarCampanasCompletadas(): { idCampana: number; proveedorCampanaId: string | null }[] {
  const listas = campanasParaArchivar();
  if (listas.length === 0) return [];
  const ahora = new Date().toISOString();
  db.transaction((tx) => {
    for (const c of listas) {
      tx.update(campana).set({ estado: 'archivada', updatedAt: ahora }).where(eq(campana.idCampana, c.idCampana)).run();
    }
  });
  return listas;
}

export type ResultadoInscripcion = {
  inscritas: number; // con destinatario -> activa
  bloqueadas: number; // sin email -> cola de revision
  reemplazos: number; // empresas que salieron de otra campana activa
  saltadas: number; // ya estaban en esta campana (idempotencia)
};

// V4.5: inscribe todas las empresas del segmento de la campana. Por cada una:
//   - si ya esta (activa o bloqueada) en ESTA campana, se salta (re-correr es idempotente)
//   - si tiene una activa en OTRA campana, la cierra con motivo_fin (una activa por empresa)
//   - elige destinatario default (B1.b); sin email la inscripcion nace bloqueada
// Todo en UNA transaccion: cerrar la anterior y abrir la nueva ocurren juntos, asi el
// indice unico parcial nunca ve dos activas de la misma empresa a la vez.
export function inscribirCampana(idCampana: number, idOrganizacion: number): ResultadoInscripcion {
  const camp = db
    .select({
      idSegmento: campana.idSegmento,
      idCadencia: campana.idCadencia,
      reglaFaltante: campana.reglaFaltante,
      intakeDiario: campana.intakeDiario,
      ritmoIngreso: campana.ritmoIngreso,
      fechaInicio: campana.fechaInicio,
    })
    .from(campana)
    .where(eq(campana.idCampana, idCampana))
    .get();
  if (!camp) throw new Error(`campana ${idCampana} no existe`);
  // Parte 3 campanas: el set curado en la revision (Parte 2) es la fuente real de
  // a quien inscribir, no el segmento crudo. empresasParaRevision ya trae el flag
  // excluida por empresa; ese "esta no va" nunca llega a inscripcion.
  const paraRevision = empresasParaRevision(camp.idSegmento, idOrganizacion);
  if (!paraRevision) throw new Error(`segmento ${camp.idSegmento} de la campana no existe`);
  const empresas = paraRevision.filter((e) => !e.excluida);

  const pasosCrudos = db
    .select({ orden: pasoCadencia.orden, canal: pasoCadencia.canal })
    .from(pasoCadencia)
    .where(eq(pasoCadencia.idCadencia, camp.idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();
  const pasos: PasoRequerido[] = pasosCrudos.map((p) => ({ orden: p.orden, canal: p.canal as Canal }));

  const res: ResultadoInscripcion = { inscritas: 0, bloqueadas: 0, reemplazos: 0, saltadas: 0 };
  const ahora = new Date().toISOString();

  // Task 8.3 (enrollment escalonado): el goteo de ingreso reparte SOLO las empresas
  // que de verdad van a quedar 'lista'/'con_ajuste' (elegibles). Las 'bloqueada' (sin
  // destinatario o sin ningun canal viable tras la regla) quedan fuera del reparto:
  // no consumen un cupo de ningun dia, para no robarle el turno a la siguiente
  // elegible del orden del segmento. El orden de entrada es el del segmento tal cual
  // llega (empresasParaRevision no reordena por readiness), sin importar cuantas
  // bloqueadas haya en el medio.
  //
  // Se contactos-a-todas primero (una sola pasada, sin escribir) para poder contar
  // cuantas empresas SI consumen turno antes de llamar calcularGoteo -- el total que
  // necesita el goteo es el de elegibles, no el del segmento crudo.
  const contactosPorEmpresaGoteo = new Map<
    string,
    { idContacto: number; esKeyDecisionMaker: boolean; esPrincipal: boolean; email: string | null; telefono: string | null }[]
  >();
  if (empresas.length > 0) {
    const filasContacto = db
      .select({
        idEmpresa: contacto.idEmpresa,
        idContacto: contacto.idContacto,
        esKeyDecisionMaker: contacto.esKeyDecisionMaker,
        esPrincipal: contacto.esPrincipal,
        email: contacto.email,
        telefono: contacto.telefono,
      })
      .from(contacto)
      .where(inArray(contacto.idEmpresa, empresas.map((e) => e.id)))
      .orderBy(contacto.idContacto)
      .all();
    for (const f of filasContacto) {
      const lista = contactosPorEmpresaGoteo.get(f.idEmpresa) ?? [];
      lista.push({
        idContacto: f.idContacto,
        esKeyDecisionMaker: f.esKeyDecisionMaker === 1,
        esPrincipal: f.esPrincipal === 1,
        email: f.email,
        telefono: f.telefono,
      });
      contactosPorEmpresaGoteo.set(f.idEmpresa, lista);
    }
  }
  const previewGoteo = previsualizarInscripcion({
    empresas: empresas.map((e) => ({ idEmpresa: e.id, contactos: contactosPorEmpresaGoteo.get(e.id) ?? [] })),
    pasos,
    regla: camp.reglaFaltante as ReglaFaltante,
  });
  const estadoPorEmpresaGoteo = new Map(previewGoteo.map((p) => [p.idEmpresa, p.estado]));
  const idsElegiblesEnOrden = empresas.map((e) => e.id).filter((id) => estadoPorEmpresaGoteo.get(id) !== 'bloqueada');

  const intakeDiario = camp.intakeDiario ?? idsElegiblesEnOrden.length;
  const goteo =
    idsElegiblesEnOrden.length > 0 && intakeDiario > 0
      // fechaBogotaISO y no `ahora.slice(0, 10)` (2026-07-28): una campaña sin fecha_inicio
      // arranca el goteo "hoy", y ese hoy tiene que ser el día de calendario en Bogotá. Con el
      // recorte del ISO, lanzar después de las 7pm arrancaba el goteo un día tarde y corría toda
      // la cola detrás. 18 de las campañas en producción tienen fecha_inicio en NULL.
      ? calcularGoteo(idsElegiblesEnOrden.length, intakeDiario, camp.ritmoIngreso as RitmoIngreso, camp.fechaInicio ?? fechaBogotaISO())
      : { porDia: [], diasHabiles: 0 };

  // Aplana el goteo a "fecha por posicion": la K-esima elegible (0-based, en el orden
  // del segmento) cae en el dia donde se acumula su turno. Si el goteo no produjo
  // dias (total 0), el mapa queda vacio y todas caen al fallback (fecha de hoy).
  const fechaPorPosicion: string[] = [];
  for (const dia of goteo.porDia) {
    for (let i = 0; i < dia.cuantos; i += 1) fechaPorPosicion.push(dia.fecha);
  }
  const fechaProgramadaPorEmpresa = new Map<string, string>();
  idsElegiblesEnOrden.forEach((id, i) => {
    // Mismo motivo que arriba: el fallback "cae hoy" es el hoy de Bogotá, no el de UTC.
    fechaProgramadaPorEmpresa.set(id, fechaPorPosicion[i] ?? fechaBogotaISO());
  });

  db.transaction((tx) => {
    for (const emp of empresas) {
      const yaEnEsta = tx
        .select({ id: inscripcion.idInscripcion })
        .from(inscripcion)
        .where(and(eq(inscripcion.idEmpresa, emp.id), eq(inscripcion.idCampana, idCampana), inArray(inscripcion.estado, ['activa', 'bloqueada'])))
        .get();
      if (yaEnEsta) {
        res.saltadas += 1;
        continue;
      }

      const activaOtra = tx
        .select({ id: inscripcion.idInscripcion })
        .from(inscripcion)
        .where(and(eq(inscripcion.idEmpresa, emp.id), eq(inscripcion.estado, 'activa')))
        .get();
      if (activaOtra) {
        tx.update(inscripcion)
          .set({ estado: 'finalizada', motivoFin: 'cambio de campana', fechaFin: ahora, updatedAt: ahora })
          .where(eq(inscripcion.idInscripcion, activaOtra.id))
          .run();
        res.reemplazos += 1;
      }

      const contactos = tx
        .select({
          idContacto: contacto.idContacto,
          esKeyDecisionMaker: contacto.esKeyDecisionMaker,
          esPrincipal: contacto.esPrincipal,
          email: contacto.email,
          telefono: contacto.telefono,
        })
        .from(contacto)
        .where(eq(contacto.idEmpresa, emp.id))
        .orderBy(contacto.idContacto)
        .all();

      // Siempre revalidar (checkpoint 6.1): esta corrida vuelve a llamar la misma
      // funcion pura que arma el preview de la V4 justo antes de escribir, contra los
      // datos que ACABA de leer de la DB en esta transaccion. No recibe el resultado
      // de ningun preview externo como snapshot de verdad — ese pudo quedar
      // desactualizado desde que se mostro en pantalla.
      const [preview] = previsualizarInscripcion({
        empresas: [
          {
            idEmpresa: emp.id,
            contactos: contactos.map((c) => ({
              idContacto: c.idContacto,
              esKeyDecisionMaker: c.esKeyDecisionMaker === 1,
              esPrincipal: c.esPrincipal === 1,
              email: c.email,
              telefono: c.telefono,
            })),
          },
        ],
        pasos,
        regla: camp.reglaFaltante as ReglaFaltante,
      });

      const idContactoDest = preview.idContactoDestinatario;
      const estado = idContactoDest != null ? 'activa' : 'bloqueada';
      // Task 8.3: la fecha de inscripcion de una empresa elegible es la que le tocara
      // segun el goteo calculado arriba (mismo orden de segmento, bloqueadas ya fuera
      // del reparto). Si la revalidacion en esta transaccion la vuelve bloqueada
      // (dato cambio entre el calculo de goteo y este punto), no tiene fecha de
      // goteo asignada -- cae al fallback de "ahora" igual que antes, sin goteo.
      const fechaGoteo = idContactoDest != null ? fechaProgramadaPorEmpresa.get(emp.id) : undefined;
      // fechaInscripcion se guarda siempre ISO completo (mismo formato que el resto del
      // repository); el goteo solo calcula la fecha "YYYY-MM-DD" del dia que le toca, asi
      // que se ancla a medianoche de ese dia.
      const fechaInscripcionFinal = fechaGoteo ? `${fechaGoteo}T00:00:00.000Z` : ahora;
      const ins = tx
        .insert(inscripcion)
        .values({ idCampana, idEmpresa: emp.id, estado, pasoActual: 0, fechaInscripcion: fechaInscripcionFinal, createdAt: ahora, updatedAt: ahora })
        .run();

      if (idContactoDest != null) {
        tx.insert(destinatario)
          .values({ idInscripcion: Number(ins.lastInsertRowid), idContacto: idContactoDest, estado: 'activo', createdAt: ahora })
          .run();
        res.inscritas += 1;
      } else {
        res.bloqueadas += 1;
      }
    }

    // Parte 4 campanas: la campana pasaba a 'borrador' para siempre (nunca se
    // marcaba corriendo). Cualquier corrida de inscribirCampana la deja 'activa'.
    tx.update(campana).set({ estado: 'activa', updatedAt: ahora }).where(eq(campana.idCampana, idCampana)).run();
  });

  return res;
}

export type ResultadoInscripcionEmpresa =
  | { ok: true; idInscripcion: number; estado: 'activa' | 'bloqueada'; reemplazo: boolean }
  | { ok: false; motivo: 'ya_inscrita' };

// Actividad on-hold con cadencia de precio (docs/actividad-on-hold-cadencia-precio.md):
// Sebastian toca una empresa a la vez, no corre un segmento completo. inscribirCampana no
// sirve para eso: itera TODO el segmento y reparte fechas con goteo (intakeDiario) pensado
// para inscribir muchas empresas de un golpe. Esta funcion reusa la MISMA seleccion de
// destinatario (previsualizarInscripcion) que inscribirCampana aplica por empresa, pero para
// una sola fila y sin goteo -- no aplica cuando es una empresa, hoy, ahora.
// Misma regla de "una activa por empresa" que el resto del sistema (ux_inscripcion_activa):
// si la empresa ya tenia otra inscripcion activa, se cierra antes de abrir esta.
export function inscribirEmpresaEnCadencia(idEmpresa: string, idCampana: number): ResultadoInscripcionEmpresa {
  const camp = db
    .select({ idCadencia: campana.idCadencia, reglaFaltante: campana.reglaFaltante })
    .from(campana)
    .where(eq(campana.idCampana, idCampana))
    .get();
  if (!camp) throw new Error(`campana ${idCampana} no existe`);

  const pasosCrudos = db
    .select({ orden: pasoCadencia.orden, canal: pasoCadencia.canal })
    .from(pasoCadencia)
    .where(eq(pasoCadencia.idCadencia, camp.idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();
  const pasos: PasoRequerido[] = pasosCrudos.map((p) => ({ orden: p.orden, canal: p.canal as Canal }));

  const ahora = new Date().toISOString();
  let resultado: ResultadoInscripcionEmpresa = { ok: false, motivo: 'ya_inscrita' };

  db.transaction((tx) => {
    const yaEnEsta = tx
      .select({ id: inscripcion.idInscripcion })
      .from(inscripcion)
      .where(and(eq(inscripcion.idEmpresa, idEmpresa), eq(inscripcion.idCampana, idCampana), inArray(inscripcion.estado, ['activa', 'bloqueada'])))
      .get();
    if (yaEnEsta) return;

    let reemplazo = false;
    const activaOtra = tx
      .select({ id: inscripcion.idInscripcion })
      .from(inscripcion)
      .where(and(eq(inscripcion.idEmpresa, idEmpresa), eq(inscripcion.estado, 'activa')))
      .get();
    if (activaOtra) {
      tx.update(inscripcion)
        .set({ estado: 'finalizada', motivoFin: 'cambio de campana', fechaFin: ahora, updatedAt: ahora })
        .where(eq(inscripcion.idInscripcion, activaOtra.id))
        .run();
      reemplazo = true;
    }

    const contactos = tx
      .select({
        idContacto: contacto.idContacto,
        esKeyDecisionMaker: contacto.esKeyDecisionMaker,
        esPrincipal: contacto.esPrincipal,
        email: contacto.email,
        telefono: contacto.telefono,
      })
      .from(contacto)
      .where(eq(contacto.idEmpresa, idEmpresa))
      .orderBy(contacto.idContacto)
      .all();

    const [preview] = previsualizarInscripcion({
      empresas: [
        {
          idEmpresa,
          contactos: contactos.map((c) => ({
            idContacto: c.idContacto,
            esKeyDecisionMaker: c.esKeyDecisionMaker === 1,
            esPrincipal: c.esPrincipal === 1,
            email: c.email,
            telefono: c.telefono,
          })),
        },
      ],
      pasos,
      regla: camp.reglaFaltante as ReglaFaltante,
    });

    const idContactoDest = preview.idContactoDestinatario;
    const estado = idContactoDest != null ? 'activa' : 'bloqueada';
    const ins = tx
      .insert(inscripcion)
      .values({ idCampana, idEmpresa, estado, pasoActual: 0, fechaInscripcion: ahora, createdAt: ahora, updatedAt: ahora })
      .run();

    if (idContactoDest != null) {
      tx.insert(destinatario)
        .values({ idInscripcion: Number(ins.lastInsertRowid), idContacto: idContactoDest, estado: 'activo', createdAt: ahora })
        .run();
    }

    tx.update(campana).set({ estado: 'activa', updatedAt: ahora }).where(eq(campana.idCampana, idCampana)).run();

    resultado = { ok: true, idInscripcion: Number(ins.lastInsertRowid), estado, reemplazo };
  });

  return resultado;
}

// Fase 6 (V4 Destinatarios): cabecera de la campana para la factura del preview
// (nombre, cadencia, segmento, regla activa). Es lo que necesita la UI antes de
// pedir el detalle por empresa -- separado de PreviewInscripcionCampana para no
// recorrer todas las empresas solo para pintar el header.
export type CampanaParaPreview = {
  idCampana: number;
  nombre: string;
  idCadencia: number;
  cadencia: string;
  // idSegmento ademas del nombre: Destinatarios necesita el id para sacar una cuenta del
  // set curado sin mandar a Sebastian de vuelta al paso Segmento (alternarExclusionAction).
  idSegmento: number;
  segmento: string;
  reglaFaltante: ReglaFaltante;
  estado: string;
};

export function campanaParaPreview(idCampana: number): CampanaParaPreview | null {
  const fila = db
    .select({
      idCampana: campana.idCampana,
      nombre: campana.nombre,
      idCadencia: campana.idCadencia,
      cadencia: cadencia.nombre,
      idSegmento: campana.idSegmento,
      segmento: segmento.nombre,
      reglaFaltante: campana.reglaFaltante,
      estado: campana.estado,
    })
    .from(campana)
    .innerJoin(cadencia, eq(cadencia.idCadencia, campana.idCadencia))
    .innerJoin(segmento, eq(segmento.idSegmento, campana.idSegmento))
    .where(eq(campana.idCampana, idCampana))
    .get();
  if (!fila) return null;
  return { ...fila, reglaFaltante: fila.reglaFaltante as ReglaFaltante };
}

// Task 10.1 (panel de control por campana, Fase 10): cabecera minima para el
// Resumen -- estado (activa/pausada/borrador/finalizada) y el idCadencia real para
// enlazar a /cadencias/[id] (la ruta usa el id de LA CADENCIA, no el de la campana).
// Variante de solo lectura de campanaParaPreview: no la reusa porque esa no trae
// estado ni idCadencia y extenderla ahi tocaria un tipo ya consumido por Destinatarios.
export type CampanaResumen = {
  idCampana: number;
  nombre: string;
  estado: string;
  idCadencia: number;
  cadencia: string;
  segmento: string;
  proveedorCampanaId: string | null;
};

export function campanaResumen(idCampana: number): CampanaResumen | null {
  const fila = db
    .select({
      idCampana: campana.idCampana,
      nombre: campana.nombre,
      estado: campana.estado,
      idCadencia: campana.idCadencia,
      cadencia: cadencia.nombre,
      segmento: segmento.nombre,
      proveedorCampanaId: campana.proveedorCampanaId,
    })
    .from(campana)
    .innerJoin(cadencia, eq(cadencia.idCadencia, campana.idCadencia))
    .innerJoin(segmento, eq(segmento.idSegmento, campana.idSegmento))
    .where(eq(campana.idCampana, idCampana))
    .get();
  return fila ?? null;
}

// Fase 6 (V4 Destinatarios): una fila de la tabla de destinatarios, con los datos
// de contacto/empresa ya resueltos (la UI no arma el join). El calculo de estado y
// cadencia ajustada viene tal cual de previsualizarInscripcion (core, puro).
export type FilaPreviewInscripcion = {
  idEmpresa: string;
  nombreEmpresa: string;
  idContacto: number | null;
  nombreContacto: string | null;
  cargo: string | null;
  // email/telefono (2026-07-27, para la previsualizacion en seco de lanzar_campana en el MCP):
  // hasta hoy el preview decia a QUIEN le llega (nombre y cargo) pero no A DONDE. En pantalla
  // no hacia falta; para confirmar un envio sin ver la pantalla, si -- lo que hay que poder
  // leer antes de mandar es la direccion exacta. Son los mismos datos del contacto elegido, ya
  // cargados en esta funcion: no agregan una consulta.
  email: string | null;
  telefono: string | null;
  estado: EstadoPreviewInscripcion;
  pasosAjustados: PasoAjustado[];
  toquesTotales: number;
};

// Fase 6 (V4 Destinatarios): el detalle completo del preview, mismo set de empresas
// que inscribirCampana usaria (segmento menos exclusiones de Parte 2) pero SIN
// escribir nada. inscribirCampana vuelve a llamar previsualizarInscripcion antes de
// persistir (checkpoint 6.1) -- esta funcion es solo para mostrar en pantalla.
export function previsualizarInscripcionCampana(idCampana: number, idOrganizacion: number): FilaPreviewInscripcion[] | null {
  const camp = db
    .select({ idSegmento: campana.idSegmento, idCadencia: campana.idCadencia, reglaFaltante: campana.reglaFaltante })
    .from(campana)
    .where(eq(campana.idCampana, idCampana))
    .get();
  if (!camp) return null;

  const paraRevision = empresasParaRevision(camp.idSegmento, idOrganizacion);
  if (!paraRevision) return null;
  const empresas = paraRevision.filter((e) => !e.excluida);
  if (empresas.length === 0) return [];

  const pasosCrudos = db
    .select({ orden: pasoCadencia.orden, canal: pasoCadencia.canal })
    .from(pasoCadencia)
    .where(eq(pasoCadencia.idCadencia, camp.idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();
  const pasos: PasoRequerido[] = pasosCrudos.map((p) => ({ orden: p.orden, canal: p.canal as Canal }));

  const contactosPorEmpresa = new Map<
    string,
    { idContacto: number; esKeyDecisionMaker: boolean; esPrincipal: boolean; email: string | null; telefono: string | null; nombre: string | null; cargo: string | null }[]
  >();
  const filas = db
    .select({
      idEmpresa: contacto.idEmpresa,
      idContacto: contacto.idContacto,
      esKeyDecisionMaker: contacto.esKeyDecisionMaker,
      esPrincipal: contacto.esPrincipal,
      email: contacto.email,
      telefono: contacto.telefono,
      nombre: contacto.nombre,
      apellido: contacto.apellido,
      cargo: contacto.cargo,
    })
    .from(contacto)
    .where(inArray(contacto.idEmpresa, empresas.map((e) => e.id)))
    .orderBy(contacto.idContacto)
    .all();
  for (const f of filas) {
    const lista = contactosPorEmpresa.get(f.idEmpresa) ?? [];
    lista.push({
      idContacto: f.idContacto,
      esKeyDecisionMaker: f.esKeyDecisionMaker === 1,
      esPrincipal: f.esPrincipal === 1,
      email: f.email,
      telefono: f.telefono,
      nombre: [f.nombre, f.apellido].filter(Boolean).join(' ') || null,
      cargo: f.cargo,
    });
    contactosPorEmpresa.set(f.idEmpresa, lista);
  }

  const preview = previsualizarInscripcion({
    empresas: empresas.map((e) => ({ idEmpresa: e.id, contactos: contactosPorEmpresa.get(e.id) ?? [] })),
    pasos,
    regla: camp.reglaFaltante as ReglaFaltante,
  });

  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
  return preview.map((p) => {
    const contactos = contactosPorEmpresa.get(p.idEmpresa) ?? [];
    const dest = p.idContactoDestinatario != null ? contactos.find((c) => c.idContacto === p.idContactoDestinatario) : undefined;
    return {
      idEmpresa: p.idEmpresa,
      nombreEmpresa: empresaPorId.get(p.idEmpresa)?.nombre ?? p.idEmpresa,
      idContacto: p.idContactoDestinatario,
      nombreContacto: dest?.nombre ?? null,
      cargo: dest?.cargo ?? null,
      email: dest?.email ?? null,
      telefono: dest?.telefono ?? null,
      estado: p.estado,
      pasosAjustados: p.pasosAjustados,
      toquesTotales: p.toquesTotales,
    };
  });
}

// /cadencias/[id] es standalone (tambien la usa el constructor de plantillas fuera
// de una campana). Este lookup solo sirve para decidir si esa cadencia puntual nacio
// de una campana (crearBorradorDesdeCadenciaAction crea una por campana, 1:1) y en
// ese caso que header de navegacion mostrar: CampanaSubNav (tabs) si ya esta
// lanzada, o la secuencia del wizard si sigue en 'borrador' -- ver estado.
export function campanaPorCadencia(idCadencia: number): { idCampana: number; nombreCampana: string; estado: string } | null {
  const fila = db
    .select({ idCampana: campana.idCampana, nombreCampana: campana.nombre, estado: campana.estado })
    .from(campana)
    .where(eq(campana.idCadencia, idCadencia))
    .get();
  return fila ?? null;
}

// Fase 7 (preview cinematico en la creacion): un destinatario REAL del segmento para
// rellenar las [variables] del copy en el preview. No inscribe ni escribe nada -- es
// la misma fuente de empresas que se inscribiria (empresasParaRevision menos excluidas)
// pero toma solo la primera con un contacto usable (nombre presente), prefiriendo
// principal / decision maker, para mostrar "asi le llega de verdad" y no un ejemplo.
export type DestinatarioMuestra = {
  nombre: string;
  cargo: string | null;
  empresa: string;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
};

export function muestraDestinatarioDeSegmento(idSegmento: number, idOrganizacion: number): DestinatarioMuestra | null {
  const empresas = empresasParaRevision(idSegmento, idOrganizacion);
  if (!empresas) return null;
  const activas = empresas.filter((e) => !e.excluida);
  if (activas.length === 0) return null;

  const contactos = db
    .select({
      idEmpresa: contacto.idEmpresa,
      nombre: contacto.nombre,
      apellido: contacto.apellido,
      cargo: contacto.cargo,
      email: contacto.email,
      telefono: contacto.telefono,
      esPrincipal: contacto.esPrincipal,
      esKeyDecisionMaker: contacto.esKeyDecisionMaker,
    })
    .from(contacto)
    .where(inArray(contacto.idEmpresa, activas.map((e) => e.id)))
    .all();

  // Recorre las empresas en el orden del segmento y toma la primera que tenga un
  // contacto con nombre. Dentro de la empresa, prefiere principal, luego decision maker.
  for (const emp of activas) {
    const suyos = contactos
      .filter((c) => c.idEmpresa === emp.id && [c.nombre, c.apellido].some(Boolean))
      .sort((a, b) => b.esPrincipal - a.esPrincipal || b.esKeyDecisionMaker - a.esKeyDecisionMaker);
    if (suyos.length === 0) continue;
    const c = suyos[0];
    return {
      nombre: [c.nombre, c.apellido].filter(Boolean).join(' '),
      cargo: c.cargo,
      empresa: emp.nombre,
      ciudad: emp.ciudad,
      telefono: c.telefono,
      email: c.email,
    };
  }
  return null;
}

// Parte 4 campanas: hub de /campanas. Resuelve nombre de cadencia/segmento (no ids
// crudos) y el conteo de inscripciones activas, para que la UI no arme el join.
export function listarCampanas(idOrganizacion: number) {
  return db
    .select({
      id: campana.idCampana,
      nombre: campana.nombre,
      estado: campana.estado,
      modo: campana.modo,
      cadencia: cadencia.nombre,
      segmento: segmento.nombre,
      descripcionSegmento: segmento.descripcionNatural,
      inscritas: sql<number>`(SELECT count(*) FROM inscripcion WHERE inscripcion.id_campana = campana.id_campana AND inscripcion.estado = 'activa')`,
      bloqueadas: sql<number>`(SELECT count(*) FROM inscripcion WHERE inscripcion.id_campana = campana.id_campana AND inscripcion.estado = 'bloqueada')`,
      pasos: sql<number>`(SELECT count(*) FROM paso_cadencia WHERE paso_cadencia.id_cadencia = campana.id_cadencia)`,
      dias: sql<number>`(SELECT max(paso_cadencia.dia_offset) FROM paso_cadencia WHERE paso_cadencia.id_cadencia = campana.id_cadencia)`,
      canalPrincipal: sql<string | null>`(SELECT paso_cadencia.canal FROM paso_cadencia WHERE paso_cadencia.id_cadencia = campana.id_cadencia ORDER BY paso_cadencia.orden ASC LIMIT 1)`,
      // Cuantos toques YA se resolvieron (enviados de verdad, u omitidos por regla de
      // canal faltante -- ver materializarPasosDebidos) contra el total de toques que
      // le tocan a la campana completa (inscritas * pasos de la cadencia). Antes el
      // home mostraba inscritas/(inscritas+bloqueadas) como si fuera "progreso" -- eso
      // es la tasa de ENROLLMENT (cuantos leads sí consiguieron destinatario), no
      // cuanto trabajo real (llamadas, correos) ya se hizo; con 0 bloqueadas eso
      // siempre da 100% aunque nadie haya tocado un solo lead todavia.
      toquesHechos: sql<number>`(
        SELECT count(*) FROM paso_inscripcion
        JOIN destinatario ON destinatario.id_destinatario = paso_inscripcion.id_destinatario
        JOIN inscripcion AS insc_toque ON insc_toque.id_inscripcion = destinatario.id_inscripcion
        WHERE insc_toque.id_campana = campana.id_campana
          AND paso_inscripcion.estado IN ('enviada', 'omitida')
      )`,
    })
    .from(campana)
    .innerJoin(cadencia, eq(cadencia.idCadencia, campana.idCadencia))
    .innerJoin(segmento, eq(segmento.idSegmento, campana.idSegmento))
    .where(eq(campana.idOrganizacion, idOrganizacion))
    .orderBy(desc(campana.idCampana))
    .all();
}

// Task 1.1: metricas del header del hub. toquesSemana cuenta eventos 'enviado' de
// los ultimos 7 dias; tasaRespuesta es una cohorte por toque (no un ratio de filas
// sueltas): de esos toques 'enviado' en la ventana, la fraccion cuyo id_paso_inscripcion
// tiene tambien un evento 'respondio' en cualquier fecha (join enviado->respondio).
//
// Task 10.1 (panel de control por campana): filtro opcional `idCampana`, aditivo —
// sin argumento se comporta exactamente igual que antes (todas las campanas, uso del
// hub). Con idCampana, evento_tracking se une hasta inscripcion.id_campana (mismo
// join que ya usa pushCandidatos) y activa/bloqueada tambien se restringen a esa campana.
export function metricasHub(idCampana?: number) {
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);
  const desdeIso = desde.toISOString();

  const enviadosQuery = db
    .select({ idPasoInscripcion: eventoTracking.idPasoInscripcion })
    .from(eventoTracking)
    .innerJoin(pasoInscripcion, eq(pasoInscripcion.idPasoInscripcion, eventoTracking.idPasoInscripcion))
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion));

  const enviados = (
    idCampana != null
      ? enviadosQuery.where(
          and(
            eq(eventoTracking.tipo, 'enviado'),
            sql`${eventoTracking.fechaEvento} >= ${desdeIso}`,
            eq(inscripcion.idCampana, idCampana),
          ),
        )
      : enviadosQuery.where(and(eq(eventoTracking.tipo, 'enviado'), sql`${eventoTracking.fechaEvento} >= ${desdeIso}`))
  ).all();

  const toquesSemana = enviados.length;

  let respondidos = 0;
  if (toquesSemana > 0) {
    const ids = enviados.map((e) => e.idPasoInscripcion);
    const conRespuesta = db
      .select({ idPasoInscripcion: eventoTracking.idPasoInscripcion })
      .from(eventoTracking)
      .where(and(eq(eventoTracking.tipo, 'respondio'), inArray(eventoTracking.idPasoInscripcion, ids)))
      .all();
    respondidos = new Set(conRespuesta.map((r) => r.idPasoInscripcion)).size;
  }
  const tasaRespuesta = toquesSemana > 0 ? respondidos / toquesSemana : 0;

  const empresasEnSecuencia = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .where(
      idCampana != null
        ? and(eq(inscripcion.estado, 'activa'), eq(inscripcion.idCampana, idCampana))
        : eq(inscripcion.estado, 'activa'),
    )
    .get()!.n;

  const bloqueadasEsperandoRegla = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .where(
      idCampana != null
        ? and(eq(inscripcion.estado, 'bloqueada'), eq(inscripcion.idCampana, idCampana))
        : eq(inscripcion.estado, 'bloqueada'),
    )
    .get()!.n;

  return { toquesSemana, tasaRespuesta, empresasEnSecuencia, bloqueadasEsperandoRegla };
}

// Fase 8 (Lanzar), Task 8.1: agregado INFORMATIVO de la carga total del dia, sumando
// topeToquesDia (si esta fijado) o intakeDiario (si no) de toda campana activa. No
// impone ningun limite: es el numero que la UI de Lanzar (Task 8.4) le muestra a
// Sebastian para que el mismo decida bajarle el tope a la campana que esta armando.
// Por eso vive como query de solo lectura, sin tocar inscribirCampana ni el enrollment.
export function toquesGlobalesHoy(): { totalHoy: number; campanasActivas: number } {
  const filas = db
    .select({ topeToquesDia: campana.topeToquesDia, intakeDiario: campana.intakeDiario })
    .from(campana)
    .where(eq(campana.estado, 'activa'))
    .all();

  const totalHoy = filas.reduce((acc, f) => acc + (f.topeToquesDia ?? f.intakeDiario ?? 0), 0);
  return { totalHoy, campanasActivas: filas.length };
}

// Fase 8 (Lanzar), Task 8.4: cabecera + config de goteo para la pantalla /campanas/[id]/lanzar.
// El conteo de elegibles NO reimplementa la clasificacion lista/con_ajuste/bloqueada: reusa
// previsualizarInscripcionCampana (Fase 6, ya probado) y cuenta cuantas filas tienen destinatario
// (idContacto != null), que es exactamente el criterio que inscribirCampana usa para decidir
// quien consume un cupo de calcularGoteo (Task 8.3). Sin este reuso, la barra "asi se distribuye"
// de la UI podria mostrar un total distinto al que el enrollment real va a inscribir.
export type CampanaParaLanzar = {
  idCampana: number;
  nombre: string;
  idCadencia: number;
  estado: string;
  intakeDiario: number | null;
  ritmoIngreso: RitmoIngresoInput;
  topeToquesDia: number | null;
  fechaInicio: string | null;
  totalElegibles: number;
  totalBloqueadas: number;
};

export function campanaParaLanzar(idCampana: number, idOrganizacion: number): CampanaParaLanzar | null {
  const camp = db
    .select({
      idCampana: campana.idCampana,
      nombre: campana.nombre,
      idCadencia: campana.idCadencia,
      estado: campana.estado,
      intakeDiario: campana.intakeDiario,
      ritmoIngreso: campana.ritmoIngreso,
      topeToquesDia: campana.topeToquesDia,
      fechaInicio: campana.fechaInicio,
    })
    .from(campana)
    .where(eq(campana.idCampana, idCampana))
    .get();
  if (!camp) return null;

  const filas = previsualizarInscripcionCampana(idCampana, idOrganizacion) ?? [];
  const totalElegibles = filas.filter((f) => f.idContacto != null).length;
  const totalBloqueadas = filas.filter((f) => f.idContacto == null).length;

  return {
    idCampana: camp.idCampana,
    nombre: camp.nombre,
    idCadencia: camp.idCadencia,
    estado: camp.estado,
    intakeDiario: camp.intakeDiario,
    ritmoIngreso: camp.ritmoIngreso as RitmoIngresoInput,
    topeToquesDia: camp.topeToquesDia,
    fechaInicio: camp.fechaInicio,
    totalElegibles,
    totalBloqueadas,
  };
}

// Fase 8 (Lanzar), Task 8.4: UPDATE parcial de la config de goteo, mismo patron que
// actualizarReglaFaltante (Fase 5) -- solo los campos que la pantalla de Lanzar edita, sin
// tocar nombre/cadencia/segmento. fechaInicio: string vacio o null limpia el campo (= "hoy").
export type ConfigLanzamientoInput = {
  intakeDiario?: number | null;
  ritmoIngreso?: RitmoIngresoInput;
  topeToquesDia?: number | null;
  fechaInicio?: string | null;
};

export function actualizarConfigLanzamiento(idCampana: number, cambios: ConfigLanzamientoInput): void {
  if (cambios.ritmoIngreso != null && !RITMOS_INGRESO.includes(cambios.ritmoIngreso)) {
    throw new Error(`ritmoIngreso invalido: ${cambios.ritmoIngreso}`);
  }
  if (cambios.intakeDiario != null && (!Number.isInteger(cambios.intakeDiario) || cambios.intakeDiario <= 0)) {
    throw new Error('intakeDiario debe ser un entero positivo');
  }
  if (cambios.topeToquesDia != null && (!Number.isInteger(cambios.topeToquesDia) || cambios.topeToquesDia <= 0)) {
    throw new Error('topeToquesDia debe ser un entero positivo');
  }

  const sets: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if ('intakeDiario' in cambios) sets.intakeDiario = cambios.intakeDiario ?? null;
  if ('ritmoIngreso' in cambios && cambios.ritmoIngreso != null) sets.ritmoIngreso = cambios.ritmoIngreso;
  if ('topeToquesDia' in cambios) sets.topeToquesDia = cambios.topeToquesDia ?? null;
  if ('fechaInicio' in cambios) sets.fechaInicio = cambios.fechaInicio || null;

  db.update(campana).set(sets).where(eq(campana.idCampana, idCampana)).run();
}

// La foto COMPLETA de una campana despues de lanzarla (2026-07-27, para lanzar_campana del
// MCP). Existe porque una accion de escritura tiene que devolver lo que quedo escrito
// releyendolo, y hasta hoy no habia una sola funcion que trajera las tres capas juntas: la
// fila de campana con proveedor_campana_id y aprobada_envio_gmail, las inscripciones con su
// destinatario real, y cada paso_inscripcion con su estado, su proveedor y su id de mensaje.
//
// actividadDeCampana() responde una pregunta parecida pero NO sirve para esto: no trae
// proveedor_mensaje_id (el acuse del proveedor, que es la prueba de que el mensaje salio),
// no trae aprobado_en (el gate de revision humana de whatsapp) ni intentos, y descarta las
// inscripciones bloqueadas porque hace innerJoin contra contacto/destinatario. Aca las
// bloqueadas SI aparecen: una inscripcion sin destinatario es la mitad de la respuesta a
// "a quien le llego".
export type DestinatarioLanzado = {
  idDestinatario: number;
  idContacto: number;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  estado: string;
};

export type InscripcionLanzada = {
  idInscripcion: number;
  idEmpresa: string;
  empresa: string;
  estado: string;
  fechaInscripcion: string | null;
  destinatarios: DestinatarioLanzado[];
};

export type PasoLanzado = {
  idPasoInscripcion: number;
  idInscripcion: number;
  idEmpresa: string;
  empresa: string;
  destinatario: string | null;
  email: string | null;
  telefono: string | null;
  orden: number;
  canal: string;
  esManual: boolean;
  estado: string;
  proveedor: string | null;
  proveedorMensajeId: string | null;
  fechaProgramada: string | null;
  fechaEnviada: string | null;
  aprobadoEn: string | null;
  aprobadoPor: string | null;
  intentos: number;
};

export type EstadoLanzamientoCampana = {
  campana: {
    idCampana: number;
    nombre: string;
    estado: string;
    owner: string | null;
    idCadencia: number;
    idSegmento: number;
    proveedorCampanaId: string | null;
    aprobadaEnvioGmail: boolean;
    intakeDiario: number | null;
    ritmoIngreso: string;
    topeToquesDia: number | null;
    fechaInicio: string | null;
    updatedAt: string | null;
  };
  inscripciones: InscripcionLanzada[];
  pasos: PasoLanzado[];
};

export function estadoLanzamientoCampana(idCampana: number, idOrganizacion: number): EstadoLanzamientoCampana | null {
  const camp = db
    .select({
      idCampana: campana.idCampana,
      nombre: campana.nombre,
      estado: campana.estado,
      owner: campana.owner,
      idCadencia: campana.idCadencia,
      idSegmento: campana.idSegmento,
      proveedorCampanaId: campana.proveedorCampanaId,
      aprobadaEnvioGmail: campana.aprobadaEnvioGmail,
      intakeDiario: campana.intakeDiario,
      ritmoIngreso: campana.ritmoIngreso,
      topeToquesDia: campana.topeToquesDia,
      fechaInicio: campana.fechaInicio,
      updatedAt: campana.updatedAt,
    })
    .from(campana)
    .where(and(eq(campana.idCampana, idCampana), eq(campana.idOrganizacion, idOrganizacion)))
    .get();
  if (!camp) return null;

  // leftJoin y no innerJoin: una inscripcion 'bloqueada' nace sin destinatario (nadie con
  // email/telefono utilizable) y es justo la que hay que ver despues de lanzar.
  const filasInscripcion = db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      estado: inscripcion.estado,
      fechaInscripcion: inscripcion.fechaInscripcion,
      idDestinatario: destinatario.idDestinatario,
      idContacto: destinatario.idContacto,
      estadoDestinatario: destinatario.estado,
      nombreContacto: contacto.nombre,
      email: contacto.email,
      telefono: contacto.telefono,
    })
    .from(inscripcion)
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .leftJoin(destinatario, eq(destinatario.idInscripcion, inscripcion.idInscripcion))
    .leftJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .where(eq(inscripcion.idCampana, idCampana))
    .orderBy(inscripcion.idInscripcion, destinatario.idDestinatario)
    .all();

  const porInscripcion = new Map<number, InscripcionLanzada>();
  for (const f of filasInscripcion) {
    let ins = porInscripcion.get(f.idInscripcion);
    if (!ins) {
      ins = {
        idInscripcion: f.idInscripcion,
        idEmpresa: f.idEmpresa,
        empresa: f.empresa,
        estado: f.estado,
        fechaInscripcion: f.fechaInscripcion,
        destinatarios: [],
      };
      porInscripcion.set(f.idInscripcion, ins);
    }
    if (f.idDestinatario != null && f.idContacto != null) {
      ins.destinatarios.push({
        idDestinatario: f.idDestinatario,
        idContacto: f.idContacto,
        nombre: f.nombreContacto,
        email: f.email,
        telefono: f.telefono,
        estado: f.estadoDestinatario ?? 'activo',
      });
    }
  }

  const pasos = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idInscripcion: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      destinatario: contacto.nombre,
      email: contacto.email,
      telefono: contacto.telefono,
      orden: pasoCadencia.orden,
      canal: pasoInscripcion.canal,
      esManual: pasoCadencia.esManual,
      estado: pasoInscripcion.estado,
      proveedor: pasoInscripcion.proveedor,
      proveedorMensajeId: pasoInscripcion.proveedorMensajeId,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      fechaEnviada: pasoInscripcion.fechaEnviada,
      aprobadoEn: pasoInscripcion.aprobadoEn,
      aprobadoPor: pasoInscripcion.aprobadoPor,
      intentos: pasoInscripcion.intentos,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(eq(inscripcion.idCampana, idCampana))
    .orderBy(pasoCadencia.orden, pasoInscripcion.idPasoInscripcion)
    .all();

  return {
    campana: { ...camp, aprobadaEnvioGmail: camp.aprobadaEnvioGmail === 1 },
    inscripciones: [...porInscripcion.values()],
    pasos: pasos.map((p) => ({ ...p, esManual: p.esManual === 1 })),
  };
}

// Task 1.6: empresas inscritas (activas + bloqueadas). Reusa el mismo inscripcion.estado
// que inscripcionesBloqueadas() y listarCampanas() -- no inventa un estado "limite
// diario": la unica distincion real que guarda el dominio hoy es activa/bloqueada
// (bloqueada = cola de revision manual, ver comentario de inscripcionesBloqueadas).
//
// idCampana opcional: sin el, es la vista global (ya no se usa en el hub -- ver nota
// en /campanas/page.tsx); con el, es la factura real de UNA campana ya lanzada, la
// que pide /campanas/[id]/destinatarios en vez del preview de "usar y tirar".
export function listarInscritasHub(idCampana?: number) {
  const filtroEstado = inArray(inscripcion.estado, ['activa', 'bloqueada']);
  return db
    .select({
      id: inscripcion.idInscripcion,
      empresa: empresa.nombreOficial,
      campana: campana.nombre,
      estado: inscripcion.estado,
      canalPrincipal: sql<string | null>`(SELECT paso_cadencia.canal FROM paso_cadencia WHERE paso_cadencia.id_cadencia = campana.id_cadencia ORDER BY paso_cadencia.orden ASC LIMIT 1)`,
      ultimoToque: sql<string | null>`(
        SELECT max(paso_inscripcion.fecha_enviada)
        FROM paso_inscripcion
        INNER JOIN destinatario ON destinatario.id_destinatario = paso_inscripcion.id_destinatario
        WHERE destinatario.id_inscripcion = inscripcion.id_inscripcion
      )`,
    })
    .from(inscripcion)
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(idCampana != null ? and(filtroEstado, eq(inscripcion.idCampana, idCampana)) : filtroEstado)
    .orderBy(desc(inscripcion.idInscripcion))
    .all();
}

// V4.5: cola de revision: las inscripciones bloqueadas (sin email) esperando resolucion
// manual, con el nombre de la empresa.
export function inscripcionesBloqueadas() {
  return db
    .select({
      id: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      idCampana: inscripcion.idCampana,
      fecha: inscripcion.fechaInscripcion,
    })
    .from(inscripcion)
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(eq(inscripcion.estado, 'bloqueada'))
    .orderBy(desc(inscripcion.idInscripcion))
    .all();
}

// V4.5: resuelve una inscripcion bloqueada eligiendo un contacto a mano. Cierra cualquier
// activa que la empresa tenga en otra campana (misma regla de una activa) y promueve esta
// a activa con su destinatario. Mismo patron F1.4 (cola de revision -> resolver).
export function resolverInscripcionBloqueada(idInscripcion: number, idContacto: number) {
  const ahora = new Date().toISOString();
  db.transaction((tx) => {
    const insc = tx.select({ idEmpresa: inscripcion.idEmpresa, estado: inscripcion.estado }).from(inscripcion).where(eq(inscripcion.idInscripcion, idInscripcion)).get();
    if (!insc) throw new Error(`inscripcion ${idInscripcion} no existe`);
    if (insc.estado !== 'bloqueada') throw new Error(`la inscripcion ${idInscripcion} no esta bloqueada (esta ${insc.estado})`);

    // El contacto elegido a mano DEBE ser de la empresa de la inscripcion: sin FKs fisicas,
    // un id equivocado adjuntaria un destinatario ajeno (o inexistente) en silencio.
    const contactoValido = tx
      .select({ id: contacto.idContacto })
      .from(contacto)
      .where(and(eq(contacto.idContacto, idContacto), eq(contacto.idEmpresa, insc.idEmpresa)))
      .get();
    if (!contactoValido) throw new Error(`el contacto ${idContacto} no pertenece a la empresa de la inscripcion ${idInscripcion}`);

    const activaOtra = tx.select({ id: inscripcion.idInscripcion }).from(inscripcion).where(and(eq(inscripcion.idEmpresa, insc.idEmpresa), eq(inscripcion.estado, 'activa'))).get();
    if (activaOtra) {
      tx.update(inscripcion).set({ estado: 'finalizada', motivoFin: 'cambio de campana', fechaFin: ahora, updatedAt: ahora }).where(eq(inscripcion.idInscripcion, activaOtra.id)).run();
    }

    tx.update(inscripcion).set({ estado: 'activa', updatedAt: ahora }).where(eq(inscripcion.idInscripcion, idInscripcion)).run();
    tx.insert(destinatario).values({ idInscripcion, idContacto, estado: 'activo', createdAt: ahora }).run();
  });
}

export type ContactoDeBloqueada = { idContacto: number; nombre: string | null; email: string | null; telefono: string | null };
export type InscripcionBloqueadaConContactos = ReturnType<typeof inscripcionesBloqueadas>[number] & { contactos: ContactoDeBloqueada[] };

// Sesion 2026-07-10: la vista de "Por revisar" necesita, por cada bloqueada, los
// contactos YA existentes de la empresa (para editar el que le falta el correo, en vez
// de crear uno nuevo a ciegas) -- 2 queries en vez de un join (inscripcionesBloqueadas
// + contactos por empresa) para no duplicar la fila de la inscripcion por cada contacto.
export function inscripcionesBloqueadasConContactos(): InscripcionBloqueadaConContactos[] {
  const bloqueadas = inscripcionesBloqueadas();
  if (bloqueadas.length === 0) return [];

  const filasContacto = db
    .select({ idEmpresa: contacto.idEmpresa, idContacto: contacto.idContacto, nombre: contacto.nombre, email: contacto.email, telefono: contacto.telefono })
    .from(contacto)
    .where(inArray(contacto.idEmpresa, bloqueadas.map((b) => b.idEmpresa)))
    .orderBy(contacto.idContacto)
    .all();
  const contactosPorEmpresa = new Map<string, ContactoDeBloqueada[]>();
  for (const f of filasContacto) {
    const lista = contactosPorEmpresa.get(f.idEmpresa) ?? [];
    lista.push({ idContacto: f.idContacto, nombre: f.nombre, email: f.email, telefono: f.telefono });
    contactosPorEmpresa.set(f.idEmpresa, lista);
  }

  return bloqueadas.map((b) => ({ ...b, contactos: contactosPorEmpresa.get(b.idEmpresa) ?? [] }));
}

// Sesion 2026-07-10: completa el dato que le faltaba a un contacto YA existente
// (correo y/o telefono) y resuelve la bloqueada con ese mismo contacto. No valida que
// el resultado tenga correo -- resolverInscripcionBloqueada ya confia en la eleccion
// humana explicita (mismo criterio que el resto de la cola de revision manual).
export function completarContactoYResolver(idInscripcion: number, idContacto: number, datos: { email?: string; telefono?: string }): void {
  const sets: { email?: string | null; telefono?: string | null } = {};
  if (datos.email !== undefined) sets.email = datos.email.trim() || null;
  if (datos.telefono !== undefined) sets.telefono = datos.telefono.trim() || null;
  if (Object.keys(sets).length > 0) {
    db.update(contacto).set(sets).where(eq(contacto.idContacto, idContacto)).run();
  }
  resolverInscripcionBloqueada(idInscripcion, idContacto);
}

// Sesion 2026-07-10: caso "la empresa no tiene NINGUN contacto" (bloqueadas.length ===
// 0 en inscripcionesBloqueadasConContactos) -- crea el contacto de cero y resuelve con
// el. fuente 'manual' marca que nacio aca, no de un import/seed.
export function agregarContactoYResolver(
  idInscripcion: number,
  idEmpresa: string,
  datos: { nombre?: string; email?: string; telefono?: string },
): void {
  const ins = db
    .insert(contacto)
    .values({
      idEmpresa,
      nombre: datos.nombre?.trim() || null,
      email: datos.email?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      fuente: 'manual',
    })
    .run();
  resolverInscripcionBloqueada(idInscripcion, Number(ins.lastInsertRowid));
}

// V4.5: historial completo de inscripciones de una empresa (activas, bloqueadas y
// finalizadas), en orden. Prueba el invariante "el cambio de campana deja historial".
export function historialInscripciones(idEmpresa: string) {
  return db
    .select({
      id: inscripcion.idInscripcion,
      idCampana: inscripcion.idCampana,
      estado: inscripcion.estado,
      motivoFin: inscripcion.motivoFin,
      fechaInscripcion: inscripcion.fechaInscripcion,
      fechaFin: inscripcion.fechaFin,
    })
    .from(inscripcion)
    .where(eq(inscripcion.idEmpresa, idEmpresa))
    .orderBy(inscripcion.idInscripcion)
    .all();
}

// V4.5: destinatarios (contactos) de una inscripcion.
export function destinatariosDeInscripcion(idInscripcion: number) {
  return db
    .select({ id: destinatario.idDestinatario, idContacto: destinatario.idContacto, estado: destinatario.estado })
    .from(destinatario)
    .where(eq(destinatario.idInscripcion, idInscripcion))
    .all();
}

// ---------------------------------------------------------------------------
// Pipeline global (rediseño /pipeline, ver planning/plan-pipeline-ui-redesign.md).
// `inscripcion` no tiene columna de organizacion propia -- el limite multi-org de
// TODA esta seccion vive en `campana.idOrganizacion`, por eso cada query se une a
// campana aunque no necesite ninguna otra columna suya.

export type KpisPipeline = {
  enSecuencia: number;
  entrandoHoy: number;
  toquesHoy: number;
  onHold: number;
  cerradasOptOut: number;
};

// Cada numero cuenta algo distinto (no son la misma tabla con 5 filtros):
// enSecuencia/entrandoHoy son inscripciones (nivel EMPRESA); onHold tambien, porque
// pausarInscripcion pausa la empresa entera. cerradasOptOut, en cambio, sigue el
// mapeo del plan a destinatario.estado='salio' (nivel CONTACTO) -- no inscripcion
// 'finalizada', que tambien se usa para "cambio de campana" o "campana cancelada" y
// contaria bookkeeping interno como si fuera un opt-out real.
// owner (2026-07-25): "cada quien ve SUS cuentas" existia como regla desde el 2026-07-15 pero
// solo estaba implementada en pipelineSinCadencia. Estas cinco cifras contaban el pipeline
// entero, asi que a Felipe le salian los numeros de Sebastian. owner undefined = ve todo, que
// es el modo CRO (verTodoPipeline).
//
// Se filtra con un subquery y NO con un innerJoin a empresa a proposito: el join cambiaria la
// cardinalidad de las cinco consultas, y una inscripcion con FK huerfana (las hay sin auditar)
// desapareceria en silencio TAMBIEN en el modo sin owner, que es justo el que no se quiere tocar.
export function kpisPipeline(idOrganizacion: number, hoy: string, owner?: string): KpisPipeline {
  const orgActiva = and(eq(campana.idOrganizacion, idOrganizacion), eq(campana.estado, 'activa'));
  const deLaCartera = owner
    ? sql`${inscripcion.idEmpresa} IN (SELECT id_empresa FROM empresa WHERE owner = ${owner})`
    : undefined;

  const enSecuencia = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(orgActiva, eq(inscripcion.estado, 'activa'), deLaCartera))
    .get()?.n ?? 0;

  const entrandoHoy = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(orgActiva, eq(inscripcion.estado, 'activa'), sql`substr(${inscripcion.fechaInscripcion}, 1, 10) = ${hoy}`, deLaCartera))
    .get()?.n ?? 0;

  const toquesHoy = db
    .select({ n: sql<number>`count(*)` })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(campana.idOrganizacion, idOrganizacion),
        eq(pasoInscripcion.estado, 'pendiente'),
        sql`substr(${pasoInscripcion.fechaProgramada}, 1, 10) = ${hoy}`,
        deLaCartera,
      ),
    )
    .get()?.n ?? 0;

  const onHold = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(campana.idOrganizacion, idOrganizacion), eq(inscripcion.estado, 'pausada'), deLaCartera))
    .get()?.n ?? 0;

  const cerradasOptOut = db
    .select({ n: sql<number>`count(*)` })
    .from(destinatario)
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(campana.idOrganizacion, idOrganizacion), eq(destinatario.estado, 'salio'), deLaCartera))
    .get()?.n ?? 0;

  return { enSecuencia, entrandoHoy, toquesHoy, onHold, cerradasOptOut };
}

export type FilaPipelineGlobal = {
  idInscripcion: number;
  idEmpresa: string;
  empresa: string;
  campana: string;
  contacto: string | null;
  cargo: string | null;
  pasoActual: number | null;
  totalPasos: number;
  diaSecuencia: number | null;
  canal: string | null;
  objetivo: string | null;
  etapa: string; // D1: COALESCE(estado_notion, 'lead') -- ver FUNNEL_ETAPAS en db/funnel.ts
  esHoy: boolean;
};

// D1 (2026-07-10) decia que las etapas del pipeline eran las de FUNNEL_ETAPAS. Sebastian
// corrigio en el checkpoint visual (2026-07-10, mismo dia): mezclar "dia de secuencia" con
// una etiqueta de etapa (ej. mostrar "Reunión" en el grupo del dia 3) es enganoso -- el
// numero de dia NO implica que haya una reunion agendada, solo que le tocan N dias desde
// que arranco. `etapa` se deja en la fila (dato real, por si sirve como badge por fila mas
// adelante) pero el AGRUPADOR del overview pasa a ser `diaSecuencia`, sin FUNNEL_ETAPAS.
export function pipelineGlobal(idOrganizacion: number, hoy: string, idCampana?: number, owner?: string): FilaPipelineGlobal[] {
  const condiciones = [eq(campana.idOrganizacion, idOrganizacion), eq(inscripcion.estado, 'activa'), EMPRESA_VIVA];
  if (idCampana != null) condiciones.push(eq(inscripcion.idCampana, idCampana));
  // owner undefined = ve todo (modo CRO). Ver el comentario de kpisPipeline.
  if (owner) condiciones.push(eq(empresa.owner, owner));

  // `inscripcion.paso_actual` NUNCA se actualiza despues del insert (queda en 0 para
  // siempre, ver inscribirCampana) -- no es el progreso real. El progreso real es el mismo
  // que calcula getContextoToque en TS: cuenta cuantos pasos ya quedaron 'enviada' para
  // los destinatarios de esta inscripcion; el "activo" es el siguiente orden (1-indexed).
  const ordenActivoSql = sql`(
    1 + (
      SELECT count(*) FROM paso_inscripcion
      INNER JOIN destinatario ON destinatario.id_destinatario = paso_inscripcion.id_destinatario
      WHERE destinatario.id_inscripcion = inscripcion.id_inscripcion AND paso_inscripcion.estado = 'enviada'
    )
  )`;

  const filas = db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      campana: campana.nombre,
      pasoActual: sql<number>`${ordenActivoSql}`,
      etapa: sql<string>`COALESCE(${empresa.estadoNotion}, 'lead')`,
      totalPasos: sql<number>`(SELECT count(*) FROM paso_cadencia WHERE paso_cadencia.id_cadencia = campana.id_cadencia)`,
      // "Dia de secuencia" = el dia_offset relativo del playbook (mismo concepto que
      // usa el motor de envio, V4.6) del paso ACTIVO real, no dias de calendario desde
      // la inscripcion -- eso ultimo se corre con pausas/backoff.
      diaSecuencia: sql<number | null>`(
        SELECT paso_cadencia.dia_offset FROM paso_cadencia
        WHERE paso_cadencia.id_cadencia = campana.id_cadencia AND paso_cadencia.orden = ${ordenActivoSql}
      )`,
      canal: sql<string | null>`(
        SELECT paso_cadencia.canal FROM paso_cadencia
        WHERE paso_cadencia.id_cadencia = campana.id_cadencia AND paso_cadencia.orden = ${ordenActivoSql}
      )`,
      objetivo: sql<string | null>`(
        SELECT paso_cadencia.objetivo FROM paso_cadencia
        WHERE paso_cadencia.id_cadencia = campana.id_cadencia AND paso_cadencia.orden = ${ordenActivoSql}
      )`,
      contacto: sql<string | null>`(
        SELECT contacto.nombre || COALESCE(' ' || contacto.apellido, '')
        FROM destinatario INNER JOIN contacto ON contacto.id_contacto = destinatario.id_contacto
        WHERE destinatario.id_inscripcion = inscripcion.id_inscripcion AND destinatario.estado = 'activo'
        LIMIT 1
      )`,
      cargo: sql<string | null>`(
        SELECT contacto.cargo
        FROM destinatario INNER JOIN contacto ON contacto.id_contacto = destinatario.id_contacto
        WHERE destinatario.id_inscripcion = inscripcion.id_inscripcion AND destinatario.estado = 'activo'
        LIMIT 1
      )`,
      esHoyRaw: sql<number>`(
        SELECT count(*) FROM paso_inscripcion INNER JOIN destinatario ON destinatario.id_destinatario = paso_inscripcion.id_destinatario
        WHERE destinatario.id_inscripcion = inscripcion.id_inscripcion
          AND paso_inscripcion.estado = 'pendiente'
          AND substr(paso_inscripcion.fecha_programada, 1, 10) = ${hoy}
      )`,
    })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(and(...condiciones))
    .orderBy(desc(inscripcion.idInscripcion))
    .all();

  return filas.map(({ esHoyRaw, ...f }) => ({ ...f, esHoy: esHoyRaw > 0 }));
}

export type DetalleInscrita = {
  empresa: string;
  contacto: string | null;
  cargo: string | null;
  historial: ReturnType<typeof historialPasosDestinatario>;
  proximoToque: { fecha: string | null; canal: string; paso: string } | null;
};

// Compone historialPasosDestinatario (ya existe) + el paso pendiente de esta
// inscripcion para "proximo toque". NO incluye "ventanas de contacto" (franjas
// horarias del mockup): no existe ese dato en el dominio hoy y CLAUDE.md prohibe
// inventarlo -- queda anotado como hueco, igual que la serie de tasaHold en Reportes.
export function detalleInscrita(idInscripcion: number, idOrganizacion: number): DetalleInscrita | null {
  const base = db
    .select({
      empresa: empresa.nombreOficial,
      idCadencia: campana.idCadencia,
    })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(and(eq(inscripcion.idInscripcion, idInscripcion), eq(campana.idOrganizacion, idOrganizacion)))
    .get();
  if (!base) return null;

  const destinatarioActivo = db
    .select({
      idDestinatario: destinatario.idDestinatario,
      contacto: sql<string | null>`${contacto.nombre} || COALESCE(' ' || ${contacto.apellido}, '')`,
      cargo: contacto.cargo,
    })
    .from(destinatario)
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .where(and(eq(destinatario.idInscripcion, idInscripcion), eq(destinatario.estado, 'activo')))
    .get();

  const historial = destinatarioActivo ? historialPasosDestinatario(destinatarioActivo.idDestinatario) : [];

  const pendiente = destinatarioActivo
    ? db
        .select({
          fechaProgramada: pasoInscripcion.fechaProgramada,
          canal: pasoInscripcion.canal,
          orden: pasoCadencia.orden,
          objetivo: pasoCadencia.objetivo,
        })
        .from(pasoInscripcion)
        .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
        .where(and(eq(pasoInscripcion.idDestinatario, destinatarioActivo.idDestinatario), eq(pasoInscripcion.estado, 'pendiente')))
        .orderBy(pasoCadencia.orden)
        .limit(1)
        .get()
    : undefined;

  const totalPasos = db
    .select({ n: sql<number>`count(*)` })
    .from(pasoCadencia)
    .where(eq(pasoCadencia.idCadencia, base.idCadencia))
    .get()?.n ?? 0;

  return {
    empresa: base.empresa,
    contacto: destinatarioActivo?.contacto ?? null,
    cargo: destinatarioActivo?.cargo ?? null,
    historial,
    proximoToque: pendiente
      ? { fecha: pendiente.fechaProgramada, canal: pendiente.canal, paso: `${pendiente.objetivo ?? 'Siguiente paso'} (Paso ${pendiente.orden}/${totalPasos})` }
      : null,
  };
}

export type PerfilPipelineEmpresa = {
  empresa: string;
  ciudad: string | null;
  categoria: string | null;
  campana: string | null;
  contactos: { nombre: string | null; cargo: string | null; telefono: string | null; email: string | null; esPrincipal: boolean }[];
  toques: { idToque: number; fecha: string | null; canal: string | null; resultado: string | null; quePaso: string | null }[];
  secuencia: PasoSecuencia[];
  proximoToque: { fecha: string | null; canal: string; paso: string } | null;
  // Cara financiera del deal (2026-07-22, plan-panel-metricas-tiempo-real.md): crudos
  // solamente, sin formula -- calcularMrrEstimado/digitalPctConDefault/probabilidadCierrePorEtapa
  // son funciones puras de core/, el caller (server action / componente) las aplica. Mismo
  // principio que pipelineParaEndpoint: el Repository trae datos, no calcula.
  plan: { id: number; nombre: string; saasMensual: number; tarifaTxn: number } | null;
  pctDigital: number | null; // 0..1 crudo capturado; null = sin capturar (el caller aplica el default 40%)
  usuariosEstimados: number | null; // input crudo del discovery, editable en la ficha
  usuariosEfectivos: number | null; // COALESCE(reales, estimados) -- la cifra que ya usa mrrEstimadoTotal
};

// Ficha completa de una empresa desde el Pipeline: "todos los contactos, todo el
// historial de toques, todo" (pedido de Sebastian, 2026-07-10) -- a diferencia de
// getCuenta (que usa /llamada/[id] y limita a 5 toques recientes porque ahi solo
// importa el ultimo para decidir el siguiente paso), aca no hay limite: es una
// vista de lectura, no el cockpit de ejecutar el toque de hoy.
export function perfilPipelineEmpresa(idEmpresa: string, idOrganizacion: number): PerfilPipelineEmpresa | null {
  const { emp, contactos } = getCuenta(idEmpresa, idOrganizacion);
  if (!emp) return null;

  const toques = db
    .select({ idToque: toque.idToque, fecha: toque.fecha, canal: toque.canal, resultado: toque.resultado, quePaso: toque.quePaso })
    .from(toque)
    .where(and(eq(toque.idEmpresa, idEmpresa), eq(toque.idOrganizacion, idOrganizacion)))
    .orderBy(desc(toque.idToque))
    .all();

  const ctx = getContextoToque(idEmpresa, idOrganizacion);

  const inscripcionActiva = db
    .select({ idInscripcion: inscripcion.idInscripcion, campana: campana.nombre })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(inscripcion.idEmpresa, idEmpresa), eq(inscripcion.estado, 'activa'), eq(campana.idOrganizacion, idOrganizacion)))
    .get();

  const detalle = inscripcionActiva ? detalleInscrita(inscripcionActiva.idInscripcion, idOrganizacion) : null;

  const financiero = db
    .select({
      idPlan: empresa.idPlan,
      pctDigital: empresa.pctDigital,
      nombrePlan: plan.nombre,
      saasMensual: plan.saasMensual,
      tarifaTxn: plan.tarifaTxn,
      usuariosEstimados: empresaUsuarios.usuariosEstimados,
      usuariosEfectivos: empresaUsuarios.usuariosEfectivos,
    })
    .from(empresa)
    .leftJoin(plan, eq(plan.id, empresa.idPlan))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();

  return {
    empresa: emp.nombre ?? idEmpresa,
    ciudad: emp.ciudad,
    categoria: emp.categoria,
    campana: inscripcionActiva?.campana ?? null,
    contactos: contactos.map((c) => ({ ...c, esPrincipal: c.esPrincipal === 1 })),
    toques,
    secuencia: ctx.secuencia,
    proximoToque: detalle?.proximoToque ?? null,
    plan:
      financiero?.idPlan != null && financiero.nombrePlan != null
        ? {
            id: financiero.idPlan,
            nombre: financiero.nombrePlan,
            saasMensual: financiero.saasMensual as number,
            tarifaTxn: financiero.tarifaTxn as number,
          }
        : null,
    pctDigital: financiero?.pctDigital ?? null,
    usuariosEstimados: financiero?.usuariosEstimados ?? null,
    usuariosEfectivos: financiero?.usuariosEfectivos ?? null,
  };
}

// --- Captura de datos financieros del deal (Fase 1 punto 4, plan-panel-metricas-tiempo-real.md) --
//
// Estos tres campos (plan, pctDigital, usuarios) se capturan en la ficha del deal
// (DetallePanel), no en Notion (el CSV los trae muertos) -- decision de Sebastian: la
// tool es la fuente de verdad. usuariosEstimados NO tiene metodo propio aca: ya existe
// actualizarCampoCalificacion(idEmpresa, 'usuarios', valor, idOrganizacion) (Toque 1,
// /llamada/[id]), mismo campo (empresa_usuarios.usuarios_estimados) -- reusarlo evita un
// segundo camino de escritura para la misma columna.

export type PlanCatalogo = { id: number; nombre: string; saasMensual: number; tarifaTxn: number };

// Catalogo de planes para el selector de la ficha. Sembrado por scripts/seed_planes.ts,
// de solo lectura desde la UI (nadie crea planes nuevos desde el cockpit todavia).
export function listarPlanes(): PlanCatalogo[] {
  return db
    .select({ id: plan.id, nombre: plan.nombre, saasMensual: plan.saasMensual, tarifaTxn: plan.tarifaTxn })
    .from(plan)
    .orderBy(asc(plan.nombre))
    .all();
}

function verificarOrganizacionEmpresa(idEmpresa: string, idOrganizacion: number): void {
  const emp = db
    .select({ organizacionActivaId: empresa.organizacionActivaId })
    .from(empresa)
    .where(eq(empresa.idEmpresa, idEmpresa))
    .get();
  if (!emp) throw new Error(`Empresa ${idEmpresa} no existe`);
  if (emp.organizacionActivaId !== idOrganizacion) {
    throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
  }
}

// Asigna (o quita, con null) el plan que puede tomar el deal. Mismo guard de
// organizacion que actualizarCampoCalificacion: un lead compartido no se edita desde
// otra organizacion. Valida que el plan exista en el catalogo -- esta DB no enforza FKs
// por default, un id_plan huerfano dejaria el MRR en null silenciosamente sin este check.
export function asignarPlanEmpresa(idEmpresa: string, idOrganizacion: number, idPlan: number | null): void {
  verificarOrganizacionEmpresa(idEmpresa, idOrganizacion);
  if (idPlan !== null) {
    const existe = db.select({ id: plan.id }).from(plan).where(eq(plan.id, idPlan)).get();
    if (!existe) throw new Error(`Plan ${idPlan} no existe en el catalogo`);
  }
  db.update(empresa)
    .set({ idPlan, updatedAt: sql`datetime('now')` })
    .where(eq(empresa.idEmpresa, idEmpresa))
    .run();
}

// %digital del deal, 0..1 (mismo rango que digitalPctConDefault en core/mrr.ts). null
// borra el dato capturado -- el caller vuelve a caer al default 40% via
// digitalPctConDefault, no se inventa aca.
export function actualizarPctDigitalEmpresa(idEmpresa: string, idOrganizacion: number, pctDigital: number | null): void {
  verificarOrganizacionEmpresa(idEmpresa, idOrganizacion);
  if (pctDigital !== null && (pctDigital < 0 || pctDigital > 1)) {
    throw new Error('pctDigital debe estar entre 0 y 1');
  }
  db.update(empresa)
    .set({ pctDigital, updatedAt: sql`datetime('now')` })
    .where(eq(empresa.idEmpresa, idEmpresa))
    .run();
}

// V4.8: agenda EN SECO. Para cada inscripcion activa, calcula que paso toca a la fecha
// `hoy` con el motor (V4.6), SIN materializar ni enviar nada (Fase 5 hace eso). En Fase 4
// no existe historial de ejecuciones (paso_inscripcion se puebla en Fase 5), asi que se
// corre con ejecutados=[]: el motor devuelve el primer paso cuando su fecha llega. Pasar
// `hoy` = manana muestra "los toques de manana en seco".
export function agendaEnSeco(hoy: string, config: ConfigCalendario) {
  const activas = db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      idCadencia: campana.idCadencia,
      anchor: inscripcion.fechaInscripcion,
    })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    // Fase 7 (pausar campana): sin este filtro, una campana pausada seguiria
    // generando pasos nuevos dia a dia -- "pausar" solo cambiaria una etiqueta,
    // nunca detendria nada de verdad.
    .where(and(eq(inscripcion.estado, 'activa'), eq(campana.estado, 'activa')))
    .all();

  const agenda: { idEmpresa: string; empresa: string; orden: number; fecha: string }[] = [];
  for (const a of activas) {
    const pasos = db
      .select({ orden: pasoCadencia.orden, diaOffset: pasoCadencia.diaOffset })
      .from(pasoCadencia)
      .where(eq(pasoCadencia.idCadencia, a.idCadencia))
      .all();

    // fecha_inscripcion se guarda como ISO datetime completo Y EN UTC; el motor trabaja con
    // fecha "YYYY-MM-DD" de Bogota, la misma zona en la que viene `hoy`. Recortar los 10
    // primeros caracteres daba el dia UTC y adelantaba el anchor un dia entre las 19:00 y la
    // medianoche (ver diaBogotaDeGuardado).
    const anchor = diaBogotaDeGuardado(a.anchor ?? hoy);
    const debido = proximoPasoDebido(pasos, { anchor, ejecutados: [] }, hoy, config);
    if (debido) {
      agenda.push({ idEmpresa: a.idEmpresa, empresa: a.empresa, orden: debido.orden, fecha: debido.fechaObjetivo });
    }
  }
  return agenda;
}

function versionActivaDePaso(idPaso: number): number {
  const v = db
    .select({ idVersion: versionPaso.idVersion })
    .from(versionPaso)
    .where(and(eq(versionPaso.idPaso, idPaso), eq(versionPaso.activa, 1)))
    .orderBy(desc(versionPaso.esDefault), asc(versionPaso.idVersion))
    .get();
  if (!v) throw new Error(`paso ${idPaso} no tiene ninguna version activa`);
  return v.idVersion;
}

export type ResultadoMaterializacion = { creados: number; omitidos: number };

// El puente que faltaba entre agendaEnSeco (que solo MIRA que tocaria) y la cola real:
// convierte "el motor de fechas dice que este paso ya toca" en una fila de
// paso_inscripcion de verdad. Sin esto ninguna inscripcion activa llega jamas a /cola --
// inscribirCampana solo crea inscripcion+destinatario (ver planning/experimento-apollo.md,
// Hallazgo real #4: "lo primero que hay que resolver cuando se conecte el envio real").
//
// Barrido completo (una empresa a la vez, en su propia transaccion): para cada
// inscripcion activa con destinatario activo, avanza pasos mientras el paso debido salga
// 'omitido' por la regla de canal faltante (saltar/cola) -- se registran como
// paso_inscripcion estado 'omitida' (sin canal real, sin push) SOLO para que el motor los
// cuente como ejecutados y no se quede atascado ahi para siempre. En cuanto un paso
// debido SI tiene canal, se materializa como 'pendiente' (real, aparece en /cola) y para
// ahi: el siguiente paso de esa empresa lo agarra la proxima pasada del worker, mismo
// patron anti-rafaga que ya usa proximoPasoDebido.
export function materializarPasosDebidos(hoy: string, config: ConfigCalendario): ResultadoMaterializacion {
  const activas = db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      idCadencia: campana.idCadencia,
      reglaFaltante: campana.reglaFaltante,
      anchor: inscripcion.fechaInscripcion,
    })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(inscripcion.estado, 'activa'), eq(campana.estado, 'activa')))
    .all();

  const resultado: ResultadoMaterializacion = { creados: 0, omitidos: 0 };

  for (const insc of activas) {
    const dest = db
      .select({ id: destinatario.idDestinatario })
      .from(destinatario)
      .where(and(eq(destinatario.idInscripcion, insc.idInscripcion), eq(destinatario.estado, 'activo')))
      .get();
    if (!dest) continue; // bloqueada (sin destinatario) o ya salio: nada que materializar

    const pasos = db
      .select({ orden: pasoCadencia.orden, diaOffset: pasoCadencia.diaOffset, canal: pasoCadencia.canal, idPaso: pasoCadencia.idPaso })
      .from(pasoCadencia)
      .where(eq(pasoCadencia.idCadencia, insc.idCadencia))
      .orderBy(pasoCadencia.orden)
      .all();
    if (pasos.length === 0) continue;

    const contactosEmpresa = db
      .select({ email: contacto.email, telefono: contacto.telefono })
      .from(contacto)
      .where(eq(contacto.idEmpresa, insc.idEmpresa))
      .all();
    const disponibles = canalesDisponibles(contactosEmpresa);
    const readiness = readinessEmpresa(
      disponibles,
      pasos.map((p) => ({ orden: p.orden, canal: p.canal as Canal })),
      insc.reglaFaltante as ReglaFaltante,
    );
    const reemplazoPorOrden = new Map(readiness.reemplazos.map((r) => [r.orden, r.a]));
    const sinCanalPorOrden = new Set(readiness.pasosSinCanal);
    // El anchor sale de fecha_inscripcion, que se escribe en UTC, y se compara contra `hoy`,
    // que viene en Bogota. Convertir las dos puntas a la MISMA zona es lo que hace que una
    // empresa inscrita a las 8 de la noche tenga su paso de dia 0 debido hoy y no mañana.
    const anchor = diaBogotaDeGuardado(insc.anchor ?? hoy);

    // Guard = cantidad de pasos de la cadencia: como maximo se puede avanzar un paso
    // por cada paso que tiene la cadencia en una sola pasada (los omitidos encadenan,
    // el real corta el loop con `break`).
    for (let guard = 0; guard < pasos.length; guard += 1) {
      const historial = db
        .select({ orden: pasoCadencia.orden, estado: pasoInscripcion.estado, fechaEnviada: pasoInscripcion.fechaEnviada, fechaProgramada: pasoInscripcion.fechaProgramada })
        .from(pasoInscripcion)
        .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
        .where(eq(pasoInscripcion.idDestinatario, dest.id))
        .all();
      const ejecutados = historial
        .filter((h) => h.estado === 'enviada' || h.estado === 'omitida')
        // Misma conversion que el anchor y por lo mismo: fecha_enviada se escribe en UTC (6
        // de las 6 no nulas de produccion), fecha_programada ya viene como dia de calendario.
        // Estas fechas re-anclan el paso siguiente, asi que un dia corrido aca corre toda la
        // cola que viene detras.
        .map((h) => ({ orden: h.orden, fechaReal: diaBogotaDeGuardado(h.fechaEnviada ?? h.fechaProgramada ?? hoy) }));

      const debido = proximoPasoDebido(
        pasos.map((p) => ({ orden: p.orden, diaOffset: p.diaOffset })),
        { anchor, ejecutados },
        hoy,
        config,
      );
      if (!debido) break; // nada mas por hoy, o cadencia terminada

      const paso = pasos.find((p) => p.orden === debido.orden)!;
      const yaExiste = db
        .select({ id: pasoInscripcion.idPasoInscripcion })
        .from(pasoInscripcion)
        .where(and(eq(pasoInscripcion.idDestinatario, dest.id), eq(pasoInscripcion.idPaso, paso.idPaso)))
        .get();
      // Si ya existe y llegamos aca, su estado no es 'enviada'/'omitida' (si no,
      // proximoPasoDebido ya lo hubiera contado como ejecutado): es un 'pendiente'/'fallo'
      // real esperando push o revision manual. Nada nuevo que hacer hoy.
      if (yaExiste) break;

      const ahora = new Date().toISOString();
      if (sinCanalPorOrden.has(paso.orden)) {
        db.insert(pasoInscripcion)
          .values({
            idDestinatario: dest.id,
            idPaso: paso.idPaso,
            idVersion: versionActivaDePaso(paso.idPaso),
            canal: paso.canal,
            estado: 'omitida',
            fechaProgramada: debido.fechaObjetivo,
            fechaEnviada: debido.fechaObjetivo,
            createdAt: ahora,
          })
          .run();
        resultado.omitidos += 1;
        continue;
      }

      const canalFinal = reemplazoPorOrden.get(paso.orden) ?? paso.canal;
      crearPasoInscripcionPendiente({
        idDestinatario: dest.id,
        idPaso: paso.idPaso,
        idVersion: versionActivaDePaso(paso.idPaso),
        canal: canalFinal,
        fechaProgramada: debido.fechaObjetivo,
      });
      resultado.creados += 1;
      break;
    }
  }

  return resultado;
}

// V5.4: push reanudable (B6). crearPasoInscripcionPendiente es search-first (chequea
// antes de insertar) con el indice unico id_destinatario+id_paso (V5.1) como respaldo
// final -- correr dos veces con el mismo par nunca crea una segunda fila.
export function crearPasoInscripcionPendiente(input: {
  idDestinatario: number;
  idPaso: number;
  idVersion: number;
  canal: string;
  fechaProgramada?: string;
}): number {
  const existente = db
    .select({ id: pasoInscripcion.idPasoInscripcion })
    .from(pasoInscripcion)
    .where(and(eq(pasoInscripcion.idDestinatario, input.idDestinatario), eq(pasoInscripcion.idPaso, input.idPaso)))
    .get();
  if (existente) return existente.id;

  const ahora = new Date().toISOString();
  const resultado = db
    .insert(pasoInscripcion)
    .values({
      idDestinatario: input.idDestinatario,
      idPaso: input.idPaso,
      idVersion: input.idVersion,
      canal: input.canal,
      estado: 'pendiente',
      fechaProgramada: input.fechaProgramada ?? ahora,
      createdAt: ahora,
    })
    .run();
  return Number(resultado.lastInsertRowid);
}

// Guardar el copy SIN mandarlo, y opcionalmente decir a que hora sale (2026-07-26). Hasta
// hoy un paso de cadencia era mandar o nada: el texto personalizado solo existia como
// parametro de aprobarPasoManual, o sea que solo se escribia en el mismo acto de darlo por
// enviado. Esta funcion separa las dos decisiones, que es lo unico que hacia falta para poder
// revisar antes.
//
// fechaProgramada acepta un ISO con hora ('2026-07-27T09:00:00.000Z') y de ahi en adelante la
// hora se respeta de verdad, porque pasoInscripcionesPendientes ya la filtra. Sin ella, solo
// se guarda el texto y el paso sigue programado para cuando estaba.
//
// NO toca `estado`: la fila sigue 'pendiente' y sigue siendo la misma fila que el motor ya
// conoce. Un estado nuevo tipo 'borrador' obligaria a revisar cada consulta que hoy filtra por
// 'pendiente' (la cola, la agenda, el push, el archivado de campanas) y cualquiera que se
// olvidara dejaria pasos invisibles. "Programado para el jueves 9am" ya se dice entero con la
// fecha, sin inventar un estado que signifique lo mismo.
//
// Devuelve false si el paso no existe o ya salio ('enviada'/'omitida'): reescribir el copy de
// algo que ya se mando seria falsificar el registro de lo que se dijo.
export function guardarCopyPaso(
  idPasoInscripcion: number,
  cuerpoFinal: string,
  fechaProgramada?: string,
): boolean {
  const set: { cuerpoFinal: string; fechaProgramada?: string } = { cuerpoFinal };
  if (fechaProgramada !== undefined) set.fechaProgramada = fechaProgramada;

  const res = db
    .update(pasoInscripcion)
    .set(set)
    .where(
      and(
        eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion),
        inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
      ),
    )
    .run();
  return res.changes > 0;
}

// Revisar y programar en un solo movimiento (2026-07-26). Para el operador es un gesto solo
// ("este texto va, a las 11"), asi que guardar el copy y dejarlo aprobado no pueden ser dos
// llamadas que puedan quedar a medias: si la segunda falla, el paso queda con texto nuevo y
// sin aprobar, o aprobado con el texto viejo. Va en UNA transaccion.
//
// NO es aprobarPasoManual y conviene no confundirlas nunca: aquella marca el paso 'enviada' y
// escribe el toque porque el humano YA lo mando por su cuenta. Esta deja el paso PENDIENTE
// para que lo mande la herramienta a su hora, y no escribe ningun toque -- todavia no ha
// pasado nada que contar.
//
// Devuelve la fila releida, no un booleano: quien programa siete mensajes tiene que poder ver
// que quedo escrito en cada uno sin volver a preguntar. null = no se pudo, y el motivo lo dice
// `motivo` para poder rechazar uno sin tumbar el lote.
export type EnvioProgramado = {
  idPasoInscripcion: number;
  idEmpresa: string;
  empresa: string | null;
  canal: string;
  cuerpoFinal: string | null;
  fechaProgramada: string | null;
  aprobadoEn: string | null;
  aprobadoPor: string | null;
  estado: string;
};

export type ResultadoProgramar =
  | { ok: true; envio: EnvioProgramado }
  | { ok: false; idPasoInscripcion: number; motivo: 'no_existe' | 'ya_salio' };

export function aprobarYProgramarPaso(
  idPasoInscripcion: number,
  cuerpoFinal: string,
  fechaProgramada: string,
  aprobadoPor: string,
  ahora: string = new Date().toISOString(),
): ResultadoProgramar {
  return db.transaction((tx) => {
    const actual = tx
      .select({ estado: pasoInscripcion.estado })
      .from(pasoInscripcion)
      .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
      .get();
    if (!actual) return { ok: false as const, idPasoInscripcion, motivo: 'no_existe' as const };
    // Reescribir el copy de algo que ya salio seria falsificar el registro de lo que se dijo.
    if (!['pendiente', 'fallo'].includes(actual.estado)) {
      return { ok: false as const, idPasoInscripcion, motivo: 'ya_salio' as const };
    }

    tx.update(pasoInscripcion)
      .set({ cuerpoFinal, fechaProgramada, aprobadoEn: ahora, aprobadoPor })
      .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
      .run();

    return { ok: true as const, envio: leerEnvioProgramado(tx, idPasoInscripcion)! };
  });
}

// Relectura de una fila de envio, con su empresa. Se usa dentro de la transaccion que acaba de
// escribir (devolver lo que quedo, no lo que se mando) y desde la consulta del dia.
function leerEnvioProgramado(tx: Tx | typeof db, idPasoInscripcion: number): EnvioProgramado | null {
  const f = tx
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      canal: pasoInscripcion.canal,
      cuerpoFinal: pasoInscripcion.cuerpoFinal,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      aprobadoEn: pasoInscripcion.aprobadoEn,
      aprobadoPor: pasoInscripcion.aprobadoPor,
      estado: pasoInscripcion.estado,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .get();
  return f ?? null;
}

// Que hay programado para un dia, con su hora, su canal, su copy final y su estado. Es lo que
// contesta "¿quedaron listas?" sin tener que confiar: hasta hoy, despues de programar siete
// mensajes no habia forma de comprobarlo salvo creer que la escritura funciono.
//
// Trae TODO lo programado para ese dia, aprobado y sin aprobar, porque la mitad util de la
// respuesta es justo la que falta por revisar. `listo` lo resume en una sola lectura: aprobado
// y con copy escrito.
export function enviosProgramadosDelDia(fechaDia: string, canal?: string): (EnvioProgramado & { listo: boolean })[] {
  const condiciones = [
    inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
    sql`substr(${pasoInscripcion.fechaProgramada}, 1, 10) = ${fechaDia}`,
  ];
  if (canal) condiciones.push(eq(pasoInscripcion.canal, canal));

  return db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      canal: pasoInscripcion.canal,
      cuerpoFinal: pasoInscripcion.cuerpoFinal,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      aprobadoEn: pasoInscripcion.aprobadoEn,
      aprobadoPor: pasoInscripcion.aprobadoPor,
      estado: pasoInscripcion.estado,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(and(...condiciones))
    .orderBy(pasoInscripcion.fechaProgramada)
    .all()
    .map((f) => ({ ...f, listo: f.aprobadoEn !== null && f.cuerpoFinal !== null }));
}

// El copy tal como quedaria si el paso saliera ahora: el revisado si existe, la plantilla si
// no. Es lo que hay que poder mirar ANTES de mandar, y responde tambien "¿esto ya lo revise?"
// sin tener que comparar dos textos a ojo.
export function copyDePaso(idPasoInscripcion: number): {
  cuerpo: string | null;
  revisado: boolean;
  fechaProgramada: string | null;
  estado: string;
} | null {
  const f = db
    .select({
      cuerpoFinal: pasoInscripcion.cuerpoFinal,
      cuerpoPlantilla: versionPaso.cuerpo,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      estado: pasoInscripcion.estado,
    })
    .from(pasoInscripcion)
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .get();
  if (!f) return null;
  return {
    cuerpo: f.cuerpoFinal ?? f.cuerpoPlantilla,
    revisado: f.cuerpoFinal !== null,
    fechaProgramada: f.fechaProgramada,
    estado: f.estado,
  };
}

// Tarea B2 (plan-prueba-real-multicanal.md): whatsapp no tiene concepto de "secuencia
// externa por campana" como Apollo -- Evolution manda por LINEA (una instalacion,
// compartida entre campanas). Primera fila con estado='activa'; null si ninguna linea
// esta lista para mandar (el push de whatsapp se salta entero, ver pasoInscripcionesPendientes).
export function lineaWhatsappActiva(): { referenciaProveedor: string } | null {
  const fila = db
    .select({ referenciaProveedor: lineaWhatsapp.referenciaProveedor })
    .from(lineaWhatsapp)
    .where(eq(lineaWhatsapp.estado, 'activa'))
    .get();
  if (!fila || !fila.referenciaProveedor) return null;
  return { referenciaProveedor: fila.referenciaProveedor };
}

// Gate de canal (2026-07-14): persiste quien lanzo la campana -- lo necesita
// lineaWhatsappActivaDeOwner para resolver la linea PROPIA de ese dueno en vez de
// "cualquier linea activa del sistema" (ver pasoInscripcionesPendientes mas abajo).
export function fijarOwnerCampana(idCampana: number, owner: string): void {
  db.update(campana).set({ owner, updatedAt: new Date().toISOString() }).where(eq(campana.idCampana, idCampana)).run();
}

// Resuelve la linea de whatsapp ACTIVA del dueno de una campana (owner_canonico ->
// organizacion_miembro -> id_user -> linea_whatsapp), no la primera activa del sistema.
// owner null = campana vieja, lanzada antes de que este campo se poblara: cae al
// fallback de la linea de POOL (mismo comportamiento que el sistema tenia antes de
// este cambio), para no romper campanas ya lanzadas.
//
// Fix (2026-07-14, code review Task 3): organizacion_miembro es multi-org -- su llave
// real es (id_organizacion, owner_canonico), no owner_canonico solo (ver
// scripts/seed_organizacion.ts y la org "Visitantes"). Sin el filtro de organizacion,
// un owner_canonico que colisionara entre dos orgs distintas resolveria a la linea de
// la org EQUIVOCADA -- misenvio real a los contactos de otra org. El fallback de pool
// (owner null) SI queda sin filtro: linea_whatsapp no tiene columna id_organizacion,
// la linea de pool es compartida a proposito en todo el sistema.
export function lineaWhatsappActivaDeOwner(owner: string | null, idOrganizacion: number): { referenciaProveedor: string } | null {
  if (!owner) {
    const pool = db
      .select({ referenciaProveedor: lineaWhatsapp.referenciaProveedor })
      .from(lineaWhatsapp)
      .where(and(isNull(lineaWhatsapp.idUsuario), eq(lineaWhatsapp.estado, 'activa')))
      .get();
    return pool?.referenciaProveedor ? { referenciaProveedor: pool.referenciaProveedor } : null;
  }

  // dbReal para la identidad; la linea de abajo sigue en `db` porque linea_whatsapp SI es
  // negocio y debe conmutar. Esta funcion mezcla los dos lados a proposito: por eso el corte
  // es por tabla, no por funcion.
  const miembro = dbReal
    .select({ idUser: organizacionMiembro.idUser })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.ownerCanonico, owner), eq(organizacionMiembro.idOrganizacion, idOrganizacion)))
    .get();
  if (!miembro?.idUser) return null;

  const linea = db
    .select({ referenciaProveedor: lineaWhatsapp.referenciaProveedor })
    .from(lineaWhatsapp)
    .where(and(eq(lineaWhatsapp.idUsuario, miembro.idUser), eq(lineaWhatsapp.estado, 'activa')))
    .get();
  return linea?.referenciaProveedor ? { referenciaProveedor: linea.referenciaProveedor } : null;
}

// Gmail Etapa 2 (2026-07-15): mismo mapeo owner_canonico -> id_user que ya usa
// lineaWhatsappActivaDeOwner para whatsapp, generalizado para correo. Funcion propia
// (no reusa la de whatsapp) para no tocar codigo de whatsapp ya aprobado -- la
// duplicacion es 6 lineas, el riesgo de romper whatsapp no vale la pena ahorrarselas.
export function idUsuarioDeOwner(owner: string | null, idOrganizacion: number): string | null {
  if (!owner) return null;
  // dbReal: organizacion_miembro es identidad, no conmuta. Con `db` esto devolvia null en
  // modo prueba (pruebas.db no tiene usuarios, por diseño), el agrupador de correo concluia
  // "el owner no tiene Gmail" y mandaba todo al fallback de Apollo.
  const miembro = dbReal
    .select({ idUser: organizacionMiembro.idUser })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.ownerCanonico, owner), eq(organizacionMiembro.idOrganizacion, idOrganizacion)))
    .get();
  return miembro?.idUser ?? null;
}

// "Verdadero-Configurado" (spec Etapa 2): tiene credencial Y la ultima verificacion
// real dio 'ok'. Mismo criterio que ya usa GmailConector.tsx en la UI
// (estado.ultimoResultado === 'ok') -- no un estado nuevo, solo lo expone al backend.
export function gmailVerificadoDe(idUsuario: string): boolean {
  const e = estadoConector('gmail', idUsuario);
  return e.tieneCredencial && e.ultimoResultado === 'ok';
}

export function marcarCampanaAprobadaGmail(idCampana: number): void {
  db.update(campana).set({ aprobadaEnvioGmail: 1, updatedAt: new Date().toISOString() }).where(eq(campana.idCampana, idCampana)).run();
}

// Tope diario por CUENTA de Gmail (no por campana -- una cuenta puede mandar correo
// de varias campanas del mismo dueno el mismo dia, el limite es de la cuenta real).
// Cuenta pasos 'enviada' con proveedor='gmail' de campanas cuyo owner resuelve a este
// idUsuario, con fecha_enviada de hoy. hoy en formato YYYY-MM-DD (mismo criterio que
// el resto del repository, ver kpisPipeline.entrandoHoy).
//
// Fix (2026-07-15, code review): mismo bug ya encontrado antes en
// lineaWhatsappActivaDeOwner (ver comentario alli, lineas ~3490-3496) --
// organizacion_miembro es multi-org, la llave real es (id_organizacion, owner_canonico),
// no owner_canonico solo. Sin filtrar tambien campana.idOrganizacion aqui, un
// owner_canonico que colisionara entre dos orgs sumaria envios de AMBAS, inflando el
// conteo contra el tope diario de una organizacion con los envios de otra.
//
// Fix (2026-07-28): `hoy` es el dia de calendario en BOGOTA y la columna se convierte a Bogota
// antes de comparar. Las dos puntas tienen que estar en la misma zona o el tope se reinicia
// donde no debe. fecha_enviada se escribe con new Date().toISOString(), o sea en UTC: comparar
// su recorte contra un dia UTC (lo que hacia antes) mueve el corte del tope a las 19:00 de
// Colombia, y comparar su recorte contra un dia de Bogota (arreglar solo el caller) dejaria de
// contar los envios hechos despues de las 19:00. Colombia no tiene horario de verano, esta fija
// en UTC-5, asi que el desplazamiento es exacto y no necesita tabla de zonas.
// El CASE protege las filas donde fecha_enviada quedo como dia suelto sin hora: ahi ya es un dia
// de calendario y restarle cinco horas la correria al dia anterior.
export function enviosGmailHoy(idUsuario: string, idOrganizacion: number, hoy: string = fechaBogotaISO()): number {
  // dbReal para la identidad; el conteo de abajo sigue en `db` (paso_inscripcion es negocio
  // y el tope diario debe contar los envios de la base en la que estas). Sin esto, en modo
  // prueba el miembro no se encontraba y la funcion devolvia 0: el tope diario de Gmail
  // quedaba desactivado en silencio.
  const miembro = dbReal
    .select({ owner: organizacionMiembro.ownerCanonico })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idUser, idUsuario), eq(organizacionMiembro.idOrganizacion, idOrganizacion)))
    .get();
  if (!miembro?.owner) return 0;

  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(pasoInscripcion.proveedor, 'gmail'),
        eq(pasoInscripcion.estado, 'enviada'),
        eq(campana.owner, miembro.owner),
        eq(campana.idOrganizacion, idOrganizacion),
        sql`substr(CASE WHEN length(${pasoInscripcion.fechaEnviada}) > 10 THEN datetime(${pasoInscripcion.fechaEnviada}, '-5 hours') ELSE ${pasoInscripcion.fechaEnviada} END, 1, 10) = ${hoy}`,
      ),
    )
    .get();
  return fila?.n ?? 0;
}

// Tarea 8 (D6, plan-whatsapp-adapter.md): CRUD real de lineas, faltaba entero -- hasta
// ahora solo existia la lectura angosta de arriba para el goteo. `idUsuario: null` =
// linea de POOL (compartida, la administra el admin); no-null = linea PERSONAL de ESE
// usuario. Mismo criterio que filtroConector, pero a nivel de fila de linea en vez de
// conector completo (no hay UNIQUE que lo fuerce aca: un usuario podria en teoria tener
// mas de una, la UI de /conectores es quien limita a una por ahora).
export type LineaWhatsapp = {
  id: number;
  numero: string;
  tipo: string;
  idUsuario: string | null;
  referenciaProveedor: string | null;
  estado: string;
  techoDiario: number;
  fechaCreacion: string | null;
};

export function lineasWhatsappDeUsuario(idUsuario: string): LineaWhatsapp[] {
  return db.select().from(lineaWhatsapp).where(eq(lineaWhatsapp.idUsuario, idUsuario)).all();
}

export function lineasWhatsappPool(): LineaWhatsapp[] {
  return db.select().from(lineaWhatsapp).where(isNull(lineaWhatsapp.idUsuario)).all();
}

export function lineaWhatsappPorId(id: number): LineaWhatsapp | null {
  return db.select().from(lineaWhatsapp).where(eq(lineaWhatsapp.id, id)).get() ?? null;
}

export function crearLineaWhatsapp(input: {
  numero: string;
  tipo: 'personal' | 'pool';
  idUsuario: string | null;
  referenciaProveedor: string;
  techoDiario: number;
}): number {
  const resultado = db
    .insert(lineaWhatsapp)
    .values({
      numero: input.numero,
      tipo: input.tipo,
      idUsuario: input.idUsuario,
      referenciaProveedor: input.referenciaProveedor,
      estado: 'calentando',
      techoDiario: input.techoDiario,
      fechaCreacion: new Date().toISOString(),
    })
    .run();
  return Number(resultado.lastInsertRowid);
}

export function actualizarEstadoLineaWhatsapp(id: number, estado: 'calentando' | 'activa' | 'caida') {
  db.update(lineaWhatsapp).set({ estado }).where(eq(lineaWhatsapp.id, id)).run();
}

// Sesion 2026-07-10 (pedido de Sebastian: revisar-y-mandar de verdad): datos de UN
// paso para que la server action lo mande por su canal (la action wirea el adaptador,
// el repo/core no lo conoce -- regla de capas). A diferencia de pasoInscripcionesPendientes,
// NO filtra por esManual/estado: es un envio disparado a mano desde el cockpit, no el
// barrido automatico del worker.
export function datosEnvioPasoManual(idPasoInscripcion: number): {
  canal: string;
  idEmpresa: string;
  idContacto: number;
  destinatario: { email: string | null; telefono: string | null; nombre: string | null; empresa: string | null; cargo: string | null };
} | null {
  const f = db
    .select({
      canal: pasoInscripcion.canal,
      email: contacto.email,
      telefono: contacto.telefono,
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      empresaNombre: empresa.nombreOficial,
      idEmpresa: empresa.idEmpresa,
      idContacto: contacto.idContacto,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .get();
  if (!f) return null;
  return {
    canal: f.canal,
    idEmpresa: f.idEmpresa,
    idContacto: f.idContacto,
    destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
  };
}

// Igual que aprobarPasoManual (marca enviada + deja toque en el historial, idempotente),
// pero con el proveedor REAL (evolution/apollo) y el id de mensaje que devolvio el
// adaptador -- porque aca la herramienta SI lo mando de verdad, no fue "ya lo hice".
export function registrarPasoEnviadoConToque(
  idPasoInscripcion: number,
  proveedor: string,
  proveedorMensajeId: string,
  fechaEnviada: string,
  cuerpoFinal: string,
  // proveedorHiloId (enviar_correo_directo, 2026-09-01): opcional y aditivo, mismo criterio que
  // marcarPasoInscripcionEnviada -- un caller que no lo tiene (el unico de hoy, llamada/actions.ts)
  // no lo manda y la fila queda igual que siempre. Sin el, un correo directo por Gmail no dejaria
  // el hilo escrito y hilosGmailDeCampana caeria al fallback de proveedorMensajeId (valido para un
  // hilo nuevo, pero mejor dejar el dato real cuando se tiene).
  proveedorHiloId?: string,
) {
  const fila = db
    .select({ canal: pasoInscripcion.canal, idContacto: destinatario.idContacto, idEmpresa: inscripcion.idEmpresa })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .get();
  if (!fila) throw new Error(`paso_inscripcion ${idPasoInscripcion} no existe`);

  db.transaction((tx) => {
    // Idempotente igual que aprobarPasoManual: solo si sigue pendiente/fallo (no re-marca
    // ni duplica el toque si un doble-click lo dispara dos veces).
    const res = tx
      .update(pasoInscripcion)
      .set({ estado: 'enviada', proveedor, proveedorMensajeId, fechaEnviada, ...(proveedorHiloId ? { proveedorHiloId } : {}) })
      .where(and(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion), inArray(pasoInscripcion.estado, ['pendiente', 'fallo'])))
      .run();
    if (res.changes === 0) return;
    tx.insert(toque)
      .values({
        idEmpresa: fila.idEmpresa,
        idContacto: fila.idContacto,
        fecha: fechaEnviada,
        canal: fila.canal,
        quePaso: cuerpoFinal,
        fuente: 'cadencia_manual',
        idOrganizacion: 1,
        createdAt: fechaEnviada,
      })
      .run();
  });
}

// Filas listas para push: pendiente o fallo (con backoff cumplido), por debajo de
// MAX_INTENTOS. Para correo, solo de campanas que ya tienen secuencia externa creada
// (una campana sin proveedor_campana_id no tiene a donde empujar; se salta en vez de
// gastar un intento fallido en ella).
//
// Sesion 2026-07-09 (registro de proveedor por canal, app/adapters/registro-envio.ts):
// gana el parametro `canal` -- el worker la llama UNA VEZ POR CADA canal que si tiene
// proveedor automatico registrado, nunca para todos los canales mezclados. Asi push.ts
// sigue sin saber que existe "canal" como concepto de ruteo: solo procesa la lista que
// le dan contra el adaptador que le dan, una vez por canal.
//
// Tarea B2 (whatsapp automatico): el campo `proveedorCampanaId` de FilaPasoInscripcion
// es el primer argumento posicional que push.ts le pasa a CanalEntrega.enviarPaso, sin
// importar el canal -- ahi es donde Evolution espera el NOMBRE DE INSTANCIA, no un id
// de secuencia de Apollo (ver evolution.ts:79-92, mismo parametro reusado a proposito).
// Gate de canal (2026-07-14): antes se resolvia UNA linea global contra
// lineaWhatsappActiva() y se reusaba para TODAS las filas de whatsapp, sin importar de
// que campana/dueno eran -- una campana de un vendedor podia terminar mandando por la
// linea de otro. Ahora cada fila rutea por la linea ACTIVA del DUENO de SU PROPIA
// campana (lineaWhatsappActivaDeOwner), campana por campana. Una campana cuyo dueno no
// tiene linea activa propia se salta ENTERA (esa fila no aparece), en vez de gastar un
// reintento fallido -- mismo criterio de "no hay a donde mandar, no lo intentes" que
// tenia el gate global, pero aplicado por campana en vez de a la corrida completa.
// Fallback de saludo (incidente ConmuTV, 2026-08-25): el 100% de una campaña de ~126
// correos salió con "Hola [nombre]," literal porque el contacto no tenía nombre y
// renderizarCopy, por diseño, deja el placeholder crudo cuando falta el dato (correcto en
// el editor humano de /llamada y /cola, donde alguien lo va a ver antes de mandar; una fuga
// en el envío automático de una campaña, que a nadie se le muestra antes de salir).
// Cadena: contacto principal (si es usable) -> representante legal -> representante legal
// suplente -> nombre de la empresa. Nunca None: el último escalón siempre tiene dato.
function nombreEsUsable(nombre: string | null, nombreEmpresa: string): nombre is string {
  if (!nombre) return false;
  const limpio = nombre.trim();
  if (limpio === '') return false;
  // Import mal cargado que puso el nombre de la empresa en el campo de la persona: no es un
  // saludo real ("Hola Giganav," lee tan robotico como "Hola [nombre],").
  return limpio.toLowerCase() !== nombreEmpresa.trim().toLowerCase();
}

function repLegalDe(idEmpresa: string): string | null {
  const filas = db
    .select({ nombre: contacto.nombre, cargoCategoria: contacto.cargoCategoria })
    .from(contacto)
    .where(and(eq(contacto.idEmpresa, idEmpresa), inArray(contacto.cargoCategoria, ['rep_legal', 'rep_legal_suplente'])))
    .all();
  const repLegal = filas.find((f) => f.cargoCategoria === 'rep_legal' && f.nombre?.trim());
  if (repLegal?.nombre) return repLegal.nombre;
  const suplente = filas.find((f) => f.cargoCategoria === 'rep_legal_suplente' && f.nombre?.trim());
  return suplente?.nombre ?? null;
}

export function nombreParaSaludo(idEmpresa: string, nombreContacto: string | null, nombreEmpresa: string): string {
  if (nombreEsUsable(nombreContacto, nombreEmpresa)) return nombreContacto;
  const repLegal = repLegalDe(idEmpresa);
  if (nombreEsUsable(repLegal, nombreEmpresa)) return repLegal as string;
  return nombreEmpresa;
}

export function pasoInscripcionesPendientes(canal: Canal, ahora: string = new Date().toISOString()): FilaPasoInscripcion[] {
  const condiciones = [
    eq(pasoInscripcion.canal, canal),
    inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
    // Un paso manual espera REVISION HUMANA, y desde el 2026-07-26 esa revision se puede dar
    // de dos formas distintas, no de una:
    //   - aprobarPasoManual: "ya lo mande yo por mi cuenta". Marca 'enviada' y escribe el
    //     toque. El paso sale de esta consulta por estado, no por aca.
    //   - aprobarYProgramarPaso: "lo revise, el texto es este, mandalo tu a las 11". Deja
    //     aprobado_en y el paso sigue pendiente, para que lo empuje el worker a su hora.
    //
    // Hasta hoy solo existia la primera, asi que es_manual significaba en la practica "esto no
    // lo manda la herramienta nunca". Eso dejaba sin camino el gesto que el operador de verdad
    // hace: revisar temprano y que salga mas tarde. es_manual sigue queriendo decir lo mismo
    // que siempre (exige que un humano lo lea antes), y aprobado_en es la constancia de que
    // ese humano ya lo leyo.
    sql`(${pasoCadencia.esManual} = 0 OR ${pasoInscripcion.aprobadoEn} IS NOT NULL)`,
    // Fase 7 (pausar campana): defensa en profundidad -- si un paso ya quedo
    // pendiente ANTES de pausar, esto evita que igual se empuje al proveedor.
    eq(campana.estado, 'activa'),
    sql`${pasoInscripcion.intentos} < ${MAX_INTENTOS}`,
    sql`(${pasoInscripcion.proximoIntento} IS NULL OR ${pasoInscripcion.proximoIntento} <= ${ahora})`,
    // La HORA programada se respeta (2026-07-26). Antes esta consulta no miraba
    // fecha_programada en absoluto: la fila salia en el primer ciclo del worker despues de
    // materializarse, asi que "programado" solo podia significar un dia, nunca una hora.
    // Comparar el texto directo funciona en los dos formatos que hay en la columna, porque
    // ISO ordena igual como texto que como instante: un dia suelto ('2026-07-27') es prefijo
    // del datetime completo, asi que '2026-07-27' <= '2026-07-27T09:00:00Z' da true (una fila
    // programada para hoy sin hora sale hoy, como siempre) y '2026-07-28' da false.
    // NULL sigue saliendo: es como nacieron las filas viejas y no se les inventa una hora.
    sql`(${pasoInscripcion.fechaProgramada} IS NULL OR ${pasoInscripcion.fechaProgramada} <= ${ahora})`,
  ];
  // correo: sin secuencia externa (proveedor_campana_id) no hay a donde mandar. whatsapp
  // no usa esta columna -- su gate de "hay a donde mandar" se resuelve por fila mas abajo.
  if (canal !== 'whatsapp') condiciones.push(isNotNull(campana.proveedorCampanaId));

  // GATE DE REVISION HUMANA PARA WHATSAPP (2026-07-26). "WhatsApp nunca se automatiza en este
  // sistema": un paso de whatsapp no sale si nadie leyo el texto, por mas que su fecha ya haya
  // llegado y la linea este activa. Hasta hoy esto no era cierto -- el worker empujaba
  // cualquier paso de whatsapp que se materializara, y en produccion habia 8 esperando sin que
  // nadie los hubiera revisado.
  //
  // Se aprueba con aprobarYProgramarPaso, que en el mismo movimiento deja el copy revisado: no
  // hay forma de aprobar sin haber escrito un texto, que es justo lo que "revisado" significa.
  //
  // Solo whatsapp. Correo ya tiene su compuerta por campana (aprobada_envio_gmail) y sumarle
  // una segunda cambiaria el comportamiento de un canal que nadie pidio cambiar.
  if (canal === 'whatsapp') condiciones.push(isNotNull(pasoInscripcion.aprobadoEn));

  const filas = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      intentos: pasoInscripcion.intentos,
      canal: pasoInscripcion.canal,
      email: contacto.email,
      telefono: contacto.telefono,
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      idEmpresa: empresa.idEmpresa,
      empresaNombre: empresa.nombreOficial,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      // El copy revisado gana sobre la plantilla (2026-07-26). NULL = nadie lo reviso y sale
      // version_paso.cuerpo, que es el comportamiento de siempre.
      cuerpoFinal: pasoInscripcion.cuerpoFinal,
      proveedorCampanaId: campana.proveedorCampanaId,
      owner: campana.owner,
      idOrganizacion: campana.idOrganizacion,
      aprobadaEnvioGmail: campana.aprobadaEnvioGmail,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(and(...condiciones))
    .all();

  if (canal !== 'whatsapp') {
    return filas.map((f) => {
      // Correo automático de campaña NUNCA pasa por revisión humana (esa es la compuerta de
      // whatsapp, no la de este canal): cuerpoFinal siempre es NULL acá, así que sin este
      // render el placeholder [nombre] de la plantilla cruda salía intacto a producción --
      // exactamente el bug de ConmuTV (2026-08-25). Si alguna vez SÍ hay cuerpoFinal (un canal
      // futuro que reuse esta función con revisión propia), ese ya viene resuelto y se respeta
      // tal cual, sin volver a renderizar encima.
      if (f.canal === 'correo' && f.cuerpoFinal === null) {
        const datos: Record<string, string> = {
          nombre: nombreParaSaludo(f.idEmpresa, f.nombre, f.empresaNombre),
          empresa: f.empresaNombre,
          ...(f.cargo ? { cargo: f.cargo } : {}),
        };
        return {
          idPasoInscripcion: f.idPasoInscripcion,
          proveedorCampanaId: f.proveedorCampanaId as string,
          destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
          paso: {
            asunto: f.asunto ? renderizarCopy(f.asunto, datos).texto : f.asunto,
            cuerpo: renderizarCopy(f.cuerpo ?? '', datos).texto,
            canal: f.canal,
          },
          intentos: f.intentos,
          owner: f.owner,
          idOrganizacion: f.idOrganizacion,
          aprobadaEnvioGmail: f.aprobadaEnvioGmail === 1,
        };
      }
      return {
        idPasoInscripcion: f.idPasoInscripcion,
        proveedorCampanaId: f.proveedorCampanaId as string,
        destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
        paso: { asunto: f.asunto, cuerpo: f.cuerpoFinal ?? f.cuerpo ?? '', canal: f.canal },
        intentos: f.intentos,
        owner: f.owner,
        idOrganizacion: f.idOrganizacion,
        aprobadaEnvioGmail: f.aprobadaEnvioGmail === 1,
      };
    });
  }

  // whatsapp: cada campana rutea por la linea ACTIVA de SU DUENO (fijarOwnerCampana),
  // nunca "cualquier linea activa del sistema" (gate de canal 2026-07-14). Cache por
  // owner dentro de esta corrida: varias filas de la misma campana comparten el mismo
  // owner, no vale la pena repetir el JOIN de organizacion_miembro por cada una.
  const cacheLinea = new Map<string, { referenciaProveedor: string } | null>();
  const resultado: FilaPasoInscripcion[] = [];
  for (const f of filas) {
    const owner = f.owner ?? null;
    const cacheKey = `${f.idOrganizacion}:${owner}`;
    if (!cacheLinea.has(cacheKey)) cacheLinea.set(cacheKey, lineaWhatsappActivaDeOwner(owner, f.idOrganizacion));
    const linea = cacheLinea.get(cacheKey) ?? null;
    if (!linea) continue; // ni linea propia ni (si owner=null) pool: no hay a donde mandar, se salta la fila

    resultado.push({
      idPasoInscripcion: f.idPasoInscripcion,
      proveedorCampanaId: linea.referenciaProveedor,
      destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
      paso: { asunto: f.asunto, cuerpo: f.cuerpoFinal ?? f.cuerpo ?? '', canal: f.canal },
      intentos: f.intentos,
    });
  }
  return resultado;
}

// enviando es un estado transitorio informativo (no lo lee ninguna query de
// reintento): si el worker muere justo entre marcarlo y recibir la respuesta de
// Apollo, la fila queda en 'enviando' y no se reintenta sola -- mismo tipo de riesgo
// que ya acepta B7 (el worker no promete exactly-once), no bloquea V5.4.
export function marcarPasoInscripcionEnviando(idPasoInscripcion: number) {
  db.update(pasoInscripcion).set({ estado: 'enviando' }).where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion)).run();
}

// proveedor (sesion 2026-07-09): ya no se hardcodea 'apollo' -- viene del EnvioResultado
// real que devolvio el adaptador que de verdad mando el paso (ver push.ts).
// proveedorHiloId (2026-07-28): opcional porque solo Gmail tiene hilo. Se escribe solo si
// vino -- un undefined NO pisa con NULL lo que ya estuviera guardado.
export function marcarPasoInscripcionEnviada(
  idPasoInscripcion: number,
  proveedor: string,
  proveedorMensajeId: string,
  fechaEnviada: string,
  proveedorHiloId?: string,
) {
  db.update(pasoInscripcion)
    .set({ estado: 'enviada', proveedor, proveedorMensajeId, fechaEnviada, ...(proveedorHiloId ? { proveedorHiloId } : {}) })
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .run();
}

// Sesion 2026-07-09: cierra un paso_inscripcion de LLAMADA cuando el owner ya
// registro el toque real (con resultado) via CapturaLlamada/registrarToqueAction --
// a diferencia de aprobarPasoManual (Tier 1 correo/whatsapp), esta funcion NO inserta
// un toque: registrarToque ya lo hizo, con el resultado real de la conversacion. Solo
// le falta marcar el paso_inscripcion 'enviada' para que salga de "Ir a llamar" y el
// motor re-ancle el siguiente paso desde esta fecha real.
export function marcarPasoInscripcionCompletadaManual(idPasoInscripcion: number, fechaEnviada: string) {
  db.update(pasoInscripcion)
    .set({ estado: 'enviada', proveedor: 'manual', fechaEnviada })
    .where(and(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion), eq(pasoInscripcion.estado, 'pendiente')))
    .run();
}

export function marcarPasoInscripcionFallo(idPasoInscripcion: number, intentos: number, proximoIntento: string | null) {
  db.update(pasoInscripcion)
    .set({ estado: 'fallo', intentos, proximoIntento })
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .run();
}

// Sesion 2026-07-10 (pedido de Sebastian): "Por revisar" NO es una cola de
// personalizar copy -- eso ya vive en /cola -> /llamada (ver CadenciasHoy.tsx, misma
// sesion). "Por revisar" es la cola de inscripciones que nacieron 'bloqueada' (V4.5,
// ver preview-inscripcion.ts): la empresa no tiene NINGUN contacto con correo, asi
// que el motor no supo a quien mandarle nada. Sebastian completa el dato aca mismo.

// Aprobar un paso manual: fechaEnviada es la fecha REAL en que Sebastian lo mando
// (no necesariamente hoy si aprueba con retraso), y es esa fecha real la que el
// motor de fechas usa para re-anclar el siguiente paso (B6), no la fechaProgramada
// original. proveedor='manual' distingue de un envio real por Apollo en el mismo
// campo que usa marcarPasoInscripcionEnviada.
// Parte 4 campanas: cuerpoFinal es el texto que Sebastian personalizo (o dejo tal
// cual) antes de mandarlo el mismo. Ademas de marcar el paso 'enviada' (igual que
// antes), deja un toque en el historial de la empresa -- antes aprobar no dejaba
// rastro alguno en `toque`, invisible para cualquiera que mirara la ficha de la
// cuenta. cuerpoFinal es opcional (compatibilidad con el caller existente).
export function aprobarPasoManual(idPasoInscripcion: number, fechaEnviada: string, cuerpoFinal?: string) {
  const fila = db
    .select({
      canal: pasoInscripcion.canal,
      idContacto: destinatario.idContacto,
      idEmpresa: inscripcion.idEmpresa,
      // El copy guardado antes de mandar (2026-07-26, guardarCopyPaso). Si el caller no manda
      // cuerpoFinal, el toque queda con el texto REVISADO y no vacio: antes de la columna, el
      // unico texto posible era el que llegara en este parametro.
      cuerpoGuardado: pasoInscripcion.cuerpoFinal,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .get();
  if (!fila) throw new Error(`paso_inscripcion ${idPasoInscripcion} no existe`);

  // Idempotente (hallazgo real de /code-review): sin el WHERE estado='pendiente', un
  // doble llamado (doble click, retry) sobreescribia fechaEnviada Y duplicaba el toque.
  // El update solo afecta la fila si TODAVIA esta pendiente; si ya se aprobo antes,
  // res.changes queda en 0 y no se inserta un segundo toque.
  db.transaction((tx) => {
    const res = tx
      .update(pasoInscripcion)
      .set({ estado: 'enviada', proveedor: 'manual', fechaEnviada })
      .where(and(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion), eq(pasoInscripcion.estado, 'pendiente')))
      .run();
    if (res.changes === 0) return;
    tx.insert(toque)
      // Hardcodeado a Onepay (id 1): este toque nace del motor de cadencias, que todavia
      // no filtra por organizacion (plan futuro). registrarToque() (Task 8) SI usa la
      // organizacion real de la sesion.
      .values({
        idEmpresa: fila.idEmpresa,
        idContacto: fila.idContacto,
        fecha: fechaEnviada,
        canal: fila.canal,
        quePaso: cuerpoFinal ?? fila.cuerpoGuardado ?? null,
        fuente: 'cadencia_manual',
        idOrganizacion: 1,
        createdAt: fechaEnviada,
      })
      .run();
  });
}

// V5.7: cola del dia unificada. Un solo query trae AMBOS tipos de toque de cadencia
// (automatico y manual, distinguidos por esManual) para hoy o atrasados; el llamador
// (UI) decide que hacer con cada uno -- el automatico es informativo (Apollo lo
// manda solo), el manual pide accion humana (aprobarPasoManual). date(...) en vez de
// comparar el string crudo: fechaProgramada es ISO datetime completo, comparar texto
// contra una fecha corta 'YYYY-MM-DD' fallaria para las de HOY con hora (mismo bug
// que ya se evito en el puente de V4.8).
export function agendaHoyCadencias(hoy: string, owner?: string) {
  const filas = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idDestinatario: pasoInscripcion.idDestinatario,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      canal: pasoInscripcion.canal,
      esManual: pasoCadencia.esManual,
      orden: pasoCadencia.orden,
      diaOffset: pasoCadencia.diaOffset,
      email: contacto.email,
      nombre: contacto.nombre,
      asunto: versionPaso.asunto,
      // Parte 4 campanas: el manual necesita el copy COMPLETO (no solo asunto) para
      // poder personalizar antes de aprobar, mas el flag de firma y las variables ya
      // detectadas por el parser (evita re-parsear texto en la UI).
      cuerpo: versionPaso.cuerpo,
      // El copy ya revisado de ESTE envio, si alguien lo guardo antes de mandarlo
      // (2026-07-26, guardarCopyPaso). Va aparte de `cuerpo` y no lo pisa: hacen falta los dos
      // para poder ver que se cambio respecto a la plantilla.
      cuerpoFinal: pasoInscripcion.cuerpoFinal,
      // Constancia de que un humano ya leyo el texto (2026-07-26). La pantalla la necesita
      // para no ofrecer dos veces el mismo gesto: sin esto no hay forma de distinguir un paso
      // aprobado esperando su hora de uno que nadie ha revisado, y los dos se ven igual.
      aprobadoEn: pasoInscripcion.aprobadoEn,
      firmaApollo: versionPaso.firmaApollo,
      variables: versionPaso.variables,
      idCampana: campana.idCampana,
      modo: campana.modo,
      idEmpresa: empresa.idEmpresa,
      empresaNombre: empresa.nombreOficial,
      // Campos nuevos (2026-07-14) para poder fusionar estas filas a la lista unificada
      // de /cola sin una segunda consulta.
      estadoNotion: empresa.estadoNotion,
      ciudad: empresa.ciudadPrincipal,
      nombreCampana: campana.nombre,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(
      and(
        inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
        sql`date(${pasoInscripcion.fechaProgramada}) <= date(${hoy})`,
        // Sesion 2026-07-10: sin estos dos filtros, los pasos manuales de una campana
        // CANCELADA (o de una inscripcion pausada porque el lead respondio) seguian
        // apareciendo en /cola para siempre -- 20 llamadas fantasma de una campana
        // finalizada sepultaban las reales. Mismo criterio que pasosManualesPendientes.
        eq(campana.estado, 'activa'),
        eq(inscripcion.estado, 'activa'),
        owner ? eq(empresa.owner, owner) : undefined,
      ),
    )
    .orderBy(pasoInscripcion.fechaProgramada)
    .all();

  return filas.map((f) => ({
    ...f,
    firmaApollo: f.firmaApollo === 1,
    variables: f.variables ? (JSON.parse(f.variables) as string[]) : [],
  }));
}

// Parte 4 campanas: "que dias ya se tocaron" de un destinatario -- pasos que YA
// salieron (estado 'enviada'), ordenados por orden. Es lo que la UI muestra como
// historial antes del paso pendiente de hoy (en que dia de la cadencia va el lead).
export function historialPasosDestinatario(idDestinatario: number) {
  return db
    .select({
      orden: pasoCadencia.orden,
      diaOffset: pasoCadencia.diaOffset,
      canal: pasoInscripcion.canal,
      fechaEnviada: pasoInscripcion.fechaEnviada,
    })
    .from(pasoInscripcion)
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(and(eq(pasoInscripcion.idDestinatario, idDestinatario), eq(pasoInscripcion.estado, 'enviada')))
    .orderBy(pasoCadencia.orden)
    .all();
}

// V5.5: poll de tracking + reply detection.
// owner/idOrganizacion (2026-07-28): los mismos dos campos con los que el camino de envio
// resuelve el proveedor de correo (idUsuarioDeOwner + decidirProveedorCorreo). Se agregan aca
// para que el poll pueda hacer la misma pregunta en vez de asumir Apollo.
export function campanasConSecuencia(): CampanaConSecuencia[] {
  return db
    .select({
      idCampana: campana.idCampana,
      proveedorCampanaId: campana.proveedorCampanaId,
      owner: campana.owner,
      idOrganizacion: campana.idOrganizacion,
    })
    .from(campana)
    .where(isNotNull(campana.proveedorCampanaId))
    .all()
    .map((c) => ({
      idCampana: c.idCampana,
      proveedorCampanaId: c.proveedorCampanaId as string,
      owner: c.owner ?? null,
      idOrganizacion: c.idOrganizacion,
    }));
}

// Los hilos de Gmail que ya salieron por esta campana: la unidad de lectura de Gmail
// (adapters/gmail.ts lee por hilo, no por campana). Un hilo por envio 'enviada'.
//
// COALESCE con proveedor_mensaje_id a proposito: proveedor_hilo_id nace con la migracion
// 0020 y los envios anteriores lo tienen NULL. Para un hilo que arranca la API de Gmail
// devuelve threadId == id del primer mensaje (el supuesto que destinatarioOriginalDe ya da
// por cierto desde el 2026-07-14, gmail.ts), y enviarPaso nunca contesta un hilo existente,
// asi que el proveedor_mensaje_id guardado ES el hilo para todo lo mandado hasta hoy. El
// fallback deja de tener efecto solo con los envios nuevos, que ya guardan el hilo real.
export function hilosGmailDeCampana(idCampana: number): string[] {
  return db
    .selectDistinct({ hilo: sql<string>`COALESCE(${pasoInscripcion.proveedorHiloId}, ${pasoInscripcion.proveedorMensajeId})` })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .where(
      and(
        eq(inscripcion.idCampana, idCampana),
        eq(pasoInscripcion.proveedor, 'gmail'),
        eq(pasoInscripcion.estado, 'enviada'),
        isNotNull(sql`COALESCE(${pasoInscripcion.proveedorHiloId}, ${pasoInscripcion.proveedorMensajeId})`),
      ),
    )
    .all()
    .map((f) => f.hilo)
    .filter((h): h is string => Boolean(h));
}

// Resuelve por (proveedorCampanaId, email): el envio 'enviada' MAS RECIENTE de ese
// destinatario en esa campana (el id de mensaje real de Apollo no se conoce en
// nuestro lado, ver core/ports/envio.ts -- el email es el unico correlator estable).
export function resolverDestinatarioPorEmail(proveedorCampanaId: string, email: string): DestinatarioResuelto | null {
  const fila = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idDestinatario: pasoInscripcion.idDestinatario,
      idInscripcion: destinatario.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(
      and(
        eq(campana.proveedorCampanaId, proveedorCampanaId),
        eq(contacto.email, email),
        eq(pasoInscripcion.estado, 'enviada'),
      ),
    )
    .orderBy(desc(pasoInscripcion.fechaEnviada))
    .limit(1)
    .get();
  return fila ?? null;
}

// Idempotente (search-first, mismo idioma que crearPasoInscripcionPendiente): el
// indice unico de proveedor_evento_id (V5.1) es el respaldo final ante una carrera.
// Visto de WhatsApp: cruza el key.id del acuse con paso_inscripcion.proveedor_mensaje_id
// (lo que guardo enviarPaso al mandar). Si no hay paso con ese id, es un mensaje que no
// mandamos nosotros por cadencia -- se ignora. Idempotente por proveedor_evento_id.
export function guardarVistoWhatsapp(proveedorMensajeId: string): 'insertado' | 'ignorado' | 'duplicado' {
  const paso = db
    .select({ id: pasoInscripcion.idPasoInscripcion })
    .from(pasoInscripcion)
    .where(eq(pasoInscripcion.proveedorMensajeId, proveedorMensajeId))
    .get();
  if (!paso) return 'ignorado';

  const eventoId = `visto:${proveedorMensajeId}`;
  const existente = db.select({ id: eventoTracking.idEvento }).from(eventoTracking).where(eq(eventoTracking.proveedorEventoId, eventoId)).get();
  if (existente) return 'duplicado';

  const ahora = new Date().toISOString();
  db.insert(eventoTracking).values({ idPasoInscripcion: paso.id, tipo: 'visto', canal: 'whatsapp', proveedorEventoId: eventoId, fechaEvento: ahora, createdAt: ahora }).run();
  return 'insertado';
}

export function guardarEventoTracking(idPasoInscripcion: number, evento: EventoProveedor): 'insertado' | 'duplicado' {
  const existente = db
    .select({ id: eventoTracking.idEvento })
    .from(eventoTracking)
    .where(eq(eventoTracking.proveedorEventoId, evento.proveedorEventoId))
    .get();
  if (existente) return 'duplicado';

  db.insert(eventoTracking)
    .values({
      idPasoInscripcion,
      tipo: evento.tipo,
      canal: evento.canal,
      proveedorEventoId: evento.proveedorEventoId,
      detalle: JSON.stringify(evento.detalle),
      fechaEvento: evento.fechaEvento,
      createdAt: new Date().toISOString(),
    })
    .run();
  return 'insertado';
}

// --- leer el tracking de correo (tool tracking_correo del MCP) -------------------------
//
// evento_tracking no se podia leer desde el MCP: TOOLS_LECTURA no lo exponia, y
// aperturas_whatsapp es otra cosa (mensajes de apertura de conversacion de WhatsApp, no
// eventos de open de correo). La unica forma de ver una apertura o un clic era entrar por SSH
// y correr node contra el volumen.
//
// Devuelve el evento crudo MAS su clasificacion y su grupo de dedup, nunca un porcentaje. La
// clasificacion (humano/maquina/desconocido, con razon y senal) sale de clasificarEvento
// (core/clasificar-evento-tracking.ts) y el agrupamiento de dedup de agruparDuplicados
// (core/dedup-eventos-tracking.ts): las dos son funciones puras, esta funcion solo arma su
// input desde la fila de DB y les pasa el trabajo. Ninguna fila de evento_tracking se toca,
// se filtra ni se borra por esto -- el crudo completo sigue viajando en `eventos`.
//
// Dos limitaciones que siguen vivas, medidas y sin arreglar aca:
//
//  1. La atribucion por paso esta corrida. resolverDestinatarioPorEmail acredita el evento al
//     paso_inscripcion 'enviada' MAS RECIENTE de esa campana y ese email, no al correo que de
//     verdad se abrio: con una cadencia de 5 pasos, una apertura del correo 1 se le acredita
//     al correo 3. Muerde desde el paso 2. Fuera de alcance de este cambio.
//  2. La deduplicacion agrupa dentro de lo que esta funcion devuelve. Si el llamador filtra por
//     `tipo`, un grupo que hubiera cruzado 'abierto' y 'clic' nunca se ve entero -- pero el
//     bucket de dedup ya es (id_paso_inscripcion, tipo), asi que filtrar por tipo no rompe un
//     grupo existente, solo puede ocultar otros tipos.
//
// Por eso `pasoOrden` viaja con la advertencia pegada y no como si fuera un hecho.
export type FiltroTrackingCorreo = {
  idEmpresa?: string;
  idCampana?: number;
  tipo?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
};

export type EventoTrackingCorreo = {
  idEvento: number;
  tipo: string;
  fechaEvento: string | null;
  createdAt: string | null;
  idEmpresa: string;
  empresa: string;
  idCampana: number;
  campana: string;
  idPasoInscripcion: number;
  pasoOrden: number | null;
  asunto: string | null;
  email: string | null;
  contacto: string | null;
  proveedorEventoId: string;
  // Fecha del evento 'enviado' de este mismo id_paso_inscripcion (paso_inscripcion.fecha_enviada),
  // la misma que ya se usaba internamente para R3 de clasificarEvento. Se expone porque
  // detectarClicEscaner (core/detectar-clic-escaner.ts) y acumularMatrizClientes
  // (core/matriz-clientes-correo.ts) tambien la necesitan y viven fuera de este archivo -- sin
  // esto, el llamador no tenia como calcular la latencia desde el envio para ninguno de los dos.
  fechaEnviada: string | null;
  // La huella cruda del request, cuando existe. Los eventos anteriores al 2026-07-28 no la
  // tienen: null significa "no se capturo", nunca "vino vacia".
  via: string | null;
  userAgent: string | null;
  ip: string | null;
  url: string | null;
  detalle: string | null;
  // Veredicto de clasificarEvento (core/clasificar-evento-tracking.ts), reconstruible: corre
  // sobre el crudo de arriba, nunca sobre un campo escrito aparte.
  clasificacion: Clasificacion;
  razon: Razon;
  senal: string;
  confianza: Confianza;
  excluirDeMetricas: boolean;
  // Grupo de dedup de agruparDuplicados (core/dedup-eventos-tracking.ts). grupoDedupId es el
  // idEvento del representante (el mas temprano del grupo); si el evento no tiene duplicados,
  // grupoDedupId es su propio idEvento.
  grupoDedupId: number;
  esRepresentanteGrupo: boolean;
};

export function trackingCorreo(filtro: FiltroTrackingCorreo, idOrganizacion: number): EventoTrackingCorreo[] {
  const condiciones = [eq(eventoTracking.canal, 'correo'), eq(campana.idOrganizacion, idOrganizacion)];
  if (filtro.idEmpresa) condiciones.push(eq(inscripcion.idEmpresa, filtro.idEmpresa));
  if (filtro.idCampana != null) condiciones.push(eq(inscripcion.idCampana, filtro.idCampana));
  if (filtro.tipo) condiciones.push(eq(eventoTracking.tipo, filtro.tipo));
  // Compara contra fecha_evento con fallback a created_at: fecha_evento es nullable y un
  // evento sin ella desapareceria del rango en silencio, que es justo el modo de falla que
  // esta tool existe para no repetir.
  const fecha = sql`coalesce(${eventoTracking.fechaEvento}, ${eventoTracking.createdAt})`;
  if (filtro.desde) condiciones.push(sql`${fecha} >= ${filtro.desde}`);
  if (filtro.hasta) condiciones.push(sql`${fecha} <= ${filtro.hasta}`);

  const filas = db
    .select({
      idEvento: eventoTracking.idEvento,
      tipo: eventoTracking.tipo,
      fechaEvento: eventoTracking.fechaEvento,
      createdAt: eventoTracking.createdAt,
      detalle: eventoTracking.detalle,
      proveedorEventoId: eventoTracking.proveedorEventoId,
      idPasoInscripcion: eventoTracking.idPasoInscripcion,
      // Fecha de envio del PROPIO paso_inscripcion: es el 'fecha_envio' que pide R3 de
      // clasificarEvento (piso fisico de latencia). No es un join contra un evento 'enviado'
      // en evento_tracking -- paso_inscripcion ya trae su propia fecha_enviada.
      fechaEnviada: pasoInscripcion.fechaEnviada,
      pasoOrden: pasoCadencia.orden,
      asunto: versionPaso.asunto,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      idCampana: inscripcion.idCampana,
      campanaNombre: campana.nombre,
      email: contacto.email,
      contacto: contacto.nombre,
    })
    .from(eventoTracking)
    .innerJoin(pasoInscripcion, eq(pasoInscripcion.idPasoInscripcion, eventoTracking.idPasoInscripcion))
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .leftJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .leftJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .where(and(...condiciones))
    .orderBy(desc(sql`coalesce(${eventoTracking.fechaEvento}, ${eventoTracking.createdAt})`), desc(eventoTracking.idEvento))
    .limit(filtro.limite ?? 200)
    .all();

  // Parseo de detalle y clasificacion primero: clasificarEvento es pura y solo necesita esta
  // fila. El dedup si necesita el conjunto completo (agrupa contra otras filas), asi que corre
  // aparte en un segundo paso sobre lo ya parseado.
  const parseadas = filas.map((f) => {
    // detalle es JSON libre escrito por tres productores distintos (pixel, click, Apollo). Un
    // detalle ilegible no puede tumbar la lectura entera: se devuelve crudo y los campos
    // extraidos quedan null.
    let d: Record<string, unknown> = {};
    try {
      const p: unknown = f.detalle ? JSON.parse(f.detalle) : {};
      if (p && typeof p === 'object') d = p as Record<string, unknown>;
    } catch {
      d = {};
    }
    const s = (k: string): string | null => (typeof d[k] === 'string' ? (d[k] as string) : null);
    // La clave real que escribe huella-request.ts es 'ua', literal (huella-request.ts:56). El
    // bug historico buscaba 'user_agent'/'userAgent', que el productor nunca escribio: el
    // detalle traia el dato y la lectura lo tiraba a la basura por el nombre de clave
    // equivocado. Un evento anterior al 2026-07-28 trae null porque no se capturo, nunca
    // porque vino vacio -- uaVacio() en clasificarEvento distingue exactamente eso (R6).
    const ua = s('ua');
    const ip = s('ip');

    const tipo = f.tipo as 'abierto' | 'clic' | 'visto';
    const veredicto = clasificarEvento({
      idEvento: f.idEvento,
      tipo,
      fechaEvento: f.fechaEvento ?? f.createdAt ?? '',
      detalle: f.detalle ? { via: s('via') ?? undefined, ua, ip, url: s('url') ?? undefined } : null,
      // fechaEnviada es NULL para un paso que nunca paso por el flujo normal de envio (dato
      // sembrado a mano, por ejemplo). Sin ella R3 no puede calcular latencia y no dispara --
      // eso es lo correcto, no un fallback silencioso.
      fechaEnvio: f.fechaEnviada,
      // No implementado en v1 (spec seccion 5): el chequeo contra el CSV vivo de Apple no
      // existe todavia, asi que R5 nunca dispara y esto siempre viaja null.
      ipEnRangoApplePrivateRelay: null,
    });

    return {
      f,
      s,
      ua,
      ip,
      tipo,
      veredicto,
    };
  });

  const dedupInput: EventoParaDedup[] = parseadas.map((p) => ({
    id_evento: p.f.idEvento,
    id_paso_inscripcion: p.f.idPasoInscripcion,
    tipo: p.tipo,
    fecha_evento: p.f.fechaEvento ?? p.f.createdAt ?? '',
    ip: p.ip,
  }));
  const gruposPorId = new Map(agruparDuplicados(dedupInput).map((g) => [g.id_evento, g]));

  return parseadas.map(({ f, s, ua, veredicto }) => {
    const grupo = gruposPorId.get(f.idEvento);
    return {
      idEvento: f.idEvento,
      tipo: f.tipo,
      fechaEvento: f.fechaEvento,
      createdAt: f.createdAt,
      idEmpresa: f.idEmpresa,
      empresa: f.empresa,
      idCampana: f.idCampana,
      campana: f.campanaNombre,
      idPasoInscripcion: f.idPasoInscripcion,
      pasoOrden: f.pasoOrden,
      asunto: f.asunto,
      email: f.email,
      contacto: f.contacto,
      proveedorEventoId: f.proveedorEventoId,
      fechaEnviada: f.fechaEnviada,
      via: s('via'),
      userAgent: ua,
      ip: s('ip'),
      url: s('url'),
      detalle: f.detalle,
      clasificacion: veredicto.clasificacion,
      razon: veredicto.razon,
      senal: veredicto.senal,
      confianza: veredicto.confianza,
      excluirDeMetricas: veredicto.excluir_de_metricas,
      // grupo siempre existe (agruparDuplicados devuelve una entrada por cada fila de
      // entrada); el fallback solo evita que TS se queje del tipo Map.get.
      grupoDedupId: grupo?.grupo_dedup_id ?? f.idEvento,
      esRepresentanteGrupo: grupo?.es_representante_grupo ?? true,
    };
  });
}

// pausada es un estado nuevo (no 'finalizada'): B6 pide que una reply o un
// agotamiento de destinatarios frene la cadencia de inmediato, con motivo visible;
// agendaEnSeco solo lee estado='activa', asi que pausada sale sola del calculo.
export function pausarInscripcion(idInscripcion: number, motivo: string, origen: OrigenFin) {
  const ahora = new Date().toISOString();
  db.update(inscripcion)
    .set({ estado: 'pausada', motivoFin: motivo, origenFin: origen, fechaFin: ahora, updatedAt: ahora })
    .where(eq(inscripcion.idInscripcion, idInscripcion))
    .run();
}

// Vuelta atras de una baja (spec 2026-07-17). NO decide QUIEN puede volver: eso es
// puedeVolverAInscribirse en core/reinscripcion.ts, y lo pregunta el caller antes de
// llamar aca. Este es el escritor, no el juez -- si mezclara las dos cosas, la regla de
// negocio quedaria enterrada en el acceso a datos y no habria como probarla sin DB.
//
// Limpia los tres campos de fin, no solo el estado: dejar un motivo_fin/origen_fin viejo
// en una inscripcion viva es dato que miente, y la proxima baja los sobreescribe igual.
//
// PENDIENTE PARA QUIEN CABLEE LA REVERSA (2026-08-03). Hoy esta funcion no tiene ningun caller
// fuera de sus pruebas, asi que esto todavia no muerde. Cuando lo tenga: si la baja vino de
// sacarDeCadencia, esa baja dejo pasos en estado 'cancelada', y el materializador corta al
// encontrar una fila ya existente para el paso debido (el `break` del `yaExiste` en
// materializarPasosDebidos). Reactivar sin devolver esos pasos a 'pendiente' deja la cadencia
// atascada justo donde se corto, en silencio. Devolverlos es la contraparte natural, pero no se
// escribe a ciegas desde aca: quien cablee la reversa decide si el paso vuelve o si se salta.
export function reactivarInscripcion(idInscripcion: number) {
  const ahora = new Date().toISOString();
  db.update(inscripcion)
    .set({ estado: 'activa', motivoFin: null, origenFin: null, fechaFin: null, updatedAt: ahora })
    .where(eq(inscripcion.idInscripcion, idInscripcion))
    .run();
}

// Baja manual de una empresa de una campaña viva (Sebastian saca a Felipe/Camilo antes
// de que les llegue el siguiente paso). Reusa el mismo corte que la respuesta automatica:
// pausada sale sola de agendaEnSeco (solo lee estado='activa'). El corte de la secuencia
// externa en Apollo lo hace la action (necesita async + el adaptador), no esta funcion.
// Aperturas y clics por inscripcion de una campana. Lee las filas 'abierto'/'clic' de
// evento_tracking que hoy se guardan (pixel propio en /api/track/open y /click) pero
// nadie leia -- metricasHub solo mira 'enviado' y 'respondio'. Una fila por inscripcion
// con al menos un evento de apertura/clic/visto, para pintar "Abrio"/"Vio WhatsApp" en
// Destinatarios. 'visto' (acuse de lectura de WhatsApp) se suma aca desde el dia uno
// aunque solo lo escriba guardarVistoWhatsapp -- un solo lugar que leer, no dos.
export function aperturasPorCampana(idCampana: number): { idInscripcion: number; abrio: boolean; hizoClic: boolean; vioWhatsapp: boolean }[] {
  const filas = db
    .select({
      idInscripcion: destinatario.idInscripcion,
      tipo: eventoTracking.tipo,
    })
    .from(eventoTracking)
    .innerJoin(pasoInscripcion, eq(pasoInscripcion.idPasoInscripcion, eventoTracking.idPasoInscripcion))
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .where(and(eq(inscripcion.idCampana, idCampana), inArray(eventoTracking.tipo, ['abierto', 'clic', 'visto'])))
    .all();

  const porInscripcion = new Map<number, { abrio: boolean; hizoClic: boolean; vioWhatsapp: boolean }>();
  for (const f of filas) {
    const prev = porInscripcion.get(f.idInscripcion) ?? { abrio: false, hizoClic: false, vioWhatsapp: false };
    if (f.tipo === 'abierto') prev.abrio = true;
    if (f.tipo === 'clic') prev.hizoClic = true;
    if (f.tipo === 'visto') prev.vioWhatsapp = true;
    porInscripcion.set(f.idInscripcion, prev);
  }
  return [...porInscripcion.entries()].map(([idInscripcion, v]) => ({ idInscripcion, ...v }));
}

export type ResumenTrackingEmpresa = {
  aperturas: number;
  clics: number;
  ultimaApertura: string | null; // ISO del evento 'abierto' mas reciente
  vioWhatsapp: boolean;
};

// Tracking agregado POR EMPRESA para el pill de /cola: conteo de aperturas/clics, la hora de
// la ultima apertura y si vio el WhatsApp. Gemela de aperturasPorCampana (mismos joins), pero
// filtrada por empresa y con CONTEO en vez de booleanos -- la cola es por empresa y necesita
// "3x . hace 2h", no un si/no. Una query para toda la cola + cruce en TS (mismo criterio que
// aperturasPorCampana/actividadDeCampana: a la escala de una cola son decenas de filas).
//
// idCampana (2026-08-03): acota el agregado a UNA campaña. Sin el, la pantalla de una campaña
// mostraria aperturas de otra campaña de la misma empresa y diria "abrio 9 veces" sobre un
// correo que no es el suyo. La cola sigue llamandola sin campaña, que es lo correcto ahi: lo
// que le importa es si la cuenta esta caliente, venga de donde venga.
export function resumenTrackingPorEmpresa(idsEmpresa: string[], idCampana?: number): Map<string, ResumenTrackingEmpresa> {
  const resultado = new Map<string, ResumenTrackingEmpresa>();
  if (idsEmpresa.length === 0) return resultado;

  const condiciones = [
    inArray(inscripcion.idEmpresa, idsEmpresa),
    inArray(eventoTracking.tipo, ['abierto', 'clic', 'visto']),
  ];
  if (idCampana != null) condiciones.push(eq(inscripcion.idCampana, idCampana));

  const filas = db
    .select({
      idEmpresa: inscripcion.idEmpresa,
      tipo: eventoTracking.tipo,
      fecha: eventoTracking.fechaEvento,
    })
    .from(eventoTracking)
    .innerJoin(pasoInscripcion, eq(pasoInscripcion.idPasoInscripcion, eventoTracking.idPasoInscripcion))
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .where(and(...condiciones))
    .all();

  for (const f of filas) {
    const prev = resultado.get(f.idEmpresa) ?? { aperturas: 0, clics: 0, ultimaApertura: null, vioWhatsapp: false };
    if (f.tipo === 'abierto') {
      prev.aperturas += 1;
      if (f.fecha && (prev.ultimaApertura === null || f.fecha > prev.ultimaApertura)) prev.ultimaApertura = f.fecha;
    } else if (f.tipo === 'clic') {
      prev.clics += 1;
    } else if (f.tipo === 'visto') {
      prev.vioWhatsapp = true;
    }
    resultado.set(f.idEmpresa, prev);
  }
  return resultado;
}

export type FilaActividad = {
  idPasoInscripcion: number;
  // El id y no solo el nombre: la pantalla cruza cada envio con el tracking agregado de su
  // cuenta (resumenTrackingPorEmpresa), y cruzar por nombre es como no cruzar.
  idEmpresa: string;
  empresa: string;
  contacto: string | null;
  email: string | null;
  orden: number;
  canal: string;
  estado: string;
  proveedor: string | null;
  fecha: string | null;
  abrio: boolean;
  hizoClic: boolean;
  vioWhatsapp: boolean;
  respondio: boolean;
  reboto: boolean;
};

// "Que se mando y que paso con cada cosa": una fila por ENVIO (paso_inscripcion), con sus
// señales cruzadas de evento_tracking. Es la pregunta que la app no sabia responder.
//
// El hueco nunca fue de captura: evento_tracking ya guardaba los 6 tipos
// (enviado/abierto/clic/respondio/rebota/visto) desde el pixel propio, el poll de
// Apollo/Gmail y el webhook de Evolution. Era de LECTURA -- metricasHub era la unica
// funcion que tocaba la tabla y solo miraba 'enviado' y 'respondio'; los otros 4 se
// escribian y se morian ahi.
//
// Incluye los pasos 'pendiente'/'fallo', no solo los enviados: "esto viene ahora" y "esto
// se cayo" son parte de la respuesta. Dos queries y el cruce en TS (mismo criterio que
// aperturasPorCampana): a la escala de una campaña son decenas de filas.
export function actividadDeCampana(idCampana: number): FilaActividad[] {
  const envios = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      contacto: contacto.nombre,
      email: contacto.email,
      orden: pasoCadencia.orden,
      canal: pasoInscripcion.canal,
      estado: pasoInscripcion.estado,
      proveedor: pasoInscripcion.proveedor,
      fechaEnviada: pasoInscripcion.fechaEnviada,
      fechaProgramada: pasoInscripcion.fechaProgramada,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(eq(inscripcion.idCampana, idCampana))
    .orderBy(pasoCadencia.orden, pasoInscripcion.idPasoInscripcion)
    .all();
  if (envios.length === 0) return [];

  const ids = envios.map((e) => e.idPasoInscripcion);
  const eventos = db
    .select({ idPasoInscripcion: eventoTracking.idPasoInscripcion, tipo: eventoTracking.tipo })
    .from(eventoTracking)
    .where(inArray(eventoTracking.idPasoInscripcion, ids))
    .all();

  const porPaso = new Map<number, Set<string>>();
  for (const ev of eventos) {
    if (!porPaso.has(ev.idPasoInscripcion)) porPaso.set(ev.idPasoInscripcion, new Set());
    porPaso.get(ev.idPasoInscripcion)!.add(ev.tipo);
  }

  return envios.map((e) => {
    const tipos = porPaso.get(e.idPasoInscripcion) ?? new Set<string>();
    return {
      idPasoInscripcion: e.idPasoInscripcion,
      idEmpresa: e.idEmpresa,
      empresa: e.empresa,
      contacto: e.contacto,
      email: e.email,
      orden: e.orden,
      canal: e.canal,
      estado: e.estado,
      proveedor: e.proveedor,
      fecha: e.fechaEnviada ?? e.fechaProgramada,
      abrio: tipos.has('abierto'),
      hizoClic: tipos.has('clic'),
      vioWhatsapp: tipos.has('visto'),
      respondio: tipos.has('respondio'),
      reboto: tipos.has('rebota'),
    };
  });
}

// desde: de que pantalla salio la baja. Solo cambia la PROSA de la bitacora (auditar de
// donde salen las bajas); el origen es 'manual' en los dos casos, que es lo que decide si
// admite reversa. Un enum chico y no un string libre para que la bitacora no se llene de
// variantes a mano.
export function sacarInscripcionDeCampana(idInscripcion: number, desde: 'destinatarios' | 'llamada' = 'destinatarios') {
  pausarInscripcion(idInscripcion, `baja manual desde ${desde === 'llamada' ? 'la llamada' : 'destinatarios'}`, 'manual');
}

// Datos para cortar la secuencia externa (Apollo) de una inscripcion puntual: el
// proveedorCampanaId (id de Apollo) y el email del destinatario. Gemelo puntual de
// inscripcionesActivasDeEmpresa, pero por inscripcion en vez de por empresa.
export function datosSecuenciaExterna(idInscripcion: number): { proveedorCampanaId: string | null; email: string | null } | null {
  const fila = db
    .select({ proveedorCampanaId: campana.proveedorCampanaId, email: contacto.email })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(destinatario, eq(destinatario.idInscripcion, inscripcion.idInscripcion))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .where(eq(inscripcion.idInscripcion, idInscripcion))
    .get();
  return fila ?? null;
}

export function marcarDestinatarioSalio(idDestinatario: number) {
  db.update(destinatario).set({ estado: 'salio' }).where(eq(destinatario.idDestinatario, idDestinatario)).run();
}

export function quedanDestinatariosActivos(idInscripcion: number): boolean {
  const fila = db
    .select({ c: sql<number>`count(*)` })
    .from(destinatario)
    .where(and(eq(destinatario.idInscripcion, idInscripcion), eq(destinatario.estado, 'activo')))
    .get();
  return (fila?.c ?? 0) > 0;
}

// ── Aviso de respuesta (V6.1): registro append-only + consulta para /cola y
// /seguimiento. Ver core/tracking.ts y core/llego-respuesta.ts para el unico
// punto de notificacion (se llama junto a pausarInscripcion, nunca solo).
export function registrarRespuestaDetectada(idInscripcion: number, idEmpresa: string, canal: string) {
  const ahora = new Date().toISOString();
  db.insert(notificacionRespuesta)
    .values({ idInscripcion, idEmpresa, canal, detectadaEn: ahora, createdAt: ahora })
    .run();
}

// Marca TODAS las filas sin ver de esa empresa a la vez (no solo la ultima) -- si
// respondio dos veces antes de que Sebastian abriera la ficha, abrir la ficha una
// vez basta para apagar el destaque.
export function marcarRespuestaVista(idEmpresa: string) {
  db.update(notificacionRespuesta)
    .set({ vistaEn: new Date().toISOString() })
    .where(and(eq(notificacionRespuesta.idEmpresa, idEmpresa), isNull(notificacionRespuesta.vistaEn)))
    .run();
}

export type FilaRespuestaPendiente = {
  idEmpresa: string;
  empresa: string;
  contacto: string | null;
  cargo: string | null;
  canal: string;
  fecha: string;
};

// Una fila por respuesta sin ver, org-wide, mas reciente primero; se dedupea a UNA
// fila por empresa en TS (nos quedamos con la primera = la mas reciente) -- mas
// simple que un correlated subquery en SQL para "el canal de la fila con MAX(fecha)".
export function empresasConRespuestaPendiente(idOrganizacion: number, owner?: string): FilaRespuestaPendiente[] {
  const filas = db
    .select({
      idEmpresa: notificacionRespuesta.idEmpresa,
      empresa: empresa.nombreOficial,
      contacto: contacto.nombre,
      cargo: contacto.cargo,
      canal: notificacionRespuesta.canal,
      fecha: notificacionRespuesta.detectadaEn,
    })
    .from(notificacionRespuesta)
    .innerJoin(empresa, eq(empresa.idEmpresa, notificacionRespuesta.idEmpresa))
    .leftJoin(contacto, and(eq(contacto.idEmpresa, notificacionRespuesta.idEmpresa), eq(contacto.esPrincipal, 1)))
    .where(and(isNull(notificacionRespuesta.vistaEn), eq(empresa.organizacionActivaId, idOrganizacion), owner ? eq(empresa.owner, owner) : undefined))
    .orderBy(desc(notificacionRespuesta.detectadaEn))
    .all();

  const vistas = new Set<string>();
  const unicas: FilaRespuestaPendiente[] = [];
  for (const f of filas) {
    if (vistas.has(f.idEmpresa)) continue;
    vistas.add(f.idEmpresa);
    unicas.push(f);
  }
  return unicas;
}

// ── WhatsApp entrante (tarea 6): primitivas que consume core/llego-respuesta.ts ──
// No hay match global por telefono en la DB (el unico match previo, en registrarToque,
// es exacto y scoped por empresa). Aca traemos TODOS los contactos con telefono + su
// organizacion activa; el core hace el match por ultimos-10-digitos (decision A) sobre
// esta lista. Es O(contactos) por mensaje entrante, aceptable para el volumen de
// respuestas (bajo); si un dia molesta, se prefiltra por sufijo en SQL o se agrega una
// columna telefono_normalizado indexada (decision C descartada por ahora).
export function candidatosContactoConTelefono(): (ContactoMatch & { telefono: string | null })[] {
  return db
    .select({
      idContacto: contacto.idContacto,
      idEmpresa: contacto.idEmpresa,
      idOrganizacion: empresa.organizacionActivaId,
      telefono: contacto.telefono,
    })
    .from(contacto)
    .innerJoin(empresa, eq(empresa.idEmpresa, contacto.idEmpresa))
    .where(isNotNull(contacto.telefono))
    .all();
}

// Idempotencia + auditoria del inbound. Search-first sobre mensaje_id (UNIQUE), mismo
// idioma que guardarEventoTracking: 'duplicado' si el webhook reintenta el mismo mensaje.
// idContacto es el match ya resuelto (null si el numero es desconocido, igual se guarda).
export function guardarMensajeEntrante(mensaje: MensajeEntrante, idContacto: number | null): 'insertado' | 'duplicado' {
  const existente = db
    .select({ id: mensajeWhatsapp.id })
    .from(mensajeWhatsapp)
    .where(eq(mensajeWhatsapp.mensajeId, mensaje.mensajeId))
    .get();
  if (existente) return 'duplicado';

  db.insert(mensajeWhatsapp)
    .values({
      mensajeId: mensaje.mensajeId,
      referenciaProveedor: mensaje.referenciaProveedor,
      // PRIVACIDAD (2026-07-26): sin contacto matcheado, el contenido NO se guarda. La linea
      // del operador es personal y de trabajo a la vez, y un numero que no es contacto de
      // ninguna cuenta es, por descarte, alguien de su vida privada. La fila SI se escribe,
      // con texto y telefono en null.
      //
      // Por que la fila y no un `return` temprano: esta insercion ES el mecanismo de
      // idempotencia del webhook. procesarRespuestaEntrante llama aca ANTES de cualquier otro
      // efecto y corta si vuelve 'duplicado' (mensaje_id es UNIQUE), asi que no escribir la
      // fila haria que cada reintento de Evolution reprocesara el mensaje desde cero. Se
      // conserva lo que hace falta para no repetir trabajo (mensaje_id, linea, fecha) y se
      // tira lo que identifica a la persona y lo que dijo.
      //
      // Queda contable "entraron N mensajes de numeros desconocidos" sin decir de quien ni
      // que decian, que es exactamente lo que se necesita saber de ellos.
      telefono: idContacto === null ? null : mensaje.telefono,
      texto: idContacto === null ? null : mensaje.texto,
      idContacto,
      fecha: mensaje.fecha,
      createdAt: new Date().toISOString(),
      // Explicito aunque el DEFAULT de la columna diga lo mismo: el default existe para las
      // filas viejas de la migracion, no para que un insert nuevo deje la direccion al azar.
      direccion: 'entrante',
    })
    .run();
  return 'insertado';
}

// Lo que SALE por la linea (2026-07-26). Misma tabla y mismo mensaje_id UNIQUE que el
// entrante: el webhook de Evolution reintenta, y ese UNIQUE es lo unico que impide que un
// reintento meta el mismo mensaje dos veces. Search-first + UNIQUE, igual que el entrante,
// que es lo que ya se probo contra reintentos reales.
//
// PRIVACIDAD (bloqueante, 2026-07-26): `idContacto` es OBLIGATORIO y no acepta null. La linea
// de WhatsApp del operador es personal y de trabajo a la vez, asi que guardar todo lo que sale
// meteria conversaciones privadas en una base comercial. El filtro es por DESTINATARIO: si el
// numero no corresponde a un contacto de una empresa de la base, el mensaje no llega hasta
// aca. Se expresa en el TIPO y no en un `if` del caller a proposito -- un caller que se olvide
// del filtro no compila, en vez de guardar la conversacion con la familia y que se note
// despues. Quien descarta no puede loguear el texto (ver el route del webhook).
//
// esApertura sale de una sola pregunta: ¿existe alguna fila previa de ESTE hilo? El hilo se
// mide por EMPRESA, no por contacto: escribirle al gerente despues de haberle escrito al
// tecnico de la misma cuenta no es abrir la conversacion, es seguirla por otra puerta.
export function guardarMensajeSaliente(mensaje: MensajeSaliente, idContacto: number): 'insertado' | 'duplicado' {
  const existente = db
    .select({ id: mensajeWhatsapp.id })
    .from(mensajeWhatsapp)
    .where(eq(mensajeWhatsapp.mensajeId, mensaje.mensajeId))
    .get();
  if (existente) return 'duplicado';

  db.insert(mensajeWhatsapp)
    .values({
      mensajeId: mensaje.mensajeId,
      referenciaProveedor: mensaje.referenciaProveedor,
      telefono: mensaje.telefono,
      texto: mensaje.texto,
      idContacto,
      fecha: mensaje.fecha,
      createdAt: new Date().toISOString(),
      direccion: 'saliente',
      esApertura: esPrimerMensajeDelHilo(idContacto) ? 1 : 0,
    })
    .run();
  return 'insertado';
}

// ¿La cuenta de este contacto no tiene NINGUN mensaje de WhatsApp guardado todavia, en
// ninguna direccion? Se resuelve con los contactos de la empresa y no con el contacto suelto
// por la razon de arriba. Empresa desconocida (contacto huerfano) devuelve false: no se
// declara apertura de una cuenta que no se pudo identificar.
function esPrimerMensajeDelHilo(idContacto: number): boolean {
  const suEmpresa = db
    .select({ idEmpresa: contacto.idEmpresa })
    .from(contacto)
    .where(eq(contacto.idContacto, idContacto))
    .get();
  if (!suEmpresa?.idEmpresa) return false;

  const previo = db
    .select({ id: mensajeWhatsapp.id })
    .from(mensajeWhatsapp)
    .innerJoin(contacto, eq(contacto.idContacto, mensajeWhatsapp.idContacto))
    .where(eq(contacto.idEmpresa, suEmpresa.idEmpresa))
    .get();
  return !previo;
}

// Los mensajes de apertura, juntos y en orden, que es la forma en que sirven: el patron sale
// de compararlos entre si, no de leer uno. Rango de fechas opcional para poder pedir "los
// siete del lunes" sin traer la historia entera.
export type AperturaWhatsapp = {
  idEmpresa: string | null;
  empresa: string | null;
  contacto: string | null;
  telefono: string | null;
  fecha: string | null;
  texto: string | null;
  // Si esa cuenta contesto DESPUES de la apertura, y cuando. Es la mitad que convierte la
  // lista en respuesta a "que copy mueve la conversacion": sin esto son siete textos sueltos.
  respondio: boolean;
  fechaRespuesta: string | null;
};

export function aperturasWhatsapp(opts: { desde?: string; hasta?: string } = {}): AperturaWhatsapp[] {
  const condiciones = [eq(mensajeWhatsapp.esApertura, 1)];
  // Comparacion por prefijo de 10 caracteres contra la fecha ISO: `desde`/`hasta` son dias
  // ('2026-07-27') y el rango es inclusivo en los dos extremos, que es como se pide un dia
  // en voz alta. Comparar el ISO completo contra un dia dejaria fuera todo lo del dia `hasta`.
  if (opts.desde) condiciones.push(sql`substr(${mensajeWhatsapp.fecha}, 1, 10) >= ${opts.desde}`);
  if (opts.hasta) condiciones.push(sql`substr(${mensajeWhatsapp.fecha}, 1, 10) <= ${opts.hasta}`);

  const filas = db
    .select({
      idEmpresa: contacto.idEmpresa,
      empresa: empresa.nombreOficial,
      contacto: contacto.nombre,
      telefono: mensajeWhatsapp.telefono,
      fecha: mensajeWhatsapp.fecha,
      texto: mensajeWhatsapp.texto,
    })
    .from(mensajeWhatsapp)
    .leftJoin(contacto, eq(contacto.idContacto, mensajeWhatsapp.idContacto))
    .leftJoin(empresa, eq(empresa.idEmpresa, contacto.idEmpresa))
    .where(and(...condiciones))
    .orderBy(mensajeWhatsapp.fecha)
    .all();

  return filas.map((f) => {
    // La primera entrante de esa cuenta posterior a la apertura. Se resuelve por consulta y
    // no por columna: es un hecho derivado que cambia solo cuando llega una respuesta nueva,
    // y una columna habria que mantenerla al dia desde el camino de entrada.
    const respuesta = f.idEmpresa
      ? db
          .select({ fecha: mensajeWhatsapp.fecha })
          .from(mensajeWhatsapp)
          .innerJoin(contacto, eq(contacto.idContacto, mensajeWhatsapp.idContacto))
          .where(
            and(
              eq(contacto.idEmpresa, f.idEmpresa),
              eq(mensajeWhatsapp.direccion, 'entrante'),
              f.fecha ? sql`${mensajeWhatsapp.fecha} > ${f.fecha}` : undefined,
            ),
          )
          .orderBy(mensajeWhatsapp.fecha)
          .get()
      : null;
    return { ...f, respondio: Boolean(respuesta), fechaRespuesta: respuesta?.fecha ?? null };
  });
}

// Paso "recibir" del dialogo de prueba (tarea 8): busca el mensaje entrante mas
// reciente de una linea DESPUES de que se abrio el dialogo (`desde`), para no mostrar
// un mensaje viejo como si fuera la prueba en curso. left join a contacto (nullable:
// un numero que escribe sin ser un contacto conocido igual cuenta como prueba valida).
export type MensajeRecibidoResumen = {
  telefono: string | null;
  texto: string | null;
  nombreContacto: string | null;
};

export function mensajeWhatsappMasRecienteDesde(referenciaProveedor: string, desde: string): MensajeRecibidoResumen | null {
  const fila = db
    .select({
      telefono: mensajeWhatsapp.telefono,
      texto: mensajeWhatsapp.texto,
      nombreContacto: contacto.nombre,
    })
    .from(mensajeWhatsapp)
    .leftJoin(contacto, eq(contacto.idContacto, mensajeWhatsapp.idContacto))
    .where(
      and(
        eq(mensajeWhatsapp.referenciaProveedor, referenciaProveedor),
        gt(mensajeWhatsapp.createdAt, desde),
        // Desde que el saliente tambien se guarda (2026-07-26) esta tabla dejo de ser solo
        // inbound. Sin este filtro, el boton "Ya me escribio, verificar" daria por buena la
        // prueba mostrando el mensaje que acabamos de mandar nosotros.
        eq(mensajeWhatsapp.direccion, 'entrante'),
      ),
    )
    .orderBy(desc(mensajeWhatsapp.createdAt))
    .get();
  return fila ?? null;
}

// Inscripciones activas de la empresa que hay que cortar cuando llega una respuesta.
// Una fila por destinatario activo (proveedorCampanaId + email nullable): el core pausa
// la inscripcion local y, si hay secuencia Apollo + email, la corta tambien alla.
export function inscripcionesActivasDeEmpresa(idEmpresa: string): InscripcionActiva[] {
  return db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      proveedorCampanaId: campana.proveedorCampanaId,
      email: contacto.email,
    })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(destinatario, eq(destinatario.idInscripcion, inscripcion.idInscripcion))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .where(
      and(
        eq(inscripcion.idEmpresa, idEmpresa),
        eq(inscripcion.estado, 'activa'),
        eq(destinatario.estado, 'activo'),
      ),
    )
    .all();
}

// Deja el toque entrante en el historial de la empresa (decision C: un reply es un hecho,
// se persiste directo). fuente 'whatsapp_entrante' lo distingue de un envio de cadencia
// ('cadencia_manual') o del cockpit ('cockpit'); canal 'whatsapp'; el texto va en quePaso.
export function registrarToqueEntrante(match: ContactoMatch, texto: string, fecha: string) {
  db.insert(toque)
    .values({
      idEmpresa: match.idEmpresa,
      idContacto: match.idContacto,
      fecha,
      canal: 'whatsapp',
      quePaso: texto,
      fuente: 'whatsapp_entrante',
      idOrganizacion: match.idOrganizacion,
      createdAt: new Date().toISOString(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// Fase 7 (V7.1): agregaciones de SOLO LECTURA para el panel de actividad.
// Ninguna escribe ni filtra por owner (el panel ve a todo el equipo). La regla
// de la ventana del promedio vive en app/core/actividad.ts, no aqui ni en la UI.
// `toque.fecha` puede ser ISO (app) o legado formato Notion ("June 25, 2026"); se
// compara solo substr(fecha,1,10), asi el legado no-ISO cae fuera de las ventanas.
//
// enRango excluye fuente='whatsapp_entrante' desde el filtro base (2026-07-27): las cinco
// funciones de este bloque cuentan actividad EJECUTADA (toques hechos, leads tocados,
// desglose por canal/resultado) y un reply del ISP no es eso. Antes de este fix, un solo
// hilo de una sola empresa mandando 42 mensajes en un dia inflaba contarToquesEnRango en 42,
// metia esa empresa en leadsTocadosEnRango aunque el operador no la hubiera tocado, y subia
// toquesPorCanal.whatsapp en 42 sin que nadie del equipo hiciera ese trabajo. El toque
// entrante no se pierde: sigue en la tabla y en el historial de la empresa, solo deja de
// sumar en este bloque.
const enRango = (desde: string, hasta: string): SQL =>
  sql`substr(${toque.fecha}, 1, 10) >= ${desde} AND substr(${toque.fecha}, 1, 10) <= ${hasta} AND (${toque.fuente} IS NULL OR ${toque.fuente} != 'whatsapp_entrante')`;

// Filtro opcional de owner (Tarea 14 del panel): el toque no tiene owner propio, el
// owner vive en empresa. El join a empresa SOLO se agrega cuando el caller filtra por
// owner (dos ramas de query, no un join incondicional) -- asi las llamadas existentes
// sin owner (panel de equipo completo) no dependen de que exista la tabla empresa.
export function contarToquesEnRango(desde: string, hasta: string, owner?: string): number {
  if (!owner) {
    const r = db.select({ n: sql<number>`count(*)` }).from(toque).where(enRango(desde, hasta)).get();
    return r?.n ?? 0;
  }
  const r = db.select({ n: sql<number>`count(*)` }).from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(and(enRango(desde, hasta), eq(empresa.owner, owner))).get();
  return r?.n ?? 0;
}

export function contarToquesEnDia(hoy: string): number {
  const ayer = restarUnDia(hoy);
  return contarToquesEnRango(ayer, ayer);
}

export function leadsTocadosEnRango(desde: string, hasta: string, owner?: string): number {
  if (!owner) {
    const r = db.select({ n: sql<number>`count(distinct ${toque.idEmpresa})` }).from(toque).where(enRango(desde, hasta)).get();
    return r?.n ?? 0;
  }
  const r = db.select({ n: sql<number>`count(distinct ${toque.idEmpresa})` }).from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(and(enRango(desde, hasta), eq(empresa.owner, owner))).get();
  return r?.n ?? 0;
}

export function toquesPorCanal(desde: string, hasta: string, owner?: string): Record<CanalToque, number> {
  const filas = !owner
    ? db.select({ canal: toque.canal, n: sql<number>`count(*)` }).from(toque).where(enRango(desde, hasta)).groupBy(toque.canal).all()
    : db.select({ canal: toque.canal, n: sql<number>`count(*)` }).from(toque)
        .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
        .where(and(enRango(desde, hasta), eq(empresa.owner, owner))).groupBy(toque.canal).all();
  const out = Object.fromEntries(CANALES_TOQUE.map((c) => [c, 0])) as Record<CanalToque, number>;
  for (const f of filas) if (f.canal && f.canal in out) out[f.canal as CanalToque] = f.n;
  return out;
}

export function toquesPorResultado(desde: string, hasta: string, owner?: string): Record<Resultado, number> {
  const filas = !owner
    ? db.select({ resultado: toque.resultado, n: sql<number>`count(*)` }).from(toque).where(enRango(desde, hasta)).groupBy(toque.resultado).all()
    : db.select({ resultado: toque.resultado, n: sql<number>`count(*)` }).from(toque)
        .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
        .where(and(enRango(desde, hasta), eq(empresa.owner, owner))).groupBy(toque.resultado).all();
  const out = Object.fromEntries(RESULTADOS.map((r) => [r, 0])) as Record<Resultado, number>;
  for (const f of filas) if (f.resultado && f.resultado in out) out[f.resultado as Resultado] = f.n;
  return out;
}

// Personas reales del equipo (owner de empresa trae basura historica del seed de
// Notion: "Manuel H." y combinaciones tipo "Felipe Castro, Thomas Schumacher" de cuando
// una cuenta paso de mano en mano sin limpiar el campo). El filtro del panel solo debe
// ofrecer gente real -- Sebastian confirmo la lista 2026-07-13.
const OWNERS_REALES = ['Camilo fonseca', 'Felipe Castro', 'Sebastian Acosta Molina', 'Thomas Schumacher'];

// Owners reales para el chip de filtro del panel (Tarea 14): distintos owner ya
// asignados en empresa, no la lista completa de organizacion_miembro (esa incluye
// miembros sin ninguna empresa asignada todavia).
export function ownersConToques(): string[] {
  const filas = db.select({ owner: empresa.owner }).from(empresa).where(isNotNull(empresa.owner)).groupBy(empresa.owner).all();
  return filas
    .map((f) => f.owner!)
    .filter((owner) => OWNERS_REALES.includes(owner))
    .sort();
}

// Sesion 2026-07-10: cancelarCampanaAction finaliza la campana pero no cascadea a las
// inscripciones que quedaron 'activa' debajo (huerfano real, encontrado en vivo con
// la prueba multicanal). Las 3 funciones de abajo confiaban solo en
// inscripcion.estado -- ahora exigen tambien que la campana siga 'activa', si no un
// huerfano de una campana cancelada infla estos conteos/reportes.
export function campanasActivas(): number {
  const r = db.select({ n: sql<number>`count(distinct ${inscripcion.idCampana})` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(inscripcion.estado, 'activa'), eq(campana.estado, 'activa')))
    .get();
  return r?.n ?? 0;
}

export function inscripcionesActivas(): number {
  const r = db.select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(inscripcion.estado, 'activa'), eq(campana.estado, 'activa')))
    .get();
  return r?.n ?? 0;
}

export function empresasPorCadencia(): { cadencia: string; empresas: number }[] {
  return db.select({ cadencia: cadencia.nombre, empresas: sql<number>`count(distinct ${inscripcion.idEmpresa})` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(cadencia, eq(cadencia.idCadencia, campana.idCadencia))
    .where(and(eq(inscripcion.estado, 'activa'), eq(campana.estado, 'activa')))
    .groupBy(cadencia.nombre)
    .all();
}

// ---------------------------------------------------------------------------
// Tarea 2 (rediseño UI de toque): getContextoToque compone en una sola llamada lo
// que el cockpit de /llamada/[id] necesita: cuenta (reusa getCuenta), contacto
// principal ya extraído, y la secuencia de la cadencia SOLO si la empresa tiene
// una inscripcion activa hoy -- si no la tiene, `secuencia` queda vacía y la UI
// cae al riel degradado (sin cadencia no hay pasos que mostrar, no es un error).

export type PasoSecuencia = {
  idPaso: number;
  orden: number;
  diaOffset: number;
  canal: string;
  objetivo: string | null;
  estado: 'hecho' | 'activo' | 'pendiente';
};

// Bucle PBX (Fase 5): lo que la ficha necesita para mostrar el carril + cerrar el
// toque. null cuando la empresa no esta en PBX (estaEnPBX resuelto sobre sus contactos).
export type PbxContexto = {
  forma: string | null;
  tieneNumeroConmutador: boolean;
  numeroConmutador: string | null;
  intentos: { llamadas: number; correos: number };
  sugerenciaEscalar: boolean;
};

export type ContextoToque = {
  emp: ReturnType<typeof getCuenta>['emp'];
  principal: { nombre: string | null; cargo: string | null; telefono: string | null; email: string | null } | null;
  toques: ReturnType<typeof getCuenta>['toques'];
  secuencia: PasoSecuencia[];
  objetivo: string | null; // objetivo del paso activo, o null si no hay secuencia
  // Tarea 12 (rediseño UI de toque): id del paso_inscripcion pendiente de HOY, si lo hay.
  // Los editores de correo/whatsapp lo necesitan para enviarToqueCanalAction (aprobar ese
  // paso puntual). null cuando no hay secuencia activa (toque suelto, sin cadencia).
  idPasoInscripcionActivo: number | null;
  pbx: PbxContexto | null;
  // Spec 2026-07-17: la inscripcion viva de esta empresa, para poder sacarla de la
  // cadencia sin irse a Destinatarios. null = llamada suelta (sin cadencia), que ya es el
  // caso que secuencia:[] representa -- se expone aparte porque el boton necesita el ID,
  // no la lista de pasos. Solo trae inscripciones 'activa' de campanas 'activa' (mismo
  // filtro de arriba): una pausada no se puede volver a sacar.
  idInscripcionActiva: number | null;
};

// Atajo documentado (plan Fase 3, "Riesgos/notas"): cuenta TODOS los toques
// llamada/correo de la empresa, no solo los del bucle PBX (no hay marca temporal
// limpia de "cuando entro a PBX"). Refinar si hace falta precision.
export function intentosPBX(idEmpresa: string, idOrganizacion: number): { llamadas: number; correos: number } {
  const filas = db
    .select({ canal: toque.canal, n: sql<number>`count(*)` })
    .from(toque)
    .where(and(eq(toque.idEmpresa, idEmpresa), eq(toque.idOrganizacion, idOrganizacion)))
    .groupBy(toque.canal)
    .all();
  const porCanal = new Map(filas.map((f) => [f.canal, f.n]));
  return { llamadas: porCanal.get('llamada') ?? 0, correos: porCanal.get('correo') ?? 0 };
}

export function getContextoToque(id: string, idOrganizacion: number): ContextoToque {
  const { emp, contactos, toques } = getCuenta(id, idOrganizacion);

  // Contacto principal: el marcado esPrincipal; si ninguno lo está (dato legado
  // sin migrar), el primero de la lista es mejor default que null -- la UI siempre
  // necesita A QUIEN se le habla, aunque el seed de Notion no haya marcado principal.
  const principalRaw = contactos.find((c) => c.esPrincipal === 1) ?? contactos[0] ?? null;
  const principal = principalRaw
    ? { nombre: principalRaw.nombre, cargo: principalRaw.cargo, telefono: principalRaw.telefono, email: principalRaw.email }
    : null;

  const contactosPBX: ContactoPBX[] = contactos.map((c) => ({
    esKeyDecisionMaker: c.esKeyDecisionMaker === 1,
    telefono: c.telefono,
    email: c.email,
  }));
  const contactoOficina = contactos.find((c) => c.esKeyDecisionMaker !== 1 && c.telefono);
  let pbx: PbxContexto | null = null;
  if (aplicaBuclePBX(emp?.estado ?? null, contactosPBX)) {
    const intentos = intentosPBX(id, idOrganizacion);
    pbx = {
      forma: emp?.pbxForma ?? null,
      tieneNumeroConmutador: Boolean(contactoOficina),
      numeroConmutador: contactoOficina?.telefono ?? null,
      intentos,
      sugerenciaEscalar: sugerirEscalar(intentos),
    };
  }

  const inscripcionActiva = db
    .select({ idInscripcion: inscripcion.idInscripcion, idCadencia: campana.idCadencia })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    // Sesion 2026-07-10: cancelarCampanaAction finaliza la campana pero no cascadea a
    // las inscripciones que quedaron 'activa' debajo (huerfano real, encontrado en
    // vivo). Sin el filtro de campana.estado, /llamada/[id] mostraria la secuencia de
    // una campana YA CANCELADA como si siguiera vigente.
    .where(and(eq(inscripcion.idEmpresa, id), eq(inscripcion.estado, 'activa'), eq(campana.estado, 'activa')))
    .get();

  if (!inscripcionActiva) {
    return { emp, principal, toques, secuencia: [], objetivo: null, idPasoInscripcionActivo: null, pbx, idInscripcionActiva: null };
  }

  const pasos = db
    .select({
      idPaso: pasoCadencia.idPaso,
      orden: pasoCadencia.orden,
      diaOffset: pasoCadencia.diaOffset,
      canal: pasoCadencia.canal,
      objetivo: pasoCadencia.objetivo,
    })
    .from(pasoCadencia)
    .where(eq(pasoCadencia.idCadencia, inscripcionActiva.idCadencia))
    .orderBy(pasoCadencia.orden)
    .all();

  // Estado real por paso: 'enviada' en paso_inscripcion (via destinatario de ESTA
  // inscripcion) es lo unico que cuenta como 'hecho'. Mismo join que
  // historialPasosDestinatario, pero a nivel inscripcion (puede haber mas de un
  // destinatario) en vez de un solo idDestinatario. idPasoInscripcion se trae aqui
  // tambien porque el paso 'activo' (Tarea 12) lo necesita para enviarToqueCanalAction.
  const enviados = db
    .select({
      idPaso: pasoInscripcion.idPaso,
      estado: pasoInscripcion.estado,
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .where(eq(destinatario.idInscripcion, inscripcionActiva.idInscripcion))
    .all();
  const estadoPorPaso = new Map(enviados.map((e) => [e.idPaso, e.estado]));
  const idPasoInscripcionPorPaso = new Map(enviados.map((e) => [e.idPaso, e.idPasoInscripcion]));

  // El primer paso que NO está 'enviada' (en orden) es el pendiente de hoy
  // ('activo'); los que vienen despues son 'pendiente' (todavia no les toca).
  let activoAsignado = false;
  let objetivoActivo: string | null = null;
  let idPasoInscripcionActivo: number | null = null;
  const secuencia: PasoSecuencia[] = pasos.map((p) => {
    let estado: PasoSecuencia['estado'];
    if (estadoPorPaso.get(p.idPaso) === 'enviada') {
      estado = 'hecho';
    } else if (!activoAsignado) {
      estado = 'activo';
      activoAsignado = true;
      objetivoActivo = p.objetivo;
      idPasoInscripcionActivo = idPasoInscripcionPorPaso.get(p.idPaso) ?? null;
    } else {
      estado = 'pendiente';
    }
    return { idPaso: p.idPaso, orden: p.orden, diaOffset: p.diaOffset, canal: p.canal, objetivo: p.objetivo, estado };
  });

  return { emp, principal, toques, secuencia, objetivo: objetivoActivo, idPasoInscripcionActivo, pbx, idInscripcionActiva: inscripcionActiva.idInscripcion };
}

// Tarea 9 (rediseño UI de toque): versiones A/B/C de un paso, para la barra lateral
// de EditorCorreo/EditorWhatsapp. La activa (esDefault=1) primero, luego el resto por
// nombre -- así la UI siempre muestra "la que se está usando" arriba.
export type VersionDePaso = {
  idVersion: number;
  nombre: string | null;
  asunto: string | null;
  cuerpo: string | null;
  esDefault: boolean;
  fecha: string | null;
};

export function versionesDePaso(idPaso: number): VersionDePaso[] {
  const filas = db
    .select({
      idVersion: versionPaso.idVersion,
      nombre: versionPaso.nombre,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      esDefault: versionPaso.esDefault,
      fecha: versionPaso.createdAt,
    })
    .from(versionPaso)
    .where(eq(versionPaso.idPaso, idPaso))
    .orderBy(desc(versionPaso.esDefault), versionPaso.nombre)
    .all();

  return filas.map((f) => ({ ...f, esDefault: f.esDefault === 1 }));
}

// Escribe una transicion de estado_notion YA decidida (update + fila en el historico),
// dentro de una transaccion que el caller ya tiene abierta. Unico lugar que toca las dos
// tablas juntas -- actualizarEstadoNotion (sync de Notion) y registrarToque (toque manual,
// Fase 5 plan-produccion-cro-campana.md) lo comparten en vez de duplicar el par
// update+insert cada uno por su lado.
function escribirTransicionEstado(
  tx: Tx,
  idEmpresa: string,
  estadoAnterior: string | null,
  estadoNuevo: string,
  idOrganizacion: number,
  fecha: string,
  // De donde sale la fila (2026-07-25). Sin origen se escribe NULL, que es lo que tienen las 63
  // filas anteriores a la columna: "no lo dijo". No se pone un default 'manual' porque un
  // backfill que se olvide de pasarlo quedaria contado como movimiento comercial real, que es
  // exactamente el ruido que la columna existe para sacar.
  origen?: OrigenTransicion,
): void {
  tx.update(empresa)
    .set({ estadoNotion: estadoNuevo, updatedAt: fecha })
    .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
    .run();

  tx.insert(empresaEstadoHistorial)
    .values({
      idEmpresa,
      estadoAnterior,
      estadoNuevo,
      fecha,
      origen: origen ?? null,
      idOrganizacion,
    })
    .run();
}

// Cambia la etapa comercial de una empresa y registra la transicion en el historico,
// en una sola transaccion (patron Outbox ligero). Si la etapa no cambia, no registra.
// Este es el UNICO camino de escritura de estado_notion: el sync de Notion debe llamarlo
// (no un UPDATE suelto), asi el historico nunca se pierde una transicion.
//
// encolarNotion (write-path del MCP, 2026-07-24): por defecto FALSE. El caller historico es
// el sync Notion -> DB (scripts/sync_estados_notion.ts), que NO debe rebotar el estado de
// vuelta a Notion (bounce-back Notion->DB->Notion). El MCP mover_estado pasa true para que el
// cambio DB -> Notion viaje por el outbox (su emision final esta gateada en el adaptador).
// Lo que quedo escrito al mover una etapa: la empresa releida y la transicion que se registro
// (null si la etapa ya era esa y no habia nada que mover, o si la empresa no es de esta
// organizacion). Devolver la transicion con su `origen` es lo que permite verificar despues que
// una fila del historico salio de un movimiento real y no de un cuadre.
export type MoverEstadoResultado = {
  empresa: EmpresaEscrita | null;
  transicion: { de: string | null; a: string; fecha: string; origen: OrigenTransicion | null } | null;
  // Por que no se movio, cuando no se movio. Sin esto, "ya estaba en esa etapa" y "esa empresa
  // no es tuya" devolvian lo mismo: nada.
  motivo?: 'sin_cambio' | 'empresa_no_encontrada';
};

export function actualizarEstadoNotion(
  idEmpresa: string,
  estadoNuevo: string,
  idOrganizacion: number,
  fecha: string,
  // origenTransicion (2026-07-25) queda en el historico y decide si esta fila cuenta como
  // movimiento comercial o como cuadre. Es distinto del `origen` de origen-cambio.ts, que
  // decide si el cambio VIAJA a Notion: uno habla del historico, el otro del outbox.
  opts: { encolarNotion?: boolean; origenTransicion?: OrigenTransicion } = {},
): MoverEstadoResultado {
  return db.transaction((tx) => {
    const emp = tx
      .select({ estadoNotion: empresa.estadoNotion })
      .from(empresa)
      .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
      .get();
    // No existe, o existe en otra organizacion. Las dos son "no la toco", y se dicen con el
    // mismo motivo a proposito: el caller no tiene por que enterarse de cuentas ajenas.
    if (!emp) return { empresa: null, transicion: null, motivo: 'empresa_no_encontrada' as const };
    // Ya estaba en esa etapa: no se escribe fila de historico redundante. Se devuelve la empresa
    // igual, releida, porque el estado que el caller queria ES el que hay.
    if (emp.estadoNotion === estadoNuevo) {
      return { empresa: leerEmpresaEscrita(tx, idEmpresa), transicion: null, motivo: 'sin_cambio' as const };
    }

    escribirTransicionEstado(tx, idEmpresa, emp.estadoNotion, estadoNuevo, idOrganizacion, fecha, opts.origenTransicion);

    if (opts.encolarNotion) {
      encolarOutboxNotion(tx, idEmpresa, { estado: estadoNuevo });
    }

    // Relectura de la fila de historico recien escrita: el `origen` que se devuelve sale de la
    // tabla, no del parametro que entro.
    const escrita = tx
      .select({
        de: empresaEstadoHistorial.estadoAnterior,
        a: empresaEstadoHistorial.estadoNuevo,
        fecha: empresaEstadoHistorial.fecha,
        origen: empresaEstadoHistorial.origen,
      })
      .from(empresaEstadoHistorial)
      .where(and(eq(empresaEstadoHistorial.idEmpresa, idEmpresa), eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion)))
      .orderBy(desc(empresaEstadoHistorial.id))
      .limit(1)
      .get();

    return {
      empresa: leerEmpresaEscrita(tx, idEmpresa),
      transicion: escrita
        ? { de: escrita.de, a: escrita.a, fecha: escrita.fecha, origen: escrita.origen as OrigenTransicion | null }
        : null,
    };
  });
}

// Conteo de empresas por etapa comercial (estado_notion), scoped a la organizacion.
// null -> '__sin_etapa__' (no se dropea, se reporta aparte). usuarios = suma de
// usuarios_efectivos de la empresa (proxy de tamano), null si ninguna lo tiene.
// Cardinalidad verificada contra isps.db real: empresa_usuarios.id_empresa es su PK
// (1898 filas, 1898 id_empresa distintos) -> relacion 1:1 con empresa, un LEFT JOIN
// simple no infla el count(*) de empresas.
export function embudoPipeline(
  idOrganizacion: number,
  filtros?: { owner?: string; idCampana?: string },
): ConteoEtapa[] {
  const estadoExpr = sql<string>`coalesce(${empresa.estadoNotion}, ${CLAVE_SIN_ETAPA})`;
  const condiciones = [eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA, EN_PIPELINE];
  if (filtros?.owner) {
    condiciones.push(eq(empresa.owner, filtros.owner));
  }
  if (filtros?.idCampana) {
    condiciones.push(
      sql`${empresa.idEmpresa} IN (SELECT ${inscripcion.idEmpresa} FROM ${inscripcion} WHERE ${inscripcion.idCampana} = ${Number(filtros.idCampana)})`,
    );
  }

  // Task 6: corte ISP vs ESP (Sebastian, 2026-07-15 -- "cuanta plata me esta entrando por
  // ESPs y cuanta por ISP"). categoriaBucket colapsa las 6 categorias de la vista a 2:
  // 'isp' es el producto ISP normal; todo lo demas (carrier/utility/telco_grande/
  // extranjero/no_isp/sae_plus) es 'esp' -- el segmento de Thomas. Los usuarios se suman
  // POR bucket, nunca en un total unico: asi ENEL (millones de suscriptores electricos)
  // no infla el numero de ISP (causa raiz 1 del plan).
  const categoriaBucketExpr = sql<string>`case when ${empresaCategoriaView.categoria} = 'isp' then 'isp' else 'esp' end`;

  const filas = db
    .select({
      estado: estadoExpr,
      categoriaBucket: categoriaBucketExpr,
      total: sql<number>`count(*)`,
      usuarios: sql<number | null>`sum(${empresaUsuarios.usuariosEfectivos})`,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .innerJoin(empresaCategoriaView, eq(empresaCategoriaView.idEmpresa, empresa.idEmpresa))
    .where(and(...condiciones))
    .groupBy(estadoExpr, categoriaBucketExpr)
    .all();

  const porEstado = new Map<string, ConteoEtapa>();
  for (const f of filas) {
    const total = Number(f.total);
    const usuarios = f.usuarios === null ? null : Number(f.usuarios);
    const bucket = f.categoriaBucket === 'isp' ? 'isp' : 'esp';

    let fila = porEstado.get(f.estado);
    if (!fila) {
      fila = { estado: f.estado, total: 0, usuarios: null, porCategoria: { isp: { total: 0, usuarios: null }, esp: { total: 0, usuarios: null } } };
      porEstado.set(f.estado, fila);
    }
    fila.total += total;
    fila.usuarios = fila.usuarios === null && usuarios === null ? null : (fila.usuarios ?? 0) + (usuarios ?? 0);
    fila.porCategoria![bucket] = { total, usuarios };
  }
  return [...porEstado.values()];
}

// Owners distintos con al menos una empresa en la organizacion (para el chip de
// filtro del embudo). Ordenado alfabetico, nulls excluidos (owner vacio no es un
// filtro valido).
export function listarOwnersEmpresa(idOrganizacion: number): string[] {
  const filas = db
    .selectDistinct({ owner: empresa.owner })
    .from(empresa)
    .where(and(eq(empresa.organizacionActivaId, idOrganizacion), isNotNull(empresa.owner)))
    .orderBy(asc(empresa.owner))
    .all();
  return filas.map((f) => f.owner!).filter((o) => o.length > 0);
}

export type EmpresaEnEtapa = {
  idEmpresa: string;
  nombre: string;
  ciudad: string | null;
  owner: string | null;
};

// Empresas de una etapa del embudo (para el panel lateral que se abre al clickear una
// banda/tarjeta de resultado). Mismos filtros que embudoPipeline, scoped a organizacion.
// CLAVE_SIN_ETAPA pide las empresas con estado_notion NULL (fuera de las bandas, no del
// embudo en si).
export function empresasDeEtapa(
  estado: string,
  idOrganizacion: number,
  filtros?: { owner?: string; idCampana?: string },
): EmpresaEnEtapa[] {
  const condiciones = [
    eq(empresa.organizacionActivaId, idOrganizacion),
    estado === CLAVE_SIN_ETAPA ? isNull(empresa.estadoNotion) : eq(empresa.estadoNotion, estado),
    EN_PIPELINE,
  ];
  if (filtros?.owner) {
    condiciones.push(eq(empresa.owner, filtros.owner));
  }
  if (filtros?.idCampana) {
    condiciones.push(
      sql`${empresa.idEmpresa} IN (SELECT ${inscripcion.idEmpresa} FROM ${inscripcion} WHERE ${inscripcion.idCampana} = ${Number(filtros.idCampana)})`,
    );
  }

  return db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      ciudad: empresa.ciudadPrincipal,
      owner: empresa.owner,
    })
    .from(empresa)
    .where(and(...condiciones))
    .orderBy(asc(empresa.nombreOficial))
    .all();
}

export type HistorialEtapas = {
  etapaActual: string | null;
  transiciones: { estado: string; fecha: string }[]; // orden ascendente por fecha
};

// Timeline de etapas de una cuenta: etapa actual (empresa.estado_notion) + las
// transiciones registradas en empresa_estado_historial. El pasado pre-deploy es
// desconocido a proposito (no se inventa): la lista empieza cuando el sync llama a
// actualizarEstadoNotion. Scoped a la organizacion.
export function historialEtapasEmpresa(idEmpresa: string, idOrganizacion: number): HistorialEtapas {
  const emp = db
    .select({ estadoNotion: empresa.estadoNotion })
    .from(empresa)
    .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
    .get();

  const filas = db
    .select({ estado: empresaEstadoHistorial.estadoNuevo, fecha: empresaEstadoHistorial.fecha })
    .from(empresaEstadoHistorial)
    .where(and(eq(empresaEstadoHistorial.idEmpresa, idEmpresa), eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion)))
    .orderBy(asc(empresaEstadoHistorial.fecha), asc(empresaEstadoHistorial.id))
    .all();

  return {
    etapaActual: emp?.estadoNotion ?? null,
    transiciones: filas,
  };
}

// --- Cockpit del CRO (Fase 4, plan-produccion-cro-campana.md) ----------------------
//
// Las 3 metricas de abajo (tiempo en etapa, ciclo de venta, velocity) leen la MISMA
// tabla (empresa_estado_historial) que historialEtapasEmpresa, pero agregadas sobre TODA
// la organizacion en vez de una sola cuenta. Comparten el fetch+agrupado (una fila por
// empresa, transiciones ordenadas) porque las tres son distintas cuentas sobre el mismo
// timeline -- separarlas en tres queries identicas solo duplicaria SQL sin necesidad; la
// tabla hoy no tiene volumen (nada la escribe en produccion todavia, ver comentario en
// actualizarEstadoNotion) asi que no hay caso de perf que justifique cachear entre
// llamadas.
function historialPorEmpresaOrg(idOrganizacion: number): Map<string, TransicionEtapa[]> {
  const filas = db
    .select({ idEmpresa: empresaEstadoHistorial.idEmpresa, estado: empresaEstadoHistorial.estadoNuevo, fecha: empresaEstadoHistorial.fecha })
    .from(empresaEstadoHistorial)
    .innerJoin(empresa, eq(empresa.idEmpresa, empresaEstadoHistorial.idEmpresa))
    .where(and(eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion), EMPRESA_VIVA))
    .orderBy(asc(empresaEstadoHistorial.idEmpresa), asc(empresaEstadoHistorial.fecha), asc(empresaEstadoHistorial.id))
    .all();

  const porEmpresa = new Map<string, TransicionEtapa[]>();
  for (const f of filas) {
    const arr = porEmpresa.get(f.idEmpresa) ?? [];
    arr.push({ estado: f.estado, fecha: f.fecha });
    porEmpresa.set(f.idEmpresa, arr);
  }
  return porEmpresa;
}

// Metrica 1 del plan: tiempo promedio en cada una de las 3 etapas que Fase 5 cablea
// (on_hold -> contacto_iniciado, reunion desde hold -> reunion_agendada) mas
// cierre_documentacion como la siguiente etapa natural hacia el cierre -- mismo trio que
// ya usan los fixtures de core/tiempoEnEtapa.test.ts. Promedio flat sobre TODAS las
// ventanas encontradas (si una empresa reingresa a la misma etapa dos veces, cuentan las
// dos ventanas por separado, igual que calcularDuracionPorEtapa las separa).
export const ETAPAS_TIEMPO_PANEL = ['contacto_iniciado', 'reunion_agendada', 'cierre_documentacion'] as const;

export function duracionPromedioPorEtapa(
  idOrganizacion: number,
  ahora: string,
  estados: readonly string[] = ETAPAS_TIEMPO_PANEL,
): Record<string, number> {
  const porEmpresa = historialPorEmpresaOrg(idOrganizacion);
  const sumas = new Map<string, { total: number; n: number }>();

  for (const transiciones of porEmpresa.values()) {
    const duraciones = calcularDuracionPorEtapa({ transiciones }, ahora);
    for (const d of duraciones) {
      if (!estados.includes(d.estado)) continue;
      const acc = sumas.get(d.estado) ?? { total: 0, n: 0 };
      acc.total += d.dias;
      acc.n += 1;
      sumas.set(d.estado, acc);
    }
  }

  const out: Record<string, number> = {};
  for (const estado of estados) {
    const acc = sumas.get(estado);
    if (acc && acc.n > 0) out[estado] = Math.round((acc.total / acc.n) * 10) / 10;
  }
  return out;
}

// Metrica 2 del plan: ciclo de venta completo, promedio SOLO de las empresas que ya
// cerraron (llegaron a firma_pago) -- un ciclo en curso no tiene punto final todavia, no
// se puede promediar con los cerrados sin sesgar el numero hacia abajo. null (no
// "sin_datos" fabricado) cuando todavia no cerro ninguna, para que el widget lo muestre
// como "sin datos" real en vez de un 0 que parece un ciclo instantaneo.
export function cicloVentaPromedio(idOrganizacion: number, ahora: string): number | null {
  const porEmpresa = historialPorEmpresaOrg(idOrganizacion);
  let total = 0;
  let n = 0;
  for (const transiciones of porEmpresa.values()) {
    const ciclo = calcularCicloVenta({ transiciones }, ahora);
    if (ciclo?.cerrado) {
      total += ciclo.dias;
      n += 1;
    }
  }
  return n > 0 ? Math.round((total / n) * 10) / 10 : null;
}

// Metrica 3 del plan: cuenta cruda de transiciones registradas en el rango, scoped a la
// organizacion. La division (transiciones / dias) es logica pura -> vive en
// core/velocity.ts (calcularVelocidadCambioEtapa), esta funcion solo hace el COUNT. Mismo
// patron substr(fecha,1,10) que enRango (arriba, toque.fecha): tolera que fecha traiga
// hora pegada o no.
export function transicionesEnRango(idOrganizacion: number, desde: string, hasta: string): number {
  const r = db
    .select({ n: sql<number>`count(*)` })
    .from(empresaEstadoHistorial)
    .innerJoin(empresa, eq(empresa.idEmpresa, empresaEstadoHistorial.idEmpresa))
    .where(
      and(
        eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion),
        EMPRESA_VIVA,
        sql`substr(${empresaEstadoHistorial.fecha}, 1, 10) >= ${desde} AND substr(${empresaEstadoHistorial.fecha}, 1, 10) <= ${hasta}`,
      ),
    )
    .get();
  return r?.n ?? 0;
}

// Metrica 4 del plan: total del MRR estimado de TODA la organizacion (suma de
// calcularMrrEstimado por empresa). 2026-07-22: tarifaTxnPlan/saasMensual ya NO salen de
// configuracion_admin (ese numero era global, y planes distintos tienen tarifas muy
// distintas -- Essential vs Utilities Enterprise difieren 100x). Cada deal trae su propio
// plan (empresa.idPlan -> tabla plan) y su propio pctDigital (empresa.pctDigital, default
// 40% via digitalPctConDefault si el discovery no lo capturo todavia).
//
// Deals SIN plan asignado no aportan al total: no hay tarifa razonable que inventarles
// (mismo criterio de "no inventar" que ya aplicaba antes de esta migracion). El total de
// hoy sera bajo mientras pocos deals tengan plan asignado -- se llena hacia adelante, como
// empresa_estado_historial.
export function mrrEstimadoTotal(idOrganizacion: number): number {
  const filas = db
    .select({
      usuariosEfectivos: empresaUsuarios.usuariosEfectivos,
      pctDigital: empresa.pctDigital,
      tarifaTxn: plan.tarifaTxn,
      saasMensual: plan.saasMensual,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(plan, eq(plan.id, empresa.idPlan))
    .where(and(eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA, EN_PIPELINE))
    .all();

  let total = 0;
  for (const f of filas) {
    if (f.tarifaTxn === null || f.saasMensual === null) continue; // sin plan asignado, no se inventa
    const usuarios = f.usuariosEfectivos ?? 0;
    total += calcularMrrEstimado({
      usuarios,
      digitalPct: digitalPctConDefault(f.pctDigital),
      tarifaTxnPlan: f.tarifaTxn,
      saasMensual: f.saasMensual,
    });
  }
  return Math.round(total);
}

// --- Widgets conectados 2026-07-22 (auditoria de data confirmada en prod) -----------
//
// Decision de Sebastian: de los 11 widgets del mockup con dataSource: null, 4 SI tienen
// fuente real (las de abajo) y se conectan; los otros 6 (show_rate, reschedule_rate,
// weighted_pipeline, ticket_promedio, matar_deal_post_reunion, probabilidad_cierre) se
// sacaron del catalogo (widgets.ts) -- no hay monto/deal size en la DB, ni señal de
// presento/reagendo/perdido, y probabilidad ya se descarto por subjetiva.

// Deals nuevos (throughput): una transicion cuyo origen es null (primera fila que
// escribe actualizarEstadoNotion para esa empresa) o 'lead' (contacto dormido, nunca
// trabajado) y cuyo destino YA es un stage real -- eso ES "entrar al pipeline". El NOT
// 'lead' del destino es mas una afirmacion explicita que una proteccion real: una
// transicion lead->lead no puede existir (actualizarEstadoNotion no escribe fila si
// estadoNuevo === estadoActual, ver arriba). Mismo join+scope que transicionesEnRango
// (EMPRESA_VIVA + organizacion); owner opcional porque este widget vive en el grupo
// throughput junto a toquesTotal/leadsTocados (esos SI filtran por owner) -- a diferencia
// de los widgets de velocity/economia (tiempo en etapa, ciclo de venta, MRR), que son
// vistas del CRO sobre TODA la organizacion y no toman owner.
export function dealsNuevosEnRango(idOrganizacion: number, desde: string, hasta: string, owner?: string): number {
  const condiciones = [
    eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion),
    EMPRESA_VIVA,
    sql`substr(${empresaEstadoHistorial.fecha}, 1, 10) >= ${desde} AND substr(${empresaEstadoHistorial.fecha}, 1, 10) <= ${hasta}`,
    sql`(${empresaEstadoHistorial.estadoAnterior} IS NULL OR ${empresaEstadoHistorial.estadoAnterior} = 'lead')`,
    ne(empresaEstadoHistorial.estadoNuevo, 'lead'),
  ];
  if (owner) condiciones.push(eq(empresa.owner, owner));
  const r = db
    .select({ n: sql<number>`count(*)` })
    .from(empresaEstadoHistorial)
    .innerJoin(empresa, eq(empresa.idEmpresa, empresaEstadoHistorial.idEmpresa))
    .where(and(...condiciones))
    .get();
  return r?.n ?? 0;
}

// Reuniones agendadas (throughput): CUANTAS reuniones se agendaron en el rango (un
// evento), no cuantas siguen agendadas hoy (un estado). Mismo patron de arriba.
export function reunionesAgendadasEnRango(idOrganizacion: number, desde: string, hasta: string, owner?: string): number {
  const condiciones = [
    eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion),
    EMPRESA_VIVA,
    sql`substr(${empresaEstadoHistorial.fecha}, 1, 10) >= ${desde} AND substr(${empresaEstadoHistorial.fecha}, 1, 10) <= ${hasta}`,
    eq(empresaEstadoHistorial.estadoNuevo, 'reunion_agendada'),
  ];
  if (owner) condiciones.push(eq(empresa.owner, owner));
  const r = db
    .select({ n: sql<number>`count(*)` })
    .from(empresaEstadoHistorial)
    .innerJoin(empresa, eq(empresa.idEmpresa, empresaEstadoHistorial.idEmpresa))
    .where(and(...condiciones))
    .get();
  return r?.n ?? 0;
}

// Segmentacion por persona (segmentacion): distribucion del comite de compra por
// contacto.cargo_categoria (dueno/gerente/financiero/tecnico/...). A diferencia de las
// dos funciones de arriba, NO filtra por [desde,hasta]: contacto no tiene columna de
// fecha (ni created_at) -- es un snapshot de "quienes son los contactos hoy", no un
// evento que ocurrio en una ventana, y filtrar por fecha inventaria una semantica que la
// tabla no tiene. Owner opcional (mismo criterio que toquesPorCanal/toquesPorResultado,
// sus vecinos en el grupo 'segmentacion'). Alcance EMPRESA_VIVA + EN_PIPELINE: el comite
// de compra de una empresa que ni siquiera esta en pipeline no es data del CRO (mismo
// alcance que mrrEstimadoTotal). null/'' cae en el bucket 'sin_categoria' -- se reporta,
// no se descarta (mismo principio que CLAVE_SIN_ETAPA en core/embudo.ts).
export function segmentacionPorPersona(idOrganizacion: number, owner?: string): Record<string, number> {
  const condiciones = [eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA, EN_PIPELINE];
  if (owner) condiciones.push(eq(empresa.owner, owner));
  const filas = db
    .select({ categoria: contacto.cargoCategoria, n: sql<number>`count(*)` })
    .from(contacto)
    .innerJoin(empresa, eq(empresa.idEmpresa, contacto.idEmpresa))
    .where(and(...condiciones))
    .groupBy(contacto.cargoCategoria)
    .all();

  const out: Record<string, number> = {};
  for (const f of filas) {
    const clave = f.categoria && f.categoria.trim() !== '' ? f.categoria : 'sin_categoria';
    out[clave] = (out[clave] ?? 0) + f.n;
  }
  return out;
}

// Toques antes de cerrar (velocity, widget BORDERLINE -- ver la decision larga en
// widgets.ts junto a DataSourceKey.toquesAntesDeCerrarPromedio): promedio de toques que
// tuvo una empresa ANTES de llegar a 'firma_pago' (la unica señal de "cerrado" que existe
// hoy; no hay señal de "perdido" -- este numero mide solo el lado de "gano"). Solo
// organizacion, sin owner ni rango de fechas: es la MISMA convencion que
// cicloVentaPromedio/duracionPromedioPorEtapa (arriba), vecinos de este widget en el
// grupo 'velocity' -- son vistas del CRO sobre TODO el historial, no un reporte por owner
// ni acotado a una ventana (cortar por [desde,hasta] descartaria toques que pasaron antes
// de la ventana y sesgaria el promedio hacia abajo sin ninguna razon de negocio).
//
// Dos queries, nunca N+1: la primera trae la fecha del PRIMER firma_pago por empresa (MIN,
// por si alguna vez reingresa); la segunda trae TODOS los toques de esas empresas de una
// sola vez (inArray) y se agrupan en memoria -- mismo principio de
// historialPorEmpresaOrg (arriba): la tabla no tiene volumen hoy, pero la forma de la
// query no se degrada si algun dia lo tiene.
export function toquesAntesDeCerrarPromedio(idOrganizacion: number): number | null {
  const cierres = db
    .select({
      idEmpresa: empresaEstadoHistorial.idEmpresa,
      fechaCierre: sql<string>`min(${empresaEstadoHistorial.fecha})`,
    })
    .from(empresaEstadoHistorial)
    .innerJoin(empresa, eq(empresa.idEmpresa, empresaEstadoHistorial.idEmpresa))
    .where(
      and(
        eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresaEstadoHistorial.estadoNuevo, 'firma_pago'),
      ),
    )
    .groupBy(empresaEstadoHistorial.idEmpresa)
    .all();

  if (cierres.length === 0) return null;

  const ids = cierres.map((c) => c.idEmpresa);
  const toques = db
    .select({ idEmpresa: toque.idEmpresa, fecha: toque.fecha, fuente: toque.fuente })
    .from(toque)
    .where(inArray(toque.idEmpresa, ids))
    .all();

  // fuente='whatsapp_entrante' fuera del promedio (2026-07-27): esto mide "cuantos toques
  // ejecuto el equipo antes de cerrar", no "cuantos mensajes mando el cliente". Caso real:
  // INTERCOMM DE NARIÑO SAS esta en firma_pago y ese mismo dia un solo hilo de WhatsApp le
  // metio 42 filas entrantes -- sin este filtro, un cliente conversador infla el numero que
  // el CRO lee en panel_metricas como si cerrarlo hubiera costado mas trabajo del real.
  const fechasPorEmpresa = new Map<string, string[]>();
  for (const t of toques) {
    if (!t.fecha || t.fuente === 'whatsapp_entrante') continue;
    const arr = fechasPorEmpresa.get(t.idEmpresa) ?? [];
    arr.push(t.fecha);
    fechasPorEmpresa.set(t.idEmpresa, arr);
  }

  let total = 0;
  for (const c of cierres) {
    total += contarToquesAntesDeFecha(fechasPorEmpresa.get(c.idEmpresa) ?? [], c.fechaCierre);
  }
  return Math.round((total / cierres.length) * 10) / 10;
}

// Conversion stage->stage (widget nuevo del cockpit del CRO, grupo velocity): trae, por
// cada empresa viva de la organizacion, su etapa actual (empresa.estado_notion) y la lista
// de estado_nuevo que aparecen en su historial (empresa_estado_historial) -- el calculo del
// high-water-mark y las razones de conversion es logica pura (calcularConversionStage en
// core/panel/conversionStage.ts), esta funcion solo trae los datos crudos.
//
// Dos queries, no N+1 (mismo principio que historialPorEmpresaOrg/toquesAntesDeCerrarPromedio
// arriba): la primera trae TODAS las empresas de la organizacion con su etapa actual (asi
// una empresa sin ninguna fila de historial -- ej. un lead crudo que nunca se toco -- igual
// entra al calculo con su etapa actual); la segunda trae TODO el historial de esa
// organizacion de una sola vez y se agrupa en memoria por idEmpresa.
//
// owner opcional (parametro, no wireado desde /panel hoy): duracionPromedioPorEtapa/
// cicloVentaPromedio/toquesAntesDeCerrarPromedio, los vecinos de este widget en el grupo
// 'velocity', son vistas del CRO sobre TODA la organizacion y no toman owner -- se mantiene
// esa misma convencion en el caller (page.tsx llama esta funcion sin owner). El parametro
// se deja opcional aca (no se descarta la firma) por si mas adelante se quiere un corte
// "conversion de MI cartera" -- construirlo ahora sin que nadie lo pida seria trabajo
// especulativo.
export function empresasParaConversionStage(idOrganizacion: number, owner?: string): EmpresaFunnelInput[] {
  const condicionesEmpresa = [eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA];
  if (owner) condicionesEmpresa.push(eq(empresa.owner, owner));

  const filasEmpresa = db
    .select({ idEmpresa: empresa.idEmpresa, estadoActual: empresa.estadoNotion })
    .from(empresa)
    .where(and(...condicionesEmpresa))
    .all();

  const condicionesHist = [eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion), EMPRESA_VIVA];
  if (owner) condicionesHist.push(eq(empresa.owner, owner));
  const filasHist = db
    .select({ idEmpresa: empresaEstadoHistorial.idEmpresa, estado: empresaEstadoHistorial.estadoNuevo })
    .from(empresaEstadoHistorial)
    .innerJoin(empresa, eq(empresa.idEmpresa, empresaEstadoHistorial.idEmpresa))
    .where(and(...condicionesHist))
    .all();

  const historialPorEmpresa = new Map<string, string[]>();
  for (const f of filasHist) {
    const arr = historialPorEmpresa.get(f.idEmpresa) ?? [];
    arr.push(f.estado);
    historialPorEmpresa.set(f.idEmpresa, arr);
  }

  return filasEmpresa.map((f) => ({
    idEmpresa: f.idEmpresa,
    estadoActual: f.estadoActual,
    estadosHistorial: historialPorEmpresa.get(f.idEmpresa) ?? [],
  }));
}

// Metrica 5 del plan: fila cruda por empresa para el endpoint REST de solo lectura --
// deal size (proxy: usuarios efectivos, la unica cifra de tamano de cuenta que existe
// hoy), estado (para derivar probabilidad de cierre en el caller via
// core/probabilidadCierre.ts) y usuariosEfectivos + tarifaTxn/saasMensual/pctDigital (para
// derivar revenue estimado via core/mrr.ts). El calculo de probabilidad/revenue NO vive
// aca a proposito: son formulas puras, van en core/, esta funcion solo trae los datos
// crudos (Repository).
//
// 2026-07-22: tarifaTxn/saasMensual salen del plan real del deal (empresa.idPlan), NO de
// configuracion_admin. null cuando el deal no tiene plan asignado todavia (el caller debe
// mostrar "sin datos", no inventar una tarifa).
//
// nombrePlan (2026-07-23): se agrega al SELECT que ya hacia join con
// `plan` para tarifaTxn/saasMensual -- no es una query nueva, es una columna mas del mismo
// join. La necesita deal_historia (app/mcp/tools.ts) para mostrar CON QUE plan quedo el
// deal, no solo sus tarifas. route.ts (el endpoint REST) no la usa hoy, pero tenerla en el
// tipo no le rompe nada (solo lee los campos que ya destructuraba).
export type FilaPipelineMrr = {
  idEmpresa: string;
  nombre: string;
  estado: string | null;
  usuariosEfectivos: number | null;
  pctDigital: number | null;
  tarifaTxn: number | null;
  saasMensual: number | null;
  // Plan asignado (nombre) -- entregable 2 del plan: el endpoint muestra CON que plan
  // se calculo el revenue, no solo el numero final. null junto con tarifaTxn/saasMensual
  // null es la misma senal de "sin plan asignado". Tambien lo usa deal_historia/pipeline
  // del MCP server (app/mcp/tools.ts) para mostrar el plan del deal.
  nombrePlan: string | null;
};

export function pipelineParaEndpoint(idOrganizacion: number): FilaPipelineMrr[] {
  return db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      usuariosEfectivos: empresaUsuarios.usuariosEfectivos,
      pctDigital: empresa.pctDigital,
      tarifaTxn: plan.tarifaTxn,
      saasMensual: plan.saasMensual,
      nombrePlan: plan.nombre,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .leftJoin(plan, eq(plan.id, empresa.idPlan))
    .where(and(eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA, EN_PIPELINE))
    .orderBy(asc(empresa.nombreOficial))
    .all();
}

// --- Snapshot diario de etapas, y las transiciones que se derivan de compararlos ---------
//
// El problema que resuelve (medido el 2026-07-25): del cierre de documentacion al pago el
// pipeline se mueve A MANO en Notion, asi que esa parte del embudo la escribia el barrido y
// toda transicion quedaba fechada el dia de la corrida. "Cuanto tarda del cierre al pago" no se
// podia responder, y no se iba a poder aunque se arreglara todo lo demas, porque el dato entraba
// mal desde el origen.
//
// La foto diaria lo resuelve sin depender de ningun proveedor: la cuenta que el lunes esta en
// cierre y el martes en firma_pago produce una transicion fechada el MARTES, con la etapa
// anterior tomada de la foto del lunes y no de lo que diga la fila viva.
//
// Limites, escritos y no disimulados: dos cambios el mismo dia colapsan en uno, y no se
// reconstruye nada del pasado -- empieza a producir dato el dia que corre por primera vez.

export type SnapshotResultado = {
  fecha: string;
  fechaAnterior: string | null;
  // Cuantas empresas entraron a la foto de hoy, y cuantas ya estaban (correr dos veces el mismo
  // dia no pisa la primera: la foto es del estado con el que ARRANCO el dia).
  filasEscritas: number;
  filasYaExistian: number;
  transiciones: { idEmpresa: string; nombre: string; de: string | null; a: string | null }[];
  salidasDelEmbudoNoEscritas: { idEmpresa: string; nombre: string; de: string | null; a: string | null }[];
  // Cambios vistos entre las dos fotos que NO se escribieron porque ya habia una fila de
  // historico para esa empresa y ese estado ese dia (la escribio un toque, una perdida o
  // mover_estado). Se reportan para que quede claro que no se perdieron, se evitaron.
  transicionesYaRegistradas: number;
};

// Toma la foto del dia y deriva las transiciones contra la foto anterior. Una sola operacion y
// una sola transaccion a proposito: son dos mitades de lo mismo, y tomar la foto sin derivar
// dejaria el dato crudo esperando a que alguien se acuerde.
export function snapshotEstados(fecha: string, idOrganizacion: number): SnapshotResultado {
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    // La foto cubre las empresas VIVAS de la organizacion (las satelites cuentan dentro de su
    // matriz, igual que en el embudo). Sin filtro EN_PIPELINE: una cuenta que todavia no esta en
    // el embudo puede entrar manana, y esa entrada es justo una transicion que interesa.
    const vivas = tx
      .select({ idEmpresa: empresa.idEmpresa, nombre: empresa.nombreOficial, estado: empresa.estadoNotion })
      .from(empresa)
      .where(and(eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA))
      .all();

    const yaEnLaFoto = new Set(
      tx
        .select({ idEmpresa: empresaEstadoSnapshot.idEmpresa })
        .from(empresaEstadoSnapshot)
        .where(
          and(
            eq(empresaEstadoSnapshot.fechaSnapshot, fecha),
            eq(empresaEstadoSnapshot.idOrganizacion, idOrganizacion),
          ),
        )
        .all()
        .map((f) => f.idEmpresa),
    );

    let filasEscritas = 0;
    for (const v of vivas) {
      if (yaEnLaFoto.has(v.idEmpresa)) continue;
      tx.insert(empresaEstadoSnapshot)
        .values({
          idEmpresa: v.idEmpresa,
          estado: v.estado,
          fechaSnapshot: fecha,
          idOrganizacion,
          createdAt: ahora,
        })
        .run();
      filasEscritas += 1;
    }

    // La foto anterior es la ULTIMA anterior a hoy, no "ayer": si el snapshot no corrio el
    // domingo, el del lunes se compara contra el del sabado. El error queda acotado y conocido
    // (el cambio pasó en algun dia de esa ventana, se fecha en el dia en que se vio) en vez de
    // perderse.
    const anterior = tx
      .select({ fecha: empresaEstadoSnapshot.fechaSnapshot })
      .from(empresaEstadoSnapshot)
      .where(
        and(
          eq(empresaEstadoSnapshot.idOrganizacion, idOrganizacion),
          sql`${empresaEstadoSnapshot.fechaSnapshot} < ${fecha}`,
        ),
      )
      .orderBy(desc(empresaEstadoSnapshot.fechaSnapshot))
      .limit(1)
      .get();

    if (!anterior) {
      // Primera corrida: hay foto y no hay contra que compararla. No se inventa una transicion
      // desde null para las 1.957 cuentas.
      return {
        fecha,
        fechaAnterior: null,
        filasEscritas,
        filasYaExistian: vivas.length - filasEscritas,
        transiciones: [],
        salidasDelEmbudoNoEscritas: [],
        transicionesYaRegistradas: 0,
      };
    }

    const previo = new Map(
      tx
        .select({ idEmpresa: empresaEstadoSnapshot.idEmpresa, estado: empresaEstadoSnapshot.estado })
        .from(empresaEstadoSnapshot)
        .where(
          and(
            eq(empresaEstadoSnapshot.fechaSnapshot, anterior.fecha),
            eq(empresaEstadoSnapshot.idOrganizacion, idOrganizacion),
          ),
        )
        .all()
        .map((f) => [f.idEmpresa, f.estado] as const),
    );

    const transiciones: SnapshotResultado['transiciones'] = [];
    let transicionesYaRegistradas = 0;

    for (const v of vivas) {
      // Una empresa que no estaba en la foto anterior es nueva: no hay cambio que derivar, su
      // etapa de hoy es su primera etapa conocida.
      if (!previo.has(v.idEmpresa)) continue;
      const estadoAnterior = previo.get(v.idEmpresa) ?? null;
      if (estadoAnterior === v.estado) continue;

      // Dedupe: si el movimiento ya lo escribio un toque, una perdida o mover_estado HOY, la
      // foto no lo duplica. Esa fila ya tiene mejor procedencia que la derivada.
      const yaHay = tx
        .select({ id: empresaEstadoHistorial.id })
        .from(empresaEstadoHistorial)
        .where(
          and(
            eq(empresaEstadoHistorial.idEmpresa, v.idEmpresa),
            eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion),
            sql`substr(${empresaEstadoHistorial.fecha}, 1, 10) = ${fecha}`,
            v.estado === null ? isNull(empresaEstadoHistorial.estadoNuevo) : eq(empresaEstadoHistorial.estadoNuevo, v.estado),
          ),
        )
        .get();
      if (yaHay) {
        transicionesYaRegistradas += 1;
        continue;
      }

      // estado_nuevo es NOT NULL en la tabla: una salida del embudo (a null) no se puede
      // escribir como transicion y se reporta sin escribir, en vez de inventarle un estado.
      if (v.estado === null) {
        transiciones.push({ idEmpresa: v.idEmpresa, nombre: v.nombre, de: estadoAnterior, a: null });
        continue;
      }

      tx.insert(empresaEstadoHistorial)
        .values({
          idEmpresa: v.idEmpresa,
          estadoAnterior,
          estadoNuevo: v.estado,
          // La fecha es el DIA de la foto en que se vio el cambio, no el timestamp de la
          // corrida: es lo unico que hace comparable "cuanto tardo del cierre al pago".
          fecha,
          origen: 'snapshot',
          idOrganizacion,
        })
        .run();
      transiciones.push({ idEmpresa: v.idEmpresa, nombre: v.nombre, de: estadoAnterior, a: v.estado });
    }

    // Relectura: lo que se devuelve como transiciones escritas sale de la TABLA, no del arreglo
    // que se fue armando arriba. Es la diferencia entre "creo que escribi 4 filas" y "hay 4
    // filas".
    const escritas = tx
      .select({
        idEmpresa: empresaEstadoHistorial.idEmpresa,
        de: empresaEstadoHistorial.estadoAnterior,
        a: empresaEstadoHistorial.estadoNuevo,
      })
      .from(empresaEstadoHistorial)
      .where(
        and(
          eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion),
          eq(empresaEstadoHistorial.fecha, fecha),
          eq(empresaEstadoHistorial.origen, 'snapshot'),
        ),
      )
      .all();
    const nombres = new Map(vivas.map((v) => [v.idEmpresa, v.nombre] as const));

    return {
      fecha,
      fechaAnterior: anterior.fecha,
      filasEscritas,
      filasYaExistian: vivas.length - filasEscritas,
      transiciones: escritas.map((e) => ({
        idEmpresa: e.idEmpresa,
        nombre: nombres.get(e.idEmpresa) ?? e.idEmpresa,
        de: e.de,
        a: e.a as string | null,
      })),
      // Las salidas del embudo (a null) se reportan aparte: se vieron y NO se escribieron,
      // porque estado_nuevo no admite null. Ocultarlas las haria ver como que no pasaron.
      salidasDelEmbudoNoEscritas: transiciones.filter((t) => t.a === null),
      transicionesYaRegistradas,
    };
  });
}

// --- Reconciliar contra Notion en lote ------------------------------------------------

export type ReconciliarNotionResultado = PlanReconciliacion & { aplicado: boolean };

// Recibe lo que dice Notion y alinea la base. Ejecuta el plan que arma el core
// (planReconciliacion): solo escribe el caso "misma pagina, distinto estado u owner", que es el
// unico que no implica decidir identidad. Todo lo demas sale reportado para que lo mire Sebastian.
//
// aplicar:false es dry-run y es el modo por defecto a proposito: se mira el plan antes de que
// escriba. El costo de equivocarse aca es escribir sobre el CRM de otra persona.
//
// El estado se escribe con encolarNotion:false SIEMPRE. Es la definicion misma de esta operacion:
// el dato vino de Notion, devolverlo es el bounce-back.
export function reconciliarNotion(
  paginas: PaginaNotion[],
  idOrganizacion: number,
  aplicar: boolean,
  fecha: string,
): ReconciliarNotionResultado {
  const plan = planReconciliacion(paginas, cuentasParaReconciliar(idOrganizacion));
  if (!aplicar) return { ...plan, aplicado: false };

  for (const a of plan.alinear) {
    if (a.estadoA !== null) {
      // origenTransicion 'reconciliacion': la etapa ya estaba en Notion y la base se puso al
      // dia. Su FECHA es la de esta corrida, o sea un limite superior y no el dia del cambio;
      // el dia real de ese tramo lo fecha el snapshot diario, no esto. Por eso 'reconciliacion'
      // esta fuera de ORIGENES_FECHA_CONFIABLE.
      actualizarEstadoNotion(a.idEmpresa, a.estadoA, idOrganizacion, fecha, {
        encolarNotion: false,
        origenTransicion: 'reconciliacion',
      });
    }
    if (a.ownerA !== null) {
      db.update(empresa)
        .set({ owner: a.ownerA })
        .where(and(eq(empresa.idEmpresa, a.idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
        .run();
    }
  }
  return { ...plan, aplicado: true };
}

// --- Que se movio en la herramienta desde una fecha -----------------------------------

export type CambioEmpresa = {
  idEmpresa: string;
  nombre: string;
  notionPageId: string | null;
  estado: string | null;
  owner: string | null;
  toquesNuevos: number;
  transiciones: { de: string | null; a: string; fecha: string }[];
};

// Lo que hay que subir a Notion: que empresas se movieron desde `desde` (YYYY-MM-DD). Existe para
// no tener que revisar el pipeline entero en la resincronizacion: la base ya sabe que se toco.
//
// Sobre las fechas: toque.fecha tiene formatos mezclados en las filas viejas importadas, asi que
// la comparacion por prefijo (substr 1..10) no las alcanza a todas. No importa para lo que esta
// funcion responde: los toques que hay que subir son los que NACIERON en la herramienta, y esos
// los escribe el codigo en ISO. Las filas viejas no se van a subir a Notion.
export function cambiosDesde(desde: string, idOrganizacion: number): CambioEmpresa[] {
  const toques = db
    .select({ idEmpresa: toque.idEmpresa, n: sql<number>`count(*)` })
    .from(toque)
    .where(and(eq(toque.idOrganizacion, idOrganizacion), sql`substr(${toque.fecha}, 1, 10) >= ${desde}`))
    .groupBy(toque.idEmpresa)
    .all();

  const transiciones = db
    .select({
      idEmpresa: empresaEstadoHistorial.idEmpresa,
      de: empresaEstadoHistorial.estadoAnterior,
      a: empresaEstadoHistorial.estadoNuevo,
      fecha: empresaEstadoHistorial.fecha,
    })
    .from(empresaEstadoHistorial)
    .where(
      and(
        eq(empresaEstadoHistorial.idOrganizacion, idOrganizacion),
        sql`substr(${empresaEstadoHistorial.fecha}, 1, 10) >= ${desde}`,
      ),
    )
    .all();

  const ids = new Set<string>([...toques.map((t) => t.idEmpresa), ...transiciones.map((t) => t.idEmpresa)]);
  if (ids.size === 0) return [];

  const filas = db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      notionPageId: empresa.notionPageId,
      estado: empresa.estadoNotion,
      owner: empresa.owner,
    })
    .from(empresa)
    .where(and(eq(empresa.organizacionActivaId, idOrganizacion), inArray(empresa.idEmpresa, [...ids])))
    .all();

  const porToques = new Map(toques.map((t) => [t.idEmpresa, Number(t.n)]));
  return filas
    .map((f) => ({
      ...f,
      toquesNuevos: porToques.get(f.idEmpresa) ?? 0,
      transiciones: transiciones
        .filter((t) => t.idEmpresa === f.idEmpresa)
        .map((t) => ({ de: t.de, a: t.a, fecha: t.fecha })),
    }))
    .sort((a, b) => b.toquesNuevos - a.toquesNuevos);
}

// --- Actividad de un periodo: lo que se hizo y lo que se corrio -----------------------

export type ToqueActividad = {
  idToque: number;
  fecha: string | null;
  // El dia canonico. Es el que hay que mirar para contar; `fecha` puede traer hora o, en las
  // filas viejas importadas, cualquier cosa.
  fechaDia: string | null;
  fechaTexto: string | null;
  canal: string | null;
  tipoToque: string | null;
  resultado: string | null;
  duracionSegundos: number | null;
  idEmpresa: string;
  empresa: string;
  estado: string | null;
  owner: string | null;
  ejecutadoPor: string | null;
  proximoPaso: string | null;
  razonPerdida: string | null;
  razonPerdidaNota: string | null;
  objecion: string | null;
  objecionNota: string | null;
  accionCliente: string | null;
  reunionFechaPropuesta: string | null;
  reunionFechaOcurrida: string | null;
  transcriptProveedor: string | null;
  transcriptUrl: string | null;
  // 2026-07-27: distingue un toque EJECUTADO de un mensaje entrante del ISP
  // (fuente='whatsapp_entrante', ver registrarToqueEntrante). actividadTool (mcp/tools.ts)
  // usa este campo para separar los dos en la respuesta; se expone aca porque `toques` sigue
  // trayendo TODAS las filas del rango (no se ocultan, es historial real).
  fuente: string;
};

// Los toques de un rango de fechas, cruzados con su empresa. No existia forma de preguntar
// "que se hizo entre estos dos dias": cambiosDesde agrega por empresa y no dice quien ni
// cuando, y la ficha de la cuenta solo muestra los ultimos 20 de UNA empresa.
//
// Sin LIMIT a proposito: un tope silencioso convierte "esta semana se hicieron 40 toques" en
// una respuesta falsa, y el volumen real (274 toques en toda la historia de la base) no lo
// justifica.
//
// El rango compara por prefijo de 10 caracteres, igual que cambiosDesde: toque.fecha tiene
// formatos mezclados en las filas viejas importadas de Notion, y las que nacen en la
// herramienta se escriben en ISO. Las viejas con formato humano no entran al rango, y eso es
// correcto para esta pregunta (es actividad de la herramienta, no historia importada).
//
// proximoPaso sale de empresa, no de toque: toque.proximo_paso existe en la tabla pero
// ningun camino de escritura lo llena (ver registrarToque), asi que devolverlo seria una
// columna siempre nula. Lo que responde "que sigue en esta cuenta" es empresa.proximo_paso.
// --- origen del lead (2026-08-05) ------------------------------------------------------
//
// De donde salio la cuenta. Es el corte que responde lo que el operador pregunta: cuantas llamadas
// cuesta una reunion si la cuenta vino de un inbound contra si se prospecto en frio. El agregado
// esconde que no cuestan lo mismo, y con un solo numero no se puede decidir donde poner el tiempo.

export type ClasificacionOrigenLead = {
  origen: FuenteLead | null;
  // false cuando NADIE lo registro. Es distinto de "no vino de ningun lado", que no existe: toda
  // cuenta salio de alguna parte, lo que falta es que alguien lo escriba.
  registrado: boolean;
  evidencia: Evidencia;
};

type FilaOrigenLead = {
  fuenteLead: string | null;
  fuenteLeadProcedencia: string | null;
  fuenteLeadFecha: string | null;
  fuenteLeadQuien: string | null;
};

function leerFilaOrigen(lector: typeof db | Tx, idEmpresa: string, idOrganizacion: number): FilaOrigenLead | undefined {
  return lector
    .select({
      fuenteLead: empresa.fuenteLead,
      fuenteLeadProcedencia: empresa.fuenteLeadProcedencia,
      fuenteLeadFecha: empresa.fuenteLeadFecha,
      fuenteLeadQuien: empresa.fuenteLeadQuien,
    })
    .from(empresa)
    .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
    .get();
}

export function clasificarOrigenDeFila(fila: FilaOrigenLead | undefined): ClasificacionOrigenLead {
  // Sin fila y sin valor son el mismo estado hacia afuera: nadie lo registro. Y ese estado NUNCA se
  // traduce a outbound, por mas que casi toda la prospeccion sea fria.
  if (!fila?.fuenteLead) {
    return { origen: null, registrado: false, evidencia: { campo: 'fuente_lead', valor: null, fuente: null, fecha: null, quien: null } };
  }
  return {
    origen: fila.fuenteLead as FuenteLead,
    registrado: true,
    evidencia: {
      campo: 'fuente_lead',
      valor: fila.fuenteLead,
      fuente: fila.fuenteLeadProcedencia,
      fecha: fila.fuenteLeadFecha,
      quien: fila.fuenteLeadQuien,
    },
  };
}

export function origenDeLead(idEmpresa: string, idOrganizacion: number): ClasificacionOrigenLead {
  return clasificarOrigenDeFila(leerFilaOrigen(db, idEmpresa, idOrganizacion));
}

// Sobre cuantas cuentas descansa cualquier comparacion por origen. Sin este numero al lado,
// "inbound cierra mejor que outbound" calculado sobre el 3% del pipeline se lee como si fuera del
// 100%. Al desplegar esto va a dar 0 con origen y 1.956 sin, que es la verdad.
export function coberturaOrigenLead(idOrganizacion: number): { conOrigen: number; sinOrigen: number; fraccion: number } {
  const fila = db
    .select({
      total: sql<number>`count(*)`,
      con: sql<number>`sum(case when ${empresa.fuenteLead} is not null then 1 else 0 end)`,
    })
    .from(empresa)
    .where(eq(empresa.organizacionActivaId, idOrganizacion))
    .get();
  const total = fila?.total ?? 0;
  const con = fila?.con ?? 0;
  return { conOrigen: con, sinOrigen: total - con, fraccion: total === 0 ? 0 : con / total };
}

// origen NULLABLE a proposito: es como se BORRA un origen puesto por costumbre. Sin eso, un valor
// mal puesto queda para siempre indistinguible de uno verificado y ensucia la comparacion.
const marcarFuenteLeadSchema = z.object({
  idEmpresa: z.string().min(1),
  origen: z.enum(FUENTES_LEAD).nullable(),
  procedencia: z.string().min(1),
  quien: z.string().min(1),
  fecha: fechaDiaSchema.optional(),
  nota: z.string().min(1).optional(),
});
export type MarcarFuenteLeadInput = z.input<typeof marcarFuenteLeadSchema>;
export type MarcarFuenteLeadResultado = { idEmpresa: string; clasificacion: ClasificacionOrigenLead };

export function marcarFuenteLead(input: MarcarFuenteLeadInput, idOrganizacion: number): MarcarFuenteLeadResultado {
  const parsed = marcarFuenteLeadSchema.parse(input);
  const instante = new Date();
  const fecha = parsed.fecha ?? fechaBogotaISO(instante);

  return db.transaction((tx) => {
    const antes = leerFilaOrigen(tx, parsed.idEmpresa, idOrganizacion);
    if (!antes) throw new Error(`Empresa ${parsed.idEmpresa} no existe o no esta activa en la organizacion ${idOrganizacion}`);

    // Borrar el origen limpia tambien su procedencia: dejar el quien y la fecha de un dato que ya no
    // esta seria evidencia colgando de nada. Lo que queda del borrado es la fila de sync_cambios.
    tx.update(empresa)
      .set({
        fuenteLead: parsed.origen,
        fuenteLeadProcedencia: parsed.origen ? parsed.procedencia : null,
        fuenteLeadFecha: parsed.origen ? fecha : null,
        fuenteLeadQuien: parsed.origen ? parsed.quien : null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .run();

    tx.insert(syncCambios)
      .values({
        fecha: instante.toISOString(),
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'empresa',
        idRegistro: parsed.idEmpresa,
        accion: 'update',
        detalle:
          `origen del lead: ${antes.fuenteLead ?? 'sin registrar'} -> ${parsed.origen ?? 'borrado'} | ` +
          `procedencia ${parsed.procedencia} | lo dijo ${parsed.quien}${parsed.nota ? ` | ${parsed.nota}` : ''}`,
      })
      .run();

    return { idEmpresa: parsed.idEmpresa, clasificacion: clasificarOrigenDeFila(leerFilaOrigen(tx, parsed.idEmpresa, idOrganizacion)) };
  });
}

// --- actividad por canal (panel del CRO, 2026-08-05) -----------------------------------
//
// Las filas que alimentan connect rate, texto contra llamada, la deduplicacion de texto y las
// llamadas a cuentas nuevas. La regla vive en app/core/actividad-canal.ts, pura; aca solo se lee.
//
// `esPrimerToqueDeLaCuenta` se decide contra TODA la historia de la cuenta y no contra el rango que
// se esta mirando. Calcularlo dentro del rango haria que el conteo de llamadas a cuentas nuevas
// subiera solo por mover la fecha de inicio del reporte, que es la forma mas facil de mentirse a uno
// mismo con una metrica de prospeccion.
//
// Los entrantes de WhatsApp SI viajan: el nucleo los necesita para saber que una conversacion sigue
// viva. Lo que nunca hacen es contar como actividad ni abrir una cuenta.
export type ToqueActividadCanal = {
  idEmpresa: string;
  canal: string | null;
  resultado: string | null;
  fuente: string;
  fechaDia: string | null;
  fecha: string | null;
  esPrimerToqueDeLaCuenta: boolean;
  // El origen de la CUENTA, repetido en cada toque suyo. Se trae en el mismo join para no pagar
  // una query mas: la conversion por origen necesita saber de donde salio la cuenta de cada toque.
  origenLead: string | null;
  reunionFechaPropuesta: string | null;
};

export function toquesParaActividadCanal(
  desde: string,
  hasta: string,
  idOrganizacion: number,
  filtros: { owner?: string } = {},
): ToqueActividadCanal[] {
  const diaToque = sql`coalesce(${toque.fechaDia}, substr(${toque.fecha}, 1, 10))`;
  const condiciones = [eq(toque.idOrganizacion, idOrganizacion), sql`${diaToque} >= ${desde}`, sql`${diaToque} <= ${hasta}`];
  if (filtros.owner) condiciones.push(eq(empresa.owner, filtros.owner));

  const filas = db
    .select({
      idToque: toque.idToque,
      idEmpresa: toque.idEmpresa,
      canal: toque.canal,
      resultado: toque.resultado,
      fuente: toque.fuente,
      fechaDia: sql<string | null>`${diaToque}`,
      fecha: toque.fecha,
      origenLead: empresa.fuenteLead,
      reunionFechaPropuesta: toque.reunionFechaPropuesta,
    })
    .from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(and(...condiciones))
    .orderBy(asc(sql`${diaToque}`), asc(toque.idToque))
    .all();

  const ids = [...new Set(filas.map((f) => f.idEmpresa))];
  if (ids.length === 0) return [];

  // El primer toque NUESTRO de cada cuenta, en toda su historia. Los entrantes se excluyen del
  // minimo: un mensaje que nos llego no abre la cuenta, y contarlo dejaria marcada como trabajada
  // una cuenta que nos escribio sola, con lo que la primera llamada real dejaria de ser la primera.
  const primeros = new Map<string, string>();
  for (const p of db
    .select({ idEmpresa: toque.idEmpresa, primerDia: sql<string | null>`min(${diaToque})` })
    .from(toque)
    .where(and(inArray(toque.idEmpresa, ids), eq(toque.idOrganizacion, idOrganizacion), ne(toque.fuente, 'whatsapp_entrante')))
    .groupBy(toque.idEmpresa)
    .all()) {
    if (p.primerDia) primeros.set(p.idEmpresa, p.primerDia);
  }

  // Empate en el dia: gana el id mas bajo, que es el que se escribio primero. Sin desempate, dos
  // llamadas del mismo dia a una cuenta nueva contarian las dos como primera.
  const yaMarcada = new Set<string>();
  return filas.map((f) => {
    const esPrimero =
      f.fuente !== 'whatsapp_entrante' && f.fechaDia != null && f.fechaDia === primeros.get(f.idEmpresa) && !yaMarcada.has(f.idEmpresa);
    if (esPrimero) yaMarcada.add(f.idEmpresa);
    return {
      idEmpresa: f.idEmpresa,
      canal: f.canal,
      resultado: f.resultado,
      fuente: f.fuente,
      fechaDia: f.fechaDia,
      fecha: f.fecha,
      esPrimerToqueDeLaCuenta: esPrimero,
      origenLead: f.origenLead,
      reunionFechaPropuesta: f.reunionFechaPropuesta,
    };
  });
}

export function toquesEnRango(
  desde: string,
  hasta: string,
  idOrganizacion: number,
  filtros: { owner?: string; ejecutadoPor?: string } = {},
): ToqueActividad[] {
  // El rango se mide sobre el DIA canonico, con `fecha` como respaldo para las filas viejas que
  // todavia no tienen fecha_dia (coalesce, no un OR: una sola expresion que el indice puede
  // usar igual y que no duplica la fila). Los toques nuevos siempre traen fecha_dia.
  const diaToque = sql`coalesce(${toque.fechaDia}, substr(${toque.fecha}, 1, 10))`;
  const condiciones = [
    eq(toque.idOrganizacion, idOrganizacion),
    sql`${diaToque} >= ${desde}`,
    sql`${diaToque} <= ${hasta}`,
  ];
  if (filtros.owner) condiciones.push(eq(empresa.owner, filtros.owner));
  // ejecutadoPor filtra por el EJECUTOR real. Una fila sin atribuir (NULL) nunca matchea: no
  // se le adjudica a nadie por descarte.
  if (filtros.ejecutadoPor) condiciones.push(eq(toque.ejecutadoPor, filtros.ejecutadoPor));

  return db
    .select({
      idToque: toque.idToque,
      fecha: toque.fecha,
      fechaDia: toque.fechaDia,
      fechaTexto: toque.fechaTexto,
      canal: toque.canal,
      tipoToque: toque.tipoToque,
      resultado: toque.resultado,
      duracionSegundos: toque.duracionSegundos,
      idEmpresa: toque.idEmpresa,
      empresa: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      owner: empresa.owner,
      ejecutadoPor: toque.ejecutadoPor,
      proximoPaso: empresa.proximoPaso,
      razonPerdida: toque.razonPerdida,
      razonPerdidaNota: toque.razonPerdidaNota,
      objecion: toque.objecion,
      objecionNota: toque.objecionNota,
      accionCliente: toque.accionCliente,
      reunionFechaPropuesta: toque.reunionFechaPropuesta,
      reunionFechaOcurrida: toque.reunionFechaOcurrida,
      transcriptProveedor: toque.transcriptProveedor,
      transcriptUrl: toque.transcriptUrl,
      fuente: toque.fuente,
    })
    .from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(and(...condiciones))
    .orderBy(desc(toque.fecha), desc(toque.idToque))
    .all();
}

export type AplazoActividad = {
  id: number;
  idEmpresa: string;
  empresa: string;
  estado: string | null;
  owner: string | null;
  fechaIncumplida: string;
  fechaNueva: string;
  motivo: string | null;
  nota: string | null;
  aplazadoPor: string | null;
  createdAt: string | null;
};

// Los aplazos del mismo rango. El rango se mide por la fecha INCUMPLIDA (el dia en que el
// seguimiento debia pasar), no por created_at: la pregunta es "que estaba programado esta
// semana y no se hizo", y un aplazo decidido con dos dias de anticipacion sigue siendo un
// incumplimiento de esta semana.
export function aplazosEnRango(
  desde: string,
  hasta: string,
  idOrganizacion: number,
  filtros: { owner?: string; aplazadoPor?: string } = {},
): AplazoActividad[] {
  const condiciones = [
    eq(seguimientoAplazado.idOrganizacion, idOrganizacion),
    sql`substr(${seguimientoAplazado.fechaIncumplida}, 1, 10) >= ${desde}`,
    sql`substr(${seguimientoAplazado.fechaIncumplida}, 1, 10) <= ${hasta}`,
  ];
  if (filtros.owner) condiciones.push(eq(empresa.owner, filtros.owner));
  if (filtros.aplazadoPor) condiciones.push(eq(seguimientoAplazado.aplazadoPor, filtros.aplazadoPor));

  return db
    .select({
      id: seguimientoAplazado.id,
      idEmpresa: seguimientoAplazado.idEmpresa,
      empresa: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      owner: empresa.owner,
      fechaIncumplida: seguimientoAplazado.fechaIncumplida,
      fechaNueva: seguimientoAplazado.fechaNueva,
      motivo: seguimientoAplazado.motivo,
      nota: seguimientoAplazado.nota,
      aplazadoPor: seguimientoAplazado.aplazadoPor,
      createdAt: seguimientoAplazado.createdAt,
    })
    .from(seguimientoAplazado)
    .innerJoin(empresa, eq(empresa.idEmpresa, seguimientoAplazado.idEmpresa))
    .where(and(...condiciones))
    .orderBy(desc(seguimientoAplazado.fechaIncumplida), desc(seguimientoAplazado.id))
    .all();
}

// --- Plan del dia (2026-07-26) --------------------------------------------------------
//
// Lo que se PENSABA tocar. La cola (`empresa.proximo_follow_up_fecha`) responde otra pregunta
// -- que esta vencido -- y ademas se pisa cada vez que se reprograma, asi que no sirve como
// registro de lo planeado. Con estas dos funciones el plan del dia deja de ser un markdown y
// pasa a ser dato: se escribe una vez y se puede preguntar despues.
//
// Escriben y leen `toque_planeado`, cuyo DDL propuso experto-followups en
// drizzle/manual/0016_toque_planeado.sql y NO esta aplicado a produccion. El estado (ejecutado
// / no ejecutado) no se guarda: se deriva del enlace explicito id_toque y, cuando no lo hay,
// del cruce por (id_empresa, fecha_dia).

export type LineaPlanEscrita = {
  idToquePlaneado: number;
  fechaDia: string;
  idEmpresa: string;
  canal: string | null;
  tipo: string;
  origen: string;
  nota: string | null;
  motivoNoEjecutado: string | null;
  idToque: number | null;
  planeadoPor: string | null;
  idOrganizacion: number;
  createdAt: string;
};

// Una cuenta que se pidio planear y no se escribio, con la razon. Se reportan en vez de tumbar
// el lote entero (mismo criterio que sinMapeo en reconciliarNotion): un plan de quince cuentas
// no se pierde porque una traiga el id mal escrito.
export type CuentaRechazada = {
  idEmpresa: string;
  motivo: 'empresa_no_existe' | 'otra_organizacion' | 'duplicada_en_el_input';
};

export type PlanearDiaResultado = {
  fecha: string;
  planeadoPor: string;
  // Lo que quedo escrito, RELEIDO de la tabla. Incluye las lineas que ya existian y se
  // corrigieron, no solo las nuevas.
  plan: LineaPlanEscrita[];
  nuevas: number;
  actualizadas: number;
  rechazadas: CuentaRechazada[];
};

export function planearDia(input: PlanearDiaInput, idOrganizacion: number): PlanearDiaResultado {
  const parsed = planearDiaSchema.parse(input);
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    const rechazadas: CuentaRechazada[] = [];
    const vistas = new Set<string>();
    let nuevas = 0;
    let actualizadas = 0;

    for (const linea of parsed.cuentas) {
      // La llave es (dia, empresa, canal), la misma del indice unico: planear llamada Y correo a
      // la misma cuenta el mismo dia son dos lineas legitimas. Mandar dos veces la misma
      // combinacion en el mismo lote no lo es -- se queda la primera y la segunda se reporta,
      // porque dejar que la ultima pise a la primera en silencio esconde un error de dictado.
      const llave = `${linea.idEmpresa}|${linea.canal ?? ''}`;
      if (vistas.has(llave)) {
        rechazadas.push({ idEmpresa: linea.idEmpresa, motivo: 'duplicada_en_el_input' });
        continue;
      }
      vistas.add(llave);

      const emp = tx
        .select({ organizacionActivaId: empresa.organizacionActivaId })
        .from(empresa)
        .where(eq(empresa.idEmpresa, linea.idEmpresa))
        .get();
      if (!emp) {
        rechazadas.push({ idEmpresa: linea.idEmpresa, motivo: 'empresa_no_existe' });
        continue;
      }
      if (emp.organizacionActivaId !== idOrganizacion) {
        rechazadas.push({ idEmpresa: linea.idEmpresa, motivo: 'otra_organizacion' });
        continue;
      }

      const existente = tx
        .select({ id: toquePlaneado.idToquePlaneado })
        .from(toquePlaneado)
        .where(
          and(
            eq(toquePlaneado.fechaDia, parsed.fecha),
            eq(toquePlaneado.idEmpresa, linea.idEmpresa),
            linea.canal ? eq(toquePlaneado.canal, linea.canal) : isNull(toquePlaneado.canal),
          ),
        )
        .get();

      if (existente) {
        // Replanear la misma (cuenta, dia, canal) CORRIGE la linea, no agrega una segunda. La
        // nota se borra si el replan no la trae, para no dejar pegada la razon de un plan
        // anterior. motivo_no_ejecutado NO se toca: es el registro de lo que paso despues, no
        // parte del plan, y replanear no puede borrarlo.
        tx.update(toquePlaneado)
          .set({ tipo: linea.tipo, origen: linea.origen, nota: linea.nota ?? null, planeadoPor: parsed.planeadoPor })
          .where(eq(toquePlaneado.idToquePlaneado, existente.id))
          .run();
        actualizadas += 1;
      } else {
        tx.insert(toquePlaneado)
          .values({
            fechaDia: parsed.fecha,
            idEmpresa: linea.idEmpresa,
            canal: linea.canal ?? null,
            tipo: linea.tipo,
            origen: linea.origen,
            nota: linea.nota ?? null,
            planeadoPor: parsed.planeadoPor,
            idOrganizacion,
            createdAt: ahora,
          })
          .run();
        nuevas += 1;
      }
    }

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'toque_planeado',
        idRegistro: parsed.fecha,
        accion: nuevas > 0 ? 'insert' : 'update',
        detalle: `plan ${parsed.fecha}: ${nuevas} nuevas, ${actualizadas} actualizadas, ${rechazadas.length} rechazadas`,
      })
      .run();

    // Relectura DENTRO de la transaccion: el plan que se devuelve es el que quedo en la tabla.
    const plan = tx
      .select({
        idToquePlaneado: toquePlaneado.idToquePlaneado,
        fechaDia: toquePlaneado.fechaDia,
        idEmpresa: toquePlaneado.idEmpresa,
        canal: toquePlaneado.canal,
        tipo: toquePlaneado.tipo,
        origen: toquePlaneado.origen,
        nota: toquePlaneado.nota,
        motivoNoEjecutado: toquePlaneado.motivoNoEjecutado,
        idToque: toquePlaneado.idToque,
        planeadoPor: toquePlaneado.planeadoPor,
        idOrganizacion: toquePlaneado.idOrganizacion,
        createdAt: toquePlaneado.createdAt,
      })
      .from(toquePlaneado)
      .where(and(eq(toquePlaneado.fechaDia, parsed.fecha), eq(toquePlaneado.idOrganizacion, idOrganizacion)))
      .orderBy(toquePlaneado.idToquePlaneado)
      .all();

    return { fecha: parsed.fecha, planeadoPor: parsed.planeadoPor, plan, nuevas, actualizadas, rechazadas };
  });
}

// --- marcarNoEjecutado (2026-07-26) ----------------------------------------------------
//
// El cierre del dia: escribe motivo_no_ejecutado sobre las lineas del plan que no se
// ejecutaron. Hasta hoy el motivo solo existia si ademas se corria un aplazo, y "no lo hice
// porque el dia se atraveso" no siempre mueve una fecha: la cuenta cuyo follow-up sigue donde
// estaba quedaba sin motivo posible, y su silencio se leia igual que el de una cuenta que nadie
// planeo.
//
// NO crea el aplazo ni mueve ninguna fecha. Correr un seguimiento es otra decision y ya tiene su
// camino (aplazarSeguimiento). Lo que si hace es ENLAZAR el aplazo que ya exista de esa cuenta
// ese dia, para que las dos mitades del mismo hecho queden atadas sin duplicar el motivo.

export type LineaNoEjecutadaRechazada = {
  idEmpresa: string;
  motivo:
    | 'sin_linea_en_el_plan'
    | 'varias_lineas_ese_dia'
    | 'ya_ejecutada'
    | 'duplicada_en_el_input'
    | 'otra_organizacion';
  // Cuando el rechazo es 'ya_ejecutada', el toque que la contradice. Sin esto, quien lo lea no
  // sabe si el rechazo es un error suyo o un toque que no recordaba haber registrado.
  idToque?: number;
  // Cuando es 'varias_lineas_ese_dia', los canales entre los que hay que elegir.
  canales?: (string | null)[];
};

export type MarcarNoEjecutadoResultado = {
  fecha: string;
  // Las lineas del plan RELEIDAS despues de escribirles el motivo.
  marcadas: LineaPlanEscrita[];
  // Las que ya tenian un motivo y se sobrescribio, contadas aparte: cambiar de opinion sobre por
  // que no se hizo algo es legitimo, pasar por encima de un motivo sin darse cuenta no.
  sobrescritas: number;
  // Cuantas quedaron sin motivo porque nadie lo dijo. Es la metrica que mide la calidad del
  // registro, no la del operador: un dia con muchas asi no es un mal dia de ventas, es un dia
  // mal cerrado.
  sinMotivo: number;
  rechazadas: LineaNoEjecutadaRechazada[];
};

export function marcarNoEjecutado(
  input: MarcarNoEjecutadoInput,
  idOrganizacion: number,
): MarcarNoEjecutadoResultado {
  const parsed = marcarNoEjecutadoSchema.parse(input);
  const ahora = new Date().toISOString();

  return db.transaction((tx) => {
    const rechazadas: LineaNoEjecutadaRechazada[] = [];
    const vistas = new Set<string>();
    const idsMarcados: number[] = [];
    let sobrescritas = 0;
    let sinMotivo = 0;

    for (const linea of parsed.cuentas) {
      const llave = `${linea.idEmpresa}|${linea.canal ?? ''}`;
      if (vistas.has(llave)) {
        rechazadas.push({ idEmpresa: linea.idEmpresa, motivo: 'duplicada_en_el_input' });
        continue;
      }
      vistas.add(llave);

      // Las lineas del plan de esa cuenta ese dia, dentro de esta organizacion.
      const condiciones = [
        eq(toquePlaneado.fechaDia, parsed.fecha),
        eq(toquePlaneado.idEmpresa, linea.idEmpresa),
        eq(toquePlaneado.idOrganizacion, idOrganizacion),
      ];
      if (linea.canal) condiciones.push(eq(toquePlaneado.canal, linea.canal));
      const lineas = tx
        .select({
          id: toquePlaneado.idToquePlaneado,
          canal: toquePlaneado.canal,
          idToque: toquePlaneado.idToque,
          motivoNoEjecutado: toquePlaneado.motivoNoEjecutado,
        })
        .from(toquePlaneado)
        .where(and(...condiciones))
        .all();

      if (lineas.length === 0) {
        // Sin linea planeada no hay nada que marcar. No se crea una: inventar el plan a
        // posteriori para poder decir que no se cumplio es fabricar el dato que se quiere medir.
        // Si de verdad estaba planeada, se escribe con planear_dia y despues se marca.
        rechazadas.push({ idEmpresa: linea.idEmpresa, motivo: 'sin_linea_en_el_plan' });
        continue;
      }
      if (lineas.length > 1) {
        // Dos canales planeados el mismo dia y el caller no dijo cual. Elegir uno seria decidir
        // por el cual de los dos toques no se hizo.
        rechazadas.push({
          idEmpresa: linea.idEmpresa,
          motivo: 'varias_lineas_ese_dia',
          canales: lineas.map((l) => l.canal),
        });
        continue;
      }

      const fila = lineas[0];

      // Contradiccion dura: la linea dice que no se hizo y hay un toque de esa cuenta ese dia.
      // Se falla explicito en vez de escribir un motivo que el propio dato desmiente. El enlace
      // explicito manda; el respaldo es el toque del mismo dia, el mismo criterio de cruce que
      // usa plan_vs_ejecutado.
      const yaEjecutada =
        fila.idToque != null
          ? { idToque: fila.idToque }
          : tx
              .select({ idToque: toque.idToque })
              .from(toque)
              .where(
                and(
                  eq(toque.idEmpresa, linea.idEmpresa),
                  eq(toque.idOrganizacion, idOrganizacion),
                  sql`coalesce(${toque.fechaDia}, substr(${toque.fecha}, 1, 10)) = ${parsed.fecha}`,
                ),
              )
              .get();
      if (yaEjecutada) {
        rechazadas.push({ idEmpresa: linea.idEmpresa, motivo: 'ya_ejecutada', idToque: yaEjecutada.idToque });
        continue;
      }

      // El motivo de la linea gana sobre el del lote. Si no viene ninguno queda NULL: marcar sin
      // motivo tambien es registrar (deja escrito que esa linea se reviso), pero se cuenta aparte.
      const motivo = linea.motivo ?? parsed.motivo ?? null;
      const nota = linea.nota ?? parsed.nota ?? null;
      if (motivo === null) sinMotivo += 1;
      if (fila.motivoNoEjecutado !== null && motivo !== null && fila.motivoNoEjecutado !== motivo) {
        sobrescritas += 1;
      }

      // El aplazo de esa cuenta ese dia, si existe. No se crea: mover la fecha es otra decision.
      const aplazo = tx
        .select({ id: seguimientoAplazado.id })
        .from(seguimientoAplazado)
        .where(
          and(
            eq(seguimientoAplazado.idEmpresa, linea.idEmpresa),
            eq(seguimientoAplazado.idOrganizacion, idOrganizacion),
            sql`substr(${seguimientoAplazado.fechaIncumplida}, 1, 10) = ${parsed.fecha}`,
          ),
        )
        .orderBy(desc(seguimientoAplazado.id))
        .get();

      tx.update(toquePlaneado)
        .set({
          motivoNoEjecutado: motivo,
          // La nota solo se pisa si vino una: un lote que manda motivo para cuatro cuentas no
          // tiene por que borrar el detalle que ya tenia una de ellas.
          ...(nota !== null ? { nota } : {}),
          ...(aplazo ? { idSeguimientoAplazado: aplazo.id } : {}),
        })
        .where(eq(toquePlaneado.idToquePlaneado, fila.id))
        .run();
      idsMarcados.push(fila.id);
    }

    tx.insert(syncCambios)
      .values({
        fecha: ahora,
        corrida: 'cockpit',
        fuente: 'cockpit',
        entidad: 'toque_planeado',
        idRegistro: parsed.fecha,
        accion: 'update',
        detalle: `no ejecutado ${parsed.fecha}: ${idsMarcados.length} marcadas, ${sinMotivo} sin motivo, ${rechazadas.length} rechazadas`,
      })
      .run();

    // Relectura DENTRO de la transaccion, solo de las lineas que se tocaron.
    const marcadas =
      idsMarcados.length === 0
        ? []
        : tx
            .select({
              idToquePlaneado: toquePlaneado.idToquePlaneado,
              fechaDia: toquePlaneado.fechaDia,
              idEmpresa: toquePlaneado.idEmpresa,
              canal: toquePlaneado.canal,
              tipo: toquePlaneado.tipo,
              origen: toquePlaneado.origen,
              nota: toquePlaneado.nota,
              motivoNoEjecutado: toquePlaneado.motivoNoEjecutado,
              idToque: toquePlaneado.idToque,
              planeadoPor: toquePlaneado.planeadoPor,
              idOrganizacion: toquePlaneado.idOrganizacion,
              createdAt: toquePlaneado.createdAt,
            })
            .from(toquePlaneado)
            .where(inArray(toquePlaneado.idToquePlaneado, idsMarcados))
            .orderBy(toquePlaneado.idToquePlaneado)
            .all();

    return { fecha: parsed.fecha, marcadas, sobrescritas, sinMotivo, rechazadas };
  });
}

export type LineaPlan = {
  idToquePlaneado: number;
  fechaDia: string;
  idEmpresa: string;
  empresa: string;
  estado: string | null;
  owner: string | null;
  canal: string | null;
  tipo: string;
  origen: string;
  nota: string | null;
  // Por que no se hizo, escrito EN la fila del plan. Es la fuente primaria del motivo; el aplazo
  // de esa cuenta ese dia es el respaldo cuando esta en null. Ninguno de los dos se infiere.
  motivoNoEjecutado: string | null;
  // Enlace explicito al toque que ejecuto esta linea. Cuando existe, manda sobre el cruce por
  // (empresa, dia): es exacto y distingue dos lineas planeadas para la misma cuenta el mismo dia.
  idToque: number | null;
  planeadoPor: string | null;
};

// El plan de un rango, cruzado con su empresa. Mismo par de filtros que toquesEnRango (owner
// del deal, persona que planeo) para que las dos listas se puedan comparar sin que una traiga
// filas que la otra no puede traer.
export function planEnRango(
  desde: string,
  hasta: string,
  idOrganizacion: number,
  filtros: { owner?: string; planeadoPor?: string } = {},
): LineaPlan[] {
  const condiciones = [
    eq(toquePlaneado.idOrganizacion, idOrganizacion),
    sql`${toquePlaneado.fechaDia} >= ${desde}`,
    sql`${toquePlaneado.fechaDia} <= ${hasta}`,
  ];
  if (filtros.owner) condiciones.push(eq(empresa.owner, filtros.owner));
  if (filtros.planeadoPor) condiciones.push(eq(toquePlaneado.planeadoPor, filtros.planeadoPor));

  return db
    .select({
      idToquePlaneado: toquePlaneado.idToquePlaneado,
      fechaDia: toquePlaneado.fechaDia,
      idEmpresa: toquePlaneado.idEmpresa,
      empresa: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      owner: empresa.owner,
      canal: toquePlaneado.canal,
      tipo: toquePlaneado.tipo,
      origen: toquePlaneado.origen,
      nota: toquePlaneado.nota,
      motivoNoEjecutado: toquePlaneado.motivoNoEjecutado,
      idToque: toquePlaneado.idToque,
      planeadoPor: toquePlaneado.planeadoPor,
    })
    .from(toquePlaneado)
    .innerJoin(empresa, eq(empresa.idEmpresa, toquePlaneado.idEmpresa))
    .where(and(...condiciones))
    .orderBy(toquePlaneado.fechaDia, toquePlaneado.idToquePlaneado)
    .all();
}

// --- Existencia y motivo de exclusion del pipeline ------------------------------------

export type EmpresaFuera = {
  idEmpresa: string;
  nombreOficial: string;
  estadoNotion: string | null;
  operaBajoId: string | null;
  notionPageId: string | null;
  tieneToques: boolean;
};

// Responde "existe esta cuenta, y si no sale en el pipeline, por que". Existe porque
// pipelineParaEndpoint ya viene filtrado (EN_PIPELINE y EMPRESA_VIVA), asi que desde ahi no se
// puede distinguir "no existe" de "existe pero esta excluida" -- y confundirlas costo caro el
// 2026-07-25: cinco empresas respondieron `empresa_no_encontrada`, se concluyo que habia que
// crearlas, y en realidad solo habia que enlazarlas.
export function empresaFueraDelPipeline(idEmpresa: string, idOrganizacion: number): EmpresaFuera | null {
  const fila = db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombreOficial: empresa.nombreOficial,
      estadoNotion: empresa.estadoNotion,
      operaBajoId: empresa.operaBajoId,
      notionPageId: empresa.notionPageId,
    })
    .from(empresa)
    .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
    .get();
  if (!fila) return null;

  // fuente='whatsapp_entrante' no cuenta como "trabajo real" (2026-07-27, mismo criterio que
  // el resto de contadores de actividad): un reply del ISP no es lo que explica que una
  // empresa este trackeada, y contarlo aca haria decir "tiene toques" (trabajo real) de una
  // empresa a la que nadie del equipo le hizo nada.
  //
  // OJO con ne() a secas (encontrado en revision, 2026-07-27): en SQL, `fuente != 'x'` evalua
  // a NULL (no a true) cuando fuente es NULL, y NULL no pasa un WHERE -- una fila real con
  // fuente NULL quedaria excluida del conteo, justo el resultado contrario al que se quiere.
  // Hoy toque.fuente es NOT NULL asi que no muerde, pero es el mismo patron silencioso que el
  // bug que este fix arregla. Mismo criterio que enRango (arriba en este archivo): OR con
  // isNull cubre el caso.
  const toques = db
    .select({ n: sql<number>`count(*)` })
    .from(toque)
    .where(and(eq(toque.idEmpresa, idEmpresa), or(isNull(toque.fuente), ne(toque.fuente, 'whatsapp_entrante'))))
    .get();

  return { ...fila, tieneToques: Number(toques?.n ?? 0) > 0 };
}

// --- Reasignar el id de una cuenta sintetica a su NIT real ----------------------------

export type ReasignarNitResultado = {
  idAnterior: string;
  idNuevo: string;
  nombreOficial: string;
  filasActualizadas: Record<string, number>;
};

// Las tablas hijas NO se listan a mano: se le preguntan al esquema. Son 21 hoy y la lista
// escrita se desactualizaria en silencio la primera vez que alguien agregue una tabla, dejando
// filas apuntando a un id que ya no existe.
//
// Se descubren por NOMBRE DE COLUMNA y no por pragma_foreign_key_list, que seria lo obvio:
// cinco tablas vivas (inscripcion, empresa_estado_historial, notificacion_respuesta,
// segmento_exclusion, empresa_inactiva) tienen id_empresa SIN la FK declarada, asi que el
// pragma de foreign keys se las salta. Verificado contra isps.db el 2026-07-25.
type TxReasignar = Parameters<Parameters<typeof db.transaction>[0]>[0];

function tablasConIdEmpresa(tx: TxReasignar): string[] {
  const filas = tx.all<{ name: string }>(sql`
    SELECT DISTINCT m.name AS name
    FROM sqlite_master m
    JOIN pragma_table_info(m.name) p
    WHERE m.type = 'table' AND p.name = 'id_empresa' AND m.name <> 'empresa'
  `);
  return filas.map((f) => f.name);
}

// Cambia el id de una cuenta de sintetico (ntn-/999) a su NIT real, arrastrando las
// referencias. Existe porque crear una cuenta y conseguir el NIT despues es el flujo normal (el
// NIT casi nunca esta en la primera llamada), y hasta el 2026-07-25 arreglarlo era tocar una PK
// a mano por SSH.
//
// SOLO va de provisional a definitivo. Reasignar entre dos NITs, o de NIT a sintetico, se
// rechaza: eso ya no es corregir un id, es afirmar que dos cuentas son la misma, y esa decision
// no la toma una tool (ver el caso Fibermax/Fibermat). Por lo mismo, si el NIT destino YA existe
// se falla en vez de fusionar.
export function reasignarNit(idViejo: string, nitNuevo: string, idOrganizacion: number): ReasignarNitResultado {
  const viejo = idViejo.trim();
  const nuevo = nitNuevo.trim();

  if (!esIdSintetico(viejo)) {
    throw new Error(
      `reasignar_nit solo corrige ids provisionales (ntn- o 999xxxxxxx). "${viejo}" ya es un NIT: cambiarlo seria afirmar que es otra empresa.`,
    );
  }
  if (!esNitValido(nuevo)) {
    throw new Error(`NIT invalido: "${nuevo}". Se esperan 8 a 10 digitos, sin puntos ni digito de verificacion.`);
  }
  if (viejo === nuevo) throw new Error('el id nuevo es igual al actual');

  return db.transaction((tx) => {
    const actual = tx
      .select({ nombre: empresa.nombreOficial })
      .from(empresa)
      .where(and(eq(empresa.idEmpresa, viejo), eq(empresa.organizacionActivaId, idOrganizacion)))
      .get();
    if (!actual) throw new Error(`empresa_no_encontrada: ${viejo} en la organizacion ${idOrganizacion}`);

    const ocupado = tx.select({ id: empresa.idEmpresa }).from(empresa).where(eq(empresa.idEmpresa, nuevo)).get();
    if (ocupado) {
      throw new Error(
        `el NIT ${nuevo} ya es de otra cuenta. Esto seria una fusion, no una reasignacion: revisalo a mano antes.`,
      );
    }

    // Diferir la verificacion de FK al commit. Sin esto el UPDATE del padre deja a las hijas
    // apuntando a un id inexistente por un instante y SQLite aborta, porque las FK de esta base
    // son ON DELETE CASCADE pero NO ON UPDATE CASCADE.
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);

    const filasActualizadas: Record<string, number> = {};
    for (const tabla of tablasConIdEmpresa(tx)) {
      const r = tx.run(sql`UPDATE ${sql.identifier(tabla)} SET id_empresa = ${nuevo} WHERE id_empresa = ${viejo}`);
      if (r.changes > 0) filasActualizadas[tabla] = r.changes;
    }

    // Las dos autorreferencias de empresa: otras cuentas pueden estar colgando de esta.
    const rMatriz = tx.run(sql`UPDATE empresa SET id_empresa_matriz = ${nuevo} WHERE id_empresa_matriz = ${viejo}`);
    if (rMatriz.changes > 0) filasActualizadas['empresa.id_empresa_matriz'] = rMatriz.changes;
    const rOpera = tx.run(sql`UPDATE empresa SET opera_bajo_id = ${nuevo} WHERE opera_bajo_id = ${viejo}`);
    if (rOpera.changes > 0) filasActualizadas['empresa.opera_bajo_id'] = rOpera.changes;

    // El padre de ultimo, y con tipo_id 'nit': el id dejo de ser provisional.
    const rEmpresa = tx.run(
      sql`UPDATE empresa SET id_empresa = ${nuevo}, tipo_id = 'nit' WHERE id_empresa = ${viejo}`,
    );
    filasActualizadas['empresa'] = rEmpresa.changes;

    return { idAnterior: viejo, idNuevo: nuevo, nombreOficial: actual.nombre, filasActualizadas };
  });
}

// --- Cuentas para reconciliar contra Notion ------------------------------------------

export type FilaCuenta = {
  idEmpresa: string;
  nombre: string;
  nombreNotion: string | null;
  estado: string | null;
  owner: string | null;
  notionPageId: string | null;
  // Solo cuando se pide (conAliado). Ausente y no null: la lista de reconciliacion no responde
  // esta pregunta, y una llave en null diria que la cuenta no tiene aliado en vez de que nadie
  // la pregunto. El mismo error de leer el vacio como dato, un nivel mas arriba.
  aliado?: ClasificacionAliado;
};

// Lista minima para cruzar contra Notion: seis campos y nada mas. Existe porque
// pipelineParaEndpoint (la unica lista que habia) trae usuarios, plan, tarifa y %digital, o sea
// 142 KB de JSON, para responder una pregunta que solo necesita el page_id y el estado.
//
// El universo NO es el mismo que el de `pipeline`. Aqui entra toda cuenta que este en el embudo
// (estado_notion no null) O que tenga notion_page_id, aunque no tenga etapa. Esa segunda mitad
// es la que faltaba: el 2026-07-25, REDVIVA existia en produccion con su NIT, dominio y telefono,
// pero sin estado_notion, asi que no salia en `pipeline` y se concluyo que habia que crearla
// cuando en realidad solo habia que enlazarla.
export function cuentasParaReconciliar(idOrganizacion: number, opts: { conAliado?: boolean } = {}): FilaCuenta[] {
  const filas = db
    .select({
      idEmpresa: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      nombreNotion: empresa.nombreNotion,
      estado: empresa.estadoNotion,
      owner: empresa.owner,
      notionPageId: empresa.notionPageId,
      // Se traen SIEMPRE en el select y se descartan abajo si no se pidieron: son cinco columnas
      // de la misma fila que ya se esta leyendo, asi que no cuestan una query mas. Lo que la
      // bandera controla es lo que VIAJA en la respuesta, que es donde estaba el costo real
      // (`pipeline` pesa 142 KB por traer de mas, y esta lista existe para no hacer eso).
      aliadoCol: empresa.aliado,
      aliadoFuente: empresa.aliadoFuente,
      aliadoFecha: empresa.aliadoFecha,
      aliadoQuien: empresa.aliadoQuien,
      idEmpresaMatriz: empresa.idEmpresaMatriz,
    })
    .from(empresa)
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        // SIN EMPRESA_VIVA a proposito. Ese filtro (opera_bajo_id IS NULL) es correcto para
        // CONTAR el embudo, porque una filial no se cuenta aparte de su matriz. Pero para
        // RECONCILIAR es un error: una filial enlazada a una pagina de Notion SI es una cuenta, y
        // esconderla hace que su pagina se reporte como "sin cuenta". Detectado el 2026-07-25 con
        // el dry-run: S3WIRELESS y CABLETELCO, enlazadas ese mismo dia, salian como huerfanas, y
        // actuar sobre ese reporte habria creado dos duplicados.
        or(isNotNull(empresa.estadoNotion), isNotNull(empresa.notionPageId)),
      ),
    )
    .orderBy(asc(empresa.nombreOficial))
    .all();

  // Una sola query mas para TODO el grupo de las 476, no una por cuenta. La regla se aplica en
  // memoria con clasificarAliadoDeFila, la misma que usa la lectura de una cuenta suelta: dos
  // caminos, una sola regla.
  const matrices = [...new Set(filas.map((f) => f.idEmpresaMatriz).filter((m): m is string => m != null))];
  const hermanas = opts.conAliado ? hermanasConfirmadas(db, matrices) : new Map<string, FilaAliado>();

  return filas.map(({ aliadoCol, aliadoFuente, aliadoFecha, aliadoQuien, idEmpresaMatriz, ...cuenta }) => {
    if (!opts.conAliado) return cuenta;
    const propia: FilaAliado = {
      idEmpresa: cuenta.idEmpresa,
      aliado: aliadoCol,
      aliadoFuente,
      aliadoFecha,
      aliadoQuien,
      idEmpresaMatriz,
    };
    const hermana = idEmpresaMatriz ? (hermanas.get(idEmpresaMatriz) ?? null) : null;
    return {
      ...cuenta,
      aliado: clasificarAliadoDeFila(propia, hermana && hermana.idEmpresa !== cuenta.idEmpresa ? hermana : null),
    };
  });
}

// --- Bucle PBX (enriquecimiento del decisor) ---------------------------------------

export type FilaPBX = {
  id: string;
  nombre: string;
  proximoPaso: string | null;
  proximoCanal: string | null;
  proximoFollowUpFecha: string | null;
  pbxForma: string | null;
  tieneNumeroConmutador: boolean;
};

// Resuelve el predicado (estaEnPBX) en JS sobre los contactos de la organizacion,
// mismo patron que empresasConReadiness/_contactosDe. Atajo aceptado (documentado):
// si la base real (1400+ empresas) lo vuelve lento, mover la condicion espejo a SQL.
export function empresasEnPBX(idOrganizacion: number): FilaPBX[] {
  const empresas = db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estadoNotion: empresa.estadoNotion,
      proximoPaso: empresa.proximoPaso,
      proximoCanal: empresa.proximoCanal,
      proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      pbxForma: empresa.pbxForma,
    })
    .from(empresa)
    .where(and(eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA))
    .all();
  if (empresas.length === 0) return [];

  const contactos = db
    .select({
      idEmpresa: contacto.idEmpresa,
      esKeyDecisionMaker: contacto.esKeyDecisionMaker,
      telefono: contacto.telefono,
      email: contacto.email,
    })
    .from(contacto)
    .where(inArray(contacto.idEmpresa, empresas.map((e) => e.id)))
    .all();

  const contactosPorEmpresa = new Map<string, ContactoPBX[]>();
  const tieneNumeroPorEmpresa = new Map<string, boolean>();
  for (const c of contactos) {
    const lista = contactosPorEmpresa.get(c.idEmpresa) ?? [];
    lista.push({ esKeyDecisionMaker: c.esKeyDecisionMaker === 1, telefono: c.telefono, email: c.email });
    contactosPorEmpresa.set(c.idEmpresa, lista);
    if (c.telefono) tieneNumeroPorEmpresa.set(c.idEmpresa, true);
  }

  return empresas
    .filter((e) => aplicaBuclePBX(e.estadoNotion, contactosPorEmpresa.get(e.id) ?? []))
    .map((e) => ({
      ...e,
      tieneNumeroConmutador: tieneNumeroPorEmpresa.get(e.id) ?? false,
    }));
}

// Guarda el paso aprobado (borrador -> aprobar, CLAUDE.md) en las columnas que ya
// existen para la cola (proximoPaso/proximoCanal/proximoFollowUpFecha) mas el estado
// minimo del bucle (pbxForma). Scoped a la organizacion, mismo guard que registrarToque.
export function guardarProximoPasoPBX(idEmpresa: string, paso: PasoPropuesto, idOrganizacion: number): void {
  db.transaction((tx) => {
    const emp = tx
      .select({ organizacionActivaId: empresa.organizacionActivaId })
      .from(empresa)
      .where(eq(empresa.idEmpresa, idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
    }

    const proximoFollowUpFecha =
      paso.diasSugeridos === null ? fechaBogotaISO() : diasDesdeHoy(paso.diasSugeridos);

    tx.update(empresa)
      .set({
        proximoPaso: paso.nota,
        proximoCanal: paso.canal,
        proximoFollowUpFecha,
        pbxForma: paso.forma,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(empresa.idEmpresa, idEmpresa))
      .run();
  });
}

// Fecha de calendario en Bogota. La version vieja mezclaba setDate/getDate (local) con
// toISOString() (UTC), asi que de noche guardaba el follow-up un dia corrido.
function diasDesdeHoy(dias: number): string {
  return sumarDias(fechaBogotaISO(), dias);
}

// Estado terminal exitoso del bucle: se consiguio el metodo directo del KDM. Inserta
// el contacto (upsert por telefono, mismo idioma que el KDM opcional de registrarToque),
// limpia pbxForma y la empresa sale de empresasEnPBX. No toca proximoPaso/proximoCanal:
// eso lo decide la cadencia comercial normal, fuera del bucle PBX.
export function graduarDePBX(
  idEmpresa: string,
  kdm: { nombre: string; telefono: string | null; email: string | null },
  idOrganizacion: number,
): void {
  db.transaction((tx) => {
    const emp = tx
      .select({ organizacionActivaId: empresa.organizacionActivaId })
      .from(empresa)
      .where(eq(empresa.idEmpresa, idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(`La empresa ${idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`);
    }

    const existente = kdm.telefono
      ? tx
          .select({ idContacto: contacto.idContacto })
          .from(contacto)
          .where(and(eq(contacto.idEmpresa, idEmpresa), eq(contacto.telefono, kdm.telefono)))
          .get()
      : undefined;

    if (existente) {
      tx.update(contacto)
        .set({ esKeyDecisionMaker: 1, nombre: kdm.nombre, email: kdm.email ?? undefined })
        .where(eq(contacto.idContacto, existente.idContacto))
        .run();
    } else {
      tx.insert(contacto)
        .values({
          idEmpresa,
          nombre: kdm.nombre,
          telefono: kdm.telefono,
          email: kdm.email,
          esKeyDecisionMaker: 1,
          esPrincipal: 0,
          fuente: 'cockpit',
        })
        .run();
    }

    tx.update(empresa)
      .set({ pbxForma: null, updatedAt: new Date().toISOString() })
      .where(eq(empresa.idEmpresa, idEmpresa))
      .run();
  });
}

// T4 (Fase 0 dedup Notion, decision revisada 2026-07-14): funde uno o mas registros
// sinteticos/duplicados (idsAbsorbidos) contra el registro NIT sobreviviente. Nunca
// automatico -- solo se llama sobre pares que Sebastian aprobo a mano (ver
// planning/dedup-candidatos.md). Politica de nombre: nombre_oficial pasa a ser el
// nombre de NOTION (lo que ve toda la app); nombre_legal guarda la razon social
// original del NIT, solo para referencia/auditoria.
//
// Idempotente: un absorbido con opera_bajo_id ya seteado se salta (evita duplicar
// alias, re-mover contactos/toques que ya estan vacios, o re-loguear en
// sync_cambios). El absorbido NUNCA se borra -- queda "desreferenciado" (sin
// contactos/toques propios, marcado opera_bajo_id) para no romper referencias en
// otras tablas que no audita esta funcion (segmento_exclusion, inscripcion, etc).
export function fundirEmpresas(idSobrevive: string, idsAbsorbidos: string[], nombreNotion: string): void {
  const ahora = new Date().toISOString();

  db.transaction((tx) => {
    const sobrevive = tx
      .select({ nombreOficial: empresa.nombreOficial, nombreLegal: empresa.nombreLegal, operaBajoId: empresa.operaBajoId })
      .from(empresa)
      .where(eq(empresa.idEmpresa, idSobrevive))
      .get();
    if (!sobrevive) throw new Error(`fundirEmpresas: ${idSobrevive} no existe`);
    // Bug real encontrado 2026-07-15 (CABLETELCO, plan embudo-real-y-registro): fundir
    // contra un "sobreviviente" que en realidad ya esta muerto (fundido antes en OTRA
    // fila) deja al absorbido nuevo colgado de una identidad invisible para el resto de
    // la app (EMPRESA_VIVA la filtra). Falla explicito en vez de dejar la cadena rota.
    if (sobrevive.operaBajoId) {
      throw new Error(
        `fundirEmpresas: ${idSobrevive} no puede ser sobreviviente, ya esta fundido en ${sobrevive.operaBajoId}. Usa ${sobrevive.operaBajoId} como sobreviviente.`,
      );
    }

    for (const idAbsorbido of idsAbsorbidos) {
      if (idAbsorbido === idSobrevive) continue;

      const absorbido = tx
        .select({ nombreOficial: empresa.nombreOficial, operaBajoId: empresa.operaBajoId })
        .from(empresa)
        .where(eq(empresa.idEmpresa, idAbsorbido))
        .get();
      if (!absorbido || absorbido.operaBajoId === idSobrevive) continue; // no existe o ya fundido: idempotente

      tx.update(contacto).set({ idEmpresa: idSobrevive }).where(eq(contacto.idEmpresa, idAbsorbido)).run();
      tx.update(toque).set({ idEmpresa: idSobrevive }).where(eq(toque.idEmpresa, idAbsorbido)).run();

      const aliasExistente = tx
        .select({ idAlias: empresaAlias.idAlias })
        .from(empresaAlias)
        .where(and(eq(empresaAlias.idEmpresa, idSobrevive), eq(empresaAlias.alias, absorbido.nombreOficial)))
        .get();
      if (!aliasExistente) {
        tx.insert(empresaAlias)
          .values({ idEmpresa: idSobrevive, alias: absorbido.nombreOficial, fuente: 'dedup', confianza: 'alta', createdAt: ahora })
          .run();
      }

      tx.insert(syncCambios)
        .values({
          fecha: ahora,
          corrida: 'dedup_notion',
          fuente: 'notion',
          entidad: 'empresa',
          idRegistro: idAbsorbido,
          accion: `fundir_en:${idSobrevive}`,
          detalle: `nombre_legal_previo=${sobrevive.nombreLegal ?? sobrevive.nombreOficial}`,
        })
        .run();

      tx.update(empresa)
        .set({ operaBajoId: idSobrevive, updatedAt: ahora })
        .where(eq(empresa.idEmpresa, idAbsorbido))
        .run();
    }

    tx.update(empresa)
      .set({
        nombreOficial: nombreNotion,
        nombreLegal: sobrevive.nombreLegal ?? sobrevive.nombreOficial,
        updatedAt: ahora,
      })
      .where(eq(empresa.idEmpresa, idSobrevive))
      .run();
  });
}

export type VeredictoIdentidad = 'mismo' | 'distinto' | 'satelite_de';

// Task 12: complemento de fundirEmpresas/empresaAlias. Un veredicto 'distinto' o
// 'satelite_de' NO tiene un flujo de datos propio (a diferencia de 'mismo', que dispara
// fundirEmpresas) -- solo se registra para que diff_notion_db.ts / el matcher dejen de
// re-proponer un par que Sebastian ya resolvio. decididoPor siempre humano.
export function registrarDecisionIdentidad(
  a: string,
  b: string,
  veredicto: VeredictoIdentidad,
  decididoPor: string,
  nota?: string,
): void {
  db.insert(identidadDecision)
    .values({ a, b, veredicto, decididoPor, nota: nota ?? null, createdAt: new Date().toISOString() })
    .run();
}

// Busca una decision ya tomada para el par (a,b) SIN importar el orden -- el mismo par
// puede llegar como (a,b) o (b,a) segun quien lo presente (Notion vs DB).
export function decisionIdentidadDelPar(a: string, b: string): VeredictoIdentidad | null {
  const fila = db
    .select({ veredicto: identidadDecision.veredicto })
    .from(identidadDecision)
    .where(
      sql`(${identidadDecision.a} = ${a} AND ${identidadDecision.b} = ${b}) OR (${identidadDecision.a} = ${b} AND ${identidadDecision.b} = ${a})`,
    )
    .get();
  return (fila?.veredicto as VeredictoIdentidad | undefined) ?? null;
}

// Marca idEmpresa como satelite de idEmpresaMatriz: a diferencia de fundirEmpresas,
// ambas filas quedan VIVAS (cada una con su propio deal) -- solo se anota la relacion
// para que la UI la pueda mostrar y el matcher deje de confundirlas.
export function marcarSatelite(idEmpresa_: string, idEmpresaMatriz: string): void {
  db.update(empresa)
    .set({ idEmpresaMatriz, updatedAt: new Date().toISOString() })
    .where(eq(empresa.idEmpresa, idEmpresa_))
    .run();
}

// T5: enlaza el page_id de Notion a una empresa ya existente en la DB. Idempotente
// por construccion (un UPDATE al mismo valor es un no-op observable); no revienta si
// idEmpresa no existe, para que el script orquestador pueda recorrer en lote sin
// chequear existencia antes.
export function enlazarPageId(idEmpresa: string, pageId: string): void {
  db.update(empresa)
    .set({ notionPageId: pageId, updatedAt: new Date().toISOString() })
    .where(eq(empresa.idEmpresa, idEmpresa))
    .run();
}

// T7: escribe el veto de Notion en empresa_clasificacion. "El no gana" es union, nunca
// resta: el upsert solo toca el UNA columna de flag pedida (mas fuente/actualizadoEn),
// dejando intactos los demas flags que ya tenga la fila (p. ej. es_carrier puesto por
// una clasificacion previa del lado DB). Idempotente por PK (id_empresa): dos llamadas
// con el mismo flag dejan la misma fila, sin duplicar ni resetear nada.
export function marcarVetoNotion(idEmpresa: string, flag: 'es_utility_no_isp' | 'es_no_isp_confirmado'): void {
  const ahora = new Date().toISOString();
  // Mapa explicito snake_case (nombre real del flag, vocabulario de vetoCategoria) ->
  // campo Drizzle (camelCase): evita una clave computada `[flag]` que no coincide con
  // los nombres de columna que Drizzle espera en values()/set().
  const campo = flag === 'es_utility_no_isp' ? 'esUtilityNoIsp' : 'esNoIspConfirmado';
  db.insert(empresaClasificacion)
    .values({ idEmpresa, [campo]: 1, fuente: 'notion', actualizadoEn: ahora })
    .onConflictDoUpdate({
      target: empresaClasificacion.idEmpresa,
      set: { [campo]: 1, fuente: 'notion', actualizadoEn: ahora },
    })
    .run();
}

export interface ContactoNotionInput {
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  linkedin?: string;
  esPrincipal: boolean;
}

// Trim + lowercase + colapso de espacios: basta para comparar nombres de persona
// (a diferencia de matcherGemelos.ts, que normaliza razon social con sufijos legales,
// otra clase de problema). No se reusa esa normalizacion aca a proposito.
function normalizarNombrePersona(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ');
}

// T11: Contacto Principal + Buying Comittee (Notion, Fase 4) -> `contacto`.
// Idempotente por (id_empresa, nombre normalizado) o telefono no vacio: si ya existe
// una fila que matchea por cualquiera de los dos, se actualiza esa fila en vez de
// insertar una nueva. uq_contacto_principal es un indice unico parcial (a lo sumo un
// es_principal=1 por empresa): antes de marcar un contacto como principal, se demota
// en la MISMA transaccion cualquier otro contacto de la empresa que ya lo fuera (pasada
// previa de esta misma funcion, o dato seedeado de otra fuente) para no chocar con el
// indice, tanto en el camino feliz como al re-correr.
export function upsertContactoNotion(idEmpresa: string, contactos: ContactoNotionInput[]): void {
  db.transaction((tx) => {
    const existentes = tx
      .select({
        idContacto: contacto.idContacto,
        nombre: contacto.nombre,
        telefono: contacto.telefono,
      })
      .from(contacto)
      .where(eq(contacto.idEmpresa, idEmpresa))
      .all();

    for (const entrada of contactos) {
      const nombre = entrada.nombre.trim();
      if (nombre === '') continue; // sin nombre no hay contacto que guardar

      const nombreNormalizado = normalizarNombrePersona(nombre);
      const telefono = entrada.telefono.trim();

      const match = existentes.find((e) => {
        const mismoNombre = e.nombre !== null && normalizarNombrePersona(e.nombre) === nombreNormalizado;
        const mismoTelefono = telefono !== '' && e.telefono !== null && e.telefono.trim() === telefono;
        return mismoNombre || mismoTelefono;
      });

      if (entrada.esPrincipal) {
        // Union en id_contacto: cualquier OTRO contacto de esta empresa que hoy tenga
        // es_principal=1 se demota, sin importar si viene o no de esta misma corrida.
        tx.update(contacto)
          .set({ esPrincipal: 0 })
          .where(and(eq(contacto.idEmpresa, idEmpresa), eq(contacto.esPrincipal, 1), match ? ne(contacto.idContacto, match.idContacto) : sql`1=1`))
          .run();
      }

      // Union, nunca resta (mismo criterio que marcarVetoNotion): si Notion dice que
      // este contacto decide, se marca; si dice que no, se DEJA como este -- el bucle
      // PBX pudo haberlo graduado a mano y re-correr el import no debe perder eso.
      const esKdm = esKdmDesdeNotion({ esPrincipal: entrada.esPrincipal, cargo: entrada.cargo });

      const valores = {
        idEmpresa,
        nombre,
        cargo: entrada.cargo,
        cargoCategoria: clasificarCargo(entrada.cargo),
        telefono: telefono || null,
        email: entrada.email || null,
        linkedin: entrada.linkedin || null,
        esPrincipal: entrada.esPrincipal ? 1 : 0,
        fuente: 'notion',
        ...(esKdm ? { esKeyDecisionMaker: 1 } : {}),
      };

      if (match) {
        tx.update(contacto).set(valores).where(eq(contacto.idContacto, match.idContacto)).run();
      } else {
        const [insertado] = tx
          .insert(contacto)
          .values({ esKeyDecisionMaker: 0, ...valores })
          .returning({ idContacto: contacto.idContacto })
          .all();
        // Se agrega a `existentes` para que filas posteriores del MISMO lote (p. ej. dos
        // entradas de Buying Comittee con el mismo nombre por error de captura) tambien
        // hagan match contra este INSERT recien hecho, en vez de duplicar.
        existentes.push({ idContacto: insertado.idContacto, nombre, telefono: telefono || null });
      }
    }
  });
}

export interface EnriquecerNotionInput {
  pasarela?: string;
  crm?: string;
  owner?: string;
  proximoPaso?: string;
  fechaProximoPaso?: string;
  usuariosEstimados?: string | number;
}

// El CSV de Notion trae "Usuarios Estimados" como texto con separador de miles ("5,000",
// "240,000"). Se quita la coma y se parsea a numero. Blanco o no-numerico ("N/A") -> null,
// que el caller interpreta como "Notion no trae dato" y no escribe (no destructivo).
function parseUsuariosNotion(v: string | number | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const limpio = v.replace(/,/g, '').trim();
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// A (2026-07-15): el CSV de Notion trae "Fecha Proximo Paso" en formato humano ('July 14,
// 2026', a veces con hora: 'June 23, 2026 5:00 AM (GMT-5)'). Esta es la unica escritura
// de proximo_follow_up_fecha que llegaba sin pasar por un parser (los scripts .py de sync
// si parseaban) -- colaDelDia compara la columna como texto y una fecha humana nunca
// entra a la cola. Reusa normalizarFechaToque (el mismo parser de toque.fecha, ver
// project_notion_sync_spec1_implementado en memoria: ya hubo un normalizador duplicado
// x3 en este repo). undefined pasa igual (Notion no trae el campo); vacio pasa igual (no
// destructivo, lo maneja el loop generico); no parseable -> undefined, mismo criterio que
// parseUsuariosNotion con "N/A": no se inventa una fecha, no se pisa la que ya hay.
function parseFechaNotion(v: string | undefined): string | undefined {
  if (v == null) return v;
  const limpio = v.trim();
  if (limpio === '') return limpio;
  const n = normalizarFechaToque(limpio);
  return n.tipo === 'dia' ? n.iso : undefined;
}

// T12: enriquece los campos comerciales de una empresa desde Notion (Fase 4). Politica de
// escritura: "Notion sobrescribe, pero SOLO donde Notion trae dato" (mismo criterio no
// destructivo que scripts/sync_notion_estado.py). Si el CSV viene vacio para un campo, NO
// se pisa lo que ya hay en la DB -- ~89% de las empresas no tienen owner en Notion, blanquear
// el de la DB seria una perdida real. Cada campo que SI cambia deja el valor anterior en
// sync_cambios (reversible). Un campo cuyo valor nuevo == el actual no se toca ni se loguea
// (idempotente al re-correr). Todo en una transaccion (empresa + empresa_usuarios + auditoria
// atomicos), mismo patron que fundirEmpresas/actualizarEstadoNotion.
export function enriquecerDesdeNotion(
  idEmpresa: string,
  datos: EnriquecerNotionInput,
  idOrganizacion: number,
): void {
  const ahora = new Date().toISOString();

  db.transaction((tx) => {
    const emp = tx
      .select({
        pasarelaActual: empresa.pasarelaActual,
        crmSoftware: empresa.crmSoftware,
        owner: empresa.owner,
        proximoPaso: empresa.proximoPaso,
        proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      })
      .from(empresa)
      .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
      .get();
    if (!emp) return; // no existe o vive en otra organizacion: no toca nada

    // Campos de texto de empresa que Notion sobrescribe. `snake` es el nombre real de la
    // columna (lo que va en la accion de sync_cambios); `col` es la key de Drizzle para el
    // set(). owner se pasa tal cual (Notion es la fuente canonica de su casing, no se normaliza).
    const camposTexto = [
      { entrada: datos.pasarela, col: 'pasarelaActual' as const, snake: 'pasarela_actual', actual: emp.pasarelaActual },
      { entrada: datos.crm, col: 'crmSoftware' as const, snake: 'crm_software', actual: emp.crmSoftware },
      { entrada: datos.owner, col: 'owner' as const, snake: 'owner', actual: emp.owner },
      { entrada: datos.proximoPaso, col: 'proximoPaso' as const, snake: 'proximo_paso', actual: emp.proximoPaso },
      { entrada: parseFechaNotion(datos.fechaProximoPaso), col: 'proximoFollowUpFecha' as const, snake: 'proximo_follow_up_fecha', actual: emp.proximoFollowUpFecha },
    ];

    const sets: Record<string, unknown> = {};
    const cambios: { entidad: string; accion: string; detalle: string }[] = [];

    for (const c of camposTexto) {
      if (c.entrada == null) continue; // Notion no trae el campo
      const nuevo = c.entrada.trim();
      if (nuevo === '') continue; // Notion lo trae vacio: no destructivo, se deja el de la DB
      if (nuevo === (c.actual ?? '')) continue; // mismo valor: no hay cambio real que loguear
      sets[c.col] = nuevo;
      cambios.push({ entidad: 'empresa', accion: `sobrescribir:${c.snake}`, detalle: `anterior=${c.actual ?? ''}` });
    }

    if (Object.keys(sets).length > 0) {
      sets.updatedAt = ahora;
      tx.update(empresa)
        .set(sets)
        .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
        .run();
    }

    // Usuarios estimados -> empresa_usuarios (upsert por id_empresa). usuarios_efectivos es
    // columna generada (COALESCE(reales, estimados)): NO se escribe, se recalcula sola. Solo
    // se tocan usuarios_estimados + usuarios_est_fuente='notion' + actualizado_en; usuarios_reales
    // y su fuente quedan intactos si ya existian.
    const usuariosNuevo = parseUsuariosNotion(datos.usuariosEstimados);
    if (usuariosNuevo != null) {
      const usuActual = tx
        .select({ usuariosEstimados: empresaUsuarios.usuariosEstimados })
        .from(empresaUsuarios)
        .where(eq(empresaUsuarios.idEmpresa, idEmpresa))
        .get();
      const anterior = usuActual?.usuariosEstimados ?? null;
      if (anterior !== usuariosNuevo) {
        tx.insert(empresaUsuarios)
          .values({ idEmpresa, usuariosEstimados: usuariosNuevo, usuariosEstFuente: 'notion', actualizadoEn: ahora })
          .onConflictDoUpdate({
            target: empresaUsuarios.idEmpresa,
            set: { usuariosEstimados: usuariosNuevo, usuariosEstFuente: 'notion', actualizadoEn: ahora },
          })
          .run();
        cambios.push({ entidad: 'empresa_usuarios', accion: 'sobrescribir:usuarios_estimados', detalle: `anterior=${anterior ?? ''}` });
      }
    }

    for (const c of cambios) {
      tx.insert(syncCambios)
        .values({
          fecha: ahora,
          corrida: 'enriquecimiento_notion',
          fuente: 'notion',
          entidad: c.entidad,
          idRegistro: idEmpresa,
          accion: c.accion,
          detalle: c.detalle,
        })
        .run();
    }
  });
}

// T14: legacy toques desde la seccion "## Toques" del export de Notion (ver
// app/core/reconciliacion/toquesNotion.ts). Idempotencia: si esta empresa ya tiene
// algun toque con fuente='notion_toques' se asume que esta corrida ya se aplico y no
// se hace nada -- evita duplicar en un segundo `node scripts/importar_toques_legacy.ts`.
export function empresaYaTieneToquesNotionImportados(idEmpresa: string): boolean {
  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(toque)
    .where(and(eq(toque.idEmpresa, idEmpresa), eq(toque.fuente, 'notion_toques')))
    .get();
  return (fila?.n ?? 0) > 0;
}

export function toquesExistentesParaImportarLegacy(idEmpresa: string): ToqueDbExistente[] {
  return db
    .select({ idToque: toque.idToque, quePaso: toque.quePaso, fuente: toque.fuente })
    .from(toque)
    .where(eq(toque.idEmpresa, idEmpresa))
    .orderBy(toque.idToque)
    .all();
}

// Aplica el plan de planificarImportacionToques ya calculado por el caller (el script
// hace el match empresa Notion <-> empresa DB y arma el plan; esta funcion solo
// escribe). 'actualizar' enriquece el placeholder del baseline EN EL MISMO REGISTRO
// (no duplica el evento); 'insertar' crea un toque nuevo para una fila que el baseline
// nunca sembro. transcriptTexto (p.ej. "Resumen en Granola", sin URL real) se guarda en
// que_paso como nota final -- no hay columna de nota de transcript aparte.
export function aplicarImportacionToquesLegacy(idEmpresa: string, idOrganizacion: number, acciones: AccionImportacionToque[]): void {
  const ahora = new Date().toISOString();

  db.transaction((tx) => {
    for (const a of acciones) {
      const quePasoFinal = a.fila.transcriptTexto
        ? `${a.fila.quePaso} (${a.fila.transcriptTexto})`
        : a.fila.quePaso;

      if (a.accion === 'actualizar') {
        tx.update(toque)
          .set({
            fecha: a.fila.fechaRaw,
            canal: a.fila.canal ?? undefined,
            quePaso: quePasoFinal,
            transcriptUrl: a.fila.transcriptUrl,
            transcriptProveedor: a.fila.transcriptUrl ? 'tldv' : null,
            fuente: 'notion_toques',
          })
          .where(eq(toque.idToque, a.idToque))
          .run();
      } else {
        tx.insert(toque)
          .values({
            idEmpresa,
            fecha: a.fila.fechaRaw,
            canal: a.fila.canal,
            quePaso: quePasoFinal,
            transcriptUrl: a.fila.transcriptUrl,
            transcriptProveedor: a.fila.transcriptUrl ? 'tldv' : null,
            fuente: 'notion_toques',
            idOrganizacion,
            createdAt: ahora,
          })
          .run();
      }
    }
  });
}

// --- Empujón manual de envíos (tool empujar_envios, 2026-07-28) -------------------------
//
// El movimiento que faltaba y que no tenía rodeo barato: "esto que ya está inscrito y
// pendiente, mandalo AHORA". Hasta hoy la única forma de empujar desde el MCP era
// lanzar_campana, que exige estado 'borrador' -- y el borrador dura minutos, porque la primera
// inscripción (inscribirEmpresaEnCadencia, o sea cambiar_cadencia) ya pone la campaña en
// 'activa'. O sea que inscribir cuenta por cuenta cerraba para siempre la puerta del empujón
// manual, en silencio, y no quedaba más que esperar la ventana de 8:00-18:00 del día siguiente.
//
// Tres funciones, y ninguna decide sola si un paso sale:
//   - candidatosEmpujon: LEE los pasos del blanco con todo lo que hace falta para explicar un
//     "no sale". No filtra: devuelve también los que no van a salir, que son los que importan.
//   - adelantarEnvios: ESCRIBE, en una transacción, el adelanto explícito (materializar el paso
//     que toca o bajarle la fecha a ahora). Es el opt-in que convierte "programado para mañana"
//     en "sale ya".
//   - pasoInscripcionesPendientesDe: la cola real, acotada a un set de ids. Filtra sobre
//     pasoInscripcionesPendientes en vez de copiar sus condiciones: los siete gates (campaña
//     activa, es_manual sin aprobar, backoff, intentos, fecha programada, proveedor_campana_id,
//     línea del dueño) se aplican una sola vez y en un solo lugar. El volumen de un empujón
//     manual es de unidades: filtrar en memoria no cuesta nada y no puede desincronizarse.

export type SelectorEmpujon = {
  idCampana?: number;
  idsInscripcion?: number[];
  idsEmpresa?: string[];
};

// Cada campo presente ESTRECHA (AND), no suma. {idCampana: 58, idsEmpresa: ['x']} es "lo de x
// dentro de la campaña 58", no "todo 58 más todo x". Un selector que suma es el que manda de
// más, y de más es el error que no se deshace.
function condicionesSelector(sel: SelectorEmpujon, idOrganizacion: number): SQL[] {
  const cond: SQL[] = [eq(campana.idOrganizacion, idOrganizacion)];
  if (sel.idCampana !== undefined) cond.push(eq(inscripcion.idCampana, sel.idCampana));
  if (sel.idsInscripcion !== undefined && sel.idsInscripcion.length > 0) cond.push(inArray(inscripcion.idInscripcion, sel.idsInscripcion));
  if (sel.idsEmpresa !== undefined && sel.idsEmpresa.length > 0) cond.push(inArray(inscripcion.idEmpresa, sel.idsEmpresa));
  return cond;
}

export function selectorVacio(sel: SelectorEmpujon): boolean {
  return (
    sel.idCampana === undefined &&
    (sel.idsInscripcion === undefined || sel.idsInscripcion.length === 0) &&
    (sel.idsEmpresa === undefined || sel.idsEmpresa.length === 0)
  );
}

export type CandidatoEmpujon = {
  idPasoInscripcion: number;
  idCampana: number;
  campana: string | null;
  estadoCampana: string;
  owner: string | null;
  idInscripcion: number;
  estadoInscripcion: string;
  idEmpresa: string;
  empresa: string | null;
  idDestinatario: number;
  estadoDestinatario: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  orden: number;
  canal: string;
  esManual: boolean;
  estadoPaso: string;
  intentos: number;
  fechaProgramada: string | null;
  proximoIntento: string | null;
  aprobadoEn: string | null;
  fechaEnviada: string | null;
  proveedorCampanaId: string | null;
  aprobadaEnvioGmail: boolean;
  proveedorCorreo: 'gmail' | 'apollo' | null;
  lineaWhatsappDelOwner: boolean;
};

// Sólo lo que todavía puede salir. 'enviada' y 'omitida' quedan fuera a propósito: no son
// candidatos de nada, y meterlas obligaría a quien lee el resultado a filtrarlas de nuevo.
const ESTADOS_CANDIDATOS_EMPUJON = ['pendiente', 'fallo', 'enviando'];

export function candidatosEmpujon(sel: SelectorEmpujon, idOrganizacion: number): CandidatoEmpujon[] {
  const filas = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      idCampana: campana.idCampana,
      campana: campana.nombre,
      estadoCampana: campana.estado,
      owner: campana.owner,
      proveedorCampanaId: campana.proveedorCampanaId,
      aprobadaEnvioGmail: campana.aprobadaEnvioGmail,
      idInscripcion: inscripcion.idInscripcion,
      estadoInscripcion: inscripcion.estado,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      idDestinatario: destinatario.idDestinatario,
      estadoDestinatario: destinatario.estado,
      contacto: contacto.nombre,
      email: contacto.email,
      telefono: contacto.telefono,
      orden: pasoCadencia.orden,
      esManual: pasoCadencia.esManual,
      canal: pasoInscripcion.canal,
      estadoPaso: pasoInscripcion.estado,
      intentos: pasoInscripcion.intentos,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      proximoIntento: pasoInscripcion.proximoIntento,
      aprobadoEn: pasoInscripcion.aprobadoEn,
      fechaEnviada: pasoInscripcion.fechaEnviada,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(and(...condicionesSelector(sel, idOrganizacion), inArray(pasoInscripcion.estado, ESTADOS_CANDIDATOS_EMPUJON)))
    .orderBy(inscripcion.idInscripcion, pasoCadencia.orden)
    .all();

  // Cache por owner: varias filas de la misma campaña comparten dueño y las dos resoluciones
  // (Gmail verificado, línea de WhatsApp) son joins que no vale la pena repetir por fila. Mismo
  // criterio que ya usa pasoInscripcionesPendientes para whatsapp.
  const cacheCorreo = new Map<string, 'gmail' | 'apollo'>();
  const cacheLinea = new Map<string, boolean>();

  return filas.map((f) => {
    const clave = `${idOrganizacion}:${f.owner ?? ''}`;
    if (!cacheCorreo.has(clave)) {
      const idUsuario = idUsuarioDeOwner(f.owner, idOrganizacion);
      cacheCorreo.set(clave, idUsuario && gmailVerificadoDe(idUsuario) ? 'gmail' : 'apollo');
    }
    if (!cacheLinea.has(clave)) cacheLinea.set(clave, lineaWhatsappActivaDeOwner(f.owner, idOrganizacion) !== null);
    return {
      ...f,
      esManual: f.esManual === 1,
      aprobadaEnvioGmail: f.aprobadaEnvioGmail === 1,
      proveedorCorreo: f.canal === 'correo' ? cacheCorreo.get(clave)! : null,
      lineaWhatsappDelOwner: cacheLinea.get(clave)!,
    };
  });
}

export type PasoAdelantado = {
  idPasoInscripcion: number;
  idInscripcion: number;
  idEmpresa: string;
  empresa: string | null;
  orden: number;
  canal: string;
  accion: 'materializado' | 'reprogramado';
  fechaProgramadaAntes: string | null;
  fechaProgramadaAhora: string;
};

export type SaltadoAdelanto = { idInscripcion: number; idEmpresa: string; motivo: string };

export type ResultadoAdelanto = { adelantados: PasoAdelantado[]; saltados: SaltadoAdelanto[] };

// Adelanta UN paso por inscripción y ni uno más. Recorre la cadencia en orden y se queda con el
// primero que no esté 'enviada'/'omitida':
//   - si no tiene fila todavía, la crea 'pendiente' con fecha_programada = ahora;
//   - si ya la tiene y está en el futuro, le baja la fecha (y le limpia el backoff).
// Ese "uno y paro" es la misma regla anti-ráfaga de proximoPasoDebido: adelantar no puede
// convertirse en mandar la cadencia entera de golpe.
//
// NO reusa materializarPasosDebidos, y es la diferencia que da sentido a esta función: aquella
// contesta "qué toca HOY según el calendario" y ésta es justamente el override de ese calendario,
// pedido a mano y acotado a un blanco. Encima el calendario tiene un agujero medido el 2026-07-28
// (fecha_inscripcion se guarda en UTC y se compara contra el día de Bogotá, así que una
// inscripción hecha después de las 19:00 queda anclada a mañana y su paso día 0 no se materializa
// esa noche): con el override, ese agujero deja de dejar al operador sin salida.
//
// El canal se resuelve con las MISMAS funciones del dominio que usa el materializador
// (canalesDisponibles + readinessEmpresa contra la regla de la campaña). Un paso que queda sin
// canal NO se escribe como 'omitida' desde acá: se reporta saltado. Escribir una omisión sería
// consumir un paso de la cadencia por una decisión que nadie pidió.
export function adelantarEnvios(sel: SelectorEmpujon, idOrganizacion: number, ahora: string = new Date().toISOString()): ResultadoAdelanto {
  if (selectorVacio(sel)) throw new Error('adelantarEnvios: hace falta un blanco (idCampana, idsInscripcion o idsEmpresa). Sin blanco no se adelanta nada');

  const objetivo = db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      estadoInscripcion: inscripcion.estado,
      idCampana: campana.idCampana,
      estadoCampana: campana.estado,
      idCadencia: campana.idCadencia,
      reglaFaltante: campana.reglaFaltante,
    })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(and(...condicionesSelector(sel, idOrganizacion)))
    .orderBy(inscripcion.idInscripcion)
    .all();

  const adelantados: PasoAdelantado[] = [];
  const saltados: SaltadoAdelanto[] = [];

  db.transaction((tx) => {
    for (const ins of objetivo) {
      if (ins.estadoCampana !== 'activa') {
        saltados.push({
          idInscripcion: ins.idInscripcion,
          idEmpresa: ins.idEmpresa,
          motivo:
            ins.estadoCampana === 'borrador'
              ? `la campaña ${ins.idCampana} sigue en 'borrador': eso lo arranca lanzar_campana, no un empujón`
              : `la campaña ${ins.idCampana} está en '${ins.estadoCampana}': la cola sólo mira campañas 'activa'`,
        });
        continue;
      }
      if (ins.estadoInscripcion !== 'activa') {
        saltados.push({ idInscripcion: ins.idInscripcion, idEmpresa: ins.idEmpresa, motivo: `la inscripción está en '${ins.estadoInscripcion}', no activa` });
        continue;
      }

      const dest = tx
        .select({ id: destinatario.idDestinatario, idContacto: destinatario.idContacto })
        .from(destinatario)
        .where(and(eq(destinatario.idInscripcion, ins.idInscripcion), eq(destinatario.estado, 'activo')))
        .get();
      if (!dest) {
        saltados.push({ idInscripcion: ins.idInscripcion, idEmpresa: ins.idEmpresa, motivo: 'la inscripción no tiene destinatario activo: no hay a quién mandarle' });
        continue;
      }

      const pasos = tx
        .select({ idPaso: pasoCadencia.idPaso, orden: pasoCadencia.orden, canal: pasoCadencia.canal })
        .from(pasoCadencia)
        .where(eq(pasoCadencia.idCadencia, ins.idCadencia))
        .orderBy(pasoCadencia.orden)
        .all();
      if (pasos.length === 0) {
        saltados.push({ idInscripcion: ins.idInscripcion, idEmpresa: ins.idEmpresa, motivo: `la cadencia ${ins.idCadencia} no tiene pasos` });
        continue;
      }

      const filasPaso = tx
        .select({
          idPaso: pasoInscripcion.idPaso,
          idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
          estado: pasoInscripcion.estado,
          canal: pasoInscripcion.canal,
          fechaProgramada: pasoInscripcion.fechaProgramada,
        })
        .from(pasoInscripcion)
        .where(eq(pasoInscripcion.idDestinatario, dest.id))
        .all();
      const porPaso = new Map(filasPaso.map((f) => [f.idPaso, f]));

      const siguiente = pasos.find((p) => {
        const fila = porPaso.get(p.idPaso);
        return !fila || (fila.estado !== 'enviada' && fila.estado !== 'omitida');
      });
      if (!siguiente) {
        saltados.push({ idInscripcion: ins.idInscripcion, idEmpresa: ins.idEmpresa, motivo: 'la cadencia ya terminó: todos los pasos están enviados u omitidos' });
        continue;
      }

      const fila = porPaso.get(siguiente.idPaso);
      if (fila) {
        if (fila.estado === 'enviando') {
          saltados.push({
            idInscripcion: ins.idInscripcion,
            idEmpresa: ins.idEmpresa,
            motivo: `el paso ${fila.idPasoInscripcion} está en 'enviando': se cayó a mitad de un envío anterior y adelantarlo podría mandarlo dos veces`,
          });
          continue;
        }
        if (fila.fechaProgramada !== null && fila.fechaProgramada <= ahora) {
          saltados.push({
            idInscripcion: ins.idInscripcion,
            idEmpresa: ins.idEmpresa,
            motivo: `el paso ${fila.idPasoInscripcion} ya estaba vencido (programado ${fila.fechaProgramada}): no hace falta adelantarlo, el empujón se lo lleva igual`,
          });
          continue;
        }
        // proximo_intento a null además de la fecha: un 'fallo' con backoff pendiente no saldría
        // aunque la fecha programada ya esté en el pasado. "Mandalo ahora" quiere decir las dos.
        tx.update(pasoInscripcion)
          .set({ fechaProgramada: ahora, proximoIntento: null })
          .where(eq(pasoInscripcion.idPasoInscripcion, fila.idPasoInscripcion))
          .run();
        adelantados.push({
          idPasoInscripcion: fila.idPasoInscripcion,
          idInscripcion: ins.idInscripcion,
          idEmpresa: ins.idEmpresa,
          empresa: ins.empresa,
          orden: siguiente.orden,
          canal: fila.canal,
          accion: 'reprogramado',
          fechaProgramadaAntes: fila.fechaProgramada,
          fechaProgramadaAhora: ahora,
        });
        continue;
      }

      const contactosEmpresa = tx
        .select({ email: contacto.email, telefono: contacto.telefono })
        .from(contacto)
        .where(eq(contacto.idEmpresa, ins.idEmpresa))
        .all();
      const readiness = readinessEmpresa(
        canalesDisponibles(contactosEmpresa),
        pasos.map((p) => ({ orden: p.orden, canal: p.canal as Canal })),
        ins.reglaFaltante as ReglaFaltante,
      );
      if (readiness.pasosSinCanal.includes(siguiente.orden)) {
        saltados.push({
          idInscripcion: ins.idInscripcion,
          idEmpresa: ins.idEmpresa,
          motivo: `el paso ${siguiente.orden} es de ${siguiente.canal} y la empresa no tiene ese canal; la regla de la campaña es '${ins.reglaFaltante}', así que no hay por dónde mandarlo`,
        });
        continue;
      }
      const canalFinal = readiness.reemplazos.find((r) => r.orden === siguiente.orden)?.a ?? siguiente.canal;

      const insertado = tx
        .insert(pasoInscripcion)
        .values({
          idDestinatario: dest.id,
          idPaso: siguiente.idPaso,
          idVersion: versionActivaDePaso(siguiente.idPaso),
          canal: canalFinal,
          estado: 'pendiente',
          fechaProgramada: ahora,
          createdAt: ahora,
        })
        .run();
      adelantados.push({
        idPasoInscripcion: Number(insertado.lastInsertRowid),
        idInscripcion: ins.idInscripcion,
        idEmpresa: ins.idEmpresa,
        empresa: ins.empresa,
        orden: siguiente.orden,
        canal: canalFinal,
        accion: 'materializado',
        fechaProgramadaAntes: null,
        fechaProgramadaAhora: ahora,
      });
    }
  });

  return { adelantados, saltados };
}

// La cola real acotada a un set de ids. Filtra sobre pasoInscripcionesPendientes en vez de
// repetir sus condiciones: es la única forma de garantizar que "lo que el empujón manda" y "lo
// que el worker mandaría" salgan del mismo criterio, hoy y cuando ese criterio cambie.
export function pasoInscripcionesPendientesDe(canal: Canal, ids: number[], ahora: string = new Date().toISOString()): FilaPasoInscripcion[] {
  if (ids.length === 0) return [];
  const permitidos = new Set(ids);
  return pasoInscripcionesPendientes(canal, ahora).filter((f) => permitidos.has(f.idPasoInscripcion));
}

// El otro lado del blanco: las INSCRIPCIONES que alcanza, con cuántos pasos tienen ya
// materializados. Existe porque candidatosEmpujon mira paso_inscripcion, y el caso que más duele
// es justamente el de la inscripción que todavía no tiene NINGUNA fila ahí: sin esto, el seco de
// un empujón diría "no hay nada que empujar" para una campaña que tiene gente adentro esperando.
export type InscripcionEmpujable = {
  idInscripcion: number;
  idEmpresa: string;
  empresa: string | null;
  estadoInscripcion: string;
  idCampana: number;
  campana: string | null;
  estadoCampana: string;
  tieneDestinatarioActivo: boolean;
  pasosMaterializados: number;
  pasosVivos: number; // pendiente/fallo/enviando: lo que todavía puede salir
  pasosCadencia: number;
};

export function inscripcionesEmpujables(sel: SelectorEmpujon, idOrganizacion: number): InscripcionEmpujable[] {
  return db
    .select({
      idInscripcion: inscripcion.idInscripcion,
      idEmpresa: inscripcion.idEmpresa,
      empresa: empresa.nombreOficial,
      estadoInscripcion: inscripcion.estado,
      idCampana: campana.idCampana,
      campana: campana.nombre,
      estadoCampana: campana.estado,
      tieneDestinatarioActivo: sql<number>`exists (select 1 from destinatario d where d.id_inscripcion = ${inscripcion.idInscripcion} and d.estado = 'activo')`,
      pasosMaterializados: sql<number>`(select count(*) from paso_inscripcion pi join destinatario d on d.id_destinatario = pi.id_destinatario where d.id_inscripcion = ${inscripcion.idInscripcion})`,
      pasosVivos: sql<number>`(select count(*) from paso_inscripcion pi join destinatario d on d.id_destinatario = pi.id_destinatario where d.id_inscripcion = ${inscripcion.idInscripcion} and pi.estado in ('pendiente','fallo','enviando'))`,
      pasosCadencia: sql<number>`(select count(*) from paso_cadencia pc where pc.id_cadencia = ${campana.idCadencia})`,
    })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .where(and(...condicionesSelector(sel, idOrganizacion)))
    .orderBy(inscripcion.idInscripcion)
    .all()
    .map((f) => ({ ...f, tieneDestinatarioActivo: f.tieneDestinatarioActivo === 1 }));
}
