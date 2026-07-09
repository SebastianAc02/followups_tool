#!/usr/bin/env python3
"""
Migracion multi-organizacion (Parte 1) DRY RUN: agrega organizacion_activa_id a
empresa, id_organizacion a toque/segmento/campana (NOT NULL DEFAULT 1 = Onepay), e
id_organizacion NULLABLE a conector/conector_config. Solo reporta el plan, no escribe.
"""
import os
import sqlite3

DB = os.environ.get('ISPS_DB_PATH', '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')

COLUMNAS = {
    'empresa': [('organizacion_activa_id', "ALTER TABLE empresa ADD COLUMN organizacion_activa_id INTEGER NOT NULL DEFAULT 1")],
    'toque': [('id_organizacion', "ALTER TABLE toque ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'segmento': [('id_organizacion', "ALTER TABLE segmento ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'campana': [('id_organizacion', "ALTER TABLE campana ADD COLUMN id_organizacion INTEGER NOT NULL DEFAULT 1")],
    'conector': [('id_organizacion', "ALTER TABLE conector ADD COLUMN id_organizacion INTEGER")],
    'conector_config': [('id_organizacion', "ALTER TABLE conector_config ADD COLUMN id_organizacion INTEGER")],
}


def main():
    con = sqlite3.connect(DB)
    print("=== PLAN DE MIGRACION multi-organizacion Parte 1 (dry run, no escribe) ===")
    onepay = con.execute("SELECT id_organizacion, nombre FROM organizacion WHERE nombre = 'Onepay'").fetchone()
    print(f"  organizacion Onepay: {onepay}")
    if not onepay or onepay[0] != 1:
        print("  ADVERTENCIA: el id de Onepay no es 1, revisar DEFAULT antes de aplicar.")

    for tabla, columnas in COLUMNAS.items():
        existentes = {r[1] for r in con.execute(f"PRAGMA table_info({tabla})")}
        for col, ddl in columnas:
            if col in existentes:
                print(f"  {tabla}.{col:24} ya existe, no haria nada")
            else:
                n = con.execute(f"SELECT count(*) FROM {tabla}").fetchone()[0]
                print(f"  {tabla}.{col:24} ADD COLUMN ({n} filas existentes)")
    con.close()


if __name__ == '__main__':
    main()
