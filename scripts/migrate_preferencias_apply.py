"""
Migracion preferencia_usuario (Fase 2 de la abstraccion de Perfil): crea
'preferencia_usuario' en isps.db.
Idempotente via CREATE TABLE IF NOT EXISTS. No toca ninguna tabla del dominio ni de auth.

Una fila por usuario, columnas nullable. Sin fila = el adapter
(app/adapters/preferencias-db.ts) aplica PREFERENCIAS_DEFAULT (app/core/perfil.ts);
esta tabla nunca se sincroniza a Notion (son ajustes locales del usuario, no dato de
dominio). Log en sync_cambios con corrida=migrate-preferencias-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = ["preferencia_usuario"]

DDL = """
CREATE TABLE IF NOT EXISTS `preferencia_usuario` (
	`id_user` text PRIMARY KEY NOT NULL,
	`color_avatar` text,
	`vista_inicio` text,
	`updated_at` text
);
"""

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-preferencias-' + datetime.now().strftime('%Y%m%d-%H%M%S')


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
        log(t, accion, 'CREATE TABLE IF NOT EXISTS (preferencia_usuario)')
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
