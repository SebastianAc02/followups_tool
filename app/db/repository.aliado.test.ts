// empresa.aliado: de quien es la cuenta, cuando no es nuestra (propuesta de tandas, 2026-08-04).
//
// El campo existe por dos cuentas concretas. Fiesta Telecomunicaciones y Tunortetv pasaron el
// filtro de aliados el 4-ago porque su campo estaba vacio y el vacio se leyo como "no es aliado".
// Las dos son de SAE Plus. La lista de llamadas salio mal y hubo que rehacerla entera.
//
// De ahi la regla dura que fija este archivo: LA AUSENCIA DE DATO NUNCA SE LEE COMO DATO
// NEGATIVO. Por eso el vocabulario separa dos silencios que parecen el mismo:
//   ninguno_verificado - alguien miro y esta cuenta no es de ningun aliado. Es un dato.
//   sin_verificar      - nadie miro. NO es un dato, es la falta de uno.
// Un campo vacio en la base significa el segundo, jamas el primero, y la lectura lo dice con
// advertencia en vez de dejar que quien lea saque la conclusion facil.
//
// Y todo lo que la clasificacion devuelva viaja con su evidencia (campo, valor, fuente, fecha,
// quien). Sin eso la lista no se puede auditar y toca rehacerla a mano, que es el problema que
// todo esto viene a resolver.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { clasificarAliado, marcarAliado } = await import('./repository.ts');
const { ALIADOS, ADVERTENCIA_SIN_VERIFICAR } = await import('./validation.ts');

