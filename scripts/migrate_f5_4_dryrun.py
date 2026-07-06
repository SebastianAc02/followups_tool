"""
Migracion V5.4 (push reanudable B6): agrega paso_inscripcion.intentos y
paso_inscripcion.proximo_intento. DRY RUN: solo reporta el plan, no escribe.

El Anexo no preveia backoff en paso_inscripcion (grupo 3, V5.1); B6 pide explicitamente
"la corrida siguiente retoma pendiente/fallo con backoff", mismo patron que outbox
(V3.7): intentos cuenta cuantas veces se intento, proximo_intento es la fecha desde la
cual vale la pena reintentar (NULL = listo para intentar ya).
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'intentos': "ALTER TABLE paso_inscripcion ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0",
    'proximo_intento': "ALTER TABLE paso_inscripcion ADD COLUMN proximo_intento TEXT",
}

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION V5.4 (dry run, no escribe) ===")
cols = {r[1] for r in cur.execute("PRAGMA table_info(paso_inscripcion)")}
for col, ddl in COLUMNAS.items():
    if col in cols:
        print(f"  paso_inscripcion.{col:16} ya existe, no haria nada")
    else:
        print(f"  paso_inscripcion.{col:16} {ddl}")

print("\n  Nada fue modificado en la base.")
