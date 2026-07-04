"""
APPLY: traer usuarios de Notion ('Usuarios Estimados') a empresa_usuarios.usuarios_reales.
Regla (definida con Sebastian): Notion gana en todas, EXCEPTO Wisp (900867741) que se queda en 25000.
Match por nombre normalizado + alias (igual que seed_apply). usuarios_efectivos es columna GENERADA
= COALESCE(reales, estimados), se actualiza sola. Transaccion con rollback, todo en sync_cambios
con valor viejo->nuevo (reversible). No crea backup (preferencia: logs sobre backups).
"""
import sqlite3, csv, unicodedata, re, glob
from datetime import datetime

DB='/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db'
WISP='900867741'  # excluido por decision manual: se queda en 25000
SUF={'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'[^a-z0-9 ]',' ',s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()
def parse_num(s):
    s=str(s or '').strip().replace('.','').replace(',','').replace(' ','')
    m=re.search(r'\d+', s)
    return float(m.group()) if m else None

con=sqlite3.connect(DB); cur=con.cursor()
corrida='import-usuarios-'+datetime.now().strftime('%Y%m%d-%H%M%S')
def log(idemp,det):
    cur.execute("INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
                (corrida,'notion','empresa_usuarios',str(idemp),'update',det))

byname={}
for i,n in cur.execute("SELECT id_empresa,nombre_oficial FROM empresa"): byname.setdefault(norm(n),i)
for a,i in cur.execute("SELECT alias,id_empresa FROM empresa_alias"): byname.setdefault(norm(a),i)
ureal={}; estado={}
for i,r in cur.execute("SELECT id_empresa,usuarios_reales FROM empresa_usuarios"): ureal[i]=r
for i,e in cur.execute("SELECT id_empresa,estado_notion FROM empresa"): estado[i]=e

CSV=glob.glob('/Users/sebastianacostamolina/Arc/*/*Sales Pipeline*_all.csv')[0]
st={'insert':0,'update':0,'igual':0,'wisp':0,'nomatch':0,'sin_valor':0}
done=set()
try:
    for r in csv.DictReader(open(CSV,encoding='utf-8-sig',newline='')):
        nm=(r.get('Empresa') or '').strip()
        val=parse_num(r.get('Usuarios Estimados',''))
        if val is None: st['sin_valor']+=1; continue
        idemp=byname.get(norm(nm))
        if not idemp: st['nomatch']+=1; continue
        if idemp==WISP: st['wisp']+=1; continue
        if idemp in done: continue
        done.add(idemp)
        old=ureal.get(idemp)
        if old==val: st['igual']+=1; continue
        fte='notion_'+(estado.get(idemp) or 'pipeline')
        cur.execute("""INSERT INTO empresa_usuarios(id_empresa,usuarios_reales,usuarios_reales_fuente,actualizado_por)
                       VALUES(?,?,?,?)
                       ON CONFLICT(id_empresa) DO UPDATE SET
                         usuarios_reales=excluded.usuarios_reales,
                         usuarios_reales_fuente=excluded.usuarios_reales_fuente,
                         actualizado_en=datetime('now'),
                         actualizado_por=excluded.actualizado_por""",
                    (idemp,val,fte,'import_usuarios'))
        if idemp in ureal or old is not None:
            st['update']+=1; log(idemp,f'usuarios_reales {old}->{int(val)} fuente={fte}')
        else:
            st['insert']+=1; log(idemp,f'usuarios_reales NULL->{int(val)} fuente={fte}')
    log(corrida,'resumen '+str(st))
    con.commit()
    print("APLICADO OK. corrida:",corrida)
    for k,v in st.items(): print(f"  {k:10} {v}")
    print("\n  Fibernet ahora:")
    for r in cur.execute("SELECT usuarios_reales,usuarios_estimados,usuarios_efectivos,usuarios_reales_fuente FROM empresa_usuarios WHERE id_empresa='9990000116'"):
        print("   ",r)
    print("  Wisp (debe seguir en 25000):")
    for r in cur.execute("SELECT usuarios_reales,usuarios_reales_fuente FROM empresa_usuarios WHERE id_empresa='900867741'"):
        print("   ",r)
    n=cur.execute("SELECT count(*) FROM empresa_usuarios WHERE usuarios_reales IS NOT NULL").fetchone()[0]
    print("  empresas con usuarios_reales:",n)
    print("  cambios logueados:",cur.execute("SELECT count(*) FROM sync_cambios WHERE corrida=?",(corrida,)).fetchone()[0])
except Exception as ex:
    con.rollback(); print("ERROR, rollback:",ex); raise
