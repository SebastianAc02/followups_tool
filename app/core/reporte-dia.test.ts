// El reporte del dia, en sus dos niveles (dictado del operador, 2026-08-05).
//
// LO QUE ESTE ARCHIVO PROTEGE, y es la razon de que el reporte tenga dos tipos y no uno con campos
// opcionales: lo que ve un tercero es un OBJETO DISTINTO, construido en el servidor, no el reporte
// completo con campos escondidos. Un reporte completo que viaja al cliente y se oculta en el render
// esta a un "ver codigo fuente" de no estar oculto.
//
// Dictado textual del operador sobre el nivel de equipo: "lo que pueda ver la parte del equipo es
// solamente lo que a mi me interesa que vean: mi actividad real, mis conversiones a reunion, mis
// tasas, mis toques efectivos ejecutados y ya, solo eso".
import test from 'node:test';
import assert from 'node:assert/strict';
import { reporteDelDia, vistaDeEquipo, nivelPara, type ToqueReporte } from './reporte-dia.ts';

const DIA = '2026-08-05';
const OWNER = 'Sebastian Acosta Molina';

function toque(over: Partial<ToqueReporte> = {}): ToqueReporte {
  return {
    idEmpresa: 'e1',
    canal: 'llamada',
    resultado: 'no_contesto',
    fuente: 'cockpit',
    fechaDia: DIA,
    fecha: `${DIA}T12:00:00.000Z`,
    esPrimerToqueDeLaCuenta: false,
    origenLead: null,
    reunionFechaPropuesta: null,
    ...over,
  };
}

const SIN_PLAN = { planeados: 0, ejecutados: 0 };

test('el reporte completo trae la actividad del dia separada de los entrantes', () => {
  const r = reporteDelDia(
    [
      toque(),
      toque({ canal: 'whatsapp', resultado: null }),
      toque({ canal: 'whatsapp', resultado: null, fuente: 'whatsapp_entrante' }),
    ],
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );

  assert.equal(r.actividad.toquesEjecutados, 2, 'el entrante no lo hizo el operador');
  assert.equal(r.actividad.entrantesWhatsapp.mensajes, 1);
});

// El hueco medido: 84 de 116 llamadas sin resultado en un snapshot. Meterlas del lado de "no
// contesto" hundiria el connect rate con un dato que no existe.
test('una llamada sin calificar no cuenta como no contestada y sale del denominador', () => {
  const r = reporteDelDia(
    [
      toque({ resultado: 'contesto_sigue_seguimiento' }),
      toque({ resultado: 'no_contesto' }),
      toque({ resultado: null }),
      toque({ resultado: null }),
    ],
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );

  assert.equal(r.llamadas.total, 4);
  assert.equal(r.llamadas.conectadas, 1);
  assert.equal(r.llamadas.noConectadas, 1);
  assert.equal(r.llamadas.sinCalificar, 2);
  assert.equal(r.llamadas.connectRate, 0.5, 'la tasa corre sobre las 2 calificadas, no sobre las 4');
});

test('el no-show rate sale de las reuniones propuestas, con su N al lado', () => {
  const r = reporteDelDia(
    [
      toque({ canal: 'reunion', resultado: 'reunion_buena', reunionFechaPropuesta: DIA }),
      toque({ canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA }),
      toque({ canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA }),
    ],
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );

  assert.equal(r.reuniones.propuestas, 3);
  assert.equal(r.reuniones.noShow, 2);
  assert.equal(r.reuniones.noShowRate, 2 / 3);
});

// Sin denominador la tasa es null y jamas cero. Cero por ciento de no-show con cero reuniones diria
// que el dia salio perfecto, cuando lo que pasa es que no hubo reuniones.
test('sin reuniones el no-show rate es null, no cero', () => {
  const r = reporteDelDia([toque()], SIN_PLAN, { dia: DIA, owner: OWNER });

  assert.equal(r.reuniones.propuestas, 0);
  assert.equal(r.reuniones.noShowRate, null);
});

test('lo que estaba planeado y no salio queda contado aparte', () => {
  const r = reporteDelDia([toque()], { planeados: 12, ejecutados: 5 }, { dia: DIA, owner: OWNER });

  assert.deepEqual(r.plan, { planeados: 12, ejecutados: 5, noSalieron: 7 });
});

// --- los dos niveles ---------------------------------------------------------------------

test('el dueño de la data ve el nivel completo; cualquier otro ve el de equipo', () => {
  assert.equal(nivelPara({ owner: OWNER, admin: false, verTodoPipeline: false }, OWNER), 'completo');
  assert.equal(nivelPara({ owner: 'Felipe Castro', admin: false, verTodoPipeline: false }, OWNER), 'equipo');
});

// admin y verTodoPipeline NO abren el nivel completo. El comentario de session-user.ts ya fija que
// el operador es admin y aun asi debe ver solo su cartera; y el reporte del dia es observacion sobre
// una persona, no pipeline.
test('ni admin ni el rol de CRO abren el nivel completo de otra persona', () => {
  assert.equal(nivelPara({ owner: 'Camilo Fonseca', admin: true, verTodoPipeline: true }, OWNER), 'equipo');
});

// LA PRUEBA CENTRAL. No basta con que los campos vengan vacios: no pueden ESTAR. Un objeto completo
// que viaja al cliente y se esconde en el render esta a un clic de no estar escondido.
test('el nivel de equipo NO CONTIENE las llaves del nivel completo, no vienen vacias', () => {
  const completo = reporteDelDia(
    [toque({ canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA }), toque()],
    { planeados: 10, ejecutados: 2 },
    { dia: DIA, owner: OWNER },
  );
  const equipo = vistaDeEquipo(completo);

  for (const llave of ['reuniones', 'plan', 'mixPorTipo', 'texto', 'cuentas', 'origen', 'llamadas']) {
    assert.equal(llave in equipo, false, `el nivel de equipo no puede traer ${llave}`);
  }
  // Y el JSON serializado tampoco, que es lo que de verdad viaja al navegador.
  const serializado = JSON.stringify(equipo);
  assert.equal(serializado.includes('noSalieron'), false);
  assert.equal(serializado.includes('sinCalificar'), false);
});

test('el nivel de equipo trae exactamente lo que el operador dijo que puede verse', () => {
  const completo = reporteDelDia(
    [toque({ resultado: 'contesto_reunion', reunionFechaPropuesta: DIA }), toque()],
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );
  const equipo = vistaDeEquipo(completo);

  assert.deepEqual(Object.keys(equipo).sort(), ['actividad', 'conversion', 'dia', 'nivel', 'owner', 'tasas'].sort());
  assert.equal(equipo.nivel, 'equipo');
  assert.equal(equipo.actividad.toquesEjecutados, 2);
  assert.equal(equipo.conversion.reunionesConseguidas, 1);
});

// La vista de equipo DERIVA del completo, no recalcula. Si recalculara, los dos numeros podrian
// discrepar y nadie sabria cual creer.
test('los numeros del nivel de equipo son los mismos del completo, no un recalculo', () => {
  const completo = reporteDelDia([toque({ resultado: 'contesto_reunion', reunionFechaPropuesta: DIA })], SIN_PLAN, { dia: DIA, owner: OWNER });
  const equipo = vistaDeEquipo(completo);

  assert.equal(equipo.conversion.llamadasPorReunion, completo.conversion.llamadasPorReunion);
  assert.equal(equipo.tasas.connectRate, completo.llamadas.connectRate);
});
