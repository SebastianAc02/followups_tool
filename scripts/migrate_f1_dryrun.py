"""
Migracion F1 (V3.1): tablas conector y outbox. DRY RUN: solo reporta el plan, no escribe.
CREATE TABLE IF NOT EXISTS, no destructivo. conector guarda credenciales cifradas
(AES-256-GCM en V3.2); outbox es la cola de cambios aprobados pendientes de Notion.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'conector': """
        CREATE TABLE IF NOT EXISTS conector (
          id_conector INTEGER PRIMARY KEY AUTOINCREMENT,
          proveedor TEXT NOT NULL UNIQUE,
          credencial_ciphertext TEXT,
          estado TEXT NOT NULL DEFAULT 'sin_credencial',
          ultima_corrida TEXT,
          ultimo_resultado TEXT,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'outbox': """
        CREATE TABLE IF NOT EXISTS outbox (
          id_outbox INTEGER PRIMARY KEY AUTOINCREMENT,
          entidad TEXT NOT NULL,
          id_registro TEXT NOT NULL,
          payload TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'aprobado',
          intentos INTEGER NOT NULL DEFAULT 0,
          proximo_intento TEXT,
          created_at TEXT
        )
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION F1 (dry run, no escribe) ===")
existentes = {r[0] for r in cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('conector','outbox')"
)}
for tabla, ddl in TABLAS.items():
    if tabla in existentes:
        print(f"  {tabla:10} ya existe, no haria nada")
    else:
        print(f"  {tabla:10} {ddl.strip()}")

print("\n  Nada fue modificado en la base.")
