// Reescribe toque.fecha a 'YYYY-MM-DD' para las filas en formato humano ('June 18, 2026',
// '24-jun 2026'). NO toca las ISO del cockpit (ya sirven con substr y su hora es dato real)
// ni las NULL. Idempotente: correrlo dos veces no cambia nada la segunda vez.
//
// Por que: contadoresHoy compara substr(fecha,1,10) = hoy. Eso funciona con ISO y con fecha
// sola, pero NO con los formatos humanos: no lanza, solo no cuenta. En vez de enseñarle los
// 5 formatos a cada consulta futura, se canoniza el dato una vez y substr vuelve a ser cierto.
//
//   node --experimental-strip-types scripts/normalizar-fechas-toque.ts            (dry-run)
//   node --experimental-strip-types scripts/normalizar-fechas-toque.ts --aplicar
import Database from 'better-sqlite3';
import { normalizarFechaToque } from '../app/core/fecha-toque.ts';

const RUTA_DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';
const aplicar = process.argv.includes('--aplicar');

const db = new Database(RUTA_DB, { readonly: !aplicar });
const filas = db.prepare('SELECT id_toque, fecha FROM toque WHERE fecha IS NOT NULL').all() as {
  id_toque: number;
  fecha: string;
}[];

// Ya canonicas: 'YYYY-MM-DD' o ISO completo. substr(fecha,1,10) ya las entiende.
const yaSirve = (f: string) => /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(f);

const cambios: { id: number; de: string; a: string }[] = [];
const sinRescate: { id: number; de: string }[] = [];

for (const f of filas) {
  if (yaSirve(f.fecha)) continue;
  const n = normalizarFechaToque(f.fecha);
  if (n.tipo === 'dia') cambios.push({ id: f.id_toque, de: f.fecha, a: n.iso });
  else sinRescate.push({ id: f.id_toque, de: f.fecha });
}

console.log(`Filas con fecha:        ${filas.length}`);
console.log(`Ya canonicas:           ${filas.length - cambios.length - sinRescate.length}`);
console.log(`A normalizar:           ${cambios.length}`);
console.log(`Sin rescate (se dejan): ${sinRescate.length}`);
for (const s of sinRescate) console.log(`  id=${s.id} ${JSON.stringify(s.de)}`);

console.log('\nMuestra de los cambios:');
for (const c of cambios.slice(0, 8)) console.log(`  id=${c.id}  ${JSON.stringify(c.de)} -> ${c.a}`);

if (!aplicar) {
  console.log('\nDRY-RUN: no se escribio nada. Repetir con --aplicar.');
  process.exit(0);
}

const upd = db.prepare('UPDATE toque SET fecha = ? WHERE id_toque = ?');
const aplicarTodos = db.transaction((lista: typeof cambios) => {
  for (const c of lista) upd.run(c.a, c.id);
});
aplicarTodos(cambios);
console.log(`\nAplicados ${cambios.length} cambios.`);
