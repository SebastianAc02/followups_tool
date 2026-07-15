// Reescribe empresa.proximo_follow_up_fecha a 'YYYY-MM-DD' para las filas en formato
// humano ('July 14, 2026', 'July 14, 2026 3:30 AM (GMT-5)'). NO toca las ISO ni las NULL.
// Idempotente: correrlo dos veces no cambia nada la segunda vez.
//
// Por que: colaDelDia (y las demas variantes de la cola) filtran con
// proximo_follow_up_fecha <= hoy. SQLite compara TEXTO: 'July 14, 2026' > '2026-07-15' en
// ASCII ('J' > '2'), asi que ninguna fecha en formato humano entra jamas. Falla en
// silencio. Mismo problema que toque.fecha (ver normalizar-fechas-toque.ts), mismo
// arreglo: canonizar el dato una vez con el parser que ya existe en fecha-toque.ts.
//
//   node --experimental-strip-types scripts/normalizar-follow-up-fecha.ts            (dry-run)
//   node --experimental-strip-types scripts/normalizar-follow-up-fecha.ts --aplicar
import Database from 'better-sqlite3';
import { normalizarFechaToque } from '../app/core/fecha-toque.ts';

const RUTA_DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';
const aplicar = process.argv.includes('--aplicar');

const db = new Database(RUTA_DB, { readonly: !aplicar });
const filas = db
  .prepare('SELECT id_empresa, proximo_follow_up_fecha FROM empresa WHERE proximo_follow_up_fecha IS NOT NULL')
  .all() as { id_empresa: string; proximo_follow_up_fecha: string }[];

// Ya canonica: 'YYYY-MM-DD' (con o sin hora pegada). lte() ya la entiende.
const yaSirve = (f: string) => /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(f);

const cambios: { id: string; de: string; a: string }[] = [];
const sinRescate: { id: string; de: string }[] = [];

for (const f of filas) {
  if (yaSirve(f.proximo_follow_up_fecha)) continue;
  const n = normalizarFechaToque(f.proximo_follow_up_fecha);
  if (n.tipo === 'dia') cambios.push({ id: f.id_empresa, de: f.proximo_follow_up_fecha, a: n.iso });
  else sinRescate.push({ id: f.id_empresa, de: f.proximo_follow_up_fecha });
}

console.log(`Filas con fecha:        ${filas.length}`);
console.log(`Ya canonicas:           ${filas.length - cambios.length - sinRescate.length}`);
console.log(`A normalizar:           ${cambios.length}`);
console.log(`Sin rescate (se dejan): ${sinRescate.length}`);
for (const s of sinRescate) console.log(`  id_empresa=${s.id} ${JSON.stringify(s.de)}`);

console.log('\nMuestra de los cambios:');
for (const c of cambios.slice(0, 10)) console.log(`  id_empresa=${c.id}  ${JSON.stringify(c.de)} -> ${c.a}`);

if (!aplicar) {
  console.log('\nDRY-RUN: no se escribio nada. Repetir con --aplicar.');
  process.exit(0);
}

const upd = db.prepare('UPDATE empresa SET proximo_follow_up_fecha = ? WHERE id_empresa = ?');
const logCambio = db.prepare(
  `INSERT INTO sync_cambios (corrida, fuente, entidad, id_registro, accion, detalle)
   VALUES ('normalizar-follow-up-fecha', 'script', 'empresa', ?, 'update', ?)`,
);
const aplicarTodos = db.transaction((lista: typeof cambios) => {
  for (const c of lista) {
    upd.run(c.a, c.id);
    logCambio.run(
      c.id,
      `proximo_follow_up_fecha: fecha humana de Notion a ISO (colaDelDia comparaba texto y nunca la veia): ${JSON.stringify(c.de)} -> ${c.a}`,
    );
  }
});
aplicarTodos(cambios);
console.log(`\nAplicados ${cambios.length} cambios.`);
