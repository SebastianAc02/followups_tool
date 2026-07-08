#!/usr/bin/env python3
"""Siembra 15 empresas de prueba (categoria='test') con 1 contacto cada una,
para probar el flujo de campanas de punta a punta sin tocar cuentas reales.
14 contactos usan un correo placeholder (nunca se les manda nada de verdad
todavia); el ultimo usa sacostamolin@gmail.com para que Sebastian reciba el
envio real cuando pruebe. Idempotente: si ya existen, no duplica.
"""
import sqlite3
import sys

DB_PATH = "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db"
PREFIJO_ID = "99990000"
TOTAL = 15
CORREO_REAL = "sacostamolin@gmail.com"


def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    ya_existe = cur.execute(
        "select count(*) from empresa where id_empresa like ?", (f"{PREFIJO_ID}%",)
    ).fetchone()[0]
    if ya_existe > 0:
        print(f"Ya hay {ya_existe} empresas de prueba sembradas, no se duplica. Nada que hacer.")
        con.close()
        return

    for i in range(1, TOTAL + 1):
        id_empresa = f"{PREFIJO_ID}{i:03d}"
        nombre = f"Empresa Test {i:02d}"
        cur.execute(
            """
            insert into empresa
              (id_empresa, tipo_id, nombre_oficial, nombre_normalizado,
               ciudad_principal, departamento, es_cliente, en_conversacion,
               estado_comercial, categoria)
            values (?, 'nit', ?, ?, 'Bogota', 'Bogota D.C.', 0, 0, 'lead', 'test')
            """,
            (id_empresa, nombre, nombre.lower()),
        )

        email = CORREO_REAL if i == TOTAL else f"testing{i:02d}@example.com"
        cur.execute(
            """
            insert into contacto
              (id_empresa, nombre, apellido, cargo, cargo_categoria,
               es_key_decision_maker, telefono, email, es_principal, fuente)
            values (?, 'Contacto', 'Test', 'Gerente', 'gerente', 1, NULL, ?, 1, 'seed_test')
            """,
            (id_empresa, email),
        )

    con.commit()
    print(f"Sembradas {TOTAL} empresas de prueba (id {PREFIJO_ID}001..{PREFIJO_ID}{TOTAL:03d}).")
    print(f"14 contactos con correo placeholder testingNN@example.com, 1 con {CORREO_REAL}.")
    con.close()


if __name__ == "__main__":
    main()
