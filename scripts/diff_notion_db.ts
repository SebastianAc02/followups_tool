// Diff completo Notion(export) <-> DB, cuenta por cuenta, usando el ADAPTER real (con
// los fixes de NFC/trim/razon-social de T14) y el page_id normalizado -- no busquedas
// ad-hoc por nombre, que ya produjeron 3 diagnosticos inflados hoy.
//
// Clasifica cada fila del CSV de Notion en:
//   OK              -- enlazada y estado/owner alineados
//   ESTADO_DERIVADO -- enlazada pero el estado difiere (el sync no la alcanzo: bug M o P)
//   OWNER_DERIVADO  -- enlazada pero el owner difiere
//   SIN_FILA        -- Notion la tiene y la DB no (bug N: el sync nunca CREA)
//   DUP_NOTION      -- 2+ filas de Notion resuelven a la MISMA fila DB (bug O, tipo
//                      Cable Cauca: paginas duplicadas en el origen, criterio humano)
//
// Correr: ISPS_DB_PATH=../isps.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/diff_notion_db.ts
import Database from 'better-sqlite3';
import { crearNotionExportAdapter } from '../app/adapters/notion/notionExportAdapter.ts';
import { normalizarRazonSocial } from '../app/core/reconciliacion/normalizarRazonSocial.ts';
import { mapearEstadoNotion } from '../app/core/reconciliacion/mapeoEstados.ts';

const DIR = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
const CSV = DIR + ' f5e2be53a1514d42ac6db30fd7c5202a_all.csv';
const DB_PATH = process.env.ISPS_DB_PATH ?? '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

const db = new Database(DB_PATH, { readonly: true });
type FilaDb = { id: string; nombre: string; estado: string | null; owner: string | null; pid: string | null };
const filasDb: FilaDb[] = db
  .prepare(
    `select id_empresa id, nombre_oficial nombre, estado_notion estado, owner, notion_page_id pid
     from empresa where opera_bajo_id is null and organizacion_activa_id=1
       and coalesce(categoria,'') not in ('test','creditos')`,
  )
  .all() as FilaDb[];

const sg = (s: string | null) => (s ?? '').replace(/-/g, '').toLowerCase();
const porPid = new Map<string, FilaDb>();
const porNombre = new Map<string, FilaDb[]>();
for (const f of filasDb) {
  if (f.pid) porPid.set(sg(f.pid), f);
  const k = normalizarRazonSocial(f.nombre);
  if (!porNombre.has(k)) porNombre.set(k, []);
  porNombre.get(k)!.push(f);
}

const empresas = crearNotionExportAdapter(DIR, CSV).leerEmpresas().filter((e) => e.nombre.trim());

type Match = { fila: FilaDb; via: 'page_id' | 'nombre' };
function matchear(e: { pageId: string | null; nombre: string }): Match | null {
  if (e.pageId) {
    const f = porPid.get(sg(e.pageId));
    if (f) return { fila: f, via: 'page_id' };
  }
  const c = porNombre.get(normalizarRazonSocial(e.nombre));
  if (c?.length === 1) return { fila: c[0], via: 'nombre' };
  return null;
}

const resueltas = new Map<string, { notion: string; estado: string; owner: string; via: string }[]>();
const sinFila: { nombre: string; estado: string; owner: string }[] = [];
const estadoDeriv: { notion: string; owner: string; esperado: string; db: string; id: string }[] = [];
const ownerDeriv: { notion: string; notionOwner: string; dbOwner: string; id: string }[] = [];
let ok = 0;
let estadoNoMapeado = 0;

for (const e of empresas) {
  const est = e.estado.trim();
  const own = e.owner.trim();
  let esperado: string;
  try {
    esperado = mapearEstadoNotion(est);
  } catch {
    if (est !== '') estadoNoMapeado++;
    continue; // estado vacio o fuera de vocabulario: no comparable
  }
  const m = matchear(e);
  if (!m) {
    sinFila.push({ nombre: e.nombre, estado: est, owner: own });
    continue;
  }
  const key = m.fila.id;
  if (!resueltas.has(key)) resueltas.set(key, []);
  resueltas.get(key)!.push({ notion: e.nombre, estado: est, owner: own, via: m.via });

  let limpia = true;
  if ((m.fila.estado ?? '') !== esperado) {
    estadoDeriv.push({ notion: e.nombre, owner: own, esperado, db: m.fila.estado ?? '(vacio)', id: m.fila.id });
    limpia = false;
  }
  if (own !== '' && (m.fila.owner ?? '') !== own) {
    ownerDeriv.push({ notion: e.nombre, notionOwner: own, dbOwner: m.fila.owner ?? '(vacio)', id: m.fila.id });
    limpia = false;
  }
  if (limpia) ok++;
}

const dups = [...resueltas.entries()].filter(([, v]) => v.length > 1);

console.log(`filas Notion comparables: ${empresas.length - estadoNoMapeado} (${estadoNoMapeado} con estado fuera de vocabulario)`);
console.log(`  OK (enlazada, estado y owner alineados): ${ok}`);
console.log(`  ESTADO_DERIVADO: ${estadoDeriv.length}`);
console.log(`  OWNER_DERIVADO : ${ownerDeriv.length}`);
console.log(`  SIN_FILA (bug N): ${sinFila.length}`);
console.log(`  DUP_NOTION (bug O, 2+ paginas -> misma fila DB): ${dups.length}`);

console.log(`\n== ESTADO_DERIVADO ==`);
for (const d of estadoDeriv) console.log(`  ${d.notion.slice(0, 36).padEnd(38)} Notion=${d.esperado.padEnd(20)} DB=${d.db.padEnd(20)} owner=${d.owner || '-'} (${d.id})`);
console.log(`\n== OWNER_DERIVADO ==`);
for (const d of ownerDeriv) console.log(`  ${d.notion.slice(0, 36).padEnd(38)} Notion=${d.notionOwner.padEnd(26)} DB=${d.dbOwner} (${d.id})`);
console.log(`\n== SIN_FILA (crear, bug N) ==`);
for (const d of sinFila) console.log(`  ${d.nombre.slice(0, 40).padEnd(42)} ${d.estado.padEnd(24)} ${d.owner || '-'}`);
console.log(`\n== DUP_NOTION (decidir cual sobrevive, tipo Cable Cauca) ==`);
for (const [id, v] of dups) {
  const f = filasDb.find((x) => x.id === id)!;
  console.log(`  fila DB ${id} "${f.nombre}" (estado=${f.estado}) recibe ${v.length} paginas:`);
  for (const p of v) console.log(`     - "${p.notion}" estado=${p.estado} owner=${p.owner || '-'} [via ${p.via}]`);
}
