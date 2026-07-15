#!/usr/bin/env python3
"""Borra las 58 empresas de prueba que dos scripts de seed sembraron en la base REAL
(seed_test_empresas_apply.py -> 15 'Empresa Test', categoria='test', 2026-07-07;
seed_leads_robustos.py -> 43 empresas ficticias de credito, categoria='creditos',
2026-07-09). Decision de Sebastian 2026-07-15: borrarlas.

Verificado antes de escribir esto: 0 toques reales cuelgan de ellas, y las 43 de
credito estan inscritas SOLO en la campana 34 ('Cadencia corta de prueba', archivada,
0 empresas reales) -- por eso la campana tambien se va.

Dry-run por defecto. Aplica solo con --apply.
"""
import sqlite3
import sys

DB_PATH = "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db"
CATEGORIAS_DUMMY = ("test", "creditos")
CAMPANA_DUMMY = 34


def main() -> int:
    aplicar = "--apply" in sys.argv
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    marcadores = ",".join("?" for _ in CATEGORIAS_DUMMY)
    ids = [r[0] for r in cur.execute(
        f"select id_empresa from empresa where categoria in ({marcadores})", CATEGORIAS_DUMMY
    ).fetchall()]

    if not ids:
        print("No hay empresas dummy. Nada que hacer.")
        return 0

    ids_marcadores = ",".join("?" for _ in ids)
    n_contactos = cur.execute(
        f"select count(*) from contacto where id_empresa in ({ids_marcadores})", ids
    ).fetchone()[0]
    n_toques = cur.execute(
        f"select count(*) from toque where id_empresa in ({ids_marcadores})", ids
    ).fetchone()[0]
    n_inscripciones = cur.execute(
        f"select count(*) from inscripcion where id_empresa in ({ids_marcadores})", ids
    ).fetchone()[0]

    print(f"empresas dummy      : {len(ids)}")
    print(f"contactos dummy     : {n_contactos}")
    print(f"inscripciones dummy : {n_inscripciones}")
    print(f"toques REALES       : {n_toques}  <- si no es 0, ABORTAR y revisar a mano")

    if n_toques != 0:
        print("\nABORTA: hay toques reales colgando de una empresa dummy. No se borra nada.")
        return 1

    if not aplicar:
        print("\nDry-run. Nada escrito. Corre con --apply para aplicar.")
        return 0

    cur.execute("begin")
    cur.execute(f"delete from contacto where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from inscripcion where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa_usuarios where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa_clasificacion where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa_alias where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa where id_empresa in ({ids_marcadores})", ids)
    cur.execute("delete from campana where id_campana = ?", (CAMPANA_DUMMY,))
    cur.execute(
        "insert into sync_cambios (fuente, entidad, id_registro, accion, detalle) values (?,?,?,?,?)",
        ("script", "empresa", "dummies", "borrar:seed_prueba",
         f"{len(ids)} empresas dummy + {n_contactos} contactos + campana {CAMPANA_DUMMY}"),
    )
    con.commit()
    print(f"\nBorradas {len(ids)} empresas dummy, {n_contactos} contactos y la campana {CAMPANA_DUMMY}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
