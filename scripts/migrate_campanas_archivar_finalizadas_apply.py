"""
Migracion campana.estado 'finalizada' -> 'archivada' APPLY.
Ver migrate_campanas_archivar_finalizadas_dryrun.py para el detalle del porque.
Log en sync_cambios con corrida=migrate-campanas-archivar-finalizadas-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-campanas-archivar-finalizadas-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(id_campana, nombre):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', 'campana', str(id_campana), 'update', f"estado 'finalizada' -> 'archivada' ({nombre})"),
    )


try:
    filas = cur.execute("SELECT id_campana, nombre FROM campana WHERE estado = 'finalizada'").fetchall()
    for id_campana, nombre in filas:
        log(id_campana, nombre)
    cur.execute("UPDATE campana SET estado = 'archivada' WHERE estado = 'finalizada'")
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print(f"  {len(filas)} campana(s) actualizadas a 'archivada':")
    for id_campana, nombre in filas:
        print(f"   campana {id_campana}: {nombre}")
    restantes = cur.execute("SELECT count(*) FROM campana WHERE estado = 'finalizada'").fetchone()[0]
    print(f"\n  campanas que quedan en 'finalizada': {restantes} (deberia ser 0)")
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
