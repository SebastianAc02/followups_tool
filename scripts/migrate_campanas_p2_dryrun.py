"""
Migracion Campanas P2 (revision de leads): DRY RUN, solo reporta el plan, no escribe.
CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, no destructivo.

segmento_exclusion: leads marcados "esta no va" durante la revision de un segmento,
ANTES de que exista la campana. UNIQUE(id_segmento, id_empresa) hace que excluir dos
veces sea un no-op (idempotente), y que incluir de vuelta sea borrar la fila.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'segmento_exclusion': """
        CREATE TABLE IF NOT EXISTS segmento_exclusion (
          id_exclusion INTEGER PRIMARY KEY AUTOINCREMENT,
          id_segmento INTEGER NOT NULL,
          id_empresa TEXT NOT NULL,
          created_at TEXT
        )
    """,
}

INDICES = {
    'ux_segmento_exclusion_segmento_empresa': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_segmento_exclusion_segmento_empresa
        ON segmento_exclusion(id_segmento, id_empresa)
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION Campanas P2 / segmento_exclusion (dry run, no escribe) ===")
nombres = ",".join(f"'{t}'" for t in TABLAS)
existentes = {r[0] for r in cur.execute(
    f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({nombres})"
)}
for tabla in TABLAS:
    if tabla in existentes:
        print(f"  tabla {tabla:32} ya existe, no haria nada")
    else:
        print(f"  tabla {tabla:32} CREATE")

idx_nombres = ",".join(f"'{i}'" for i in INDICES)
idx_existentes = {r[0] for r in cur.execute(
    f"SELECT name FROM sqlite_master WHERE type='index' AND name IN ({idx_nombres})"
)}
for idx in INDICES:
    if idx in idx_existentes:
        print(f"  index {idx:40} ya existe, no haria nada")
    else:
        print(f"  index {idx:40} CREATE")

print("\n  Nada fue modificado en la base.")
