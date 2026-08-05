// El lector que alimenta las metricas de canal del panel del CRO (2026-08-05).
//
// Lo unico que este archivo tiene que garantizar, y que no es obvio: `esPrimerToqueDeLaCuenta` se
// decide contra TODA la historia de la cuenta, no contra el rango que se esta mirando. Una cuenta
// que se toco por primera vez en junio no vuelve a ser "cuenta nueva" porque el reporte arranque en
// agosto. Si se calculara dentro del rango, el numero de llamadas a cuentas nuevas subiria solo por
// mover la fecha de inicio del reporte, que es la forma mas facil de mentirse a uno mismo.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { toquesParaActividadCanal } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, owner = 'Sebastian Acosta Molina') {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1, ?)`,
  ).run(id, id, id, owner);
  db.close();
}

function seedToque(idEmpresa: string, dia: string, canal = 'llamada', fuente = 'cockpit', resultado: string | null = 'no_contesto') {
  const db = raw();
  db.prepare(
    `INSERT INTO toque (id_empresa, fecha, fecha_dia, canal, resultado, fuente, id_organizacion)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(idEmpresa, `${dia}T12:00:00.000Z`, dia, canal, resultado, fuente);
  db.close();
}

test('la primera llamada de una cuenta viene marcada como primer toque', () => {
  seedEmpresa('ac-nueva');
  seedToque('ac-nueva', '2026-08-03');

  const filas = toquesParaActividadCanal('2026-08-01', '2026-08-05', 1);
  const fila = filas.find((f) => f.idEmpresa === 'ac-nueva');

  assert.equal(fila?.esPrimerToqueDeLaCuenta, true);
});

// El caso que justifica el archivo. La cuenta se abrio en junio; una llamada de agosto NO la vuelve
// nueva por mirar solo agosto.
test('una cuenta tocada antes del rango no es cuenta nueva, aunque el rango no vea su primer toque', () => {
  seedEmpresa('ac-vieja');
  seedToque('ac-vieja', '2026-06-10');
  seedToque('ac-vieja', '2026-08-03');

  const filas = toquesParaActividadCanal('2026-08-01', '2026-08-05', 1);
  const enRango = filas.filter((f) => f.idEmpresa === 'ac-vieja');

  assert.equal(enRango.length, 1, 'solo el toque de agosto entra al rango');
  assert.equal(enRango[0].esPrimerToqueDeLaCuenta, false, 'su primer toque fue en junio y sigue siendo el de junio');
});

// Un entrante no abre la cuenta: no lo hicimos nosotros. Si contara como primer toque, una cuenta que
// nos escribio sola quedaria marcada como trabajada y la siguiente llamada real dejaria de ser la
// primera.
test('un mensaje entrante no cuenta como el primer toque de la cuenta', () => {
  seedEmpresa('ac-entrante');
  seedToque('ac-entrante', '2026-08-01', 'whatsapp', 'whatsapp_entrante', null);
  seedToque('ac-entrante', '2026-08-04', 'llamada');

  const filas = toquesParaActividadCanal('2026-08-01', '2026-08-05', 1);
  const llamada = filas.find((f) => f.idEmpresa === 'ac-entrante' && f.canal === 'llamada');

  assert.equal(llamada?.esPrimerToqueDeLaCuenta, true, 'la llamada sigue siendo el primer toque nuestro');
});

// Los entrantes SI viajan en la lectura: el nucleo los necesita para saber que una conversacion sigue
// viva. Lo que no hacen es contar como actividad.
test('los entrantes viajan en la lectura aunque no cuenten como actividad', () => {
  const filas = toquesParaActividadCanal('2026-08-01', '2026-08-05', 1);
  const entrantes = filas.filter((f) => f.fuente === 'whatsapp_entrante');

  assert.equal(entrantes.length, 1);
  assert.equal(entrantes[0].esPrimerToqueDeLaCuenta, false, 'un entrante nunca se marca como primer toque nuestro');
});

test('el filtro por owner solo trae las cuentas de esa persona', () => {
  seedEmpresa('ac-felipe', 'Felipe Castro');
  seedToque('ac-felipe', '2026-08-02');

  const mias = toquesParaActividadCanal('2026-08-01', '2026-08-05', 1, { owner: 'Sebastian Acosta Molina' });
  assert.equal(mias.some((f) => f.idEmpresa === 'ac-felipe'), false);

  const suyas = toquesParaActividadCanal('2026-08-01', '2026-08-05', 1, { owner: 'Felipe Castro' });
  assert.equal(suyas.some((f) => f.idEmpresa === 'ac-felipe'), true);
});

// El caso de "aislar hoy": un rango de un solo dia tiene que devolver ese dia y nada mas.
test('un rango de un solo dia devuelve solo ese dia', () => {
  const soloEl3 = toquesParaActividadCanal('2026-08-03', '2026-08-03', 1);

  assert.equal(soloEl3.length, 2, 'las dos cuentas tocadas el 3, y ninguna mas');
  assert.equal(soloEl3.every((f) => f.fechaDia === '2026-08-03'), true);
});
