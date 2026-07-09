#!/usr/bin/env python3
"""
Probe Fase 1 · prueba de correos end-to-end por Apollo (ver design doc
docs/superpowers/specs/2026-07-09-prueba-correos-apollo-design.md).

A diferencia de apollo_probe.py (P0, SOLO LECTURA), este SI escribe y SI manda
correo real: crea una secuencia desechable, sube un template con los 3
merge-tags + pixel/link de tracking, inscribe los 4 contactos de prueba con el
buzon de Sebastian, y aprueba la secuencia (dispara el envio).

Responde en vivo las 4 preguntas de la Fase 1:
  1. approve SI dispara el envio real (endpoint POST /emailer_campaigns/{id}/approve,
     confirmado contra la doc oficial de Apollo antes de escribir este script).
  2. Apollo sustituye {{email}} en el pixel/link (de esto depende TODO el tracking
     propio, ver app/core/tracking-links.ts).
  3. {{first_name}} / {{company_name}} / {{title}} se rellenan de verdad.
  4. Llegan opens/clics al pixel propio y enviado/respondio/rebota al poll de Apollo.

Uso:
  1. python3 scripts/apollo_probe_envio.py --listar-buzones
     -> anota el id del buzon de Sebastian (recien vinculado por OAuth en la UI).
  2. export APOLLO_MAILBOX_ID=<ese id>   (o pasalo con --buzon)
  3. Confirma que APP_BASE_URL apunta al tunel ngrok vivo (ver .env.local) y que
     next dev esta corriendo -- si no, el pixel/link no tiene a donde pegarle.
  4. python3 scripts/apollo_probe_envio.py --confirmar-envio
     -> crea la secuencia, sube el template, inscribe a los 4 correos e invoca
        approve. A partir de aqui Apollo manda correo real: no hay --dry-run
        para ese paso, por diseno (approve es justo lo que se esta probando).
  5. Espera unos minutos, abre los 4 correos y haz clic en el link de cada uno.
  6. python3 scripts/apollo_probe_envio.py --verificar <id_secuencia>
     -> pollea /emailer_messages/search y muestra que evento parece cada uno.
  7. Cuando termines: python3 scripts/apollo_probe_envio.py --archivar <id_secuencia>
     (Apollo no tiene DELETE por API, archivar es la unica limpieza).
  8. Pega la salida (NO la key) en un doc de hallazgos estilo experimento-apollo.md.
"""

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

BASE = "https://api.apollo.io/api/v1"
NOMBRE_SECUENCIA = "PRUEBA envio pipeline OnePay (desechable, archivar tras el test)"

# Los 4 destinos de prueba del design doc: Gmail, Workspace, Outlook, universitario.
CONTACTOS_PRUEBA = [
    {"email": "sacostamolin@gmail.com", "first_name": "Sebastian-Gmail", "company_name": "OnePay-PruebaGmail", "title": "Cargo-Gmail"},
    {"email": "sebastian@onepay.la", "first_name": "Sebastian-Workspace", "company_name": "OnePay-PruebaWorkspace", "title": "Cargo-Workspace"},
    {"email": "sacostamolina@outlook.com", "first_name": "Sebastian-Outlook", "company_name": "OnePay-PruebaOutlook", "title": "Cargo-Outlook"},
    {"email": "sdacostam@eafit.edu.co", "first_name": "Sebastian-Eafit", "company_name": "OnePay-PruebaEafit", "title": "Cargo-Eafit"},
]

# Cuerpo de prueba: los 3 merge-tags a confirmar + un link http(s) real para probar
# reescritura de clic. El pixel se agrega aparte (mismo formato que
# app/core/tracking-links.ts) para no duplicar esa logica a mano.
CUERPO_PRUEBA = (
    "<p>Hola {{first_name}}, esto es una prueba del pipeline OnePay.</p>"
    "<p>Empresa: {{company_name}} · Cargo: {{title}}</p>"
    '<p><a href="https://onepay.la">Link de prueba para tracking de clic</a></p>'
)
ASUNTO_PRUEBA = "Prueba pipeline OnePay (ignorar)"


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
        sys.exit(1)
    return key


def llamar(metodo: str, ruta: str, key: str, body: dict | None = None, query: str = ""):
    """Devuelve (status, json_o_texto). Nunca lanza; los errores HTTP se capturan.
    Header confirmado en vivo (experimento-apollo.md): X-Api-Key, no Bearer."""
    url = f"{BASE}{ruta}{query}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=metodo)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    req.add_header("X-Api-Key", key)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            cuerpo = resp.read().decode()
            return resp.status, (json.loads(cuerpo) if cuerpo else {})
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode()
        try:
            return e.code, json.loads(cuerpo)
        except json.JSONDecodeError:
            return e.code, cuerpo
    except urllib.error.URLError as e:
        return None, f"error de red: {e.reason}"


