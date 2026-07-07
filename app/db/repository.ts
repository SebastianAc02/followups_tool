import {
  and,
  eq,
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
import { db } from './index';
import {
  empresa,
  contacto,
  empresaUsuarios,
  toque,
  syncCambios,
  conector,
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
} from './schema';
import type { CambioNotion } from '../core/ports/sync';
import type { FilaOutbox } from '../core/outbox';
import type { CadenciaParseada } from '../core/cadencia-parser';
import { elegirDestinatarioDefault } from '../core/inscripcion';
import { proximoPasoDebido, type ConfigCalendario } from '../core/motor-cadencia';
import { MAX_INTENTOS, type FilaPasoInscripcion } from '../core/push';
import type { CampanaConSecuencia, DestinatarioResuelto } from '../core/tracking';
import type { EventoProveedor } from '../core/ports/envio';
import { restarUnDia } from '../core/actividad';
import { canalesDisponibles, readinessEmpresa, type Readiness, type ReglaFaltante } from '../core/canales-empresa';
import { cifrar, descifrar } from '../lib/crypto';
import type { SesionTranscript } from '../core/ports/transcript';
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
  CANALES,
  RESULTADOS,
  type Canal,
  type Resultado,
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

// Calor de la cuenta (prioridad): lo más cerca del cierre, primero.
const calorDesc = sql`(CASE ${empresa.estadoNotion}
  WHEN 'cierre_documentacion' THEN 5
  WHEN 'enviar_contrato' THEN 5
  WHEN 'reunion_agendada' THEN 4
  WHEN 'oportunidad' THEN 4
  WHEN 'contacto_iniciado' THEN 2
  WHEN 'on_hold' THEN 0
  ELSE 1 END) DESC`;

// Cola del día de un owner: vencidos o para hoy, ordenados por calor y luego antigüedad.
export function colaDelDia(hoy: string, owner: string) {
  return db
    .select({
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
    })
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(
      and(
        eq(empresa.owner, owner),
        isNotNull(empresa.proximoFollowUpFecha),
        lte(empresa.proximoFollowUpFecha, hoy),
      ),
    )
    .orderBy(calorDesc, empresa.proximoFollowUpFecha)
    .all();
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

export function getCuenta(id: string) {
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
      categoria: empresa.categoria,
      proximoPaso: empresa.proximoPaso,
      fecha: empresa.proximoFollowUpFecha,
      usuarios: empresaUsuarios.usuariosEfectivos,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(eq(empresa.idEmpresa, id))
    .get();

  const contactos = db
    .select({
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      telefono: contacto.telefono,
      email: contacto.email,
      esPrincipal: contacto.esPrincipal,
    })
    .from(contacto)
    .where(eq(contacto.idEmpresa, id))
    .all();

  const toques = db
    .select({
      idToque: toque.idToque,
      fecha: toque.fecha,
      canal: toque.canal,
      resultado: toque.resultado,
      quePaso: toque.quePaso,
      transcriptId: toque.transcriptId,
    })
    .from(toque)
    .where(eq(toque.idEmpresa, id))
    .orderBy(desc(toque.idToque))
    .limit(5)
    .all();

  return { emp, contactos, toques };
}

// Registrar un toque: escribe el evento (toque) y actualiza el estado actual (empresa). Atómico.
// La regla de negocio (4 salidas cerradas, razonPerdida obligatoria si contesto_no) es de
// DOMINIO y se enforza aquí con Zod, no en la UI: cualquier caller futuro (ingest worker,
// EnvioAdapter) pasa por esta misma garantía. `.parse()` lanza si el input no cumple.
export function registrarToque(input: RegistrarToqueInput) {
  const parsed = registrarToqueSchema.parse(input);
  const ahora = new Date().toISOString();

  db.transaction((tx) => {
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
    if (parsed.proximoFollowUp || parsed.quePaso) {
      encolarOutboxNotion(tx, parsed.idEmpresa, {
        proximoPaso: parsed.quePaso,
        fechaProximoPaso: parsed.proximoFollowUp,
      });
    }

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

export type ContadoresHoy = {
  porCanal: Record<Canal, number>;
  porResultado: Record<Resultado, number>;
  total: number;
};

// Contadores del día (F0.3 mínimo): toques de HOY de un owner, por canal y por resultado.
// Solo lectura. El toque no tiene owner directo, se filtra vía JOIN a empresa.owner (mismo
// filtro que colaDelDia). `toque.fecha` es un datetime ISO completo, se compara solo la
// parte de fecha con substr(fecha, 1, 10).
export function contadoresHoy(hoy: string, owner: string): ContadoresHoy {
  const filas = db
    .select({ canal: toque.canal, resultado: toque.resultado })
    .from(toque)
    .innerJoin(empresa, eq(empresa.idEmpresa, toque.idEmpresa))
    .where(and(eq(empresa.owner, owner), sql`substr(${toque.fecha}, 1, 10) = ${hoy}`))
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

// Cuenta de empresas por estado_notion (rediseño home). Solo lectura. Los null (empresas
// sin etapa en el funnel) NO se incluyen: no representan una etapa. Con owner filtra a ese
// owner; sin owner cuenta toda la base. Acceso solo por el Repository (regla de arquitectura).
export function contarPorEstado(owner?: string): Record<string, number> {
  const filas = db
    .select({ estado: empresa.estadoNotion, n: sql<number>`count(*)` })
    .from(empresa)
    .where(owner ? eq(empresa.owner, owner) : undefined)
    .groupBy(empresa.estadoNotion)
    .all();

  const out: Record<string, number> = {};
  for (const f of filas) {
    if (f.estado) out[f.estado] = Number(f.n);
  }
  return out;
}

// Repartir el backlog de follow-ups de un owner: N por día hábil, lo más caliente primero.
export function repartirFollowups(owner: string, porDia: number) {
  const rows = db
    .select({ id: empresa.idEmpresa })
    .from(empresa)
    .where(and(eq(empresa.owner, owner), isNotNull(empresa.proximoFollowUpFecha)))
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
      })
      .where(eq(toque.idToque, idToque))
      .run();

    // V3.7: el resumen confirmado sube a Notion (Notas Discovery) en la misma
    // transaccion. Solo aca, no en escribirTranscriptSoloPuntero: esa rama nunca
    // toca quePaso (V3.6), asi que no hay resumen nuevo que sincronizar.
    if (sesion.resumen) {
      const t = tx.select({ idEmpresa: toque.idEmpresa }).from(toque).where(eq(toque.idToque, idToque)).get();
      if (t) encolarOutboxNotion(tx, t.idEmpresa, { notasDiscovery: sesion.resumen });
    }
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
      const insPaso = tx
        .insert(pasoCadencia)
        .values({
          idCadencia,
          orden: paso.orden,
          diaOffset: paso.diaOffset,
          canal: paso.canal,
          objetivo: paso.objetivo ?? null,
          esManual: paso.esManual ? 1 : 0,
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
  categoria: { col: empresa.categoria, numerico: false },
  estado_comercial: { col: empresa.estadoComercial, numerico: false },
  prioridad: { col: empresa.prioridadComercial, numerico: true },
  es_cliente: { col: empresa.esCliente, numerico: true },
  ciudad: { col: empresa.ciudadPrincipal, numerico: false },
  departamento: { col: empresa.departamento, numerico: false },
  owner: { col: empresa.owner, numerico: false },
  usuarios: { col: empresaUsuarios.usuariosEstimados, numerico: true },
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
export function empresasDeSegmento(def: DefinicionSegmento) {
  const val = definicionSegmentoSchema.parse(def);
  let q = db
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estado: empresa.estadoNotion,
      categoria: empresa.categoria,
      usuarios: empresaUsuarios.usuariosEstimados,
      ciudad: empresa.ciudadPrincipal,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(compilarSegmento(val))
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

export function contarSegmento(def: DefinicionSegmento): number {
  const val = definicionSegmentoSchema.parse(def);
  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    .where(compilarSegmento(val))
    .get();
  return fila?.n ?? 0;
}

// V4.3: guarda el filtro compilado como JSON en segmento.definicion. descripcionNatural
// es opcional (el lenguaje natural lo llena Fase 6, aca solo se persiste si viene).
export function guardarSegmento(input: { nombre: string; definicion: DefinicionSegmento; descripcionNatural?: string }): number {
  const val = definicionSegmentoSchema.parse(input.definicion);
  const ahora = new Date().toISOString();
  const ins = db
    .insert(segmento)
    .values({
      nombre: input.nombre,
      definicion: JSON.stringify(val),
      descripcionNatural: input.descripcionNatural ?? null,
      createdAt: ahora,
      updatedAt: ahora,
    })
    .run();
  return Number(ins.lastInsertRowid);
}

export function listarSegmentos() {
  return db
    .select({ id: segmento.idSegmento, nombre: segmento.nombre, descripcionNatural: segmento.descripcionNatural })
    .from(segmento)
    .orderBy(desc(segmento.idSegmento))
    .all();
}

// Parte 1 campanas: valores unicos de un campo de texto para poblar el dropdown del
// builder (estilo Apollo). Solo campos de texto: los numericos se filtran por rango,
// no por lista, y ademas usuarios vive en otra tabla.
export function valoresDistintosCampo(campo: CampoSegmento): string[] {
  // rol vive en contacto, no en empresa (mismo motivo que en compilarSegmento):
  // el dropdown de roles sale de cargo_categoria, no de COLUMNA_SEGMENTO.
  if (campo === 'rol') {
    const filas = db
      .selectDistinct({ v: contacto.cargoCategoria })
      .from(contacto)
      .where(isNotNull(contacto.cargoCategoria))
      .orderBy(contacto.cargoCategoria)
      .all();
    return filas.map((f) => String(f.v));
  }
  const { col, numerico } = COLUMNA_SEGMENTO[campo];
  if (numerico) {
    throw new Error(`el campo '${campo}' es numerico: se filtra por rango, no por lista de valores`);
  }
  const filas = db.selectDistinct({ v: col }).from(empresa).where(isNotNull(col)).orderBy(col).all();
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
export function empresasConReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante): FilaReadiness[] {
  const empresas = empresasDeSegmento(def);
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

export function conteosReadiness(def: DefinicionSegmento, canalesRequeridos: Canal[], regla: ReglaFaltante): ConteosReadiness {
  const filas = empresasConReadiness(def, canalesRequeridos, regla);
  return {
    total: filas.length,
    listas: filas.filter((f) => f.readiness.estado === 'lista').length,
    parciales: filas.filter((f) => f.readiness.estado === 'parcial').length,
    sinCanal: filas.filter((f) => f.readiness.estado === 'sin_canal').length,
    sinContacto: filas.filter((f) => f.canales.length === 0).length,
  };
}

// V4.3: corre un segmento YA guardado (lee su definicion de la DB y la ejecuta). Es el
// puente que V4.5 usa para inscribir "todas las empresas de este segmento".
export function empresasDeSegmentoGuardado(idSegmento: number) {
  const fila = db.select({ definicion: segmento.definicion }).from(segmento).where(eq(segmento.idSegmento, idSegmento)).get();
  if (!fila) return null;
  const def = definicionSegmentoSchema.parse(JSON.parse(fila.definicion));
  return empresasDeSegmento(def);
}

// Parte 2 campanas: excluir/incluir es un toggle idempotente sobre la fila unica
// (id_segmento, id_empresa). Excluir dos veces no duplica (ON CONFLICT DO NOTHING);
// incluir de vuelta borra la fila si existe (no truena si ya estaba incluida).
export function excluirDeSegmento(idSegmento: number, idEmpresa: string): void {
  db.insert(segmentoExclusion)
    .values({ idSegmento, idEmpresa, createdAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}

export function incluirDeSegmento(idSegmento: number, idEmpresa: string): void {
  db.delete(segmentoExclusion)
    .where(and(eq(segmentoExclusion.idSegmento, idSegmento), eq(segmentoExclusion.idEmpresa, idEmpresa)))
    .run();
}

// Parte 2 campanas: la pantalla de revision necesita TODAS las empresas del segmento,
// cada una marcada si ya esta excluida (para pintar el toggle en su estado real). No
// filtra las excluidas: las deja ver para poder des-excluirlas antes de "continuar".
export function empresasParaRevision(idSegmento: number) {
  const empresas = empresasDeSegmentoGuardado(idSegmento);
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
export function crearCampana(input: CampanaInput): number {
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
      owner: val.owner ?? null,
      createdAt: ahora,
      updatedAt: ahora,
    })
    .run();
  return Number(ins.lastInsertRowid);
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
export function inscribirCampana(idCampana: number): ResultadoInscripcion {
  const camp = db.select({ idSegmento: campana.idSegmento }).from(campana).where(eq(campana.idCampana, idCampana)).get();
  if (!camp) throw new Error(`campana ${idCampana} no existe`);
  // Parte 3 campanas: el set curado en la revision (Parte 2) es la fuente real de
  // a quien inscribir, no el segmento crudo. empresasParaRevision ya trae el flag
  // excluida por empresa; ese "esta no va" nunca llega a inscripcion.
  const paraRevision = empresasParaRevision(camp.idSegmento);
  if (!paraRevision) throw new Error(`segmento ${camp.idSegmento} de la campana no existe`);
  const empresas = paraRevision.filter((e) => !e.excluida);

  const res: ResultadoInscripcion = { inscritas: 0, bloqueadas: 0, reemplazos: 0, saltadas: 0 };
  const ahora = new Date().toISOString();

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
        })
        .from(contacto)
        .where(eq(contacto.idEmpresa, emp.id))
        .orderBy(contacto.idContacto)
        .all();

      const idContactoDest = elegirDestinatarioDefault(
        contactos.map((c) => ({
          idContacto: c.idContacto,
          esKeyDecisionMaker: c.esKeyDecisionMaker === 1,
          esPrincipal: c.esPrincipal === 1,
          email: c.email,
        })),
      );

      const estado = idContactoDest != null ? 'activa' : 'bloqueada';
      const ins = tx
        .insert(inscripcion)
        .values({ idCampana, idEmpresa: emp.id, estado, pasoActual: 0, fechaInscripcion: ahora, createdAt: ahora, updatedAt: ahora })
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

// Parte 4 campanas: hub de /campanas. Resuelve nombre de cadencia/segmento (no ids
// crudos) y el conteo de inscripciones activas, para que la UI no arme el join.
export function listarCampanas() {
  return db
    .select({
      id: campana.idCampana,
      nombre: campana.nombre,
      estado: campana.estado,
      modo: campana.modo,
      cadencia: cadencia.nombre,
      segmento: segmento.nombre,
      inscritas: sql<number>`(SELECT count(*) FROM inscripcion WHERE inscripcion.id_campana = campana.id_campana AND inscripcion.estado = 'activa')`,
      bloqueadas: sql<number>`(SELECT count(*) FROM inscripcion WHERE inscripcion.id_campana = campana.id_campana AND inscripcion.estado = 'bloqueada')`,
    })
    .from(campana)
    .innerJoin(cadencia, eq(cadencia.idCadencia, campana.idCadencia))
    .innerJoin(segmento, eq(segmento.idSegmento, campana.idSegmento))
    .orderBy(desc(campana.idCampana))
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
    .where(eq(inscripcion.estado, 'activa'))
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

// Filas listas para push: pendiente o fallo (con backoff cumplido), por debajo de
// MAX_INTENTOS, y solo de campanas que ya tienen secuencia externa creada (una
// campana sin proveedor_campana_id no tiene a donde empujar; se salta en vez de
// gastar un intento fallido en ella).
export function pasoInscripcionesPendientes(ahora: string = new Date().toISOString()): FilaPasoInscripcion[] {
  const filas = db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      intentos: pasoInscripcion.intentos,
      canal: pasoInscripcion.canal,
      email: contacto.email,
      nombre: contacto.nombre,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      proveedorCampanaId: campana.proveedorCampanaId,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(
      and(
        inArray(pasoInscripcion.estado, ['pendiente', 'fallo']),
        isNotNull(campana.proveedorCampanaId),
        // V5.6: un paso manual (Tier 1) NUNCA lo dispara el push automatico. Espera
        // revision humana via aprobarPasoManual, sin importar cuantos dias pasen.
        eq(pasoCadencia.esManual, 0),
        sql`${pasoInscripcion.intentos} < ${MAX_INTENTOS}`,
        sql`(${pasoInscripcion.proximoIntento} IS NULL OR ${pasoInscripcion.proximoIntento} <= ${ahora})`,
      ),
    )
    .all();

  return filas.map((f) => ({
    idPasoInscripcion: f.idPasoInscripcion,
    proveedorCampanaId: f.proveedorCampanaId as string,
    destinatario: { email: f.email ?? '', nombre: f.nombre },
    paso: { asunto: f.asunto, cuerpo: f.cuerpo ?? '', canal: f.canal },
    intentos: f.intentos,
  }));
}

// enviando es un estado transitorio informativo (no lo lee ninguna query de
// reintento): si el worker muere justo entre marcarlo y recibir la respuesta de
// Apollo, la fila queda en 'enviando' y no se reintenta sola -- mismo tipo de riesgo
// que ya acepta B7 (el worker no promete exactly-once), no bloquea V5.4.
export function marcarPasoInscripcionEnviando(idPasoInscripcion: number) {
  db.update(pasoInscripcion).set({ estado: 'enviando' }).where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion)).run();
}

export function marcarPasoInscripcionEnviada(idPasoInscripcion: number, proveedorMensajeId: string, fechaEnviada: string) {
  db.update(pasoInscripcion)
    .set({ estado: 'enviada', proveedor: 'apollo', proveedorMensajeId, fechaEnviada })
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .run();
}

export function marcarPasoInscripcionFallo(idPasoInscripcion: number, intentos: number, proximoIntento: string | null) {
  db.update(pasoInscripcion)
    .set({ estado: 'fallo', intentos, proximoIntento })
    .where(eq(pasoInscripcion.idPasoInscripcion, idPasoInscripcion))
    .run();
}

// V5.6: cola de revision de pasos manuales (Tier 1). A diferencia de
// pasoInscripcionesPendientes, NO filtra por backoff ni por MAX_INTENTOS -- un
// manual sin revisar simplemente ESPERA, "aparece atrasado" (se calcula comparando
// fechaProgramada contra hoy en el llamador), nunca se descarta por reintentos.
export function pasosManualesPendientes() {
  return db
    .select({
      idPasoInscripcion: pasoInscripcion.idPasoInscripcion,
      fechaProgramada: pasoInscripcion.fechaProgramada,
      email: contacto.email,
      nombre: contacto.nombre,
      asunto: versionPaso.asunto,
      cuerpo: versionPaso.cuerpo,
      canal: pasoInscripcion.canal,
      idEmpresa: empresa.idEmpresa,
      empresaNombre: empresa.nombreOficial,
    })
    .from(pasoInscripcion)
    .innerJoin(destinatario, eq(destinatario.idDestinatario, pasoInscripcion.idDestinatario))
    .innerJoin(contacto, eq(contacto.idContacto, destinatario.idContacto))
    .innerJoin(inscripcion, eq(inscripcion.idInscripcion, destinatario.idInscripcion))
    .innerJoin(empresa, eq(empresa.idEmpresa, inscripcion.idEmpresa))
    .innerJoin(versionPaso, eq(versionPaso.idVersion, pasoInscripcion.idVersion))
    .innerJoin(pasoCadencia, eq(pasoCadencia.idPaso, pasoInscripcion.idPaso))
    .where(and(eq(pasoInscripcion.estado, 'pendiente'), eq(pasoCadencia.esManual, 1)))
    .all();
}

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
      .values({
        idEmpresa: fila.idEmpresa,
        idContacto: fila.idContacto,
        fecha: fechaEnviada,
        canal: fila.canal,
        quePaso: cuerpoFinal ?? null,
        fuente: 'cadencia_manual',
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
export function agendaHoyCadencias(hoy: string) {
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

// ---------------------------------------------------------------------------
// Fase 7 (V7.1): agregaciones de SOLO LECTURA para el panel de actividad.
// Ninguna escribe ni filtra por owner (el panel ve a todo el equipo). La regla
// de la ventana del promedio vive en app/core/actividad.ts, no aqui ni en la UI.
// `toque.fecha` puede ser ISO (app) o legado formato Notion ("June 25, 2026"); se
// compara solo substr(fecha,1,10), asi el legado no-ISO cae fuera de las ventanas.

const enRango = (desde: string, hasta: string): SQL =>
  sql`substr(${toque.fecha}, 1, 10) >= ${desde} AND substr(${toque.fecha}, 1, 10) <= ${hasta}`;

export function contarToquesEnRango(desde: string, hasta: string): number {
  const r = db.select({ n: sql<number>`count(*)` }).from(toque).where(enRango(desde, hasta)).get();
  return r?.n ?? 0;
}

export function contarToquesEnDia(hoy: string): number {
  const ayer = restarUnDia(hoy);
  return contarToquesEnRango(ayer, ayer);
}

export function leadsTocadosEnRango(desde: string, hasta: string): number {
  const r = db.select({ n: sql<number>`count(distinct ${toque.idEmpresa})` }).from(toque).where(enRango(desde, hasta)).get();
  return r?.n ?? 0;
}

export function toquesPorCanal(desde: string, hasta: string): Record<Canal, number> {
  const filas = db.select({ canal: toque.canal, n: sql<number>`count(*)` }).from(toque)
    .where(enRango(desde, hasta)).groupBy(toque.canal).all();
  const out = Object.fromEntries(CANALES.map((c) => [c, 0])) as Record<Canal, number>;
  for (const f of filas) if (f.canal && f.canal in out) out[f.canal as Canal] = f.n;
  return out;
}

export function toquesPorResultado(desde: string, hasta: string): Record<Resultado, number> {
  const filas = db.select({ resultado: toque.resultado, n: sql<number>`count(*)` }).from(toque)
    .where(enRango(desde, hasta)).groupBy(toque.resultado).all();
  const out = Object.fromEntries(RESULTADOS.map((r) => [r, 0])) as Record<Resultado, number>;
  for (const f of filas) if (f.resultado && f.resultado in out) out[f.resultado as Resultado] = f.n;
  return out;
}

export function campanasActivas(): number {
  const r = db.select({ n: sql<number>`count(distinct ${inscripcion.idCampana})` })
    .from(inscripcion).where(eq(inscripcion.estado, 'activa')).get();
  return r?.n ?? 0;
}

export function inscripcionesActivas(): number {
  const r = db.select({ n: sql<number>`count(*)` }).from(inscripcion).where(eq(inscripcion.estado, 'activa')).get();
  return r?.n ?? 0;
}

export function empresasPorCadencia(): { cadencia: string; empresas: number }[] {
  return db.select({ cadencia: cadencia.nombre, empresas: sql<number>`count(distinct ${inscripcion.idEmpresa})` })
    .from(inscripcion)
    .innerJoin(campana, eq(campana.idCampana, inscripcion.idCampana))
    .innerJoin(cadencia, eq(cadencia.idCadencia, campana.idCadencia))
    .where(eq(inscripcion.estado, 'activa'))
    .groupBy(cadencia.nombre)
    .all();
}
