"""
Sync del PUNTERO DE PAGINA de Notion (notion_page_id) hacia isps.db.

Direccion Notion -> DB. Ata cada empresa del pipeline a su pagina de Notion para
poder saltar de la cola/ficha directo a la pagina y seguir llenando informacion.
La URL se deriva sola: https://www.notion.so/<id sin guiones>.

Por que un JSON y no el CSV: un export CSV de Notion NO trae el id ni el link de
cada pagina. El id solo se saca por API/MCP. El conector 'notion' de la DB esta en
'sin_credencial', asi que el JSON se genera con el MCP de Notion (columna implicita
`id` del data source) y se vuelca a un archivo que este script consume.
Regenerar el JSON:  SELECT id, Empresa FROM "collection://<sales-pipeline>" (paginado).

Campo que toca (alcance decidido con el owner 2026-07-14):
  Notion page id  -> notion_page_id   (solo si esta vacio o cambio; no destructivo)

Reglas:
  - Match por nombre normalizado contra empresa + empresa_alias (mismo norm() que
    sync_notion_estado.py).
  - COLISIONES no se resuelven solas: si varias paginas de Notion caen en la misma
    empresa (ej. CELSIA / CELSIA INTERNET / CELSIA INTERNET S.A.S.), se REPORTAN y
    NINGUNA se escribe para esa empresa. Es una discrepancia manual.
  - Paginas de Notion sin match en la DB NO crean empresa; se reportan.
  - No destructivo + logueado en sync_cambios. Dry-run por defecto; --apply escribe.

Uso:
  python3 scripts/sync_notion_page_ids.py            # dry-run, no escribe
  python3 scripts/sync_notion_page_ids.py --apply    # backup + escribe + loguea
"""
import sqlite3, json, unicodedata, re, sys, shutil
from datetime import datetime

DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db'
JSON_IN = '/private/tmp/claude-501/-Users-sebastianacostamolina-01-Documents-06-onepay-followups-tool/ff205d0d-17c4-467c-a8ae-cd228293d6c1/scratchpad/notion_page_ids.json'
APPLY = '--apply' in sys.argv

SUF = {'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii','ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]',' ', s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()

con = sqlite3.connect(DB)
cur = con.cursor()

# mapa nombre_normalizado -> id_empresa (empresa primero, luego alias)
byname = {}
for i, n in cur.execute('SELECT id_empresa, nombre_oficial FROM empresa'):
    byname.setdefault(norm(n), i)
for a, i in cur.execute('SELECT alias, id_empresa FROM empresa_alias'):
    byname.setdefault(norm(a), i)

nombres = {i: n for i, n in cur.execute('SELECT id_empresa, nombre_oficial FROM empresa')}
actual_pid = {i: p for i, p in cur.execute('SELECT id_empresa, notion_page_id FROM empresa')}

rows = json.load(open(JSON_IN, encoding='utf-8'))

sin_nombre = 0
sin_match = []                 # nombres de Notion que no matchean ninguna empresa
matches = {}                   # id_empresa -> [(notion_id, nombre_notion), ...]
for r in rows:
    nombre = (r.get('Empresa') or '').strip()
    if not nombre:
        sin_nombre += 1
        continue
    idemp = byname.get(norm(nombre))
    if not idemp:
        sin_match.append(nombre)
        continue
    # Notion/MCP entrega el id CON guiones; la DB lo guarda sin guiones (single format,
    # ver Task C1 del plan de cierre 2026-07-15). Se normaliza aca, en el borde.
    matches.setdefault(idemp, []).append((r['id'].replace('-', ''), nombre))

# separar match limpio (1 pagina) de colision (>1 pagina a la misma empresa)
limpios = {}                   # id_empresa -> notion_id
colisiones = {}                # id_empresa -> [(notion_id, nombre_notion), ...]
for idemp, paginas in matches.items():
    if len(paginas) == 1:
        limpios[idemp] = paginas[0][0]
    else:
        colisiones[idemp] = paginas

# de los limpios: cuales realmente cambian (vacio o distinto)
updates = {}                   # id_empresa -> notion_id
sin_cambio = 0
for idemp, nid in limpios.items():
    if (actual_pid.get(idemp) or '') != nid:
        updates[idemp] = nid
    else:
        sin_cambio += 1

# ---------- REPORTE ----------
print("=" * 68)
print(f"{'APPLY' if APPLY else 'DRY-RUN (no escribe)'}  |  {datetime.now():%Y-%m-%d %H:%M:%S}")
print("=" * 68)
print(f"Paginas en Notion (con nombre):     {len(rows) - sin_nombre}")
print(f"  sin nombre (se ignoran):          {sin_nombre}")
print(f"Empresas con match limpio (1 pag):  {len(limpios)}")
print(f"  ya tenian ese id (sin cambio):    {sin_cambio}")
print(f"  se escribirian:                   {len(updates)}")
print(f"Empresas con COLISION (>1 pagina):  {len(colisiones)}  (NO se escriben)")
print(f"Paginas de Notion SIN match en DB:  {len(sin_match)}  (NO crean empresa)")

if colisiones:
    print(f"\n--- COLISIONES: {len(colisiones)} empresas con varias paginas de Notion ---")
    print("    (resolver a mano: decidir cual pagina es la buena)")
    for idemp, paginas in sorted(colisiones.items(), key=lambda x: nombres.get(x[0],'')):
        print(f"  DB: {nombres.get(idemp,'?')[:40]:40} (id_empresa={idemp})")
        for nid, nn in paginas:
            print(f"      <- Notion: {nn[:44]:44} {nid}")

if sin_match:
    print(f"\n--- {len(sin_match)} paginas de Notion SIN match en isps.db (revisar) ---")
    for nm in sorted(sin_match):
        print(f"  - {nm}")

print("\n--- muestra de escrituras (primeras 15) ---")
for idemp, nid in list(updates.items())[:15]:
    antes = actual_pid.get(idemp) or '(vacio)'
    print(f"  {nombres.get(idemp,'?')[:34]:34} {str(antes)[:12]:12} -> {nid}")

# ---------- APPLY ----------
if APPLY:
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    corrida = 'sync-notion-pageid-' + ts
    bak = f"{DB}.bak-{ts}"
    shutil.copy2(DB, bak)
    print(f"\nBackup: {bak}")
    for idemp, nid in updates.items():
        cur.execute("UPDATE empresa SET notion_page_id=?, updated_at=datetime('now') WHERE id_empresa=?", (nid, idemp))
        cur.execute(
            "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
            (corrida, 'notion', 'empresa', idemp, 'update', f'notion_page_id={nid}'))
    con.commit()
    print(f"Aplicado: {len(updates)} empresas. Logueado en sync_cambios ({corrida}).")
else:
    print(f"\n(dry-run -- nada escrito. Corre con --apply para aplicar.)")

con.close()
