"""
Migracion preferencia_usuario (cargo/telefono) APPLY: agrega cargo y telefono a
preferencia_usuario. Idempotente (PRAGMA table_info antes de cada ALTER, salta si
ya existe). No destructivo, no toca filas existentes. Log en sync_cambios con
corrida=migrate-preferencias-contacto-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'cargo': "ALTER TABLE preferencia_usuario ADD COLUMN cargo TEXT",
    'telefono': "ALTER TABLE preferencia_usuario ADD COLUMN telefono TEXT",
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-preferencias-contacto-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'columnas_creadas': 0, 'columnas_ya_existian': 0}
try:
    existentes = {r[1] for r in cur.execute("PRAGMA table_info(preferencia_usuario)")}
    for col, ddl in COLUMNAS.items():
        if col in existentes:
            st['columnas_ya_existian'] += 1
            log(f'preferencia_usuario.{col}', 'skip', 'columna ya existia')
            continue
        cur.execute(ddl)
        st['columnas_creadas'] += 1
        log(f'preferencia_usuario.{col}', 'create', 'ALTER TABLE ADD COLUMN')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    print("\n  columnas de preferencia_usuario ahora:")
    for r in cur.execute("PRAGMA table_info(preferencia_usuario)"):
        print("   ", r[1])
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
