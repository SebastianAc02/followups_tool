// app/campanas/[id]/lanzar/actions.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessCanalUsuario } from '../../../core/readiness-canal-usuario.ts';

// La integracion real de gate + requireSession vive en lanzarCampanaAction y se
// verifica manualmente (requiere sesion de better-auth, fuera de alcance de node:test
// unitario). Esta prueba fija el CONTRATO que esa integracion tiene que cumplir: dado
// un set de canales de una cadencia + si el usuario tiene linea de whatsapp, cual es
// el primer canal que bloquea (si alguno).
function primerCanalBloqueado(canales: ('correo' | 'whatsapp' | 'llamada')[], tieneLineaWhatsapp: boolean) {
  for (const canal of canales) {
    const veredicto = readinessCanalUsuario(canal, tieneLineaWhatsapp);
    if (!veredicto.listo) return { canal, veredicto };
  }
  return null;
}

test('cadencia con paso de correo bloquea siempre, sin importar whatsapp', () => {
  const bloqueo = primerCanalBloqueado(['whatsapp', 'correo'], true);
  assert.ok(bloqueo);
  assert.strictEqual(bloqueo!.canal, 'correo');
  assert.strictEqual(bloqueo!.veredicto.listo, false);
});

test('cadencia solo de whatsapp sin linea propia bloquea', () => {
  const bloqueo = primerCanalBloqueado(['whatsapp'], false);
  assert.ok(bloqueo);
  assert.strictEqual(bloqueo!.canal, 'whatsapp');
});

test('cadencia de whatsapp con linea propia activa no bloquea', () => {
  assert.strictEqual(primerCanalBloqueado(['whatsapp'], true), null);
});

test('cadencia solo de llamada nunca bloquea', () => {
  assert.strictEqual(primerCanalBloqueado(['llamada'], false), null);
});
