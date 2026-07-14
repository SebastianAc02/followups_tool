"""
Migracion configuracion_admin: crea 'configuracion_admin' en isps.db (clave-valor de
ajustes de negocio NO secretos, editables desde /conectores).
Idempotente via CREATE TABLE IF NOT EXISTS. No toca ninguna tabla del dominio ni de auth.

Si el entorno donde corre trae APOLLO_MAILBOX_ID seteada, la siembra como fila
'apollo_mailbox_id' -- SOLO si esa clave todavia no existe -- para que el deploy que
retira la env var de .env.production no deje el buzon de Apollo en blanco a mitad de
camino. Log en sync_cambios con corrida=migrate-configuracion-admin-<timestamp>.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = ["configuracion_admin"]

DDL = """
CREATE TABLE IF NOT EXISTS `configuracion_admin` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	`actualizado_por` text,
	`updated_at` text
);
"""

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-configuracion-admin-' + datetime.now().strftime('%Y%m%d-%H%M%S')


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
        log(t, accion, 'CREATE TABLE IF NOT EXISTS (configuracion_admin)')

    buzon_env = os.environ.get("APOLLO_MAILBOX_ID")
    if buzon_env:
        existe = cur.execute(
            "SELECT 1 FROM configuracion_admin WHERE clave = 'apollo_mailbox_id'"
        ).fetchone()
        if not existe:
            ahora = datetime.now().isoformat()
            cur.execute(
                "INSERT INTO configuracion_admin(clave, valor, actualizado_por, updated_at) VALUES(?,?,?,?)",
                ('apollo_mailbox_id', buzon_env, None, ahora),
            )
            log('configuracion_admin', 'seed', 'apollo_mailbox_id sembrado desde APOLLO_MAILBOX_ID')
            print("  seed: apollo_mailbox_id <-", buzon_env)
        else:
            print("  apollo_mailbox_id ya tenia valor en la tabla, no se toco")
    else:
        print("  APOLLO_MAILBOX_ID no esta en el entorno de esta corrida, sin seed")

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
