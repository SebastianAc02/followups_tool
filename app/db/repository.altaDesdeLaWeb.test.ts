// El alta de una cuenta desde la web (app/empresas/nueva): lo que la pantalla necesita del
// dominio y que hasta ahora no existia -- ciudad en el alta, y 'test' como categoria
// escribible para que la cuenta sembrada caiga en el segmento de prueba del wizard.
//
// El MCP corre siempre contra isps.db, asi que crearEmpresa/crearContacto tenian un solo
// consumidor y en modo prueba no habia forma de sembrar una empresa desde la interfaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearEmpresa, crearContacto, contactosDeEmpresa } = await import('./repository.ts');

function filaEmpresa(idEmpresa: string) {
  const raw = new Database(dbPath);
  const fila = raw
    .prepare(`SELECT ciudad_principal, categoria, owner, estado_notion, estado_comercial FROM empresa WHERE id_empresa = ?`)
    .get(idEmpresa) as {
    ciudad_principal: string | null;
    categoria: string | null;
    owner: string | null;
    estado_notion: string | null;
    estado_comercial: string;
  };
  raw.close();
  return fila;
}

test('crearEmpresa guarda la ciudad que llego del formulario', () => {
  const r = crearEmpresa(
    { nombreOficial: 'Redes del Valle SAS', categoria: 'isp', estadoNotion: 'lead', owner: 'Camilo Fonseca', ciudad: 'Cali' },
    1,
  );
  assert.equal(r.creada, true);
  if (!r.creada) return;
  assert.equal(filaEmpresa(r.empresa.idEmpresa).ciudad_principal, 'Cali');
});

test('sin ciudad la columna queda en null, no en cadena vacia', () => {
  const r = crearEmpresa({ nombreOficial: 'Sin Ciudad SAS', categoria: 'isp', estadoNotion: 'lead', owner: 'Camilo Fonseca' }, 1);
  assert.equal(r.creada, true);
  if (!r.creada) return;
  assert.equal(filaEmpresa(r.empresa.idEmpresa).ciudad_principal, null);
});

test("ciudad en blanco tampoco escribe cadena vacia (la segmentacion por ciudad la leeria como un valor)", () => {
  const r = crearEmpresa(
    { nombreOficial: 'Blanco SAS', categoria: 'isp', estadoNotion: 'lead', owner: 'Camilo Fonseca', ciudad: '   ' },
    1,
  );
  assert.equal(r.creada, true);
  if (!r.creada) return;
  assert.equal(filaEmpresa(r.empresa.idEmpresa).ciudad_principal, null);
});

test("categoria 'test' es escribible: es el filtro con el que el wizard separa lo sembrado", () => {
  const r = crearEmpresa(
    { nombreOficial: 'Prueba Uno SAS', categoria: 'test', estadoNotion: 'lead', owner: 'Camilo Fonseca', ciudad: 'Bogotá' },
    1,
  );
  assert.equal(r.creada, true);
  if (!r.creada) return;
  const fila = filaEmpresa(r.empresa.idEmpresa);
  assert.equal(fila.categoria, 'test');
  // estado_comercial se sigue derivando de la etapa, no de la categoria.
  assert.equal(fila.estado_comercial, 'lead');
});

test('una categoria inventada sigue reventando en el parseo', () => {
  assert.throws(() =>
    crearEmpresa(
      { nombreOficial: 'Categoria Rara SAS', categoria: 'agencia_viajes' as 'isp', estadoNotion: 'lead', owner: 'Camilo Fonseca' },
      1,
    ),
  );
});

test('el contacto principal del formulario queda colgado de la empresa recien creada', () => {
  const r = crearEmpresa(
    { nombreOficial: 'Con Contacto SAS', categoria: 'test', estadoNotion: 'lead', owner: 'Camilo Fonseca', ciudad: 'Medellín' },
    1,
  );
  assert.equal(r.creada, true);
  if (!r.creada) return;

  const c = crearContacto(
    {
      idEmpresa: r.empresa.idEmpresa,
      nombre: 'Ana Prueba',
      email: 'ana@prueba.test',
      telefono: '3001234567',
      esPrincipal: true,
      fuente: 'web',
    },
    1,
  );
  assert.equal(c.creado, true);
  if (!c.creado) return;

  const contactos = contactosDeEmpresa(r.empresa.idEmpresa);
  assert.equal(contactos.length, 1);
  assert.equal(contactos[0].esPrincipal, true);
  assert.equal(contactos[0].email, 'ana@prueba.test');
  // Sin email no hay destinatario posible (elegirDestinatarioDefault filtra por email) y la
  // inscripcion nace 'bloqueada': el formulario existe justo para que eso no pase.
  assert.equal(contactos[0].fuente, 'web');
});