def listar_buzones(key: str):
    print("=" * 70)
    print("Buzones vinculados (GET /email_accounts) -- busca el tuyo, anota el id")
    status, cuerpo = llamar("GET", "/email_accounts", key)
    if status != 200:
        print(f"  {status} -> {str(cuerpo)[:300]}")
        return
    cuentas = cuerpo.get("email_accounts", []) if isinstance(cuerpo, dict) else []
    for c in cuentas:
        print(f"  id={c.get('id')}  email={c.get('email')}  provider={c.get('provider')}")
    if not cuentas:
        print("  (vacio: vincula tu buzon en Apollo -> Settings -> Mailboxes primero)")


def base_url() -> str:
    base = os.environ.get("APP_BASE_URL", "").strip()
    if not base:
        print("ERROR: APP_BASE_URL no esta seteada (ver .env.local / tunel ngrok).")
        sys.exit(1)
    return base


def crear_secuencia_y_template(key: str) -> tuple[str, str, str]:
    """Devuelve (sequence_id, step_id, template_id). Mismo flujo que sincronizarCopy
    en app/adapters/apollo.ts, con wait_time minimo porque es un unico paso de prueba."""
    print("=" * 70)
    print("PASO 1 · crear secuencia desechable (POST /emailer_campaigns)")
    status, cuerpo = llamar("POST", "/emailer_campaigns", key, body={"name": NOMBRE_SECUENCIA})
    if status not in (200, 201):
        print(f"  {status} -> {str(cuerpo)[:400]}")
        sys.exit(1)
    seq_id = (cuerpo.get("emailer_campaign") or {}).get("id") or cuerpo.get("id")
    print(f"  secuencia creada: {seq_id}")

    print("PASO 2 · crear el paso (POST /emailer_steps)")
    status, cuerpo = llamar("POST", "/emailer_steps", key, body={
        "emailer_campaign_id": seq_id,
        "position": 1,
        "type": "auto_email",
        "wait_mode": "day",
        "wait_time": 0,
    })
    if status not in (200, 201):
        print(f"  {status} -> {str(cuerpo)[:400]}")
        sys.exit(1)
    step_id = (cuerpo.get("emailer_step") or {}).get("id")
    template_id = (
        (cuerpo.get("emailer_template") or {}).get("id")
        or (cuerpo.get("emailer_touch") or {}).get("emailer_template_id")
        or ((cuerpo.get("emailer_touch") or {}).get("emailer_template") or {}).get("id")
    )
    if not step_id or not template_id:
        print(f"  ERROR: no encontre step/template en la respuesta cruda: {json.dumps(cuerpo)[:600]}")
        sys.exit(1)
    print(f"  step={step_id} template={template_id}")

    print("PASO 3 · subir copy con merge-tags + pixel/link de tracking (PUT /emailer_templates/{id})")
    base = base_url()
    pixel = f'<img src="{base}/api/track/open?c={seq_id}&e={{{{email}}}}" width="1" height="1" alt="" style="display:none" />'
    # reescritura de clic manual (mismo formato que reescribirLinksClic en
    # app/core/tracking-links.ts, sin importar TS desde un script python):
    import urllib.parse as _up
    href_prueba = f"{base}/api/track/click?c={seq_id}&e={{{{email}}}}&u={_up.quote('https://onepay.la', safe='')}"
    cuerpo_html = CUERPO_PRUEBA.replace('href="https://onepay.la"', f'href="{href_prueba}"') + pixel

    status, cuerpo = llamar("PUT", f"/emailer_templates/{template_id}", key, body={
        "subject": ASUNTO_PRUEBA,
        "body_html": cuerpo_html,
    })
    if status not in (200, 201):
        print(f"  {status} -> {str(cuerpo)[:400]}")
        sys.exit(1)
    print("  template actualizado.")
    return seq_id, step_id, template_id


def inscribir_contactos(key: str, seq_id: str, buzon: str):
    print("=" * 70)
    print("PASO 4 · crear/dedupe los 4 contactos de prueba (POST /contacts/bulk_create)")
    status, cuerpo = llamar("POST", "/contacts/bulk_create", key, body={
        "contacts": CONTACTOS_PRUEBA,
        "run_dedupe": True,
    })
    if status not in (200, 201):
        print(f"  {status} -> {str(cuerpo)[:400]}")
        sys.exit(1)
    contactos = (cuerpo.get("created_contacts") or []) + (cuerpo.get("existing_contacts") or [])
    ids = [c["id"] for c in contactos if c.get("id")]
    print(f"  {len(ids)} contactos resueltos: {ids}")
    if len(ids) != len(CONTACTOS_PRUEBA):
        print("  AVISO: no todos los contactos resolvieron id, revisa la respuesta cruda arriba.")

    print("PASO 5 · inscribir en la secuencia (POST /emailer_campaigns/{id}/add_contact_ids)")
    status, cuerpo = llamar("POST", f"/emailer_campaigns/{seq_id}/add_contact_ids", key, body={
        "emailer_campaign_id": seq_id,
        "contact_ids": ids,
        "send_email_from_email_account_id": buzon,
    })
    if status not in (200, 201):
        print(f"  {status} -> {str(cuerpo)[:400]}")
        sys.exit(1)
    print("  inscritos.")


