"""
Migracion user.ver_todo_pipeline APPLY: agrega ver_todo_pipeline a user (Better Auth).
Idempotente (PRAGMA table_info antes del ALTER, salta si ya existe). No destructivo,
no toca filas existentes (default false = nadie ve todo hasta que se marque a mano).
Log en sync_cambios con corrida=migrate-ver-todo-pipeline-<timestamp>.

Setear el flag para Camilo (el CRO) es un paso APARTE, manual (UPDATE user SET
ver_todo_pipeline=1 WHERE email=...) o vía seed_auth_users.ts -- este script solo
crea la columna.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'ver_todo_pipeline': "ALTER TABLE user ADD COLUMN ver_todo_pipeline integer DEFAULT false",
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-ver-todo-pipeline-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'columnas_creadas': 0, 'columnas_ya_existian': 0}
try:
    existentes = {r[1] for r in cur.execute("PRAGMA table_info(user)")}
    for col, ddl in COLUMNAS.items():
        if col in existentes:
            st['columnas_ya_existian'] += 1
            log(f'user.{col}', 'skip', 'columna ya existia')
            continue
        cur.execute(ddl)
        st['columnas_creadas'] += 1
        log(f'user.{col}', 'create', 'ALTER TABLE ADD COLUMN')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    print("\n  columnas de user ahora:")
    for r in cur.execute("PRAGMA table_info(user)"):
        print("   ", r[1])
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
