"""
Migracion F3 (V4.1) APPLY: crea los grupos 1 y 2 del Anexo (cadencias, campanas,
inscripciones). Idempotente (CREATE TABLE/INDEX IF NOT EXISTS, correr dos veces no
duplica ni truena). No destructivo. Log en sync_cambios con corrida=migrate-f3-<timestamp>.

Grupo 1: cadencia, paso_cadencia, version_paso. Grupo 2: segmento, campana, inscripcion,
destinatario. Incluye el indice unico parcial ux_inscripcion_activa (una activa por empresa).
"""
import os
import sqlite3
from datetime import datetime

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

TABLAS = {
    'cadencia': """
        CREATE TABLE IF NOT EXISTS cadencia (
          id_cadencia INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          descripcion TEXT,
          activa INTEGER NOT NULL DEFAULT 1,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'paso_cadencia': """
        CREATE TABLE IF NOT EXISTS paso_cadencia (
          id_paso INTEGER PRIMARY KEY AUTOINCREMENT,
          id_cadencia INTEGER NOT NULL,
          orden INTEGER NOT NULL,
          dia_offset INTEGER NOT NULL,
          canal TEXT NOT NULL,
          objetivo TEXT,
          created_at TEXT
        )
    """,
    'version_paso': """
        CREATE TABLE IF NOT EXISTS version_paso (
          id_version INTEGER PRIMARY KEY AUTOINCREMENT,
          id_paso INTEGER NOT NULL,
          nombre TEXT,
          asunto TEXT,
          cuerpo TEXT,
          es_default INTEGER NOT NULL DEFAULT 0,
          activa INTEGER NOT NULL DEFAULT 1,
          peso INTEGER NOT NULL DEFAULT 1,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'segmento': """
        CREATE TABLE IF NOT EXISTS segmento (
          id_segmento INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          definicion TEXT NOT NULL,
          descripcion_natural TEXT,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'campana': """
        CREATE TABLE IF NOT EXISTS campana (
          id_campana INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          id_cadencia INTEGER NOT NULL,
          id_segmento INTEGER NOT NULL,
          estado TEXT NOT NULL DEFAULT 'borrador',
          owner TEXT,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'inscripcion': """
        CREATE TABLE IF NOT EXISTS inscripcion (
          id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
          id_campana INTEGER NOT NULL,
          id_empresa TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'activa',
          paso_actual INTEGER,
          fecha_inscripcion TEXT,
          fecha_fin TEXT,
          motivo_fin TEXT,
          created_at TEXT,
          updated_at TEXT
        )
    """,
    'destinatario': """
        CREATE TABLE IF NOT EXISTS destinatario (
          id_destinatario INTEGER PRIMARY KEY AUTOINCREMENT,
          id_inscripcion INTEGER NOT NULL,
          id_contacto INTEGER NOT NULL,
          estado TEXT NOT NULL DEFAULT 'activo',
          created_at TEXT
        )
    """,
}

INDICES = {
    'ux_inscripcion_activa': """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_inscripcion_activa
        ON inscripcion(id_empresa) WHERE estado = 'activa'
    """,
}

con = sqlite3.connect(DB)
cur = con.cursor()
corrida = 'migrate-f3-' + datetime.now().strftime('%Y%m%d-%H%M%S')


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

    idx_existentes = {r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='ux_inscripcion_activa'"
    )}
    for idx, ddl in INDICES.items():
        ya_existia = idx in idx_existentes
        cur.execute(ddl)
        if ya_existia:
            st['indices_ya_existian'] += 1
            log(idx, 'skip', 'indice ya existia')
        else:
            st['indices_creados'] += 1
            log(idx, 'create', 'CREATE UNIQUE INDEX parcial')

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
