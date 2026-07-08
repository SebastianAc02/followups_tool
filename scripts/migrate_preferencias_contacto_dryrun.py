#!/usr/bin/env python3
"""
Migracion preferencia_usuario (cargo/telefono) DRY RUN: solo reporta el plan, no escribe.

preferencia_usuario gana dos columnas: cargo y telefono (contacto editable en
/perfil). SQLite no soporta "ADD COLUMN IF NOT EXISTS": este script chequea
PRAGMA table_info primero y salta la columna si ya existe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'cargo': "ALTER TABLE preferencia_usuario ADD COLUMN cargo TEXT",
    'telefono': "ALTER TABLE preferencia_usuario ADD COLUMN telefono TEXT",
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION preferencia_usuario (cargo/telefono) (dry run, no escribe) ===")
existentes = {r[1] for r in cur.execute("PRAGMA table_info(preferencia_usuario)")}
for col in COLUMNAS:
    if col in existentes:
        print(f"  columna preferencia_usuario.{col:10} ya existe, no haria nada")
    else:
        print(f"  columna preferencia_usuario.{col:10} ADD COLUMN")

print("\n  Nada fue modificado en la base.")
