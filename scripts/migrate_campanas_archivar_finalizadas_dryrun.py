"""
Migracion campana.estado 'finalizada' -> 'archivada' DRY RUN: solo reporta, no escribe.

Sesion 2026-07-10 (pedido de Sebastian): unifica el estado terminal de una campana
cancelada ('finalizada', el valor que escribia marcarCampanaFinalizada antes de este
fix) con el del auto-archivo por cadencia agotada ('archivada', ver
campanasParaArchivar en app/db/repository.ts). Sin esta migracion, las campanas
canceladas ANTES del fix de codigo se quedarian en 'finalizada' para siempre y no
aparecerian en el tab "Archivadas" de /campanas.

Solo toca campana.estado. NO toca inscripcion.estado='finalizada' -- ese es un
concepto sin relacion (nivel EMPRESA, tambien usado para "cambio de campana").
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

print("=== PLAN DE MIGRACION campana.estado 'finalizada' -> 'archivada' (dry run, no escribe) ===")
filas = cur.execute("SELECT id_campana, nombre FROM campana WHERE estado = 'finalizada'").fetchall()
if not filas:
    print("  ninguna campana en estado 'finalizada' -- no hay nada que migrar")
else:
    for id_campana, nombre in filas:
        print(f"  campana {id_campana:4} {nombre!r:30} 'finalizada' -> 'archivada'")
    print(f"\n  total: {len(filas)} campana(s) se actualizarian")

print("\n  Nada fue modificado en la base.")
