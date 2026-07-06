"""
Migracion F4 (V5.1): grupo 3 del Anexo (ejecucion y tracking).
DRY RUN: solo reporta el plan, no escribe. CREATE TABLE IF NOT EXISTS + CREATE INDEX
IF NOT EXISTS, no destructivo. Las tablas maestras (empresa, contacto, toque) NO se tocan.

Grupo 3 (ejecucion y tracking, F3.5 + F4): paso_inscripcion, evento_tracking.
Invariantes clave:
- indice unico sobre paso_inscripcion(id_destinatario, id_paso): un solo envio por
  destinatario y paso (nunca se duplica el mismo toque de la cadencia).
- indice unico sobre evento_tracking(proveedor_evento_id): idempotencia del poll de
  tracking (V5.5), el mismo evento de Apollo no se inserta dos veces.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'paso_inscripcion': """
        CREATE TABLE IF NOT EXISTS paso_inscripcion (
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
          created_at TEXT
        )
    """,
    'evento_tracking': """
        CREATE TABLE IF NOT EXISTS evento_tracking (
          id_evento INTEGER PRIMARY KEY AUTOINCREMENT,
          id_paso_inscripcion INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          canal TEXT NOT NULL,
          proveedor_evento_id TEXT NOT NULL,
          detalle TEXT,
          fecha_evento TEXT,
          created_at TEXT
        )
    """,
}

INDICES = {
    'ux_paso_inscripcion_destinatario_paso': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_paso_inscripcion_destinatario_paso
        ON paso_inscripcion(id_destinatario, id_paso)
    """,
    'ux_evento_tracking_proveedor_evento_id': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_evento_tracking_proveedor_evento_id
        ON evento_tracking(proveedor_evento_id)
    """,
    'ix_evento_tracking_paso_inscripcion': """
        CREATE INDEX IF NOT EXISTS ix_evento_tracking_paso_inscripcion
        ON evento_tracking(id_paso_inscripcion)
    """,
    'ix_evento_tracking_fecha_evento': """
        CREATE INDEX IF NOT EXISTS ix_evento_tracking_fecha_evento
        ON evento_tracking(fecha_evento)
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION F4 / grupo 3 (dry run, no escribe) ===")
nombres = ",".join(f"'{t}'" for t in TABLAS)
existentes = {r[0] for r in cur.execute(
    f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({nombres})"
)}
for tabla in TABLAS:
    if tabla in existentes:
        print(f"  tabla {tabla:16} ya existe, no haria nada")
    else:
        print(f"  tabla {tabla:16} CREATE")

idx_nombres = ",".join(f"'{i}'" for i in INDICES)
idx_existentes = {r[0] for r in cur.execute(
    f"SELECT name FROM sqlite_master WHERE type='index' AND name IN ({idx_nombres})"
)}
for idx in INDICES:
    if idx in idx_existentes:
        print(f"  index {idx:40} ya existe, no haria nada")
    else:
        print(f"  index {idx:40} CREATE")

print("\n  Nada fue modificado en la base.")
