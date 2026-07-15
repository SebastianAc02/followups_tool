#!/usr/bin/env python3
"""Siembra 43 empresas (categoria='creditos'), con nombre de cuenta y de contacto
realistas, la MAYORIA con 2-3 contactos y TODOS con telefono ademas de email -- a
diferencia de scripts/seed_test_empresas_apply.py (15 cuentas, 1 contacto, sin
telefono), esta siembra existe para probar el flujo completo de una campana con pasos
de llamada/whatsapp (necesitan telefono, ver app/core/canales-empresa.ts) y no solo
correo. Dos cuentas quedan marcadas como placeholder obvio ("EMPRESA DE PRUEBA...", en
la mitad y al final del lote) para que sea facil distinguir "esto es un dummy" de las
demas, que llevan nombre de empresa y de persona real-sonantes.

categoria='creditos' (no 'test'): a proposito distinta de 'isp'/'utility' -- Sebastian
quiere explorar como se veria un segmento de una vertical futura (empresas de credito),
que hoy no se trabaja de verdad pero que puede llegar a ser una linea de negocio nueva.
No se necesita YA, es solo para que el segmento/campana se vea distinto de las cuentas
ISP reales al probar la herramienta.

Todos los correos son placeholder (nunca se le manda nada real a nadie): no hay ningun
correo real en este lote, a proposito -- es dato para ver la cadencia funcionar
(materializador + /cola), no para disparar un envio de verdad. Si se quiere probar un
envio real, se usa el contacto ya sembrado en seed_test_empresas_apply.py.

Ademas del minimo (empresa + contacto), esta siembra llena el resto de columnas que una
cuenta ISP real SI trae desde el dia 1 (ver empresa real en isps.db: crm_software,
pasarela_actual, estado_comercial/estado_notion, owner, prioridad_comercial,
empresa_usuarios) -- para que una cuenta de este lote se vea completa en el cockpit, no
un esqueleto con solo nombre y contacto. owner queda vacio en la mayoria (igual que en
la base real: la mayoria de empresas no tiene owner individual asignado, ver memoria del
proyecto "Ownership dos niveles"), asignado solo a un puñado para poder probar el
filtro por owner de /cola tambien.

Idempotente: si ya existen empresas con el prefijo, no duplica.
"""
import os
import random
import sqlite3

# 2026-07-15: este script sembro 43 empresas de prueba en la base REAL de produccion y
# hubo que borrarlas a mano (ver scripts/borrar_dummies.py). Nunca mas por defecto: la
# ruta ahora es obligatoria y explicita por env var, para que sembrar sobre una copia
# sea el camino facil y sembrar sobre la real sea una decision consciente.
DB_PATH = os.environ.get("ISPS_DB_PATH")
if not DB_PATH:
    raise SystemExit(
        "Falta ISPS_DB_PATH. Sembra sobre una COPIA, no sobre isps.db real:\n"
        "  sqlite3 ../isps.db \".backup '/tmp/isps-prueba.db'\"\n"
        "  ISPS_DB_PATH=/tmp/isps-prueba.db python3 scripts/seed_leads_robustos.py"
    )
PREFIJO_ID = "99992"
CATEGORIA = "creditos"

# Semilla fija: la siembra es reproducible (correr el script dos veces desde cero
# produce los mismos datos), no aleatoriedad real -- no importa para datos de prueba,
# pero evita sorpresas si se necesita re-generar el lote.
random.seed(42)

# Equivalentes de "CRM/software" y "pasarela de pago" para la vertical credito (core
# de cartera/cobranza, no el CRM de un ISP) -- mismo tipo de dato que crm_software/
# pasarela_actual en las cuentas ISP reales, con nombres inventados para este vertical.
CRM_CREDITO = ['Core propio', 'Kandor', 'Nébula Cartera', 'Manual / Excel', 'Sicaf', 'Cobra360', 'Desconocido']
PASARELA_CREDITO = ['PSE', 'Wompi', 'Convenio bancario directo', 'Sin pasarela', 'Addi', 'Recaudo manual']

# Distribucion realista del embudo: la mayoria en 'lead' (vertical nueva, apenas se
# esta explorando), pocas mas avanzadas -- mismo shape que el embudo real de ISPs.
ESTADOS_COMERCIAL = (
    ['lead'] * 6 + ['contactado'] * 3 + ['negociacion'] * 2 + ['pausado'] * 1 + ['cliente'] * 1 + ['descartado'] * 1
)
ESTADO_NOTION_POR_COMERCIAL = {
    'lead': 'lead',
    'contactado': 'contacto_iniciado',
    'negociacion': 'oportunidad',
    'pausado': 'on_hold',
    'cliente': 'firma_pago',
    'descartado': None,
}

