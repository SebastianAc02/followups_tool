"""
Seed Notion -> isps.db (APPLY). Merge no destructivo, transaccion con rollback,
log en sync_cambios. Crea tabla toque y columna categoria si faltan.
Toques: 'hubo reunion' / 'hubo llamada' (sin transcript). Utilities: solo lo basico.
"""
import sqlite3, csv, unicodedata, re, glob, hashlib
from datetime import datetime

SUF={'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'[^a-z0-9 ]',' ',s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()
def dom(u):
    if not u: return ''
    u=str(u).lower().replace('https://','').replace('http://','').replace('www.','')
    return u.split('/')[0].strip()
def eid(nm): return 'ntn-'+hashlib.md5(norm(nm).encode()).hexdigest()[:12]

JUNK={'insumos desechables','clonai','anta','latitude sh latitude sh','delta isp crm'}
MANUAL_DOM={'conectic':'conectic.net.co','connection telecomunicaciones':'connectionisp.com',
 'contecta2 telecomunicaciones':'conecta2telecomunicaciones.com','servicios informaticos del choco sic':'siconline.co',
 'servicosta':'servicosta.net','vive comunicaciones':'vivetel.com.co','intercom narino':'intercommdenarinosas.com',
 'technet comunicaciones':'technetsas.com','alianxa':'alianxa.co','arpanet':'arpanetmedellin.com',
 'asucap tv san jorge':'tvsanjorge.tv','cadcom':'cadcom.co','radiosat colombia':'radiosatcolombia.com.co',
 'rfcom':'rfcom.co','vanet zona wifi':'vanetfibra.net','http naamiku net':'naamikunet.co',
 'somos tv':'somostvinternet.com','chyper':'chypergamers.com','hola punto red guaviare':'puntoredguaviare.com'}
MANUAL_NAME={'cyd telecomunicaciones':'cyd comunicaciones','medialink':'media link','servitek':'servictek',
 'spectra':'espectra','teleredes':'teleredes colombia','ultranet':'ultranet telecomunicaciones',
 'hola giganav':'giganav connections','hola comunicaciones wifi':'comunicaciones wifi colombia',
 'hola wifi alternativo':'wifi alternativo','hola digital net':'digitalnet',
 'c j telecomunicaciones xtreme networks':'xtreme networks'}
UTIL=('acueduct','aguas','agua','energia','electr','gas','empresas publicas','metrogas','llanogas','redegas','surgas',
 'vatia','enel','celsia','afinia','cens','chec','ebsa','edeq','emcali','empocaldas','empopasto','enelar','enercer',
 'enertotal','ibal','sopesa','ruitoque','coservicios','acuavalle','alcanos','aqualia','aquaoccidente','serviciudad',
 'espucal','emser','saaab','eebp','claro','tigo',' etb ','wom','win','directv','vanti','triple a','espigas','ceibas')

def estado_com(e):
    e=e.lower()
    if 'firma y pago' in e or 'contrato firmado' in e: return 'cliente'
    if 'on hold' in e: return 'pausado'
    if 'contacto iniciado' in e: return 'contactado'
    if any(x in e for x in ('oportunidad','reunion','cierre','firma pendiente','documentacion')): return 'negociacion'
    return 'lead'
def estado_not(e):
    e=e.lower()
    if 'firma y pago' in e: return 'firma_pago'
    if 'on hold' in e: return 'on_hold'
    if 'contacto iniciado' in e: return 'contacto_iniciado'
    if 'reunion' in e: return 'reunion_agendada'
    if 'oportunidad' in e: return 'oportunidad'
    if 'cierre' in e or 'documentacion' in e: return 'cierre_documentacion'
    if 'contrato' in e or 'firma pendiente' in e: return 'enviar_contrato'
    if 'lead' in e: return 'lead'
    return None
def touch_kind(e, r):
    el=e.lower()
    if any(x in el for x in ('reunion','oportunidad','cierre','documentacion','firma','contrato')): return ('reunion','hubo reunion')
    if (r.get('Contactado') or r.get('Fecha Último Contacto') or (r.get('Intentos de Contacto') or '').strip()):
        return ('llamada','hubo llamada')
    return (None,None)

con=sqlite3.connect('isps.db'); cur=con.cursor()
corrida='seed-notion-'+datetime.now().strftime('%Y%m%d-%H%M%S')
def log(fuente,ent,rid,acc,det):
    cur.execute("INSERT INTO sync_cambios(corrida,fuente,entidad,id_registro,accion,detalle) VALUES(?,?,?,?,?,?)",
                (corrida,fuente,ent,str(rid),acc,det))

cols=[c[1] for c in cur.execute("PRAGMA table_info(empresa)")]
if 'categoria' not in cols: cur.execute("ALTER TABLE empresa ADD COLUMN categoria TEXT")
cur.execute("""CREATE TABLE IF NOT EXISTS toque (
  id_toque INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empresa TEXT NOT NULL REFERENCES empresa(id_empresa) ON DELETE CASCADE,
  fecha TEXT, canal TEXT, resultado TEXT, que_paso TEXT,
  proximo_paso TEXT, proximo_follow_up_fecha TEXT,
  transcript_proveedor TEXT, transcript_id TEXT, transcript_url TEXT,
  fuente TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))""")

byname={}
for i,n in cur.execute("SELECT id_empresa,nombre_oficial FROM empresa"): byname.setdefault(norm(n),i)
for a,i in cur.execute("SELECT alias,id_empresa FROM empresa_alias"): byname.setdefault(norm(a),i)
bydom={}
for i,w in cur.execute("SELECT id_empresa,url_website FROM empresa_web"):
    d=dom(w)
    if d: bydom.setdefault(d,i)
alias_pairs=set((norm(a),i) for a,i in cur.execute("SELECT alias,id_empresa FROM empresa_alias"))
toque_seed=set(i for (i,) in cur.execute("SELECT DISTINCT id_empresa FROM toque WHERE fuente='notion_seed'"))

def add_alias(idemp, raw):
    if (norm(raw),idemp) in alias_pairs: return
    cur.execute("INSERT INTO empresa_alias(id_empresa,alias,fuente,confianza) VALUES(?,?,?,?)",(idemp,raw,'notion','alta'))
    alias_pairs.add((norm(raw),idemp))
def set_if_null(idemp,col,val):
    if not val: return
    cur.execute(f"SELECT {col} FROM empresa WHERE id_empresa=?",(idemp,))
    row=cur.fetchone()
    if row and (row[0] is None or row[0]==''):
        cur.execute(f"UPDATE empresa SET {col}=?, updated_at=datetime('now') WHERE id_empresa=?",(val,idemp))
        log('notion','empresa',idemp,'update',f'{col}={val}')
def new_empresa(idemp,nm,cat,esc,est):
    cur.execute("""INSERT INTO empresa(id_empresa,tipo_id,nombre_oficial,nombre_normalizado,estado_comercial,
                   estado_notion,es_cliente,categoria) VALUES(?,?,?,?,?,?,?,?)""",
                (idemp,'interno',nm,norm(nm),estado_com(est),estado_not(est),esc,cat))
    log('notion','empresa',idemp,'insert',f'{nm} cat={cat} cliente={esc}')
def add_touch(idemp,r):
    if idemp in toque_seed: return
    k,desc=touch_kind(r.get('Estado','') or '', r)
    if not k: return
    cur.execute("INSERT INTO toque(id_empresa,fecha,canal,que_paso,fuente) VALUES(?,?,?,?,?)",
                (idemp, (r.get('Fecha Último Contacto') or None), k, desc, 'notion_seed'))
    toque_seed.add(idemp)
    log('notion','toque',idemp,'insert',f'{k}:{desc}')

st={'link':0,'isp':0,'cliente':0,'utility':0,'excluir':0,'toques':0,'alias':0}
NOT=glob.glob('/Users/sebastianacostamolina/Arc/*/*Sales Pipeline*_all.csv')[0]
try:
    for r in csv.DictReader(open(NOT,encoding='utf-8-sig',newline='')):
        nm=(r.get('Empresa') or '').strip(); n=norm(nm); est=r.get('Estado','') or ''
        if not nm: continue
        if n in JUNK: st['excluir']+=1; log('notion','empresa',nm,'excluir','junk'); continue
        tgt=None
        if n in MANUAL_DOM: tgt=bydom.get(MANUAL_DOM[n])
        elif n in MANUAL_NAME: tgt=byname.get(MANUAL_NAME[n])
        elif any(k in ' '+nm.lower()+' ' for k in UTIL):
            idemp=eid(nm)
            if not cur.execute("SELECT 1 FROM empresa WHERE id_empresa=?",(idemp,)).fetchone():
                new_empresa(idemp,nm,'utility',0,est); add_alias(idemp,nm); st['utility']+=1
            continue
        elif n in byname: tgt=byname[n]
        if tgt:  # link
            b=len(alias_pairs); add_alias(tgt,nm)
            if len(alias_pairs)>b: st['alias']+=1
            set_if_null(tgt,'estado_notion',estado_not(est))
            set_if_null(tgt,'categoria','isp')
            set_if_null(tgt,'crm_software',(r.get('CRM / Software') or '').strip())
            set_if_null(tgt,'pasarela_actual',(r.get('Pasarela Actual') or '').strip())
            log('notion','empresa',tgt,'link',nm)
            before=len(toque_seed); add_touch(tgt,r)
            if len(toque_seed)>before: st['toques']+=1
            st['link']+=1
        else:  # nueva isp o cliente
            es_cli=1 if 'firma y pago' in est.lower() or 'contrato firmado' in est.lower() else 0
            idemp=eid(nm)
            if not cur.execute("SELECT 1 FROM empresa WHERE id_empresa=?",(idemp,)).fetchone():
                new_empresa(idemp,nm,'isp',es_cli,est); add_alias(idemp,nm)
                before=len(toque_seed); add_touch(idemp,r)
                if len(toque_seed)>before: st['toques']+=1
            st['cliente' if es_cli else 'isp']+=1
    log('notion','corrida',corrida,'resumen',str(st))
    con.commit()
    print("APLICADO OK. corrida:",corrida)
    for k,v in st.items(): print(f"  {k:10} {v}")
    print("\n  cambios logueados:",cur.execute("SELECT count(*) FROM sync_cambios WHERE corrida=?",(corrida,)).fetchone()[0])
    print("  empresas totales:",cur.execute("SELECT count(*) FROM empresa").fetchone()[0])
    print("  toques totales:",cur.execute("SELECT count(*) FROM toque").fetchone()[0])
except Exception as ex:
    con.rollback(); print("ERROR, rollback:",ex); raise
