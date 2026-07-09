"""
Migracion linea_whatsapp DRYRUN: crea la tabla linea_whatsapp (lineas activas de WhatsApp
y su estado, techo diario, referencia al proveedor). Idempotente: si la tabla ya existe,
no hace nada. NO escribe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

existe = cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='linea_whatsapp'"
).fetchone()

if existe:
    print("SKIP: linea_whatsapp ya existe. Nada que hacer.")
else:
    print("CREARIA tabla linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado, techo_diario, fecha_creacion)")

con.rollback()
con.close()
