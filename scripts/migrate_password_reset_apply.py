"""
Migracion password_reset_token APPLY: crea la tabla que necesita el flujo de "olvide mi
password" self-service (2026-08-31, app/db/auth-schema.ts, app/lib/password-reset.ts).

Tabla PROPIA y no el mecanismo nativo de Better Auth (requestPasswordReset/reset-password,
node_modules/better-auth/dist/api/routes/password.mjs): ese mecanismo guarda el token CRUDO
en `verification.identifier` (`reset-password:${token}`), sin hashear. Aca se guarda solo el
sha256 del token (token_hash, UNIQUE) -- el valor que llega por link nunca se puede reconstruir
leyendo la fila. La contrasena nueva se escribe con el mismo hasher que usa el login normal
(`hashPassword` de 'better-auth/crypto'), directo en la tabla `account` (provider `credential`),
para que el usuario pueda loguearse con la clave nueva sin tocar nada mas de Better Auth.

Idempotente via CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS. No toca ninguna tabla
existente (user/session/account/verification quedan igual). Mismo criterio que
migrate_mcp_oauth_apply.py: DDL generado desde el schema de Drizzle (app/db/auth-schema.ts),
copiado aca con IF NOT EXISTS agregado a mano.

NO se corre en este branch: se deja listo para que un humano (o experto-vps, deploy en el VPS)
lo aplique contra el isps.db real. Contra la copia local del Mac tampoco se corrio en esta
sesion -- ver docs/operar-data.md sobre que la local es snapshot de lectura.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

DDL = """
CREATE TABLE IF NOT EXISTS `password_reset_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `password_reset_token_token_hash_unique` ON `password_reset_token` (`token_hash`);
CREATE INDEX IF NOT EXISTS `password_reset_token_userId_idx` ON `password_reset_token` (`user_id`);
"""

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-password-reset-' + datetime.now().strftime('%Y%m%d-%H%M%S')


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
    accion = 'create' if 'password_reset_token' not in antes else 'skip'
    log('password_reset_token', accion, 'CREATE TABLE IF NOT EXISTS (reset password self-service)')
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    cols = [c[1] for c in cur.execute("PRAGMA table_info(`password_reset_token`)")]
    print(f"\n  estado final: password_reset_token: {len(cols)} columnas -> {cols}")
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
