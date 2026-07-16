import { eq } from 'drizzle-orm';
import { dbReal, dbPruebas } from './index';
import { lineaWhatsapp } from './schema';

// A que base pertenece un webhook entrante de WhatsApp.
//
// El resto de la app resuelve el modo prueba por REQUEST (cookie -> requireSession -> ALS,
// ver app/lib/modo-prueba.ts). El webhook de Evolution no puede: entra sin sesion y sin
// cookie, asi que esModoPrueba() siempre daba false y TODO mensaje entrante caia en
// isps.db -- incluso el de una linea de prueba. Mientras tanto el boton "Ya me escribio,
// verificar" (que si tiene sesion) lo buscaba en pruebas.db. Nunca se encontraban: medido
// el 2026-07-15, 101 mensajes en la real y 0 en la de prueba.
//
// Aca la base la decide el DATO, no una cookie: el payload trae la instancia
// ('wa-12368895214') y esa linea vive en una base o en la otra. Es el unico lugar del
// codigo que consulta las dos conexiones a proposito -- por eso vive aparte del Repository
// y no pasa por el Proxy de `db` (que es justo lo que estamos resolviendo, no algo que
// podamos usar).
//
// LA REGLA NO ES SIMETRICA, Y ESA ES LA DECISION: es de prueba solo si la instancia esta
// en pruebas.db y NO esta en la real. Ante la duda gana la real, porque los dos errores no
// cuestan lo mismo -- un mensaje de prueba en la base real ensucia datos (molesto,
// recuperable), pero la respuesta de un ISP real ruteada a pruebas.db deja su cadencia sin
// cortar y le seguimos escribiendo a quien ya contesto. Ese es el daño que el sistema
// entero existe para evitar ("antes que una linea sorda, ninguna", evolution.ts).
export function esLineaDePruebas(referenciaProveedor: string): boolean {
  if (!referenciaProveedor) return false;

  const enPruebas = dbPruebas
    .select({ id: lineaWhatsapp.id })
    .from(lineaWhatsapp)
    .where(eq(lineaWhatsapp.referenciaProveedor, referenciaProveedor))
    .get();
  if (!enPruebas) return false;

  const enReal = dbReal
    .select({ id: lineaWhatsapp.id })
    .from(lineaWhatsapp)
    .where(eq(lineaWhatsapp.referenciaProveedor, referenciaProveedor))
    .get();
  return !enReal;
}
