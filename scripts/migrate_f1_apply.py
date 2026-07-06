"""
Migracion F1 (V3.1) APPLY: crea conector y outbox. Idempotente (CREATE TABLE IF NOT
EXISTS, correr dos veces no duplica ni truena). No destructivo. Log en sync_cambios
con corrida=migrate-f1-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'conector': """
        CREATE TABLE IF NOT EXISTS conector (
          id_conector INTEGER PRIMARY KEY AUTOINCREMENT,
          proveedor TEXT NOT NULL UNIQUE,
          credencial_ciphertext TEXT,
          estado TEXT NOT NULL DEFAULT 'sin_credencial',
          ultima_corrida TEXT,
          ultimo_resultado TEXT,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'outbox': """
        CREATE TABLE IF NOT EXISTS outbox (
          id_outbox INTEGER PRIMARY KEY AUTOINCREMENT,
          entidad TEXT NOT NULL,
          id_registro TEXT NOT NULL,
          payload TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'aprobado',
          intentos INTEGER NOT NULL DEFAULT 0,
          proximo_intento TEXT,
          created_at TEXT
        )
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-f1-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'creadas': 0, 'ya_existian': 0}
try:
    existentes = {r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('conector','outbox')"
    )}
    for tabla, ddl in TABLAS.items():
        ya_existia = tabla in existentes
        cur.execute(ddl)
        if ya_existia:
            st['ya_existian'] += 1
            log(tabla, 'skip', 'tabla ya existia')
        else:
            st['creadas'] += 1
            log(tabla, 'create', 'CREATE TABLE')
    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:12} {v}")
    print("\n  tablas presentes ahora:")
    for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('conector','outbox')"
    ):
        print("   ", r[0])
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
