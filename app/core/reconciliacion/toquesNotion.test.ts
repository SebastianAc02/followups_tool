import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarCanalToqueNotion,
  parsearTranscriptCeldaNotion,
  planificarImportacionToques,
} from './toquesNotion.ts';

test('normalizarCanalToqueNotion reconoce Llamada y Reunion (con y sin tilde)', () => {
  assert.equal(normalizarCanalToqueNotion('Llamada'), 'llamada');
  assert.equal(normalizarCanalToqueNotion('Reunión'), 'reunion');
  assert.equal(normalizarCanalToqueNotion('reunion'), 'reunion');
  assert.equal(normalizarCanalToqueNotion('WhatsApp'), 'whatsapp');
});

test('normalizarCanalToqueNotion devuelve null para sin-dato y texto no reconocido', () => {
  assert.equal(normalizarCanalToqueNotion('-'), null);
  assert.equal(normalizarCanalToqueNotion('—'), null);
  assert.equal(normalizarCanalToqueNotion(''), null);
  assert.equal(normalizarCanalToqueNotion('Carta certificada'), null);
});

test('parsearTranscriptCeldaNotion: sin dato', () => {
  assert.deepEqual(parsearTranscriptCeldaNotion('-'), { tipo: 'ninguno' });
  assert.deepEqual(parsearTranscriptCeldaNotion('—'), { tipo: 'ninguno' });
  assert.deepEqual(parsearTranscriptCeldaNotion(''), { tipo: 'ninguno' });
});

test('parsearTranscriptCeldaNotion: texto libre sin link (Granola nunca sincronizado)', () => {
  assert.deepEqual(parsearTranscriptCeldaNotion('Resumen en Granola'), {
    tipo: 'texto',
    texto: 'Resumen en Granola',
  });
});

test('parsearTranscriptCeldaNotion: link markdown a subpagina local, decodifica la ruta', () => {
  const celda = '[Reunión 26-jun (tl;dv)](SPACOM/Reuni%C3%B3n%2026-jun%202026%20(tl;dv)%2039295153c5cd811bbf89d42a26e62828.md)';
  assert.deepEqual(parsearTranscriptCeldaNotion(celda), {
    tipo: 'link',
    etiqueta: 'Reunión 26-jun (tl;dv)',
    rutaRelativa: 'SPACOM/Reunión 26-jun 2026 (tl;dv) 39295153c5cd811bbf89d42a26e62828.md',
  });
});

test('planificarImportacionToques: un placeholder + una fila Notion -> actualiza en el mismo registro', () => {
  const existentes = [{ idToque: 174, quePaso: 'hubo llamada', fuente: 'notion_seed' }];
  const filas = [{ fechaRaw: '2026-06-26', canal: 'llamada' as const, quePaso: 'Conectamos con Efraín...', transcriptUrl: null, transcriptTexto: null }];

  const plan = planificarImportacionToques(existentes, filas);

  assert.deepEqual(plan, [{ accion: 'actualizar', idToque: 174, fila: filas[0] }]);
});

test('planificarImportacionToques: un placeholder + dos filas Notion -> actualiza la primera, inserta la segunda', () => {
  const existentes = [{ idToque: 174, quePaso: 'hubo llamada', fuente: 'notion_seed' }];
  const filaLlamada = { fechaRaw: '2026-06-26', canal: 'llamada' as const, quePaso: 'Conectamos con Efraín...', transcriptUrl: null, transcriptTexto: null };
  const filaReunion = { fechaRaw: '2026-06-26', canal: 'reunion' as const, quePaso: 'Se tuvo la reunión...', transcriptUrl: 'https://tldv.io/app/meetings/x', transcriptTexto: null };

  const plan = planificarImportacionToques(existentes, [filaLlamada, filaReunion]);

  assert.deepEqual(plan, [
    { accion: 'actualizar', idToque: 174, fila: filaLlamada },
    { accion: 'insertar', fila: filaReunion },
  ]);
});

test('planificarImportacionToques: sin toques existentes -> inserta todas las filas de Notion', () => {
  const filas = [
    { fechaRaw: 'oct-2025 (aprox)', canal: null, quePaso: 'Primer contacto...', transcriptUrl: null, transcriptTexto: null },
    { fechaRaw: '2-jul 2026', canal: 'llamada' as const, quePaso: 'Llamada previa...', transcriptUrl: null, transcriptTexto: 'Resumen en Granola' },
  ];

  const plan = planificarImportacionToques([], filas);

  assert.deepEqual(plan, [
    { accion: 'insertar', fila: filas[0] },
    { accion: 'insertar', fila: filas[1] },
  ]);
});

test('planificarImportacionToques: no toca toques que ya tienen contenido real (no son el placeholder)', () => {
  const existentes = [{ idToque: 192, quePaso: null, fuente: 'cockpit' }];
  const filas = [{ fechaRaw: '2026-06-26', canal: 'llamada' as const, quePaso: 'Nota real...', transcriptUrl: null, transcriptTexto: null }];

  const plan = planificarImportacionToques(existentes, filas);

  assert.deepEqual(plan, [{ accion: 'insertar', fila: filas[0] }]);
});
