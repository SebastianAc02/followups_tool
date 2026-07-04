import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

// isps.db es la fuente de la verdad (un nivel arriba del proyecto).
const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export { schema };
