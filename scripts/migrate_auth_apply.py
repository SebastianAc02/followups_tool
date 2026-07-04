"""
Migracion de auth (V2.1) APPLY: crea las 4 tablas de Better Auth (user, session,
account, verification) en isps.db. Idempotente via CREATE TABLE IF NOT EXISTS /
CREATE INDEX IF NOT EXISTS. No toca ninguna tabla del dominio (empresa, contacto, toque).

El DDL de abajo es EXACTAMENTE el que genera `drizzle-kit generate` a partir de
app/db/auth-schema.ts (el schema generado por la CLI de Better Auth), solo con
IF NOT EXISTS agregado para que aplicar dos veces no falle. No se transcribio a mano
desde el archivo TS: se genero el SQL real con drizzle-kit y se copio aqui, para no
arriesgar un NOT NULL o un DEFAULT mal copiado.
Log en sync_cambios con corrida=migrate-auth-<timestamp>, igual que migrate_f0_apply.py.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS_AUTH = ["user", "session", "account", "verification"]

DDL = """
CREATE TABLE IF NOT EXISTS `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`owner` text,
	`admin` integer DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);

CREATE TABLE IF NOT EXISTS `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `session_token_unique` ON `session` (`token`);
CREATE INDEX IF NOT EXISTS `session_userId_idx` ON `session` (`user_id`);

CREATE TABLE IF NOT EXISTS `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `account_userId_idx` ON `account` (`user_id`);

CREATE TABLE IF NOT EXISTS `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `verification` (`identifier`);
"""

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-auth-' + datetime.now().strftime('%Y%m%d-%H%M%S')


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
    for t in TABLAS_AUTH:
        accion = 'create' if t not in antes else 'skip'
        log(t, accion, 'CREATE TABLE IF NOT EXISTS (auth Better Auth)')
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("\n  estado final:")
    for t in TABLAS_AUTH:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info(`{t}`)")]
        print(f"   {t}: {len(cols)} columnas -> {cols}")
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
