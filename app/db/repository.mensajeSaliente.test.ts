// Guardar el WhatsApp que SALE, y marcar cual de esos mensajes abrio la conversacion de una
// cuenta (2026-07-26). Lo que no se puede probar con deps falsos y por eso se prueba aca: el
// UNIQUE real de mensaje_id contra un reintento del webhook, el calculo de es_apertura contra
// las filas que ya existen, y que el saliente no se cuele por las consultas que hasta hoy solo
// podian ver entrantes.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  guardarMensajeEntrante,
  guardarMensajeSaliente,
  aperturasWhatsapp,
  mensajeWhatsappMasRecienteDesde,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresaConContactos(idEmpresa: string, nombre: string, contactos: string[]) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 1)`,
  ).run(idEmpresa, nombre, nombre.toLowerCase());
  // Solo el primero es principal: uq_contacto_principal es un UNIQUE parcial por empresa
  // (WHERE es_principal = 1), asi que dos principales de la misma cuenta no entran.
  contactos.forEach((c, i) => {
    db.prepare(
      `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, fuente)
       VALUES (?, ?, 0, ?, ?, 'seed')`,
    ).run(idEmpresa, c, i === 0 ? 1 : 0, `+57 300 000 ${c.length}${idEmpresa.length}`);
  });
  db.close();
}

function idsContacto(idEmpresa: string): number[] {
  const db = raw();
  const filas = db.prepare(`SELECT id_contacto FROM contacto WHERE id_empresa = ? ORDER BY id_contacto`).all(idEmpresa) as {
    id_contacto: number;
  }[];
  db.close();
  return filas.map((f) => f.id_contacto);
}

function fila(mensajeId: string) {
  const db = raw();
  const f = db.prepare(`SELECT direccion, es_apertura, texto, id_contacto FROM mensaje_whatsapp WHERE mensaje_id = ?`).get(mensajeId) as
    | { direccion: string; es_apertura: number; texto: string; id_contacto: number | null }
    | undefined;
  db.close();
  return f;
}

seedEmpresaConContactos('emp-ap-1', 'Fibra Uno', ['Ana', 'Beto']);
seedEmpresaConContactos('emp-ap-2', 'Fibra Dos', ['Caro']);
seedEmpresaConContactos('emp-ap-3', 'Fibra Tres', ['Dani']);

const salienteBase = { referenciaProveedor: 'linea-1', telefono: '573000000001' };

test('guarda el saliente con direccion saliente, sin tocar el camino del entrante', () => {
  const [ana] = idsContacto('emp-ap-1');
  const r = guardarMensajeSaliente({ ...salienteBase, texto: 'Hola Ana, te escribo de OnePay', mensajeId: 'out-1', fecha: '2026-07-27T09:00:00.000Z' }, ana);
  assert.equal(r, 'insertado');
  assert.equal(fila('out-1')?.direccion, 'saliente');

  guardarMensajeEntrante({ ...salienteBase, texto: 'Cuentame', mensajeId: 'in-1', fecha: '2026-07-27T09:30:00.000Z' }, ana);
  assert.equal(fila('in-1')?.direccion, 'entrante');
});

// El webhook de Evolution reintenta. Sin esto, un reintento duplicaria el mensaje de apertura
// y el conteo de "cuantas cuentas abri el lunes" quedaria inflado por la red, no por el trabajo.
test('un reintento del webhook con el mismo mensaje_id no duplica la fila', () => {
  const [ana] = idsContacto('emp-ap-1');
  const r = guardarMensajeSaliente({ ...salienteBase, texto: 'Hola Ana, te escribo de OnePay', mensajeId: 'out-1', fecha: '2026-07-27T09:00:00.000Z' }, ana);
  assert.equal(r, 'duplicado');

  const db = raw();
  const n = (db.prepare(`SELECT count(*) n FROM mensaje_whatsapp WHERE mensaje_id='out-1'`).get() as { n: number }).n;
  db.close();
  assert.equal(n, 1);
});

test('el primer saliente de una cuenta queda marcado apertura; el segundo no', () => {
  const [caro] = idsContacto('emp-ap-2');
  guardarMensajeSaliente({ ...salienteBase, texto: 'Apertura de Fibra Dos', mensajeId: 'out-2', fecha: '2026-07-27T09:05:00.000Z' }, caro);
  guardarMensajeSaliente({ ...salienteBase, texto: 'Te reitero', mensajeId: 'out-3', fecha: '2026-07-27T15:00:00.000Z' }, caro);

  assert.equal(fila('out-2')?.es_apertura, 1);
  assert.equal(fila('out-3')?.es_apertura, 0, 'un segundo mensaje no vuelve a abrir la conversacion');
});

// El hilo se mide por CUENTA y no por persona: escribirle al gerente despues de haberle
// escrito al tecnico de la misma cuenta es seguir la conversacion por otra puerta, no abrirla.
test('un saliente a otro contacto de una cuenta ya abierta no es apertura', () => {
  const [, beto] = idsContacto('emp-ap-1');
  guardarMensajeSaliente({ ...salienteBase, texto: 'Hola Beto', mensajeId: 'out-4', fecha: '2026-07-27T10:00:00.000Z' }, beto);
  assert.equal(fila('out-4')?.es_apertura, 0);
});

// PRIVACIDAD: la linea del operador es personal y de trabajo a la vez, asi que un saliente a
// un numero que no es contacto de ninguna cuenta NO se guarda. El filtro vive en el tipo:
// guardarMensajeSaliente exige un idContacto y no acepta null, asi que un caller que se
// olvide de filtrar no compila. Este test fija que la tabla no tenga NINGUN saliente huerfano,
// que es lo que habria que poder afirmar mirando produccion.
test('la tabla no acepta un saliente sin cuenta: no hay huerfanos', () => {
  const db = raw();
  const n = (db.prepare(`SELECT count(*) n FROM mensaje_whatsapp WHERE direccion='saliente' AND id_contacto IS NULL`).get() as { n: number })
    .n;
  db.close();
  assert.equal(n, 0);
});

// PRIVACIDAD del entrante (2026-07-26, decision del operador): la fila se escribe igual porque
// ES el mecanismo de idempotencia del webhook, pero sin texto y sin telefono. Un numero que no
// es contacto de ninguna cuenta es, por descarte, alguien de la vida privada del operador.
test('un entrante de un numero desconocido se registra sin texto y sin telefono', () => {
  const r = guardarMensajeEntrante(
    { ...salienteBase, telefono: '573999999999', texto: 'oye llegaste bien a la casa?', mensajeId: 'in-privado', fecha: '2026-07-27T22:00:00.000Z' },
    null,
  );
  assert.equal(r, 'insertado', 'la fila entra: sin ella cada reintento reprocesaria el mensaje');

  const f = fila('in-privado');
  assert.equal(f?.texto, null, 'el contenido no se guarda');
  assert.equal(f?.id_contacto, null);

  const db = raw();
  const tel = db.prepare(`SELECT telefono FROM mensaje_whatsapp WHERE mensaje_id='in-privado'`).get() as { telefono: string | null };
  db.close();
  assert.equal(tel.telefono, null, 'ni de quien venia');
});

// Contable sin ser identificable: se puede decir cuantos entraron de numeros desconocidos sin
// decir de quien ni que decian.
test('el entrante desconocido sigue siendo contable, solo que anonimo', () => {
  const db = raw();
  const n = (db.prepare(`SELECT count(*) n FROM mensaje_whatsapp WHERE direccion='entrante' AND id_contacto IS NULL`).get() as { n: number })
    .n;
  db.close();
  assert.ok(n >= 1, 'la fila existe y se puede contar');
});

// Un entrante de un contacto CONOCIDO si conserva su texto: es conversacion de trabajo.
test('un entrante de un contacto conocido conserva texto y telefono', () => {
  const [ana] = idsContacto('emp-ap-1');
  guardarMensajeEntrante({ ...salienteBase, texto: 'Mandame la propuesta', mensajeId: 'in-conocido', fecha: '2026-07-27T23:00:00.000Z' }, ana);
  assert.equal(fila('in-conocido')?.texto, 'Mandame la propuesta');
});

// Un entrante nunca abre nada: no lo redactamos nosotros. Y si el ISP escribio primero, el
// saliente que le responde tampoco es apertura, porque es reaccion, que es justo lo que la
// columna existe para separar.
test('si la cuenta escribio primero, la respuesta nuestra no es apertura', () => {
  const [dani] = idsContacto('emp-ap-3');
  guardarMensajeEntrante({ ...salienteBase, texto: 'Hola, me interesa', mensajeId: 'in-2', fecha: '2026-07-27T08:00:00.000Z' }, dani);
  guardarMensajeSaliente({ ...salienteBase, texto: 'Claro, te cuento', mensajeId: 'out-6', fecha: '2026-07-27T08:10:00.000Z' }, dani);

  assert.equal(fila('in-2')?.es_apertura, 0);
  assert.equal(fila('out-6')?.es_apertura, 0);
});

test('aperturasWhatsapp trae las aperturas juntas, en orden, con su cuenta', () => {
  const lista = aperturasWhatsapp();
  const textos = lista.map((a) => a.texto);
  assert.deepEqual(textos, ['Hola Ana, te escribo de OnePay', 'Apertura de Fibra Dos']);
  assert.equal(lista[0].empresa, 'Fibra Uno');
  assert.equal(lista[1].empresa, 'Fibra Dos');
});

// La mitad que convierte la lista en respuesta a "que copy mueve la conversacion": sin esto
// son textos sueltos que hay que cruzar a mano contra el hilo de cada cuenta.
test('aperturasWhatsapp dice cual cuenta contesto y cuando', () => {
  const lista = aperturasWhatsapp();
  const uno = lista.find((a) => a.empresa === 'Fibra Uno')!;
  const dos = lista.find((a) => a.empresa === 'Fibra Dos')!;

  assert.equal(uno.respondio, true);
  assert.equal(uno.fechaRespuesta, '2026-07-27T09:30:00.000Z');
  assert.equal(dos.respondio, false, 'Fibra Dos nunca contesto');
  assert.equal(dos.fechaRespuesta, null);
});

test('aperturasWhatsapp filtra por dia, inclusive en los dos extremos', () => {
  assert.equal(aperturasWhatsapp({ desde: '2026-07-27', hasta: '2026-07-27' }).length, 2);
  assert.equal(aperturasWhatsapp({ desde: '2026-07-28' }).length, 0);
  assert.equal(aperturasWhatsapp({ hasta: '2026-07-26' }).length, 0);
});

// Regresion directa del cambio: la tabla dejo de ser solo inbound, y el boton "Ya me escribio,
// verificar" de /conectores daria por buena la prueba mostrando el mensaje que acabamos de
// mandar nosotros.
test('el chequeo de "ya me escribio" sigue mirando solo entrantes', () => {
  const [caro] = idsContacto('emp-ap-2');
  // `desde` se compara contra created_at (cuando lo guardamos), no contra la fecha del
  // mensaje: por eso va un instante viejo de verdad y no una fecha del fixture.
  const desde = '2020-01-01T00:00:00.000Z';
  guardarMensajeSaliente({ referenciaProveedor: 'linea-check', telefono: '573000000001', texto: 'Yo escribiendo', mensajeId: 'out-7', fecha: '2026-07-27T21:00:00.000Z' }, caro);
  assert.equal(mensajeWhatsappMasRecienteDesde('linea-check', desde), null, 'lo nuestro no cuenta como que nos escribieron');

  guardarMensajeEntrante({ referenciaProveedor: 'linea-check', telefono: '573000000001', texto: 'Ahora si yo', mensajeId: 'in-3', fecha: '2026-07-27T21:05:00.000Z' }, caro);
  assert.equal(mensajeWhatsappMasRecienteDesde('linea-check', desde)?.texto, 'Ahora si yo');
});