function seedEmpresa(id: string, opts: { matriz?: string } = {}) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id, id_empresa_matriz)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1, ?)`,
  ).run(id, id, id, opts.matriz ?? null);
  db.close();
}

test('el vocabulario separa los tres aliados de los dos silencios', () => {
  assert.deepEqual([...ALIADOS], ['sae_plus', 'ultimo_kilometro', 'integrapay', 'ninguno_verificado', 'sin_verificar']);
});

// El fallo del 4-ago, convertido en prueba. Una cuenta que nadie miro NO puede salir como limpia.
test('una cuenta con el campo vacio sale sin_verificar y con advertencia, nunca como propia', () => {
  seedEmpresa('al-vacia');

  const c = clasificarAliado('al-vacia', 1);

  assert.equal(c.aliado, 'sin_verificar');
  assert.equal(c.verificado, false);
  assert.equal(c.advertencia, ADVERTENCIA_SIN_VERIFICAR);
  assert.notEqual(c.aliado, 'ninguno_verificado', 'el vacio NO es "alguien miro y no es aliado"');
});

// Los dos silencios producen filas identicas en la base si uno se guarda como NULL y el otro
// tambien. Lo que los distingue es que uno tiene procedencia y el otro no.
test('ninguno_verificado y sin_verificar se distinguen por la evidencia, no solo por el nombre', () => {
  seedEmpresa('al-mirada');
  marcarAliado(
    { idEmpresa: 'al-mirada', aliado: 'ninguno_verificado', fuente: 'notion', quien: 'Sebastian Acosta Molina' },
    1,
  );

  const mirada = clasificarAliado('al-mirada', 1);
  const nunca = clasificarAliado('al-vacia', 1);

  assert.equal(mirada.aliado, 'ninguno_verificado');
  assert.equal(mirada.verificado, true);
  assert.equal(mirada.advertencia, null);
  assert.equal(mirada.evidencia.quien, 'Sebastian Acosta Molina');
  assert.equal(mirada.evidencia.fuente, 'notion');

  assert.equal(nunca.evidencia.fuente, null, 'un silencio no verificado no puede traer procedencia');
  assert.equal(nunca.evidencia.quien, null);
});

test('marcarAliado escribe con procedencia completa y la devuelve releida', () => {
  seedEmpresa('al-jasz');

  const r = marcarAliado(
    { idEmpresa: 'al-jasz', aliado: 'ultimo_kilometro', fuente: 'operador', quien: 'Sebastian Acosta Molina' },
    1,
  );

  assert.equal(r.clasificacion.aliado, 'ultimo_kilometro');
  assert.deepEqual(
    { campo: r.clasificacion.evidencia.campo, valor: r.clasificacion.evidencia.valor, fuente: r.clasificacion.evidencia.fuente, quien: r.clasificacion.evidencia.quien },
    { campo: 'aliado', valor: 'ultimo_kilometro', fuente: 'operador', quien: 'Sebastian Acosta Molina' },
  );
  assert.match(r.clasificacion.evidencia.fecha ?? '', /^\d{4}-\d{2}-\d{2}$/);
});

// Regla 5 del brain: dato sensible entra con fuente y fecha o no entra. Un aliado sin procedencia
// es exactamente el dato que despues nadie puede auditar, y esta columna nace de un error de
// auditoria.
// El caso completo primero, para que este test no pueda pasar en verde solo porque la funcion
// todavia no existe: un assert.throws se traga igual de bien un "falta la fuente" que un
// "marcarAliado is not a function", y los dos se ven identicos en la salida.
test('un aliado sin quien lo dijo no entra', () => {
  seedEmpresa('al-sin-fuente');
  marcarAliado({ idEmpresa: 'al-sin-fuente', aliado: 'sae_plus', fuente: 'notion', quien: 'Sebastian Acosta Molina' }, 1);

  assert.throws(() => marcarAliado({ idEmpresa: 'al-sin-fuente', aliado: 'sae_plus', fuente: 'notion' } as never, 1));
  assert.throws(() => marcarAliado({ idEmpresa: 'al-sin-fuente', aliado: 'sae_plus', quien: 'Sebastian Acosta Molina' } as never, 1));
});

test('un valor fuera del vocabulario no entra', () => {
  seedEmpresa('al-mala');
  marcarAliado({ idEmpresa: 'al-mala', aliado: 'sae_plus', fuente: 'notion', quien: 'Sebastian Acosta Molina' }, 1);

  assert.throws(() =>
    marcarAliado({ idEmpresa: 'al-mala', aliado: 'wispro', fuente: 'notion', quien: 'Sebastian Acosta Molina' } as never, 1),
  );
});

// "El aliado se hereda hacia adelante: marcada una cuenta, las que operan bajo el mismo NIT o
// grupo quedan marcadas". El grupo ya esta modelado en id_empresa_matriz (dos filas vivas, misma
// empresa matriz, deals separados).
test('el aliado se hereda del grupo, y la evidencia dice de cual cuenta salio', () => {
  seedEmpresa('al-matriz');
  seedEmpresa('al-hermana-marcada', { matriz: 'al-matriz' });
  seedEmpresa('al-hermana-muda', { matriz: 'al-matriz' });
  marcarAliado(
    { idEmpresa: 'al-hermana-marcada', aliado: 'sae_plus', fuente: 'operador', quien: 'Sebastian Acosta Molina' },
    1,
  );

  const c = clasificarAliado('al-hermana-muda', 1);

  assert.equal(c.aliado, 'sae_plus');
  assert.equal(c.heredadoDe, 'al-hermana-marcada');
  assert.equal(c.evidencia.quien, 'Sebastian Acosta Molina', 'la evidencia heredada es la de quien si lo dijo');
});

// La herencia es una LECTURA. Escribirla dejaria un dato que nadie afirmo sobre esa cuenta, y al
// dia siguiente nadie podria distinguirlo de uno verificado.
test('heredar no escribe: la columna de la cuenta que hereda sigue vacia', () => {
  clasificarAliado('al-hermana-muda', 1);

  const db = new Database(dbPath);
  const fila = db.prepare('SELECT aliado, aliado_quien FROM empresa WHERE id_empresa = ?').get('al-hermana-muda') as {
    aliado: string | null;
    aliado_quien: string | null;
  };
  db.close();

  assert.deepEqual(fila, { aliado: null, aliado_quien: null });
});

// La herencia propaga lo que alguien dijo, no rellena huecos. Un grupo entero sin verificar sigue
// sin verificar: si heredara "ninguno" se estaria fabricando el dato negativo que la regla prohibe.
test('un grupo donde nadie miro sigue sin_verificar, no hereda un "no es aliado"', () => {
  seedEmpresa('al-matriz-muda');
  seedEmpresa('al-muda-a', { matriz: 'al-matriz-muda' });
  seedEmpresa('al-muda-b', { matriz: 'al-matriz-muda' });
  marcarAliado(
    { idEmpresa: 'al-muda-a', aliado: 'ninguno_verificado', fuente: 'notion', quien: 'Sebastian Acosta Molina' },
    1,
  );

  const c = clasificarAliado('al-muda-b', 1);

  assert.equal(c.aliado, 'sin_verificar', 'un "no es aliado" de la hermana no dice nada de esta cuenta');
  assert.equal(c.heredadoDe, null);
});

// Lo dicho SOBRE LA CUENTA pesa mas que lo dicho sobre el grupo: una filial puede haberse movido
// de aliado sin que el grupo entero lo haga.
test('el aliado propio le gana al heredado', () => {
  seedEmpresa('al-propia', { matriz: 'al-matriz' });
  marcarAliado({ idEmpresa: 'al-propia', aliado: 'integrapay', fuente: 'operador', quien: 'Sebastian Acosta Molina' }, 1);

  const c = clasificarAliado('al-propia', 1);

  assert.equal(c.aliado, 'integrapay');
  assert.equal(c.heredadoDe, null);
});
