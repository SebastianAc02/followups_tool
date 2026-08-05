// canal_estado: si un canal de una cuenta (llamada, whatsapp, correo, reunion) esta vivo, muerto,
// o nadie lo verifico. Existe por Intel Go: cuatro toques marcando la misma linea fuera de
// servicio, porque no habia donde escribir que ese numero estaba muerto, asi que la cuenta
// seguia saliendo en la lista de llamadas y se gastaban toques contra un tono de error.
//
// LA REGLA DURA que fija este archivo, la misma que ya rige empresa.aliado: LA AUSENCIA DE DATO
// NUNCA SE LEE COMO DATO NEGATIVO. Un canal sin fila NO es 'vivo'. Es 'sin_dato', que es
// distinto: 'vivo' significa que alguien verifico que el numero funciona, 'sin_dato' que nadie lo
// verifico. La primera prueba de este archivo fija exactamente eso, y va primero a proposito.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { marcarCanal, estadoDeCanal, estadosDeCanales, ESTADOS_CANAL_ESCRIBIBLES } = await import('./canal-estado.ts');

function seedEmpresa(id: string) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1)`,
  ).run(id, id, id);
  db.close();
}

// LA PRUEBA MAS IMPORTANTE DEL ARCHIVO, primero. Un canal sobre el que nadie escribio nunca
// tiene que leerse sin_dato, con evidencia vacia (fuente/quien null), y jamas inventar 'vivo'.
test('un canal sin fila sale sin_dato, con evidencia vacia, nunca vivo', () => {
  seedEmpresa('ce-muda');

  const c = estadoDeCanal('ce-muda', 'llamada', 1);

  assert.equal(c.estado, 'sin_dato');
  assert.notEqual(c.estado, 'vivo', 'la ausencia de dato jamas se lee como vivo');
  assert.deepEqual(c.evidencia, { campo: 'estado', valor: null, fuente: null, fecha: null, quien: null });
});

// El caso valido primero, en el mismo test, antes del assert.throws de mas abajo: un
// assert.throws pasa en verde igual de bien porque falta la fuente que porque marcarCanal
// todavia no existe, y las dos salidas se ven identicas. Se prueba que el caso valido SI escribe
// antes de probar que el invalido no.
test('marcarCanal exige fuente y quien: el caso valido escribe, y sin uno de los dos falla', () => {
  seedEmpresa('ce-intel-go');

  const r = marcarCanal(
    { idEmpresa: 'ce-intel-go', canal: 'llamada', estado: 'muerto', fuente: 'operador', quien: 'Sebastian Acosta Molina' },
    1,
  );

  assert.equal(r.clasificacion.estado, 'muerto');
  assert.equal(r.clasificacion.evidencia.fuente, 'operador');
  assert.equal(r.clasificacion.evidencia.quien, 'Sebastian Acosta Molina');

  assert.throws(() =>
    marcarCanal({ idEmpresa: 'ce-intel-go', canal: 'llamada', estado: 'muerto', fuente: 'operador' } as never, 1),
  );
  assert.throws(() =>
    marcarCanal({ idEmpresa: 'ce-intel-go', canal: 'llamada', estado: 'muerto', quien: 'Sebastian Acosta Molina' } as never, 1),
  );
});

test('marcarCanal devuelve lo escrito RELEIDO, no un ok', () => {
  seedEmpresa('ce-releido');

  const r = marcarCanal(
    { idEmpresa: 'ce-releido', canal: 'whatsapp', estado: 'vivo', fuente: 'notion', quien: 'Sebastian Acosta Molina', nota: 'confirmado por el ISP' },
    1,
  );

  // La relectura sale de la base, no del input devuelto tal cual: se verifica leyendo la fila
  // cruda con SQL directo, sin pasar por el mismo camino que acaba de escribir.
  const db = new Database(dbPath);
  const fila = db
    .prepare('SELECT estado, fuente, quien, nota, fecha FROM canal_estado WHERE id_empresa = ? AND canal = ?')
    .get('ce-releido', 'whatsapp') as { estado: string; fuente: string; quien: string; nota: string; fecha: string };
  db.close();

  assert.equal(fila.estado, 'vivo');
  assert.equal(fila.fuente, 'notion');
  assert.equal(fila.quien, 'Sebastian Acosta Molina');
  assert.equal(fila.nota, 'confirmado por el ISP');
  assert.equal(r.clasificacion.evidencia.valor, 'vivo');
  assert.match(fila.fecha, /^\d{4}-\d{2}-\d{2}$/);
});

// Upsert sobre el indice unico: marcar el mismo canal otra vez actualiza la fila, no la duplica.
// Es la version escrita de "un canal tiene UN estado, no un historial de opiniones simultaneas".
test('marcar el mismo canal dos veces actualiza, no duplica', () => {
  seedEmpresa('ce-upsert');
  marcarCanal({ idEmpresa: 'ce-upsert', canal: 'correo', estado: 'vivo', fuente: 'operador', quien: 'Sebastian Acosta Molina' }, 1);
  marcarCanal({ idEmpresa: 'ce-upsert', canal: 'correo', estado: 'muerto', fuente: 'operador', quien: 'Sebastian Acosta Molina' }, 1);

  const db = new Database(dbPath);
  const filas = db.prepare('SELECT estado FROM canal_estado WHERE id_empresa = ? AND canal = ?').all('ce-upsert', 'correo') as { estado: string }[];
  db.close();

  assert.equal(filas.length, 1);
  assert.equal(filas[0].estado, 'muerto');
});

// Dos canales de la misma cuenta son dos filas independientes: marcar llamada muerta no toca
// whatsapp, que sigue sin dato.
test('canales distintos de la misma cuenta no se pisan entre si', () => {
  seedEmpresa('ce-dos-canales');
  marcarCanal({ idEmpresa: 'ce-dos-canales', canal: 'llamada', estado: 'muerto', fuente: 'operador', quien: 'Sebastian Acosta Molina' }, 1);

  const llamada = estadoDeCanal('ce-dos-canales', 'llamada', 1);
  const whatsapp = estadoDeCanal('ce-dos-canales', 'whatsapp', 1);

  assert.equal(llamada.estado, 'muerto');
  assert.equal(whatsapp.estado, 'sin_dato');
});

// sin_dato NUNCA se puede escribir: solo existe como lectura de la ausencia. Si se pudiera
// escribir, "alguien marco explicitamente que nadie verifico" seria una contradiccion que
// ademas se confundiria en la base con la fila que de verdad no existe.
test('sin_dato no es un estado escribible', () => {
  assert.deepEqual([...ESTADOS_CANAL_ESCRIBIBLES], ['vivo', 'muerto']);
  seedEmpresa('ce-sin-dato-input');

  assert.throws(() =>
    marcarCanal({ idEmpresa: 'ce-sin-dato-input', canal: 'llamada', estado: 'sin_dato', fuente: 'operador', quien: 'Sebastian Acosta Molina' } as never, 1),
  );
});

test('un canal fuera del vocabulario de CANALES_TOQUE no entra', () => {
  seedEmpresa('ce-canal-malo');
  assert.throws(() =>
    marcarCanal({ idEmpresa: 'ce-canal-malo', canal: 'telegram', estado: 'vivo', fuente: 'operador', quien: 'Sebastian Acosta Molina' } as never, 1),
  );
});

// estadosDeCanales: UNA sola query sobre N empresas, no una por cuenta (el uso real es sobre
// ~476 cuentas y no se puede pagar una query cada una).
test('estadosDeCanales trae varias empresas en una sola query', () => {
  seedEmpresa('ce-batch-a');
  seedEmpresa('ce-batch-b');
  seedEmpresa('ce-batch-c');
  marcarCanal({ idEmpresa: 'ce-batch-a', canal: 'llamada', estado: 'muerto', fuente: 'operador', quien: 'Sebastian Acosta Molina' }, 1);
  marcarCanal({ idEmpresa: 'ce-batch-b', canal: 'whatsapp', estado: 'vivo', fuente: 'operador', quien: 'Sebastian Acosta Molina' }, 1);
  // ce-batch-c no tiene ninguna fila: tiene que salir sin_dato para cualquier canal preguntado,
  // igual que estadoDeCanal.

  const mapa = estadosDeCanales(['ce-batch-a', 'ce-batch-b', 'ce-batch-c'], 1);

  assert.equal(mapa.get('ce-batch-a')?.get('llamada')?.estado, 'muerto');
  assert.equal(mapa.get('ce-batch-b')?.get('whatsapp')?.estado, 'vivo');
  // La ausencia en el mapa (empresa sin filas, o canal sin fila dentro de una empresa que si
  // tiene otras) significa sin_dato, exactamente como en estadoDeCanal: el mapa solo contiene
  // filas reales, nunca fabrica una entrada 'sin_dato' explicita.
  assert.equal(mapa.get('ce-batch-c'), undefined);
  assert.equal(mapa.get('ce-batch-a')?.get('whatsapp'), undefined);
});

test('estadosDeCanales con lista vacia devuelve mapa vacio sin consultar', () => {
  const mapa = estadosDeCanales([], 1);
  assert.equal(mapa.size, 0);
});

// Multi-organizacion: el mismo id_empresa en otra organizacion no cuenta como el mismo canal.
test('el estado de un canal no cruza organizaciones', () => {
  seedEmpresa('ce-org');
  marcarCanal({ idEmpresa: 'ce-org', canal: 'llamada', estado: 'muerto', fuente: 'operador', quien: 'Sebastian Acosta Molina' }, 1);

  const otraOrg = estadoDeCanal('ce-org', 'llamada', 2);

  assert.equal(otraOrg.estado, 'sin_dato');
});
