"""
T3 — Importar de Notion las fechas de "próximo paso" a isps.db.
Current-state (cuándo toca el siguiente follow-up) va en `empresa`, separado del
event-log (`toque`). No destructivo, logueado en sync_cambios.
"""
import sqlite3, csv, unicodedata, re, glob
from datetime import datetime

SUF={'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'[^a-z0-9 ]',' ',s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()
def parse_fecha(s):
    s=str(s or '').split('→')[0].split('@')[0].strip()
    for fmt in ('%B %d, %Y','%b %d, %Y','%Y-%m-%d','%m/%d/%Y'):
        try: return datetime.strptime(s,fmt).date().isoformat()
        except: pass
    return None

con=sqlite3.connect('/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')
cur=con.cursor()
cols=[c[1] for c in cur.execute("PRAGMA table_info(empresa)")]
if 'proximo_follow_up_fecha' not in cols: cur.execute("ALTER TABLE empresa ADD COLUMN proximo_follow_up_fecha TEXT")
if 'proximo_paso' not in cols: cur.execute("ALTER TABLE empresa ADD COLUMN proximo_paso TEXT")

byname={}
for i,n in cur.execute("SELECT id_empresa,nombre_oficial FROM empresa"): byname.setdefault(norm(n),i)
for a,i in cur.execute("SELECT alias,id_empresa FROM empresa_alias"): byname.setdefault(norm(a),i)

NOT=glob.glob('/Users/sebastianacostamolina/Arc/*/*Sales Pipeline*_all.csv')[0]
corrida='import-proximo-paso-'+datetime.now().strftime('%Y%m%d-%H%M%S')
set_n=nomatch=nodate=0
for r in csv.DictReader(open(NOT,encoding='utf-8-sig',newline='')):
    fecha=parse_fecha(r.get('Fecha Próximo Paso',''))
    if not fecha:
        if (r.get('Fecha Próximo Paso') or '').strip(): nodate+=1
        continue
    idemp=byname.get(norm(r.get('Empresa','')))
    if not idemp: nomatch+=1; continue
    paso=(r.get('Próximo Paso') or '').strip() or None
    cur.execute("UPDATE empresa SET proximo_follow_up_fecha=?, proximo_paso=?, updated_at=datetime('now') WHERE id_empresa=?",
                (fecha,paso,idemp))
    cur.execute("INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
                (corrida,'notion','empresa',idemp,'update',f'proximo_follow_up={fecha}'))
    set_n+=1
con.commit()
TODAY='2026-06-30'
due=cur.execute("SELECT count(*) FROM empresa WHERE proximo_follow_up_fecha IS NOT NULL AND proximo_follow_up_fecha<=?",(TODAY,)).fetchone()[0]
fut=cur.execute("SELECT count(*) FROM empresa WHERE proximo_follow_up_fecha>?",(TODAY,)).fetchone()[0]
print(f"fechas seteadas: {set_n} | sin match: {nomatch} | fecha no parseable: {nodate}")
print(f"cola: vencidos/hoy (<= {TODAY}) = {due} | futuros = {fut}")
print("ejemplos de la cola:")
for nm,f,p in cur.execute("SELECT nombre_oficial,proximo_follow_up_fecha,proximo_paso FROM empresa WHERE proximo_follow_up_fecha<=? ORDER BY proximo_follow_up_fecha LIMIT 6",(TODAY,)):
    print(f"  {f}  {nm[:30]:30} {(p or '')[:30]}")
