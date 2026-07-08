#!/usr/bin/env python3
"""Dry-run: muestra si falta la tabla preferencia_usuario en isps.db.
No escribe nada."""
import os
import sqlite3

DB_PATH = os.environ.get(
    "ISPS_DB_PATH",
    "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db",
)

TABLAS = ["preferencia_usuario"]


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
    con.close()


if __name__ == "__main__":
    main()
