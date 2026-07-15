"""
Resuelve las COLISIONES de notion_page_id (empresa con >1 pagina de Notion).

Complemento de sync_notion_page_ids.py, que deja las colisiones sin escribir a
proposito. Politica decidida con el owner 2026-07-14: enlazar a la pagina VIVA
(la que tiene actividad real) y dejar el duplicado 'Lead/sin owner' de la tanda
de importacion para archivar en Notion.

Criterio de "viva": una pagina esta viva si NO es (Estado == 'Lead' y Owner vacio).
  - Si exactamente UNA pagina de la empresa esta viva -> se enlaza esa.
  - Si hay 0 o >1 vivas (ej. Espectra/SPECTRA, ambas On Hold) -> se SALTA y se
    reporta: es una fusion manual en Notion, no la decide el script.

Insumos: el JSON de pares (id, Empresa) y el JSON de actividad (id, Estado, Owner),
ambos generados con el MCP de Notion. No destructivo + log en sync_cambios.
Dry-run por defecto; --apply escribe (con backup).

Uso:
  python3 scripts/sync_notion_pageid_colisiones.py            # dry-run
  python3 scripts/sync_notion_pageid_colisiones.py --apply    # backup + escribe
"""
import sqlite3, json, unicodedata, re, sys, shutil
from datetime import datetime

DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db'
BASE = '/private/tmp/claude-501/-Users-sebastianacostamolina-01-Documents-06-onepay-followups-tool/ff205d0d-17c4-467c-a8ae-cd228293d6c1/scratchpad'
JSON_PAIRS = f'{BASE}/notion_page_ids.json'
JSON_ACT = f'{BASE}/collision_activity.json'
APPLY = '--apply' in sys.argv

SUF = {'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii','ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]',' ', s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()

con = sqlite3.connect(DB); cur = con.cursor()
byname = {}
for i, n in cur.execute('SELECT id_empresa, nombre_oficial FROM empresa'):
    byname.setdefault(norm(n), i)
for a, i in cur.execute('SELECT alias, id_empresa FROM empresa_alias'):
    byname.setdefault(norm(a), i)
nombres = {i: n for i, n in cur.execute('SELECT id_empresa, nombre_oficial FROM empresa')}
actual_pid = {i: p for i, p in cur.execute('SELECT id_empresa, notion_page_id FROM empresa')}

# reconstruir colisiones (id_empresa -> [(page_id, nombre_notion), ...])
matches = {}
for r in json.load(open(JSON_PAIRS, encoding='utf-8')):
    nm = (r.get('Empresa') or '').strip()
    if not nm: continue
    idemp = byname.get(norm(nm))
    # Notion/MCP entrega el id CON guiones; la DB lo guarda sin guiones (single format,
    # ver Task C1 del plan de cierre 2026-07-15). Se normaliza aca, en el borde.
    if idemp: matches.setdefault(idemp, []).append((r['id'].replace('-', ''), nm))
colisiones = {i: p for i, p in matches.items() if len(p) > 1}

# actividad por page_id (mismo id sin guiones que en `matches`, si no el lookup de
# viva() falla en silencio y trata todo como viva)
act = {a['id'].replace('-', ''): a for a in json.load(open(JSON_ACT, encoding='utf-8'))}
def viva(pid):
    a = act.get(pid, {})
    estado = (a.get('Estado') or '').strip()
    owner = a.get('Owner')
    return not (estado == 'Lead' and not owner)

updates = {}       # id_empresa -> page_id vivo
ambiguas = []      # (id_empresa, [(pid, nombre, estado, viva?), ...])
for idemp, paginas in colisiones.items():
    vivas = [(pid, nm) for pid, nm in paginas if viva(pid)]
    if len(vivas) == 1:
        updates[idemp] = vivas[0][0]
    else:
        ambiguas.append((idemp, paginas))

# ---------- REPORTE ----------
print("=" * 68)
print(f"{'APPLY' if APPLY else 'DRY-RUN (no escribe)'}  |  {datetime.now():%Y-%m-%d %H:%M:%S}")
print("=" * 68)
print(f"Colisiones totales:              {len(colisiones)}")
print(f"  resueltas (1 pagina viva):     {len(updates)}")
print(f"  ambiguas (0 o >1 vivas):       {len(ambiguas)}  -> fusion manual en Notion")

print("\n--- resueltas: se enlaza a la pagina viva ---")
for idemp, pid in sorted(updates.items(), key=lambda x: nombres.get(x[0],'')):
    nm = next((n for p, n in colisiones[idemp] if p == pid), '?')
    est = (act.get(pid, {}).get('Estado') or '?')
    print(f"  {nombres.get(idemp,'?')[:34]:34} -> {nm[:32]:32} [{est}]  {pid}")

if ambiguas:
    print("\n--- AMBIGUAS (no se tocan): decidir/fusionar a mano en Notion ---")
    for idemp, paginas in ambiguas:
        print(f"  {nombres.get(idemp,'?')}")
        for pid, nm in paginas:
            a = act.get(pid, {})
            print(f"      {nm[:36]:36} [{a.get('Estado')}] owner={'si' if a.get('Owner') else 'no'}  {pid}")

# ---------- APPLY ----------
if APPLY:
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    corrida = 'sync-notion-pageid-colision-' + ts
    bak = f"{DB}.bak-{ts}"
    shutil.copy2(DB, bak)
    print(f"\nBackup: {bak}")
    for idemp, pid in updates.items():
        cur.execute("UPDATE empresa SET notion_page_id=?, updated_at=datetime('now') WHERE id_empresa=?", (pid, idemp))
        cur.execute(
            "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
            (corrida, 'notion', 'empresa', idemp, 'update', f'notion_page_id={pid} (colision->viva)'))
    con.commit()
    print(f"Aplicado: {len(updates)} empresas. Logueado en sync_cambios ({corrida}).")
else:
    print("\n(dry-run -- nada escrito. Corre con --apply para aplicar.)")

con.close()
