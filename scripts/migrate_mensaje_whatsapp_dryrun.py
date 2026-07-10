"""
Migracion mensaje_whatsapp DRYRUN: NO escribe nada, solo imprime el plan. Crea la tabla
mensaje_whatsapp (idempotencia + auditoria del inbound de WhatsApp; mensaje_id UNIQUE =
key.id de Evolution). Correr esto antes del apply para ver que va a pasar.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

existe = cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='mensaje_whatsapp'"
).fetchone()

print("DRYRUN migrate mensaje_whatsapp | DB:", DB)
if existe:
    print("  tabla mensaje_whatsapp YA existe -> el apply haria skip (idempotente)")
else:
    print("  tabla mensaje_whatsapp NO existe -> el apply la CREA con:")
    print("    id INTEGER PK AUTOINCREMENT")
    print("    mensaje_id TEXT NOT NULL UNIQUE   (key.id de Evolution, idempotencia)")
    print("    referencia_proveedor TEXT         (instancia/linea por la que entro)")
    print("    telefono TEXT                     (remoteJid normalizado, solo digitos)")
    print("    texto TEXT")
    print("    id_contacto INTEGER               (match resuelto, NULL si desconocido)")
    print("    fecha TEXT")
    print("    created_at TEXT")

con.close()
