import {
  and,
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
  organizacionMiembro,
  empresaClasificacion,
  empresaCategoriaView,
  identidadDecision,
} from './schema';
import type { CambioNotion } from '../core/ports/sync';
import type { FilaOutbox } from '../core/outbox';
import type { CadenciaParseada } from '../core/cadencia-parser';
import { previsualizarInscripcion, type PasoRequerido, type PasoAjustado, type EstadoPreviewInscripcion } from '../core/preview-inscripcion';
import { calcularGoteo, type RitmoIngreso } from '../core/goteo';
import { proximoPasoDebido, type ConfigCalendario } from '../core/motor-cadencia';
import { MAX_INTENTOS, type FilaPasoInscripcion } from '../core/push';
import type { CampanaConSecuencia, DestinatarioResuelto } from '../core/tracking';
import type { MensajeEntrante, ContactoMatch, InscripcionActiva } from '../core/llego-respuesta';
import type { EventoProveedor, PasoParaSincronizar, PasoSincronizado } from '../core/ports/envio';
import { restarUnDia } from '../core/actividad';
import { normalizarFechaToque } from '../core/fecha-toque';
import { canalesDisponibles, readinessEmpresa, type Readiness, type ReglaFaltante } from '../core/canales-empresa';
import { aplicaBuclePBX, estaEnPBX, sugerirEscalar, type ContactoPBX, type PasoPropuesto } from '../core/pbx';
import { cifrar, descifrar } from '../lib/crypto';
import type { SesionTranscript } from '../core/ports/transcript';
import { ESTADOS_CALIENTES, ESTADOS_ACTIVOS } from './funnel';
import type { CampoCalificacion } from '../core/calificacion';
import { CLAVE_SIN_ETAPA, type ConteoEtapa } from '../core/embudo';
import { clasificarCargo } from '../core/reconciliacion/clasificarCargo';
import { esKdmDesdeNotion } from '../core/reconciliacion/kdmNotion';
import type { AccionImportacionToque, ToqueDbExistente } from '../core/reconciliacion/toquesNotion';
import {
  registrarToqueSchema,
  type RegistrarToqueInput,
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
  RESULTADOS,
  RESULTADO_LABELS,
  type Canal,
  type Resultado,
  RITMOS_INGRESO,
  type RitmoIngresoInput,
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
function encolarOutboxNotion(tx: Tx, idEmpresa: string, cambio: Omit<CambioNotion, 'notionPageId'>) {
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
const CANAL_LEGIBLE: Record<Canal, string> = {
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  correo: 'Correo',
};

// Tarea 6: arma la tabla en texto plano de "toques hechos" que se manda a Notion (una
// linea por toque, mas reciente primero). RESULTADO_LABELS ya es el mapeo compartido con
// la UI (page.tsx), reusarlo aqui evita un segundo lugar con el mismo texto duplicado.
function renderToquesHechos(filas: { fecha: string | null; canal: string | null; resultado: string | null }[]): string {
  return filas
    .map((f) => {
      const fecha = f.fecha ? f.fecha.slice(0, 10) : '?';
      const canal = f.canal && f.canal in CANAL_LEGIBLE ? CANAL_LEGIBLE[f.canal as Canal] : (f.canal ?? '?');
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

// Bucket "Cierres" del split de cola: estados calientes (ESTADOS_CALIENTES), sin filtro de
// fecha -- una cuenta en negociacion no es "vencida" solo porque no tiene fecha puesta.
// Ordena por fecha si la tiene; las sin fecha van al final (NULL primero en SQLite ASC, por
// eso el CASE explicito).
export function colaCierres(owner: string, idOrganizacion: number) {
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
        // La reunion_agendada con no-show pendiente se muestra en Reagendar, no aqui.
        sql`NOT (${empresa.estadoNotion} = 'reunion_agendada' AND ${ultimoResultadoNoLlego})`,
      ),
    )
    .orderBy(sql`${empresa.proximoFollowUpFecha} IS NULL`, empresa.proximoFollowUpFecha)
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

// Seccion "Contacto iniciado sin seguimiento" (2026-07-14): empresas en contacto_iniciado
// que no se van a meter a ninguna cadencia por ahora y hoy son invisibles -- colaDelDia
// exige fecha, esta no la tiene. General para cualquier owner (no gateado como el split de
// /cola). Lista fija (sin filtro de fecha), mismo patron que colaCierres/colaReagendar.
export function colaContactoIniciadoSinSeguimiento(owner: string, idOrganizacion: number) {
  return db
    .select(columnasCola)
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        eq(empresa.estadoNotion, 'contacto_iniciado'),
        isNull(empresa.proximoFollowUpFecha),
        notExists(
          db
            .select({ x: sql`1` })
            .from(inscripcion)
            .where(and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa'))),
        ),
      ),
    )
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
export function pipelineSinCadencia(
  idOrganizacion: number,
  hoy: string,
  owner: string,
): FilaPipelineSinCadencia[] {
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
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        sql`COALESCE(${empresa.estadoNotion}, '') NOT IN ('on_hold', 'firma_pago')`,
        notExists(
          db
            .select({ x: sql`1` })
            .from(inscripcion)
            .where(and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa'))),
        ),
      ),
    )
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

// Registrar un toque: escribe el evento (toque) y actualiza el estado actual (empresa). Atómico.
// La regla de negocio (4 salidas cerradas, razonPerdida obligatoria si contesto_no) es de
// DOMINIO y se enforza aquí con Zod, no en la UI: cualquier caller futuro (ingest worker,
// EnvioAdapter) pasa por esta misma garantía. `.parse()` lanza si el input no cumple.
export function registrarToque(input: RegistrarToqueInput, idOrganizacion: number) {
  const parsed = registrarToqueSchema.parse(input);
  const ahora = new Date().toISOString();

  db.transaction((tx) => {
    // Guard de organizacion (Parte 1): un toque solo se registra sobre un lead cuya
    // organizacion_activa_id coincide con la del que llama. Evita que dos organizaciones
    // se pisen el estado de un lead compartido por error (ver spec 2026-07-09).
    const emp = tx
      .select({ organizacionActivaId: empresa.organizacionActivaId })
      .from(empresa)
      .where(eq(empresa.idEmpresa, parsed.idEmpresa))
      .get();
    if (!emp) throw new Error(`Empresa ${parsed.idEmpresa} no existe`);
    if (emp.organizacionActivaId !== idOrganizacion) {
      throw new Error(
        `La empresa ${parsed.idEmpresa} esta activa en otra organizacion, no en ${idOrganizacion}`,
      );
    }

    // KDM opcional: upsert en contacto ANTES del insert del toque, para poder enlazar
    // toque.idContacto. Matching: mismo idEmpresa + mismo telefono exacto si viene telefono;
    // si no hay telefono, no hay match posible (el nombre no es clave confiable) -> insertar.
    let idContacto: number | null = null;
    if (parsed.kdm) {
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

    tx.insert(toque)
      .values({
        idEmpresa: parsed.idEmpresa,
        idContacto,
        fecha: ahora,
        canal: parsed.canal,
        resultado: parsed.resultado,
        quePaso: parsed.quePaso ?? null,
        proximoFollowUpFecha: parsed.proximoFollowUp ?? null,
        razonPerdida: parsed.razonPerdida ?? null,
        objecion: parsed.objecion ?? null,
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
      fechaUltimoContacto: ahora.slice(0, 10),
      ...(esPrimerToque ? { fechaPrimerContacto: ahora.slice(0, 10) } : {}),
      toquesHechos: renderToquesHechos(todosLosToques),
    });

    if (parsed.usuarios != null && !Number.isNaN(parsed.usuarios)) {
      tx.insert(empresaUsuarios)
        .values({ idEmpresa: parsed.idEmpresa, usuariosEstimados: parsed.usuarios })
        .onConflictDoUpdate({ target: empresaUsuarios.idEmpresa, set: { usuariosEstimados: parsed.usuarios } })
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
    db.insert(empresaUsuarios)
      .values({ idEmpresa, usuariosEstimados: usuarios })
      .onConflictDoUpdate({ target: empresaUsuarios.idEmpresa, set: { usuariosEstimados: usuarios } })
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
  porCanal: Record<Canal, number>;
  porResultado: Record<Resultado, number>;
  total: number;
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
    .select({ canal: toque.canal, resultado: toque.resultado })
    .from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(and(...condiciones))
    .all();

  const porCanal = Object.fromEntries(CANALES.map((c) => [c, 0])) as Record<Canal, number>;
  const porResultado = Object.fromEntries(RESULTADOS.map((r) => [r, 0])) as Record<Resultado, number>;

  // Decisión a propósito: `total` cuenta TODOS los toques de hoy del owner, incluyendo
  // cualquier valor legado de canal/resultado que no esté en el enum actual (ej. el
  // "contesto" viejo pre-V1.2 visto en V1.3). Los buckets de porCanal/porResultado solo
  // cuentan los valores reconocidos del enum actual, así que un toque con valor legado
  // sube el total pero no incrementa ningún bucket. Esto puede verse como un descuadre
  // (total > suma de buckets), pero es intencional: perder de vista un toque real del día
  // (no contarlo en total) sería peor que un descuadre visible entre el total y sus buckets.
  for (const fila of filas) {
    if (fila.canal && (CANALES as readonly string[]).includes(fila.canal)) {
      porCanal[fila.canal as Canal] += 1;
    }
    if (fila.resultado && (RESULTADOS as readonly string[]).includes(fila.resultado)) {
      porResultado[fila.resultado as Resultado] += 1;
    }
  }

  return { porCanal, porResultado, total: filas.length };
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
  const dias: string[] = [];
  const d = new Date();
  while (dias.length < necesarios) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dias.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
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

  return db.transaction((tx) => {
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
  });
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
    tx.update(inscripcion)
      .set({ estado: 'finalizada', motivoFin: 'campana cancelada', fechaFin: ahora, updatedAt: ahora })
      .where(and(eq(inscripcion.idCampana, idCampana), eq(inscripcion.estado, 'activa')))
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
      ? calcularGoteo(idsElegiblesEnOrden.length, intakeDiario, camp.ritmoIngreso as RitmoIngreso, camp.fechaInicio ?? ahora.slice(0, 10))
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
    fechaProgramadaPorEmpresa.set(id, fechaPorPosicion[i] ?? ahora.slice(0, 10));
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
export function kpisPipeline(idOrganizacion: number, hoy: string): KpisPipeline {
  const orgActiva = and(eq(campana.idOrganizacion, idOrganizacion), eq(campana.estado, 'activa'));

  const enSecuencia = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(orgActiva, eq(inscripcion.estado, 'activa')))
    .get()?.n ?? 0;

  const entrandoHoy = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(orgActiva, eq(inscripcion.estado, 'activa'), sql`substr(${inscripcion.fechaInscripcion}, 1, 10) = ${hoy}`))
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
      ),
    )
    .get()?.n ?? 0;

  const onHold = db
    .select({ n: sql<number>`count(*)` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(campana.idOrganizacion, idOrganizacion), eq(inscripcion.estado, 'pausada')))
    .get()?.n ?? 0;

  const cerradasOptOut = db
    .select({ n: sql<number>`count(*)` })
    .from(destinatario)
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .where(and(eq(campana.idOrganizacion, idOrganizacion), eq(destinatario.estado, 'salio')))
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
export function pipelineGlobal(idOrganizacion: number, hoy: string, idCampana?: number): FilaPipelineGlobal[] {
  const condiciones = [eq(campana.idOrganizacion, idOrganizacion), eq(inscripcion.estado, 'activa'), EMPRESA_VIVA];
  if (idCampana != null) condiciones.push(eq(inscripcion.idCampana, idCampana));

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

  return {
    empresa: emp.nombre ?? idEmpresa,
    ciudad: emp.ciudad,
    categoria: emp.categoria,
    campana: inscripcionActiva?.campana ?? null,
    contactos: contactos.map((c) => ({ ...c, esPrincipal: c.esPrincipal === 1 })),
    toques,
    secuencia: ctx.secuencia,
    proximoToque: detalle?.proximoToque ?? null,
  };
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

    // fecha_inscripcion se guarda como ISO datetime completo; el motor trabaja con
    // fecha "YYYY-MM-DD", por eso el slice(0, 10).
    const anchor = (a.anchor ?? hoy).slice(0, 10);
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
    const anchor = (insc.anchor ?? hoy).slice(0, 10);

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
        .map((h) => ({ orden: h.orden, fechaReal: (h.fechaEnviada ?? h.fechaProgramada ?? hoy).slice(0, 10) }));

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
export function enviosGmailHoy(idUsuario: string, idOrganizacion: number, hoy: string): number {
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
        sql`substr(${pasoInscripcion.fechaEnviada}, 1, 10) = ${hoy}`,
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
      .set({ estado: 'enviada', proveedor, proveedorMensajeId, fechaEnviada })
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
export function pasoInscripcionesPendientes(canal: Canal, ahora: string = new Date().toISOString()): FilaPasoInscripcion[] {
  const condiciones = [
    eq(pasoInscripcion.canal, canal),
    inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
    // V5.6: un paso manual (Tier 1) NUNCA lo dispara el push automatico. Espera
    // revision humana via aprobarPasoManual, sin importar cuantos dias pasen.
    eq(pasoCadencia.esManual, 0),
    // Fase 7 (pausar campana): defensa en profundidad -- si un paso ya quedo
    // pendiente ANTES de pausar, esto evita que igual se empuje al proveedor.
    eq(campana.estado, 'activa'),
    sql`${pasoInscripcion.intentos} < ${MAX_INTENTOS}`,
    sql`(${pasoInscripcion.proximoIntento} IS NULL OR ${pasoInscripcion.proximoIntento} <= ${ahora})`,
  ];
  // correo: sin secuencia externa (proveedor_campana_id) no hay a donde mandar. whatsapp
  // no usa esta columna -- su gate de "hay a donde mandar" se resuelve por fila mas abajo.
  if (canal !== 'whatsapp') condiciones.push(isNotNull(campana.proveedorCampanaId));

  const filas = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      intentos: pasoInscripcion.intentos,
      canal: pasoInscripcion.canal,
      email: contacto.email,
      telefono: contacto.telefono,
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      empresaNombre: empresa.nombreOficial,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
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
    return filas.map((f) => ({
      idPasoInscripcion: f.idPasoInscripcion,
      proveedorCampanaId: f.proveedorCampanaId as string,
      destinatario: { email: f.email, telefono: f.telefono, nombre: f.nombre, empresa: f.empresaNombre, cargo: f.cargo },
      paso: { asunto: f.asunto, cuerpo: f.cuerpo ?? '', canal: f.canal },
      intentos: f.intentos,
      owner: f.owner,
      idOrganizacion: f.idOrganizacion,
      aprobadaEnvioGmail: f.aprobadaEnvioGmail === 1,
    }));
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
      paso: { asunto: f.asunto, cuerpo: f.cuerpo ?? '', canal: f.canal },
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
export function marcarPasoInscripcionEnviada(idPasoInscripcion: number, proveedor: string, proveedorMensajeId: string, fechaEnviada: string) {
  db.update(pasoInscripcion)
    .set({ estado: 'enviada', proveedor, proveedorMensajeId, fechaEnviada })
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
    .select({ canal: pasoInscripcion.canal, idContacto: destinatario.idContacto, idEmpresa: inscripcion.idEmpresa })
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
        quePaso: cuerpoFinal ?? null,
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
export function campanasConSecuencia(): CampanaConSecuencia[] {
  return db
    .select({ idCampana: campana.idCampana, proveedorCampanaId: campana.proveedorCampanaId })
    .from(campana)
    .where(isNotNull(campana.proveedorCampanaId))
    .all()
    .map((c) => ({ idCampana: c.idCampana, proveedorCampanaId: c.proveedorCampanaId as string }));
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

// pausada es un estado nuevo (no 'finalizada'): B6 pide que una reply o un
// agotamiento de destinatarios frene la cadencia de inmediato, con motivo visible;
// agendaEnSeco solo lee estado='activa', asi que pausada sale sola del calculo.
export function pausarInscripcion(idInscripcion: number, motivo: string) {
  const ahora = new Date().toISOString();
  db.update(inscripcion)
    .set({ estado: 'pausada', motivoFin: motivo, fechaFin: ahora, updatedAt: ahora })
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

export type FilaActividad = {
  idPasoInscripcion: number;
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

export function sacarInscripcionDeCampana(idInscripcion: number) {
  pausarInscripcion(idInscripcion, 'baja manual desde destinatarios');
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
export function empresasConRespuestaPendiente(idOrganizacion: number): FilaRespuestaPendiente[] {
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
    .where(and(isNull(notificacionRespuesta.vistaEn), eq(empresa.organizacionActivaId, idOrganizacion)))
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
      telefono: mensaje.telefono,
      texto: mensaje.texto,
      idContacto,
      fecha: mensaje.fecha,
      createdAt: new Date().toISOString(),
    })
    .run();
  return 'insertado';
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
    .where(and(eq(mensajeWhatsapp.referenciaProveedor, referenciaProveedor), gt(mensajeWhatsapp.createdAt, desde)))
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

const enRango = (desde: string, hasta: string): SQL =>
  sql`substr(${toque.fecha}, 1, 10) >= ${desde} AND substr(${toque.fecha}, 1, 10) <= ${hasta}`;

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

export function toquesPorCanal(desde: string, hasta: string, owner?: string): Record<Canal, number> {
  const filas = !owner
    ? db.select({ canal: toque.canal, n: sql<number>`count(*)` }).from(toque).where(enRango(desde, hasta)).groupBy(toque.canal).all()
    : db.select({ canal: toque.canal, n: sql<number>`count(*)` }).from(toque)
        .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
        .where(and(enRango(desde, hasta), eq(empresa.owner, owner))).groupBy(toque.canal).all();
  const out = Object.fromEntries(CANALES.map((c) => [c, 0])) as Record<Canal, number>;
  for (const f of filas) if (f.canal && f.canal in out) out[f.canal as Canal] = f.n;
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
    return { emp, principal, toques, secuencia: [], objetivo: null, idPasoInscripcionActivo: null, pbx };
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

  return { emp, principal, toques, secuencia, objetivo: objetivoActivo, idPasoInscripcionActivo, pbx };
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

// Cambia la etapa comercial de una empresa y registra la transicion en el historico,
// en una sola transaccion (patron Outbox ligero). Si la etapa no cambia, no registra.
// Este es el UNICO camino de escritura de estado_notion: el sync de Notion debe llamarlo
// (no un UPDATE suelto), asi el historico nunca se pierde una transicion.
export function actualizarEstadoNotion(
  idEmpresa: string,
  estadoNuevo: string,
  idOrganizacion: number,
  fecha: string,
): void {
  db.transaction((tx) => {
    const emp = tx
      .select({ estadoNotion: empresa.estadoNotion })
      .from(empresa)
      .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
      .get();
    if (!emp) return;
    if (emp.estadoNotion === estadoNuevo) return;

    tx.update(empresa)
      .set({ estadoNotion: estadoNuevo, updatedAt: fecha })
      .where(and(eq(empresa.idEmpresa, idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
      .run();

    tx.insert(empresaEstadoHistorial)
      .values({
        idEmpresa,
        estadoAnterior: emp.estadoNotion,
        estadoNuevo,
        fecha,
        idOrganizacion,
      })
      .run();
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
      paso.diasSugeridos === null ? new Date().toISOString().slice(0, 10) : diasDesdeHoy(paso.diasSugeridos);

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

function diasDesdeHoy(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
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
