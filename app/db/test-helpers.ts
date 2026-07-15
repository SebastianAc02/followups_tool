// Helpers SOLO para pruebas de Repository. No se usa en runtime de la app.
// Crea una DB SQLite de prueba (archivo temporal) con el subset de tablas reales
// que necesita registrarToque, replicando a mano las columnas relevantes de isps.db.
// DDL verificado columna por columna contra app/db/schema.ts (Drizzle), no contra
// isps.db directo. Esta duplicación puede desincronizarse en silencio: ver S3 en
// planning/tasks-v2.md.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function crearDbPrueba() {
  const dbPath = path.join(os.tmpdir(), `followups-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');

  sqlite.exec(`
    CREATE TABLE empresa (
      id_empresa TEXT PRIMARY KEY,
      tipo_id TEXT NOT NULL,
      nombre_oficial TEXT NOT NULL,
      nombre_normalizado TEXT NOT NULL,
      nombre_legal TEXT,
      opera_bajo_id TEXT,
      id_empresa_matriz TEXT,
      ciudad_principal TEXT,
      departamento TEXT,
      es_cliente INTEGER NOT NULL DEFAULT 0,
      en_conversacion INTEGER NOT NULL DEFAULT 0,
      crm_software TEXT,
      estado_comercial TEXT NOT NULL,
      estado_notion TEXT,
      prioridad_comercial INTEGER,
      pasarela_actual TEXT,
      categoria TEXT,
      owner TEXT,
      proximo_follow_up_fecha TEXT,
      proximo_paso TEXT,
      proximo_canal TEXT,
      pbx_forma TEXT,
      notion_page_id TEXT,
      organizacion_activa_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE contacto (
      id_contacto INTEGER PRIMARY KEY AUTOINCREMENT,
      id_empresa TEXT NOT NULL,
      nombre TEXT,
      apellido TEXT,
      cargo TEXT,
      cargo_categoria TEXT,
      es_key_decision_maker INTEGER NOT NULL DEFAULT 0,
      es_principal INTEGER NOT NULL DEFAULT 0,
      telefono TEXT,
      email TEXT,
      linkedin TEXT,
      notas TEXT,
      fuente TEXT NOT NULL
    );

    CREATE UNIQUE INDEX uq_contacto_principal ON contacto(id_empresa) WHERE es_principal = 1;

    CREATE TABLE toque (
      id_toque INTEGER PRIMARY KEY AUTOINCREMENT,
      id_empresa TEXT NOT NULL,
      id_contacto INTEGER,
      fecha TEXT,
      canal TEXT,
      resultado TEXT,
      que_paso TEXT,
      proximo_paso TEXT,
      proximo_follow_up_fecha TEXT,
      transcript_proveedor TEXT,
      transcript_id TEXT,
      transcript_url TEXT,
      razon_perdida TEXT,
      objecion TEXT,
      fuente TEXT NOT NULL,
      id_organizacion INTEGER NOT NULL DEFAULT 1,
      created_at TEXT
    );

    CREATE TABLE empresa_usuarios (
      id_empresa TEXT PRIMARY KEY,
      usuarios_reales REAL,
      usuarios_reales_fuente TEXT,
      usuarios_estimados REAL,
      usuarios_est_fuente TEXT,
      -- En isps.db real esta columna es GENERATED ALWAYS ... STORED. En el harness de
      -- pruebas se deja como REAL plano a proposito: otros tests (repository.embudo.test.ts)
      -- insertan usuarios_efectivos con un valor distinto de usuarios_estimados para probar
      -- la suma del embudo, cosa que una columna generada rechazaria. El recalculo automatico
      -- lo cubre la DB real, no se asegura aca.
      usuarios_efectivos REAL,
      actualizado_en TEXT,
      actualizado_por TEXT
    );

    CREATE TABLE sync_cambios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      corrida TEXT,
      fuente TEXT,
      entidad TEXT,
      id_registro TEXT,
      accion TEXT,
      detalle TEXT
    );

    CREATE TABLE conector (
      id_conector INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor TEXT NOT NULL,
      id_usuario TEXT,
      id_organizacion INTEGER,
      credencial_ciphertext TEXT,
      estado TEXT NOT NULL DEFAULT 'sin_credencial',
      ultima_corrida TEXT,
      ultimo_resultado TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(proveedor, id_usuario)
    );

    CREATE TABLE conector_config (
      proveedor TEXT PRIMARY KEY,
      id_organizacion INTEGER,
      modo TEXT NOT NULL,
      habilitado INTEGER NOT NULL DEFAULT 1,
      agregado_por TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE configuracion_admin (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      actualizado_por TEXT,
      updated_at TEXT
    );

    CREATE TABLE identidad_decision (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      a TEXT NOT NULL,
      b TEXT NOT NULL,
      veredicto TEXT NOT NULL CHECK (veredicto IN ('mismo','distinto','satelite_de')),
      decidido_por TEXT NOT NULL,
      nota TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE empresa_alias (
      id_alias INTEGER PRIMARY KEY AUTOINCREMENT,
      id_empresa TEXT NOT NULL,
      alias TEXT NOT NULL,
      fuente TEXT NOT NULL,
      confianza TEXT NOT NULL DEFAULT 'alta',
      created_at TEXT
    );

    CREATE TABLE outbox (
      id_outbox INTEGER PRIMARY KEY AUTOINCREMENT,
      entidad TEXT NOT NULL,
      id_registro TEXT NOT NULL,
      payload TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'aprobado',
      intentos INTEGER NOT NULL DEFAULT 0,
      proximo_intento TEXT,
      created_at TEXT
    );

    CREATE TABLE cadencia (
      id_cadencia INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      activa INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE paso_cadencia (
      id_paso INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cadencia INTEGER NOT NULL,
      orden INTEGER NOT NULL,
      dia_offset INTEGER NOT NULL,
      canal TEXT NOT NULL,
      objetivo TEXT,
      es_manual INTEGER NOT NULL DEFAULT 0,
      proveedor_step_id TEXT,
      created_at TEXT
    );

    CREATE TABLE version_paso (
      id_version INTEGER PRIMARY KEY AUTOINCREMENT,
      id_paso INTEGER NOT NULL,
      nombre TEXT,
      asunto TEXT,
      cuerpo TEXT,
      es_default INTEGER NOT NULL DEFAULT 0,
      activa INTEGER NOT NULL DEFAULT 1,
      peso INTEGER NOT NULL DEFAULT 1,
      firma_apollo INTEGER NOT NULL DEFAULT 0,
      variables TEXT,
      proveedor_template_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE segmento (
      id_segmento INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      definicion TEXT NOT NULL,
      descripcion_natural TEXT,
      id_organizacion INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE segmento_exclusion (
      id_exclusion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_segmento INTEGER NOT NULL,
      id_empresa TEXT NOT NULL,
      created_at TEXT,
      UNIQUE(id_segmento, id_empresa)
    );

    CREATE TABLE campana (
      id_campana INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      id_cadencia INTEGER NOT NULL,
      id_segmento INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'borrador',
      modo TEXT NOT NULL DEFAULT 'prioritaria',
      regla_faltante TEXT NOT NULL DEFAULT 'cola',
      intake_diario INTEGER,
      ritmo_ingreso TEXT NOT NULL DEFAULT 'diario',
      tope_toques_dia INTEGER,
      fecha_inicio TEXT,
      owner TEXT,
      id_organizacion INTEGER NOT NULL DEFAULT 1,
      proveedor_campana_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      aprobada_envio_gmail INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE inscripcion (
      id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_campana INTEGER NOT NULL,
      id_empresa TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa',
      paso_actual INTEGER,
      fecha_inscripcion TEXT,
      fecha_fin TEXT,
      motivo_fin TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE UNIQUE INDEX ux_inscripcion_activa
      ON inscripcion(id_empresa) WHERE estado = 'activa';

    CREATE TABLE destinatario (
      id_destinatario INTEGER PRIMARY KEY AUTOINCREMENT,
      id_inscripcion INTEGER NOT NULL,
      id_contacto INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo',
      created_at TEXT
    );

    CREATE TABLE paso_inscripcion (
      id_paso_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_destinatario INTEGER NOT NULL,
      id_paso INTEGER NOT NULL,
      id_version INTEGER NOT NULL,
      id_toque INTEGER,
      canal TEXT NOT NULL,
      proveedor TEXT,
      proveedor_mensaje_id TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha_programada TEXT,
      fecha_enviada TEXT,
      intentos INTEGER NOT NULL DEFAULT 0,
      proximo_intento TEXT,
      created_at TEXT
    );

    CREATE UNIQUE INDEX ux_paso_inscripcion_destinatario_paso
      ON paso_inscripcion(id_destinatario, id_paso);

    CREATE TABLE evento_tracking (
      id_evento INTEGER PRIMARY KEY AUTOINCREMENT,
      id_paso_inscripcion INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      canal TEXT NOT NULL,
      proveedor_evento_id TEXT NOT NULL,
      detalle TEXT,
      fecha_evento TEXT,
      created_at TEXT
    );

    CREATE UNIQUE INDEX ux_evento_tracking_proveedor_evento_id
      ON evento_tracking(proveedor_evento_id);

    CREATE INDEX ix_evento_tracking_paso_inscripcion
      ON evento_tracking(id_paso_inscripcion);

    CREATE INDEX ix_evento_tracking_fecha_evento
      ON evento_tracking(fecha_evento);

    CREATE TABLE notificacion_respuesta (
      id_notificacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_inscripcion INTEGER NOT NULL,
      id_empresa TEXT NOT NULL,
      canal TEXT NOT NULL,
      detectada_en TEXT NOT NULL,
      vista_en TEXT,
      created_at TEXT
    );

    CREATE TABLE organizacion (
      id_organizacion INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE organizacion_miembro (
      id_miembro INTEGER PRIMARY KEY AUTOINCREMENT,
      id_organizacion INTEGER NOT NULL,
      owner_canonico TEXT NOT NULL,
      nombre_display TEXT NOT NULL,
      id_user TEXT,
      created_at TEXT
    );

    CREATE UNIQUE INDEX ux_organizacion_miembro_id_user
      ON organizacion_miembro(id_user) WHERE id_user IS NOT NULL;

    CREATE TABLE preferencia_usuario (
      id_user TEXT PRIMARY KEY,
      color_avatar TEXT,
      vista_inicio TEXT,
      cargo TEXT,
      telefono TEXT,
      updated_at TEXT
    );

    CREATE TABLE panel_tablero (
      id_user TEXT PRIMARY KEY,
      layout TEXT,
      updated_at TEXT
    );

    CREATE TABLE mensaje_whatsapp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mensaje_id TEXT NOT NULL UNIQUE,
      referencia_proveedor TEXT,
      telefono TEXT,
      texto TEXT,
      id_contacto INTEGER,
      fecha TEXT,
      created_at TEXT
    );

    CREATE TABLE linea_whatsapp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL,
      tipo TEXT NOT NULL,
      id_usuario TEXT,
      referencia_proveedor TEXT,
      estado TEXT NOT NULL DEFAULT 'calentando',
      techo_diario INTEGER NOT NULL DEFAULT 25,
      fecha_creacion TEXT
    );

    CREATE TABLE empresa_estado_historial (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_empresa TEXT NOT NULL,
      estado_anterior TEXT,
      estado_nuevo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      id_organizacion INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE empresa_clasificacion (
      id_empresa TEXT PRIMARY KEY REFERENCES empresa(id_empresa) ON DELETE CASCADE,
      es_carrier INTEGER NOT NULL DEFAULT 0,
      es_corporativo_grande INTEGER NOT NULL DEFAULT 0,
      es_utility_no_isp INTEGER NOT NULL DEFAULT 0,
      es_extranjero INTEGER NOT NULL DEFAULT 0,
      es_no_isp_confirmado INTEGER NOT NULL DEFAULT 0,
      alianza_sae_plus INTEGER NOT NULL DEFAULT 0,
      motivo TEXT,
      fuente TEXT,
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_por TEXT
    );

    CREATE VIEW empresa_categoria AS
        SELECT e.id_empresa, e.nombre_oficial,
            CASE
                WHEN c.alianza_sae_plus      = 1 THEN 'sae_plus'
                WHEN c.es_corporativo_grande = 1 THEN 'telco_grande'
                WHEN c.es_carrier            = 1 THEN 'carrier'
                WHEN c.es_utility_no_isp     = 1 THEN 'utility'
                WHEN c.es_extranjero         = 1 THEN 'extranjero'
                WHEN c.es_no_isp_confirmado  = 1 THEN 'no_isp'
                ELSE 'isp'
            END AS categoria,
            CASE
                WHEN c.id_empresa IS NULL THEN 1
                WHEN (c.alianza_sae_plus + c.es_corporativo_grande + c.es_carrier
                      + c.es_utility_no_isp + c.es_extranjero + c.es_no_isp_confirmado) = 0 THEN 1
                ELSE 0
            END AS atacable
        FROM empresa e
        LEFT JOIN empresa_clasificacion c ON c.id_empresa = e.id_empresa;
  `);

  sqlite.close();
  return dbPath;
}

export function borrarDbPrueba(dbPath: string) {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}
