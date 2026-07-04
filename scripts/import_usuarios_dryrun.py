"""
DRY RUN: traer usuarios de Notion (columna 'Usuarios Estimados') a empresa_usuarios.usuarios_reales.
No escribe nada. Solo reporta el plan: cuántas se llenarían, cuántas ya tienen real, sin match.
Match por nombre normalizado + alias, igual que seed_apply / import_proximo_paso.
"""
import sqlite3, csv, unicodedata, re, glob

DB='/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db'
SUF={'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'[^a-z0-9 ]',' ',s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()
def parse_num(s):
    s=str(s or '').strip().replace('.','').replace(',','').replace(' ','')
    if not s: return None
    m=re.search(r'\d+', s)
    return float(m.group()) if m else None

con=sqlite3.connect(DB); cur=con.cursor()
byname={}
for i,n in cur.execute("SELECT id_empresa,nombre_oficial FROM empresa"): byname.setdefault(norm(n),i)
for a,i in cur.execute("SELECT alias,id_empresa FROM empresa_alias"): byname.setdefault(norm(a),i)
# estado actual de usuarios por empresa
ureal={}; uest={}; ufte={}
for i,r,e,f in cur.execute("SELECT id_empresa,usuarios_reales,usuarios_estimados,usuarios_reales_fuente FROM empresa_usuarios"):
    ureal[i]=r; uest[i]=e; ufte[i]=f
estado={}
for i,e in cur.execute("SELECT id_empresa,estado_notion FROM empresa"): estado[i]=e

CSV=glob.glob('/Users/sebastianacostamolina/Arc/*/*Sales Pipeline*_all.csv')[0]
st={'con_valor':0,'sin_valor':0,'nomatch':0,'llena_vacio':0,'gana_a_estimado':0,'conflicto_real':0,'igual':0}
conflictos=[]; ejemplos_llena=[]
for r in csv.DictReader(open(CSV,encoding='utf-8-sig',newline='')):
    nm=(r.get('Empresa') or '').strip()
    val=parse_num(r.get('Usuarios Estimados',''))
    if val is None: st['sin_valor']+=1; continue
    st['con_valor']+=1
    idemp=byname.get(norm(nm))
    if not idemp: st['nomatch']+=1; continue
    cur_real=ureal.get(idemp); cur_est=uest.get(idemp)
    if cur_real is None:
        if idemp not in ureal and idemp not in uest:
            st['llena_vacio']+=1
            if len(ejemplos_llena)<8: ejemplos_llena.append((nm,int(val)))
        else:
            st['gana_a_estimado']+=1
    elif cur_real==val:
        st['igual']+=1
    else:
        st['conflicto_real']+=1
        conflictos.append((nm,cur_real,val,ufte.get(idemp),estado.get(idemp)))

print("=== PLAN (dry run, nada escrito) ===")
for k,v in st.items(): print(f"  {k:16} {v}")
print("\n  Fibernet en Notion -> Usuarios Estimados:")
for r in csv.DictReader(open(CSV,encoding='utf-8-sig',newline='')):
    if 'fibernet' in norm(r.get('Empresa','')):
        print(f"    '{r.get('Empresa').strip()}' = {r.get('Usuarios Estimados')!r}  Estado={r.get('Estado')!r}")
print("\n  ejemplos que llenan un vacío (se veían 'sacar en la llamada'):")
for nm,v in ejemplos_llena: print(f"    {nm[:34]:34} -> {v}")
if conflictos:
    print(f"\n  === LOS {len(conflictos)} CONFLICTOS (para decidir uno por uno) ===")
    print(f"  {'#':>2}  {'empresa':30} {'real':>6} {'notion':>6} {'d%':>5}  {'fuente':24} estado")
    firmapago=[c for c in conflictos if 'firma_pago' in (c[3] or '')]
    otros=[c for c in conflictos if 'firma_pago' not in (c[3] or '')]
    n=0
    for grupo,titulo in ((firmapago,'FIRMA_PAGO (confirmados al firmar, recomiendo NO tocar)'),(otros,'NOTION_* (snapshot viejo, el CSV es mas fresco)')):
        print(f"\n  -- {titulo} --")
        for nm,cr,nv,ft,es in sorted(grupo,key=lambda x:-abs((x[1] or 0)-(x[2] or 0))):
            n+=1; d=round((nv-cr)/cr*100) if cr else 0
            print(f"  {n:>2}  {nm[:30]:30} {int(cr):>6} {int(nv):>6} {d:>+4}%  {(ft or ''):24} {es or ''}")
