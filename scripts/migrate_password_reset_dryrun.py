"""
Migracion password_reset_token DRYRUN: crea la tabla del reset de password self-service
(2026-08-31, app/db/auth-schema.ts). Idempotente: si la tabla ya existe, no hace nada.
NO escribe. Ver migrate_password_reset_apply.py para el DDL real y el porque de una
tabla propia en vez del mecanismo nativo de Better Auth.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

con = sqlite3.connect(DB)
cur = con.cursor()

existe = cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='password_reset_token'"
).fetchone()

if existe:
    print("SKIP: password_reset_token ya existe. Nada que hacer.")
else:
    print("CREARIA tabla password_reset_token (id PK, user_id FK->user, token_hash UNIQUE,")
    print("  expires_at, used_at, created_at) + indice en user_id")

con.rollback()
con.close()
