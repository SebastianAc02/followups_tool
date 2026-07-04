"""
Migracion F0 (V1.1) APPLY: ALTER a toque (razon_perdida, objecion). Idempotente
(si la columna ya existe, no revienta). No destructivo, columnas nullable.
Log en sync_cambios con corrida=migrate-f0-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

ALTERS = [
    ('toque', 'razon_perdida', 'TEXT'),
    ('toque', 'objecion', 'TEXT'),
]

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-f0-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'agregadas': 0, 'ya_existian': 0}
try:
    for tabla, col, tipo in ALTERS:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({tabla})")]
        if col in cols:
            st['ya_existian'] += 1
            log(f'{tabla}.{col}', 'skip', 'columna ya existia')
        else:
            cur.execute(f"ALTER TABLE {tabla} ADD COLUMN {col} {tipo}")
            st['agregadas'] += 1
            log(f'{tabla}.{col}', 'alter', f'ADD COLUMN {col} {tipo}')
    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:12} {v}")
    print("\n  estado final de toque:")
    for c in cur.execute("PRAGMA table_info(toque)"):
        print("   ", c)
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
