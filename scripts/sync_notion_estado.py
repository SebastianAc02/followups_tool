"""
Sync del ESTADO DEL PIPELINE desde el export CSV de Notion hacia isps.db.

Direccion Notion -> DB (re-seed de estado comercial). Es la inversa del sync de
salida DB -> Notion: el pipeline comercial se maneja a mano en Notion, y esta
corrida refresca isps.db para que la cola del dia refleje el ultimo estado real.

Campos que toca (alcance "estado del pipeline", decidido con el owner 2026-07-14):
  Estado             -> estado_notion (+ deriva estado_comercial)
  Fecha Proximo Paso -> proximo_follow_up_fecha
  Proximo Paso       -> proximo_paso
  Owner              -> owner

Reglas:
  - Match por nombre normalizado contra empresa + empresa_alias (98% cobertura).
  - "Notion gana" pero SOLO donde Notion trae dato: si el CSV viene vacio, NO se
    pisa lo que ya hay en la DB (no destructivo). Estado siempre viene lleno.
  - Canal se ignora a proposito: el CSV lo trae vacio (485 en blanco / 16 'Ninguno').
  - Las empresas del CSV sin match NO se crean; se reportan al final.
  - No destructivo + logueado en sync_cambios. Dry-run por defecto; --apply escribe.

Uso:
  python3 scripts/sync_notion_estado.py            # dry-run, no escribe
  python3 scripts/sync_notion_estado.py --apply    # backup + escribe + loguea
"""
import sqlite3, csv, unicodedata, re, glob, sys, shutil
from datetime import datetime

DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db'
APPLY = '--apply' in sys.argv

