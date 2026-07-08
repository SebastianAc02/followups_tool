"""
Migracion "copy a Apollo" (sesion 2026-07-08): agrega paso_cadencia.proveedor_step_id
y version_paso.proveedor_template_id.
DRY RUN: solo reporta el plan, no escribe.

Para subir/editar el copy de una cadencia en Apollo (POST /emailer_steps,
PUT /emailer_templates/{id}) de forma reintentable, hace falta recordar el id que
Apollo asigno la primera vez: sin esto, cada re-sincronizacion crearia steps
duplicados en vez de actualizar los que ya existen. Nullable: un paso nace sin
version subida hasta que se sincroniza por primera vez.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION copy-apollo (dry run, no escribe) ===")

cols_paso = {r[1] for r in cur.execute("PRAGMA table_info(paso_cadencia)")}
if 'proveedor_step_id' in cols_paso:
    print("  paso_cadencia.proveedor_step_id  ya existe, no haria nada")
else:
    print("  paso_cadencia.proveedor_step_id  ALTER TABLE paso_cadencia ADD COLUMN proveedor_step_id TEXT")

cols_version = {r[1] for r in cur.execute("PRAGMA table_info(version_paso)")}
if 'proveedor_template_id' in cols_version:
    print("  version_paso.proveedor_template_id  ya existe, no haria nada")
else:
    print("  version_paso.proveedor_template_id  ALTER TABLE version_paso ADD COLUMN proveedor_template_id TEXT")

print("\n  Nada fue modificado en la base.")
