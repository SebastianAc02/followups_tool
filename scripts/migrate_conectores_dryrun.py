"""
Migracion conectores DRYRUN: crea la tabla conector_config (politica de modo/habilitado
del rediseño de /conectores). Idempotente: si la tabla ya existe, no hace nada. NO escribe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

existe = cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='conector_config'"
).fetchone()

if existe:
    print("SKIP: conector_config ya existe. Nada que hacer.")
else:
    print("CREARIA tabla conector_config (proveedor PK, modo, habilitado, agregado_por, created_at, updated_at)")

con.rollback()
con.close()
