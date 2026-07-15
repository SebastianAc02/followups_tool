// Diagnóstico repetible de los invariantes que el cockpit debe cumplir. Solo LEE.
// Se corre antes de la reparación (baseline) y después (verificación). Cada línea
// es un bug del plan 2026-07-15-reparacion-lectura-datos.md.
//
// Correr: ISPS_DB_PATH=../isps.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/verificar_invariantes.ts

import Database from 'better-sqlite3';

const DB_PATH = process.env.ISPS_DB_PATH ?? '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';
const db = new Database(DB_PATH, { readonly: true });

const HOY = new Date().toISOString().slice(0, 10);
const ETAPAS_EN_MARCHA = "('contacto_iniciado','oportunidad','enviar_contrato','cierre_documentacion','firma_pago')";

function n(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

const checks: { id: string; desc: string; valor: number; meta: number }[] = [
  {
    id: 'A',
    desc: 'filas fundidas (opera_bajo_id) todavia en la organizacion',
    valor: n('select count(*) n from empresa where opera_bajo_id is not null and organizacion_activa_id=1'),
    meta: 23, // no baja: la fila sigue en la DB a proposito (auditoria). Lo que cambia es que la UI ya no la lee.
  },
  {
    id: 'C',
    desc: 'empresas de Industria=Energia sin veto utility (deberia ser 0)',
    valor: n(`select count(*) n from empresa e
              join empresa_categoria ec on ec.id_empresa = e.id_empresa
              where ec.categoria = 'isp' and e.nombre_oficial in ('ENEL','CELSIA','AFINIA')`),
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

console.log(`Invariantes contra ${DB_PATH} (${HOY})\n`);
let fallidos = 0;
for (const c of checks) {
  const ok = c.meta === -1 ? null : c.valor === c.meta;
  if (ok === false) fallidos++;
  const marca = ok === null ? 'i' : ok ? 'ok' : 'XX';
  console.log(`[${marca}] ${c.id.padEnd(2)} ${String(c.valor).padStart(5)}  ${c.desc}`);
}
console.log(`\n${fallidos} invariante(s) en rojo.`);
