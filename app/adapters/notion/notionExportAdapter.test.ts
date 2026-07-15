// Fixture chico en __fixtures__: 3 .md por-pagina (ACUAVALLE con subcarpeta, Jigartel
// sin subcarpeta, SPACOM con seccion "## Toques" + link a una subpagina de reunion) +
// 1 CSV recortado del export real (_all.csv) con BOM y campos con coma entre comillas.
// SIN MD SAS solo esta en el CSV para probar pageId=null.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearNotionExportAdapter } from './notionExportAdapter.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirFixtures = path.join(__dirname, '__fixtures__');

test('lee el export por-pagina + CSV y devuelve una empresa por fila del CSV', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  assert.equal(empresas.length, 4);
});

test('enlaza pageId desde el nombre de archivo .md y detecta la subcarpeta', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  const acuavalle = empresas.find((e) => e.nombre === 'ACUAVALLE');
  assert.ok(acuavalle);
  assert.equal(acuavalle!.pageId, '35a95153c5cd805086b8c69965e0f34a');
  assert.equal(acuavalle!.subcarpeta, path.join(dirFixtures, 'ACUAVALLE'));
  assert.equal(acuavalle!.industria, 'Agua');
  assert.equal(acuavalle!.usuariosEstimados, '240,000');
  assert.equal(acuavalle!.pasarela, 'PSE, PlacetoPay, Wompi');
});

test('empresa sin .md correspondiente queda con pageId null y sin subcarpeta', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  const sinMd = empresas.find((e) => e.nombre === 'SIN MD SAS');
  assert.ok(sinMd);
  assert.equal(sinMd!.pageId, null);
  assert.equal(sinMd!.subcarpeta, null);
  assert.equal(sinMd!.cargo, 'Gerente');
  assert.equal(sinMd!.email, 'ana@sinmd.com');
  assert.equal(sinMd!.fechaProximoPaso, 'April 1, 2026');
});

test('quita el BOM de la primera columna del CSV', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  assert.ok(empresas.every((e) => e.nombre.charCodeAt(0) !== 0xfeff));
  const jigartel = empresas.find((e) => e.nombre === 'Jigartel');
  assert.ok(jigartel);
  assert.equal(jigartel!.contactoPrincipal, 'Nayris');
  assert.equal(jigartel!.crm, 'Propio / Otro');
});

test('correr dos veces devuelve exactamente los mismos datos (idempotente en lectura)', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  assert.deepEqual(adapter.leerEmpresas(), adapter.leerEmpresas());
});

// T11: ACUAVALLE (subcarpeta con Buying Comittee "*_all.csv") trae la lista de fichas
// del comite de compras; el resto de columnas del CSV (Nombre,Cargo,Celular,Correo,
// LinkedIn) se leen tal cual, sin reformatear telefonos.
test('lee el Buying Comittee de la subcarpeta de la empresa', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  const acuavalle = empresas.find((e) => e.nombre === 'ACUAVALLE');
  assert.ok(acuavalle);
  assert.equal(acuavalle!.buyingComittee.length, 2);
  assert.deepEqual(acuavalle!.buyingComittee[0], {
    nombre: 'Fabián Rivera',
    cargo: 'Director Comercial',
    celular: '+57 320 6411482',
    correo: 'fabian.rivera@acuavalle.com.co',
    linkedin: '',
  });
  assert.equal(acuavalle!.buyingComittee[1].nombre, 'Ricardo Arango');
  assert.equal(acuavalle!.buyingComittee[1].linkedin, 'linkedin.com/in/ricardoarango');
});

test('empresa sin subcarpeta trae buyingComittee vacio', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  const jigartel = empresas.find((e) => e.nombre === 'Jigartel');
  assert.ok(jigartel);
  assert.deepEqual(jigartel!.buyingComittee, []);

  const sinMd = empresas.find((e) => e.nombre === 'SIN MD SAS');
  assert.ok(sinMd);
  assert.deepEqual(sinMd!.buyingComittee, []);
});

test('empresa con subcarpeta pero sin CSV de Buying Comittee trae lista vacia', () => {
  const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'notion-export-'));
  try {
    fs.writeFileSync(path.join(dirTemp, 'SOLA 11111111111111111111111111111111.md'), '# placeholder');
    fs.mkdirSync(path.join(dirTemp, 'SOLA'));
    fs.writeFileSync(
      path.join(dirTemp, 'pipeline_all.csv'),
      'Empresa,Industria,Estado,Contacto Principal,Cargo Contacto,Teléfono,Email,Usuarios Estimados,Pasarela Actual,CRM / Software,Owner,Próximo Paso,Fecha Próximo Paso\nSOLA,ISP,Lead,,,,,,,,,,,\n',
    );

    const adapter = crearNotionExportAdapter(dirTemp, path.join(dirTemp, 'pipeline_all.csv'));
    const [sola] = adapter.leerEmpresas();
    assert.equal(sola.subcarpeta, path.join(dirTemp, 'SOLA'));
    assert.deepEqual(sola.buyingComittee, []);
  } finally {
    fs.rmSync(dirTemp, { recursive: true, force: true });
  }
});

