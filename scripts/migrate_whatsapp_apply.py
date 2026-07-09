"""
Migracion linea_whatsapp APPLY: crea la tabla linea_whatsapp (id_usuario nullable:
NULL = linea de pool/compartida, no-null = linea personal de ESE usuario). Idempotente.
Loguea en sync_cambios con corrida=migrate-whatsapp-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-whatsapp-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


try:
    existe = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='linea_whatsapp'"
    ).fetchone()
    if existe:
        log('linea_whatsapp', 'skip', 'tabla ya existia')
        estado = 'skip'
    else:
        cur.execute("""
            CREATE TABLE linea_whatsapp (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              numero TEXT NOT NULL,
              tipo TEXT NOT NULL,
              id_usuario TEXT,
              referencia_proveedor TEXT,
              estado TEXT NOT NULL DEFAULT 'calentando',
              techo_diario INTEGER NOT NULL DEFAULT 25,
              fecha_creacion TEXT
            )
        """)
        log('linea_whatsapp', 'create', 'tabla linea_whatsapp creada')
        estado = 'creada'

    con.commit()
    print("APLICADO OK. corrida:", corrida, "| linea_whatsapp:", estado)
    print("  columnas finales:")
    for c in cur.execute("PRAGMA table_info(linea_whatsapp)"):
        print("   ", c)
except Exception as e:
    con.rollback()
    print("ERROR, rollback:", e)
    raise
finally:
    con.close()
