"""
Migracion Campanas P4 (modo prioritaria/batch) DRY RUN: solo reporta, no escribe.

campana gana la columna modo ('prioritaria' | 'batch'). Default 'prioritaria' para
las filas existentes (mas seguro: revisar toque a toque hasta que alguien elija
batch a proposito). SQLite no soporta "ADD COLUMN IF NOT EXISTS": se chequea
PRAGMA table_info primero.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'modo': "ALTER TABLE campana ADD COLUMN modo TEXT NOT NULL DEFAULT 'prioritaria'",
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION Campanas P4 / campana.modo (dry run, no escribe) ===")
existentes = {r[1] for r in cur.execute("PRAGMA table_info(campana)")}
for col in COLUMNAS:
    if col in existentes:
        print(f"  columna campana.{col:16} ya existe, no haria nada")
    else:
        print(f"  columna campana.{col:16} ADD COLUMN")

print("\n  Nada fue modificado en la base.")
