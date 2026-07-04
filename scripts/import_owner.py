"""Importar el Owner de Notion a empresa.owner (para filtrar la cola por persona)."""
import sqlite3, csv, unicodedata, re, glob
from datetime import datetime
SUF={'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'[^a-z0-9 ]',' ',s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()
con=sqlite3.connect('/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db'); cur=con.cursor()
if 'owner' not in [c[1] for c in cur.execute("PRAGMA table_info(empresa)")]:
    cur.execute("ALTER TABLE empresa ADD COLUMN owner TEXT")
byname={}
for i,n in cur.execute("SELECT id_empresa,nombre_oficial FROM empresa"): byname.setdefault(norm(n),i)
for a,i in cur.execute("SELECT alias,id_empresa FROM empresa_alias"): byname.setdefault(norm(a),i)
NOT=glob.glob('/Users/sebastianacostamolina/Arc/*/*Sales Pipeline*_all.csv')[0]
corrida='import-owner-'+datetime.now().strftime('%Y%m%d-%H%M%S'); n=0
for r in csv.DictReader(open(NOT,encoding='utf-8-sig',newline='')):
    ow=(r.get('Owner') or '').strip()
    if not ow: continue
    idemp=byname.get(norm(r.get('Empresa','')))
    if not idemp: continue
    cur.execute("UPDATE empresa SET owner=? WHERE id_empresa=?",(ow,idemp))
    cur.execute("INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
                (corrida,'notion','empresa',idemp,'update',f'owner={ow}'))
    n+=1
con.commit()
print("owner seteado:",n)
print("\ncola con follow-up por owner:")
for ow,c in cur.execute("SELECT owner,count(*) FROM empresa WHERE proximo_follow_up_fecha IS NOT NULL GROUP BY owner ORDER BY 2 DESC"):
    print(f"  {c:3}  {ow or '(sin owner)'}")
