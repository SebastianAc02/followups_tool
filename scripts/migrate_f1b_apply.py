"""
Migracion F1b (V3.3 prep) APPLY: id_usuario en conector + notion_page_id en empresa.
Idempotente. Recrea conector SOLO si esta vacia (hoy 0 filas) y no tiene id_usuario
todavia; aborta con error si encuentra filas para no perder datos en silencio.
Log en sync_cambios con corrida=migrate-f1b-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-f1b-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'empresa.notion_page_id': 'skip', 'conector.id_usuario': 'skip'}
try:
    cols_empresa = [c[1] for c in cur.execute("PRAGMA table_info(empresa)")]
    if 'notion_page_id' not in cols_empresa:
        cur.execute("ALTER TABLE empresa ADD COLUMN notion_page_id TEXT")
        st['empresa.notion_page_id'] = 'agregada'
        log('empresa.notion_page_id', 'alter', 'ADD COLUMN notion_page_id TEXT')
    else:
        log('empresa.notion_page_id', 'skip', 'columna ya existia')

    cols_conector = [c[1] for c in cur.execute("PRAGMA table_info(conector)")]
    if 'id_usuario' not in cols_conector:
        n = cur.execute("SELECT count(*) FROM conector").fetchone()[0]
        if n > 0:
            raise RuntimeError(f"conector tiene {n} fila(s), no se recrea automaticamente sin migrar datos")
        cur.execute("DROP TABLE conector")
        cur.execute("""
            CREATE TABLE conector (
              id_conector INTEGER PRIMARY KEY AUTOINCREMENT,
              proveedor TEXT NOT NULL,
              id_usuario TEXT,
              credencial_ciphertext TEXT,
              estado TEXT NOT NULL DEFAULT 'sin_credencial',
              ultima_corrida TEXT,
              ultimo_resultado TEXT,
              created_at TEXT,
              updated_at TEXT,
              UNIQUE(proveedor, id_usuario)
            )
        """)
        st['conector.id_usuario'] = 'recreada'
        log('conector', 'recreate', 'agregado id_usuario, UNIQUE(proveedor, id_usuario)')
    else:
        log('conector.id_usuario', 'skip', 'columna ya existia')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:24} {v}")
    print("\n  estado final de conector:")
    for c in cur.execute("PRAGMA table_info(conector)"):
        print("   ", c)
    print("\n  estado final de empresa (columnas nuevas):")
    for c in cur.execute("PRAGMA table_info(empresa)"):
        if c[1] == 'notion_page_id':
            print("   ", c)
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
