"""
Migracion Campanas P5 (regla_faltante / intake_diario) APPLY: agrega las columnas.
Idempotente (PRAGMA table_info antes del ALTER). No destructivo.
Log en sync_cambios con corrida=migrate-campanas-p5-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'regla_faltante': "ALTER TABLE campana ADD COLUMN regla_faltante TEXT NOT NULL DEFAULT 'cola'",
    'intake_diario': "ALTER TABLE campana ADD COLUMN intake_diario INTEGER",
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-campanas-p5-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'columnas_creadas': 0, 'columnas_ya_existian': 0}
try:
    existentes = {r[1] for r in cur.execute("PRAGMA table_info(campana)")}
    for col, ddl in COLUMNAS.items():
        if col in existentes:
            st['columnas_ya_existian'] += 1
            log(f'campana.{col}', 'skip', 'columna ya existia')
            continue
        cur.execute(ddl)
        st['columnas_creadas'] += 1
        log(f'campana.{col}', 'create', 'ALTER TABLE ADD COLUMN')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    print("\n  columnas de campana ahora:")
    for r in cur.execute("PRAGMA table_info(campana)"):
        print("   ", r[1])
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
