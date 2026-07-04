#!/usr/bin/env python3
"""
Sonda P0 de Apollo — SOLO LECTURA. Verifica qué expone el plan Professional de OnePay.

Regla dura: no crea, no manda, no edita nada. Solo pega a los 4 endpoints de master key
que NO consumen créditos, para resolver el supuesto mas riesgoso del plan (F3.5 y F4).

Uso:
  1. Crear master key en Apollo (Settings -> Integrations -> API Keys -> "Set as master key").
  2. Guardarla en scripts/.env.apollo:   APOLLO_API_KEY=xxxx     (ya esta gitignored via .env*)
     o exportarla:                        export APOLLO_API_KEY=xxxx
  3. python3 scripts/apollo_probe.py
  4. Pegar la salida (NO la key) en planning/experimento-apollo.md.

No imprime la key nunca. Si algo falla, imprime el status y el cuerpo, sin el header.
"""

import os
import sys
import json
import pathlib
import urllib.request
import urllib.error

BASE = "https://api.apollo.io/api/v1"


def cargar_key() -> str:
    key = os.environ.get("APOLLO_API_KEY", "").strip()
    if not key:
        env_file = pathlib.Path(__file__).parent / ".env.apollo"
        if env_file.exists():
            for linea in env_file.read_text().splitlines():
                linea = linea.strip()
                if linea.startswith("APOLLO_API_KEY="):
                    key = linea.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        print("ERROR: no encontre APOLLO_API_KEY (ni en el entorno ni en scripts/.env.apollo).")
        print("       Crea la master key en Apollo y guardala. Ver planning/experimento-apollo.md.")
        sys.exit(1)
    return key


def llamar(metodo: str, ruta: str, key: str, header_mode: str, body: dict | None = None):
    """Devuelve (status, json_o_texto). Nunca lanza; los errores HTTP se capturan."""
    url = f"{BASE}{ruta}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=metodo)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    if header_mode == "x-api-key":
        req.add_header("X-Api-Key", key)
    else:
        req.add_header("Authorization", f"Bearer {key}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            cuerpo = resp.read().decode()
            try:
                return resp.status, json.loads(cuerpo)
            except json.JSONDecodeError:
                return resp.status, cuerpo
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode()
        try:
            return e.code, json.loads(cuerpo)
        except json.JSONDecodeError:
            return e.code, cuerpo
    except urllib.error.URLError as e:
        return None, f"error de red: {e.reason}"


def resolver_header(key: str) -> str | None:
    """Prueba 1: cual header funciona. email_accounts exige master key -> doble check."""
    print("=" * 70)
    print("PRUEBA 1 y 2 · auth + privilegio master  (GET /email_accounts)")
    for modo in ("x-api-key", "bearer"):
        status, cuerpo = llamar("GET", "/email_accounts", key, modo)
        etiqueta = "X-Api-Key" if modo == "x-api-key" else "Authorization: Bearer"
        if status == 200:
            cuentas = cuerpo.get("email_accounts", cuerpo) if isinstance(cuerpo, dict) else cuerpo
            n = len(cuentas) if isinstance(cuentas, list) else "?"
            ids = [c.get("id") for c in cuentas[:3]] if isinstance(cuentas, list) else []
            print(f"  header {etiqueta}: 200  -> PASA. buzones vinculados: {n}. ids(muestra): {ids}")
            print("  => la key es MASTER y el plan expone endpoints de master key.")
            return modo
        elif status == 403:
            print(f"  header {etiqueta}: 403  -> la key NO es master (o el plan lo bloquea).")
        elif status == 401:
            print(f"  header {etiqueta}: 401  -> auth rechazada con este header.")
        else:
            print(f"  header {etiqueta}: {status} -> {str(cuerpo)[:200]}")
    print("  => REPRUEBA prueba 1/2. Revisa el toggle 'Set as master key' y la key.")
    return None


def main():
    key = cargar_key()
    modo = resolver_header(key)
    if modo is None:
        print("\nCorte: sin auth master no tiene sentido seguir. Ver matriz de decision.")
        sys.exit(2)

    # Prueba 3 · listar secuencias (F3.5)
    print("=" * 70)
    print("PRUEBA 3 · listar secuencias  (POST /emailer_campaigns/search)  [F3.5]")
    status, cuerpo = llamar("POST", "/emailer_campaigns/search", key, modo,
                            body={"per_page": 1, "page": 1})
    if status == 200:
        camps = cuerpo.get("emailer_campaigns", []) if isinstance(cuerpo, dict) else []
        total = cuerpo.get("pagination", {}).get("total_entries", "?") if isinstance(cuerpo, dict) else "?"
        print(f"  200 -> PASA. secuencias existentes (total): {total}. "
              f"(lista vacia tambien PASA: el endpoint esta habilitado)")
    else:
        print(f"  {status} -> REPRUEBA. {str(cuerpo)[:200]}")

    # Prueba 4 · tracking legible (F4, el corazon del pivote)
    print("=" * 70)
    print("PRUEBA 4 · tracking legible  (GET /emailer_messages/search)  [F4 - EL CRITICO]")
    status, cuerpo = llamar("GET", "/emailer_messages/search?per_page=1", key, modo)
    if status == 200:
        msgs = cuerpo.get("emailer_messages", []) if isinstance(cuerpo, dict) else []
        total = cuerpo.get("pagination", {}).get("total_entries", "?") if isinstance(cuerpo, dict) else "?"
        campos = sorted(msgs[0].keys())[:12] if msgs else []
        print(f"  200 -> PASA. correos rastreables (total): {total}.")
        print(f"  campos de muestra: {campos}" if campos
              else "  (vacio: aun no hay envios por Apollo, pero el endpoint responde -> PASA)")
    else:
        print(f"  {status} -> REPRUEBA. Tracking bloqueado en este plan. {str(cuerpo)[:200]}")
        print("  => decision ANTES de Fase 5: subir plan o mover tracking a otro motor.")

    # Prueba 5 · usage / rate limits (B7)
    print("=" * 70)
    print("PRUEBA 5 · usage stats / rate limits  (POST /usage_stats/api_usage_stats)  [B7]")
    status, cuerpo = llamar("POST", "/usage_stats/api_usage_stats", key, modo, body={})
    if status == 200:
        print("  200 -> PASA. limites por endpoint (crudo, para B7):")
        print("  " + json.dumps(cuerpo, indent=2)[:1200] if isinstance(cuerpo, (dict, list))
              else f"  {str(cuerpo)[:400]}")
    else:
        print(f"  {status} -> {str(cuerpo)[:200]}")

    print("=" * 70)
    print("Fin. Pega esta salida (NO la key) en planning/experimento-apollo.md -> Resultados.")
    print("Recuerda: create-contact y add-to-sequence NO se probaron (son escritura, van a Fase 5).")


if __name__ == "__main__":
    main()
