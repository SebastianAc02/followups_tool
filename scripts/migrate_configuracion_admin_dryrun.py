#!/usr/bin/env python3
"""Dry-run: muestra si falta la tabla configuracion_admin en isps.db.
No escribe nada."""
import os
import sqlite3

DB_PATH = os.environ.get(
    "ISPS_DB_PATH",
    "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db",
)

TABLAS = ["configuracion_admin"]


def main():
    con = sqlite3.connect(DB_PATH)
    existentes = {
        r[0]
        for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    for t in TABLAS:
        estado = "YA EXISTE (no se toca)" if t in existentes else "SE CREARIA"
        print(f"  {t}: {estado}")

    buzon_env = os.environ.get("APOLLO_MAILBOX_ID")
    if buzon_env:
        print(f"  seed apollo_mailbox_id desde APOLLO_MAILBOX_ID: '{buzon_env}' (solo si la clave no existe aun)")
    else:
        print("  APOLLO_MAILBOX_ID no esta en el entorno actual: no habria seed, quedaria 'Sin configurar' en /conectores")
    con.close()


if __name__ == "__main__":
    main()
