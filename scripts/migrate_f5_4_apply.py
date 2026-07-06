"""
Migracion V5.4 (push reanudable B6) APPLY: agrega paso_inscripcion.intentos y
paso_inscripcion.proximo_intento (nullable/default 0). Idempotente. No destructivo.
Log en sync_cambios con corrida=migrate-v5.4-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'intentos': "ALTER TABLE paso_inscripcion ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0",
    'proximo_intento': "ALTER TABLE paso_inscripcion ADD COLUMN proximo_intento TEXT",
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-v5.4-' + datetime.now().strftime('%Y%m%d-%H%M%S')

try:
    cols = {r[1] for r in cur.execute("PRAGMA table_info(paso_inscripcion)")}
    st = {'creadas': 0, 'ya_existian': 0}
    for col, ddl in COLUMNAS.items():
        ya_existia = col in cols
        if not ya_existia:
            cur.execute(ddl)
            st['creadas'] += 1
        else:
            st['ya_existian'] += 1
        cur.execute(
            "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
            (corrida, 'migracion', 'paso_inscripcion', col, 'skip' if ya_existia else 'add_column',
             'columna ya existia' if ya_existia else 'ALTER TABLE ADD COLUMN'),
        )
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
