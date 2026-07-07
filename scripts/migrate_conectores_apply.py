"""
Migracion conectores APPLY: crea la tabla conector_config. Idempotente. Loguea en
sync_cambios con corrida=migrate-conectores-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-conectores-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


try:
    existe = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='conector_config'"
    ).fetchone()
    if existe:
        log('conector_config', 'skip', 'tabla ya existia')
        estado = 'skip'
    else:
        cur.execute("""
            CREATE TABLE conector_config (
              proveedor TEXT PRIMARY KEY,
              modo TEXT NOT NULL,
              habilitado INTEGER NOT NULL DEFAULT 1,
              agregado_por TEXT,
              created_at TEXT,
              updated_at TEXT
            )
        """)
        log('conector_config', 'create', 'tabla conector_config creada')
        estado = 'creada'

    con.commit()
    print("APLICADO OK. corrida:", corrida, "| conector_config:", estado)
    print("  columnas finales:")
    for c in cur.execute("PRAGMA table_info(conector_config)"):
        print("   ", c)
except Exception as e:
    con.rollback()
    print("ERROR, rollback:", e)
    raise
finally:
    con.close()
