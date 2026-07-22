// Siembra el catalogo `plan` (2026-07-22, plan-panel-metricas-tiempo-real.md) con los
// valores REALES de la DB "Planes" de Notion (collection://29595153-c5cd-805d-9b6c-
// 000bbe323cf1), leidos por Notion MCP el 2026-07-22. No se inventa ningun numero: son
// los mismos SaaS mensual (valor) / Tarifa TXN (valor) que ya usa Notion para calcular
// "MRR potencial" en el pipeline real.
//
// Idempotente: upsert por nombre (plan.nombre es UNIQUE). Correr de nuevo no duplica.
//
// Correr: node --experimental-strip-types --experimental-loader
//   ./scripts/resolve-ts-ext.mjs scripts/seed_planes.ts

import { db, schema } from '../app/db/index.ts';

// Alliance SaePlus existe en Notion pero sin SaaS mensual ni Tarifa TXN cargados
// (ambos vacios) -- se deja fuera del catalogo, no se le inventa una tarifa.
const PLANES_NOTION = [
  { nombre: 'Essential', saasMensual: 600_000, tarifaTxn: 2200 },
  { nombre: 'Pro', saasMensual: 1_800_000, tarifaTxn: 1680 },
  { nombre: 'Growth', saasMensual: 5_500_000, tarifaTxn: 1000 },
  { nombre: 'Utilities Lanzamiento', saasMensual: 10_000_000, tarifaTxn: 250 },
  { nombre: 'Utilities Crecimiento', saasMensual: 15_000_000, tarifaTxn: 220 },
  { nombre: 'Utilities Enterprise', saasMensual: 20_000_000, tarifaTxn: 200 },
  // Combos promocionales: mismo SaaS del plan base, tarifa transaccional de otro plan.
  { nombre: 'Essential (+Growth)', saasMensual: 600_000, tarifaTxn: 800 },
  { nombre: 'Essential (+Pro)', saasMensual: 600_000, tarifaTxn: 1500 },
  { nombre: 'Pro (+Growth)', saasMensual: 1_800_000, tarifaTxn: 800 },
];

for (const p of PLANES_NOTION) {
  db.insert(schema.plan)
    .values(p)
    .onConflictDoUpdate({ target: schema.plan.nombre, set: { saasMensual: p.saasMensual, tarifaTxn: p.tarifaTxn } })
    .run();
  console.log(`  ${p.nombre}: saas=${p.saasMensual} tarifa_txn=${p.tarifaTxn}`);
}

console.log(`\n${PLANES_NOTION.length} planes sembrados/actualizados.`);
