"""
Migracion Campanas P5 (regla_faltante / intake_diario) DRY RUN: solo reporta, no escribe.

campana gana regla_faltante ('reemplazar'|'saltar'|'cola', default 'cola') e
intake_diario (integer nullable, goteo de arranque). SQLite no soporta
"ADD COLUMN IF NOT EXISTS": se chequea PRAGMA table_info primero.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'regla_faltante': "ALTER TABLE campana ADD COLUMN regla_faltante TEXT NOT NULL DEFAULT 'cola'",
    'intake_diario': "ALTER TABLE campana ADD COLUMN intake_diario INTEGER",
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION Campanas P5 / regla_faltante + intake_diario (dry run, no escribe) ===")
existentes = {r[1] for r in cur.execute("PRAGMA table_info(campana)")}
for col, ddl in COLUMNAS.items():
    if col in existentes:
        print(f"  columna campana.{col:16} ya existe, no haria nada")
    else:
        print(f"  columna campana.{col:16} ADD COLUMN  ->  {ddl}")

print("\n  Nada fue modificado en la base.")
