"""
Migracion V5.2 (EnvioAdapter) APPLY: agrega campana.proveedor_campana_id (nullable).
Idempotente (chequea PRAGMA table_info antes de alterar). No destructivo.
Log en sync_cambios con corrida=migrate-v5.2-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-v5.2-' + datetime.now().strftime('%Y%m%d-%H%M%S')

try:
    cols = {r[1] for r in cur.execute("PRAGMA table_info(campana)")}
    ya_existia = 'proveedor_campana_id' in cols
    if not ya_existia:
        cur.execute("ALTER TABLE campana ADD COLUMN proveedor_campana_id TEXT")

    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', 'campana', 'proveedor_campana_id', 'skip' if ya_existia else 'add_column',
         'columna ya existia' if ya_existia else 'ALTER TABLE ADD COLUMN'),
    )
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("  proveedor_campana_id:", "ya existia" if ya_existia else "creada")
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
