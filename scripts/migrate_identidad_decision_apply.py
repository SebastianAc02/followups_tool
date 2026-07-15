"""
Migracion Task 12 (plan 2026-07-15-embudo-real-y-registro) APPLY:
- tabla identidad_decision (complemento de empresa_alias: guarda tambien los NO y los
  satelite_de, no solo los SI, para que el matcher/diff no vuelva a proponer pares ya
  refutados en cada corrida).
- columna empresa.id_empresa_matriz (distinta de opera_bajo_id: satelite_de = ambas filas
  viven, cada una con su propio deal; opera_bajo_id = identidad muerta, absorbida).
Idempotente. Loguea en sync_cambios con corrida=migrate-identidad-decision-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-identidad-decision-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


try:
    existe_tabla = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='identidad_decision'"
    ).fetchone()
    if existe_tabla:
        log('identidad_decision', 'skip', 'tabla ya existia')
        estado_tabla = 'skip'
    else:
        cur.execute("""
            CREATE TABLE identidad_decision (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              a TEXT NOT NULL,
              b TEXT NOT NULL,
              veredicto TEXT NOT NULL CHECK (veredicto IN ('mismo','distinto','satelite_de')),
              decidido_por TEXT NOT NULL,
              nota TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        log('identidad_decision', 'create', 'tabla identidad_decision creada')
        estado_tabla = 'creada'

    columnas_empresa = [c[1] for c in cur.execute("PRAGMA table_info(empresa)")]
    if 'id_empresa_matriz' in columnas_empresa:
        log('empresa', 'skip', 'columna id_empresa_matriz ya existia')
        estado_columna = 'skip'
    else:
        cur.execute("ALTER TABLE empresa ADD COLUMN id_empresa_matriz TEXT")
        log('empresa', 'add_column', 'id_empresa_matriz TEXT (satelite_de, distinta de opera_bajo_id)')
        estado_columna = 'creada'

    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("  identidad_decision:", estado_tabla)
    print("  empresa.id_empresa_matriz:", estado_columna)
except Exception as e:
    con.rollback()
    print("ERROR, rollback:", e)
    raise
