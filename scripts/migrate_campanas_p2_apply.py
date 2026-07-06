"""
Migracion Campanas P2 (revision de leads) APPLY: crea segmento_exclusion.
Idempotente (CREATE TABLE/INDEX IF NOT EXISTS, correr dos veces no duplica ni truena).
No destructivo. Log en sync_cambios con corrida=migrate-campanas-p2-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'segmento_exclusion': """
        CREATE TABLE IF NOT EXISTS segmento_exclusion (
          id_exclusion INTEGER PRIMARY KEY AUTOINCREMENT,
          id_segmento INTEGER NOT NULL,
          id_empresa TEXT NOT NULL,
          created_at TEXT
        )
    """,
}

INDICES = {
    'ux_segmento_exclusion_segmento_empresa': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_segmento_exclusion_segmento_empresa
        ON segmento_exclusion(id_segmento, id_empresa)
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-campanas-p2-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'tablas_creadas': 0, 'tablas_ya_existian': 0, 'indices_creados': 0, 'indices_ya_existian': 0}
try:
    nombres = ",".join(f"'{t}'" for t in TABLAS)
    existentes = {r[0] for r in cur.execute(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({nombres})"
    )}
    for tabla, ddl in TABLAS.items():
        ya_existia = tabla in existentes
        cur.execute(ddl)
        if ya_existia:
            st['tablas_ya_existian'] += 1
            log(tabla, 'skip', 'tabla ya existia')
        else:
            st['tablas_creadas'] += 1
            log(tabla, 'create', 'CREATE TABLE')

    idx_nombres = ",".join(f"'{i}'" for i in INDICES)
    idx_existentes = {r[0] for r in cur.execute(
        f"SELECT name FROM sqlite_master WHERE type='index' AND name IN ({idx_nombres})"
    )}
    for idx, ddl in INDICES.items():
        ya_existia = idx in idx_existentes
        cur.execute(ddl)
        if ya_existia:
            st['indices_ya_existian'] += 1
            log(idx, 'skip', 'indice ya existia')
        else:
            st['indices_creados'] += 1
            log(idx, 'create', 'CREATE INDEX')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    print("\n  tablas presentes ahora:")
    nombres = ",".join(f"'{t}'" for t in TABLAS)
    for r in cur.execute(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({nombres}) ORDER BY name"
    ):
        print("   ", r[0])
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
