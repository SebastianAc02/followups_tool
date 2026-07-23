"""
Migracion del plugin `mcp` de Better Auth (login OAuth para el MCP del panel,
docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md) APPLY: crea las 3 tablas que el
plugin necesita para ser authorization server (dynamic client registration, tokens, consent)
en isps.db. Idempotente via CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS. No toca
ninguna tabla existente (user/session/account/verification quedan igual).

El DDL de abajo es EXACTAMENTE el que genera `drizzle-kit generate` a partir de
app/db/auth-schema.ts (las 3 tablas oauthApplication/oauthAccessToken/oauthConsent agregadas
para el plugin mcp), solo con IF NOT EXISTS agregado -- mismo criterio que
migrate_auth_apply.py (V2.1): no se transcribe DDL a mano, se genera con drizzle-kit y se
copia aca.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS_MCP_AUTH = ["oauth_application", "oauth_access_token", "oauth_consent"]

DDL = """
CREATE TABLE IF NOT EXISTS `oauth_application` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`metadata` text,
	`client_id` text NOT NULL,
	`client_secret` text,
	`redirect_urls` text NOT NULL,
	`type` text NOT NULL,
	`disabled` integer DEFAULT false,
	`user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_application_client_id_unique` ON `oauth_application` (`client_id`);
CREATE INDEX IF NOT EXISTS `oauth_application_userId_idx` ON `oauth_application` (`user_id`);

CREATE TABLE IF NOT EXISTS `oauth_access_token` (
	`id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token_expires_at` integer NOT NULL,
	`refresh_token_expires_at` integer NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`scopes` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_access_token_access_token_unique` ON `oauth_access_token` (`access_token`);
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_access_token_refresh_token_unique` ON `oauth_access_token` (`refresh_token`);
CREATE INDEX IF NOT EXISTS `oauth_access_token_clientId_idx` ON `oauth_access_token` (`client_id`);
CREATE INDEX IF NOT EXISTS `oauth_access_token_userId_idx` ON `oauth_access_token` (`user_id`);

CREATE TABLE IF NOT EXISTS `oauth_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`scopes` text NOT NULL,
	`consent_given` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `oauth_consent_clientId_idx` ON `oauth_consent` (`client_id`);
CREATE INDEX IF NOT EXISTS `oauth_consent_userId_idx` ON `oauth_consent` (`user_id`);
"""

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-mcp-oauth-' + datetime.now().strftime('%Y%m%d-%H%M%S')


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
    for t in TABLAS_MCP_AUTH:
        accion = 'create' if t not in antes else 'skip'
        log(t, accion, 'CREATE TABLE IF NOT EXISTS (plugin mcp de Better Auth)')
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    print("\n  estado final:")
    for t in TABLAS_MCP_AUTH:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info(`{t}`)")]
        print(f"   {t}: {len(cols)} columnas -> {cols}")
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
