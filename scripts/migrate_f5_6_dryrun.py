"""
Migracion V5.6 (manual email Tier 1): agrega paso_cadencia.es_manual.
DRY RUN: solo reporta el plan, no escribe.

El paso manual es un FLAG del paso (no una rama de codigo): un paso_cadencia con
es_manual=1 nunca lo dispara el push automatico (V5.4); espera revision humana.
Nullable/default 0 para no romper cadencias existentes (todas quedan automaticas).
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION V5.6 (dry run, no escribe) ===")
cols = {r[1] for r in cur.execute("PRAGMA table_info(paso_cadencia)")}
if 'es_manual' in cols:
    print("  paso_cadencia.es_manual  ya existe, no haria nada")
else:
    print("  paso_cadencia.es_manual  ALTER TABLE paso_cadencia ADD COLUMN es_manual INTEGER NOT NULL DEFAULT 0")

print("\n  Nada fue modificado en la base.")
