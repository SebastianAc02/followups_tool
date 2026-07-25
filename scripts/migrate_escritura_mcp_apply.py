"""
Migracion user.escritura_mcp APPLY: agrega escritura_mcp a user (Better Auth).
write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md): permiso de ESCRITURA
por MCP, separado del de lectura para poder revocarlo sin perder lectura (ver
app/lib/mcp-gate.ts puedeEscribirMcp).

Idempotente (PRAGMA table_info antes del ALTER, salta si ya existe). No destructivo, no toca
filas existentes (default false = nadie escribe por MCP hasta que se marque a mano). Mismo
patron que scripts/migrate_ver_todo_pipeline_apply.py: la tabla `user` la maneja Better Auth,
no schema.ts, asi que no entra en las migraciones drizzle.

Encender el flag para quien pueda registrar toques por MCP es un paso APARTE, manual
(UPDATE user SET escritura_mcp=1 WHERE email=...) o via seed_auth_users.ts -- este script
solo crea la columna.

NO se corre en este branch: se deja listo para que un humano lo aplique en el deploy.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'escritura_mcp': "ALTER TABLE user ADD COLUMN escritura_mcp integer DEFAULT false",
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-escritura-mcp-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'columnas_creadas': 0, 'columnas_ya_existian': 0}
try:
    existentes = {r[1] for r in cur.execute("PRAGMA table_info(user)")}
    for col, ddl in COLUMNAS.items():
        if col in existentes:
            st['columnas_ya_existian'] += 1
            log(f'user.{col}', 'skip', 'columna ya existia')
            continue
        cur.execute(ddl)
        st['columnas_creadas'] += 1
        log(f'user.{col}', 'create', 'ALTER TABLE ADD COLUMN')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    print("\n  columnas de user ahora:")
    for r in cur.execute("PRAGMA table_info(user)"):
        print("   ", r[1])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
