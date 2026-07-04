#!/usr/bin/env python3
"""Dry-run: muestra que tablas de auth (Better Auth) faltan en isps.db. No escribe nada."""
import os
import sqlite3

DB_PATH = os.environ.get(
    "ISPS_DB_PATH",
    "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db",
)

TABLAS_AUTH = ["user", "session", "account", "verification"]


def main():
    con = sqlite3.connect(DB_PATH)
    existentes = {
        r[0]
        for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    for t in TABLAS_AUTH:
        estado = "YA EXISTE (no se toca)" if t in existentes else "SE CREARIA"
        print(f"  {t}: {estado}")
    con.close()


if __name__ == "__main__":
    main()
