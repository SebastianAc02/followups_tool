// Confirma que cada plantilla de la biblioteca de secuencias sigue el formato
// EXACTO que espera parsearCadenciaMarkdown. Si el formato del parser cambia y una
// plantilla se desincroniza, este test lo detecta en vez de romper solo en la UI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearCadenciaPorFormato } from '../../core/cadencia-parser.ts';
import { PLANTILLAS_CADENCIA } from './plantillas-cadencia.ts';

test('biblioteca de secuencias: cada plantilla parsea sin error y trae al menos un paso', () => {
  for (const plantilla of PLANTILLAS_CADENCIA) {
    const cad = parsearCadenciaPorFormato('md', plantilla.contenido, { nombre: plantilla.nombre });
    assert.ok(cad.pasos.length > 0, `${plantilla.id} deberia tener al menos un paso`);
    for (const paso of cad.pasos) {
      assert.ok(paso.canal, `${plantilla.id}: paso sin canal`);
      assert.equal(typeof paso.diaOffset, 'number');
    }
  }
});
