// Diagnóstico repetible de los invariantes que el cockpit debe cumplir. Solo LEE.
// Se corre antes de la reparación (baseline) y después (verificación). Cada línea
// es un bug del plan 2026-07-15-reparacion-lectura-datos.md.
//
// Correr: ISPS_DB_PATH=../isps.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/verificar_invariantes.ts

import Database from 'better-sqlite3';
import { crearNotionExportAdapter } from '../app/adapters/notion/notionExportAdapter.ts';
import { mapearEstadoNotion } from '../app/core/reconciliacion/mapeoEstados.ts';
import { embudoPipeline } from '../app/db/repository.ts';

import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';

// Los scripts no pasan por requireSession(), asi que declaran su modo a mano: sin esto
// el primer acceso a la DB lanza (modo-prueba.ts no tiene default a proposito).
marcarModoPrueba(false);

const DB_PATH = process.env.ISPS_DB_PATH ?? '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';
const db = new Database(DB_PATH, { readonly: true });

const HOY = new Date().toISOString().slice(0, 10);
const ETAPAS_EN_MARCHA = "('contacto_iniciado','oportunidad','enviar_contrato','cierre_documentacion','firma_pago')";

function n(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

// Task 8 (plan 2026-07-15-embudo-real-y-registro): el criterio de aceptacion de Sebastian
// (el embudo cuadra con el CSV de Notion, no con lo que la query cuente) convertido en
// codigo. Mismo CSV y adaptador que scripts/diff_notion_db.ts (herramienta real del
// repo, no un match por nombre ad-hoc -- ver memoria verificar-contra-conteo-manual).
const DIR_NOTION_CSV = '/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline';
const NOTION_CSV = DIR_NOTION_CSV + ' f5e2be53a1514d42ac6db30fd7c5202a_all.csv';

function conteoNotionPorEstado(): Record<string, number> {
  const out: Record<string, number> = {};
  const empresas = crearNotionExportAdapter(DIR_NOTION_CSV, NOTION_CSV).leerEmpresas().filter((e) => e.nombre.trim());
  for (const e of empresas) {
    let estado: string;
    try {
      estado = mapearEstadoNotion(e.estado.trim());
    } catch {
      continue; // estado vacio o fuera de vocabulario: no comparable (igual que diff_notion_db.ts)
    }
    out[estado] = (out[estado] ?? 0) + 1;
  }
  return out;
}

const checks: { id: string; desc: string; valor: number; meta: number }[] = [
  {
    id: 'A',
    desc: 'filas fundidas (opera_bajo_id) todavia en la organizacion',
    valor: n('select count(*) n from empresa where opera_bajo_id is not null and organizacion_activa_id=1'),
    // Ya no es un contador fijo: Bloque 3 (2026-07-15) probo que puede subir (Task 10
    // funde EMCALI) o bajar (Task 9 deshace CELSIA; luego se revirtio TAMBIEN el merge de
    // EMCALI-Thomas al descubrir que era satelite_de, no fundida -- ver identidad_decision).
    // Informativo: cada cambio debe tener su fila en sync_cambios o identidad_decision,
    // pero el numero en si ya no es un blanco fijo.
    meta: -1,
  },
  {
    id: 'C',
    desc: 'empresas de Industria=Energia sin veto utility (deberia ser 0)',
    valor: n(`select count(*) n from empresa e
              join empresa_categoria ec on ec.id_empresa = e.id_empresa
              where ec.categoria = 'isp' and e.opera_bajo_id is null
                and e.nombre_oficial in ('ENEL','CELSIA','AFINIA')`),
    meta: 0,
  },
  {
    id: 'E',
    desc: 'empresas dummy en produccion (deberia ser 0)',
    valor: n("select count(*) n from empresa where categoria in ('test','creditos')"),
    meta: 0,
  },
  {
    id: 'E',
    desc: 'contactos dummy en produccion (deberia ser 0)',
    valor: n(`select count(*) n from contacto where id_empresa in
              (select id_empresa from empresa where categoria in ('test','creditos'))`),
    meta: 0,
  },
  {
    id: 'G',
    desc: 'empresas con contacto de Notion alcanzable pero sin KDM marcado (deberia ser 0)',
    valor: n(`select count(*) n from empresa e
              where e.organizacion_activa_id=1 and e.opera_bajo_id is null
                and exists (select 1 from contacto c where c.id_empresa=e.id_empresa
                            and c.fuente like 'notion%' and c.es_principal=1
                            and (c.telefono is not null or c.email is not null))
                and not exists (select 1 from contacto k where k.id_empresa=e.id_empresa
                                and k.es_key_decision_maker=1
                                and (k.telefono is not null or k.email is not null))`),
    meta: 0,
  },
  {
    id: 'I',
    desc: 'deals en marcha SIN KDM alcanzable (los que hoy ven PBX; el gate los saca)',
    valor: n(`select count(*) n from empresa e
              where e.organizacion_activa_id=1 and e.opera_bajo_id is null
                and e.estado_notion in ${ETAPAS_EN_MARCHA}
                and not exists (select 1 from contacto k where k.id_empresa=e.id_empresa
                                and k.es_key_decision_maker=1
                                and (k.telefono is not null or k.email is not null))`),
    meta: -1, // informativo: no tiene que llegar a 0, el gate de etapa los saca del bucle igual.
  },
  {
    id: 'L',
    desc: 'deals activos con owner OCULTOS en /seguimiento por el cutoff de fecha',
    valor: n(`select count(*) n from empresa
              where organizacion_activa_id=1 and opera_bajo_id is null
                and coalesce(estado_notion,'') not in ('on_hold','firma_pago')
                and coalesce(categoria,'') not in ('test','creditos')
                and owner is not null and owner <> ''
                and (proximo_follow_up_fecha is null or proximo_follow_up_fecha > '${HOY}')`),
    meta: -1, // informativo: baja a 0 visible cuando L se arregla (dejan de estar ocultos).
  },
];

{
  const notionPorEstado = conteoNotionPorEstado();
  const dbPorEstado = Object.fromEntries(embudoPipeline(1).map((c) => [c.estado, c.total]));
  const estados = new Set([...Object.keys(notionPorEstado), ...Object.keys(dbPorEstado)]);
  const diffs = [...estados]
    .map((estado) => ({ estado, notion: notionPorEstado[estado] ?? 0, db: dbPorEstado[estado] ?? 0 }))
    .filter((d) => d.notion !== d.db);

  checks.push({
    id: 'M',
    desc: `embudo cuadra con el CSV de Notion, por estado${diffs.length ? ' -- ' + diffs.map((d) => `${d.estado}: notion=${d.notion} db=${d.db}`).join(', ') : ''}`,
    valor: diffs.length,
    meta: 0,
  });
}

console.log(`Invariantes contra ${DB_PATH} (${HOY})\n`);
let fallidos = 0;
for (const c of checks) {
  const ok = c.meta === -1 ? null : c.valor === c.meta;
  if (ok === false) fallidos++;
  const marca = ok === null ? 'i' : ok ? 'ok' : 'XX';
  console.log(`[${marca}] ${c.id.padEnd(2)} ${String(c.valor).padStart(5)}  ${c.desc}`);
}
console.log(`\n${fallidos} invariante(s) en rojo.`);
