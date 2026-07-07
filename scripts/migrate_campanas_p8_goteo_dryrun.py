"""
Migracion Campanas P8 (ritmo_ingreso / tope_toques_dia / fecha_inicio) DRY RUN:
solo reporta, no escribe.

campana gana ritmo_ingreso ('diario'|'dia_si_dia_no'|'personalizado', default
'diario'), tope_toques_dia (integer nullable, control real por campana) y
fecha_inicio (text ISO date nullable, null = arranca hoy). SQLite no soporta
"ADD COLUMN IF NOT EXISTS": se chequea PRAGMA table_info primero.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'ritmo_ingreso': "ALTER TABLE campana ADD COLUMN ritmo_ingreso TEXT NOT NULL DEFAULT 'diario'",
    'tope_toques_dia': "ALTER TABLE campana ADD COLUMN tope_toques_dia INTEGER",
    'fecha_inicio': "ALTER TABLE campana ADD COLUMN fecha_inicio TEXT",
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION Campanas P8 / ritmo + tope + fecha inicio (dry run, no escribe) ===")
existentes = {r[1] for r in cur.execute("PRAGMA table_info(campana)")}
for col, ddl in COLUMNAS.items():
    if col in existentes:
        print(f"  columna campana.{col:16} ya existe, no haria nada")
    else:
        print(f"  columna campana.{col:16} ADD COLUMN  ->  {ddl}")

print("\n  Nada fue modificado en la base.")
