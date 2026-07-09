"""
Migracion multi-organizacion (Parte 1) APPLY: agrega organizacion_activa_id a
empresa, id_organizacion a toque/segmento/campana (NOT NULL DEFAULT 1 = Onepay, backfill
automatico de SQLite sobre las filas existentes), e id_organizacion NULLABLE a
conector/conector_config. Idempotente (PRAGMA table_info antes de cada ALTER). No
destructivo. Log en sync_cambios con corrida=migrate-organizacion-datos-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'empresa': [('organizacion_activa_id', "ALTER TABLE empresa ADD COLUMN organizacion_activa_id INTEGER NOT NULL DEFAULT 1")],
    'toque': [('id_organizacion', "ALTER TABLE toque ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'segmento': [('id_organizacion', "ALTER TABLE segmento ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'campana': [('id_organizacion', "ALTER TABLE campana ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'conector': [('id_organizacion', "ALTER TABLE conector ADD COLUMN id_organizacion INTEGER")],
    'conector_config': [('id_organizacion', "ALTER TABLE conector_config ADD COLUMN id_organizacion INTEGER")],
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-organizacion-datos-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'columnas_creadas': 0, 'columnas_ya_existian': 0}
try:
    onepay = cur.execute("SELECT id_organizacion FROM organizacion WHERE nombre = 'Onepay'").fetchone()
    if not onepay or onepay[0] != 1:
        raise RuntimeError(f"organizacion Onepay no tiene id=1 ({onepay}), abortar: el DEFAULT 1 quedaria mal")

    for tabla, columnas in COLUMNAS.items():
        existentes = {r[1] for r in cur.execute(f"PRAGMA table_info({tabla})")}
        for col, ddl in columnas:
            if col in existentes:
                st['columnas_ya_existian'] += 1
                log(f'{tabla}.{col}', 'skip', 'columna ya existia')
                continue
            cur.execute(ddl)
            st['columnas_creadas'] += 1
            log(f'{tabla}.{col}', 'create', 'ALTER TABLE ADD COLUMN')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    for tabla in COLUMNAS:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({tabla})")]
        print(f"\n  {tabla}: {cols}")
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
