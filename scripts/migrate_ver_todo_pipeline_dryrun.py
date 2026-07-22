#!/usr/bin/env python3
"""
Migracion user.ver_todo_pipeline DRY RUN: solo reporta el plan, no escribe.

Fase 3 (docs/plan-produccion-cro-campana.md): el CRO (Camilo) necesita ver TODO el
pipeline (Felipe + Sebastian) en las vistas de lectura, sin que Felipe y Sebastian
pierdan su aislamiento. `admin` no sirve para esto -- ya significa "panel + conectores
de equipo" y Sebastian es admin=1 hoy, así que reusarlo le abriría la cartera de Felipe
por accidente. ver_todo_pipeline es un booleano nuevo e independiente, mismo patron que
owner/admin en user (input:false, solo lo setea este script / seed_auth_users.ts).

SQLite no soporta "ADD COLUMN IF NOT EXISTS": este script chequea PRAGMA table_info
primero y salta la columna si ya existe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'ver_todo_pipeline': "ALTER TABLE user ADD COLUMN ver_todo_pipeline integer DEFAULT false",
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION user.ver_todo_pipeline (dry run, no escribe) ===")
existentes = {r[1] for r in cur.execute("PRAGMA table_info(user)")}
for col in COLUMNAS:
    if col in existentes:
        print(f"  columna user.{col:20} ya existe, no haria nada")
    else:
        print(f"  columna user.{col:20} ADD COLUMN")

print("\n  Nada fue modificado en la base.")
