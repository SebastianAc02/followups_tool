"""
Migracion "copy a Apollo" (sesion 2026-07-08) APPLY: agrega paso_cadencia.proveedor_step_id
y version_paso.proveedor_template_id (ambas nullable).
Idempotente (chequea PRAGMA table_info antes de alterar). No destructivo.
Log en sync_cambios con corrida=migrate-copy-apollo-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-copy-apollo-' + datetime.now().strftime('%Y%m%d-%H%M%S')

try:
    cols_paso = {r[1] for r in cur.execute("PRAGMA table_info(paso_cadencia)")}
    paso_ya_existia = 'proveedor_step_id' in cols_paso
    if not paso_ya_existia:
        cur.execute("ALTER TABLE paso_cadencia ADD COLUMN proveedor_step_id TEXT")

    cols_version = {r[1] for r in cur.execute("PRAGMA table_info(version_paso)")}
    version_ya_existia = 'proveedor_template_id' in cols_version
    if not version_ya_existia:
        cur.execute("ALTER TABLE version_paso ADD COLUMN proveedor_template_id TEXT")

    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', 'paso_cadencia', 'proveedor_step_id', 'skip' if paso_ya_existia else 'add_column',
         'columna ya existia' if paso_ya_existia else 'ALTER TABLE ADD COLUMN'),
    )
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', 'version_paso', 'proveedor_template_id', 'skip' if version_ya_existia else 'add_column',
         'columna ya existia' if version_ya_existia else 'ALTER TABLE ADD COLUMN'),
    )
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("  paso_cadencia.proveedor_step_id:", "ya existia" if paso_ya_existia else "creada")
    print("  version_paso.proveedor_template_id:", "ya existia" if version_ya_existia else "creada")
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
