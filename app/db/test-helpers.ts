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
      notion_page_id TEXT,
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
      notas TEXT,
      fuente TEXT NOT NULL
    );

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
      created_at TEXT
    );

    CREATE TABLE empresa_usuarios (
      id_empresa TEXT PRIMARY KEY,
      usuarios_estimados REAL,
      usuarios_efectivos REAL
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
      credencial_ciphertext TEXT,
      estado TEXT NOT NULL DEFAULT 'sin_credencial',
      ultima_corrida TEXT,
      ultimo_resultado TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(proveedor, id_usuario)
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
