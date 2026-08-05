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
import { reporteDelDia, vistaDeEquipo, nivelPara, type ToqueReporteCanal, type ToquesReporteDia } from './reporte-dia.ts';
import type { ToqueDashboardCRO } from './dashboard-cro.ts';

const DIA = '2026-08-05';
const OWNER = 'Sebastian Acosta Molina';

// Dos proyecciones de la MISMA fila (mismo criterio que el repository: toquesParaActividadCanal
// trae esPrimerToqueDeLaCuenta/origenLead, toquesEnRango trae tipoToque/estado/reunionFechaOcurrida,
// y ninguna de las dos funciones trae las columnas de la otra -- ver comentario largo en
// reporte-dia.ts sobre por que son dos arreglos y no uno).
function toqueCanal(over: Partial<ToqueReporteCanal> = {}): ToqueReporteCanal {
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

function toqueDashboard(over: Partial<ToqueDashboardCRO> = {}): ToqueDashboardCRO {
  return {
    idEmpresa: 'e1',
    canal: 'llamada',
    tipoToque: null,
    resultado: 'no_contesto',
    fuente: 'cockpit',
    fechaDia: DIA,
    fecha: `${DIA}T12:00:00.000Z`,
    estado: 'contacto_iniciado',
    reunionFechaPropuesta: null,
    reunionFechaOcurrida: null,
    ...over,
  };
}

// Fixture de una sola fila representada en las dos proyecciones a la vez -- el caso comun de
// la mayoria de los tests, donde no importa la particion, solo que los conteos salgan bien.
function fila(over: { canal?: Partial<ToqueReporteCanal>; dashboard?: Partial<ToqueDashboardCRO> } = {}): {
  canal: ToqueReporteCanal;
  dashboard: ToqueDashboardCRO;
} {
  return { canal: toqueCanal(over.canal), dashboard: toqueDashboard(over.dashboard) };
}

function toques(filas: ReturnType<typeof fila>[]): ToquesReporteDia {
  return { canal: filas.map((f) => f.canal), dashboard: filas.map((f) => f.dashboard) };
}

const SIN_PLAN = { planeados: 0, ejecutados: 0 };

test('el reporte completo trae la actividad del dia separada de los entrantes', () => {
  const r = reporteDelDia(
    toques([
      fila(),
      fila({ canal: { canal: 'whatsapp', resultado: null }, dashboard: { canal: 'whatsapp', resultado: null } }),
      fila({
        canal: { canal: 'whatsapp', resultado: null, fuente: 'whatsapp_entrante' },
        dashboard: { canal: 'whatsapp', resultado: null, fuente: 'whatsapp_entrante' },
      }),
    ]),
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
    toques([
      fila({ canal: { resultado: 'contesto_sigue_seguimiento' }, dashboard: { resultado: 'contesto_sigue_seguimiento' } }),
      fila({ canal: { resultado: 'no_contesto' }, dashboard: { resultado: 'no_contesto' } }),
      fila({ canal: { resultado: null }, dashboard: { resultado: null } }),
      fila({ canal: { resultado: null }, dashboard: { resultado: null } }),
    ]),
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
    toques([
      fila({
        canal: { canal: 'reunion', resultado: 'reunion_buena', reunionFechaPropuesta: DIA },
        dashboard: { canal: 'reunion', resultado: 'reunion_buena', reunionFechaPropuesta: DIA },
      }),
      fila({
        canal: { canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA },
        dashboard: { canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA },
      }),
      fila({
        canal: { canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA },
        dashboard: { canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA },
      }),
    ]),
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );

  assert.equal(r.reuniones.propuestas, 3);
  assert.equal(r.reuniones.noShow, 2);
  assert.equal(r.reuniones.noShowRate, 2 / 3);
});

// Mismo criterio EXACTO que embudoReuniones en dashboard-cro.ts: una reunion cuenta como
// ocurrida por reunionFechaOcurrida O por un resultado en RESULTADOS_REUNION_OCURRIDA. Una
// version que solo mira el resultado (sin el camino de la fecha) subcuenta las reuniones
// importadas de Notion con fecha de ocurrencia pero sin el resultado detallado.
test('una reunion cuenta como ocurrida por reunionFechaOcurrida aunque no traiga resultado detallado', () => {
  const r = reporteDelDia(
    toques([
      fila({
        canal: { canal: 'reunion', resultado: null, reunionFechaPropuesta: DIA },
        dashboard: { canal: 'reunion', resultado: null, reunionFechaPropuesta: DIA, reunionFechaOcurrida: DIA },
      }),
    ]),
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );

  assert.equal(r.reuniones.ocurridas, 1);
  assert.equal(r.reuniones.sinDesenlace, 0);
});

// Sin denominador la tasa es null y jamas cero. Cero por ciento de no-show con cero reuniones diria
// que el dia salio perfecto, cuando lo que pasa es que no hubo reuniones.
test('sin reuniones el no-show rate es null, no cero', () => {
  const r = reporteDelDia(toques([fila()]), SIN_PLAN, { dia: DIA, owner: OWNER });

  assert.equal(r.reuniones.propuestas, 0);
  assert.equal(r.reuniones.noShowRate, null);
});

test('lo que estaba planeado y no salio queda contado aparte', () => {
  const r = reporteDelDia(toques([fila()]), { planeados: 12, ejecutados: 5 }, { dia: DIA, owner: OWNER });

  assert.deepEqual(r.plan, { planeados: 12, ejecutados: 5, noSalieron: 7 });
});

// El bug que este test existe para atrapar: mixPorTipo corria sobre el arreglo de
// actividad-canal, que NUNCA trae tipoToque (no es una de sus columnas), asi que siempre
// reportaba sinTipo=todos aunque el dato si estuviera cargado. tipoToque vive en la
// proyeccion de toquesEnRango (el arreglo `dashboard`), no en la de toquesParaActividadCanal.
test('el mix por tipo lee tipoToque de la proyeccion que si lo trae', () => {
  const r = reporteDelDia(
    toques([
      fila({ dashboard: { tipoToque: 'seguimiento' } }),
      fila({ dashboard: { tipoToque: 'seguimiento' } }),
      fila({ dashboard: { tipoToque: null } }),
    ]),
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );

  assert.deepEqual(r.mixPorTipo.porTipo, { seguimiento: 2 });
  assert.equal(r.mixPorTipo.conTipo, 2);
  assert.equal(r.mixPorTipo.sinTipo, 1);
});

test('el mix por canal literal (dashboard-cro) viaja aparte del agrupado texto/llamada/reunion', () => {
  const r = reporteDelDia(
    toques([
      fila({ canal: { canal: 'llamada' }, dashboard: { canal: 'llamada' } }),
      fila({ canal: { canal: 'whatsapp' }, dashboard: { canal: 'whatsapp' } }),
      fila({ canal: { canal: 'correo' }, dashboard: { canal: 'correo' } }),
    ]),
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );

  assert.deepEqual(r.mixPorCanal.porCanal, { llamada: 1, whatsapp: 1, correo: 1 });
  assert.equal(r.mixPorCanal.total, 3);
  assert.deepEqual(r.actividad.porGrupoCanal, { texto: 2, llamada: 1, reunion: 0 });
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
    toques([
      fila({
        canal: { canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA },
        dashboard: { canal: 'reunion', resultado: 'no_llego', reunionFechaPropuesta: DIA },
      }),
      fila(),
    ]),
    { planeados: 10, ejecutados: 2 },
    { dia: DIA, owner: OWNER },
  );
  const equipo = vistaDeEquipo(completo);

  for (const llave of ['reuniones', 'plan', 'mixPorTipo', 'mixPorCanal', 'texto', 'cuentas', 'origen', 'llamadas']) {
    assert.equal(llave in equipo, false, `el nivel de equipo no puede traer ${llave}`);
  }
  // Y el JSON serializado tampoco, que es lo que de verdad viaja al navegador.
  const serializado = JSON.stringify(equipo);
  assert.equal(serializado.includes('noSalieron'), false);
  assert.equal(serializado.includes('sinCalificar'), false);
});

test('el nivel de equipo trae exactamente lo que el operador dijo que puede verse', () => {
  const completo = reporteDelDia(
    toques([
      fila({
        canal: { resultado: 'contesto_reunion', reunionFechaPropuesta: DIA },
        dashboard: { resultado: 'contesto_reunion', reunionFechaPropuesta: DIA },
      }),
      fila(),
    ]),
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
  const completo = reporteDelDia(
    toques([
      fila({
        canal: { resultado: 'contesto_reunion', reunionFechaPropuesta: DIA },
        dashboard: { resultado: 'contesto_reunion', reunionFechaPropuesta: DIA },
      }),
    ]),
    SIN_PLAN,
    { dia: DIA, owner: OWNER },
  );
  const equipo = vistaDeEquipo(completo);

  assert.equal(equipo.conversion.llamadasPorReunion, completo.conversion.llamadasPorReunion);
  assert.equal(equipo.tasas.connectRate, completo.llamadas.connectRate);
});
