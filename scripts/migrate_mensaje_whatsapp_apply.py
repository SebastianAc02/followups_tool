"""
Migracion mensaje_whatsapp APPLY: crea la tabla mensaje_whatsapp (idempotencia +
auditoria del inbound de WhatsApp). mensaje_id UNIQUE = key.id de Evolution: el indice
unico es el respaldo final ante un reintento del webhook (mismo patron que
evento_tracking). Idempotente. Loguea en sync_cambios con corrida=migrate-mensaje-wa-<ts>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-mensaje-wa-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


try:
    existe = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='mensaje_whatsapp'"
    ).fetchone()
    if existe:
        log('mensaje_whatsapp', 'skip', 'tabla ya existia')
        estado = 'skip'
    else:
        cur.execute("""
            CREATE TABLE mensaje_whatsapp (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mensaje_id TEXT NOT NULL UNIQUE,
              referencia_proveedor TEXT,
              telefono TEXT,
              texto TEXT,
              id_contacto INTEGER,
              fecha TEXT,
              created_at TEXT
            )
        """)
        log('mensaje_whatsapp', 'create', 'tabla mensaje_whatsapp creada')
        estado = 'creada'

    con.commit()
    print("APLICADO OK. corrida:", corrida, "| mensaje_whatsapp:", estado)
    print("  columnas finales:")
    for c in cur.execute("PRAGMA table_info(mensaje_whatsapp)"):
        print("   ", c)
except Exception as e:
    con.rollback()
    print("ERROR, rollback:", e)
    raise
finally:
    con.close()
