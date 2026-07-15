import { eq } from 'drizzle-orm';
// dbReal: el layout de tu cockpit es config tuya, no negocio (ver auth.ts).
import { dbReal as dbSingleton } from './index';
import * as schema from './schema';

const { panelTablero } = schema;

type DbInstancia = typeof dbSingleton;

// Mismo patron que preferencias-repository.ts: leer/guardar la fila cruda, sin decidir
// defaults aca (esos viven en app/core/panel/tablero.ts, que es puro).
export function leerTablero(idUser: string, db: DbInstancia = dbSingleton) {
  return db.select().from(panelTablero).where(eq(panelTablero.idUser, idUser)).get();
}

export function guardarTablero(idUser: string, layout: string, db: DbInstancia = dbSingleton): void {
  const ahora = new Date().toISOString();
  db.insert(panelTablero)
    .values({ idUser, layout, updatedAt: ahora })
    .onConflictDoUpdate({ target: panelTablero.idUser, set: { layout, updatedAt: ahora } })
    .run();
}