# Mismos nombres de owner que ya usa el equipo real (ver empresa.owner en isps.db) --
# la mayoria de cuentas queda SIN owner (89% en la base real, ver memoria del proyecto).
OWNERS = ['Felipe Castro', 'Camilo fonseca', 'Sebastian Acosta Molina']

CIUDADES = [
    ("Bogota", "Bogota D.C."),
    ("Medellin", "Antioquia"),
    ("Cali", "Valle del Cauca"),
    ("Barranquilla", "Atlantico"),
    ("Bucaramanga", "Santander"),
    ("Pereira", "Risaralda"),
    ("Manizales", "Caldas"),
    ("Ibague", "Tolima"),
    ("Cucuta", "Norte de Santander"),
    ("Neiva", "Huila"),
]

# Nombres de empresa realistas para una vertical de CREDITO (financieras, cooperativas
# de credito, fondos de empleados, casas de cobranza), deliberadamente distinto del
# "sonido" ISP/utility de las cuentas reales -- inventados, sin repetir marcas reales.
EMPRESAS = [
    "CrediAndina Financiera", "Fondo de Empleados Cafetero", "Cooperativa CrediValle",
    "Credito Facil del Norte", "Financiera Nororiente", "CrediSabana SAS",
    "Cooperativa de Ahorro y Credito del Pacifico", "CrediCosta Financiera",
    "Fondo Mutual Boyaca", "Credito Rapido Llanos", "CrediCaribe SAS",
    "Financiera del Eje Cafetero", "Cooperativa CrediMagdalena", "CrediTolima Financiera",
    "Fondo de Empleados Textil", "Credito Facil Antioquia", "CrediSur Cooperativa",
    "Financiera Piedemonte", "CrediHuila SAS", "Cooperativa de Credito Cordillera",
    "CrediSantander Financiera", "Fondo Mutual del Catatumbo", "Credito Facil Orinoquia",
    "CrediAmazonia Cooperativa", "Financiera Sierra Nevada", "CrediGuajira SAS",
    "Fondo de Empleados Metalurgico", "Cooperativa CrediCauca", "CrediPutumayo Financiera",
    "Credito Rapido Meta", "Financiera Choco SAS", "CrediSinu Cooperativa",
    "Fondo Mutual Tequendama", "Credito Facil Altiplano", "CrediAtlantico Financiera",
    "Cooperativa de Ahorro Andina", "CrediNorte Cooperativa", "Financiera del Valle",
    "Fondo de Empleados Cerealero", "Credito Facil Cafetero", "CrediBoyaca SAS",
    "Financiera Nororiental", "Cooperativa CrediLlanos",
]

# (nombre, apellido, cargo, cargo_categoria, es_kdm) -- cargo_categoria restringido por
# CHECK de la tabla real: dueno/gerente/rep_legal/tecnico/financiero/operativo/comercial/
# rep_legal_suplente/subgerente/desconocido.
PLANTILLA_CONTACTOS = [
    ("Camilo", "Fonseca", "Gerente General", "gerente", 1),
    ("Laura", "Ramirez", "Coordinadora Comercial", "comercial", 0),
    ("Andres", "Gutierrez", "Jefe Tecnico", "tecnico", 0),
    ("Maria Fernanda", "Ospina", "Gerente Administrativa", "gerente", 1),
    ("Julian", "Cardenas", "Director Comercial", "comercial", 1),
    ("Paola", "Rios", "Analista de Operaciones", "operativo", 0),
    ("Sebastian", "Mesa", "Gerente de Red", "tecnico", 0),
    ("Diana", "Trujillo", "Gerente General", "gerente", 1),
    ("Felipe", "Zapata", "Coordinador Tecnico", "tecnico", 0),
    ("Carolina", "Vargas", "Directora Comercial", "comercial", 1),
    ("Jorge", "Nino", "Gerente General", "gerente", 1),
    ("Natalia", "Pinzon", "Coordinadora de Cartera", "financiero", 0),
    ("Ricardo", "Salazar", "Jefe de Operaciones", "operativo", 0),
    ("Alejandra", "Beltran", "Gerente Comercial", "comercial", 1),
    ("Mauricio", "Cifuentes", "Gerente General", "gerente", 1),
]

TELEFONO_BASE = 3001000000


def telefono(i: int) -> str:
    return str(TELEFONO_BASE + i)


