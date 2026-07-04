"""
Seed Notion -> isps.db. DRY RUN: solo reporta el plan, no escribe.
Decisiones de matching tomadas con Sebastián (sesión 2026-06-30).
Merge no destructivo. Toques simples (hubo reunión / hubo llamada), sin transcript.
"""
import sqlite3, csv, unicodedata, re, glob

SUF={'sas','sa','s','a','ltda','eu','esp','de','del','la','el','zomac','bic','y','e'}
def norm(s):
    s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()
    s=re.sub(r'[^a-z0-9 ]',' ',s)
    return ' '.join(t for t in s.split() if t not in SUF).strip()
def dom(u):
    if not u: return ''
    u=str(u).lower().replace('https://','').replace('http://','').replace('www.','')
    return u.split('/')[0].strip()

JUNK={'insumos desechables','clonai','anta','latitude sh latitude sh','delta isp crm'}
# Matches manuales por DOMINIO (la señal fuerte)
MANUAL_DOM={'conectic':'conectic.net.co','connection telecomunicaciones':'connectionisp.com',
 'contecta2 telecomunicaciones':'conecta2telecomunicaciones.com','servicios informaticos del choco sic':'siconline.co',
 'servicosta':'servicosta.net','vive comunicaciones':'vivetel.com.co','intercom narino':'intercommdenarinosas.com',
 'technet comunicaciones':'technetsas.com','alianxa':'alianxa.co','arpanet':'arpanetmedellin.com',
 'asucap tv san jorge':'tvsanjorge.tv','cadcom':'cadcom.co','radiosat colombia':'radiosatcolombia.com.co',
 'rfcom':'rfcom.co','vanet zona wifi':'vanetfibra.net','http naamiku net':'naamikunet.co',
 'somos tv':'somostvinternet.com','chyper':'chypergamers.com','hola punto red guaviare':'puntoredguaviare.com'}
# Matches manuales por NOMBRE normalizado del objetivo (sin dominio claro)
MANUAL_NAME={'cyd telecomunicaciones':'cyd comunicaciones','medialink':'media link','servitek':'servictek',
 'spectra':'espectra','teleredes':'teleredes colombia','ultranet':'ultranet telecomunicaciones',
 'hola giganav':'giganav connections','hola comunicaciones wifi':'comunicaciones wifi colombia',
 'hola wifi alternativo':'wifi alternativo','hola tu fibra grupo':'tu fibra grupo empresarial',
 'hola digital net':'digitalnet','c j telecomunicaciones xtreme networks':'xtreme networks'}
UTIL=('acueduct','aguas','agua','energia','electr','gas','empresas publicas','metrogas','llanogas','redegas','surgas',
 'vatia','enel','celsia','afinia','cens','chec','ebsa','edeq','emcali','empocaldas','empopasto','enelar','enercer',
 'enertotal','ibal','sopesa','ruitoque','coservicios','acuavalle','alcanos','aqualia','aquaoccidente','serviciudad',
 'espucal','emser','saaab','eebp','claro','tigo',' etb ','wom','win','directv','vanti','triple a','espigas','ceibas')
MEET={'reunion agendada','oportunidad','cierre/documentacion','firma pendiente','contrato firmado','firma y pago realizado'}

con=sqlite3.connect('isps.db'); cur=con.cursor()
byname={}
for i,n in cur.execute("SELECT id_empresa,nombre_oficial FROM empresa"): byname.setdefault(norm(n),i)
for a,i in cur.execute("SELECT alias,id_empresa FROM empresa_alias"): byname.setdefault(norm(a),i)
bydom={}
for i,w in cur.execute("SELECT id_empresa,url_website FROM empresa_web"):
    d=dom(w)
    if d: bydom.setdefault(d,i)
mb_clients=set()
g=glob.glob('/Users/sebastianacostamolina/Arc/DISCOVERY SHARE OF WALLET*.xlsx')
if g:
    import openpyxl
    ws=openpyxl.load_workbook(g[0],read_only=True,data_only=True)['Ranking']
    for r in ws.iter_rows(min_row=2,values_only=True):
        if r and r[1]: mb_clients.add(norm(r[1]))

NOT=glob.glob('/Users/sebastianacostamolina/Arc/*/*Sales Pipeline*_all.csv')[0]
plan={'link_exacto':0,'link_manual':0,'manual_sin_resolver':[],'utility':0,'excluir':0,'isp_nuevo':0,'cliente_nuevo':0}
toques={'reunion':0,'llamada':0}
for r in csv.DictReader(open(NOT,encoding='utf-8-sig',newline='')):
    nm=(r.get('Empresa') or '').strip(); n=norm(nm)
    if not nm: continue
    if n in JUNK: plan['excluir']+=1; continue
    tgt=None
    if n in MANUAL_DOM: tgt=bydom.get(MANUAL_DOM[n])
    elif n in MANUAL_NAME: tgt=byname.get(MANUAL_NAME[n])
    if n in MANUAL_DOM or n in MANUAL_NAME:
        if tgt: plan['link_manual']+=1
        else: plan['manual_sin_resolver'].append(nm)
    elif any(k in ' '+nm.lower()+' ' for k in UTIL): plan['utility']+=1; continue
    elif n in byname: plan['link_exacto']+=1
    elif n in mb_clients: plan['cliente_nuevo']+=1
    else: plan['isp_nuevo']+=1
    est=norm(r.get('Estado',''))
    if est in MEET: toques['reunion']+=1
    elif (r.get('Contactado') or r.get('Fecha Último Contacto') or (r.get('Intentos de Contacto') or '').strip()):
        toques['llamada']+=1

print("=== PLAN DEL SEED (dry run, no escribe) ===")
for k,v in plan.items():
    if k!='manual_sin_resolver': print(f"  {k:20} {v}")
print(f"\n  Toques a crear: reunión={toques['reunion']}  llamada={toques['llamada']}")
sr=plan['manual_sin_resolver']
print(f"\n  Matches manuales sin resolver ({len(sr)}): {sr if sr else 'ninguno'}")