def aprobar(key: str, seq_id: str):
    print("=" * 70)
    print("PASO 6 · approve (POST /emailer_campaigns/{id}/approve) -- ESTO MANDA CORREO REAL")
    status, cuerpo = llamar("POST", f"/emailer_campaigns/{seq_id}/approve", key)
    print(f"  {status} -> {str(cuerpo)[:500]}")
    if status == 200:
        print("  PASA: approve disparo el envio (pregunta 1 de la Fase 1 respondida).")
    elif status == 422:
        print("  REPRUEBA: 422 -- la doc dice 'ya activa' o 'sin pasos configurados'. Revisa cual de las dos.")
    elif status == 403:
        print("  REPRUEBA: 403 -- la key no es master (contradice el probe P0, revisa el toggle en Apollo).")
    else:
        print("  REPRUEBA: status inesperado, ver cuerpo arriba.")


def verificar(key: str, seq_id: str):
    print("=" * 70)
    print(f"Verificando mensajes de la secuencia {seq_id} (GET /emailer_messages/search)")
    status, cuerpo = llamar("GET", "/emailer_messages/search", key,
                             query=f"?per_page=50&emailer_campaign_ids[]={seq_id}")
    if status != 200:
        print(f"  {status} -> {str(cuerpo)[:400]}")
        return
    mensajes = cuerpo.get("emailer_messages", []) if isinstance(cuerpo, dict) else []
    print(f"  {len(mensajes)} mensajes:")
    for m in mensajes:
        print(f"  to={m.get('to_email')} status={m.get('status')} replied={m.get('replied')} bounce={m.get('bounce')}")
    print("\n  Pregunta 4 (parcial, poll): revisa arriba que status='completed' para los 4.")
    print("  Opens/clics NO salen de aqui -- revisa la tabla evento_tracking en isps.db")
    print("  (tipo='abierto'/'clic'), que es donde el pixel/link propio los escribe.")


def archivar(key: str, seq_id: str):
    print("=" * 70)
    print(f"Archivando secuencia {seq_id} (POST /emailer_campaigns/{{id}}/archive)")
    status, cuerpo = llamar("POST", f"/emailer_campaigns/{seq_id}/archive", key)
    print(f"  {status} -> {str(cuerpo)[:300]}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--listar-buzones", action="store_true", help="GET /email_accounts, solo lectura")
    p.add_argument("--buzon", help="id del email_account a usar (o env APOLLO_MAILBOX_ID)")
    p.add_argument("--confirmar-envio", action="store_true",
                   help="crea secuencia+template+contactos y llama approve. MANDA CORREO REAL.")
    p.add_argument("--verificar", metavar="SEQ_ID", help="pollea emailer_messages de esa secuencia")
    p.add_argument("--archivar", metavar="SEQ_ID", help="archiva esa secuencia (limpieza final)")
    args = p.parse_args()

    key = cargar_key()

    if args.listar_buzones:
        listar_buzones(key)
        return
    if args.verificar:
        verificar(key, args.verificar)
        return
    if args.archivar:
        archivar(key, args.archivar)
        return
    if not args.confirmar_envio:
        p.print_help()
        return

    buzon = args.buzon or os.environ.get("APOLLO_MAILBOX_ID", "").strip()
    if not buzon:
        print("ERROR: falta el buzon. Corre --listar-buzones primero y pasa --buzon <id> o setea APOLLO_MAILBOX_ID.")
        sys.exit(1)

    seq_id, _step_id, _template_id = crear_secuencia_y_template(key)
    inscribir_contactos(key, seq_id, buzon)
    aprobar(key, seq_id)

    print("=" * 70)
    print(f"Listo. Secuencia de prueba: {seq_id}")
    print("Espera unos minutos, revisa las 4 bandejas, haz clic en el link de cada correo.")
    print(f"Luego: python3 scripts/apollo_probe_envio.py --verificar {seq_id}")
    print(f"Al terminar: python3 scripts/apollo_probe_envio.py --archivar {seq_id}")


if __name__ == "__main__":
    main()