SUF = {'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii','ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]',' ', s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()

def parse_fecha(s):
    s = str(s or '').split('→')[0].split('@')[0].strip()
    for fmt in ('%B %d, %Y','%b %d, %Y','%Y-%m-%d','%m/%d/%Y'):
        try: return datetime.strptime(s, fmt).date().isoformat()
        except: pass
    return None

# CSV "Estado" (Notion) -> estado_notion (enum de la DB)
ESTADO_MAP = {
    'Lead': 'lead',
    'Contacto Iniciado': 'contacto_iniciado',
    'Reunión Agendada': 'reunion_agendada',
    'Oportunidad': 'oportunidad',
    'Enviar Contrato': 'enviar_contrato',
    'Firma Pendiente': 'enviar_contrato',      # contrato enviado, esperando firma
    'Cierre/Documentación': 'cierre_documentacion',
    'Firma y Pago Realizado': 'firma_pago',
    'Contrato Firmado': 'firma_pago',          # ganado
    'On Hold': 'on_hold',
}
# estado_notion -> estado_comercial (deriva coherente con funnel.ts + seed_leads_robustos.py)
NOTION_TO_COMERCIAL = {
    'lead': 'lead',
    'contacto_iniciado': 'contactado',
    'reunion_agendada': 'negociacion',
    'oportunidad': 'negociacion',
    'enviar_contrato': 'negociacion',
    'cierre_documentacion': 'negociacion',
    'firma_pago': 'cliente',
    'on_hold': 'pausado',
}

con = sqlite3.connect(DB)
cur = con.cursor()

# mapa nombre_normalizado -> id_empresa (empresa primero, luego alias)
byname = {}
for i, n in cur.execute('SELECT id_empresa, nombre_oficial FROM empresa'):
    byname.setdefault(norm(n), i)
for a, i in cur.execute('SELECT alias, id_empresa FROM empresa_alias'):
    byname.setdefault(norm(a), i)

# estado actual de las empresas (para computar el diff real)
actual = {}
for row in cur.execute('SELECT id_empresa, estado_notion, estado_comercial, proximo_follow_up_fecha, proximo_paso, owner FROM empresa'):
    actual[row[0]] = {'estado_notion': row[1], 'estado_comercial': row[2],
                      'proximo_follow_up_fecha': row[3], 'proximo_paso': row[4], 'owner': row[5]}

CSV = glob.glob('/Users/sebastianacostamolina/Arc/*/*Sales Pipeline*_all.csv')
CSV = sorted(CSV, key=lambda p: p)  # deterministico; el mas nuevo suele estar en la carpeta con sufijo mayor
CSV = CSV[-1]
print(f"CSV: {CSV}\n")

corrida = 'sync-notion-estado-' + datetime.now().strftime('%Y%m%d-%H%M%S')
cambios = []          # (id, campo, viejo, nuevo)
updates = {}          # id -> {campo: nuevo}
sin_match = []
estado_desconocido = {}
blank_stats = {'proximo_paso': 0, 'proximo_follow_up_fecha': 0, 'owner': 0}

for r in csv.DictReader(open(CSV, encoding='utf-8-sig', newline='')):
    nombre = (r.get('Empresa') or '').strip()
    if not nombre:
        continue
    idemp = byname.get(norm(nombre))
    if not idemp:
        sin_match.append(nombre)
        continue

    cur_row = actual.get(idemp, {})
    nuevo = {}

    # --- Estado (siempre viene lleno) ---
    est_csv = (r.get('Estado') or '').strip()
    en = ESTADO_MAP.get(est_csv)
    if est_csv and en is None:
        estado_desconocido[est_csv] = estado_desconocido.get(est_csv, 0) + 1
    if en:
        if cur_row.get('estado_notion') != en:
            nuevo['estado_notion'] = en
        ec = NOTION_TO_COMERCIAL[en]
        if cur_row.get('estado_comercial') != ec:
            nuevo['estado_comercial'] = ec

    # --- Fecha proximo paso (solo si parseable) ---
    fecha = parse_fecha(r.get('Fecha Próximo Paso', ''))
    if fecha:
        if cur_row.get('proximo_follow_up_fecha') != fecha:
            nuevo['proximo_follow_up_fecha'] = fecha
    elif (r.get('Fecha Próximo Paso') or '').strip():
        blank_stats['proximo_follow_up_fecha'] += 1  # traia algo pero no parsea

    # --- Proximo paso (solo si trae texto) ---
    paso = (r.get('Próximo Paso') or '').strip()
    if paso:
        if cur_row.get('proximo_paso') != paso:
            nuevo['proximo_paso'] = paso
    else:
        blank_stats['proximo_paso'] += 1

    # --- Owner (solo si trae texto) ---
    owner = (r.get('Owner') or '').strip()
    if owner:
        if cur_row.get('owner') != owner:
            nuevo['owner'] = owner
    else:
        blank_stats['owner'] += 1

    if nuevo:
        updates[idemp] = nuevo
        for campo, val in nuevo.items():
            cambios.append((idemp, campo, cur_row.get(campo), val))

# ---------- REPORTE ----------
por_campo = {}
for _, campo, _, _ in cambios:
    por_campo[campo] = por_campo.get(campo, 0) + 1

print("=" * 64)
print(f"{'APPLY' if APPLY else 'DRY-RUN (no escribe)'}  |  corrida: {corrida}")
print("=" * 64)
print(f"Empresas del CSV con match:    {len(updates) + sum(1 for _ in [0])*0} con cambios / {len(actual)} en DB")
print(f"Empresas que cambian:          {len(updates)}")
print(f"Total de campos modificados:   {len(cambios)}")
print(f"  por campo: " + ', '.join(f'{k}={v}' for k, v in sorted(por_campo.items())))
print(f"CSV sin match (NO se crean):   {len(sin_match)}")
if estado_desconocido:
    print(f"Estados del CSV sin mapeo:     {estado_desconocido}")
print(f"Campos vacios en CSV (no se pisa la DB): {blank_stats}")

print("\n--- muestra de cambios (primeros 15) ---")
nombres = {i: n for i, n in cur.execute('SELECT id_empresa, nombre_oficial FROM empresa')}
for idemp, campo, viejo, nuevo_v in cambios[:15]:
    print(f"  {nombres.get(idemp,'?')[:26]:26} {campo:24} {str(viejo)[:18]:18} -> {nuevo_v}")

if sin_match:
    print(f"\n--- {len(sin_match)} empresas en Notion SIN match en isps.db (revisar a mano) ---")
    for nm in sin_match:
        print(f"  - {nm}")

# ---------- APPLY ----------
if APPLY:
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    bak = f"{DB}.bak-{ts}"
    shutil.copy2(DB, bak)
    print(f"\nBackup: {bak}")
    for idemp, nuevo in updates.items():
        sets = ', '.join(f"{c}=?" for c in nuevo) + ", updated_at=datetime('now')"
        cur.execute(f"UPDATE empresa SET {sets} WHERE id_empresa=?", (*nuevo.values(), idemp))
        detalle = '; '.join(f"{c}={v}" for c, v in nuevo.items())
        cur.execute(
            "INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
            (corrida, 'notion', 'empresa', idemp, 'update', detalle))
    con.commit()
    print(f"Aplicado: {len(updates)} empresas, {len(cambios)} campos. Logueado en sync_cambios ({corrida}).")
else:
    print(f"\n(dry-run — nada escrito. Corre con --apply para aplicar.)")

con.close()
