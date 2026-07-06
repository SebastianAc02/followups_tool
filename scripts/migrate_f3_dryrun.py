"""
Migracion F3 (V4.1): grupos 1 y 2 del Anexo (cadencias, campanas, inscripciones).
DRY RUN: solo reporta el plan, no escribe. CREATE TABLE IF NOT EXISTS + CREATE INDEX
IF NOT EXISTS, no destructivo. Las tablas maestras (empresa, contacto, toque) NO se tocan.

Grupo 1 (la cadencia como template): cadencia, paso_cadencia, version_paso.
Grupo 2 (campana e inscripcion): segmento, campana, inscripcion, destinatario.
Invariante clave: indice unico parcial sobre inscripcion(id_empresa) WHERE estado='activa'
(una inscripcion activa por empresa; las bloqueadas/finalizadas no cuentan).
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'cadencia': """
        CREATE TABLE IF NOT EXISTS cadencia (
          id_cadencia INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          descripcion TEXT,
          activa INTEGER NOT NULL DEFAULT 1,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'paso_cadencia': """
        CREATE TABLE IF NOT EXISTS paso_cadencia (
          id_paso INTEGER PRIMARY KEY AUTOINCREMENT,
          id_cadencia INTEGER NOT NULL,
          orden INTEGER NOT NULL,
          dia_offset INTEGER NOT NULL,
          canal TEXT NOT NULL,
          objetivo TEXT,
          created_at TEXT
        )
    """,
    'version_paso': """
        CREATE TABLE IF NOT EXISTS version_paso (
          id_version INTEGER PRIMARY KEY AUTOINCREMENT,
          id_paso INTEGER NOT NULL,
          nombre TEXT,
          asunto TEXT,
          cuerpo TEXT,
          es_default INTEGER NOT NULL DEFAULT 0,
          activa INTEGER NOT NULL DEFAULT 1,
          peso INTEGER NOT NULL DEFAULT 1,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'segmento': """
        CREATE TABLE IF NOT EXISTS segmento (
          id_segmento INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          definicion TEXT NOT NULL,
          descripcion_natural TEXT,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'campana': """
        CREATE TABLE IF NOT EXISTS campana (
          id_campana INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          id_cadencia INTEGER NOT NULL,
          id_segmento INTEGER NOT NULL,
          estado TEXT NOT NULL DEFAULT 'borrador',
          owner TEXT,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'inscripcion': """
        CREATE TABLE IF NOT EXISTS inscripcion (
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
        )
    """,
    'destinatario': """
        CREATE TABLE IF NOT EXISTS destinatario (
          id_destinatario INTEGER PRIMARY KEY AUTOINCREMENT,
          id_inscripcion INTEGER NOT NULL,
          id_contacto INTEGER NOT NULL,
          estado TEXT NOT NULL DEFAULT 'activo',
          created_at TEXT
        )
    """,
}

# Indice unico parcial: la regla de negocio "una inscripcion activa por empresa". El WHERE
# es lo que deja pasar varias bloqueadas/finalizadas de la misma empresa pero rechaza una
# segunda activa.
INDICES = {
    'ux_inscripcion_activa': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_inscripcion_activa
        ON inscripcion(id_empresa) WHERE estado = 'activa'
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION F3 (dry run, no escribe) ===")
nombres = ",".join(f"'{t}'" for t in TABLAS)
existentes = {r[0] for r in cur.execute(
    f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({nombres})"
)}
for tabla, ddl in TABLAS.items():
    if tabla in existentes:
        print(f"  tabla {tabla:16} ya existe, no haria nada")
    else:
        print(f"  tabla {tabla:16} CREATE")

idx_existentes = {r[0] for r in cur.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='ux_inscripcion_activa'"
)}
for idx in INDICES:
    if idx in idx_existentes:
        print(f"  index {idx:16} ya existe, no haria nada")
    else:
        print(f"  index {idx:16} CREATE (unico parcial: una activa por empresa)")

print("\n  Nada fue modificado en la base.")
