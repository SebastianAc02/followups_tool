"""
Migracion F0 (V1.1): ALTER a toque. DRY RUN: solo reporta el plan, no escribe.
Agrega razon_perdida y objecion a toque para reflejar en Drizzle. No destructivo
(columnas nullable). contacto ya tiene cargo_categoria/es_key_decision_maker/notas
en la DB real, esas solo se reflejan en schema.ts (no requieren ALTER).
"""
import sqlite3

DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db'

ALTERS = [
    ('toque', 'razon_perdida', 'TEXT'),
    ('toque', 'objecion', 'TEXT'),
]

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION F0 (dry run, no escribe) ===")
for tabla, col, tipo in ALTERS:
    cols = [c[1] for c in cur.execute(f"PRAGMA table_info({tabla})")]
    if col in cols:
        print(f"  {tabla}.{col:20} ya existe, no haria nada")
    else:
        print(f"  {tabla}.{col:20} ALTER TABLE {tabla} ADD COLUMN {col} {tipo}")

print("\n  Nada fue modificado en la base.")
