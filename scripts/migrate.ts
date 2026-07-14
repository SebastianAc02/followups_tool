import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

// Corre en cada deploy (ver .github/workflows/deploy.yml) antes de recrear los
// contenedores: aplica contra isps.db real cualquier migracion nueva generada con
// `npx drizzle-kit generate`. Sin este paso, un cambio de schema.ts pasaba el gate de
// CI (que corre contra ISPS_DB_PATH=:memory:, siempre en sync) pero reventaba en
// produccion al primer query real -- asi paso con empresa.pbx_forma el 2026-07-14.
const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: './drizzle' });
console.log(`Migraciones al dia contra ${DB_PATH}`);
sqlite.close();