// La variante sin "_all" tambien existe en el export real; el adapter cae a ella
// cuando no encuentra la "_all.csv".
test('cae a "Buying Comittee *.csv" (sin _all) cuando no existe la variante _all', () => {
  const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'notion-export-'));
  try {
    fs.writeFileSync(path.join(dirTemp, 'SOLA 22222222222222222222222222222222.md'), '# placeholder');
    const subcarpeta = path.join(dirTemp, 'SOLA');
    fs.mkdirSync(subcarpeta);
    fs.writeFileSync(
      path.join(subcarpeta, 'Buying Comittee 22222222222222222222222222222222.csv'),
      'Nombre,Cargo,Celular,Correo,LinkedIn\nCamilo Ruiz,Gerente General,300 1234567,camilo@sola.com,\n',
    );
    fs.writeFileSync(
      path.join(dirTemp, 'pipeline_all.csv'),
      'Empresa,Industria,Estado,Contacto Principal,Cargo Contacto,Teléfono,Email,Usuarios Estimados,Pasarela Actual,CRM / Software,Owner,Próximo Paso,Fecha Próximo Paso\nSOLA,ISP,Lead,,,,,,,,,,,\n',
    );

    const adapter = crearNotionExportAdapter(dirTemp, path.join(dirTemp, 'pipeline_all.csv'));
    const [sola] = adapter.leerEmpresas();
    assert.equal(sola.buyingComittee.length, 1);
    assert.equal(sola.buyingComittee[0].nombre, 'Camilo Ruiz');
  } finally {
    fs.rmSync(dirTemp, { recursive: true, force: true });
  }
});

// T14: seccion "## Toques" del .md por-pagina, con resolucion del link a la subpagina
// de reunion (SPACOM tiene 2 filas: Llamada sin transcript, Reunion con link a tl;dv).
test('lee la seccion Toques y resuelve el link de reunion a la URL real de tl;dv', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  const spacom = empresas.find((e) => e.nombre === 'SPACOM');
  assert.ok(spacom);
  assert.equal(spacom!.toques.length, 2);

  assert.deepEqual(spacom!.toques[0], {
    fechaRaw: '2026-06-26',
    canal: 'llamada',
    quePaso: 'Conectamos con Efraín. Quedó reunión hoy a las 2 PM.',
    transcriptUrl: null,
    transcriptTexto: 'Granola (pendiente de sync)',
  });
  assert.deepEqual(spacom!.toques[1], {
    fechaRaw: '2026-06-26',
    canal: 'reunion',
    quePaso: 'Se tuvo la reunión. Queda en hold.',
    transcriptUrl: 'https://tldv.io/app/meetings/6a3ecd8ca18bfe001262ff22',
    transcriptTexto: null,
  });
});

// Bug real encontrado corriendo T14 contra el export real: macOS escribe los nombres
// de archivo con tilde en NFD (descompuesto), el CSV los trae en NFC (compuesto) --
// mismo texto, bytes distintos. Sin normalizar, el match fallaba en silencio (pageId
// null, subcarpeta null, toques []) para cualquier empresa con tilde en el nombre.
test('enlaza pageId aunque el nombre de archivo este en NFD y el CSV en NFC', () => {
  const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'notion-export-nfd-'));
  try {
    const nombreNfd = 'FIX COMUNICACIÓN'.normalize('NFD'); // "O" + acento combinante
    const nombreNfc = 'FIX COMUNICACIÓN'.normalize('NFC'); // "Ó" compuesto, un solo codepoint
    assert.notEqual(nombreNfd, nombreNfc, 'la fixture debe usar bytes distintos para el mismo texto');

    fs.writeFileSync(path.join(dirTemp, `${nombreNfd} 33333333333333333333333333333333.md`), '# placeholder');
    fs.writeFileSync(
      path.join(dirTemp, 'pipeline_all.csv'),
      `Empresa,Industria,Estado,Contacto Principal,Cargo Contacto,Teléfono,Email,Usuarios Estimados,Pasarela Actual,CRM / Software,Owner,Próximo Paso,Fecha Próximo Paso\n${nombreNfc},ISP,Lead,,,,,,,,,,,\n`,
    );

    const adapter = crearNotionExportAdapter(dirTemp, path.join(dirTemp, 'pipeline_all.csv'));
    const [fila] = adapter.leerEmpresas();
    assert.equal(fila.pageId, '33333333333333333333333333333333');
  } finally {
    fs.rmSync(dirTemp, { recursive: true, force: true });
  }
});

test('empresa sin seccion Toques trae la lista vacia', () => {
  const adapter = crearNotionExportAdapter(dirFixtures, path.join(dirFixtures, 'pipeline_all.csv'));
  const empresas = adapter.leerEmpresas();

  const acuavalle = empresas.find((e) => e.nombre === 'ACUAVALLE');
  assert.ok(acuavalle);
  assert.deepEqual(acuavalle!.toques, []);
});
