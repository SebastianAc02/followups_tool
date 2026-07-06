"""
Migracion F4 (V5.1) APPLY: crea el grupo 3 del Anexo (ejecucion y tracking).
Idempotente (CREATE TABLE/INDEX IF NOT EXISTS, correr dos veces no duplica ni truena).
No destructivo. Log en sync_cambios con corrida=migrate-f4-<timestamp>.

paso_inscripcion (el motor / "toques de hoy"): un envio por destinatario y paso
(indice unico id_destinatario+id_paso). evento_tracking (append-only): idempotente
por proveedor_evento_id (indice unico), indices de consulta por id_paso_inscripcion
y fecha_evento.
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'paso_inscripcion': """
        CREATE TABLE IF NOT EXISTS paso_inscripcion (
          id_paso_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
          id_destinatario INTEGER NOT NULL,
          id_paso INTEGER NOT NULL,
          id_version INTEGER NOT NULL,
          id_toque INTEGER,
          canal TEXT NOT NULL,
          proveedor TEXT,
          proveedor_mensaje_id TEXT,
          estado TEXT NOT NULL DEFAULT 'pendiente',
          fecha_programada TEXT,
          fecha_enviada TEXT,
          created_at TEXT
        )
    """,
    'evento_tracking': """
        CREATE TABLE IF NOT EXISTS evento_tracking (
          id_evento INTEGER PRIMARY KEY AUTOINCREMENT,
          id_paso_inscripcion INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          canal TEXT NOT NULL,
          proveedor_evento_id TEXT NOT NULL,
          detalle TEXT,
          fecha_evento TEXT,
          created_at TEXT
        )
    """,
}

INDICES = {
    'ux_paso_inscripcion_destinatario_paso': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_paso_inscripcion_destinatario_paso
        ON paso_inscripcion(id_destinatario, id_paso)
    """,
    'ux_evento_tracking_proveedor_evento_id': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_evento_tracking_proveedor_evento_id
        ON evento_tracking(proveedor_evento_id)
    """,
    'ix_evento_tracking_paso_inscripcion': """
        CREATE INDEX IF NOT EXISTS ix_evento_tracking_paso_inscripcion
        ON evento_tracking(id_paso_inscripcion)
    """,
    'ix_evento_tracking_fecha_evento': """
        CREATE INDEX IF NOT EXISTS ix_evento_tracking_fecha_evento
        ON evento_tracking(fecha_evento)
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-f4-' + datetime.now().strftime('%Y%m%d-%H%M%S')


def log(entidad, accion, detalle):
    cur.execute(
        "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
        (corrida, 'migracion', entidad, entidad, accion, detalle),
    )


st = {'tablas_creadas': 0, 'tablas_ya_existian': 0, 'indices_creados': 0, 'indices_ya_existian': 0}
try:
    nombres = ",".join(f"'{t}'" for t in TABLAS)
    existentes = {r[0] for r in cur.execute(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({nombres})"
    )}
    for tabla, ddl in TABLAS.items():
        ya_existia = tabla in existentes
        cur.execute(ddl)
        if ya_existia:
            st['tablas_ya_existian'] += 1
            log(tabla, 'skip', 'tabla ya existia')
        else:
            st['tablas_creadas'] += 1
            log(tabla, 'create', 'CREATE TABLE')

    idx_nombres = ",".join(f"'{i}'" for i in INDICES)
    idx_existentes = {r[0] for r in cur.execute(
        f"SELECT name FROM sqlite_master WHERE type='index' AND name IN ({idx_nombres})"
    )}
    for idx, ddl in INDICES.items():
        ya_existia = idx in idx_existentes
        cur.execute(ddl)
        if ya_existia:
            st['indices_ya_existian'] += 1
            log(idx, 'skip', 'indice ya existia')
        else:
            st['indices_creados'] += 1
            log(idx, 'create', 'CREATE INDEX')

    log(corrida, 'resumen', str(st))
    con.commit()
    print("APLICADO OK. corrida:", corrida)
    for k, v in st.items():
        print(f"  {k:20} {v}")
    print("\n  tablas presentes ahora:")
    nombres = ",".join(f"'{t}'" for t in TABLAS)
    for r in cur.execute(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({nombres}) ORDER BY name"
    ):
        print("   ", r[0])
    print("\n  cambios logueados:", cur.execute(
        "SELECT count(*) FROM sync_cambios WHERE corrida=?", (corrida,)
    ).fetchone()[0])
except Exception as ex:
    con.rollback()
    print("ERROR, rollback:", ex)
    raise
