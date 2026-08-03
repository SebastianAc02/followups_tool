import { eq } from 'drizzle-orm';
import { dbReal, dbPruebas } from './index';
import { campana } from './schema';

// A que base pertenece un evento de tracking de correo (pixel de apertura, clic).
//
// GEMELO EXACTO de esLineaDePruebas (ver ruteo-linea.ts, ahi esta el razonamiento largo).
// El problema es el mismo y la salida es la misma: el pixel y el clic entran SIN sesion --
// los pide el cliente de correo del destinatario, no un navegador logueado -- asi que no
// traen la cookie de modo prueba, requireSession nunca corre y esModoPrueba() da false.
//
// Consecuencia medida el 2026-08-03, con el modo prueba llevando tres semanas en produccion:
// `pruebas.db` tiene UNA fila en evento_tracking y es 'ev-1', o sea sembrada a mano. Cero
// aperturas reales en toda la vida de la base. No es que el pixel fallara: llegaba, se
// correlacionaba contra isps.db, no encontraba al destinatario de prueba (no existe ahi) y
// el evento se tiraba a la basura sin log. Un modo prueba que no puede medir una apertura no
// sirve para probar una campana, que es exactamente para lo que existe.
//
// Aca la base la decide el DATO: el pixel viaja con `?c=<proveedor_campana_id>`, y esa
// campana existe en una base o en la otra.
//
// LA REGLA NO ES SIMETRICA, Y ESA ES LA DECISION (copiada tal cual de ruteo-linea.ts): es de
// prueba solo si el id esta en pruebas.db y NO esta en la real. Ante la duda gana la real,
// porque los dos errores no cuestan lo mismo. Un evento de prueba en la base real ensucia una
// metrica (molesto, recuperable). Una apertura de un ISP real escrita en pruebas.db se pierde
// para siempre del lado que importa: el operador lee "no lo abrio" sobre alguien que si lo
// abrio, y decide el siguiente toque con eso.
//
// El riesgo de colision es REAL y por eso la asimetria importa aca todavia mas que en las
// lineas: para Gmail el correlator es sintetico, `gmail-camp-<id_campana>`
// (app/campanas/[id]/lanzar/actions.ts), y las dos bases tienen su propia secuencia de
// id_campana. Hoy no chocan (medido el 2026-08-03: pruebas.db usa gmail-camp-4..7 e isps.db
// no tiene ninguno con ese prefijo, sus campanas van de la 38 en adelante), pero nada impide
// que choquen manana. Cuando choquen, esta funcion contesta false y el evento se va a la
// real: se pierde una senal de prueba, no se inventa una senal en produccion.
export function esCampanaDePruebas(proveedorCampanaId: string): boolean {
  if (!proveedorCampanaId) return false;

  const enPruebas = dbPruebas
    .select({ id: campana.idCampana })
    .from(campana)
    .where(eq(campana.proveedorCampanaId, proveedorCampanaId))
    .get();
  if (!enPruebas) return false;

  const enReal = dbReal
    .select({ id: campana.idCampana })
    .from(campana)
    .where(eq(campana.proveedorCampanaId, proveedorCampanaId))
    .get();
  return !enReal;
}
