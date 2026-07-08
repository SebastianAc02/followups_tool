import { eq } from 'drizzle-orm';
import { db as dbSingleton } from './index';
import * as schema from './schema';
import type { PreferenciasParciales } from '../core/perfil';

const { preferenciaUsuario } = schema;

type DbInstancia = typeof dbSingleton;

// Fila cruda (columnas nullable, tal cual quedan en preferencia_usuario). El adapter
// (app/adapters/preferencias-db.ts) es quien aplica PREFERENCIAS_DEFAULT sobre esto;
// aca no se decide ningun default, solo se lee/escribe la tabla.
export function leerPreferencia(idUser: string, db: DbInstancia = dbSingleton) {
  return db.select().from(preferenciaUsuario).where(eq(preferenciaUsuario.idUser, idUser)).get();
}

// Upsert parcial: si no habia fila, la crea con solo los campos que llegan en `cambios`
// (el resto queda NULL, el adapter cae al default). Si ya habia fila, solo pisa los
// campos presentes en `cambios` -- guardar el color no debe borrar la vista de inicio.
export function guardarPreferencia(
  idUser: string,
  cambios: PreferenciasParciales,
  db: DbInstancia = dbSingleton,
): void {
  const ahora = new Date().toISOString();
  db.insert(preferenciaUsuario)
    .values({ idUser, ...cambios, updatedAt: ahora })
    .onConflictDoUpdate({ target: preferenciaUsuario.idUser, set: { ...cambios, updatedAt: ahora } })
    .run();
}
