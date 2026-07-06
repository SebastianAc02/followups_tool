"""
Migracion V5.2 (EnvioAdapter): agrega campana.proveedor_campana_id.
DRY RUN: solo reporta el plan, no escribe.

El Anexo no preveia esta columna: para llamar add_contact_ids/remove_or_stop/archive
o leer tracking de Apollo hace falta el id de LA SECUENCIA en Apollo (emailer_campaign_id),
que es distinto del id_campana interno. Nullable: una campana nace sin secuencia externa
hasta que el EnvioAdapter la crea (crearCampanaExterna).
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION V5.2 (dry run, no escribe) ===")
cols = {r[1] for r in cur.execute("PRAGMA table_info(campana)")}
if 'proveedor_campana_id' in cols:
    print("  campana.proveedor_campana_id  ya existe, no haria nada")
else:
    print("  campana.proveedor_campana_id  ALTER TABLE campana ADD COLUMN proveedor_campana_id TEXT")

print("\n  Nada fue modificado en la base.")
