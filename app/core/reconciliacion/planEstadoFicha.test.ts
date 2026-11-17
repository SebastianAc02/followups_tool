import test from 'node:test';
import assert from 'node:assert/strict';
import { planEstadoFicha, type CuentaFicha } from './planEstadoFicha.ts';
import { mapearEstadoFichaNotion, ESTADOS_FICHA_NOTION } from './mapeoEstados.ts';

const P1 = 'aaaa1111aaaa1111aaaa1111aaaa1111';
const P2 = 'bbbb2222bbbb2222bbbb2222bbbb2222';

function cuenta(id: string, pageId: string | null, interno: string | null, ficha: string | null = null): CuentaFicha {
  return { idEmpresa: id, nombre: `E ${id}`, notionPageId: pageId, estadoInterno: interno, estadoFicha: ficha, estadoFichaFecha: null };
}

test('las diez etiquetas de Notion mapean a su propio slug, sin colapsar las dos de firma', () => {
  assert.equal(mapearEstadoFichaNotion('Firma Pendiente'), 'firma_pendiente');
  assert.equal(mapearEstadoFichaNotion('Contrato Firmado'), 'contrato_firmado');
  assert.equal(mapearEstadoFichaNotion('Firma y Pago Realizado'), 'firma_pago');
  assert.equal(mapearEstadoFichaNotion('Cierre/Documentación'), 'cierre_documentacion');
  assert.equal(mapearEstadoFichaNotion('reunion agendada'), 'reunion_agendada');
  for (const slug of ESTADOS_FICHA_NOTION) assert.equal(mapearEstadoFichaNotion(slug), slug);
});

test('una etiqueta que no existe devuelve null, no un estado por defecto', () => {
  assert.equal(mapearEstadoFichaNotion('Perdido'), null);
  assert.equal(mapearEstadoFichaNotion(''), null);
});

test('la diferencia con la etapa interna se reporta y no se corrige', () => {
  const plan = planEstadoFicha([{ pageId: P1, estado: 'contacto_iniciado' }], [cuenta('e1', P1, 'on_hold')]);
  assert.equal(plan.escribir.length, 1);
  assert.deepEqual(
    { de: plan.escribir[0].fichaDe, a: plan.escribir[0].fichaA, tipo: plan.escribir[0].tipo, difiere: plan.escribir[0].difiereDeInterno, interno: plan.escribir[0].estadoInterno },
    { de: null, a: 'contacto_iniciado', tipo: 'cambia', difiere: true, interno: 'on_hold' },
  );
  assert.equal(plan.difierenDeInterno, 1);
});

test('el mismo valor que ya tenia el espejo es confirma: solo refresca la fecha', () => {
  const plan = planEstadoFicha([{ pageId: P1, estado: 'lead' }], [cuenta('e1', P1, 'lead', 'lead')]);
  assert.equal(plan.confirman, 1);
  assert.equal(plan.cambian, 0);
  assert.equal(plan.escribir[0].difiereDeInterno, false);
});

test('pagina sin cuenta y cuenta sin pagina se reportan y no se escriben', () => {
  const plan = planEstadoFicha([{ pageId: P2, estado: 'lead' }], [cuenta('e1', P1, 'lead')]);
  assert.equal(plan.escribir.length, 0);
  assert.equal(plan.paginasSinCuenta.length, 1);
  assert.deepEqual(plan.cuentasSinPagina.map((c) => c.idEmpresa), ['e1']);
});

test('el page id cruza con y sin guiones', () => {
  const conGuiones = 'aaaa1111-aaaa-1111-aaaa-1111aaaa1111';
  const plan = planEstadoFicha([{ pageId: conGuiones, estado: 'oportunidad' }], [cuenta('e1', P1, 'lead')]);
  assert.equal(plan.escribir.length, 1);
  assert.equal(plan.cuentasSinPagina.length, 0);
});

test('dos estados distintos para la misma pagina en el lote: no se escribe ninguno', () => {
  const plan = planEstadoFicha(
    [
      { pageId: P1, estado: 'lead' },
      { pageId: P1, estado: 'oportunidad' },
    ],
    [cuenta('e1', P1, 'lead')],
  );
  assert.equal(plan.escribir.length, 0);
  assert.equal(plan.paginasDuplicadas.length, 1);
});
