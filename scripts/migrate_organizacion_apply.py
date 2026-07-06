"""
Migracion organizacion (V6.1): crea 'organizacion' y 'organizacion_miembro' en isps.db.
Idempotente via CREATE TABLE/INDEX IF NOT EXISTS. No toca ninguna tabla del dominio ni de auth.

organizacion_miembro.owner_canonico DEBE ser el valor EXACTO de empresa.owner (respeta
mayusculas/minusculas reales, ej. 'Camilo fonseca' con f minuscula) para que el filtro de
cola por owner matchee. id_user (nullable) se llena cuando alguien reclama el nombre en
/register; el indice unico parcial evita que dos cuentas reclamen el mismo miembro.
Log en sync_cambios con corrida=migrate-organizacion-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = ["organizacion", "organizacion_miembro"]

DDL = """
CREATE TABLE IF NOT EXISTS `organizacion` (
	`id_organizacion` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`created_at` text
);

CREATE TABLE IF NOT EXISTS `organizacion_miembro` (
	`id_miembro` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_organizacion` integer NOT NULL,
	`owner_canonico` text NOT NULL,
	`nombre_display` text NOT NULL,
	`id_user` text,
	`created_at` text
);
CREATE UNIQUE INDEX IF NOT EXISTS `ux_organizacion_miembro_id_user`
  ON `organizacion_miembro` (`id_user`) WHERE `id_user` IS NOT NULL;
"""

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-organizacion-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


try:
    antes = {
        r[0]
        for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    cur.executescript(DDL)
    for t in TABLAS:
        accion = 'create' if t not in antes else 'skip'
        log(t, accion, 'CREATE TABLE IF NOT EXISTS (organizacion)')
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("\n  estado final:")
    for t in TABLAS:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info(`{t}`)")]
        print(f"   {t}: {len(cols)} columnas -> {cols}")
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
