import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Uso unico: marca la migracion baseline (0000_baseline_2026_07_14) como ya aplicada
// en una DB que ya tiene esas tablas/columnas, sin volver a correr sus CREATE TABLE
// (fallarian con "table already exists"). Despues de esto, `npm run migrate` solo
// aplica migraciones nuevas generadas con `npx drizzle-kit generate`.
const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

const TAG = '0000_baseline_2026_07_14';
const WHEN = 1784066805101; // debe calzar con drizzle/meta/_journal.json -> entries[0].when

const sql = readFileSync(`./drizzle/${TAG}.sql`, 'utf8');
const hash = createHash('sha256').update(sql).digest('hex');

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )
`);

const yaAplicada = sqlite
  .prepare('SELECT 1 FROM __drizzle_migrations WHERE hash = ?')
  .get(hash);

if (yaAplicada) {
  console.log(`Baseline ya estaba marcada en ${DB_PATH}, no hago nada.`);
} else {
  sqlite
    .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
    .run(hash, WHEN);
  console.log(`Baseline marcada como aplicada en ${DB_PATH} (hash ${hash.slice(0, 12)}...).`);
}

sqlite.close();