def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    ya_existe = cur.execute(
        "select count(*) from empresa where id_empresa like ?", (f"{PREFIJO_ID}%",)
    ).fetchone()[0]
    if ya_existe > 0:
        print(f"Ya hay {ya_existe} empresas de '{CATEGORIA}' sembradas, no se duplica. Nada que hacer.")
        con.close()
        return

    total_empresas = 0
    total_contactos = 0
    tel_idx = 0

    for i, nombre_empresa in enumerate(EMPRESAS, start=1):
        id_empresa = f"{PREFIJO_ID}{i:04d}"
        ciudad, depto = CIUDADES[i % len(CIUDADES)]

        # Dos cuentas placeholder obvias: una a la mitad, una al final del lote.
        es_placeholder = i in (len(EMPRESAS) // 2, len(EMPRESAS))
        nombre_final = f"EMPRESA DE PRUEBA {i:02d} (no es real)" if es_placeholder else nombre_empresa

        estado_comercial = random.choice(ESTADOS_COMERCIAL)
        estado_notion = ESTADO_NOTION_POR_COMERCIAL[estado_comercial]
        es_cliente = 1 if estado_comercial == 'cliente' else 0
        en_conversacion = 1 if estado_comercial in ('contactado', 'negociacion') else 0
        crm_software = random.choice(CRM_CREDITO)
        pasarela_actual = random.choice(PASARELA_CREDITO) if estado_comercial == 'cliente' else None
        prioridad_comercial = random.randint(1, 5)
        # ~15% de las cuentas tiene owner asignado, el resto queda sin (mismo shape que
        # la base real: la mayoria de empresas no tiene owner individual).
        owner = random.choice(OWNERS) if random.random() < 0.15 else None

        cur.execute(
            """
            insert into empresa
              (id_empresa, tipo_id, nombre_oficial, nombre_normalizado,
               ciudad_principal, departamento, es_cliente, en_conversacion,
               crm_software, estado_comercial, estado_notion, prioridad_comercial,
               pasarela_actual, categoria, owner)
            values (?, 'nit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                id_empresa, nombre_final, nombre_final.lower(), ciudad, depto,
                es_cliente, en_conversacion, crm_software, estado_comercial, estado_notion,
                prioridad_comercial, pasarela_actual, CATEGORIA, owner,
            ),
        )

        # empresa_usuarios: para credito, el equivalente de "usuarios/suscriptores" de
        # un ISP es la cartera de clientes de credito activos -- mismo shape de dato
        # (un numero estimado), otro significado de negocio.
        usuarios_estimados = random.randint(150, 25000)
        cur.execute(
            """
            insert into empresa_usuarios (id_empresa, usuarios_estimados, usuarios_est_fuente)
            values (?, ?, 'seed_creditos')
            """,
            (id_empresa, usuarios_estimados),
        )
        total_empresas += 1

        # Cuantos contactos le tocan a esta empresa: la mayoria 2, unas pocas 1 o 3
        # (variedad real: no todas las cuentas tienen el mismo numero de personas).
        if i % 7 == 0:
            n_contactos = 1
        elif i % 5 == 0:
            n_contactos = 3
        else:
            n_contactos = 2

        for j in range(n_contactos):
            plantilla = PLANTILLA_CONTACTOS[(i + j) % len(PLANTILLA_CONTACTOS)]
            nombre, apellido, cargo, cargo_cat, es_kdm_base = plantilla
            es_principal = 1 if j == 0 else 0
            es_kdm = 1 if (j == 0 and es_kdm_base) else 0
            email = f"testlead{i:02d}{chr(97 + j)}@example.com"
            tel = telefono(tel_idx)
            tel_idx += 1

            cur.execute(
                """
                insert into contacto
                  (id_empresa, nombre, apellido, cargo, cargo_categoria,
                   es_key_decision_maker, telefono, email, es_principal, fuente)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed_test_rico')
                """,
                (id_empresa, nombre, apellido, cargo, cargo_cat, es_kdm, tel, email, es_principal),
            )
            total_contactos += 1

    con.commit()
    print(f"Sembradas {total_empresas} empresas (categoria='{CATEGORIA}', id {PREFIJO_ID}0001..{PREFIJO_ID}{total_empresas:04d}).")
    print(f"Sembrados {total_contactos} contactos en total, todos con telefono, todos con correo placeholder testleadNN@example.com.")
    print(f"2 de las {total_empresas} cuentas llevan nombre 'EMPRESA DE PRUEBA (no es real)' explicito, para distinguir a simple vista.")
    con.close()


if __name__ == "__main__":
    main()
