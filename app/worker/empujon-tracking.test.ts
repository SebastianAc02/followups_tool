// El poll de tracking colgado del boton "Siguiente dia" (2026-08-03).
//
// El hueco que cierra: el worker es ciego al modo prueba y eso es correcto por diseño (default
// a base real, ver app/lib/modo-prueba.ts). Pero el poll de tracking es el UNICO camino que
// detecta una respuesta POR CORREO -- el de WhatsApp entra por webhook, que si rutea. O sea que
// en modo prueba se podia contestar el correo de la demo y la cadencia seguia escribiendo, para
// siempre. La salida es correrlo dentro del request del boton, que si tiene el modo declarado.
//
// Lo que estos tests fijan es el CONTRATO, que es lo que se puede romper sin darse cuenta:
// apagado por default (los tres llamadores de produccion no cambian) y aislado (un poll caido
// no puede tumbar el avance del dia).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
// Sin credenciales de Apollo: el poll de una campana con secuencia falla, que es justo el
// escenario que interesa (un poll roto no puede robarle el empujon al operador).
delete process.env.APOLLO_API_KEY;

const { materializarYEmpujarAhora } = await import('./index.ts');

// Una campana con proveedor_campana_id es lo que hace que el poll tenga algo que consultar
// (campanasConSecuencia filtra por esa columna). Sin esto el poll contesta 'ok' sin tocar red
// y los dos casos serian indistinguibles.
{
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO campana (nombre, id_cadencia, id_segmento, id_organizacion, proveedor_campana_id, estado)
     VALUES ('Campana con secuencia', 1, 1, 1, 'apollo-seq-1', 'activa')`,
  ).run();
  db.close();
}

// Captura de los logs del empujon: es el observable de si el poll corrio o no. No hay estado en
// la base que lo delate cuando el poll falla, y meter una inyeccion de dependencia solo para el
// test complicaria el camino caliente por un caller que no es suyo.
async function correr(opciones?: { conTracking?: boolean }): Promise<string[]> {
  const capturado: string[] = [];
  const error = console.error;
  const warn = console.warn;
  const log = console.log;
  console.error = (...a: unknown[]) => capturado.push(String(a[0]));
  console.warn = (...a: unknown[]) => capturado.push(String(a[0]));
  console.log = () => {};
  try {
    await materializarYEmpujarAhora(opciones);
  } finally {
    console.error = error;
    console.warn = warn;
    console.log = log;
  }
  return capturado;
}

// El default protege produccion: lanzarCampanaAction y la tool lanzar_campana llaman a esta
// funcion sin argumentos, y el poll recorre TODAS las campanas con secuencia, no solo la que se
// acaba de lanzar. Prenderlo para ellos les meteria una consulta por campana dentro de un
// request que hoy es corto, sin que nadie lo hubiera pedido.
test('sin opciones NO corre el poll de tracking (default apagado, produccion no cambia)', async () => {
  const logs = await correr();
  assert.equal(
    logs.filter((l) => l.includes('[empujon-manual]')).length,
    0,
    'el empujon de "Lanzar hoy" no debe arrastrar un poll de todas las campanas',
  );
});

test('con conTracking el poll SI corre', async () => {
  const logs = await correr({ conTracking: true });
  assert.ok(
    logs.some((l) => l.includes('[empujon-manual]')),
    'el boton "Siguiente dia" tiene que intentar leer respuestas antes de mandar lo del dia',
  );
});

// Aislamiento: el operador apreto el boton para mover la cadencia. Que la lectura de respuestas
// falle no puede dejarlo sin avanzar el dia ni reventarle la pantalla.
test('un poll de tracking caido no tumba el empujon', async () => {
  await assert.doesNotReject(materializarYEmpujarAhora({ conTracking: true }));
});
