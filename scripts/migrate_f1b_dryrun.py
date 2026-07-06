"""
Migracion F1b (V3.3 prep): id_usuario en conector (Granola es credencial personal,
Notion es global con id_usuario NULL) y notion_page_id en empresa (enlace directo a la
pagina real, evita buscar por nombre en cada sync -- hay nombres duplicados reales).
DRY RUN: solo reporta el plan, no escribe.

conector se recrea (no ALTER) porque SQLite no permite cambiar UNIQUE por ALTER; se
verifica que este vacia antes de tocarla (hoy 0 filas, recien creada en V3.1, nadie
la usa todavia).
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION F1b (dry run, no escribe) ===")

cols_empresa = [c[1] for c in cur.execute("PRAGMA table_info(empresa)")]
if 'notion_page_id' in cols_empresa:
    print("  empresa.notion_page_id      ya existe, no haria nada")
else:
    print("  empresa.notion_page_id      ALTER TABLE empresa ADD COLUMN notion_page_id TEXT")

cols_conector = [c[1] for c in cur.execute("PRAGMA table_info(conector)")]
if 'id_usuario' in cols_conector:
    print("  conector.id_usuario         ya existe, no haria nada")
else:
    n = cur.execute("SELECT count(*) FROM conector").fetchone()[0]
    print(f"  conector tiene {n} fila(s). Se recrearia con id_usuario TEXT y")
    print("  UNIQUE(proveedor, id_usuario) en vez de proveedor UNIQUE solo.")
    if n > 0:
        print("  ADVERTENCIA: hay filas existentes, revisar antes de aplicar (no migra datos).")

print("\n  Nada fue modificado en la base.")
