"""
Migracion Campanas P3 (copy personalizado) DRY RUN: solo reporta el plan, no escribe.

version_paso gana dos columnas: firma_apollo (flag "incluir firma", puesto por la
directiva [[firma]] del parser) y variables (JSON de los nombres [entre-corchetes]
detectados en asunto/cuerpo). SQLite no soporta "ADD COLUMN IF NOT EXISTS": este
script chequea PRAGMA table_info primero y salta la columna si ya existe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'firma_apollo': "ALTER TABLE version_paso ADD COLUMN firma_apollo INTEGER NOT NULL DEFAULT 0",
    'variables': "ALTER TABLE version_paso ADD COLUMN variables TEXT",
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION Campanas P3 / version_paso (dry run, no escribe) ===")
existentes = {r[1] for r in cur.execute("PRAGMA table_info(version_paso)")}
for col in COLUMNAS:
    if col in existentes:
        print(f"  columna version_paso.{col:16} ya existe, no haria nada")
    else:
        print(f"  columna version_paso.{col:16} ADD COLUMN")

print("\n  Nada fue modificado en la base.")
