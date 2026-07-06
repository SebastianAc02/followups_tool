"""
Migracion V5.6 (manual email Tier 1) APPLY: agrega paso_cadencia.es_manual
(INTEGER NOT NULL DEFAULT 0). Idempotente. No destructivo.
Log en sync_cambios con corrida=migrate-v5.6-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-v5.6-' + datetime.now().strftime('%Y%m%d-%H%M%S')

try:
    cols = {r[1] for r in cur.execute("PRAGMA table_info(paso_cadencia)")}
    ya_existia = 'es_manual' in cols
    if not ya_existia:
        cur.execute("ALTER TABLE paso_cadencia ADD COLUMN es_manual INTEGER NOT NULL DEFAULT 0")

    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', 'paso_cadencia', 'es_manual', 'skip' if ya_existia else 'add_column',
         'columna ya existia' if ya_existia else 'ALTER TABLE ADD COLUMN'),
    )
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("  es_manual:", "ya existia" if ya_existia else "creada")
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
